export {
  formatPhoneDisplay,
  normalizeArMobileE164,
  phoneDigits,
  phoneToWaDigits,
  resolveStoreContactPhone,
  isWhatsAppContactPhone,
  buildWaMeUrl,
} from "@/lib/phone";

export function formatPriceArs(cents: number | null | undefined): string {
  if (cents == null) return "Consultar";
  const pesos = Math.round(cents / 100);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(pesos);
}
