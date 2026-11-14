/**
 * Smoke Fase 4 — plantilla Artesanías (material badge + categorías + CTA).
 * Run: npx tsx scripts/smoke-ikt-artesanias.ts
 */

import {
  collectArtesaniaCategoryChips,
  inferArtesaniaCategory,
  productMatchesArtesaniaCategory,
} from "../lib/artesania-category";
import {
  artesaniaMaterialBadgeText,
  inferArtesaniaMaterial,
} from "../lib/artesania-material";
import {
  IKT_WANT_CTA,
  iktHeaderEyebrow,
  iktWantCtaLabel,
} from "../lib/ikt-cta";
import { resolveIktTheme } from "../lib/store-ikt-theme";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(
  iktWantCtaLabel("artesanal") === IKT_WANT_CTA.artesanias,
  "CTA artesanal exacto",
);
assert(
  iktWantCtaLabel("artesanal") === "💬 Encargar esta pieza por WhatsApp",
  "CTA microcopy",
);
assert(iktWantCtaLabel("ropa") === IKT_WANT_CTA.ropa, "ropa intacto");
assert(iktWantCtaLabel("comida") === IKT_WANT_CTA.comidas, "comida intacto");
assert(
  iktHeaderEyebrow("artesanal") === "TALLER ARTESANAL · PIEZAS ÚNICAS",
  "kicker artesanal Gemini",
);
assert(
  iktHeaderEyebrow("ropa") === "SHOWROOM · COLECCIÓN ACTUAL",
  "kicker ropa intacto",
);

const esmalte = inferArtesaniaMaterial(
  "Cuenco Aurora",
  "Modelado a mano. Cerámica esmaltada a alta temperatura.",
);
assert(esmalte?.label === "Cerámica esmaltada", "esmalte → Cerámica esmaltada");
assert(
  artesaniaMaterialBadgeText(
    "Cuenco Aurora",
    "Cerámica esmaltada a mano",
  )?.includes("Cerámica esmaltada"),
  "badge text con emoji",
);

assert(
  inferArtesaniaMaterial("Mate de algarrobo", "Tallado a mano")?.label ===
    "Madera de algarrobo",
  "algarrobo → Madera de algarrobo",
);
assert(
  inferArtesaniaMaterial(
    "Ideal para regalar",
    "Pieza única hecha con cariño",
  ) === null,
  "sin keyword material → null",
);

assert(
  inferArtesaniaCategory("Taza de café")?.id === "tazas",
  "taza → Tazas",
);
assert(
  inferArtesaniaCategory("Cuenco Aurora")?.id === "cuencos",
  "cuenco → Cuencos",
);
assert(
  inferArtesaniaCategory("Hamburguesa") === null,
  "comida sin categoría artesanía",
);

const chips = collectArtesaniaCategoryChips([
  { title: "Taza azul", description: "Esmalte azul" },
  { title: "Cuenco Aurora" },
  { title: "Otra taza" },
  { title: "Pieza rara" },
]);
assert(chips[0]?.id === "todo", "primer chip Todo");
assert(
  chips.some((c) => c.id === "tazas") && chips.some((c) => c.id === "cuencos"),
  "chips Tazas+Cuencos",
);
assert(
  chips.filter((c) => c.id === "tazas").length === 1,
  "sin duplicar Tazas",
);

assert(
  productMatchesArtesaniaCategory({ title: "Taza" }, "todo"),
  "Todo incluye todos",
);
assert(
  productMatchesArtesaniaCategory({ title: "Taza" }, "tazas"),
  "filtro tazas",
);
assert(
  !productMatchesArtesaniaCategory({ title: "Cuenco" }, "tazas"),
  "cuenco fuera de tazas",
);

const theme = resolveIktTheme({
  businessKind: "artesanal",
  accentColor: "#9C5A25",
});
assert(theme?.rubro === "artesanias", "rubro artesanias");
assert(theme?.palette === "arcilla-sol", "paleta arcilla-sol");

console.log("smoke-ikt-artesanias: OK");
