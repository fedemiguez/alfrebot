/**
 * Smoke: color de acento (Fase A) — menú Personalizar / NLU / multi-intent.
 * Uso: DATABASE_URL= npx tsx scripts/smoke-accent-color.ts
 */
import { interpretFreeText, parseSetupPlan } from "../lib/bot/nlu";
import { handleMessage } from "../lib/bot/engine";
import type { OutboundMessage } from "../lib/channels/types";
import { getMemoryDb } from "../lib/db/memory";
import { getStoreForChannelIdentity } from "../lib/db/repos";
import {
  ACCENT_SWATCHES,
  matchAccentFromText,
  resolveAccentHex,
  wantsAccentColorText,
} from "../lib/store-accent";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "clerk:user_smoke_accent";

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
      messageId: `accent_${n}_${Date.now()}`,
      text,
      choiceId,
      ownerEmail: "accent@example.com",
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
  await say("Norma Accent");
  await say("Sí", "yes");
  await say("Cerámicas Accent Smoke");
  await say("Sí", "yes");
  await say("Sí", "yes");
  await say("11 5555-1212");
  await say(undefined, "stock_pause_mode");
  await say(undefined, "checkout_whatsapp");
}

async function main() {
  assert(ACCENT_SWATCHES.length >= 6, "at least 6 swatches");
  assert(resolveAccentHex(null) === "#9a3412", "default terracota");
  assert(matchAccentFromText("quiero verde")?.id === "verde", "match verde");
  assert(wantsAccentColorText("quiero verde"), "wants verde");
  assert(
    (await interpretFreeText("quiero verde")).intent === "set_accent_color",
    "nlu set_accent_color",
  );

  const plan = parseSetupPlan(
    "Me llamo Norma, la tienda se llama Verde Sur, color verde, el logo sea un plato",
  );
  assert(plan, "parseSetupPlan with color");
  assert(plan.accentColor?.toLowerCase() === "#047857", `accent=${plan.accentColor}`);
  assert(/verde/i.test(plan.accentLabel ?? ""), `label=${plan.accentLabel}`);
  console.log("unit helpers OK");

  reset();
  await onboard();
  let store = await getStoreForChannelIdentity(from);
  assert(store?.slug, "store onboarded");
  assert(store!.accentColor == null, "accent starts null");

  const menu = await say("menú");
  assert(hasOption(menu, "menu_group_store"), "store group");
  const storeMenu = await say(undefined, "menu_group_store");
  assert(hasOption(storeMenu, "menu_personalize"), "personalize in Tienda");
  const hub = await say(undefined, "menu_personalize");
  assert(hasOption(hub, "personalize_color"), "Color option");
  const pick = await say(undefined, "personalize_color");
  assert(
    ACCENT_SWATCHES.every((s) => hasOption(pick, `accent_${s.id}`)),
    "all swatches listed",
  );
  assert(hasOption(pick, "menu_cancel"), "Cancelar on pick");

  const confirm = await say(undefined, "accent_verde");
  assert(
    confirm.some(
      (r) => r.kind === "text" && /Verde|#047857/i.test(r.text),
    ),
    "confirm preview names Verde",
  );
  await say("Sí", "yes");
  store = await getStoreForChannelIdentity(from);
  assert(store?.accentColor === "#047857", `saved=${store?.accentColor}`);
  console.log("menu Personalizar → Color OK");

  // NLU “quiero azul” → confirm → guardar
  const nlu = await say("quiero azul");
  assert(
    nlu.some((r) => r.kind === "text" && /Azul|#1d4ed8/i.test(r.text)),
    "nlu opens confirm azul",
  );
  await say(undefined, "yes");
  store = await getStoreForChannelIdentity(from);
  assert(store?.accentColor === "#1d4ed8", `nlu saved=${store?.accentColor}`);
  console.log("NLU quiero azul OK");

  // Multi-intent en IDLE
  const multi = await say(
    "cambiame el color a mostaza y el logo sea un sol amarillo",
  );
  store = await getStoreForChannelIdentity(from);
  assert(
    store?.accentColor === "#a16207",
    `multi accent=${store?.accentColor}`,
  );
  assert(
    multi.some(
      (r) =>
        r.kind === "text" &&
        (/Mostaza|color/i.test(r.text) || /icono|logo|armar/i.test(r.text)),
    ),
    "multi-intent flushed accent and/or icon",
  );
  console.log("multi-intent color OK");

  // Cancelar en pick
  await say(undefined, "menu_personalize");
  await say(undefined, "personalize_color");
  await say(undefined, "menu_cancel");
  store = await getStoreForChannelIdentity(from);
  assert(store?.accentColor === "#a16207", "cancel does not clear accent");

  console.log("smoke-accent-color OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
