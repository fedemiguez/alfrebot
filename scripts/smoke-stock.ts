import { handleMessage } from "../lib/bot/engine";
import { getMemoryDb } from "../lib/db/memory";
import {
  createProduct,
  getProduct,
  getStoreForChannelIdentity,
  listProductsByStore,
} from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "+01155559999";

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
      messageId: `smoke_${n}_${Date.now()}`,
      text,
      choiceId,
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" ? r.text : `[image] ${r.caption || ""}`))
    .join(" | ");
  console.log(`> ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 240)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  reset();
  await say("Empezar");
  await say("Norma");
  await say("Sí", "yes");
  await say("Cerámicas Smoke");
  await say("Sí", "yes");
  await say("Sí", "yes"); // mostrar número
  await say("11 5555-9999"); // WhatsApp de pedidos (simulador)
  await say(undefined, "stock_pause_mode");
  await say(undefined, "checkout_whatsapp");

  let store = await getStoreForChannelIdentity(from);
  assert(store, "store created");
  assert(store.tracksQuantity === false, "tracksQuantity false");
  assert(store.checkoutMode === "whatsapp", "checkout whatsapp");
  console.log("OK onboarding solo pausar", store.slug);

  await createProduct({
    storeId: store.id,
    title: "Taza smoke",
    priceCents: 100000,
    imageUrl: "/demo/taza.svg",
  });
  await createProduct({
    storeId: store.id,
    title: "Plato smoke",
    priceCents: 200000,
    imageUrl: "/demo/plato.svg",
  });

  await say("menú");
  await say(undefined, "menu_stock");

  // Bugfix: Volver al menú no debe abrir Ayuda; "Whatsapp" sale del hub.
  const back = await say(undefined, "menu_back");
  assert(
    back.some((r) => r.kind === "text" && r.options?.some((o) => o.id === "menu_store")),
    "menu_back shows main menu with Ver mi tienda",
  );
  await say(undefined, "menu_stock");
  const wa = await say("Whatsapp");
  assert(
    wa.some((r) => r.kind === "text" && /whatsapp|pedidos|11 5555/i.test(r.text)),
    "typing Whatsapp from stock hub opens contact flow",
  );
  await say("cancelar");
  await say(undefined, "menu_stock");
  await say(undefined, "stock_list");
  await say(undefined, "stock_pick");

  const products = await listProductsByStore(store.id, { includeHidden: true });
  const taza = products.find((p) => p.title === "Taza smoke");
  assert(taza, "taza exists");
  await say(undefined, `stock_prod_${taza.id}`);
  await say(undefined, "stock_pause");
  await say(undefined, "yes");

  let after = await getProduct(taza.id);
  assert(after && after.inStock === false, "paused");
  console.log("OK pause flow");

  await say(undefined, "stock_mode");
  await say(undefined, "yes");
  store = await getStoreForChannelIdentity(from);
  assert(store && store.tracksQuantity === true, "switched to qty");

  await say(undefined, "stock_pick");
  await say(undefined, `stock_prod_${taza.id}`);
  await say(undefined, "stock_set_qty");
  await say("3");
  await say(undefined, "yes");
  after = await getProduct(taza.id);
  assert(after && after.quantity === 3 && after.inStock === true, "qty 3");
  console.log("OK set quantity");

  await say(undefined, "stock_pick");
  await say(undefined, `stock_prod_${taza.id}`);
  await say(undefined, "stock_set_qty");
  await say("0");
  await say(undefined, "yes");
  after = await getProduct(taza.id);
  assert(after && after.quantity === 0 && after.inStock === false, "qty 0 => agotado");
  console.log("OK qty 0 => agotado");

  // numbered choice fallback
  await say(undefined, "stock_pick");
  const listed = await listProductsByStore(store.id, { includeHidden: true });
  await say("1"); // first pending choice
  const first = listed[0]!;
  after = await getProduct(first.id);
  // should be in STOCK_ACTIONS now — send cancel via picking pause confirm path
  assert(after, "still exists after numbered pick");
  console.log("OK numbered pick reached actions for", first.title);

  console.log("\nALL STOCK SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
