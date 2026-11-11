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
  MENU_HELP: "menu_help",
  CHECKOUT_WA: "checkout_whatsapp",
  CHECKOUT_CART: "checkout_cart",
} as const;
