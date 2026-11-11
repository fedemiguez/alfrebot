import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { RegistroForm } from "@/components/registro-form";

export const metadata: Metadata = {
  title: "Armá tu tienda",
  description:
    "Ingresá tu celular y elegí armar la tienda por WhatsApp o en la web.",
};

async function RegistroBody({
  searchParams,
}: {
  searchParams: PageProps<"/registro">["searchParams"];
}) {
  const params = await searchParams;
  const canal = typeof params.canal === "string" ? params.canal : undefined;
  const preferredChannel =
    canal === "web" ? "web" : canal === "whatsapp" ? "whatsapp" : "choose";

  return <RegistroForm preferredChannel={preferredChannel} />;
}

export default function RegistroPage(props: PageProps<"/registro">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12">
        <p className="mb-6 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <Suspense
          fallback={
            <div className="max-w-lg rounded-lg border border-[var(--border)] bg-white/80 p-8 text-[var(--muted)]">
              Cargando…
            </div>
          }
        >
          <RegistroBody searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}
