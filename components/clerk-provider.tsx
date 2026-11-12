"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import type { ReactNode } from "react";
import { alfrebotClerkAppearance } from "@/lib/clerk-appearance";

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
    >
      {children}
    </ClerkProvider>
  );
}
