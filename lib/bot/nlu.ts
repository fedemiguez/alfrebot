import { z } from "zod";
import type { PendingSetupPlan } from "@/lib/db/repos";
import {
  matchAccentFromText,
  wantsAccentColorText,
} from "@/lib/store-accent";
import {
  matchBusinessKindFromText,
  wantsBusinessKindText,
} from "@/lib/store-business-kind";
import {
  matchThemeFromText,
  wantsStoreThemeText,
} from "@/lib/store-theme";
import {
  extractWelcomeFromText,
  wantsClearWelcomeText,
  wantsWelcomeMessageText,
} from "@/lib/store-welcome";

const freeTextActionSchema = z.object({
  intent: z.enum([
    "set_price",
    "mark_out_of_stock",
    "list_stock",
    "manage_stock",
    "create_product",
    "change_photo",
    "generate_icon",
    "upload_icon",
    "profile_icon",
    "set_accent_color",
    "set_business_kind",
    "set_store_theme",
    "set_welcome_message",
    "help",
    "menu",
    "unknown",
  ]),
  titleHint: z.string().optional(),
  priceHint: z.string().optional(),
  productHint: z.string().optional(),
  /** Hex `#rrggbb` si el NLU detectó color. */
  accentHint: z.string().optional(),
  /** Rubro (`artesanal` | `comida` | `ropa`) si el NLU lo detectó. */
  businessKindHint: z.string().optional(),
  /** Tema (`claro` | `crema` | `oscuro`) si el NLU lo detectó. */
  themeHint: z.string().optional(),
  /** Frase de bienvenida detectada (vacío = borrar). */
  welcomeHint: z.string().optional(),
});

export type FreeTextAction = z.infer<typeof freeTextActionSchema>;

export type { PendingSetupPlan };

const SPOKEN_UNITS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
};

/** Parsea precios AR: "15 mil", "quince mil", "15.000", "$15000", "15000" */
export function parsePriceToCents(raw: string): number | null {
  const text = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!text) return null;

  const milMatch = text.match(/(\d+(?:[.,]\d+)?)\s*mil(?:es)?/);
  if (milMatch) {
    const n = Number(milMatch[1].replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000) * 100;
  }

  // "quince mil", "veinte mil pesos"
  const spokenMil = text.match(
    /\b(ciento|cien|noventa|ochenta|setenta|sesenta|cincuenta|cuarenta|treinta|veinte|diecinueve|dieciocho|diecisiete|dieciseis|quince|catorce|trece|doce|once|diez|nueve|ocho|siete|seis|cinco|cuatro|tres|dos|un|uno|una)\s+mil(?:es)?\b/,
  );
  if (spokenMil) {
    const n = SPOKEN_UNITS[spokenMil[1]!];
    if (n != null) return n * 1000 * 100;
  }

  const cleaned = text
    .replace(/\$/g, "")
    .replace(/\bpesos?\b/g, "")
    .replace(/\s/g, "");

  // 15.000 or 15,000 → thousands
  if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) {
    const digits = cleaned.replace(/[.,]/g, "");
    const n = Number(digits);
    return Number.isFinite(n) ? n * 100 : null;
  }

  // plain number
  const plain = cleaned.replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(plain)) {
    const n = Number(plain);
    if (!Number.isFinite(n)) return null;
    // If someone types 15000 assume pesos; if 150.5 assume pesos with cents rare — treat as pesos
    return Math.round(n) * 100;
  }

  return null;
}

export function formatPriceArs(cents: number | null | undefined): string {
  if (cents == null) return "Consultar";
  const pesos = Math.round(cents / 100);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(pesos);
}

export function isAffirmative(text: string): boolean {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return /^(si|sip|dale|ok|okay|listo|claro|va|de una|perfecto|confirmo|publicar)$/.test(
    t,
  );
}

export function isNegative(text: string): boolean {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return /^(no|nop|nah|cancelar|cambiar|otra)$/.test(t);
}

/**
 * Pedido de cerrar sesión en el chat web (Clerk).
 * WhatsApp/Meta no debe usar este intent.
 */
export function isLogoutIntent(text: string | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return (
    t === "salir" ||
    t === "logout" ||
    t === "log out" ||
    t === "sign out" ||
    t === "signout" ||
    t === "cerrar sesion" ||
    t === "cerrar la sesion" ||
    t === "cerrar mi sesion"
  );
}

