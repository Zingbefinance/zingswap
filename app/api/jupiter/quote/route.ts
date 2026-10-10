import { NextResponse } from "next/server";

const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface JupiterOrderResponse {
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
  error?: string;
  errorMessage?: string;
}

function formatUnits(rawAmount: string, decimals: number): string {
  const padded = rawAmount.padStart(decimals + 1, "0");
  if (decimals === 0) return padded;

  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export async function POST(request: Request) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cotation externe indisponible : configuration serveur manquante." },
      { status: 503 }
    );
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
      BigInt(amount) <= 0n ||
      !Number.isInteger(inputDecimals) ||
      inputDecimals < 0 ||
      inputDecimals > 18 ||
      !Number.isInteger(outputDecimals) ||
      outputDecimals < 0 ||
      outputDecimals > 18 ||
      ![10, 50, 100, 300].includes(slippageBps)
    ) {
      return NextResponse.json(
        { error: "Paramètres de cotation invalides." },
        { status: 400 }
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

    let order: JupiterOrderResponse;
    try {
      order = (await response.json()) as JupiterOrderResponse;
    } catch {
      return NextResponse.json(
        { error: `Réponse Jupiter illisible (HTTP ${response.status}).` },
        { status: 502 }
      );
    }

    if (!response.ok) {
      const upstreamError = `${order.errorMessage ?? ""} ${order.error ?? ""}`;
      const error = /referralAccount.*(?:initiali[sz]ed|initiali[sz]ation)/i.test(upstreamError)
        ? "Le compte de parrainage configuré n’est pas initialisé auprès de Jupiter. La cotation externe est indisponible tant que ce compte n’est pas configuré."
        : /(?:could not find|no|not found|cannot find).{0,30}route|route.{0,30}(?:not found|unavailable)/i.test(upstreamError)
          ? "Aucune route externe disponible pour cette paire et ce montant."
          : `Jupiter a refusé la cotation (HTTP ${response.status}). Vérifie les paramètres et la configuration de parrainage.`;

      return NextResponse.json(
        { error },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!order.outAmount || !/^\d+$/.test(order.outAmount)) {
      return NextResponse.json(
        { error: "Réponse Jupiter invalide : le montant de sortie est absent." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const route = (order.routePlan ?? [])
      .map(({ swapInfo, percent }) => {
        if (!swapInfo?.label) return null;
        return typeof percent === "number"
          ? `${swapInfo.label} (${percent}%)`
          : swapInfo.label;
      })
      .filter((label): label is string => Boolean(label));
    const feeAmountRaw = order.platformFee?.amount ?? null;
    const feeMint = order.platformFee?.feeMint ?? order.feeMint ?? null;
    const feeDecimals = feeMint === inputMint
      ? inputDecimals
      : feeMint === outputMint
        ? outputDecimals
        : null;

    return NextResponse.json(
      {
        amountIn: formatUnits(amount, inputDecimals),
        amountOut: formatUnits(order.outAmount, outputDecimals),
        amountInRaw: amount,
        amountOutRaw: order.outAmount,
        router: order.router ?? null,
        route: route.length > 0 ? route : order.router ? [order.router] : [],
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
      return NextResponse.json(
        { error: "La cotation Jupiter a dépassé le délai de 10 secondes." },
        { status: 504, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return NextResponse.json(
        { error: "La demande de cotation a été annulée." },
        { status: 499, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { error: "Jupiter est injoignable pour le moment. Réessaie la cotation." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
