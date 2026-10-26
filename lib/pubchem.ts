import { fetchWithTimeout } from './fetchWithTimeout';

/** Free, no-key PubChem lookup, used only for an informational 2D structure diagram, never for identification. */
export async function getPubChemCid(name: string): Promise<number | null> {
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;

    const data = await res.json();
    const cid = data?.IdentifierList?.CID?.[0];
    return typeof cid === 'number' ? cid : null;
  } catch {
    return null;
  }
}

export function getStructureImageUrl(cid: number): string {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=300x300`;
}
