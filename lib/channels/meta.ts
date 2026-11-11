import { createHmac, timingSafeEqual } from "crypto";
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from "@/lib/channels/types";

/**
 * Stub listo para Meta Cloud API.
 * Cuando haya META_* en env, verify/parse/send funcionan contra Graph.
 * Sin credenciales, verify falla y send no-op con log.
 */
function graphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || "v21.0";
}

function accessToken(): string | undefined {
  return process.env.META_ACCESS_TOKEN?.trim();
}

function phoneNumberId(): string | undefined {
  return process.env.META_PHONE_NUMBER_ID?.trim();
}

function appSecret(): string | undefined {
  return process.env.META_APP_SECRET?.trim();
}

export function verifyMetaWebhookGet(url: URL): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = appSecret();
  if (!secret) return false;
  const header = req.headers.get("x-hub-signature-256");
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = header.slice("sha256=".length);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

function parseMetaPayload(rawBody: string): InboundMessage[] {
  const data = JSON.parse(rawBody) as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id: string;
            from: string;
            type: string;
            text?: { body: string };
            image?: { id: string; mime_type?: string; caption?: string };
            audio?: { id: string; mime_type?: string };
            interactive?: {
              button_reply?: { id: string; title: string };
              list_reply?: { id: string; title: string };
            };
          }>;
          statuses?: unknown[];
        };
      }>;
    }>;
  };

  const out: InboundMessage[] = [];
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? [];
      for (const m of messages) {
        const from = m.from.startsWith("+") ? m.from : `+${m.from}`;
        const choiceId =
          m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
        let text = m.text?.body;
        if (m.image?.caption) text = m.image.caption;
        let media: InboundMessage["media"];
        if (m.type === "image" && m.image?.id) {
          const mediaId = m.image.id;
          const mime = m.image.mime_type ?? "image/jpeg";
          media = {
            kind: "image",
            mime,
            fetch: () => fetchMetaMedia(mediaId),
          };
        }
        if (m.type === "audio" && m.audio?.id) {
          const mediaId = m.audio.id;
          const mime = m.audio.mime_type ?? "audio/ogg";
          media = {
            kind: "audio",
            mime,
            fetch: () => fetchMetaMedia(mediaId),
          };
        }
        out.push({
          channel: "meta",
          from,
          messageId: m.id,
          text,
          choiceId,
          media,
        });
      }
    }
  }
  return out;
}

async function fetchMetaMedia(mediaId: string): Promise<Blob> {
  const token = accessToken();
  if (!token) throw new Error("META_ACCESS_TOKEN missing");
  const metaRes = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!metaRes.ok) throw new Error(`Meta media lookup failed: ${metaRes.status}`);
  const metaJson = (await metaRes.json()) as { url?: string };
  if (!metaJson.url) throw new Error("Meta media URL missing");
  const bin = await fetch(metaJson.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!bin.ok) throw new Error(`Meta media download failed: ${bin.status}`);
  return bin.blob();
}

async function sendMeta(to: string, msgs: OutboundMessage[]): Promise<void> {
  const token = accessToken();
  const phoneId = phoneNumberId();
  if (!token || !phoneId) {
    console.warn("[meta] send skipped: missing META_ACCESS_TOKEN or META_PHONE_NUMBER_ID");
    return;
  }

  const toDigits = to.replace(/\D/g, "");
  for (const msg of msgs) {
    const body = buildWhatsAppPayload(toDigits, msg);
    const res = await fetch(
      `https://graph.facebook.com/${graphVersion()}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error("[meta] send failed", res.status, errText);
    }
  }
}

function buildWhatsAppPayload(to: string, msg: OutboundMessage) {
  const interactive = msg.options?.length
    ? msg.options.length <= 3
      ? {
          type: "button",
          body: { text: msg.kind === "text" ? msg.text : msg.caption || "Elegí una opción" },
          action: {
            buttons: msg.options.slice(0, 3).map((o) => ({
              type: "reply",
              reply: { id: o.id, title: o.label.slice(0, 20) },
            })),
          },
        }
      : {
          type: "list",
          body: { text: msg.kind === "text" ? msg.text : msg.caption || "Elegí una opción" },
          action: {
            button: "Ver opciones",
            sections: [
              {
                title: "Opciones",
                rows: msg.options.slice(0, 10).map((o) => ({
                  id: o.id,
                  title: o.label.slice(0, 24),
                })),
              },
            ],
          },
        }
    : undefined;

  if (msg.kind === "image") {
    if (interactive) {
      return {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive,
      };
    }
    return {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link: msg.url, caption: msg.caption },
    };
  }

  if (interactive) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    };
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: msg.text },
  };
}

export const metaAdapter: ChannelAdapter = {
  capabilities: {
    buttons: true,
    maxButtons: 3,
    maxListRows: 10,
  },
  verify: verifySignature,
  parse: parseMetaPayload,
  send: sendMeta,
};
