"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Droplets,
  Sprout,
  Lock,
  BarChart3,
  Wallet,
  Coins,
  Settings,
} from "lucide-react";

const menuItems = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Swap",
    href: "/swap",
    icon: ArrowLeftRight,
  },
  {
    name: "Liquidity",
    href: "/liquidity",
    icon: Droplets,
  },
  {
    name: "Farms",
    href: "/farms",
    icon: Sprout,
  },
  {
    name: "Staking",
    href: "/staking",
    icon: Lock,
  },
  {
    name: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    name: "Portfolio",
    href: "/portfolio",
    icon: Wallet,
  },
  {
    name: "ZING Token",
    href: "/token",
    icon: Coins,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-[#0B0F19] border-r border-gray-800 flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-violet-500">
          ZingSwap
        </h1>

        <p className="text-xs text-gray-400 mt-1">
          Decentralized Exchange
        </p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-300 hover:bg-violet-600 hover:text-white transition-all duration-300"
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="rounded-xl bg-violet-600/20 border border-violet-600 p-4">
          <p className="text-white font-semibold">
            ZING TOKEN
          </p>

          <p className="text-gray-300 text-sm mt-1">
            Native token of ZingSwap
          </p>
        </div>
      </div>
    </aside>
  );
}