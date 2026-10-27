"use client";

import { useState } from "react";
import { erc20Abi, formatUnits, maxUint256 } from "viem";
import { useAccount } from "wagmi";
import { poolAbi } from "@/lib/abis";
import { fmtPct, fmtUsdc, parseUsdc } from "@/lib/format";
import { useMarketData, useTx, useWalletReserve } from "@/lib/hooks";
import { getReserve, networkLabel, symbolLabel } from "@/lib/markets";
import { Button, Card, Notice, Stat, TxStatus } from "./ui";

export function StakePanel() {
  const { address, chainId: walletChainId } = useAccount();
  const market = useMarketData();
  const [pickedKey, setPickedKey] = useState<string>();
  const depositTx = useTx();
  const withdrawTx = useTx();
  const [depositText, setDepositText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");

  // Default: where the user already has the most (all decimals normalized), else the best rate.
  const largest = market.reserves
    .filter((s) => (s.balance ?? 0n) > 0n)
    .sort((a, b) => Number(b.balance! * 10n ** BigInt(18 - b.reserve.decimals) - a.balance! * 10n ** BigInt(18 - a.reserve.decimals)))[0];
  const picked = getReserve(pickedKey);
  const state = market.reserves.find((s) => s.reserve.key === (picked?.key ?? largest?.reserve.key ?? market.best?.reserve.key));
  const reserve = state?.reserve;
  const wallet = useWalletReserve(reserve);

  if (!address) return null;

  const decimals = reserve?.decimals ?? 6;
  const aBalance = state?.balance;
  const depositAmt = parseUsdc(depositText, decimals);
  const withdrawAmt = parseUsdc(withdrawText, decimals);
  const needsApproval = depositAmt !== undefined && (wallet.allowance ?? 0n) < depositAmt;
  const overBalance = depositAmt !== undefined && wallet.usdcBalance !== undefined && depositAmt > wallet.usdcBalance;
  const overWithdraw = withdrawAmt !== undefined && aBalance !== undefined && withdrawAmt > aBalance;
  const wrongChain = !!reserve && walletChainId !== reserve.chainId;

  const pick = (key: string) => {
    setPickedKey(key);
    setDepositText("");
    setWithdrawText("");
  };

  const onDeposit = () => {
    if (!depositAmt || !reserve) return;
    depositTx.run({ chainId: reserve.chainId, reserveKey: reserve.key }, (write) =>
      needsApproval
        ? write({
            address: reserve.underlying,
            abi: erc20Abi,
            functionName: "approve",
            args: [reserve.pool, depositAmt],
            chainId: reserve.chainId,
          })
        : write({
            address: reserve.pool,
            abi: poolAbi,
            functionName: "supply",
            args: [reserve.underlying, depositAmt, address, 0],
            chainId: reserve.chainId,
          }),
    );
  };

  const withdraw = (amount: bigint) => {
    if (!reserve) return;
    withdrawTx.run({ chainId: reserve.chainId, reserveKey: reserve.key }, (write) =>
      write({
        address: reserve.pool,
        abi: poolAbi,
        functionName: "withdraw",
        args: [reserve.underlying, amount, address],
        chainId: reserve.chainId,
      }),
    );
  };

  return (
    <div className="space-y-4">
      <Card title="Network">
        <label htmlFor="reserve-pick" className="sr-only">
          Network and USDC reserve
        </label>
        <select
          id="reserve-pick"
          value={reserve?.key ?? ""}
          onChange={(e) => pick(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base"
        >
          {market.reserves
            .filter((s) => s.reachable && (s.canSupply || (s.balance ?? 0n) > 0n))
            .map((s) => (
              <option key={s.reserve.key} value={s.reserve.key}>
                {networkLabel(s.reserve)} · {symbolLabel(s.reserve)} ·{" "}
                {!s.canSupply ? "withdraw only" : s.apy !== undefined ? fmtPct(s.apy) : "-"}
                {(s.balance ?? 0n) > 0n ? ` · you: $${fmtUsdc(s.balance, 2, s.reserve.decimals)}` : ""}
              </option>
            ))}
        </select>
        {market.isLoading && <p className="mt-2 text-xs text-muted">Loading networks…</p>}
        {market.unreachable.length > 0 && (
          <p className="mt-2 text-xs text-muted">Couldn&apos;t reach {market.unreachable.join(", ")}.</p>
        )}
        {reserve?.bridged && (
          <div className="mt-3">
            <Notice tone="warn">
              {reserve.symbol} is bridged USDC, not Circle&apos;s native USDC. You need this exact token to supply here,
              and it may trade at a different price than native USDC.
            </Notice>
          </div>
        )}
        {state && !state.canSupply && state.reachable && (
          <div className="mt-3">
            <Notice tone="warn">
              Aave has closed this reserve to new deposits. You can still withdraw what you have here.
            </Notice>
          </div>
        )}
        {reserve && wrongChain && (
          <p className="mt-2 text-xs text-muted">
            Your wallet will ask to switch to {reserve.chainName} when you confirm.
          </p>
        )}
      </Card>

      {reserve && (
        <Notice>
          Your USDC goes straight into Aave v3 ({networkLabel(reserve)}). You hold aUSDC in your own wallet; Zaave never
          touches your funds.
        </Notice>
      )}

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Your aUSDC"
            value={`$${fmtUsdc(aBalance, 2, decimals)}`}
            hint={state?.apy !== undefined ? `earning ${fmtPct(state.apy)} in Aave` : "earning interest in Aave"}
          />
          <Stat label="Wallet USDC" value={`$${fmtUsdc(wallet.usdcBalance, 2, decimals)}`} hint={reserve ? symbolLabel(reserve) : undefined} />
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
            onClick={() => wallet.usdcBalance !== undefined && setDepositText(formatUnits(wallet.usdcBalance, decimals))}
          >
            Max
          </Button>
        </div>
        <Button
          className="mt-3 w-full"
          disabled={!depositAmt || depositTx.busy || overBalance || !state?.canSupply}
          onClick={onDeposit}
        >
          {needsApproval ? "1. Approve USDC" : "Stake"}
        </Button>
        {needsApproval && (
          <p className="mt-2 text-xs text-muted">
            Approves exactly this amount for the Aave Pool, then press again to stake.
          </p>
        )}
        {overBalance && <p className="mt-2 text-sm text-tomato">That&apos;s more than your wallet balance.</p>}
        <TxStatus tx={depositTx} />
        {reserve?.chainId === 84532 && (
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
            disabled={!withdrawAmt || overWithdraw || withdrawTx.busy || !state?.canWithdraw}
            onClick={() => withdrawAmt && withdraw(withdrawAmt)}
          >
            Withdraw
          </Button>
        </div>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          disabled={!aBalance || withdrawTx.busy || !state?.canWithdraw}
          onClick={() => withdraw(maxUint256)}
        >
          Withdraw all
        </Button>
        {overWithdraw && <p className="mt-2 text-sm text-tomato">That&apos;s more than your aUSDC balance.</p>}
        <TxStatus tx={withdrawTx} />
      </Card>
    </div>
  );
}
