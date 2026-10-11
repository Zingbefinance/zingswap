export const LIFI_SOLANA_CHAIN_ID = 1_151_111_081_099_710;

export const SWAP_NETWORKS = [
  { id: LIFI_SOLANA_CHAIN_ID, name: "Solana", kind: "solana" },
  { id: 1, name: "Ethereum Mainnet", kind: "evm", hexId: "0x1", native: "ETH" },
  { id: 56, name: "BNB Smart Chain", kind: "evm", hexId: "0x38", native: "BNB" },
] as const;

export type SwapNetworkId = (typeof SWAP_NETWORKS)[number]["id"];
export const LIFI_SOL_NATIVE_ADDRESS = "11111111111111111111111111111111";

export function getSwapNetwork(id: number) {
  return SWAP_NETWORKS.find((network) => network.id === id);
}

export function isSolanaNetwork(id: number) {
  return id === LIFI_SOLANA_CHAIN_ID;
}
