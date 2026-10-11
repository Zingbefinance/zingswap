"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEvmWallet } from "@/components/providers/EvmWalletProvider";
import { useRouter } from "next/navigation";
import { convertQuoteToRoute, createClient, executeRoute, type RouteExtended, type SDKProvider } from "@lifi/sdk";
import { EthereumProvider } from "@lifi/sdk-provider-ethereum";
import { SolanaProvider } from "@lifi/sdk-provider-solana";
import { createWalletClient, custom, type Address } from "viem";
import { bsc, mainnet, type Chain } from "viem/chains";
import type { Wallet } from "@wallet-standard/base";
import { getSwapNetwork, isSolanaNetwork, LIFI_SOL_NATIVE_ADDRESS, type SwapNetworkId } from "@/lib/lifi/chains";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NATIVE_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const lifiClient = createClient({ integrator: "zingswap", disableVersionCheck: true });

type EvmToken = {
  address: string;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  priceUSD?: string | number;
  logoURI?: string;
};
type Quote = Parameters<typeof convertQuoteToRoute>[0] & {
  zingswapFee?: { requested: string; confirmed: boolean };
};
type ExecutionState = { status: "idle" | "running" | "success" | "failed" | "paused"; txHash?: string; message?: string };
type QuoteDiagnostic = {
  type?: string;
  upstreamStatus?: number;
  upstreamCode?: string | number;
  chainIds?: { from?: string; to?: string };
  tokens?: { from?: string | null; to?: string | null };
  rawAmount?: string | null;
  addressFormatsValid?: Record<string, boolean>;
};
function formatUnits(value: string | bigint, decimals: number, maxFraction = 6) {
  const amount = typeof value === "bigint" ? value : BigInt(value || "0");
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parseUnits(value: string, decimals: number) {
  const normalized = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return "";
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return "";
  return (BigInt(whole || "0") * (BigInt(10) ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, "0") || "0")).toString();
}

function isNativeToken(address: string, chainId: number) {
  if (isSolanaNetwork(chainId)) return address === LIFI_SOL_NATIVE_ADDRESS;
  return address.toLowerCase() === ZERO_ADDRESS || address.toLowerCase() === NATIVE_ADDRESS;
}

function isValidToken(token: EvmToken, chainId: number) {
  const addressValid = isSolanaNetwork(chainId)
    ? token.address === LIFI_SOL_NATIVE_ADDRESS || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.address)
    : /^0x[\da-fA-F]{40}$/.test(token.address);
  return addressValid && token.chainId === chainId && Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 255;
}

function tokenUsdPrice(token: EvmToken | undefined) {
  const price = Number(token?.priceUSD);
  if (!token?.priceUSD || !Number.isFinite(price) || price <= 0) return "";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumSignificantDigits: 5,
  }).format(price);
}

