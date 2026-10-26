import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  TextInput,
  Switch,
  Text,
  Button,
  Chip,
  SegmentedButtons,
  Surface,
  HelperText,
  Icon,
} from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { FoodPreference, MedicationFormInput } from '../db/types';
import { getCanonicalDrugName } from '../lib/rxnorm';
import { suggestDosageGuidance } from '../lib/drugInfo';
import { theme } from '../lib/theme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function dateToTimeString(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Icon source={icon} size={18} color={theme.colors.primary} />
      <Text variant="titleSmall" style={styles.sectionLabelText}>
        {label}
      </Text>
    </View>
  );
}

interface MedicationFormProps {
  initialValues?: MedicationFormInput;
  onSubmit: (input: MedicationFormInput) => Promise<void>;
  submitLabel: string;
}

export default function MedicationForm({
  initialValues,
  onSubmit,
  submitLabel,
}: MedicationFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [strength, setStrength] = useState(initialValues?.strength ?? '');
  const [form, setForm] = useState(initialValues?.form ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [isPrn, setIsPrn] = useState(initialValues?.isPrn ?? false);
  const [times, setTimes] = useState<string[]>(initialValues?.times ?? ['08:00']);
  const [selectedDays, setSelectedDays] = useState<number[]>(
    initialValues?.daysOfWeek ?? ALL_DAYS
  );
  const [foodPreference, setFoodPreference] = useState<FoodPreference>(
    initialValues?.foodPreference ?? 'none'
  );
  // Editing an existing medication starts "touched" so a name-field blur
  // doesn't clobber a value the user already chose (or deliberately left as
  // no preference). New medications start untouched so the first blur can
  // auto-suggest from the FDA label.
  const [foodPreferenceTouched, setFoodPreferenceTouched] = useState(!!initialValues);
  const [suggestingInfo, setSuggestingInfo] = useState(false);
  const [suggestedNotes, setSuggestedNotes] = useState<string[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingTime, setPendingTime] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleNameBlur() {
    if (!name.trim()) return;
    setSuggestingInfo(true);
    try {
      const canonicalName = await getCanonicalDrugName(name.trim());
      const guidance = await suggestDosageGuidance([name.trim(), canonicalName ?? '']);
      if (!guidance) return;

      if (!isPrn && guidance.foodPreference && !foodPreferenceTouched) {
        setFoodPreference(guidance.foodPreference);
      }

      const suggestions = [guidance.route, guidance.frequency].filter(
        (note): note is string => !!note && !notes.includes(note)
      );
      setSuggestedNotes(suggestions);
    } finally {
      setSuggestingInfo(false);
    }
  }

  function addSuggestedNote(note: string) {
    setNotes((prev) => (prev.trim() ? `${prev.trim()}\n${note}` : note));
    setSuggestedNotes((prev) => prev.filter((n) => n !== note));
  }

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function removeTime(time: string) {
    setTimes((prev) => prev.filter((t) => t !== time));
  }

  function confirmAddTime() {
    const timeString = dateToTimeString(pendingTime);
    setTimes((prev) => (prev.includes(timeString) ? prev : [...prev, timeString].sort()));
    setPickerVisible(false);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Medication name is required.');
      return;
    }
    if (!isPrn && times.length === 0) {
      setError('Add at least one time, or mark this as taken as needed.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        strength: strength.trim(),
        form: form.trim(),
        notes: notes.trim(),
        isPrn,
        times,
        daysOfWeek: selectedDays.length === 7 ? null : selectedDays,
        foodPreference,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Surface style={[styles.surface, styles.sectionSurface]} elevation={0}>
        <TextInput
          label="Medication name"
          value={name}
          onChangeText={setName}
          onBlur={handleNameBlur}
          mode="outlined"
        />
        <TextInput
          label="Strength (e.g. 20mg)"
          value={strength}
          onChangeText={setStrength}
          mode="outlined"
          style={styles.field}
        />
        <TextInput
          label="Form (e.g. tablet, capsule)"
          value={form}
          onChangeText={setForm}
          mode="outlined"
          style={styles.field}
        />

        <View style={[styles.row, styles.field]}>
          <Text variant="bodyLarge">Take as needed (PRN)</Text>
          <Switch value={isPrn} onValueChange={setIsPrn} color={theme.colors.primary} />
        </View>
      </Surface>

      {!isPrn && (
        <Surface style={[styles.surface, styles.sectionSurface]} elevation={0}>
          <SectionLabel icon="clock-outline" label="Times" />
          <View style={styles.chipRow}>
            {times.map((time) => (
              <Chip
                key={time}
                icon="clock-outline"
                onClose={() => removeTime(time)}
                style={styles.chip}
              >
                {formatTime12h(time)}
              </Chip>
            ))}
          </View>
          <Button
            mode="outlined"
            icon="plus"
            onPress={() => setPickerVisible(true)}
            style={styles.field}
          >
            Add time
          </Button>
          {pickerVisible && (
            <View style={styles.pickerBox}>
              <DateTimePicker
                value={pendingTime}
                mode="time"
                display="spinner"
                onValueChange={(_, date) => setPendingTime(date)}
                onDismiss={() => setPickerVisible(false)}
              />
              <View style={styles.row}>
                <Button onPress={() => setPickerVisible(false)}>Cancel</Button>
                <Button mode="contained" onPress={confirmAddTime}>
                  Add
                </Button>
              </View>
            </View>
          )}

          <SectionLabel icon="calendar-week" label="Days" />
          <View style={styles.chipRow}>
            {DAY_LABELS.map((label, day) => {
              const isSelected = selectedDays.includes(day);
              return (
                <Chip
                  key={day}
                  selected={isSelected}
                  onPress={() => toggleDay(day)}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  textStyle={isSelected ? styles.chipSelectedText : undefined}
                  showSelectedCheck={false}
                >
                  {label}
                </Chip>
              );
            })}
          </View>

          <SectionLabel icon="food-apple-outline" label="Food timing" />
          <SegmentedButtons
            value={foodPreference}
            onValueChange={(v) => {
              setFoodPreferenceTouched(true);
              setFoodPreference(v as FoodPreference);
            }}
            buttons={[
              { value: 'none', label: 'No pref.' },
              { value: 'with_food', label: 'With food' },
              { value: 'empty_stomach', label: 'Empty stomach' },
            ]}
            style={styles.field}
          />
          {suggestingInfo && (
            <Text style={styles.foodSuggestHint}>Checking the FDA label...</Text>
          )}
        </Surface>
      )}

      <Surface style={[styles.surface, styles.sectionSurface]} elevation={0}>
        <TextInput
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          multiline
          numberOfLines={3}
        />
        {suggestedNotes.length > 0 && (
          <>
            <Text style={styles.foodSuggestHint}>From the FDA label (tap to add):</Text>
            <View style={[styles.chipRow, styles.field]}>
              {suggestedNotes.map((note) => (
                <Chip
                  key={note}
                  icon="plus"
                  onPress={() => addSuggestedNote(note)}
                  style={styles.chip}
                >
                  {note}
                </Chip>
              ))}
            </View>
          </>
        )}
      </Surface>

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
  container: { gap: 16 },
  surface: { backgroundColor: 'transparent' },
  sectionSurface: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  field: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionLabelText: { fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 4 },
  chipSelected: { backgroundColor: theme.colors.primary },
  chipSelectedText: { color: theme.colors.onPrimary, fontWeight: '700' },
  pickerBox: { marginTop: 8 },
  foodSuggestHint: { marginTop: 6, fontSize: 12, opacity: 0.6, fontStyle: 'italic' },
  errorText: { marginTop: -8 },
  submit: { marginTop: 8, marginBottom: 40, borderRadius: 12 },
  submitContent: { paddingVertical: 6 },
});
