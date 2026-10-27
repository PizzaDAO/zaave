"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { fmtNum, fmtPct, fmtUsdc, parseUsdc } from "@/lib/format";
import { useAaveApy, useAaveChain, usePiePrice, usePizzaMoney } from "@/lib/hooks";
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
  const { chainId } = useAaveChain();
  const { address } = useAccount();
  const money = usePizzaMoney();
  const apy = useAaveApy(chainId);
  const { piePrice, setPiePrice } = usePiePrice();
  const [priceText, setPriceText] = useState("");

  if (!address) return null;
  const balance = money.balance ?? 0n;
  const interest = money.interest ?? 0n;
  const principal = balance > interest ? balance - interest : 0n;
  const milli = milliSlicesOf(interest, piePrice);
  const { pies, slices } = pieAndSlices(slicesOf(interest, piePrice));
  const meterSlices = Number(milli % 8000n) / 1000;
  const monthly = apy.data !== undefined ? piesPerMonth(balance, piePrice, apy.data) : undefined;
  const daysLeft = apy.data !== undefined ? daysToNextPie(interest, piePrice, balance, apy.data) : undefined;
  const newPrice = parseUsdc(priceText);
  const badPrice = newPrice !== undefined && (newPrice < MIN_PIE_PRICE || newPrice > MAX_PIE_PRICE);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-around">
          <PizzaPie slices={meterSlices} />
          <div className="text-center sm:text-left">
            <div className="text-5xl font-extrabold text-tomato">
              {pies.toString()} <span className="text-2xl">pies</span>
            </div>
            <div className="text-lg font-semibold">+ {slices.toString()} of 8 slices</div>
            <div className="mt-1 text-sm text-muted">
              worth ${fmtUsdc(money.interest, 4)} at ${fmtUsdc(piePrice)}/pie
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="aUSDC balance" value={`$${fmtUsdc(money.balance)}`} hint="principal + interest" />
          <Stat label="Principal" value={`$${fmtUsdc(principal)}`} />
          <Stat label="Pizza money" value={`$${fmtUsdc(money.interest, 4)}`} hint="interest earned" />
          <Stat
            label="Projected"
            value={monthly === undefined ? "-" : `${fmtNum(monthly, 2)} pies/mo`}
            hint={apy.data !== undefined ? `at ${fmtPct(apy.data)} APY` : undefined}
          />
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-xs uppercase tracking-wide text-muted">Next pizza</div>
          <div className="text-xl font-extrabold">
            {daysLeft === undefined ? "-" : `in ~${Math.max(1, Math.ceil(daysLeft)).toLocaleString("en-US")} days`}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          {money.basis === "allTime"
            ? "Interest basis: all time. Your balance minus the USDC you supplied to Aave (Aave history for this wallet)."
            : "Interest basis: since your last deposit or withdrawal. Earlier interest isn't counted here."}
          {money.basis === "allTime" && money.lifetimeEarned !== undefined && (
            <> Earned all time, including anything you cashed out: ${fmtUsdc(money.lifetimeEarned, 4)}.</>
          )}
        </p>
      </Card>

      <Card title="My pie price">
        <p className="mb-3 text-sm text-muted">
          Display only: it changes how many pies you see, never the USDC you&apos;ve earned. Saved in this browser.
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

      {money.balance === 0n && (
        <Notice>You don&apos;t hold any aUSDC yet. Stake some USDC to start earning pizza money.</Notice>
      )}
    </div>
  );
}
