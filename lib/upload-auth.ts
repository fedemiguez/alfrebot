import { timingSafeEqual } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerk";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Secreto para llamadas server-side a POST /api/upload (nunca en el browser). */
export function uploadSecretConfigured(): boolean {
  return Boolean(process.env.UPLOAD_SECRET?.trim());
}

/**
 * Autoriza upload HTTP:
 * - sesión Clerk válida (simulador en /asistente), o
 * - `Authorization: Bearer <UPLOAD_SECRET>` (server-side).
 *
 * Meta/bot no usan esta ruta: suben vía `lib/blob` en el servidor.
 */
export async function authorizeUploadRequest(
  req: Request,
): Promise<{ ok: true } | { ok: false; status: 401; error: string }> {
  const secret = process.env.UPLOAD_SECRET?.trim();
  if (secret) {
    const header = req.headers.get("authorization")?.trim() ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const token = match?.[1]?.trim();
    if (token && safeEqual(token, secret)) {
      return { ok: true };
    }
  }

  if (isClerkConfigured()) {
    const { userId } = await auth();
    if (userId) return { ok: true };
    return {
      ok: false,
      status: 401,
      error: "Tenés que entrar con tu email para subir archivos.",
    };
  }

  return {
    ok: false,
    status: 401,
    error: "No autorizado para subir archivos.",
  };
}

/** Header Bearer para callers server-side que peguen a /api/upload. */
export function uploadAuthorizationHeader(): Record<string, string> | null {
  const secret = process.env.UPLOAD_SECRET?.trim();
  if (!secret) return null;
  return { Authorization: `Bearer ${secret}` };
}
