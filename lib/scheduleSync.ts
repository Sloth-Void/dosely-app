import type { SQLiteDatabase } from 'expo-sqlite';
import type { DoseRow, ScheduleRow, ProfileRelationship, FoodPreference } from '../db/types';
import { nextOccurrences, GENERATION_WINDOW_DAYS } from './doseGenerator';
import {
  scheduleDoseNotification,
  cancelNotification,
  requestNotificationPermissions,
  type DoseNotificationOptions,
} from './notifications';
import { FOOD_LABELS } from './foodLabels';
import { hasContraindicatedInteraction } from '../db/queries';

/**
 * Wraps scheduleDoseNotification so a single rejected OS call (e.g. a past
 * trigger date, a platform quirk) can't abort the whole dose-generation loop;
 * the dose row still gets created, just without a local reminder.
 */
async function scheduleDoseNotificationSafely(
  title: string,
  body: string,
  dueAt: Date,
  options?: DoseNotificationOptions
): Promise<string | null> {
  try {
    return await scheduleDoseNotification(title, body, dueAt, options);
  } catch (err) {
    console.warn('[notifications] failed to schedule dose reminder', dueAt.toISOString(), err);
    return null;
  }
}

// Once the furthest pending dose is closer than this, extend the window:
// keeps the rolling generation ahead of real time without regenerating on
// every single load.
const TOP_UP_THRESHOLD_DAYS = 3;

// How long to wait after a dose's due time before nudging again if it's
// still pending, long enough not to feel like double-notifying, short
// enough to still be useful.
const FOLLOWUP_DELAY_MINUTES = 20;

/**
 * Cancels every pending dose's OS-level notification and deletes those dose
 * rows for a medication. Call before regenerating or when a medication is
 * removed; pending doses represent not-yet-happened reminders, so deleting
 * them is safe; taken/skipped ones are history and are left alone.
 */
export async function cancelPendingDosesForMedication(
  db: SQLiteDatabase,
  medicationId: number
): Promise<void> {
  const doses = await db.getAllAsync<DoseRow>(
    `SELECT doses.* FROM doses
     JOIN schedules ON schedules.id = doses.schedule_id
     WHERE schedules.medication_id = ? AND doses.status = 'pending'`,
    medicationId
  );

  for (const dose of doses) {
    if (dose.notification_id) {
      await cancelNotification(dose.notification_id);
    }
    if (dose.followup_notification_id) {
      await cancelNotification(dose.followup_notification_id);
    }
  }

  await db.runAsync(
    `DELETE FROM doses WHERE status = 'pending' AND schedule_id IN
     (SELECT id FROM schedules WHERE medication_id = ?)`,
    medicationId
  );
}

/**
 * Same as `cancelPendingDosesForMedication` but for every medication under a
 * profile; call before deleting a profile so its cascade-deleted doses
 * don't leave orphaned OS-level notifications behind.
 */
export async function cancelPendingDosesForProfile(
  db: SQLiteDatabase,
  profileId: number
): Promise<void> {
  const doses = await db.getAllAsync<DoseRow>(
    `SELECT doses.* FROM doses
     JOIN schedules ON schedules.id = doses.schedule_id
     JOIN medications ON medications.id = schedules.medication_id
     WHERE medications.profile_id = ? AND doses.status = 'pending'`,
    profileId
  );

  for (const dose of doses) {
    if (dose.notification_id) {
      await cancelNotification(dose.notification_id);
    }
    if (dose.followup_notification_id) {
      await cancelNotification(dose.followup_notification_id);
    }
  }

  await db.runAsync(
    `DELETE FROM doses WHERE status = 'pending' AND schedule_id IN
     (SELECT schedules.id FROM schedules
      JOIN medications ON medications.id = schedules.medication_id
      WHERE medications.profile_id = ?)`,
    profileId
  );
}

/**
 * Regenerates the upcoming dose occurrences and their local notifications for
 * a medication's schedule. Safe to call after every create/update; it wipes
 * old pending doses first so edits (a new time, a removed day) don't leave
 * stale notifications behind.
 */
export async function syncNotificationsForMedication(
  db: SQLiteDatabase,
  medicationId: number,
  profileName: string,
  profileRelationship: ProfileRelationship,
  medicationName: string,
  medicationStrength: string
): Promise<void> {
  await cancelPendingDosesForMedication(db, medicationId);

  const schedule = await db.getFirstAsync<ScheduleRow>(
    'SELECT * FROM schedules WHERE medication_id = ?',
    medicationId
  );
  if (!schedule) return; // shouldn't happen: every medication gets a schedule row

  const medication = await db.getFirstAsync<{ profile_id: number }>(
    'SELECT profile_id FROM medications WHERE id = ?',
    medicationId
  );
  const urgent = medication
    ? await hasContraindicatedInteraction(db, medication.profile_id, medicationId)
    : false;

  const granted = await requestNotificationPermissions();
  const title = reminderTitle(profileName, profileRelationship);
  const followupTitle = followUpTitle(profileName, profileRelationship);
  const body = medicationLabel(medicationName, medicationStrength, schedule.food_preference);
  const occurrences = nextOccurrences(schedule);

  for (const dueAt of occurrences) {
    await scheduleAndInsertDose(db, schedule.id, dueAt, title, followupTitle, body, granted, urgent);
  }
}

