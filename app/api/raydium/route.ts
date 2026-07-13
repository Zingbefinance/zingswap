import { NextRequest, NextResponse } from "next/server";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const ZING_MINT = "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu";

export async function POST(req: NextRequest) {
  try {
    const { amount } = await req.json();

    const lamports = Math.floor(Number(amount) * 1_000_000_000);

    const url =
      `https://transaction-v1.raydium.io/compute/swap-base-in` +
  `?inputMint=${SOL_MINT}` +
      `&outputMint=${ZING_MINT}` +
      `&amount=${lamports}` +
      `&slippageBps=50` +
      `&txVersion=V0`;

    const response = await fetch(url);

    const quote = await response.json();

    return NextResponse.json(quote);
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        message: e.message,
      },
      { status: 500 }
    );
  }
}