"use client";

import { useState } from "react";
import { erc20Abi, formatUnits, maxUint256 } from "viem";
import { useAccount } from "wagmi";
import { poolAbi } from "@/lib/abis";
import { fmtUsdc, parseUsdc } from "@/lib/format";
import { useAaveChain, useAaveData, useTx } from "@/lib/hooks";
import { USDC_DECIMALS } from "@/lib/pizza";
import { Button, Card, Notice, Stat, TxStatus } from "./ui";

export function StakePanel() {
  const { chainId, cfg } = useAaveChain();
  const { address } = useAccount();
  const { usdcBalance, allowance, aUsdcBalance } = useAaveData();
  const depositTx = useTx();
  const withdrawTx = useTx();
  const [depositText, setDepositText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");

  if (!address) return null;
  const depositAmt = parseUsdc(depositText);
  const withdrawAmt = parseUsdc(withdrawText);
  const needsApproval = depositAmt !== undefined && (allowance ?? 0n) < depositAmt;
  const overBalance = depositAmt !== undefined && usdcBalance !== undefined && depositAmt > usdcBalance;
  const overWithdraw = withdrawAmt !== undefined && aUsdcBalance !== undefined && withdrawAmt > aUsdcBalance;

  const onDeposit = () => {
    if (!depositAmt) return;
    depositTx.run((write) =>
      needsApproval
        ? write({ address: cfg.usdc, abi: erc20Abi, functionName: "approve", args: [cfg.aavePool, depositAmt], chainId })
        : write({
            address: cfg.aavePool,
            abi: poolAbi,
            functionName: "supply",
            args: [cfg.usdc, depositAmt, address, 0],
            chainId,
          }),
    );
  };

  return (
    <div className="space-y-4">
      <Notice>
        Your USDC goes straight into Aave v3 on {cfg.name}. You hold aUSDC in your own wallet; Zaave never touches your
        funds.
      </Notice>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Your aUSDC" value={`$${fmtUsdc(aUsdcBalance)}`} hint="earning interest in Aave" />
          <Stat label="Wallet USDC" value={`$${fmtUsdc(usdcBalance)}`} />
        </div>
      </Card>

      <Card title="Stake USDC">
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            aria-label="USDC amount to stake"
            value={depositText}
            onChange={(e) => setDepositText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button
            variant="ghost"
            onClick={() => usdcBalance !== undefined && setDepositText(formatUnits(usdcBalance, USDC_DECIMALS))}
          >
            Max
          </Button>
        </div>
        <Button className="mt-3 w-full" disabled={!depositAmt || depositTx.busy || overBalance} onClick={onDeposit}>
          {needsApproval ? "1. Approve USDC" : "Stake"}
        </Button>
        {needsApproval && (
          <p className="mt-2 text-xs text-muted">
            Approves exactly this amount for the Aave Pool, then press again to stake.
          </p>
        )}
        {overBalance && <p className="mt-2 text-sm text-tomato">That&apos;s more than your wallet balance.</p>}
        <TxStatus tx={depositTx} />
        {cfg.name === "Base Sepolia" && (
          <div className="mt-3">
            <Notice>Testnet: get Aave test USDC from the Aave faucet (app.aave.com, testnet mode, Base Sepolia).</Notice>
          </div>
        )}
      </Card>

      <Card title="Withdraw">
        <p className="mb-3 text-sm text-muted">Your aUSDC is yours. Withdraw back to USDC any time (subject to pool liquidity).</p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            aria-label="USDC amount to withdraw"
            value={withdrawText}
            onChange={(e) => setWithdrawText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button
            disabled={!withdrawAmt || overWithdraw || withdrawTx.busy}
            onClick={() =>
              withdrawAmt &&
              withdrawTx.run((write) =>
                write({
                  address: cfg.aavePool,
                  abi: poolAbi,
                  functionName: "withdraw",
                  args: [cfg.usdc, withdrawAmt, address],
                  chainId,
                }),
              )
            }
          >
            Withdraw
          </Button>
        </div>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          disabled={!aUsdcBalance || withdrawTx.busy}
          onClick={() =>
            withdrawTx.run((write) =>
              write({
                address: cfg.aavePool,
                abi: poolAbi,
                functionName: "withdraw",
                args: [cfg.usdc, maxUint256, address],
                chainId,
              }),
            )
          }
        >
          Withdraw all
        </Button>
        {overWithdraw && <p className="mt-2 text-sm text-tomato">That&apos;s more than your aUSDC balance.</p>}
        <TxStatus tx={withdrawTx} />
      </Card>
    </div>
  );
}
