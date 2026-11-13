/**
 * Microcopy CTA WhatsApp por rubro Ikt (mismo wa.me / WantItButton).
 */

import type { IktRubro } from "@/lib/store-ikt-theme";
import {
  businessKindToIktRubro,
} from "@/lib/store-ikt-theme";

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
  if (rubro === "ropa") return IKT_WANT_CTA.ropa;
  if (rubro === "comidas") return IKT_WANT_CTA.comidas;
  if (rubro === "artesanias") return IKT_WANT_CTA.artesanias;
  return null;
}

/** Eyebrow del header de vitrina Ikt (Ropa / Artesanías en preview). */
export function iktHeaderEyebrow(
  businessKind: string | null | undefined,
): string | null {
  const rubro = businessKindToIktRubro(businessKind);
  if (rubro === "ropa") return "Tienda de Ropa";
  if (rubro === "artesanias") return "Taller Artesanal";
  return null;
}

/** Texto del banner «Abierto ahora» (Comidas). */
export const IKT_COMIDAS_OPEN_BANNER = "🟢 ABIERTO AHORA";


/** Iniciales para avatar circular (fallback sin foto). */
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
