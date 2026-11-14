/**
 * Smoke TN-112: CTA web → WhatsApp responde welcome completo (misma copy que /asistente),
 * no el menú corto «¿Qué querés hacer?».
 * Uso: DATABASE_URL= npx tsx scripts/smoke-whatsapp-welcome-cta.ts
 */
import { handleMessage } from "../lib/bot/engine";
import { isStoreCreateIntentPhrase } from "../lib/bot/nlu";
import { welcomeMainMessage } from "../lib/bot/welcome-copy";
import { getMemoryDb } from "../lib/db/memory";
import {
  getConversation,
  saveConversation,
  upsertStore,
} from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const fromWa = "+5491155557777";

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
      channel: "meta",
      from: fromWa,
      messageId: `wa_welcome_${n}_${Date.now()}`,
      text,
      choiceId,
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" || r.kind === "sign_out" ? r.text : `[image]`))
    .join(" | ");
  console.log(`> ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 220)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertFullWelcome(
  replies: Awaited<ReturnType<typeof handleMessage>>,
  label: string,
) {
  const body = replies
    .map((r) => (r.kind === "text" ? r.text : ""))
    .join("\n");
  assert(/Soy Alfrebot/i.test(body), `${label}: missing Alfrebot intro`);
  assert(/Cargar o cambiar productos/i.test(body), `${label}: missing 1. productos`);
  assert(/Cambiar colores o estilo/i.test(body), `${label}: missing 2. colores`);
  assert(
    /Recibir pedidos en tu WhatsApp/i.test(body),
    `${label}: missing 3. pedidos`,
  );
  assert(/Menú.*Ayuda.*Cancelar/i.test(body), `${label}: missing tip`);
  assert(
    replies.some(
      (r) =>
        r.kind === "text" &&
        r.options?.some((o) => o.id === "menu_group_products"),
    ),
    `${label}: menu options attached`,
  );
  assert(!/¡Hola de nuevo/i.test(body), `${label}: must not use short welcomeBack`);
}

async function main() {
  const ctaNew = "Hola! Quiero armar mi tienda desde la web.";
  const ctaLegacy = "Hola! Quiero seguir armando mi tienda desde la web.";

  assert(isStoreCreateIntentPhrase(ctaNew), "cta new = intent");
  assert(isStoreCreateIntentPhrase(ctaLegacy), "cta legacy = intent");
  assert(
    isStoreCreateIntentPhrase("Hola! Quiero armar mi tienda"),
    "cta short = intent",
  );
  assert(
    /Soy Alfrebot/i.test(
      welcomeMainMessage({ firstName: "Norma", closing: "owner" }),
    ),
    "welcomeMainMessage owner ok",
  );

  // ——— NEW sin tienda: welcome onboarding ———
  reset();
  n = 0;
  const fresh = await say(ctaNew);
  const freshBody = fresh.map((r) => (r.kind === "text" ? r.text : "")).join("\n");
  assert(/Soy Alfrebot/i.test(freshBody), "NEW: full welcome");
  assert(/cómo te llamás/i.test(freshBody), "NEW: ask name");

  // ——— IDLE + CTA (bug path screenshot): welcome completo + menú ———
  reset();
  n = 0;
  await upsertStore({
    channelIdentity: fromWa,
    ownerName: "Norma",
    name: "Cerámicas Norma",
    slug: "ceramicas-norma-welcome",
    showPhone: true,
    status: "active",
    isDemo: false,
    contactPhone: fromWa,
  });
  await saveConversation({
    channelIdentity: fromWa,
    channel: "meta",
    state: "IDLE",
    draft: {
      ownerName: "Norma",
      storeName: "Cerámicas Norma",
      slug: "ceramicas-norma-welcome",
    },
  });

  assertFullWelcome(await say(ctaNew), "IDLE cta");
  assertFullWelcome(await say(ctaLegacy), "IDLE legacy seguir");

  const shortMenu = await say("menú");
  const shortBody = shortMenu
    .map((r) => (r.kind === "text" ? r.text : ""))
    .join("\n");
  assert(
    shortBody.includes("¿Qué querés hacer?") && !/Soy Alfrebot/i.test(shortBody),
    "menú command stays short",
  );

  // ——— NEW + tienda ya en channelIdentity → welcome completo ———
  reset();
  n = 0;
  await upsertStore({
    channelIdentity: fromWa,
    ownerName: "Norma",
    name: "Cerámicas Norma",
    slug: "ceramicas-norma-reentry",
    showPhone: true,
    status: "active",
    isDemo: false,
    contactPhone: fromWa,
  });
  assertFullWelcome(await say(ctaNew), "NEW+existing store");

  const conv = await getConversation(fromWa);
  assert(conv?.state === "IDLE", "reentry leaves IDLE");

  console.log("smoke-whatsapp-welcome-cta OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
