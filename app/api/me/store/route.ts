import { auth } from "@clerk/nextjs/server";
import { clerkIdentityKey, isClerkConfigured } from "@/lib/clerk";
import { getStoreForChannelIdentity } from "@/lib/db/repos";

/** Slug de la tienda activa del dueño logueado (chat web header). */
export async function GET() {
  if (!isClerkConfigured()) {
    return Response.json({ slug: null }, { status: 401 });
  }
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ slug: null }, { status: 401 });
  }
  const store = await getStoreForChannelIdentity(clerkIdentityKey(userId));
  const slug =
    store?.status === "active" && store.slug?.trim()
      ? store.slug.trim()
      : null;
  return Response.json({ slug });
}
