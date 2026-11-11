/**
 * Config de Clerk + reexport de identidad web.
 * La key de canal vive en `lib/channel-identity.ts` (WA E.164 o clerk:{userId}).
 */
export {
  clerkIdentityKey,
  isClerkIdentity,
  clerkUserIdFromIdentity,
} from "@/lib/channel-identity";

/** Clerk está provisionado en Vercel (preview/production). Local puede no tener keys. */
export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );
}
