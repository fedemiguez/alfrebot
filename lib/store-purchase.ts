import type { CheckoutMode } from "@/lib/db/schema";
import { resolveStoreContactPhone } from "@/lib/phone";

export type StorePurchaseInfo = {
  storeId: string;
  storeSlug: string;
  storeName: string | null;
  ownerName: string | null;
  /** WhatsApp público resuelto (E.164) o vacío si no hay. */
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
  channelIdentity: string;
  contactPhone?: string | null;
  showPhone: boolean;
  checkoutMode?: CheckoutMode | string | null;
}): StorePurchaseInfo | null {
  if (!store.slug) return null;
  const contact = resolveStoreContactPhone(store);
  return {
    storeId: store.id,
    storeSlug: store.slug,
    storeName: store.name,
    ownerName: store.ownerName,
    phone: contact ?? "",
    showPhone: store.showPhone && Boolean(contact),
    checkoutMode: normalizeCheckoutMode(store.checkoutMode),
  };
}
