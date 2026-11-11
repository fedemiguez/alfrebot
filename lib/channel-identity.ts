import { formatPhoneDisplay, isWhatsAppContactPhone, normalizeArMobileE164 } from "@/lib/phone";

/** Prefijo de identidades creadas por el camino web (Clerk). */
export const CLERK_IDENTITY_PREFIX = "clerk:";

/** Identidad de canal: E.164 (`+549…`) o `clerk:{userId}`. */
export type ChannelIdentity = string;

export function clerkIdentityKey(userId: string): ChannelIdentity {
  return `${CLERK_IDENTITY_PREFIX}${userId}`;
}

export function isClerkIdentity(from: string | null | undefined): boolean {
  return Boolean(from?.startsWith(CLERK_IDENTITY_PREFIX));
}

export function clerkUserIdFromIdentity(
  from: string | null | undefined,
): string | null {
  if (!isClerkIdentity(from) || !from) return null;
  const id = from.slice(CLERK_IDENTITY_PREFIX.length).trim();
  return id || null;
}

/** Identidad de canal WhatsApp = E.164 AR cuando se puede. */
export function waChannelIdentity(
  input: string | null | undefined,
): ChannelIdentity | null {
  return normalizeArMobileE164(input);
}

export function isWaChannelIdentity(from: string | null | undefined): boolean {
  return isWhatsAppContactPhone(from);
}

/**
 * Etiqueta legible para admin / UI.
 * WA → formato local; Clerk → email si hay, si no “cuenta web”.
 */
export function formatChannelIdentityLabel(store: {
  channelIdentity: string;
  ownerEmail?: string | null;
}): string {
  if (isClerkIdentity(store.channelIdentity)) {
    return store.ownerEmail?.trim() || "Cuenta web (email)";
  }
  if (isWaChannelIdentity(store.channelIdentity)) {
    return formatPhoneDisplay(store.channelIdentity);
  }
  return store.channelIdentity;
}
