// Pure (non-React) pieces of the cross-chain read path, shared by hooks.ts and the node test script.
import type { Address } from "viem";
import { aTokenAbi, poolAbi } from "./abis";
import { RESERVES, type Reserve } from "./markets";
import { rayAprToApy } from "./pizza";

/** Live state of one USDC reserve: rate, status flags, and (with a wallet) the user's position. */
export type ReserveState = {
  reserve: Reserve;
  /** False when the chain's RPC did not answer for this reserve. */
  reachable: boolean;
  /** Supply APY as a fraction (0.041 = 4.1%). */
  apy: number | undefined;
  /** Frozen, paused or inactive reserves cannot take new deposits. */
  canSupply: boolean;
  /** Paused or inactive reserves cannot be withdrawn from either. */
  canWithdraw: boolean;
  frozen: boolean;
  /** aToken balance in the reserve's own decimals. */
  balance: bigint | undefined;
  scaledBalance: bigint | undefined;
  previousIndex: bigint | undefined;
};

/** Aave ReserveConfigurationMap bits: 56 active, 57 frozen, 60 paused. */
function decodeConfig(cfg: bigint) {
  return { active: ((cfg >> 56n) & 1n) === 1n, frozen: ((cfg >> 57n) & 1n) === 1n, paused: ((cfg >> 60n) & 1n) === 1n };
}

/**
 * The call list for wagmi's readContracts / useReadContracts: per reserve, the pool's
 * getReserveData (rate and status) and, with a wallet, the user's aToken balanceOf,
 * scaledBalanceOf and getPreviousIndex. Each call carries its chainId, so wagmi groups them into
 * one multicall per chain.
 */
export function buildMarketContracts(user: Address | undefined) {
  return RESERVES.flatMap((r) => {
    const rate = { address: r.pool, abi: poolAbi, functionName: "getReserveData", args: [r.underlying], chainId: r.chainId } as const;
    if (!user) return [rate];
    const aToken = { address: r.aToken, abi: aTokenAbi, chainId: r.chainId } as const;
    return [
      rate,
      { ...aToken, functionName: "balanceOf", args: [user] },
      { ...aToken, functionName: "scaledBalanceOf", args: [user] },
      { ...aToken, functionName: "getPreviousIndex", args: [user] },
    ];
  });
}

type Row = { status: string; result?: unknown };

/** Turns the allowFailure result rows of buildMarketContracts back into one ReserveState per reserve. */
export function parseMarketRows(data: readonly Row[] | undefined, user: Address | undefined): ReserveState[] {
  const stride = user ? 4 : 1;
  return RESERVES.map((reserve, i) => {
    const at = (k: number) => {
      const row = data?.[i * stride + k];
      return row?.status === "success" ? row.result : undefined;
    };
    const rd = at(0) as { configuration: bigint; currentLiquidityRate: bigint } | undefined;
    const cfg = rd ? decodeConfig(rd.configuration) : undefined;
    return {
      reserve,
      reachable: rd !== undefined,
      apy: rd ? rayAprToApy(rd.currentLiquidityRate) : undefined,
      canSupply: !!cfg && cfg.active && !cfg.frozen && !cfg.paused,
      canWithdraw: !!cfg && cfg.active && !cfg.paused,
      frozen: !!cfg?.frozen,
      balance: user ? (at(1) as bigint | undefined) : undefined,
      scaledBalance: user ? (at(2) as bigint | undefined) : undefined,
      previousIndex: user ? (at(3) as bigint | undefined) : undefined,
    };
  });
}

/** Names of chains where none of the reserves answered. */
export function unreachableChains(reserves: readonly ReserveState[], chainName: (id: number) => string): string[] {
  const ids = [...new Set(RESERVES.map((r) => r.chainId))];
  return ids.filter((id) => reserves.filter((s) => s.reserve.chainId === id).every((s) => !s.reachable)).map(chainName);
}
