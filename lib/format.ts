export function formatPriceArs(cents: number | null | undefined): string {
  if (cents == null) return "Consultar";
  const pesos = Math.round(cents / 100);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(pesos);
}

export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "—";
  const d = e164.replace(/\D/g, "");
  // +54911… → 11 …
  if (d.startsWith("549") && d.length >= 12) {
    const rest = d.slice(3);
    return `${rest.slice(0, 2)} ${rest.slice(2)}`;
  }
  return e164;
}
