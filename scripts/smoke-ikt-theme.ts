/**
 * Smoke: resolveIktTheme — rubro/paleta desde business_kind + accent_color.
 * Uso: npx tsx scripts/smoke-ikt-theme.ts
 */
import {
  businessKindToIktRubro,
  IKT_DEFAULT_PALETTE,
  resolveIktTheme,
} from "../lib/store-ikt-theme";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(businessKindToIktRubro("ropa") === "ropa", "ropa→ropa");
assert(businessKindToIktRubro("comida") === "comidas", "comida→comidas");
assert(businessKindToIktRubro("artesanal") === "artesanias", "artesanal→artesanias");
assert(businessKindToIktRubro(null) === null, "null rubro");
assert(businessKindToIktRubro("otro") === null, "unknown rubro");

assert(resolveIktTheme({ businessKind: null }) === null, "sin kind → null");

const ropaDefault = resolveIktTheme({ businessKind: "ropa" });
assert(ropaDefault?.rubro === "ropa", "ropa rubro");
assert(
  ropaDefault?.palette === IKT_DEFAULT_PALETTE.ropa,
  "ropa default lino-arena",
);

const comidaDefault = resolveIktTheme({ businessKind: "comida" });
assert(comidaDefault?.palette === "brasa-fuego", "comida default brasa");

const artesanalDefault = resolveIktTheme({ businessKind: "artesanal" });
assert(artesanalDefault?.palette === "arcilla-sol", "artesanal default arcilla");

// Exact / nearest primary matches (hex Gemini)
const noir = resolveIktTheme({
  businessKind: "ropa",
  accentColor: "#111827",
});
assert(noir?.palette === "monochrome-noir", "exact noir");

const sage = resolveIktTheme({
  businessKind: "ropa",
  accentColor: "#354F3B",
});
assert(sage?.palette === "botanical-sage", "exact sage");

const nearMatcha = resolveIktTheme({
  businessKind: "comida",
  accentColor: "#2E5A36",
});
assert(nearMatcha?.palette === "cafe-matcha", "exact matcha");

const nearNogal = resolveIktTheme({
  businessKind: "artesanal",
  accentColor: "#3E634D",
});
assert(nearNogal?.palette === "bosque-nogal", "exact nogal");

const indigo = resolveIktTheme({
  businessKind: "artesanal",
  accentColor: "#B83B44",
});
assert(indigo?.palette === "indigo-telar", "exact indigo");

// Theme claro/crema/oscuro no influye en resolveIktTheme
const ignoreTheme = resolveIktTheme({
  businessKind: "ropa",
  accentColor: "#9A5B36",
});
assert(ignoreTheme?.palette === "lino-arena", "accent wins; theme unused");
assert(ignoreTheme?.whatsapp === "#2B4C3F", "whatsapp token");

console.log("smoke-ikt-theme: OK");
