"use client";

import {
  buildWaMeUrl,
  productWantMessage,
  storeAcceptsWhatsAppOrders,
} from "@/lib/whatsapp-order";

type Props = {
  phone: string;
  showPhone: boolean;
  productTitle: string;
  priceCents: number | null | undefined;
  storeName?: string | null;
  storeSlug?: string | null;
  ownerName?: string | null;
  className?: string;
  disabled?: boolean;
};

export function WantItButton({
  phone,
  showPhone,
  productTitle,
  priceCents,
  storeName,
  storeSlug,
  ownerName,
  className = "",
  disabled = false,
}: Props) {
  if (!storeAcceptsWhatsAppOrders({ showPhone, phone })) {
    return null;
  }

  const href = buildWaMeUrl(
    phone,
    productWantMessage({
      productTitle,
      priceCents,
      storeName,
      storeSlug,
      ownerName,
    }),
  );

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn-wa ${disabled ? "pointer-events-none opacity-50" : ""} ${className}`}
      aria-disabled={disabled || undefined}
    >
      Lo quiero
    </a>
  );
}
