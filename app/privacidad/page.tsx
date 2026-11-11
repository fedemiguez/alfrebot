import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Privacidad",
};

export default function PrivacidadPage() {
  return (
    <>
      <SiteHeader />
      <main className="prose prose-stone mx-auto max-w-3xl flex-1 px-5 py-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Privacidad
        </h1>
        <p className="mt-4 text-[var(--muted)]">
          Alfrebot guarda el número de WhatsApp, el nombre, el nombre de la tienda y
          los datos de productos que mandás al asistente, para mostrar tu catálogo
          público. No vendemos esos datos. Las fotos se almacenan para la tienda.
        </p>
        <p className="mt-4 text-[var(--muted)]">
          Contacto: el dueño del proyecto en el repositorio de GitHub de alfrebot.
        </p>
      </main>
    </>
  );
}
