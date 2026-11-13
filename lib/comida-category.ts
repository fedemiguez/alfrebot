/**
 * Categorías de vitrina Comidas (Fase 3): heurística por palabras clave
 * hasta que exista `products.category` + sugerencia AI (Fase 5).
 */

export type ComidaCategoryChip = {
  id: string;
  label: string;
};

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

/** Chips presentes en el catálogo: “Todo” + categorías con al menos un producto. */
export function collectComidaCategoryChips(
  products: ReadonlyArray<{ title: string; description?: string | null }>,
): ComidaCategoryChip[] {
  const seen = new Set<string>();
  const chips: ComidaCategoryChip[] = [{ id: "todo", label: "Todo" }];

  for (const product of products) {
    const cat = inferComidaCategory(product.title, product.description);
    if (!cat || seen.has(cat.id)) continue;
    seen.add(cat.id);
    chips.push(cat);
  }

  return chips;
}

export function productMatchesComidaCategory(
  product: { title: string; description?: string | null },
  categoryId: string,
): boolean {
  if (!categoryId || categoryId === "todo") return true;
  const cat = inferComidaCategory(product.title, product.description);
  return cat?.id === categoryId;
}
