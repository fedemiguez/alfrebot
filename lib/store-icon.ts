import sharp from "sharp";
import { uploadStoreIcon } from "@/lib/blob";
import type { Product, Store } from "@/lib/db/schema";

export const ICON_SIZES = {
  png192: 192,
  png512: 512,
  apple: 180,
} as const;

/** Bump when monogram raster changes so header/PWA fallbacks skip stale blank PNGs. */
export const MONOGRAM_ICON_VERSION = "mono2";

/** On-the-fly monogram URL (no uploaded icon yet). */
export function monogramIconPath(slug: string, size: number): string {
  return `/${slug}/icon/${size}?v=${MONOGRAM_ICON_VERSION}`;
}

/** Presupuesto total del pipeline (Gemini + raster + Blob). */
export const STORE_ICON_BUDGET_MS = 18_000;
const GEMINI_TIMEOUT_MS = 8_000;
const SHARP_TIMEOUT_MS = 4_000;
const BLOB_TIMEOUT_MS = 8_000;

export type StoreIconUrls = {
  icon192Url: string;
  icon512Url: string;
  iconAppleUrl: string;
  iconSvgUrl: string;
  source: "ai" | "composed" | "upload" | "monogram";
  /** true si caímos a composición/monograma por timeout/error de AI o sharp. */
  fellBack?: boolean;
  /** Pedido de diseño que se intentó honrar (si había). */
  designHint?: string;
};

const BRAND_PRIMARY = "#9A3412";
const BRAND_BG = "#FFFBEB";
const COMPOSE_BG = "#0B1B3A";

export type IconMotif =
  | "lamp"
  | "sushi"
  | "ball"
  | "fire"
  | "pottery"
  | "bread"
  | "flower"
  | "coffee"
  | "plant"
  | "star"
  | "heart"
  | "bag"
  | "fish"
  | "pizza"
  | "book"
  | "gem"
  | "scissors";

