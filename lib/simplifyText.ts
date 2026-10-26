// Free, deterministic plain-language pass over FDA label text, no AI call.
// Order matters: longer/more-specific phrases first so they match before a
// shorter substring of themselves would.
const REPLACEMENTS: [RegExp, string][] = [
  [/\bconcomitant(ly)?\b/gi, 'at the same time'],
  [/\bco-?administration\b/gi, 'taking them together'],
  [/\bco-?administered\b/gi, 'taken together'],
  [/\bcontraindicated\b/gi, 'should not be combined'],
  [/\brhabdomyolysis\b/gi, 'serious muscle breakdown'],
  [/\bmyopathy\b/gi, 'muscle damage'],
  [/\bhepatotoxicity\b/gi, 'liver damage'],
  [/\bnephrotoxicity\b/gi, 'kidney damage'],
  [/\bhypotension\b/gi, 'low blood pressure'],
  [/\bhypertension\b/gi, 'high blood pressure'],
  [/\bplasma concentrations?\b/gi, 'levels in the blood'],
  [/\bplasma levels?\b/gi, 'levels in the blood'],
  [/\badverse reactions?\b/gi, 'side effects'],
  [/\bclinically significant\b/gi, 'medically important'],
  [/\bpotentiate[sd]?\b/gi, 'increase the effect of'],
  [/\bexacerbate[sd]?\b/gi, 'make worse'],
  [/\befficacy\b/gi, 'effectiveness'],
  [/\badminister(ed|ing)?\b/gi, 'take'],
];

/** Strips citation-style references like "[see Warnings (5.1)]" or trailing "(2.5, 7.1)". */
function stripCitations(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\(\s*\d+(\.\d+)?(\s*,\s*\d+(\.\d+)?)*\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function applyReplacements(text: string): string {
  return REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

/** Replaces ALL-CAPS shouting of a drug's own name with its normal-cased form, e.g. "LIPITOR" -> "Lipitor". */
function normalizeDrugNameCasing(text: string, properNames: string[]): string {
  return properNames.reduce((acc, name) => {
    if (!name) return acc;
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    return acc.replace(pattern, name);
  }, text);
}

/** Turns a raw FDA label excerpt into something closer to plain English, without any AI call. */
export function simplifyExcerpt(text: string, properNames: string[] = []): string {
  const withoutCitations = stripCitations(text);
  const withPlainTerms = applyReplacements(withoutCitations);
  const withNormalCasing = normalizeDrugNameCasing(withPlainTerms, properNames);
  return withNormalCasing.replace(/\s{2,}/g, ' ').trim();
}
