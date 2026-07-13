const API = "https://lite-api.jup.ag/swap/v1";

export async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: number
) {
  const url =
    `${API}/quote?inputMint=${inputMint}` +
    `&outputMint=${outputMint}` +
    `&amount=${amount}` +
    `&slippageBps=50`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Impossible de récupérer le quote.");
  }

  return await res.json();
}

export async function getSwapTransaction(
  quoteResponse: any,
  userPublicKey: string
) {
  const res = await fetch(`${API}/swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  });

  if (!res.ok) {
    throw new Error("Impossible de construire la transaction.");
  }

  return await res.json();
}