import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { formatPhoneDisplay, formatPriceArs } from "@/lib/format";
import { getStoreById, listProductsByStore } from "@/lib/db/repos";
import {
  deleteDemoStoreAction,
  deleteProductAction,
  logoutAdminAction,
  toggleProductHiddenAction,
  toggleProductStockAction,
} from "../actions";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

async function AdminStoreBody({
  params,
}: {
  params: PageProps<"/admin/[storeId]">["params"];
}) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const { storeId } = await params;
  const store = await getStoreById(storeId);
  if (!store) notFound();

  const products = await listProductsByStore(store.id, { includeHidden: true });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin"
          className="text-[16px] text-[var(--muted)] hover:text-[var(--primary)]"
        >
          ← Usuarios
        </Link>
        <form action={logoutAdminAction}>
          <button
            type="submit"
            className="text-[16px] text-[var(--muted)] underline-offset-2 hover:text-[var(--primary)] hover:underline"
          >
            Salir
          </button>
        </form>
      </div>

      <header className="mt-6">
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--primary)]">
          alfrebot
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
          {store.ownerName || "Sin nombre"}
        </h1>
        <dl className="mt-4 grid gap-2 text-[17px] text-[var(--muted)] sm:grid-cols-2">
          <div>
            <dt className="text-[14px] uppercase tracking-wide">Teléfono</dt>
            <dd className="text-[var(--ink)]">{formatPhoneDisplay(store.phone)}</dd>
          </div>
          <div>
            <dt className="text-[14px] uppercase tracking-wide">Alta</dt>
            <dd className="text-[var(--ink)]">{formatDate(store.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[14px] uppercase tracking-wide">Tienda</dt>
            <dd className="text-[var(--ink)]">{store.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-[14px] uppercase tracking-wide">Estado</dt>
            <dd className="text-[var(--ink)]">
              {store.status}
              {store.isDemo ? " · demo" : ""}
            </dd>
          </div>
        </dl>

        {store.slug ? (
          <p className="mt-4">
            <Link
              href={`/${store.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              Ver /{store.slug}
            </Link>
          </p>
        ) : (
          <p className="mt-4 text-[16px] text-[var(--muted)]">
            Todavía no tiene slug público.
          </p>
        )}
      </header>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
          Productos
        </h2>
        <p className="mt-1 text-[16px] text-[var(--muted)]">
          {products.length === 0
            ? "Sin productos."
            : `${products.length} producto${products.length === 1 ? "" : "s"}`}
        </p>

        <ul className="mt-6 space-y-6">
          {products.map((product) => (
            <li
              key={product.id}
              className="border border-[var(--border)] bg-white/70 p-4 sm:p-5"
            >
              <div className="flex gap-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden border border-[var(--border)] bg-[var(--paper)] sm:h-24 sm:w-24">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized={
                        product.imageUrl.startsWith("/") ||
                        product.imageUrl.startsWith("data:")
                      }
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-[13px] text-[var(--muted)]">
                      Sin foto
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-[family-name:var(--font-display)] text-[20px] font-semibold leading-snug text-[var(--ink)]">
                    {product.title}
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--primary)]">
                    {formatPriceArs(product.priceCents)}
                  </p>
                  <p className="mt-1 text-[15px] text-[var(--muted)]">
                    {product.inStock ? "En stock" : "Agotado"}
                    {product.hidden ? " · oculto" : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={toggleProductStockAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="storeId" value={store.id} />
                  <button
                    type="submit"
                    className="border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-[15px] font-medium text-[var(--ink)] hover:border-[var(--primary)]"
                  >
                    {product.inStock ? "Marcar agotado" : "Marcar en stock"}
                  </button>
                </form>
                <form action={toggleProductHiddenAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="storeId" value={store.id} />
                  <button
                    type="submit"
                    className="border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-[15px] font-medium text-[var(--ink)] hover:border-[var(--primary)]"
                  >
                    {product.hidden ? "Mostrar" : "Ocultar"}
                  </button>
                </form>
                <form action={deleteProductAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="storeId" value={store.id} />
                  <button
                    type="submit"
                    className="border border-[var(--border)] px-3 py-2 text-[15px] font-medium text-[var(--primary)] hover:bg-[var(--paper)]"
                  >
                    Borrar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {store.isDemo && (
        <section className="mt-12 border-t border-[var(--border)] pt-8">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
            Tienda demo
          </h2>
          <p className="mt-2 text-[16px] text-[var(--muted)]">
            Se puede borrar porque viene del simulador.
          </p>
          <form action={deleteDemoStoreAction} className="mt-4">
            <input type="hidden" name="storeId" value={store.id} />
            <button type="submit" className="btn btn-secondary">
              Borrar tienda demo
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

export default function AdminStorePage(props: PageProps<"/admin/[storeId]">) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
          <p className="text-[var(--muted)]">Cargando tienda…</p>
        </main>
      }
    >
      <AdminStoreBody params={props.params} />
    </Suspense>
  );
}
