"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Omniston,
  isHtlcOrderQuote,
  isOrderQuote,
  isSwapQuote,
  type AssetId,
  type ChainAddress,
  type Quote,
} from "@ston-fi/omniston-sdk";
import { encodeAbiParameters, hexToBytes, type AbiParameter } from "viem";
import { TonConnectButton, toUserFriendlyAddress, useIsConnectionRestored, useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { useEvmWallet } from "@/components/providers/EvmWalletProvider";
import { TON_MAINNET_CHAIN_ID, type SwapNetworkId } from "@/lib/lifi/chains";

type Token = { symbol: string; name: string; address: string; decimals: number; chainId: number };
type ActiveQuote = { quote: Quote; receivedAt: number };
type PreparedMessage = { address: string; amount: string; payload?: string; stateInit?: string };
type PreparedEvmOrder = { typedData: string; quoteId: string; sourceAddress: string; orderExtension: Uint8Array; serializedOrderDetails?: Uint8Array };

const TON = TON_MAINNET_CHAIN_ID;
const TON_TREASURY = "UQCJOTEknNDTfQHhz6oBbQWtbp3bTnsYhmbhJ7_LgKEuHOT-";
const INTEGRATOR_FEE_PIPS = 5_000;
const TOKENS: Token[] = [
  { symbol: "TON", name: "Toncoin", address: "native", decimals: 9, chainId: TON },
  { symbol: "USDT", name: "Tether USD", address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", decimals: 6, chainId: TON },
  { symbol: "STON", name: "STON", address: "EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO", decimals: 9, chainId: TON },
  { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, chainId: 1 },
  { symbol: "USDC", name: "USD Coin", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6, chainId: 1 },
  { symbol: "USDT", name: "Tether USD", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, chainId: 56 },
  { symbol: "USDC", name: "USD Coin", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, chainId: 56 },
];

function chainAddress(chainId: number, address: string): ChainAddress {
  if (chainId === TON) return { chain: { $case: "ton", value: address } };
  if (chainId === 1) return { chain: { $case: "ethereum", value: address } };
  if (chainId === 56) return { chain: { $case: "bnb", value: address } };
  throw new Error("Omniston ne documente pas ce réseau dans cette intégration.");
}

function assetId(token: Token): AssetId {
  if (token.chainId === TON) {
    return { chain: { $case: "ton", value: { kind: token.address === "native" ? { $case: "native", value: {} } : { $case: "jetton", value: token.address } } } };
  }
  const chain = token.chainId === 1 ? "ethereum" : "bnb";
  return { chain: { $case: chain, value: { kind: { $case: "erc20", value: token.address } } } } as AssetId;
}

function units(raw: string | undefined, decimals: number) {
  if (!raw || !/^\d+$/.test(raw)) return "—";
  const value = BigInt(raw);
  const scale = BigInt(10) ** BigInt(decimals);
  const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
  return `${value / scale}${fraction ? `.${fraction}` : ""}`;
}

function parseUnits(amount: string, decimals: number) {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount)) return "";
  const [whole = "0", fraction = ""] = amount.split(".");
  if (fraction.length > decimals) return "";
  return (BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0")).toString();
}

function feeQuoteCheck(quote: Quote, destinationIsTon: boolean) {
  if (!destinationIsTon) return { ok: true, effective: null as number | null, reason: "Aucune commission Omniston demandée pour une destination EVM." };
  const destination = quote.integratorAddress;
  if (destination?.chain.$case !== "ton" || destination.chain.value !== TON_TREASURY) {
    return { ok: false, effective: null, reason: "La quote ne confirme pas le destinataire de trésorerie TON demandé." };
  }
  try {
    const fee = BigInt(quote.integratorFeeUnits);
    const output = BigInt(quote.outputUnits);
    const protocolFee = BigInt(quote.protocolFeeUnits);
    const gross = quote.settlementData.$case === "order"
      ? BigInt(quote.settlementData.value.resolverSendsUnits)
      : output + fee + protocolFee;
    if (fee <= BigInt(0) || gross <= BigInt(0)) return { ok: false, effective: null, reason: "La quote ne chiffre pas une commission intégrateur positive vérifiable." };
    if (quote.settlementData.$case === "order" && gross !== output + fee + protocolFee) {
      return { ok: false, effective: null, reason: "Les montants nets et frais de la quote ne correspondent pas au montant brut de règlement." };
    }
    if (quote.settlementData.$case === "order" && quote.settlementData.value.integratorFeePips !== INTEGRATOR_FEE_PIPS) {
      return { ok: false, effective: null, reason: "Le taux intégrateur renvoyé dans les données d’ordre ne correspond pas aux 5 000 pips demandés." };
    }
    const expectedFee = gross * BigInt(INTEGRATOR_FEE_PIPS) / BigInt(1_000_000);
    const difference = fee > expectedFee ? fee - expectedFee : expectedFee - fee;
    if (difference > BigInt(1)) {
      const effectivePips = Number(fee * BigInt(1_000_000) / gross);
      return { ok: false, effective: effectivePips / 10_000, reason: `Le montant coté correspond à environ ${(effectivePips / 10_000).toFixed(4)} %, pas à 0,50 %.` };
    }
    const effectivePips = Number(fee * BigInt(1_000_000) / gross);
    return { ok: true, effective: effectivePips / 10_000, reason: "Le destinataire, les montants de frais et le taux effectif coté confirment 0,50 % (à une unité d’arrondi près)." };
  } catch {
    return { ok: false, effective: null, reason: "Les montants typés de la quote ne permettent pas de vérifier le taux de commission." };
  }
}

function hexToBase64(hex: string) {
  if (!/^(?:[\da-f]{2})+$/i.test(hex)) throw new Error("Omniston a renvoyé un BOC invalide.");
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function typedDataAbiParam(typeName: string, name: string, types: Record<string, { name: string; type: string }[]>): AbiParameter {
  const arrayMatch = typeName.match(/^(.*)\[(\d*)\]$/);
  if (arrayMatch) {
    const element = typedDataAbiParam(arrayMatch[1], "", types);
    return { ...element, name, type: `${element.type}[${arrayMatch[2]}]` } as unknown as AbiParameter;
  }
  if (types[typeName]) return { name, type: "tuple", components: types[typeName].map((field) => typedDataAbiParam(field.type, field.name, types)) };
  return { name, type: typeName === "uint" ? "uint256" : typeName === "int" ? "int256" : typeName } as AbiParameter;
}

function typedDataValue(typeName: string, value: unknown, types: Record<string, { name: string; type: string }[]>): unknown {
  const arrayMatch = typeName.match(/^(.*)\[(\d*)\]$/);
  if (arrayMatch && Array.isArray(value)) return value.map((item) => typedDataValue(arrayMatch[1], item, types));
  if (types[typeName] && value && typeof value === "object") {
    return types[typeName].map((field) => typedDataValue(field.type, (value as Record<string, unknown>)[field.name], types));
  }
  return value;
}

function encodeEip712Order(typedDataJson: string) {
  const typedData = JSON.parse(typedDataJson) as { primaryType: string; types: Record<string, { name: string; type: string }[]>; message: Record<string, unknown> };
  const fields = typedData.types[typedData.primaryType];
  if (!fields?.length) throw new Error("Le payload EIP-712 Omniston n’a pas de type primaire exploitable.");
  const params = fields.map((field) => typedDataAbiParam(field.type, field.name, typedData.types));
  const values = fields.map((field) => typedDataValue(field.type, typedData.message[field.name], typedData.types));
  return hexToBytes(encodeAbiParameters(params, values));
}

function compactEvmSignature(signature: string) {
  if (!/^0x[\da-f]{130}$/i.test(signature)) throw new Error("Cette intégration attend une signature EVM ECDSA de 65 octets.");
  const bytes = hexToBytes(signature as `0x${string}`);
  const recovery = bytes[64] >= 27 ? bytes[64] - 27 : bytes[64];
  if (recovery > 1) throw new Error("Format de signature EVM non pris en charge.");
  bytes[32] = bytes[32] | (recovery << 7);
  return bytes.slice(0, 64);
}

export default function TonSwapCard({ fromChain, toChain }: { fromChain: SwapNetworkId; toChain: SwapNetworkId }) {
  const wallet = useTonWallet();
  const restored = useIsConnectionRestored();
  const tonAddress = useTonAddress();
  const [tonConnectUi] = useTonConnectUI();
  const evmWallet = useEvmWallet();
  const [fromTokenAddress, setFromTokenAddress] = useState(() => TOKENS.find((token) => token.chainId === fromChain)?.address ?? "native");
  const [toTokenAddress, setToTokenAddress] = useState(() => TOKENS.find((token) => token.chainId === toChain)?.address ?? "native");
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState({ from: "", to: "" });
  const [quote, setQuote] = useState<ActiveQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [prepared, setPrepared] = useState<PreparedMessage[] | null>(null);
  const [preparedTonAddress, setPreparedTonAddress] = useState("");
  const [preparedEvmOrder, setPreparedEvmOrder] = useState<PreparedEvmOrder | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(Date.now());
  const omniston = useMemo(() => new Omniston({ apiUrl: "wss://omni-ws.ston.fi" }), []);
  const quoteSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const quoteTimeoutRef = useRef<number | null>(null);

  const fromOptions = useMemo(() => TOKENS.filter((token) => token.chainId === fromChain), [fromChain]);
  const toOptions = useMemo(() => TOKENS.filter((token) => token.chainId === toChain), [toChain]);
  const fromToken = fromOptions.find((token) => token.address === fromTokenAddress) ?? fromOptions[0];
  const toToken = toOptions.find((token) => token.address === toTokenAddress) ?? toOptions[0];
  const sourceAddress = fromChain === TON ? tonAddress : evmWallet.account;
  const destAddress = toChain === TON ? tonAddress : evmWallet.account;
  const amountUnits = fromToken ? parseUnits(amount, fromToken.decimals) : "";
  const isTonSource = fromChain === TON;
  const quoteIsFresh = quote !== null && now - quote.receivedAt < 30_000;
  const quoteFeeCheck = quote ? feeQuoteCheck(quote.quote, toChain === TON) : null;
  const documentedCrossPair = fromChain === toChain || Boolean(
    fromToken && toToken &&
    ((fromChain === TON && fromToken.symbol === "USDT" && ["USDT", "USDC"].includes(toToken.symbol)) ||
      (toChain === TON && toToken.symbol === "USDT" && ["USDT", "USDC"].includes(fromToken.symbol))),
  );
  const canRequestQuote = Boolean(fromToken && toToken && fromToken.address !== toToken.address && documentedCrossPair && amountUnits && BigInt(amountUnits) > BigInt(0) && sourceAddress && destAddress && (fromChain === TON || evmWallet.chainId === fromChain));

  useEffect(() => {
    quoteSubscriptionRef.current?.unsubscribe();
    setFromTokenAddress(fromOptions[0]?.address ?? "");
    setToTokenAddress(toOptions[0]?.address ?? "");
    setQuote(null);
    setPrepared(null);
    setPreparedTonAddress("");
    setPreparedEvmOrder(null);
    setError("");
  }, [fromChain, toChain]);

  useEffect(() => {
    if (!quote) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [quote]);

  useEffect(() => () => {
    quoteSubscriptionRef.current?.unsubscribe();
    if (quoteTimeoutRef.current !== null) window.clearTimeout(quoteTimeoutRef.current);
    omniston.transport.close();
  }, [omniston]);

  const requestQuote = useCallback(() => {
    if (!canRequestQuote || !fromToken || !toToken || !sourceAddress || !destAddress) return;
    quoteSubscriptionRef.current?.unsubscribe();
    if (quoteTimeoutRef.current !== null) window.clearTimeout(quoteTimeoutRef.current);
    setQuote(null);
    setPrepared(null);
    setPreparedTonAddress("");
    setPreparedEvmOrder(null);
    setError("");
    setStatus("");
    setLoading(true);
    let received = false;
    quoteSubscriptionRef.current = omniston.requestForQuote({
      inputAsset: assetId(fromToken),
      outputAsset: assetId(toToken),
      amount: { $case: "inputUnits", value: amountUnits },
      ...(toChain === TON ? {
        integratorAddress: chainAddress(TON, TON_TREASURY),
        integratorFeePips: INTEGRATOR_FEE_PIPS,
      } : {}),
      settlementParams: [
        { params: { $case: "swap", value: { maxPriceSlippagePips: 10_000, maxRoutes: 4 } } },
        { params: { $case: "order", value: {} } },
      ],
    }).subscribe({
      next(event) {
        if (event.$case === "quoteUpdated") {
          received = true;
          setQuote({ quote: event.value, receivedAt: Date.now() });
          setPrepared(null);
          setPreparedTonAddress("");
          setPreparedEvmOrder(null);
          setLoading(false);
        } else if (event.$case === "noQuote") {
          setQuote(null);
          setPrepared(null);
          setPreparedTonAddress("");
          setPreparedEvmOrder(null);
          setLoading(false);
          setError("Omniston n’a pas trouvé de cotation exécutable pour cette paire.");
        }
      },
      error(cause) {
        setLoading(false);
        setError(cause instanceof Error ? cause.message : "La connexion de cotation Omniston a échoué.");
      },
      complete() {
        setLoading(false);
        if (!received) setError("La cotation Omniston s’est terminée sans offre.");
      },
    });
    quoteTimeoutRef.current = window.setTimeout(() => {
      setLoading(false);
      if (!received) setError("Délai dépassé en attendant une cotation Omniston.");
      quoteSubscriptionRef.current?.unsubscribe();
    }, 20_000);
  }, [amountUnits, canRequestQuote, destAddress, fromToken, sourceAddress, toToken]);

  const prepareTransaction = async () => {
    if (!quote || !quoteIsFresh) {
      setError("Une cotation récente est requise avant la préparation.");
      return;
    }
    const selected = quote.quote;
    const feeCheck = feeQuoteCheck(selected, toChain === TON);
    if (!feeCheck.ok) {
      setError(`Préparation bloquée : ${feeCheck.reason}`);
      return;
    }
    if (selected.settlementData.$case === "order" && selected.settlementData.value.tradeStartDeadline <= Math.floor(Date.now() / 1000)) {
      setError("Cette cotation cross-chain a dépassé son délai de démarrage. Demandez une nouvelle cotation.");
      return;
    }
    setPreparing(true);
    setError("");
    setPrepared(null);
    setPreparedEvmOrder(null);
    try {
      if (!isTonSource) {
        if (!evmWallet.provider || !evmWallet.account || !tonAddress || !isOrderQuote(selected)) {
          throw new Error("Les ordres cross-chain de source EVM nécessitent un wallet EVM connecté, un wallet TON destinataire et une quote d’ordre.");
        }
        const orderPayload = await omniston.evmBuildOrderPayload({
          quoteId: selected.quoteId,
          ownerSrcAddress: chainAddress(fromChain, evmWallet.account),
          traderDstAddress: chainAddress(TON, tonAddress),
          htlcSecrets: isHtlcOrderQuote(selected) ? { secretMode: { $case: "generated", value: { maxExecutions: 4 } } } : undefined,
        });
        setPreparedEvmOrder({ typedData: orderPayload.typedData, quoteId: selected.quoteId, sourceAddress: evmWallet.account, orderExtension: orderPayload.orderExtension, serializedOrderDetails: orderPayload.serializedOrderDetails });
        setStatus("Payload EIP-712 préparé. Aucune signature n’a encore été demandée au wallet EVM.");
        return;
      }
      if (!tonAddress) throw new Error("Connecte un wallet TON avant de préparer la transaction.");
      const trader: ChainAddress = chainAddress(TON, tonAddress);
      const transaction = isSwapQuote(selected)
        ? await omniston.tonBuildSwap({ quoteId: selected.quoteId, transferSrcAddress: trader, traderDstAddress: chainAddress(toChain, destAddress), refundSrcAddress: trader, gasExcessAddress: trader })
        : isOrderQuote(selected)
          ? await omniston.tonBuildEscrowTransfer({ quoteId: selected.quoteId, ownerSrcAddress: trader, transferSrcAddress: trader, traderDstAddress: chainAddress(toChain, destAddress), refundSrcAddress: trader, gasExcessAddress: trader, htlcSecrets: isHtlcOrderQuote(selected) ? { secretMode: { $case: "generated", value: { maxExecutions: 4 } } } : undefined })
          : (() => { throw new Error("Type de règlement Omniston non pris en charge."); })();
      if (!transaction.messages.length || transaction.messages.length > 4) throw new Error("Le nombre de messages de cette transaction ne peut pas être envoyé par la configuration wallet actuelle.");
      const messages = transaction.messages.map((message) => ({
        address: message.targetAddress.includes(":") ? toUserFriendlyAddress(message.targetAddress) : message.targetAddress,
        amount: message.sendAmount,
        payload: message.payload ? hexToBase64(message.payload) : undefined,
        stateInit: message.jettonWalletStateInit ? hexToBase64(message.jettonWalletStateInit) : undefined,
      }));
      setPrepared(messages);
      setPreparedTonAddress(tonAddress);
      setPreparedEvmOrder(null);
      setStatus("Transaction préparée à partir de la cotation Omniston. Aucun message n’a encore été envoyé au wallet.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de préparer la transaction.");
    } finally {
      setPreparing(false);
    }
  };

  const askWalletToSend = async () => {
    if (preparedEvmOrder) {
      if (!quoteIsFresh || !quote || !evmWallet.provider || !isOrderQuote(quote.quote) || evmWallet.account !== preparedEvmOrder.sourceAddress || evmWallet.chainId !== fromChain) {
        setError("Le payload EIP-712 ou sa quote a expiré. Demande une nouvelle quote.");
        setPreparedEvmOrder(null);
        return;
      }
      setSigning(true);
      setError("");
      try {
        const code = await evmWallet.provider.request({ method: "eth_getCode", params: [preparedEvmOrder.sourceAddress, "latest"] });
        if (typeof code !== "string" || code !== "0x") throw new Error("Cette première version n’accepte que les comptes EOA EVM pour signer l’ordre Omniston.");
        const signature = await evmWallet.provider.request({ method: "eth_signTypedData_v4", params: [preparedEvmOrder.sourceAddress, preparedEvmOrder.typedData] });
        if (typeof signature !== "string") throw new Error("Le wallet EVM n’a pas renvoyé de signature.");
        const signedOrder = {
          order: {
            $case: "evmV1" as const,
            value: {
              encodedOrder: encodeEip712Order(preparedEvmOrder.typedData),
              signature: compactEvmSignature(signature),
              orderExtension: preparedEvmOrder.orderExtension,
            },
          },
        };
        const ownerSrcAddress = chainAddress(fromChain, preparedEvmOrder.sourceAddress);
        await omniston.orderRegisterSignedOrder({ quoteId: preparedEvmOrder.quoteId, ownerSrcAddress, signedOrder, serializedOrderDetails: preparedEvmOrder.serializedOrderDetails });
        setStatus("Ordre signé et enregistré auprès d’Omniston. Le règlement cross-chain n’est pas encore confirmé.");
        const tracker = omniston.orderTrack({ quoteId: preparedEvmOrder.quoteId, traderAddress: ownerSrcAddress }).subscribe({
          next(event) { if (event.$case === "order") setStatus(`État de l’ordre Omniston : ${event.value.status}.`); },
          error(cause) { setError(cause instanceof Error ? cause.message : "Le suivi de l’ordre Omniston a échoué."); },
        });
        quoteSubscriptionRef.current = tracker;
        setPreparedEvmOrder(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "La demande de signature EVM a échoué ou a été refusée.");
      } finally {
        setSigning(false);
      }
      return;
    }
    if (!prepared || !quoteIsFresh || !tonAddress || tonAddress !== preparedTonAddress) {
      setError("La cotation ou la transaction préparée a expiré. Demandez une nouvelle cotation.");
      setPrepared(null);
      return;
    }
    setSigning(true);
    setError("");
    setStatus("Demande de signature et d’envoi ouverte dans TON Connect.");
    try {
      await tonConnectUi.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        network: "-239",
        messages: prepared,
      });
      setStatus("La demande TON Connect a été acceptée. La finalité et le règlement restent à vérifier sur la blockchain.");
      const acceptedQuote = quote?.quote;
      if (acceptedQuote && isOrderQuote(acceptedQuote)) {
        quoteSubscriptionRef.current?.unsubscribe();
        quoteSubscriptionRef.current = omniston.orderTrack({ quoteId: acceptedQuote.quoteId, traderAddress: chainAddress(TON, preparedTonAddress) }).subscribe({
          next(event) { if (event.$case === "order") setStatus(`État de l’ordre Omniston : ${event.value.status}.`); },
          error(cause) { setError(cause instanceof Error ? cause.message : "Le suivi de l’ordre Omniston a échoué."); },
        });
      }
      setPrepared(null);
      setPreparedTonAddress("");
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "La demande TON Connect a échoué ou a été refusée.");
    } finally {
      setSigning(false);
    }
  };

  if (fromOptions.length === 0 || toOptions.length === 0) {
    return <div className="rounded-2xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">Omniston n’a pas de matrice de tokens configurée pour cette paire de réseaux.</div>;
  }

  const renderTokenPicker = (side: "from" | "to", options: Token[], selectedAddress: string, select: (address: string) => void) => (
    <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <input value={search[side]} onChange={(event) => setSearch((current) => ({ ...current, [side]: event.target.value }))} placeholder="Rechercher un token documenté" className="w-full rounded-lg bg-zinc-950 px-3 py-2 text-sm text-white outline-none" />
      <select value={selectedAddress} onChange={(event) => select(event.target.value)} className="w-full bg-transparent text-lg font-semibold text-white outline-none">
        {options.filter((token) => `${token.symbol} ${token.name}`.toLowerCase().includes(search[side].toLowerCase())).map((token) => <option key={`${token.chainId}:${token.address}`} value={token.address}>{token.symbol} · {token.name}</option>)}
      </select>
      <input inputMode="decimal" value={side === "from" ? amount : (quote && toToken ? units(quote.quote.outputUnits, toToken.decimals) : "")} onChange={(event) => { if (side === "from") { quoteSubscriptionRef.current?.unsubscribe(); setAmount(event.target.value); setQuote(null); setPrepared(null); setPreparedTonAddress(""); setPreparedEvmOrder(null); } }} readOnly={side === "to"} placeholder="0.0" className="w-full bg-transparent text-2xl text-white outline-none" />
      <p className="text-xs text-zinc-500">{side === "from" ? `Sur ${fromToken?.chainId === TON ? "TON" : fromToken?.chainId === 1 ? "Ethereum" : "BNB Chain"}` : `Sur ${toToken?.chainId === TON ? "TON" : toToken?.chainId === 1 ? "Ethereum" : "BNB Chain"}`}</p>
    </div>
  );

  const selectedQuote = quote?.quote;
  const outputUnits = selectedQuote && toToken ? units(selectedQuote.outputUnits, toToken.decimals) : "—";
  const protocolFee = selectedQuote && toToken ? `${units(selectedQuote.protocolFeeUnits, toToken.decimals)} ${toToken.symbol}` : "—";
  const integratorFee = selectedQuote && toToken ? `${units(selectedQuote.integratorFeeUnits, toToken.decimals)} ${toToken.symbol}` : "—";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-white shadow-xl sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Swap TON · Omniston</h2><p className="mt-1 text-xs text-zinc-500">TON↔TON et actifs cross-chain présents dans la matrice Omniston.</p></div><TonConnectButton /></div>
      {!restored && <p className="mb-3 text-sm text-zinc-400">Restauration du wallet TON…</p>}
      {wallet && tonAddress && <p className="mb-3 text-xs text-zinc-400">TON Connect · <span className="font-mono">{tonAddress.slice(0, 7)}…{tonAddress.slice(-5)}</span></p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {renderTokenPicker("from", fromOptions, fromTokenAddress, (address) => { quoteSubscriptionRef.current?.unsubscribe(); setFromTokenAddress(address); setQuote(null); setPrepared(null); setPreparedTonAddress(""); setPreparedEvmOrder(null); })}
        {renderTokenPicker("to", toOptions, toTokenAddress, (address) => { quoteSubscriptionRef.current?.unsubscribe(); setToTokenAddress(address); setQuote(null); setPrepared(null); setPreparedTonAddress(""); setPreparedEvmOrder(null); })}
      </div>
      {!isTonSource && <p className="mt-3 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">La signature d’ordre EVM est activée pour les comptes EOA. Les wallets contrat ne sont pas pris en charge dans cette première version.</p>}
      {!documentedCrossPair && <p className="mt-3 text-sm text-amber-200">Pour une route cross-chain, Omniston ne documente ici que TON USDT vers/depuis USDT ou USDC sur Ethereum ou BNB Chain.</p>}
      {isTonSource && !tonAddress && restored && <p className="mt-3 text-sm text-amber-200">Connecte un wallet TON pour obtenir une cotation et préparer la transaction.</p>}
      {fromChain !== TON && (!evmWallet.account || evmWallet.chainId !== fromChain) && <p className="mt-3 text-sm text-amber-200">Le wallet EVM doit être connecté sur le réseau de départ.</p>}
      <button type="button" onClick={requestQuote} disabled={!canRequestQuote || loading} className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Recherche de cotations…" : "Demander une cotation Omniston"}</button>
      {loading && <p role="status" className="mt-2 text-sm text-zinc-400">RFQ envoyé à Omniston ; en attente des quotes des resolvers…</p>}
      {selectedQuote && <div className="mt-4 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm">
        <div className="flex justify-between gap-2"><span className="text-zinc-400">Montant d’entrée (inclut les frais)</span><span>{units(selectedQuote.inputUnits, fromToken!.decimals)} {fromToken!.symbol}</span></div>
        <div className="flex justify-between gap-2"><span className="text-zinc-400">Montant net estimé</span><span>{outputUnits} {toToken!.symbol}</span></div>
        <div className="flex justify-between gap-2"><span className="text-zinc-400">Frais protocole (sortie)</span><span>{protocolFee}</span></div>
        <div className="flex justify-between gap-2"><span className="text-zinc-400">Frais intégrateur (sortie)</span><span>{integratorFee}</span></div>
        {toChain === TON && <div className="space-y-1 border-t border-zinc-800 pt-2">
          <div className="flex justify-between gap-2"><span className="text-zinc-400">Taux demandé</span><span>0,50 % (5 000 pips)</span></div>
          <div className="flex justify-between gap-2"><span className="text-zinc-400">Taux effectif calculé sur la quote</span><span>{quoteFeeCheck?.effective === null || quoteFeeCheck?.effective === undefined ? "non vérifiable" : `${quoteFeeCheck.effective.toFixed(4)} %`}</span></div>
          <p role={quoteFeeCheck?.ok ? "status" : "alert"} className={quoteFeeCheck?.ok ? "text-xs text-cyan-200" : "text-xs text-amber-300"}>{quoteFeeCheck?.reason}</p>
        </div>}
        {toChain !== TON && <p className="text-xs text-zinc-400">Commission intégrateur non demandée : l’adresse configurée est une adresse TON et ne s’applique pas à une destination EVM.</p>}
        <div className="flex justify-between gap-2"><span className="text-zinc-400">Resolver · règlement</span><span>{selectedQuote.resolverName} · {selectedQuote.settlementData.$case === "swap" ? "swap" : "ordre escrow"}</span></div>
        {selectedQuote.gasBudget && <div className="flex justify-between gap-2"><span className="text-zinc-400">Budget gas source communiqué</span><span>{selectedQuote.gasBudget} unités</span></div>}
        {selectedQuote.settlementData.$case === "swap" && selectedQuote.settlementData.value.priceImpactPips !== undefined && <div className="flex justify-between gap-2"><span className="text-zinc-400">Impact estimé</span><span>{(selectedQuote.settlementData.value.priceImpactPips / 10_000).toFixed(4)} %</span></div>}
        <p className="text-xs text-zinc-500">Les montants et frais proviennent de la quote reçue. Leur présence dans la quote ne prouve pas leur versement on-chain.</p>
        {!quoteIsFresh && <p role="alert" className="text-amber-300">Cette cotation a expiré côté interface ; redemande une cotation.</p>}
      </div>}
      {selectedQuote && isTonSource && <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => void prepareTransaction()} disabled={preparing || !quoteIsFresh || !tonAddress || !quoteFeeCheck?.ok} className="rounded-xl border border-cyan-700 px-4 py-3 font-semibold text-cyan-200 disabled:opacity-40">{preparing ? "Préparation…" : "Préparer la transaction"}</button>
        <button type="button" onClick={() => void askWalletToSend()} disabled={!prepared || signing} className="rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-zinc-950 disabled:opacity-40">{signing ? "Demande wallet ouverte…" : "Demander signature et envoi"}</button>
      </div>}
      {selectedQuote && !isTonSource && <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => void prepareTransaction()} disabled={preparing || !quoteIsFresh || !evmWallet.account || !tonAddress || !quoteFeeCheck?.ok} className="rounded-xl border border-cyan-700 px-4 py-3 font-semibold text-cyan-200 disabled:opacity-40">{preparing ? "Préparation…" : "Préparer le payload EIP-712"}</button>
        <button type="button" onClick={() => void askWalletToSend()} disabled={!preparedEvmOrder || signing} className="rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-zinc-950 disabled:opacity-40">{signing ? "Demande de signature…" : "Demander la signature EVM"}</button>
      </div>}
      {prepared && <p className="mt-2 text-xs text-cyan-200">{prepared.length} message(s) préparé(s). Aucun appel au wallet n’a lieu avant le second bouton.</p>}
      {preparedEvmOrder && <p className="mt-2 text-xs text-cyan-200">Payload d’ordre préparé hors du wallet. Le wallet n’est appelé qu’après le second bouton ; l’ordre sera enregistré auprès d’Omniston après la signature.</p>}
      {status && <p role="status" className="mt-3 text-sm text-cyan-200">{status}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      <p className="mt-4 text-xs text-zinc-600">Solana n’est pas annoncé comme réseau Omniston. La disponibilité réelle de chaque paire dépend des resolvers ; demande une quote avant toute préparation.</p>
    </div>
  );
}
