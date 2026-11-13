/**
 * Temas de fondo de la vitrina (Fase C personalización).
 * Presets fijos — sin CSS libre del usuario.
 */

export type StoreThemeId = "claro" | "crema" | "oscuro";

export type StoreThemeOption = {
  /** Id estable para choiceId `theme_<id>`. */
  id: StoreThemeId;
  label: string;
  /** Texto corto al confirmar. */
  blurb: string;
  /** Sinónimos NLU (sin tildes, minúsculas). */
  aliases: string[];
};

/** 3 presets: Claro WA, Crema artesanal, Oscuro suave. */
export const STORE_THEMES: StoreThemeOption[] = [
  {
    id: "claro",
    label: "Claro WA",
    blurb: "Fondo claro tipo chat, fresco y legible",
    aliases: [
      "claro",
      "claro wa",
      "whatsapp",
      "wa",
      "light",
      "blanco",
      "fresco",
    ],
  },
  {
    id: "crema",
    label: "Crema artesanal",
    blurb: "Papel cálido, tono taller",
    aliases: [
      "crema",
      "crema artesanal",
      "artesanal",
      "calido",
      "cálido",
      "papel",
      "beige",
    ],
  },
  {
    id: "oscuro",
    label: "Oscuro suave",
    blurb: "Carbón suave, sin forzar dark mode genérico",
    aliases: [
      "oscuro",
      "oscuro suave",
      "dark",
      "noche",
      "carbon",
      "carbón",
      "negro suave",
    ],
  },
];

const VALID = new Set<string>(STORE_THEMES.map((t) => t.id));

export function normalizeStoreTheme(
  raw: string | null | undefined,
): StoreThemeId | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!VALID.has(t)) return null;
  return t as StoreThemeId;
}

/** Valor guardado o null (look del sitio). */
export function resolveStoreTheme(
  stored: string | null | undefined,
): StoreThemeId | null {
  return normalizeStoreTheme(stored);
}

export function themeById(id: string): StoreThemeOption | undefined {
  return STORE_THEMES.find((t) => t.id === id);
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
 * Detecta tema en texto libre (“tema oscuro”, “fondo crema”, “estilo claro”).
 */
export function matchThemeFromText(text: string): StoreThemeOption | null {
  const t = fold(text);
  if (!t) return null;

  let best: StoreThemeOption | null = null;
  let bestLen = 0;
  for (const theme of STORE_THEMES) {
    for (const alias of [theme.id, theme.label, ...theme.aliases]) {
      const a = fold(alias);
      if (!a) continue;
      // Evitar que «artesanal» (rubro) robe «crema artesanal» sin cue de tema.
      if (a === "artesanal" && !/\b(tema|estilo|fondo|crema)\b/.test(t)) {
        continue;
      }
      const re = new RegExp(`(?:^|\\b)${a.replace(/\s+/g, "\\s+")}(?:\\b|$)`);
      if (re.test(t) && a.length >= bestLen) {
        best = theme;
        bestLen = a.length;
      }
    }
  }
  return best;
}

/** true si el mensaje parece pedir cambiar el tema / estilo de fondo. */
export function wantsStoreThemeText(text: string): boolean {
  const t = fold(text);
  if (!t) return false;

  const themeCue =
    /\b(tema|estilo|fondo|apariencia)\b/.test(t) ||
    /\b(claro wa|crema artesanal|oscuro suave)\b/.test(t) ||
    /\b(modo\s+oscuro|fondo\s+oscuro|fondo\s+claro|fondo\s+crema)\b/.test(t);

  if (themeCue && matchThemeFromText(text)) return true;

  if (
    matchThemeFromText(text) &&
    /\b(tema|estilo|fondo|quiero|pon|cambia|dej|usa)\b/.test(t)
  ) {
    return true;
  }

  return false;
}

/** Clase CSS en la vitrina (`store-theme-claro`, etc.). */
export function storeThemeClassName(
  stored: string | null | undefined,
): string {
  const theme = resolveStoreTheme(stored);
  return theme ? `store-theme-${theme}` : "store-theme-default";
}

/** Label legible del tema guardado (o null). */
export function storeThemeLabel(
  stored: string | null | undefined,
): string | null {
  const theme = resolveStoreTheme(stored);
  if (!theme) return null;
  return themeById(theme)?.label ?? null;
}
