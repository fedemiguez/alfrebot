import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Cormorant_Garamond,
  Fraunces,
  Lexend,
  Plus_Jakarta_Sans,
  Source_Sans_3,
} from "next/font/google";
import { AppClerkProvider } from "@/components/clerk-provider";
import { isClerkConfigured } from "@/lib/clerk";
import "./globals.css";

const display = Lexend({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

/** Cuerpo Ikt + botones — alta legibilidad (+60). */
const iktBody = Plus_Jakarta_Sans({
  variable: "--font-ikt-body",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

/** Comidas — títulos y precios (Bricolage Grotesque). */
const iktComidas = Bricolage_Grotesque({
  variable: "--font-ikt-comidas",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

/** Ropa — títulos serif editorial (Cormorant Garamond). */
const iktRopa = Cormorant_Garamond({
  variable: "--font-ikt-ropa",
  subsets: ["latin"],
  weight: ["600", "700"],
});

/** Artesanías — títulos de taller (Fraunces). */
const iktArtesanias = Fraunces({
  variable: "--font-ikt-artesanias",
  subsets: ["latin"],
  weight: ["600", "700"],
});

/**
 * Alias de heading genérico (default sin rubro / fallback).
 * Por rubro se sobreescribe --ikt-font-heading en CSS.
 */
const iktHeading = Plus_Jakarta_Sans({
  variable: "--font-ikt-heading",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "alfrebot",
    template: "%s · alfrebot",
  },
  description:
    "alfrebot: tu asistente para crear tiendas virtuales de forma sencilla, en unos 5 minutos.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://alfrebot.com.ar",
  ),
  icons: {
    icon: [
      { url: "/icons/alfrebot-robot.svg", type: "image/svg+xml" },
      { url: "/icons/alfrebot-robot-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/icons/alfrebot-robot.svg",
    apple: [
      {
        url: "/icons/alfrebot-robot-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${body.variable} ${iktBody.variable} ${iktHeading.variable} ${iktComidas.variable} ${iktRopa.variable} ${iktArtesanias.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppClerkProvider enabled={isClerkConfigured()}>{children}</AppClerkProvider>
      </body>
    </html>
  );
}
