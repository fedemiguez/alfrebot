/**
 * Categorías de vitrina Artesanías: heurística + preferencia de `products.category` (Fase 5).
 */

import {
  collectCategoryChips,
  productMatchesCategory,
  resolveProductCategoryChip,
  type CategorizedProduct,
  type CategoryChip,
} from "@/lib/product-category";

export type ArtesaniaCategoryChip = CategoryChip;

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

export function resolveArtesaniaCategory(
  product: CategorizedProduct,
): ArtesaniaCategoryChip | null {
  return resolveProductCategoryChip(product, inferArtesaniaCategory);
}

/** Chips presentes en el catálogo: “Todo” + categorías con al menos un producto. */
export function collectArtesaniaCategoryChips(
  products: ReadonlyArray<CategorizedProduct>,
): ArtesaniaCategoryChip[] {
  return collectCategoryChips(products, inferArtesaniaCategory);
}

export function productMatchesArtesaniaCategory(
  product: CategorizedProduct,
  categoryId: string,
): boolean {
  return productMatchesCategory(product, categoryId, inferArtesaniaCategory);
}
