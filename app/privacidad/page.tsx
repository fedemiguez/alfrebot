import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidad",
};

export default function PrivacidadPage() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col bg-[#ECE5DD]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 0%, rgba(37, 211, 102, 0.22), transparent 50%), radial-gradient(ellipse at 90% 80%, rgba(7, 94, 84, 0.18), transparent 45%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-2xl flex-1 px-5 pb-14 pt-6 sm:pb-16 sm:pt-8">
        <Link
          href="/"
          className="fade-in inline-flex min-h-11 items-center font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#075E54] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
        >
          alfrebot
        </Link>

        <h1 className="fade-in mt-8 font-[family-name:var(--font-display)] text-[2rem] font-semibold leading-tight text-[#0f172a] sm:text-[2.35rem]">
          Privacidad
        </h1>
        <p className="fade-in mt-4 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.15rem] [animation-delay:40ms]">
          Alfrebot guarda el número de WhatsApp, el nombre, el nombre de la tienda y
          los datos de productos que mandás al ayudante, para mostrar tu catálogo
          público. No vendemos esos datos. Las fotos se guardan para la tienda.
        </p>
        <p className="fade-in mt-4 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.15rem] [animation-delay:80ms]">
          En la tienda pública podés buscar con la voz. Lo normal es que el
          reconocimiento ocurra en tu celular. Solo si el navegador no puede
          entenderlo se manda un audio corto al servidor para transcribirlo; no
          guardamos tu voz.
        </p>
        <p className="fade-in mt-4 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.15rem] [animation-delay:120ms]">
          Contacto: el dueño del proyecto en el repositorio de GitHub de alfrebot.
        </p>

        <p className="fade-in mt-10 border-t border-[#075E54]/15 pt-8 [animation-delay:160ms]">
          <Link
            href="/"
            className="inline-flex min-h-[52px] items-center text-[1.125rem] font-semibold text-[#075E54] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
          >
            Volver al inicio
          </Link>
        </p>
      </div>
    </main>
  );
}
