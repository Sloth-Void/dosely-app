import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { configureNotificationHandler, configureNotificationCategories } from '../lib/notifications';
import { migrateDbIfNeeded } from '../db/schema';
import { theme } from '../lib/theme';
import { ProfileProvider } from '../lib/profileContext';
import NotificationResponder from '../components/NotificationResponder';

export default function RootLayout() {
  useEffect(() => {
    configureNotificationHandler();
    configureNotificationCategories();
  }, []);

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="dosely.db" onInit={migrateDbIfNeeded}>
        <NotificationResponder />
        <ProfileProvider>
          <PaperProvider theme={theme}>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.colors.surface },
                headerTitleStyle: { fontWeight: '600' },
                headerTintColor: theme.colors.primary,
                headerShadowVisible: false,
                headerBackTitle: 'Back',
                contentStyle: { backgroundColor: theme.colors.background },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="notification-test" options={{ title: 'Test Reminders' }} />
              <Stack.Screen name="medications/new" options={{ title: 'Add Medication' }} />
              <Stack.Screen name="medications/[id]" options={{ title: 'Edit Medication' }} />
              <Stack.Screen name="profiles/index" options={{ title: 'Manage Profiles' }} />
              <Stack.Screen name="profiles/new" options={{ title: 'Add Profile' }} />
              <Stack.Screen name="profiles/[id]" options={{ title: 'Edit Profile' }} />
              <Stack.Screen name="drug-info/[id]" options={{ title: 'Drug Info' }} />
            </Stack>
          </PaperProvider>
        </ProfileProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
