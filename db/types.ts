export type ProfileRelationship = 'self' | 'child' | 'parent' | 'pet' | 'other';

export interface ProfileRow {
  id: number;
  name: string;
  relationship: ProfileRelationship;
  color: string;
  created_at: string;
}

export interface MedicationRow {
  id: number;
  profile_id: number;
  name: string;
  strength: string | null;
  form: string | null;
  notes: string | null;
  is_prn: number;
  created_at: string;
}

export type FoodPreference = 'none' | 'with_food' | 'empty_stomach';

export interface ScheduleRow {
  id: number;
  medication_id: number;
  times: string; // JSON string[] like ["08:00", "20:00"]
  days_of_week: string | null; // JSON number[] (0=Sun..6=Sat), null = every day
  food_preference: FoodPreference;
}

export interface DoseRow {
  id: number;
  schedule_id: number;
  due_at: string; // ISO datetime
  status: 'pending' | 'taken' | 'skipped' | 'snoozed';
  notification_id: string | null;
  followup_notification_id: string | null;
}

export interface LogRow {
  id: number;
  dose_id: number;
  action: 'taken' | 'skipped' | 'snoozed';
  timestamp: string;
  note: string | null;
}

export interface MedicationWithSchedule {
  medication: MedicationRow;
  schedule: ScheduleRow | null;
}

export interface DoseWithMedication {
  id: number;
  schedule_id: number;
  due_at: string;
  status: DoseRow['status'];
  notification_id: string | null;
  followup_notification_id: string | null;
  medication_id: number;
  medication_name: string;
  medication_strength: string | null;
  food_preference: FoodPreference;
  profile_name: string;
  profile_relationship: ProfileRelationship;
}

export interface PrnMedication extends MedicationRow {
  schedule_id: number;
}

export type InteractionSeverity = 'contraindicated' | 'major' | 'minor';

export interface InteractionRow {
  id: number;
  profile_id: number;
  medication_a_id: number;
  medication_b_id: number;
  severity: InteractionSeverity;
  excerpt: string;
  source: string;
  checked_at: string;
}

export interface InteractionWithMedications extends InteractionRow {
  medication_a_name: string;
  medication_b_name: string;
}

export interface DrugInfoCacheRow {
  drug_key: string;
  what_its_for: string | null;
  side_effects: string | null;
  dosage_notes: string | null;
  checked_at: string;
}

export interface MedicationFormInput {
  name: string;
  strength: string;
  form: string;
  notes: string;
  isPrn: boolean;
  times: string[];
  daysOfWeek: number[] | null;
  foodPreference: FoodPreference;
}
