"use client";

import { useActionState } from "react";
import { loginAdminAction } from "./actions";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(loginAdminAction, null);

  return (
    <form action={action} className="mx-auto w-full max-w-md space-y-5">
      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-[16px] font-semibold text-[var(--ink)]"
        >
          Clave de admin
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full border border-[var(--border)] bg-white px-4 py-3 text-[18px] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          placeholder="ADMIN_SECRET"
        />
      </div>
      {state?.error && (
        <p className="text-[16px] text-[var(--primary)]" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
