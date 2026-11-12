import sharp from "sharp";
import { uploadStoreIcon } from "@/lib/blob";
import type { Product, Store } from "@/lib/db/schema";

export const ICON_SIZES = {
  png192: 192,
  png512: 512,
  apple: 180,
} as const;

export type StoreIconUrls = {
  icon192Url: string;
  icon512Url: string;
  iconAppleUrl: string;
  iconSvgUrl: string;
  source: "ai" | "monogram";
};

const BRAND_PRIMARY = "#9A3412";
const BRAND_BG = "#FFFBEB";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Iniciales legibles para monograma (1–2 letras). */
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

function extractSvgMarkup(raw: string): string | null {
  const fenced = raw.match(/```(?:svg)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.search(/<svg[\s>]/i);
  if (start < 0) return null;
  const end = candidate.toLowerCase().lastIndexOf("</svg>");
  if (end < 0) return null;
  const svg = candidate.slice(start, end + "</svg>".length).trim();
  if (!/^<svg[\s>]/i.test(svg) || svg.length > 80_000) return null;
  // Bloquear scripts / foreignObject peligrosos en markup de modelo
  if (/<script|foreignObject|xlink:href\s*=\s*["'](?!#)/i.test(svg)) return null;
  return svg;
}

function rubroFromProducts(products: Product[]): string | undefined {
  const titles = products
    .filter((p) => !p.hidden)
    .slice(0, 6)
    .map((p) => p.title)
    .filter(Boolean);
  if (!titles.length) return undefined;
  return titles.join(", ");
}

async function generateSvgWithGemini(input: {
  storeName: string;
  ownerName?: string | null;
  rubro?: string;
  chatHint?: string;
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
${chat ? `Pedido de la dueña: """${chat}"""` : ""}

Reglas:
- Devolvé SOLO el markup SVG (un único <svg>...</svg>), sin markdown ni explicación.
- viewBox="0 0 512 512", width/height 512.
- Estilo flat / geométrico, máximo 4 colores, sin texto largo (podés usar 1–3 letras si ayuda).
- Sin fotografías, sin filtros pesados, sin <script>, sin imágenes externas, sin data: URLs.
- Que se lea bien a 48px (formas grandes, contraste alto).
- Fondo opaco (no transparente).`;

  try {
    const { generateText } = await import("ai");
    if (process.env.AI_GATEWAY_API_KEY?.trim()) {
      const { gateway } = await import("@ai-sdk/gateway");
      const result = await generateText({
        model: gateway("google/gemini-3.5-flash"),
        prompt,
        maxRetries: 0,
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
    });
    return extractSvgMarkup(result.text);
  } catch (err) {
    console.warn("[store-icon] Gemini SVG failed", err);
    return null;
  }
}

export async function svgToPng(svg: string, size: number): Promise<Buffer> {
  const input = Buffer.from(svg, "utf8");
  return sharp(input, { density: 288 })
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
}

/**
 * Genera (AI o monograma), rasteriza y sube iconos. Misma pipeline para WA y web.
 */
export async function buildAndUploadStoreIcons(input: {
  store: Store;
  products?: Product[];
  chatHint?: string;
  /** Forzar monograma (smoke / tests). */
  forceMonogram?: boolean;
}): Promise<StoreIconUrls> {
  const storeName = input.store.name || input.store.slug || "Tienda";
  const rubro = rubroFromProducts(input.products ?? []);
  let source: "ai" | "monogram" = "monogram";
  let svg = monogramSvg(storeName);

  if (!input.forceMonogram) {
    const aiSvg = await generateSvgWithGemini({
      storeName,
      ownerName: input.store.ownerName,
      rubro,
      chatHint: input.chatHint,
    });
    if (aiSvg) {
      try {
        // Validar que sharp pueda rasterizar antes de aceptar el SVG
        await svgToPng(aiSvg, 64);
        svg = aiSvg;
        source = "ai";
      } catch (err) {
        console.warn("[store-icon] AI SVG invalid for raster; using monogram", err);
      }
    }
  }

  const [png192, png512, pngApple, svgUp] = await Promise.all([
    svgToPng(svg, ICON_SIZES.png192).then((buf) =>
      uploadStoreIcon(buf, `${input.store.id}-192.png`, "image/png"),
    ),
    svgToPng(svg, ICON_SIZES.png512).then((buf) =>
      uploadStoreIcon(buf, `${input.store.id}-512.png`, "image/png"),
    ),
    svgToPng(svg, ICON_SIZES.apple).then((buf) =>
      uploadStoreIcon(buf, `${input.store.id}-180.png`, "image/png"),
    ),
    uploadStoreIcon(
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
  };
}

/** Monograma PNG on-the-fly (manifest si la tienda aún no tiene iconos en DB). */
export async function monogramPngBuffer(
  storeName: string | null | undefined,
  size: number,
): Promise<Buffer> {
  return svgToPng(monogramSvg(storeName), size);
}
