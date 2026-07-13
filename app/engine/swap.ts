import { PoolInfo, SwapResult } from "./types";

export function simulateSwap(
  inputSOL: number,
  pool: PoolInfo
): SwapResult {

  const reserveSOL = pool.reserveSOL;
  const reserveZING = pool.reserveZING;

  const fee = inputSOL * 0.0025;
  const inputAfterFee = inputSOL - fee;

  const output =
    (inputAfterFee * reserveZING) /
    (reserveSOL + inputAfterFee);

  const price = reserveZING / reserveSOL;

  return {
    input: inputSOL,
    output,
    price,
    fee,
  };
}