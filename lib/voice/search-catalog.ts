import { normalizeVoiceText, tokenizeVoiceQuery } from "@/lib/voice/normalize";

export type VoiceCatalogProduct = {
  id: string;
  title: string;
  description?: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  inStock: boolean;
};

export type VoiceSearchHit = VoiceCatalogProduct & {
  score: number;
};

/**
 * Búsqueda determinística sobre el catálogo (fuzzy liviano, sin LLM).
 * Puntúa título y descripción; prioriza stock y coincidencias exactas.
 */
export function searchCatalog(
  products: VoiceCatalogProduct[],
  query: string,
  limit = 5,
): VoiceSearchHit[] {
  const tokens = tokenizeVoiceQuery(query);
  const full = normalizeVoiceText(query);
  if (!full && tokens.length === 0) return [];

  const scored: VoiceSearchHit[] = [];

  for (const product of products) {
    const title = normalizeVoiceText(product.title);
    const desc = normalizeVoiceText(product.description ?? "");
    const hay = `${title} ${desc}`.trim();
    if (!hay) continue;

    let score = 0;

    if (full && title === full) score += 100;
    else if (full && title.includes(full)) score += 60;
    else if (full && hay.includes(full)) score += 35;

    for (const token of tokens) {
      if (title === token) score += 40;
      else if (title.startsWith(token) || token.startsWith(title)) score += 28;
      else if (title.includes(token)) score += 22;
      else if (fuzzyIncludes(title, token)) score += 14;
      else if (desc.includes(token)) score += 8;
      else if (fuzzyIncludes(hay, token)) score += 5;
    }

    // Solo ranquear entre coincidencias reales (no devolver todo el catálogo).
    if (score <= 0) continue;

    if (product.inStock) score += 3;
    else score -= 8;

    scored.push({ ...product, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.title.localeCompare(b.title, "es");
  });

  return scored.slice(0, Math.max(1, limit));
}

/** Distancia de edición ≤ 1 para tokens cortos, ≤ 2 si ≥ 6 chars. */
function fuzzyIncludes(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  const words = haystack.split(" ");
  const maxDist = needle.length >= 6 ? 2 : 1;
  for (const word of words) {
    if (Math.abs(word.length - needle.length) > maxDist) continue;
    if (editDistance(word, needle) <= maxDist) return true;
  }
  return false;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}
