import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--primary)]"
        >
          alfrebot
        </Link>
        <nav className="flex items-center gap-4 text-[17px]">
          <Link href="/registro" className="text-[var(--ink)] hover:text-[var(--primary)]">
            Por WhatsApp
          </Link>
          <Link href="/sign-up" className="text-[var(--ink)] hover:text-[var(--primary)]">
            En la web
          </Link>
          <Link href="/sign-in" className="text-[var(--muted)] hover:text-[var(--primary)]">
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  );
}
