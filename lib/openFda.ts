import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Looks up the "Drug Interactions" section of a medication's FDA label by
 * name (brand or generic); openFDA doesn't reliably match by RxCUI since it
 * indexes at the product level, not the ingredient level RxNorm returns).
 * Tries each candidate name in order and returns the first hit.
 */
export async function getInteractionLabelText(candidateNames: string[]): Promise<string[]> {
  const names = Array.from(new Set(candidateNames.filter(Boolean)));

  for (const name of names) {
    try {
      const term = encodeURIComponent(name);
      const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${term}"+OR+openfda.brand_name:"${term}"&limit=1`;
      const res = await fetchWithTimeout(url, {}, 6000);
      if (!res.ok) continue;

      const data = await res.json();
      const text = data?.results?.[0]?.drug_interactions;
      if (Array.isArray(text) && text.length > 0) return text;
    } catch {
      continue;
    }
  }

  return [];
}
