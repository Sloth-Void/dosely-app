import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { TextInput, Text, Button, Chip, HelperText, Icon } from 'react-native-paper';
import type { ProfileRelationship } from '../db/types';
import type { ProfileInput } from '../db/queries';
import { theme } from '../lib/theme';

const RELATIONSHIPS: { value: ProfileRelationship; label: string }[] = [
  { value: 'self', label: 'Self' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'pet', label: 'Pet' },
  { value: 'other', label: 'Other' },
];

const COLOR_OPTIONS = [
  '#2F6F5E',
  '#3B6FA0',
  '#8E5DB0',
  '#C77B2E',
  '#B0507A',
  '#B3261E',
  '#4C8C4A',
  '#7A5C42',
];

interface ProfileFormProps {
  initialValues?: ProfileInput;
  onSubmit: (input: ProfileInput) => Promise<void>;
  submitLabel: string;
}

export default function ProfileForm({ initialValues, onSubmit, submitLabel }: ProfileFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [relationship, setRelationship] = useState<ProfileRelationship>(
    initialValues?.relationship ?? 'self'
  );
  const [color, setColor] = useState(initialValues?.color ?? COLOR_OPTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), relationship, color });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <TextInput label="Name" value={name} onChangeText={setName} mode="outlined" />

      <Text variant="titleSmall" style={styles.sectionLabel}>
        Relationship
      </Text>
      <View style={styles.chipRow}>
        {RELATIONSHIPS.map((r) => {
          const isSelected = relationship === r.value;
          return (
            <Chip
              key={r.value}
              selected={isSelected}
              onPress={() => setRelationship(r.value)}
              style={[styles.chip, isSelected && styles.chipSelected]}
              textStyle={isSelected ? styles.chipSelectedText : undefined}
              showSelectedCheck={false}
            >
              {r.label}
            </Chip>
          );
        })}
      </View>

      <Text variant="titleSmall" style={styles.sectionLabel}>
        Color
      </Text>
      <View style={styles.colorRow}>
        {COLOR_OPTIONS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} style={styles.colorSwatchHit}>
            <View style={[styles.colorSwatch, { backgroundColor: c }]}>
              {color === c && <Icon source="check" size={18} color="#FFFFFF" />}
            </View>
          </Pressable>
        ))}
      </View>

      <HelperText type="error" visible={!!error} style={styles.errorText}>
        {error}
      </HelperText>

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={saving}
        disabled={saving}
        style={styles.submit}
        contentStyle={styles.submitContent}
      >
        {submitLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  sectionLabel: { marginTop: 20, marginBottom: 8, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 4 },
  chipSelected: { backgroundColor: theme.colors.primary },
  chipSelectedText: { color: theme.colors.onPrimary, fontWeight: '700' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorSwatchHit: { padding: 2 },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { marginTop: -8 },
  submit: { marginTop: 24, borderRadius: 12 },
  submitContent: { paddingVertical: 6 },
});
