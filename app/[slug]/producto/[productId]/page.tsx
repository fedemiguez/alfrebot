import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import {
  HowToOrderNote,
  NoPublicPhoneNote,
  ProductBuyActions,
  StoreHomeLink,
  StorePurchaseProvider,
} from "@/components/store-purchase";
import { StoreContactLine } from "@/components/store-contact";
import { formatPriceArs } from "@/lib/format";
import { resolveStoreContactPhone } from "@/lib/phone";
import { storePurchaseProps } from "@/lib/store-purchase";
import { iktWantCtaLabel } from "@/lib/ikt-cta";
import { accentStyleVars } from "@/lib/store-accent";
import {
  businessKindClassName,
  resolveBusinessKind,
  storePatternClassName,
} from "@/lib/store-business-kind";
import { iktShellPresentation } from "@/lib/store-ikt-theme";
import { storeThemeClassName } from "@/lib/store-theme";
import { getCachedProduct } from "@/lib/store-data";

export async function generateMetadata({
  params,
}: PageProps<"/[slug]/producto/[productId]">): Promise<Metadata> {
  const { slug, productId } = await params;
  const { product, store } = await getCachedProduct(slug, productId);
  if (!product) return { title: "Pieza" };
  return {
    title: `${product.title} · ${store?.name ?? "Tienda"}`,
    description: product.description || undefined,
    openGraph: product.imageUrl ? { images: [{ url: product.imageUrl }] } : undefined,
  };
}

async function ProductBody({
  params,
}: {
  params: PageProps<"/[slug]/producto/[productId]">["params"];
}) {
  const { slug, productId } = await params;
  const { store, product } = await getCachedProduct(slug, productId);
  if (!store || !product) notFound();

  const purchase = storePurchaseProps(store);
  if (!purchase) notFound();

  const iktShell = iktShellPresentation(store);
  const accentVars = iktShell.ikt
    ? iktShell.styleVars
    : accentStyleVars(store.accentColor);
  const kindClass = businessKindClassName(store.businessKind);
  const kind = resolveBusinessKind(store.businessKind);
  const isRopaIkt = kind === "ropa";
  const isComidaIkt = kind === "comida";
  const isArtesaniaIkt = kind === "artesanal";
  // Con rubro Ikt: theme claro/crema/oscuro ignorado (decisión Federico).
  const themeClass = iktShell.ikt
    ? (iktShell.themeClassName ?? "")
    : storeThemeClassName(store.theme);
  const patternClass =
    isRopaIkt || isComidaIkt || isArtesaniaIkt
      ? ""
      : storePatternClassName(store.businessKind);
  const ctaLabel = iktWantCtaLabel(store.businessKind);
  const mediaAspect =
    isRopaIkt || isArtesaniaIkt
      ? "aspect-[16/11] rounded-lg"
      : isComidaIkt
        ? "aspect-[16/10] rounded-xl"
        : "aspect-square";

  return (
    <StorePurchaseProvider store={purchase}>
      <div
        className={`store-theme-shell fade-in ${themeClass} ${patternClass}`.trim()}
        data-rubro={iktShell.ikt?.rubro}
        data-palette={iktShell.ikt?.palette}
        style={accentVars as CSSProperties}
      >
      <div
        className={`mx-auto w-full max-w-3xl px-5 py-10 ${kindClass}`}
      >
        <StoreHomeLink slug={slug} />

        <div
          className={`relative overflow-hidden border border-[var(--border)] bg-white ${mediaAspect}`}
        >
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover object-center"
              unoptimized={
                product.imageUrl.startsWith("/") || product.imageUrl.startsWith("data:")
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--muted)]">
              Sin foto
            </div>
          )}
          {!product.inStock && (
            <span className="absolute bottom-4 left-4 bg-[var(--soldout-bg)] px-3 py-1 text-[16px] font-medium text-[var(--soldout)]">
              Agotado
            </span>
          )}
        </div>

        <h1
          className={`mt-6 text-[1.75rem] font-semibold text-[var(--ink)] sm:text-4xl${
            isArtesaniaIkt
              ? " store-pdp-title--serif font-bold"
              : " font-[family-name:var(--font-display)]"
          }`}
        >
          {product.title}
        </h1>
        <p className="mt-3 font-[family-name:var(--font-display)] text-[2rem] font-bold text-[var(--primary)]">
          {formatPriceArs(product.priceCents)}
        </p>
        {product.description && (
          <p className="mt-5 text-[1.15rem] leading-relaxed text-[var(--ink)]">
            {product.description}
          </p>
        )}

        <HowToOrderNote
          checkoutMode={purchase.checkoutMode}
          compact
        />

        <ProductBuyActions
          store={purchase}
          product={{
            id: product.id,
            title: product.title,
            priceCents: product.priceCents,
            imageUrl: product.imageUrl,
            inStock: product.inStock,
          }}
          ctaLabel={ctaLabel}
        />

        <NoPublicPhoneNote
          showPhone={store.showPhone}
          checkoutMode={purchase.checkoutMode}
          ownerName={store.ownerName}
        />

        {(() => {
          const contact = resolveStoreContactPhone(store);
          if (!store.showPhone || !contact) return null;
          return (
            <div className="mt-10 border-t border-[var(--border)] pt-6 text-[18px]">
              <StoreContactLine
                ownerName={store.ownerName}
                phoneE164={contact}
                prefix="¿Te gustó? Escribile a"
              />
            </div>
          );
        })()}
      </div>
      </div>
    </StorePurchaseProvider>
  );
}

export default function ProductPage(
  props: PageProps<"/[slug]/producto/[productId]">,
) {
  return (
    <main className="flex-1">
      <Suspense
        fallback={
          <div className="mx-auto max-w-3xl px-5 py-16 text-[var(--muted)]">
            Cargando producto…
          </div>
        }
      >
        <ProductBody params={props.params} />
      </Suspense>
    </main>
  );
}
