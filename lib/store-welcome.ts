/**
 * Frase de bienvenida de la vitrina (Fase C personalización).
 * Una línea editable debajo del nombre de la tienda.
 */

/** Límite corto: cabe bajo el título sin empujar el hero. */
export const WELCOME_MESSAGE_MAX = 120;

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza / recorta la frase; null si queda vacía. */
export function normalizeWelcomeMessage(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length > WELCOME_MESSAGE_MAX) {
    return t.slice(0, WELCOME_MESSAGE_MAX).trim();
  }
  return t;
}

/** true si pide borrar la frase. */
export function wantsClearWelcomeText(text: string): boolean {
  const t = fold(text);
  return (
    /\b(sin frase|borrar frase|sacar(le)? (la )?frase|quitar (la )?frase|eliminar (la )?frase|sin mensaje|borrar mensaje)\b/.test(
      t,
    ) ||
    /\b(no quiero frase|sacala|borra(la)?)\b/.test(t)
  );
}

/**
 * true si el mensaje parece pedir / dictar la frase de bienvenida.
 * No dispara con cualquier texto corto (eso va al flujo WELCOME_INPUT).
 */
export function wantsWelcomeMessageText(text: string): boolean {
  const t = fold(text);
  if (!t) return false;
  if (wantsClearWelcomeText(text)) return true;
  if (/\b(frase de bienvenida|mensaje de bienvenida|bienvenida)\b/.test(t)) {
    return true;
  }
  if (
    /\b(frase|lema|subtitulo)\b/.test(t) &&
    /\b(tienda|vitrina|pon|cambia|dej|usa|quiero|escribi|escribí|dec[ií])\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bdec[ií] que\b/.test(t)) return true;
  if (
    /\b(envio|envios|retiro)\b/.test(t) &&
    /\b(frase|mensaje|dec[ií]|vitrina|tienda)\b/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Extrae la frase del texto libre.
 * Ej.: «decí que retiro en el local», «frase: Envíos a todo el país».
 */
export function extractWelcomeFromText(text: string): string | null {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  if (wantsClearWelcomeText(raw)) return null;

  const patterns: RegExp[] = [
    /(?:frase|mensaje)(?:\s+de\s+bienvenida)?\s*[:=]\s*[«"']?(.+?)[»"']?\s*$/i,
    /(?:frase|mensaje)(?:\s+de\s+bienvenida)?\s+(?:sea|que\s+sea|diga|deje|dej[aá]|pon[eé]|usa|usar)\s+[«"']?(.+?)[»"']?\s*$/i,
    /dec[ií]\s+que\s+(.+)$/i,
    /(?:pon[eé]|dej[aá]|escrib[ií]|poner|dejar)\s+(?:en\s+(?:la\s+)?vitrina\s+)?(?:que\s+)?[«"'](.+?)[»"']/i,
    /bienvenida\s*[:=]\s*[«"']?(.+?)[»"']?\s*$/i,
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const cleaned = cleanWelcomeFragment(m[1]);
      if (cleaned) return normalizeWelcomeMessage(cleaned);
    }
  }

  // Si el mensaje es solo la frase corta (tras cue débil), no inventamos acá.
  return null;
}

function cleanWelcomeFragment(fragment: string): string {
  return fragment
    .replace(/^[\s,.:;«»"'¡!¿?-]+/, "")
    .replace(/[\s,.:;«»"'¡!¿?-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
