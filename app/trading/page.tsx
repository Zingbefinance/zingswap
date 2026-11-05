import type { Metadata } from "next";
import { Suspense } from "react";
import { CandlestickChart } from "lucide-react";

import MainLayout from "@/components/layout/MainLayout";
import { TokenProvider } from "@/components/providers/TokenContext";
import TradingTerminal from "./TradingTerminal";

export const metadata: Metadata = {
  title: "Trading crypto",
  description:
    "Échangez des crypto-actifs depuis l’espace Trading de ZingSwap, avec les réseaux et les routes disponibles.",
  alternates: { canonical: "/trading" },
};

export default function TradingPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-300">
              <CandlestickChart size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Trading</h1>
            </div>
          </div>
        </section>

        <Suspense fallback={<div className="min-h-[32rem] animate-pulse rounded-2xl border border-zinc-800 bg-zinc-950" />}>
          <TokenProvider>
            <TradingTerminal />
          </TokenProvider>
        </Suspense>
      </div>
    </MainLayout>
  );
}
