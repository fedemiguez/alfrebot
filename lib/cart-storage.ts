export type CartItem = {
  productId: string;
  title: string;
  priceCents: number | null;
  imageUrl: string | null;
  quantity: number;
};

function storageKey(storeSlug: string): string {
  return `alfrebot-cart:${storeSlug}`;
}

export function readCart(storeSlug: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(storeSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.productId === "string" &&
        typeof item.title === "string" &&
        typeof item.quantity === "number" &&
        item.quantity > 0,
    );
  } catch {
    return [];
  }
}

export function writeCart(storeSlug: string, items: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(storeSlug), JSON.stringify(items));
  window.dispatchEvent(
    new CustomEvent("alfrebot-cart", { detail: { storeSlug } }),
  );
}

export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function cartSubtotalCents(items: CartItem[]): number | null {
  let total = 0;
  for (const item of items) {
    if (item.priceCents == null) return null;
    total += item.priceCents * item.quantity;
  }
  return total;
}
