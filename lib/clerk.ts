/**
 * Config de Clerk + reexport de identidad web.
 * La key de canal vive en `lib/channel-identity.ts` (WA E.164 o clerk:{userId}).
 */
export {
  clerkIdentityKey,
  isClerkIdentity,
  clerkUserIdFromIdentity,
} from "@/lib/channel-identity";
import { clerkUserIdFromIdentity } from "@/lib/channel-identity";

/** Clerk está provisionado en Vercel (preview/production). Local puede no tener keys. */
export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );
}

/**
 * URL de foto de perfil Clerk (Google u otro IdP).
 * Preferí `hint` (p. ej. currentUser en el request); si no, Backend API.
 */
export async function resolveClerkProfileImageUrl(input: {
  hint?: string | null;
  channelIdentity?: string | null;
  clerkUserId?: string | null;
}): Promise<string | null> {
  const hinted = input.hint?.trim();
  if (hinted && /^(https?:\/\/|data:image\/)/i.test(hinted)) return hinted;

  const userId =
    input.clerkUserId?.trim() ||
    clerkUserIdFromIdentity(input.channelIdentity) ||
    null;
  if (!userId || !isClerkConfigured()) return null;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const url = user.imageUrl?.trim();
    return url && /^(https?:\/\/|data:image\/)/i.test(url) ? url : null;
  } catch (err) {
    console.warn("[clerk] resolve profile image failed", err);
    return null;
  }
}

/** Descarga bytes de una foto de perfil (CDN Clerk) con timeout. */
export async function fetchClerkProfileImageBytes(
  imageUrl: string,
  timeoutMs = 10_000,
): Promise<Buffer> {
  const dataMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataMatch) {
    const bytes = Buffer.from(dataMatch[2]!, "base64");
    if (!bytes.length) throw new Error("profile image vacía");
    return bytes;
  }
  const res = await fetch(imageUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "image/*" },
  });
  if (!res.ok) {
    throw new Error(`profile image fetch ${res.status}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error("profile image vacía");
  return bytes;
}
