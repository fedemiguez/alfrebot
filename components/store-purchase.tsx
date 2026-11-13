"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { formatPriceArs } from "@/lib/format";
import {
  cartItemCount,
  cartSubtotalCents,
  readCart,
  writeCart,
  type CartItem,
} from "@/lib/cart-storage";
import {
  buildWaMeUrl,
  cartCheckoutMessage,
  storeAcceptsWhatsAppOrders,
} from "@/lib/whatsapp-order";
import { WantItButton } from "@/components/want-it-button";
import type { CheckoutMode } from "@/lib/db/schema";
import type { StorePurchaseInfo } from "@/lib/store-purchase";

export type { StorePurchaseInfo };

type CartContextValue = {
  items: CartItem[];
  count: number;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart fuera de StorePurchaseProvider");
  return ctx;
}

export function StorePurchaseProvider({
  store,
  children,
}: {
  store: StorePurchaseInfo;
  children: ReactNode;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const slug = store.storeSlug;

  useEffect(() => {
    setItems(readCart(slug));
    const onStorage = (e: StorageEvent) => {
      if (e.key === `alfrebot-cart:${slug}`) setItems(readCart(slug));
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ storeSlug: string }>).detail;
      if (detail?.storeSlug === slug) setItems(readCart(slug));
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("alfrebot-cart", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("alfrebot-cart", onCustom);
    };
  }, [slug]);

  const persist = useCallback(
    (next: CartItem[]) => {
      setItems(next);
      writeCart(slug, next);
    },
    [slug],
  );

  const add = useCallback(
    (item: Omit<CartItem, "quantity">, qty = 1) => {
      setItems((prev) => {
        const existing = prev.find((p) => p.productId === item.productId);
        const next = existing
          ? prev.map((p) =>
              p.productId === item.productId
                ? { ...p, quantity: p.quantity + qty }
                : p,
            )
          : [...prev, { ...item, quantity: qty }];
        writeCart(slug, next);
        return next;
      });
      setOpen(true);
    },
    [slug],
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      setItems((prev) => {
        const next =
          quantity <= 0
            ? prev.filter((p) => p.productId !== productId)
            : prev.map((p) =>
                p.productId === productId ? { ...p, quantity } : p,
              );
        writeCart(slug, next);
        return next;
      });
    },
    [slug],
  );

  const remove = useCallback(
    (productId: string) => {
      persist(items.filter((p) => p.productId !== productId));
    },
    [items, persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  const value: CartContextValue = {
    items,
    count: cartItemCount(items),
    add,
    setQuantity,
    remove,
    clear,
    open,
    setOpen,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      {store.checkoutMode === "cart" && (
        <CartPanel store={store} />
      )}
    </CartContext.Provider>
  );
}

function CartPanel({ store }: { store: StorePurchaseInfo }) {
  const { items, count, setQuantity, clear, open, setOpen } = useCart();
  const accepts = storeAcceptsWhatsAppOrders(store);
  const subtotal = cartSubtotalCents(items);

  const checkoutHref =
    accepts && items.length > 0
      ? buildWaMeUrl(
          store.phone,
          cartCheckoutMessage({
            lines: items.map((i) => ({
              title: i.title,
              quantity: i.quantity,
              priceCents: i.priceCents,
            })),
            storeName: store.storeName,
            storeSlug: store.storeSlug,
            ownerName: store.ownerName,
          }),
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex min-h-12 items-center gap-2 bg-[var(--primary)] px-4 py-3 font-[family-name:var(--font-display)] text-[1.05rem] font-semibold text-white shadow-md"
        aria-label={`Ver pedido${count ? `, ${count} productos` : ""}`}
      >
        Pedido
        {count > 0 && (
          <span className="inline-flex min-w-7 justify-center bg-white/20 px-2 py-0.5 text-[16px]">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--ink)]/40"
            aria-label="Cerrar carrito"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col border border-[var(--border)] bg-[var(--bg)] px-5 pb-6 pt-5 shadow-lg sm:mx-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="cart-title"
                className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]"
              >
                Tu pedido
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 min-w-11 px-2 text-[17px] text-[var(--muted)] hover:text-[var(--primary)]"
              >
                Cerrar
              </button>
            </div>

            <p className="mt-3 text-[1.1rem] leading-relaxed text-[var(--muted)]">
              Revisá la lista y tocá Pedir por WhatsApp. El pago se coordina
              después con el dueño.
            </p>

            {items.length === 0 ? (
              <p className="mt-6 text-[1.1rem] text-[var(--muted)]">
                Todavía no agregaste nada. Volvé al catálogo y tocá Agregar al
                pedido.
              </p>
            ) : (
              <ul className="mt-5 flex-1 space-y-4 overflow-y-auto">
                {items.map((item) => (
                  <li
                    key={item.productId}
                    className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4"
                  >
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-display)] text-[18px] font-semibold text-[var(--ink)]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-[16px] text-[var(--primary)]">
                        {formatPriceArs(item.priceCents)}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="min-h-11 min-w-11 border border-[var(--border)] text-[18px]"
                          onClick={() =>
                            setQuantity(item.productId, item.quantity - 1)
                          }
                          aria-label="Menos"
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center text-[18px]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="min-h-11 min-w-11 border border-[var(--border)] text-[18px]"
                          onClick={() =>
                            setQuantity(item.productId, item.quantity + 1)
                          }
                          aria-label="Más"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <p className="shrink-0 font-[family-name:var(--font-display)] text-[18px] font-bold text-[var(--ink)]">
                      {item.priceCents == null
                        ? "—"
                        : formatPriceArs(item.priceCents * item.quantity)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {items.length > 0 && (
              <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
                <p className="flex justify-between font-[family-name:var(--font-display)] text-[20px] font-semibold">
                  <span>Total</span>
                  <span className="text-[var(--primary)]">
                    {subtotal == null ? "A confirmar" : formatPriceArs(subtotal)}
                  </span>
                </p>
                {!accepts ? (
                  <p className="text-[17px] text-[var(--muted)]">
                    Esta tienda todavía no tiene número para pedidos. Pedile a{" "}
                    {store.ownerName || "el dueño"} que lo active en alfrebot.
                  </p>
                ) : (
                  <a
                    href={checkoutHref!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-wa w-full"
                    onClick={() => setOpen(false)}
                  >
                    Pedir por WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  onClick={clear}
                  className="min-h-11 w-full text-center text-[16px] text-[var(--muted)] hover:text-[var(--primary)]"
                >
                  Vaciar pedido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function ProductBuyActions({
  store,
  product,
  layout = "stack",
  ctaLabel = null,
}: {
  store: StorePurchaseInfo;
  product: {
    id: string;
    title: string;
    priceCents: number | null;
    imageUrl: string | null;
    inStock: boolean;
  };
  layout?: "stack" | "inline";
  /** Microcopy Ikt (ej. consultar prenda); null = “Lo quiero”. */
  ctaLabel?: string | null;
}) {
  const accepts = storeAcceptsWhatsAppOrders(store);
  const wrap =
    layout === "inline"
      ? "mt-3 flex flex-wrap items-center gap-2"
      : "mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap";
  const iktWrap = ctaLabel
    ? layout === "inline"
      ? "mt-3 flex w-full"
      : "mt-4 flex w-full"
    : wrap;

  if (store.checkoutMode === "cart") {
    return (
      <div className={wrap}>
        <AddToCartButton store={store} product={product} />
        {!accepts && (
          <p className="w-full text-[16px] text-[var(--muted)]">
            Todavía no se puede mandar por WhatsApp: falta el número de pedidos.
          </p>
        )}
      </div>
    );
  }

  if (!accepts) return null;

  return (
    <div className={iktWrap}>
      <WantItButton
        phone={store.phone}
        showPhone={store.showPhone}
        productTitle={product.title}
        priceCents={product.priceCents}
        storeName={store.storeName}
        storeSlug={store.storeSlug}
        ownerName={store.ownerName}
        disabled={!product.inStock}
        label={ctaLabel}
        className={`${ctaLabel ? "w-full" : ""} ${!product.inStock ? "opacity-50" : ""}`.trim()}
      />
    </div>
  );
}

function AddToCartButton({
  store,
  product,
}: {
  store: StorePurchaseInfo;
  product: {
    id: string;
    title: string;
    priceCents: number | null;
    imageUrl: string | null;
    inStock: boolean;
  };
}) {
  const cart = useContext(CartContext);
  if (!cart) return null;

  return (
    <button
      type="button"
      disabled={!product.inStock}
      onClick={() =>
        cart.add({
          productId: product.id,
          title: product.title,
          priceCents: product.priceCents,
          imageUrl: product.imageUrl,
        })
      }
      className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {product.inStock ? "Agregar al pedido" : "Agotado"}
    </button>
  );
}

/**
 * Instructivo mínimo para compradores (Norma): cómo pedir.
 * Cambia según Lo quiero (WhatsApp) o pedido con carrito.
 */
export function HowToOrderNote({
  checkoutMode,
  compact = false,
}: {
  checkoutMode: CheckoutMode;
  /** Variante más corta (ficha de producto / panel). */
  compact?: boolean;
}) {
  if (compact) {
    const text =
      checkoutMode === "cart"
        ? "Sumalo al pedido. Cuando termines, abrí Pedido y mandalo por WhatsApp."
        : "Tocá el botón de WhatsApp y te abre el chat para pedirlo.";
    return (
      <p className="store-howto-compact mt-4" role="note">
        {text}
      </p>
    );
  }

  const steps =
    checkoutMode === "cart"
      ? [
          "Elegí lo que querés",
          "Tocá Agregar al pedido",
          "Abrí Pedido y mandalo por WhatsApp",
        ]
      : [
          "Elegí el producto",
          "Tocá el botón de WhatsApp",
          "Confirmá el pedido por el chat",
        ];

  return (
    <div
      className="mt-5 rounded border border-[var(--border)] bg-[var(--paper)] px-4 py-4"
      role="note"
      aria-labelledby="how-to-order-title"
    >
      <p
        id="how-to-order-title"
        className="font-[family-name:var(--font-display)] text-[1.2rem] font-semibold text-[var(--ink)]"
      >
        Cómo pedir
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-6 text-[1.15rem] leading-relaxed text-[var(--ink)]">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

/** Banner corto cuando no hay contacto público en modo whatsapp. */
export function NoPublicPhoneNote({
  showPhone,
  checkoutMode,
  ownerName,
}: {
  showPhone: boolean;
  checkoutMode: CheckoutMode;
  ownerName?: string | null;
}) {
  if (showPhone) return null;
  if (checkoutMode === "cart") return null;
  return (
    <p className="mt-4 text-[1.05rem] text-[var(--muted)]">
      {ownerName || "El dueño"} todavía no cargó un número para pedidos por
      WhatsApp.
    </p>
  );
}

export function StoreHomeLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/${slug}`}
      className="btn btn-secondary mb-8 inline-flex min-h-12"
    >
      Volver
    </Link>
  );
}
