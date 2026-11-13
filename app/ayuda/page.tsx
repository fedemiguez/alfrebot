import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Ayuda",
  description:
    "Cómo armar tu tienda con Alfrebot, pasarle el manejo a alguien de la familia por WhatsApp, y preguntas frecuentes.",
};

const faq: { q: string; a: ReactNode }[] = [
  {
    q: "¿Puedo armar la tienda yo y que la use otra persona?",
    a: (
      <>
        Sí. Vos te registrás con <strong>tu email</strong>, armás la tienda y
        después vinculás el <strong>WhatsApp de quien vende</strong> (Menú →
        WhatsApp → Manejar desde acá). Queda la misma tienda: ella la maneja por
        WhatsApp; vos podés seguir entrando por la web con el mismo email.
      </>
    ),
  },
  {
    q: "¿Cómo le paso la tienda a mi mamá / a quien vende?",
    a: (
      <>
        No es una “cuenta nueva” ni roles distintos: es{" "}
        <strong>la misma cuenta web</strong> unida al celular de ella. Cuando la
        tienda esté lista, en el chat web pedí el código (Manejar desde acá) y
        que ella se lo mande al bot desde su WhatsApp con «Ya tengo cuenta».
      </>
    ),
  },
  {
    q: "¿El nombre de la tienda lo elijo yo?",
    a: (
      <>
        Sí. Al armarla, Alfrebot te pide el nombre del negocio. Después lo podés
        cambiar desde el menú de la tienda.
      </>
    ),
  },
  {
    q: "¿Puedo cargar productos con audio o foto?",
    a: (
      <>
        Sí. Mandá una <strong>foto</strong> del producto y, si preferís,{" "}
        <strong>hablale por audio</strong> el nombre y el precio. También podés
        escribirlo.
      </>
    ),
  },
  {
    q: "¿Cómo publico / veo mi tienda?",
    a: (
      <>
        Cuando terminás el alta, Alfrebot te deja un enlace tipo{" "}
        <code className="rounded bg-[var(--paper)] px-1.5 py-0.5 text-[0.95em]">
          alfrebot.com.ar/tu-tienda
        </code>
        . También podés pedirle el link desde el menú.
      </>
    ),
  },
  {
    q: "¿Cómo cierro sesión en el chat web?",
    a: (
      <>
        En el chat web, decile <strong>Salir</strong> o usá el botón de tu
        cuenta arriba a la derecha. En WhatsApp no hace falta “cerrar sesión”:
        escribís desde tu número.
      </>
    ),
  },
  {
    q: "¿Qué pasa si no me escuchó el audio?",
    a: (
      <>
        Mandalo de nuevo, un poco más despacio, o escribí lo mismo. También
        podés decir <strong>Cancelar</strong> y volver al menú: no se borra tu
        tienda.
      </>
    ),
  },
  {
    q: "¿Puedo cambiar precio o foto después?",
    a: (
      <>
        Sí. Decile qué producto querés tocar, o pedile «Ver mis productos».
        Podés cambiar precio, foto u ocultar algo que ya no queda.
      </>
    ),
  },
  {
    q: "¿WhatsApp y web son la misma tienda?",
    a: (
      <>
        Sí, cuando los vinculás con el código. Hay dos números distintos: el de{" "}
        <strong>gestión</strong> (desde donde hablás con Alfrebot) y el de{" "}
        <strong>pedidos</strong> (el que ven tus clientes). Configurar pedidos
        no une cuentas; unir la gestión sí.
      </>
    ),
  },
  {
    q: "¿Qué hago si me trabé?",
    a: (
      <>
        Decile <strong>Ayuda</strong> o <strong>Menú</strong> al bot, o volvé a
        esta página. <strong>Cancelar</strong> te saca del paso en el que estás
        sin borrar la tienda.
      </>
    ),
  },
];

