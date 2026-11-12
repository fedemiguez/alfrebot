import Link from "next/link";
import { isClerkConfigured } from "@/lib/clerk";
import { SiteHeaderNav } from "@/components/site-header-nav";

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--primary)]"
        >
          alfrebot
        </Link>
        <SiteHeaderNav clerkEnabled={isClerkConfigured()} />
      </div>
    </header>
  );
}
