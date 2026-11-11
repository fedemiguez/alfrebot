import type { Metadata } from "next";
import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { SiteHeader } from "@/components/site-header";
import { isClerkConfigured } from "@/lib/clerk";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entrá con tu email para seguir armando la tienda en la web.",
};

function SignInFallback() {
  return (
    <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
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
            Clerk todavía no está configurado en este entorno.
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
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-5 py-12">
        <p className="mb-6 self-start font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <h1 className="mb-8 self-start font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Entrar
        </h1>
        <Suspense fallback={<SignInFallback />}>
          <SignIn
            forceRedirectUrl="/probar"
            signUpUrl="/sign-up"
            appearance={{
              elements: {
                rootBox: "w-full max-w-md",
                card: "shadow-none border border-[var(--border)]",
              },
            }}
          />
        </Suspense>
      </main>
    </>
  );
}
