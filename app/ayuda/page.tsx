import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Ayuda",
  description:
    "Te ayudamos paso a paso a usar Alfrebot: armar la tienda por audio o WhatsApp, y pasársela a un familiar.",
};

const faq: { q: string; a: ReactNode }[] = [
  {
    q: "¿Qué pasa si me equivoco en un precio o una foto?",
    a: (
      <>
        ¡No pasa nada! No se rompe ni se borra tu tienda. Le mandás un audio o
        mensaje a Alfrebot diciendo qué querés corregir (por ejemplo: «Cambiá el
        precio de las empanadas») y lo actualiza al instante.
      </>
    ),
  },
  {
    q: "¿Tengo que escribir todo en el teclado del celular?",
    a: (
      <>
        No hace falta. Sabemos que escribir en pantallas chicas puede ser
        incómodo, por eso podés tocar el micrófono y hablarle a Alfrebot por
        audio para cargar productos o pedir ayuda.
      </>
    ),
  },
  {
    q: "¿Cómo me pagan mis clientes?",
    a: (
      <>
        El pedido llega directo a tu WhatsApp. Ahí mismo hablás con tu cliente y
        arreglan el pago (efectivo, transferencia o lo que vos uses) y la
        entrega, como lo hacés siempre.
      </>
    ),
  },
];

export default function AyudaPage() {
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
          Te ayudamos paso a paso
        </h1>
        <p className="fade-in mt-4 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.15rem] [animation-delay:40ms]">
          Acá te explicamos de forma sencilla cómo usar Alfrebot. Podés manejar
          todo hablando por <strong className="text-[#0f172a]">audio de voz</strong>{" "}
          🎤 o escribiendo mensajes cortos, como si charlaras con un ayudante en
          WhatsApp.
        </p>

        <nav
          aria-label="En esta página"
          className="fade-in mt-8 flex flex-wrap gap-x-5 gap-y-2 border-y border-[#075E54]/15 py-4 text-[1.125rem] [animation-delay:80ms]"
        >
          <a
            className="font-semibold text-[#075E54] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
            href="#familia"
          >
            Roles: ayudar o vender
          </a>
          <a
            className="font-semibold text-[#075E54] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
            href="#conectar"
          >
            Conectar WhatsApp
          </a>
          <a
            className="font-semibold text-[#075E54] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
            href="#faq"
          >
            Preguntas
          </a>
        </nav>

        <section
          id="familia"
          className="scroll-mt-6 mt-10 space-y-6"
          aria-labelledby="familia-title"
        >
          <h2
            id="familia-title"
            className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[#075E54]"
          >
            Quién hace qué (como Federico y Nora)
          </h2>

          <article className="mb-6 rounded-2xl border-2 border-[#075E54]/18 bg-[#F5EFE6] px-5 py-7 sm:px-7">
            <h3 className="font-[family-name:var(--font-display)] text-[1.25rem] font-semibold leading-snug text-[#075E54]">
              🧑‍💻 Si estás ayudando a un familiar
            </h3>
            <p className="mt-3 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.125rem]">
              Entrás desde tu computadora o celular, creás la tienda, elegís los
              colores y subís los primeros productos. Después, conectás el número
              de WhatsApp de tu familiar para que le lleguen los pedidos a él.
            </p>
          </article>

          <article className="mb-6 rounded-2xl border-2 border-[#075E54]/18 bg-white/90 px-5 py-7 sm:px-7">
            <h3 className="font-[family-name:var(--font-display)] text-[1.25rem] font-semibold leading-snug text-[#075E54]">
              👩‍🍳 Si sos el dueño o dueña del negocio
            </h3>
            <p className="mt-3 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.125rem]">
              No tenés que tocar configuraciones difíciles. Los clientes ven tus
              productos en la página, tocan un botón y te llega un mensaje
              directo a tu WhatsApp con lo que quieren comprar. Si necesitás
              cambiar un precio, le mandás un audio a Alfrebot y listo.
            </p>
          </article>
        </section>

        <section id="conectar" className="scroll-mt-6 mt-12 mb-6">
          <h2 className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[#075E54]">
            Conectar el WhatsApp de quien vende
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.125rem]">
            Cuando la tienda esté lista, quien la armó pide un código en el chat
            web (menú → WhatsApp → «Manejar desde acá»). Alfrebot da un{" "}
            <strong className="text-[#0f172a]">código de 6 dígitos</strong> que
            vale media hora.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.125rem]">
            Quien vende, desde <strong className="text-[#0f172a]">su</strong>{" "}
            WhatsApp, le escribe al bot «Ya tengo cuenta» y ese código. Queda la
            misma tienda unida a su celular: recibe pedidos ahí y puede manejar
            productos por audio.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.125rem]">
            Quien armó la tienda puede seguir entrando por la web con el mismo
            email. No hace falta crear otra cuenta ni aprender paneles raros.
          </p>
        </section>

        <section id="faq" className="scroll-mt-6 mt-12 mb-6">
          <h2 className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[#075E54]">
            Preguntas frecuentes
          </h2>
          <div className="mt-6 divide-y divide-[#075E54]/15">
            {faq.map((item) => (
              <details key={item.q} className="group mb-6 py-4 first:pt-0">
                <summary className="cursor-pointer list-none font-[family-name:var(--font-display)] text-[1.2rem] font-semibold leading-snug text-[#0f172a] marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start justify-between gap-3">
                    {item.q}
                    <span
                      aria-hidden
                      className="mt-1 shrink-0 text-[#075E54] transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.1rem]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          id="mas-ayuda"
          className="scroll-mt-6 mt-12 border-t border-[#075E54]/15 pt-10"
        >
          <h2 className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[#075E54]">
            ¿Necesitás más ayuda?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#0f172a]/80 sm:text-[1.125rem]">
            Volvé al asistente y pedile Ayuda o Menú. Decir{" "}
            <strong className="text-[#0f172a]">Cancelar</strong> te saca del paso
            en el que estás sin borrar la tienda.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/asistente"
              className="inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#25D366] px-7 text-[1.125rem] font-bold text-white shadow-sm transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54] sm:w-auto"
            >
              Ir al asistente
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-[52px] w-full items-center justify-center px-3 text-[1.125rem] font-semibold text-[#075E54] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54] sm:w-auto"
            >
              Volver al inicio
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
