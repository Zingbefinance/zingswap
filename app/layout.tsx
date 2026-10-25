import type { Metadata, Viewport } from "next";
import "./globals.css";
import WalletProvider from "@/components/providers/WalletProvider";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.zingswap.org/#organization",
      name: "ZingSwap",
      url: "https://www.zingswap.org",
      logo: "https://www.zingswap.org/icon.png",
    },
    {
      "@type": "WebSite",
      "@id": "https://www.zingswap.org/#website",
      name: "ZingSwap",
      url: "https://www.zingswap.org",
      description: "Application web de swap et d’outils pour tokens sur Solana, Ethereum, BNB Smart Chain et TON.",
      publisher: { "@id": "https://www.zingswap.org/#organization" },
      mainEntity: { "@id": "https://www.zingswap.org/#application" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.zingswap.org/#application",
      name: "ZingSwap",
      url: "https://www.zingswap.org",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: "Application web de swap de tokens avec recherche, graphiques, portefeuille Solana en lecture seule et interface de liquidité ZTC/SOL.",
      isPartOf: { "@id": "https://www.zingswap.org/#website" },
      publisher: { "@id": "https://www.zingswap.org/#organization" },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zingswap.org"),
  applicationName: "ZingSwap",
  title: { default: "ZingSwap | Application web de swap de tokens", template: "%s | ZingSwap" },
  description: "ZingSwap est une application web de swap de tokens sur Solana, Ethereum, BNB Smart Chain et TON, avec recherche, graphiques, portefeuille Solana en lecture seule et interface de liquidité ZTC/SOL.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "/",
    siteName: "ZingSwap",
    title: "ZingSwap | Application web de swap de tokens",
    description: "Application web ZingSwap : swaps sur Solana, Ethereum, BNB Smart Chain et parcours TON via Omniston, avec outils de recherche et de marché.",
    images: [{ url: "/images/zingswap-logo.png", width: 1310, height: 1200, alt: "Logo ZingSwap" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZingSwap | Application web de swap de tokens",
    description: "Application web ZingSwap pour les swaps Solana, Ethereum, BNB Smart Chain et TON.",
    images: ["/images/zingswap-logo.png"],
  },
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
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}
