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

// Exact / nearest primary matches
const noir = resolveIktTheme({
  businessKind: "ropa",
  accentColor: "#111111",
});
assert(noir?.palette === "monochrome-noir", "exact noir");

const sage = resolveIktTheme({
  businessKind: "ropa",
  accentColor: "#2f4f2e",
});
assert(sage?.palette === "botanical-sage", "exact sage");

const nearMatcha = resolveIktTheme({
  businessKind: "comida",
  accentColor: "#4a6a20",
});
assert(nearMatcha?.palette === "cafe-matcha", "near matcha");

const nearNogal = resolveIktTheme({
  businessKind: "artesanal",
  accentColor: "#3a5a52",
});
assert(nearNogal?.palette === "bosque-nogal", "near nogal");

const indigo = resolveIktTheme({
  businessKind: "artesanal",
  accentColor: "#c92a37",
});
assert(indigo?.palette === "indigo-telar", "exact indigo");

// Theme claro/crema/oscuro no influye en resolveIktTheme
const ignoreTheme = resolveIktTheme({
  businessKind: "ropa",
  accentColor: "#a65e38",
});
assert(ignoreTheme?.palette === "lino-arena", "accent wins; theme unused");

console.log("smoke-ikt-theme: OK");
