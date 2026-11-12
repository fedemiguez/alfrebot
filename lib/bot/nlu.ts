import { z } from "zod";

const freeTextActionSchema = z.object({
  intent: z.enum([
    "set_price",
    "mark_out_of_stock",
    "list_stock",
    "manage_stock",
    "create_product",
    "change_photo",
    "generate_icon",
    "help",
    "menu",
    "unknown",
  ]),
  titleHint: z.string().optional(),
  priceHint: z.string().optional(),
  productHint: z.string().optional(),
});

export type FreeTextAction = z.infer<typeof freeTextActionSchema>;

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
  /\b(tienda|pieza|producto|foto|precio|armar|quiero|necesito|ayuda|menu|men[uú]|whatsapp|hola|buenas)\b/i;

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
  if (
    /\b(icono|ícono|favicon|logo de (la )?app|icono de (la )?(app|tienda|pwa))\b/.test(
      lowered,
    ) ||
    /gener(ar|á|a)? (el )?icono|cambi(ar|á|a)? (el )?icono|nuevo icono|icono (de )?pwa/.test(
      lowered,
    )
  ) {
    return { intent: "generate_icon" };
  }

  // LLM opcional: Gateway o Google directo
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { intent: "unknown" };
  }

  const nluPrompt = `Sos el NLU de un bot de tienda por WhatsApp para personas mayores en Argentina.
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
