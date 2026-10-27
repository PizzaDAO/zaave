import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "./pizza";

/** "1,234.56" from 6-decimal USDC. */
export function fmtUsdc(value: bigint | undefined, maxFraction = 2): string {
  if (value === undefined) return "-";
  const n = Number(formatUnits(value, USDC_DECIMALS));
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

/** Parse user text to 6-decimal USDC; undefined when empty/invalid. */
export function parseUsdc(text: string): bigint | undefined {
  const t = text.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return undefined;
  try {
    return parseUnits(t, USDC_DECIMALS);
  } catch {
    return undefined;
  }
}

export function fmtCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}
