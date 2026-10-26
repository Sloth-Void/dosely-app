import type { SQLiteDatabase } from 'expo-sqlite';
import { getAllMedications, upsertInteraction, clearInteraction } from '../db/queries';
import { getCanonicalDrugName } from './rxnorm';
import { getInteractionLabelText } from './openFda';
import { simplifyExcerpt } from './simplifyText';
import { rewriteExcerptPlainly } from './geminiClient';
import type { InteractionSeverity, MedicationRow } from '../db/types';

const CONTRAINDICATED_PATTERNS = [
  'contraindicat',
  'should not be used',
  'should not be co-administered',
  'should not be coadministered',
  'avoid concomitant',
  'avoid concurrent',
  'do not use together',
  'must not be used',
  'concurrent use is not recommended',
];

const MAJOR_PATTERNS = [
  'increase the risk',
  'increased risk',
  'may increase',
  'may enhance',
  'may reduce',
  'may decrease',
  'monitor',
  'caution',
  'adjust the dose',
  'adjust dose',
  'closely monitor',
];

// Words that suggest a chunk is actually explaining something, not just
// listing drug names or captioning a table.
const EXPLANATORY_SIGNALS = [
  'may',
  'can',
  'increase',
  'decrease',
  'risk',
  'affect',
  'effect',
  'interact',
  'reduce',
  'enhance',
  'monitor',
  'caution',
  'should',
  'bleeding',
  'toxicity',
];

const MAX_EXCERPT_LENGTH = 400;

/** Deterministic, source-grounded severity: never invented, just pattern-matched on real label text. */
export function classifySeverity(text: string): InteractionSeverity {
  const lower = text.toLowerCase();
  if (CONTRAINDICATED_PATTERNS.some((p) => lower.includes(p))) return 'contraindicated';
  if (MAJOR_PATTERNS.some((p) => lower.includes(p))) return 'major';
  return 'minor';
}

function splitIntoChunks(paragraph: string): string[] {
  return paragraph.includes('•')
    ? paragraph.split('•').map((c) => c.trim()).filter(Boolean)
    : paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
}

function trimExcerpt(chunk: string): string {
  return chunk.length > MAX_EXCERPT_LENGTH
    ? `${chunk.slice(0, MAX_EXCERPT_LENGTH).trim()}…`
    : chunk.trim();
}

/** "Table 3: Drugs that..." captions are never useful shown on their own. */
function isTableHeading(chunk: string): boolean {
  return /^table\s*\d/i.test(chunk.trim());
}

/** Heuristic for "this is a comma-dumped list of drug names", not a sentence explaining anything. */
function looksLikeList(chunk: string): boolean {
  const commaCount = (chunk.match(/,/g) || []).length;
  if (commaCount < 4) return false;
  const lower = chunk.toLowerCase();
  return !EXPLANATORY_SIGNALS.some((w) => lower.includes(w));
}

/**
 * Splits label text into bullet/sentence chunks and returns the first one
 * mentioning any search term, used to confirm a mention exists at all (and
 * to classify severity), even if the chunk itself turns out to be a messy
 * table caption or drug-name list.
 */
export function extractMention(paragraphs: string[], searchTerms: string[]): string | null {
  const terms = searchTerms.filter(Boolean).map((t) => t.toLowerCase());
  if (terms.length === 0) return null;

  for (const paragraph of paragraphs) {
    for (const chunk of splitIntoChunks(paragraph)) {
      const lower = chunk.toLowerCase();
      if (terms.some((t) => lower.includes(t))) {
        return trimExcerpt(chunk);
      }
    }
  }

  return null;
}

/**
 * Same search, but skips table captions and comma-dumped drug-name lists;
 * only returns something worth showing a user as an explanation.
 */
export function extractCleanMention(paragraphs: string[], searchTerms: string[]): string | null {
  const terms = searchTerms.filter(Boolean).map((t) => t.toLowerCase());
  if (terms.length === 0) return null;

  for (const paragraph of paragraphs) {
    for (const chunk of splitIntoChunks(paragraph)) {
      const lower = chunk.toLowerCase();
      if (!terms.some((t) => lower.includes(t))) continue;
      if (isTableHeading(chunk)) continue;
      if (looksLikeList(chunk)) continue;
      return trimExcerpt(chunk);
    }
  }

  return null;
}

