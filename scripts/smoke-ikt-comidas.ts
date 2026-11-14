/**
 * Smoke — plantilla Comidas (categorías + CTA + banner copy Gemini).
 * Run: npx tsx scripts/smoke-ikt-comidas.ts
 */

import {
  collectComidaCategoryChips,
  inferComidaCategory,
  productMatchesComidaCategory,
} from "../lib/comida-category";
import {
  IKT_COMIDAS_OPEN_BANNER,
  IKT_WANT_CTA,
  iktHeaderEyebrow,
  iktWantCtaLabel,
} from "../lib/ikt-cta";
import { resolveIktTheme } from "../lib/store-ikt-theme";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(
  iktWantCtaLabel("comida") === IKT_WANT_CTA.comidas,
  "CTA comida exacto",
);
assert(
  iktWantCtaLabel("comida") === "📲 Pedir este plato por WhatsApp",
  "CTA microcopy",
);
assert(iktWantCtaLabel("ropa") === IKT_WANT_CTA.ropa, "ropa intacto");
assert(
  iktWantCtaLabel("artesanal") === IKT_WANT_CTA.artesanias,
  "artesanal CTA Ikt",
);
assert(
  iktHeaderEyebrow("comida") === "COMIDA CASERA · RECIÉN HECHA",
  "kicker comidas",
);

assert(
  IKT_COMIDAS_OPEN_BANNER ===
    "🟢 ABIERTO AHORA · Retiro en el local o envío a domicilio",
  "banner copy Gemini",
);

const burger = inferComidaCategory(
  "Hamburguesa Casera Completa",
  "Carne vacuna seleccionada",
);
assert(burger?.id === "carnes", "hamburguesa → Carnes");
assert(
  inferComidaCategory("Ravioles de ricota")?.id === "pastas",
  "ravioles → Pastas",
);
assert(
  inferComidaCategory("Jarrón azul") === null,
  "cerámica sin categoría comida",
);

const chips = collectComidaCategoryChips([
  { title: "Hamburguesa completa" },
  { title: "Ñoquis caseros" },
  { title: "Otra hamburguesa" },
  { title: "Pieza rara" },
]);
assert(chips[0]?.id === "todo", "primer chip Todo");
assert(
  chips.some((c) => c.id === "carnes") && chips.some((c) => c.id === "pastas"),
  "chips Carnes+Pastas",
);

const theme = resolveIktTheme({
  businessKind: "comida",
  accentColor: "#D84315",
});
assert(theme?.rubro === "comidas", "rubro comidas");
assert(theme?.palette === "brasa-fuego", "paleta brasa-fuego");
assert(theme?.primary === "#D84315", "primary brasa");
assert(theme?.whatsapp === "#1B5E20", "whatsapp brasa");

console.log("smoke-ikt-comidas: OK");
