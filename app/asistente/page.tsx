import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AsistenteChatBody } from "@/components/asistente-chat-body";
import { isAlfrebotChatV2 } from "@/lib/env";

export const metadata: Metadata = {
  title: "Asistente",
  description: "Armá tu tienda en el chat web con el mismo asistente de alfrebot.",
};

function ClassicShell({ children }: { children: React.ReactNode }) {
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
          Mismo ayudante que por WhatsApp. Ya tenés cuenta con email; cuando el
          bot te pida el WhatsApp de pedidos, ese número es el que ven tus
          clientes.
        </p>
        <p className="mt-4 max-w-2xl rounded-lg border border-[var(--border)] bg-white/80 px-4 py-3 text-[1.15rem] leading-relaxed text-[var(--ink)]">
          <span className="font-semibold text-[var(--primary)]">
            Icono de la tienda
          </span>
          {" — "}
          pedí por texto o audio «armar icono», o en el menú tocá{" "}
          <span className="font-semibold">Tienda → Icono de la tienda</span>{" "}
          para armarlo o subir tu imagen. No es lo mismo que la foto de un
          producto.
        </p>
        <div className="mt-8">{children}</div>
      </main>
    </>
  );
}

export default function AsistentePage() {
  const v2 = isAlfrebotChatV2();

  if (v2) {
    return (
      <Suspense
        fallback={
          <div className="flex h-dvh items-center justify-center bg-[#ECE5DD] text-[var(--muted)]">
            Cargando Alfre…
          </div>
        }
      >
        <AsistenteChatBody variant="v2" />
      </Suspense>
    );
  }

  return (
    <ClassicShell>
      <Suspense
        fallback={
          <div className="rounded-lg border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
            Cargando el chat…
          </div>
        }
      >
        <AsistenteChatBody variant="classic" />
      </Suspense>
    </ClassicShell>
  );
}
