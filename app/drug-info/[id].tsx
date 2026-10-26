import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Image } from 'react-native';
import { ActivityIndicator, Text, Card, Avatar } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getMedicationWithSchedule } from '../../db/queries';
import { getCanonicalDrugName } from '../../lib/rxnorm';
import { getDrugSummary, type DrugSummary } from '../../lib/drugInfo';
import { getCachedOrAiDrugSummary } from '../../lib/drugInfoCache';
import { getPubChemCid, getStructureImageUrl } from '../../lib/pubchem';
import { theme } from '../../lib/theme';
import type { MedicationRow } from '../../db/types';

export default function DrugInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const medicationId = Number(id);
  const db = useSQLiteContext();

  const [medication, setMedication] = useState<MedicationRow | null | undefined>(undefined);
  const [summary, setSummary] = useState<DrugSummary | null>(null);
  const [structureUrl, setStructureUrl] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    (async () => {
      const result = await getMedicationWithSchedule(db, medicationId);
      if (!result) {
        setMedication(null);
        return;
      }
      setMedication(result.medication);

      const canonicalName = await getCanonicalDrugName(result.medication.name);
      const searchNames = [result.medication.name, canonicalName ?? ''];

      const [rawSummary, cid] = await Promise.all([
        getDrugSummary(searchNames, result.medication.name),
        getPubChemCid(canonicalName ?? result.medication.name),
      ]);

      const drugSummary = await getCachedOrAiDrugSummary(
        db,
        canonicalName ?? result.medication.name,
        rawSummary
      );

      setSummary(drugSummary);
      setStructureUrl(cid ? getStructureImageUrl(cid) : null);
      setLoadingDetails(false);
    })();
  }, [db, medicationId]);

  if (medication === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (medication === null) {
    return (
      <View style={styles.centered}>
        <Text>Medication not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Avatar.Icon
          icon="pill"
          size={56}
          style={{ backgroundColor: theme.colors.primaryContainer }}
          color={theme.colors.primary}
        />
        <View style={styles.headerText}>
          <Text variant="titleLarge" style={styles.name}>
            {medication.name}
          </Text>
          {!!medication.strength && <Text style={styles.strength}>{medication.strength}</Text>}
        </View>
      </View>

      {loadingDetails && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Looking up FDA label information...</Text>
        </View>
      )}

      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            What it's for
          </Text>
          <Text style={styles.sectionBody}>
            {summary?.whatItsFor ?? (loadingDetails ? 'Loading...' : 'Not available for this medication.')}
          </Text>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Common side effects
          </Text>
          <Text style={styles.sectionBody}>
            {summary?.sideEffects ?? (loadingDetails ? 'Loading...' : 'Not available for this medication.')}
          </Text>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Dosage and timing notes
          </Text>
          <Text style={styles.sectionBody}>
            {summary?.dosageNotes ?? (loadingDetails ? 'Loading...' : 'Not available for this medication.')}
          </Text>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Molecular structure
          </Text>
          {structureUrl ? (
            <View style={styles.structureBox}>
              <Image source={{ uri: structureUrl }} style={styles.structureImage} resizeMode="contain" />
              <Text style={styles.structureCaption}>Source: PubChem (National Institutes of Health)</Text>
            </View>
          ) : (
            <Text style={styles.sectionBody}>
              {loadingDetails ? 'Loading...' : 'Structure diagram not available for this medication.'}
            </Text>
          )}
        </Card.Content>
      </Card>

      <Text style={styles.disclaimer}>
        From FDA drug labeling data and PubChem. Not medical advice, always check with your
        pharmacist or doctor.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flexGrow: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  headerText: { flex: 1 },
  name: { fontWeight: '700' },
  strength: { opacity: 0.7, marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  loadingText: { opacity: 0.7 },
  card: { marginBottom: 12 },
  sectionTitle: { fontWeight: '600', marginBottom: 8 },
  sectionBody: { lineHeight: 20, opacity: 0.9 },
  structureBox: { alignItems: 'center' },
  structureImage: { width: 260, height: 260, backgroundColor: '#FFFFFF', borderRadius: 8 },
  structureCaption: { fontSize: 11, opacity: 0.6, marginTop: 8 },
  disclaimer: { fontSize: 11, opacity: 0.6, marginTop: 4, marginBottom: 24, lineHeight: 16 },
});
