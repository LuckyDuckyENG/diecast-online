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
  title: "Diecasts - The F1 Diecast Price Index",
  description: "Track prices and discover premium F1 scale models from Spark, Minichamps, Looksmart, BBR and more.",
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
