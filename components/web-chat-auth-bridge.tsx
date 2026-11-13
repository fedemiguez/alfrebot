"use client";

import { useAuth, useUser } from "@clerk/nextjs";
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
    imageUrl: string | null;
    firstName: string | null;
  }) => void;
}) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    onChange({
      isLoaded: Boolean(isLoaded),
      isSignedIn: Boolean(isSignedIn),
      userId: userId ?? null,
      imageUrl: user?.imageUrl?.trim() || null,
      firstName: user?.firstName?.trim() || null,
    });
  }, [
    isLoaded,
    isSignedIn,
    userId,
    user?.imageUrl,
    user?.firstName,
    onChange,
  ]);

  return null;
}
