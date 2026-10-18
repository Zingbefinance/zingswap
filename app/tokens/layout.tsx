import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recherche de tokens",
  description: "Recherchez et sélectionnez des tokens Solana via le registre local et Jupiter, ou consultez les tokens disponibles sur Ethereum et BNB Smart Chain via LI.FI.",
  alternates: { canonical: "/tokens" },
};

export default function TokensLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
