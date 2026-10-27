import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "./pizza";

/** "1,234.56" from a token amount in the given decimals (default 6: normalized USDC). */
export function fmtUsdc(value: bigint | undefined, maxFraction = 2, decimals = USDC_DECIMALS): string {
  if (value === undefined) return "-";
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: maxFraction });
}

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtNum(n: number, maxFraction = 1): string {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFraction });
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

/** Parse user text to a token amount in the given decimals (default 6); undefined when empty/invalid. */
export function parseUsdc(text: string, decimals = USDC_DECIMALS): bigint | undefined {
  const t = text.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return undefined;
  try {
    return parseUnits(t, decimals);
  } catch {
    return undefined;
  }
}

/**
 * A token amount for display: up to `maxFraction` decimals with trailing zeros trimmed, and
 * "<0.000001" for dust. Display only; never parse this back into a transaction amount.
 */
export function fmtToken(value: bigint | undefined, decimals: number, maxFraction = 6): string {
  if (value === undefined) return "-";
  if (value === 0n) return "0";
  const n = Number(formatUnits(value, decimals));
  const min = 10 ** -maxFraction;
  if (n < min) return `<${min.toFixed(maxFraction)}`;
  // Fewer decimals for big numbers (1,234.56) and more for small ones (0.000123).
  const frac = n >= 1000 ? 2 : n >= 1 ? Math.min(4, maxFraction) : maxFraction;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: frac });
}

/** "$1,234.56" from a USD6 value. */
export function fmtUsd6(value: bigint | undefined, maxFraction = 2): string {
  return value === undefined ? "-" : `$${fmtUsdc(value, maxFraction)}`;
}

export function fmtCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}
