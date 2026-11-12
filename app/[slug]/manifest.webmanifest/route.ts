import { appBaseUrl } from "@/lib/env";
import { getCachedStore } from "@/lib/store-data";

function shortName(name: string): string {
  if (name.length <= 12) return name;
  const cut = name.slice(0, 12);
  const space = cut.lastIndexOf(" ");
  if (space >= 4) return cut.slice(0, space);
  return `${cut.slice(0, 11)}…`;
}

function iconEntry(
  src: string,
  size: number,
  purpose: "any" | "maskable" = "any",
) {
  return {
    src,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose,
  };
}

export async function GET(
  _req: Request,
  ctx: RouteContext<"/[slug]/manifest.webmanifest">,
) {
  const { slug } = await ctx.params;
  const { store } = await getCachedStore(slug);
  if (!store?.name || !store.slug) {
    return new Response("Not found", { status: 404 });
  }

  const base = appBaseUrl();
  const pathIcon = (size: number) => `${base}/${store.slug}/icon/${size}`;
  const icon192 = store.icon192Url || pathIcon(192);
  const icon512 = store.icon512Url || pathIcon(512);

  const manifest = {
    id: `/${store.slug}`,
    name: store.name,
    short_name: shortName(store.name),
    description: store.ownerName
      ? `Catálogo de ${store.ownerName}`
      : `Catálogo de ${store.name}`,
    start_url: `/${store.slug}/?source=pwa`,
    scope: `/${store.slug}/`,
    display: "standalone",
    lang: "es-AR",
    dir: "ltr",
    background_color: "#FFFBEB",
    theme_color: "#9A3412",
    icons: [
      iconEntry(icon192, 192),
      iconEntry(icon512, 512),
      iconEntry(icon512, 512, "maskable"),
    ],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
