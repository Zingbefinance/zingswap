"use client";
import { useEffect, useState } from "react";
import { Search, Bell, ChevronDown, Check } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";

export default function Topbar() {
  const {
    connected,
    publicKey,
    connecting,
    wallet,
    wallets,
    select,
    connect,
    disconnect,
  } = useWallet();

  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);
 const walletLabel = !mounted
  ? "Connect Wallet"
  : connected && publicKey
  ? `${publicKey.toBase58().slice(0, 4)}...${publicKey
      .toBase58()
      .slice(-4)}`
  : wallet?.adapter.name ?? "Connect Wallet"; 

  const handleWalletClick = async () => {
    try {
      if (connected) {
        await disconnect();
        return;
      }

      if (wallet) {
        await connect();
        return;
      }

      setWalletMenuOpen((previous) => !previous);
    } catch (error) {
      console.error("Erreur connexion wallet :", error);
    }
  };

  const handleSelectWallet = async (
    walletName: typeof wallets[number]["adapter"]["name"]
  ) => {
    try {
      select(walletName);
      setWalletMenuOpen(false);

      // Laisser le WalletProvider terminer la sélection
      // avant de demander la connexion.
      setTimeout(async () => {
        try {
          await connect();
        } catch (error) {
          console.error("Erreur connexion wallet :", error);
        }
      }, 100);
    } catch (error) {
      console.error("Erreur sélection wallet :", error);
    }
  };

  return (
    <header className="relative flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-4">
      <h1 className="text-2xl font-bold text-white">
        Dashboard
      </h1>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2">
          <Search size={18} className="text-zinc-400" />

          <input
            type="text"
            placeholder="Search token..."
            className="w-40 bg-transparent text-white outline-none placeholder:text-zinc-500"
          />
        </div>

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          className="rounded-xl bg-zinc-900 p-3 text-white transition hover:bg-cyan-500 hover:text-black"
        >
          <Bell size={18} />
        </button>

        {/* Wallet */}
        <div className="relative">
          <button
            type="button"
            onClick={handleWalletClick}
            disabled={connecting}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span>
              {connecting ? "Connecting..." : walletLabel}
            </span>

            {!connected && !connecting && (
              <ChevronDown size={17} />
            )}
          </button>

          {/* Wallet menu */}
          {!connected && walletMenuOpen && (
            <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
              <div className="border-b border-zinc-800 px-4 py-3">
                <p className="text-sm font-semibold text-white">
                  Connect Wallet
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  Choose your preferred wallet
                </p>
              </div>

              <div className="p-2">
                {wallets.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-zinc-500">
                    No wallet available
                  </div>
                ) : (
                  wallets.map((walletItem) => {
                    const walletName =
                      walletItem.adapter.name;

                    const ready =
                      walletItem.readyState === "Installed" ||
                      walletItem.readyState === "Loadable";

                    const isSelected =
                      wallet?.adapter.name === walletName;

                    return (
                      <button
                        key={walletName}
                        type="button"
                        disabled={!ready}
                        onClick={() =>
                          handleSelectWallet(walletName)
                        }
                        className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm text-white transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-xs font-bold text-cyan-400">
                            {walletName
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>

                          <div>
                            <p className="font-medium">
                              {walletName}
                            </p>

                            <p className="text-xs text-zinc-500">
                              {ready
                                ? "Available"
                                : "Not installed"}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <Check
                            size={17}
                            className="text-cyan-400"
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}