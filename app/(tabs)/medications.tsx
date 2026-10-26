import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Card, IconButton, FAB, Avatar, Button, Chip } from 'react-native-paper';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  getAllMedications,
  deleteMedication,
  getInteractionsForProfile,
  getSetting,
  setSetting,
} from '../../db/queries';
import { cancelPendingDosesForMedication } from '../../lib/scheduleSync';
import { checkInteractionsForProfile } from '../../lib/interactionEngine';
import { useActiveProfile } from '../../lib/profileContext';
import { exportMedicationSummary } from '../../lib/pdfExport';
import { theme } from '../../lib/theme';
import type { InteractionWithMedications, MedicationWithSchedule } from '../../db/types';

function describeSchedule(item: MedicationWithSchedule): string {
  if (item.medication.is_prn) return 'Take as needed';
  if (!item.schedule) return 'No schedule set';

  const times = (JSON.parse(item.schedule.times) as string[]).length;
  if (times === 0) return 'Take as needed';
  const days = item.schedule.days_of_week
    ? (JSON.parse(item.schedule.days_of_week) as number[]).length
    : 7;

  const timesLabel = `${times}x daily`;
  const daysLabel = days === 7 ? 'every day' : `${days} days/week`;
  return `${timesLabel} · ${daysLabel}`;
}

const SEVERITY_LABELS: Record<string, string> = {
  contraindicated: 'Do not combine',
  major: 'Real risk: talk to your doctor',
  minor: 'Good to know',
};

const DISCLAIMER_TEXT =
  'From FDA drug labeling data. Not medical advice, always check with your pharmacist or doctor.';

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  contraindicated: { bg: '#FBE7E5', text: theme.colors.error },
  major: { bg: '#FBEEDD', text: '#8A5A1E' },
  minor: { bg: theme.colors.surfaceVariant, text: '#555555' },
};

interface InteractionsSectionProps {
  medicationCount: number;
  interactions: InteractionWithMedications[];
  checking: boolean;
  hasChecked: boolean;
  onCheck: () => void;
}

function InteractionsSection({
  medicationCount,
  interactions,
  checking,
  hasChecked,
  onCheck,
}: InteractionsSectionProps) {
  if (medicationCount < 2) return null;

  return (
    <View style={styles.interactionsSection}>
      <Button
        mode="outlined"
        icon="shield-search"
        onPress={onCheck}
        loading={checking}
        disabled={checking}
      >
        {hasChecked ? 'Re-check interactions' : 'Check for interactions'}
      </Button>

      {interactions.map((item) => {
        const colors = SEVERITY_COLORS[item.severity];
        return (
          <Card key={item.id} style={styles.interactionCard} mode="outlined">
            <Card.Content>
              <Text style={styles.interactionTitle}>
                {item.medication_a_name} + {item.medication_b_name}
              </Text>
              <Chip
                style={[styles.severityChip, { backgroundColor: colors.bg }]}
                textStyle={{ color: colors.text, fontWeight: '600' }}
              >
                {SEVERITY_LABELS[item.severity]}
              </Chip>
              <Text style={styles.interactionExcerpt}>{item.excerpt}</Text>
            </Card.Content>
          </Card>
        );
      })}

      {hasChecked && interactions.length === 0 && !checking && (
        <Text style={styles.noInteractions}>
          No known interactions found among your current medications.
        </Text>
      )}

      {hasChecked && !checking && <Text style={styles.disclaimer}>{DISCLAIMER_TEXT}</Text>}
    </View>
  );
}

