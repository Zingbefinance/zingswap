import { NextResponse } from "next/server";

export const maxDuration = 30;

const TRIGGER_API_BASE = "https://api.jup.ag/trigger/v2";
const SEGMENT_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;

function isAllowedPath(method: string, path: string[]) {
  const key = path.join("/");
  if (method === "POST") {
    return [
      "auth/challenge",
      "auth/verify",
      "auth/refresh",
      "deposit/craft",
      "orders/price",
      "orders/dca",
    ].includes(key) || /^orders\/(?:price|dca)\/(?:cancel|confirm-cancel)\/[a-zA-Z0-9_-]{1,120}$/.test(key);
  }
  return method === "GET" && (key === "vault" || key === "vault/register" || key === "orders/history" || key === "orders/history/dca");
}

async function proxyTriggerRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const method = request.method.toUpperCase();
  if (!path.length || path.some((part) => !SEGMENT_PATTERN.test(part)) || !isAllowedPath(method, path)) {
    return NextResponse.json({ error: "Route Trigger non autorisée." }, { status: 404 });
  }

  const apiKey = process.env.JUPITER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "La clé API Jupiter manque dans la configuration serveur." }, { status: 503 });
  }

  const url = new URL(`${TRIGGER_API_BASE}/${path.join("/")}`);
  if (method === "GET") url.search = new URL(request.url).search;
  const headers = new Headers({
    "x-api-key": apiKey,
    accept: "application/json",
  });
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) headers.set("authorization", authorization);

  let body: string | undefined;
  if (method !== "GET") {
    body = await request.text();
    headers.set("content-type", "application/json");
  }

  try {
    const upstream = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Le service Jupiter Trigger est temporairement indisponible." }, { status: 502 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyTriggerRequest(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyTriggerRequest(request, context);
}
