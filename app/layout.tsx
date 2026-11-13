import type { Metadata } from "next";
import {
  Inter,
  Lexend,
  Playfair_Display,
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

/** Fuentes preview Ikt — shell de vitrina con data-rubro o default limpio. */
const iktHeading = Plus_Jakarta_Sans({
  variable: "--font-ikt-heading",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const iktBody = Inter({
  variable: "--font-ikt-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Serif cálida — nombre de taller y títulos de pieza (Artesanías). */
const iktSerif = Playfair_Display({
  variable: "--font-ikt-serif",
  subsets: ["latin"],
  weight: ["700"],
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
      className={`${display.variable} ${body.variable} ${iktHeading.variable} ${iktBody.variable} ${iktSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppClerkProvider enabled={isClerkConfigured()}>{children}</AppClerkProvider>
      </body>
    </html>
  );
}
