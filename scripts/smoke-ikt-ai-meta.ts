/**
 * Smoke Fase 5 — AI categoría/material (heurística + preferencia de campos).
 * Run: npx tsx scripts/smoke-ikt-ai-meta.ts
 */

import { handleMessage } from "../lib/bot/engine";
import type { InboundMessage, OutboundMessage } from "../lib/channels/types";
import {
  collectArtesaniaCategoryChips,
  productMatchesArtesaniaCategory,
} from "../lib/artesania-category";
import {
  artesaniaMaterialBadgeText,
  resolveArtesaniaMaterial,
} from "../lib/artesania-material";
import { getMemoryDb } from "../lib/db/memory";
import {
  getStoreForChannelIdentity,
  listProductsByStore,
  updateStoreBusinessKind,
} from "../lib/db/repos";
import {
  collectRopaCategoryChips,
  productMatchesRopaCategory,
} from "../lib/ropa-category";
import { categoryChipId } from "../lib/product-category";
import { suggestProductMeta } from "../lib/suggest-product-meta";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(categoryChipId("Jarrones") === "jarrones", "slug jarrones");
assert(categoryChipId("Abrigos") === "abrigos", "slug abrigos");

// Preferencia de category guardada sobre heurística de título.
const chipsSaved = collectArtesaniaCategoryChips([
  { title: "Pieza rara", category: "Jarrones" },
  { title: "Otra", category: "Tazas" },
  { title: "Sin cat" },
]);
assert(chipsSaved[0]?.id === "todo", "Todo primero");
assert(
  chipsSaved.some((c) => c.id === "jarrones" && c.label === "Jarrones"),
  "chip desde category guardada",
);
assert(
  chipsSaved.some((c) => c.id === "tazas" && c.label === "Tazas"),
  "chip Tazas guardada",
);
assert(
  productMatchesArtesaniaCategory(
    { title: "Pieza rara", category: "Jarrones" },
    "jarrones",
  ),
  "filtro por category guardada",
);
assert(
  !productMatchesArtesaniaCategory(
    { title: "Pieza rara", category: "Jarrones" },
    "tazas",
  ),
  "no match otra categoría",
);

// Ropa: category guardada gana al título.
assert(
  productMatchesRopaCategory(
    { title: "Camisa blanca", category: "Abrigos" },
    "abrigos",
  ),
  "ropa category guardada Abrigos",
);
assert(
  !productMatchesRopaCategory(
    { title: "Camisa blanca", category: "Abrigos" },
    "camisas",
  ),
  "ropa no cae a heurística si hay category",
);

const ropaChips = collectRopaCategoryChips([
  { title: "X", category: "Abrigos" },
  { title: "Camisa sin cat" },
]);
assert(
  ropaChips.some((c) => c.label === "Abrigos"),
  "chip Abrigos desde campo",
);
assert(
  ropaChips.some((c) => c.id === "camisas"),
  "fallback heurística Camisas",
);

// Material: campo guardado gana.
const fromField = resolveArtesaniaMaterial({
  title: "Mate",
  description: "Tallado en algarrobo",
  material: "Lana merino",
});
assert(fromField?.label === "Lana merino", "material guardado gana");
assert(
  artesaniaMaterialBadgeText({
    title: "Mate",
    description: "Tallado en algarrobo",
    material: "Lana merino",
  })?.includes("Lana merino"),
  "badge usa material guardado",
);

