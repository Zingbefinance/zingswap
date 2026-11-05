"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { ArrowDown, ArrowUp, Bell, Minus } from "lucide-react";

import TradingChart from "./TradingChart";
import {
  ALLOWED_TRADING_TOKENS,
  findAllowedTradingTokenByMint,
  isAllowedTradingMint,
  isAllowedTradingQuoteMint,
  isEligibleTradingPair,
} from "./allowedTokens";
import { getTokenByMint } from "@/lib/tokens/tokenRegistry";
import type { Token } from "@/lib/tokens/types";

type MarketPair = {
  address: string; tokenAddress: string; baseMint: string; quoteMint: string;
  network?: string;
  base: string; quote: string; priceUsd: string | null; priceNative?: string | null;
  liquidityUsd: number | null; liquidityBase?: number | null; liquidityQuote?: number | null;
  volume24hUsd?: number | null; priceChange24hPct?: number | null;
  updatedAt?: string;
  dexId: string | null;
  sources: string[];
  authorizationStatus: string;
  verificationStatus: string;
  quality: { warningCodes: string[]; status: string };
};
type MarketProvider = { name: string; status: string; error?: string };
type MarketsApiResult = {
  status: "available" | "none" | "indeterminate";
  asset: { name: string; symbol: string; mint: string };
  authorizationStatus: string;
  verificationStatus: string;
  markets: Array<{
    network: string;
    asset: { name: string; symbol: string; mint: string };
    poolAddress: string;
    dex: string | null;
    quote: { mint: string; symbol: string };
    priceUsd: number | null;
    priceChange24hPct: number | null;
    volume24hUsd: number | null;
    liquidityUsd: number | null;
    authorizationStatus: string;
    verificationStatus: string;
    sources: string[];
    quality: { warningCodes: string[]; status: string };
  }>;
  providers: MarketProvider[];
  partial: boolean;
  stale?: boolean;
  message: string | null;
};
type WatchedToken = { mint: string; symbol: string };
type PriceAlert = { id: string; mint: string; symbol: string; direction: "above" | "below"; targetUsd: number; fired: boolean };
type DepthEstimate = { sizeUsd: number; price: number | null; amount: number | null };
type DepthState = {
  jupiterBuy: DepthEstimate[];
  jupiterSell: DepthEstimate[];
  poolBuy: DepthEstimate[];
  poolSell: DepthEstimate[];
};
type QuoteMovement = "up" | "down" | "unchanged";
type QuoteRefreshState = {
  pairAddress: string;
  movement: QuoteMovement;
  status: "active" | "waiting" | "error";
  receivedAt: number | null;
  message?: string;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 7 });
const depthSizes = [25, 100];
const emptyDepth: DepthState = { jupiterBuy: [], jupiterSell: [], poolBuy: [], poolSell: [] };
const poolPriceTolerance = 0.05;
function isCanonicalAddress(value: string): boolean {
  try { return new PublicKey(value).toBase58() === value; } catch { return false; }
}

function isNullableNumber(value: unknown, allowZero = true): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0));
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function quoteApiErrorMessage(status: number, payload: unknown): string {
  const providerErrors = isRecord(payload) && Array.isArray(payload.providers)
    ? payload.providers.filter(isRecord)
    : [];
  const providerNames = new Set(["DexScreener", "GeckoTerminal"]);
  const details = new Set<string>();

  for (const item of providerErrors) {
    const provider = typeof item.provider === "string" && providerNames.has(item.provider) ? item.provider : "Un fournisseur";
    const error = typeof item.error === "string" ? item.error.toLowerCase() : "";
    if (item.status === 429) details.add(`${provider} limite temporairement les requêtes`);
    else if (/délai|timeout|expiré/.test(error)) details.add(`${provider} n’a pas répondu à temps`);
    else if (/malform|incomplèt|invalide/.test(error)) details.add(`${provider} a renvoyé une réponse invalide`);
    else if (item.status === 404 || /pool exact absent|introuvable/.test(error)) details.add(`${provider} n’a pas trouvé de cotation pour ce pool`);
    else if (item.status === undefined || (typeof item.status === "number" && item.status >= 500) || /indisponible|inaccessible/.test(error)) {
      details.add(`${provider} est temporairement indisponible`);
    }
  }

  if (status === 429 || [...details].some((detail) => detail.includes("limite temporairement"))) {
    return "Limite temporaire de requêtes atteinte. Le dernier prix reste affiché, sans confirmation en direct.";
  }
  if (status === 404) {
    return "Aucun fournisseur n’a trouvé de cotation exploitable pour le pool exact. Le dernier prix reste affiché, sans confirmation en direct.";
  }
  if (status === 504 || [...details].some((detail) => detail.includes("n’a pas répondu à temps"))) {
    return "Délai dépassé pendant la cotation. Le dernier prix reste affiché, sans confirmation en direct.";
  }
  if (details.size > 0) {
    return `Cotation non confirmée : ${[...details].join(" ; ")}. Le dernier prix reste affiché, sans confirmation en direct.`;
  }
  if (status >= 500) {
    return "Les fournisseurs de cotation sont temporairement indisponibles. Le dernier prix reste affiché, sans confirmation en direct.";
  }
  return "Réponse invalide de l’API de cotation. Le dernier prix reste affiché, sans confirmation en direct.";
}

function quoteRequestErrorMessage(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Délai dépassé pendant la cotation. Le dernier prix reste affiché, sans confirmation en direct.";
  }
  if (error instanceof TypeError) {
    return "Erreur réseau pendant la cotation. Le dernier prix reste affiché, sans confirmation en direct.";
  }
  if (error instanceof Error && /réponse invalide/.test(error.message.toLowerCase())) {
    return "Réponse invalide de l’API de cotation. Le dernier prix reste affiché, sans confirmation en direct.";
  }
  if (error instanceof Error && /cotation reçue est invalide/.test(error.message)) {
    return "Réponse invalide : la cotation reçue ne correspond pas au pool sélectionné. Le dernier prix reste affiché, sans confirmation en direct.";
  }
  return "Cotation temporairement indisponible. Le dernier prix reste affiché, sans confirmation en direct.";
}

