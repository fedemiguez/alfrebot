import { getCachedStore } from "@/lib/store-data";
import { monogramPngBuffer } from "@/lib/store-icon";

const ALLOWED = new Set([192, 512, 180]);

export async function GET(
  _req: Request,
  ctx: RouteContext<"/[slug]/icon/[size]">,
) {
  const { slug, size: sizeRaw } = await ctx.params;
  const size = Number(sizeRaw);
  if (!ALLOWED.has(size)) {
    return new Response("Not found", { status: 404 });
  }

  const { store } = await getCachedStore(slug);
  if (!store?.name) {
    return new Response("Not found", { status: 404 });
  }

  const fromDb =
    size === 192
      ? store.icon192Url
      : size === 512
        ? store.icon512Url
        : store.iconAppleUrl;

  // Si ya hay URL pública (http), redirigir; data: no sirve como Location
  if (fromDb?.startsWith("http")) {
    return Response.redirect(fromDb, 302);
  }

  const png = await monogramPngBuffer(store.name, size);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
