import type { Address, Chain } from "viem";
import {
  arbitrum,
  avalanche,
  base,
  baseSepolia,
  bsc,
  celo,
  gnosis,
  ink,
  linea,
  mainnet,
  mantle,
  megaeth,
  metis,
  optimism,
  plasma,
  polygon,
  scroll,
  soneium,
  sonic,
  zksync,
} from "wagmi/chains";
import { MAINNET_MARKETS, RPC_OVERRIDES, TESTNET_MARKETS, type Market, type RawReserve } from "./markets.generated";
import { PUBLIC_RPC } from "./rpc-defaults";

export type { Market };

export const TESTNETS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "1";

export const MARKETS: readonly Market[] = TESTNETS_ENABLED ? [...MAINNET_MARKETS, ...TESTNET_MARKETS] : MAINNET_MARKETS;

// Every chainId in MARKETS needs an entry here (checked at module load below).
const VIEM_CHAINS: Record<number, Chain> = Object.fromEntries(
  [mainnet, optimism, bsc, gnosis, polygon, sonic, zksync, metis, soneium, mantle, base, arbitrum, celo, avalanche, ink, linea, scroll, plasma, megaeth, baseSepolia].map(
    (c) => [c.id, c as Chain],
  ),
);

export function rpcUrl(chainId: number): string {
  return RPC_OVERRIDES[chainId] || PUBLIC_RPC[chainId];
}

/** One Aave reserve of one market, with everything needed to read and write it. */
export type Reserve = {
  /** "<chainId>-<market>-<symbol>", unique and stable. */
  key: string;
  chainId: number;
  chainName: string;
  marketName: string;
  pool: Address;
  /** Address-book symbol (USDC, USDCn, WETH, wstETH, ...). */
  symbol: string;
  underlying: Address;
  aToken: Address;
  decimals: number;
  bridged: boolean;
  /** True when Aave's GraphQL API indexes this market (lifetime history). */
  aaveApi: boolean;
  /** Market id, shared by reserves of the same pool. */
  marketId: string;
  /** Grouping id across chains: the display label ("USDC", "USDC (bridged)", "WETH", ...). */
  assetId: string;
  /** The native gas token ("ETH", ...) when this is the wrapped-native reserve of a market with a gateway. */
  nativeSymbol: string | undefined;
  /** WrappedTokenGateway, set only on the wrapped-native reserve of a market that has one. */
  gateway: Address | undefined;
};

// Aave's GraphQL API (api.v3.aave.com) lists all of these chains and markets, but on 2026-10-27
// userTransactionHistory only answered for the markets below. Metis, Mantle, Celo and Ink returned
// "Unsupported chain ID for subgraph" / "subgraph not found", so they use the on-chain
// since-last-action figure from the start (no wasted request). Testnets are not served either.
// Plasma and MegaETH were not part of the previous version and are treated as unsupported until
// checked. Re-check with scripts/check-reads.mts if the API changes.
const NO_HISTORY_CHAINS = new Set([1088, 5000, 42220, 57073, 9745, 4326]);
const API_MARKET_IDS = new Set(MAINNET_MARKETS.filter((m) => !NO_HISTORY_CHAINS.has(m.chainId)).map((m) => m.id));

/** Display symbol: Circle's native USDC is "USDC" even where the address book calls it USDCn. */
function displaySymbol(symbol: string): string {
  return symbol === "USDCn" ? "USDC" : symbol;
}

function toReserve(m: Market, raw: RawReserve): Reserve {
  const [symbol, underlying, aToken, decimals, bridged] = raw;
  const isWrapped = !!m.gateway && m.wrappedNative === underlying;
  return {
    key: `${m.id}-${symbol}`,
    chainId: m.chainId,
    chainName: m.chainName,
    marketName: m.marketName,
    pool: m.pool,
    symbol,
    underlying,
    aToken,
    decimals,
    bridged: bridged === 1,
    aaveApi: API_MARKET_IDS.has(m.id),
    marketId: m.id,
    assetId: bridged === 1 ? `${displaySymbol(symbol)} (bridged)` : displaySymbol(symbol),
    nativeSymbol: isWrapped ? (m.nativeSymbol ?? undefined) : undefined,
    gateway: isWrapped ? (m.gateway ?? undefined) : undefined,
  };
}

export const RESERVES: readonly Reserve[] = MARKETS.flatMap((m) => m.reserves.map((r) => toReserve(m, r)));
export const MARKET_BY_ID: ReadonlyMap<string, Market> = new Map(MARKETS.map((m) => [m.id, m]));
export const RESERVE_BY_KEY: ReadonlyMap<string, Reserve> = new Map(RESERVES.map((r) => [r.key, r]));

