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

const menu = [
  {
    icon: ArrowLeftRight,
    label: "Swap",
    href: "/",
  },
  {
    icon: Droplets,
    label: "Liquidity",
    href: "/liquidity",
  },
  {
    icon: BarChart3,
    label: "Analytics",
    href: "/analytics",
  },
  {
    icon: Wallet,
    label: "Portfolio",
    href: "/portfolio",
  },
  {
    icon: Settings,
    label: "Settings",
    href: "/settings",
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="h-screen w-72 border-r border-zinc-800 bg-zinc-950 p-6">
      <Logo />

      <nav className="mt-10 space-y-3">
        {menu.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex w-full items-center gap-4 rounded-xl px-4 py-3 transition ${
                active
                  ? "bg-cyan-500 text-black"
                  : "text-zinc-400 hover:bg-cyan-500 hover:text-black"
              }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}