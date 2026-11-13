import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SimulatorChat } from "@/components/simulator-chat";
import { clerkIdentityKey, isClerkConfigured } from "@/lib/clerk";
import { getStoreForChannelIdentity } from "@/lib/db/repos";
import { metaBotNumber } from "@/lib/env";

export async function AsistenteChatBody({
  variant = "classic",
}: {
  variant?: "classic" | "v2";
}) {
  if (!isClerkConfigured()) {
    redirect("/sign-up");
  }

  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email = user
    ? (user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      undefined)
    : undefined;
  // Solo firstName de Clerk; si no hay, el chat saluda sin inventar nombre.
  const ownerFirstName = user?.firstName?.trim() || null;
  const ownerImageUrl = user?.imageUrl ?? null;
  const identity = userId ? clerkIdentityKey(userId) : undefined;
  const store = identity ? await getStoreForChannelIdentity(identity) : null;
  const hasActiveStore = Boolean(
    store?.status === "active" && store.slug?.trim(),
  );
  const botDigits = metaBotNumber();
  const continueWaLink = `https://wa.me/${botDigits}?text=${encodeURIComponent(
    "Hola! Quiero seguir armando mi tienda desde la web.",
  )}`;

  return (
    <SimulatorChat
      initialPhone={identity}
      ownerEmail={email}
      ownerFirstName={ownerFirstName}
      ownerImageUrl={ownerImageUrl}
      continueWaLink={continueWaLink}
      identityMode="clerk"
      isAuthenticated={Boolean(userId)}
      hasActiveStore={hasActiveStore}
      initialStoreSlug={hasActiveStore ? store?.slug ?? null : null}
      variant={variant}
    />
  );
}
