/** Solo dígitos. */
export function phoneDigits(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Normaliza a E.164 móvil AR (`+549…`) cuando se puede.
 * wa.me en Argentina necesita el 9 después del 54.
 */
export function normalizeArMobileE164(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const d = phoneDigits(input);
  if (!d) return null;

  // Números inventados del simulador (+0…)
  if (d.startsWith("0")) return null;

  if (d.startsWith("549") && d.length >= 12 && d.length <= 15) {
    return `+${d}`;
  }

  // 54 + 10 dígitos nacionales sin el 9 móvil → insertar 9
  if (d.startsWith("54") && !d.startsWith("549") && d.length === 12) {
    return `+549${d.slice(2)}`;
  }

  // 54 9 + 10 nacionales
  if (d.startsWith("549") && d.length === 13) {
    return `+${d}`;
  }

  // Local 10 dígitos (11…)
  if (d.length === 10) return `+549${d}`;

  // 9 + 10 nacionales
  if (d.length === 11 && d.startsWith("9")) return `+54${d}`;

  return null;
}

/** ¿Se puede usar como contacto público de WhatsApp? */
export function isWhatsAppContactPhone(
  input: string | null | undefined,
): boolean {
  return Boolean(normalizeArMobileE164(input));
}

/**
 * Número a mostrar en catálogo / Lo quiero:
 * `contactPhone` si es válido; si no, `channelIdentity` cuando es un móvil AR.
 */
export function resolveStoreContactPhone(store: {
  channelIdentity?: string;
  /** @deprecated alias de channelIdentity */
  phone?: string;
  contactPhone?: string | null;
}): string | null {
  const identity = store.channelIdentity ?? store.phone;
  return (
    normalizeArMobileE164(store.contactPhone) ??
    normalizeArMobileE164(identity)
  );
}

/** Dígitos para `https://wa.me/…` (con 9 AR si aplica). */
export function phoneToWaDigits(
  input: string | null | undefined,
): string | null {
  const e164 = normalizeArMobileE164(input);
  return e164 ? phoneDigits(e164) : null;
}

/**
 * Formato legible AR, p.ej. `11 1234-5678` o `351 123-4567`.
 * Si no es un móvil AR válido, muestra aviso o el valor crudo.
 */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "—";
  const dRaw = phoneDigits(e164);
  if (dRaw.startsWith("0")) {
    return "Sin WhatsApp público";
  }

  const normalized = normalizeArMobileE164(e164);
  if (!normalized) return e164;

  const national = phoneDigits(normalized).slice(3); // 10 dígitos después de 549
  if (national.length !== 10) return normalized;

  // CABA/GBA: área 11 + 8 locales. Interior: suele ser 3 + 7.
  if (national.startsWith("11")) {
    const local = national.slice(2);
    return `11 ${local.slice(0, 4)}-${local.slice(4)}`;
  }
  const area = national.slice(0, 3);
  const local = national.slice(3);
  return `${area} ${local.slice(0, 3)}-${local.slice(3)}`;
}

export function buildWaMeUrl(phone: string, message: string): string {
  const digits = phoneToWaDigits(phone);
  if (!digits) return "#";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
