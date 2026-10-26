import { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  Avatar,
  Icon,
  IconButton,
  Snackbar,
  Menu,
  Divider,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getDosesInRange, getPrnMedications } from '../../db/queries';
import {
  markDoseTaken,
  markDoseSkipped,
  snoozeDose,
  logPrnDose,
  undoDose,
} from '../../lib/doseActions';
import { getCurrentStreak } from '../../lib/streak';
import { topUpAllSchedules } from '../../lib/scheduleSync';
import { useActiveProfile } from '../../lib/profileContext';
import { FOOD_LABELS } from '../../lib/foodLabels';
import { theme } from '../../lib/theme';
import type { DoseWithMedication, PrnMedication } from '../../db/types';

function startOfDayISO(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayISO(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function DoseCheckbox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.checkboxHit}>
      <Icon
        source={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={28}
        color={checked ? theme.colors.primary : '#6B6B6B'}
      />
    </Pressable>
  );
}

interface DoseRowProps {
  dose: DoseWithMedication;
  onTaken: (dose: DoseWithMedication) => void;
  onUndo: (dose: DoseWithMedication) => void;
  onSkip: (dose: DoseWithMedication) => void;
  onSnooze: (dose: DoseWithMedication) => void;
}

function DoseRow({ dose, onTaken, onUndo, onSkip, onSnooze }: DoseRowProps) {
  const isTaken = dose.status === 'taken';
  const isSkipped = dose.status === 'skipped';
  const isPending = dose.status === 'pending';

  return (
    <Card style={[styles.doseCard, !isPending && styles.doneCard]} mode={isPending ? 'elevated' : 'outlined'}>
      <Card.Content style={styles.doseRowContent}>
        <DoseCheckbox
          checked={isTaken}
          onPress={() => (isTaken ? onUndo(dose) : onTaken(dose))}
        />
        <View style={styles.doseInfo}>
          <Text
            variant="titleMedium"
            style={[styles.doseTitle, !isPending && styles.doneText]}
          >
            {dose.medication_name}
            {dose.medication_strength ? ` · ${dose.medication_strength}` : ''}
          </Text>
          <Text style={styles.doseTime}>
            {formatTime(dose.due_at)}
            {isSkipped ? ' · Skipped' : ''}
          </Text>
          {isPending && !!FOOD_LABELS[dose.food_preference] && (
            <Text style={styles.doseFood}>{FOOD_LABELS[dose.food_preference]}</Text>
          )}
        </View>
        {isPending && (
          <View style={styles.rowActions}>
            <IconButton icon="clock-outline" size={20} onPress={() => onSnooze(dose)} />
            <IconButton icon="close" size={20} onPress={() => onSkip(dose)} />
          </View>
        )}
        {(isSkipped || isTaken) && (
          <Button compact onPress={() => onUndo(dose)}>
            Undo
          </Button>
        )}
      </Card.Content>
    </Card>
  );
}

