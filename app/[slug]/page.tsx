import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import {
  HowToOrderNote,
  NoPublicPhoneNote,
  StorePurchaseProvider,
} from "@/components/store-purchase";
import { StoreContactLine } from "@/components/store-contact";
import { resolveStoreContactPhone } from "@/lib/phone";
import { storePurchaseProps } from "@/lib/store-purchase";
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
  return {
    title: store.name || "Tienda",
    description: store.ownerName
      ? `Catálogo de ${store.ownerName}`
      : "Catálogo armado con alfrebot",
    openGraph: firstImage
      ? { images: [{ url: firstImage }] }
      : undefined,
  };
}

async function StoreBody({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const { slug } = await params;
  const { store, products } = await getCachedStore(slug);
  if (!store || !store.name) notFound();

  const purchase = storePurchaseProps(store);
  if (!purchase) notFound();

  return (
    <StorePurchaseProvider store={purchase}>
      <div className="fade-in mx-auto w-full max-w-5xl px-5 py-10">
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl">
            {store.name}
          </h1>
          {store.ownerName && (
            <p className="mt-3 text-[1.1rem] text-[var(--muted)]">
              Productos de {store.ownerName}
            </p>
          )}
        </header>

        {store.isDemo && (
          <p className="mt-4 rounded border border-[var(--border)] bg-[var(--paper)] px-4 py-3 text-[1.05rem] text-[var(--muted)]">
            Tienda de prueba (sin celular cargado)
          </p>
        )}

        <HowToOrderNote checkoutMode={purchase.checkoutMode} />

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
