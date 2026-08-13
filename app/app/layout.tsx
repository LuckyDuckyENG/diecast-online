import type { Metadata } from "next";
import { Hanken_Grotesk, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  /**
   * Resolves every relative `alternates.canonical` and Open Graph image below
   * this segment into an absolute URL.
   *
   * Without it the deployed pages emitted `<link rel="canonical" href="/browse">`.
   * Google resolves relative canonicals, but its guidance is to use absolute
   * URLs — they are unambiguous, and they survive being copied into feeds,
   * syndication or a preview environment, where a relative path silently points
   * somewhere else.
   *
   * Set here rather than per page: the docs note it applies to the current
   * segment and below, so one line covers cars, seasons, teams and drivers.
   */
  metadataBase: new URL("https://diecasts.app"),
  title: "Diecasts - The F1 Diecast Price Index",
  description: "Track prices and discover premium F1 scale models from Spark, Minichamps, Looksmart, BBR and more.",
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hankenGrotesk.variable} ${archivo.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
