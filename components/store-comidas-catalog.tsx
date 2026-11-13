"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { StoreCategoryChips } from "@/components/store-category-chips";
import type { Product } from "@/lib/db/schema";
import {
  collectComidaCategoryChips,
  productMatchesComidaCategory,
} from "@/lib/comida-category";
import type { StorePurchaseInfo } from "@/lib/store-purchase";

/**
 * Catálogo Comidas: chips (Todo + heurísticas) + filtro client-side.
 */
export function StoreComidasCatalog({
  products,
  store,
}: {
  products: Product[];
  store: StorePurchaseInfo;
}) {
  const chips = useMemo(() => collectComidaCategoryChips(products), [products]);
  const [activeId, setActiveId] = useState("todo");

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        productMatchesComidaCategory(
          {
            title: p.title,
            description: p.description,
            category: p.category,
          },
          activeId,
        ),
      ),
    [products, activeId],
  );

  return (
    <div className="store-comidas-catalog">
      <StoreCategoryChips
        chips={chips}
        activeId={activeId}
        onSelect={setActiveId}
      />

      <div className="store-comidas-grid mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            store={store}
            businessKind="comida"
            priority={i < 3}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">
          No hay platos en esta categoría.
        </p>
      )}
    </div>
  );
}
