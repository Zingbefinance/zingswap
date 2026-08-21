import { getRaydium } from "./sdk";
import { PoolInfo } from "./types";

export async function getPool(): Promise<PoolInfo> {
  const raydium = await getRaydium();

  const pools = await raydium.api.fetchPoolById({
    ids: "2NQAkcVvK4pBXRHZN9V4Lg1cuHzbPYL1REowHpVJzUHn",
  });

  const pool: any = pools[0];

  return {
    reserveSOL: Number(pool.mintAmountA ?? pool.baseReserve ?? 0),
    reserveZING: Number(pool.mintAmountB ?? pool.quoteReserve ?? 0),
  };
}