async function main() {
  // Heurística de sugerencia (sin API keys en CI).
  const prevGateway = process.env.AI_GATEWAY_API_KEY;
  const prevGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  const artesanal = await suggestProductMeta({
    title: "Taza azul",
    description: "Cerámica esmaltada a mano",
    businessKind: "artesanal",
  });
  assert(artesanal.category === "Tazas", "heurística categoría Tazas");
  assert(
    artesanal.material === "Cerámica esmaltada",
    "heurística material esmalte",
  );

  const ropa = await suggestProductMeta({
    title: "Saco de lino",
    businessKind: "ropa",
  });
  assert(ropa.category === "Abrigos", "heurística Abrigos");
  assert(ropa.material === null, "ropa sin material");

  const comida = await suggestProductMeta({
    title: "Ravioles de ricota",
    businessKind: "comida",
  });
  assert(comida.category === "🍝 Pastas", "heurística Pastas");
  assert(comida.material === null, "comida sin material");

  if (prevGateway !== undefined) process.env.AI_GATEWAY_API_KEY = prevGateway;
  if (prevGoogle !== undefined) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = prevGoogle;
  }

  await smokeBotCategoryMaterialFlow();

  console.log("smoke-ikt-ai-meta: OK");
}

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "+01155558888";

function resetMem() {
  const mem = getMemoryDb();
  mem.stores.clear();
  mem.products.clear();
  mem.conversations.clear();
  mem.signupIntents.clear();
  mem.channelLinkIntents?.clear();
  mem.processedMessages.clear();
}

let msgN = 0;
async function say(
  text?: string,
  choiceId?: string,
  media?: InboundMessage["media"],
): Promise<OutboundMessage[]> {
  msgN += 1;
  return handleMessage(
    {
      channel: "simulator",
      from,
      messageId: `smoke_meta_${msgN}_${Date.now()}`,
      text,
      choiceId,
      media,
    },
    caps,
  );
}

function flatText(replies: OutboundMessage[]): string {
  return replies
    .map((r) =>
      r.kind === "text" || r.kind === "sign_out"
        ? r.text
        : `[image] ${r.caption || r.url}`,
    )
    .join(" | ");
}

async function smokeBotCategoryMaterialFlow() {
  resetMem();
  msgN = 0;

  await say("Empezar");
  await say("Norma");
  await say("Sí", "yes");
  await say("Meta Smoke");
  await say("Sí", "yes");
  await say("Sí", "yes");
  await say("11 5555-8888");
  await say(undefined, "stock_pause_mode");
  await say(undefined, "checkout_whatsapp");

  const store = await getStoreForChannelIdentity(from);
  assert(store, "store creada");
  await updateStoreBusinessKind(store.id, "artesanal");

  await say(undefined, undefined, {
    kind: "image",
    mime: "image/jpeg",
    fetch: async () => new Blob([new Uint8Array([1, 2, 3])]),
  });
  await say("Taza azul");
  await say("6500");
  const catAsk = await say("Cerámica esmaltada a mano");
  assert(
    /categoría «Tazas»/i.test(flatText(catAsk)) ||
      /sugerí la categoría/i.test(flatText(catAsk)),
    `pide confirmar categoría: ${flatText(catAsk).slice(0, 200)}`,
  );
  assert(
    catAsk.some(
      (r) =>
        r.kind === "text" && r.options?.some((o) => o.id === "meta_use"),
    ),
    "opción Usar categoría",
  );

  const matAsk = await say(undefined, "meta_use");
  assert(
    /material «Cerámica esmaltada»/i.test(flatText(matAsk)) ||
      /material/i.test(flatText(matAsk)),
    `pide material: ${flatText(matAsk).slice(0, 200)}`,
  );

  const confirm = await say(undefined, "meta_use");
  assert(
    confirm.some(
      (r) =>
        r.kind === "text" && r.options?.some((o) => o.id === "publish"),
    ),
    "llega a confirmar publicación",
  );
  assert(
    /Categoría: Tazas/i.test(flatText(confirm)),
    "preview muestra categoría",
  );
  assert(
    /Material: Cerámica esmaltada/i.test(flatText(confirm)),
    "preview muestra material",
  );

  const published = await say(undefined, "publish");
  assert(/publicado/i.test(flatText(published)), "producto publicado");

  const products = await listProductsByStore(store.id);
  assert(products.length === 1, "1 producto");
  assert(products[0]?.category === "Tazas", "category guardada");
  assert(
    products[0]?.material === "Cerámica esmaltada",
    `material guardado: ${products[0]?.material}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
