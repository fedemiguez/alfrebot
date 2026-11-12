"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useEffect, useId, useState } from "react";
import { alfrebotClerkChatAppearance } from "@/lib/clerk-appearance";

const RETURN_URL = "/asistente";

export function ChatAuthOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setMode("sign-up");
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-[#075E54]/35 backdrop-blur-[1px]"
        aria-label="Cerrar inicio de sesión"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-[#075E54]/15 bg-[#F7F3EE] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-lg sm:mx-4 sm:rounded-2xl sm:px-5 sm:pb-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-wide text-[#075E54]/80">
              alfrebot
            </p>
            <h2
              id={titleId}
              className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[#0f172a]"
            >
              {mode === "sign-up" ? "Creá tu cuenta" : "Entrá a tu cuenta"}
            </h2>
            <p className="mt-1 text-[15px] leading-snug text-[#334155]">
              Para seguir armando la tienda en este chat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#075E54] transition-colors hover:bg-[#075E54]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mx-auto w-full">
          {mode === "sign-up" ? (
            <SignUp
              routing="hash"
              forceRedirectUrl={RETURN_URL}
              signInForceRedirectUrl={RETURN_URL}
              appearance={alfrebotClerkChatAppearance}
              fallback={
                <p className="py-8 text-center text-[var(--muted)]">
                  Cargando…
                </p>
              }
            />
          ) : (
            <SignIn
              routing="hash"
              forceRedirectUrl={RETURN_URL}
              signUpForceRedirectUrl={RETURN_URL}
              appearance={alfrebotClerkChatAppearance}
              fallback={
                <p className="py-8 text-center text-[var(--muted)]">
                  Cargando…
                </p>
              }
            />
          )}
        </div>

        <p className="mt-3 text-center text-[15px] text-[#334155]">
          {mode === "sign-up" ? (
            <>
              ¿Ya tenés cuenta?{" "}
              <button
                type="button"
                className="font-semibold text-[#075E54] underline-offset-2 hover:underline"
                onClick={() => setMode("sign-in")}
              >
                Entrar
              </button>
            </>
          ) : (
            <>
              ¿Primera vez?{" "}
              <button
                type="button"
                className="font-semibold text-[#075E54] underline-offset-2 hover:underline"
                onClick={() => setMode("sign-up")}
              >
                Crear cuenta
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
