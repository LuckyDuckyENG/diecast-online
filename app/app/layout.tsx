import type { Metadata } from "next";
import { Hanken_Grotesk, Archivo, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
      <body className="min-h-screen font-sans">
        {children}
        {/*
          Page views, referrers and country, measured at the edge.

          Deliberately NOT built here. The hard part of page analytics is not
          the logging, it is filtering bots, and that is a list maintained
          forever rather than a regex written once: the sitemap carries 1,341
          URLs, so a single crawler walking it looks like 1,341 visits. Acting
          on an unfiltered number would mean planning around whatever a scraper
          liked.

          It also keeps the highest-frequency event on the site away from
          Supabase, which is the resource this project already exceeded once,
          on 2026-09-22.

          What IS worth building is the search log, because nothing sells "this
          search returned nothing" and that is the signal that says what to add
          next. Low volume too: one row per search, not per page view.

          Renders nothing and loads no script outside production.
        */}
        <Analytics />
      </body>
    </html>
  );
}
