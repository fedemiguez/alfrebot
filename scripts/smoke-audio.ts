/**
 * Smoke: audio → STT mock → flujo de precio / stock sin llamar a Gemini.
 * Uso: npx tsx --env-file=.env.local scripts/smoke-audio.ts
 * (sin DATABASE_URL usa memoria)
 */
import { handleMessage } from "../lib/bot/engine";
import { setTranscribeImplForTests } from "../lib/bot/transcribe";
import { getMemoryDb } from "../lib/db/memory";
import {
  createProduct,
  getConversation,
  getProduct,
  getStoreByPhone,
  saveConversation,
} from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "+01155558888";

function reset() {
  const mem = getMemoryDb();
  mem.stores.clear();
  mem.products.clear();
  mem.conversations.clear();
  mem.signupIntents.clear();
  mem.processedMessages.clear();
}

let n = 0;
async function say(text?: string, choiceId?: string) {
  n += 1;
  const replies = await handleMessage(
    {
      channel: "simulator",
      from,
      messageId: `smoke_a_${n}_${Date.now()}`,
      text,
      choiceId,
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" ? r.text : `[image] ${r.caption || ""}`))
    .join(" | ");
  console.log(`> ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 280)}`);
  return replies;
}

async function sayAudio(transcript: string | null) {
  n += 1;
  setTranscribeImplForTests(async () => transcript);
  const replies = await handleMessage(
    {
      channel: "simulator",
      from,
      messageId: `smoke_aud_${n}_${Date.now()}`,
      media: {
        kind: "audio",
        mime: "audio/webm",
        fetch: async () => new Blob([new Uint8Array(256)], { type: "audio/webm" }),
      },
    },
    caps,
  );
  setTranscribeImplForTests(null);
  const flat = replies
    .map((r) => (r.kind === "text" ? r.text : `[image] ${r.caption || ""}`))
    .join(" | ");
  console.log(`> [audio→${transcript ?? "null"}]`);
  console.log(`< ${flat.slice(0, 280)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  reset();

  // Sin STT: mensaje claro, no rompe
  const fail = await sayAudio(null);
  assert(
    fail.some((r) => r.kind === "text" && /No pude (escuchar|entender)/.test(r.text)),
    "fallback sin transcript",
  );
  console.log("OK fallback sin STT");

  // Onboarding mínimo hasta IDLE (simulador pide WhatsApp de pedidos)
  await say("Empezar");
  await say("Norma");
  await say("Sí", "yes");
  await say("Cerámicas Audio");
  await say("Sí", "yes");
  await say("Sí", "yes");
  await say("11 5555-8888");
  await say(undefined, "stock_qty_mode");
  await say(undefined, "checkout_whatsapp");

  const store = await getStoreByPhone(from);
  assert(store, "store");
  assert(store.tracksQuantity === true, "tracks qty");

  // Forzar PRODUCT_PRICE y mandar precio por audio
  await saveConversation({
    phone: from,
    channel: "simulator",
    state: "PRODUCT_PRICE",
    draft: {
      product: {
        title: "Taza audio",
        imageUrl: "/demo/taza.svg",
      },
    },
  });

  const priceReplies = await sayAudio("quince mil");
  assert(
    priceReplies.some((r) => r.kind === "text" && /Te escuché: «quince mil»/.test(r.text)),
    "eco transcript",
  );
  assert(
    priceReplies.some(
      (r) =>
        r.kind === "text" &&
        /contar algo|escribir, mandar un audio|Saltar/i.test(r.text),
    ),
    "avanzó a descripción",
  );
  const conv = await getConversation(from);
  assert(conv?.state === "PRODUCT_DESC", `state PRODUCT_DESC got ${conv?.state}`);
  console.log("OK audio precio → PRODUCT_DESC");

  // Stock: audio "listado" desde IDLE
  await saveConversation({
    phone: from,
    channel: "simulator",
    state: "IDLE",
    draft: {},
  });
  await createProduct({
    storeId: store.id,
    title: "Plato audio",
    priceCents: 800000,
    imageUrl: "/demo/plato.svg",
    quantity: 2,
  });
  const listReplies = await sayAudio("mostrame el stock");
  assert(
    listReplies.some((r) => r.kind === "text" && /Plato audio/.test(r.text)),
    "listado por audio",
  );
  console.log("OK audio listado");

  // Cantidad hablada
  const products = await (await import("../lib/db/repos")).listProductsByStore(store.id, {
    includeHidden: true,
  });
  const p = products[0]!;
  await saveConversation({
    phone: from,
    channel: "simulator",
    state: "STOCK_QTY",
    draft: {
      stockProductId: p.id,
      stockAction: "set_qty",
    },
  });
  const qtyReplies = await sayAudio("quedan tres");
  assert(
    qtyReplies.some((r) => r.kind === "text" && /3 unidades|con 3/.test(r.text)),
    "qty hablada",
  );
  await say("Sí", "yes");
  const updated = await getProduct(p.id);
  assert(updated?.quantity === 3, `qty 3 got ${updated?.quantity}`);
  console.log("OK audio cantidad hablada");

  console.log("\nSMOKE AUDIO OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
