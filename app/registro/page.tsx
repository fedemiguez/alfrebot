import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { RegistroForm } from "@/components/registro-form";

export const metadata: Metadata = {
  title: "Armá tu tienda",
  description: "Ingresá tu WhatsApp y abrí el chat con alfrebot.",
};

export default function RegistroPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12">
        <p className="mb-6 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <RegistroForm />
      </main>
    </>
  );
}
