/**
 * Smoke: cambiar precio por texto libre → listado / fuzzy → confirmación.
 * Sin secretos ni llamadas a LLM (NLU determinista).
 */
import { handleMessage } from "../lib/bot/engine";
import { getMemoryDb } from "../lib/db/memory";
import {
  createProduct,
  getConversation,
  getProduct,
  getStoreForChannelIdentity,
  listProductsByStore,
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
      messageId: `smoke_price_${n}_${Date.now()}`,
      text,
      choiceId,
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" || r.kind === "sign_out" ? r.text : `[image] `))
    .join(" | ");
  console.log(`> ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 280)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function hasMainMenu(replies: Awaited<ReturnType<typeof say>>): boolean {
  return replies.some(
    (r) =>
      r.kind === "text" &&
      r.options?.some(
        (o) =>
          o.id === "menu_group_products" ||
          o.id === "menu_add" ||
          o.id === "menu_store",
      ),
  );
}

async function onboard() {
  await say("Empezar");
  await say("Norma");
  await say("Sí", "yes");
  await say("Lámparas Smoke");
  await say("Sí", "yes");
  await say("Sí", "yes");
  await say("11 5555-8888");
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

  // Bug: "cambiar el precio" no debe abrir el menú general
  const listReplies = await say("Quiero cambiar el precio");
  assert(!hasMainMenu(listReplies), "no debe mostrar menú general");
  assert(
    listReplies.some(
      (r) =>
        r.kind === "text" &&
        /cuál producto querés cambiar el precio/i.test(r.text) &&
        r.options?.some((o) => o.id.startsWith("stock_prod_")) &&
        r.options?.some((o) => o.id === "menu_cancel" && o.label === "Cancelar"),
    ),
    "debe listar productos para elegir (con Cancelar)",
  );
  const convList = await getConversation(from);
  assert(convList?.state === "STOCK_PICK", `STOCK_PICK got ${convList?.state}`);
  console.log("OK listado al pedir cambiar precio");

  await say("menú");

  // Fuzzy: "lampara" → pide precio nuevo (sin menú general)
  const fuzzy = await say("Quiero cambiar el precio de la lampara");
  assert(!hasMainMenu(fuzzy), "fuzzy no abre menú general");
  assert(
    fuzzy.some(
      (r) =>
        r.kind === "text" &&
        /Lámpara azul/.test(r.text) &&
        /precio nuevo|A cómo querés dejar/i.test(r.text),
    ),
    "fuzzy pide precio de Lámpara azul",
  );
  const convFuzzy = await getConversation(from);
  assert(convFuzzy?.state === "PRICE_INPUT", `PRICE_INPUT got ${convFuzzy?.state}`);
  console.log("OK fuzzy lampara → PRICE_INPUT");

  const askConfirm = await say("40 mil");
  assert(
    askConfirm.some(
      (r) =>
        r.kind === "text" &&
        /Dejamos "Lámpara azul" a/.test(r.text) &&
        r.options?.some((o) => o.id === "yes") &&
        r.options?.some((o) => o.id === "menu_cancel" && o.label === "Cancelar"),
    ),
    "confirmación Sí/No con precio (y Cancelar)",
  );
  const convConfirm = await getConversation(from);
  assert(
    convConfirm?.state === "STOCK_CONFIRM",
    `STOCK_CONFIRM got ${convConfirm?.state}`,
  );
  console.log("OK precio → STOCK_CONFIRM");

  const saved = await say("Sí", "yes");
  assert(
    saved.some(
      (r) =>
        r.kind === "text" &&
        /Lámpara azul/.test(r.text) &&
        /Ya cambié el precio|a \$\s*40\.?000/.test(r.text),
    ),
    "mensaje de precio guardado",
  );
  assert(hasMainMenu(saved), "vuelve al menú tras guardar");
  const products = await listProductsByStore(store.id, { includeHidden: true });
  const lamp = products.find((p) => p.title === "Lámpara azul");
  assert(lamp, "lamp exists");
  const after = await getProduct(lamp.id);
  assert(after?.priceCents === 4000000, `price 4000000 got ${after?.priceCents}`);
  console.log("OK precio guardado");

  // Frase con producto + precio → confirmación directa
  const direct = await say("cambiar el precio del velador a 18 mil");
  assert(
    direct.some(
      (r) =>
        r.kind === "text" &&
        /Dejamos "Velador verde" a/.test(r.text) &&
        r.options?.some((o) => o.id === "yes"),
    ),
    "producto+precio → confirmación",
  );
  await say("Sí", "yes");
  const velador = (await listProductsByStore(store.id)).find(
    (p) => p.title === "Velador verde",
  );
  assert(velador?.priceCents === 1800000, `velador 1800000 got ${velador?.priceCents}`);
  console.log("OK frase con precio incluido");

  console.log("\nALL PRICE SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
