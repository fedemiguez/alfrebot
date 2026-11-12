/**
 * Smoke: POST /api/upload exige auth (401 sin credenciales; Bearer UPLOAD_SECRET ok).
 * Uso: UPLOAD_SECRET=test-upload npx tsx scripts/smoke-upload-auth.ts
 *
 * No arranca Next: ejercita `authorizeUploadRequest` en proceso.
 * Meta/bot no pasan por /api/upload (usan lib/blob).
 */
import {
  authorizeUploadRequest,
  uploadAuthorizationHeader,
  uploadSecretConfigured,
} from "../lib/upload-auth";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

async function main() {
  process.env.UPLOAD_SECRET = process.env.UPLOAD_SECRET?.trim() || "smoke-upload-secret";
  // Asegurar que Clerk no interfiere en este smoke in-process.
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;

  assert(uploadSecretConfigured(), "UPLOAD_SECRET configured");

  const denied = await authorizeUploadRequest(
    new Request("http://localhost/api/upload", { method: "POST" }),
  );
  assert(!denied.ok && denied.status === 401, "sin auth → 401");

  const bad = await authorizeUploadRequest(
    new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    }),
  );
  assert(!bad.ok && bad.status === 401, "Bearer incorrecto → 401");

  const headers = uploadAuthorizationHeader();
  assert(headers?.Authorization?.startsWith("Bearer "), "header Bearer generado");

  const allowed = await authorizeUploadRequest(
    new Request("http://localhost/api/upload", {
      method: "POST",
      headers: headers ?? undefined,
    }),
  );
  assert(allowed.ok, "Bearer UPLOAD_SECRET → ok");

  console.log("\nOK upload-auth: 401 sin auth, Bearer secreto aceptado");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
