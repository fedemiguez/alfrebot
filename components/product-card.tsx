import Image from "next/image";
import Link from "next/link";
import { formatPriceArs } from "@/lib/format";
import type { Product } from "@/lib/db/schema";
import { ProductBuyActions } from "@/components/store-purchase";
import { ProductImageFrame } from "@/components/product-image-frame";
import type { StorePurchaseInfo } from "@/lib/store-purchase";
import {
  resolveBusinessKind,
} from "@/lib/store-business-kind";
import { iktWantCtaLabel } from "@/lib/ikt-cta";

export function ProductCard({
  product,
  store,
  businessKind,
  priority = false,
}: {
  product: Product;
  store: StorePurchaseInfo;
  /** Rubro de la tienda; null/undefined = layout default (sin marco). */
  businessKind?: string | null;
  priority?: boolean;
}) {
  const kind = resolveBusinessKind(businessKind);
  const href = `/${store.storeSlug}/producto/${product.id}`;
  const price = formatPriceArs(product.priceCents);
  /** Plantilla Ikt Ropa (Fase 2): sin marco, ratio 16/11, CTA microcopy. */
  const isRopaIkt = kind === "ropa";
  const ctaLabel = iktWantCtaLabel(businessKind);

  return (
    <article
      className={`product-card group${kind ? ` product-card--${kind}` : ""}${
        isRopaIkt ? " product-card--ikt-ropa" : ""
      }`}
    >
      <Link
        href={href}
        className="product-card__link block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <div
          className={`product-card__media relative overflow-hidden${
            kind && !isRopaIkt
              ? " product-card__media--framed"
              : " border border-[var(--border)]"
          }`}
        >
          {product.imageUrl ? (
            <div
              className={`product-card__photo-wrap${
                kind && !isRopaIkt ? " product-card__photo-wrap--framed" : ""
              }`}
            >
              <Image
                src={product.imageUrl}
                alt={product.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="product-card__photo object-cover object-center"
                priority={priority}
                unoptimized={
                  product.imageUrl.startsWith("/") ||
                  product.imageUrl.startsWith("data:")
                }
              />
            </div>
          ) : (
            <div className="product-card__photo-empty flex h-full items-center justify-center text-[var(--muted)]">
              Sin foto
            </div>
          )}
          {kind && !isRopaIkt ? (
            <ProductImageFrame kind={kind} frameId={product.id} />
          ) : null}
          {kind === "comida" && product.priceCents != null && (
            <span className="product-card__price-badge" aria-hidden="true">
              {price}
            </span>
          )}
          {!product.inStock && (
            <span className="absolute bottom-3 left-3 z-[3] bg-[var(--soldout-bg)] px-3 py-1 text-[15px] font-medium text-[var(--soldout)]">
              Agotado
            </span>
          )}
        </div>
        {isRopaIkt ? (
          <div className="product-card__body product-card__body--ikt-ropa">
            <div className="product-card__title-row">
              <h2 className="product-card__title font-[family-name:var(--font-display)] font-extrabold leading-snug text-[var(--ink)]">
                {product.title}
              </h2>
              <span className="product-card__price font-[family-name:var(--font-display)] font-extrabold whitespace-nowrap text-[var(--ink)]">
                {price}
              </span>
            </div>
            {product.description ? (
              <p className="product-card__desc">{product.description}</p>
            ) : null}
          </div>
        ) : (
          <div className="product-card__body">
            <h2 className="product-card__title font-[family-name:var(--font-display)] font-semibold leading-snug text-[var(--ink)]">
              {product.title}
            </h2>
            {kind !== "comida" && (
              <p className="product-card__price font-[family-name:var(--font-display)] font-bold text-[var(--primary)]">
                {price}
              </p>
            )}
            {kind === "comida" && (
              <p className="product-card__price product-card__price--echo sr-only">
                {price}
              </p>
            )}
          </div>
        )}
      </Link>
      <ProductBuyActions
        store={store}
        product={{
          id: product.id,
          title: product.title,
          priceCents: product.priceCents,
          imageUrl: product.imageUrl,
          inStock: product.inStock,
        }}
        layout="inline"
        ctaLabel={ctaLabel}
      />
    </article>
  );
}
