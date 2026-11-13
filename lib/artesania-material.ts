/**
 * Badge de materialidad (Fase 4): heurística desde título/descripción
 * hasta que exista `products.material` + sugerencia AI (Fase 5).
 */

export type ArtesaniaMaterial = {
  /** Texto corto para el badge (sin emoji). */
  label: string;
  /** Emoji opcional de preview (cerámica, madera, telar…). */
  emoji: string;
};

const MATERIAL_HEURISTICS: ReadonlyArray<{
  label: string;
  emoji: string;
  keywords: readonly string[];
}> = [
  {
    label: "Cerámica esmaltada",
    emoji: "🏺",
    keywords: ["esmalt", "esmalte", "esmaltada", "esmaltado"],
  },
  {
    label: "Cerámica",
    emoji: "🏺",
    keywords: [
      "ceramica",
      "cerámica",
      "alfareria",
      "alfarería",
      "barro",
      "greda",
      "torno",
    ],
  },
  {
    label: "Madera de algarrobo",
    emoji: "🪵",
    keywords: ["algarrobo"],
  },
  {
    label: "Madera",
    emoji: "🪵",
    keywords: ["madera", "nogal", "quebracho", "tallado", "tallada"],
  },
  {
    label: "Tejido en telar",
    emoji: "🧵",
    keywords: ["telar", "tejido", "tejida", "tejido a mano", "hilado"],
  },
  {
    label: "Lana",
    emoji: "🧶",
    keywords: ["lana", "ovillo", "crochet", "tejido a crochet"],
  },
  {
    label: "Cuero",
    emoji: "🧴",
    keywords: ["cuero", "suela", "marroquineria", "marroquinería"],
  },
  {
    label: "Vidrio",
    emoji: "🫧",
    keywords: ["vidrio", "cristal", "soplado"],
  },
  {
    label: "Metal",
    emoji: "⚒️",
    keywords: ["metal", "bronce", "plata", "cobre", "hierro", "alpaca"],
  },
  {
    label: "Cestería",
    emoji: "🧺",
    keywords: ["cest", "mimbre", "junco", "paja", "totora"],
  },
];

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Infiere material usable para badge. Sin match claro → null
 * (no mostrar badge genérico).
 */
export function inferArtesaniaMaterial(
  title: string,
  description?: string | null,
): ArtesaniaMaterial | null {
  const haystack = fold(`${title} ${description ?? ""}`);
  if (!haystack) return null;

  for (const mat of MATERIAL_HEURISTICS) {
    for (const kw of mat.keywords) {
      const folded = fold(kw);
      if (!folded) continue;
      const re = new RegExp(
        `(?:^|\\b)${folded.replace(/\s+/g, "\\s+")}(?:\\b|$)`,
      );
      if (re.test(haystack)) {
        return { label: mat.label, emoji: mat.emoji };
      }
    }
  }
  return null;
}

/** Texto completo del badge (emoji + label) o null. */
export function artesaniaMaterialBadgeText(
  title: string,
  description?: string | null,
): string | null {
  const mat = inferArtesaniaMaterial(title, description);
  if (!mat) return null;
  return `${mat.emoji} ${mat.label}`;
}
