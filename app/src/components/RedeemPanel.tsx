"use client";

import { erc20Abi } from "viem";
import { useAccount } from "wagmi";
import { gatewayAbi, poolAbi } from "@/lib/abis";
import { fmtToken, fmtUsd6, fmtUsdc } from "@/lib/format";
import { usePortfolio, useTx, useWalletReserve, type Position } from "@/lib/hooks";
import { networkLabel, symbolLabel } from "@/lib/markets";
import { Button, Card, Notice, TxStatus } from "./ui";

export function RedeemPanel() {
  const { address } = useAccount();
  const { positions, totals, unreachable, userFailed, isLoading } = usePortfolio();

  if (!address) return null;
  const cashable = positions.filter((p) => (p.interest ?? 0n) > 0n);

  return (
    <div className="space-y-4">
      {unreachable.length > 0 && (
        <Notice tone="warn">Couldn&apos;t reach {unreachable.join(", ")}, so pizza money there isn&apos;t listed.</Notice>
      )}
      {userFailed.length > 0 && (
        <Notice tone="warn">Couldn&apos;t read your positions on {userFailed.join(", ")}, so they aren&apos;t listed.</Notice>
      )}

      <Card>
        <div className="text-xs uppercase tracking-wide text-muted">Pizza money available</div>
        <div className="text-3xl font-extrabold">${fmtUsdc(totals.interestUsd, 4)}</div>
        <div className="text-xs text-muted">Interest earned across all networks and assets, in USD at today&apos;s prices</div>
      </Card>

      <Card title="Cash out your pizza money">
        <p className="mb-3 text-sm text-muted">
          Withdraw just your interest, in the same token it was earned in, to your wallet. Your principal stays in Aave,
          still earning. Each position is cashed out separately, and your wallet will ask to switch networks first. For
          ETH-style assets you can take the interest as the wrapped token or as the native coin.
        </p>
        {isLoading && cashable.length === 0 && <p className="text-sm text-muted">Loading your positions…</p>}
        {!isLoading && cashable.length === 0 && (
          <Notice>No pizza money to cash out yet. It shows up here once your Aave deposits have earned interest.</Notice>
        )}
        <ul className="divide-y divide-border">
          {cashable.map((p) => (
            <CashRow key={p.reserve.key} position={p} />
          ))}
        </ul>
      </Card>

      <Card title="DoorDash gift cards">
        <Notice>DoorDash gift cards: coming soon. Cash out in the meantime.</Notice>
      </Card>
    </div>
  );
}

function CashRow({ position: p }: { position: Position }) {
  const { address } = useAccount();
  const tx = useTx();
  const gatewayTx = useTx();
  const { reserve } = p;
  const interest = p.interest ?? 0n;
  const hasNative = !!reserve.gateway && !!reserve.nativeSymbol;
  const wallet = useWalletReserve(hasNative ? { reserve, native: true } : undefined);
  const sym = symbolLabel(reserve);
  const needsApproval = (wallet.gatewayAllowance ?? 0n) < interest;

  const target = { chainId: reserve.chainId, reserveKey: reserve.key };
  const cashWrapped = () =>
    address &&
    tx.run(target, (write) =>
      write({
        address: reserve.pool,
        abi: poolAbi,
        functionName: "withdraw",
        args: [reserve.underlying, interest, address],
        chainId: reserve.chainId,
      }),
    );
  const cashNative = () => {
    const gateway = reserve.gateway;
    if (!address || !gateway) return;
    gatewayTx.run(target, (write) =>
      needsApproval
        ? write({ address: reserve.aToken, abi: erc20Abi, functionName: "approve", args: [gateway, interest + interest / 100n + 1n], chainId: reserve.chainId })
        : write({
            address: gateway,
            abi: gatewayAbi,
            functionName: "withdrawETH",
            args: [reserve.pool, interest, address],
            chainId: reserve.chainId,
          }),
    );
  };
  const busy = tx.busy || gatewayTx.busy;
  const canWithdraw = p.state.canWithdraw && !!address;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="truncate font-semibold">
          {sym} <span className="font-normal text-muted">· {networkLabel(reserve)}</span>
        </div>
        <div className="text-lg font-extrabold">
          {fmtToken(interest, reserve.decimals)} {sym}
        </div>
        <div className="text-xs text-muted">
          {fmtUsd6(p.interestUsd, 4)} ·{" "}
          {p.basis === "allTime" ? "Interest earned, all time" : "Interest since your last deposit or withdrawal"}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button className="min-w-32 flex-1" disabled={busy || !canWithdraw} onClick={cashWrapped}>
          Cash out {sym}
        </Button>
        {hasNative && (
          <Button variant="ghost" className="min-w-32 flex-1" disabled={busy || !canWithdraw} onClick={cashNative}>
            {needsApproval ? `1. Approve, then take ${reserve.nativeSymbol}` : `Cash out as ${reserve.nativeSymbol}`}
          </Button>
        )}
      </div>
      <TxStatus tx={tx} />
      <TxStatus tx={gatewayTx} />
    </li>
  );
}
