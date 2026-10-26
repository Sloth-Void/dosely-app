import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { getDoseById } from '../db/queries';
import { markDoseTaken, snoozeDose } from '../lib/doseActions';
import { MARK_TAKEN_ACTION, SNOOZE_ACTION } from '../lib/notifications';

/**
 * Handles taps on the "Taken" / "Snooze" buttons shown on a dose reminder
 * notification. Renders nothing; this just needs to live somewhere inside
 * the SQLiteProvider tree so it can read/write the same database the rest
 * of the app uses.
 */
export default function NotificationResponder() {
  const db = useSQLiteContext();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const doseId = response.notification.request.content.data?.doseId;
      if (typeof doseId !== 'number') return;

      const dose = await getDoseById(db, doseId);
      if (!dose || dose.status !== 'pending') return;

      if (response.actionIdentifier === MARK_TAKEN_ACTION) {
        await markDoseTaken(db, dose);
      } else if (response.actionIdentifier === SNOOZE_ACTION) {
        await snoozeDose(db, dose);
      }
    });

    return () => subscription.remove();
  }, [db]);

  return null;
}
