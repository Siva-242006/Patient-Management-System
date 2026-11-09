import 'dotenv/config';
import { getToday, addDays } from '../src/utils/dates.js';
import { validateCreatePatient } from '../src/utils/validate.js';
import { createPatient, completeFollowUp, clearPatients } from '../src/services/patientService.js';
import { getDb, closeDb } from '../src/db.js';

export function runSeed(customDb) {
  const db = customDb || getDb();
  console.log('Clearing existing patients table...');
  clearPatients(db);

  const today = getToday();
  console.log(`Current base date (today): ${today}`);

  const fictionalPatients = [
    {
      name: 'Aarav Sharma',
      phone: '+919000000001',
      consultationDate: addDays(today, -5),
      followUpDate: today // Due today (1)
    },
    {
      name: 'Diya Patel',
      phone: '+919000000002',
      consultationDate: addDays(today, -3),
      followUpDate: today // Due today (2)
    },
    {
      name: 'Rohan Verma',
      phone: '+919000000003',
      consultationDate: addDays(today, -7),
      followUpDate: addDays(today, -1) // Overdue (yesterday)
    },
    {
      name: 'Ananya Iyer',
      phone: '+919000000004',
      consultationDate: today,
      followUpDate: addDays(today, 3) // Due in future (1)
    },
    {
      name: 'Vikram Malhotra',
      phone: '+919000000005',
      consultationDate: today,
      followUpDate: addDays(today, 7) // Due in future (2)
    },
    {
      name: 'Meera Nair',
      phone: '+919000000006',
      consultationDate: addDays(today, -10),
      followUpDate: addDays(today, -2), // Completed
      markCompleted: true
    }
  ];

  const seeded = [];
  for (const item of fictionalPatients) {
    const { markCompleted, ...inputData } = item;
    const validation = validateCreatePatient(inputData);
    if (!validation.valid) {
      throw new Error(`Seed data validation failed for ${inputData.name}: ${JSON.stringify(validation.errors)}`);
    }

    let patient = createPatient(validation.data, db);
    if (markCompleted) {
      patient = completeFollowUp(patient.id, db);
    }
    seeded.push(patient);
    console.log(`Seeded patient ID ${patient.id}: ${patient.name} (${patient.followUpStatus}, follow-up: ${patient.followUpDate})`);
  }

  console.log(`Successfully seeded ${seeded.length} fictional patients.`);
  return seeded;
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  try {
    runSeed();
    closeDb();
  } catch (err) {
    console.error('Seed script failed:', err);
    process.exit(1);
  }
}
