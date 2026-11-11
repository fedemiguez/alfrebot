import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="fade-in mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-20 pt-14">
        <p className="font-[family-name:var(--font-display)] text-5xl font-semibold tracking-tight text-[var(--primary)] sm:text-6xl md:text-7xl">
          alfrebot
        </p>
        <h1 className="mt-5 max-w-2xl text-[1.65rem] font-normal leading-snug text-[var(--ink)] sm:text-3xl">
          Armá tu tienda charlando: por WhatsApp o en la web.
        </h1>
        <p className="mt-4 max-w-xl text-[1.15rem] text-[var(--muted)]">
          Pensado para personas como Norma: mandás fotos y tu catálogo queda
          online. Empezás con tu celular; después podés seguir por el canal que
          te quede cómodo.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/registro" className="btn btn-primary">
            Armá por WhatsApp
          </Link>
          <Link href="/registro?canal=web" className="btn btn-secondary">
            Armá en la web
          </Link>
        </div>

        <section className="mt-16 border-t border-[var(--border)] pt-10">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
            Tienda de ejemplo
          </h2>
          <p className="mt-2 max-w-lg text-[var(--muted)]">
            Cerámicas de Norma — cómo se ve una tienda armada con alfrebot.
          </p>
          <Link
            href="/ceramicas-de-norma"
            className="btn btn-secondary mt-5 inline-flex"
          >
            Ver Cerámicas de Norma
          </Link>
        </section>
      </main>
      <footer className="border-t border-[var(--border)] px-5 py-6 text-center text-[15px] text-[var(--muted)]">
        alfrebot · alfrebot.com.ar
      </footer>
    </>
  );
}
