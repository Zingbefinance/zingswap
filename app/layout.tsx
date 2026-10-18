import type { Metadata, Viewport } from "next";
import "./globals.css";
import WalletProvider from "@/components/providers/WalletProvider";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "ZingSwap",
      url: "https://www.zingswap.org",
      logo: "https://www.zingswap.org/icon.png",
    },
    {
      "@type": "WebSite",
      name: "ZingSwap",
      url: "https://www.zingswap.org",
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zingswap.org"),
  title: { default: "ZingSwap | Échange et outils pour Solana et EVM", template: "%s | ZingSwap" },
  description: "Interface ZingSwap pour échanger des tokens sur Solana, Ethereum et BNB Smart Chain, consulter des graphiques, gérer une position de liquidité ZTC/SOL et voir un portefeuille Solana.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
