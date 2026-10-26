import type { SQLiteDatabase } from 'expo-sqlite';
import { getDrugInfoCache, upsertDrugInfoCache } from '../db/queries';
import { rewriteDrugSummaryPlainly } from './geminiClient';
import type { DrugSummary } from './drugInfo';

/** Normalizes a drug name into the cache key so "Lisinopril" and "lisinopril " share one entry. */
export function drugCacheKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Returns the AI-simplified drug summary for a drug name, reusing a cached
 * rewrite when one exists so Gemini is only ever called once per unique
 * drug, not once per medication, and not once per screen visit. Falls back
 * to the deterministic FDA excerpt (no AI) if no key is configured, the
 * rewrite fails, or there's nothing to rewrite yet.
 */
export async function getCachedOrAiDrugSummary(
  db: SQLiteDatabase,
  drugName: string,
  fallback: DrugSummary | null
): Promise<DrugSummary | null> {
  if (!fallback) return null;

  const key = drugCacheKey(drugName);
  const cached = await getDrugInfoCache(db, key);
  if (cached) return cached;

  const aiSummary = await rewriteDrugSummaryPlainly(fallback, drugName);
  if (!aiSummary) return fallback;

  await upsertDrugInfoCache(db, key, aiSummary);
  return aiSummary;
}
