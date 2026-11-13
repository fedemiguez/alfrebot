import Link from "next/link";

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
          Tu asistente para crear tiendas virtuales de forma sencilla, en unos 5
          minutos.
        </h1>

        <Link
          href="/asistente"
          className="fade-in mt-10 inline-flex min-h-12 min-w-[12rem] items-center justify-center rounded-full bg-[#25D366] px-8 text-[1.1rem] font-semibold text-white shadow-sm transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54] [animation-delay:120ms]"
        >
          Comenzar
        </Link>
      </section>

      <section
        aria-labelledby="cta-familia-title"
        className="relative z-10 border-t border-[#075E54]/15 px-6 py-14 text-center"
      >
        <div className="mx-auto w-full max-w-lg">
          <h2
            id="cta-familia-title"
            className="fade-in font-[family-name:var(--font-display)] text-[1.45rem] font-semibold leading-snug text-[#075E54] sm:text-[1.65rem]"
          >
            ¿Le armás la tienda a alguien de la familia?
          </h2>
          <p className="fade-in mx-auto mt-3 max-w-md text-[1.1rem] leading-relaxed text-[#0f172a]/80 [animation-delay:60ms]">
            Te contamos cómo hacerlo paso a paso, como Federico con Nora.
          </p>
          <Link
            href="/ayuda#familia"
            className="fade-in mt-8 inline-flex min-h-12 items-center justify-center rounded-full border-2 border-[#075E54] bg-transparent px-8 text-[1.05rem] font-semibold text-[#075E54] transition-[opacity,transform,background-color] duration-200 hover:bg-[#075E54]/08 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54] [animation-delay:120ms]"
          >
            Ver cómo ayudarle
          </Link>
        </div>
      </section>

      <footer className="relative z-10 px-5 py-5 text-center text-[14px] text-[#075E54]/70">
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
