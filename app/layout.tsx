import type { Metadata, Viewport } from "next";
import "./globals.css";
import WalletProvider from "@/components/providers/WalletProvider";

export const metadata: Metadata = {
  title: "ZingSwap",
  description: "Cross-Chain DEX",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}