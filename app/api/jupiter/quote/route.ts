import { NextResponse } from "next/server";

const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface JupiterOrderResponse {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  router?: string;
  routePlan?: Array<{
    percent?: number;
    swapInfo?: { label?: string };
  }>;
  feeBps?: number;
  feeMint?: string;
  platformFee?: { amount?: string; feeMint?: string; feeBps?: number };
  referralAccount?: string;
  priceImpact?: number;
  signatureFeeLamports?: number;
  prioritizationFeeLamports?: number;
  rentFeeLamports?: number;
  transaction?: string | null;
  errorCode?: number;
  error?: string;
  errorMessage?: string;
}

type QuoteErrorType = "configuration" | "authentication" | "rate_limit" | "quota" | "no_route" | "upstream" | "network" | "invalid_request" | "invalid_response" | "cancelled";

function quoteError(message: string, errorType: QuoteErrorType, status: number) {
  return NextResponse.json(
    { error: message, errorType },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isNoRouteError(message: string) {
  return /no[_\s-]*routes?[_\s-]*found|could[_\s-]*not[_\s-]*find[_\s-]*(?:any[_\s-]*)?route|no valid route|route.{0,40}(?:not found|unavailable)|(?:could not find|cannot find).{0,40}route|token[_\s-]*not[_\s-]*tradable|market[_\s-]*not[_\s-]*found|route[_\s-]*plan[_\s-]*does[_\s-]*not[_\s-]*consume/i.test(message);
}

function formatUnits(rawAmount: string, decimals: number): string {
  const padded = rawAmount.padStart(decimals + 1, "0");
  if (decimals === 0) return padded;

  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export async function POST(request: Request) {
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  if (!apiKey) {
    return quoteError("Configuration serveur manquante : clé API externe absente.", "configuration", 503);
  }

  try {
    const body = await request.json();
    const { inputMint, outputMint, amount, inputDecimals, outputDecimals, slippageBps } = body;

    if (
      typeof inputMint !== "string" ||
      !MINT_PATTERN.test(inputMint) ||
      typeof outputMint !== "string" ||
      !MINT_PATTERN.test(outputMint) ||
      inputMint === outputMint ||
      typeof amount !== "string" ||
      !/^\d+$/.test(amount) ||
      BigInt(amount) <= BigInt(0) ||
      !Number.isInteger(inputDecimals) ||
      inputDecimals < 0 ||
      inputDecimals > 18 ||
      !Number.isInteger(outputDecimals) ||
      outputDecimals < 0 ||
      outputDecimals > 18 ||
      ![10, 50, 100, 300].includes(slippageBps)
    ) {
      return NextResponse.json(
        { error: "Paramètres de cotation invalides.", errorType: "invalid_request" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const params = new URLSearchParams({ inputMint, outputMint, amount, slippageBps: String(slippageBps) });
    const referralAccount = process.env.JUPITER_REFERRAL_ACCOUNT?.trim();
    if (referralAccount && MINT_PATTERN.test(referralAccount)) {
      params.set("referralAccount", referralAccount);
      params.set("referralFee", "50");
    }
    const response = await fetch(`${JUPITER_ORDER_URL}?${params}`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });

    const responseText = await response.text();
    let order: JupiterOrderResponse;
    try {
      order = JSON.parse(responseText) as JupiterOrderResponse;
    } catch {
      if (response.status === 401 || response.status === 403) {
        return quoteError("Authentification ou autorisation Jupiter refusée. Vérifiez la clé API et ses permissions.", "authentication", 502);
      }
      if (response.status === 429) {
        return quoteError("Limite de requêtes Jupiter atteinte. Réessayez dans un instant.", "rate_limit", 429);
      }
      if (response.status === 402) {
        return quoteError("Quota ou accès facturé Jupiter indisponible. Vérifiez l’offre et le quota de la clé.", "quota", 502);
      }
      if (!response.ok) {
        return quoteError(`Jupiter a répondu avec une erreur HTTP ${response.status}.`, "upstream", 502);
      }
      return quoteError("Réponse Jupiter invalide : le JSON de cotation est illisible.", "invalid_response", 502);
    }
    if (!order || typeof order !== "object" || Array.isArray(order)) {
      return quoteError("Réponse Jupiter invalide : format de cotation inattendu.", "invalid_response", 502);
    }

    if (!response.ok) {
      const upstreamError = `${order.errorMessage ?? ""} ${order.error ?? ""}`;
      if (response.status === 401 || response.status === 403) {
        return quoteError("Authentification ou autorisation Jupiter refusée. Vérifiez la clé API et ses permissions.", "authentication", 502);
      }
      if (response.status === 429) {
        return quoteError("Limite de requêtes Jupiter atteinte. Réessayez dans un instant.", "rate_limit", 429);
      }
      if (response.status === 402) {
        return quoteError("Quota ou accès facturé Jupiter indisponible. Vérifiez l’offre et le quota de la clé.", "quota", 502);
      }
      if (/referral(?:account| token account).{0,100}(?:not initialized|initiali[sz]ation|does not exist)/i.test(upstreamError)) {
        return quoteError("Configuration de parrainage invalide ou non initialisée. Vérifiez JUPITER_REFERRAL_ACCOUNT.", "configuration", 502);
      }
      if (isNoRouteError(upstreamError)) {
        return quoteError("Aucune route externe disponible pour cette paire et ce montant.", "no_route", 404);
      }
      if (response.status >= 500) {
        return quoteError(`Le service Jupiter a répondu avec une erreur HTTP ${response.status}.`, "upstream", 502);
      }
      return quoteError(`Jupiter a refusé la demande de cotation (HTTP ${response.status}). Vérifiez ses paramètres.`, "upstream", 502);
    }

    const upstreamError = `${order.errorMessage ?? ""} ${order.error ?? ""}`.trim();
    if ((upstreamError || order.errorCode != null) && (!order.outAmount || !/^\d+$/.test(order.outAmount))) {
      return isNoRouteError(upstreamError)
        ? quoteError("Aucune route externe disponible pour cette paire et ce montant.", "no_route", 404)
        : quoteError("Jupiter a renvoyé une erreur de cotation.", "upstream", 502);
    }
    if (upstreamError && isNoRouteError(upstreamError)) {
      return quoteError("Aucune route externe disponible pour cette paire et ce montant.", "no_route", 404);
    }

    if (!order.inAmount || !/^\d+$/.test(order.inAmount) || BigInt(order.inAmount) !== BigInt(amount)) {
      return quoteError("Réponse Jupiter invalide : le montant brut d’entrée ne correspond pas à la demande.", "invalid_response", 502);
    }

    if (
      (order.inputMint && order.inputMint !== inputMint) ||
      (order.outputMint && order.outputMint !== outputMint)
    ) {
      return quoteError("Réponse Jupiter invalide : les mints ne correspondent pas à la demande.", "invalid_response", 502);
    }

    if (!order.outAmount || !/^\d+$/.test(order.outAmount)) {
      return quoteError("Réponse Jupiter invalide : le montant de sortie est absent.", "invalid_response", 502);
    }
    if (BigInt(order.outAmount) <= BigInt(0)) {
      return quoteError("Jupiter n’a fourni aucune sortie cotable.", "no_route", 404);
    }

    const routeCount = (order.routePlan ?? []).length || (order.router ? 1 : 0);
    const feeAmountRaw = order.platformFee?.amount ?? null;
    const feeMint = order.platformFee?.feeMint ?? order.feeMint ?? null;
    const feeDecimals = feeMint === inputMint
      ? inputDecimals
      : feeMint === outputMint
        ? outputDecimals
        : null;

    return NextResponse.json(
      {
        amountIn: formatUnits(order.inAmount, inputDecimals),
        amountOut: formatUnits(order.outAmount, outputDecimals),
        amountInRaw: order.inAmount,
        amountOutRaw: order.outAmount,
        inputMint,
        outputMint,
        inputDecimals,
        outputDecimals,
        router: order.router ? "Route externe" : null,
        route: Array.from({ length: routeCount }, () => "Route externe"),
        feeBps: typeof order.feeBps === "number" ? order.feeBps : null,
        feeAmountRaw,
        feeAmount:
          feeAmountRaw && feeDecimals != null
            ? formatUnits(feeAmountRaw, feeDecimals)
            : feeAmountRaw,
        feeMint,
        platformFeeBps: typeof order.platformFee?.feeBps === "number" ? order.platformFee.feeBps : null,
        referralFeeBpsRequested: params.has("referralFee") ? 50 : null,
        referralConfirmed: Boolean(order.referralAccount && order.referralAccount === referralAccount),
        referralNetBps: order.platformFee?.feeBps != null && order.referralAccount === referralAccount
          ? Math.floor(order.platformFee.feeBps * 0.8)
          : null,
        poolFees: null,
        priceImpact: typeof order.priceImpact === "number" ? order.priceImpact : null,
        signatureFeeLamports:
          typeof order.signatureFeeLamports === "number" ? order.signatureFeeLamports : null,
        prioritizationFeeLamports:
          typeof order.prioritizationFeeLamports === "number"
            ? order.prioritizationFeeLamports
            : null,
        rentFeeLamports:
          typeof order.rentFeeLamports === "number" ? order.rentFeeLamports : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return quoteError("La demande de cotation a expiré avant la réponse du service externe.", "network", 504);
    }

    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return quoteError("La demande de cotation a été annulée.", "cancelled", 499);
    }

    return quoteError("Le service externe est injoignable. Vérifiez la connexion puis réessayez.", "network", 502);
  }
}
