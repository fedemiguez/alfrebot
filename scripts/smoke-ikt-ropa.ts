/**
 * Smoke Fase 2 — plantilla Ropa (categorías heurísticas + CTA + monograma).
 * Run: npx tsx scripts/smoke-ikt-ropa.ts
 */

import {
  iktHeaderEyebrow,
  iktWantCtaLabel,
  storeMonogramInitials,
  IKT_WANT_CTA,
} from "../lib/ikt-cta";
import {
  collectRopaCategoryChips,
  inferRopaCategory,
  productMatchesRopaCategory,
} from "../lib/ropa-category";
import { resolveIktTheme } from "../lib/store-ikt-theme";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(
  iktWantCtaLabel("ropa") === IKT_WANT_CTA.ropa,
  "CTA ropa exacto",
);
assert(
  iktWantCtaLabel("ropa") === "💬 Consultar prenda por WhatsApp",
  "CTA microcopy",
);
assert(iktWantCtaLabel("comida") === null, "comida aún sin CTA Ikt");
assert(iktWantCtaLabel("artesanal") === null, "artesanal aún sin CTA Ikt");
assert(iktWantCtaLabel(null) === null, "sin rubro = Lo quiero");

assert(iktHeaderEyebrow("ropa") === "Tienda de Ropa", "eyebrow ropa");
assert(iktHeaderEyebrow("comida") === null, "eyebrow solo ropa en PR3");

assert(storeMonogramInitials("CASA LINO") === "CL", "monograma 2 palabras");
assert(storeMonogramInitials("Lino") === "LI", "monograma 1 palabra");

const saco = inferRopaCategory("Saco Liviano de Lino", "Muy cómodo");
assert(saco?.id === "abrigos", "saco → Abrigos");
assert(
  inferRopaCategory("Camisa de lino")?.id === "camisas",
  "camisa → Camisas",
);
assert(inferRopaCategory("Jarrón azul") === null, "cerámica sin categoría ropa");

const chips = collectRopaCategoryChips([
  { title: "Saco de lino" },
  { title: "Camisa blanca" },
  { title: "Otro saco" },
  { title: "Pieza rara" },
]);
assert(chips[0]?.id === "todo", "primer chip Todo");
assert(
  chips.some((c) => c.id === "abrigos") && chips.some((c) => c.id === "camisas"),
  "chips Abrigos+Camisas",
);
assert(
  chips.filter((c) => c.id === "abrigos").length === 1,
  "sin duplicar Abrigos",
);

assert(
  productMatchesRopaCategory({ title: "Saco" }, "todo"),
  "Todo incluye todos",
);
assert(
  productMatchesRopaCategory({ title: "Saco" }, "abrigos"),
  "filtro abrigos",
);
assert(
  !productMatchesRopaCategory({ title: "Camisa" }, "abrigos"),
  "camisa fuera de abrigos",
);

const theme = resolveIktTheme({
  businessKind: "ropa",
  accentColor: "#A65E38",
});
assert(theme?.rubro === "ropa", "rubro ropa");
assert(theme?.palette === "lino-arena", "paleta lino-arena");

console.log("smoke-ikt-ropa: OK");
