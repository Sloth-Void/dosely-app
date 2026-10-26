import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Alert } from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import ProfileForm from '../../components/ProfileForm';
import { updateProfile, deleteProfile } from '../../db/queries';
import { cancelPendingDosesForProfile } from '../../lib/scheduleSync';
import { useActiveProfile } from '../../lib/profileContext';
import { theme } from '../../lib/theme';
import type { ProfileInput } from '../../db/queries';
import type { ProfileRow } from '../../db/types';

export default function EditProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileId = Number(id);
  const db = useSQLiteContext();
  const router = useRouter();
  const { profiles, activeProfile, refreshProfiles, setActiveProfile } = useActiveProfile();
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined);

  useEffect(() => {
    setProfile(profiles.find((p) => p.id === profileId) ?? null);
  }, [profiles, profileId]);

  async function handleSubmit(input: ProfileInput) {
    await updateProfile(db, profileId, input);
    const all = await refreshProfiles();
    if (activeProfile?.id === profileId) {
      const updated = all.find((p) => p.id === profileId);
      if (updated) await setActiveProfile(updated);
    }
    router.back();
  }

  function confirmDelete() {
    if (profiles.length <= 1) {
      Alert.alert("Can't delete", 'You need at least one profile.');
      return;
    }
    Alert.alert(
      'Delete profile?',
      `This removes ${profile?.name} and all of their medications and history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await cancelPendingDosesForProfile(db, profileId);
            await deleteProfile(db, profileId);
            const all = await refreshProfiles();
            if (activeProfile?.id === profileId && all[0]) {
              await setActiveProfile(all[0]);
            }
            router.back();
          },
        },
      ]
    );
  }

  if (profile === undefined) {
    return (
      <ScrollView contentContainerStyle={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ScrollView>
    );
  }

  if (profile === null) {
    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProfileForm
        initialValues={{
          name: profile.name,
          relationship: profile.relationship,
          color: profile.color,
        }}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
      />
      {profiles.length > 1 && (
        <Button
          mode="text"
          textColor={theme.colors.error}
          onPress={confirmDelete}
          style={styles.deleteButton}
        >
          Delete profile
        </Button>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  centered: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  deleteButton: { marginTop: 8 },
});
