import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  MedicationRow,
  ScheduleRow,
  MedicationWithSchedule,
  MedicationFormInput,
  DoseWithMedication,
  PrnMedication,
  ProfileRow,
  ProfileRelationship,
  InteractionSeverity,
  InteractionWithMedications,
  DrugInfoCacheRow,
} from './types';
import type { DrugSummary } from '../lib/drugInfo';

export interface ProfileInput {
  name: string;
  relationship: ProfileRelationship;
  color: string;
}

export async function getAllProfiles(db: SQLiteDatabase): Promise<ProfileRow[]> {
  return db.getAllAsync<ProfileRow>('SELECT * FROM profiles ORDER BY id ASC');
}

export async function createProfile(db: SQLiteDatabase, input: ProfileInput): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO profiles (name, relationship, color) VALUES (?, ?, ?)',
    input.name,
    input.relationship,
    input.color
  );
  return result.lastInsertRowId;
}

export async function updateProfile(
  db: SQLiteDatabase,
  profileId: number,
  input: ProfileInput
): Promise<void> {
  await db.runAsync(
    'UPDATE profiles SET name = ?, relationship = ?, color = ? WHERE id = ?',
    input.name,
    input.relationship,
    input.color,
    profileId
  );
}

/**
 * Refuses to delete the last remaining profile; the app always needs one.
 * `profile_id` isn't a formally declared foreign key (see schema.ts), so
 * medications (and via their own FKs, schedules/doses/logs) are deleted
 * explicitly here rather than relying on ON DELETE CASCADE.
 */
export async function deleteProfile(db: SQLiteDatabase, profileId: number): Promise<void> {
  const { count } = (await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM profiles'
  ))!;
  if (count <= 1) {
    throw new Error('Cannot delete the only remaining profile.');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM interactions WHERE profile_id = ?', profileId);
    await db.runAsync('DELETE FROM medications WHERE profile_id = ?', profileId);
    await db.runAsync('DELETE FROM profiles WHERE id = ?', profileId);
  });
}

const DOSE_WITH_MEDICATION_SELECT = `
  SELECT doses.id, doses.schedule_id, doses.due_at, doses.status, doses.notification_id,
         doses.followup_notification_id,
         medications.id as medication_id, medications.name as medication_name,
         medications.strength as medication_strength, schedules.food_preference,
         profiles.name as profile_name, profiles.relationship as profile_relationship
  FROM doses
  JOIN schedules ON schedules.id = doses.schedule_id
  JOIN medications ON medications.id = schedules.medication_id
  JOIN profiles ON profiles.id = medications.profile_id
`;

export async function getDoseById(
  db: SQLiteDatabase,
  doseId: number
): Promise<DoseWithMedication | null> {
  return db.getFirstAsync<DoseWithMedication>(
    `${DOSE_WITH_MEDICATION_SELECT} WHERE doses.id = ?`,
    doseId
  );
}

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

export async function createMedication(
  db: SQLiteDatabase,
  profileId: number,
  input: MedicationFormInput
): Promise<number> {
  let medicationId = 0;

  await db.withTransactionAsync(async () => {
    const medResult = await db.runAsync(
      'INSERT INTO medications (profile_id, name, strength, form, notes, is_prn) VALUES (?, ?, ?, ?, ?, ?)',
      profileId,
      input.name,
      input.strength || null,
      input.form || null,
      input.notes || null,
      input.isPrn ? 1 : 0
    );
    medicationId = medResult.lastInsertRowId;

    // Every medication gets exactly one schedule row, even PRN ones (with an
    // empty times list), which gives PRN doses somewhere to attach to without
    // a separate data path.
    await db.runAsync(
      'INSERT INTO schedules (medication_id, times, days_of_week, food_preference) VALUES (?, ?, ?, ?)',
      medicationId,
      JSON.stringify(input.isPrn ? [] : input.times),
      input.isPrn || !input.daysOfWeek ? null : JSON.stringify(input.daysOfWeek),
      input.foodPreference
    );
  });

  return medicationId;
}

