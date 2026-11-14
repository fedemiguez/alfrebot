/**
 * Smoke — default limpio, archive marcos/trama, tono WA Gemini, shell.
 * Run: npx tsx scripts/smoke-ikt-polish.ts
 */

import { productWantMessage } from "../lib/whatsapp-order";
import {
  IKT_LEGACY_FRAMES_AND_PATTERN_ENABLED,
  shouldShowProductFrame,
  shouldShowStorePattern,
} from "../lib/store-legacy-chrome";
import { iktShellPresentation, resolveIktTheme } from "../lib/store-ikt-theme";
import { storePurchaseProps } from "../lib/store-purchase";

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
  resolveIktTheme({ businessKind: null }) === null,
  "resolveIktTheme null sin rubro",
);

/* ——— Con rubro: no default ——— */
const ropa = iktShellPresentation({
  businessKind: "ropa",
  accentColor: "#9A5B36",
});
assert(ropa.isDefault === false, "ropa no es default");
assert(ropa.ikt?.rubro === "ropa", "ropa rubro");
assert(ropa.ikt?.palette === "lino-arena", "lino-arena");
assert(ropa.styleVars["--ikt-whatsapp"] === "#2B4C3F", "wa token");

/* ——— Ikt force whatsapp checkout (sin carrito multipaso) ——— */
const purchase = storePurchaseProps({
  id: "s1",
  slug: "demo",
  name: "Demo",
  ownerName: "Nora",
  channelIdentity: "+5491111111111",
  contactPhone: "+5491111111111",
  showPhone: true,
  checkoutMode: "cart",
  businessKind: "artesanal",
});
assert(purchase?.checkoutMode === "whatsapp", "Ikt fuerza whatsapp");

/* ——— productWantMessage tono Gemini por rubro ——— */
const msg = productWantMessage({
  productTitle: "Mate de Algarrobo Tallado a Mano",
  priceCents: 2200000,
  storeName: "Taller de Nora",
  storeSlug: "taller-de-nora",
  ownerName: "Nora",
  businessKind: "artesanal",
});
assert(msg.includes("¡Hola Nora! 👋"), "saludo owner");
assert(msg.includes("Vi tu página web (Taller de Nora)"), "tono Gemini");
assert(msg.includes("encargar esta pieza"), "acción artesanías");
assert(msg.includes("*Mate de Algarrobo Tallado a Mano*"), "producto bold");
assert(msg.includes("¿Me podrías confirmar disponibilidad?"), "cierre");

const msgRopa = productWantMessage({
  productTitle: "Camisa de Lino",
  priceCents: 4450000,
  ownerName: "Marta",
  storeName: "Casa Lino",
  businessKind: "ropa",
});
assert(msgRopa.includes("consultar por esta prenda"), "acción ropa");

const msgComida = productWantMessage({
  productTitle: "Milanesa",
  priceCents: 1150000,
  ownerName: "José",
  storeName: "Rotisería Don José",
  businessKind: "comida",
});
assert(msgComida.includes("pedir este plato"), "acción comidas");

const msgLegacy = productWantMessage({
  productTitle: "Jarrón azul",
  priceCents: 1500000,
  storeName: "Cerámicas de Norma",
  storeSlug: "ceramicas-de-norma",
  ownerName: "Norma",
});
assert(msgLegacy.includes("Vi su página web"), "legacy sin rubro");
assert(msgLegacy.includes("Catálogo:"), "legacy link catálogo");

console.log("smoke-ikt-polish: OK");
