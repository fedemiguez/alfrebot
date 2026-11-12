/**
 * Color de acento de la vitrina (Fase A personalización).
 * Swatches con contraste seguro sobre blanco (texto/botón oscuro → blanco).
 */

export const DEFAULT_ACCENT_HEX = "#9a3412";

export type AccentSwatch = {
  /** Id estable para choiceId `accent_<id>`. */
  id: string;
  label: string;
  hex: string;
  /** Sinónimos NLU (sin tildes, minúsculas). */
  aliases: string[];
};

/** 8 swatches nombrados; terracota = default de marca. */
export const ACCENT_SWATCHES: AccentSwatch[] = [
  {
    id: "terracota",
    label: "Terracota",
    hex: "#9a3412",
    aliases: ["terracota", "terracotta", "naranja", "ladrillo", "default", "por defecto"],
  },
  {
    id: "verde",
    label: "Verde",
    hex: "#047857",
    aliases: ["verde", "esmeralda", "green"],
  },
  {
    id: "azul",
    label: "Azul",
    hex: "#1d4ed8",
    aliases: ["azul", "blue"],
  },
  {
    id: "rojo",
    label: "Rojo",
    hex: "#b91c1c",
    aliases: ["rojo", "bordo", "red", "carmesi"],
  },
  {
    id: "rosa",
    label: "Rosa",
    hex: "#be123c",
    aliases: ["rosa", "fucsia", "magenta", "pink"],
  },
  {
    id: "mostaza",
    label: "Mostaza",
    hex: "#a16207",
    aliases: ["mostaza", "amarillo", "dorado", "ocre", "yellow"],
  },
  {
    id: "teal",
    label: "Teal",
    hex: "#0f766e",
    aliases: ["teal", "turquesa", "aguamarina"],
  },
  {
    id: "tinta",
    label: "Tinta",
    hex: "#0f172a",
    aliases: ["tinta", "negro", "slate", "gris oscuro", "oscuro", "black"],
  },
];

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function normalizeAccentHex(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!HEX_RE.test(t)) return null;
  return t.toLowerCase();
}

/** Hex guardado o default de marca. */
export function resolveAccentHex(
  stored: string | null | undefined,
): string {
  return normalizeAccentHex(stored) ?? DEFAULT_ACCENT_HEX;
}

export function swatchById(id: string): AccentSwatch | undefined {
  return ACCENT_SWATCHES.find((s) => s.id === id);
}

export function swatchByHex(hex: string): AccentSwatch | undefined {
  const n = normalizeAccentHex(hex);
  if (!n) return undefined;
  return ACCENT_SWATCHES.find((s) => s.hex.toLowerCase() === n);
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
 * Detecta un swatch en texto libre (“quiero verde”, “color azul”, “poné mostaza”).
 */
export function matchAccentFromText(text: string): AccentSwatch | null {
  const t = fold(text);
  if (!t) return null;

  // Hex explícito
  const hexMatch = text.match(/#([0-9a-fA-F]{6})\b/);
  if (hexMatch) {
    const hex = `#${hexMatch[1]!.toLowerCase()}`;
    return swatchByHex(hex) ?? {
      id: "custom",
      label: hex,
      hex,
      aliases: [],
    };
  }

  // Preferir matches más largos / específicos
  let best: AccentSwatch | null = null;
  let bestLen = 0;
  for (const swatch of ACCENT_SWATCHES) {
    for (const alias of [swatch.id, swatch.label, ...swatch.aliases]) {
      const a = fold(alias);
      if (!a) continue;
      const re = new RegExp(`(?:^|\\b)${a.replace(/\s+/g, "\\s+")}(?:\\b|$)`);
      if (re.test(t) && a.length >= bestLen) {
        best = swatch;
        bestLen = a.length;
      }
    }
  }
  return best;
}

/** true si el mensaje parece pedir cambiar el color de la vitrina. */
export function wantsAccentColorText(text: string): boolean {
  const t = fold(text);
  if (
    /\b(color|acento|paleta|personaliz)\b/.test(t) ||
    /\bquiero\s+(verde|azul|rojo|rosa|mostaza|teal|tinta|terracota|naranja|negro)\b/.test(
      t,
    ) ||
    /\b(pon[eé]|cambia(r|le)?|dej[aá]|usa(r)?|ponele)\s+(el\s+)?(color\s+)?(verde|azul|rojo|rosa|mostaza|teal|tinta|terracota|naranja|negro)\b/.test(
      t,
    )
  ) {
    return Boolean(matchAccentFromText(text));
  }
  // Solo el nombre del color + verbo de deseo / “color …”
  if (matchAccentFromText(text) && /\b(color|quiero|pon|cambia|dej|usa|acento)\b/.test(t)) {
    return true;
  }
  return false;
}

/** Variables CSS para la vitrina pública (override de --primary). */
export function accentStyleVars(
  stored: string | null | undefined,
): Record<string, string> {
  const hex = resolveAccentHex(stored);
  // Tinte suave del acento para papel/borde (hex + alpha vía color-mix en CSS moderno)
  return {
    "--primary": hex,
    "--primary-fg": "#ffffff",
    "--store-accent": hex,
  };
}