/** Used when a real mention was found but it was only a table caption or drug list; never leaves the user with raw jargon. */
function genericFallbackMessage(
  nameA: string,
  nameB: string,
  severity: InteractionSeverity
): string {
  switch (severity) {
    case 'contraindicated':
      return `${nameA} and ${nameB} are flagged in the FDA label as a combination to avoid. Talk to your pharmacist or doctor before taking them together.`;
    case 'major':
      return `${nameA} and ${nameB} are noted in the FDA label as needing extra caution together. Ask your pharmacist or doctor about combining them.`;
    default:
      return `${nameA} and ${nameB} are mentioned together in the FDA label. Ask your pharmacist or doctor for details.`;
  }
}

interface MedicationLabelInfo {
  canonicalName: string | null;
  interactionText: string[];
}

async function loadLabelInfo(medication: MedicationRow): Promise<MedicationLabelInfo> {
  const canonicalName = await getCanonicalDrugName(medication.name);
  const interactionText = await getInteractionLabelText([medication.name, canonicalName ?? '']);
  return { canonicalName, interactionText };
}

/**
 * Checks every pair of the profile's medications for a mention of one in the
 * other's FDA label "Drug Interactions" section. Grounded entirely in real
 * label text: no AI, no invented findings. Caches results in the
 * `interactions` table; call again after adding/editing a medication to
 * refresh.
 */
export async function checkInteractionsForProfile(
  db: SQLiteDatabase,
  profileId: number
): Promise<void> {
  const medications = (await getAllMedications(db, profileId)).map((m) => m.medication);

  // Load every medication's label info concurrently; these are independent
  // lookups, and running them one-at-a-time was the main source of the long
  // wait on a profile with several medications.
  const labelInfoEntries = await Promise.all(
    medications.map(async (medication): Promise<[number, MedicationLabelInfo]> => [
      medication.id,
      await loadLabelInfo(medication),
    ])
  );
  const labelInfo = new Map(labelInfoEntries);

  const pairs: [MedicationRow, MedicationRow][] = [];
  for (let i = 0; i < medications.length; i++) {
    for (let j = i + 1; j < medications.length; j++) {
      pairs.push([medications[i], medications[j]]);
    }
  }

  // Unlike the label lookups above, the AI rewrite step must run one pair at
  // a time: Gemini's free tier caps out around 15 requests/minute, and
  // firing every pair's call at once reliably tripped that limit, silently
  // leaving those pairs on the deterministic fallback text. A Promise.all
  // here also meant one pair throwing could abort updates for every other
  // pair; a plain loop keeps each pair independent.
  for (const [medA, medB] of pairs) {
    try {
      const infoA = labelInfo.get(medA.id)!;
      const infoB = labelInfo.get(medB.id)!;
      const termsForA = [medB.name, infoB.canonicalName ?? ''];
      const termsForB = [medA.name, infoA.canonicalName ?? ''];

      const rawMention =
        extractMention(infoA.interactionText, termsForA) ??
        extractMention(infoB.interactionText, termsForB);

      if (!rawMention) {
        await clearInteraction(db, medA.id, medB.id);
        continue;
      }

      const severity = classifySeverity(rawMention);
      const cleanMention =
        extractCleanMention(infoA.interactionText, termsForA) ??
        extractCleanMention(infoB.interactionText, termsForB);

      // Prefer a real AI rewrite of the confirmed match when a free Gemini
      // key is configured; otherwise fall back to the deterministic cleanup,
      // and finally to a short honest template. The AI only rephrases a
      // match we already confirmed by string search; it never decides
      // whether an interaction exists.
      const aiRewrite = await rewriteExcerptPlainly(
        cleanMention ?? rawMention,
        medA.name,
        medB.name
      );

      const excerpt =
        aiRewrite ??
        (cleanMention
          ? simplifyExcerpt(cleanMention, [medA.name, medB.name])
          : genericFallbackMessage(medA.name, medB.name, severity));

      await upsertInteraction(db, profileId, medA.id, medB.id, severity, excerpt);
    } catch (err) {
      // One pair's failure (network hiccup, unexpected label shape) should
      // never block the rest of the profile's pairs from updating.
      console.warn('[interactions] failed to check pair', medA.name, medB.name, err);
    }
  }
}
