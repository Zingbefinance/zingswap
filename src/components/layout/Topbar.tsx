"use client";

import { useLanguage } from "@/components/providers/LanguageContext";
import { Search, Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEvmWallet } from "@/components/providers/EvmWalletProvider";
import { useState } from "react";

export default function Topbar() {
  const { connected: solConnected, publicKey: solPublicKey, disconnect: disconnectSolana } = useWallet();
  const { setVisible } = useWalletModal();
  const { language } = useLanguage();
  const evm = useEvmWallet();
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [walletActionError, setWalletActionError] = useState("");

  const labels = {
    Français: {
      connectWallet: "Connecter le wallet",
      search: "Rechercher un token...",
    },
    English: {
      connectWallet: "Connect Wallet",
      search: "Search token...",
    },
  };

  const t = labels[language];

  const shortAddress = (address: string) => `${address.slice(0, 5)}…${address.slice(-4)}`;
  const openTrustWallet = () => {
    const currentUrl = window.location.href;
    window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(currentUrl)}`;
  };
  const evmNetworkName = evm.chainId === 1 ? "Ethereum" : evm.chainId === 56 ? "BNB Chain" : evm.chainId ? `Réseau EVM ${evm.chainId}` : "Réseau non détecté";

  return (
    <header className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 md:px-6 md:py-4">
      {/* Ligne du haut */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <img
            src="/images/zingswap-logo.png"
            alt="ZingSwap"
            width={1310}
            height={1200}
            className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
          />

          <span className="truncate text-lg font-bold text-white sm:text-xl">
            ZingSwap
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setWalletMenuOpen((open) => !open)}
            aria-expanded={walletMenuOpen}
            aria-haspopup="dialog"
            className="flex max-w-[52vw] cursor-pointer items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 active:scale-95 sm:max-w-none sm:px-4 sm:text-base"
          >
            <Wallet size={18} />
            <span className="hidden sm:inline">{solConnected ? shortAddress(solPublicKey?.toBase58() ?? "") : evm.account ? shortAddress(evm.account) : t.connectWallet}</span>
          </button>

          {walletMenuOpen && <div role="dialog" aria-label={language === "Français" ? "Connexion des wallets" : "Wallet connections"} className="absolute right-0 z-50 mt-2 max-h-[calc(100dvh-7rem)] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-3 text-white shadow-2xl sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{language === "Français" ? "Connecter un wallet" : "Connect a wallet"}</h2>
              <button type="button" onClick={() => setWalletMenuOpen(false)} aria-label={language === "Français" ? "Fermer" : "Close"} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800">×</button>
            </div>

            <section className="border-t border-zinc-800 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div><p className="font-medium">Solana</p><p className="text-xs text-zinc-500">Phantom, Solflare et wallets Wallet Standard détectés</p></div>
                {solConnected && <span className="font-mono text-xs text-cyan-300">{shortAddress(solPublicKey?.toBase58() ?? "")}</span>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setVisible(true)} className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700">{solConnected ? (language === "Français" ? "Changer de wallet" : "Change wallet") : (language === "Français" ? "Choisir un wallet" : "Choose wallet")}</button>
                {solConnected && <button type="button" onClick={() => void disconnectSolana().then(() => setWalletActionError("")).catch(() => setWalletActionError(language === "Français" ? "La déconnexion Solana a échoué." : "Could not disconnect the Solana wallet."))} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-red-700">{language === "Français" ? "Déconnecter" : "Disconnect"}</button>}
              </div>
            </section>

            <section className="border-t border-zinc-800 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div><p className="font-medium">Ethereum · BNB Chain</p><p className="text-xs text-zinc-500">{evm.account ? `${evm.walletName} · ${evmNetworkName}` : "EIP-6963 / EIP-1193"}</p></div>
                {evm.account && <span className="font-mono text-xs text-cyan-300">{shortAddress(evm.account)}</span>}
              </div>
              {evm.account ? <div className="space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => void evm.switchChain(1).catch(() => undefined)} className={`flex-1 rounded-lg px-3 py-2 text-sm ${evm.chainId === 1 ? "bg-cyan-700" : "bg-zinc-800 hover:bg-zinc-700"}`}>Ethereum</button>
                  <button type="button" onClick={() => void evm.switchChain(56).catch(() => undefined)} className={`flex-1 rounded-lg px-3 py-2 text-sm ${evm.chainId === 56 ? "bg-cyan-700" : "bg-zinc-800 hover:bg-zinc-700"}`}>BNB Chain</button>
                </div>
                <button type="button" onClick={() => void evm.disconnect()} className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-red-700">{language === "Français" ? "Déconnecter le wallet EVM" : "Disconnect EVM wallet"}</button>
              </div> : <div className="space-y-2">
                {evm.wallets.map((wallet) => <button key={wallet.id} type="button" onClick={() => void evm.connect(wallet).catch(() => undefined)} className="flex w-full items-center gap-3 rounded-lg bg-zinc-800 px-3 py-2 text-left text-sm hover:bg-zinc-700">
                  {wallet.icon ? <img src={wallet.icon} alt="" className="h-5 w-5 rounded" /> : <Wallet size={18} className="text-cyan-300" />}{wallet.name}
                </button>)}
                {!evm.wallets.length && <p className="text-xs text-zinc-500">{language === "Français" ? "Aucun wallet EVM injecté détecté dans ce navigateur." : "No injected EVM wallet detected in this browser."}</p>}
                <button type="button" onClick={openTrustWallet} className="w-full rounded-lg border border-cyan-800 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-950/40">{language === "Français" ? "Ouvrir dans Trust Wallet mobile" : "Open in Trust Wallet mobile"}</button>
              </div>}
              {evm.error && <p role="alert" className="mt-2 text-xs text-red-300">{evm.error}</p>}
            </section>
            {walletActionError && <p role="alert" className="mt-2 text-xs text-red-300">{walletActionError}</p>}
          </div>}
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="mt-4">
        <div className="flex min-w-0 w-full items-center gap-2 rounded-xl bg-zinc-900 px-3 py-3 sm:px-4">
          <Search
            size={18}
            className="shrink-0 text-zinc-400"
          />

          <input
            placeholder={t.search}
            className="min-w-0 w-full bg-transparent text-white outline-none placeholder:text-zinc-500"
          />
        </div>
      </div>
    </header>
  );
}
