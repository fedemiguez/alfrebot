/**
 * Ornamento tipográfico de taller (firulete) — decorativo, sin semántica.
 * Voluta + flor estilizada (arte popular / imprenta), en currentColor.
 */
export function ArtesaniaTitleFlourish({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 28"
      width={56}
      height={28}
      aria-hidden="true"
      focusable="false"
    >
      {/* Voluta exterior */}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M50.5 15.5c-5.8-.2-8.6-6.4-14.8-6.2-3.6.1-6 2.2-7.8 4.6"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.5 15.5c5.8-.2 8.6-5.8 13.6-5.6 2.4.1 4.4 1.2 6 2.8"
      />
      {/* Curva inferior de equilibrio */}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        d="M37.2 15.8c1.6 2.8 4.2 5.4 8.4 5.2"
      />
      {/* Flor / pétalo de taller */}
      <path
        fill="currentColor"
        d="M28 7.8c.85 1.7 2.45 2.9 2.45 4.85 0 1.35-1.1 2.35-2.45 2.35s-2.45-1-2.45-2.35c0-1.95 1.6-3.15 2.45-4.85z"
      />
      <circle cx="28" cy="16.8" r="1.2" fill="currentColor" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M28 18.5v5M24.8 21.2 28 23.2l3.2-2"
      />
    </svg>
  );
}
