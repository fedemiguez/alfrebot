import { put } from "@vercel/blob";

export type UploadedImage = {
  url: string;
  pathname: string;
};

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
