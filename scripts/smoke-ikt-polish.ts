/**
 * Smoke Fase 6 / PR7 — default limpio, archive marcos/trama, tono WA, shell.
 * Run: npx tsx scripts/smoke-ikt-polish.ts
 */

import { productWantMessage } from "../lib/whatsapp-order";
import {
  IKT_LEGACY_FRAMES_AND_PATTERN_ENABLED,
  shouldShowProductFrame,
  shouldShowStorePattern,
} from "../lib/store-legacy-chrome";
import { iktShellPresentation, resolveIktTheme } from "../lib/store-ikt-theme";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

/* ——— Archive marcos/trama ——— */
assert(
  IKT_LEGACY_FRAMES_AND_PATTERN_ENABLED === false,
  "flag archive off",
);
assert(!shouldShowProductFrame("ropa"), "frame off ropa");
assert(!shouldShowProductFrame("comida"), "frame off comida");
assert(!shouldShowProductFrame("artesanal"), "frame off artesanal");
assert(!shouldShowProductFrame(null), "frame off default");
assert(!shouldShowStorePattern("ropa"), "pattern off ropa");
assert(!shouldShowStorePattern(null), "pattern off default");

/* ——— Default shell (sin rubro) ——— */
const noRubro = iktShellPresentation({
  businessKind: null,
  accentColor: null,
  theme: "oscuro",
});
assert(noRubro.ikt === null, "sin rubro → ikt null");
assert(noRubro.isDefault === true, "isDefault");
assert(
  noRubro.themeClassName?.includes("store-theme-ikt-default"),
  "clase default",
);
assert(
  noRubro.themeClassName?.includes("store-theme-ikt"),
  "clase ikt base",
);
assert(noRubro.styleVars["--ikt-primary"] === "#000000", "primary neutro");
assert(
  resolveIktTheme({ businessKind: null }) === null,
  "resolveIktTheme null sin rubro",
);

const withAccent = iktShellPresentation({
  businessKind: null,
  accentColor: "#2563eb",
});
assert(
  withAccent.styleVars["--ikt-primary"] === "#2563eb",
  "accent → ikt-primary default",
);

/* ——— Con rubro: no default ——— */
const ropa = iktShellPresentation({
  businessKind: "ropa",
  accentColor: "#A65E38",
});
assert(ropa.isDefault === false, "ropa no es default");
assert(ropa.ikt?.rubro === "ropa", "ropa rubro");
assert(ropa.ikt?.palette === "lino-arena", "lino-arena");

/* ——— productWantMessage tono Gemini ——— */
const msg = productWantMessage({
  productTitle: "Jarrón azul",
  priceCents: 1500000,
  storeName: "Cerámicas de Norma",
  storeSlug: "ceramicas-de-norma",
  ownerName: "Norma",
});
assert(msg.includes("¡Hola Cerámicas de Norma! 👋"), "saludo tienda + emoji");
assert(msg.includes("Vi su página web"), "tono Gemini");
assert(msg.includes("*Jarrón azul*"), "producto bold");
assert(msg.includes("¿Me podrían ayudar?"), "cierre amable");
assert(!msg.includes("Quiero pedirte"), "sin copy legacy");
assert(msg.includes("Catálogo:"), "sigue link catálogo (flujo)");

const msgOwnerOnly = productWantMessage({
  productTitle: "Taza",
  priceCents: 100,
  ownerName: "Norma",
});
assert(msgOwnerOnly.includes("¡Hola Norma! 👋"), "fallback ownerName");

console.log("smoke-ikt-polish: OK");
