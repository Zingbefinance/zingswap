"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import {
  ArrowLeftRight,
  Droplets,
  BarChart3,
  Wallet,
  Settings,
} from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageContext";

const menu = [
  {
    icon: ArrowLeftRight,
    key: "swap",
    href: "/",
  },
  {
    icon: Droplets,
    key: "liquidity",
    href: "/liquidity",
  },
  {
    icon: BarChart3,
    key: "analytics",
    href: "/analytics",
  },
  {
    icon: Wallet,
    key: "portfolio",
    href: "/portfolio",
  },
  {
    icon: Settings,
    key: "settings",
    href: "/settings",
  },
];

const labels = {
  Français: {
    swap: "Swap",
    liquidity: "Liquidité",
    analytics: "Graphique",
    portfolio: "Portefeuille",
    settings: "Paramètres",
  },
  English: {
    swap: "Swap",
    liquidity: "Liquidity",
    analytics: "Analytics",
    portfolio: "Portfolio",
    settings: "Settings",
  },
};

export default function Sidebar() {
  const pathname = usePathname();
  const { language } = useLanguage();

  const currentLabels = labels[language];

  return (
    <aside className="h-screen w-72 border-r border-zinc-800 bg-zinc-950 p-6">
      <Logo />

      <nav className="mt-10 space-y-3">
        {menu.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex w-full items-center gap-4 rounded-xl px-4 py-3 transition ${
                active
                  ? "bg-cyan-500 text-black"
                  : "text-zinc-400 hover:bg-cyan-500 hover:text-black"
              }`}
            >
              <Icon size={20} />
              <span>{currentLabels[item.key as keyof typeof currentLabels]}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}