import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";

type HeliusAsset = {
  id?: string;
  interface?: string;
  content?: {
    metadata?: { name?: string };
    links?: { image?: string };
    files?: Array<{ uri?: string; mime?: string }>;
  };
  grouping?: Array<{ group_key?: string; group_value?: string }>;
};

function normalizeImageUrl(value: string | undefined): string | null {
  if (!value) return null;
  const uri = value.startsWith("ipfs://")
    ? `https://ipfs.io/ipfs/${value.slice("ipfs://".length).replace(/^ipfs\//, "")}`
    : value.startsWith("ar://")
      ? `https://arweave.net/${value.slice("ar://".length)}`
      : value;
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const owner = new URL(request.url).searchParams.get("owner");
  if (!owner) {
    return NextResponse.json({ error: "Adresse de portefeuille manquante." }, { status: 400 });
  }
  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "Adresse Solana invalide." }, { status: 400 });
  }

  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) {
    return NextResponse.json(
      { error: "La galerie NFT n’est pas configurée. Configurez HELIUS_RPC_URL côté serveur." },
      { status: 503 },
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(rpcUrl);
  } catch {
    return NextResponse.json(
      { error: "La configuration RPC de la galerie NFT est invalide." },
      { status: 503 },
    );
  }
  if (
    endpoint.protocol !== "https:" ||
    !(endpoint.hostname === "helius-rpc.com" || endpoint.hostname.endsWith(".helius-rpc.com"))
  ) {
    return NextResponse.json(
      { error: "La configuration RPC de la galerie NFT est invalide." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "zingswap-nft-gallery",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: owner,
          page: 1,
          limit: 1000,
          displayOptions: { showFungible: false },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await response.text();
    let payload: { result?: { items?: HeliusAsset[] }; error?: { message?: unknown } };
    try {
      payload = JSON.parse(responseText) as typeof payload;
    } catch {
      return NextResponse.json(
        { error: "Réponse invalide du service d’indexation NFT." },
        { status: response.ok ? 502 : response.status },
      );
    }

    if (!response.ok) {
      return NextResponse.json({ error: "Le service d’indexation NFT est indisponible." }, { status: response.status });
    }
    if (payload.error) {
      return NextResponse.json({ error: "Le service d’indexation NFT a rejeté la demande." }, { status: 502 });
    }
    if (!Array.isArray(payload.result?.items)) {
      return NextResponse.json({ error: "Réponse invalide du service d’indexation NFT." }, { status: 502 });
    }

    const nfts = payload.result.items
      .filter((asset) => asset.id && ["V1_NFT", "V2_NFT", "ProgrammableNFT", "MplCoreAsset"].includes(asset.interface ?? ""))
      .map((asset) => {
        const collection = asset.grouping?.find((group) => group.group_key === "collection")?.group_value;
        const image = asset.content?.links?.image ?? asset.content?.files?.find((file) => file.mime?.startsWith("image/"))?.uri;
        return {
          id: asset.id!,
          name: asset.content?.metadata?.name?.trim() || null,
          collection: collection?.trim() || null,
          image: normalizeImageUrl(image),
        };
      });

    return NextResponse.json({ nfts });
  } catch (error) {
    return NextResponse.json(
      { error: "Connexion au service d’indexation NFT impossible." },
      { status: 502 },
    );
  }
}
