import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function initDb(dbPath = process.env.DB_PATH || './data/app.db') {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE CHECK(length(name) BETWEEN 2 AND 100),
      phone TEXT NOT NULL CHECK(phone GLOB '+91[6-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
      consultation_date TEXT NOT NULL CHECK(consultation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      follow_up_date TEXT NOT NULL CHECK(follow_up_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      follow_up_status TEXT NOT NULL DEFAULT 'pending' CHECK(follow_up_status IN ('pending','completed')),
      completed_at TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK(follow_up_date >= consultation_date),
      CHECK((follow_up_status = 'completed') = (completed_at IS NOT NULL)),
      UNIQUE(name, phone, follow_up_date)
    );
  `);

  return db;
}

let defaultDb = null;

export function getDb(customPath) {
  if (customPath) {
    return initDb(customPath);
  }
  if (!defaultDb) {
    defaultDb = initDb();
  }
  return defaultDb;
}

export function setDb(db) {
  defaultDb = db;
}

export function closeDb() {
  if (defaultDb) {
    defaultDb.close();
    defaultDb = null;
  }
}
