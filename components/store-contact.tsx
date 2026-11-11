import { buildWaMeUrl, formatPhoneDisplay } from "@/lib/phone";

/** Pie / línea de contacto con número legible y link a WhatsApp. */
export function StoreContactLine({
  ownerName,
  phoneE164,
  prefix = "¿Te gustó algo? Escribile a",
}: {
  ownerName?: string | null;
  phoneE164: string;
  prefix?: string;
}) {
  const display = formatPhoneDisplay(phoneE164);
  const href = buildWaMeUrl(
    phoneE164,
    `¡Hola${ownerName ? ` ${ownerName}` : ""}! Vi tu tienda en alfrebot.`,
  );

  return (
    <p>
      {prefix} {ownerName || "la dueña"} al{" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[var(--wa)] underline-offset-2 hover:underline"
      >
        {display}
      </a>
      .
    </p>
  );
}
