import type { Metadata } from "next";
import { Fraunces, Public_Sans, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/feedback/toast";
import { CursorParallax } from "@/components/effects/cursor-parallax";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
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
      className={`${fraunces.variable} ${publicSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* No-JS fallback: scroll-reveal targets stay visible if JS never runs
            (the IntersectionObserver in <Reveal> can't fire to reveal them). */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <CursorParallax />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
