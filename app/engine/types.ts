export interface PoolInfo {
  reserveSOL: number;
  reserveZING: number;
}

export interface SwapResult {
  input: number;
  output: number;
  price: number;
  fee: number;
}