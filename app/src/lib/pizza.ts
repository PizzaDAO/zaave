// Pizza math. All of it runs on USD values as bigint with 6 decimals ("usd6"): a token amount is
// converted with its oracle price (toUsd6) first. Calculator estimates use plain numbers.

export const USDC_DECIMALS = 6;
export const USDC_UNIT = 1_000_000n;
export const SLICES_PER_PIE = 8n;
export const DEFAULT_PIE_PRICE = 25n * USDC_UNIT;
export const MIN_PIE_PRICE = 1n * USDC_UNIT;
export const MAX_PIE_PRICE = 1000n * USDC_UNIT;
const SECONDS_PER_YEAR = 31_536_000;

/** Oracle prices are kept as USD with 8 decimals ($1 = 100_000_000n), like Aave's own oracle. */
export const PRICE_DECIMALS = 8;

/** USD value (6 decimals) of a token amount: amount in the token's own decimals x USD price (8 decimals). */
export function toUsd6(amount: bigint, decimals: number, priceE8: bigint): bigint {
  return (amount * priceE8) / 10n ** BigInt(decimals + PRICE_DECIMALS - USDC_DECIMALS);
}

/** Inverse of toUsd6: the token amount (own decimals) worth a USD6 value. Zero when the price is unknown. */
export function fromUsd6(usd6: bigint, decimals: number, priceE8: bigint): bigint {
  return priceE8 > 0n ? (usd6 * 10n ** BigInt(decimals + PRICE_DECIMALS - USDC_DECIMALS)) / priceE8 : 0n;
}

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

/** Days until the next whole pie, given interest so far, balance and APY. Undefined when there is no yield. */
export function daysToNextPie(interest: bigint, piePrice: bigint, balance: bigint, apy: number): number | undefined {
  if (piePrice <= 0n || balance <= 0n || apy <= 0) return undefined;
  const remaining = Number(piePrice - (interest % piePrice)) / 1e6;
  const perDay = ((Number(balance) / 1e6) * apy) / 365;
  return perDay > 0 ? remaining / perDay : undefined;
}

/** Inverse: pies/month for a given stake in USD. */
export function piesForStake(stakeUsd: number, piePriceUsd: number, apy: number): number {
  if (piePriceUsd <= 0) return 0;
  return (stakeUsd * apy) / 12 / piePriceUsd;
}
