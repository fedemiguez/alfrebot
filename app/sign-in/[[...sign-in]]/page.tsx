import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthSignInForm } from "@/components/auth-clerk-forms";
import { SiteHeader } from "@/components/site-header";
import { isClerkConfigured } from "@/lib/clerk";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entrá con Google o email para seguir armando la tienda en la web.",
};

function SignInFallback() {
  return (
    <div className="w-full max-w-md border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
      Cargando…
    </div>
  );
}

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-lg flex-1 px-5 py-12">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Entrar
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
          Entrar
        </h1>
        <p className="mb-8 max-w-lg text-[1.15rem] leading-relaxed text-[var(--muted)]">
          Continuá con Google o con el email de tu cuenta.
        </p>
        <Suspense fallback={<SignInFallback />}>
          <AuthSignInForm />
        </Suspense>
        <p className="mt-8 text-[1.05rem] text-[var(--muted)]">
          ¿Todavía no tenés cuenta?{" "}
          <Link
            href="/sign-up"
            className="inline-flex min-h-11 items-center font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
          >
            Creá una
          </Link>
          .
        </p>
      </main>
    </>
  );
}
