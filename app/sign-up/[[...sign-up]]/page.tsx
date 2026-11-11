import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import { SiteHeader } from "@/components/site-header";
import { isClerkConfigured } from "@/lib/clerk";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Registrarse",
  description: "Creá tu cuenta con email para armar la tienda en la web.",
};

function SignUpFallback() {
  return (
    <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
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
            Registro por email
          </h1>
          <p className="mt-4 text-[var(--muted)]">
            Clerk todavía no está configurado en este entorno. En el preview de
            Vercel funciona con las keys del Marketplace.
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
        <h1 className="mb-2 self-start font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Armá tu tienda en la web
        </h1>
        <p className="mb-8 self-start max-w-lg text-[var(--muted)]">
          Registrate con tu email. Después vas al mismo ayudante que por
          WhatsApp, y podés cargar el WhatsApp de pedidos para el catálogo.
        </p>
        <Suspense fallback={<SignUpFallback />}>
          <SignUp
            forceRedirectUrl="/probar"
            signInUrl="/sign-in"
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
