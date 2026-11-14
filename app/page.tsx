import Link from "next/link";

const familySteps = [
  {
    emoji: "📸",
    title: "1. Vos cargás lo básico",
    body: "Subís las fotos de lo que vende tu familiar y ponés los precios desde acá o por WhatsApp.",
  },
  {
    emoji: "🔗",
    title: "2. Conectás su teléfono",
    body: "Vinculás el WhatsApp donde tu familiar recibe sus mensajes de todos los días.",
  },
  {
    emoji: "📲",
    title: "3. ¡Listo para vender!",
    body: "Tus clientes entran a la página, eligen lo que quieren y el pedido llega directo al chat de tu familiar.",
  },
] as const;

export default function Home() {
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

      <section
        aria-label="Inicio"
        className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6 py-16 text-center"
      >
        <p className="fade-in font-[family-name:var(--font-display)] text-5xl font-semibold tracking-tight text-[#075E54] sm:text-6xl">
          alfrebot
        </p>

        {/* Gancho para futura animación del robot (no bloquea el lanzamiento). */}
        <div
          data-alfrebot-robot-slot
          className="mt-8 flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/alfrebot-robot.svg"
            alt=""
            width={112}
            height={112}
            className="h-24 w-24 rounded-2xl shadow-sm sm:h-28 sm:w-28"
          />
        </div>

        <h1 className="fade-in mt-8 max-w-md text-[1.35rem] font-normal leading-snug text-[#0f172a] sm:text-[1.5rem] [animation-delay:60ms]">
          Creá tu tienda por WhatsApp o hablando por audio. Fácil y sin
          complicaciones.
        </h1>

        <p className="fade-in mt-4 max-w-md text-base leading-relaxed text-[#0f172a] sm:text-[1.1rem] [animation-delay:90ms]">
          No hace falta saber de tecnología ni computación. Mandás una foto,
          decís el precio por audio y tu catálogo queda listo para vender.
        </p>

        <div className="fade-in mt-10 flex w-full max-w-md flex-col gap-4 [animation-delay:120ms]">
          <Link
            href="/asistente"
            className="inline-flex min-h-[54px] w-full touch-manipulation items-center justify-center rounded-full bg-[#25D366] px-8 text-[1.125rem] font-bold text-white shadow-sm transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
          >
            Empezar a hablar con el asistente 🚀
          </Link>
          <Link
            href="/ayuda"
            className="inline-flex min-h-[52px] w-full touch-manipulation items-center justify-center rounded-full border-2 border-[#075E54] bg-transparent px-8 text-[1.125rem] font-semibold text-[#075E54] transition-[opacity,transform,background-color] duration-200 hover:bg-[#075E54]/08 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
          >
            ¿Cómo funciona? Ver guía simple
          </Link>
          {/*
            Same-page anchor (real href). Tertiary weight vs Gemini primary/secondary:
            always-visible underline (no hover-only affordance), ≥52px, touch-manipulation.
          */}
          <a
            href="#cta-familia-title"
            className="inline-flex min-h-[52px] w-full touch-manipulation items-center justify-center rounded-full px-8 text-[1.125rem] font-semibold text-[#075E54] underline decoration-2 underline-offset-4 transition-[opacity,transform,background-color] duration-200 hover:bg-[#075E54]/08 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
          >
            Armarle la tienda a un familiar
          </a>
        </div>
      </section>

      <section
        aria-labelledby="cta-familia-title"
        className="relative z-10 border-t border-[#075E54]/15 px-5 py-14 sm:px-6"
      >
        <div className="mx-auto w-full max-w-2xl rounded-2xl border-2 border-[#075E54]/20 bg-[#F5EFE6] px-5 py-10 text-center sm:px-8">
          <h2
            id="cta-familia-title"
            className="fade-in scroll-mt-10 font-[family-name:var(--font-display)] text-[1.4rem] font-semibold leading-snug text-[#075E54] sm:text-[1.65rem]"
          >
            🎁 ¿Le querés armar la tienda a mamá, papá o un familiar?
          </h2>
          <p className="fade-in mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#0f172a] sm:text-[1.1rem] [animation-delay:60ms]">
            Hacelo como Federico con Nora: vos armás la base en minutos y ellos
            reciben los pedidos en su celular.
          </p>

          <ol className="mt-8 grid list-none gap-4 text-left sm:grid-cols-3 sm:gap-5">
            {familySteps.map((step) => (
              <li
                key={step.title}
                className="rounded-xl border border-[#075E54]/15 bg-white/70 px-4 py-5"
              >
                <p className="text-[1.35rem]" aria-hidden>
                  {step.emoji}
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-[1.125rem] font-semibold leading-snug text-[#0f172a]">
                  {step.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-[#1e293b]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>

          <Link
            href="/asistente"
            className="fade-in mt-8 inline-flex min-h-[54px] w-full touch-manipulation items-center justify-center rounded-full bg-[#075E54] px-8 text-[1.125rem] font-bold text-white transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54] sm:w-auto [animation-delay:120ms]"
          >
            Quiero armarle la tienda a un familiar
          </Link>
        </div>
      </section>

      <footer className="relative z-10 px-5 py-5 text-center text-base text-[#075E54]">
        <p>alfrebot · alfrebot.com.ar</p>
        <p className="mt-2">
          <Link
            href="/ayuda"
            className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
          >
            Ayuda
          </Link>
          {" · "}
          <Link
            href="/privacidad"
            className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54]"
          >
            Privacidad
          </Link>
        </p>
      </footer>
    </main>
  );
}
