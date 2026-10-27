"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { fmtCountdown, fmtNum, fmtPct, fmtUsdc, parseUsdc } from "@/lib/format";
import { useAaveApy, useNow, useTx, useZaaveChain, useZaaveData } from "@/lib/hooks";
import { MAX_PIE_PRICE, MIN_PIE_PRICE, milliSlicesOf, pieAndSlices, piesPerMonth, slicesOf } from "@/lib/pizza";
import { zaaveAbi } from "@/lib/zaaveAbi";
import { PizzaPie } from "./PizzaPie";
import { Button, Card, Stat, TxStatus } from "./ui";

export function DashboardPanel() {
  const { chainId, zaave } = useZaaveChain();
  const { address } = useAccount();
  const d = useZaaveData();
  const apy = useAaveApy(chainId);
  const now = useNow();
  const harvestTx = useTx();
  const zaTx = useTx();
  const priceTx = useTx();
  const [priceText, setPriceText] = useState("");

  if (!zaave || !address) return null;
  const principal = d.principal ?? 0n;
  const totalCredit = (d.credit ?? 0n) + (d.pendingYield ?? 0n);
  const milli = milliSlicesOf(totalCredit, d.piePrice);
  const { pies, slices } = pieAndSlices(slicesOf(totalCredit, d.piePrice));
  const meterSlices = Number(milli % 8000n) / 1000;
  const monthly = apy.data !== undefined ? piesPerMonth(principal, d.piePrice, apy.data) : undefined;

  const next = Number(d.nextZaDayAt ?? 0n);
  const secondsLeft = next - now;
  const zaDayReady = d.nextZaDayAt !== undefined && secondsLeft <= 0;
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
            <div className="mt-1 text-sm text-muted">worth ${fmtUsdc(totalCredit)} at ${fmtUsdc(d.piePrice)}/pie</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Principal" value={`$${fmtUsdc(principal)}`} />
          <Stat label="Pizza credit" value={`$${fmtUsdc(d.credit)}`} hint="harvested, ready to redeem" />
          <Stat label="Accruing yield" value={`$${fmtUsdc(d.pendingYield, 4)}`} hint="not yet harvested" />
          <Stat
            label="Projected"
            value={monthly === undefined ? "-" : `${fmtNum(monthly, 2)} pies/mo`}
            hint={apy.data !== undefined ? `at ${fmtPct(apy.data)} APY` : undefined}
          />
        </div>
      </Card>

      <Card title="Next Za Day">
        <div className="text-3xl font-extrabold">{d.nextZaDayAt === undefined ? "-" : fmtCountdown(secondsLeft)}</div>
        {d.nextZaDayAt !== undefined && (
          <div className="text-sm text-muted">{new Date(next * 1000).toLocaleString()}</div>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button
            disabled={harvestTx.busy}
            onClick={() =>
              harvestTx.run((write) => write({ address: zaave, abi: zaaveAbi, functionName: "harvest", args: [address], chainId }))
            }
          >
            Harvest my yield
          </Button>
          <Button
            variant="ghost"
            disabled={!zaDayReady || zaTx.busy}
            onClick={() => zaTx.run((write) => write({ address: zaave, abi: zaaveAbi, functionName: "zaDay", chainId }))}
          >
            {zaDayReady ? "Trigger Za Day" : "Za Day not ready"}
          </Button>
        </div>
        <TxStatus tx={harvestTx} />
        <TxStatus tx={zaTx} />
      </Card>

      <Card title="My pie price">
        <p className="mb-3 text-sm text-muted">
          Display only: it changes how many pies you see, never the USDC you&apos;ve earned. Currently ${fmtUsdc(d.piePrice)}.
        </p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="25.00"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button
            disabled={!newPrice || badPrice || priceTx.busy}
            onClick={() =>
              newPrice &&
              priceTx.run((write) => write({ address: zaave, abi: zaaveAbi, functionName: "setPiePrice", args: [newPrice], chainId }))
            }
          >
            Save
          </Button>
        </div>
        {badPrice && <p className="mt-2 text-sm text-tomato">Pick a price between $1 and $1,000.</p>}
        <TxStatus tx={priceTx} />
      </Card>
    </div>
  );
}
