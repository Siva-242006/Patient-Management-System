import { getDb } from '../db.js';
import { getToday } from '../utils/dates.js';

export function formatPatient(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    consultationDate: row.consultation_date,
    followUpDate: row.follow_up_date,
    followUpStatus: row.follow_up_status,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

export function createPatient(data, db = getDb()) {
  try {
    const stmt = db.prepare(`
      INSERT INTO patients (name, phone, consultation_date, follow_up_date)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(data.name, data.phone, data.consultationDate, data.followUpDate);
    const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(info.lastInsertRowid);
    return formatPatient(row);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const conflictErr = new Error('A follow-up for this patient on this date already exists');
      conflictErr.code = 'CONFLICT';
      throw conflictErr;
    }
    throw err;
  }
}

export function getPatients({ status } = {}, db = getDb()) {
  let query = 'SELECT * FROM patients';
  const params = [];

  if (status) {
    query += ' WHERE follow_up_status = ?';
    params.push(status);
  }

  query += ' ORDER BY follow_up_date ASC, id ASC';

  const rows = db.prepare(query).all(...params);
  return rows.map(formatPatient);
}

export function getDueTodayPatients({ includeOverdue = false } = {}, db = getDb()) {
  const today = getToday();
  let query = "SELECT * FROM patients WHERE follow_up_status = 'pending'";
  const params = [];

  if (includeOverdue) {
    query += ' AND follow_up_date <= ?';
    params.push(today);
  } else {
    query += ' AND follow_up_date = ?';
    params.push(today);
  }

  query += ' ORDER BY follow_up_date ASC, id ASC';

  const rows = db.prepare(query).all(...params);
  return {
    date: today,
    patients: rows.map(formatPatient)
  };
}

export function completeFollowUp(id, db = getDb()) {
  const completedAt = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE patients
    SET follow_up_status = 'completed', completed_at = ?
    WHERE id = ? AND follow_up_status = 'pending'
  `);
  const info = stmt.run(completedAt, id);

  if (info.changes === 0) {
    const existing = db.prepare('SELECT id, follow_up_status FROM patients WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error('Patient not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (existing.follow_up_status === 'completed') {
      const err = new Error('Follow-up already completed');
      err.code = 'CONFLICT';
      throw err;
    }
  }

  const updated = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  return formatPatient(updated);
}

export function clearPatients(db = getDb()) {
  db.prepare('DELETE FROM patients').run();
}
