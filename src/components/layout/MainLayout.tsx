"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import {
  ArrowLeftRight,
  Droplets,
  BarChart3,
  Wallet,
  Settings,
} from "lucide-react";

interface Props {
  children: ReactNode;
}

const mobileMenu = [
  { icon: ArrowLeftRight, label: "Swap", href: "/" },
  { icon: Droplets, label: "Liquidity", href: "/liquidity" },
  { icon: BarChart3, label: "Graphique", href: "/analytics" },
  { icon: Wallet, label: "Portfolio", href: "/portfolio" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export default function MainLayout({ children }: Props) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-black text-white md:flex">
      <aside className="hidden md:block md:w-72 md:shrink-0">
        <Sidebar />
      </aside>

      <main className="min-w-0 w-full flex-1 space-y-6 overflow-x-hidden p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:space-y-8 md:p-8 md:pb-8">
        <Topbar />
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {mobileMenu.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href === "/" && pathname === "/tokens");

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 transition ${
                  active
                    ? "text-cyan-400"
                    : "text-zinc-400 hover:text-cyan-400"
                }`}
              >
                <Icon size={20} />
                <span className="max-w-full truncate text-[10px] sm:text-[11px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
