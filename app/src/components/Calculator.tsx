"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { popularRank, summarizeAssets } from "@/lib/assets";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/format";
import { pickBest, useMarketData } from "@/lib/hooks";
import type { ReserveState } from "@/lib/market-reads";
import { ASSET_BY_ID, isStable, networkLabel, symbolLabel } from "@/lib/markets";
import { piesForStake, requiredStake } from "@/lib/pizza";
import { Card } from "./ui";

const FALLBACK_APY = 0.04;
const MIN_APY = 0.005;

type Mode = "pies" | "stake";

export function Calculator() {
  const market = useMarketData();
  const [assetId, setAssetId] = useState<string>("auto"); // "auto" = best stablecoin, else an Asset id
  const [choice, setChoice] = useState<string>("best"); // "best" or a reserve key
  const asset = assetId === "auto" ? undefined : ASSET_BY_ID.get(assetId);

  // Reserves open for deposits that this asset choice covers, best APY first.
  const candidates = useMemo(() => {
    if (!asset) return market.ranked.filter((s) => isStable(s.reserve));
    const keys = new Set(asset.reserves.map((r) => r.key));
    return market.ranked.filter((s) => keys.has(s.reserve.key));
  }, [market.ranked, asset]);
  const bestOfCandidates = pickBest(candidates);
  const picked = candidates.find((s) => s.reserve.key === choice);
  const used = picked ?? bestOfCandidates;
  const live = used?.apy;
  const apy = live ?? FALLBACK_APY;
  const failed = !market.isLoading && candidates.length === 0;
  const assetLabel = asset?.label ?? (used ? symbolLabel(used.reserve) : "stablecoin");
  const nonStable = !!used && !(asset ? asset.stable : isStable(used.reserve));

  // Assets that currently accept deposits, with their best APY, for the selector.
  const options = useMemo(() => {
    const list = summarizeAssets(market.reserves)
      .filter((x) => x.bestApy !== undefined)
      .map((x) => ({ a: x.asset, apy: x.bestApy! }));
    const sorter = (x: { a: { label: string } }, y: { a: { label: string } }) =>
      popularRank(x.a.label) - popularRank(y.a.label) || x.a.label.localeCompare(y.a.label);
    return { stable: list.filter((o) => o.a.stable).sort(sorter), other: list.filter((o) => !o.a.stable).sort(sorter) };
  }, [market.reserves]);

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
      ? { main: fmtUsd(requiredStake(pies, price, apy)), label: `USD to stake, as ${assetLabel}`, low: fmtUsd(requiredStake(pies, price, hi)), high: fmtUsd(requiredStake(pies, price, lo)) }
      : { main: `${fmtNum(piesForStake(stake, price, apy), 1)} pies/mo`, label: "your monthly pizza", low: `${fmtNum(piesForStake(stake, price, lo), 1)}`, high: `${fmtNum(piesForStake(stake, price, hi), 1)}` };

  return (
    <Card>
      <div className="block">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="calc-amount" className="text-sm font-medium">
            {mode === "pies" ? "Pies per month" : "USD to stake"}
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
                {m === "pies" ? "🍕 Pies" : "$ USD"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1 flex gap-2">
          <input
            id="calc-amount"
            inputMode="decimal"
            value={mode === "pies" ? piesText : stakeText}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "");
              if (mode === "pies") setPiesText(v);
              else setStakeText(v);
            }}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <select
            aria-label="Asset to stake"
            value={assetId}
            onChange={(e) => {
              setAssetId(e.target.value);
              setChoice("best");
            }}
            className="w-[7.5rem] shrink-0 truncate rounded-xl border border-border bg-background px-2 py-2 text-base sm:w-44"
          >
            <option value="auto">Best stable</option>
            {options.stable.length > 0 && (
              <optgroup label="Stablecoins">
                {options.stable.map(({ a, apy: x }) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {fmtPct(x)}
                  </option>
                ))}
              </optgroup>
            )}
            {options.other.length > 0 && (
              <optgroup label="Other assets">
                {options.other.map(({ a, apy: x }) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {fmtPct(x)}
                  </option>
                ))}
              </optgroup>
            )}
            {asset && !options.stable.concat(options.other).some((o) => o.a.id === asset.id) && <option value={asset.id}>{asset.label}</option>}
          </select>
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
        {market.isLoading && "Fetching live Aave rates…"}
        {used && live !== undefined && (
          <>
            {picked ? "Using" : `Best live Aave v3 ${asset ? asset.label : "stablecoin"} rate:`}{" "}
            <strong className="text-foreground">{fmtPct(live)}</strong> on{" "}
            <strong className="text-foreground">{networkLabel(used.reserve)}</strong> ({symbolLabel(used.reserve, asset?.native)}). Range
            uses {fmtPct(lo)} to {fmtPct(hi)}.
          </>
        )}
        {failed && `Couldn't reach Aave, so this uses an estimated ${fmtPct(FALLBACK_APY)} APY.`}
      </p>
      {nonStable && (
        <p className="mt-1 text-sm text-muted">
          Paid in {assetLabel}; pizza value moves with its price.
        </p>
      )}

      {candidates.length > 0 && (
        <details className="group mt-2 rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold">
            Rates by network
            <span className="text-muted transition group-open:rotate-180" aria-hidden>
              ▾
            </span>
          </summary>
          <ul className="divide-y divide-border border-t border-border text-sm">
            <li>
              <RateRow label="Best rate (automatic)" apy={bestOfCandidates?.apy} active={choice === "best"} onPick={() => setChoice("best")} />
            </li>
            {candidates.map((s: ReserveState) => (
              <li key={s.reserve.key}>
                <RateRow
                  label={`${networkLabel(s.reserve)} · ${symbolLabel(s.reserve, asset?.native)}${s.reserve.key !== bestOfCandidates?.reserve.key && s.apy > (bestOfCandidates?.apy ?? 0) ? " · low liquidity" : ""}`}
                  apy={s.apy}
                  active={choice === s.reserve.key}
                  onPick={() => setChoice(s.reserve.key)}
                />
              </li>
            ))}
          </ul>
          {market.unreachable.length > 0 && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted">
              Couldn&apos;t reach {market.unreachable.join(", ")}.
            </p>
          )}
        </details>
      )}

      <Link
        href="/stake"
        className="mt-4 block rounded-xl bg-tomato px-4 py-3 text-center font-semibold text-white hover:brightness-110"
      >
        Start staking
      </Link>
    </Card>
  );
}

function RateRow({ label, apy, active, onPick }: { label: string; apy: number | undefined; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left ${active ? "bg-tomato/10 font-semibold" : ""}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{apy === undefined ? "-" : fmtPct(apy)}</span>
    </button>
  );
}
