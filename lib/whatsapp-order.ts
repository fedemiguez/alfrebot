import { formatPriceArs } from "@/lib/format";
import { appBaseUrl } from "@/lib/env";

/** Dígitos para wa.me (sin +). */
export function phoneToWaDigits(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export function buildWaMeUrl(phoneE164: string, message: string): string {
  const digits = phoneToWaDigits(phoneE164);
  if (!digits) return "#";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function storeCatalogUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${appBaseUrl()}/${slug}`;
}

export function productWantMessage(input: {
  productTitle: string;
  priceCents: number | null | undefined;
  storeName?: string | null;
  storeSlug?: string | null;
  ownerName?: string | null;
}): string {
  const price = formatPriceArs(input.priceCents);
  const store = input.storeName ? ` de ${input.storeName}` : "";
  const link = storeCatalogUrl(input.storeSlug);
  const greeting = input.ownerName ? `¡Hola ${input.ownerName}!` : "¡Hola!";
  const lines = [
    greeting,
    `Quiero pedirte${store}:`,
    `• ${input.productTitle} — ${price}`,
  ];
  if (link) lines.push(``, `Catálogo: ${link}`);
  return lines.join("\n");
}

export type CartLineForMessage = {
  title: string;
  quantity: number;
  priceCents: number | null | undefined;
};

export function cartCheckoutMessage(input: {
  lines: CartLineForMessage[];
  storeName?: string | null;
  storeSlug?: string | null;
  ownerName?: string | null;
}): string {
  const greeting = input.ownerName ? `¡Hola ${input.ownerName}!` : "¡Hola!";
  const store = input.storeName ? ` de ${input.storeName}` : "";
  const lines = [greeting, `Quiero hacer este pedido${store}:`, ""];

  let totalCents = 0;
  let hasAllPrices = true;

  for (const line of input.lines) {
    const unit = line.priceCents;
    if (unit == null) {
      hasAllPrices = false;
      lines.push(`• ${line.title} × ${line.quantity} — Consultar`);
    } else {
      const lineTotal = unit * line.quantity;
      totalCents += lineTotal;
      lines.push(
        `• ${line.title} × ${line.quantity} — ${formatPriceArs(lineTotal)}`,
      );
    }
  }

  lines.push("");
  if (hasAllPrices) {
    lines.push(`Total: ${formatPriceArs(totalCents)}`);
  } else {
    lines.push("Total: a confirmar");
  }

  const link = storeCatalogUrl(input.storeSlug);
  if (link) {
    lines.push("", `Catálogo: ${link}`);
  }

  return lines.join("\n");
}

/** Contacto público para pedidos: requiere número visible. */
export function storeAcceptsWhatsAppOrders(store: {
  showPhone: boolean;
  phone: string;
}): boolean {
  return store.showPhone && Boolean(phoneToWaDigits(store.phone));
}
