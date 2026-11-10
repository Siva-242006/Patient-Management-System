import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDb } from '../src/db.js';

process.env.NODE_ENV = 'test';
process.env.TODAY_OVERRIDE = '2026-11-09';

describe('Patients API Endpoints & Validation', () => {
  let db;
  let app;

  beforeEach(() => {
    db = initDb(':memory:');
    app = createApp({ db, rateLimit: { enabled: false } });
  });

  describe('POST /patients success & normalization', () => {
    it('creates a patient with standard valid input', async () => {
      const res = await request(app)
        .post('/patients')
        .send({
          name: 'Anita Rao',
          phone: '+919876543210',
          consultationDate: '2026-11-01',
          followUpDate: '2026-11-15'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'Patient added');
      assert.equal(res.body.data.id, 1);
      assert.equal(res.body.data.name, 'Anita Rao');
      assert.equal(res.body.data.phone, '+919876543210');
      assert.equal(res.body.data.consultationDate, '2026-11-01');
      assert.equal(res.body.data.followUpDate, '2026-11-15');
      assert.equal(res.body.data.followUpStatus, 'pending');
      assert.equal(res.body.data.completedAt, null);
      assert.ok(res.body.data.createdAt);
    });

    it('normalizes 10-digit phone with spaces "98765 43210" -> "+919876543210"', async () => {
      const res = await request(app)
        .post('/patients')
        .send({
          name: 'Ramesh Kumar',
          phone: '98765 43210',
          consultationDate: '2026-11-01',
          followUpDate: '2026-11-10'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.phone, '+919876543210');
    });

    it('normalizes phone with hyphens and prefix "+91-98765-43210"', async () => {
      const res = await request(app)
        .post('/patients')
        .send({
          name: 'Suresh Patel',
          phone: '+91-98765-43210',
          consultationDate: '2026-11-01',
          followUpDate: '2026-11-10'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.phone, '+919876543210');
    });

    it('normalizes 12-digit phone "919876543210" -> "+919876543210"', async () => {
      const res = await request(app)
        .post('/patients')
        .send({
          name: 'Gita Sen',
          phone: '919876543210',
          consultationDate: '2026-11-01',
          followUpDate: '2026-11-10'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.phone, '+919876543210');
    });

    it('collapses runs of whitespace in name: "  Anita   Rao " -> "Anita Rao"', async () => {
      const res = await request(app)
        .post('/patients')
        .send({
          name: '  Anita   Rao ',
          phone: '+919876543210',
          consultationDate: '2026-11-01',
          followUpDate: '2026-11-10'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.name, 'Anita Rao');
    });

    it('accepts name with accents and apostrophes ("Seán O\'Neil")', async () => {
      const res = await request(app)
        .post('/patients')
        .send({
          name: "Seán O'Neil",
          phone: '+919876543210',
          consultationDate: '2026-11-01',
          followUpDate: '2026-11-10'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.name, "Seán O'Neil");
    });
  });

  describe('POST /patients name failures', () => {
    const validRest = {
      phone: '+919876543210',
      consultationDate: '2026-11-01',
      followUpDate: '2026-11-10'
    };

    it('rejects missing name', async () => {
      const res = await request(app).post('/patients').send({ ...validRest });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some(d => d.field === 'name' && d.issue === 'is required'));
    });

    it('rejects 1 character name', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: 'A' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name' && d.issue === 'must be 2-100 characters'));
    });

    it('rejects 101 characters name', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: 'A'.repeat(101) });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name' && d.issue === 'must be 2-100 characters'));
    });

    it('rejects digits in name "Anita123"', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: 'Anita123' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name'));
    });

    it('rejects script tags "<script>alert(1)</script>"', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: '<script>alert(1)</script>' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name'));
    });

    it('rejects SQL injection name "Robert\'); DROP TABLE patients;--"', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: "Robert'); DROP TABLE patients;--" });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name'));
    });

    it('rejects only whitespace', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: '    ' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name' && d.issue === 'must be 2-100 characters'));
    });

    it('rejects emoji in name', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: 'Anita 😊' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name'));
    });

    it('rejects number type for name', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: 12345 });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name' && d.issue === 'must be a string'));
    });

    it('rejects null for name', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, name: null });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'name' && d.issue === 'must be a string'));
    });
  });

  describe('POST /patients phone failures', () => {
    const validRest = {
      name: 'Anita Rao',
      consultationDate: '2026-11-01',
      followUpDate: '2026-11-10'
    };

    it('rejects missing phone', async () => {
      const res = await request(app).post('/patients').send({ ...validRest });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone' && d.issue === 'is required'));
    });

    it('rejects number type (unquoted phone)', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, phone: 9876543210 });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone' && d.issue === 'must be a string'));
    });

    it('rejects 9 digits phone', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, phone: '987654321' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone'));
    });

    it('rejects 11 digits phone', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, phone: '98765432100' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone'));
    });

    it('rejects phone starting with 5', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, phone: '5876543210' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone'));
    });

    it('rejects letters in phone', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, phone: '+91987654321a' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone'));
    });

    it('rejects non-Indian country code "+1 9876543210"', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, phone: '+1 9876543210' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone'));
    });

    it('rejects 21+ characters in raw phone', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, phone: '98765 43210          ' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone' && d.issue === 'must not exceed 20 characters'));
    });

    it('rejects trailing junk like "98765 43210x"', async () => {
      const res = await request(app).post('/patients').send({ ...validRest, phone: '98765 43210x' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'phone'));
    });
  });

  describe('POST /patients date failures', () => {
    const validRest = {
      name: 'Anita Rao',
      phone: '+919876543210'
    };

    it('rejects non-existent date 2026-02-31', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '2026-02-31',
        followUpDate: '2026-03-05'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'consultationDate'));
    });

    it('rejects impossible month 2026-13-01', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '2026-13-01',
        followUpDate: '2026-11-10'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'consultationDate'));
    });

    it('rejects wrong date format "10-11-2026"', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '10-11-2026',
        followUpDate: '2026-11-15'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'consultationDate'));
    });

    it('rejects unpadded date "2026-1-5"', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '2026-1-5',
        followUpDate: '2026-11-15'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'consultationDate'));
    });

    it('rejects ISO timestamp with time "2026-11-09T10:00:00Z"', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '2026-11-09T10:00:00Z',
        followUpDate: '2026-11-15'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'consultationDate'));
    });

    it('rejects consultation date in the future', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '2026-11-10', // today is 2026-11-09
        followUpDate: '2026-11-15'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'consultationDate' && d.issue === 'cannot be in the future'));
    });

    it('rejects consultation date older than 365 days', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '2025-11-08', // older than 365 days from 2026-11-09
        followUpDate: '2026-11-01'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'consultationDate' && d.issue === 'cannot be older than 365 days'));
    });

    it('rejects followUp date before consultation date', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '2026-11-05',
        followUpDate: '2026-11-04'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'followUpDate' && d.issue === 'must be on or after consultation date'));
    });

    it('rejects followUp date more than 365 days after consultation date', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: '2026-11-01',
        followUpDate: '2027-11-05' // more than 365 days
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'followUpDate' && d.issue === 'cannot be more than 365 days after consultation date'));
    });

    it('rejects non-string type for dates', async () => {
      const res = await request(app).post('/patients').send({
        ...validRest,
        consultationDate: 20261101,
        followUpDate: '2026-11-10'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'consultationDate' && d.issue === 'must be a string'));
    });
  });

  describe('POST /patients structure failures', () => {
    it('rejects unknown/extra field', async () => {
      const res = await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-10',
        role: 'admin'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some(d => d.field === 'role' && d.issue === 'unknown field'));
    });

    it('rejects array body', async () => {
      const res = await request(app).post('/patients').send([
        { name: 'Anita Rao' }
      ]);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('reports all 4 missing fields for empty object', async () => {
      const res = await request(app).post('/patients').send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details.length, 4);
      const fields = res.body.error.details.map(d => d.field);
      assert.ok(fields.includes('name'));
      assert.ok(fields.includes('phone'));
      assert.ok(fields.includes('consultationDate'));
      assert.ok(fields.includes('followUpDate'));
    });

    it('rejects malformed JSON with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/patients')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects wrong Content-Type with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const res = await request(app)
        .post('/patients')
        .set('Content-Type', 'text/plain')
        .send('name=Anita');
      assert.equal(res.status, 415);
      assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    it('rejects payload over 10kb with 413 PAYLOAD_TOO_LARGE', async () => {
      const largePadding = 'a'.repeat(12 * 1024);
      const res = await request(app)
        .post('/patients')
        .set('Content-Type', 'application/json')
        .send(`{"name":"Anita","extra":"${largePadding}"}`);
      assert.equal(res.status, 413);
      assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('POST /patients duplicate detection', () => {
    it('rejects duplicate (same case-insensitive name + phone + followUpDate) with 409', async () => {
      const patient = {
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-15'
      };

      const first = await request(app).post('/patients').send(patient);
      assert.equal(first.status, 201);

      // Attempt duplicate with different casing in name
      const duplicate = await request(app).post('/patients').send({
        ...patient,
        name: 'anita rao'
      });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error.code, 'CONFLICT');
      assert.equal(duplicate.body.error.message, 'A follow-up for this patient on this date already exists');
    });

    it('allows same phone with a different patient name', async () => {
      const patient1 = {
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-15'
      };
      const patient2 = {
        name: 'Kiran Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-15'
      };

      const res1 = await request(app).post('/patients').send(patient1);
      assert.equal(res1.status, 201);

      const res2 = await request(app).post('/patients').send(patient2);
      assert.equal(res2.status, 201);
    });
  });

  describe('GET /patients list & filtering', () => {
    it('returns empty list when no patients exist', async () => {
      const res = await request(app).get('/patients');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 0);
      assert.deepEqual(res.body.data, []);
    });

    it('returns list ordered by follow_up_date ascending then id', async () => {
      await request(app).post('/patients').send({
        name: 'Patient Later',
        phone: '+919876543211',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-20'
      });
      await request(app).post('/patients').send({
        name: 'Patient Sooner',
        phone: '+919876543212',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-10'
      });
      await request(app).post('/patients').send({
        name: 'Patient Same Day',
        phone: '+919876543213',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-10'
      });

      const res = await request(app).get('/patients');
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 3);
      assert.equal(res.body.data[0].name, 'Patient Sooner');
      assert.equal(res.body.data[1].name, 'Patient Same Day');
      assert.equal(res.body.data[2].name, 'Patient Later');
    });

    it('filters by status ?status=pending and ?status=completed', async () => {
      const created = await request(app).post('/patients').send({
        name: 'Patient One',
        phone: '+919876543211',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-10'
      });
      await request(app).post('/patients').send({
        name: 'Patient Two',
        phone: '+919876543212',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-12'
      });

      // Complete patient 1
      await request(app).patch(`/patients/${created.body.data.id}/complete`);

      const resPending = await request(app).get('/patients?status=pending');
      assert.equal(resPending.status, 200);
      assert.equal(resPending.body.count, 1);
      assert.equal(resPending.body.data[0].name, 'Patient Two');

      const resCompleted = await request(app).get('/patients?status=completed');
      assert.equal(resCompleted.status, 200);
      assert.equal(resCompleted.body.count, 1);
      assert.equal(resCompleted.body.data[0].name, 'Patient One');
    });

    it('rejects invalid ?status value with 400', async () => {
      const res = await request(app).get('/patients?status=invalid');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects duplicate ?status parameter with 400 (?status=pending&status=completed)', async () => {
      const res = await request(app).get('/patients?status=pending&status=completed');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects unknown query parameter with 400', async () => {
      const res = await request(app).get('/patients?filter=all');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some(d => d.field === 'filter' && d.issue === 'unknown query parameter'));
    });
  });

  describe('GET /patients/due-today', () => {
    it('returns only pending patients due today and includes date in response', async () => {
      // Patient due today
      await request(app).post('/patients').send({
        name: 'Patient Today',
        phone: '+919876543211',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });

      // Patient overdue (yesterday)
      await request(app).post('/patients').send({
        name: 'Patient Overdue',
        phone: '+919876543212',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-08'
      });

      // Patient future
      await request(app).post('/patients').send({
        name: 'Patient Future',
        phone: '+919876543213',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-10'
      });

      // Due today but completed
      const completed = await request(app).post('/patients').send({
        name: 'Patient Today Completed',
        phone: '+919876543214',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      await request(app).patch(`/patients/${completed.body.data.id}/complete`);

      const res = await request(app).get('/patients/due-today');
      assert.equal(res.status, 200);
      assert.equal(res.body.message, 'Due today patients retrieved');
      assert.equal(res.body.date, '2026-11-09');
      assert.equal(res.body.count, 1);
      assert.equal(res.body.data[0].name, 'Patient Today');
    });

    it('includes overdue pending patients when includeOverdue=true', async () => {
      await request(app).post('/patients').send({
        name: 'Patient Today',
        phone: '+919876543211',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      await request(app).post('/patients').send({
        name: 'Patient Overdue',
        phone: '+919876543212',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-08'
      });

      const res = await request(app).get('/patients/due-today?includeOverdue=true');
      assert.equal(res.status, 200);
      assert.equal(res.body.message, 'Due today along with overdue patients retrieved');
      assert.equal(res.body.count, 2);
      assert.equal(res.body.data[0].name, 'Patient Overdue');
      assert.equal(res.body.data[1].name, 'Patient Today');
    });

    it('rejects invalid includeOverdue value (e.g. ?includeOverdue=yes) with 400', async () => {
      const res = await request(app).get('/patients/due-today?includeOverdue=yes');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects unknown query parameter with 400', async () => {
      const res = await request(app).get('/patients/due-today?status=pending');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('PATCH /patients/:id/complete', () => {
    it('marks pending patient as completed and sets completedAt', async () => {
      const created = await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });

      const res = await request(app).patch(`/patients/${created.body.data.id}/complete`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.followUpStatus, 'completed');
      assert.ok(res.body.data.completedAt);

      // Verify patient left due-today
      const dueToday = await request(app).get('/patients/due-today');
      assert.equal(dueToday.body.count, 0);
    });

    it('ignores request body sent in PATCH complete', async () => {
      const created = await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });

      const res = await request(app)
        .patch(`/patients/${created.body.data.id}/complete`)
        .send({ status: 'ignored', name: 'Hacked' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.name, 'Anita Rao');
      assert.equal(res.body.data.followUpStatus, 'completed');
    });

    it('returns 404 for nonexistent id', async () => {
      const res = await request(app).patch('/patients/9999/complete');
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('returns 409 when completing already-completed patient', async () => {
      const created = await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });

      const first = await request(app).patch(`/patients/${created.body.data.id}/complete`);
      assert.equal(first.status, 200);

      const second = await request(app).patch(`/patients/${created.body.data.id}/complete`);
      assert.equal(second.status, 409);
      assert.equal(second.body.error.code, 'CONFLICT');
      assert.equal(second.body.error.message, 'Follow-up already completed');
    });

    it('cancels pending drafts in the same transaction upon completion', async () => {
      const created = await request(app).post('/patients').send({
        name: 'Anita Rao',
        phone: '+919876543210',
        consultationDate: '2026-11-01',
        followUpDate: '2026-11-09'
      });
      const patientId = created.body.data.id;

      // Insert a pending draft directly
      db.prepare(`
        INSERT INTO drafts (patient_id, follow_up_date, message, source, status)
        VALUES (?, '2026-11-09', ?, 'mock', 'pending_review')
      `).run(patientId, 'A'.repeat(100));

      const res = await request(app).patch(`/patients/${patientId}/complete`);
      assert.equal(res.status, 200);

      const draft = db.prepare('SELECT status FROM drafts WHERE patient_id = ?').get(patientId);
      assert.equal(draft.status, 'cancelled');
    });

    it('returns 400 for invalid ids: "abc", "0", "-1", "1.5", "1e3", "007", "99999999999"', async () => {
      const invalidIds = ['abc', '0', '-1', '1.5', '1e3', '007', '99999999999'];
      for (const id of invalidIds) {
        const res = await request(app).patch(`/patients/${id}/complete`);
        assert.equal(res.status, 400, `Expected 400 for id: ${id}`);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('Database direct constraint tests', () => {
    it('database rejects invalid phone format via CHECK constraint', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO patients (name, phone, consultation_date, follow_up_date)
          VALUES ('Anita', '12345', '2026-11-01', '2026-11-10')
        `).run();
      }, /CHECK constraint failed/);
    });

    it('database rejects invalid date format via CHECK constraint', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO patients (name, phone, consultation_date, follow_up_date)
          VALUES ('Anita', '+919876543210', '01-11-2026', '2026-11-10')
        `).run();
      }, /CHECK constraint failed/);
    });

    it('database rejects follow_up_date before consultation_date', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO patients (name, phone, consultation_date, follow_up_date)
          VALUES ('Anita', '+919876543210', '2026-11-10', '2026-11-05')
        `).run();
      }, /CHECK constraint failed/);
    });

    it('database rejects completed status without completed_at', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO patients (name, phone, consultation_date, follow_up_date, follow_up_status, completed_at)
          VALUES ('Anita', '+919876543210', '2026-11-01', '2026-11-05', 'completed', NULL)
        `).run();
      }, /CHECK constraint failed/);
    });

    it('database rejects pending status with completed_at populated', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO patients (name, phone, consultation_date, follow_up_date, follow_up_status, completed_at)
          VALUES ('Anita', '+919876543210', '2026-11-01', '2026-11-05', 'pending', '2026-11-09T10:00:00Z')
        `).run();
      }, /CHECK constraint failed/);
    });
  });
});
