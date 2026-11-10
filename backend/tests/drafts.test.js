import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDb } from '../src/db.js';
import { MESSAGE_MIN, MESSAGE_MAX } from '../src/utils/constants.js';

process.env.NODE_ENV = 'test';
process.env.TODAY_OVERRIDE = '2026-11-09';
process.env.AI_MODE = 'mock';

describe('Drafts API Endpoints & Workflows', () => {
  let db;
  let app;

  beforeEach(() => {
    db = initDb(':memory:');
    app = createApp({ db, rateLimit: { enabled: false }, aiMode: 'mock' });
  });

  describe('POST /drafts/generate', () => {
    it('returns "No patients due" when no patients exist', async () => {
      const res = await request(app).post('/drafts/generate').send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'No patients due');
      assert.deepEqual(res.body.data.created, []);
      assert.deepEqual(res.body.data.skipped, []);
      assert.equal(res.body.data.remaining, 0);
    });

    it('creates drafts only for due pending patients and excludes completed and future patients', async () => {
      // 1. Due today, pending (should be generated)
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });

      // 2. Future patient, pending (should NOT be generated)
      await request(app).post('/patients').send({
        name: 'Future Patient',
        phone: '+919876543211',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-15'
      });

      // 3. Due today, completed (should NOT be generated)
      const completed = await request(app).post('/patients').send({
        name: 'Completed Patient',
        phone: '+919876543212',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      await request(app).patch(`/patients/${completed.body.data.id}/complete`);

      const res = await request(app).post('/drafts/generate').send({});
      assert.equal(res.status, 201);
      assert.equal(res.body.data.created.length, 1);
      assert.equal(res.body.data.created[0].patientName, 'Anita Rao');
      assert.equal(res.body.data.created[0].status, 'pending_review');
      assert.equal(res.body.data.created[0].source, 'mock');
      assert.equal(res.body.data.created[0].reviewedAt, null);
      assert.equal(res.body.data.remaining, 0);
      assert.equal(res.body.message, '1 draft created (1 mock)');
    });

    it('skips overdue patients unless includeOverdue=true is provided', async () => {
      // Overdue patient (yesterday)
      await request(app).post('/patients').send({
        name: 'Overdue Patient',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-08'
      });

      // Generation without includeOverdue
      const resWithout = await request(app).post('/drafts/generate').send({ includeOverdue: false });
      assert.equal(resWithout.status, 200);
      assert.equal(resWithout.body.message, 'No patients due');

      // Generation with includeOverdue: true
      const resWith = await request(app).post('/drafts/generate').send({ includeOverdue: true });
      assert.equal(resWith.status, 201);
      assert.equal(resWith.body.data.created.length, 1);
      assert.equal(resWith.body.data.created[0].patientName, 'Overdue Patient');
    });

    it('is idempotent: second call creates nothing and reports "All due patients already have drafts"', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });

      const firstCall = await request(app).post('/drafts/generate').send({});
      assert.equal(firstCall.status, 201);
      assert.equal(firstCall.body.data.created.length, 1);

      const secondCall = await request(app).post('/drafts/generate').send({});
      assert.equal(secondCall.status, 200);
      assert.equal(secondCall.body.message, 'All due patients already have drafts');
      assert.equal(secondCall.body.data.created.length, 0);
    });

    it('applies GENERATE_MAX_PER_CALL cap and reports data.remaining accurately', async () => {
      process.env.GENERATE_MAX_PER_CALL = '2';

      try {
        const names = ['Patient Alpha', 'Patient Beta', 'Patient Gamma'];
        for (let i = 0; i < 3; i++) {
          const p = await request(app).post('/patients').send({
            name: names[i],
            phone: `+91987654321${i + 1}`,
            consultationDate: '2026-11-01',
            followUpDate: '2026-11-09'
          });
          assert.equal(p.status, 201);
        }

        const res = await request(app).post('/drafts/generate').send({});
        assert.equal(res.status, 201);
        assert.equal(res.body.data.created.length, 2);
        assert.equal(res.body.data.remaining, 1);
        assert.equal(res.body.message, '2 drafts created (2 mock)');
      } finally {
        process.env.GENERATE_MAX_PER_CALL = '20';
      }
    });

    it('rejects invalid generate bodies (string includeOverdue, unknown fields, array body)', async () => {
      // String instead of boolean
      const resString = await request(app).post('/drafts/generate').send({ includeOverdue: 'true' });
      assert.equal(resString.status, 400);
      assert.equal(resString.body.error.code, 'VALIDATION_ERROR');

      // Unknown field
      const resUnknown = await request(app).post('/drafts/generate').send({ extra: true });
      assert.equal(resUnknown.status, 400);
      assert.equal(resUnknown.body.error.code, 'VALIDATION_ERROR');

      // Array body
      const resArray = await request(app).post('/drafts/generate').send([{ includeOverdue: true }]);
      assert.equal(resArray.status, 400);
      assert.equal(resArray.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('GET /drafts', () => {
    it('returns empty list and count 0 when no drafts exist', async () => {
      const res = await request(app).get('/drafts');
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 0);
      assert.deepEqual(res.body.data, []);
    });

    it('orders pending_review first, then created_at desc, and excludes phone numbers', async () => {
      await request(app).post('/patients').send({
        name: 'Patient A',
        phone: '+919876543211',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      await request(app).post('/patients').send({
        name: 'Patient B',
        phone: '+919876543212',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });

      const gen = await request(app).post('/drafts/generate').send({});
      assert.equal(gen.status, 201);

      // Approve draft 1 so it is no longer pending
      await request(app).patch(`/drafts/${gen.body.data.created[0].id}/approve`);

      const res = await request(app).get('/drafts');
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 2);

      // Pending draft should be first
      assert.equal(res.body.data[0].status, 'pending_review');
      assert.equal(res.body.data[1].status, 'approved');

      // Verify no phone field in any draft object
      for (const draft of res.body.data) {
        assert.equal(draft.phone, undefined);
      }
    });

    it('filters by ?status=approved, ?status=pending_review, etc.', async () => {
      await request(app).post('/patients').send({
        name: 'Patient A',
        phone: '+919876543211',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });

      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;
      await request(app).patch(`/drafts/${draftId}/approve`);

      const resApproved = await request(app).get('/drafts?status=approved');
      assert.equal(resApproved.status, 200);
      assert.equal(resApproved.body.count, 1);
      assert.equal(resApproved.body.data[0].status, 'approved');

      const resPending = await request(app).get('/drafts?status=pending_review');
      assert.equal(resPending.status, 200);
      assert.equal(resPending.body.count, 0);
    });

    it('rejects invalid status, duplicate status, and unknown query parameter with 400', async () => {
      const resInvalid = await request(app).get('/drafts?status=invalid_status');
      assert.equal(resInvalid.status, 400);

      const resDup = await request(app).get('/drafts?status=approved&status=rejected');
      assert.equal(resDup.status, 400);

      const resUnknown = await request(app).get('/drafts?unknown=true');
      assert.equal(resUnknown.status, 400);
    });
  });

  describe('PATCH /drafts/:id/approve', () => {
    it('approves draft without edited message and sets reviewedAt', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const res = await request(app).patch(`/drafts/${draftId}/approve`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'Approved, ready to send (simulated). No message was sent.');
      assert.equal(res.body.data.status, 'approved');
      assert.ok(res.body.data.reviewedAt);
    });

    it('approves draft with edited message and stores the updated message', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const validEdit = 'Hello Anita, this is an edited custom reminder message from your clinic regarding your follow-up visit soon. Please reply.';
      assert.ok(validEdit.length >= MESSAGE_MIN && validEdit.length <= MESSAGE_MAX);

      const res = await request(app)
        .patch(`/drafts/${draftId}/approve`)
        .send({ message: validEdit });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'approved');
      assert.equal(res.body.data.message, validEdit);
    });

    it('rejects 99 characters message with 400', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const shortMsg = 'A'.repeat(MESSAGE_MIN - 1);
      const res = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: shortMsg });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'message' && d.issue === `must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters`));
    });

    it('accepts exactly MESSAGE_MIN (100) characters message with 200', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const exactMinMsg = 'A'.repeat(MESSAGE_MIN);
      const res = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: exactMinMsg });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'approved');
      assert.equal(res.body.data.message, exactMinMsg);
    });

    it('accepts exactly MESSAGE_MAX (500) characters message with 200', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const exactMaxMsg = 'A'.repeat(MESSAGE_MAX);
      const res = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: exactMaxMsg });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'approved');
      assert.equal(res.body.data.message, exactMaxMsg);
    });

    it('rejects 501 characters message with 400', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const longMsg = 'A'.repeat(MESSAGE_MAX + 1);
      const res = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: longMsg });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'message' && d.issue === `must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters`));
    });

    it('rejects whitespace-padded short message (e.g. 90 spaces + "ok") with 400', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const paddedShort = ' '.repeat(90) + 'ok';
      const res = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: paddedShort });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'message' && d.issue === `must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters`));
    });

    it('rejects 100 characters with no letters with 400', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const noLetters = '1'.repeat(MESSAGE_MIN);
      const res = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: noLetters });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'message' && d.issue === 'must contain letters'));
    });

    it('reports both "must be 100-500 characters" and "must contain letters" if both fail', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const shortNoLetters = '12345';
      const res = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: shortNoLetters });
      assert.equal(res.status, 400);
      const issues = res.body.error.details.filter(d => d.field === 'message').map(d => d.issue);
      assert.ok(issues.includes(`must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters`));
      assert.ok(issues.includes('must contain letters'));
    });

    it('rejects empty, non-string, or unknown fields on approve', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      // Empty whitespace
      const resEmpty = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: '   ' });
      assert.equal(resEmpty.status, 400);

      // Non-string
      const resNum = await request(app).patch(`/drafts/${draftId}/approve`).send({ message: 12345 });
      assert.equal(resNum.status, 400);

      // Unknown field
      const resUnknown = await request(app).patch(`/drafts/${draftId}/approve`).send({ extraField: 'val' });
      assert.equal(resUnknown.status, 400);
    });

    it('returns 404 for unknown draft id', async () => {
      const res = await request(app).patch('/drafts/99999/approve');
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('returns 400 for bad ids ("abc", "0", "-1", "1.5", "007")', async () => {
      for (const id of ['abc', '0', '-1', '1.5', '007']) {
        const res = await request(app).patch(`/drafts/${id}/approve`);
        assert.equal(res.status, 400);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      }
    });

    it('returns 409 when approving a draft that is already approved or rejected', async () => {
      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      // First approve: OK
      const first = await request(app).patch(`/drafts/${draftId}/approve`);
      assert.equal(first.status, 200);

      // Second approve: 409
      const second = await request(app).patch(`/drafts/${draftId}/approve`);
      assert.equal(second.status, 409);
      assert.equal(second.body.error.code, 'CONFLICT');
      assert.equal(second.body.error.message, 'Draft is not pending review');
    });
  });

  describe('PATCH /drafts/:id/reject', () => {
    it('rejects draft and leaves patient follow_up_status unchanged', async () => {
      const patient = await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const patientId = patient.body.data.id;

      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      const res = await request(app).patch(`/drafts/${draftId}/reject`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'rejected');
      assert.ok(res.body.data.reviewedAt);
      assert.equal(res.body.message, 'Draft rejected. No message was sent.');

      // Verify patient status is still pending
      const pRes = await request(app).get('/patients');
      assert.equal(pRes.body.data[0].id, patientId);
      assert.equal(pRes.body.data[0].followUpStatus, 'pending');
    });

    it('returns 404 for unknown id and 409 when already approved or rejected', async () => {
      const res404 = await request(app).patch('/drafts/99999/reject');
      assert.equal(res404.status, 404);

      await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      await request(app).patch(`/drafts/${draftId}/approve`);

      const res409 = await request(app).patch(`/drafts/${draftId}/reject`);
      assert.equal(res409.status, 409);
      assert.equal(res409.body.error.message, 'Draft is not pending review');
    });
  });

  describe('Cross-Feature: Patient completion cancels pending drafts', () => {
    it('cancels pending drafts in the same transaction when patient is completed', async () => {
      const p = await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const patientId = p.body.data.id;

      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      // Complete patient
      const compRes = await request(app).patch(`/patients/${patientId}/complete`);
      assert.equal(compRes.status, 200);
      assert.equal(compRes.body.data.followUpStatus, 'completed');

      // Draft should now be cancelled
      const draftsRes = await request(app).get('/drafts?status=cancelled');
      assert.equal(draftsRes.status, 200);
      assert.equal(draftsRes.body.count, 1);
      assert.equal(draftsRes.body.data[0].id, draftId);
      assert.equal(draftsRes.body.data[0].status, 'cancelled');

      // A cancelled draft cannot be approved
      const approveRes = await request(app).patch(`/drafts/${draftId}/approve`);
      assert.equal(approveRes.status, 409);
      assert.equal(approveRes.body.error.message, 'Draft is not pending review');
    });

    it('leaves approved and rejected drafts intact when patient is completed', async () => {
      const p1 = await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const gen = await request(app).post('/drafts/generate').send({});
      const draftId = gen.body.data.created[0].id;

      // Approve draft
      await request(app).patch(`/drafts/${draftId}/approve`);

      // Complete patient
      await request(app).patch(`/patients/${p1.body.data.id}/complete`);

      // Approved draft stays approved
      const draftsRes = await request(app).get('/drafts?status=approved');
      assert.equal(draftsRes.status, 200);
      assert.equal(draftsRes.body.count, 1);
      assert.equal(draftsRes.body.data[0].status, 'approved');
    });
  });

  describe('Database direct constraint tests on drafts table', () => {
    it('database rejects draft with bad status', () => {
      const patient = db.prepare(`
        INSERT INTO patients (name, phone, consultation_date, follow_up_date)
        VALUES ('Anita', '+919876543210', '2026-11-01', '2026-11-09')
      `).run();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO drafts (patient_id, follow_up_date, message, source, status)
          VALUES (?, '2026-11-09', ?, 'mock', 'invalid_status')
        `).run(patient.lastInsertRowid, 'A'.repeat(MESSAGE_MIN));
      }, /CHECK constraint failed/);
    });

    it('database rejects draft with bad source', () => {
      const patient = db.prepare(`
        INSERT INTO patients (name, phone, consultation_date, follow_up_date)
        VALUES ('Anita', '+919876543210', '2026-11-01', '2026-11-09')
      `).run();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO drafts (patient_id, follow_up_date, message, source, status)
          VALUES (?, '2026-11-09', ?, 'human', 'pending_review')
        `).run(patient.lastInsertRowid, 'A'.repeat(MESSAGE_MIN));
      }, /CHECK constraint failed/);
    });

    it('database rejects message shorter than MESSAGE_MIN (99 chars) or longer than MESSAGE_MAX (501 chars)', () => {
      const patient = db.prepare(`
        INSERT INTO patients (name, phone, consultation_date, follow_up_date)
        VALUES ('Anita', '+919876543210', '2026-11-01', '2026-11-09')
      `).run();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO drafts (patient_id, follow_up_date, message, source, status)
          VALUES (?, '2026-11-09', ?, 'mock', 'pending_review')
        `).run(patient.lastInsertRowid, 'A'.repeat(MESSAGE_MIN - 1));
      }, /CHECK constraint failed/);

      assert.throws(() => {
        db.prepare(`
          INSERT INTO drafts (patient_id, follow_up_date, message, source, status)
          VALUES (?, '2026-11-09', ?, 'mock', 'pending_review')
        `).run(patient.lastInsertRowid, 'A'.repeat(MESSAGE_MAX + 1));
      }, /CHECK constraint failed/);
    });

    it('database rejects approved status without reviewed_at', () => {
      const patient = db.prepare(`
        INSERT INTO patients (name, phone, consultation_date, follow_up_date)
        VALUES ('Anita', '+919876543210', '2026-11-01', '2026-11-09')
      `).run();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO drafts (patient_id, follow_up_date, message, source, status, reviewed_at)
          VALUES (?, '2026-11-09', ?, 'mock', 'approved', NULL)
        `).run(patient.lastInsertRowid, 'A'.repeat(MESSAGE_MIN));
      }, /CHECK constraint failed/);
    });

    it('database rejects missing patient foreign key', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO drafts (patient_id, follow_up_date, message, source, status)
          VALUES (99999, '2026-11-09', ?, 'mock', 'pending_review')
        `).run('A'.repeat(MESSAGE_MIN));
      }, /FOREIGN KEY constraint failed/);
    });
  });
});
