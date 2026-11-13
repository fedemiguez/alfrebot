"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

/**
 * Refleja la sesión Clerk en el chat sin depender solo de props RSC.
 * Montar únicamente con identityMode=clerk (ClerkProvider activo).
 */
export function WebChatAuthBridge({
  onChange,
}: {
  onChange: (state: {
    isLoaded: boolean;
    isSignedIn: boolean;
    userId: string | null;
  }) => void;
}) {
  const { isLoaded, isSignedIn, userId } = useAuth();

  useEffect(() => {
    onChange({
      isLoaded: Boolean(isLoaded),
      isSignedIn: Boolean(isSignedIn),
      userId: userId ?? null,
    });
  }, [isLoaded, isSignedIn, userId, onChange]);

  return null;
}
