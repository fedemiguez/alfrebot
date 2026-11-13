import { del, put } from "@vercel/blob";

export type UploadedImage = {
  url: string;
  pathname: string;
};

/** URL o pathname de Blob nuestro (no placeholders locales ni data:). */
export function isOwnedBlobRef(ref: string | null | undefined): boolean {
  if (!ref) return false;
  const value = ref.trim();
  if (!value) return false;
  if (value.startsWith("data:") || value.startsWith("/")) return false;
  if (value.startsWith("mock/")) return false;
  if (value.includes("blob.vercel-storage.com")) return true;
  if (value.startsWith("products/") || value.startsWith("store-icons/")) {
    return true;
  }
  return false;
}

/**
 * Borra blobs propios (productos / iconos). Best-effort: no lanza si falta token
 * o el delete remoto falla (la fila de DB ya puede estar borrada).
 */
export async function deleteOwnedBlobs(
  refs: Array<string | null | undefined>,
): Promise<{ attempted: number; deleted: number }> {
  const unique = [
    ...new Set(
      refs
        .filter((r): r is string => Boolean(r && isOwnedBlobRef(r)))
        .map((r) => r.trim()),
    ),
  ];
  if (unique.length === 0) return { attempted: 0, deleted: 0 };

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    console.warn("[blob] skip deleteOwnedBlobs: sin BLOB_READ_WRITE_TOKEN");
    return { attempted: unique.length, deleted: 0 };
  }

  try {
    await del(unique, { token });
    return { attempted: unique.length, deleted: unique.length };
  } catch (err) {
    console.warn("[blob] deleteOwnedBlobs failed", err);
    return { attempted: unique.length, deleted: 0 };
  }
}

export async function uploadProductImage(
  bytes: ArrayBuffer | Blob | Buffer,
  filename: string,
  contentType: string,
): Promise<UploadedImage> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    // Local / preview sin Blob: placeholder estable
    const safe = encodeURIComponent(filename.replace(/\s+/g, "-").slice(0, 40));
    return {
      url: `/api/placeholder?name=${safe}`,
      pathname: `mock/${safe}`,
    };
  }

  const blob = await put(`products/${Date.now()}-${filename}`, bytes, {
    access: "public",
    contentType,
    token,
  });

  return { url: blob.url, pathname: blob.pathname };
}

/**
 * Sube un asset de icono PWA (PNG/SVG). Sin Blob token, data URL (smoke/local).
 */
export async function uploadStoreIcon(
  bytes: Buffer,
  filename: string,
  contentType: string,
): Promise<UploadedImage> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    const b64 = bytes.toString("base64");
    return {
      url: `data:${contentType};base64,${b64}`,
      pathname: `mock/icons/${filename}`,
    };
  }

  const blob = await put(`store-icons/${Date.now()}-${filename}`, bytes, {
    access: "public",
    contentType,
    token,
  });

  return { url: blob.url, pathname: blob.pathname };
}

export async function uploadDataUrl(dataUrl: string, filename: string): Promise<UploadedImage> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    if (dataUrl.startsWith("http") || dataUrl.startsWith("/")) {
      return { url: dataUrl, pathname: dataUrl };
    }
    throw new Error("dataUrl inválida");
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return uploadProductImage(buffer, filename, contentType);
}
