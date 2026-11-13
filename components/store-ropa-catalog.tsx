"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { StoreCategoryChips } from "@/components/store-category-chips";
import type { Product } from "@/lib/db/schema";
import {
  collectRopaCategoryChips,
  productMatchesRopaCategory,
} from "@/lib/ropa-category";
import type { StorePurchaseInfo } from "@/lib/store-purchase";

/**
 * Catálogo Ropa: chips (Todo + heurísticas) + filtro client-side.
 */
export function StoreRopaCatalog({
  products,
  store,
}: {
  products: Product[];
  store: StorePurchaseInfo;
}) {
  const chips = useMemo(() => collectRopaCategoryChips(products), [products]);
  const [activeId, setActiveId] = useState("todo");

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        productMatchesRopaCategory(
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
    <div className="store-ropa-catalog">
      <StoreCategoryChips
        chips={chips}
        activeId={activeId}
        onSelect={setActiveId}
      />

      <div className="store-ropa-grid mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            store={store}
            businessKind="ropa"
            priority={i < 3}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">
          No hay prendas en esta categoría.
        </p>
      )}
    </div>
  );
}
