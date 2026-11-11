import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { SimulatorChat } from "@/components/simulator-chat";

export const metadata: Metadata = {
  title: "Probar",
  description: "Simulador de WhatsApp con el mismo motor de alfrebot.",
};

async function ProbarBody({
  searchParams,
}: {
  searchParams: PageProps<"/probar">["searchParams"];
}) {
  const params = await searchParams;
  const phoneParam = typeof params.phone === "string" ? params.phone : undefined;
  const initialPhone = phoneParam?.startsWith("+")
    ? phoneParam
    : phoneParam
      ? `+${phoneParam.replace(/\D/g, "")}`
      : undefined;

  return <SimulatorChat initialPhone={initialPhone} />;
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
          Probalo sin WhatsApp
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Mismo motor que el bot real. Podés registrar la tienda, mandar una foto y
          publicarla.
        </p>
        <div className="mt-8">
          <Suspense
            fallback={
              <div className="rounded-lg border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
                Cargando simulador…
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
