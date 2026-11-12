/**
 * Smoke: camino web con identidad Clerk (`clerk:{userId}`) → tienda no-demo
 * + hint de pedidos por WhatsApp de contacto.
 * Uso: DATABASE_URL= npx tsx scripts/smoke-web-identity.ts
 */
import { handleMessage } from "../lib/bot/engine";
import { getMemoryDb } from "../lib/db/memory";
import { getConversation, getStoreForChannelIdentity } from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "clerk:user_smoke_web_identity";
const ownerEmail = "dueña@example.com";

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
      ownerEmail,
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
  await say("Hola! Quiero armar mi tienda");
  await say("Fede");
  await say("Sí", "yes");
  await say("Tienda Web Clerk");
  await say("Sí", "yes");
  await say("Sí", "yes"); // mostrar número
  await say("11 5555-8888"); // WhatsApp de pedidos
  await say(undefined, "stock_pause_mode");
  const done = await say(undefined, "checkout_whatsapp");

  const store = await getStoreForChannelIdentity(from);
  assert(store, "store created");
  assert(store.isDemo === false, "clerk identity must not be demo");
  assert(store.clerkUserId === "user_smoke_web_identity", "clerkUserId set");
  assert(store.ownerEmail === ownerEmail, "ownerEmail set");
  assert(store.slug, "slug set");
  assert(
    store.contactPhone?.includes("1155558888") ||
      store.contactPhone === "+5491155558888",
    "contact phone from onboarding",
  );

  const continuity = done.some(
    (r) =>
      r.kind === "text" &&
      /whatsapp de pedidos/i.test(r.text),
  );
  assert(continuity, "onboarding mentions WhatsApp de pedidos");

  const conv = await getConversation(from);
  assert(conv?.state === "IDLE", "conversation IDLE after onboarding");

  const menu = await say("menú");
  assert(
    menu.some(
      (r) =>
        r.kind === "text" &&
        r.options?.some(
          (o) => o.id === "menu_group_store" || o.id === "menu_store",
        ),
    ),
    "same clerk identity resumes menu",
  );
  const waGroup = await say(undefined, "menu_group_wa");
  assert(
    waGroup.some(
      (r) =>
        r.kind === "text" &&
        r.options?.some((o) => o.id === "menu_link_wa"),
    ),
    "WhatsApp group includes Vincular WhatsApp for clerk",
  );

  console.log("\nOK web identity: clerk, isDemo=false, ownerEmail, menu resume");
  console.log("ALL WEB IDENTITY SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
