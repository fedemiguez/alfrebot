import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { SimulatorChat } from "@/components/simulator-chat";
import { isWhatsAppContactPhone } from "@/lib/phone";
import { metaBotNumber } from "@/lib/env";

export const metadata: Metadata = {
  title: "Armar en la web",
  description: "Armá tu tienda en el chat web con el mismo motor de alfrebot.",
};

async function ProbarBody({
  searchParams,
}: {
  searchParams: PageProps<"/probar">["searchParams"];
}) {
  const params = await searchParams;
  const phoneParam = typeof params.phone === "string" ? params.phone : undefined;
  const codeParam = typeof params.code === "string" ? params.code : undefined;

  const initialPhone = phoneParam?.startsWith("+")
    ? phoneParam
    : phoneParam
      ? `+${phoneParam.replace(/\D/g, "")}`
      : undefined;

  if (!initialPhone || !isWhatsAppContactPhone(initialPhone)) {
    redirect("/registro?canal=web");
  }

  const botDigits = metaBotNumber();
  const continueWaLink = codeParam
    ? `https://wa.me/${botDigits}?text=${encodeURIComponent(
        `Hola! Quiero armar mi tienda. Código ${codeParam}`,
      )}`
    : `https://wa.me/${botDigits}`;

  return (
    <SimulatorChat
      initialPhone={initialPhone}
      initialCode={codeParam}
      continueWaLink={continueWaLink}
    />
  );
}

export default function ProbarPage(props: PageProps<"/probar">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Armá tu tienda en la web
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Mismo ayudante que por WhatsApp. Registrás la tienda, mandás fotos y
          publicás. Cuando quieras, seguís desde el celular.
        </p>
        <div className="mt-8">
          <Suspense
            fallback={
              <div className="rounded-lg border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
                Cargando el chat…
              </div>
            }
          >
            <ProbarBody searchParams={props.searchParams} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
