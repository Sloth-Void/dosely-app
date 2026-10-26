import { useCallback, useState } from 'react';
import { View, StyleSheet, SectionList } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getPastDoses } from '../../db/queries';
import { useActiveProfile } from '../../lib/profileContext';
import { theme } from '../../lib/theme';
import type { DoseWithMedication } from '../../db/types';

function dateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const STATUS_COLORS: Record<string, string> = {
  taken: theme.colors.primary,
  skipped: theme.colors.error,
  snoozed: theme.colors.secondary,
};

interface Section {
  title: string;
  data: DoseWithMedication[];
}

export default function History() {
  const db = useSQLiteContext();
  const { activeProfile } = useActiveProfile();
  const [sections, setSections] = useState<Section[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    const past = await getPastDoses(db, activeProfile.id, new Date().toISOString());
    const grouped = new Map<string, DoseWithMedication[]>();
    for (const dose of past) {
      const label = dateLabel(dose.due_at);
      if (!grouped.has(label)) grouped.set(label, []);
      grouped.get(label)!.push(dose);
    }
    setSections(Array.from(grouped.entries()).map(([title, data]) => ({ title, data })));
    setLoaded(true);
  }, [db, activeProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SectionList
      contentContainerStyle={styles.container}
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={
        loaded ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No history yet. Logged doses will show up here.
            </Text>
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) => (
        <Text variant="titleSmall" style={styles.sectionHeader}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.medName}>
              {item.medication_name}
              {item.medication_strength ? ` · ${item.medication_strength}` : ''}
            </Text>
            <Text style={styles.time}>{formatTime(item.due_at)}</Text>
          </View>
          <Chip
            style={{
              backgroundColor: `${STATUS_COLORS[item.status] ?? theme.colors.secondary}22`,
            }}
            textStyle={{
              color: STATUS_COLORS[item.status] ?? theme.colors.secondary,
              fontWeight: '600',
            }}
          >
            {item.status}
          </Chip>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flexGrow: 1 },
  sectionHeader: { fontWeight: '700', marginTop: 16, marginBottom: 8, opacity: 0.7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#0000001A',
  },
  rowText: { flex: 1 },
  medName: { fontWeight: '600' },
  time: { opacity: 0.6, marginTop: 2 },
  empty: { marginTop: 64, alignItems: 'center', paddingHorizontal: 24 },
  emptyText: { textAlign: 'center', opacity: 0.6 },
});
