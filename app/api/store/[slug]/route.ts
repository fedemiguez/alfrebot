import { getCachedStore } from "@/lib/store-data";


export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/store/[slug]">,
) {
  const { slug } = await ctx.params;
  const { store, products } = await getCachedStore(slug);
  if (!store) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  return Response.json({ ok: true, store, products });
}
