import { ReactNode } from "react";
import Link from "next/link";
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
  { icon: BarChart3, label: "Analytics", href: "#" },
  { icon: Wallet, label: "Portfolio", href: "#" },
  { icon: Settings, label: "Settings", href: "#" },
];

export default function MainLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-black text-white md:flex">
      {/* Sidebar Desktop */}
      <aside className="hidden md:block md:w-64 md:shrink-0">
        <Sidebar />
      </aside>

      {/* Contenu principal */}
      <main className="w-full flex-1 p-4 pb-24 md:p-8 md:pb-8 space-y-6 md:space-y-8 overflow-x-hidden">
        <Topbar />
        {children}
      </main>

      {/* Bottom Navigation Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 py-2">
          {mobileMenu.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex flex-col items-center justify-center gap-1 py-2 text-zinc-400 transition hover:text-cyan-400"
              >
                <Icon size={20} />
                <span className="text-[11px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}