function isValidRefreshedPair(
  payload: unknown,
  currentPair: MarketPair | null,
  pairAddress: string,
): payload is { pair: MarketPair } {
  if (!isRecord(payload) || !isRecord(payload.pair) || !currentPair) return false;
  const pair = payload.pair as unknown as MarketPair;
  const price = Number(pair.priceUsd);
  return currentPair.address === pairAddress && pair.address === pairAddress &&
    pair.network === "solana" && pair.baseMint === currentPair.baseMint && pair.quoteMint === currentPair.quoteMint &&
    isEligibleTradingPair(pair.baseMint, pair.quoteMint) &&
    typeof pair.priceUsd === "string" && Number.isFinite(price) && price > 0 &&
    isNullableNumber(pair.liquidityUsd) &&
    isNullableNumber(pair.liquidityBase ?? null) && isNullableNumber(pair.liquidityQuote ?? null) &&
    isNullableNumber(pair.volume24hUsd ?? null) && isNullableFiniteNumber(pair.priceChange24hPct ?? null);
}

function marketQualityWarning(code: string): string {
  const messages: Record<string, string> = {
    provider_price_disagreement: "Les fournisseurs annoncent des prix divergents pour ce pool (écart supérieur à 5 %).",
    low_reported_liquidity: "Liquidité déclarée inférieure à 1 000 USD : marché potentiellement peu liquide.",
    price_unavailable: "Prix USD indisponible.",
    volume_24h_unavailable: "Volume 24 h indisponible.",
    liquidity_unavailable: "Liquidité indisponible.",
    activity_unavailable: "Activité récente indisponible.",
    provider_returned_malformed_metric: "Une métrique fournisseur est malformée.",
    provider_liquidity_not_independently_verified: "La liquidité déclarée n’a pas été vérifiée indépendamment.",
  };
  return messages[code] ?? "Qualité des données à vérifier.";
}

function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d*)?$/.test(trimmed) || decimals < 0 || decimals > 18) throw new Error("Saisissez un montant valide.");
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new Error(`Ce token accepte au maximum ${decimals} décimales.`);
  return BigInt(whole) * (BigInt(10) ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function fromUnits(raw: string, decimals: number): number {
  const value = BigInt(raw);
  const scale = BigInt(10) ** BigInt(decimals);
  return Number(value / scale) + Number(value % scale) / Number(scale);
}

async function readJson<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({})) as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(result.error || result.message || `La requête a échoué (HTTP ${response.status}).`);
  return result;
}

