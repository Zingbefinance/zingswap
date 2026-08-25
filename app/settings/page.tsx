"use client";
import { useLanguage } from "@/components/providers/LanguageContext";
import MainLayout from "@/components/layout/MainLayout";
import {
  Settings,
  Wallet,
  Globe,
  Bell,
  Gauge,
  Shield,
} from "lucide-react";
import { useState } from "react";

type Language = "Français" | "English";

const translations = {
  Français: {
    title: "Paramètres",
    subtitle: "Configurez votre expérience ZingSwap.",
    slippage: "Slippage",
    network: "Réseau",
    language: "Langue",
    notifications: "Notifications",
    notificationDescription: "Recevoir les annonces et alertes.",
    wallet: "Wallet",
    walletDescription:
      "Les paramètres avancés du wallet seront ajoutés ici.",
    security: "Sécurité",
    securityDescription:
      "Les protections anti-slippage et validations seront intégrées progressivement.",
  },
  English: {
    title: "Settings",
    subtitle: "Configure your ZingSwap experience.",
    slippage: "Slippage",
    network: "Network",
    language: "Language",
    notifications: "Notifications",
    notificationDescription: "Receive announcements and alerts.",
    wallet: "Wallet",
    walletDescription:
      "Advanced wallet settings will be added here.",
    security: "Security",
    securityDescription:
      "Anti-slippage protections and validations will be integrated progressively.",
  },
};

export default function SettingsPage() {
  const [slippage, setSlippage] = useState("0.5%");
  const [network, setNetwork] = useState("Mainnet");
  
  const [notifications, setNotifications] = useState(true);
  const { language, setLanguage } = useLanguage();
  const t = translations[language];

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* En-tête */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center gap-3">
            <Settings
              className="text-cyan-400"
              size={28}
            />

            <div>
              <h1 className="text-3xl font-bold text-white">
                {t.title}
              </h1>

              <p className="mt-2 text-zinc-400">
                {t.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Slippage */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-3 flex items-center gap-3">
            <Gauge className="text-cyan-400" />

            <h2 className="text-xl font-bold text-white">
              {t.slippage}
            </h2>
          </div>

          <div className="flex gap-2">
            {["0.1%", "0.5%", "1%", "3%"].map((value) => (
              <button
                key={value}
                onClick={() => setSlippage(value)}
                className={`rounded-xl px-4 py-2 font-medium transition ${
                  slippage === value
                    ? "bg-cyan-500 text-black"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {/* Réseau */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-3 flex items-center gap-3">
            <Globe className="text-cyan-400" />

            <h2 className="text-xl font-bold text-white">
              {t.network}
            </h2>
          </div>

          <div className="flex gap-2">
            {["Mainnet", "Devnet"].map((value) => (
              <button
                key={value}
                onClick={() => setNetwork(value)}
                className={`rounded-xl px-4 py-2 font-medium transition ${
                  network === value
                    ? "bg-cyan-500 text-black"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {/* Langue */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-3 flex items-center gap-3">
            <Globe className="text-cyan-400" />

            <h2 className="text-xl font-bold text-white">
              {t.language}
            </h2>
          </div>

          <div className="flex gap-2">
            {(["Français", "English"] as Language[]).map(
              (value) => (
                <button
                  key={value}
                  onClick={() => setLanguage(value)}
                  className={`rounded-xl px-4 py-2 font-medium transition ${
                    language === value
                      ? "bg-cyan-500 text-black"
                      : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {value}
                </button>
              )
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="text-cyan-400" />

              <div>
                <h2 className="font-bold text-white">
                  {t.notifications}
                </h2>

                <p className="text-sm text-zinc-400">
                  {t.notificationDescription}
                </p>
              </div>
            </div>

            <button
              onClick={() =>
                setNotifications(!notifications)
              }
              className={`h-8 w-16 rounded-full transition ${
                notifications
                  ? "bg-cyan-500"
                  : "bg-zinc-700"
              }`}
            >
              <div
                className={`h-7 w-7 rounded-full bg-white transition ${
                  notifications
                    ? "translate-x-8"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Wallet */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center gap-3">
            <Wallet className="text-cyan-400" />

            <div>
              <h2 className="font-bold text-white">
                {t.wallet}
              </h2>

              <p className="text-sm text-zinc-400">
                {t.walletDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Sécurité */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center gap-3">
            <Shield className="text-cyan-400" />

            <div>
              <h2 className="font-bold text-white">
                {t.security}
              </h2>

              <p className="text-sm text-zinc-400">
                {t.securityDescription}
              </p>
            </div>
          </div>
        </div>

      </div>
    </MainLayout>
  );
}