function feeRate(value: string | number | undefined) {
  if (value === undefined) return undefined;
  const raw = String(value).trim();
  const parsed = Number(raw.replace(/%$/, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return raw.endsWith("%") ? parsed / 100 : parsed;
}

function formatPercentagePoints(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value)} %`;
}

function formatFeePercentage(value: string | number | undefined) {
  const rate = feeRate(value);
  return rate === undefined ? undefined : formatPercentagePoints(rate * 100);
}

function feeAmount(amount: string | undefined, token: { decimals: number; symbol: string } | undefined) {
  if (!amount || !/^\d+$/.test(amount) || !token || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) {
    return "Montant indisponible";
  }
  return `${formatUnits(amount, token.decimals, 8)} ${token.symbol}`;
}

const chainDefinitions = new Map<number, Chain>([[1, mainnet], [56, bsc]]);

export default function EvmSwapCard({ fromChain, toChain, initialFromToken = "", initialToToken = "" }: { fromChain: SwapNetworkId; toChain: SwapNetworkId; initialFromToken?: string; initialToToken?: string }) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey: solPublicKey, connected: solConnected, wallet: solWallet } = useWallet();
  const { setVisible: setSolanaWalletModalVisible } = useWalletModal();
  const evmWallet = useEvmWallet();
  const { account, provider: evmProvider, chainId: walletChainId } = evmWallet;
  const providerAvailable = Boolean(evmProvider);
  const [tokens, setTokens] = useState<Record<number, EvmToken[]>>({});
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [walletError, setWalletError] = useState("");
  const [execution, setExecution] = useState<ExecutionState>({ status: "idle" });
  const [executing, setExecuting] = useState(false);

  const solanaStandardWallet = solWallet?.adapter && "standard" in solWallet.adapter && solWallet.adapter.standard && "wallet" in solWallet.adapter
    ? (solWallet.adapter as typeof solWallet.adapter & { wallet: Wallet }).wallet
    : null;

  const fromTokens = tokens[fromChain] ?? [];
  const toTokens = tokens[toChain] ?? [];
  const fromToken = fromTokens.find((token) => token.address === fromAddress);
  const toToken = toTokens.find((token) => token.address === toAddress);
  const openTokenSearch = (side: "from" | "to") => {
    const params = new URLSearchParams({
      side,
      network: String(side === "from" ? fromChain : toChain),
      fromChain: String(fromChain),
      toChain: String(toChain),
      fromToken: fromAddress,
      toToken: toAddress,
    });
    router.push(`/tokens?${params.toString()}`);
  };
  const sourceAddress = isSolanaNetwork(fromChain) ? solPublicKey?.toBase58() ?? "" : account;
  const destinationAddress = isSolanaNetwork(toChain) ? solPublicKey?.toBase58() ?? "" : account;
  const walletOnSource = isSolanaNetwork(fromChain)
    ? solConnected && Boolean(solPublicKey)
    : Boolean(account && walletChainId === fromChain);
  const walletReady = walletOnSource && Boolean(destinationAddress) && (isSolanaNetwork(toChain) || Boolean(account));
  const amountInSmallestUnits = useMemo(() => fromToken ? parseUnits(amount, fromToken.decimals) : "", [amount, fromToken]);

  const loadTokens = useCallback(async (chainId: number) => {
    if (tokens[chainId]) return;
    try {
      const response = await fetch(`/api/lifi?resource=tokens&chainId=${chainId}`, { cache: "no-store" });
      const payload = await response.json() as { tokens?: Record<string, EvmToken[]>; error?: string };
      if (!response.ok) throw new Error(payload.error || "Impossible de charger les tokens.");
      const list = (payload.tokens?.[String(chainId)] ?? []).filter((token) =>
        typeof token.address === "string" && typeof token.symbol === "string" && isValidToken(token, chainId),
      );
      if (!list.length) throw new Error(`LI.FI n’a renvoyé aucun token valide pour le réseau ${chainId}.`);
      setTokens((current) => ({ ...current, [chainId]: list }));
      if (list.length) {
        const native = list.find((token) => isNativeToken(token.address, chainId));
        const stable = list.find((token) => ["USDC", "USDT"].includes(token.symbol.toUpperCase()));
        const initial = native ?? stable ?? list[0];
        if (chainId === fromChain) setFromAddress((current) => current || initial.address);
        if (chainId === toChain) setToAddress((current) => current || initial.address);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger les tokens LI.FI.");
    }
  }, [fromChain, toChain, tokens]);

  useEffect(() => { void loadTokens(fromChain); }, [fromChain, loadTokens]);
  useEffect(() => { void loadTokens(toChain); }, [toChain, loadTokens]);

  useEffect(() => { if (initialFromToken) setFromAddress(initialFromToken); }, [initialFromToken]);
  useEffect(() => { if (initialToToken) setToAddress(initialToToken); }, [initialToToken]);

  useEffect(() => {
    if (fromTokens.length && !fromTokens.some((token) => token.address === fromAddress)) {
      const initial = fromTokens.find((token) => isNativeToken(token.address, fromChain)) ?? fromTokens[0];
      setFromAddress(initial.address);
    }
  }, [fromAddress, fromTokens]);

  useEffect(() => {
    if (toTokens.length && !toTokens.some((token) => token.address === toAddress)) {
      const initial = toTokens.find((token) => isNativeToken(token.address, toChain)) ?? toTokens[0];
      setToAddress(initial.address);
    }
  }, [toAddress, toTokens]);

  useEffect(() => {
    let cancelled = false;
    if (!walletOnSource || !fromToken) { setBalance(null); return; }
    const readBalance = async () => {
      if (isSolanaNetwork(fromChain) && solPublicKey) {
        if (isNativeToken(fromToken.address, fromChain)) {
          return BigInt(await connection.getBalance(solPublicKey, "confirmed"));
        }
        const mint = new PublicKey(fromToken.address);
        const [legacy, token2022] = await Promise.all([
          connection.getParsedTokenAccountsByOwner(solPublicKey, { programId: TOKEN_PROGRAM_ID }, "confirmed"),
          connection.getParsedTokenAccountsByOwner(solPublicKey, { programId: TOKEN_2022_PROGRAM_ID }, "confirmed"),
        ]);
        return [...legacy.value, ...token2022.value].reduce((total, accountInfo) => {
          const parsed = accountInfo.account.data.parsed.info;
          if (parsed.mint === mint.toBase58()) total += BigInt(parsed.tokenAmount.amount);
          return total;
        }, BigInt(0));
      }
      if (!evmProvider) throw new Error("Wallet EVM absent");
      const result = isNativeToken(fromToken.address, fromChain)
        ? await evmProvider.request({ method: "eth_getBalance", params: [sourceAddress, "latest"] })
        : await evmProvider.request({
            method: "eth_call",
            params: [{ to: fromToken.address, data: `0x70a08231${sourceAddress.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"],
          });
      if (typeof result !== "string") throw new Error("Réponse de solde invalide");
      return BigInt(result);
    };
    void readBalance().then((rawBalance) => {
      if (!cancelled) setBalance(formatUnits(rawBalance, fromToken.decimals));
    }).catch(() => { if (!cancelled) setBalance(null); });
    return () => { cancelled = true; };
  }, [account, connection, evmProvider, fromChain, fromToken, sourceAddress, solPublicKey, walletOnSource]);

  const connectWallet = async () => {
    setWalletError("");
    try {
      await evmWallet.connectFirst();
    } catch (cause) {
      setWalletError(cause instanceof Error ? cause.message : "Connexion du wallet impossible.");
    }
  };

  const switchWalletChain = async (targetChainId = fromChain) => {
    const chain = getSwapNetwork(targetChainId);
    if (!evmProvider || !chain) return;
    try {
      if (chain.kind !== "evm") return;
      await evmWallet.switchChain(chain.id as 1 | 56);
      setWalletError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Changement de réseau refusé par le wallet.";
      setWalletError(message);
      throw new Error(message);
    }
  };

  const executeSwap = async () => {
    if (!quote || !walletReady || !fromToken || !toToken) return;
    setExecuting(true);
    setExecution({ status: "running", message: "Préparation de l’exécution dans les wallets connectés…" });
    setError("");
    try {
      const providers: SDKProvider[] = [];
      if (evmProvider && account) {
        const initialEvmChainId = isSolanaNetwork(fromChain) ? toChain : fromChain;
        const initialEvmNetwork = getSwapNetwork(initialEvmChainId);
        const activeChain = await evmProvider.request({ method: "eth_chainId" });
        let activeWalletChainId = typeof activeChain === "string" ? Number.parseInt(activeChain, 16) : initialEvmChainId;
        if (initialEvmNetwork?.kind === "evm" && activeWalletChainId !== initialEvmChainId) {
          await evmWallet.switchChain(initialEvmChainId as 1 | 56);
          activeWalletChainId = initialEvmChainId;
        }
        const getWalletClient = async (chainId: number) => {
          const chain = chainDefinitions.get(chainId);
          if (!chain) throw new Error("Ce réseau EVM n’est pas configuré pour ce wallet.");
          return createWalletClient({ account: account as Address, chain, transport: custom(evmProvider) });
        };
        providers.push(EthereumProvider({
          getWalletClient: () => getWalletClient(activeWalletChainId),
          switchChain: async (chainId) => {
            const target = getSwapNetwork(chainId);
            if (!target || target.kind !== "evm") throw new Error("Changement vers ce réseau impossible avec le wallet EVM connecté.");
            await evmWallet.switchChain(chainId as 1 | 56);
            activeWalletChainId = chainId;
            return getWalletClient(chainId);
          },
        }));
      }
      if (solanaStandardWallet) {
        providers.push(SolanaProvider({ getWallet: async () => solanaStandardWallet }));
      }
      if (!providers.length) throw new Error("Aucun provider de wallet compatible n’est connecté.");
      lifiClient.setProviders(providers);

      const route = convertQuoteToRoute(quote);
      const completedRoute = await executeRoute(lifiClient, route, {
        updateRouteHook: (updatedRoute: RouteExtended) => {
          const actions = updatedRoute.steps.flatMap((step) => step.execution?.actions ?? []);
          const latest = actions.at(-1);
          setExecution({
            status: "running",
            txHash: latest?.txHash,
            message: latest?.status === "ACTION_REQUIRED"
              ? "Une action ou signature est requise dans ton wallet."
              : latest?.txHash
                ? "Transaction envoyée. LI.FI suit sa confirmation et les étapes suivantes."
                : "LI.FI prépare la prochaine étape du swap…",
          });
        },
      });
      const stepsDone = completedRoute.steps.length > 0 && completedRoute.steps.every((step) => step.execution?.status === "DONE");
      const txHash = completedRoute.steps.flatMap((step) => step.execution?.actions ?? []).map((action) => action.txHash).filter((hash): hash is string => Boolean(hash)).at(-1);
      if (!stepsDone) {
        setExecution({ status: "paused", txHash, message: "Le suivi LI.FI s’est mis en pause avant la confirmation finale. Ne soumets pas à nouveau cette cotation." });
        return;
      }
      setExecution({ status: "success", txHash, message: "Swap confirmé par le suivi d’exécution LI.FI." });
    } catch {
      setExecution((current) => ({ ...current, status: "failed", message: "L’exécution a échoué ou a été refusée dans le wallet. Aucune réussite n’est confirmée." }));
    } finally {
      setExecuting(false);
    }
  };

  const needsEvmWallet = !isSolanaNetwork(fromChain) || !isSolanaNetwork(toChain);
  const needsSolanaWallet = isSolanaNetwork(fromChain) || isSolanaNetwork(toChain);

  useEffect(() => {
    setQuote(null);
    setExecution({ status: "idle" });
    setError("");
    setLoading(false);
    if (!walletReady || !fromToken || !toToken || !amountInSmallestUnits || BigInt(amountInSmallestUnits) <= BigInt(0)) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({
        resource: "quote",
        fromChain: String(fromChain),
        toChain: String(toChain),
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAmount: amountInSmallestUnits,
        fromDecimals: String(fromToken.decimals),
        toDecimals: String(toToken.decimals),
        fromAddress: sourceAddress,
        toAddress: destinationAddress,
        slippage: "0.005",
      });
      try {
        const response = await fetch(`/api/lifi?${params}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as Quote & { error?: string; diagnostic?: QuoteDiagnostic };
        if (!response.ok) throw new Error(payload.error || `Le proxy LI.FI a répondu HTTP ${response.status}.`);
        if (!payload.estimate?.toAmount || !/^\d+$/.test(payload.estimate.toAmount)) throw new Error("Le proxy n’a pas renvoyé de montant reçu valide.");
        if (!controller.signal.aborted) setQuote(payload);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Impossible de récupérer la cotation.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [account, amountInSmallestUnits, destinationAddress, evmWallet, fromChain, fromToken, toChain, toToken, walletReady, sourceAddress]);

  const feeCosts = quote?.estimate?.feeCosts ?? [];
  const gasCosts = quote?.estimate?.gasCosts ?? [];
  const requestedZingswapFee = formatFeePercentage(quote?.zingswapFee?.requested);
  const feeCostRates = feeCosts.map((fee) => feeRate(fee.percentage));
  const totalFeeCostPercentage = feeCosts.length > 0 && feeCostRates.every((rate) => rate !== undefined)
    ? formatPercentagePoints(feeCostRates.reduce<number>((total, rate) => total + (rate ?? 0) * 100, 0))
    : undefined;
  const requiresSolanaWallet = isSolanaNetwork(fromChain) || isSolanaNetwork(toChain);
  const quoteExecutable = Boolean(quote?.transactionRequest && quote?.estimate?.fromAmountUSD && quote?.estimate?.toAmountUSD && quote?.estimate?.toAmount);
  const canExecute = Boolean(walletReady && quoteExecutable && !executing &&
    execution.status !== "success" && execution.status !== "paused" &&
    (isSolanaNetwork(fromChain) ? solanaStandardWallet : providerAvailable) &&
    (isSolanaNetwork(toChain) ? solanaStandardWallet : providerAvailable));
  const executionDisabledReason = requiresSolanaWallet && solConnected && !solanaStandardWallet
    ? "Le wallet Solana sélectionné ne fournit pas le standard Wallet requis par LI.FI. Sélectionne un wallet compatible."
    : requiresSolanaWallet && !solConnected
    ? "Connecte un wallet Solana compatible avec le standard Wallet pour cette route."
      : execution.status === "success"
        ? "Ce swap est déjà confirmé. Modifie le montant ou les tokens pour obtenir une nouvelle cotation."
        : execution.status === "paused"
          ? "Le suivi de cette exécution est en pause. Ne la relance pas afin d’éviter un doublon."
          : needsEvmWallet && !providerAvailable
            ? "Connecte un wallet EVM compatible pour exécuter ce swap."
            : needsEvmWallet && !account
              ? "Connecte ton wallet EVM pour exécuter ce swap."
              : !walletReady
                ? `Passe le wallet sur ${getSwapNetwork(fromChain)?.name} pour autoriser l’exécution.`
                : !quoteExecutable
                  ? "Aucune transaction exécutable n’est disponible pour cette cotation."
                  : "";

  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-white sm:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Swap multi-réseaux</h2>
          <p className="mt-1 text-sm text-zinc-400">Cotation LI.FI sur Solana, Ethereum et BNB Smart Chain.</p>
        </div>
        {account ? (
          <span className="rounded-lg border border-zinc-700 px-3 py-2 font-mono text-xs text-zinc-300">{account.slice(0, 6)}…{account.slice(-4)}</span>
        ) : needsEvmWallet ? (
          <button type="button" onClick={() => void connectWallet()} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950">Connecter un wallet EVM</button>
        ) : null}
      </div>

      {needsSolanaWallet && !solConnected && <button type="button" onClick={() => setSolanaWalletModalVisible(true)} className="mb-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-white hover:border-cyan-500">Connecter un wallet Solana</button>}

      {!isSolanaNetwork(fromChain) && account && !walletOnSource && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200"><span>Le wallet EVM est sur le réseau {walletChainId ?? "inconnu"}. Passe-le sur {getSwapNetwork(fromChain)?.name} pour lire le solde et obtenir une cotation.</span><button type="button" onClick={() => void switchWalletChain().catch(() => undefined)} className="rounded-lg bg-amber-300 px-3 py-2 font-semibold text-zinc-950">Changer le réseau du wallet</button></div>}

      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="text-xs text-zinc-400" htmlFor="evm-from-amount">Vous envoyez</label>
          <div className="mt-2 flex gap-3">
            <input id="evm-from-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" className="min-w-0 flex-1 bg-transparent text-2xl outline-none" />
            <button type="button" aria-label={`Choisir le token envoyé${fromToken ? `, ${fromToken.symbol}` : ""}`} onClick={() => openTokenSearch("from")} className="flex max-w-48 shrink-0 items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-white hover:bg-zinc-700">
              {fromToken?.logoURI ? <img src={fromToken.logoURI} alt="" className="h-6 w-6 rounded-full" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-zinc-950">{fromToken?.symbol.slice(0, 1) ?? "?"}</span>}
              <span className="truncate">{fromToken?.symbol ?? "Token"}</span><span aria-hidden="true">⌄</span>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
            <p>{walletOnSource && fromToken ? `Solde : ${balance ?? "lecture…"} ${fromToken.symbol}` : isSolanaNetwork(fromChain) ? "Connecte un wallet Solana pour lire le solde." : "Connecte un wallet EVM sur le réseau de départ pour lire le solde."}</p>
            {tokenUsdPrice(fromToken) && <p>Prix USD : {tokenUsdPrice(fromToken)}</p>}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="text-xs text-zinc-400" htmlFor="evm-to-amount">Vous recevez environ</label>
          <div className="mt-2 flex gap-3">
            <input id="evm-to-amount" readOnly value={quote?.estimate?.toAmount && toToken ? formatUnits(quote.estimate.toAmount, toToken.decimals) : ""} placeholder="0.0" className="min-w-0 flex-1 bg-transparent text-2xl outline-none" />
            <button type="button" aria-label={`Choisir le token reçu${toToken ? `, ${toToken.symbol}` : ""}`} onClick={() => openTokenSearch("to")} className="flex max-w-48 shrink-0 items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-white hover:bg-zinc-700">
              {toToken?.logoURI ? <img src={toToken.logoURI} alt="" className="h-6 w-6 rounded-full" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-zinc-950">{toToken?.symbol.slice(0, 1) ?? "?"}</span>}
              <span className="truncate">{toToken?.symbol ?? "Token"}</span><span aria-hidden="true">⌄</span>
            </button>
          </div>
          {quote?.estimate?.toAmountMin && toToken && <p className="mt-2 text-xs text-zinc-500">Minimum estimé : {formatUnits(quote.estimate.toAmountMin, toToken.decimals)} {toToken.symbol}</p>}
          {tokenUsdPrice(toToken) && <p className="mt-2 text-xs text-zinc-500">Prix USD : {tokenUsdPrice(toToken)}</p>}
        </div>
      </div>

      {loading && <p role="status" className="mt-4 text-sm text-cyan-300">Recherche d’une route…</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
      {walletError && <p role="alert" className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{walletError}</p>}
      {execution.message && <div role={execution.status === "failed" ? "alert" : "status"} className={`mt-4 rounded-xl border p-3 text-sm ${execution.status === "success" ? "border-emerald-800 bg-emerald-950/40 text-emerald-200" : execution.status === "failed" ? "border-red-900 bg-red-950/40 text-red-200" : "border-cyan-900 bg-cyan-950/30 text-cyan-200"}`}>
        <p>{execution.message}</p>
        {execution.txHash && <p className="mt-2 break-all font-mono text-xs">Transaction source : {execution.txHash}</p>}
      </div>}

      <div className="mt-4">
        <button type="button" disabled={!canExecute} onClick={() => void executeSwap()} className={`w-full rounded-xl px-4 py-3 font-semibold ${canExecute ? "bg-cyan-500 text-zinc-950 hover:bg-cyan-400" : "cursor-not-allowed bg-zinc-700 text-zinc-300 opacity-70"}`}>{executing ? "Exécution en cours…" : "Exécuter le swap"}</button>
        {!canExecute && <p className="mt-2 text-center text-xs text-zinc-500">{executionDisabledReason}</p>}
      </div>

      {quote && fromToken && toToken && <div className="mt-4 rounded-xl border border-zinc-800 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><span className="shrink-0 text-zinc-400">Route</span><span className="min-w-0 break-words text-right">{getSwapNetwork(fromChain)?.name} · {fromToken.symbol} → {getSwapNetwork(toChain)?.name} · {toToken.symbol} · {Math.max(1, quote.includedSteps?.length ?? 1)} étape(s)</span></div>
        {quote.estimate?.executionDuration != null && <div className="mt-2 flex flex-wrap justify-between gap-2"><span className="shrink-0 text-zinc-400">Durée estimée</span><span>~{Math.max(1, Math.ceil(quote.estimate.executionDuration / 60))} min</span></div>}
        {quote.zingswapFee && requestedZingswapFee && <p className="mt-3 border-t border-zinc-800 pt-3 text-sm text-zinc-300">Commission ZingSwap demandée : {requestedZingswapFee}</p>}
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <p className="mb-2 text-zinc-400">Frais de cotation (feeCosts)</p>
          <p className="mb-2 text-zinc-300">Total feeCosts (somme des pourcentages reçus) : {totalFeeCostPercentage ?? "indisponible"}</p>
          {feeCosts.length > 0 ? feeCosts.map((fee, index) => {
            const percentage = formatFeePercentage(fee.percentage);
            return <div key={`fee-cost-${index}`} className="flex flex-wrap justify-between gap-2 py-1">
              <span className="text-zinc-400">Frais</span>
              <span className="min-w-0 break-words text-right">{feeAmount(fee.amount, fee.token)}{percentage ? ` · ${percentage}` : ""}</span>
            </div>;
          }) : <p className="text-zinc-500">Aucun détail feeCosts renvoyé.</p>}
        </div>
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <p className="mb-2 text-zinc-400">Coûts de gas estimés</p>
          {gasCosts.length > 0 ? gasCosts.map((cost, index) => <div key={`gas-cost-${index}`} className="flex flex-wrap justify-between gap-2 py-1">
            <span className="text-zinc-400">Gas</span>
            <span className="min-w-0 break-words text-right">{feeAmount(cost.amount, cost.token)}</span>
          </div>) : <p className="text-zinc-500">Aucun détail gasCosts renvoyé.</p>}
        </div>
        <p className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-500">L’exécution demande séparément les approbations et signatures nécessaires dans le wallet connecté.</p>
      </div>}

      <p className="mt-4 text-xs text-zinc-500">Les cotations dépendent de la liquidité disponible et peuvent évoluer. Une connexion wallet est nécessaire pour obtenir une estimation contextualisée.</p>
    </div>
  );
}
