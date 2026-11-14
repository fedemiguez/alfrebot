import type { Metadata } from "next";
import Image from "next/image";
import { Suspense, type CSSProperties } from "react";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import {
  HowToOrderNote,
  NoPublicPhoneNote,
  StorePurchaseProvider,
} from "@/components/store-purchase";
import { StoreContactLine } from "@/components/store-contact";
import { StoreInstallCta } from "@/components/store-install-cta";
import { StoreArtesaniasCatalog } from "@/components/store-artesanias-catalog";
import { StoreComidasCatalog } from "@/components/store-comidas-catalog";
import { StoreRopaCatalog } from "@/components/store-ropa-catalog";
import { StoreVoiceAssistant } from "@/components/store-voice-assistant";
import { hasTranscriptionConfigured } from "@/lib/bot/transcribe";
import {
  IKT_COMIDAS_OPEN_BANNER,
  iktHeaderEyebrow,
  iktHelperTip,
  storeMonogramInitials,
} from "@/lib/ikt-cta";
import { resolveStoreContactPhone } from "@/lib/phone";
import { storePurchaseProps } from "@/lib/store-purchase";
import { monogramIconPath } from "@/lib/store-icon";
import { accentStyleVars } from "@/lib/store-accent";
import {
  businessKindClassName,
  businessKindHeaderLabel,
  resolveBusinessKind,
  storePatternClassName,
} from "@/lib/store-business-kind";
import { shouldShowStorePattern } from "@/lib/store-legacy-chrome";
import { iktShellPresentation } from "@/lib/store-ikt-theme";
import { storeThemeClassName } from "@/lib/store-theme";
import { normalizeWelcomeMessage } from "@/lib/store-welcome";
import { getCachedStore } from "@/lib/store-data";

