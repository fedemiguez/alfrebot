/**
 * Smoke: búsqueda + intención de voz del comprador (sin micrófono / sin LLM).
 * Uso: npx tsx scripts/smoke-store-voice.ts
 */
import { DEMO_PRODUCTS } from "../lib/demo-store";
import { parseVoiceIntent, resolveVoiceTurn } from "../lib/voice/parse-intent";
import { searchCatalog } from "../lib/voice/search-catalog";
import { normalizeVoiceText, tokenizeVoiceQuery } from "../lib/voice/normalize";

const catalog = DEMO_PRODUCTS.map((p) => ({
  id: p.id,
  title: p.title,
  description: p.description,
  priceCents: p.priceCents,
  imageUrl: p.imageUrl,
  inStock: p.inStock,
}));

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(normalizeVoiceText("Jarrón Azúl") === "jarron azul", "normalize accents");
  assert(tokenizeVoiceQuery("busco una taza").includes("taza"), "tokenize taza");

  const tazaHits = searchCatalog(catalog, "taza");
  assert(tazaHits.length >= 1, "search taza");
  assert(/taza/i.test(tazaHits[0]!.title), "top hit taza");

  const jarron = searchCatalog(catalog, "jarron");
  assert(jarron.some((h) => /jarr/i.test(h.title)), "fuzzy jarron→jarrón");

  assert(parseVoiceIntent("Lo quiero").kind === "want", "want bare");
  assert(parseVoiceIntent("lo quiero taza").kind === "want", "want + query");
  assert(parseVoiceIntent("busco un plato").kind === "search", "search intent");

  const searchTurn = resolveVoiceTurn({
    transcript: "plato grande",
    products: catalog,
  });
  assert(searchTurn.kind === "results", "search results");
  assert(
    searchTurn.kind === "results" &&
      searchTurn.hits.some((h) => /plato/i.test(h.title)),
    "plato in hits",
  );

  const selectedId = catalog.find((p) => /taza/i.test(p.title))!.id;
  const wantTurn = resolveVoiceTurn({
    transcript: "Lo quiero",
    products: catalog,
    selectedId,
  });
  assert(wantTurn.kind === "want_ready", "want with selection");
  assert(
    wantTurn.kind === "want_ready" && wantTurn.product.id === selectedId,
    "want product match",
  );

  const wantNamed = resolveVoiceTurn({
    transcript: "Lo quiero jarrón azul",
    products: catalog,
  });
  assert(
    wantNamed.kind === "want_ready" || wantNamed.kind === "want_ambiguous",
    "want named",
  );

  const empty = resolveVoiceTurn({
    transcript: "xyzzyqq",
    products: catalog,
  });
  assert(empty.kind === "no_results", "no results");

  console.log("OK smoke-store-voice");
}

main();
