import { fetchWithTimeout } from './fetchWithTimeout';
import { simplifyExcerpt } from './simplifyText';
import type { FoodPreference } from '../db/types';

export interface DrugSummary {
  whatItsFor: string | null;
  sideEffects: string | null;
  dosageNotes: string | null;
}

interface OpenFdaLabelResult {
  indications_and_usage?: string[];
  adverse_reactions?: string[];
  dosage_and_administration?: string[];
  openfda?: { route?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

async function fetchLabelByName(name: string): Promise<OpenFdaLabelResult | null> {
  try {
    const term = encodeURIComponent(name);
    const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${term}"+OR+openfda.brand_name:"${term}"&limit=1`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;

    const data = await res.json();
    return data?.results?.[0] ?? null;
  } catch {
    return null;
  }
}

const MAX_SECTION_LENGTH = 350;

/** Strips a leading section heading like "1 INDICATIONS AND USAGE" and keeps just the first couple of sentences. */
function summarizeSection(raw: string, properName: string): string {
  const withoutHeading = raw.replace(/^\s*\d+(\.\d+)*\s+[A-Z][A-Z0-9 ,()/&-]{3,}\s+/, '');
  const sentences = withoutHeading.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstFew = sentences.slice(0, 2).join(' ');
  const cleaned = simplifyExcerpt(firstFew, [properName]);
  return cleaned.length > MAX_SECTION_LENGTH
    ? `${cleaned.slice(0, MAX_SECTION_LENGTH).trim()}…`
    : cleaned;
}

function summarizeField(field: string[] | undefined, properName: string): string | null {
  const first = field?.[0];
  return first ? summarizeSection(first, properName) : null;
}

/**
 * Pulls "what it's for", common side effects, and dosage/timing notes from
 * the medication's real FDA label. Same free openFDA source and cleanup
 * pass as the interaction checker: no AI, purely factual excerpts.
 */
export async function getDrugSummary(
  candidateNames: string[],
  properName: string
): Promise<DrugSummary | null> {
  const names = Array.from(new Set(candidateNames.filter(Boolean)));

  for (const name of names) {
    const result = await fetchLabelByName(name);
    if (result) {
      return {
        whatItsFor: summarizeField(result.indications_and_usage, properName),
        sideEffects: summarizeField(result.adverse_reactions, properName),
        dosageNotes: summarizeField(result.dosage_and_administration, properName),
      };
    }
  }

  return null;
}

const EMPTY_STOMACH_PATTERNS = [
  /on an empty stomach/i,
  /at least (one|1) hour before or (two|2) hours after (a meal|meals|eating)/i,
  /(30|thirty|60|sixty) minutes before (a meal|meals|eating)/i,
  /without food/i,
];

const WITH_FOOD_PATTERNS = [
  /with food/i,
  /with a meal/i,
  /with meals/i,
  /after (a meal|meals|eating)/i,
  /with milk/i,
];

/** Looks for plain food-timing instructions in a label excerpt, e.g. dosage_and_administration text. */
export function detectFoodPreference(text: string): FoodPreference | null {
  if (EMPTY_STOMACH_PATTERNS.some((pattern) => pattern.test(text))) return 'empty_stomach';
  if (WITH_FOOD_PATTERNS.some((pattern) => pattern.test(text))) return 'with_food';
  return null;
}

/** openFDA's `openfda.route` is a controlled vocabulary (usually all-caps), not prose worth showing raw. */
const ROUTE_LABELS: Record<string, string> = {
  ORAL: 'By mouth',
  TOPICAL: 'Apply to skin',
  SUBCUTANEOUS: 'Subcutaneous injection',
  INTRAMUSCULAR: 'Intramuscular injection',
  INTRAVENOUS: 'Intravenous',
  OPHTHALMIC: 'Eye drops',
  OTIC: 'Ear drops',
  NASAL: 'Nasal spray',
  RECTAL: 'Rectal',
  SUBLINGUAL: 'Under the tongue',
  INHALATION: 'Inhaled',
  TRANSDERMAL: 'Transdermal patch',
  VAGINAL: 'Vaginal',
};

function labelRoute(raw: string | undefined): string | null {
  return raw ? ROUTE_LABELS[raw.toUpperCase()] ?? null : null;
}

// Ordered most-specific-first so "every 4 to 6 hours" doesn't fall through to
// a looser pattern before it gets a chance to match.
const FREQUENCY_PATTERNS: [RegExp, string][] = [
  [/every\s+(4|four)\s+to\s+(6|six)\s+hours/i, 'Every 4 to 6 hours'],
  [/every\s+(6|six)\s+to\s+(8|eight)\s+hours/i, 'Every 6 to 8 hours'],
  [/every\s+(4|four)\s+hours/i, 'Every 4 hours'],
  [/every\s+(6|six)\s+hours/i, 'Every 6 hours'],
  [/every\s+(8|eight)\s+hours/i, 'Every 8 hours'],
  [/every\s+(12|twelve)\s+hours/i, 'Every 12 hours'],
  [/every\s+(24|twenty-four)\s+hours/i, 'Every 24 hours'],
  [/once\s+(a|per)\s+day|once\s+daily|one\s+time\s+(a|per)\s+day/i, 'Once daily'],
  [/twice\s+(a|per)\s+day|twice\s+daily|two\s+times\s+(a|per)\s+day/i, 'Twice daily'],
  [/three\s+times\s+(a|per)\s+day|three\s+times\s+daily/i, 'Three times daily'],
  [/four\s+times\s+(a|per)\s+day|four\s+times\s+daily/i, 'Four times daily'],
  [/as\s+needed/i, 'As needed'],
];

function detectFrequency(text: string): string | null {
  const match = FREQUENCY_PATTERNS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : null;
}

export interface DosageGuidance {
  foodPreference: FoodPreference | null;
  route: string | null;
  frequency: string | null;
}

/**
 * Pulls food timing, route, and dosing frequency straight out of openFDA's
 * structured/label data for one medication, used to prefill the "add
 * medication" form. Every field here is either a controlled-vocabulary value
 * (route) or a plain pattern match against real label text (food, frequency);
 * never an AI guess, since dosing facts are the last place to invent
 * something. Returns null if no label is found for any candidate name.
 */
export async function suggestDosageGuidance(
  candidateNames: string[]
): Promise<DosageGuidance | null> {
  const names = Array.from(new Set(candidateNames.filter(Boolean)));

  for (const name of names) {
    const result = await fetchLabelByName(name);
    if (!result) continue;

    const dosageText = result.dosage_and_administration?.[0] ?? '';
    return {
      foodPreference: dosageText ? detectFoodPreference(dosageText) : null,
      route: labelRoute(result.openfda?.route?.[0]),
      frequency: dosageText ? detectFrequency(dosageText) : null,
    };
  }

  return null;
}