export default function MedicationList() {
  const db = useSQLiteContext();
  const router = useRouter();
  const navigation = useNavigation();
  const { activeProfile } = useActiveProfile();
  const [medications, setMedications] = useState<MedicationWithSchedule[]>([]);
  const [interactions, setInteractions] = useState<InteractionWithMedications[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [checkingInteractions, setCheckingInteractions] = useState(false);
  const [hasCheckedInteractions, setHasCheckedInteractions] = useState(false);

  const interactionsCheckedKey = activeProfile ? `interactions_checked_${activeProfile.id}` : null;

  const loadMedications = useCallback(() => {
    if (!activeProfile) return;
    getAllMedications(db, activeProfile.id).then((rows) => {
      setMedications(rows);
      setLoaded(true);
    });
    getInteractionsForProfile(db, activeProfile.id).then(setInteractions);
    if (interactionsCheckedKey) {
      getSetting(db, interactionsCheckedKey).then((value) => setHasCheckedInteractions(value === 'true'));
    }
  }, [db, activeProfile, interactionsCheckedKey]);

  useFocusEffect(
    useCallback(() => {
      loadMedications();
    }, [loadMedications])
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="share-variant"
          disabled={!activeProfile || medications.length === 0}
          onPress={() => activeProfile && exportMedicationSummary(activeProfile, medications)}
        />
      ),
    });
  }, [navigation, activeProfile, medications]);

  async function handleCheckInteractions() {
    if (!activeProfile || !interactionsCheckedKey) return;
    setCheckingInteractions(true);
    try {
      await checkInteractionsForProfile(db, activeProfile.id);
      await setSetting(db, interactionsCheckedKey, 'true');
      setHasCheckedInteractions(true);
    } catch (err) {
      Alert.alert(
        'Interaction check failed',
        'Something went wrong checking for interactions. Please try again.'
      );
      console.warn('[interactions] check failed', err);
    } finally {
      setInteractions(await getInteractionsForProfile(db, activeProfile.id));
      setCheckingInteractions(false);
    }
  }

  function confirmDelete(id: number, name: string) {
    Alert.alert('Delete medication?', `This removes ${name} and cancels its reminders.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await cancelPendingDosesForMedication(db, id);
          await deleteMedication(db, id);
          loadMedications();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={medications}
        keyExtractor={(item) => String(item.medication.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <InteractionsSection
            medicationCount={medications.length}
            interactions={interactions}
            checking={checkingInteractions}
            hasChecked={hasCheckedInteractions}
            onCheck={handleCheckInteractions}
          />
        }
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Avatar.Icon
                icon="pill"
                size={64}
                style={{ backgroundColor: theme.colors.primaryContainer }}
                color={theme.colors.primary}
              />
              <Text variant="titleMedium" style={styles.emptyTitle}>
                No medications yet
              </Text>
              <Text style={styles.emptyBody}>
                Add your first one and Dosely will remind you when it's time.
              </Text>
              <Button
                mode="contained"
                style={styles.emptyButton}
                onPress={() => router.push('/medications/new')}
              >
                Add a medication
              </Button>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Card
            style={styles.card}
            mode="elevated"
            onPress={() => router.push(`/medications/${item.medication.id}`)}
          >
            <Card.Title
              title={item.medication.name}
              titleStyle={styles.cardTitle}
              subtitle={[item.medication.strength, describeSchedule(item)]
                .filter(Boolean)
                .join(' · ')}
              left={(props) => (
                <Avatar.Icon
                  {...props}
                  icon="pill"
                  size={40}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  color={theme.colors.primary}
                />
              )}
              right={(props) => (
                <View style={styles.cardActions}>
                  <IconButton
                    {...props}
                    icon="information-outline"
                    onPress={() => router.push(`/drug-info/${item.medication.id}`)}
                  />
                  <IconButton
                    {...props}
                    icon="delete-outline"
                    onPress={() => confirmDelete(item.medication.id, item.medication.name)}
                  />
                </View>
              )}
            />
          </Card>
        )}
      />
      {medications.length > 0 && (
        <FAB icon="plus" style={styles.fab} onPress={() => router.push('/medications/new')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, flexGrow: 1 },
  card: { marginBottom: 12 },
  cardTitle: { fontWeight: '600' },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  interactionsSection: { marginBottom: 16, gap: 10 },
  interactionCard: { marginTop: 4 },
  interactionTitle: { fontWeight: '600', marginBottom: 6 },
  severityChip: { alignSelf: 'flex-start', marginBottom: 8 },
  interactionExcerpt: { fontSize: 13, lineHeight: 18, opacity: 0.85 },
  noInteractions: { fontSize: 13, opacity: 0.7, marginTop: 4 },
  disclaimer: { fontSize: 11, opacity: 0.6, marginTop: 4, lineHeight: 16 },
  empty: { alignItems: 'center', marginTop: 64, paddingHorizontal: 24 },
  emptyTitle: { marginTop: 16, fontWeight: '600' },
  emptyBody: { marginTop: 8, textAlign: 'center', opacity: 0.7 },
  emptyButton: { marginTop: 20, borderRadius: 12 },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: theme.colors.primary },
});
