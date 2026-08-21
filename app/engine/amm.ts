export interface Pool {
  reserveA: number;
  reserveB: number;
}

export function getAmountOut(
  amountIn: number,
  reserveIn: number,
  reserveOut: number
) {
  const amountInWithFee = amountIn * 0.997;

  const numerator = amountInWithFee * reserveOut;

  const denominator = reserveIn + amountInWithFee;

  return numerator / denominator;
}

export function simulateSwap(
  amount: number,
  pool: Pool
) {
  const output = getAmountOut(
    amount,
    pool.reserveA,
    pool.reserveB
  );

  return {
    input: amount,
    output,
    newReserveA: pool.reserveA + amount,
    newReserveB: pool.reserveB - output,
  };
}