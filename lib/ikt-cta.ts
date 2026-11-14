/**
 * Microcopy CTA WhatsApp, kickers y helpers por rubro Ikt (spec +60 / Gemini).
 */

import type { IktRubro } from "@/lib/store-ikt-theme";
import { businessKindToIktRubro } from "@/lib/store-ikt-theme";

export const IKT_WANT_CTA: Record<IktRubro, string> = {
  ropa: "💬 Consultar prenda por WhatsApp",
  comidas: "📲 Pedir este plato por WhatsApp",
  artesanias: "💬 Encargar esta pieza por WhatsApp",
};

/** Label del botón “Lo quiero” / CTA; null = copy legacy “Lo quiero”. */
export function iktWantCtaLabel(
  businessKind: string | null | undefined,
): string | null {
  const rubro = businessKindToIktRubro(businessKind);
  if (!rubro) return null;
  return IKT_WANT_CTA[rubro];
}

/**
 * Kicker editorial del header (spec Gemini).
 * null = sin kicker (plantilla default).
 */
export function iktHeaderEyebrow(
  businessKind: string | null | undefined,
): string | null {
  const rubro = businessKindToIktRubro(businessKind);
  if (rubro === "ropa") return "SHOWROOM · COLECCIÓN ACTUAL";
  if (rubro === "comidas") return "COMIDA CASERA · RECIÉN HECHA";
  if (rubro === "artesanias") return "TALLER ARTESANAL · PIEZAS ÚNICAS";
  return null;
}

/** Texto del banner «Abierto ahora» (Comidas) — franja superior. */
export const IKT_COMIDAS_OPEN_BANNER =
  "🟢 ABIERTO AHORA · Retiro en el local o envío a domicilio";

/** Tip 💡 debajo del buscador de voz (guía +60 / copy Gemini). */
export function iktHelperTip(
  businessKind: string | null | undefined,
  ownerName?: string | null,
): string | null {
  const rubro = businessKindToIktRubro(businessKind);
  if (!rubro) return null;
  const owner = ownerName?.trim();
  if (rubro === "comidas") {
    return "Tocá el botón verde del plato que te tiente y se arma tu pedido en WhatsApp.";
  }
  if (rubro === "ropa") {
    return owner
      ? `Sin tablas de talles complicadas: tocá la prenda que te guste y consultale directo a ${owner}.`
      : "Sin tablas de talles complicadas: tocá la prenda que te guste y consultale directo.";
  }
  return owner
    ? `Tocá el botón en la pieza que te guste y te abre WhatsApp para encargársela a ${owner}.`
    : "Tocá el botón en la pieza que te guste y te abre WhatsApp para encargarla.";
}

/** Placeholder del buscador escrito (ejemplos por rubro, mock Gemini). */
export function iktVoiceSearchPlaceholder(
  businessKind: string | null | undefined,
): string {
  const rubro = businessKindToIktRubro(businessKind);
  if (rubro === "comidas") {
    return "O escribí acá (ej: Milanesa, Empanadas)...";
  }
  if (rubro === "ropa") {
    return "O escribí acá (ej: Camisa, Jean)...";
  }
  if (rubro === "artesanias") {
    return "O escribí acá (ej: Cuenco, Mate)...";
  }
  return "O escribí acá...";
}

/** Verbo del mensaje wa.me prearmado (spec Gemini). */
export const IKT_WA_ACTION: Record<IktRubro, string> = {
  comidas: "pedir este plato",
  ropa: "consultar por esta prenda",
  artesanias: "encargar esta pieza",
};

export function iktWaAction(
  businessKind: string | null | undefined,
): string | null {
  const rubro = businessKindToIktRubro(businessKind);
  if (!rubro) return null;
  return IKT_WA_ACTION[rubro];
}

/** Iniciales para avatar / monograma (fallback sin foto). */
export function storeMonogramInitials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}