export async function updateMedication(
  db: SQLiteDatabase,
  medicationId: number,
  input: MedicationFormInput
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE medications SET name = ?, strength = ?, form = ?, notes = ?, is_prn = ? WHERE id = ?',
      input.name,
      input.strength || null,
      input.form || null,
      input.notes || null,
      input.isPrn ? 1 : 0,
      medicationId
    );

    const existingSchedule = await db.getFirstAsync<ScheduleRow>(
      'SELECT * FROM schedules WHERE medication_id = ?',
      medicationId
    );
    const times = JSON.stringify(input.isPrn ? [] : input.times);
    const daysOfWeek = input.isPrn || !input.daysOfWeek ? null : JSON.stringify(input.daysOfWeek);

    if (existingSchedule) {
      await db.runAsync(
        'UPDATE schedules SET times = ?, days_of_week = ?, food_preference = ? WHERE id = ?',
        times,
        daysOfWeek,
        input.foodPreference,
        existingSchedule.id
      );
    } else {
      await db.runAsync(
        'INSERT INTO schedules (medication_id, times, days_of_week, food_preference) VALUES (?, ?, ?, ?)',
        medicationId,
        times,
        daysOfWeek,
        input.foodPreference
      );
    }
  });
}

export async function deleteMedication(db: SQLiteDatabase, medicationId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM interactions WHERE medication_a_id = ? OR medication_b_id = ?',
      medicationId,
      medicationId
    );
    await db.runAsync('DELETE FROM medications WHERE id = ?', medicationId);
  });
}

export async function getAllMedications(
  db: SQLiteDatabase,
  profileId: number
): Promise<MedicationWithSchedule[]> {
  const medications = await db.getAllAsync<MedicationRow>(
    'SELECT * FROM medications WHERE profile_id = ? ORDER BY created_at DESC',
    profileId
  );

  const results: MedicationWithSchedule[] = [];
  for (const medication of medications) {
    const schedule = await db.getFirstAsync<ScheduleRow>(
      'SELECT * FROM schedules WHERE medication_id = ?',
      medication.id
    );
    results.push({ medication, schedule: schedule ?? null });
  }

  return results;
}

export async function getMedicationWithSchedule(
  db: SQLiteDatabase,
  medicationId: number
): Promise<MedicationWithSchedule | null> {
  const medication = await db.getFirstAsync<MedicationRow>(
    'SELECT * FROM medications WHERE id = ?',
    medicationId
  );
  if (!medication) return null;

  const schedule = await db.getFirstAsync<ScheduleRow>(
    'SELECT * FROM schedules WHERE medication_id = ?',
    medicationId
  );

  return { medication, schedule: schedule ?? null };
}

export async function getDosesInRange(
  db: SQLiteDatabase,
  profileId: number,
  startISO: string,
  endISO: string
): Promise<DoseWithMedication[]> {
  return db.getAllAsync<DoseWithMedication>(
    `${DOSE_WITH_MEDICATION_SELECT}
     WHERE medications.profile_id = ? AND doses.due_at >= ? AND doses.due_at < ?
     ORDER BY doses.due_at ASC`,
    profileId,
    startISO,
    endISO
  );
}

export async function getPastDoses(
  db: SQLiteDatabase,
  profileId: number,
  beforeISO: string,
  limit: number = 200
): Promise<DoseWithMedication[]> {
  return db.getAllAsync<DoseWithMedication>(
    `${DOSE_WITH_MEDICATION_SELECT}
     WHERE medications.profile_id = ? AND doses.due_at < ? AND doses.status != 'pending'
     ORDER BY doses.due_at DESC
     LIMIT ?`,
    profileId,
    beforeISO,
    limit
  );
}

export async function recordDoseAction(
  db: SQLiteDatabase,
  doseId: number,
  action: 'taken' | 'skipped'
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE doses SET status = ? WHERE id = ?', action, doseId);
    await db.runAsync('INSERT INTO logs (dose_id, action) VALUES (?, ?)', doseId, action);
  });
}

export async function undoDoseAction(db: SQLiteDatabase, doseId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE doses SET status = ? WHERE id = ?', 'pending', doseId);
    await db.runAsync(
      "DELETE FROM logs WHERE dose_id = ? AND action IN ('taken', 'skipped')",
      doseId
    );
  });
}

export async function markDoseSnoozed(
  db: SQLiteDatabase,
  doseId: number,
  notificationId: string | null
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE doses SET notification_id = ? WHERE id = ?', notificationId, doseId);
    await db.runAsync('INSERT INTO logs (dose_id, action) VALUES (?, ?)', doseId, 'snoozed');
  });
}

