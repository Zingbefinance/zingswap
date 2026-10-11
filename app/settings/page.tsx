"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useLanguage } from "@/components/providers/LanguageContext";
import { useSettings } from "@/components/providers/SettingsContext";
import MainLayout from "@/components/layout/MainLayout";
import { Bell, Gauge, Globe, LockKeyhole, Settings, Wallet } from "lucide-react";

const SLIPPAGE_OPTIONS = [10, 50, 100, 300];
const GENESIS_NETWORKS: Record<string, string> = {
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana Mainnet Beta",
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1: "Solana Devnet",
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY": "Solana Testnet",
};

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { slippageBps, setSlippageBps } = useSettings();
  const { connection } = useConnection();
  const [network, setNetwork] = useState("");
  const fr = language === "Français";

  useEffect(() => {
    let active = true;
    const rpcHost = (() => {
      try { return new URL(connection.rpcEndpoint).hostname; } catch { return "RPC configuré"; }
    })();
    connection.getGenesisHash().then((genesisHash) => {
      if (!active) return;
      const label = GENESIS_NETWORKS[genesisHash] ?? "Réseau Solana personnalisé";
      setNetwork(`${label} · ${rpcHost}`);
    }).catch(() => {
      if (active) setNetwork(`${fr ? "Réseau non vérifié" : "Network could not be verified"} · ${rpcHost}`);
    });
    return () => { active = false; };
  }, [connection, fr]);

  const unavailable = fr ? "Indisponible pour le moment" : "Not available yet";

  return (
    <MainLayout>
      <div className="space-y-6">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
          <div className="flex min-w-0 items-start gap-3"><Settings className="mt-1 shrink-0 text-cyan-400" size={28} /><div className="min-w-0"><h1 className="text-2xl font-bold text-white sm:text-3xl">{fr ? "Paramètres" : "Settings"}</h1><p className="mt-2 text-zinc-400">{fr ? "Préférences utilisées par ZingSwap." : "Preferences used by ZingSwap."}</p></div></div>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-3 flex items-center gap-3"><Gauge className="text-cyan-400" /><div><h2 className="text-xl font-bold text-white">Slippage</h2><p className="text-sm text-zinc-400">{fr ? "Seuil minimum appliqué aux swaps et transmis aux cotations." : "Minimum output tolerance applied to swaps and sent with quotes."}</p></div></div>
          <div className="flex flex-wrap gap-2">{SLIPPAGE_OPTIONS.map((bps) => {
            const value = `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
            return <button key={bps} type="button" aria-pressed={slippageBps === bps} onClick={() => setSlippageBps(bps)} className={`rounded-xl px-4 py-2 font-medium transition ${slippageBps === bps ? "bg-cyan-500 text-black" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`}>{value}</button>;
          })}</div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-3 flex items-center gap-3"><Globe className="text-cyan-400" /><h2 className="text-xl font-bold text-white">{fr ? "Réseau utilisé" : "Active network"}</h2></div>
          <p className="break-words rounded-xl bg-zinc-900 p-4 text-sm text-white" aria-live="polite">{network || (fr ? "Réseau en cours de vérification…" : "Checking active network…")}</p>
          <p className="mt-2 text-xs text-zinc-500">{fr ? "Lecture seule · configuré par l’application" : "Read only · configured by the application"}</p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-3 flex items-center gap-3"><Globe className="text-cyan-400" /><h2 className="text-xl font-bold text-white">{fr ? "Langue" : "Language"}</h2></div>
          <div className="flex gap-2">{(["Français", "English"] as const).map((value) => <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} className={`rounded-xl px-4 py-2 font-medium transition ${language === value ? "bg-cyan-500 text-black" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`}>{value}</button>)}</div>
        </section>

        <section aria-disabled="true" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 opacity-70">
          <div className="flex items-start gap-3"><Bell className="mt-0.5 text-zinc-500" /><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-white">{fr ? "Notifications" : "Notifications"}</h2><span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{unavailable}</span></div><p className="mt-1 text-sm text-zinc-400">{fr ? "Les notifications ne sont pas encore prises en charge." : "Notifications are not implemented yet."}</p></div></div>
        </section>

        <section aria-disabled="true" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 opacity-70">
          <div className="flex items-start gap-3"><Wallet className="mt-0.5 text-zinc-500" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-white">Wallet</h2><span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{unavailable}</span></div><p className="mt-1 text-sm text-zinc-400">{fr ? "Aucune préférence wallet supplémentaire n’est disponible." : "No additional wallet preferences are available."}</p></div></div>
        </section>

        <section aria-disabled="true" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 opacity-70">
          <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 text-zinc-500" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-white">{fr ? "Sécurité" : "Security"}</h2><span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{unavailable}</span></div><p className="mt-1 text-sm text-zinc-400">{fr ? "Les protections de sécurité supplémentaires ne sont pas encore disponibles." : "Additional security controls are not implemented yet."}</p></div></div>
        </section>
      </div>
    </MainLayout>
  );
}
