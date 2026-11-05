import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeftRight } from "lucide-react";

import MainLayout from "@/components/layout/MainLayout";
import SwapNetworkSwitcher from "@/features/swap/components/SwapNetworkSwitcher";

export const metadata: Metadata = {
  title: "Swap crypto",
  description:
    "Échangez des crypto-actifs sur Solana, Ethereum, BNB Smart Chain et TON avec les routes disponibles sur ZingSwap.",
  alternates: { canonical: "/swap" },
};

export default function SwapPage() {
  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-300">
              <ArrowLeftRight size={24} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-cyan-300">
                ZingSwap · Échange
              </p>
              <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
                Swap
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Échangez vos crypto-actifs sur Solana, Ethereum, BNB Smart Chain
                et TON. Les réseaux et les routes disponibles dépendent de la
                paire sélectionnée.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Échanger des crypto-actifs"
          className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6"
        >
          <Suspense
            fallback={
              <div className="min-h-96 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/60" />
            }
          >
            <SwapNetworkSwitcher />
          </Suspense>
        </section>
      </div>
    </MainLayout>
  );
}
