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
        <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
          Alfrebot guarda el número de WhatsApp, el nombre, el nombre de la tienda y
          los datos de productos que mandás al ayudante, para mostrar tu catálogo
          público. No vendemos esos datos. Las fotos se guardan para la tienda.
        </p>
        <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
          En la tienda pública podés buscar con la voz. Lo normal es que el
          reconocimiento ocurra en tu celular. Solo si el navegador no puede
          entenderlo se manda un audio corto al servidor para transcribirlo; no
          guardamos tu voz.
        </p>
        <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
          Contacto: el dueño del proyecto en el repositorio de GitHub de alfrebot.
        </p>
      </main>
    </>
  );
}
