import type { CheckoutMode, Product, Store } from "@/lib/db/schema";
import { resolveStoreContactPhone } from "@/lib/phone";
import { normalizeCheckoutMode } from "@/lib/store-purchase";

/** Catálogo público: sin PII de dueña ni identidad de canal. */
export type PublicStore = {
  id: string;
  name: string | null;
  slug: string | null;
  ownerName: string | null;
  showPhone: boolean;
  checkoutMode: CheckoutMode;
  tracksQuantity: boolean;
  isDemo: boolean;
  /**
   * WhatsApp público resuelto, solo si `showPhone` (igual que el HTML del catálogo).
   * Nunca es `channelIdentity` crudo (`clerk:…`).
   */
  contactPhone: string | null;
};

/** Producto de catálogo: sin `imageBlobKey` ni flags internos. */
export type PublicProduct = {
  id: string;
  storeId: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  inStock: boolean;
  quantity: number | null;
  position: number;
};

export function toPublicStore(store: Store): PublicStore {
  const showPhone = Boolean(store.showPhone);
  const resolved = showPhone ? resolveStoreContactPhone(store) : null;
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    ownerName: store.ownerName,
    showPhone,
    checkoutMode: normalizeCheckoutMode(store.checkoutMode),
    tracksQuantity: Boolean(store.tracksQuantity),
    isDemo: Boolean(store.isDemo),
    contactPhone: showPhone ? resolved : null,
  };
}

export function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    storeId: product.storeId,
    title: product.title,
    description: product.description,
    priceCents: product.priceCents,
    imageUrl: product.imageUrl,
    inStock: product.inStock,
    quantity: product.quantity,
    position: product.position,
  };
}

export function toPublicCatalog(store: Store, products: Product[]) {
  return {
    store: toPublicStore(store),
    products: products.map(toPublicProduct),
  };
}
