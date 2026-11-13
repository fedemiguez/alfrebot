"use client";

import { useActionState, useState } from "react";
import { deleteStoreAction } from "./actions";

type Props = {
  storeId: string;
  /** Texto exacto que hay que escribir (slug preferido, si no nombre, si no id). */
  confirmPhrase: string;
  /** Etiqueta de qué se pide (slug / nombre / id). */
  confirmLabel: "slug" | "nombre" | "id";
  storeName: string | null;
  productCount: number;
};

export function DeleteStoreForm({
  storeId,
  confirmPhrase,
  confirmLabel,
  storeName,
  productCount,
}: Props) {
  const [state, action, pending] = useActionState(deleteStoreAction, null);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === confirmPhrase;
  const labelText =
    confirmLabel === "slug"
      ? "slug"
      : confirmLabel === "nombre"
        ? "nombre"
        : "id";

  return (
    <section className="mt-12 border-t border-[var(--border)] pt-8">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
        Zona de peligro
      </h2>
      <p className="mt-2 text-[16px] leading-relaxed text-[var(--muted)]">
        Borrar{" "}
        <span className="font-medium text-[var(--ink)]">
          {storeName?.trim() || "esta tienda"}
        </span>{" "}
        elimina de forma permanente productos
        {productCount > 0 ? ` (${productCount})` : ""}, fotos e iconos en Blob,
        el estado del bot / conversación, códigos de vínculo WhatsApp y la fila
        de la tienda. No se puede deshacer.
      </p>

      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="storeId" value={storeId} />
        <div>
          <label
            htmlFor="delete-store-confirm"
            className="mb-2 block text-[16px] font-semibold text-[var(--ink)]"
          >
            Para confirmar, escribí el {labelText}:{" "}
            <code className="font-mono text-[15px] text-[var(--primary)]">
              {confirmPhrase}
            </code>
          </label>
          <input
            id="delete-store-confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            spellCheck={false}
            required
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmPhrase}
            className="min-h-12 w-full max-w-md border border-[var(--border)] bg-white px-4 py-3 text-[17px] text-[var(--ink)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>
        {state?.error ? (
          <p className="text-[16px] text-[var(--primary)]" role="alert">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || !matches}
          className="min-h-11 border border-[var(--primary)] bg-[var(--primary)] px-4 py-2 text-[16px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Borrando…" : "Borrar tienda y todo lo relacionado"}
        </button>
      </form>
    </section>
  );
}
