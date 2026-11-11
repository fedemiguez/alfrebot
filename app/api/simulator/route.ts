import { handleMessage } from "@/lib/bot/engine";
import { createSimulatorAdapter } from "@/lib/channels/simulator";
import type { OutboundMessage } from "@/lib/channels/types";

/** STT + motor pueden tardar; evita corte a los 10s por defecto en Hobby. */
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const collected: OutboundMessage[] = [];
    const adapter = createSimulatorAdapter((_to, msgs) => {
      collected.push(...msgs);
    });

    const messages = adapter.parse(rawBody);
    for (const msg of messages) {
      if (!msg.from) {
        return Response.json(
          { ok: false, error: "from (teléfono) requerido" },
          { status: 400 },
        );
      }
    }

    const replies: OutboundMessage[] = [];
    for (const msg of messages) {
      const out = await handleMessage(msg, adapter.capabilities);
      replies.push(...out);
      await adapter.send(msg.from, out);
    }

    return Response.json({
      ok: true,
      replies: replies.length ? replies : collected,
    });
  } catch (err) {
    console.error("[simulator] failed", err);
    const message = err instanceof Error ? err.message : "simulator failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
