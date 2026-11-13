/**
 * Smoke: multi-intent (tienda + logo + productos en un mensaje).
 * Uso: DATABASE_URL= npx tsx scripts/smoke-multi-intent.ts
 */
import { parseSetupPlan } from "../lib/bot/nlu";
import { handleMessage } from "../lib/bot/engine";
import { getMemoryDb } from "../lib/db/memory";
import { getConversation, getStoreForChannelIdentity } from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "clerk:user_smoke_multi_intent";

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
      messageId: `multi_${n}_${Date.now()}`,
      text,
      choiceId,
      ownerEmail: "multi@example.com",
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" || r.kind === "sign_out" ? r.text : `[image] `))
    .join(" | ");
  console.log(`> ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 320)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const parsed = parseSetupPlan(
    "Me llamo Norma, la tienda se llama Cerámicas del Sur, el logo sea un plato azul, productos: jarra, plato, taza; después las fotos",
  );
  assert(parsed, "parseSetupPlan returns plan");
  assert(parsed.ownerName === "Norma", `ownerName=${parsed.ownerName}`);
  assert(
    parsed.storeName?.toLowerCase().includes("cerámicas") ||
      parsed.storeName?.toLowerCase().includes("ceramicas"),
    `storeName=${parsed.storeName}`,
  );
  assert(parsed.iconMode === "generate", "icon generate");
  assert(
    parsed.productTitles?.length === 3,
    `products=${parsed.productTitles?.join(",")}`,
  );
  assert(parsed.deferPhotos === true, "defer photos");
  console.log("parseSetupPlan OK", parsed);

  reset();
  await say("Hola! Quiero armar mi tienda");
  await say(
    "Me llamo Norma, la tienda se llama Cerámicas del Sur, el logo sea un plato azul, productos: jarra, plato, taza; después las fotos",
  );
  await say("Sí", "yes"); // confirm name → should jump to confirm slug
  await say("Sí", "yes"); // confirm slug
  await say("Sí", "yes"); // show phone
  await say("11 5555-7777");
  await say(undefined, "stock_pause_mode");
  const done = await say(undefined, "checkout_whatsapp");

  const store = await getStoreForChannelIdentity(from);
  assert(store, "store created");
  assert(store.slug, "slug set");
  assert(
    /ceramic/i.test(store.name ?? "") || /cerámic/i.test(store.name ?? ""),
    `store name=${store.name}`,
  );

  const conv = await getConversation(from);
  const plan = (conv?.draft as { pendingSetupPlan?: { productTitles?: string[] } } | undefined)
    ?.pendingSetupPlan;
  assert(
    (plan?.productTitles?.length ?? 0) > 0 ||
      done.some(
        (r) =>
          r.kind === "text" &&
          (/cola|jarra|plato|logo|icono|anoté/i.test(r.text) ||
            /plato azul/i.test(r.text)),
      ),
    "plan flushed or products queued in replies",
  );

  console.log("smoke-multi-intent OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
