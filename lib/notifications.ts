import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export const SNOOZE_MINUTES = 10;

const DOSE_CATEGORY = 'dose-reminder';
export const MARK_TAKEN_ACTION = 'MARK_TAKEN';
export const SNOOZE_ACTION = 'SNOOZE_DOSE';
const URGENT_CHANNEL = 'urgent';

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Registers the "Taken" / "Snooze" buttons shown directly on a dose
 * reminder notification. Both actions foreground the app (the default);
 * that's deliberate: a background-only action handler needs a registered
 * native background task, which Expo Go can't run, so foregrounding is what
 * makes the button reliably record the dose instead of silently doing
 * nothing when the app was killed.
 */
export async function configureNotificationCategories() {
  await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
    { identifier: MARK_TAKEN_ACTION, buttonTitle: 'Taken' },
    { identifier: SNOOZE_ACTION, buttonTitle: `Snooze ${SNOOZE_MINUTES} min` },
  ]);
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.warn(
      'Notifications require a physical device; simulators cannot receive them reliably.'
    );
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    status = requested.status;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
    await Notifications.setNotificationChannelAsync(URGENT_CHANNEL, {
      name: 'Critical medication alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      sound: 'default',
    });
  }

  return status === 'granted';
}

const TEST_NOTIFICATION_TITLE = 'Dosely test reminder';

// No real dose has this id; the response listener looks it up, finds
// nothing, and safely no-ops. This just lets the test screen show the same
// Taken/Snooze buttons a real reminder would, to verify the UI end to end.
const TEST_DOSE_ID = -1;

export async function scheduleTestNotification(secondsFromNow: number, label: string) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: TEST_NOTIFICATION_TITLE,
      body: label,
      data: { doseId: TEST_DOSE_ID },
      categoryIdentifier: DOSE_CATEGORY,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsFromNow,
      repeats: false,
    },
  });
}

export async function listScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Only cancels notifications created by the dev test screen. A plain
 * "cancel everything" here would also wipe real, in-flight medication
 * reminders scheduled elsewhere in the app.
 */
export async function cancelAllTestNotifications() {
  const scheduled = await listScheduledNotifications();
  const testNotifications = scheduled.filter((n) => n.content.title === TEST_NOTIFICATION_TITLE);
  await Promise.all(testNotifications.map((n) => cancelNotification(n.identifier)));
}

export interface DoseNotificationOptions {
  /** Included in the notification's data payload and turns on the Taken/Snooze action buttons. */
  doseId?: number;
  /** Escalates presentation for a dose flagged contraindicated with something else in the profile. */
  urgent?: boolean;
}

export async function scheduleDoseNotification(
  title: string,
  body: string,
  dueAt: Date,
  { doseId, urgent }: DoseNotificationOptions = {}
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      ...(doseId !== undefined ? { data: { doseId }, categoryIdentifier: DOSE_CATEGORY } : {}),
      ...(urgent && Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' as const } : {}),
      ...(urgent && Platform.OS === 'android' ? { channelId: URGENT_CHANNEL } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: dueAt,
    },
  });
}

export async function cancelNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}
