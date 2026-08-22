"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";

import MainLayout from "@/components/layout/MainLayout";

export default function AnalyticsPage() {
  const { connection } = useConnection();

  const [slot, setSlot] = useState("--");
  const [blockHeight, setBlockHeight] = useState("--");
  const [epoch, setEpoch] = useState("--");
  const [tps, setTps] = useState("--");

  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      try {
        const [
          currentSlot,
          currentBlockHeight,
          epochInfo,
          samples,
        ] = await Promise.all([
          connection.getSlot(),
          connection.getBlockHeight(),
          connection.getEpochInfo(),
          connection.getRecentPerformanceSamples(1),
        ]);

        if (cancelled) return;

        setSlot(currentSlot.toLocaleString());
        setBlockHeight(currentBlockHeight.toLocaleString());
        setEpoch(epochInfo.epoch.toString());

        if (samples.length > 0) {
          const sample = samples[0];
          const currentTps =
            sample.numTransactions / sample.samplePeriodSecs;

          setTps(currentTps.toFixed(0));
        }
      } catch (error) {
        console.error("Erreur Analytics :", error);
      }
    };

    loadAnalytics();

    const interval = setInterval(loadAnalytics, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection]);

  const cards = [
    { title: "Current Slot", value: slot },
    { title: "Block Height", value: blockHeight },
    { title: "Current Epoch", value: epoch },
    { title: "Estimated TPS", value: tps },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-3xl font-bold text-white">
            Analytics
          </h1>

          <p className="mt-2 text-zinc-400">
            Données on-chain en temps réel du réseau Solana.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
            >
              <p className="text-sm text-zinc-400">
                {card.title}
              </p>

              <h2 className="mt-3 text-3xl font-bold text-white break-words">
                {card.value}
              </h2>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}