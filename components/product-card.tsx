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
import { shouldShowProductFrame } from "@/lib/store-legacy-chrome";
import { artesaniaMaterialBadgeText } from "@/lib/artesania-material";
import { iktWantCtaLabel } from "@/lib/ikt-cta";

export function ProductCard({
  product,
  store,
  businessKind,
  priority = false,
}: {
  product: Product;
  store: StorePurchaseInfo;
  /** Rubro de la tienda; null/undefined = layout default limpio Ikt. */
  businessKind?: string | null;
  priority?: boolean;
}) {
  const kind = resolveBusinessKind(businessKind);
  const href = `/${store.storeSlug}/producto/${product.id}`;
  const price = formatPriceArs(product.priceCents);
  /** Plantillas Ikt: sin marco, ratio Gemini, CTA microcopy. */
  const isRopaIkt = kind === "ropa";
  const isComidaIkt = kind === "comida";
  const isArtesaniaIkt = kind === "artesanal";
  const isDefaultIkt = !kind;
  const showFrame = shouldShowProductFrame(businessKind);
  const ctaLabel = iktWantCtaLabel(businessKind);
  const materialBadge = isArtesaniaIkt
    ? artesaniaMaterialBadgeText({
        title: product.title,
        description: product.description,
        material: product.material,
      })
    : null;

  return (
    <article
      className={`product-card group${kind ? ` product-card--${kind}` : ""}${
        isRopaIkt ? " product-card--ikt-ropa" : ""
      }${isComidaIkt ? " product-card--ikt-comida" : ""}${
        isArtesaniaIkt ? " product-card--ikt-artesania" : ""
      }${isDefaultIkt ? " product-card--ikt-default" : ""}`}
    >
      <Link
        href={href}
        className="product-card__link ikt-focusable block focus:outline-none"
      >
        <div
          className={`product-card__media relative overflow-hidden${
            showFrame
              ? " product-card__media--framed"
              : isDefaultIkt || isArtesaniaIkt
                ? ""
                : " border border-[var(--border)]"
          }`}
        >
          {product.imageUrl ? (
            <div
              className={`product-card__photo-wrap${
                showFrame ? " product-card__photo-wrap--framed" : ""
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
          {showFrame && kind ? (
            <ProductImageFrame kind={kind} frameId={product.id} />
          ) : null}
          {!product.inStock && (
            <span
              className={`absolute bottom-3 left-3 z-[3] px-3 py-1 text-[15px] font-medium ${
                isArtesaniaIkt
                  ? "product-card__soldout-badge"
                  : "bg-[var(--soldout-bg)] text-[var(--soldout)]"
              }`}
            >
              Agotado
            </span>
          )}
        </div>
        {materialBadge ? (
          <span className="product-card__material-badge product-card__material-badge--below">
            {materialBadge}
          </span>
        ) : null}
        {isRopaIkt ? (
          <div className="product-card__body product-card__body--ikt-ropa">
            <div className="product-card__title-row">
              <h2 className="product-card__title leading-snug">
                {product.title}
              </h2>
              <span className="product-card__price whitespace-nowrap">
                {price}
              </span>
            </div>
            {product.description ? (
              <p className="product-card__desc">{product.description}</p>
            ) : null}
          </div>
        ) : isComidaIkt ? (
          <div className="product-card__body product-card__body--ikt-comida">
            <div className="product-card__title-row">
              <h2 className="product-card__title leading-snug">
                {product.title}
              </h2>
              <span className="product-card__price product-card__price--primary whitespace-nowrap">
                {price}
              </span>
            </div>
            {product.description ? (
              <p className="product-card__desc">{product.description}</p>
            ) : null}
          </div>
        ) : isArtesaniaIkt ? (
          <div className="product-card__body product-card__body--ikt-artesania">
            <div className="product-card__title-row">
              <h2 className="product-card__title product-card__title--serif leading-snug">
                {product.title}
              </h2>
              <span className="product-card__price whitespace-nowrap">
                {price}
              </span>
            </div>
            {product.description ? (
              <p className="product-card__desc">{product.description}</p>
            ) : null}
          </div>
        ) : (
          <div className="product-card__body product-card__body--ikt-default">
            <div className="product-card__title-row">
              <h2 className="product-card__title font-[family-name:var(--font-ikt-heading)] font-extrabold leading-snug text-[var(--ink)]">
                {product.title}
              </h2>
              <span className="product-card__price font-[family-name:var(--font-ikt-heading)] font-extrabold whitespace-nowrap text-[var(--ink)]">
                {price}
              </span>
            </div>
            {product.description ? (
              <p className="product-card__desc">{product.description}</p>
            ) : null}
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
