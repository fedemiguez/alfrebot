/**
 * Smoke: cascade hard-delete de tienda (memoria).
 * Uso: DATABASE_URL= npx tsx scripts/smoke-admin-delete-store.ts
 */
import { getMemoryDb } from "../lib/db/memory";
import {
  createChannelLinkIntent,
  createProduct,
  createSignupIntent,
  deleteStoreCascade,
  getConversation,
  getProduct,
  getStoreById,
  matchesStoreDeleteConfirm,
  saveConversation,
  storeDeleteConfirmPhrase,
  upsertStore,
} from "../lib/db/repos";

function reset() {
  const mem = getMemoryDb();
  mem.stores.clear();
  mem.products.clear();
  mem.conversations.clear();
  mem.signupIntents.clear();
  mem.channelLinkIntents.clear();
  mem.processedMessages.clear();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  reset();

  const store = await upsertStore({
    channelIdentity: "+5491199887766",
    contactPhone: "+5491199887766",
    clerkUserId: "user_delete_smoke",
    ownerEmail: "borrar@example.com",
    ownerName: "Dueña Smoke",
    name: "Tienda Cascade",
    slug: "tienda-cascade",
    status: "active",
  });

  const product = await createProduct({
    storeId: store.id,
    title: "Mate",
    priceCents: 500000,
    imageUrl: "https://xxx.blob.vercel-storage.com/products/mate.png",
    imageBlobKey: "products/mate.png",
  });

  await saveConversation({
    channelIdentity: store.channelIdentity,
    channel: "whatsapp",
    state: "IDLE",
    draft: {},
  });
  await saveConversation({
    channelIdentity: "clerk:user_delete_smoke",
    channel: "simulator",
    state: "IDLE",
    draft: {},
  });
  await createSignupIntent("+5491199887766", "123456");
  await createChannelLinkIntent({
    clerkChannelIdentity: "clerk:user_delete_smoke",
    ownerEmail: "borrar@example.com",
  });

  assert(
    storeDeleteConfirmPhrase(store) === "tienda-cascade",
    "confirm phrase = slug",
  );
  assert(
    matchesStoreDeleteConfirm(store, "tienda-cascade"),
    "slug confirma",
  );
  assert(
    matchesStoreDeleteConfirm(store, "Tienda Cascade"),
    "nombre también confirma",
  );
  assert(
    !matchesStoreDeleteConfirm(store, "otra"),
    "texto incorrecto no confirma",
  );

  const result = await deleteStoreCascade(store.id);
  assert(result.ok, "cascade ok");
  if (!result.ok) return;
  assert(result.productsDeleted === 1, "1 producto borrado");
  assert(!(await getStoreById(store.id)), "store gone");
  assert(!(await getProduct(product.id)), "product gone");
  assert(
    !(await getConversation(store.channelIdentity)),
    "conv WA gone",
  );
  assert(
    !(await getConversation("clerk:user_delete_smoke")),
    "conv clerk gone",
  );

  const mem = getMemoryDb();
  assert(mem.signupIntents.size === 0, "signup intents cleared");
  assert(mem.channelLinkIntents.size === 0, "channel link intents cleared");

  // Demo-only path still gated
  const real = await upsertStore({
    channelIdentity: "+5491100112233",
    name: "Real",
    slug: "real-store",
    isDemo: false,
  });
  const { deleteDemoStore } = await import("../lib/db/repos");
  const blocked = await deleteDemoStore(real.id);
  assert(!blocked.ok, "deleteDemoStore blocks non-demo");
  assert(await getStoreById(real.id), "real store still there");

  const cascadeReal = await deleteStoreCascade(real.id);
  assert(cascadeReal.ok, "admin cascade deletes real stores");
  assert(!(await getStoreById(real.id)), "real store gone via cascade");

  console.log("OK smoke-admin-delete-store");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
