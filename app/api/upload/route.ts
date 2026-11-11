import { uploadDataUrl, uploadProductImage } from "@/lib/blob";


export async function POST(req: Request) {
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
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploaded = await uploadProductImage(
    buffer,
    file.name || `upload-${Date.now()}.jpg`,
    file.type || "image/jpeg",
  );
  return Response.json({ ok: true, ...uploaded });
}
