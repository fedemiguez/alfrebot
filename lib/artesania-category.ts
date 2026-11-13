/**
 * Categorías de vitrina Artesanías (Fase 4): heurística por palabras clave
 * hasta que exista `products.category` + sugerencia AI (Fase 5).
 */

export type ArtesaniaCategoryChip = {
  id: string;
  label: string;
};

/** Orden estable de chips conocidos (además de “Todo”). */
const ARTESANIA_CATEGORY_HEURISTICS: ReadonlyArray<{
  id: string;
  label: string;
  keywords: readonly string[];
}> = [
  {
    id: "tazas",
    label: "Tazas",
    keywords: ["taza", "tazas", "jarrito", "jarritos", "mug", "mugs"],
  },
  {
    id: "cuencos",
    label: "Cuencos",
    keywords: ["cuenco", "cuencos", "bowl", "bowls"],
  },
  {
    id: "jarrones",
    label: "Jarrones",
    keywords: ["jarron", "jarrón", "jarrones", "florero", "floreros", "vaso"],
  },
  {
    id: "platos",
    label: "Platos",
    keywords: ["plato", "platos", "fuente", "fuentes", "bandeja", "bandejas"],
  },
  {
    id: "mates",
    label: "Mates",
    keywords: ["mate", "mates", "bombilla", "bombillas", "yerbera"],
  },
  {
    id: "textiles",
    label: "Textiles",
    keywords: [
      "manta",
      "mantas",
      "poncho",
      "ponchos",
      "tapiz",
      "tapices",
      "almohadon",
      "almohadón",
      "tejido",
      "telar",
    ],
  },
  {
    id: "decoracion",
    label: "Decoración",
    keywords: [
      "figura",
      "figuras",
      "escultura",
      "esculturas",
      "adorno",
      "adornos",
      "decoracion",
      "decoración",
    ],
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
 * Infiere una categoría de artesanía desde título (+ descripción opcional).
 * Sin match → null (el producto solo aparece en “Todo”).
 */
export function inferArtesaniaCategory(
  title: string,
  description?: string | null,
): ArtesaniaCategoryChip | null {
  const haystack = fold(`${title} ${description ?? ""}`);
  if (!haystack) return null;

  for (const cat of ARTESANIA_CATEGORY_HEURISTICS) {
    for (const kw of cat.keywords) {
      const folded = fold(kw);
      if (!folded) continue;
      const re = new RegExp(
        `(?:^|\\b)${folded.replace(/\s+/g, "\\s+")}(?:\\b|$)`,
      );
      if (re.test(haystack)) {
        return { id: cat.id, label: cat.label };
      }
    }
  }
  return null;
}

/** Chips presentes en el catálogo: “Todo” + categorías con al menos un producto. */
export function collectArtesaniaCategoryChips(
  products: ReadonlyArray<{ title: string; description?: string | null }>,
): ArtesaniaCategoryChip[] {
  const seen = new Set<string>();
  const chips: ArtesaniaCategoryChip[] = [{ id: "todo", label: "Todo" }];

  for (const product of products) {
    const cat = inferArtesaniaCategory(product.title, product.description);
    if (!cat || seen.has(cat.id)) continue;
    seen.add(cat.id);
    chips.push(cat);
  }

  return chips;
}

export function productMatchesArtesaniaCategory(
  product: { title: string; description?: string | null },
  categoryId: string,
): boolean {
  if (!categoryId || categoryId === "todo") return true;
  const cat = inferArtesaniaCategory(product.title, product.description);
  return cat?.id === categoryId;
}
