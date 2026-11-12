export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export function isMetaTestMode(): boolean {
  const v = process.env.META_TEST_MODE?.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  return true;
}

export function metaVerifiedNumbers(): string[] {
  return (process.env.META_VERIFIED_NUMBERS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

export function metaBotNumber(): string {
  return (process.env.META_BOT_NUMBER ?? "15550000000").replace(/\D/g, "");
}

export function waProvider(): "meta" | "simulator" {
  return process.env.WA_PROVIDER === "meta" ? "meta" : "simulator";
}

/**
 * Alfrebot chat v2 (WhatsApp-like, proactivo).
 * Default ON. Set ALFREBOT_CHAT_V2=0 (or false/off) to serve v1 on `/asistente`.
 * `/asistente-v1` always keeps the classic shell for rollback.
 */
export function isAlfrebotChatV2(): boolean {
  const v = process.env.ALFREBOT_CHAT_V2?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}