/**
 * Inserts a dose row, then schedules its primary and follow-up local
 * notifications against that row's real id (so the notification's action
 * buttons know which dose they're acting on) and writes the resulting
 * notification ids back onto the row.
 */
async function scheduleAndInsertDose(
  db: SQLiteDatabase,
  scheduleId: number,
  dueAt: Date,
  title: string,
  followupTitle: string,
  body: string,
  granted: boolean,
  urgent: boolean
): Promise<void> {
  const insert = await db.runAsync(
    'INSERT INTO doses (schedule_id, due_at, status) VALUES (?, ?, ?)',
    scheduleId,
    dueAt.toISOString(),
    'pending'
  );
  const doseId = insert.lastInsertRowId;

  let notificationId: string | null = null;
  let followupNotificationId: string | null = null;
  if (granted) {
    notificationId = await scheduleDoseNotificationSafely(title, body, dueAt, { doseId, urgent });
    followupNotificationId = await scheduleDoseNotificationSafely(
      followupTitle,
      body,
      new Date(dueAt.getTime() + FOLLOWUP_DELAY_MINUTES * 60 * 1000),
      { doseId, urgent }
    );
  }

  await db.runAsync(
    'UPDATE doses SET notification_id = ?, followup_notification_id = ? WHERE id = ?',
    notificationId,
    followupNotificationId,
    doseId
  );
}

/** "Motrin 200mg. Take with food." No profile prefix (that lives in the title now). */
export function medicationLabel(
  name: string,
  strength: string,
  foodPreference?: FoodPreference
): string {
  const base = strength ? `${name} ${strength}` : name;
  const foodNote = foodPreference ? FOOD_LABELS[foodPreference] : '';
  return foodNote ? `${base}. ${foodNote}.` : base;
}

/** "Time for your medication" for the self profile, "Time for Kid's medication" otherwise. */
export function reminderTitle(profileName: string, relationship: ProfileRelationship): string {
  const possessive = relationship === 'self' ? 'your' : `${profileName}'s`;
  return `Time for ${possessive} medication`;
}

/** "Still haven't taken your medication?" The follow-up nudge sent if a dose is still pending. */
export function followUpTitle(profileName: string, relationship: ProfileRelationship): string {
  const possessive = relationship === 'self' ? 'your' : `${profileName}'s`;
  return `Still haven't taken ${possessive} medication?`;
}

interface ScheduleWithMedication extends ScheduleRow {
  medication_name: string;
  medication_strength: string | null;
  profile_id: number;
  profile_name: string;
  profile_relationship: ProfileRelationship;
}

/**
 * Extends every schedule's pending doses forward when the window is running
 * low, without touching doses that already exist, so it's safe to call on
 * every Today screen load rather than only after an edit. Call this instead
 * of relying on medication edits to keep the reminder window alive.
 */
export async function topUpAllSchedules(db: SQLiteDatabase): Promise<void> {
  const schedules = await db.getAllAsync<ScheduleWithMedication>(
    `SELECT schedules.*, medications.name as medication_name, medications.strength as medication_strength,
            medications.profile_id as profile_id,
            profiles.name as profile_name, profiles.relationship as profile_relationship
     FROM schedules
     JOIN medications ON medications.id = schedules.medication_id
     JOIN profiles ON profiles.id = medications.profile_id`
  );

  for (const schedule of schedules) {
    const times = JSON.parse(schedule.times) as string[];
    if (times.length === 0) continue; // PRN, nothing to top up

    const latest = await db.getFirstAsync<{ max_due: string | null }>(
      "SELECT MAX(due_at) as max_due FROM doses WHERE schedule_id = ? AND status = 'pending'",
      schedule.id
    );

    // Clamp to now: if the app sat unopened long enough that every pending
    // dose's due date has already passed, anchoring on that stale max_due
    // would generate "future" occurrences that are still in the past, and
    // iOS rejects scheduling a local notification for a time already gone.
    const now = new Date();
    const anchor = latest?.max_due ? new Date(latest.max_due) : now;
    const from = anchor > now ? anchor : now;
    const daysOfBuffer = (from.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysOfBuffer >= TOP_UP_THRESHOLD_DAYS) continue;

    const urgent = await hasContraindicatedInteraction(
      db,
      schedule.profile_id,
      schedule.medication_id
    );
    const granted = await requestNotificationPermissions();
    const title = reminderTitle(schedule.profile_name, schedule.profile_relationship);
    const followupTitle = followUpTitle(schedule.profile_name, schedule.profile_relationship);
    const body = medicationLabel(
      schedule.medication_name,
      schedule.medication_strength ?? '',
      schedule.food_preference
    );
    const newOccurrences = nextOccurrences(schedule, GENERATION_WINDOW_DAYS, from);

    for (const dueAt of newOccurrences) {
      await scheduleAndInsertDose(db, schedule.id, dueAt, title, followupTitle, body, granted, urgent);
    }
  }
}
