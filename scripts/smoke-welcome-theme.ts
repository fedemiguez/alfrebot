/**
 * Smoke: frase de bienvenida + temas de fondo (Fase C).
 * Uso: DATABASE_URL= npx tsx scripts/smoke-welcome-theme.ts
 */
import { interpretFreeText, parseSetupPlan } from "../lib/bot/nlu";
import { handleMessage } from "../lib/bot/engine";
import type { OutboundMessage } from "../lib/channels/types";
import { getMemoryDb } from "../lib/db/memory";
import { getStoreForChannelIdentity } from "../lib/db/repos";
import {
  STORE_THEMES,
  matchThemeFromText,
  wantsStoreThemeText,
} from "../lib/store-theme";
import {
  extractWelcomeFromText,
  wantsWelcomeMessageText,
} from "../lib/store-welcome";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "clerk:user_smoke_welcome_theme";

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
      messageId: `wt_${n}_${Date.now()}`,
      text,
      choiceId,
      ownerEmail: "welcome-theme@example.com",
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" ? r.text : `[image]`))
    .join(" | ");
  console.log(`> ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 360)}`);
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
  await say("Norma Theme");
  await say("Sí", "yes");
  await say("Tienda Theme Smoke");
  await say("Sí", "yes");
  await say("Sí", "yes");
  await say("11 5555-4545");
  await say(undefined, "stock_pause_mode");
  await say(undefined, "checkout_whatsapp");
}

async function main() {
  assert(STORE_THEMES.length === 3, "3 themes");
  assert(matchThemeFromText("tema oscuro")?.id === "oscuro", "oscuro");
  assert(matchThemeFromText("estilo crema")?.id === "crema", "crema");
  assert(matchThemeFromText("fondo claro")?.id === "claro", "claro");
  assert(wantsStoreThemeText("quiero tema oscuro"), "wants theme");
  assert(
    (await interpretFreeText("tema oscuro")).intent === "set_store_theme",
    "nlu set_store_theme",
  );

  assert(
    extractWelcomeFromText("decí que retiro en el local") ===
      "retiro en el local",
    "extract welcome",
  );
  assert(wantsWelcomeMessageText("decí que envíos a todo el país"), "wants welcome");
  assert(
    (await interpretFreeText("decí que retiro en taller")).intent ===
      "set_welcome_message",
    "nlu set_welcome_message",
  );

  const plan = parseSetupPlan(
    "Me llamo Norma, la tienda se llama Barro Sur, tema oscuro, decí que retiro en el local",
  );
  assert(plan, "parseSetupPlan");
  assert(plan.theme === "oscuro", `theme=${plan.theme}`);
  assert(
    /retiro en el local/i.test(plan.welcomeMessage ?? ""),
    `welcome=${plan.welcomeMessage}`,
  );
  console.log("unit helpers OK");

  reset();
  await onboard();
  let store = await getStoreForChannelIdentity(from);
  assert(store?.slug, "store onboarded");
  assert(store!.theme == null, "theme starts null");
  assert(store!.welcomeMessage == null, "welcome starts null");

  const menu = await say("menú");
  assert(hasOption(menu, "menu_group_store"), "store group");
  const storeMenu = await say(undefined, "menu_group_store");
  assert(hasOption(storeMenu, "menu_personalize"), "personalize in Tienda");
  const hub = await say(undefined, "menu_personalize");
  assert(hasOption(hub, "personalize_color"), "Color");
  assert(hasOption(hub, "personalize_theme"), "Estilo");
  assert(hasOption(hub, "personalize_kind"), "Rubro");
  assert(hasOption(hub, "personalize_welcome"), "Frase");

  const pickTheme = await say(undefined, "personalize_theme");
  assert(
    STORE_THEMES.every((t) => hasOption(pickTheme, `theme_${t.id}`)),
    "all themes listed",
  );
  assert(hasOption(pickTheme, "menu_cancel"), "Cancelar on theme pick");

  const confirmTheme = await say(undefined, "theme_oscuro");
  assert(
    confirmTheme.some(
      (r) => r.kind === "text" && /Oscuro suave/i.test(r.text),
    ),
    "confirm preview names Oscuro suave",
  );
  await say("Sí", "yes");
  store = await getStoreForChannelIdentity(from);
  assert(store?.theme === "oscuro", `saved theme=${store?.theme}`);
  console.log("menu Personalizar → Estilo OK");

  const askWelcome = await say(undefined, "menu_personalize");
  assert(hasOption(askWelcome, "personalize_welcome"), "welcome in hub");
  await say(undefined, "personalize_welcome");
  const confirmWelcome = await say("Envíos a todo el país");
  assert(
    confirmWelcome.some(
      (r) => r.kind === "text" && /Envíos a todo el país/i.test(r.text),
    ),
    "confirm preview frase",
  );
  await say("Sí", "yes");
  store = await getStoreForChannelIdentity(from);
  assert(
    store?.welcomeMessage === "Envíos a todo el país",
    `saved welcome=${store?.welcomeMessage}`,
  );
  console.log("menu Personalizar → Frase OK");

  assert(
    parseSetupPlan("estilo crema") == null,
    "solo «estilo crema» no es multi-intent",
  );
  const nluTheme = await say("estilo crema");
  assert(
    nluTheme.some((r) => r.kind === "text" && /Crema artesanal/i.test(r.text)),
    "nlu opens confirm crema",
  );
  await say(undefined, "yes");
  store = await getStoreForChannelIdentity(from);
  assert(store?.theme === "crema", `nlu theme=${store?.theme}`);
  console.log("NLU estilo crema OK");

  const nluWelcome = await say("decí que retiro en taller");
  assert(
    nluWelcome.some((r) => r.kind === "text" && /retiro en taller/i.test(r.text)),
    "nlu opens confirm welcome",
  );
  await say(undefined, "yes");
  store = await getStoreForChannelIdentity(from);
  assert(
    /retiro en taller/i.test(store?.welcomeMessage ?? ""),
    `nlu welcome=${store?.welcomeMessage}`,
  );
  console.log("NLU frase OK");

  // Multi-intent en IDLE
  const multi = await say(
    "cambiame el tema a claro y decí que envíos a CABA",
  );
  store = await getStoreForChannelIdentity(from);
  assert(store?.theme === "claro", `multi theme=${store?.theme}`);
  assert(
    /envíos a CABA/i.test(store?.welcomeMessage ?? ""),
    `multi welcome=${store?.welcomeMessage}`,
  );
  assert(
    multi.some(
      (r) =>
        r.kind === "text" &&
        (/claro|estilo|frase|envíos/i.test(r.text)),
    ),
    "multi-intent flushed theme/welcome",
  );
  console.log("multi-intent tema+frase OK");

  // Cancelar en pick
  await say(undefined, "menu_personalize");
  await say(undefined, "personalize_theme");
  await say(undefined, "menu_cancel");
  store = await getStoreForChannelIdentity(from);
  assert(store?.theme === "claro", "cancel does not clear theme");

  console.log("smoke-welcome-theme OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
