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
import { StoreVoiceAssistant } from "@/components/store-voice-assistant";
import { hasTranscriptionConfigured } from "@/lib/bot/transcribe";
import { resolveStoreContactPhone } from "@/lib/phone";
import { storePurchaseProps } from "@/lib/store-purchase";
import { monogramIconPath } from "@/lib/store-icon";
import { accentStyleVars } from "@/lib/store-accent";
import {
  businessKindClassName,
  businessKindHeaderLabel,
  storePatternClassName,
} from "@/lib/store-business-kind";
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

async function StoreBody({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const { slug } = await params;
  const { store, products } = await getCachedStore(slug);
  if (!store || !store.name) notFound();

  const purchase = storePurchaseProps(store);
  if (!purchase) notFound();

  const iconSrc = store.icon192Url || monogramIconPath(slug, 192);

  const iktShell = iktShellPresentation(store);
  const accentVars = iktShell.ikt
    ? iktShell.styleVars
    : accentStyleVars(store.accentColor);
  const kindClass = businessKindClassName(store.businessKind);
  const kindLabel = businessKindHeaderLabel(store.businessKind);
  // Con rubro Ikt: theme claro/crema/oscuro ignorado (decisión Federico).
  const themeClass = iktShell.ikt
    ? (iktShell.themeClassName ?? "")
    : storeThemeClassName(store.theme);
  const patternClass = storePatternClassName(store.businessKind);
  const welcome = normalizeWelcomeMessage(store.welcomeMessage);

  return (
    <StorePurchaseProvider store={purchase}>
      <div
        className={`store-theme-shell fade-in ${themeClass} ${patternClass}`.trim()}
        data-rubro={iktShell.ikt?.rubro}
        data-palette={iktShell.ikt?.palette}
        style={accentVars as CSSProperties}
      >
      <div
        className={`mx-auto w-full max-w-5xl px-5 py-10 ${kindClass}`}
      >
        <header className="flex items-start gap-4">
          <Image
            src={iconSrc}
            alt=""
            width={72}
            height={72}
            className="mt-1 size-[4.5rem] shrink-0 rounded-xl border border-[var(--border)] bg-[var(--card)] object-cover ring-2 ring-[var(--primary)]/25"
            priority
            unoptimized={
              iconSrc.startsWith("/") || iconSrc.startsWith("data:")
            }
          />
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl">
              <span className="border-b-[3px] border-[var(--primary)] pb-0.5">
                {store.name}
              </span>
            </h1>
            {welcome ? <p className="store-welcome">{welcome}</p> : null}
            {(store.ownerName || kindLabel) && (
              <p className="mt-3 text-[1.1rem] text-[var(--muted)]">
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

        <div className="store-secondary-notes">
          <HowToOrderNote checkoutMode={purchase.checkoutMode} compact />
          <StoreInstallCta storeName={store.name} compact />
        </div>

        <NoPublicPhoneNote
          showPhone={store.showPhone}
          checkoutMode={purchase.checkoutMode}
          ownerName={store.ownerName}
        />

        <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
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

        {products.length === 0 && (
          <p className="mt-10 text-[var(--muted)]">Todavía no hay productos publicados.</p>
        )}

        <footer className="mt-16 border-t border-[var(--border)] pt-8 text-[18px] text-[var(--ink)]">
          {(() => {
            const contact = resolveStoreContactPhone(store);
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
