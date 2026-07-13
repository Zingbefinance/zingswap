const API = "https://lite-api.jup.ag/swap/v1";

export async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: number
) {
  const url =
    `${API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Impossible de récupérer le prix.");
  }

  return await res.json();
}