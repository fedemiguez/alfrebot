/**
 * Smoke: edición mínima usable — menú Cambiar precio / Cambiar foto,
 * NLU change_photo, picker con ≥2 productos, confirmación Sí/No.
 * Sin secretos ni llamadas a LLM (NLU determinista).
 */
import { handleMessage } from "../lib/bot/engine";
import type { InboundMessage, OutboundMessage } from "../lib/channels/types";
import { getMemoryDb } from "../lib/db/memory";
import {
  createProduct,
  getConversation,
  getProduct,
  getStoreForChannelIdentity,
  listProductsByStore,
} from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "+01155557777";

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
async function say(
  text?: string,
  choiceId?: string,
  media?: InboundMessage["media"],
) {
  n += 1;
  const replies = await handleMessage(
    {
      channel: "simulator",
      from,
      messageId: `smoke_edit_${n}_${Date.now()}`,
      text,
      choiceId,
      media,
    },
    caps,
  );
  const flat = replies
    .map((r) =>
      r.kind === "text"
        ? r.text
        : `[image] ${r.caption || r.url}`,
    )
    .join(" | ");
  console.log(`> ${choiceId || text || (media ? "[image]" : "")}`);
  console.log(`< ${flat.slice(0, 320)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function hasMainMenu(replies: OutboundMessage[]): boolean {
  return replies.some(
    (r) =>
      r.kind === "text" &&
      r.options?.some((o) => o.id === "menu_add" || o.id === "menu_store"),
  );
}

function menuHas(replies: OutboundMessage[], id: string, label: string): boolean {
  return replies.some(
    (r) =>
      r.kind === "text" &&
      r.options?.some((o) => o.id === id && o.label === label),
  );
}

function hasProductPicker(replies: OutboundMessage[], promptRe: RegExp): boolean {
  return replies.some(
    (r) =>
      r.kind === "text" &&
      promptRe.test(r.text) &&
      r.options?.some((o) => o.id.startsWith("stock_prod_")),
  );
}

async function onboard() {
  await say("Empezar");
  await say("Norma");
  await say("Sí", "yes");
  await say("Edición Smoke");
  await say("Sí", "yes");
  await say("Sí", "yes");
  await say("11 5555-7777");
  await say(undefined, "stock_pause_mode");
  await say(undefined, "checkout_whatsapp");
}

async function main() {
  reset();
  await onboard();

  const store = await getStoreForChannelIdentity(from);
  assert(store, "store created");

  await createProduct({
    storeId: store.id,
    title: "Lámpara azul",
    priceCents: 3500000,
    imageUrl: "/demo/taza.svg",
  });
  await createProduct({
    storeId: store.id,
    title: "Velador verde",
    priceCents: 2200000,
    imageUrl: "/demo/plato.svg",
  });

  const menu = await say("menú");
  assert(menuHas(menu, "menu_price", "Cambiar precio"), "menú tiene Cambiar precio");
  assert(menuHas(menu, "menu_photo", "Cambiar foto"), "menú tiene Cambiar foto");
  assert(
    !menu.some(
      (r) =>
        r.kind === "text" &&
        r.options?.some((o) => /pieza/i.test(o.label)),
    ),
    "menú no dice pieza",
  );
  console.log("OK menú dueña con Cambiar precio / Cambiar foto");

  // Menú → Cambiar precio con ≥2 productos: listado, no menú general
  const priceMenu = await say(undefined, "menu_price");
  assert(!hasMainMenu(priceMenu), "Cambiar precio no abre menú general");
  assert(
    hasProductPicker(priceMenu, /cuál producto querés cambiar el precio/i),
    "Cambiar precio lista productos",
  );
  assert(
    (await getConversation(from))?.state === "STOCK_PICK",
    "estado STOCK_PICK tras menú precio",
  );
  console.log("OK menú Cambiar precio → picker");

  await say("menú");

  // Menú → Cambiar foto → picker
  const photoMenu = await say(undefined, "menu_photo");
  assert(!hasMainMenu(photoMenu), "Cambiar foto no abre menú general");
  assert(
    hasProductPicker(photoMenu, /cuál producto querés cambiar la foto/i),
    "Cambiar foto lista productos",
  );
  assert(
    (await getConversation(from))?.state === "STOCK_PICK",
    "estado STOCK_PICK tras menú foto",
  );
  console.log("OK menú Cambiar foto → picker");

  await say("menú");

  // NLU change_photo sin producto → picker
  const nluList = await say("Quiero cambiar la foto");
  assert(!hasMainMenu(nluList), "change_photo no abre menú general");
  assert(
    hasProductPicker(nluList, /cuál producto querés cambiar la foto/i),
    "change_photo lista productos",
  );
  console.log("OK NLU change_photo → picker");

  await say("menú");

  // Fuzzy change_photo → PHOTO_INPUT → imagen → confirmación → guardar
  const fuzzy = await say("cambiar la foto de la lampara");
  assert(
    fuzzy.some(
      (r) =>
        r.kind === "text" &&
        /Lámpara azul/.test(r.text) &&
        /Mandá la foto nueva/i.test(r.text),
    ),
    "fuzzy pide foto nueva de Lámpara azul",
  );
  assert(
    (await getConversation(from))?.state === "PHOTO_INPUT",
    `PHOTO_INPUT got ${(await getConversation(from))?.state}`,
  );
  console.log("OK fuzzy change_photo → PHOTO_INPUT");

  const confirm = await say(undefined, undefined, {
    kind: "image",
    mime: "image/jpeg",
    url: "https://example.com/nueva-lampara.jpg",
    fetch: async () => new Blob(),
  });
  assert(
    confirm.some(
      (r) =>
        r.kind === "text" &&
        /Cambiamos la foto de "Lámpara azul"/i.test(r.text) &&
        r.options?.some((o) => o.id === "yes"),
    ),
    "confirmación Sí/No tras foto",
  );
  assert(
    confirm.some((r) => r.kind === "image" && /nueva-lampara/.test(r.url)),
    "preview de foto nueva",
  );
  assert(
    (await getConversation(from))?.state === "STOCK_CONFIRM",
    "STOCK_CONFIRM tras foto",
  );
  console.log("OK foto → STOCK_CONFIRM");

  const saved = await say("Sí", "yes");
  assert(
    saved.some(
      (r) =>
        r.kind === "text" &&
        /Lámpara azul/.test(r.text) &&
        /actualicé la foto/i.test(r.text),
    ),
    "mensaje de foto guardada",
  );
  assert(hasMainMenu(saved), "vuelve al menú tras guardar foto");
  const lamp = (await listProductsByStore(store.id, { includeHidden: true })).find(
    (p) => p.title === "Lámpara azul",
  );
  assert(lamp, "lamp exists");
  const after = await getProduct(lamp.id);
  assert(
    after?.imageUrl === "https://example.com/nueva-lampara.jpg",
    `imageUrl got ${after?.imageUrl}`,
  );
  console.log("OK foto guardada");

  // Texto con ≥2 productos: "cambiar el precio" → listado
  const priceText = await say("Quiero cambiar el precio");
  assert(!hasMainMenu(priceText), "set_price texto no abre menú general");
  assert(
    hasProductPicker(priceText, /cuál producto querés cambiar el precio/i),
    "set_price con ≥2 productos lista",
  );
  console.log("OK set_price ≥2 productos → listado");

  console.log("\nALL EDIT SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
