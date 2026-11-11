/**
 * Smoke: chat web con celular AR real → tienda no-demo + hint de continuidad WA.
 * Uso: DATABASE_URL= npx tsx scripts/smoke-web-identity.ts
 */
import { handleMessage } from "../lib/bot/engine";
import { getMemoryDb } from "../lib/db/memory";
import { getConversation, getStoreByPhone } from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "+5491155558888";

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
      messageId: `webid_${n}_${Date.now()}`,
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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  reset();
  await say("Hola! Quiero armar mi tienda. Código 4242");
  await say("Fede");
  await say("Sí", "yes");
  await say("Tienda Web Identidad");
  await say("Sí", "yes");
  await say("Sí", "yes"); // mostrar número
  await say("11 5555-8888"); // WhatsApp de pedidos
  await say(undefined, "stock_pause_mode");
  const done = await say(undefined, "checkout_whatsapp");

  const store = await getStoreByPhone(from);
  assert(store, "store created");
  assert(store.isDemo === false, "real AR phone must not be demo");
  assert(store.slug, "slug set");

  const continuity = done.some(
    (r) =>
      r.kind === "text" &&
      /whatsapp desde este mismo número/i.test(r.text),
  );
  assert(continuity, "onboarding mentions WhatsApp continuity");

  const conv = await getConversation(from);
  assert(conv?.state === "IDLE", "conversation IDLE after onboarding");

  const menu = await say("menú");
  assert(
    menu.some((r) => r.kind === "text" && r.options?.some((o) => o.id === "menu_store")),
    "same phone resumes menu",
  );

  console.log("\nOK web identity: isDemo=false, continuity, menu resume");
  console.log("ALL WEB IDENTITY SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
