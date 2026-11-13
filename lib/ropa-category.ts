/**
 * Categorías de vitrina Ropa: heurística + preferencia de `products.category` (Fase 5).
 */

import {
  collectCategoryChips,
  productMatchesCategory,
  resolveProductCategoryChip,
  type CategorizedProduct,
  type CategoryChip,
} from "@/lib/product-category";

export type RopaCategoryChip = CategoryChip;

/** Orden estable de chips conocidos (además de “Todo”). */
const ROPA_CATEGORY_HEURISTICS: ReadonlyArray<{
  id: string;
  label: string;
  keywords: readonly string[];
}> = [
  {
    id: "abrigos",
    label: "Abrigos",
    keywords: [
      "abrigo",
      "abrigos",
      "saco",
      "sacos",
      "campera",
      "camperas",
      "tapado",
      "tapados",
      "blazer",
      "blazers",
      "sweater",
      "sweaters",
      "buzo",
      "buzos",
      "cardigan",
      "cárdigan",
      "chaleco",
      "chalecos",
    ],
  },
  {
    id: "camisas",
    label: "Camisas",
    keywords: [
      "camisa",
      "camisas",
      "blusa",
      "blusas",
      "remera",
      "remeras",
      "polo",
      "polos",
      "top",
      "tops",
    ],
  },
  {
    id: "pantalones",
    label: "Pantalones",
    keywords: [
      "pantalon",
      "pantalón",
      "pantalones",
      "jean",
      "jeans",
      "jogger",
      "joggers",
      "short",
      "shorts",
      "falda",
      "faldas",
    ],
  },
  {
    id: "vestidos",
    label: "Vestidos",
    keywords: ["vestido", "vestidos", "mono", "enterito", "enteritos"],
  },
  {
    id: "calzado",
    label: "Calzado",
    keywords: [
      "zapato",
      "zapatos",
      "zapatilla",
      "zapatillas",
      "botin",
      "botín",
      "botines",
      "bota",
      "botas",
      "sandalia",
      "sandalias",
    ],
  },
  {
    id: "accesorios",
    label: "Accesorios",
    keywords: [
      "accesorio",
      "accesorios",
      "cinturon",
      "cinturón",
      "cinturones",
      "bufanda",
      "bufandas",
      "gorro",
      "gorros",
      "sombrero",
      "cartera",
      "carteras",
      "bolso",
      "bolsos",
      "mochila",
      "pañuelo",
      "panuelo",
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
 * Infiere una categoría de ropa desde título (+ descripción opcional).
 * Sin match → null (el producto solo aparece en “Todo”).
 */
export function inferRopaCategory(
  title: string,
  description?: string | null,
): RopaCategoryChip | null {
  const haystack = fold(`${title} ${description ?? ""}`);
  if (!haystack) return null;

  for (const cat of ROPA_CATEGORY_HEURISTICS) {
    for (const kw of cat.keywords) {
      const folded = fold(kw);
      if (!folded) continue;
      const re = new RegExp(`(?:^|\\b)${folded.replace(/\s+/g, "\\s+")}(?:\\b|$)`);
      if (re.test(haystack)) {
        return { id: cat.id, label: cat.label };
      }
    }
  }
  return null;
}

export function resolveRopaCategory(
  product: CategorizedProduct,
): RopaCategoryChip | null {
  return resolveProductCategoryChip(product, inferRopaCategory);
}

/** Chips presentes en el catálogo: “Todo” + categorías con al menos un producto. */
export function collectRopaCategoryChips(
  products: ReadonlyArray<CategorizedProduct>,
): RopaCategoryChip[] {
  return collectCategoryChips(products, inferRopaCategory);
}

export function productMatchesRopaCategory(
  product: CategorizedProduct,
  categoryId: string,
): boolean {
  return productMatchesCategory(product, categoryId, inferRopaCategory);
}
