/**
 * Categorías de vitrina Comidas: heurística + preferencia de `products.category` (Fase 5).
 */

import {
  collectCategoryChips,
  productMatchesCategory,
  resolveProductCategoryChip,
  type CategorizedProduct,
  type CategoryChip,
} from "@/lib/product-category";

export type ComidaCategoryChip = CategoryChip;

/** Orden estable de chips conocidos (además de “Todo”). */
const COMIDA_CATEGORY_HEURISTICS: ReadonlyArray<{
  id: string;
  label: string;
  keywords: readonly string[];
}> = [
  {
    id: "platos-del-dia",
    label: "🔥 Platos del Día",
    keywords: [
      "plato del dia",
      "plato del día",
      "menu del dia",
      "menú del día",
      "almuerzo",
      "especial",
      "del dia",
      "del día",
    ],
  },
  {
    id: "carnes",
    label: "🥩 Carnes",
    keywords: [
      "carne",
      "carnes",
      "milanesa",
      "milanesas",
      "asado",
      "bife",
      "bifes",
      "vacuna",
      "vacuno",
      "pollo",
      "pollos",
      "hamburguesa",
      "hamburguesas",
      "bondiola",
      "costilla",
      "parrilla",
      "chorizo",
      "choripan",
      "choripán",
    ],
  },
  {
    id: "pastas",
    label: "🍝 Pastas",
    keywords: [
      "pasta",
      "pastas",
      "fideos",
      "ñoquis",
      "noquis",
      "ravioles",
      "lasagna",
      "lasaña",
      "sorrentinos",
      "tallarines",
      "spaghetti",
      "espagueti",
    ],
  },
  {
    id: "pizzeria",
    label: "🍕 Pizzas",
    keywords: ["pizza", "pizzas", "empanada", "empanadas", "calzone"],
  },
  {
    id: "sandwichs",
    label: "🥪 Sándwiches",
    keywords: [
      "sandwich",
      "sándwich",
      "sandwiches",
      "sándwiches",
      "sanguche",
      "sanguches",
      "lomito",
      "lomitos",
      "tostado",
      "tostados",
    ],
  },
  {
    id: "guarniciones",
    label: "🥗 Guarniciones",
    keywords: [
      "guarnicion",
      "guarnición",
      "ensalada",
      "ensaladas",
      "papas",
      "pure",
      "puré",
      "arroz",
      "verdura",
      "verduras",
    ],
  },
  {
    id: "postres",
    label: "🍮 Postres",
    keywords: [
      "postre",
      "postres",
      "flan",
      "helado",
      "helados",
      "torta",
      "tortas",
      "budin",
      "budín",
      "dulce",
    ],
  },
  {
    id: "bebidas",
    label: "🥤 Bebidas",
    keywords: [
      "bebida",
      "bebidas",
      "gaseosa",
      "gaseosas",
      "jugo",
      "jugos",
      "agua",
      "cerveza",
      "vino",
      "cafe",
      "café",
      "te",
      "té",
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
 * Infiere una categoría de comida desde título (+ descripción opcional).
 * Sin match → null (el producto solo aparece en “Todo”).
 */
export function inferComidaCategory(
  title: string,
  description?: string | null,
): ComidaCategoryChip | null {
  const haystack = fold(`${title} ${description ?? ""}`);
  if (!haystack) return null;

  for (const cat of COMIDA_CATEGORY_HEURISTICS) {
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

export function resolveComidaCategory(
  product: CategorizedProduct,
): ComidaCategoryChip | null {
  return resolveProductCategoryChip(product, inferComidaCategory);
}

/** Chips presentes en el catálogo: “Todo” + categorías con al menos un producto. */
export function collectComidaCategoryChips(
  products: ReadonlyArray<CategorizedProduct>,
): ComidaCategoryChip[] {
  return collectCategoryChips(products, inferComidaCategory);
}

export function productMatchesComidaCategory(
  product: CategorizedProduct,
  categoryId: string,
): boolean {
  return productMatchesCategory(product, categoryId, inferComidaCategory);
}
