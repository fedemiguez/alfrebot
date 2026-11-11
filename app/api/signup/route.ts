import { createSignupIntent } from "@/lib/db/repos";
import {
  isMetaTestMode,
  metaBotNumber,
  metaVerifiedNumbers,
} from "@/lib/env";


import { normalizeArMobileE164 } from "@/lib/phone";

function normalizeArPhone(input: string): string | null {
  return normalizeArMobileE164(input);
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
