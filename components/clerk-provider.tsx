"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import type { ReactNode } from "react";
import { alfrebotClerkAppearance } from "@/lib/clerk-appearance";
import { CLERK_AFTER_AUTH_URL } from "@/lib/clerk-redirects";

export function AppClerkProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  if (!enabled) return children;
  return (
    <ClerkProvider
      localization={esES}
      appearance={alfrebotClerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
      // Default Clerk fallback is `/` — keep authenticated users in the chat.
      signInFallbackRedirectUrl={CLERK_AFTER_AUTH_URL}
      signUpFallbackRedirectUrl={CLERK_AFTER_AUTH_URL}
      signInForceRedirectUrl={CLERK_AFTER_AUTH_URL}
      signUpForceRedirectUrl={CLERK_AFTER_AUTH_URL}
    >
      {children}
    </ClerkProvider>
  );
}
