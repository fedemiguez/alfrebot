import { cacheTag } from "next/cache";
import {
  getProduct,
  getStoreBySlug,
  listProductsByStore,
} from "@/lib/db/repos";
import type { Product, Store } from "@/lib/db/schema";
import { DEMO_PRODUCTS, DEMO_STORE } from "@/lib/demo-store";

function withCheckoutDefault(store: Store): Store {
  return {
    ...store,
    checkoutMode: store.checkoutMode === "cart" ? "cart" : "whatsapp",
  };
}

async function readStore(slug: string): Promise<{
  store: Store | null;
  products: Product[];
}> {
  try {
    const storeRaw =
      (await getStoreBySlug(slug)) ?? (slug === DEMO_STORE.slug ? DEMO_STORE : null);
    if (!storeRaw) return { store: null, products: [] };
    // Cerámicas de Norma (tweet / demo): siempre "Lo quiero", nunca carrito.
    const store = withCheckoutDefault(
      storeRaw.slug === DEMO_STORE.slug
        ? { ...storeRaw, checkoutMode: "whatsapp" }
        : storeRaw,
    );

    let products = await listProductsByStore(store.id);
    if (products.length === 0 && store.slug === DEMO_STORE.slug) {
      products = DEMO_PRODUCTS;
    }

    const sorted = [...products].sort((a, b) => {
      if (a.inStock === b.inStock) return a.position - b.position;
      return a.inStock ? -1 : 1;
    });
    return { store, products: sorted };
  } catch (err) {
    // p.ej. columna nueva aún no migrada en Neon → no tumbar el build/prerender
    console.warn("[store-data] readStore failed; using demo fallback if applicable", err);
    if (slug === DEMO_STORE.slug) {
      return { store: DEMO_STORE, products: DEMO_PRODUCTS };
    }
    return { store: null, products: [] };
  }
}

export async function getCachedStore(slug: string): Promise<{
  store: Store | null;
  products: Product[];
}> {
  "use cache";
  cacheTag(`store:${slug}`);
  return readStore(slug);
}

export async function getCachedProduct(
  slug: string,
  productId: string,
): Promise<{ store: Store | null; product: Product | null }> {
  "use cache";
  cacheTag(`store:${slug}`);
  const { store, products } = await readStore(slug);
  if (!store) return { store: null, product: null };
  const fromList = products.find((p) => p.id === productId);
  if (fromList) return { store, product: fromList };
  const product = await getProduct(productId);
  if (!product || product.storeId !== store.id || product.hidden) {
    return { store, product: null };
  }
  return { store, product };
}
