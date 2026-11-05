import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  findAllowedTradingTokenByMint,
  isAllowedTradingQuoteMint,
  isEligibleTradingPair,
  type AllowedTradingToken,
} from "../../../trading/allowedTokens";

export const runtime = "nodejs";

const DEX_TOKEN_PAIRS_URL = "https://api.dexscreener.com/token-pairs/v1/solana";
const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2";
function isCanonicalAddress(value: string): boolean {
  try { return new PublicKey(value).toBase58() === value; } catch { return false; }
}
const UPSTREAM_TIMEOUT_MS = 12_000;
const UPSTREAM_CACHE_SECONDS = 60;

type ProviderStatus = "ok" | "empty" | "rate_limited" | "unavailable" | "malformed";
type ProviderName = "DexScreener" | "GeckoTerminal";
type ParsedMetric = { value: number | null; malformed: boolean };
type ProviderResult = {
  name: ProviderName;
  status: ProviderStatus;
  markets: NormalizedMarket[];
  rejectedPools: RejectedPoolCounts;
  error?: string;
};
type RejectedPoolCounts = {
  wrongNetwork: number;
  invalidPoolOrMints: number;
  wrongBaseMint: number;
  disallowedQuoteMint: number;
};
type CachedMarketListing = {
  savedAt: number;
  markets: unknown[];
  rejectedPools: RejectedPoolCounts;
  conflictingPools: number;
};
const lastGoodMarketsByMint = new Map<string, CachedMarketListing>();
type NormalizedMarket = {
  address: string;
  dexId: string | null;
  baseMint: string;
  quoteMint: string;
  quoteSymbol: string;
  priceUsd: number | null;
  priceChange24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  sources: ProviderName[];
  malformedMetric: boolean;
  priceDisagreement?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMetric(value: unknown, minimum: number | null = null): ParsedMetric {
  if (value === undefined || value === null) return { value: null, malformed: false };
  if (typeof value !== "number" && typeof value !== "string") return { value: null, malformed: true };
  if (typeof value === "string" && value.trim() === "") return { value: null, malformed: true };
  const number = Number(value);
  if (!Number.isFinite(number) || (minimum !== null && number < minimum)) {
    return { value: null, malformed: true };
  }
  return { value: number, malformed: false };
}

function emptyRejectionCounts(): RejectedPoolCounts {
  return { wrongNetwork: 0, invalidPoolOrMints: 0, wrongBaseMint: 0, disallowedQuoteMint: 0 };
}

function nestedValue(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function normalizeDexMarket(value: unknown, requestedMint: string): NormalizedMarket | null {
  if (!isRecord(value)) return null;
  const baseToken = value.baseToken;
  const quoteToken = value.quoteToken;
  if (!isRecord(baseToken) || !isRecord(quoteToken)) return null;

  const address = value.pairAddress;
  const baseMint = baseToken.address;
  const quoteMint = quoteToken.address;
  const quote = typeof quoteMint === "string" ? findAllowedTradingTokenByMint(quoteMint) : undefined;
  if (
    value.chainId !== "solana" ||
    typeof address !== "string" || !isCanonicalAddress(address) ||
    typeof baseMint !== "string" || !isCanonicalAddress(baseMint) ||
    typeof quoteMint !== "string" || !isCanonicalAddress(quoteMint) ||
    baseMint !== requestedMint ||
    !quote || !isAllowedTradingQuoteMint(quoteMint) ||
    !isEligibleTradingPair(baseMint, quoteMint)
  ) return null;

  const price = readMetric(value.priceUsd, Number.MIN_VALUE);
  const change = readMetric(nestedValue(value, "priceChange", "h24"));
  const volume = readMetric(nestedValue(value, "volume", "h24"), 0);
  const liquidity = readMetric(nestedValue(value, "liquidity", "usd"), 0);
  const buys = readMetric(nestedValue(value, "txns", "h24", "buys"), 0);
  const sells = readMetric(nestedValue(value, "txns", "h24", "sells"), 0);
  const dexId = value.dexId;

  return {
    address,
    dexId: typeof dexId === "string" && dexId.trim() ? dexId.trim() : null,
    baseMint,
    quoteMint,
    quoteSymbol: quote.symbol,
    priceUsd: price.value,
    priceChange24hPct: change.value,
    volume24hUsd: volume.value,
    liquidityUsd: liquidity.value,
    buys24h: buys.value,
    sells24h: sells.value,
    sources: ["DexScreener"],
    malformedMetric: [price, change, volume, liquidity, buys, sells].some((metric) => metric.malformed),
  };
}

function normalizeGeckoMarkets(payload: unknown, requestedMint: string): { markets: NormalizedMarket[]; rejectedPools: RejectedPoolCounts } | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  if (payload.data.length === 0) return { markets: [], rejectedPools: emptyRejectionCounts() };
  if (!Array.isArray(payload.included)) return null;

  const rejectedPools = emptyRejectionCounts();
  const tokens = new Map<string, { address: string; symbol: string }>();
  for (const item of payload.included) {
    if (!isRecord(item) || item.type !== "token" || typeof item.id !== "string" || !isRecord(item.attributes)) continue;
    const address = item.attributes.address;
    const symbol = item.attributes.symbol;
    if (
      typeof address === "string" && isCanonicalAddress(address) &&
      item.id === `solana_${address}` && typeof symbol === "string" && symbol.trim()
    ) tokens.set(item.id, { address, symbol: symbol.trim() });
  }

  const result: NormalizedMarket[] = [];
  for (const item of payload.data) {
    if (!isRecord(item) || item.type !== "pool" || !isRecord(item.attributes) || !isRecord(item.relationships)) continue;
    const address = item.attributes.address;
    const baseTokenId = nestedValue(item.relationships, "base_token", "data", "id");
    const quoteTokenId = nestedValue(item.relationships, "quote_token", "data", "id");
    const dexId = nestedValue(item.relationships, "dex", "data", "id");
    const baseToken = typeof baseTokenId === "string" ? tokens.get(baseTokenId) : undefined;
    const quoteToken = typeof quoteTokenId === "string" ? tokens.get(quoteTokenId) : undefined;
    if (typeof address !== "string" || !isCanonicalAddress(address) || item.id !== `solana_${address}` || !baseToken || !quoteToken || typeof dexId !== "string" || !dexId.trim()) {
      rejectedPools.invalidPoolOrMints++;
      continue;
    }
    if (baseToken.address !== requestedMint) {
      rejectedPools.wrongBaseMint++;
      continue;
    }
    if (!isAllowedTradingQuoteMint(quoteToken.address) || !isEligibleTradingPair(baseToken.address, quoteToken.address)) {
      rejectedPools.disallowedQuoteMint++;
      continue;
    }

    const price = readMetric(item.attributes.base_token_price_usd, Number.MIN_VALUE);
    const change = readMetric(nestedValue(item.attributes, "price_change_percentage", "h24"));
    const volume = readMetric(nestedValue(item.attributes, "volume_usd", "h24"), 0);
    const liquidity = readMetric(item.attributes.reserve_in_usd, 0);
    const buys = readMetric(nestedValue(item.attributes, "transactions", "h24", "buys"), 0);
    const sells = readMetric(nestedValue(item.attributes, "transactions", "h24", "sells"), 0);
    result.push({
      address,
      dexId: dexId.trim(),
      baseMint: baseToken.address,
      quoteMint: quoteToken.address,
      quoteSymbol: findAllowedTradingTokenByMint(quoteToken.address)!.symbol,
      priceUsd: price.value,
      priceChange24hPct: change.value,
      volume24hUsd: volume.value,
      liquidityUsd: liquidity.value,
      buys24h: buys.value,
      sells24h: sells.value,
      sources: ["GeckoTerminal"],
      malformedMetric: [price, change, volume, liquidity, buys, sells].some((metric) => metric.malformed),
    });
  }

  if (payload.data.length > 0 && result.length === 0 && rejectedPools.invalidPoolOrMints === payload.data.length) return null;
  return { markets: result, rejectedPools };
}

async function fetchProvider(
  name: ProviderName,
  url: string,
  requestedMint: string,
): Promise<ProviderResult> {
  let response: Response;
  const noRejections = emptyRejectionCounts();
  try {
    response = await fetch(url, {
      headers: { accept: name === "GeckoTerminal" ? "application/json;version=20230302" : "application/json" },
      next: { revalidate: UPSTREAM_CACHE_SECONDS },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return { name, status: "unavailable", markets: [], rejectedPools: noRejections, error: `${name} est temporairement inaccessible.` };
  }

  if (response.status === 429) {
    return { name, status: "rate_limited", markets: [], rejectedPools: noRejections, error: `${name} a limité temporairement les requêtes.` };
  }
  if (!response.ok) {
    return { name, status: "unavailable", markets: [], rejectedPools: noRejections, error: `${name} est temporairement indisponible (HTTP ${response.status}).` };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { name, status: "malformed", markets: [], rejectedPools: noRejections, error: `La réponse ${name} est malformée.` };
  }

  if (name === "DexScreener") {
    if (!Array.isArray(payload)) {
      return { name, status: "malformed", markets: [], rejectedPools: noRejections, error: "La réponse DexScreener est malformée." };
    }
    const rejectedPools = emptyRejectionCounts();
    const markets: NormalizedMarket[] = [];
    for (const item of payload) {
      if (!isRecord(item)) {
        rejectedPools.invalidPoolOrMints++;
        continue;
      }
      const baseToken = item.baseToken;
      const quoteToken = item.quoteToken;
      const baseMint = isRecord(baseToken) ? baseToken.address : undefined;
      const quoteMint = isRecord(quoteToken) ? quoteToken.address : undefined;
      if (item.chainId !== "solana") {
        rejectedPools.wrongNetwork++;
        continue;
      }
      if (
        typeof item.pairAddress !== "string" || !isCanonicalAddress(item.pairAddress) ||
        typeof baseMint !== "string" || !isCanonicalAddress(baseMint) ||
        typeof quoteMint !== "string" || !isCanonicalAddress(quoteMint)
      ) {
        rejectedPools.invalidPoolOrMints++;
        continue;
      }
      if (baseMint !== requestedMint) {
        rejectedPools.wrongBaseMint++;
        continue;
      }
      if (!isAllowedTradingQuoteMint(quoteMint)) {
        rejectedPools.disallowedQuoteMint++;
        continue;
      }
      const market = normalizeDexMarket(item, requestedMint);
      if (market) markets.push(market);
      else rejectedPools.invalidPoolOrMints++;
    }
    const malformedOnly = payload.length > 0 && markets.length === 0 && rejectedPools.invalidPoolOrMints === payload.length;
    return {
      name,
      status: malformedOnly ? "malformed" : markets.length ? "ok" : "empty",
      markets,
      rejectedPools,
      ...(malformedOnly ? { error: "La réponse DexScreener contient uniquement des marchés malformés." } : {}),
    };
  }

  const normalized = normalizeGeckoMarkets(payload, requestedMint);
  if (normalized === null) {
    return { name, status: "malformed", markets: [], rejectedPools: noRejections, error: "La réponse GeckoTerminal est malformée." };
  }
  return { name, status: normalized.markets.length ? "ok" : "empty", ...normalized };
}

function mergeMarkets(results: ProviderResult[]) {
  const markets = new Map<string, NormalizedMarket>();
  const conflictingPools = new Set<string>();
  for (const incoming of results.flatMap((result) => result.markets)) {
    if (conflictingPools.has(incoming.address)) continue;
    const existing = markets.get(incoming.address);
    if (!existing) {
      markets.set(incoming.address, incoming);
      continue;
    }
    // A pool address must identify the same oriented pair at every source.
    if (existing.baseMint !== incoming.baseMint || existing.quoteMint !== incoming.quoteMint) {
      markets.delete(incoming.address);
      conflictingPools.add(incoming.address);
      continue;
    }
    const priceDisagreement = existing.priceDisagreement || Boolean(
      existing.priceUsd !== null && incoming.priceUsd !== null &&
      Math.abs(existing.priceUsd - incoming.priceUsd) / Math.min(existing.priceUsd, incoming.priceUsd) > 0.05,
    );
    // Keep one provider snapshot: filling individual fields can fabricate a market.
    const preferred = existing.priceUsd === null && incoming.priceUsd !== null ? incoming : existing;
    markets.set(incoming.address, {
      ...preferred,
      sources: [...new Set([...existing.sources, ...incoming.sources])],
      malformedMetric: existing.malformedMetric || incoming.malformedMetric,
      priceDisagreement,
    });
  }
  return { markets: [...markets.values()], conflictingPools: conflictingPools.size };
}

function compareMarkets(left: NormalizedMarket, right: NormalizedMarket): number {
  const leftActivity = left.buys24h === null || left.sells24h === null ? null : left.buys24h + left.sells24h;
  const rightActivity = right.buys24h === null || right.sells24h === null ? null : right.buys24h + right.sells24h;
  const leftCoherent = !left.malformedMetric && left.priceUsd !== null && left.priceUsd > 0;
  const rightCoherent = !right.malformedMetric && right.priceUsd !== null && right.priceUsd > 0;
  return Number(rightCoherent) - Number(leftCoherent) ||
    Number(rightActivity !== null) - Number(leftActivity !== null) ||
    (rightActivity ?? -1) - (leftActivity ?? -1) ||
    Number(right.volume24hUsd !== null) - Number(left.volume24hUsd !== null) ||
    (right.volume24hUsd ?? -1) - (left.volume24hUsd ?? -1) ||
    Number(right.liquidityUsd !== null) - Number(left.liquidityUsd !== null) ||
    (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1);
}

function marketQuality(market: NormalizedMarket) {
  const warningCodes: string[] = [];
  if (market.priceUsd === null) warningCodes.push("price_unavailable");
  if (market.volume24hUsd === null) warningCodes.push("volume_24h_unavailable");
  if (market.liquidityUsd === null) warningCodes.push("liquidity_unavailable");
  if (market.buys24h === null || market.sells24h === null) warningCodes.push("activity_unavailable");
  if (market.malformedMetric) warningCodes.push("provider_returned_malformed_metric");
  if (market.priceDisagreement) warningCodes.push("provider_price_disagreement");
  if (market.liquidityUsd !== null && market.liquidityUsd < 1000) warningCodes.push("low_reported_liquidity");
  warningCodes.push("provider_liquidity_not_independently_verified");

  return {
    status: warningCodes.length > 1 ? "partial_data" : "metrics_available",
    dataCoherent: !market.malformedMetric && !market.priceDisagreement && market.priceUsd !== null && market.priceUsd > 0,
    priceAvailable: market.priceUsd !== null,
    volume24hAvailable: market.volume24hUsd !== null,
    liquidityAvailable: market.liquidityUsd !== null,
    activityAvailable: market.buys24h !== null && market.sells24h !== null,
    activityTransactions24h: market.buys24h === null || market.sells24h === null
      ? null
      : market.buys24h + market.sells24h,
    warningCodes,
  };
}

function errorStatus(results: ProviderResult[]): number {
  if (results.some((result) => result.status === "rate_limited")) return 429;
  return 502;
}

export async function GET(request: NextRequest) {
  const mint = request.nextUrl.searchParams.get("mint")?.trim() ?? "";
  if (!isCanonicalAddress(mint)) {
    return NextResponse.json({ error: "Un Mint Solana valide est requis.", code: "INVALID_MINT" }, { status: 400 });
  }

  const token = findAllowedTradingTokenByMint(mint) as AllowedTradingToken | undefined;
  if (!token) {
    return NextResponse.json({ error: "Ce Mint n’est pas autorisé dans Trading.", code: "MINT_NOT_ALLOWED" }, { status: 403 });
  }
  if (!token.canBeBase) {
    return NextResponse.json({ error: "Ce Mint est autorisé comme devise de cotation, pas comme actif de base.", code: "MINT_NOT_ALLOWED_AS_BASE" }, { status: 400 });
  }

  const dexUrl = `${DEX_TOKEN_PAIRS_URL}/${encodeURIComponent(mint)}`;
  const geckoUrl = new URL(`${GECKO_BASE_URL}/networks/solana/tokens/${encodeURIComponent(mint)}/pools`);
  geckoUrl.searchParams.set("include", "base_token,quote_token,dex");
  const providers = await Promise.all([
    fetchProvider("DexScreener", dexUrl, mint),
    fetchProvider("GeckoTerminal", geckoUrl.toString(), mint),
  ]);
  const anyProviderResponded = providers.some((provider) => provider.status === "ok" || provider.status === "empty");
  if (!anyProviderResponded) {
    const cached = lastGoodMarketsByMint.get(mint);
    if (cached && Date.now() - cached.savedAt < 3 * 60_000) {
      return NextResponse.json({
        status: "available",
        asset: { name: token.name, symbol: token.symbol, mint: token.mint },
        authorizationStatus: token.authorizationStatus,
        verificationStatus: token.verificationStatus,
        message: "Fournisseurs indisponibles · derniers marchés connus affichés.",
        markets: cached.markets,
        rejectedPools: cached.rejectedPools,
        conflictingPools: cached.conflictingPools,
        discovery: { exhaustive: false, orientation: "base-only" },
        providers: providers.map(({ name, status: providerStatus, error }) => ({
          name,
          status: providerStatus,
          ...(error ? { error } : {}),
        })),
        partial: true,
        stale: true,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      error: "Aucun fournisseur de marché n’a répondu avec des données exploitables.",
      code: providers.some((provider) => provider.status === "malformed") ? "UPSTREAM_MALFORMED" : "UPSTREAM_UNAVAILABLE",
      providers: providers.map(({ name, status, error }) => ({ name, status, ...(error ? { error } : {}) })),
    }, { status: errorStatus(providers) });
  }

  const merged = mergeMarkets(providers);
  const seenPairs = new Set<string>();
  const markets = merged.markets
    .sort(compareMarkets)
    // Keep the best-ranked pool for each oriented token pair.
    .filter((market) => {
      const pairKey = `${market.baseMint}:${market.quoteMint}`;
      if (seenPairs.has(pairKey)) return false;
      seenPairs.add(pairKey);
      return true;
    })
    .map((market) => ({
      network: "solana" as const,
      asset: { name: token.name, symbol: token.symbol, mint: token.mint },
      poolAddress: market.address,
      dex: market.dexId,
      quote: {
        mint: market.quoteMint,
        symbol: market.quoteSymbol,
      },
      priceUsd: market.priceUsd,
      priceChange24hPct: market.priceChange24hPct,
      volume24hUsd: market.volume24hUsd,
      liquidityUsd: market.liquidityUsd,
      authorizationStatus: token.authorizationStatus,
      verificationStatus: token.verificationStatus,
      sources: market.sources,
      quality: marketQuality(market),
    }));

  const providersHadErrors = providers.some((provider) => !["ok", "empty"].includes(provider.status));
  const status = markets.length ? "available" : providersHadErrors ? "indeterminate" : "none";
  const rejectedPools = providers.reduce<RejectedPoolCounts>((total, provider) => ({
    wrongNetwork: total.wrongNetwork + provider.rejectedPools.wrongNetwork,
    invalidPoolOrMints: total.invalidPoolOrMints + provider.rejectedPools.invalidPoolOrMints,
    wrongBaseMint: total.wrongBaseMint + provider.rejectedPools.wrongBaseMint,
    disallowedQuoteMint: total.disallowedQuoteMint + provider.rejectedPools.disallowedQuoteMint,
  }), emptyRejectionCounts());
  if (markets.length > 0) {
    lastGoodMarketsByMint.set(mint, {
      savedAt: Date.now(),
      markets,
      rejectedPools,
      conflictingPools: merged.conflictingPools,
    });
    if (lastGoodMarketsByMint.size > 24) lastGoodMarketsByMint.delete(lastGoodMarketsByMint.keys().next().value as string);
  }
  return NextResponse.json({
    status,
    asset: { name: token.name, symbol: token.symbol, mint: token.mint },
    authorizationStatus: token.authorizationStatus,
    verificationStatus: token.verificationStatus,
    message: markets.length
      ? null
      : providersHadErrors
        ? "Aucun marché n’a été confirmé par les fournisseurs disponibles ; une source a échoué."
        : "Aucun marché éligible n’est disponible pour ce Mint autorisé.",
    markets,
    rejectedPools,
    conflictingPools: merged.conflictingPools,
    discovery: {
      exhaustive: false,
      orientation: "base-only",
      note: "Résultats disponibles des fournisseurs, sans garantie d’exhaustivité. Les pools inversés ne sont pas pris en charge.",
    },
    providers: providers.map(({ name, status: providerStatus, error }) => ({
      name,
      status: providerStatus,
      ...(error ? { error } : {}),
    })),
    partial: providersHadErrors,
  }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" },
  });
}
