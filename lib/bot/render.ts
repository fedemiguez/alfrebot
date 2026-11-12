import type { ChannelCapabilities, Option, OutboundMessage } from "@/lib/channels/types";

export function withOptions(
  text: string,
  options: Option[] | undefined,
  caps: ChannelCapabilities,
): OutboundMessage {
  if (!options?.length) return { kind: "text", text };

  if (caps.buttons && options.length <= caps.maxButtons) {
    return { kind: "text", text, options };
  }

  if (caps.buttons && options.length <= caps.maxListRows) {
    return { kind: "text", text, options };
  }

  const lines = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  return {
    kind: "text",
    text: `${text}\n\nRespondé con el número:\n${lines}`,
  };
}

/** Segmentos de texto con URLs detectadas (http/https, www, dominios tipo alfrebot.com.ar/…). */
export type TextSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const URL_FIND_RE =
  /https?:\/\/[^\s<]+|(?:www\.)[^\s<]+|(?:(?<![@\w./-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com\.ar|com|ar|net|org|io|app|dev)(?:\/[^\s<]*)?)/gi;

function trimTrailingPunctuation(url: string): { core: string; trail: string } {
  const m = url.match(/^(.*?)([),.!?;:]+)$/);
  if (!m) return { core: url, trail: "" };
  // Keep balanced path chars; strip only clear sentence punctuation
  return { core: m[1]!, trail: m[2]! };
}

function toHref(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function segmentUrls(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let last = 0;
  const re = new RegExp(URL_FIND_RE.source, URL_FIND_RE.flags);
  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > last) {
      segments.push({ type: "text", value: text.slice(last, idx) });
    }
    const raw = match[0]!;
    const { core, trail } = trimTrailingPunctuation(raw);
    if (core) {
      segments.push({ type: "link", value: core, href: toHref(core) });
    }
    if (trail) {
      segments.push({ type: "text", value: trail });
    }
    last = idx + raw.length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments.length ? segments : [{ type: "text", value: text }];
}

export function imageWithOptions(
  url: string,
  caption: string,
  options: Option[] | undefined,
  caps: ChannelCapabilities,
): OutboundMessage[] {
  if (!options?.length) {
    return [{ kind: "image", url, caption }];
  }
  return [
    { kind: "image", url, caption },
    withOptions("¿Qué hacemos?", options, caps),
  ];
}

export const CHOICE = {
  YES: "yes",
  NO: "no",
  CHANGE: "change",
  SKIP: "skip",
  PUBLISH: "publish",
  MENU_ADD: "menu_add",
  MENU_STORE: "menu_store",
  MENU_STOCK: "menu_stock",
  MENU_PRICE: "menu_price",
  MENU_PHOTO: "menu_photo",
  MENU_ICON: "menu_icon",
  MENU_CONTACT: "menu_contact",
  /** Generar código para gestionar la misma tienda desde WhatsApp. */
  MENU_LINK_WA: "menu_link_wa",
  /** En WhatsApp: ya armé la tienda en la web. */
  LINK_EXISTING: "link_existing",
  MENU_HELP: "menu_help",
  /** Volver al menú principal (no confundir con Ayuda). */
  MENU_BACK: "menu_back",
  /** Armar icono PWA con el bot (AI/monograma). */
  ICON_GENERATE: "icon_generate",
  /** Subir imagen propia como icono de la tienda. */
  ICON_UPLOAD: "icon_upload",
  /** Regenerar icono PWA. */
  ICON_REGEN: "icon_regen",
  /** Cerrar flujo de icono. */
  ICON_DONE: "icon_done",
  CHECKOUT_WA: "checkout_whatsapp",
  CHECKOUT_CART: "checkout_cart",
  CONTACT_SAME: "contact_same",
  CONTACT_OTHER: "contact_other",
  STOCK_LIST: "stock_list",
  STOCK_PICK: "stock_pick",
  STOCK_MODE: "stock_mode",
  STOCK_PAUSE: "stock_pause",
  STOCK_RESUME: "stock_resume",
  STOCK_SET_QTY: "stock_set_qty",
  STOCK_SET_PRICE: "stock_set_price",
  STOCK_CHANGE_PHOTO: "stock_change_photo",
  STOCK_HIDE: "stock_hide",
  STOCK_SHOW: "stock_show",
  STOCK_QTY_MODE: "stock_qty_mode",
  STOCK_PAUSE_MODE: "stock_pause_mode",
  /** Prefijo de id al elegir producto: stock_prod_<uuid> */
  STOCK_PROD_PREFIX: "stock_prod_",
} as const;
