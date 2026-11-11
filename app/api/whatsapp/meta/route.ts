import { after } from "next/server";
import { handleMessage } from "@/lib/bot/engine";
import { metaAdapter, verifyMetaWebhookGet } from "@/lib/channels/meta";


export async function GET(req: Request) {
  return verifyMetaWebhookGet(new URL(req.url));
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  const ok = await metaAdapter.verify(req, rawBody);
  if (!ok) {
    // Sin secret configurado devolvemos 503 para no fingir producción
    if (!process.env.META_APP_SECRET?.trim()) {
      return Response.json(
        {
          ok: false,
          error:
            "Meta no configurado. Usá /probar o seteá META_APP_SECRET y el resto de variables.",
        },
        { status: 503 },
      );
    }
    return new Response("Unauthorized", { status: 401 });
  }

  const inbound = metaAdapter.parse(rawBody);

  // Responder 200 inmediato; procesar después (Meta reintenta si tardamos)
  after(async () => {
    for (const msg of inbound) {
      try {
        const replies = await handleMessage(msg, metaAdapter.capabilities);
        await metaAdapter.send(msg.from, replies);
      } catch (err) {
        console.error("[meta webhook] handle failed", err);
      }
    }
  });

  return new Response("EVENT_RECEIVED", { status: 200 });
}
