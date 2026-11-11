import type { CheckoutMode } from "@/lib/db/schema";

export type StorePurchaseInfo = {
  storeId: string;
  storeSlug: string;
  storeName: string | null;
  ownerName: string | null;
  phone: string;
  showPhone: boolean;
  checkoutMode: CheckoutMode;
};

export function normalizeCheckoutMode(
  value: CheckoutMode | string | null | undefined,
): CheckoutMode {
  return value === "cart" ? "cart" : "whatsapp";
}

export function storePurchaseProps(store: {
  id: string;
  slug: string | null;
  name: string | null;
  ownerName: string | null;
  phone: string;
  showPhone: boolean;
  checkoutMode?: CheckoutMode | string | null;
}): StorePurchaseInfo | null {
  if (!store.slug) return null;
  return {
    storeId: store.id,
    storeSlug: store.slug,
    storeName: store.name,
    ownerName: store.ownerName,
    phone: store.phone,
    showPhone: store.showPhone,
    checkoutMode: normalizeCheckoutMode(store.checkoutMode),
  };
}
