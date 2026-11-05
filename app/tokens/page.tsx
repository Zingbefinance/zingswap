"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";

import {
  getLocalTokenList,
  searchTokens,
} from "@/lib/tokens/tokenRegistry";
import { Token } from "@/lib/tokens/types";
import { useSelectedToken } from "@/components/providers/TokenContext";
import { getSwapNetwork } from "@/lib/lifi/chains";
import { getPinnedUsdtToken } from "@/lib/lifi/pinnedUsdt";

type SearchToken = Token & { address?: string; chainId?: number; logoURI?: string; priceUSD?: string | number };
const EVM_ADDRESS = /^0x[\da-fA-F]{40}$/;

function resolveReturnTo(value: string | null) {
  return value === "/swap" ? value : "/";
}

function buildReturnHref(params: URLSearchParams, returnTo: string) {
  params.delete("side");
  params.delete("network");
  params.delete("returnTo");
  const query = params.toString();
  return query ? `${returnTo}?${query}` : returnTo;
}

function TokensContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    setSelectedToken,
    setSelectedSide,
    selectSwapToken,
  } = useSelectedToken();

  const side = searchParams.get("side");
  const network = searchParams.get("network");
  const returnTo = resolveReturnTo(searchParams.get("returnTo"));
  const isEvmSearch = Boolean(network);
  const networkName = network ? getSwapNetwork(Number(network))?.name ?? `Réseau ${network}` : "";

  const [tokens, setTokens] = useState<SearchToken[]>([]);
  const [tokenResultKey, setTokenResultKey] = useState("");
  const [evmTokenList, setEvmTokenList] = useState<SearchToken[]>([]);

  const [search, setSearch] = useState("");
  const [asyncLoadingKey, setAsyncLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [priceResult, setPriceResult] = useState<{ key: string; prices: Record<string, { usd: number; change24h: number | null }>; unavailable: boolean } | null>(null);
  const [loadedTokenNetwork, setLoadedTokenNetwork] = useState<string | null>(null);

  const query = search.trim();
  const selectedChainId = Number(network);
  const listedAddressToken = isEvmSearch && EVM_ADDRESS.test(query)
    ? evmTokenList.find((token) =>
      token.chainId === selectedChainId &&
      (token.address ?? token.mint).toLowerCase() === query.toLowerCase() &&
      typeof token.symbol === "string" && token.symbol.trim().length > 0 &&
      typeof token.name === "string" && token.name.trim().length > 0 &&
      Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 255,
    )
    : undefined;
  const evmResults = useMemo(() => query
    ? evmTokenList.filter((token) => token.chainId === selectedChainId && `${token.symbol} ${token.name} ${token.address ?? token.mint}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    : evmTokenList, [evmTokenList, query, selectedChainId]);
  const activeSearchKey = isEvmSearch
    ? EVM_ADDRESS.test(query) ? `evm:${network}:${query.toLowerCase()}` : `evm:${network}:list:${query.toLowerCase()}`
    : query ? `sol:${query.toLowerCase()}` : "sol:all";
  const displayedTokens = useMemo<SearchToken[]>(() => isEvmSearch
    ? listedAddressToken ? [listedAddressToken] : EVM_ADDRESS.test(query) ? (tokenResultKey === activeSearchKey ? tokens : []) : evmResults
    : query ? (tokenResultKey === activeSearchKey ? tokens : []) : getLocalTokenList(), [isEvmSearch, listedAddressToken, query, tokenResultKey, activeSearchKey, tokens, evmResults]);
  const pricesKey = Array.from(new Set(displayedTokens.map((token) => token.mint))).sort().join(",");
  const prices = priceResult?.key === pricesKey ? priceResult.prices : {};
  const pricesLoading = !isEvmSearch && displayedTokens.length > 0 && priceResult?.key !== pricesKey;
  const pricesUnavailable = priceResult?.key === pricesKey && priceResult.unavailable;
  const loading = (Boolean(network) && loadedTokenNetwork !== network) ||
    ((isEvmSearch && EVM_ADDRESS.test(query) && !listedAddressToken) || (!isEvmSearch && Boolean(query))) && tokenResultKey !== activeSearchKey || asyncLoadingKey === activeSearchKey;

  useEffect(() => {
    if (!network) return;
    let cancelled = false;
    fetch(`/api/lifi?resource=tokens&chainId=${encodeURIComponent(network)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { tokens?: Record<string, SearchToken[]>; error?: string };
        if (!response.ok) throw new Error(payload.error || "Impossible de charger les tokens de ce réseau.");
        return payload.tokens?.[network] ?? [];
      })
      .then((list) => {
        if (!cancelled) {
          const remoteTokens = list
            .filter((token) => token.chainId === Number(network) && typeof token.address === "string")
            .map((token) => ({ ...token, mint: token.address! }));
          const pinnedUsdt = getPinnedUsdtToken(Number(network));
          const tokenList = pinnedUsdt && !remoteTokens.some((token) => token.address?.toLowerCase() === pinnedUsdt.address.toLowerCase())
            ? [...remoteTokens, pinnedUsdt]
            : remoteTokens;
          setEvmTokenList(tokenList);
          setError("");
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          const pinnedUsdt = getPinnedUsdtToken(Number(network));
          if (pinnedUsdt) {
            setEvmTokenList([pinnedUsdt]);
            setError("");
          } else {
            setError(cause instanceof Error ? cause.message : "Impossible de charger les tokens du réseau.");
          }
        }
      })
      .finally(() => { if (!cancelled) setLoadedTokenNetwork(network); });
    return () => { cancelled = true; };
  }, [network]);

  useEffect(() => {
    let cancelled = false;
    if (isEvmSearch) return;
    if (!pricesKey) return () => { cancelled = true; };
    const mints = pricesKey.split(",");
    const key = mints.slice().sort().join(",");

    fetch(`/api/tokens/prices?mints=${encodeURIComponent(mints.join(","))}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Prices unavailable");
        return (await response.json()) as {
          prices?: Record<string, { usd: number; change24h: number | null }>;
        };
      })
      .then((data) => {
        if (!cancelled) setPriceResult({ key, prices: data.prices ?? {}, unavailable: false });
      })
      .catch(() => {
        if (!cancelled) setPriceResult({ key, prices: {}, unavailable: true });
      });

    return () => {
      cancelled = true;
    };
  }, [pricesKey, isEvmSearch]);

  const formatUsd = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumSignificantDigits: 2,
      maximumSignificantDigits: 6,
    }).format(value);

  useEffect(() => {
    const query = search.trim();

    if (isEvmSearch) {
      const selectedChainId = Number(network);
      if (EVM_ADDRESS.test(query)) {
        let cancelled = false;
        const normalizedAddress = query.toLowerCase();
        if (listedAddressToken) return;
        const key = `evm:${network}:${normalizedAddress}`;
        fetch(`/api/lifi?resource=token&chainId=${encodeURIComponent(network ?? "")}&address=${encodeURIComponent(query)}`, { cache: "no-store" })
          .then(async (response) => {
            const payload = await response.json() as { token?: SearchToken; error?: string } & SearchToken;
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(payload.error || "Impossible de rechercher ce token sur LI.FI.");
            return payload.token ?? payload;
          })
          .then((token) => {
            if (!token) {
              if (!cancelled) { setTokens([]); setTokenResultKey(key); setError(""); }
              return;
            }
            const address = typeof token.address === "string" ? token.address : token.mint;
            if (cancelled) return;
            if (
              token.chainId === selectedChainId &&
              typeof address === "string" && address.toLowerCase() === normalizedAddress &&
              typeof token.symbol === "string" && token.symbol.trim().length > 0 &&
              typeof token.name === "string" && token.name.trim().length > 0 &&
              Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 255
            ) {
              setTokens([{ ...token, address, mint: address }]);
              setTokenResultKey(key);
              setError("");
              return;
            }
            setTokens([]);
            setTokenResultKey(key);
            setError("");
          })
          .catch((cause) => {
            if (cancelled) return;
            setTokens([]);
            setTokenResultKey(key);
            // An unknown address is an empty result; a failed lookup is a service error.
            if (cause instanceof Error && !/404|not found|unknown token/i.test(cause.message)) setError(cause.message);
          })
        return () => { cancelled = true; };
      }
      return;
    }

    if (!query) return;
    let cancelled = false;
    const key = `sol:${query.toLowerCase()}`;

    const timer = setTimeout(async () => {
      try {
        setAsyncLoadingKey(key);
        setError("");

        const result = await searchTokens(query);

        if (!cancelled) {
          const normalizedQuery = query.toLocaleLowerCase();
          const localMintMatches = getLocalTokenList().filter((token) =>
            token.mint.toLocaleLowerCase().includes(normalizedQuery),
          );
          const resultMints = new Set(result.map((token) => token.mint));
          setTokens([...result, ...localMintMatches.filter((token) => !resultMints.has(token.mint))]);
          setTokenResultKey(key);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(
            "Erreur recherche token :",
            err
          );

          setError(
            "Impossible de rechercher les tokens."
          );

          setTokens([]);
          setTokenResultKey(key);
        }
      } finally {
        if (!cancelled) {
          setAsyncLoadingKey((current) => current === key ? null : current);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, isEvmSearch, network, evmTokenList, listedAddressToken]);

  const handleSelectToken = (token: SearchToken) => {
    if (isEvmSearch) {
      if ((side !== "from" && side !== "to") || token.chainId !== Number(network)) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("fromToken", side === "from" ? token.mint : params.get("fromToken") ?? "");
      params.set("toToken", side === "to" ? token.mint : params.get("toToken") ?? "");
      router.push(buildReturnHref(params, returnTo));
      return;
    }
    if (side === "from" || side === "to") {
      selectSwapToken(side, {
        symbol: token.symbol,
        name: token.name,
        mint: token.mint,
        decimals: token.decimals,
      });
    }
    setSelectedToken({ symbol: token.symbol, name: token.name, mint: token.mint, decimals: token.decimals });
    setSelectedSide(null);

    router.push(buildReturnHref(new URLSearchParams(searchParams.toString()), returnTo));
  };

  const backHref = buildReturnHref(new URLSearchParams(searchParams.toString()), returnTo);

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-950 px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-white sm:px-4 sm:py-6">
      <div className="mx-auto w-full max-w-2xl">

        <div className="mb-6 flex min-w-0 items-start gap-3">
          <Link
            href={backHref}
            className="
              rounded-lg
              bg-zinc-900
              p-2
              text-zinc-300
              transition
              hover:bg-zinc-800
              hover:text-white
            "
          >
            <ArrowLeft size={20} />
          </Link>

          <div className="min-w-0">
            <h1 className="text-xl font-bold">
              Rechercher un token
            </h1>

            <p className="text-sm text-zinc-500">
              {isEvmSearch ? `${side === "from" ? "Choisissez le token à échanger" : "Choisissez le token à recevoir"} sur ${networkName}.`
                : side === "from"
                ? "Choisissez le token à échanger."
                : side === "to"
                  ? "Choisissez le token à recevoir."
                  : "Recherchez par nom, symbole ou adresse mint."}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search
            size={20}
            className="
              absolute
              left-4
              top-1/2
              -translate-y-1/2
              text-zinc-500
            "
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder={isEvmSearch
              ? "Rechercher par nom, symbole ou adresse de contrat..."
              : "Rechercher par nom, symbole ou adresse mint..."}
            autoFocus
            className="
              w-full
              rounded-xl
              border
              border-zinc-800
              bg-zinc-900
              py-4
              pl-12
              pr-4
              text-white
              outline-none
              placeholder:text-zinc-500
              focus:border-cyan-500
            "
          />
        </div>

        <div className="mt-4">

          {loading && (
            <div
              className="
                rounded-xl
                bg-zinc-900
                p-6
                text-center
                text-sm
                text-zinc-500
              "
            >
              Recherche des tokens...
            </div>
          )}

          {!loading && error && (
            <div
              className="
                rounded-xl
                bg-zinc-900
                p-6
                text-center
                text-sm
                text-red-400
              "
            >
              {error}
            </div>
          )}

          {!loading &&
            !error &&
            displayedTokens.length === 0 && (
              <div
                className="
                  rounded-xl
                  bg-zinc-900
                  p-6
                  text-center
                  text-sm
                  text-zinc-500
                "
              >
                {isEvmSearch && EVM_ADDRESS.test(search.trim()) ? "Token introuvable." : "Aucun token trouvé."}
              </div>
            )}

          {!loading &&
            !error &&
            displayedTokens.length > 0 && (
              <div className="space-y-1">

                {displayedTokens.map((token) => (
                  <button
                    key={token.mint}
                    type="button"
                    onClick={() =>
                      handleSelectToken(token)
                    }
                    className="
                      flex
                      min-w-0
                      w-full
                      items-center
                      justify-between
                      rounded-xl
                      bg-zinc-900
                      gap-3
                      p-3 sm:p-4
                      text-left
                      transition
                      hover:bg-zinc-800
                    "
                  >

                    <div className="flex min-w-0 flex-1 items-center gap-3">

                      {token.logoURI ? <img src={token.logoURI} alt="" className="h-10 w-10 shrink-0 rounded-full bg-zinc-800" /> : isEvmSearch ? <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-800" /> : <div
                        className="
                          flex
                          h-10
                          w-10
                          shrink-0
                          items-center
                          justify-center
                          overflow-hidden
                          rounded-full
                          bg-cyan-500
                          font-bold
                          text-black
                        "
                      >
                        {token.symbol.slice(0, 1)}
                      </div>}

                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {token.symbol}
                        </p>

                        <p className="truncate text-sm text-zinc-500">
                          {token.name}
                        </p>

                        <p className="truncate text-xs text-zinc-700">
                          {isEvmSearch ? "" : token.mint}
                        </p>
                      </div>

                    </div>

                    <div className="max-w-[42%] shrink-0 text-right">
                      <p className="text-sm font-medium text-zinc-200">
                        {token.priceUSD != null && Number.isFinite(Number(token.priceUSD)) && Number(token.priceUSD) > 0
                          ? formatUsd(Number(token.priceUSD))
                          : isEvmSearch
                            ? ""
                            : pricesLoading
                          ? "Chargement du prix..."
                          : prices[token.mint]
                            ? formatUsd(prices[token.mint].usd)
                            : "Prix indisponible"}
                      </p>
                      {prices[token.mint]?.change24h != null && (
                        <p
                          className={`text-xs ${
                            prices[token.mint].change24h! >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {prices[token.mint].change24h! > 0 ? "+" : ""}
                          {prices[token.mint].change24h!.toFixed(2)}% · 24 h
                        </p>
                      )}
                      {!pricesLoading && pricesUnavailable && (
                        <p className="text-xs text-zinc-500">
                          Données de prix indisponibles
                        </p>
                      )}
                    </div>

                  </button>
                ))}

              </div>
            )}

        </div>
      </div>
    </main>
  );
}

function TokensLoading() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">
          Chargement...
        </div>
      </div>
    </main>
  );
}

export default function TokensPage() {
  return (
    <Suspense fallback={<TokensLoading />}>
      <TokensContent />
    </Suspense>
  );
}
