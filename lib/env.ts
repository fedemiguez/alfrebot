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
