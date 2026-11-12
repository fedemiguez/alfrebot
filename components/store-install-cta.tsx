"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneDisplay(): boolean {
  const mediaStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mediaStandalone || iosStandalone;
}

function isIosDevice(): boolean {
  const ua = window.navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ puede presentarse como Mac.
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

function subscribeStandalone(onStoreChange: () => void) {
  const mediaQueries = [
    window.matchMedia("(display-mode: standalone)"),
    window.matchMedia("(display-mode: fullscreen)"),
    window.matchMedia("(display-mode: minimal-ui)"),
  ];
  for (const mq of mediaQueries) {
    mq.addEventListener("change", onStoreChange);
  }
  window.addEventListener("appinstalled", onStoreChange);
  return () => {
    for (const mq of mediaQueries) {
      mq.removeEventListener("change", onStoreChange);
    }
    window.removeEventListener("appinstalled", onStoreChange);
  };
}

/**
 * CTA comprador: instalar / guardar la tienda en el celular.
 * Usa beforeinstallprompt cuando existe; en iOS muestra pasos de Compartir → Agregar a inicio.
 * Se oculta si la tienda ya corre como app (standalone).
 */
export function StoreInstallCta({ storeName }: { storeName: string }) {
  const installed = useSyncExternalStore(
    subscribeStandalone,
    isStandaloneDisplay,
    () => false,
  );
  const ios = useSyncExternalStore(
    () => () => {},
    isIosDevice,
    () => false,
  );
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  const [otherHelpOpen, setOtherHelpOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferredRef.current = event as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    const onAppInstalled = () => {
      deferredRef.current = null;
      setCanPrompt(false);
      setIosHelpOpen(false);
      setOtherHelpOpen(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) return null;

  const label = canPrompt ? "Instalar tienda" : "Guardar en el celular";
  const support =
    "Así la encontrás más fácil en el inicio del celular y comprás más rápido.";

  async function onPrimaryClick() {
    if (canPrompt && deferredRef.current) {
      setInstalling(true);
      try {
        await deferredRef.current.prompt();
        await deferredRef.current.userChoice;
      } catch {
        /* el navegador puede cancelar; no rompemos la tienda */
      } finally {
        deferredRef.current = null;
        setCanPrompt(false);
        setInstalling(false);
      }
      return;
    }

    if (ios) {
      setIosHelpOpen((open) => !open);
      setOtherHelpOpen(false);
      return;
    }

    setOtherHelpOpen((open) => !open);
    setIosHelpOpen(false);
  }

  return (
    <section
      className="mt-5 rounded border border-[var(--border)] bg-[var(--paper)] px-4 py-4"
      aria-labelledby="store-install-title"
    >
      <p
        id="store-install-title"
        className="font-[family-name:var(--font-display)] text-[1.2rem] font-semibold text-[var(--ink)]"
      >
        {storeName} en tu celular
      </p>
      <p className="mt-2 text-[1.1rem] leading-relaxed text-[var(--ink)]">
        {support}
      </p>

      <button
        type="button"
        className="btn btn-secondary mt-4 w-full touch-manipulation sm:w-auto"
        onClick={onPrimaryClick}
        disabled={installing}
        aria-expanded={iosHelpOpen || otherHelpOpen || undefined}
        aria-controls={
          iosHelpOpen || otherHelpOpen ? "store-install-help" : undefined
        }
      >
        {installing ? "Abriendo…" : label}
      </button>

      {iosHelpOpen && (
        <ol
          id="store-install-help"
          className="mt-4 list-decimal space-y-2 pl-6 text-[1.1rem] leading-relaxed text-[var(--ink)]"
        >
          <li>
            Tocá <strong>Compartir</strong> (el cuadrado con la flecha hacia
            arriba) en Safari.
          </li>
          <li>
            Elegí <strong>Agregar a inicio</strong> o{" "}
            <strong>Agregar a la pantalla de inicio</strong>.
          </li>
          <li>Confirmá. Después abrís la tienda como una app.</li>
        </ol>
      )}

      {otherHelpOpen && (
        <p
          id="store-install-help"
          className="mt-4 text-[1.1rem] leading-relaxed text-[var(--ink)]"
        >
          En el menú del navegador (los tres puntitos) buscá{" "}
          <strong>Instalar app</strong>,{" "}
          <strong>Agregar a la pantalla de inicio</strong> o una opción
          parecida. Si no aparece, abrí esta tienda desde el celular con Chrome.
        </p>
      )}
    </section>
  );
}
