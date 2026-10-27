import type { Address } from "viem";

export const BASE = 8453;
export const BASE_SEPOLIA = 84532;
export type SupportedChainId = typeof BASE | typeof BASE_SEPOLIA;

type ChainConfig = {
  name: string;
  /** USDC underlying that Aave v3 lists on this chain. */
  usdc: Address;
  /** aUSDC: the interest-bearing token users hold in their own wallet. */
  aUsdc: Address;
  /** Aave v3 Pool. */
  aavePool: Address;
  rpcUrl: string;
  explorer: string;
  /** True when Aave's GraphQL API indexes this chain (lifetime history). */
  aaveApi: boolean;
};

// NEXT_PUBLIC_* vars must be referenced statically so Next inlines them.
export const CHAINS: Record<SupportedChainId, ChainConfig> = {
  [BASE]: {
    name: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    aUsdc: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
    aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_8453 || "https://mainnet.base.org",
    explorer: "https://basescan.org",
    aaveApi: true,
  },
  [BASE_SEPOLIA]: {
    name: "Base Sepolia",
    usdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
    aUsdc: "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",
    aavePool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_84532 || "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    aaveApi: false,
  },
};

/** Base mainnet unless NEXT_PUBLIC_DEFAULT_CHAIN=84532. */
export function getDefaultChainId(): SupportedChainId {
  return process.env.NEXT_PUBLIC_DEFAULT_CHAIN === String(BASE_SEPOLIA) ? BASE_SEPOLIA : BASE;
}

export function getChainConfig(chainId: number | undefined): ChainConfig | undefined {
  return chainId === BASE || chainId === BASE_SEPOLIA ? CHAINS[chainId] : undefined;
}
