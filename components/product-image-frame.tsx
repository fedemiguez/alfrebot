import type { BusinessKind } from "@/lib/store-business-kind";

/**
 * Marco decorativo temático alrededor de la foto del producto (Fase D).
 * Solo SVG/CSS — sin etiquetas de texto. Usa currentColor → --primary (accent).
 */
export function ProductImageFrame({
  kind,
  frameId,
}: {
  kind: BusinessKind;
  /** Id estable por card (p.ej. product.id) para defs SVG únicos. */
  frameId: string;
}) {
  const safeId = frameId.replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <div
      className={`product-card__frame product-card__frame--${kind}`}
      aria-hidden="true"
    >
      {kind === "artesanal" ? <ArtesanalFrame uid={safeId} /> : null}
      {kind === "comida" ? <ComidaFrame /> : null}
      {kind === "ropa" ? <RopaFrame /> : null}
    </div>
  );
}

/** Cálido / craft: doble trazo irregular + trama suave en el perímetro. */
function ArtesanalFrame({ uid }: { uid: string }) {
  const hatchId = `craft-hatch-${uid}`;
  return (
    <svg
      className="product-card__frame-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern
          id={hatchId}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(28)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="4"
            stroke="currentColor"
            strokeWidth="0.45"
            opacity="0.35"
          />
        </pattern>
      </defs>
      <path
        fill={`url(#${hatchId})`}
        opacity="0.5"
        fillRule="evenodd"
        d="M0 0h100v100H0zm6.5 6.5h87v87h-87z"
      />
      <path
        className="product-card__frame-stroke"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        d="M4.2 3.6
           C18 2.2 32 4.8 48 3.4
           C64 2.1 78 4.5 95.5 3.8
           L96.4 48
           C97.2 64 95 79 96.2 96
           C80 97.5 65 95.2 49 96.6
           C33 98 18 95.4 4 96.2
           L3.2 51
           C2.4 35 4.6 19 4.2 3.6Z"
      />
      <path
        className="product-card__frame-stroke product-card__frame-stroke--inner"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.7"
        strokeLinejoin="round"
        strokeDasharray="3.2 2.1 1.4 2.4"
        vectorEffect="non-scaling-stroke"
        d="M8.5 8.2
           C22 7.1 36 9.4 51 8
           C66 6.8 79 9.1 91.2 8.4
           L91.8 50
           C92.4 65 90.6 79 91.6 91.5
           C77 92.8 63 90.8 49 92
           C35 93.2 21 91 8.6 91.8
           L7.8 50
           C7.2 35 9.2 21 8.5 8.2Z"
      />
    </svg>
  );
}

/** Fresco / casero: borde tipo plato (doble aro) + puntos de mantel sutiles. */
function ComidaFrame() {
  return (
    <svg
      className="product-card__frame-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <rect
        className="product-card__frame-stroke"
        x="3.5"
        y="3.5"
        width="93"
        height="93"
        rx="14"
        ry="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        className="product-card__frame-stroke product-card__frame-stroke--inner"
        x="7.5"
        y="7.5"
        width="85"
        height="85"
        rx="11"
        ry="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.65"
        opacity="0.7"
        vectorEffect="non-scaling-stroke"
      />
      {(
        [
          [12, 12],
          [88, 12],
          [12, 88],
          [88, 88],
        ] as const
      ).map(([cx, cy]) => (
        <g key={`${cx}-${cy}`} opacity="0.55">
          <circle cx={cx} cy={cy} r="1.1" fill="currentColor" />
          <circle
            cx={cx + (cx < 50 ? 3.2 : -3.2)}
            cy={cy}
            r="0.7"
            fill="currentColor"
            opacity="0.7"
          />
          <circle
            cx={cx}
            cy={cy + (cy < 50 ? 3.2 : -3.2)}
            r="0.7"
            fill="currentColor"
            opacity="0.7"
          />
        </g>
      ))}
    </svg>
  );
}

/** Boutique / lookbook: línea editorial fina + esquinas en L. */
function RopaFrame() {
  return (
    <>
      <svg
        className="product-card__frame-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <rect
          className="product-card__frame-stroke product-card__frame-stroke--inner"
          x="5"
          y="5"
          width="90"
          height="90"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.55"
          opacity="0.55"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <svg
        className="product-card__frame-corner product-card__frame-corner--tl"
        viewBox="0 0 24 24"
      >
        <path
          d="M2 18V4h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="square"
        />
      </svg>
      <svg
        className="product-card__frame-corner product-card__frame-corner--tr"
        viewBox="0 0 24 24"
      >
        <path
          d="M22 18V4H8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="square"
        />
      </svg>
      <svg
        className="product-card__frame-corner product-card__frame-corner--bl"
        viewBox="0 0 24 24"
      >
        <path
          d="M2 6v14h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="square"
        />
      </svg>
      <svg
        className="product-card__frame-corner product-card__frame-corner--br"
        viewBox="0 0 24 24"
      >
        <path
          d="M22 6v14H8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="square"
        />
      </svg>
    </>
  );
}
