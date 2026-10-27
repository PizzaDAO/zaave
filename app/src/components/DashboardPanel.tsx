"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { fmtNum, fmtPct, fmtToken, fmtUsd6, fmtUsdc, parseUsdc } from "@/lib/format";
import { usePiePrice, usePortfolio } from "@/lib/hooks";
import { networkLabel, symbolLabel } from "@/lib/markets";
import {
  MAX_PIE_PRICE,
  MIN_PIE_PRICE,
  daysToNextPie,
  milliSlicesOf,
  pieAndSlices,
  piesPerMonth,
  slicesOf,
} from "@/lib/pizza";
import { PizzaPie } from "./PizzaPie";
import { Button, Card, Notice, Stat } from "./ui";

export function DashboardPanel() {
  const { address } = useAccount();
  const { positions, totals, unreachable, userFailed, isLoading } = usePortfolio();
  const { piePrice, setPiePrice } = usePiePrice();
  const [priceText, setPriceText] = useState("");

  if (!address) return null;
  const { balanceUsd: balance6, interestUsd: interest6, lifetimeUsd: lifetime6 } = totals;
  const principal6 = balance6 > interest6 ? balance6 - interest6 : 0n;
  const milli = milliSlicesOf(interest6, piePrice);
  const { pies, slices } = pieAndSlices(slicesOf(interest6, piePrice));
  const meterSlices = Number(milli % 8000n) / 1000;

  // Projected pies/month: sum of balance x APY over every position (each at its own rate).
  const rated = positions;
  const monthly = rated.reduce((n, p) => n + piesPerMonth(p.balanceUsd, piePrice, p.apy), 0);
  const blendedApy = balance6 > 0n ? rated.reduce((n, p) => n + Number(p.balanceUsd) * p.apy, 0) / Number(balance6) : undefined;
  const daysLeft = blendedApy !== undefined ? daysToNextPie(interest6, piePrice, balance6, blendedApy) : undefined;
  const allTimeCount = positions.filter((p) => p.basis === "allTime").length;

  const newPrice = parseUsdc(priceText);
  const badPrice = newPrice !== undefined && (newPrice < MIN_PIE_PRICE || newPrice > MAX_PIE_PRICE);
  const empty = !isLoading && positions.length === 0;

  return (
    <div className="space-y-4">
      {userFailed.length > 0 && (
        <Notice tone="warn">
          Couldn&apos;t read your positions on {userFailed.join(", ")}, so they aren&apos;t in the totals below.
        </Notice>
      )}
      {unreachable.length > 0 && (
        <Notice tone="warn">
          Couldn&apos;t reach {unreachable.join(", ")}, so those networks aren&apos;t in the totals below. Try again in a
          moment.
        </Notice>
      )}

      <Card>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-around">
          <PizzaPie slices={meterSlices} />
          <div className="text-center sm:text-left">
            <div className="text-5xl font-extrabold text-tomato">
              {pies.toString()} <span className="text-2xl">pies</span>
            </div>
            <div className="text-lg font-semibold">+ {slices.toString()} of 8 slices</div>
            <div className="mt-1 text-sm text-muted">
              worth ${fmtUsdc(interest6, 4)} at ${fmtUsdc(piePrice)}/pie
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Total balance" value={`$${fmtUsdc(balance6)}`} hint="all networks and assets, in USD" />
          <Stat label="Principal" value={`$${fmtUsdc(principal6)}`} />
          <Stat label="Pizza money" value={`$${fmtUsdc(interest6, 4)}`} hint="interest earned" />
          <Stat
            label="Projected"
            value={rated.length === 0 ? "-" : `${fmtNum(monthly, 2)} pies/mo`}
            hint={blendedApy !== undefined ? `at ${fmtPct(blendedApy)} blended APY` : undefined}
          />
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-xs uppercase tracking-wide text-muted">Next pizza</div>
          <div className="text-xl font-extrabold">
            {daysLeft === undefined ? "-" : `in ~${Math.max(1, Math.ceil(daysLeft)).toLocaleString("en-US")} days`}
          </div>
        </div>
        {lifetime6 > 0n && (
          <p className="mt-3 text-xs text-muted">
            Earned all time, including anything you cashed out: ${fmtUsdc(lifetime6, 4)}.
          </p>
        )}
      </Card>

      {positions.length > 0 && (
        <Card title="Positions">
          <ul className="divide-y divide-border">
            {positions.map((p) => (
              <li key={p.reserve.key} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 font-semibold">
                    {symbolLabel(p.reserve)} <span className="font-normal text-muted">· {networkLabel(p.reserve)}</span>
                  </div>
                  <div className="shrink-0 text-sm text-muted">{fmtPct(p.apy)} APY</div>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
                  <div>
                    <div className="text-muted">Balance</div>
                    <div>
                      {fmtToken(p.balance, p.reserve.decimals)} {symbolLabel(p.reserve)}
                    </div>
                    <div className="text-xs text-muted">{fmtUsd6(p.balanceUsd)}</div>
                  </div>
                  <div>
                    <div className="text-muted">Interest</div>
                    <div>
                      {p.interest === undefined ? "-" : `${fmtToken(p.interest, p.reserve.decimals)} ${symbolLabel(p.reserve)}`}
                    </div>
                    <div className="text-xs text-muted">{fmtUsd6(p.interestUsd, 4)}</div>
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {p.basis === "allTime" ? "Basis: all time (Aave history)" : "Basis: since your last deposit or withdrawal"}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {empty && (
        <Notice>
          You haven&apos;t supplied anything to Aave yet.{" "}
          <Link href="/stake" className="font-semibold underline">
            Stake some crypto
          </Link>{" "}
          to start earning pizza money.
        </Notice>
      )}

      <Card title="My pie price">
        <p className="mb-3 text-sm text-muted">
          Display only: it changes how many pies you see, never the interest you&apos;ve earned. Saved in this browser.
          Currently ${fmtUsdc(piePrice)}.
        </p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="25.00"
            aria-label="Pie price in USD"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button
            disabled={!newPrice || badPrice}
            onClick={() => {
              if (newPrice) {
                setPiePrice(newPrice);
                setPriceText("");
              }
            }}
          >
            Save
          </Button>
        </div>
        {badPrice && <p className="mt-2 text-sm text-tomato">Pick a price between $1 and $1,000.</p>}
      </Card>

      {positions.length > 0 && allTimeCount < positions.length && (
        <p className="text-xs text-muted">
          Interest for networks marked &quot;since your last deposit or withdrawal&quot; doesn&apos;t include earlier
          interest.
        </p>
      )}
    </div>
  );
}
