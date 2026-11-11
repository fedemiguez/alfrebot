import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { RegistroForm } from "@/components/registro-form";

export const metadata: Metadata = {
  title: "Armá tu tienda",
  description:
    "Ingresá tu celular y elegí armar la tienda por WhatsApp o en la web.",
};

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: PageProps<"/registro">["searchParams"];
}) {
  const params = await searchParams;
  const canal = typeof params.canal === "string" ? params.canal : undefined;
  const preferredChannel =
    canal === "web" ? "web" : canal === "whatsapp" ? "whatsapp" : "choose";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12">
        <p className="mb-6 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <RegistroForm preferredChannel={preferredChannel} />
      </main>
    </>
  );
}
