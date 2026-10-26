import { fetchWithTimeout } from './fetchWithTimeout';
import type { DrugSummary } from './drugInfo';

// Google Gemini's free tier (no credit card, no billing account), used as an
// optional upgrade over the deterministic text cleanup in interactionEngine.ts.
// If no key is configured, callers should fall back gracefully; this never throws.
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const MODEL = 'gemini-3.6-flash';

export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Rewrites an already-confirmed FDA label excerpt into 1-2 plain-English
 * sentences. The AI only rephrases text we already found via a real string
 * match; it never decides whether an interaction exists.
 *
 * Deliberately a single request, one model, no retry, no fallback chain:
 * the free tier caps out around 15 requests/minute, and a profile's
 * interaction check already sends one of these per medication pair, for a
 * handful of medications that's already close to the limit on its own.
 * Retrying or trying a second model per pair multiplies that several times
 * over and was making failures worse, not better. If this one call fails,
 * the caller falls back to the deterministic cleanup. That's fine.
 */
export async function rewriteExcerptPlainly(
  rawExcerpt: string,
  medicationA: string,
  medicationB: string
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const prompt = `Simplify this message so it's more understandable to the everyday reader. It's about the interaction between ${medicationA} and ${medicationB}. Do not use em dashes. Keep it to 1-2 sentences and don't add anything not already in the text.

"${rawExcerpt}"`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          // This is a one-sentence rewrite of text we already found, not a
          // task that benefits from extended reasoning: "minimal" skips the
          // model's default reasoning pass, which otherwise adds real
          // latency (hundreds of hidden "thinking" tokens) for no benefit.
          generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } },
        }),
      },
      10000
    );
    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Rewrites all three drug-info sections (what it's for, side effects, dosage
 * notes) in a single request instead of three. This is called once per
 * unique drug name ever (results are cached in SQLite by the caller), so
 * unlike the interaction checker there's no per-pair multiplication to worry
 * about, but there's no reason to spend 3 free-tier requests when 1 will do.
 *
 * Same ground rules as rewriteExcerptPlainly: only rephrases text we already
 * pulled from a real FDA label, one request, no retry, falls back to the
 * deterministic excerpts on any failure.
 */
export async function rewriteDrugSummaryPlainly(
  summary: DrugSummary,
  drugName: string
): Promise<DrugSummary | null> {
  if (!GEMINI_API_KEY) return null;
  if (!summary.whatItsFor && !summary.sideEffects && !summary.dosageNotes) return null;

  const prompt = `Simplify each of these FDA label excerpts about ${drugName} so they're more understandable to the everyday reader. Do not use em dashes. Keep each to 1-2 sentences and don't add anything not already in the text. If an excerpt is empty, return an empty string for it.

Respond with ONLY strict JSON, no markdown fences, in exactly this shape:
{"whatItsFor": "...", "sideEffects": "...", "dosageNotes": "..."}

whatItsFor: "${summary.whatItsFor ?? ''}"
sideEffects: "${summary.sideEffects ?? ''}"
dosageNotes: "${summary.dosageNotes ?? ''}"`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'minimal' },
            responseMimeType: 'application/json',
          },
        }),
      },
      10000
    );
    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') return null;

    const parsed = JSON.parse(text);
    return {
      whatItsFor: typeof parsed.whatItsFor === 'string' && parsed.whatItsFor.trim() ? parsed.whatItsFor.trim() : summary.whatItsFor,
      sideEffects: typeof parsed.sideEffects === 'string' && parsed.sideEffects.trim() ? parsed.sideEffects.trim() : summary.sideEffects,
      dosageNotes: typeof parsed.dosageNotes === 'string' && parsed.dosageNotes.trim() ? parsed.dosageNotes.trim() : summary.dosageNotes,
    };
  } catch {
    return null;
  }
}
