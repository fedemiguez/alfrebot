import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthSignUpForm } from "@/components/auth-clerk-forms";
import { SiteHeader } from "@/components/site-header";
import { isClerkConfigured } from "@/lib/clerk";

export const metadata: Metadata = {
  title: "Registrarse",
  description: "Creá tu cuenta con Google o email para armar la tienda en la web.",
};

function SignUpFallback() {
  return (
    <div className="w-full max-w-md border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
      Cargando registro…
    </div>
  );
}

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-lg flex-1 px-5 py-12">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Registro en la web
          </h1>
          <p className="mt-4 text-[var(--muted)]">
            El acceso con email todavía no está configurado en este entorno.
          </p>
          <Link href="/registro" className="btn btn-primary mt-8 inline-flex">
            Ir a registro por WhatsApp
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="fade-in mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-12">
        <p className="mb-6 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Armá tu tienda en la web
        </h1>
        <p className="mb-8 max-w-lg text-[1.15rem] leading-relaxed text-[var(--muted)]">
          Entrá con Google o con tu email. Después usás el mismo ayudante que por
          WhatsApp y cargás el número de pedidos para el catálogo.
        </p>
        <Suspense fallback={<SignUpFallback />}>
          <AuthSignUpForm />
        </Suspense>
        <p className="mt-8 text-[1.05rem] text-[var(--muted)]">
          ¿Preferís WhatsApp?{" "}
          <Link
            href="/registro"
            className="inline-flex min-h-11 items-center font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
          >
            Empezá con tu celular
          </Link>
          .
        </p>
      </main>
    </>
  );
}
