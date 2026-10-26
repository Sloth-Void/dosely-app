import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 7;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // Per-connection setting; must run every launch, not stored in the db file.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentDbVersion = result?.user_version ?? 0;
  if (currentDbVersion >= DATABASE_VERSION) return;

  if (currentDbVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';

      CREATE TABLE medications (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        strength TEXT,
        form TEXT,
        notes TEXT,
        is_prn INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE schedules (
        id INTEGER PRIMARY KEY NOT NULL,
        medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
        times TEXT NOT NULL,
        days_of_week TEXT,
        food_preference TEXT NOT NULL DEFAULT 'none'
      );

      CREATE TABLE doses (
        id INTEGER PRIMARY KEY NOT NULL,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        due_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      );

      CREATE TABLE logs (
        id INTEGER PRIMARY KEY NOT NULL,
        dose_id INTEGER NOT NULL REFERENCES doses(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        note TEXT
      );

      CREATE INDEX idx_schedules_medication ON schedules(medication_id);
      CREATE INDEX idx_doses_schedule ON doses(schedule_id);
      CREATE INDEX idx_doses_due_at ON doses(due_at);
      CREATE INDEX idx_logs_dose ON logs(dose_id);
    `);
    currentDbVersion = 1;
  }

  if (currentDbVersion === 1) {
    // Tracks the scheduled local notification per dose so edits/deletes can cancel it.
    await db.execAsync('ALTER TABLE doses ADD COLUMN notification_id TEXT;');
    currentDbVersion = 2;
  }

  if (currentDbVersion === 2) {
    // Small key-value table for app-level flags (e.g. "has onboarding run?").
    await db.execAsync(
      'CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);'
    );
    currentDbVersion = 3;
  }

  if (currentDbVersion === 3) {
    // Local multi-profile support: every medication belongs to a profile.
    // DEFAULT 1 backfills existing medications onto the seeded "Me" profile.
    // SQLite won't allow a REFERENCES clause combined with a non-NULL DEFAULT
    // on ALTER TABLE ADD COLUMN, so profile_id isn't a formally declared FK;
    // deleteProfile() cascades a profile's medications explicitly instead.
    // CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE make this safe to re-run
    // if a previous attempt partially applied before failing.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        relationship TEXT NOT NULL DEFAULT 'self',
        color TEXT NOT NULL DEFAULT '#2F6F5E',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT OR IGNORE INTO profiles (id, name, relationship) VALUES (1, 'Me', 'self');

      ALTER TABLE medications ADD COLUMN profile_id INTEGER NOT NULL DEFAULT 1;
    `);
    currentDbVersion = 4;
  }

  if (currentDbVersion === 4) {
    // Cached interaction-check results per medication pair, keyed with the
    // smaller medication id first so a unique index can dedupe (A,B)/(B,A).
    await db.execAsync(`
      CREATE TABLE interactions (
        id INTEGER PRIMARY KEY NOT NULL,
        profile_id INTEGER NOT NULL,
        medication_a_id INTEGER NOT NULL,
        medication_b_id INTEGER NOT NULL,
        severity TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'openfda',
        checked_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX idx_interactions_pair ON interactions(medication_a_id, medication_b_id);
      CREATE INDEX idx_interactions_profile ON interactions(profile_id);
    `);
    currentDbVersion = 5;
  }

  if (currentDbVersion === 5) {
    // AI-rewritten drug info, cached by drug name (not medication id) so
    // every medication sharing a name (across profiles, across re-adds)
    // reuses the same one-time Gemini rewrite instead of paying for it again.
    await db.execAsync(`
      CREATE TABLE drug_info_cache (
        drug_key TEXT PRIMARY KEY NOT NULL,
        what_its_for TEXT,
        side_effects TEXT,
        dosage_notes TEXT,
        checked_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    currentDbVersion = 6;
  }

  if (currentDbVersion === 6) {
    // Tracks the follow-up "still haven't taken this" reminder scheduled
    // alongside the primary one, so it can be cancelled the moment the dose
    // is actually taken/skipped/snoozed instead of firing needlessly.
    await db.execAsync('ALTER TABLE doses ADD COLUMN followup_notification_id TEXT;');
    currentDbVersion = 7;
  }

  await db.execAsync(`PRAGMA user_version = ${currentDbVersion}`);
}