export function extractSignupCode(text: string): string | null {
  const m = text.match(/c[oó]digo\s+(\d{3,6})/i) ?? text.match(/\b(\d{4})\b/);
  return m?.[1] ?? null;
}

export type PersonNameExtraction = {
  name: string | null;
  confidence: "high" | "low" | "none";
};

const NAME_PREFIX_RE =
  /^(?:(?:hola|buenas?(?:\s+(?:d[ií]as|tardes|noches))?)[,!.\s]+)*(?:(?:yo\s+)?(?:me\s+llamo|me\s+digo|me\s+dicen|me\s+llaman|mi\s+nombre\s+es|mi\s+nombre\s*:|soy))(?:\s+|$)/i;

const NAME_TRAILING_NOISE_RE =
  /[,!.]+(?:\s*(?:mucho\s+gusto|un\s+placer|para\s+servirte|gracias|eh|che))?$/i;

const NAME_REJECT_RE =
  /\b(tienda|pieza|producto|foto|precio|armar|quiero|necesito|ayuda|menu|men[uú]|whatsapp|hola|buenas|vendo|vendemos|rubro|comida|ropa|artesanal|ceramica|cer[aá]mica|negocio|gastronom[ií]a|indumentaria)\b/i;

function titleCaseName(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLocaleLowerCase("es-AR");
      if (/^(de|del|la|las|los|el|y|e)$/i.test(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("es-AR") + lower.slice(1);
    })
    .join(" ")
    .replace(/^(de|del|la|las|los|el|y|e)\s+/i, (m) => m.charAt(0).toUpperCase() + m.slice(1));
}

const NAME_PARTICLE_RE = /^(de|del|la|las|los|el|y|e)$/i;
const NAME_NON_NAME_RE =
  /^(ac[aá]|aqu[ií]|all[aá]|bien|mal|nuevo|nueva|yo|vos|usted|che)$/i;

