import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Sans, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ToastProvider } from "@/components/feedback/toast";
import { CursorParallax } from "@/components/effects/cursor-parallax";
import "./globals.css";

// Newsreader is a variable font (opsz, wght). Italic kept for accents (eyebrows, emphasis).
const newsreader = Newsreader({
  variable: "--font-heading",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// IBM Plex Sans is a static family — enumerate the weights the UI uses.
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cal Barba — Dog Walking & House Sitting",
  description:
    "Professional dog walking and house sitting in Boulder, CO. Reliable, caring pet care tailored to your dog's needs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${ibmPlexSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* No-JS fallback: scroll-reveal targets stay visible if JS never runs
            (the IntersectionObserver in <Reveal> can't fire to reveal them). */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <CursorParallax />
        <ToastProvider>{children}</ToastProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
