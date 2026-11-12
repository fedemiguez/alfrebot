"use client";

import { useState } from "react";
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

  return (
    <SimulatorChat
      initialPhone={phone}
      continueWaLink={continueWaLink}
      identityMode="phone"
      variant="v2"
    />
  );
}
