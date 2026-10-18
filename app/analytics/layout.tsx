import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Graphiques de marché des tokens Solana",
  description: "Recherchez un token ou une paire Solana pour consulter son prix indicatif, sa liquidité et son historique de marché.",
  alternates: { canonical: "/analytics" },
};

export default function AnalyticsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
