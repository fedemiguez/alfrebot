import { normalizeVoiceText } from "@/lib/voice/normalize";
import {
  searchCatalog,
  type VoiceCatalogProduct,
  type VoiceSearchHit,
} from "@/lib/voice/search-catalog";

export type VoiceIntent =
  | { kind: "want"; productQuery: string | null }
  | { kind: "search"; query: string }
  | { kind: "empty" };

const WANT_RE =
  /^(lo\s+quiero|la\s+quiero|los\s+quiero|las\s+quiero|quiero\s+ese|quiero\s+esa|quiero\s+este|quiero\s+esta|me\s+lo\s+llevo|me\s+la\s+llevo|comprar|lo\s+compro|la\s+compro)(\s+(.+))?$/i;

const WANT_PREFIX_RE =
  /^(lo\s+quiero|la\s+quiero|quiero)\s+(.+)$/i;

/**
 * Interpreta lo dicho por el comprador sin LLM.
 * - "Lo quiero" / "Lo quiero jarrón" → want
 * - resto → search
 */
export function parseVoiceIntent(raw: string): VoiceIntent {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };

  const norm = normalizeVoiceText(trimmed);

  if (
    norm === "lo quiero" ||
    norm === "la quiero" ||
    norm === "los quiero" ||
    norm === "las quiero" ||
    norm === "me lo llevo" ||
    norm === "me la llevo" ||
    norm === "comprar" ||
    norm === "lo compro" ||
    norm === "la compro"
  ) {
    return { kind: "want", productQuery: null };
  }

  const prefix = WANT_PREFIX_RE.exec(trimmed);
  if (prefix?.[2]) {
    return { kind: "want", productQuery: prefix[2].trim() };
  }

  const want = WANT_RE.exec(trimmed);
  if (want) {
    return {
      kind: "want",
      productQuery: want[3]?.trim() || null,
    };
  }

  return { kind: "search", query: trimmed };
}

export type VoiceTurnResult =
  | {
      kind: "want_ready";
      product: VoiceSearchHit;
      spoken: string;
    }
  | {
      kind: "want_ambiguous";
      hits: VoiceSearchHit[];
      spoken: string;
    }
  | {
      kind: "want_missing";
      spoken: string;
    }
  | {
      kind: "results";
      hits: VoiceSearchHit[];
      spoken: string;
    }
  | {
      kind: "no_results";
      spoken: string;
    }
  | {
      kind: "prompt";
      spoken: string;
    };

/**
 * Resuelve un turno de voz contra el catálogo (determinístico).
 * `selectedId` = último producto destacado (para "Lo quiero" sin nombre).
 */
export function resolveVoiceTurn(input: {
  transcript: string;
  products: VoiceCatalogProduct[];
  selectedId?: string | null;
  limit?: number;
}): VoiceTurnResult {
  const intent = parseVoiceIntent(input.transcript);
  const limit = input.limit ?? 5;

  if (intent.kind === "empty") {
    return {
      kind: "prompt",
      spoken: "Decime qué buscás. Por ejemplo: taza, o jarrón azul.",
    };
  }

  if (intent.kind === "want") {
    if (intent.productQuery) {
      const hits = searchCatalog(input.products, intent.productQuery, limit);
      if (hits.length === 0) {
        return {
          kind: "want_missing",
          spoken: `No encontré ${intent.productQuery}. Probá con otra palabra.`,
        };
      }
      if (hits.length === 1 || (hits[0] && hits[0].score >= (hits[1]?.score ?? 0) + 15)) {
        const product = hits[0]!;
        return {
          kind: "want_ready",
          product,
          spoken: product.inStock
            ? `Perfecto. ${product.title}. Tocá Lo quiero para pedirlo por WhatsApp.`
            : `${product.title} está agotado. Pedile al dueño que avise cuando vuelva.`,
        };
      }
      return {
        kind: "want_ambiguous",
        hits,
        spoken: `Encontré varias opciones. Tocá Lo quiero en la que te guste.`,
      };
    }

    const selected = input.selectedId
      ? input.products.find((p) => p.id === input.selectedId)
      : undefined;
    if (selected) {
      const hit: VoiceSearchHit = { ...selected, score: 100 };
      return {
        kind: "want_ready",
        product: hit,
        spoken: selected.inStock
          ? `Perfecto. ${selected.title}. Tocá Lo quiero para pedirlo por WhatsApp.`
          : `${selected.title} está agotado.`,
      };
    }

    return {
      kind: "want_missing",
      spoken:
        "Decime el nombre del producto, o buscá primero y después decí Lo quiero.",
    };
  }

  const hits = searchCatalog(input.products, intent.query, limit);
  if (hits.length === 0) {
    return {
      kind: "no_results",
      spoken: `No encontré nada con “${intent.query}”. Probá con otra palabra.`,
    };
  }

  if (hits.length === 1) {
    const p = hits[0]!;
    return {
      kind: "results",
      hits,
      spoken: p.inStock
        ? `Encontré ${p.title}. Tocá Lo quiero si te gusta, o buscá otra cosa.`
        : `Encontré ${p.title}, pero está agotado.`,
    };
  }

  const names = hits
    .slice(0, 3)
    .map((h) => h.title)
    .join(", ");
  return {
    kind: "results",
    hits,
    spoken: `Encontré ${hits.length} productos. Por ejemplo: ${names}. Tocá Lo quiero en el que te guste.`,
  };
}
