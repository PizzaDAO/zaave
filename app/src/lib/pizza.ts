// Pizza math. On-chain USDC amounts are bigint (6 decimals); calculator estimates use numbers.

export const USDC_DECIMALS = 6;
export const USDC_UNIT = 1_000_000n;
export const SLICES_PER_PIE = 8n;
export const DEFAULT_PIE_PRICE = 25n * USDC_UNIT;
export const MIN_PIE_PRICE = 1n * USDC_UNIT;
export const MAX_PIE_PRICE = 1000n * USDC_UNIT;
const SECONDS_PER_YEAR = 31_536_000;

/** Aave ray APR (1e27) to APY, compounded per second like Aave's own UI. */
export function rayAprToApy(rate: bigint): number {
  const apr = Number(rate) / 1e27;
  return Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1;
}

/** Whole slices: credit / (piePrice / 8) = credit * 8 / piePrice. */
export function slicesOf(credit: bigint, piePrice: bigint): bigint {
  return (credit * SLICES_PER_PIE) / piePrice;
}

/** Slices in thousandths (for a smooth meter fill). */
export function milliSlicesOf(credit: bigint, piePrice: bigint): bigint {
  return (credit * SLICES_PER_PIE * 1000n) / piePrice;
}

/** Whole pies and leftover slices. */
export function pieAndSlices(slices: bigint): { pies: bigint; slices: bigint } {
  return { pies: slices / SLICES_PER_PIE, slices: slices % SLICES_PER_PIE };
}

/** Projected pies per month from a stake at a given APY (number estimate). */
export function piesPerMonth(principal: bigint, piePrice: bigint, apy: number): number {
  if (piePrice <= 0n) return 0;
  const yearlyYield = (Number(principal) / 1e6) * apy;
  return yearlyYield / 12 / (Number(piePrice) / 1e6);
}

/** USDC stake needed for N pies a month at the given pie price (USD) and APY. */
export function requiredStake(piesWanted: number, piePriceUsd: number, apy: number): number {
  if (apy <= 0) return Infinity;
  return (piesWanted * piePriceUsd * 12) / apy;
}

/** Inverse: pies/month for a given stake in USD. */
export function piesForStake(stakeUsd: number, piePriceUsd: number, apy: number): number {
  if (piePriceUsd <= 0) return 0;
  return (stakeUsd * apy) / 12 / piePriceUsd;
}
