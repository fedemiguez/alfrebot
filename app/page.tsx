import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-[#ECE5DD]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 0%, rgba(37, 211, 102, 0.22), transparent 50%), radial-gradient(ellipse at 90% 80%, rgba(7, 94, 84, 0.18), transparent 45%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
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
      </div>

      <footer className="relative z-10 px-5 py-5 text-center text-[14px] text-[#075E54]/70">
        alfrebot · alfrebot.com.ar
      </footer>
    </main>
  );
}
