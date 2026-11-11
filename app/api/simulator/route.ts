import { handleMessage } from "@/lib/bot/engine";
import { createSimulatorAdapter } from "@/lib/channels/simulator";
import type { OutboundMessage } from "@/lib/channels/types";


export async function POST(req: Request) {
  const rawBody = await req.text();
  const collected: OutboundMessage[] = [];
  const adapter = createSimulatorAdapter((_to, msgs) => {
    collected.push(...msgs);
  });

  const messages = adapter.parse(rawBody);
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
}