// Base first: wagmi uses the first chain while no wallet is connected.
export const CHAINS: readonly Chain[] = [...new Set(MARKETS.map((m) => m.chainId))]
  .sort((a, b) => Number(b === 8453) - Number(a === 8453) || a - b)
  .map((id) => {
    const c = VIEM_CHAINS[id];
    if (!c) throw new Error(`No chain definition for ${id}`);
    return c;
  });

export function getReserve(key: string | undefined): Reserve | undefined {
  return key ? RESERVE_BY_KEY.get(key) : undefined;
}

export function chainName(chainId: number): string {
  return MARKETS.find((m) => m.chainId === chainId)?.chainName ?? `chain ${chainId}`;
}

export function explorerUrl(chainId: number): string | undefined {
  return VIEM_CHAINS[chainId]?.blockExplorers?.default.url;
}

/** "USDC.e (bridged)" / "USDC" / "WETH". With `native`, the gas token instead ("ETH"). */
export function symbolLabel(r: Pick<Reserve, "symbol" | "bridged" | "nativeSymbol">, native = false): string {
  if (native && r.nativeSymbol) return r.nativeSymbol;
  const symbol = displaySymbol(r.symbol);
  return r.bridged ? `${symbol} (bridged)` : symbol;
}

/** "Ethereum · Prime" (the market name is dropped when it is the chain's only market). */
export function networkLabel(r: Pick<Reserve, "chainId" | "chainName" | "marketName">): string {
  const multi = MARKETS.filter((m) => m.chainId === r.chainId).length > 1;
  if (r.chainId === 57073) return "Ink (Tydro)";
  return multi ? `${r.chainName} ${r.marketName}` : r.chainName;
}

/** Full label: "Arbitrum · USDC" style used in pickers. */
export function reserveLabel(r: Reserve, native = false): string {
  return `${networkLabel(r)} · ${symbolLabel(r, native)}`;
}

// ---- Assets (reserves grouped across chains) and "choices" (a reserve, native or wrapped) ----

/** What a user acts on: an ERC20 reserve, or its chain's gas token through the gateway. */
export type Choice = { reserve: Reserve; native: boolean };

export const choiceKey = (c: Choice) => (c.native ? `${c.reserve.key}+native` : c.reserve.key);

export function getChoice(key: string | undefined): Choice | undefined {
  if (!key) return undefined;
  const native = key.endsWith("+native");
  const reserve = getReserve(native ? key.slice(0, -"+native".length) : key);
  if (!reserve || (native && !reserve.gateway)) return undefined;
  return { reserve, native };
}

/** Major stablecoins and their bridged variants (by display symbol, not by price). */
const STABLE_SYMBOLS = new Set([
  "USDC", "USDC.e", "USDCn", "USDbC", "m.USDC", "USDT", "USDt", "USDT0", "mUSDT", "DAI", "DAI.e", "mDAI", "WXDAI",
  "USDS", "FRAX", "LUSD", "crvUSD", "PYUSD", "USDe", "FDUSD", "USDG", "RLUSD", "AUSD", "USDm", "USDtb", "mUSD",
  "sUSD", "MAI", "miMATIC",
]);
export const isStable = (r: Pick<Reserve, "symbol">) => STABLE_SYMBOLS.has(r.symbol);

/** Shown after the user's holdings in the asset picker, in this order. */
export const POPULAR_ASSETS = ["USDC", "USDT", "ETH", "WETH", "WBTC", "cbBTC", "DAI", "wstETH", "USDS", "weETH", "AAVE", "LINK"];

export type Asset = {
  /** Reserve assetId, or "native:<SYM>" for a gas token. */
  id: string;
  /** What the user sees: "USDC", "WETH", "ETH". */
  label: string;
  native: boolean;
  stable: boolean;
  /** Reserves (one per market) that hold this asset. For a native asset: the wrapped-native reserves. */
  reserves: Reserve[];
};

function buildAssets(): Asset[] {
  const map = new Map<string, Asset>();
  for (const r of RESERVES) {
    const add = (id: string, label: string, native: boolean) => {
      const a = map.get(id) ?? { id, label, native, stable: isStable(r), reserves: [] };
      a.reserves.push(r);
      map.set(id, a);
    };
    add(r.assetId, r.assetId, false);
    if (r.gateway && r.nativeSymbol) add(`native:${r.nativeSymbol}`, r.nativeSymbol, true);
  }
  return [...map.values()];
}

export const ASSETS: readonly Asset[] = buildAssets();
export const ASSET_BY_ID: ReadonlyMap<string, Asset> = new Map(ASSETS.map((a) => [a.id, a]));

/** The asset id a choice belongs to. */
export const assetIdOfChoice = (c: Choice) => (c.native ? `native:${c.reserve.nativeSymbol}` : c.reserve.assetId);
