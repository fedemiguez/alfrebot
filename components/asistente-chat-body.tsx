import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SimulatorChat } from "@/components/simulator-chat";
import { clerkIdentityKey, isClerkConfigured } from "@/lib/clerk";
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
  if (!userId) {
    redirect("/sign-up");
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    undefined;
  const ownerImageUrl = user?.imageUrl ?? null;
  const identity = clerkIdentityKey(userId);
  const botDigits = metaBotNumber();
  const continueWaLink = `https://wa.me/${botDigits}?text=${encodeURIComponent(
    "Hola! Quiero seguir armando mi tienda desde la web.",
  )}`;

  return (
    <SimulatorChat
      initialPhone={identity}
      ownerEmail={email}
      ownerImageUrl={ownerImageUrl}
      continueWaLink={continueWaLink}
      identityMode="clerk"
      variant={variant}
    />
  );
}
