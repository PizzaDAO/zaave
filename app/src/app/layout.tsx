import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zaave: supply crypto, get pizza",
  description: "Aave, but the yield is pizza. Supply crypto to Aave, keep your principal, get pies every month.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
          <footer className="mx-auto w-full max-w-4xl px-4 py-6 text-xs text-muted">
            Zaave is experimental software. Yield varies and is not guaranteed. Not financial advice.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
