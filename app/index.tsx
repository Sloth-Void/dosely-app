import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, Button, Card, Avatar, ActivityIndicator, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { requestNotificationPermissions } from '../lib/notifications';
import { getSetting, setSetting, updateProfile } from '../db/queries';
import { useActiveProfile } from '../lib/profileContext';
import { theme } from '../lib/theme';

const ONBOARDED_KEY = 'onboarded';

export default function Onboarding() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { profiles, activeProfile, refreshProfiles, setActiveProfile } = useActiveProfile();
  const [name, setName] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>(
    'unknown'
  );
  const [checkingOnboarded, setCheckingOnboarded] = useState(true);

  useEffect(() => {
    getSetting(db, ONBOARDED_KEY).then((value) => {
      if (value === 'true') {
        router.replace('/today');
      } else {
        setCheckingOnboarded(false);
      }
    });
  }, [db]);

  async function handleGetStarted() {
    const trimmedName = name.trim();
    const defaultProfile = profiles[0];
    if (trimmedName && defaultProfile) {
      await updateProfile(db, defaultProfile.id, {
        name: trimmedName,
        relationship: defaultProfile.relationship,
        color: defaultProfile.color,
      });
      const updated = await refreshProfiles();
      if (activeProfile?.id === defaultProfile.id) {
        const match = updated.find((p) => p.id === defaultProfile.id);
        if (match) await setActiveProfile(match);
      }
    }

    const granted = await requestNotificationPermissions();
    setPermissionStatus(granted ? 'granted' : 'denied');
    await setSetting(db, ONBOARDED_KEY, 'true');
    router.replace('/today');
  }

  if (checkingOnboarded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 32 }]}
    >
      <View style={styles.hero}>
        <Avatar.Icon
          icon="pill"
          size={72}
          style={{ backgroundColor: theme.colors.primaryContainer }}
          color={theme.colors.primary}
        />
        <Text variant="headlineLarge" style={styles.title}>
          Dosely
        </Text>
        <Text variant="bodyLarge" style={styles.tagline}>
          A calm companion for your medications.
        </Text>
      </View>

      <TextInput
        label="Your name"
        value={name}
        onChangeText={setName}
        mode="outlined"
        placeholder="e.g. Alex"
        style={styles.nameInput}
      />

      <Card style={styles.card} mode="contained">
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>
            Before you start
          </Text>
          <Text style={styles.disclaimer}>
            Dosely helps you remember and track your medications. It is not medical advice.
            Always check with your pharmacist or doctor before starting, stopping, or
            combining medications.
          </Text>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleGetStarted}
        style={styles.primaryButton}
        contentStyle={styles.primaryButtonContent}
      >
        Get Started
      </Button>

      {permissionStatus === 'denied' && (
        <Text style={styles.statusError}>
          Notifications are off, so Dosely can't remind you without them. You can enable
          them later in Settings.
        </Text>
      )}

      <Button
        mode="text"
        compact
        textColor={theme.colors.secondary}
        onPress={() => router.push('/notification-test')}
        style={styles.devLink}
      >
        Developer: test reminder notifications
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, flexGrow: 1 },
  hero: { alignItems: 'center', marginBottom: 32 },
  title: { marginTop: 16, fontWeight: '700' },
  tagline: { marginTop: 4, opacity: 0.7, textAlign: 'center' },
  nameInput: { marginBottom: 24 },
  card: { marginBottom: 24 },
  cardTitle: { marginBottom: 8, fontWeight: '600' },
  disclaimer: { lineHeight: 20, opacity: 0.85 },
  primaryButton: { borderRadius: 12 },
  primaryButtonContent: { paddingVertical: 6 },
  statusError: { color: '#B3261E', marginTop: 12, textAlign: 'center' },
  devLink: { marginTop: 32, alignSelf: 'center' },
});
