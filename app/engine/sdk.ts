import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { connection } from "./client";

let raydium: Raydium | null = null;

export async function getRaydium() {
  if (raydium) return raydium;

  raydium = await Raydium.load({
    connection,
    owner: undefined,
  });

  return raydium;
}