import type { ChannelCapabilities, Option, OutboundMessage } from "@/lib/channels/types";
import { CHOICE, withOptions } from "@/lib/bot/render";
import type { ConversationDraft } from "@/lib/db/repos";
import type { Product, Store } from "@/lib/db/schema";

export function productStatusLine(
  product: Product,
  store: Pick<Store, "tracksQuantity">,
): string {
  const bits: string[] = [];
  if (product.hidden) bits.push("oculto");
  if (!product.inStock) bits.push("agotado");
  else bits.push("disponible");
  if (store.tracksQuantity) {
    bits.push(
      product.quantity == null ? "sin cantidad" : `${product.quantity} u.`,
    );
  }
  return `${product.title} — ${bits.join(" · ")}`;
}

export function formatProductList(
  products: Product[],
  store: Pick<Store, "tracksQuantity">,
): string {
  if (products.length === 0) return "Todavía no cargaste piezas.";
  const lines = products.map((p, i) => `${i + 1}. ${productStatusLine(p, store)}`);
  return `Tus piezas:\n${lines.join("\n")}`;
}

export function stockHubMessage(
  store: Pick<Store, "tracksQuantity">,
  caps: ChannelCapabilities,
): OutboundMessage {
  const options: Option[] = [
    { id: CHOICE.STOCK_LIST, label: "Ver listado" },
    { id: CHOICE.STOCK_PICK, label: "Elegir pieza" },
    {
      id: CHOICE.STOCK_MODE,
      label: store.tracksQuantity ? "Solo pausar" : "Llevar cantidades",
    },
    { id: CHOICE.MENU_HELP, label: "Volver al menú" },
  ];
  const mode = store.tracksQuantity
    ? "Tu tienda lleva cantidades numéricas."
    : "Tu tienda solo pausa piezas (se ven como Agotado).";
  return withOptions(`${mode}\n¿Qué querés hacer?`, options, caps);
}

export function productPickOptions(products: Product[]): Option[] {
  return products.slice(0, 10).map((p) => ({
    id: `${CHOICE.STOCK_PROD_PREFIX}${p.id}`,
    label: truncateLabel(p.title, 24),
  }));
}

export function productActionOptions(
  product: Product,
  store: Pick<Store, "tracksQuantity">,
): Option[] {
  const options: Option[] = [];
  if (product.inStock) {
    options.push({ id: CHOICE.STOCK_PAUSE, label: "Pausar (agotado)" });
  } else {
    options.push({ id: CHOICE.STOCK_RESUME, label: "Reactivar" });
  }
  if (store.tracksQuantity) {
    options.push({ id: CHOICE.STOCK_SET_QTY, label: "Cambiar cantidad" });
  }
  if (product.hidden) {
    options.push({ id: CHOICE.STOCK_SHOW, label: "Mostrar en tienda" });
  } else {
    options.push({ id: CHOICE.STOCK_HIDE, label: "Ocultar" });
  }
  options.push({ id: CHOICE.CHANGE, label: "Otra pieza" });
  return options;
}

export function confirmStockMessage(
  draft: ConversationDraft,
  product: Product | null,
  store: Pick<Store, "tracksQuantity">,
  caps: ChannelCapabilities,
): OutboundMessage {
  const action = draft.stockAction;
  let text = "¿Confirmamos?";
  if (action === "set_mode") {
    text = draft.stockModePending
      ? "¿Pasamos a llevar cantidades numéricas por pieza?"
      : "¿Pasamos a solo pausar (sin cantidades)?";
  } else if (product) {
    if (action === "pause") {
      text = `¿Marcamos "${product.title}" como agotado?`;
    } else if (action === "resume") {
      text = store.tracksQuantity
        ? `¿Reactivamos "${product.title}"? Después te pido la cantidad.`
        : `¿Reactivamos "${product.title}"?`;
    } else if (action === "set_qty") {
      text = `¿Dejamos "${product.title}" con ${draft.stockQtyPending ?? 0} unidades?`;
    } else if (action === "hide") {
      text = `¿Ocultamos "${product.title}" de la tienda? (no se borra)`;
    } else if (action === "show") {
      text = `¿Volvemos a mostrar "${product.title}" en la tienda?`;
    }
  }
  return withOptions(
    text,
    [
      { id: CHOICE.YES, label: "Sí, guardar" },
      { id: CHOICE.NO, label: "No" },
    ],
    caps,
  );
}

export function parseQuantityInput(raw: string): number | null {
  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/unidades?|u\.?/g, "")
    .trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 99999) return null;
  return n;
}

export function resolveChoiceId(
  choiceId: string | undefined,
  text: string | undefined,
  pendingChoices: string[] | undefined,
): string | undefined {
  if (choiceId) return choiceId;
  const t = text?.trim();
  if (!t || !pendingChoices?.length) return undefined;
  if (/^\d{1,2}$/.test(t)) {
    const idx = Number(t) - 1;
    if (idx >= 0 && idx < pendingChoices.length) return pendingChoices[idx];
  }
  return undefined;
}

export function withPendingChoices(
  draft: ConversationDraft,
  msg: OutboundMessage,
): { draft: ConversationDraft; message: OutboundMessage } {
  const options = msg.kind === "text" || msg.kind === "image" ? msg.options : undefined;
  if (!options?.length) {
    return { draft: { ...draft, pendingChoices: undefined }, message: msg };
  }
  return {
    draft: { ...draft, pendingChoices: options.map((o) => o.id) },
    message: msg,
  };
}

function truncateLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}
