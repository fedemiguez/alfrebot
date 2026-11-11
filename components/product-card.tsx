import Image from "next/image";
import Link from "next/link";
import { formatPriceArs } from "@/lib/format";
import type { Product } from "@/lib/db/schema";

export function ProductCard({
  product,
  storeSlug,
  priority = false,
}: {
  product: Product;
  storeSlug: string;
  priority?: boolean;
}) {
  const href = `/${storeSlug}/producto/${product.id}`;
  return (
    <article className="group">
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
        <div className="relative aspect-square overflow-hidden border border-[var(--border)] bg-white">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
              priority={priority}
              unoptimized={product.imageUrl.startsWith("/") || product.imageUrl.startsWith("data:")}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-[var(--paper)] text-[var(--muted)]">
              Sin foto
            </div>
          )}
          {!product.inStock && (
            <span className="absolute bottom-3 left-3 bg-[var(--soldout-bg)] px-3 py-1 text-[15px] font-medium text-[var(--soldout)]">
              Agotado
            </span>
          )}
        </div>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-[22px] font-semibold leading-snug text-[var(--ink)]">
          {product.title}
        </h2>
        <p className="mt-1 font-[family-name:var(--font-display)] text-[28px] font-bold text-[var(--primary)]">
          {formatPriceArs(product.priceCents)}
        </p>
      </Link>
    </article>
  );
}
