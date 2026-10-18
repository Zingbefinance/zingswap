import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paramètres de ZingSwap",
  description: "Choisissez la langue de l’interface, le seuil de slippage et consultez le réseau Solana configuré dans ZingSwap.",
  alternates: { canonical: "/settings" },
};

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
