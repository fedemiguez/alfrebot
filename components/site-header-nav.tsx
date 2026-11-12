"use client";

import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";

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

function ClerkNav() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <span className="inline-block h-9 w-28" aria-hidden />;
  }

  if (isSignedIn) {
    return (
      <>
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
      </>
    );
  }

  return <GuestLinks />;
}

export function SiteHeaderNav({ clerkEnabled }: { clerkEnabled: boolean }) {
  return (
    <nav className="flex items-center gap-4 text-[17px]">
      {clerkEnabled ? <ClerkNav /> : <GuestLinks />}
    </nav>
  );
}
