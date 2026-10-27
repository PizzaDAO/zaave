// Per-asset roll-ups of the live reserve states, for the asset picker and the calculator.
import type { ReserveState } from "./market-reads";
import { ASSETS, POPULAR_ASSETS, type Asset } from "./markets";
import { toUsd6 } from "./pizza";

export type AssetSummary = {
  asset: Asset;
  /** Best supply APY among reserves currently open for deposits. */
  bestApy: number | undefined;
  /** USD (6 decimals) the user has supplied in this asset across all chains. */
  suppliedUsd: bigint;
  /** USD (6 decimals) the user holds in the wallet of the underlying token across all chains. */
  walletUsd: bigint;
  /** Open for deposits somewhere, or the user has a balance (supplied or in the wallet). */
  listed: boolean;
};

/**
 * One summary per asset. A native asset ("ETH") shares the wrapped reserves' APY but has no
 * holdings of its own: supplied aWETH and wallet WETH belong to "WETH".
 */
export function summarizeAssets(states: readonly ReserveState[]): AssetSummary[] {
  const byKey = new Map(states.map((s) => [s.reserve.key, s]));
  return ASSETS.map((asset) => {
    let bestApy: number | undefined;
    let suppliedUsd = 0n;
    let walletUsd = 0n;
    let listed = false;
    for (const r of asset.reserves) {
      const s = byKey.get(r.key);
      if (!s) continue;
      if (s.canSupply && (bestApy === undefined || s.apy > bestApy)) bestApy = s.apy;
      if (s.canSupply) listed = true;
      if (!asset.native) {
        const supplied = toUsd6(s.balance ?? 0n, r.decimals, s.priceE8);
        const wallet = toUsd6(s.walletBalance ?? 0n, r.decimals, s.priceE8);
        suppliedUsd += supplied;
        walletUsd += wallet;
        if (supplied > 0n || wallet > 0n) listed = true;
      }
    }
    return { asset, bestApy, suppliedUsd, walletUsd, listed };
  });
}

/** Popular assets sort key (lower = earlier). */
export const popularRank = (label: string) => {
  const i = POPULAR_ASSETS.indexOf(label);
  return i < 0 ? POPULAR_ASSETS.length : i;
};
