import type { SQLiteDatabase } from 'expo-sqlite';
import type { DoseWithMedication } from '../db/types';
import {
  recordDoseAction,
  markDoseSnoozed,
  undoDoseAction,
  logPrnDose as logPrnDoseQuery,
} from '../db/queries';
import { cancelNotification, scheduleDoseNotification, SNOOZE_MINUTES } from './notifications';
import { medicationLabel, reminderTitle } from './scheduleSync';

/** Cancels both the primary reminder and its still-pending follow-up nudge, if any. */
async function cancelDoseNotifications(dose: DoseWithMedication): Promise<void> {
  if (dose.notification_id) await cancelNotification(dose.notification_id);
  if (dose.followup_notification_id) await cancelNotification(dose.followup_notification_id);
}

export async function markDoseTaken(db: SQLiteDatabase, dose: DoseWithMedication): Promise<void> {
  await cancelDoseNotifications(dose);
  await recordDoseAction(db, dose.id, 'taken');
}

export async function markDoseSkipped(db: SQLiteDatabase, dose: DoseWithMedication): Promise<void> {
  await cancelDoseNotifications(dose);
  await recordDoseAction(db, dose.id, 'skipped');
}

export async function snoozeDose(db: SQLiteDatabase, dose: DoseWithMedication): Promise<Date> {
  await cancelDoseNotifications(dose);

  const newTime = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);
  const notificationId = await scheduleDoseNotification(
    reminderTitle(dose.profile_name, dose.profile_relationship),
    medicationLabel(dose.medication_name, dose.medication_strength ?? '', dose.food_preference),
    newTime,
    { doseId: dose.id }
  );
  await markDoseSnoozed(db, dose.id, notificationId);
  return newTime;
}

export async function logPrnDose(db: SQLiteDatabase, scheduleId: number): Promise<void> {
  await logPrnDoseQuery(db, scheduleId);
}

/** Reverts a mistakenly taken/skipped dose back to pending. Does not attempt
 * to restore a cancelled notification; an edge case not worth the complexity. */
export async function undoDose(db: SQLiteDatabase, doseId: number): Promise<void> {
  await undoDoseAction(db, doseId);
}
