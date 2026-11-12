import type { Metadata } from "next";
import { Suspense } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SimulatorChat } from "@/components/simulator-chat";
import { clerkIdentityKey, isClerkConfigured } from "@/lib/clerk";
import { metaBotNumber } from "@/lib/env";

export const metadata: Metadata = {
  title: "Asistente",
  description: "Armá tu tienda en el chat web con el mismo asistente de alfrebot.",
};

async function AsistenteBody() {
  if (!isClerkConfigured()) {
    redirect("/sign-up");
  }

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-up");
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    undefined;
  const identity = clerkIdentityKey(userId);
  const botDigits = metaBotNumber();
  const continueWaLink = `https://wa.me/${botDigits}?text=${encodeURIComponent(
    "Hola! Quiero seguir armando mi tienda desde la web.",
  )}`;

  return (
    <SimulatorChat
      initialPhone={identity}
      ownerEmail={email}
      continueWaLink={continueWaLink}
      identityMode="clerk"
    />
  );
}

export default function AsistentePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
          Armá tu tienda en la web
        </h1>
        <p className="mt-3 max-w-2xl text-[1.15rem] leading-relaxed text-[var(--muted)]">
          Mismo ayudante que por WhatsApp. Ya tenés cuenta con email; cuando el
          bot te pida el WhatsApp de pedidos, ese número es el que ven tus
          clientes.
        </p>
        <div className="mt-8">
          <Suspense
            fallback={
              <div className="rounded-lg border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
                Cargando el chat…
              </div>
            }
          >
            <AsistenteBody />
          </Suspense>
        </div>
      </main>
    </>
  );
}
