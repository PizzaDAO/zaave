"use client";

import { useAccount } from "wagmi";
import { poolAbi } from "@/lib/abis";
import { fmtUsdc } from "@/lib/format";
import { usePortfolio, useTx, type Position } from "@/lib/hooks";
import { networkLabel, symbolLabel } from "@/lib/markets";
import { Button, Card, Notice, TxStatus } from "./ui";

export function RedeemPanel() {
  const { address } = useAccount();
  const { positions, totals, unreachable, isLoading } = usePortfolio();

  if (!address) return null;
  const cashable = positions.filter((p) => (p.interest ?? 0n) > 0n);

  return (
    <div className="space-y-4">
      {unreachable.length > 0 && (
        <Notice tone="warn">Couldn&apos;t reach {unreachable.join(", ")}, so pizza money there isn&apos;t listed.</Notice>
      )}

      <Card>
        <div className="text-xs uppercase tracking-wide text-muted">Pizza money available</div>
        <div className="text-3xl font-extrabold">${fmtUsdc(totals.interest6, 4)}</div>
        <div className="text-xs text-muted">Interest earned across all networks</div>
      </Card>

      <Card title="Cash out your pizza money">
        <p className="mb-3 text-sm text-muted">
          Withdraw just your interest as USDC to your wallet and buy your own pie. Your principal stays in Aave, still
          earning. Each network is cashed out separately, and your wallet will ask to switch networks first.
        </p>
        {isLoading && cashable.length === 0 && <p className="text-sm text-muted">Loading your positions…</p>}
        {!isLoading && cashable.length === 0 && (
          <Notice>No pizza money to cash out yet. It shows up here once your Aave USDC has earned interest.</Notice>
        )}
        <ul className="divide-y divide-border">
          {cashable.map((p) => (
            <CashRow key={p.reserve.key} position={p} />
          ))}
        </ul>
      </Card>

      <Card title="DoorDash gift cards">
        <Notice>DoorDash gift cards: coming soon. Cash out USDC in the meantime.</Notice>
      </Card>
    </div>
  );
}

function CashRow({ position: p }: { position: Position }) {
  const { address } = useAccount();
  const tx = useTx();
  const interest = p.interest ?? 0n;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {networkLabel(p.reserve)} <span className="font-normal text-muted">· {symbolLabel(p.reserve)}</span>
          </div>
          <div className="text-lg font-extrabold">${fmtUsdc(interest, 4, p.reserve.decimals)}</div>
          <div className="text-xs text-muted">
            {p.basis === "allTime" ? "Interest earned, all time" : "Interest since your last deposit or withdrawal"}
          </div>
        </div>
        <Button
          className="shrink-0"
          disabled={tx.busy || !p.state.canWithdraw || !address}
          onClick={() =>
            address &&
            tx.run({ chainId: p.reserve.chainId, reserveKey: p.reserve.key }, (write) =>
              write({
                address: p.reserve.pool,
                abi: poolAbi,
                functionName: "withdraw",
                args: [p.reserve.underlying, interest, address],
                chainId: p.reserve.chainId,
              }),
            )
          }
        >
          Cash out
        </Button>
      </div>
      <TxStatus tx={tx} />
    </li>
  );
}
