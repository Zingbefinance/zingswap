import { NextResponse } from "next/server";

const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const PUBLIC_KEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REQUESTED_REFERRAL_FEE_BPS = 50;
const JUPITER_REFERRAL_SHARE_PERCENT = 20;
const EXPECTED_JUPITER_SHARE_BPS = REQUESTED_REFERRAL_FEE_BPS * JUPITER_REFERRAL_SHARE_PERCENT / 100;

interface JupiterOrder {
  transaction?: string | null;
  requestId?: string;
  inAmount?: string;
  outAmount?: string;
  router?: string;
  feeBps?: number;
  feeMint?: string;
  platformFee?: { amount?: string; feeBps?: number };
  referralAccount?: string;
  lastValidBlockHeight?: string;
  expireAt?: string;
  errorCode?: number;
  errorMessage?: string;
  error?: string;
}

function feeEvidence(order: JupiterOrder, configuredReferralAccount: string) {
  const feeAmount = order.platformFee?.amount;
  const platformFeeBps = order.platformFee?.feeBps;
  const feeMint = order.feeMint;
  const totalFeeBps = order.feeBps;
  const referralAccountMatched = order.referralAccount === configuredReferralAccount;
  const totalFeeBpsConfirmed = typeof totalFeeBps === "number" && Number.isFinite(totalFeeBps) && totalFeeBps >= REQUESTED_REFERRAL_FEE_BPS;
  const feeMintPresent = typeof feeMint === "string" && PUBLIC_KEY_PATTERN.test(feeMint);
  const platformFeeAmountPresent = typeof feeAmount === "string" && /^\d+$/.test(feeAmount);
  const platformFeeAmountPositive = platformFeeAmountPresent && BigInt(feeAmount) > BigInt(0);
  const platformFeeBpsPresent = typeof platformFeeBps === "number" && Number.isFinite(platformFeeBps);
  const platformFeeBpsConfirmed = platformFeeBps === EXPECTED_JUPITER_SHARE_BPS;

  return {
    presentInOrder: Boolean(
      configuredReferralAccount && referralAccountMatched && totalFeeBpsConfirmed && feeMintPresent &&
      platformFeeAmountPresent && platformFeeAmountPositive && platformFeeBpsConfirmed
    ),
    referralAccountMatched,
    totalFeeBps: typeof totalFeeBps === "number" && Number.isFinite(totalFeeBps) ? totalFeeBps : null,
    totalFeeBpsConfirmed,
    feeMint: feeMintPresent ? feeMint : null,
    feeMintPresent,
    platformFeeAmountPresent,
    platformFeeAmountPositive,
    platformFeeBps: platformFeeBpsPresent ? platformFeeBps : null,
    platformFeeBpsPresent,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La route externe est indisponible : configuration serveur manquante." },
      { status: 503 }
    );
  }

  const referralAccount = process.env.JUPITER_REFERRAL_ACCOUNT?.trim();
  if (!referralAccount || !PUBLIC_KEY_PATTERN.test(referralAccount)) {
    return NextResponse.json(
      { error: "La configuration du compte de parrainage Jupiter est absente ou invalide." },
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
      BigInt(amount) <= BigInt(0) ||
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
    params.set("referralAccount", referralAccount);
    params.set("referralFee", String(REQUESTED_REFERRAL_FEE_BPS));
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

    const feeEvidenceInOrder = feeEvidence(order, referralAccount);

    // Do not turn an order without a signable transaction into an executable order.
    return NextResponse.json(
      {
        transaction: feeEvidenceInOrder.presentInOrder ? order.transaction ?? null : null,
        requestId: order.requestId ?? null,
        inAmount: order.inAmount ?? null,
        outAmount: order.outAmount ?? null,
        router: order.router ?? null,
        treasuryFee: {
          requestedBps: REQUESTED_REFERRAL_FEE_BPS,
          referralAccountMatched: feeEvidenceInOrder.referralAccountMatched,
          totalFeeBps: feeEvidenceInOrder.totalFeeBps,
          totalFeeBpsConfirmed: feeEvidenceInOrder.totalFeeBpsConfirmed,
          feeMint: feeEvidenceInOrder.feeMint,
          feeMintPresent: feeEvidenceInOrder.feeMintPresent,
          platformFeeAmountPresent: feeEvidenceInOrder.platformFeeAmountPresent,
          platformFeeAmountPositive: feeEvidenceInOrder.platformFeeAmountPositive,
          platformFeeBps: feeEvidenceInOrder.platformFeeBps,
          platformFeeBpsPresent: feeEvidenceInOrder.platformFeeBpsPresent,
          expectedJupiterShareBps: EXPECTED_JUPITER_SHARE_BPS,
          presentInOrder: feeEvidenceInOrder.presentInOrder,
        },
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
