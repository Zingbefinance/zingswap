import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portefeuille Solana et NFT",
  description: "Consultez en lecture seule les soldes de tokens et les NFT détectés pour le wallet Solana connecté.",
  alternates: { canonical: "/portfolio" },
};

export default function PortfolioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
