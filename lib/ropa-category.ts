/**
 * Categorías de vitrina Ropa (Fase 2): heurística por palabras clave
 * hasta que exista `products.category` + sugerencia AI (Fase 5).
 */

export type RopaCategoryChip = {
  id: string;
  label: string;
};

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

/** Chips presentes en el catálogo: “Todo” + categorías con al menos un producto. */
export function collectRopaCategoryChips(
  products: ReadonlyArray<{ title: string; description?: string | null }>,
): RopaCategoryChip[] {
  const seen = new Set<string>();
  const chips: RopaCategoryChip[] = [{ id: "todo", label: "Todo" }];

  for (const product of products) {
    const cat = inferRopaCategory(product.title, product.description);
    if (!cat || seen.has(cat.id)) continue;
    seen.add(cat.id);
    chips.push(cat);
  }

  return chips;
}

export function productMatchesRopaCategory(
  product: { title: string; description?: string | null },
  categoryId: string,
): boolean {
  if (!categoryId || categoryId === "todo") return true;
  const cat = inferRopaCategory(product.title, product.description);
  return cat?.id === categoryId;
}
