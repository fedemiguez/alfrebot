import sharp from "sharp";
import { uploadStoreIcon } from "@/lib/blob";
import type { Product, Store } from "@/lib/db/schema";

export const ICON_SIZES = {
  png192: 192,
  png512: 512,
  apple: 180,
} as const;

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

export function monogramSvg(storeName: string | null | undefined): string {
  const initials = escapeXml(storeInitials(storeName));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${BRAND_BG}"/>
  <circle cx="256" cy="256" r="168" fill="${BRAND_PRIMARY}"/>
  <text x="256" y="256" dy="0.35em" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="160" font-weight="700"
    fill="#FFFFFF">${initials}</text>
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
  const others = motifs.filter((m) => m !== "lamp");
  const primary = others[0] ?? motifs[0]!;
  const secondary = others[1] ?? (motifs[1] && motifs[1] !== primary ? motifs[1] : undefined);

  let body = "";
  if (hasLamp && primary !== "lamp") {
    // Composición tipo ejemplo: lámpara + sujeto bajo spotlight.
    body =
      spotlightCone() +
      motifMarkup("lamp", 40, 70, 1.15) +
      motifMarkup(primary, 200, 230, 0.95);
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
