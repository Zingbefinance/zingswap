"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bsc, mainnet, type Chain } from "viem/chains";

export interface EvmRequestProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface EvmWalletOption {
  id: string;
  name: string;
  icon?: string;
  rdns?: string;
  provider: EvmRequestProvider;
}

interface EvmWalletContextValue {
  wallets: EvmWalletOption[];
  provider: EvmRequestProvider | null;
  walletName: string;
  account: string;
  chainId: number | null;
  error: string;
  connect: (wallet: EvmWalletOption) => Promise<void>;
  connectFirst: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: 1 | 56) => Promise<void>;
}

interface Eip6963Announcement extends Event {
  detail?: { info?: { uuid?: string; name?: string; icon?: string; rdns?: string }; provider?: EvmRequestProvider };
}

declare global {
  interface Window {
    trustwallet?: { ethereum?: EvmRequestProvider };
  }
}

const EvmWalletContext = createContext<EvmWalletContextValue | null>(null);
const supportedChains = new Map<number, Chain>([[1, mainnet], [56, bsc]]);

export function EvmWalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<EvmWalletOption[]>([]);
  const [provider, setProvider] = useState<EvmRequestProvider | null>(null);
  const [walletName, setWalletName] = useState("");
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const activeProviderRef = useRef<EvmRequestProvider | null>(null);
  const checkedWalletsRef = useRef(new WeakSet<object>());

  const registerWallet = useCallback((wallet: EvmWalletOption) => {
    setWallets((current) => current.some((item) => item.provider === wallet.provider)
      ? current
      : [...current, wallet]);
  }, []);

  useEffect(() => {
    const discovered = new Map<string, EvmWalletOption>();
    const announce = (event: Event) => {
      const detail = (event as Eip6963Announcement).detail;
      const info = detail?.info;
      if (!detail?.provider || !info) return;
      const option: EvmWalletOption = {
        id: info.uuid ?? info.rdns ?? info.name ?? `injected-${discovered.size}`,
        name: info.name ?? "Wallet EVM",
        icon: info.icon,
        rdns: info.rdns,
        provider: detail.provider,
      };
      if (discovered.has(option.id)) return;
      discovered.set(option.id, option);
      registerWallet(option);
    };

    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Trust Wallet exposes its EIP-1193 provider in its DApp browser.
    const trustProvider = window.trustwallet?.ethereum;
    if (trustProvider) {
      const trustOption = { id: "com.trustwallet.app", name: "Trust Wallet", rdns: "com.trustwallet.app", provider: trustProvider };
      discovered.set(trustOption.id, trustOption);
      registerWallet(trustOption);
    }

    // Keep compatibility with EIP-1193 wallets that have not implemented EIP-6963.
    const fallbackTimer = window.setTimeout(() => {
      const ethereum = window.ethereum as unknown as (EvmRequestProvider & { providers?: EvmRequestProvider[] }) | undefined;
      const legacyProviders: EvmRequestProvider[] = ethereum?.providers ?? (ethereum ? [ethereum] : []);
      legacyProviders.forEach((legacyProvider, index) => {
        if ([...discovered.values()].some((wallet) => wallet.provider === legacyProvider)) return;
        const option = { id: `injected-${index}`, name: "Injected EVM wallet", provider: legacyProvider };
        discovered.set(option.id, option);
        registerWallet(option);
      });
    }, 200);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("eip6963:announceProvider", announce);
    };
  }, [registerWallet]);

  useEffect(() => {
    for (const wallet of wallets) {
      if (checkedWalletsRef.current.has(wallet.provider)) continue;
      checkedWalletsRef.current.add(wallet.provider);
      void wallet.provider.request({ method: "eth_accounts" }).then(async (accounts) => {
        if (activeProviderRef.current || !Array.isArray(accounts) || typeof accounts[0] !== "string") return;
        const rawChainId = await wallet.provider.request({ method: "eth_chainId" });
        if (activeProviderRef.current) return;
        activeProviderRef.current = wallet.provider;
        setProvider(wallet.provider);
        setWalletName(wallet.name);
        setAccount(accounts[0]);
        setChainId(typeof rawChainId === "string" ? Number.parseInt(rawChainId, 16) : Number(rawChainId));
      }).catch(() => undefined);
    }
  }, [wallets]);

  const connect = useCallback(async (wallet: EvmWalletOption) => {
    setError("");
    try {
      const accounts = await wallet.provider.request({ method: "eth_requestAccounts" });
      const rawChainId = await wallet.provider.request({ method: "eth_chainId" });
      const selectedAccount = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
      if (!selectedAccount) throw new Error("Le wallet n’a renvoyé aucun compte EVM.");
      activeProviderRef.current = wallet.provider;
      setProvider(wallet.provider);
      setWalletName(wallet.name);
      setAccount(selectedAccount);
      setChainId(typeof rawChainId === "string" ? Number.parseInt(rawChainId, 16) : Number(rawChainId));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Connexion du wallet EVM impossible.";
      setError(message);
      throw cause;
    }
  }, []);

  useEffect(() => {
    if (!provider) return;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      setAccount(Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "");
    };
    const onChainChanged = (...args: unknown[]) => {
      const chain = args[0];
      setChainId(typeof chain === "string" ? Number.parseInt(chain, 16) : typeof chain === "number" ? chain : null);
    };
    const onDisconnect = () => {
      activeProviderRef.current = null;
      setProvider(null);
      setWalletName("");
      setAccount("");
      setChainId(null);
    };
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    provider.on?.("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [provider]);

  const connectFirst = useCallback(async () => {
    if (!wallets.length) throw new Error("Aucun wallet EVM compatible détecté. Ouvre le site dans ton wallet ou installe une extension compatible EIP-1193.");
    await connect(wallets[0]);
  }, [connect, wallets]);

  const disconnect = useCallback(async () => {
    const activeProvider = provider;
    activeProviderRef.current = null;
    setProvider(null);
    setWalletName("");
    setAccount("");
    setChainId(null);
    setError("");
    // Revoke account access when supported. Many wallets only expose local dapp disconnect.
    try {
      await activeProvider?.request({ method: "wallet_revokePermissions", params: { eth_accounts: {} } });
    } catch {
      // The EIP-1193 connection is still cleared from this app.
    }
  }, [provider]);

  const switchChain = useCallback(async (targetChainId: 1 | 56) => {
    if (!provider) throw new Error("Connecte d’abord un wallet EVM.");
    const target = supportedChains.get(targetChainId)!;
    const switchRequest = () => provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${target.id.toString(16)}` }] });
    try {
      await switchRequest();
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? (cause as { code?: unknown }).code : undefined;
      if (code !== 4902) {
        setError(cause instanceof Error ? cause.message : "Le wallet a refusé le changement de réseau.");
        throw cause;
      }
      try {
        await provider.request({ method: "wallet_addEthereumChain", params: [{
          chainId: `0x${target.id.toString(16)}`,
          chainName: target.name,
          nativeCurrency: target.nativeCurrency,
          rpcUrls: target.rpcUrls.default.http,
          blockExplorerUrls: target.blockExplorers?.default?.url ? [target.blockExplorers.default.url] : [],
        }] });
        await switchRequest();
      } catch (addCause) {
        setError(addCause instanceof Error ? addCause.message : "Impossible d’ajouter ou de sélectionner ce réseau dans le wallet.");
        throw addCause;
      }
    }
    setChainId(targetChainId);
    setError("");
  }, [provider]);

  const value = useMemo<EvmWalletContextValue>(() => ({
    wallets, provider, walletName, account, chainId, error, connect, connectFirst, disconnect, switchChain,
  }), [wallets, provider, walletName, account, chainId, error, connect, connectFirst, disconnect, switchChain]);

  return <EvmWalletContext.Provider value={value}>{children}</EvmWalletContext.Provider>;
}

export function useEvmWallet() {
  const value = useContext(EvmWalletContext);
  if (!value) throw new Error("useEvmWallet doit être utilisé dans EvmWalletProvider.");
  return value;
}
