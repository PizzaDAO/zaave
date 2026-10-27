"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/format";
import { useAaveApy } from "@/lib/hooks";
import { piesForStake, requiredStake } from "@/lib/pizza";
import { Card } from "./ui";

const FALLBACK_APY = 0.04;
const MIN_APY = 0.005;

type Mode = "pies" | "stake";

export function Calculator() {
  const apyQuery = useAaveApy();
  const live = apyQuery.data;
  const apy = live ?? FALLBACK_APY;

  const [mode, setMode] = useState<Mode>("pies");
  const [piesText, setPiesText] = useState("2");
  const [priceText, setPriceText] = useState("25");
  const [stakeText, setStakeText] = useState("10000");

  const price = Math.max(1, Number(priceText) || 0);
  const stake = Math.max(0, Number(stakeText) || 0);
  const pies = Math.max(0, Number(piesText) || 0);
  const lo = Math.max(MIN_APY, apy - 0.01);
  const hi = apy + 0.01;

  const result =
    mode === "pies"
      ? { main: fmtUsd(requiredStake(pies, price, apy)), label: "USDC to stake", low: fmtUsd(requiredStake(pies, price, hi)), high: fmtUsd(requiredStake(pies, price, lo)) }
      : { main: `${fmtNum(piesForStake(stake, price, apy), 1)} pies/mo`, label: "your monthly pizza", low: `${fmtNum(piesForStake(stake, price, lo), 1)}`, high: `${fmtNum(piesForStake(stake, price, hi), 1)}` };

  return (
    <Card>
      <div className="block">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="calc-amount" className="text-sm font-medium">
            {mode === "pies" ? "Pies per month" : "USDC to stake"}
          </label>
          <div className="flex gap-1 rounded-lg bg-border/40 p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Calculate from">
            {(["pies", "stake"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-8 rounded-md px-3 ${mode === m ? "bg-card shadow" : "text-muted"}`}
              >
                {m === "pies" ? "🍕 Pies" : "$ USDC"}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mt-1">
          <input
            id="calc-amount"
            inputMode="decimal"
            value={mode === "pies" ? piesText : stakeText}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "");
              if (mode === "pies") setPiesText(v);
              else setStakeText(v);
            }}
            className="w-full rounded-xl border border-border bg-background py-2 pl-3 pr-20 text-lg"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
            {mode === "pies" ? "pies/mo" : "USDC"}
          </span>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium">What does a pie cost near you? (USD)</span>
        <input
          inputMode="decimal"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value.replace(/[^\d.]/g, ""))}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-lg"
        />
      </label>

      <div className="mt-5 rounded-2xl bg-tomato/10 p-4 text-center">
        <div className="text-sm text-muted">{result.label}</div>
        <div className="whitespace-nowrap text-4xl font-extrabold text-tomato">{result.main}</div>
        <div className="mt-1 min-h-10 text-sm text-muted">
          {mode === "pies"
            ? `${result.low} to ${result.high} if the APY moves by 1 point`
            : `${result.low} to ${result.high} pies/mo if the APY moves by 1 point`}
        </div>
      </div>

      <p className="mt-3 text-sm text-muted">
        {apyQuery.isLoading && "Fetching live Aave APY…"}
        {live !== undefined && (
          <>
            Live Aave v3 USDC APY on Base: <strong className="text-foreground">{fmtPct(live)}</strong>. Range uses {fmtPct(lo)} to {fmtPct(hi)}.
          </>
        )}
        {apyQuery.isError && `Couldn't reach Aave, so this uses an estimated ${fmtPct(FALLBACK_APY)} APY.`}
      </p>

      <Link
        href="/stake"
        className="mt-4 block rounded-xl bg-tomato px-4 py-3 text-center font-semibold text-white hover:brightness-110"
      >
        Start staking
      </Link>
    </Card>
  );
}
