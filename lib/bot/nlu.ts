import { z } from "zod";

const freeTextActionSchema = z.object({
  intent: z.enum([
    "set_price",
    "mark_out_of_stock",
    "create_product",
    "change_photo",
    "help",
    "menu",
    "unknown",
  ]),
  titleHint: z.string().optional(),
  priceHint: z.string().optional(),
  productHint: z.string().optional(),
});

export type FreeTextAction = z.infer<typeof freeTextActionSchema>;

/** Parsea precios AR: "15 mil", "15.000", "$15000", "15000", "15 mil pesos" */
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

export function extractSignupCode(text: string): string | null {
  const m = text.match(/c[oó]digo\s+(\d{3,6})/i) ?? text.match(/\b(\d{4})\b/);
  return m?.[1] ?? null;
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
  if (/sin stock|agotad|ya no tengo|no tengo/.test(lowered)) {
    return { intent: "mark_out_of_stock", productHint: text };
  }
  if (/cambia(r|le)? (el )?precio|ahora sale|sale \d/.test(lowered)) {
    return { intent: "set_price", productHint: text, priceHint: text };
  }
  if (/cambia(r|le)? (la )?foto/.test(lowered)) {
    return { intent: "change_photo", productHint: text };
  }

  // Try AI Gateway only if configured
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { intent: "unknown" };
  }

  try {
    const { generateObject } = await import("ai");
    const { gateway } = await import("@ai-sdk/gateway");
    const result = await generateObject({
      model: gateway("google/gemini-2.0-flash"),
      schema: freeTextActionSchema,
      prompt: `Sos el NLU de un bot de tienda por WhatsApp para personas mayores en Argentina.
Del mensaje, devolvé una acción tipada. No inventes. Mensaje: """${text}"""`,
    });
    return result.object;
  } catch (err) {
    console.warn("[nlu] LLM unavailable, falling back", err);
    return { intent: "unknown" };
  }
}
