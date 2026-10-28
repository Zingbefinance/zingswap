import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { RPC_ENDPOINT } from "../../../config/network";

const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const PUBLIC_KEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REQUESTED_REFERRAL_FEE_BPS = 50;
export const maxDuration = 30;

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

type ReferralTokenAccountCheck = {
  verified: boolean;
  reason: "verified" | "missing" | "invalid" | "rpc_unavailable";
};

async function verifyReferralTokenAccount(
  referralAccount: string,
  feeMint: string | undefined
): Promise<ReferralTokenAccountCheck> {
  if (!feeMint || !PUBLIC_KEY_PATTERN.test(feeMint)) {
    return { verified: false, reason: "invalid" };
  }

  try {
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const referral = new PublicKey(referralAccount);
    const mint = new PublicKey(feeMint);
    const mintAccount = await connection.getAccountInfo(mint, "confirmed");
    if (!mintAccount) return { verified: false, reason: "invalid" };

    const tokenProgram = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].find((program) =>
      program.equals(mintAccount.owner)
    );
    if (!tokenProgram) return { verified: false, reason: "invalid" };

    // This is the referralTokenAccount address derived by Jupiter's Referral SDK.
    const referralTokenAccount = getAssociatedTokenAddressSync(
      mint,
      referral,
      true,
      tokenProgram
    );
    const tokenAccount = await getAccount(
      connection,
      referralTokenAccount,
      "confirmed",
      tokenProgram
    );
    const verified = tokenAccount.isInitialized && !tokenAccount.isFrozen &&
      tokenAccount.owner.equals(referral) && tokenAccount.mint.equals(mint);

    return { verified, reason: verified ? "verified" : "invalid" };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const errorName = error instanceof Error ? error.name.toLowerCase() : "";
    if (
      errorName === "tokenaccountnotfounderror" ||
      message.includes("could not find account") ||
      message.includes("account does not exist")
    ) {
      return { verified: false, reason: "missing" };
    }
    return { verified: false, reason: "rpc_unavailable" };
  }
}

function feeEvidence(
  order: JupiterOrder,
  configuredReferralAccount: string,
  referralDestinationVerified: boolean
) {
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
  // Jupiter documents no separate platform fee when Referral is active. A
  // positive platformFee.feeBps indicates the default platform-fee fallback.
  const platformFeeFallbackDetected = platformFeeAmountPositive ||
    (platformFeeBpsPresent && platformFeeBps > 0);
  return {
    presentInOrder: Boolean(
      configuredReferralAccount && referralAccountMatched && totalFeeBpsConfirmed && feeMintPresent &&
      !platformFeeFallbackDetected &&
      referralDestinationVerified
    ),
    referralAccountMatched,
    referralDestinationVerified,
    totalFeeBps: typeof totalFeeBps === "number" && Number.isFinite(totalFeeBps) ? totalFeeBps : null,
    totalFeeBpsConfirmed,
    feeMint: feeMintPresent ? feeMint : null,
    feeMintPresent,
    platformFeeAmountPresent,
    platformFeeAmountPositive,
    platformFeeBps: platformFeeBpsPresent ? platformFeeBps : null,
    platformFeeBpsPresent,
    platformFeeFallbackDetected,
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

    const referralTokenAccountCheck = await verifyReferralTokenAccount(referralAccount, order.feeMint);
    const feeEvidenceInOrder = feeEvidence(
      order,
      referralAccount,
      referralTokenAccountCheck.verified
    );

    if (!feeEvidenceInOrder.presentInOrder) {
      const refusalReasons = [
        !feeEvidenceInOrder.referralAccountMatched && "referralAccount absent ou différent du compte configuré",
        !feeEvidenceInOrder.totalFeeBpsConfirmed && `feeBps total absent ou inférieur aux 50 pb demandés (${feeEvidenceInOrder.totalFeeBps ?? "absent"} pb reçu)`,
        !feeEvidenceInOrder.feeMintPresent && "feeMint absent ou invalide",
        feeEvidenceInOrder.platformFeeFallbackDetected && `frais plateforme de repli détectés${feeEvidenceInOrder.platformFeeBpsPresent ? ` (${feeEvidenceInOrder.platformFeeBps} pb)` : ""} malgré les paramètres Referral`,
        referralTokenAccountCheck.reason === "missing" && "le referralTokenAccount associé au feeMint n’est pas initialisé",
        referralTokenAccountCheck.reason === "invalid" && "le referralTokenAccount associé au feeMint est invalide ou ne correspond pas au compte Referral configuré",
        referralTokenAccountCheck.reason === "rpc_unavailable" && "impossible de vérifier le referralTokenAccount sur Solana; ordre bloqué par sécurité",
      ].filter((reason): reason is string => Boolean(reason));

      // Do not forward a transaction when fee evidence is incomplete. Omitting
      // this property avoids presenting a locally fabricated null as Jupiter's value.
      return NextResponse.json(
        {
          error: `Ordre refusé avant signature : ${refusalReasons.join(" ; ")}.`,
          refusalReasons,
          treasuryFee: {
            requestedBps: REQUESTED_REFERRAL_FEE_BPS,
            referralAccountMatched: feeEvidenceInOrder.referralAccountMatched,
            referralDestinationVerified: feeEvidenceInOrder.referralDestinationVerified,
            referralTokenAccountStatus: referralTokenAccountCheck.reason,
            totalFeeBps: feeEvidenceInOrder.totalFeeBps,
            totalFeeBpsConfirmed: feeEvidenceInOrder.totalFeeBpsConfirmed,
            feeMint: feeEvidenceInOrder.feeMint,
            feeMintPresent: feeEvidenceInOrder.feeMintPresent,
            platformFeeAmountPresent: feeEvidenceInOrder.platformFeeAmountPresent,
            platformFeeAmountPositive: feeEvidenceInOrder.platformFeeAmountPositive,
            platformFeeBps: feeEvidenceInOrder.platformFeeBps,
            platformFeeBpsPresent: feeEvidenceInOrder.platformFeeBpsPresent,
            platformFeeFallbackDetected: feeEvidenceInOrder.platformFeeFallbackDetected,
            presentInOrder: false,
          },
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Preserve Jupiter's transaction field as returned; do not synthesize null.
    return NextResponse.json(
      {
        transaction: order.transaction,
        requestId: order.requestId ?? null,
        inAmount: order.inAmount ?? null,
        outAmount: order.outAmount ?? null,
        router: order.router ?? null,
        treasuryFee: {
          requestedBps: REQUESTED_REFERRAL_FEE_BPS,
          referralAccountMatched: feeEvidenceInOrder.referralAccountMatched,
          referralDestinationVerified: feeEvidenceInOrder.referralDestinationVerified,
          referralTokenAccountStatus: referralTokenAccountCheck.reason,
          totalFeeBps: feeEvidenceInOrder.totalFeeBps,
          totalFeeBpsConfirmed: feeEvidenceInOrder.totalFeeBpsConfirmed,
          feeMint: feeEvidenceInOrder.feeMint,
          feeMintPresent: feeEvidenceInOrder.feeMintPresent,
          platformFeeAmountPresent: feeEvidenceInOrder.platformFeeAmountPresent,
          platformFeeAmountPositive: feeEvidenceInOrder.platformFeeAmountPositive,
          platformFeeBps: feeEvidenceInOrder.platformFeeBps,
          platformFeeBpsPresent: feeEvidenceInOrder.platformFeeBpsPresent,
          platformFeeFallbackDetected: feeEvidenceInOrder.platformFeeFallbackDetected,
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