const MOTIF_PATTERNS: { id: IconMotif; re: RegExp }[] = [
  { id: "lamp", re: /\b(lamp|l[aá]mpara|luz|foco|velador|spotlight|linterna)\b/i },
  { id: "sushi", re: /\b(sushi|nigiri|maki|sashimi|roll)\b/i },
  { id: "ball", re: /\b(pelota|f[uú]tbol|futbol|soccer|bal[oó]n|ball)\b/i },
  { id: "fire", re: /\b(fuego|fire|llama|llamas|flama|ardiente|incendio)\b/i },
  {
    id: "pottery",
    re: /\b(cer[aá]mica|vaso|taza|olla|plato|jarra|pottery|mug|cuenco)\b/i,
  },
  { id: "bread", re: /\b(pan|panader[ií]a|factura|medialuna|bread|bakery)\b/i },
  { id: "flower", re: /\b(flor|flores|ramo|rosas?|flower)\b/i },
  { id: "coffee", re: /\b(caf[eé]|coffee|espresso|cafeter[ií]a)\b/i },
  { id: "plant", re: /\b(planta|plantas|maceta|cactus|suculenta|verde)\b/i },
  { id: "star", re: /\b(estrella|star|brillo)\b/i },
  { id: "heart", re: /\b(coraz[oó]n|heart|amor)\b/i },
  { id: "bag", re: /\b(bolsa|bolso|tienda|shop|store|mercado)\b/i },
  { id: "fish", re: /\b(pescado|pez|fish|mariscos?)\b/i },
  { id: "pizza", re: /\b(pizza|empanada|hamburguesa|burger)\b/i },
  { id: "book", re: /\b(libro|book|cuaderno|librer[ií]a)\b/i },
  { id: "gem", re: /\b(joya|anillo|piedra|gem|cristal|bijou)\b/i },
  { id: "scissors", re: /\b(tijera|corte|peluquer[ií]a|barber)\b/i },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timeout after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Iniciales legibles para monograma (1–2 letras). Solo fallback on-the-fly. */
export function storeInitials(name: string | null | undefined): string {
  const cleaned = (name ?? "Tienda")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const parts = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^(de|del|la|las|los|el|y|e|da|do)$/i.test(w));
  if (parts.length === 0) return "T";
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/**
 * Glyphs as paths (no <text>): sharp/librsvg often drops fonts in serverless,
 * which left a blank tierra circle on store headers / PWA monograms.
 * Coords in a 100×120 box; caller scales/positions.
 */
const MONOGRAM_GLYPHS: Record<string, string> = {
  A: "M50 6 L92 114 H70 L62 90 H38 L30 114 H8 Z M42 68 H58 L50 42 Z",
  B: "M18 8 H58 C78 8 90 22 90 38 C90 50 82 60 70 64 C86 68 96 80 96 96 C96 114 80 114 58 114 H18 Z M40 28 V50 H56 C64 50 68 46 68 40 C68 34 64 28 56 28 Z M40 72 V94 H58 C68 94 74 88 74 82 C74 76 68 72 58 72 Z",
  C: "M90 28 C78 12 62 6 48 6 C22 6 8 30 8 60 C8 90 22 114 48 114 C62 114 78 108 90 92 L72 78 C66 86 58 92 48 92 C34 92 28 78 28 60 C28 42 34 28 48 28 C58 28 66 34 72 42 Z",
  D: "M18 8 H52 C78 8 94 28 94 60 C94 92 78 114 52 114 H18 Z M40 28 V94 H52 C66 94 72 80 72 60 C72 40 66 28 52 28 Z",
  E: "M20 8 H88 V30 H44 V48 H80 V70 H44 V92 H88 V114 H20 Z",
  F: "M20 8 H88 V30 H44 V54 H78 V76 H44 V114 H20 Z",
  G: "M90 28 C78 12 62 6 48 6 C22 6 8 30 8 60 C8 90 22 114 48 114 C66 114 82 104 90 88 V64 H58 V86 H70 C66 96 58 102 48 102 C34 102 28 84 28 60 C28 36 36 20 50 20 C60 20 68 26 74 36 Z",
  H: "M16 8 H40 V48 H60 V8 H84 V114 H60 V72 H40 V114 H16 Z",
  I: "M28 8 H72 V30 H56 V92 H72 V114 H28 V92 H44 V30 H28 Z",
  J: "M30 8 H86 V30 H66 V78 C66 96 56 114 36 114 C24 114 14 108 10 98 L28 86 C30 90 34 94 38 94 C46 94 48 86 48 78 V8 Z",
  K: "M16 8 H40 V52 L70 8 H96 L58 60 L98 114 H72 L40 70 V114 H16 Z",
  L: "M20 8 H44 V92 H88 V114 H20 Z",
  M: "M10 114 V8 H34 L50 52 L66 8 H90 V114 H68 V48 L50 90 L32 48 V114 Z",
  N: "M14 114 V8 H38 L66 70 V8 H86 V114 H62 L34 52 V114 Z",
  O: "M50 6 C78 6 94 30 94 60 C94 90 78 114 50 114 C22 114 6 90 6 60 C6 30 22 6 50 6 Z M50 28 C36 28 28 42 28 60 C28 78 36 92 50 92 C64 92 72 78 72 60 C72 42 64 28 50 28 Z",
  P: "M18 8 H60 C82 8 94 24 94 44 C94 64 82 80 60 80 H40 V114 H18 Z M40 28 V60 H58 C66 60 72 54 72 44 C72 34 66 28 58 28 Z",
  Q: "M50 6 C78 6 94 30 94 60 C94 78 86 94 72 104 L90 114 H66 L56 104 C54 104 52 104 50 104 C22 104 6 84 6 60 C6 30 22 6 50 6 Z M50 28 C36 28 28 42 28 60 C28 78 36 92 50 92 C64 92 72 78 72 60 C72 42 64 28 50 28 Z",
  R: "M18 8 H60 C82 8 94 24 94 44 C94 60 84 72 70 76 L96 114 H70 L48 78 H40 V114 H18 Z M40 28 V56 H58 C66 56 72 50 72 44 C72 36 66 28 58 28 Z",
  S: "M88 30 C78 14 64 6 48 6 C28 6 12 18 12 36 C12 54 26 62 48 68 C62 72 70 76 70 84 C70 94 62 100 48 100 C36 100 26 94 20 86 L8 102 C18 114 32 114 48 114 C74 114 92 100 92 80 C92 60 76 52 54 46 C40 42 32 40 32 34 C32 26 38 22 48 22 C58 22 68 26 74 34 Z",
  T: "M12 8 H88 V30 H62 V114 H38 V30 H12 Z",
  U: "M16 8 H40 V72 C40 88 46 96 50 96 C54 96 60 88 60 72 V8 H84 V76 C84 102 70 114 50 114 C30 114 16 102 16 76 Z",
  V: "M10 8 H34 L50 78 L66 8 H90 L58 114 H42 Z",
  W: "M8 8 H30 L40 78 L50 28 H66 L76 78 L86 8 H108 L88 114 H68 L58 68 L48 114 H28 Z",
  X: "M12 8 H36 L50 40 L64 8 H88 L62 60 L90 114 H66 L50 80 L34 114 H10 L38 60 Z",
  Y: "M10 8 H34 L50 48 L66 8 H90 L62 64 V114 H38 V64 Z",
  Z: "M14 8 H86 V30 L42 92 H88 V114 H12 V92 L56 30 H14 Z",
  "0": "M50 8 C74 8 90 30 90 60 C90 90 74 112 50 112 C26 112 10 90 10 60 C10 30 26 8 50 8 Z M50 28 C38 28 32 42 32 60 C32 78 38 92 50 92 C62 92 68 78 68 60 C68 42 62 28 50 28 Z",
  "1": "M30 28 L50 8 H62 V114 H38 V40 L30 48 Z",
  "2": "M16 28 C24 14 36 8 52 8 C72 8 88 22 88 42 C88 58 78 68 60 80 L40 92 H88 V114 H12 V92 L52 60 C62 52 66 48 66 40 C66 32 60 28 52 28 C42 28 36 34 32 40 Z",
  "3": "M20 24 C28 12 40 8 52 8 C72 8 88 22 88 40 C88 52 80 60 68 64 C82 68 92 80 92 94 C92 112 74 114 52 114 C36 114 22 108 14 96 L30 82 C34 90 42 94 52 94 C62 94 70 88 70 80 C70 72 62 68 52 68 H40 V48 H52 C62 48 68 42 68 36 C68 30 62 26 52 26 C44 26 36 30 32 36 Z",
  "4": "M58 8 H82 V70 H94 V92 H82 V114 H58 V92 H12 V70 L58 8 Z M58 32 L30 70 H58 Z",
  "5": "M24 8 H84 V30 H46 V48 H62 C82 48 94 62 94 82 C94 104 78 114 54 114 C36 114 22 106 14 94 L30 80 C34 88 44 94 54 94 C64 94 72 88 72 80 C72 72 64 66 52 66 H24 Z",
  "6": "M78 24 C68 12 56 8 44 8 C24 8 10 28 10 58 C10 90 26 114 52 114 C76 114 92 96 92 76 C92 54 76 40 56 40 C46 40 38 44 32 50 V44 C32 32 36 24 46 24 C54 24 62 28 68 36 Z M52 58 C64 58 70 66 70 76 C70 86 64 96 52 96 C40 96 34 86 34 76 C34 66 40 58 52 58 Z",
  "7": "M14 8 H86 V32 L46 114 H20 L58 32 H14 Z",
  "8": "M50 6 C70 6 86 20 86 38 C86 50 78 60 66 64 C80 68 92 80 92 96 C92 114 74 114 50 114 C26 114 8 114 8 96 C8 80 20 68 34 64 C22 60 14 50 14 38 C14 20 30 6 50 6 Z M50 26 C42 26 36 32 36 38 C36 44 42 50 50 50 C58 50 64 44 64 38 C64 32 58 26 50 26 Z M50 74 C40 74 32 82 32 92 C32 100 40 106 50 106 C60 106 68 100 68 92 C68 82 60 74 50 74 Z",
  "9": "M22 96 C30 108 40 114 52 114 C74 114 90 92 90 60 C90 28 74 6 50 6 C26 6 10 24 10 44 C10 66 26 80 48 80 C58 80 66 76 72 70 V78 C72 92 64 102 52 102 C44 102 36 98 30 90 Z M50 26 C62 26 70 38 70 52 C70 66 62 68 50 68 C38 68 30 60 30 48 C30 36 38 26 50 26 Z",
};

function monogramGlyphPath(ch: string): string | null {
  return MONOGRAM_GLYPHS[ch.toUpperCase()] ?? null;
}

/** Path markup for 1–2 initials, centered in the 512 icon. */
export function monogramInitialsMarkup(initials: string): string {
  const chars = initials
    .toUpperCase()
    .split("")
    .map((c) => monogramGlyphPath(c))
    .filter((p): p is string => Boolean(p));
  if (chars.length === 0) {
    const fallback = monogramGlyphPath("T")!;
    return `<g fill="#FFFFFF" transform="translate(256 256) scale(2.05) translate(-50 -60)"><path d="${fallback}"/></g>`;
  }
  if (chars.length === 1) {
    return `<g fill="#FFFFFF" transform="translate(256 256) scale(2.05) translate(-50 -60)"><path d="${chars[0]}"/></g>`;
  }
  // Two letters side-by-side inside the tierra circle.
  return `<g fill="#FFFFFF" transform="translate(256 256) scale(1.55)">
  <g transform="translate(-108 -60)"><path d="${chars[0]}"/></g>
  <g transform="translate(8 -60)"><path d="${chars[1]}"/></g>
</g>`;
}

export function monogramSvg(storeName: string | null | undefined): string {
  const initials = storeInitials(storeName);
  const letterMarkup = monogramInitialsMarkup(initials);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${BRAND_BG}"/>
  <circle cx="256" cy="256" r="168" fill="${BRAND_PRIMARY}"/>
  ${letterMarkup}
</svg>`;
}

/**
 * Saca el pedido de diseño del mensaje del usuario / label de botón.
 * "Armar icono, pelota de fútbol con fuego" → "pelota de fútbol con fuego"
 * "Generar otro" / "Que lo arme el bot" → undefined
 */
export function extractIconDesignHint(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  let t = raw.trim();
  if (!t) return undefined;

  // Labels de UI / meta — no son diseño.
  if (
    /^(generar otro|que lo arme( el bot)?|subir mi icono|subir otro|listo|icono de la tienda|armar icono|generar icono|hacer icono|crear icono|dibujar icono)$/i.test(
      t,
    )
  ) {
    return undefined;
  }

  t = t
    .replace(
      /^(por favor[,:]?\s*)?(me )?(podr[ií]as?|quiero|necesito|dame|armame|armá|arma|gener[aá]|generame|haceme|hac[eé]|cre[aá]|dibuj[aá]|cambi[aá])\s+/i,
      "",
    )
    .replace(
      /\b(gener(ar|á|a)|arm(ar|á|a)|hac(er|é|e)|cre(ar|á|a)|dibuj(ar|á|a)|cambi(ar|á|a)|nuevo)\s+(el\s+)?(icono|ícono|logo|favicon)(\s+de(\s+la)?\s+(tienda|app|pwa))?/gi,
      " ",
    )
    .replace(/\b(icono|ícono|logo|favicon)(\s+de(\s+la)?\s+(tienda|app|pwa))?/gi, " ")
    .replace(/\b(con\s+ai|con\s+ia|por\s+favor)\b/gi, " ")
    .replace(/^[,:.\-\s]+|[,:.\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (t.length < 3) return undefined;
  if (/^(otro|nueva?|de\s+nuevo|otra\s+vez)$/i.test(t)) return undefined;
  return t.slice(0, 240);
}

/** Detecta motifs en un texto (pedido, productos o nombre). */
export function detectIconMotifs(text: string | null | undefined): IconMotif[] {
  if (!text) return [];
  const found: IconMotif[] = [];
  for (const { id, re } of MOTIF_PATTERNS) {
    if (re.test(text) && !found.includes(id)) found.push(id);
  }
  return found;
}

function productTitles(products: Product[] | undefined): string[] {
  return (products ?? [])
    .filter((p) => !p.hidden)
    .slice(0, 8)
    .map((p) => p.title)
    .filter(Boolean);
}

/**
 * Elige motifs: pedido explícito > productos > nombre de tienda > bolsa genérica.
 */
export function pickIconMotifs(input: {
  storeName: string;
  products?: Product[];
  designHint?: string;
}): IconMotif[] {
  const fromHint = detectIconMotifs(input.designHint);
  if (fromHint.length) return fromHint.slice(0, 3);

  const titles = productTitles(input.products);
  const fromProducts = detectIconMotifs(titles.join(" "));
  if (fromProducts.length) return fromProducts.slice(0, 3);

  const fromName = detectIconMotifs(input.storeName);
  if (fromName.length) return fromName.slice(0, 2);

  // Sin cues: forma de “tienda” (bolsa), no monograma.
  return ["bag"];
}

function motifMarkup(id: IconMotif, ox: number, oy: number, scale = 1): string {
  const t = `translate(${ox} ${oy}) scale(${scale})`;
  switch (id) {
    case "lamp":
      return `<g transform="${t}">
  <rect x="70" y="20" width="60" height="36" rx="6" fill="#7DD3FC"/>
  <path d="M100 56 L100 150" stroke="#7DD3FC" stroke-width="12" stroke-linecap="round"/>
  <path d="M100 150 L100 150 L40 150" stroke="#7DD3FC" stroke-width="12" stroke-linecap="round"/>
  <circle cx="40" cy="150" r="8" fill="#7DD3FC"/>
</g>`;
    case "sushi":
      return `<g transform="${t}">
  <rect x="40" y="70" width="120" height="70" rx="28" fill="#F8FAFC"/>
  <ellipse cx="100" cy="78" rx="52" ry="28" fill="#FB7185"/>
  <path d="M70 62 L85 90" stroke="#FFF" stroke-width="6" stroke-linecap="round"/>
  <path d="M115 62 L130 90" stroke="#FFF" stroke-width="6" stroke-linecap="round"/>
  <rect x="88" y="70" width="24" height="70" fill="${COMPOSE_BG}"/>
</g>`;
    case "ball":
      // Pelota legible a 48px: pentágono + costuras curvas.
      return `<g transform="${t}">
  <circle cx="100" cy="100" r="78" fill="#F8FAFC"/>
  <polygon points="100,55 125,73 116,102 84,102 75,73" fill="#0F172A"/>
  <path d="M75 73 L42 88" stroke="#0F172A" stroke-width="8" stroke-linecap="round"/>
  <path d="M125 73 L158 88" stroke="#0F172A" stroke-width="8" stroke-linecap="round"/>
  <path d="M84 102 L55 145" stroke="#0F172A" stroke-width="8" stroke-linecap="round"/>
  <path d="M116 102 L145 145" stroke="#0F172A" stroke-width="8" stroke-linecap="round"/>
  <path d="M42 88 Q70 120 55 145" fill="none" stroke="#0F172A" stroke-width="7"/>
  <path d="M158 88 Q130 120 145 145" fill="none" stroke="#0F172A" stroke-width="7"/>
  <path d="M55 145 Q100 165 145 145" fill="none" stroke="#0F172A" stroke-width="7"/>
</g>`;
    case "fire":
      return `<g transform="${t}">
  <path d="M100 20 C130 70 150 95 150 125 C150 155 128 175 100 175 C72 175 50 155 50 125 C50 95 70 70 100 20 Z" fill="#F97316"/>
  <path d="M100 70 C118 100 128 112 128 132 C128 150 116 162 100 162 C84 162 72 150 72 132 C72 112 82 100 100 70 Z" fill="#FDE047"/>
  <path d="M100 110 C110 125 114 132 114 142 C114 152 108 158 100 158 C92 158 86 152 86 142 C86 132 90 125 100 110 Z" fill="#FFF7ED"/>
</g>`;
    case "pottery":
      return `<g transform="${t}">
  <ellipse cx="100" cy="55" rx="48" ry="16" fill="#FDBA74"/>
  <path d="M55 55 L65 150 Q100 175 135 150 L145 55" fill="#FB923C"/>
  <ellipse cx="100" cy="55" rx="40" ry="12" fill="#FED7AA"/>
</g>`;
    case "bread":
      return `<g transform="${t}">
  <ellipse cx="100" cy="110" rx="80" ry="48" fill="#FBBF24"/>
  <path d="M50 100 Q70 80 90 100" fill="none" stroke="#B45309" stroke-width="6"/>
  <path d="M90 95 Q110 75 130 95" fill="none" stroke="#B45309" stroke-width="6"/>
  <path d="M120 100 Q140 82 155 105" fill="none" stroke="#B45309" stroke-width="6"/>
</g>`;
    case "flower":
      return `<g transform="${t}">
  <circle cx="100" cy="70" r="28" fill="#FB7185"/>
  <circle cx="70" cy="95" r="28" fill="#F472B6"/>
  <circle cx="130" cy="95" r="28" fill="#F472B6"/>
  <circle cx="82" cy="130" r="28" fill="#FB7185"/>
  <circle cx="118" cy="130" r="28" fill="#FB7185"/>
  <circle cx="100" cy="105" r="22" fill="#FDE047"/>
  <rect x="94" y="145" width="12" height="40" rx="4" fill="#4ADE80"/>
</g>`;
    case "coffee":
      return `<g transform="${t}">
  <path d="M55 70 h90 v70 a30 30 0 0 1 -30 30 h-30 a30 30 0 0 1 -30 -30 z" fill="#FFF7ED"/>
  <path d="M145 85 h20 a22 22 0 0 1 0 44 h-20" fill="none" stroke="#FFF7ED" stroke-width="12"/>
  <path d="M75 50 Q85 35 75 25" fill="none" stroke="#94A3B8" stroke-width="6" stroke-linecap="round"/>
  <path d="M95 48 Q105 32 95 22" fill="none" stroke="#94A3B8" stroke-width="6" stroke-linecap="round"/>
</g>`;
    case "plant":
      return `<g transform="${t}">
  <path d="M60 150 h80 l-10 30 h-60 z" fill="#C2410C"/>
  <path d="M100 150 C100 100 70 80 55 55 C90 70 95 100 100 150 Z" fill="#4ADE80"/>
  <path d="M100 150 C100 95 130 75 150 50 C120 70 110 105 100 150 Z" fill="#22C55E"/>
</g>`;
    case "star":
      return `<g transform="${t}">
  <polygon points="100,30 118,78 170,78 128,110 144,160 100,130 56,160 72,110 30,78 82,78" fill="#FDE047"/>
</g>`;
    case "heart":
      return `<g transform="${t}">
  <path d="M100 160 C40 110 35 55 70 40 C90 32 100 48 100 48 C100 48 110 32 130 40 C165 55 160 110 100 160 Z" fill="#F43F5E"/>
</g>`;
    case "bag":
      return `<g transform="${t}">
  <path d="M55 80 h90 l10 110 h-110 z" fill="#FDBA74"/>
  <path d="M75 80 C75 50 125 50 125 80" fill="none" stroke="#FFF7ED" stroke-width="14" stroke-linecap="round"/>
  <circle cx="100" cy="130" r="14" fill="#9A3412"/>
</g>`;
    case "fish":
      return `<g transform="${t}">
  <ellipse cx="105" cy="100" rx="70" ry="40" fill="#38BDF8"/>
  <polygon points="35,100 10,70 10,130" fill="#0EA5E9"/>
  <circle cx="145" cy="90" r="8" fill="#0F172A"/>
</g>`;
    case "pizza":
      return `<g transform="${t}">
  <path d="M100 40 L170 160 L30 160 Z" fill="#FBBF24"/>
  <path d="M100 58 L152 148 L48 148 Z" fill="#F97316"/>
  <circle cx="95" cy="100" r="10" fill="#7F1D1D"/>
  <circle cx="115" cy="125" r="9" fill="#7F1D1D"/>
  <circle cx="85" cy="130" r="8" fill="#7F1D1D"/>
</g>`;
    case "book":
      return `<g transform="${t}">
  <rect x="45" y="50" width="55" height="110" rx="6" fill="#60A5FA"/>
  <rect x="100" y="50" width="55" height="110" rx="6" fill="#93C5FD"/>
  <rect x="95" y="50" width="10" height="110" fill="#1E3A8A"/>
</g>`;
    case "gem":
      return `<g transform="${t}">
  <polygon points="100,35 155,90 100,165 45,90" fill="#A78BFA"/>
  <polygon points="100,35 130,90 100,90 70,90" fill="#DDD6FE"/>
  <polygon points="45,90 100,90 100,165" fill="#7C3AED"/>
</g>`;
    case "scissors":
      return `<g transform="${t}">
  <circle cx="70" cy="70" r="22" fill="none" stroke="#E2E8F0" stroke-width="12"/>
  <circle cx="70" cy="130" r="22" fill="none" stroke="#E2E8F0" stroke-width="12"/>
  <path d="M88 90 L160 50" stroke="#E2E8F0" stroke-width="12" stroke-linecap="round"/>
  <path d="M88 110 L160 150" stroke="#E2E8F0" stroke-width="12" stroke-linecap="round"/>
</g>`;
  }
}

function spotlightCone(): string {
  return `<path d="M130 95 L250 280 L360 280 L190 95 Z" fill="#94A3B8" fill-opacity="0.35"/>`;
}

/**
 * SVG compuesto flat a partir de motifs (pedido / productos / nombre).
 * Estilo tipo lámpara+sushi bajo spotlight — no monograma.
 */
export function composeStoreIconSvg(input: {
  storeName: string;
  products?: Product[];
  designHint?: string;
  motifs?: IconMotif[];
}): string {
  const motifs =
    input.motifs?.length
      ? input.motifs.slice(0, 3)
      : pickIconMotifs({
          storeName: input.storeName,
          products: input.products,
          designHint: input.designHint,
        });

  const hasLamp = motifs.includes("lamp");
  const others = motifs.filter((m): m is Exclude<IconMotif, "lamp"> => m !== "lamp");
  const subject = others[0];
  const primary = subject ?? motifs[0]!;
  const secondary = others[1] ?? (motifs[1] && motifs[1] !== primary ? motifs[1] : undefined);

  let body = "";
  if (hasLamp && subject) {
    // Composición tipo ejemplo: lámpara + sujeto bajo spotlight.
    body =
      spotlightCone() +
      motifMarkup("lamp", 40, 70, 1.15) +
      motifMarkup(subject, 200, 230, 0.95);
  } else if (motifs.length === 1) {
    body = motifMarkup(primary, 156, 156, 1.35);
  } else if (motifs[0] === "ball" && motifs.includes("fire")) {
    body =
      motifMarkup("fire", 156, 40, 1.1) +
      motifMarkup("ball", 156, 180, 1.15) +
      motifMarkup("fire", 40, 220, 0.55) +
      motifMarkup("fire", 300, 220, 0.55);
  } else if (secondary) {
    body =
      motifMarkup(motifs[0]!, 40, 170, 1.05) +
      motifMarkup(secondary, 250, 170, 1.05);
  } else {
    body = motifMarkup(primary, 156, 156, 1.35);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="${COMPOSE_BG}"/>
  ${body}
</svg>`;
}

function extractSvgMarkup(raw: string): string | null {
  const fenced = raw.match(/```(?:svg)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.search(/<svg[\s>]/i);
  if (start < 0) return null;
  const end = candidate.toLowerCase().lastIndexOf("</svg>");
  if (end < 0) return null;
  const svg = candidate.slice(start, end + "</svg>".length).trim();
  if (!/^<svg[\s>]/i.test(svg) || svg.length > 80_000) return null;
  if (/<script|foreignObject|xlink:href\s*=\s*["'](?!#)/i.test(svg)) return null;
  return svg;
}

function rubroFromProducts(products: Product[]): string | undefined {
  const titles = productTitles(products);
  if (!titles.length) return undefined;
  return titles.join(", ");
}

async function generateSvgWithGemini(input: {
  storeName: string;
  ownerName?: string | null;
  rubro?: string;
  chatHint?: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return null;
  }

  const name = input.storeName.slice(0, 80);
  const rubro = (input.rubro ?? "tienda artesanal argentina").slice(0, 200);
  const chat = (input.chatHint ?? "").slice(0, 240);
  const owner = (input.ownerName ?? "").slice(0, 60);

  const prompt = `Diseñá un ícono de app (PWA) como SVG plano y simple para una tienda argentina.
Nombre de la tienda: """${name}"""
${owner ? `Dueña/dueño: """${owner}"""` : ""}
Rubro / productos: """${rubro}"""
${chat ? `PEDIDO EXPLÍCITO DEL USUARIO (prioridad máxima; dibujá ESTO, no iniciales): """${chat}"""` : "No hay pedido explícito: combiná formas simples inspiradas en los productos o el nombre (ej. lámpara + sushi), NUNCA un monograma de iniciales."}

Reglas:
- Devolvé SOLO el markup SVG (un único <svg>...</svg>), sin markdown ni explicación.
- viewBox="0 0 512 512", width/height 512.
- Estilo flat / geométrico, máximo 4 colores, SIN texto ni letras ni iniciales.
- Sin fotografías, sin filtros pesados, sin <script>, sin imágenes externas, sin data: URLs.
- Que se lea bien a 48px (formas grandes, contraste alto).
- Fondo opaco (no transparente).
- Preferí formas simples (círculos, rectángulos, paths cortos); nada de filtros ni máscaras.`;

  try {
    const { generateText } = await import("ai");
    const abortSignal =
      input.signal ?? AbortSignal.timeout(GEMINI_TIMEOUT_MS);
    if (process.env.AI_GATEWAY_API_KEY?.trim()) {
      const { gateway } = await import("@ai-sdk/gateway");
      const result = await generateText({
        model: gateway("google/gemini-3.5-flash"),
        prompt,
        maxRetries: 0,
        abortSignal,
      });
      return extractSvgMarkup(result.text);
    }
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!.trim(),
    });
    const result = await generateText({
      model: google("gemini-3.5-flash"),
      prompt,
      maxRetries: 0,
      abortSignal,
    });
    return extractSvgMarkup(result.text);
  } catch (err) {
    console.warn("[store-icon] Gemini SVG failed/timeout", err);
    return null;
  }
}

export async function svgToPng(svg: string, size: number): Promise<Buffer> {
  const input = Buffer.from(svg, "utf8");
  // density baja: alcanza para iconos PWA y evita cuelgues en SVG complejos
  return sharp(input, { density: 144, limitInputPixels: 268402689 })
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function svgToPngSafe(svg: string, size: number): Promise<Buffer> {
  return withTimeout(svgToPng(svg, size), SHARP_TIMEOUT_MS, `sharp-${size}`);
}

async function uploadIconSafe(
  bytes: Buffer,
  filename: string,
  contentType: string,
) {
  return withTimeout(
    uploadStoreIcon(bytes, filename, contentType),
    BLOB_TIMEOUT_MS,
    `blob-${filename}`,
  );
}

/**
 * Genera (AI o composición por productos/pedido), rasteriza y sube iconos.
 * Nunca cuelga: Gemini/sharp/Blob tienen timeout → fallback compuesto (no monograma).
 */
export async function buildAndUploadStoreIcons(input: {
  store: Store;
  products?: Product[];
  chatHint?: string;
  /** Forzar composición local (smoke / tests / fallback). */
  forceComposed?: boolean;
  /** @deprecated usar forceComposed — se ignora el monograma en generate. */
  forceMonogram?: boolean;
}): Promise<StoreIconUrls> {
  const started = Date.now();
  const storeName = input.store.name || input.store.slug || "Tienda";
  const designHint = extractIconDesignHint(input.chatHint);
  const rubro = rubroFromProducts(input.products ?? []);
  const forceLocal = Boolean(input.forceComposed || input.forceMonogram);

  let source: "ai" | "composed" = "composed";
  let fellBack = false;
  let svg = composeStoreIconSvg({
    storeName,
    products: input.products,
    designHint,
  });

  if (!forceLocal) {
    const remainingForAi = Math.max(
      1_000,
      STORE_ICON_BUDGET_MS - (Date.now() - started) - 8_000,
    );
    const aiBudget = Math.min(GEMINI_TIMEOUT_MS, remainingForAi);
    try {
      const aiSvg = await withTimeout(
        generateSvgWithGemini({
          storeName,
          ownerName: input.store.ownerName,
          rubro,
          chatHint: designHint,
          signal: AbortSignal.timeout(aiBudget),
        }),
        aiBudget + 500,
        "gemini-svg",
      );
      if (aiSvg) {
        await svgToPngSafe(aiSvg, 64);
        svg = aiSvg;
        source = "ai";
      } else {
        fellBack = true;
        svg = composeStoreIconSvg({
          storeName,
          products: input.products,
          designHint,
        });
        source = "composed";
      }
    } catch (err) {
      fellBack = true;
      console.warn("[store-icon] AI path skipped; composed", err);
      svg = composeStoreIconSvg({
        storeName,
        products: input.products,
        designHint,
      });
      source = "composed";
    }
  }

  try {
    const [png192, png512, pngApple, svgUp] = await Promise.all([
      svgToPngSafe(svg, ICON_SIZES.png192).then((buf) =>
        uploadIconSafe(buf, `${input.store.id}-192.png`, "image/png"),
      ),
      svgToPngSafe(svg, ICON_SIZES.png512).then((buf) =>
        uploadIconSafe(buf, `${input.store.id}-512.png`, "image/png"),
      ),
      svgToPngSafe(svg, ICON_SIZES.apple).then((buf) =>
        uploadIconSafe(buf, `${input.store.id}-180.png`, "image/png"),
      ),
      uploadIconSafe(
        Buffer.from(svg, "utf8"),
        `${input.store.id}.svg`,
        "image/svg+xml",
      ),
    ]);

    return {
      icon192Url: png192.url,
      icon512Url: png512.url,
      iconAppleUrl: pngApple.url,
      iconSvgUrl: svgUp.url,
      source,
      fellBack,
      designHint,
    };
  } catch (err) {
    // Último recurso: composición local (si el SVG AI rompió sharp/Blob)
    if (source === "ai" && !forceLocal) {
      console.warn("[store-icon] raster/upload failed after AI; composed", err);
      const fallback = await buildAndUploadStoreIcons({
        ...input,
        forceComposed: true,
      });
      return { ...fallback, fellBack: true, designHint };
    }
    throw err;
  }
}

/** Monograma PNG on-the-fly (manifest si la tienda aún no tiene iconos en DB). */
export async function monogramPngBuffer(
  storeName: string | null | undefined,
  size: number,
): Promise<Buffer> {
  return svgToPngSafe(monogramSvg(storeName), size);
}

/**
 * Icono propio: rasteriza una foto/logo a PNG 192/512/180 y sube a Blob.
 * Misma forma que el pipeline AI (preview + manifest).
 */
export async function buildAndUploadStoreIconsFromImage(input: {
  storeId: string;
  imageBytes: Buffer;
}): Promise<StoreIconUrls> {
  if (!input.imageBytes.length) {
    throw new Error("imagen vacía");
  }

  async function raster(size: number): Promise<Buffer> {
    return withTimeout(
      sharp(input.imageBytes, { failOn: "none", limitInputPixels: 268402689 })
        .rotate()
        .resize(size, size, { fit: "cover", position: "centre" })
        .png({ compressionLevel: 6 })
        .toBuffer(),
      SHARP_TIMEOUT_MS,
      `sharp-upload-${size}`,
    );
  }

  const [png192, png512, pngApple] = await Promise.all([
    raster(ICON_SIZES.png192).then((buf) =>
      uploadIconSafe(buf, `${input.storeId}-up-192.png`, "image/png"),
    ),
    raster(ICON_SIZES.png512).then((buf) =>
      uploadIconSafe(buf, `${input.storeId}-up-512.png`, "image/png"),
    ),
    raster(ICON_SIZES.apple).then((buf) =>
      uploadIconSafe(buf, `${input.storeId}-up-180.png`, "image/png"),
    ),
  ]);

  return {
    icon192Url: png192.url,
    icon512Url: png512.url,
    iconAppleUrl: pngApple.url,
    // Subida raster: no hay SVG fuente; dejamos vacío para no inventar markup.
    iconSvgUrl: "",
    source: "upload",
  };
}