export default function Today() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { activeProfile, profiles, setActiveProfile } = useActiveProfile();
  const [doses, setDoses] = useState<DoseWithMedication[]>([]);
  const [prnMeds, setPrnMeds] = useState<PrnMedication[]>([]);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [switcherVisible, setSwitcherVisible] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    await topUpAllSchedules(db);
    const today = new Date();
    const [todaysDoses, prn, currentStreak] = await Promise.all([
      getDosesInRange(db, activeProfile.id, startOfDayISO(today), endOfDayISO(today)),
      getPrnMedications(db, activeProfile.id),
      getCurrentStreak(db, activeProfile.id),
    ]);
    setDoses(todaysDoses);
    setPrnMeds(prn);
    setStreak(currentStreak);
  }, [db, activeProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleTaken(dose: DoseWithMedication) {
    await markDoseTaken(db, dose);
    load();
  }

  async function handleSkipped(dose: DoseWithMedication) {
    await markDoseSkipped(db, dose);
    load();
  }

  async function handleSnooze(dose: DoseWithMedication) {
    const newTime = await snoozeDose(db, dose);
    setSnackbarMessage(`Snoozed. We'll remind you again at ${formatTime(newTime.toISOString())}.`);
    load();
  }

  async function handleUndo(dose: DoseWithMedication) {
    await undoDose(db, dose.id);
    load();
  }

  async function handlePrnLog(scheduleId: number) {
    await logPrnDose(db, scheduleId);
    load();
  }

  const pending = doses.filter((d) => d.status === 'pending');
  const done = doses.filter((d) => d.status !== 'pending');

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall" style={styles.headerTitle}>
            Today
          </Text>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString([], {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Menu
            visible={switcherVisible}
            onDismiss={() => setSwitcherVisible(false)}
            anchor={
              <Chip
                icon="account-circle"
                onPress={() => setSwitcherVisible(true)}
                style={styles.profileChip}
              >
                {activeProfile?.name ?? '...'}
              </Chip>
            }
          >
            {profiles.map((p) => (
              <Menu.Item
                key={p.id}
                title={p.name}
                leadingIcon={p.id === activeProfile?.id ? 'check' : undefined}
                onPress={() => {
                  setSwitcherVisible(false);
                  setActiveProfile(p);
                }}
              />
            ))}
            <Divider />
            <Menu.Item
              title="Manage profiles"
              leadingIcon="account-cog-outline"
              onPress={() => {
                setSwitcherVisible(false);
                router.push('/profiles');
              }}
            />
          </Menu>
          {streak > 0 && (
            <Chip icon="fire" style={styles.streakChip}>
              {streak} day{streak === 1 ? '' : 's'}
            </Chip>
          )}
        </View>
      </View>

      {doses.length === 0 && prnMeds.length === 0 && (
        <View style={styles.empty}>
          <Avatar.Icon
            icon="pill"
            size={64}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            color={theme.colors.primary}
          />
          <Text variant="titleMedium" style={styles.emptyTitle}>
            Nothing scheduled today
          </Text>
          <Text style={styles.emptyBody}>Add a medication to start getting reminders.</Text>
          <Button
            mode="contained"
            style={styles.emptyButton}
            onPress={() => router.push('/medications/new')}
          >
            Add a medication
          </Button>
        </View>
      )}

      {pending.length > 0 && (
        <>
          <Text variant="titleSmall" style={styles.sectionLabel}>
            Up next
          </Text>
          {pending.map((dose) => (
            <DoseRow
              key={dose.id}
              dose={dose}
              onTaken={handleTaken}
              onUndo={handleUndo}
              onSkip={handleSkipped}
              onSnooze={handleSnooze}
            />
          ))}
        </>
      )}

      {prnMeds.length > 0 && (
        <>
          <Text variant="titleSmall" style={styles.sectionLabel}>
            As needed
          </Text>
          {prnMeds.map((med) => (
            <Card key={med.id} style={styles.doseCard} mode="elevated">
              <Card.Title
                title={med.name}
                subtitle={med.strength ?? undefined}
                left={(props) => (
                  <Avatar.Icon
                    {...props}
                    icon="pill"
                    size={36}
                    style={{ backgroundColor: theme.colors.primaryContainer }}
                    color={theme.colors.primary}
                  />
                )}
                right={(props) => (
                  <Button
                    {...props}
                    mode="contained-tonal"
                    onPress={() => handlePrnLog(med.schedule_id)}
                    style={styles.prnButton}
                  >
                    Log dose
                  </Button>
                )}
              />
            </Card>
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <Text variant="titleSmall" style={styles.sectionLabel}>
            Done today
          </Text>
          {done.map((dose) => (
            <DoseRow
              key={dose.id}
              dose={dose}
              onTaken={handleTaken}
              onUndo={handleUndo}
              onSkip={handleSkipped}
              onSnooze={handleSnooze}
            />
          ))}
        </>
      )}
      </ScrollView>
      <Snackbar
        visible={!!snackbarMessage}
        onDismiss={() => setSnackbarMessage(null)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flexGrow: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: { fontWeight: '700' },
  headerDate: { opacity: 0.6, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  profileChip: { backgroundColor: theme.colors.surfaceVariant },
  streakChip: { backgroundColor: theme.colors.primaryContainer },
  sectionLabel: { marginTop: 16, marginBottom: 8, fontWeight: '600', opacity: 0.7 },
  doseCard: { marginBottom: 10 },
  doneCard: { opacity: 0.7 },
  doseRowContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  checkboxHit: { padding: 8, marginRight: 4 },
  doseInfo: { flex: 1 },
  doseTitle: { fontWeight: '600' },
  doneText: { textDecorationLine: 'line-through' },
  doseTime: { marginTop: 2, opacity: 0.7 },
  doseFood: { marginTop: 2, fontSize: 12, opacity: 0.6, fontStyle: 'italic' },
  rowActions: { flexDirection: 'row' },
  prnButton: { marginRight: 8 },
  empty: { alignItems: 'center', marginTop: 64, paddingHorizontal: 24 },
  emptyTitle: { marginTop: 16, fontWeight: '600' },
  emptyBody: { marginTop: 8, textAlign: 'center', opacity: 0.7 },
  emptyButton: { marginTop: 20, borderRadius: 12 },
});
