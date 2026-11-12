"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

type SignupResult = {
  ok: boolean;
  phone?: string;
  code?: string;
  waLink?: string;
  forceSimulator?: boolean;
  reason?: string;
  error?: string;
};

/** Solo camino WhatsApp. El camino web va por Clerk (/sign-up). */
export function RegistroForm() {
  const [localNumber, setLocalNumber] = useState("");
  const [step, setStep] = useState<"phone" | "open">("phone");
  const [result, setResult] = useState<SignupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => {
    const digits = localNumber.replace(/\D/g, "");
    return digits ? `+54 9 ${digits}` : "+54 9 …";
  }, [localNumber]);

  function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: localNumber }),
      });
      const data = (await res.json()) as SignupResult;
      if (!res.ok || !data.ok) {
        setError(data.error || "No pudimos validar el número.");
        return;
      }
      setResult(data);
      setStep("open");
    });
  }

  if (step === "open" && result) {
    if (result.forceSimulator) {
      return (
        <div className="fade-in max-w-lg">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
            WhatsApp todavía no está abierto
          </h1>
          <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
            {result.reason ||
              "Por ahora este número no puede hablar con el bot por WhatsApp."}
          </p>
          <Link href="/sign-up" className="btn btn-primary mt-8 inline-flex">
            Armá la tienda en la web con email
          </Link>
          <p className="mt-6 text-[1.05rem] text-[var(--muted)]">
            Número: {result.phone}
          </p>
        </div>
      );
    }

    return (
      <div className="fade-in max-w-lg">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Abrí WhatsApp
        </h1>
        <p className="mt-4 text-[1.15rem] leading-relaxed text-[var(--muted)]">
          Tocá el botón verde y después <strong>Enviar</strong>. El bot te va a
          pedir tu nombre.
        </p>
        <a href={result.waLink} className="btn btn-wa mt-8 inline-flex w-full sm:w-auto">
          Abrir WhatsApp
        </a>
        <p className="mt-6 text-[1.05rem]">
          <Link
            href="/sign-up"
            className="inline-flex min-h-11 items-center text-[var(--primary)] underline-offset-2 hover:underline"
          >
            Prefiero armarla en la web con email
          </Link>
        </p>
        <p className="mt-4 text-[1.05rem] text-[var(--muted)]">
          Número: {result.phone}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onContinue} className="fade-in max-w-lg">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
        Tu WhatsApp
      </h1>
      <p className="mt-3 text-[1.15rem] leading-relaxed text-[var(--muted)]">
        Con el +54 fijo. Ejemplo: 11 5555 1234. El bot te escribe a ese número.
      </p>
      <label className="mt-8 block">
        <span className="mb-2 block text-[17px] font-semibold">Celular</span>
        <div className="flex items-center gap-2">
          <span className="rounded border border-[var(--border)] bg-white px-3 py-3 font-medium">
            +54 9
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="11 5555 1234"
            value={localNumber}
            onChange={(e) => setLocalNumber(e.target.value)}
            className="min-h-12 w-full flex-1 rounded border border-[var(--border)] bg-white px-4 text-[1.1rem] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
            required
          />
        </div>
        <span className="mt-2 block text-[15px] text-[var(--muted)]">
          Se va a usar como {preview}
        </span>
      </label>
      {error && (
        <p className="mt-4 text-[var(--primary)]" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-8" disabled={pending}>
        {pending ? "Un segundo…" : "Seguir"}
      </button>
    </form>
  );
}
