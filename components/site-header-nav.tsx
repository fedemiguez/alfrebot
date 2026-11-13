"use client";

import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";

function GuestLinks() {
  return (
    <>
      <Link
        href="/ayuda"
        className="inline-flex min-h-11 items-center px-1 text-[var(--ink)] hover:text-[var(--primary)]"
      >
        Ayuda
      </Link>
      <Link
        href="/registro"
        className="inline-flex min-h-11 items-center px-1 text-[var(--ink)] hover:text-[var(--primary)]"
      >
        Por WhatsApp
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex min-h-11 items-center px-1 text-[var(--ink)] hover:text-[var(--primary)]"
      >
        En la web
      </Link>
      <Link
        href="/sign-in"
        className="inline-flex min-h-11 items-center px-1 text-[var(--muted)] hover:text-[var(--primary)]"
      >
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
          href="/ayuda"
          className="inline-flex min-h-11 items-center px-1 text-[var(--ink)] hover:text-[var(--primary)]"
        >
          Ayuda
        </Link>
        <Link
          href="/asistente"
          className="inline-flex min-h-11 items-center px-1 text-[var(--ink)] hover:text-[var(--primary)]"
        >
          Asistente
        </Link>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-11 w-11",
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
    <nav className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[18px] sm:gap-x-4">
      {clerkEnabled ? <ClerkNav /> : <GuestLinks />}
    </nav>
  );
}
