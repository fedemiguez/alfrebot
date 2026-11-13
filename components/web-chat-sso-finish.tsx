"use client";

import {
  AuthenticateWithRedirectCallback,
  SignIn,
  useAuth,
} from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { alfrebotClerkChatAppearance } from "@/lib/clerk-appearance";

const RETURN_URL = "/asistente";

function readSsoHashPending(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hash || "";
  return /sso-callback|factor_redirect_callback/i.test(h);
}

function clearAuthHash() {
  if (typeof window === "undefined") return;
  const h = window.location.hash || "";
  if (!h) return;
  if (!/sso-callback|factor_redirect_callback|factor-in|sign-up/i.test(h)) return;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

/**
 * Completa el OAuth/SSO de Clerk cuando volvés a /asistente con
 * `#/sso-callback` (hash routing del overlay). Sin esto el callback
 * queda colgado hasta que algo remonta SignIn (p. ej. mandar un mensaje).
 */
export function WebChatSsoFinish({
  onPendingChange,
}: {
  onPendingChange?: (pending: boolean) => void;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const [hashPending, setHashPending] = useState(readSsoHashPending);

  useEffect(() => {
    const sync = () => setHashPending(readSsoHashPending());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const finishing = hashPending && !(isLoaded && isSignedIn);

  useEffect(() => {
    onPendingChange?.(finishing);
  }, [finishing, onPendingChange]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!readSsoHashPending() && !(window.location.hash || "")) return;
    clearAuthHash();
    setHashPending(false);
  }, [isLoaded, isSignedIn]);

  if (!hashPending) return null;

  return (
    <>
      {/* Path-style callback (por si Clerk no usa solo hash). */}
      <AuthenticateWithRedirectCallback />
      {/* Hash routing del overlay: hace falta SignIn montado para #/sso-callback. */}
      <div className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0" aria-hidden>
        <SignIn
          routing="hash"
          forceRedirectUrl={RETURN_URL}
          appearance={alfrebotClerkChatAppearance}
        />
      </div>
      {finishing && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-[#075E54]/35 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div className="mx-4 max-w-sm rounded-2xl border border-[#075E54]/15 bg-[#F7F3EE] px-5 py-6 text-center shadow-lg">
            <p className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wide text-[#075E54]/80">
              alfrebot
            </p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-[#0f172a]">
              Entrando a tu cuenta…
            </p>
            <p className="mt-2 text-[15px] leading-snug text-[#334155]">
              Estamos terminando el inicio de sesión. Un segundo.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