export default function TradingTerminal() {
  const router = useRouter();
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>(ALLOWED_TRADING_TOKENS[0].mint);
  const [pairs, setPairs] = useState<MarketPair[]>([]);
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  const [marketProviders, setMarketProviders] = useState<MarketProvider[]>([]);
  const [watchlist, setWatchlist] = useState<WatchedToken[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [period, setPeriod] = useState("24H");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [marketTokens, setMarketTokens] = useState<{ base: Token; quote: Token } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [marketInfoMessage, setMarketInfoMessage] = useState("");
  const [marketSwapError, setMarketSwapError] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [depth, setDepth] = useState<DepthState>(emptyDepth);
  const [poolDepthUnavailableReason, setPoolDepthUnavailableReason] = useState("");
  const [tokenUsdPrices, setTokenUsdPrices] = useState<Record<string, number>>({});
  const [depthLoading, setDepthLoading] = useState(false);
  const [depthError, setDepthError] = useState("");
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [alertTarget, setAlertTarget] = useState("");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("above");
  const [alertError, setAlertError] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const marketSequence = useRef(0);
  const marketsControllerRef = useRef<AbortController | null>(null);
  const scrollToChartAfterAssetChangeRef = useRef(false);
  const chartSectionRef = useRef<HTMLDivElement | null>(null);
  const tokenSequence = useRef(0);
  const lastValidQuoteRef = useRef<{ pairAddress: string; price: number } | null>(null);
  const [quoteRefreshState, setQuoteRefreshState] = useState<QuoteRefreshState | null>(null);
  const selectedPair = pairs.find((pair) => pair.address === selectedAddress) ?? null;
  const selectedPairRef = useRef(selectedPair);
  const visiblePairs = showAllMarkets ? pairs : pairs.slice(0, 5);
  const selectedTradingToken = findAllowedTradingTokenByMint(selectedTokenMint);

  useEffect(() => { selectedPairRef.current = selectedPair; }, [selectedPair]);

  useEffect(() => {
    if (!selectedPair || !scrollToChartAfterAssetChangeRef.current) return;
    scrollToChartAfterAssetChangeRef.current = false;
    window.requestAnimationFrame(() => chartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selectedPair?.address]);

  const loadMarkets = useCallback(async (mint: string) => {
    const requestId = ++marketSequence.current;
    marketsControllerRef.current?.abort();
    const controller = new AbortController();
    marketsControllerRef.current = controller;
    setSearching(true);
    setSearchError("");
    setMarketInfoMessage("");
    setMarketProviders([]);
    setTokenError("");
    setPairs([]);
    setSelectedAddress("");
    try {
      const response = await fetch(`/api/trading/markets?mint=${encodeURIComponent(mint)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (requestId !== marketSequence.current || controller.signal.aborted) return;

      if (!response.ok) {
        const errorMessage = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Réponse invalide de l’API des marchés autorisés.";
        if (response.status === 429) throw new Error("Limite temporaire HTTP 429 : réessaie dans quelques instants.");
        if (response.status === 502 && payload && typeof payload === "object" && "providers" in payload && Array.isArray(payload.providers)) {
          const providerErrors = payload.providers
            .filter((provider): provider is MarketProvider => Boolean(provider && typeof provider === "object" && "error" in provider && typeof provider.error === "string"))
            .map((provider) => provider.name);
          throw new Error(providerErrors.length ? `Sources indisponibles : ${providerErrors.join(" · ")}` : errorMessage);
        }
        throw new Error(errorMessage);
      }

      if (!payload || typeof payload !== "object" || !("markets" in payload) || !Array.isArray(payload.markets) ||
          !("providers" in payload) || !Array.isArray(payload.providers) ||
          !["available", "none", "indeterminate"].includes(String((payload as { status?: unknown }).status))) {
        throw new Error("Réponse invalide de l’API des marchés autorisés.");
      }
      const result = payload as MarketsApiResult;
      const configuredToken = findAllowedTradingTokenByMint(mint);
      if (!configuredToken || !isAllowedTradingMint(mint) || result.asset?.mint !== mint ||
          result.authorizationStatus !== "trading-allowlist" || result.verificationStatus !== configuredToken.verificationStatus ||
          typeof result.partial !== "boolean" ||
          (result.stale !== undefined && typeof result.stale !== "boolean") ||
          !result.providers.every((provider) => provider && typeof provider.name === "string" && typeof provider.status === "string" && (provider.error === undefined || typeof provider.error === "string")) ||
          (result.status === "available" && result.markets.length === 0) ||
          (result.status !== "available" && result.markets.length > 0)) {
        throw new Error("L’API a retourné un actif qui ne correspond pas au Mint autorisé sélectionné.");
      }

      const invalidEntries = result.markets.length > 0 && result.markets.some((market) => {
        const quoteToken = findAllowedTradingTokenByMint(market?.quote?.mint ?? "");
        return !market || market.network !== "solana" || market.asset?.mint !== mint ||
          !isCanonicalAddress(market.poolAddress ?? "") || market.authorizationStatus !== "trading-allowlist" ||
          !quoteToken || !isAllowedTradingQuoteMint(market.quote.mint) ||
          !isEligibleTradingPair(market.asset.mint, market.quote.mint) ||
          !isNullableNumber(market.priceUsd, false) || !isNullableFiniteNumber(market.priceChange24hPct) ||
          !isNullableNumber(market.volume24hUsd) || !isNullableNumber(market.liquidityUsd) ||
          !Array.isArray(market.sources) || !market.sources.every((source) => typeof source === "string") ||
          !market.quality || !Array.isArray(market.quality.warningCodes) ||
          !market.quality.warningCodes.every((warning) => typeof warning === "string");
      });
      if (invalidEntries) throw new Error("Réponse invalide : un ou plusieurs marchés ne respectent pas les Mints autorisés.");

      const eligibleMarkets = result.markets.filter((market) =>
        market.network === "solana" && market.asset.mint === mint &&
        isCanonicalAddress(market.poolAddress) && market.authorizationStatus === "trading-allowlist" &&
        isAllowedTradingQuoteMint(market.quote.mint) && isEligibleTradingPair(market.asset.mint, market.quote.mint),
      );
      const mappedMarkets: MarketPair[] = eligibleMarkets.map((market) => {
        const quoteToken = findAllowedTradingTokenByMint(market.quote.mint)!;
        return {
          address: market.poolAddress,
          network: market.network,
          tokenAddress: configuredToken.mint,
          baseMint: configuredToken.mint,
          quoteMint: quoteToken.mint,
          base: configuredToken.symbol,
          quote: quoteToken.symbol,
          priceUsd: market.priceUsd === null ? null : String(market.priceUsd),
          liquidityUsd: market.liquidityUsd,
          volume24hUsd: market.volume24hUsd,
          priceChange24hPct: market.priceChange24hPct,
          dexId: market.dex,
          sources: market.sources,
          authorizationStatus: configuredToken.authorizationStatus,
          verificationStatus: configuredToken.verificationStatus,
          quality: market.quality,
          updatedAt: new Date().toISOString(),
        };
      });

      setPairs(mappedMarkets);
      setMarketProviders(result.providers);
      if (mappedMarkets.length === 1 || scrollToChartAfterAssetChangeRef.current) {
        if (mappedMarkets.length > 0) setSelectedAddress(mappedMarkets[0].address);
        else scrollToChartAfterAssetChangeRef.current = false;
      }
      if (!mappedMarkets.length) {
        setSearchError(result.status === "indeterminate"
          ? result.message || "Un fournisseur est indisponible ; l’absence de marché ne peut pas être confirmée."
          : result.message || "Aucun marché éligible n’est disponible pour ce Mint autorisé.");
      } else if (result.stale) {
        setMarketInfoMessage("Marchés en cache · cotations non actualisées.");
      } else if (result.partial) {
        setMarketInfoMessage("Liste partielle : un fournisseur est temporairement indisponible.");
      } else if (eligibleMarkets.length < result.markets.length) {
        setMarketInfoMessage("Des marchés non conformes aux Mints autorisés ont été écartés.");
      } else if (mappedMarkets.length > 1) {
        setMarketInfoMessage("Premier marché sélectionné · tu peux en choisir un autre.");
      }
    } catch (error) {
      scrollToChartAfterAssetChangeRef.current = false;
      if (!controller.signal.aborted && requestId === marketSequence.current) {
        setSearchError(error instanceof Error ? error.message : "Les marchés sont temporairement indisponibles.");
      }
    } finally {
      if (marketsControllerRef.current === controller) marketsControllerRef.current = null;
      if (requestId === marketSequence.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadMarkets(selectedTokenMint), 0);
    return () => {
      window.clearTimeout(timeout);
      marketsControllerRef.current?.abort();
    };
  }, [loadMarkets, selectedTokenMint]);
  useEffect(() => {
    const initialPair = selectedPairRef.current;
    if (!initialPair) return;
    const pairAddress = initialPair.address;
    let disposed = false;
    let requestInFlight = false;
    let activeController: AbortController | null = null;
    const refreshPair = async () => {
      if (disposed || document.hidden || requestInFlight) return;
      requestInFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const response = await fetch(`/api/analytics?action=pair&pair=${encodeURIComponent(pairAddress)}&base=${encodeURIComponent(initialPair.baseMint)}&quote=${encodeURIComponent(initialPair.quoteMint)}`, { cache: "no-store", signal: controller.signal });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(quoteApiErrorMessage(response.status, payload));
        const currentPair = selectedPairRef.current;
        if (!isRecord(payload) || !isRecord(payload.pair)) {
          throw new Error("Réponse invalide de l’API de cotation.");
        }
        if (!currentPair || !isValidRefreshedPair(payload, currentPair, pairAddress)) {
          throw new Error("La cotation reçue est invalide pour cette paire.");
        }
        const refreshedPair = payload.pair;
        const price = Number(refreshedPair?.priceUsd);
        if (disposed || controller.signal.aborted) return;

        const previous = lastValidQuoteRef.current?.pairAddress === pairAddress
          ? lastValidQuoteRef.current
          : Number.isFinite(Number(currentPair.priceUsd)) && Number(currentPair.priceUsd) > 0
            ? { pairAddress, price: Number(currentPair.priceUsd) }
            : null;
        const movement: QuoteMovement = !previous || price === previous.price
          ? "unchanged"
          : price > previous.price ? "up" : "down";
        lastValidQuoteRef.current = { pairAddress, price };
        setPairs((current) => current.map((pair) => pair.address === pairAddress ? {
          ...pair,
          priceUsd: refreshedPair.priceUsd,
          priceNative: refreshedPair.priceNative,
          liquidityBase: refreshedPair.liquidityBase,
          liquidityQuote: refreshedPair.liquidityQuote,
          liquidityUsd: refreshedPair.liquidityUsd,
          volume24hUsd: refreshedPair.volume24hUsd ?? null,
          priceChange24hPct: refreshedPair.priceChange24hPct ?? null,
          updatedAt: refreshedPair.updatedAt,
        } : pair));
        setQuoteRefreshState({ pairAddress, movement, status: "active", receivedAt: Date.now() });
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        const providedMessage = error instanceof Error && /^(?:Limite temporaire|Aucun fournisseur|Délai dépassé|Cotation non confirmée|Les fournisseurs)/.test(error.message)
          ? error.message
          : null;
        const message = providedMessage ?? quoteRequestErrorMessage(error);
        setQuoteRefreshState((current) => ({
          pairAddress,
          movement: current?.pairAddress === pairAddress ? current.movement : "unchanged",
          status: "error",
          receivedAt: current?.pairAddress === pairAddress ? current.receivedAt : null,
          message,
        }));
      } finally {
        if (activeController === controller) {
          activeController = null;
          requestInFlight = false;
        }
      }
    };
    void refreshPair();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshPair(); }, 2_000);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        activeController?.abort();
        activeController = null;
        requestInFlight = false;
        setQuoteRefreshState((current) => ({
          pairAddress,
          movement: current?.pairAddress === pairAddress ? current.movement : "unchanged",
          status: "waiting",
          receivedAt: current?.pairAddress === pairAddress ? current.receivedAt : null,
        }));
        return;
      }
      setQuoteRefreshState((current) => ({
        pairAddress,
        movement: current?.pairAddress === pairAddress ? current.movement : "unchanged",
        status: "active",
        receivedAt: current?.pairAddress === pairAddress ? current.receivedAt : null,
      }));
      void refreshPair();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      activeController?.abort();
      activeController = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [selectedPair?.address]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(window.localStorage.getItem("zingswap.trading.watchlist") ?? "[]") as WatchedToken[];
        if (Array.isArray(saved)) setWatchlist(saved
          .filter((item) => {
            const token = typeof item?.mint === "string" ? findAllowedTradingTokenByMint(item.mint) : undefined;
            return Boolean(token?.canBeBase && isAllowedTradingMint(item.mint));
          })
          .map((item) => ({ mint: item.mint, symbol: findAllowedTradingTokenByMint(item.mint)!.symbol }))
          .slice(0, 12));
      } catch { setWatchlist([]); }
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(window.localStorage.getItem("zingswap.trading.price-alerts") ?? "[]") as PriceAlert[];
        if (Array.isArray(saved)) setAlerts(saved.filter((item) =>
          typeof item?.id === "string" && typeof item?.mint === "string" &&
          findAllowedTradingTokenByMint(item.mint)?.canBeBase &&
          Number.isFinite(item.targetUsd) && item.targetUsd > 0 &&
          ["above", "below"].includes(item.direction) && typeof item.fired === "boolean",
        ).map((item) => ({ ...item, symbol: findAllowedTradingTokenByMint(item.mint)!.symbol })).slice(0, 20));
      } catch { setAlerts([]); }
      setNotificationPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const pending = alerts.filter((alert) => !alert.fired);
    if (!pending.length) return;
    let cancelled = false;
    const checkAlerts = async () => {
      try {
        const mints = Array.from(new Set(pending.map((alert) => alert.mint)));
        const response = await fetch(`/api/tokens/prices?mints=${encodeURIComponent(mints.join(","))}`, { cache: "no-store" });
        const result = await readJson<{ prices?: Record<string, { usd?: number }> }>(response);
        if (cancelled) return;
        const crossed = pending.filter((alert) => {
          const price = Number(result.prices?.[alert.mint]?.usd);
          return price > 0 && (alert.direction === "above" ? price >= alert.targetUsd : price <= alert.targetUsd);
        });
        if (!crossed.length) return;
        const crossedIds = new Set(crossed.map((alert) => alert.id));
        setAlerts((current) => {
          const next = current.map((alert) => crossedIds.has(alert.id) ? { ...alert, fired: true } : alert);
          try { window.localStorage.setItem("zingswap.trading.price-alerts", JSON.stringify(next)); } catch { /* Keep alert state for this page session. */ }
          return next;
        });
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const alert of crossed) new Notification(`Alerte ZingSwap · ${alert.symbol}`, { body: `${alert.symbol} a atteint ${usd.format(alert.targetUsd)}.` });
        }
      } catch { /* A temporary price API failure is retried on the next check. */ }
    };
    void checkAlerts();
    const timer = window.setInterval(() => void checkAlerts(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [alerts]);

  const selectedBaseMint = selectedPair?.baseMint;
  const selectedQuoteMint = selectedPair?.quoteMint;
  useEffect(() => {
    if (!selectedBaseMint || !selectedQuoteMint) return;
    const requestId = ++tokenSequence.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTokenError("");
      setMarketTokens(null);
      Promise.all([getTokenByMint(selectedBaseMint), getTokenByMint(selectedQuoteMint)])
        .then(([baseToken, quoteToken]) => {
          if (cancelled || requestId !== tokenSequence.current) return;
          if (!baseToken || !quoteToken || baseToken.mint !== selectedBaseMint || quoteToken.mint !== selectedQuoteMint) { setTokenError("Les détails des tokens du marché sont indisponibles pour cette paire."); return; }
          setMarketTokens({ base: baseToken as Token, quote: quoteToken as Token });
        }).catch(() => {
          if (!cancelled && requestId === tokenSequence.current) setTokenError("Impossible de préparer les tokens du marché.");
        });
    });
    return () => { cancelled = true; };
  }, [selectedBaseMint, selectedQuoteMint]);

  const currentMarketTokens = marketTokens?.base.mint === selectedBaseMint && marketTokens?.quote.mint === selectedQuoteMint
    ? marketTokens : null;
  const marketBaseToken = currentMarketTokens?.base;
  const marketQuoteToken = currentMarketTokens?.quote;
  useEffect(() => {
    const pair = selectedPairRef.current;
    let cancelled = false;
    const loadDepth = async () => {
      if (!pair || !marketBaseToken || !marketQuoteToken) return;
      try {
        let tokenPrices: Record<string, { usd?: number }> = {};
        try {
          const priceResponse = await fetch(`/api/tokens/prices?mints=${encodeURIComponent(`${pair.baseMint},${pair.quoteMint}`)}`, { cache: "no-store" });
          const priceResult = await readJson<{ prices?: Record<string, { usd?: number }> }>(priceResponse);
          tokenPrices = priceResult.prices ?? {};
        } catch { /* The exact-pool estimate does not use this general price fallback. */ }
        if (cancelled) return;
        const baseUsd = Number(pair.priceUsd ?? tokenPrices[pair.baseMint]?.usd);
        const nativePrice = Number(pair.priceNative);
        const pairQuoteUsd = nativePrice > 0 ? baseUsd / nativePrice : NaN;
        const quoteUsd = Number(Number.isFinite(pairQuoteUsd) && pairQuoteUsd > 0
          ? pairQuoteUsd
          : tokenPrices[pair.quoteMint]?.usd ?? (pair.quote.toUpperCase() === "USDC" || pair.quote.toUpperCase() === "USDT" ? 1 : NaN));
        if (!Number.isFinite(baseUsd) || baseUsd <= 0 || !Number.isFinite(quoteUsd) || quoteUsd <= 0) throw new Error("Le prix USD des deux tokens est nécessaire pour estimer la profondeur.");
        setTokenUsdPrices({ [pair.baseMint]: baseUsd, [pair.quoteMint]: quoteUsd });

        const reserveBase = Number(pair.liquidityBase);
        const reserveQuote = Number(pair.liquidityQuote);
        const exactPairBaseUsd = Number(pair.priceUsd);
        const quoteTokenConfig = findAllowedTradingTokenByMint(pair.quoteMint);
        let poolQuoteUsd = NaN;
        let poolUnavailableReason = "";
        if (!Number.isFinite(reserveBase) || reserveBase <= 0 || !Number.isFinite(reserveQuote) || reserveQuote <= 0) {
          poolUnavailableReason = "Les réserves base/quote du pool sélectionné sont indisponibles.";
        } else if (!Number.isFinite(exactPairBaseUsd) || exactPairBaseUsd <= 0) {
          poolUnavailableReason = "Le prix USD du pool sélectionné est indisponible.";
        } else if (quoteTokenConfig?.symbol === "USDC" || quoteTokenConfig?.symbol === "USDT") {
          poolQuoteUsd = 1;
        } else if (quoteTokenConfig?.mint === ALLOWED_TRADING_TOKENS[0].mint) {
          const selectedPairNativePrice = Number(pair.priceNative);
          if (!Number.isFinite(selectedPairNativePrice) || selectedPairNativePrice <= 0) {
            poolUnavailableReason = "Le prix en SOL du pool sélectionné est indisponible.";
          } else {
            poolQuoteUsd = exactPairBaseUsd / selectedPairNativePrice;
          }
        } else {
          poolUnavailableReason = "La devise de cotation du pool sélectionné n’est pas prise en charge.";
        }

        if (!poolUnavailableReason) {
          const reserveQuotePerBase = reserveQuote / reserveBase;
          const referenceQuotePerBase = quoteTokenConfig?.mint === ALLOWED_TRADING_TOKENS[0].mint
            ? Number(pair.priceNative)
            : exactPairBaseUsd;
          const relativePriceDifference = Math.abs(reserveQuotePerBase - referenceQuotePerBase) / referenceQuotePerBase;
          const reserveImpliedUsd = reserveQuotePerBase * poolQuoteUsd;
          const relativeUsdDifference = Math.abs(reserveImpliedUsd - exactPairBaseUsd) / exactPairBaseUsd;
          if (!Number.isFinite(relativePriceDifference) || !Number.isFinite(relativeUsdDifference) ||
              relativePriceDifference > poolPriceTolerance || relativeUsdDifference > poolPriceTolerance) {
            poolUnavailableReason = "Les réserves du pool sélectionné ne sont pas cohérentes avec son prix de référence.";
          }
        }
        const canEstimateFromSelectedPool = !poolUnavailableReason;
        setPoolDepthUnavailableReason(poolUnavailableReason);

        const getQuote = async (inputMint: string, outputMint: string, amountRaw: string, inputDecimals: number, outputDecimals: number) => {
          try {
            const response = await fetch("/api/jupiter/depth-quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputMint, outputMint, amount: amountRaw, inputDecimals, outputDecimals, slippageBps: 100 }), cache: "no-store" });
            return await readJson<{ amountInRaw?: string; amountOutRaw?: string }>(response);
          } catch { return null; }
        };
        const nextDepth: DepthState = { jupiterBuy: [], jupiterSell: [], poolBuy: [], poolSell: [] };
        for (const size of depthSizes) {
          const baseAmountRaw = parseUnits((size / baseUsd).toFixed(Math.min(marketBaseToken.decimals, 8)), marketBaseToken.decimals).toString();
          const quoteAmountRaw = parseUnits((size / quoteUsd).toFixed(Math.min(marketQuoteToken.decimals, 8)), marketQuoteToken.decimals).toString();
          const [buyQuote, sellQuote] = await Promise.all([
            getQuote(pair.quoteMint, pair.baseMint, quoteAmountRaw, marketQuoteToken.decimals, marketBaseToken.decimals),
            getQuote(pair.baseMint, pair.quoteMint, baseAmountRaw, marketBaseToken.decimals, marketQuoteToken.decimals),
          ]);
          const buyQuoteAmount = buyQuote?.amountInRaw ? fromUnits(buyQuote.amountInRaw, marketQuoteToken.decimals) : size / quoteUsd;
          const buyBaseAmount = buyQuote?.amountOutRaw ? fromUnits(buyQuote.amountOutRaw, marketBaseToken.decimals) : 0;
          const sellBaseAmount = sellQuote?.amountInRaw ? fromUnits(sellQuote.amountInRaw, marketBaseToken.decimals) : size / baseUsd;
          const sellQuoteAmount = sellQuote?.amountOutRaw ? fromUnits(sellQuote.amountOutRaw, marketQuoteToken.decimals) : 0;
          const jupiterBuyPrice = buyBaseAmount > 0 ? buyQuoteAmount * quoteUsd / buyBaseAmount : null;
          const jupiterSellPrice = sellBaseAmount > 0 && sellQuoteAmount > 0 ? sellQuoteAmount * quoteUsd / sellBaseAmount : null;
          nextDepth.jupiterBuy.push({ sizeUsd: size, price: jupiterBuyPrice, amount: jupiterBuyPrice === null ? null : buyBaseAmount });
          nextDepth.jupiterSell.push({ sizeUsd: size, price: jupiterSellPrice, amount: jupiterSellPrice === null ? null : sellBaseAmount });

          let poolBuyPrice: number | null = null;
          let poolBuyAmount: number | null = null;
          let poolSellPrice: number | null = null;
          let poolSellAmount: number | null = null;
          if (canEstimateFromSelectedPool) {
            const quoteIn = size / poolQuoteUsd;
            const baseOut = reserveBase * quoteIn / (reserveQuote + quoteIn);
            if (Number.isFinite(baseOut) && baseOut > 0) {
              poolBuyPrice = quoteIn * poolQuoteUsd / baseOut;
              poolBuyAmount = baseOut;
            }

            const baseIn = size / exactPairBaseUsd;
            const quoteOut = reserveQuote * baseIn / (reserveBase + baseIn);
            if (Number.isFinite(quoteOut) && quoteOut > 0) {
              poolSellPrice = quoteOut * poolQuoteUsd / baseIn;
              poolSellAmount = baseIn;
            }
          }
          nextDepth.poolBuy.push({ sizeUsd: size, price: poolBuyPrice, amount: poolBuyAmount });
          nextDepth.poolSell.push({ sizeUsd: size, price: poolSellPrice, amount: poolSellAmount });
        }
        if (cancelled) return;
        setDepth(nextDepth);
      } catch (error) { if (!cancelled) setDepthError(error instanceof Error ? error.message : "Impossible d’estimer la profondeur."); }
      finally { if (!cancelled) setDepthLoading(false); }
    };

    queueMicrotask(() => {
      if (cancelled) return;
      setDepth(emptyDepth);
      setPoolDepthUnavailableReason("");
      setDepthError("");
      if (!pair || !marketBaseToken || !marketQuoteToken) {
        setDepthLoading(false);
        return;
      }
      setDepthLoading(true);
      setDepthError("");
      setTokenUsdPrices({});
      void loadDepth();
    });
    return () => { cancelled = true; };
  }, [selectedPair?.address, selectedPair?.baseMint, selectedPair?.quoteMint, selectedPair?.priceUsd, selectedPair?.priceNative, selectedPair?.liquidityBase, selectedPair?.liquidityQuote, selectedPair?.quote, marketBaseToken, marketQuoteToken]);

  function addPriceAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAlertError("");
    if (!selectedPair) return;
    const targetUsd = Number(alertTarget);
    if (!Number.isFinite(targetUsd) || targetUsd <= 0) { setAlertError("Saisissez un seuil de prix valide."); return; }
    const next = [{ id: `${Date.now()}-${selectedPair.baseMint}`, mint: selectedPair.baseMint, symbol: selectedPair.base, direction: alertDirection, targetUsd, fired: false }, ...alerts].slice(0, 20);
    setAlerts(next); setAlertTarget("");
    try { window.localStorage.setItem("zingswap.trading.price-alerts", JSON.stringify(next)); } catch { setAlertError("Le navigateur ne peut pas enregistrer cette alerte."); }
  }

  function removePriceAlert(id: string) {
    const next = alerts.filter((alert) => alert.id !== id);
    setAlerts(next);
    try { window.localStorage.setItem("zingswap.trading.price-alerts", JSON.stringify(next)); } catch { /* Alert is removed for this session. */ }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") { setNotificationPermission("unsupported"); return; }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function chooseTradingAsset(mint: string) {
    if (!isAllowedTradingMint(mint)) return;
    scrollToChartAfterAssetChangeRef.current = true;
    setShowAllMarkets(false);
    marketsControllerRef.current?.abort();
    marketSequence.current++;
    setPairs([]);
    setSelectedAddress("");
    setMarketProviders([]);
    setSearchError("");
    setMarketInfoMessage("");
    setSelectedTokenMint(mint);
  }

  function selectSide(nextSide: "buy" | "sell") { setSide(nextSide); }
  function openSelectedMarketInSwap() {
    setMarketSwapError("");
    if (!selectedPair) {
      setMarketSwapError("Sélectionnez un marché Trading valide avant de continuer.");
      return;
    }

    const baseToken = findAllowedTradingTokenByMint(selectedPair.baseMint);
    const quoteToken = findAllowedTradingTokenByMint(selectedPair.quoteMint);
    try {
      const baseMint = new PublicKey(selectedPair.baseMint).toBase58();
      const quoteMint = new PublicKey(selectedPair.quoteMint).toBase58();
      if (
        selectedPair.network !== "solana" ||
        baseMint !== selectedPair.baseMint ||
        quoteMint !== selectedPair.quoteMint ||
        baseMint === quoteMint ||
        !isEligibleTradingPair(baseMint, quoteMint) ||
        baseMint !== selectedTradingToken?.mint ||
        baseToken?.symbol !== selectedPair.base ||
        quoteToken?.symbol !== selectedPair.quote
      ) {
        throw new Error("Paire invalide ou incohérente.");
      }
    } catch {
      setMarketSwapError("La paire sélectionnée est absente, invalide ou incomplète. Aucun échange n’a été préparé.");
      return;
    }

    const inputMint = side === "buy" ? selectedPair.quoteMint : selectedPair.baseMint;
    const outputMint = side === "buy" ? selectedPair.baseMint : selectedPair.quoteMint;
    const params = new URLSearchParams({ inputMint, outputMint });
    router.push(`/swap?${params.toString()}`);
  }

  function toggleWatchlist() {
    if (!selectedPair) return;
    const exists = watchlist.some((item) => item.mint === selectedPair.baseMint);
    const next = exists
      ? watchlist.filter((item) => item.mint !== selectedPair.baseMint)
      : [{ mint: selectedPair.baseMint, symbol: selectedPair.base }, ...watchlist].slice(0, 12);
    setWatchlist(next);
    try { window.localStorage.setItem("zingswap.trading.watchlist", JSON.stringify(next)); } catch { /* Storage is optional; the current session still works. */ }
  }
  const currentPrice = selectedPair?.priceUsd ? Number(selectedPair.priceUsd) : 0;
  const currentQuoteState = quoteRefreshState?.pairAddress === selectedPair?.address ? quoteRefreshState : null;
  const quoteMovement = currentQuoteState?.movement ?? "unchanged";
  const quoteStatus = currentQuoteState?.status ?? "waiting";
  return <div className="space-y-5">
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.3fr)] sm:items-end">
        <div>
          <label htmlFor="trading-asset-select" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">Actif</label>
          <select id="trading-asset-select" value={selectedTokenMint} onChange={(event) => chooseTradingAsset(event.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-white">
            {ALLOWED_TRADING_TOKENS.map((token) => <option key={token.mint} value={token.mint}>{token.symbol}{token.canBeBase ? "" : " · devise de cotation uniquement"}</option>)}
          </select>
        </div>
        {selectedTradingToken?.verificationStatus === "unverified" && <p className="text-xs text-amber-200">ZTC non vérifié indépendamment.</p>}
      </div>
      {searching && <p role="status" className="mt-3 text-sm text-zinc-300">Chargement des marchés éligibles…</p>}
      {searchError && <p role="alert" className="mt-3 text-sm text-amber-200">{searchError}</p>}
      {marketInfoMessage && <p role="status" className="mt-3 text-sm text-amber-200">{marketInfoMessage}</p>}
      {marketProviders.some((provider) => provider.error) && <p role="status" className="mt-2 text-xs text-amber-300">Sources indisponibles : {marketProviders.filter((provider) => provider.error).map((provider) => provider.name).join(" · ")}</p>}
      {watchlist.length > 0 && <div className="mt-4 border-t border-zinc-800 pt-4"><p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Actifs suivis</p><div className="flex flex-wrap gap-2">{watchlist.map((item) => <button key={item.mint} type="button" onClick={() => chooseTradingAsset(item.mint)} aria-pressed={selectedTokenMint === item.mint} className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-cyan-500 hover:text-white">★ {item.symbol}</button>)}</div></div>}
      {pairs.length > 0 && <div className="mt-5 border-t border-zinc-800 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Marchés · {pairs.length}</h2>
          {pairs.length > 5 && <button type="button" onClick={() => setShowAllMarkets((current) => !current)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-cyan-500 hover:text-white">
            {showAllMarkets ? "Réduire la liste" : `Voir tous les marchés (${pairs.length})`}
          </button>}
        </div>
        <div className="grid gap-2 xl:grid-cols-2">
          {visiblePairs.map((pair) => <button key={pair.address} type="button" aria-pressed={selectedAddress === pair.address} onClick={() => setSelectedAddress(pair.address)} className={`min-w-0 rounded-xl border p-3 text-left transition ${selectedAddress === pair.address ? "border-cyan-500 bg-cyan-950/30" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"}`}>
            <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-white">{pair.base}/{pair.quote}</span><span className="text-xs text-zinc-400">{pair.dexId ?? "DEX non renseigné"}</span></span>
            <span className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-400"><span>{pair.priceUsd === null ? "Prix indisponible" : usd.format(Number(pair.priceUsd))}</span><span>{pair.priceChange24hPct == null ? "—" : `${pair.priceChange24hPct > 0 ? "+" : ""}${pair.priceChange24hPct.toFixed(2)} %`}</span></span>
          </button>)}
        </div>
      </div>}
      {selectedPair && <div className="mt-5 flex flex-col gap-4 border-t border-zinc-800 pt-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Marché au comptant · Solana</p>
            <button type="button" onClick={toggleWatchlist} aria-pressed={watchlist.some((item) => item.mint === selectedPair.baseMint)} className="rounded-md px-1.5 text-sm text-amber-300 hover:bg-zinc-800" aria-label={watchlist.some((item) => item.mint === selectedPair.baseMint) ? "Retirer des marchés suivis" : "Ajouter aux marchés suivis"}>{watchlist.some((item) => item.mint === selectedPair.baseMint) ? "★" : "☆"}</button>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-white">{selectedPair.base}/{selectedPair.quote}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400" aria-live="polite">
            {selectedPair.priceUsd ? usd.format(currentPrice) : "Prix USD indisponible"} <span className="text-xs">par {selectedPair.base}</span>
            {quoteMovement === "up" ? <ArrowUp size={15} className="text-emerald-400" aria-label="Prix en hausse depuis la dernière cotation" /> : quoteMovement === "down" ? <ArrowDown size={15} className="text-red-400" aria-label="Prix en baisse depuis la dernière cotation" /> : <Minus size={14} className="text-zinc-500" aria-label="Prix inchangé ou en attente d’une comparaison" />}
          </p>
          <p className={`mt-1 text-xs ${quoteStatus === "error" ? "text-amber-300" : quoteStatus === "active" ? "text-emerald-400" : "text-zinc-500"}`} role="status">
            {quoteStatus === "error" ? "Prix non confirmé" : quoteStatus === "active" ? "Direct · 2 s" : "Connexion en attente"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-72">
          <details className="text-xs text-zinc-500"><summary className="cursor-pointer">Détails du marché</summary><p className="mt-2">{selectedPair.sources.join(" + ")} · {selectedPair.address}</p>{selectedPair.quality.warningCodes.length > 0 && <p className="mt-1 text-amber-200">{selectedPair.quality.warningCodes.map(marketQualityWarning).join(" ")}</p>}{currentQuoteState?.message && <p role="status" className="mt-1 text-amber-200">{currentQuoteState.message}</p>}</details>
        </div>
      </div>}
    </section>

    {selectedPair && <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <details className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-white"><span className="flex items-center gap-2"><Bell size={16} className="text-cyan-300" />Alertes {alerts.length > 0 && `· ${alerts.length}`}</span></summary>
          <div className="mt-3 flex flex-wrap items-center gap-2">{notificationPermission === "default" && <button type="button" onClick={() => void enableNotifications()} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:text-white">Activer les notifications</button>}{notificationPermission === "denied" && <span className="text-xs text-zinc-500">Notifications bloquées</span>}{notificationPermission === "unsupported" && <span className="text-xs text-zinc-500">Notifications indisponibles</span>}</div>
          <form onSubmit={addPriceAlert} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"><label className="sr-only" htmlFor="price-alert-direction">Condition de l’alerte</label><select id="price-alert-direction" value={alertDirection} onChange={(event) => setAlertDirection(event.target.value as "above" | "below")} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white"><option value="above">Prévenir au-dessus</option><option value="below">Prévenir en dessous</option></select><label className="sr-only" htmlFor="price-alert-target">Seuil en dollars</label><input id="price-alert-target" required min="0" step="any" type="number" inputMode="decimal" value={alertTarget} onChange={(event) => setAlertTarget(event.target.value)} placeholder="Prix USD" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white" /><button className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400">Créer l’alerte {selectedPair.base}</button></form>
          {alertError && <p role="alert" className="mt-2 text-xs text-amber-200">{alertError}</p>}
          {alerts.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{alerts.map((alert) => <div key={alert.id} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${alert.fired ? "border-emerald-800 bg-emerald-950/30 text-emerald-200" : "border-zinc-700 bg-zinc-900 text-zinc-300"}`}><span>{alert.symbol} {alert.direction === "above" ? "≥" : "≤"} {usd.format(alert.targetUsd)}{alert.fired ? " · atteinte" : ""}</span><button type="button" onClick={() => removePriceAlert(alert.id)} aria-label={`Supprimer l’alerte ${alert.symbol}`} className="text-zinc-500 hover:text-white">×</button></div>)}</div>}
        </details>
        <div ref={chartSectionRef} className="scroll-mt-4"><TradingChart pairAddress={selectedPair.address} baseMint={selectedPair.baseMint} pairName={`${selectedPair.base}/${selectedPair.quote}`} currentPrice={Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null} period={period} onPeriodChange={setPeriod} /></div>
        <details className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
          <summary className="cursor-pointer font-semibold text-white">Profondeur du marché</summary>
          <section className="mt-4 rounded-xl border border-zinc-800 p-3">
            <h4 className="font-medium text-white">Jupiter agrégé</h4>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <DepthTable title="Coût moyen simulé à l'achat" levels={depth.jupiterBuy} baseSymbol={selectedPair.base} source="Source : cotation agrégée Jupiter." loading={depthLoading || (!currentMarketTokens && !tokenError)} />
              <DepthTable title="Produit moyen simulé à la vente" levels={depth.jupiterSell} baseSymbol={selectedPair.base} source="Source : cotation agrégée Jupiter." loading={depthLoading || (!currentMarketTokens && !tokenError)} />
            </div>
          </section>
          <section className="mt-4 rounded-xl border border-zinc-800 p-3">
            <h4 className="font-medium text-white">Pool sélectionné — estimation AMM</h4>
            {poolDepthUnavailableReason && <p role="status" className="mt-2 text-xs text-amber-200">Estimation indisponible — {poolDepthUnavailableReason}</p>}
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <DepthTable title="Coût moyen simulé à l'achat" levels={depth.poolBuy} baseSymbol={selectedPair.base} source="Source : réserves du pool sélectionné uniquement." loading={depthLoading || (!currentMarketTokens && !tokenError)} />
              <DepthTable title="Produit moyen simulé à la vente" levels={depth.poolSell} baseSymbol={selectedPair.base} source="Source : réserves du pool sélectionné uniquement." loading={depthLoading || (!currentMarketTokens && !tokenError)} />
            </div>
          </section>
          {depthError && <p role="status" className="mt-3 text-xs text-amber-200">{depthError}</p>}
        </details>
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 2xl:sticky 2xl:top-5">
        <div className="mb-4 flex rounded-xl bg-zinc-900 p-1"><button type="button" aria-pressed={side === "buy"} onClick={() => selectSide("buy")} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${side === "buy" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"}`}>Acheter {selectedPair.base}</button><button type="button" aria-pressed={side === "sell"} onClick={() => selectSide("sell")} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${side === "sell" ? "bg-red-500 text-white" : "text-zinc-400 hover:text-white"}`}>Vendre {selectedPair.base}</button></div>
        <div className="mb-4 flex items-center justify-between text-sm"><span className="text-zinc-400">Type d’ordre</span><span className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white">Marché</span></div>
        <button type="button" onClick={openSelectedMarketInSwap} className="flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-cyan-400">Échanger sur ZingSwap</button>
        {marketSwapError && <p role="alert" className="mt-2 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-xs text-amber-200">{marketSwapError}</p>}
      </section>
    </div>}
  </div>;
}

function DepthTable({ title, levels, baseSymbol, source, loading }: { title: string; levels: DepthEstimate[]; baseSymbol: string; source: string; loading: boolean }) {
  const displayLevels = levels.length ? levels : depthSizes.map((sizeUsd) => ({ sizeUsd, price: null, amount: null }));
  return <div>
    <h5 className="text-sm font-medium text-zinc-200">{title}</h5>
    <p className="mt-1 text-[11px] text-zinc-500">{source}</p>
    <div className="mt-2 space-y-1">
      {loading && !levels.length ? <p className="py-3 text-center text-xs text-zinc-500">Calcul…</p> : displayLevels.map((level) => (
        <div key={level.sizeUsd} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 rounded bg-zinc-900/70 px-2 py-2 text-xs sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)]">
          <span className="text-zinc-400">${level.sizeUsd} USD</span>
          {level.price !== null && level.amount !== null
            ? <><span className="text-zinc-200">{usd.format(level.price)} / {baseSymbol}</span><span className="text-zinc-400 sm:text-right">{level.amount.toPrecision(5)} {baseSymbol}</span></>
            : <span className="text-amber-200 sm:col-span-2">Estimation indisponible</span>}
        </div>
      ))}
    </div>
    <p className="mt-1 text-[10px] text-zinc-600">Prix moyen simulé en USD par {baseSymbol}; montant estimé en {baseSymbol}.</p>
  </div>;
}
