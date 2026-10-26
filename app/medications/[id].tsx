import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import MedicationForm from '../../components/MedicationForm';
import { getMedicationWithSchedule, updateMedication } from '../../db/queries';
import { syncNotificationsForMedication } from '../../lib/scheduleSync';
import { useActiveProfile } from '../../lib/profileContext';
import type { MedicationFormInput } from '../../db/types';

export default function EditMedication() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const medicationId = Number(id);
  const db = useSQLiteContext();
  const router = useRouter();
  const { profiles } = useActiveProfile();
  const [initialValues, setInitialValues] = useState<MedicationFormInput | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await getMedicationWithSchedule(db, medicationId);
      if (!result) {
        setNotFound(true);
        return;
      }
      const { medication, schedule } = result;
      setProfileId(medication.profile_id);
      setInitialValues({
        name: medication.name,
        strength: medication.strength ?? '',
        form: medication.form ?? '',
        notes: medication.notes ?? '',
        isPrn: !!medication.is_prn,
        times: schedule ? (JSON.parse(schedule.times) as string[]) : ['08:00'],
        daysOfWeek: schedule?.days_of_week ? (JSON.parse(schedule.days_of_week) as number[]) : null,
        foodPreference: schedule?.food_preference ?? 'none',
      });
    })();
  }, [medicationId]);

  async function handleSubmit(input: MedicationFormInput) {
    await updateMedication(db, medicationId, input);
    const profile = profiles.find((p) => p.id === profileId);
    await syncNotificationsForMedication(
      db,
      medicationId,
      profile?.name ?? '',
      profile?.relationship ?? 'self',
      input.name,
      input.strength
    );
    router.back();
  }

  if (notFound) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text>Medication not found.</Text>
      </ScrollView>
    );
  }

  if (!initialValues) {
    return (
      <ScrollView contentContainerStyle={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <MedicationForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  centered: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
});
