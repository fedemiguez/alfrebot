import { Suspense } from "react";
import Link from "next/link";
import { adminSecretConfigured, isAdminAuthenticated } from "@/lib/admin-auth";
import { formatChannelIdentityLabel } from "@/lib/channel-identity";
import { listStores } from "@/lib/db/repos";
import { AdminLoginForm } from "./login-form";
import { logoutAdminAction } from "./actions";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function AdminFallback() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <p className="text-[var(--muted)]">Cargando panel…</p>
    </main>
  );
}

async function AdminBody() {
  if (!adminSecretConfigured()) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-12">
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Panel admin
        </h1>
        <p className="mt-4 text-[var(--muted)]">
          Configurá <code className="text-[var(--ink)]">ADMIN_SECRET</code> en el
          entorno (ver <code className="text-[var(--ink)]">.env.example</code>)
          para habilitar el acceso.
        </p>
      </main>
    );
  }

  const authed = await isAdminAuthenticated();
  if (!authed) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-12">
        <p className="mb-2 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <h1 className="mb-8 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Panel admin
        </h1>
        <AdminLoginForm />
      </main>
    );
  }

  const stores = await listStores();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
            alfrebot
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Usuarios
          </h1>
          <p className="mt-2 text-[17px] text-[var(--muted)]">
            {stores.length === 0
              ? "Todavía no hay tiendas registradas."
              : `${stores.length} tienda${stores.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <form action={logoutAdminAction}>
          <button
            type="submit"
            className="text-[16px] text-[var(--muted)] underline-offset-2 hover:text-[var(--primary)] hover:underline"
          >
            Salir
          </button>
        </form>
      </div>

      <ul className="mt-8 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {stores.map((store) => (
          <li key={store.id}>
            <Link
              href={`/admin/${store.id}`}
              className="flex flex-col gap-1 py-4 transition-colors hover:bg-[var(--paper)]/60 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-display)] text-[20px] font-semibold text-[var(--ink)]">
                  {store.ownerName || "Sin nombre"}
                  {store.isDemo ? (
                    <span className="ml-2 text-[14px] font-medium text-[var(--muted)]">
                      demo
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[16px] text-[var(--muted)]">
                  {formatChannelIdentityLabel(store)}
                  {store.name ? ` · ${store.name}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-[15px] text-[var(--muted)]">
                {formatDate(store.createdAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {stores.length === 0 && (
        <p className="mt-6 text-[var(--muted)]">
          Cuando alguien se registre por WhatsApp o en la web, aparece acá.
        </p>
      )}
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminFallback />}>
      <AdminBody />
    </Suspense>
  );
}
