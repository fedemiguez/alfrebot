import { formatPriceArs } from "@/lib/format";
import { appBaseUrl } from "@/lib/env";
import {
  buildWaMeUrl,
  phoneToWaDigits,
  resolveStoreContactPhone,
} from "@/lib/phone";

export { buildWaMeUrl, phoneToWaDigits };

export function storeCatalogUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${appBaseUrl()}/${slug}`;
}

/**
 * Texto prefill de wa.me (mismo flujo / buildWaMeUrl).
 * Tono alineado a spec Gemini Ikt — sin cambiar el canal ni el CTA.
 */
export function productWantMessage(input: {
  productTitle: string;
  priceCents: number | null | undefined;
  storeName?: string | null;
  storeSlug?: string | null;
  ownerName?: string | null;
}): string {
  const price = formatPriceArs(input.priceCents);
  const who =
    input.storeName?.trim() ||
    input.ownerName?.trim() ||
    null;
  const greeting = who ? `¡Hola ${who}! 👋` : "¡Hola! 👋";
  const lines = [
    greeting,
    `Vi su página web. Me gustaría consultar o pedir: *${input.productTitle}* (${price}). ¿Me podrían ayudar?`,
  ];
  const link = storeCatalogUrl(input.storeSlug);
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

/** Contacto público para pedidos: showPhone + número WA válido. */
export function storeAcceptsWhatsAppOrders(store: {
  showPhone: boolean;
  phone: string;
  contactPhone?: string | null;
}): boolean {
  if (!store.showPhone) return false;
  return Boolean(resolveStoreContactPhone(store));
}
