import { createSignupIntent } from "@/lib/db/repos";
import {
  isMetaTestMode,
  metaBotNumber,
  metaVerifiedNumbers,
} from "@/lib/env";


function normalizeArPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  // Accept 10-digit local (11…) or already with 54/549
  if (digits.startsWith("549") && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith("54") && digits.length >= 11) {
    // Ensure mobile 9 after 54 when missing for AR mobiles
    if (!digits.startsWith("549") && digits.length === 12) {
      return `+54${digits.slice(2)}`;
    }
    return `+${digits}`;
  }
  if (digits.length === 10) return `+549${digits}`;
  if (digits.length === 11 && digits.startsWith("9")) return `+54${digits}`;
  return null;
}

function randomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(req: Request) {
  const body = (await req.json()) as { phone?: string };
  const phone = normalizeArPhone(body.phone ?? "");
  if (!phone) {
    return Response.json(
      { ok: false, error: "Número inválido. Usá tu celular con código de área." },
      { status: 400 },
    );
  }

  const code = randomCode();
  await createSignupIntent(phone, code);

  const bot = metaBotNumber();
  const text = encodeURIComponent(
    `Hola! Quiero armar mi tienda. Código ${code}`,
  );
  const waLink = `https://wa.me/${bot}?text=${text}`;

  let forceSimulator = false;
  let reason: string | undefined;
  if (isMetaTestMode()) {
    const verified = metaVerifiedNumbers();
    const digits = phone.replace(/\D/g, "");
    const allowed =
      verified.length === 0
        ? false
        : verified.some((v) => {
            const vd = v.replace(/\D/g, "");
            return vd === digits || vd === digits.replace(/^549/, "54");
          });
    if (!allowed) {
      forceSimulator = true;
      reason =
        "Esta versión de prueba todavía no está abierta a todos. Probala acá sin WhatsApp.";
    }
  }

  return Response.json({
    ok: true,
    phone,
    code,
    waLink,
    forceSimulator,
    reason,
    probarPath: `/probar?phone=${encodeURIComponent(phone)}`,
  });
}
