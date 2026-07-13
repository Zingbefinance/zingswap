import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SolanaProvider from "./SolanaProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZingSwap",
  description: "ZingSwap Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="{${geistSans.variable} ${geistMono.variable} h-full}"
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-black text-white">
        <SolanaProvider>
          {children}
        </SolanaProvider>
      </body>
    </html>
  );
}