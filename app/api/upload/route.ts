import { authorizeUploadRequest } from "@/lib/upload-auth";
import { uploadDataUrl, uploadProductImage } from "@/lib/blob";

export async function POST(req: Request) {
  const authz = await authorizeUploadRequest(req);
  if (!authz.ok) {
    return Response.json(
      { ok: false, error: authz.error },
      { status: authz.status },
    );
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { dataUrl?: string; filename?: string };
      if (!body.dataUrl) {
        return Response.json({ ok: false, error: "dataUrl required" }, { status: 400 });
      }
      const uploaded = await uploadDataUrl(
        body.dataUrl,
        body.filename ?? `upload-${Date.now()}.jpg`,
      );
      return Response.json({ ok: true, ...uploaded });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "file required" }, { status: 400 });
    }
    if (file.size <= 0) {
      return Response.json({ ok: false, error: "archivo vacío" }, { status: 400 });
    }
    // Soft guard: Vercel request body limit is ~4.5MB
    if (file.size > 4_500_000) {
      return Response.json(
        { ok: false, error: "La foto es muy pesada. Probá con una más chica." },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadProductImage(
      buffer,
      file.name || `upload-${Date.now()}.jpg`,
      file.type || "image/jpeg",
    );
    return Response.json({ ok: true, ...uploaded });
  } catch (err) {
    console.error("[upload] failed", err);
    const message = err instanceof Error ? err.message : "upload failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
