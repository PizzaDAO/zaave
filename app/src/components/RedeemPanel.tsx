"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { poolAbi } from "@/lib/abis";
import { fmtUsdc, parseUsdc } from "@/lib/format";
import { useAaveChain, usePizzaMoney, useTx } from "@/lib/hooks";
import { USDC_DECIMALS } from "@/lib/pizza";
import { Button, Card, Notice, TxStatus } from "./ui";

export function RedeemPanel() {
  const { chainId, cfg } = useAaveChain();
  const { address } = useAccount();
  const money = usePizzaMoney();
  const cashTx = useTx();
  const [cashText, setCashText] = useState("");

  if (!address) return null;
  const available = money.interest ?? 0n;
  const cashAmt = parseUsdc(cashText);

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-xs uppercase tracking-wide text-muted">Pizza money available</div>
        <div className="text-3xl font-extrabold">${fmtUsdc(money.interest, 4)}</div>
        <div className="text-xs text-muted">
          {money.basis === "allTime" ? "Interest earned, all time" : "Interest earned since your last deposit or withdrawal"}
        </div>
      </Card>

      <Card title="Cash out your pizza money">
        <p className="mb-3 text-sm text-muted">
          Withdraw just your interest as USDC to your wallet and buy your own pie. Your principal stays in Aave, still
          earning.
        </p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            aria-label="USDC interest to cash out"
            value={cashText}
            onChange={(e) => setCashText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button variant="ghost" onClick={() => setCashText(formatUnits(available, USDC_DECIMALS))}>
            Max
          </Button>
        </div>
        <Button
          className="mt-3 w-full"
          disabled={!cashAmt || cashAmt > available || cashTx.busy}
          onClick={() =>
            cashAmt &&
            cashTx.run((write) =>
              write({
                address: cfg.aavePool,
                abi: poolAbi,
                functionName: "withdraw",
                args: [cfg.usdc, cashAmt, address],
                chainId,
              }),
            )
          }
        >
          Cash out
        </Button>
        {cashAmt !== undefined && cashAmt > available && (
          <p className="mt-2 text-sm text-tomato">That&apos;s more than your pizza money.</p>
        )}
        <TxStatus tx={cashTx} />
      </Card>

      <Card title="DoorDash gift cards">
        <Notice>DoorDash gift cards: coming soon. Cash out USDC in the meantime.</Notice>
      </Card>
    </div>
  );
}