export default function AyudaPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-14">
        <p className="fade-in text-[1rem] font-semibold tracking-wide text-[var(--wa)]">
          Ayuda
        </p>
        <h1 className="fade-in mt-2 font-[family-name:var(--font-display)] text-[2rem] font-semibold leading-tight text-[var(--ink)] sm:text-[2.35rem]">
          Te acompañamos paso a paso
        </h1>
        <p className="fade-in mt-4 text-[1.2rem] leading-relaxed text-[var(--muted)] [animation-delay:40ms]">
          Alfrebot arma y maneja tu tienda por chat o audio. Acá está lo
          esencial, en español claro — pensado también si alguien de la familia
          te ayuda a empezar.
        </p>

        <nav
          aria-label="En esta página"
          className="fade-in mt-8 flex flex-wrap gap-x-5 gap-y-2 border-y border-[var(--border)] py-4 text-[1.05rem] [animation-delay:80ms]"
        >
          <a className="text-[var(--primary)] underline-offset-4 hover:underline" href="#empezar">
            Empezar
          </a>
          <a className="text-[var(--primary)] underline-offset-4 hover:underline" href="#armar">
            Armar la tienda
          </a>
          <a className="text-[var(--primary)] underline-offset-4 hover:underline" href="#familia">
            Caso familiar
          </a>
          <a className="text-[var(--primary)] underline-offset-4 hover:underline" href="#whatsapp">
            WhatsApp
          </a>
          <a className="text-[var(--primary)] underline-offset-4 hover:underline" href="#faq">
            Preguntas
          </a>
        </nav>

        <section id="empezar" className="scroll-mt-6 pt-10">
          <h2 className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[var(--ink)]">
            Empezar
          </h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            <li>
              Entrá al{" "}
              <Link
                href="/asistente"
                className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
              >
                asistente en la web
              </Link>{" "}
              con tu email, o abrí el chat por WhatsApp desde{" "}
              <Link
                href="/registro"
                className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
              >
                registro
              </Link>
              .
            </li>
            <li>
              Saludá o tocá el menú. Podés escribir o mandar un{" "}
              <strong className="text-[var(--ink)]">audio</strong>.
            </li>
            <li>
              En cualquier momento: <strong className="text-[var(--ink)]">Menú</strong>{" "}
              para opciones, <strong className="text-[var(--ink)]">Ayuda</strong> si te
              trabás, <strong className="text-[var(--ink)]">Cancelar</strong> para
              volver atrás.
            </li>
          </ol>
        </section>

        <section id="armar" className="scroll-mt-6 pt-12">
          <h2 className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[var(--ink)]">
            Armar la tienda
          </h2>
          <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            Alfrebot te guía: cómo te llamás, nombre del negocio, y después los
            productos.
          </p>
          <ul className="mt-4 space-y-3 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            <li>
              <strong className="text-[var(--ink)]">Productos:</strong> foto →
              nombre → precio. Podés hacerlo por audio.
            </li>
            <li>
              <strong className="text-[var(--ink)]">Colores o estilo:</strong>{" "}
              pedilos en palabras simples («fondo crema», «color verde»).
            </li>
            <li>
              <strong className="text-[var(--ink)]">Pedidos:</strong> decile a qué
              WhatsApp te escriben los clientes (eso no une la cuenta; es solo
              el contacto público).
            </li>
          </ul>
        </section>

        <section
          id="familia"
          className="scroll-mt-6 mt-12 rounded-2xl border border-[var(--border)] bg-[var(--paper)]/80 px-5 py-8 sm:px-7"
        >
          <p className="text-[0.95rem] font-semibold uppercase tracking-wide text-[var(--wa)]">
            Caso familiar
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[var(--ink)]">
            Le armo la tienda a alguien de la familia
          </h2>
          <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            Ejemplo real: <strong className="text-[var(--ink)]">Federico</strong>{" "}
            arma la tienda para su mamá{" "}
            <strong className="text-[var(--ink)]">Nora</strong>. Quien arma no
            tiene que ser quien vende todos los días.
          </p>

          <ol className="mt-6 space-y-5 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[0.95rem] font-semibold text-[var(--primary-fg)]"
              >
                1
              </span>
              <span>
                <strong className="text-[var(--ink)]">Federico</strong> se
                registra con <strong className="text-[var(--ink)]">su</strong>{" "}
                email en el asistente web y completa la tienda: nombre, productos,
                fotos, precios.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[0.95rem] font-semibold text-[var(--primary-fg)]"
              >
                2
              </span>
              <span>
                Deja la tienda <strong className="text-[var(--ink)]">lista</strong>{" "}
                (publicada, con productos visibles). Si hace falta, configura el
                WhatsApp de pedidos de los clientes.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[0.95rem] font-semibold text-[var(--primary-fg)]"
              >
                3
              </span>
              <span>
                En el chat web: menú → <strong className="text-[var(--ink)]">WhatsApp</strong>{" "}
                → <strong className="text-[var(--ink)]">Manejar desde acá</strong>.
                Alfrebot da un código de 6 dígitos (vale 30 minutos).
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[0.95rem] font-semibold text-[var(--primary-fg)]"
              >
                4
              </span>
              <span>
                <strong className="text-[var(--ink)]">Nora</strong>, desde{" "}
                <strong className="text-[var(--ink)]">su</strong> WhatsApp, le
                escribe al bot «Ya tengo cuenta» y el código. Queda la misma
                tienda unida a su celular.
              </span>
            </li>
          </ol>

          <p className="mt-6 text-[1.1rem] leading-relaxed text-[var(--muted)]">
            <strong className="text-[var(--ink)]">Cómo funciona de verdad:</strong>{" "}
            no hay dos dueños con roles. Es{" "}
            <strong className="text-[var(--ink)]">
              la misma cuenta de email (Clerk)
            </strong>{" "}
            más el WhatsApp de quien gestiona día a día. Federico puede seguir
            entrando por la web con su email; Nora maneja por WhatsApp. Ella no
            recibe un login web propio salvo que use el mismo email.
          </p>
        </section>

        <section id="whatsapp" className="scroll-mt-6 pt-12">
          <h2 className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[var(--ink)]">
            WhatsApp: gestión y pedidos
          </h2>
          <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            Son dos cosas distintas:
          </p>
          <ul className="mt-4 space-y-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            <li>
              <strong className="text-[var(--ink)]">Gestión:</strong> el número
              desde el que hablás con Alfrebot para cargar productos o cambiar
              cosas. Se une a la cuenta web con el código «Manejar desde acá».
            </li>
            <li>
              <strong className="text-[var(--ink)]">Pedidos:</strong> el número
              que ven tus clientes en la tienda para escribirte. Se configura en
              el menú «WhatsApp pedidos» y{" "}
              <strong className="text-[var(--ink)]">no</strong> vincula la
              cuenta.
            </li>
          </ul>
          <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            Podés usar el mismo número para las dos cosas, u otro para pedidos.
            El vínculo de gestión es el “pase” operativo a quien vende con el
            celular.
          </p>
        </section>

        <section id="faq" className="scroll-mt-6 pt-12">
          <h2 className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[var(--ink)]">
            Preguntas frecuentes
          </h2>
          <div className="mt-6 divide-y divide-[var(--border)]">
            {faq.map((item) => (
              <details key={item.q} className="group py-4 first:pt-0">
                <summary className="cursor-pointer list-none font-[family-name:var(--font-display)] text-[1.2rem] font-semibold leading-snug text-[var(--ink)] marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start justify-between gap-3">
                    {item.q}
                    <span
                      aria-hidden
                      className="mt-1 shrink-0 text-[var(--wa)] transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-[1.1rem] leading-relaxed text-[var(--muted)]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          id="mas-ayuda"
          className="scroll-mt-6 mt-12 border-t border-[var(--border)] pt-10"
        >
          <h2 className="font-[family-name:var(--font-display)] text-[1.55rem] font-semibold text-[var(--ink)]">
            ¿Necesitás más ayuda?
          </h2>
          <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            Volvé al asistente y pedile Ayuda o Menú. Si algo no cierra, escribinos
            desde el proyecto.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/asistente"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--primary)] px-7 text-[1.1rem] font-semibold text-[var(--primary-fg)] transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              Ir al asistente
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center px-3 text-[1.1rem] font-semibold text-[var(--wa)] underline-offset-4 hover:underline"
            >
              Volver al inicio
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
