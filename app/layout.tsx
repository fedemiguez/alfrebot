import type { Metadata } from "next";
import { Lexend, Source_Sans_3 } from "next/font/google";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppClerkProvider enabled={isClerkConfigured()}>{children}</AppClerkProvider>
      </body>
    </html>
  );
}
