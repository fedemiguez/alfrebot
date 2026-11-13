/**
 * Rubro del negocio (Fase B + marcos Fase D + trama de fondo).
 * Define layout de card, marco en la foto y trama de iconos en la vitrina;
 * null = default sin marco ni trama.
 */

export type BusinessKind = "artesanal" | "comida" | "ropa";

export type BusinessKindOption = {
  /** Id estable para choiceId `kind_<id>`. */
  id: BusinessKind;
  label: string;
  /** Texto corto en header de vitrina. */
  headerLabel: string;
  /** Sinónimos NLU (sin tildes, minúsculas). */
  aliases: string[];
};

export const BUSINESS_KINDS: BusinessKindOption[] = [
  {
    id: "artesanal",
    label: "Artesanal",
    headerLabel: "Artesanal",
    aliases: [
      "artesanal",
      "artesania",
      "artesanía",
      "ceramica",
      "cerámica",
      "ceramicas",
      "cerámicas",
      "hecho a mano",
      "handmade",
      "taller",
      "alfareria",
      "alfarería",
      "pottery",
    ],
  },
  {
    id: "comida",
    label: "Comida",
    headerLabel: "Comida",
    aliases: [
      "comida",
      "comida casera",
      "gastronomia",
      "gastronomía",
      "pasteleria",
      "pastelería",
      "panaderia",
      "panadería",
      "catering",
      "cocina",
      "food",
      "dulces",
      "viandas",
    ],
  },
  {
    id: "ropa",
    label: "Ropa",
    headerLabel: "Ropa",
    aliases: [
      "ropa",
      "indumentaria",
      "vestimenta",
      "moda",
      "fashion",
      "textil",
      "remeras",
      "calzado",
      "accesorios",
    ],
  },
];

const VALID = new Set<string>(BUSINESS_KINDS.map((k) => k.id));

export function normalizeBusinessKind(
  raw: string | null | undefined,
): BusinessKind | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!VALID.has(t)) return null;
  return t as BusinessKind;
}

/** Valor guardado o null (layout default). */
export function resolveBusinessKind(
  stored: string | null | undefined,
): BusinessKind | null {
  return normalizeBusinessKind(stored);
}

export function kindById(id: string): BusinessKindOption | undefined {
  return BUSINESS_KINDS.find((k) => k.id === id);
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detecta rubro en texto libre (“vendo cerámica”, “mi tienda es de comida”, “ropa”).
 */
export function matchBusinessKindFromText(
  text: string,
): BusinessKindOption | null {
  const t = fold(text);
  if (!t) return null;

  let best: BusinessKindOption | null = null;
  let bestLen = 0;
  for (const kind of BUSINESS_KINDS) {
    for (const alias of [kind.id, kind.label, ...kind.aliases]) {
      const a = fold(alias);
      if (!a) continue;
      const re = new RegExp(`(?:^|\\b)${a.replace(/\s+/g, "\\s+")}(?:\\b|$)`);
      if (re.test(t) && a.length >= bestLen) {
        best = kind;
        bestLen = a.length;
      }
    }
  }
  return best;
}

/** true si el mensaje parece pedir / declarar el rubro del negocio. */
export function wantsBusinessKindText(text: string): boolean {
  const t = fold(text);
  if (!t) return false;

  const kindCue =
    /\b(rubro|giro|ramo)\b/.test(t) ||
    /\b(vendo|vendemos)\b/.test(t) ||
    /\b(mi\s+tienda|el\s+negocio|mi\s+negocio|somos|soy)\s+(es\s+)?(de\s+)?/.test(
      t,
    ) ||
    /\b(es\s+de|somos\s+de|tienda\s+de|negocio\s+de)\b/.test(t) ||
    /\b(personaliz|plantilla|estilo\s+de\s+(card|ficha|producto))\b/.test(t);

  if (kindCue && matchBusinessKindFromText(text)) return true;

  // “rubro artesanal”, “poné comida”, “quiero ropa”
  if (
    matchBusinessKindFromText(text) &&
    /\b(rubro|quiero|pon|cambia|dej|usa|soy|vendo|tienda|negocio|somos)\b/.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}

/** Clase CSS en la vitrina (`store-kind-artesanal`, etc.). */
export function businessKindClassName(
  stored: string | null | undefined,
): string {
  const kind = resolveBusinessKind(stored);
  return kind ? `store-kind-${kind}` : "store-kind-default";
}

/**
 * Clase de trama de iconos en el shell (`store-pattern--comida`).
 * Sin rubro → vacío. En vitrina pública preferir `shouldShowStorePattern`
 * (PR7: trama archivada / off con Ikt).
 */
export function storePatternClassName(
  stored: string | null | undefined,
): string {
  const kind = resolveBusinessKind(stored);
  return kind ? `store-pattern store-pattern--${kind}` : "";
}

/** Label opcional para el header de la vitrina. */
export function businessKindHeaderLabel(
  stored: string | null | undefined,
): string | null {
  const kind = resolveBusinessKind(stored);
  if (!kind) return null;
  return kindById(kind)?.headerLabel ?? null;
}
