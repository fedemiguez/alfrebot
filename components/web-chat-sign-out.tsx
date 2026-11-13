"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

/**
 * Corre Clerk signOut cuando el motor pide cerrar sesión (chat web).
 * Solo montar con identityMode clerk (ClerkProvider activo).
 */
export function WebChatSignOut({
  requestId,
  redirectUrl = "/asistente",
}: {
  /** Cambia cuando hay un nuevo pedido de sign-out. */
  requestId: number;
  redirectUrl?: string;
}) {
  const { signOut } = useClerk();
  const lastHandled = useRef(0);

  useEffect(() => {
    if (!requestId || requestId === lastHandled.current) return;
    lastHandled.current = requestId;
    void signOut({ redirectUrl });
  }, [requestId, redirectUrl, signOut]);

  return null;
}
