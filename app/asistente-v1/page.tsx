import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AsistenteChatBody } from "@/components/asistente-chat-body";

export const metadata: Metadata = {
  title: "Asistente (v1)",
  description:
    "Shell clásico de alfrebot. Usá esta ruta para volver a v1 mientras se prueba el chat v2.",
};

/** Rollback / comparación: siempre el shell clásico (header + aside). */
export default function AsistenteV1Page() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
          Armá tu tienda en la web
        </h1>
        <p className="mt-3 max-w-2xl text-[1.2rem] leading-relaxed text-[var(--muted)]">
          Shell clásico (v1). El chat nuevo está en /asistente cuando
          ALFREBOT_CHAT_V2 está activo.
        </p>
        <p className="mt-4 max-w-2xl rounded-lg border border-[var(--border)] bg-white/80 px-4 py-3 text-[1.15rem] leading-relaxed text-[var(--ink)]">
          <span className="font-semibold text-[var(--primary)]">
            Icono de la tienda
          </span>
          {" — "}
          pedí por texto o audio «armar icono», o en el menú tocá{" "}
          <span className="font-semibold">Tienda → Icono de la tienda</span>{" "}
          para armarlo o subir tu imagen.
        </p>
        <div className="mt-8">
          <Suspense
            fallback={
              <div className="rounded-lg border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
                Cargando el chat…
              </div>
            }
          >
            <AsistenteChatBody variant="classic" />
          </Suspense>
        </div>
      </main>
    </>
  );
}