export async function getPrnMedications(
  db: SQLiteDatabase,
  profileId: number
): Promise<PrnMedication[]> {
  return db.getAllAsync<PrnMedication>(
    `SELECT medications.*, schedules.id as schedule_id
     FROM medications
     JOIN schedules ON schedules.medication_id = medications.id
     WHERE medications.is_prn = 1 AND medications.profile_id = ?
     ORDER BY medications.name ASC`,
    profileId
  );
}

export async function logPrnDose(db: SQLiteDatabase, scheduleId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      "INSERT INTO doses (schedule_id, due_at, status) VALUES (?, datetime('now'), 'taken')",
      scheduleId
    );
    await db.runAsync(
      'INSERT INTO logs (dose_id, action) VALUES (?, ?)',
      result.lastInsertRowId,
      'taken'
    );
  });
}

/** Always orders the pair (smaller id first) so the unique index dedupes regardless of check order. */
function orderedPair(medAId: number, medBId: number): [number, number] {
  return medAId < medBId ? [medAId, medBId] : [medBId, medAId];
}

export async function upsertInteraction(
  db: SQLiteDatabase,
  profileId: number,
  medicationAId: number,
  medicationBId: number,
  severity: InteractionSeverity,
  excerpt: string
): Promise<void> {
  const [a, b] = orderedPair(medicationAId, medicationBId);
  await db.runAsync(
    `INSERT INTO interactions (profile_id, medication_a_id, medication_b_id, severity, excerpt, source, checked_at)
     VALUES (?, ?, ?, ?, ?, 'openfda', datetime('now'))
     ON CONFLICT(medication_a_id, medication_b_id) DO UPDATE SET
       severity = excluded.severity, excerpt = excluded.excerpt, checked_at = excluded.checked_at`,
    profileId,
    a,
    b,
    severity,
    excerpt
  );
}

export async function clearInteraction(
  db: SQLiteDatabase,
  medicationAId: number,
  medicationBId: number
): Promise<void> {
  const [a, b] = orderedPair(medicationAId, medicationBId);
  await db.runAsync(
    'DELETE FROM interactions WHERE medication_a_id = ? AND medication_b_id = ?',
    a,
    b
  );
}

export async function getDrugInfoCache(
  db: SQLiteDatabase,
  drugKey: string
): Promise<DrugSummary | null> {
  const row = await db.getFirstAsync<DrugInfoCacheRow>(
    'SELECT * FROM drug_info_cache WHERE drug_key = ?',
    drugKey
  );
  if (!row) return null;
  return {
    whatItsFor: row.what_its_for,
    sideEffects: row.side_effects,
    dosageNotes: row.dosage_notes,
  };
}

export async function upsertDrugInfoCache(
  db: SQLiteDatabase,
  drugKey: string,
  summary: DrugSummary
): Promise<void> {
  await db.runAsync(
    `INSERT INTO drug_info_cache (drug_key, what_its_for, side_effects, dosage_notes, checked_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(drug_key) DO UPDATE SET
       what_its_for = excluded.what_its_for, side_effects = excluded.side_effects,
       dosage_notes = excluded.dosage_notes, checked_at = excluded.checked_at`,
    drugKey,
    summary.whatItsFor,
    summary.sideEffects,
    summary.dosageNotes
  );
}

/** Used to give a medication's reminder a more urgent notification style when it's flagged contraindicated with something else in the same profile. */
export async function hasContraindicatedInteraction(
  db: SQLiteDatabase,
  profileId: number,
  medicationId: number
): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM interactions
     WHERE profile_id = ? AND severity = 'contraindicated'
       AND (medication_a_id = ? OR medication_b_id = ?)`,
    profileId,
    medicationId,
    medicationId
  );
  return (row?.count ?? 0) > 0;
}

export async function getInteractionsForProfile(
  db: SQLiteDatabase,
  profileId: number
): Promise<InteractionWithMedications[]> {
  return db.getAllAsync<InteractionWithMedications>(
    `SELECT interactions.*, ma.name as medication_a_name, mb.name as medication_b_name
     FROM interactions
     JOIN medications ma ON ma.id = interactions.medication_a_id
     JOIN medications mb ON mb.id = interactions.medication_b_id
     WHERE interactions.profile_id = ?
     ORDER BY CASE severity WHEN 'contraindicated' THEN 0 WHEN 'major' THEN 1 ELSE 2 END,
              interactions.checked_at DESC`,
    profileId
  );
}