export async function generateStaticParams() {
  return [{ slug: "ceramicas-de-norma" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { store, products } = await getCachedStore(slug);
  if (!store) return { title: "Tienda" };
  const firstImage = products.find((p) => p.imageUrl)?.imageUrl;
  const icon192 = store.icon192Url || monogramIconPath(slug, 192);
  const icon512 = store.icon512Url || monogramIconPath(slug, 512);
  const apple = store.iconAppleUrl || monogramIconPath(slug, 180);
  return {
    title: store.name || "Tienda",
    description: store.ownerName
      ? `Catálogo de ${store.ownerName}`
      : "Catálogo armado con alfrebot",
    manifest: `/${slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: store.name || "Tienda",
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        { url: icon192, sizes: "192x192", type: "image/png" },
        { url: icon512, sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: apple, sizes: "180x180", type: "image/png" }],
    },
    openGraph: firstImage
      ? { images: [{ url: firstImage }] }
      : store.icon512Url
        ? { images: [{ url: store.icon512Url }] }
        : undefined,
  };
}

function StoreLogoAvatar({
  rubro,
  iconSrc,
  monogram,
  storeName,
  hasIcon,
}: {
  rubro: "comidas" | "ropa" | "artesanias";
  iconSrc: string;
  monogram: string;
  storeName: string;
  hasIcon: boolean;
}) {
  const size = rubro === "artesanias" ? 76 : 74;
  if (hasIcon) {
    return (
      <div className={`ikt-store-logo-wrap ikt-store-logo-wrap--${rubro}`}>
        <Image
          src={iconSrc}
          alt={`Logo de ${storeName}`}
          width={size}
          height={size}
          className="ikt-store-logo"
          priority
          unoptimized={iconSrc.startsWith("/") || iconSrc.startsWith("data:")}
        />
      </div>
    );
  }
  return (
    <div
      className={`ikt-store-logo ikt-store-logo--monogram ikt-store-logo-wrap--${rubro}`}
      aria-hidden="true"
    >
      {monogram}
    </div>
  );
}

async function StoreBody({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const { slug } = await params;
  const { store, products } = await getCachedStore(slug);
  if (!store || !store.name) notFound();

  const purchase = storePurchaseProps(store);
  if (!purchase) notFound();

  const iconSrc = store.icon192Url || monogramIconPath(slug, 192);

  const iktShell = iktShellPresentation(store);
  const accentVars =
    iktShell.ikt || iktShell.isDefault
      ? iktShell.styleVars
      : accentStyleVars(store.accentColor);
  const kindClass = businessKindClassName(store.businessKind);
  const kindLabel = businessKindHeaderLabel(store.businessKind);
  const kind = resolveBusinessKind(store.businessKind);
  const isRopaIkt = kind === "ropa";
  const isComidaIkt = kind === "comida";
  const isArtesaniaIkt = kind === "artesanal";
  const isIktRubro = isRopaIkt || isComidaIkt || isArtesaniaIkt;
  const isDefaultIkt = iktShell.isDefault;
  const headerEyebrow = iktHeaderEyebrow(store.businessKind);
  const helperTip = iktHelperTip(store.businessKind);
  const themeClass =
    iktShell.ikt || iktShell.isDefault
      ? (iktShell.themeClassName ?? "")
      : storeThemeClassName(store.theme);
  const patternClass = shouldShowStorePattern(store.businessKind)
    ? storePatternClassName(store.businessKind)
    : "";
  const welcome = normalizeWelcomeMessage(store.welcomeMessage);
  const monogram = storeMonogramInitials(store.name);
  const showOpenBanner = isComidaIkt && Boolean(store.openNow);
  const hasIcon = Boolean(store.icon192Url);
  const rubroKey = isComidaIkt
    ? "comidas"
    : isRopaIkt
      ? "ropa"
      : isArtesaniaIkt
        ? "artesanias"
        : null;

  return (
    <StorePurchaseProvider store={purchase}>
      <div
        className={`store-theme-shell fade-in ${themeClass} ${patternClass}`.trim()}
        data-rubro={iktShell.ikt?.rubro}
        data-palette={iktShell.ikt?.palette}
        style={accentVars as CSSProperties}
      >
      {showOpenBanner ? (
        <div className="store-open-banner" role="status">
          {IKT_COMIDAS_OPEN_BANNER}
        </div>
      ) : null}
      <div
        className={`mx-auto w-full max-w-5xl px-5 ${isComidaIkt ? "py-6" : "py-10"} ${kindClass}`}
      >
        {isIktRubro && rubroKey ? (
          <header className={`store-header-ikt store-header-ikt--${rubroKey}`}>
            <StoreLogoAvatar
              rubro={rubroKey}
              iconSrc={iconSrc}
              monogram={monogram}
              storeName={store.name}
              hasIcon={hasIcon}
            />
            {headerEyebrow ? (
              <p className="store-header-ikt__kicker">{headerEyebrow}</p>
            ) : null}
            <h1 className="store-header-ikt__name">{store.name}</h1>
            {isRopaIkt ? (
              <div className="ikt-editorial-divider" aria-hidden="true" />
            ) : null}
            {isArtesaniaIkt ? (
              <div className="ikt-editorial-divider" aria-hidden="true">
                <span />
              </div>
            ) : null}
            {welcome ? (
              <p className="store-header-ikt__welcome">{welcome}</p>
            ) : null}
          </header>
        ) : (
          <header className="store-header-default flex items-center gap-4 border-b-2 border-[color-mix(in_srgb,var(--ink)_10%,transparent)] pb-3">
            {store.icon192Url ? (
              <Image
                src={iconSrc}
                alt=""
                width={56}
                height={56}
                className="store-header-default__avatar size-14 shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] object-cover"
                priority
                unoptimized={
                  iconSrc.startsWith("/") || iconSrc.startsWith("data:")
                }
              />
            ) : (
              <div
                className="store-header-default__avatar flex size-14 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-fg)",
                }}
                aria-hidden="true"
              >
                {monogram}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="store-header-default__name font-[family-name:var(--font-ikt-heading)] text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">
                {store.name}
              </h1>
              {welcome ? (
                <p className="store-welcome mt-1 text-[0.95rem]">{welcome}</p>
              ) : null}
              {(store.ownerName || kindLabel) && (
                <p className="mt-2 text-[1rem] text-[var(--muted)]">
                  {store.ownerName
                    ? `Productos de ${store.ownerName}`
                    : null}
                  {store.ownerName && kindLabel ? " · " : null}
                  {kindLabel ? (
                    <span className="store-kind-label text-[var(--primary)]">
                      {kindLabel}
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          </header>
        )}

        {store.isDemo && (
          <p className="mt-4 rounded border border-[var(--border)] bg-[var(--paper)] px-4 py-3 text-[1.05rem] text-[var(--muted)]">
            Tienda de prueba (sin celular cargado)
          </p>
        )}

        <StoreVoiceAssistant
          store={purchase}
          products={products.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            priceCents: p.priceCents,
            imageUrl: p.imageUrl,
            inStock: p.inStock,
          }))}
          cloudSttAvailable={hasTranscriptionConfigured()}
        />

        {helperTip ? (
          <div className="ikt-helper-tip" role="note">
            <span aria-hidden="true">💡</span>
            <p>{helperTip}</p>
          </div>
        ) : (
          <div className="store-secondary-notes">
            <HowToOrderNote checkoutMode={purchase.checkoutMode} compact />
          </div>
        )}

        <div className="store-secondary-notes store-secondary-notes--install">
          <StoreInstallCta storeName={store.name} compact />
        </div>

        <NoPublicPhoneNote
          showPhone={store.showPhone}
          checkoutMode={purchase.checkoutMode}
          ownerName={store.ownerName}
        />

        {isRopaIkt ? (
          <div className="mt-8">
            <StoreRopaCatalog products={products} store={purchase} />
          </div>
        ) : isComidaIkt ? (
          <div className="mt-8">
            <StoreComidasCatalog products={products} store={purchase} />
          </div>
        ) : isArtesaniaIkt ? (
          <div className="mt-8">
            <StoreArtesaniasCatalog products={products} store={purchase} />
          </div>
        ) : (
          <div
            className={`mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3${
              isDefaultIkt ? " store-catalog-default" : ""
            }`}
          >
            {products.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                store={purchase}
                businessKind={store.businessKind}
                priority={i < 3}
              />
            ))}
          </div>
        )}

        {products.length === 0 && (
          <p className="mt-10 text-[var(--muted)]">Todavía no hay productos publicados.</p>
        )}

        <footer className="mt-16 border-t border-[var(--border)] pt-8 text-[18px] text-[var(--ink)]">
          {(() => {
            const contact = resolveStoreContactPhone(store);
            if (isIktRubro && store.showPhone && contact) {
              return (
                <div className="ikt-store-footer">
                  <p className="ikt-store-footer__title">¿Tenés alguna consulta?</p>
                  <p className="ikt-store-footer__body">
                    Escribile directo a{" "}
                    <strong>{store.ownerName || "el dueño"}</strong> y te
                    asesora al instante.
                  </p>
                  <StoreContactLine
                    ownerName={store.ownerName}
                    phoneE164={contact}
                  />
                  <p className="ikt-store-footer__credit">
                    Tienda creada con Alfrebot · Iktweb
                  </p>
                </div>
              );
            }
            if (store.showPhone && contact) {
              return (
                <StoreContactLine
                  ownerName={store.ownerName}
                  phoneE164={contact}
                />
              );
            }
            if (store.showPhone && !contact) {
              return (
                <p className="text-[var(--muted)]">
                  Esta tienda todavía no configuró un WhatsApp público para pedidos.
                </p>
              );
            }
            return (
              <p className="text-[15px] text-[var(--muted)]">
                Catálogo armado con alfrebot.
              </p>
            );
          })()}
        </footer>
      </div>
      </div>
    </StorePurchaseProvider>
  );
}

export default function StorePage(props: PageProps<"/[slug]">) {
  return (
    <main className="flex-1">
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl px-5 py-16 text-[var(--muted)]">
            Cargando tienda…
          </div>
        }
      >
        <StoreBody params={props.params} />
      </Suspense>
    </main>
  );
}
