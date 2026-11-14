/**
 * Tema visual Iktweb: rubro + paleta desde business_kind + accent_color.
 * Tokens alineados a spec +60 / vista previa Gemini editorial.
 */

import { normalizeAccentHex } from "@/lib/store-accent";
import {
  normalizeBusinessKind,
  type BusinessKind,
} from "@/lib/store-business-kind";

export type IktRubro = "ropa" | "comidas" | "artesanias";

export type IktPaletteId =
  | "lino-arena"
  | "monochrome-noir"
  | "botanical-sage"
  | "brasa-fuego"
  | "trattoria-rustica"
  | "cafe-matcha"
  | "arcilla-sol"
  | "bosque-nogal"
  | "indigo-telar";

export type IktThemeResolved = {
  rubro: IktRubro;
  palette: IktPaletteId;
  /** Hex primario de la paleta elegida (también alimenta --primary). */
  primary: string;
  whatsapp: string;
};

type PaletteDef = {
  id: IktPaletteId;
  primary: string;
  whatsapp: string;
};

const RUBRO_BY_KIND: Record<BusinessKind, IktRubro> = {
  ropa: "ropa",
  comida: "comidas",
  artesanal: "artesanias",
};

/** Primarios exactos de la spec Gemini (+60). */
const PALETTES_BY_RUBRO: Record<IktRubro, readonly PaletteDef[]> = {
  ropa: [
    { id: "lino-arena", primary: "#9A5B36", whatsapp: "#2B4C3F" },
    { id: "monochrome-noir", primary: "#111827", whatsapp: "#1F2937" },
    { id: "botanical-sage", primary: "#354F3B", whatsapp: "#2B4C3F" },
  ],
  comidas: [
    { id: "brasa-fuego", primary: "#D84315", whatsapp: "#1B5E20" },
    { id: "trattoria-rustica", primary: "#7F1D1D", whatsapp: "#2D4A3E" },
    { id: "cafe-matcha", primary: "#2E5A36", whatsapp: "#2B4C3F" },
  ],
  artesanias: [
    { id: "arcilla-sol", primary: "#9C4A2B", whatsapp: "#2B4C3F" },
    { id: "bosque-nogal", primary: "#3E634D", whatsapp: "#233D3B" },
    { id: "indigo-telar", primary: "#B83B44", whatsapp: "#1D3557" },
  ],
};

/** Fallback por rubro (spec / plan). */
export const IKT_DEFAULT_PALETTE: Record<IktRubro, IktPaletteId> = {
  ropa: "lino-arena",
  comidas: "brasa-fuego",
  artesanias: "arcilla-sol",
};

export function businessKindToIktRubro(
  stored: string | null | undefined,
): IktRubro | null {
  const kind = normalizeBusinessKind(stored);
  if (!kind) return null;
  return RUBRO_BY_KIND[kind];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const n = normalizeAccentHex(hex);
  if (!n) return null;
  const v = n.slice(1);
  return [
    Number.parseInt(v.slice(0, 2), 16),
    Number.parseInt(v.slice(2, 4), 16),
    Number.parseInt(v.slice(4, 6), 16),
  ];
}

/** Distancia euclídea en RGB (match “hex más cercano”). */
function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Number.POSITIVE_INFINITY;
  const dr = ra[0] - rb[0];
  const dg = ra[1] - rb[1];
  const db = ra[2] - rb[2];
  return dr * dr + dg * dg + db * db;
}

export function resolveIktPalette(
  rubro: IktRubro,
  accentColor: string | null | undefined,
): PaletteDef {
  const palettes = PALETTES_BY_RUBRO[rubro];
  const accent = normalizeAccentHex(accentColor);
  if (!accent) {
    const fallbackId = IKT_DEFAULT_PALETTE[rubro];
    return palettes.find((p) => p.id === fallbackId) ?? palettes[0]!;
  }

  let best = palettes[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const palette of palettes) {
    const dist = colorDistance(accent, palette.primary);
    if (dist < bestDist) {
      best = palette;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Resuelve rubro Ikt + paleta desde campos actuales de la tienda.
 * Sin `business_kind` → null (plantilla default, sin data-rubro).
 */
export function resolveIktTheme(store: {
  businessKind?: string | null;
  accentColor?: string | null;
}): IktThemeResolved | null {
  const rubro = businessKindToIktRubro(store.businessKind);
  if (!rubro) return null;
  const palette = resolveIktPalette(rubro, store.accentColor);
  return {
    rubro,
    palette: palette.id,
    primary: palette.primary,
    whatsapp: palette.whatsapp,
  };
}

/**
 * Props de presentación para el shell público.
 * - Con rubro Ikt: ignora theme claro/crema/oscuro; --primary desde la paleta.
 * - Sin rubro: tokens neutros Ikt + shell limpio (sin theme legacy).
 */
export function iktShellPresentation(store: {
  businessKind?: string | null;
  accentColor?: string | null;
  theme?: string | null;
}): {
  ikt: IktThemeResolved | null;
  /** true = plantilla default limpia (sin data-rubro). */
  isDefault: boolean;
  /** Clase de tema; Ikt o default limpio (nunca claro/crema/oscuro con Ikt). */
  themeClassName: string | null;
  styleVars: Record<string, string>;
} {
  const ikt = resolveIktTheme(store);
  if (!ikt) {
    const accent = normalizeAccentHex(store.accentColor);
    const primary = accent ?? "#000000";
    return {
      ikt: null,
      isDefault: true,
      themeClassName: "store-theme-ikt store-theme-ikt-default",
      styleVars: {
        "--primary": primary,
        "--primary-fg": "#ffffff",
        "--store-accent": primary,
        "--ikt-primary": primary,
        "--ikt-primary-text": "#ffffff",
        "--ikt-whatsapp": "#128c7e",
        "--wa": "#128c7e",
      },
    };
  }

  return {
    ikt,
    isDefault: false,
    themeClassName: "store-theme-ikt",
    styleVars: {
      "--primary": ikt.primary,
      "--primary-fg": "#ffffff",
      "--store-accent": ikt.primary,
      "--ikt-primary": ikt.primary,
      "--ikt-primary-text": "#ffffff",
      "--ikt-whatsapp": ikt.whatsapp,
      "--wa": ikt.whatsapp,
    },
  };
}
