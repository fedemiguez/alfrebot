/**
 * Normalización de texto para búsqueda / comandos de voz (es-AR).
 * Sin LLM: solo reglas locales.
 */

const ACCENTS: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
  ñ: "n",
};

/** Minúsculas, sin tildes, espacios colapsados. */
export function normalizeVoiceText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ñ]/g, (ch) => ACCENTS[ch] ?? ch)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens útiles (descarta stopwords cortas de pedido/búsqueda). */
const STOPWORDS = new Set([
  "a",
  "al",
  "de",
  "del",
  "el",
  "la",
  "las",
  "los",
  "un",
  "una",
  "unos",
  "unas",
  "y",
  "o",
  "en",
  "con",
  "por",
  "para",
  "que",
  "quiero",
  "queria",
  "buscar",
  "busco",
  "busca",
  "tene",
  "tenes",
  "tienen",
  "hay",
  "algo",
  "algun",
  "alguna",
  "me",
  "te",
  "se",
  "mi",
  "tu",
  "su",
  "eso",
  "ese",
  "esa",
  "este",
  "esta",
  "ver",
  "mostrar",
  "mostrame",
  "dame",
  "necesito",
  "hola",
  "porfa",
  "porfavor",
  "favor",
  "producto",
  "productos",
]);

export function tokenizeVoiceQuery(input: string): string[] {
  const norm = normalizeVoiceText(input);
  if (!norm) return [];
  return norm
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}
