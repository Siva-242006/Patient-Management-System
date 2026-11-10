import { getDb } from '../db.js';
import { getDueTodayPatients } from './patientService.js';
import { generateDraft, getFirstName } from './aiService.js';

export function formatDraft(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name || row.name,
    followUpDate: row.follow_up_date,
    message: row.message,
    source: row.source,
    status: row.status,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at
  };
}

export function getDrafts({ status } = {}, db = getDb()) {
  let query = `
    SELECT d.*, p.name AS patient_name
    FROM drafts d
    JOIN patients p ON d.patient_id = p.id
  `;
  const params = [];

  if (status) {
    query += ' WHERE d.status = ?';
    params.push(status);
  }

  query += " ORDER BY (d.status = 'pending_review') DESC, d.created_at DESC, d.id DESC";

  const rows = db.prepare(query).all(...params);
  return rows.map(formatDraft);
}

export async function generateDrafts(
  { includeOverdue = false } = {},
  { db = getDb(), aiOptions = {} } = {}
) {
  const dueResult = getDueTodayPatients({ includeOverdue }, db);

  if (dueResult.patients.length === 0) {
    return {
      status: 200,
      data: {
        created: [],
        skipped: [],
        remaining: 0
      },
      message: 'No patients due'
    };
  }

  // Find existing drafts for the relevant patients and dates
  const existingDraftRows = db
    .prepare('SELECT patient_id, follow_up_date FROM drafts')
    .all();
  const existingSet = new Set(
    existingDraftRows.map(r => `${r.patient_id}:${r.follow_up_date}`)
  );

  // Exclude patients who already have a draft for their followUpDate
  const eligible = dueResult.patients.filter(
    p => !existingSet.has(`${p.id}:${p.followUpDate}`)
  );

  if (eligible.length === 0) {
    return {
      status: 200,
      data: {
        created: [],
        skipped: [],
        remaining: 0
      },
      message: 'All due patients already have drafts'
    };
  }

  const totalEligible = eligible.length;
  const cap = parseInt(process.env.GENERATE_MAX_PER_CALL || '20', 10);
  const batch = eligible.slice(0, cap);
  const remaining = Math.max(0, totalEligible - batch.length);

  const created = [];
  const skipped = [];
  let mockCount = 0;
  let aiCount = 0;

  for (const patient of batch) {
    const firstName = getFirstName(patient.name);
    const draftContent = await generateDraft(
      { firstName, followUpDate: patient.followUpDate },
      aiOptions
    );

    try {
      const stmt = db.prepare(`
        INSERT INTO drafts (patient_id, follow_up_date, message, source, status)
        VALUES (?, ?, ?, ?, 'pending_review')
      `);
      const info = stmt.run(
        patient.id,
        patient.followUpDate,
        draftContent.message,
        draftContent.source
      );

      const row = db.prepare(`
        SELECT d.*, p.name AS patient_name
        FROM drafts d
        JOIN patients p ON d.patient_id = p.id
        WHERE d.id = ?
      `).get(info.lastInsertRowid);

      created.push(formatDraft(row));
      if (draftContent.source === 'ai') {
        aiCount++;
      } else {
        mockCount++;
      }
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        skipped.push({
          patientId: patient.id,
          reason: 'draft already exists'
        });
      } else {
        throw err;
      }
    }
  }

  let message;
  const count = created.length;
  const draftNoun = count === 1 ? 'draft' : 'drafts';

  if (count === 0) {
    message = 'All due patients already have drafts';
  } else if (aiCount > 0 && mockCount > 0) {
    message = `${count} ${draftNoun} created (${aiCount} ai, ${mockCount} mock)`;
  } else if (aiCount > 0) {
    message = `${count} ${draftNoun} created (${aiCount} ai)`;
  } else {
    message = `${count} ${draftNoun} created (${mockCount} mock)`;
  }

  return {
    status: 201,
    data: {
      created,
      skipped,
      remaining
    },
    message
  };
}

export function approveDraft(id, editedMessage = null, db = getDb()) {
  const reviewedAt = new Date().toISOString();
  let stmt;
  let info;

  if (editedMessage !== null) {
    stmt = db.prepare(`
      UPDATE drafts
      SET status = 'approved', reviewed_at = ?, message = ?
      WHERE id = ? AND status = 'pending_review'
    `);
    info = stmt.run(reviewedAt, editedMessage, id);
  } else {
    stmt = db.prepare(`
      UPDATE drafts
      SET status = 'approved', reviewed_at = ?
      WHERE id = ? AND status = 'pending_review'
    `);
    info = stmt.run(reviewedAt, id);
  }

  if (info.changes === 0) {
    const existing = db.prepare('SELECT id, status FROM drafts WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error('Draft not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (existing.status !== 'pending_review') {
      const err = new Error('Draft is not pending review');
      err.code = 'CONFLICT';
      throw err;
    }
  }

  const updated = db.prepare(`
    SELECT d.*, p.name AS patient_name
    FROM drafts d
    JOIN patients p ON d.patient_id = p.id
    WHERE d.id = ?
  `).get(id);

  return formatDraft(updated);
}

export function rejectDraft(id, db = getDb()) {
  const reviewedAt = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE drafts
    SET status = 'rejected', reviewed_at = ?
    WHERE id = ? AND status = 'pending_review'
  `);
  const info = stmt.run(reviewedAt, id);

  if (info.changes === 0) {
    const existing = db.prepare('SELECT id, status FROM drafts WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error('Draft not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (existing.status !== 'pending_review') {
      const err = new Error('Draft is not pending review');
      err.code = 'CONFLICT';
      throw err;
    }
  }

  const updated = db.prepare(`
    SELECT d.*, p.name AS patient_name
    FROM drafts d
    JOIN patients p ON d.patient_id = p.id
    WHERE d.id = ?
  `).get(id);

  return formatDraft(updated);
}

export function clearDrafts(db = getDb()) {
  db.prepare('DELETE FROM drafts').run();
}
