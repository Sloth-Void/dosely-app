import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, Button, List, Divider } from 'react-native-paper';
import * as Notifications from 'expo-notifications';
import {
  scheduleTestNotification,
  listScheduledNotifications,
  cancelAllTestNotifications,
} from '../lib/notifications';

export default function NotificationTest() {
  const [scheduled, setScheduled] = useState<Notifications.NotificationRequest[]>([]);
  const [lastReceived, setLastReceived] = useState<string | null>(null);

  useEffect(() => {
    refreshList();
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      setLastReceived(
        `${new Date().toLocaleTimeString()}: ${notification.request.content.body}`
      );
    });
    return () => sub.remove();
  }, []);

  async function refreshList() {
    setScheduled(await listScheduledNotifications());
  }

  async function schedule(seconds: number) {
    await scheduleTestNotification(seconds, `Fired ${seconds}s after scheduling`);
    await refreshList();
  }

  async function cancelAll() {
    await cancelAllTestNotifications();
    await refreshList();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall">Notification reliability test</Text>
      <Text style={styles.instructions}>
        Schedule a test below, then background the app (press Home) or force-quit it
        entirely. The notification should still arrive on time. This is the riskiest part
        of the whole app, worth confirming before we build anything on top of it.
      </Text>
      <Text style={styles.instructions}>
        To see the Taken / Snooze buttons: a plain tap just opens the app. On iOS you
        need to long-press (or swipe left, or press on the lock screen) the notification
        to reveal the action buttons underneath it.
      </Text>

      <Button mode="contained" onPress={() => schedule(10)} style={styles.button}>
        Schedule in 10 seconds
      </Button>
      <Button mode="contained" onPress={() => schedule(60)} style={styles.button}>
        Schedule in 1 minute
      </Button>
      <Button mode="contained" onPress={() => schedule(60 * 15)} style={styles.button}>
        Schedule in 15 minutes
      </Button>
      <Button mode="outlined" onPress={cancelAll} style={styles.button}>
        Cancel all scheduled
      </Button>

      {lastReceived && (
        <Text style={styles.received}>Last received while app open: {lastReceived}</Text>
      )}

      <Divider style={styles.divider} />
      <Text variant="titleMedium">Currently scheduled ({scheduled.length})</Text>
      {scheduled.map((n) => (
        <List.Item
          key={n.identifier}
          title={n.content.body ?? n.identifier}
          description={JSON.stringify(n.trigger)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  instructions: { marginBottom: 8, lineHeight: 20 },
  button: { marginVertical: 4 },
  received: { marginTop: 12, fontWeight: '600' },
  divider: { marginVertical: 16 },
});
