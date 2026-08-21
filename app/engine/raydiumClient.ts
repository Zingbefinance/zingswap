import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { connection } from "./connection";

let raydium: Raydium | null = null;

export async function getRaydium() {
  if (raydium) return raydium;

  raydium = await Raydium.load({
    connection,
    cluster: "mainnet",
    disableFeatureCheck: true,
    disableLoadToken: false,
  });

  return raydium;
}