/**
 * Marcos SVG + trama de iconos (pre-Ikt).
 *
 * Decisión Fase 6 / PR7: con plantillas Ikt activas (rubro o default limpio)
 * marcos y trama quedan **archivados / off**. El CSS y `ProductImageFrame`
 * se conservan por si hace falta reactivar en un experimento, pero el shell
 * público no los aplica.
 *
 * - Con `business_kind` Ikt (ropa/comida/artesanal): siempre off.
 * - Sin rubro (default): también off — cards limpias + tokens neutros.
 */

/** Flag de archivo: no reactivar en vitrina pública sin decisión explícita. */
export const IKT_LEGACY_FRAMES_AND_PATTERN_ENABLED = false;

/** ¿Mostrar marco SVG / passepartout en cards? */
export function shouldShowProductFrame(
  businessKind: string | null | undefined,
): boolean {
  if (!IKT_LEGACY_FRAMES_AND_PATTERN_ENABLED) return false;
  // Históricamente: solo con rubro y sin plantilla Ikt. Hoy Ikt cubre todos
  // los rubros → nunca true mientras el flag esté off.
  void businessKind;
  return false;
}

/** ¿Aplicar clase store-pattern en el shell? */
export function shouldShowStorePattern(
  businessKind: string | null | undefined,
): boolean {
  if (!IKT_LEGACY_FRAMES_AND_PATTERN_ENABLED) return false;
  void businessKind;
  return false;
}
