import { fetchWithTimeout } from './fetchWithTimeout';

interface ApproximateCandidate {
  rxcui: string;
  name?: string;
  rank?: string;
}

/**
 * Best-effort spelling/name normalization via RxNorm's free approximateTerm
 * API, e.g. "lipitor" -> "Lipitor", typos corrected. Falls back to the
 * original input if the lookup fails or finds nothing; this is a "nice to
 * have" for broadening the openFDA search, not a hard dependency.
 */
export async function getCanonicalDrugName(name: string): Promise<string | null> {
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(name)}&maxEntries=5`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;

    const data = await res.json();
    const raw = data?.approximateGroup?.candidate;
    const candidates: ApproximateCandidate[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const named = candidates.find((c) => !!c.name);
    return named?.name ?? null;
  } catch {
    return null;
  }
}
