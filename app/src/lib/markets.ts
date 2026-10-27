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
  metis,
  optimism,
  polygon,
  scroll,
  soneium,
  sonic,
  zksync,
} from "wagmi/chains";
import { MAINNET_MARKETS, RPC_OVERRIDES, TESTNET_MARKETS, type Market, type MarketReserve } from "./markets.generated";
import { PUBLIC_RPC } from "./rpc-defaults";

export const TESTNETS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "1";

export const MARKETS: readonly Market[] = TESTNETS_ENABLED ? [...MAINNET_MARKETS, ...TESTNET_MARKETS] : MAINNET_MARKETS;

// Every chainId in MARKETS needs an entry here (checked at module load below).
const VIEM_CHAINS: Record<number, Chain> = Object.fromEntries(
  [mainnet, optimism, bsc, gnosis, polygon, sonic, zksync, metis, soneium, mantle, base, arbitrum, celo, avalanche, ink, linea, scroll, baseSepolia].map(
    (c) => [c.id, c as Chain],
  ),
);

export function rpcUrl(chainId: number): string {
  return RPC_OVERRIDES[chainId] || PUBLIC_RPC[chainId];
}

/** One USDC reserve of one market, with everything needed to read and write it. */
export type Reserve = {
  /** "<chainId>-<market>-<symbol>", unique and stable. */
  key: string;
  chainId: number;
  chainName: string;
  marketName: string;
  pool: Address;
  symbol: string;
  underlying: Address;
  aToken: Address;
  decimals: number;
  bridged: boolean;
  /** True when Aave's GraphQL API indexes this market (lifetime history). */
  aaveApi: boolean;
  /** Market id, shared by reserves of the same pool. */
  marketId: string;
};

// Aave's GraphQL API (api.v3.aave.com) lists all of these chains and markets, but on 2026-10-27
// userTransactionHistory only answered for the markets below. Metis, Mantle, Celo and Ink returned
// "Unsupported chain ID for subgraph" / "subgraph not found", so they use the on-chain
// since-last-action figure from the start (no wasted request). Testnets are not served either.
// Re-check with scripts/check-reads.mts if the API changes.
const NO_HISTORY_CHAINS = new Set([1088, 5000, 42220, 57073]);
const API_MARKET_IDS = new Set(MAINNET_MARKETS.filter((m) => !NO_HISTORY_CHAINS.has(m.chainId)).map((m) => m.id));

function toReserves(m: Market, r: MarketReserve): Reserve {
  return {
    key: `${m.id}-${r.symbol}`,
    chainId: m.chainId,
    chainName: m.chainName,
    marketName: m.marketName,
    pool: m.pool,
    symbol: r.symbol,
    underlying: r.underlying,
    aToken: r.aToken,
    decimals: r.decimals,
    bridged: r.bridged,
    aaveApi: API_MARKET_IDS.has(m.id),
    marketId: m.id,
  };
}

export const RESERVES: readonly Reserve[] = MARKETS.flatMap((m) => m.reserves.map((r) => toReserves(m, r)));

// Base first: wagmi uses the first chain while no wallet is connected.
export const CHAINS: readonly Chain[] = [...new Set(MARKETS.map((m) => m.chainId))]
  .sort((a, b) => Number(b === 8453) - Number(a === 8453) || a - b)
  .map((id) => {
  const c = VIEM_CHAINS[id];
    if (!c) throw new Error(`No chain definition for ${id}`);
    return c;
  });

export function getReserve(key: string | undefined): Reserve | undefined {
  return key ? RESERVES.find((r) => r.key === key) : undefined;
}

export function chainName(chainId: number): string {
  return MARKETS.find((m) => m.chainId === chainId)?.chainName ?? `chain ${chainId}`;
}

export function explorerUrl(chainId: number): string | undefined {
  return VIEM_CHAINS[chainId]?.blockExplorers?.default.url;
}

/** "USDC.e (bridged)" / "USDC". */
export function symbolLabel(r: Pick<Reserve, "symbol" | "bridged">): string {
  return r.bridged ? `${r.symbol} (bridged)` : r.symbol;
}

/** "Ethereum · Prime" (the market name is dropped when it is the chain's only market). */
export function networkLabel(r: Pick<Reserve, "chainId" | "chainName" | "marketName">): string {
  const multi = MARKETS.filter((m) => m.chainId === r.chainId).length > 1;
  return multi ? `${r.chainName} ${r.marketName}` : r.chainName;
}

/** Full label: "Arbitrum · USDCn" style used in pickers. */
export function reserveLabel(r: Reserve): string {
  return `${networkLabel(r)} · ${symbolLabel(r)}`;
}