function looksLikePersonName(candidate: string): boolean {
  if (!candidate || candidate.length < 2 || candidate.length > 40) return false;
  if (NAME_REJECT_RE.test(candidate)) return false;
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (!words.every((w) => /^[\p{L}][\p{L}'’.-]*$/u.test(w))) return false;
  const substantive = words.filter(
    (w) => !NAME_PARTICLE_RE.test(w) && !NAME_NON_NAME_RE.test(w),
  );
  return substantive.length >= 1;
}

/**
 * Extrae el nombre de pila/completo con reglas deterministas (ES / rioplatense).
 * Prefijos: me llamo, soy, mi nombre es, me dicen, me llaman, etc.
 */
export function extractPersonName(raw: string): PersonNameExtraction {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return { name: null, confidence: "none" };

  let rest = trimmed;
  let usedPrefix = false;
  const prefixMatch = trimmed.match(NAME_PREFIX_RE);
  if (prefixMatch) {
    usedPrefix = true;
    rest = trimmed.slice(prefixMatch[0].length).trim();
  } else {
    rest = trimmed.replace(
      /^(?:hola|buenas?(?:\s+(?:d[ií]as|tardes|noches))?)[,!.\s]+/i,
      "",
    ).trim();
  }

  rest = rest.replace(NAME_TRAILING_NOISE_RE, "").replace(/^["'«]|["'»]$/g, "").trim();

  if (!rest) return { name: null, confidence: "none" };

  if (!looksLikePersonName(rest)) {
    // Prefijo claro pero cola ruidosa → pedimos confirmación / reintento
    if (usedPrefix) {
      const firstToken = rest.split(/\s+/).find((w) => /^[\p{L}][\p{L}'’.-]*$/u.test(w));
      if (firstToken && looksLikePersonName(firstToken)) {
        return { name: titleCaseName(firstToken), confidence: "low" };
      }
      return { name: null, confidence: "none" };
    }
    return { name: null, confidence: "none" };
  }

  const name = titleCaseName(rest);
  return { name, confidence: usedPrefix || rest.split(/\s+/).length <= 3 ? "high" : "low" };
}

export function parseCaptionHints(text: string): {
  title?: string;
  priceCents?: number;
} {
  const priceCents = parsePriceToCents(text) ?? undefined;
  let title = text
    .replace(/\$?\s*\d[\d.,]*\s*(mil)?/gi, "")
    .replace(/\bpesos?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 2) title = undefined as unknown as string;
  return {
    title: title || undefined,
    priceCents,
  };
}

function cleanPlanFragment(raw: string): string {
  return raw
    .replace(/^["«]|["»]$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!]+$/, "")
    .trim();
}

function splitProductTitles(raw: string): string[] {
  const cleaned = raw
    .replace(/\b(despu[eé]s|luego).*$/i, "")
    .replace(/\by\s+despu[eé]s\b.*$/i, "")
    .trim();
  return cleaned
    .split(/\s*(?:,|;|\by\b|\bnada m[aá]s\b)\s*/i)
    .map((p) => cleanPlanFragment(p))
    .filter((p) => p.length >= 2 && p.length <= 60)
    .filter(
      (p) =>
        !/^(fotos?|despu[eé]s|luego|cargar|mandar|el|la|los|las|un|una)$/i.test(
          p,
        ),
    )
    .slice(0, 12);
}

/**
 * Parsea varios intents en un solo mensaje (tienda + logo + lista de productos).
 * Determinista; no inventa. Devuelve null si no hay al menos 2 señales o un plan claro.
 */
export function parseSetupPlan(text: string): PendingSetupPlan | null {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw || raw.length < 8) return null;

  const plan: PendingSetupPlan = {};

  const storeMatch =
    raw.match(
      /(?:la\s+)?tienda\s+se\s+llama\s+([^,.:;]+?)(?=\s*,|\s*;|\s*\.\s|\s+el\s+(?:logo|icono)|$)/i,
    ) ??
    raw.match(
      /(?:mi\s+)?tienda\s+(?:es|se\s+llama)\s+([^,.:;]+?)(?=\s*,|\s*;|\s*\.\s|\s+el\s+(?:logo|icono)|$)/i,
    ) ??
    raw.match(
      /se\s+llama\s+(?:la\s+tienda\s+)?([^,.:;]+?)(?=\s*,|\s*;|\s+el\s+(?:logo|icono)|$)/i,
    );
  if (storeMatch?.[1]) {
    const name = cleanPlanFragment(storeMatch[1]);
    if (name.length >= 2 && !/\b(logo|icono|producto)/i.test(name)) {
      plan.storeName = name;
    }
  }

  const iconUpload =
    /sub(ir|í|i)\s+(mi\s+)?(logo|icono|ícono)|mand(ar|á|a)\s+(mi\s+)?(logo|icono|ícono)/i.test(
      raw,
    );
  const iconGen =
    /(?:el\s+)?(?:logo|icono|ícono)\s+(?:sea|que\s+sea|de|con)\s+([^,.:;]+)/i.exec(
      raw,
    ) ??
    /(?:arm(?:ar|á|a)|gener(?:ar|á|a)|hac(?:er|é|e)|cre(?:ar|á|a))\s+(?:el\s+)?(?:logo|icono|ícono)(?:\s+(?:con|de|tipo))?\s*([^,.;]*)/i.exec(
      raw,
    );
  if (iconUpload) {
    plan.iconMode = "upload";
  } else if (iconGen || /\b(logo|icono|ícono)\b/i.test(raw)) {
    const hint = iconGen?.[1] ? cleanPlanFragment(iconGen[1]) : undefined;
    if (hint && hint.length >= 2) plan.iconHint = hint;
    if (hint || /\b(logo|icono|ícono)\b/i.test(raw)) {
      plan.iconMode = "generate";
    }
  }

  const productsMatch =
    raw.match(
      /productos?\s*(?:son|ser[ií]an|a\s+cargar|:)\s*(.+?)(?=(?:[.;]\s*(?:despu[eé]s|luego))|$)/i,
    ) ??
    raw.match(
      /(?:cargar|cargar[ií]amos|despu[eé]s)\s+(?:los\s+)?productos?\s*:?\s*(.+?)(?=(?:[.;]\s*(?:despu[eé]s|luego))|$)/i,
    );
  if (productsMatch?.[1]) {
    const titles = splitProductTitles(productsMatch[1]);
    if (titles.length > 0) plan.productTitles = titles;
  }

  if (
    /despu[eé]s(?:\s+cargamos)?(?:\s+las)?\s+fotos|luego(?:\s+cargamos)?(?:\s+las)?\s+fotos|fotos?\s+despu[eé]s|sin\s+fotos?\s+por\s+ahora/i.test(
      raw,
    )
  ) {
    plan.deferPhotos = true;
  }

  // Color de acento (“color verde”, “quiero verde”, hex).
  const accent = matchAccentFromText(raw);
  if (
    accent &&
    (wantsAccentColorText(raw) ||
      /\bcolor\s+/i.test(raw) ||
      /#([0-9a-fA-F]{6})\b/.test(raw))
  ) {
    plan.accentColor = accent.hex.toLowerCase();
    plan.accentLabel = accent.label;
  }

  // Rubro (“vendo cerámica”, “tienda de comida”, “ropa”).
  const kind = matchBusinessKindFromText(raw);
  if (kind && (wantsBusinessKindText(raw) || /\b(rubro|vendo|tienda de|negocio de)\b/i.test(raw))) {
    plan.businessKind = kind.id;
    plan.businessKindLabel = kind.label;
  }

  // Tema de fondo (“tema oscuro”, “estilo crema”).
  const theme = matchThemeFromText(raw);
  if (
    theme &&
    (wantsStoreThemeText(raw) || /\b(tema|estilo|fondo)\b/i.test(raw))
  ) {
    plan.theme = theme.id;
    plan.themeLabel = theme.label;
  }

  // Frase de bienvenida (“decí que retiro en el local”).
  if (wantsWelcomeMessageText(raw) || wantsClearWelcomeText(raw)) {
    if (wantsClearWelcomeText(raw)) {
      plan.welcomeMessage = "";
    } else {
      const welcome = extractWelcomeFromText(raw);
      if (welcome) plan.welcomeMessage = welcome;
    }
  }

  // En mensajes largos, extractPersonName falla por el resto tras la coma.
  const ownerMatch = raw.match(
    /(?:me\s+llamo|me\s+digo|me\s+dicen|me\s+llaman|mi\s+nombre\s+es|soy)\s+([\p{L}][\p{L}'’.-]*(?:\s+(?:de|del|la|las|los|el|y|e|[\p{L}][\p{L}'’.-]*)){0,3})(?=\s*[,.;]|\s+la\s+tienda|\s+el\s+(?:logo|icono)|\s+productos?\b|$)/iu,
  );
  if (ownerMatch?.[1]) {
    const candidate = cleanPlanFragment(ownerMatch[1]);
    if (looksLikePersonName(candidate)) {
      plan.ownerName = titleCaseName(candidate);
    }
  } else if (
    // Evitar que «estilo crema» / «tema oscuro» se lean como nombre de persona.
    !plan.theme &&
    plan.welcomeMessage === undefined &&
    !plan.accentColor &&
    !plan.businessKind
  ) {
    const person = extractPersonName(raw);
    if (person.name && person.confidence !== "none") {
      plan.ownerName = person.name;
    }
  }

  const signals = [
    plan.storeName,
    plan.iconMode,
    plan.productTitles?.length,
    plan.accentColor,
    plan.businessKind,
    plan.theme,
    plan.welcomeMessage !== undefined ? plan.welcomeMessage || "clear" : null,
    plan.ownerName &&
      (plan.storeName ||
        plan.iconMode ||
        plan.productTitles ||
        plan.accentColor ||
        plan.businessKind ||
        plan.theme ||
        plan.welcomeMessage !== undefined),
  ].filter(Boolean).length;

  // Un solo campo aislado lo maneja el flujo paso a paso; pedimos plan real.
  if (signals < 2 && !(plan.productTitles && plan.productTitles.length >= 2)) {
    return null;
  }

  return plan;
}

export function mergeSetupPlan(
  current: PendingSetupPlan | undefined,
  incoming: PendingSetupPlan | null,
): PendingSetupPlan | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  return {
    ownerName: incoming.ownerName ?? current.ownerName,
    storeName: incoming.storeName ?? current.storeName,
    iconHint: incoming.iconHint ?? current.iconHint,
    iconMode: incoming.iconMode ?? current.iconMode,
    accentColor: incoming.accentColor ?? current.accentColor,
    accentLabel: incoming.accentLabel ?? current.accentLabel,
    businessKind: incoming.businessKind ?? current.businessKind,
    businessKindLabel: incoming.businessKindLabel ?? current.businessKindLabel,
    theme: incoming.theme ?? current.theme,
    themeLabel: incoming.themeLabel ?? current.themeLabel,
    welcomeMessage:
      incoming.welcomeMessage !== undefined
        ? incoming.welcomeMessage
        : current.welcomeMessage,
    productTitles:
      incoming.productTitles && incoming.productTitles.length > 0
        ? incoming.productTitles
        : current.productTitles,
    deferPhotos: incoming.deferPhotos ?? current.deferPhotos,
  };
}

export function describeSetupPlan(plan: PendingSetupPlan): string {
  const bits: string[] = [];
  if (plan.storeName) bits.push(`tienda «${plan.storeName}»`);
  if (plan.iconMode === "upload") bits.push("subir logo");
  else if (plan.iconMode === "generate") {
    bits.push(
      plan.iconHint ? `logo «${plan.iconHint}»` : "armar logo",
    );
  }
  if (plan.accentColor) {
    bits.push(
      plan.accentLabel
        ? `color ${plan.accentLabel}`
        : `color ${plan.accentColor}`,
    );
  }
  if (plan.businessKind) {
    bits.push(
      plan.businessKindLabel
        ? `rubro ${plan.businessKindLabel}`
        : `rubro ${plan.businessKind}`,
    );
  }
  if (plan.theme) {
    bits.push(
      plan.themeLabel ? `estilo ${plan.themeLabel}` : `estilo ${plan.theme}`,
    );
  }
  if (plan.welcomeMessage !== undefined) {
    bits.push(
      plan.welcomeMessage
        ? `frase «${plan.welcomeMessage}»`
        : "sin frase de bienvenida",
    );
  }
  if (plan.productTitles?.length) {
    bits.push(
      `productos: ${plan.productTitles.join(", ")}${
        plan.deferPhotos ? " (fotos después)" : ""
      }`,
    );
  }
  return bits.join(" · ");
}

/** LLM opcional: si falla o no hay gateway, devolvemos unknown. */
export async function interpretFreeText(
  text: string,
): Promise<FreeTextAction> {
  const lowered = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/\b(menu|menú)\b/.test(lowered) || lowered === "menu") {
    return { intent: "menu" };
  }
  if (/\bayuda\b/.test(lowered) || lowered === "help") {
    return { intent: "help" };
  }
  if (
    /\b(listado|listar|ver stock|mi stock|mis piezas|mis productos|que tengo|qué tengo)\b/.test(
      lowered,
    ) ||
    /ver (mis )?productos/.test(lowered) ||
    /mostrame (el )?stock|mostrame (mis )?piezas/.test(lowered)
  ) {
    return { intent: "list_stock", productHint: text };
  }
  if (
    /\b(stock|pausar|paus[ae]|reactivar|cantidad(es)?|inventario)\b/.test(lowered) ||
    /sin stock|agotad|ya no tengo|volvio|volvió|se agoto|se agotó|pone(le)? \d|pon[eé] \d/.test(
      lowered,
    )
  ) {
    // "pausar X" / "se agotó X" → pausa concreta (el motor busca el producto)
    if (
      /\b(pausar|paus[ae]|pause)\b/.test(lowered) ||
      /sin stock|agotad|ya no tengo|no tengo|se agoto|se agotó/.test(lowered)
    ) {
      return { intent: "mark_out_of_stock", productHint: text };
    }
    return { intent: "manage_stock", productHint: text };
  }
  if (
    /cambia(r|le)? (el )?precio|ahora sale|sale \d|sale a \d|pon[eé](le)? (el )?precio/.test(
      lowered,
    )
  ) {
    return { intent: "set_price", productHint: text, priceHint: text };
  }
  if (/cambia(r|le)? (la )?foto/.test(lowered)) {
    return { intent: "change_photo", productHint: text };
  }
  // Foto de perfil Clerk/Google → icono de la TIENDA.
  if (
    /usar mi foto( de (google|cuenta|perfil))?|foto de (mi )?(google|cuenta|perfil)|mi foto de (google|cuenta)|icono (con|de) (mi )?foto/.test(
      lowered,
    )
  ) {
    return { intent: "profile_icon" };
  }
  // Subir icono de la TIENDA (no foto de producto).
  if (
    /sub(ir|í|i) (mi )?(icono|ícono|logo)|mand(ar|á|a) (mi )?(icono|ícono|logo)|cargar (mi )?(icono|ícono|logo)|mi (propio )?(icono|ícono|logo)|icono propio/.test(
      lowered,
    )
  ) {
    return { intent: "upload_icon" };
  }
  // Armar / pedir icono de la tienda (texto o audio → STT).
  if (
    /\b(icono|ícono|favicon)\b/.test(lowered) ||
    /logo de (la )?(app|tienda)/.test(lowered) ||
    /icono de (la )?(app|tienda|pwa)/.test(lowered) ||
    /(gener(ar|á|a)|arm(ar|á|a)|hac(er|é|e)|cre(ar|á|a)|dibuj(ar|á|a)|cambi(ar|á|a)) (el )?(icono|ícono)/.test(
      lowered,
    ) ||
    /nuevo icono|icono (de )?pwa|icono (de )?mi tienda/.test(lowered)
  ) {
    return { intent: "generate_icon" };
  }

  // Color de acento de la vitrina (“quiero verde”, “color azul”).
  if (wantsAccentColorText(text)) {
    const swatch = matchAccentFromText(text);
    return {
      intent: "set_accent_color",
      accentHint: swatch?.hex,
    };
  }

  // Rubro del negocio (“vendo cerámica”, “mi tienda es de comida”).
  if (wantsBusinessKindText(text)) {
    const kind = matchBusinessKindFromText(text);
    return {
      intent: "set_business_kind",
      businessKindHint: kind?.id,
    };
  }

  // Tema de fondo (“tema oscuro”, “estilo crema”).
  if (wantsStoreThemeText(text)) {
    const theme = matchThemeFromText(text);
    return {
      intent: "set_store_theme",
      themeHint: theme?.id,
    };
  }

  // Frase de bienvenida (“decí que retiro en el local”).
  if (wantsWelcomeMessageText(text) || wantsClearWelcomeText(text)) {
    const welcome = wantsClearWelcomeText(text)
      ? ""
      : extractWelcomeFromText(text) ?? undefined;
    return {
      intent: "set_welcome_message",
      welcomeHint: welcome,
    };
  }

  // LLM opcional: Gateway o Google directo
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { intent: "unknown" };
  }

  const nluPrompt = `Sos el NLU de un bot de tienda por WhatsApp para personas mayores en Argentina.
Intents: change_photo = foto de un PRODUCTO; generate_icon = armar/cambiar el ICONO de la TIENDA (app); upload_icon = subir imagen propia como icono de la tienda; profile_icon = usar la foto de Google/cuenta Clerk como icono de la tienda; set_accent_color = color de acento de la vitrina (botones/links); accentHint = hex #rrggbb si lo deducís (verde≈#047857, azul≈#1d4ed8, terracota≈#9a3412); set_business_kind = rubro del negocio (artesanal/cerámica, comida, ropa); businessKindHint = artesanal|comida|ropa; set_store_theme = tema/estilo de fondo (claro/crema/oscuro); themeHint = claro|crema|oscuro; set_welcome_message = frase corta bajo el nombre de la tienda; welcomeHint = texto de la frase (vacío = borrar).
Del mensaje, devolvé una acción tipada. No inventes. Mensaje: """${text}"""`;

  try {
    const { generateObject } = await import("ai");
    if (process.env.AI_GATEWAY_API_KEY?.trim()) {
      const { gateway } = await import("@ai-sdk/gateway");
      const result = await generateObject({
        model: gateway("google/gemini-3.5-flash-lite"),
        schema: freeTextActionSchema,
        prompt: nluPrompt,
        maxRetries: 0,
      });
      return result.object;
    }
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!.trim(),
    });
    const result = await generateObject({
      model: google("gemini-3.5-flash-lite"),
      schema: freeTextActionSchema,
      prompt: nluPrompt,
      maxRetries: 0,
    });
    return result.object;
  } catch (err) {
    console.warn("[nlu] LLM unavailable, falling back", err);
    return { intent: "unknown" };
  }
}
