"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

function GuestLinks() {
  return (
    <>
      <Link href="/registro" className="text-[var(--ink)] hover:text-[var(--primary)]">
        Por WhatsApp
      </Link>
      <Link href="/sign-up" className="text-[var(--ink)] hover:text-[var(--primary)]">
        En la web
      </Link>
      <Link href="/sign-in" className="text-[var(--muted)] hover:text-[var(--primary)]">
        Entrar
      </Link>
    </>
  );
}

export function SiteHeaderNav({ clerkEnabled }: { clerkEnabled: boolean }) {
  if (!clerkEnabled) {
    return (
      <nav className="flex items-center gap-4 text-[17px]">
        <GuestLinks />
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-4 text-[17px]">
      <SignedOut>
        <GuestLinks />
      </SignedOut>
      <SignedIn>
        <Link
          href="/asistente"
          className="text-[var(--ink)] hover:text-[var(--primary)]"
        >
          Asistente
        </Link>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-9 w-9",
            },
          }}
        />
      </SignedIn>
    </nav>
  );
}
