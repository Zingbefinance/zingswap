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
  },
  {
    icon: Droplets,
    label: "Liquidity",
  },
  {
    icon: BarChart3,
    label: "Analytics",
  },
  {
    icon: Wallet,
    label: "Portfolio",
  },
  {
    icon: Settings,
    label: "Settings",
  },
];

export default function Sidebar() {
  return (
    <aside className="w-72 h-screen bg-zinc-950 border-r border-zinc-800 p-6">
      <Logo />

      <nav className="mt-10 space-y-3">
        {menu.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-zinc-400 transition hover:bg-cyan-500 hover:text-black"
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}