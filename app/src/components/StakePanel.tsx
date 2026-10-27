"use client";

import { useState } from "react";
import { fmtUsdc, parseUsdc } from "@/lib/format";
import { useTx, useUsdc, useZaaveChain, useZaaveData } from "@/lib/hooks";
import { zaaveAbi } from "@/lib/zaaveAbi";
import { erc20Abi } from "viem";
import { Button, Card, Notice, Stat, TxStatus } from "./ui";

export function StakePanel() {
  const { chainId, cfg, zaave } = useZaaveChain();
  const { principal, tvlCap, totalPrincipal } = useZaaveData();
  const { balance, allowance } = useUsdc();
  const depositTx = useTx();
  const withdrawTx = useTx();
  const [depositText, setDepositText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");

  if (!zaave) return null;
  const depositAmt = parseUsdc(depositText);
  const withdrawAmt = parseUsdc(withdrawText);
  const needsApproval = depositAmt !== undefined && (allowance ?? 0n) < depositAmt;
  const overBalance = depositAmt !== undefined && balance !== undefined && depositAmt > balance;
  const room = tvlCap !== undefined && totalPrincipal !== undefined ? tvlCap - totalPrincipal : undefined;
  const overCap = depositAmt !== undefined && room !== undefined && depositAmt > room;
  const overWithdraw = withdrawAmt !== undefined && principal !== undefined && withdrawAmt > principal;

  const onDeposit = () => {
    if (!depositAmt) return;
    depositTx.run((write) =>
      needsApproval
        ? write({ address: cfg.usdc, abi: erc20Abi, functionName: "approve", args: [zaave, depositAmt], chainId })
        : write({ address: zaave, abi: zaaveAbi, functionName: "deposit", args: [depositAmt], chainId }),
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Your stake" value={`$${fmtUsdc(principal)}`} />
          <Stat label="Wallet USDC" value={`$${fmtUsdc(balance)}`} />
        </div>
        {tvlCap !== undefined && (
          <p className="mt-3 text-xs text-muted">
            Early-access cap: ${fmtUsdc(totalPrincipal, 0)} of ${fmtUsdc(tvlCap, 0)} filled.
          </p>
        )}
      </Card>

      <Card title="Stake USDC">
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={depositText}
            onChange={(e) => setDepositText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button variant="ghost" onClick={() => balance !== undefined && setDepositText((Number(balance) / 1e6).toString())}>
            Max
          </Button>
        </div>
        <Button className="mt-3 w-full" disabled={!depositAmt || depositTx.busy || overBalance || overCap} onClick={onDeposit}>
          {needsApproval ? "1. Approve USDC" : "Deposit"}
        </Button>
        {needsApproval && <p className="mt-2 text-xs text-muted">Approve first, then press again to deposit.</p>}
        {overBalance && <p className="mt-2 text-sm text-tomato">That&apos;s more than your wallet balance.</p>}
        {overCap && <p className="mt-2 text-sm text-tomato">That would exceed the early-access cap.</p>}
        <TxStatus tx={depositTx} />
        {cfg.name === "Base Sepolia" && (
          <div className="mt-3">
            <Notice>Testnet: get Aave test USDC from the Aave faucet (app.aave.com, testnet mode, Base Sepolia).</Notice>
          </div>
        )}
      </Card>

      <Card title="Withdraw">
        <p className="mb-3 text-sm text-muted">Your principal is always yours. Withdraw any time.</p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={withdrawText}
            onChange={(e) => setWithdrawText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button
            disabled={!withdrawAmt || overWithdraw || withdrawTx.busy}
            onClick={() =>
              withdrawAmt &&
              withdrawTx.run((write) =>
                write({ address: zaave, abi: zaaveAbi, functionName: "withdraw", args: [withdrawAmt], chainId }),
              )
            }
          >
            Withdraw
          </Button>
        </div>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          disabled={!principal || withdrawTx.busy}
          onClick={() =>
            withdrawTx.run((write) => write({ address: zaave, abi: zaaveAbi, functionName: "withdrawAll", chainId }))
          }
        >
          Withdraw all
        </Button>
        {overWithdraw && <p className="mt-2 text-sm text-tomato">That&apos;s more than your stake.</p>}
        <TxStatus tx={withdrawTx} />
      </Card>
    </div>
  );
}
