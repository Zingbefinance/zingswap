import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Liquidité du pool ZTC/SOL",
  description: "Consultez le pool ZTC/SOL sur Solana et gérez une position de liquidité avec un wallet compatible.",
  alternates: { canonical: "/liquidity" },
};

export default function LiquidityLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
