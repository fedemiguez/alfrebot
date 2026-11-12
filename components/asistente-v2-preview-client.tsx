"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { SimulatorChat } from "@/components/simulator-chat";

export function AsistenteV2PreviewClient({
  continueWaLink,
}: {
  continueWaLink: string;
}) {
  // Identidad fresca por visita para que la preview no herede el draft anterior.
  const [phone] = useState(
    () => `+0115555${String(Math.floor(1000 + Math.random() * 8999))}`,
  );
  const searchParams = useSearchParams();
  // `?avatar=demo` muestra foto de ejemplo (sin Clerk); por defecto silueta.
  const ownerImageUrl =
    searchParams.get("avatar") === "demo"
      ? "/icons/demo-owner-avatar.svg"
      : null;

  return (
    <SimulatorChat
      initialPhone={phone}
      continueWaLink={continueWaLink}
      identityMode="phone"
      ownerImageUrl={ownerImageUrl}
      variant="v2"
    />
  );
}
