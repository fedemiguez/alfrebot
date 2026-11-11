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
} as const;
