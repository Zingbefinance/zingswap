import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { RPC_ENDPOINT } from "../../../config/network";
import {
  ZINGSWAP_PROGRAM_ID,
  ZTC_MINT,
  WSOL_MINT,
  getPoolPda,
} from "../../../../src/lib/anchor/zingswap";

export const runtime = "nodejs";

type DexScreenerResponse = {
  pairs?: Array<{
    pairAddress?: string;
    liquidity?: { usd?: number };
    volume?: { h24?: number };
  } | null>;
};

export async function GET() {
  const poolAddress = getPoolPda(ZINGSWAP_PROGRAM_ID, ZTC_MINT, WSOL_MINT);
  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  const [marketResult, poolResult] = await Promise.allSettled([
    fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${poolAddress.toBase58()}`, {
      next: { revalidate: 60 },
    }).then(async (response) => {
      if (!response.ok) throw new Error("DexScreener indisponible");
      return response.json() as Promise<DexScreenerResponse>;
    }),
    connection.getAccountInfo(poolAddress),
  ]);

  let tvlUsd: number | null = null;
  let volume24hUsd: number | null = null;
  if (marketResult.status === "fulfilled") {
    const pair = marketResult.value.pairs?.find(
      (candidate) => candidate?.pairAddress?.toLowerCase() === poolAddress.toBase58().toLowerCase(),
    );
    const liquidity = pair?.liquidity?.usd;
    const volume = pair?.volume?.h24;
    if (typeof liquidity === "number" && Number.isFinite(liquidity)) tvlUsd = liquidity;
    if (typeof volume === "number" && Number.isFinite(volume)) volume24hUsd = volume;
  }

  let feePercent: number | null = null;
  if (poolResult.status === "fulfilled" && poolResult.value) {
    const account = poolResult.value;
    const bytes = account.data;
    if (
      account.owner.equals(ZINGSWAP_PROGRAM_ID) &&
      bytes.length >= 207 &&
      new PublicKey(bytes.subarray(40, 72)).equals(ZTC_MINT) &&
      new PublicKey(bytes.subarray(72, 104)).equals(WSOL_MINT)
    ) {
      const feeBps = bytes.readUInt16LE(168);
      if (feeBps <= 10_000) feePercent = feeBps / 100;
    }
  }

  return NextResponse.json({
    tvlUsd,
    volume24hUsd,
    swapPercent: null,
    feePercent,
    updatedAt: new Date().toISOString(),
  });
}
