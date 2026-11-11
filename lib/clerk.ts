/** Clerk está provisionado en Vercel (preview/production). Local puede no tener keys. */
export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );
}

/** Identidad estable para conversaciones/tiendas creadas por email (no es un WA). */
export function clerkIdentityKey(userId: string): string {
  return `clerk:${userId}`;
}

export function isClerkIdentity(from: string | null | undefined): boolean {
  return Boolean(from?.startsWith("clerk:"));
}
