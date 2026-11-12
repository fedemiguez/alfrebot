/**
 * Smoke: rubro / plantillas de card (Fase B) — menú Personalizar / NLU / multi-intent.
 * Uso: DATABASE_URL= npx tsx scripts/smoke-business-kind.ts
 */
import { interpretFreeText, parseSetupPlan } from "../lib/bot/nlu";
import { handleMessage } from "../lib/bot/engine";
import type { OutboundMessage } from "../lib/channels/types";
import { getMemoryDb } from "../lib/db/memory";
import { getStoreForChannelIdentity } from "../lib/db/repos";
import {
  BUSINESS_KINDS,
  matchBusinessKindFromText,
  wantsBusinessKindText,
} from "../lib/store-business-kind";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "clerk:user_smoke_kind";

function reset() {
  const mem = getMemoryDb();
  mem.stores.clear();
  mem.products.clear();
  mem.conversations.clear();
  mem.signupIntents.clear();
  mem.channelLinkIntents?.clear();
  mem.processedMessages.clear();
}

let n = 0;
async function say(text?: string, choiceId?: string) {
  n += 1;
  const replies = await handleMessage(
    {
      channel: "simulator",
      from,
      messageId: `kind_${n}_${Date.now()}`,
      text,
      choiceId,
      ownerEmail: "kind@example.com",
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" ? r.text : `[image]`))
    .join(" | ");
  console.log(`> ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 320)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function hasOption(replies: OutboundMessage[], id: string): boolean {
  return replies.some(
    (r) => r.kind === "text" && r.options?.some((o) => o.id === id),
  );
}

async function onboard() {
  await say("Hola quiero armar mi tienda");
  await say("Norma Kind");
  await say("Sí", "yes");
  await say("Tienda Kind Smoke");
  await say("Sí", "yes");
  await say("Sí", "yes");
  await say("11 5555-3434");
  await say(undefined, "stock_pause_mode");
  await say(undefined, "checkout_whatsapp");
}

async function main() {
  assert(BUSINESS_KINDS.length === 3, "3 kinds");
  assert(matchBusinessKindFromText("vendo cerámica")?.id === "artesanal", "ceramica");
  assert(matchBusinessKindFromText("tienda de comida")?.id === "comida", "comida");
  assert(matchBusinessKindFromText("vendo ropa")?.id === "ropa", "ropa");
  assert(wantsBusinessKindText("vendo cerámica"), "wants ceramica");
  assert(
    (await interpretFreeText("vendo cerámica")).intent === "set_business_kind",
    "nlu set_business_kind",
  );

  const plan = parseSetupPlan(
    "Me llamo Norma, la tienda se llama Barro Sur, vendo cerámica, el logo sea un plato",
  );
  assert(plan, "parseSetupPlan with kind");
  assert(plan.businessKind === "artesanal", `kind=${plan.businessKind}`);
  assert(/Artesanal/i.test(plan.businessKindLabel ?? ""), `label=${plan.businessKindLabel}`);
  console.log("unit helpers OK");

  reset();
  await onboard();
  let store = await getStoreForChannelIdentity(from);
  assert(store?.slug, "store onboarded");
  assert(store!.businessKind == null, "kind starts null");

  const menu = await say("menú");
  assert(hasOption(menu, "menu_group_store"), "store group");
  const storeMenu = await say(undefined, "menu_group_store");
  assert(hasOption(storeMenu, "menu_personalize"), "personalize in Tienda");
  const hub = await say(undefined, "menu_personalize");
  assert(hasOption(hub, "personalize_color"), "Color option");
  assert(hasOption(hub, "personalize_kind"), "Rubro option");

  const pick = await say(undefined, "personalize_kind");
  assert(
    BUSINESS_KINDS.every((k) => hasOption(pick, `kind_${k.id}`)),
    "all kinds listed",
  );
  assert(hasOption(pick, "menu_cancel"), "Cancelar on pick");

  const confirm = await say(undefined, "kind_artesanal");
  assert(
    confirm.some(
      (r) => r.kind === "text" && /Artesanal/i.test(r.text),
    ),
    "confirm preview names Artesanal",
  );
  await say("Sí", "yes");
  store = await getStoreForChannelIdentity(from);
  assert(store?.businessKind === "artesanal", `saved=${store?.businessKind}`);
  console.log("menu Personalizar → Rubro OK");

  const nlu = await say("vendo comida");
  assert(
    nlu.some((r) => r.kind === "text" && /Comida/i.test(r.text)),
    "nlu opens confirm comida",
  );
  await say(undefined, "yes");
  store = await getStoreForChannelIdentity(from);
  assert(store?.businessKind === "comida", `nlu saved=${store?.businessKind}`);
  console.log("NLU vendo comida OK");

  // Multi-intent en IDLE
  const multi = await say(
    "cambiame el rubro a ropa y el logo sea un perchero",
  );
  store = await getStoreForChannelIdentity(from);
  assert(store?.businessKind === "ropa", `multi kind=${store?.businessKind}`);
  assert(
    multi.some(
      (r) =>
        r.kind === "text" &&
        (/ropa|rubro/i.test(r.text) || /icono|logo|armar/i.test(r.text)),
    ),
    "multi-intent flushed kind and/or icon",
  );
  console.log("multi-intent rubro OK");

  // Cancelar en pick
  await say(undefined, "menu_personalize");
  await say(undefined, "personalize_kind");
  await say(undefined, "menu_cancel");
  store = await getStoreForChannelIdentity(from);
  assert(store?.businessKind === "ropa", "cancel does not clear kind");

  console.log("smoke-business-kind OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
