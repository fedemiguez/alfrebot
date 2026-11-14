/**
 * Smoke — plantilla Ropa (categorías + CTA + monograma + kicker Gemini).
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
assert(
  iktWantCtaLabel("comida") === IKT_WANT_CTA.comidas,
  "comida CTA Ikt",
);
assert(
  iktWantCtaLabel("artesanal") === IKT_WANT_CTA.artesanias,
  "artesanal CTA Ikt",
);
assert(iktWantCtaLabel(null) === null, "sin rubro = Lo quiero");

assert(
  iktHeaderEyebrow("ropa") === "SHOWROOM · COLECCIÓN ACTUAL",
  "kicker ropa Gemini",
);
assert(
  iktHeaderEyebrow("comida") === "COMIDA CASERA · RECIÉN HECHA",
  "kicker comida",
);

assert(storeMonogramInitials("CASA LINO") === "CL", "monograma 2 palabras");
assert(storeMonogramInitials("Lino") === "LI", "monograma 1 palabra");

const saco = inferRopaCategory("Saco Liviano de Lino", "Muy cómodo");
assert(saco?.id === "abrigos", "saco → Abrigos");
assert(
  inferRopaCategory("Camisa de lino")?.id === "camisas",
  "camisa → Camisas",
);

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
  accentColor: "#9A5B36",
});
assert(theme?.rubro === "ropa", "rubro ropa");
assert(theme?.palette === "lino-arena", "paleta lino-arena");
assert(theme?.primary === "#9A5B36", "primary lino");
assert(theme?.whatsapp === "#2B4C3F", "whatsapp lino");

console.log("smoke-ikt-ropa: OK");
