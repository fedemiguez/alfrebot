/**
 * Sugerencia AI de categoría (+ material si artesanal) a partir del título.
 * Fallback a heurísticas locales si no hay API key o el LLM falla.
 */

import { inferArtesaniaCategory } from "@/lib/artesania-category";
import { inferArtesaniaMaterial } from "@/lib/artesania-material";
import { inferComidaCategory } from "@/lib/comida-category";
import { inferRopaCategory } from "@/lib/ropa-category";
import {
  resolveBusinessKind,
  type BusinessKind,
} from "@/lib/store-business-kind";

export type ProductMetaSuggestion = {
  category: string | null;
  material: string | null;
};

function cleanLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || t.length > 48) return null;
  return t;
}

function heuristicSuggest(
  title: string,
  description: string | null | undefined,
  kind: BusinessKind | null,
): ProductMetaSuggestion {
  let category: string | null = null;
  let material: string | null = null;

  if (kind === "ropa") {
    category = inferRopaCategory(title, description)?.label ?? null;
  } else if (kind === "comida") {
    category = inferComidaCategory(title, description)?.label ?? null;
  } else if (kind === "artesanal") {
    category = inferArtesaniaCategory(title, description)?.label ?? null;
    material = inferArtesaniaMaterial(title, description)?.label ?? null;
  } else {
    category =
      inferArtesaniaCategory(title, description)?.label ??
      inferRopaCategory(title, description)?.label ??
      inferComidaCategory(title, description)?.label ??
      null;
  }

  return { category, material: kind === "artesanal" ? material : null };
}

/**
 * Sugiere categoría (siempre) y material (solo rubro artesanal).
 * No persiste: la dueña confirma o edita en el flujo del bot.
 */
export async function suggestProductMeta(input: {
  title: string;
  description?: string | null;
  businessKind?: string | null;
}): Promise<ProductMetaSuggestion> {
  const title = input.title.trim();
  const kind = resolveBusinessKind(input.businessKind);
  const fallback = heuristicSuggest(title, input.description, kind);

  if (!title) return { category: null, material: null };

  const wantMaterial = kind === "artesanal";
  if (
    !process.env.AI_GATEWAY_API_KEY?.trim() &&
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  ) {
    return fallback;
  }

  const rubroHint = kind
    ? kind === "ropa"
      ? "ropa / indumentaria"
      : kind === "comida"
        ? "comida / gastronomía"
        : "artesanías / taller artesanal"
    : "negocio general (sin rubro fijo)";

  const prompt = `Sos asistente de una tienda argentina. Del título del producto, sugerí metadatos cortos en español rioplatense.
Rubro de la tienda: ${rubroHint}.
Título: """${title}"""
${input.description ? `Descripción: """${input.description}"""` : "Sin descripción."}

Reglas:
- category: una etiqueta corta para filtrar en la vitrina (ej. "Tazas", "Abrigos", "Pastas"). Sin emojis. Null si no hay pista clara.
- material: solo si el rubro es artesanal; ej. "Cerámica esmaltada", "Madera", "Lana". Null si no aplica o no hay pista.
- No inventes datos que no se deduzcan del título/descripción.
- Respondé solo el objeto tipado.`;

  try {
    const { z } = await import("zod");
    const suggestionSchema = z.object({
      category: z
        .string()
        .nullable()
        .describe(
          "Categoría corta en español para chips de vitrina (1–3 palabras). Null si no hay sugerencia clara.",
        ),
      material: z
        .string()
        .nullable()
        .describe(
          "Material corto en español para badge de artesanía. Null si no aplica o no hay pista.",
        ),
    });
    const { generateObject } = await import("ai");
    let object: { category: string | null; material: string | null };
    if (process.env.AI_GATEWAY_API_KEY?.trim()) {
      const { gateway } = await import("@ai-sdk/gateway");
      const result = await generateObject({
        model: gateway("google/gemini-3.5-flash-lite"),
        schema: suggestionSchema,
        prompt,
        maxRetries: 0,
      });
      object = result.object;
    } else {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!.trim(),
      });
      const result = await generateObject({
        model: google("gemini-3.5-flash-lite"),
        schema: suggestionSchema,
        prompt,
        maxRetries: 0,
      });
      object = result.object;
    }

    const category = cleanLabel(object.category) ?? fallback.category;
    const material = wantMaterial
      ? (cleanLabel(object.material) ?? fallback.material)
      : null;
    return { category, material };
  } catch (err) {
    console.warn("[suggest-product-meta] LLM unavailable, heuristic fallback", err);
    return fallback;
  }
}
