import { getRaydium } from "./raydiumClient";

export async function testRaydium() {
  try {
    const raydium = await getRaydium();

    console.log("✅ Raydium chargé :", raydium);
    alert("Raydium SDK chargé avec succès !");
  } catch (err) {
    console.error(err);
    alert("Erreur lors du chargement du SDK Raydium");
  }
}