/**
 * Smoke TN-93: no usar frases de intención/saludo como nombre de tienda.
 * Uso: DATABASE_URL= npx tsx scripts/smoke-store-name-intent.ts
 */
import { handleMessage } from "../lib/bot/engine";
import {
  isStoreCreateIntentPhrase,
  isUsableStoreName,
  parseSetupPlan,
} from "../lib/bot/nlu";
import { getMemoryDb } from "../lib/db/memory";
import { getConversation, getStoreForChannelIdentity } from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "clerk:user_smoke_store_name_intent";

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
      messageId: `sn_${n}_${Date.now()}`,
      text,
      choiceId,
      ownerEmail: "store-name@example.com",
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" || r.kind === "sign_out" ? r.text : `[image]`))
    .join(" | ");
  console.log(`> ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 280)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function onboardToAskStore() {
  await say("Hola! Quiero armar mi tienda");
  await say("Fede");
  await say("Sí", "yes");
  const conv = await getConversation(from);
  assert(conv?.state === "ASK_STORE", `expected ASK_STORE, got ${conv?.state}`);
}

async function main() {
  assert(
    isStoreCreateIntentPhrase("Hola! Quiero armar mi tienda"),
    "hola armar = intent",
  );
  assert(
    isStoreCreateIntentPhrase("Quiero crear mi tienda y cargar 3 productos"),
    "crear + productos = intent",
  );
  assert(
    isStoreCreateIntentPhrase("hola quiero armar mi tienda"),
    "hola quiero armar = intent",
  );
  assert(
    isStoreCreateIntentPhrase("Hola! Quiero armar mi tienda desde la web."),
    "cta web = intent",
  );
  assert(
    isStoreCreateIntentPhrase(
      "Hola! Quiero seguir armando mi tienda desde la web.",
    ),
    "cta legacy seguir armando = intent",
  );
  assert(
    !isUsableStoreName("Hola! Quiero armar mi tienda"),
    "hola armar not usable name",
  );
  assert(
    !isUsableStoreName("Quiero crear mi tienda y cargar 3 productos"),
    "crear+productos not usable name",
  );
  assert(isUsableStoreName("Cerámicas de Norma"), "real name ok");
  assert(
    !isStoreCreateIntentPhrase("la tienda se llama Cerámicas de Norma"),
    "explicit name is not bare intent",
  );
  assert(
    parseSetupPlan(
      "Me llamo Norma, la tienda se llama Cerámicas del Sur, productos: jarra, plato",
    )?.storeName?.toLowerCase().includes("cerámic") ||
      parseSetupPlan(
        "Me llamo Norma, la tienda se llama Cerámicas del Sur, productos: jarra, plato",
      )?.storeName?.toLowerCase().includes("ceramic"),
    "parseSetupPlan still extracts real store name",
  );
  console.log("nlu helpers OK");

  // ——— Bug path: intent phrase at ASK_STORE must re-ask, not slugify ———
  reset();
  n = 0;
  await onboardToAskStore();
  const intentReplies = await say("Quiero crear mi tienda y cargar 3 productos");
  const convAfterIntent = await getConversation(from);
  const draftAfter = convAfterIntent?.draft as
    | { storeName?: string; slug?: string }
    | undefined;
  assert(
    convAfterIntent?.state === "ASK_STORE",
    `intent must stay ASK_STORE, got ${convAfterIntent?.state}`,
  );
  assert(!draftAfter?.storeName, `storeName must stay empty, got ${draftAfter?.storeName}`);
  assert(!draftAfter?.slug, `slug must stay empty, got ${draftAfter?.slug}`);
  assert(
    intentReplies.some(
      (r) =>
        r.kind === "text" &&
        /c[oó]mo quer[eé]s que se llame tu tienda/i.test(r.text),
    ),
    "must ask for store name again",
  );

  const holaPath = async () => {
    reset();
    n = 0;
    await onboardToAskStore();
    await say("Hola! Quiero armar mi tienda");
    const conv = await getConversation(from);
    assert(conv?.state === "ASK_STORE", `hola intent → ASK_STORE, got ${conv?.state}`);
    assert(
      !(conv?.draft as { slug?: string } | undefined)?.slug?.includes("hola-quiero"),
      `must not create hola-quiero slug: ${(conv?.draft as { slug?: string })?.slug}`,
    );
  };
  await holaPath();
  console.log("ASK_STORE rejects intent phrases OK");

  // ——— Real name still works; existing store not renamed from intent ———
  reset();
  n = 0;
  await onboardToAskStore();
  await say("Cerámicas de Norma");
  await say("Sí", "yes"); // confirm slug
  await say("Sí", "yes"); // show phone
  await say("11 5555-9999");
  await say(undefined, "stock_pause_mode");
  await say(undefined, "checkout_whatsapp");

  const store = await getStoreForChannelIdentity(from);
  assert(store, "store created");
  assert(
    /ceram/i.test(store.name ?? "") || /cerám/i.test(store.name ?? ""),
    `store name=${store.name}`,
  );
  assert(
    !/quiero|armar|hola/i.test(store.name ?? ""),
    `store name must not be intent: ${store.name}`,
  );
  assert(
    !/hola-quiero|quiero-crear/i.test(store.slug ?? ""),
    `slug must not be intent: ${store.slug}`,
  );

  const beforeName = store.name;
  const beforeSlug = store.slug;
  await say("Quiero crear mi tienda y cargar 3 productos");
  const after = await getStoreForChannelIdentity(from);
  assert(after?.name === beforeName, `name overwritten: ${after?.name}`);
  assert(after?.slug === beforeSlug, `slug overwritten: ${after?.slug}`);

  console.log("smoke-store-name-intent OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
