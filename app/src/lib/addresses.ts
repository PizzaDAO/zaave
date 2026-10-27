import type { Address } from "viem";
import { zeroAddress } from "viem";

export const BASE = 8453;
export const BASE_SEPOLIA = 84532;
export type SupportedChainId = typeof BASE | typeof BASE_SEPOLIA;

type ChainConfig = {
  name: string;
  /** Zaave contract, or undefined when not deployed / not configured. */
  zaave?: Address;
  /** USDC underlying that Aave v3 lists on this chain. */
  usdc: Address;
  /** Aave v3 Pool. */
  aavePool: Address;
  rpcUrl: string;
  explorer: string;
};

// NEXT_PUBLIC_* vars must be referenced statically so Next inlines them.
function envAddress(value: string | undefined): Address | undefined {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) && value !== zeroAddress
    ? (value as Address)
    : undefined;
}

export const CHAINS: Record<SupportedChainId, ChainConfig> = {
  [BASE]: {
    name: "Base",
    zaave: envAddress(process.env.NEXT_PUBLIC_ZAAVE_ADDRESS_8453),
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_8453 || "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
  [BASE_SEPOLIA]: {
    name: "Base Sepolia",
    zaave: envAddress(process.env.NEXT_PUBLIC_ZAAVE_ADDRESS_84532),
    // Aave v3 Base Sepolia test USDC + pool (verified via aave-address-book and getReserveData).
    usdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
    aavePool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_84532 || "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
};

/** Base Sepolia until a mainnet Zaave address is set (or NEXT_PUBLIC_DEFAULT_CHAIN overrides). */
export function getDefaultChainId(): SupportedChainId {
  const forced = process.env.NEXT_PUBLIC_DEFAULT_CHAIN;
  if (forced === String(BASE)) return BASE;
  if (forced === String(BASE_SEPOLIA)) return BASE_SEPOLIA;
  return CHAINS[BASE].zaave ? BASE : BASE_SEPOLIA;
}

export function getChainConfig(chainId: number | undefined): ChainConfig | undefined {
  return chainId === BASE || chainId === BASE_SEPOLIA ? CHAINS[chainId] : undefined;
}
