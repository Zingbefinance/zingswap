import { NextResponse } from "next/server";

const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const PUBLIC_KEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface JupiterOrder {
  transaction?: string | null;
  requestId?: string;
  inAmount?: string;
  outAmount?: string;
  router?: string;
  feeBps?: number;
  feeMint?: string;
  platformFee?: { amount?: string; feeMint?: string; feeBps?: number };
  referralAccount?: string;
  lastValidBlockHeight?: string;
  expireAt?: string;
  errorCode?: number;
  errorMessage?: string;
  error?: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La route externe est indisponible : configuration serveur manquante." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { inputMint, outputMint, amount, taker, slippageBps } = body;

    if (
      typeof inputMint !== "string" ||
      !PUBLIC_KEY_PATTERN.test(inputMint) ||
      typeof outputMint !== "string" ||
      !PUBLIC_KEY_PATTERN.test(outputMint) ||
      inputMint === outputMint ||
      typeof amount !== "string" ||
      !/^\d+$/.test(amount) ||
      BigInt(amount) <= 0n ||
      typeof taker !== "string" ||
      !PUBLIC_KEY_PATTERN.test(taker) ||
      ![10, 50, 100, 300].includes(slippageBps)
    ) {
      return NextResponse.json(
        { error: "Paramètres de cotation externe invalides." },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({ inputMint, outputMint, amount, taker, slippageBps: String(slippageBps) });
    const referralAccount = process.env.JUPITER_REFERRAL_ACCOUNT?.trim();
    if (referralAccount && PUBLIC_KEY_PATTERN.test(referralAccount)) {
      params.set("referralAccount", referralAccount);
      params.set("referralFee", "50");
    }
    const response = await fetch(`${JUPITER_ORDER_URL}?${params}`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const order = (await response.json()) as JupiterOrder;

    if (!response.ok) {
      return NextResponse.json(
        { error: "Impossible de créer une transaction via la route externe." },
        { status: 502 }
      );
    }

    // Do not turn an order without a signable transaction into an executable order.
    return NextResponse.json(
      {
        transaction: order.transaction ?? null,
        requestId: order.requestId ?? null,
        inAmount: order.inAmount ?? null,
        outAmount: order.outAmount ?? null,
        router: order.router ?? null,
        feeBps: typeof order.feeBps === "number" ? order.feeBps : null,
        feeMint: order.feeMint ?? null,
        platformFee: order.platformFee ?? null,
        referralAccount: order.referralAccount ?? null,
        lastValidBlockHeight: order.lastValidBlockHeight ?? null,
        expireAt: order.expireAt ?? null,
        errorCode: typeof order.errorCode === "number" ? order.errorCode : null,
        errorMessage: order.errorMessage || order.error ? "Impossible de construire la transaction via la route externe." : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer une transaction externe. Réessaie avec une nouvelle cotation." },
      { status: 502 }
    );
  }
}
