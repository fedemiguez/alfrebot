import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AsistenteV2PreviewClient } from "@/components/asistente-v2-preview-client";
import { isAlfrebotChatV2, metaBotNumber } from "@/lib/env";

export const metadata: Metadata = {
  title: "Preview chat v2",
  description:
    "Vista previa pública del chat WhatsApp-like (sin login). Solo para revisar UI.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

async function PreviewBody() {
  // Request-time: evita shell estático sin hidratar el chat cliente.
  await connection();

  if (!isAlfrebotChatV2()) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-[var(--ink)]">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Chat v2 desactivado
        </h1>
        <p className="mt-3 text-[1.1rem] text-[var(--muted)]">
          Seteá <code>ALFREBOT_CHAT_V2=1</code> (o quitá el =0) para ver esta
          preview. El shell clásico sigue en /asistente-v1.
        </p>
      </main>
    );
  }

  const botDigits = metaBotNumber();
  const continueWaLink = `https://wa.me/${botDigits}?text=${encodeURIComponent(
    "quiero armar mi tienda",
  )}`;

  return (
    <AsistenteV2PreviewClient continueWaLink={continueWaLink} />
  );
}

/**
 * Preview sin Clerk para screenshots / Try Live de diseño.
 * Preview de UI; /asistente es público y pide Clerk solo al seguir en web.
 */
export default function AsistenteV2PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-[#ECE5DD] text-[var(--muted)]">
          Cargando preview…
        </div>
      }
    >
      <PreviewBody />
    </Suspense>
  );
}
