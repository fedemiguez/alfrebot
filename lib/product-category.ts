/**
 * Helpers compartidos para chips de categoría (Fase 5).
 * Prefieren `products.category`; si falta, caen a heurística del rubro.
 */

export type CategoryChip = {
  id: string;
  label: string;
};

export type CategorizedProduct = {
  title: string;
  description?: string | null;
  category?: string | null;
};

/** Id estable de chip a partir de un label libre (sin taxonomía global). */
export function categoryChipId(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function foldCategory(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chip desde campo guardado, o null. */
export function chipFromSavedCategory(
  category: string | null | undefined,
): CategoryChip | null {
  const label = category?.replace(/\s+/g, " ").trim();
  if (!label) return null;
  const id = categoryChipId(label);
  if (!id) return null;
  return { id, label };
}

/**
 * Resuelve categoría de un producto: campo guardado primero, luego heurística.
 */
export function resolveProductCategoryChip(
  product: CategorizedProduct,
  inferHeuristic: (
    title: string,
    description?: string | null,
  ) => CategoryChip | null,
): CategoryChip | null {
  return chipFromSavedCategory(product.category) ?? inferHeuristic(product.title, product.description);
}

/** Chips: Todo + categorías distintas presentes (guardadas o inferidas). */
export function collectCategoryChips(
  products: ReadonlyArray<CategorizedProduct>,
  inferHeuristic: (
    title: string,
    description?: string | null,
  ) => CategoryChip | null,
): CategoryChip[] {
  const seen = new Set<string>();
  const chips: CategoryChip[] = [{ id: "todo", label: "Todo" }];

  for (const product of products) {
    const cat = resolveProductCategoryChip(product, inferHeuristic);
    if (!cat || seen.has(cat.id)) continue;
    seen.add(cat.id);
    chips.push(cat);
  }

  return chips;
}

export function productMatchesCategory(
  product: CategorizedProduct,
  categoryId: string,
  inferHeuristic: (
    title: string,
    description?: string | null,
  ) => CategoryChip | null,
): boolean {
  if (!categoryId || categoryId === "todo") return true;
  const cat = resolveProductCategoryChip(product, inferHeuristic);
  return cat?.id === categoryId;
}
