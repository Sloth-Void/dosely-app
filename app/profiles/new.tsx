import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import ProfileForm from '../../components/ProfileForm';
import { createProfile } from '../../db/queries';
import { useActiveProfile } from '../../lib/profileContext';
import type { ProfileInput } from '../../db/queries';

export default function NewProfile() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { refreshProfiles, setActiveProfile } = useActiveProfile();

  async function handleSubmit(input: ProfileInput) {
    const id = await createProfile(db, input);
    const all = await refreshProfiles();
    const created = all.find((p) => p.id === id);
    if (created) await setActiveProfile(created);
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProfileForm onSubmit={handleSubmit} submitLabel="Add profile" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
});
