import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import MedicationForm from '../../components/MedicationForm';
import { createMedication } from '../../db/queries';
import { syncNotificationsForMedication } from '../../lib/scheduleSync';
import { useActiveProfile } from '../../lib/profileContext';
import type { MedicationFormInput } from '../../db/types';

export default function NewMedication() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { activeProfile } = useActiveProfile();

  async function handleSubmit(input: MedicationFormInput) {
    if (!activeProfile) return;
    const medicationId = await createMedication(db, activeProfile.id, input);
    await syncNotificationsForMedication(
      db,
      medicationId,
      activeProfile.name,
      activeProfile.relationship,
      input.name,
      input.strength
    );
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <MedicationForm onSubmit={handleSubmit} submitLabel="Add medication" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
});
