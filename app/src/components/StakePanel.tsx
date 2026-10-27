"use client";

import { useMemo, useState } from "react";
import { erc20Abi, formatUnits, maxUint256 } from "viem";
import { useAccount } from "wagmi";
import { gatewayAbi, poolAbi } from "@/lib/abis";
import { summarizeAssets } from "@/lib/assets";
import { fmtPct, fmtToken, fmtUsd6, parseUsdc } from "@/lib/format";
import { useMarketData, useTx, useWalletReserve } from "@/lib/hooks";
import type { ReserveState, SupplyBlock } from "@/lib/market-reads";
import { ASSET_BY_ID, getReserve, networkLabel, symbolLabel, type Choice } from "@/lib/markets";
import { toUsd6 } from "@/lib/pizza";
import { AssetPicker } from "./AssetPicker";
import { Button, Card, Notice, Stat, TxStatus } from "./ui";

const BLOCK_TEXT: Record<SupplyBlock, string> = {
  frozen: "withdraw only",
  paused: "paused",
  inactive: "inactive",
  cap: "supply cap reached",
};

const MAINNET_USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

export function StakePanel() {
  const { address, chainId: walletChainId } = useAccount();
  const market = useMarketData();
  const [pickedAsset, setPickedAsset] = useState<string>();
  const [pickedKey, setPickedKey] = useState<string>();
  const depositTx = useTx();
  const withdrawTx = useTx();
  const [depositText, setDepositText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");

  const summaries = useMemo(() => summarizeAssets(market.reserves), [market.reserves]);

  // Default asset: where the user already has the most supplied, else the most in a wallet, else
  // the best-rate stablecoin. (Computed from live data; locked in once the user acts.)
  const defaultAssetId = useMemo(() => {
    const bySupplied = [...summaries].sort((a, b) => (a.suppliedUsd < b.suppliedUsd ? 1 : -1))[0];
    if (bySupplied && bySupplied.suppliedUsd > 0n) return bySupplied.asset.id;
    const byWallet = [...summaries].sort((a, b) => (a.walletUsd < b.walletUsd ? 1 : -1))[0];
    if (byWallet && byWallet.walletUsd > 0n) return byWallet.asset.id;
    return market.best?.reserve.assetId;
  }, [summaries, market.best]);
  const assetId = pickedAsset ?? defaultAssetId;
  const asset = assetId ? ASSET_BY_ID.get(assetId) : undefined;

  // Networks for this asset: reserves that answered. Blocked ones stay listed (withdraw only,
  // supply cap reached) but cannot be picked unless the user holds a balance there.
  const options = useMemo(() => {
    if (!asset) return [];
    const keys = new Set(asset.reserves.map((r) => r.key));
    return market.reserves
      .filter((s) => keys.has(s.reserve.key))
      .sort(
        (a, b) =>
          Number(b.canSupply) - Number(a.canSupply) ||
          Number((b.balance ?? 0n) > 0n) - Number((a.balance ?? 0n) > 0n) ||
          b.apy - a.apy,
      );
  }, [asset, market.reserves]);
  const isUsable = (s: ReserveState) => s.canSupply || (s.balance ?? 0n) > 0n;

  const largestHere = [...options].sort((a, b) => Number(toUsd6(b.balance ?? 0n, b.reserve.decimals, b.priceE8) - toUsd6(a.balance ?? 0n, a.reserve.decimals, a.priceE8)))[0];
  const walletHere = [...options].sort((a, b) => Number(toUsd6(b.walletBalance ?? 0n, b.reserve.decimals, b.priceE8) - toUsd6(a.walletBalance ?? 0n, a.reserve.decimals, a.priceE8)))[0];
  const defaultState =
    ((largestHere?.balance ?? 0n) > 0n ? largestHere : undefined) ??
    ((walletHere?.walletBalance ?? 0n) > 0n && walletHere?.canSupply ? walletHere : undefined) ??
    options.find((s) => s.canSupply) ??
    options[0];
  // Once a network is picked or locked in, never fall back to another one if it drops out of a poll.
  const state = pickedKey ? options.find((s) => s.reserve.key === pickedKey) : defaultState;
  const reserve = state?.reserve;
  const native = !!asset?.native;
  const choice: Choice | undefined = reserve ? { reserve, native } : undefined;
  const wallet = useWalletReserve(choice);

  if (!address) return null;

  const decimals = reserve?.decimals ?? 18;
  const sym = reserve ? symbolLabel(reserve, native) : "";
  const aSym = reserve ? `a${symbolLabel(reserve)}` : "aToken";
  const aBalance = state?.balance;
  const depositAmt = parseUsdc(depositText, decimals);
  const withdrawAmt = parseUsdc(withdrawText, decimals);
  const needsApproval = !native && depositAmt !== undefined && (wallet.allowance ?? 0n) < depositAmt;
  const needsReset =
    needsApproval && (wallet.allowance ?? 0n) > 0n && reserve?.chainId === 1 && reserve.underlying.toLowerCase() === MAINNET_USDT;
  const overBalance = depositAmt !== undefined && wallet.balance !== undefined && depositAmt > wallet.balance;
  const overCap = depositAmt !== undefined && state?.headroom !== undefined && depositAmt > state.headroom;
  const lowGas = native && depositAmt !== undefined && wallet.maxSpend !== undefined && depositAmt > wallet.maxSpend && !overBalance;
  const overWithdraw = withdrawAmt !== undefined && aBalance !== undefined && withdrawAmt > aBalance;
  const wrongChain = !!reserve && walletChainId !== reserve.chainId;
  const gatewayAllowance = wallet.gatewayAllowance ?? 0n;

  const pickAsset = (id: string) => {
    setPickedAsset(id);
    setPickedKey(undefined);
    setDepositText("");
    setWithdrawText("");
  };
  const pickNetwork = (key: string) => {
    setPickedKey(key);
    setDepositText("");
    setWithdrawText("");
  };
  // Lock in the defaults, so a rate re-rank can't move the user between Approve and Stake.
  const lockIn = () => {
    if (!pickedAsset && assetId) setPickedAsset(assetId);
    if (!pickedKey && reserve) setPickedKey(reserve.key);
  };

  const onDeposit = () => {
    if (!depositAmt || !reserve || !state?.canSupply) return;
    lockIn();
    const target = { chainId: reserve.chainId, reserveKey: reserve.key };
    if (native) {
      if (!reserve.gateway) return;
      const gateway = reserve.gateway;
      // ETH goes in as msg.value; the gateway wraps it and supplies WETH on our behalf.
      depositTx.run(target, (write) =>
        write({
          address: gateway,
          abi: gatewayAbi,
          functionName: "depositETH",
          args: [reserve.pool, address, 0],
          value: depositAmt,
          chainId: reserve.chainId,
        }),
      );
      return;
    }
    depositTx.run({ ...target, approval: needsApproval }, (write) =>
      needsApproval
        ? write({
            address: reserve.underlying,
            abi: erc20Abi,
            functionName: "approve",
            args: [reserve.pool, needsReset ? 0n : depositAmt],
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

  /** Native withdrawals pull the aToken through the gateway, so it needs an allowance first. */
  const nativeApprovalFor = (amount: bigint | "all") => {
    if (amount === "all") return (aBalance ?? 0n) + (aBalance ?? 0n) / 1000n + 1n; // 0.1% headroom: interest accrues before the tx lands
    return amount;
  };
  const withdrawNeedsApproval = (amount: bigint | "all") =>
    native && gatewayAllowance < (amount === "all" ? (aBalance ?? 0n) + (aBalance ?? 0n) / 1000n : amount);

  const withdraw = (amount: bigint | "all") => {
    if (!reserve) return;
    lockIn();
    const target = { chainId: reserve.chainId, reserveKey: reserve.key };
    const value = amount === "all" ? maxUint256 : amount;
    if (native) {
      const gateway = reserve.gateway;
      if (!gateway) return;
      withdrawTx.run({ ...target, approval: withdrawNeedsApproval(amount) }, (write) =>
        withdrawNeedsApproval(amount)
          ? write({
              address: reserve.aToken,
              abi: erc20Abi,
              functionName: "approve",
              args: [gateway, nativeApprovalFor(amount)],
              chainId: reserve.chainId,
            })
          : write({
              address: gateway,
              abi: gatewayAbi,
              functionName: "withdrawETH",
              args: [reserve.pool, value, address],
              chainId: reserve.chainId,
            }),
      );
      return;
    }
    withdrawTx.run(target, (write) =>
      write({
        address: reserve.pool,
        abi: poolAbi,
        functionName: "withdraw",
        args: [reserve.underlying, value, address],
        chainId: reserve.chainId,
      }),
    );
  };

  const maxDeposit = () => {
    if (wallet.maxSpend === undefined) return;
    let max = wallet.maxSpend;
    if (state?.headroom !== undefined && state.headroom < max) max = state.headroom;
    setDepositText(formatUnits(max, decimals));
  };

  return (
    <div className="space-y-4">
      <Card title="Asset">
        <AssetPicker summaries={summaries} value={assetId} onChange={pickAsset} loading={market.isLoading} />
        {market.userFailed.length > 0 && (
          <p className="mt-2 text-xs text-muted">Couldn&apos;t read your balances on {market.userFailed.join(", ")}.</p>
        )}
      </Card>

      <Card title="Network">
        <label htmlFor="reserve-pick" className="sr-only">
          Network
        </label>
        <select
          id="reserve-pick"
          value={pickedKey ?? reserve?.key ?? ""}
          onChange={(e) => pickNetwork(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base"
        >
          {pickedKey && !state && (
            <option value={pickedKey} disabled>
              {(() => {
                const r = getReserve(pickedKey);
                return r ? `${networkLabel(r)} · ${symbolLabel(r, native)}` : pickedKey;
              })()}{" "}
              · can&apos;t reach right now
            </option>
          )}
          {options.length === 0 && <option value="">{market.isLoading ? "Loading networks…" : "No network has this asset"}</option>}
          {options.map((s) => (
            <option key={s.reserve.key} value={s.reserve.key} disabled={!isUsable(s)}>
              {networkLabel(s.reserve)} · {symbolLabel(s.reserve, native)} ·{" "}
              {s.supplyBlock ? BLOCK_TEXT[s.supplyBlock] : fmtPct(s.apy)}
              {(s.balance ?? 0n) > 0n ? ` · you: ${fmtUsd6(toUsd6(s.balance!, s.reserve.decimals, s.priceE8))}` : ""}
            </option>
          ))}
        </select>
        {market.isLoading && options.length > 0 && <p className="mt-2 text-xs text-muted">Loading networks…</p>}
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
        {state && state.supplyBlock === "cap" && (
          <div className="mt-3">
            <Notice tone="warn">
              Supply cap reached: Aave isn&apos;t taking more {symbolLabel(state.reserve)} on this network right now. You
              can still withdraw what you have.
            </Notice>
          </div>
        )}
        {state && state.supplyBlock && state.supplyBlock !== "cap" && (
          <div className="mt-3">
            <Notice tone="warn">
              Aave has closed this reserve to new deposits ({BLOCK_TEXT[state.supplyBlock]}). You can still withdraw what
              you have here{state.supplyBlock === "paused" || state.supplyBlock === "inactive" ? ", once Aave re-opens it" : ""}.
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
          {native ? (
            <>
              Your {sym} goes into Aave v3 ({networkLabel(reserve)}) through Aave&apos;s own gateway, which wraps it to{" "}
              {symbolLabel(reserve)}. You hold {aSym} in your own wallet; Zaave never touches your funds.
            </>
          ) : (
            <>
              Your {sym} goes straight into Aave v3 ({networkLabel(reserve)}). You hold {aSym} in your own wallet; Zaave
              never touches your funds.
            </>
          )}
        </Notice>
      )}

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label={`Your ${aSym}`}
            value={fmtToken(aBalance, decimals)}
            hint={
              <>
                {state && aBalance !== undefined ? `${fmtUsd6(toUsd6(aBalance, decimals, state.priceE8))} · ` : ""}
                {state ? `earning ${fmtPct(state.apy)}` : "earning interest in Aave"}
              </>
            }
          />
          <Stat
            label={`Wallet ${sym}`}
            value={fmtToken(wallet.balance, decimals)}
            hint={state && wallet.balance !== undefined ? fmtUsd6(toUsd6(wallet.balance, decimals, state.priceE8)) : reserve ? symbolLabel(reserve, native) : undefined}
          />
        </div>
      </Card>

      <Card title={`Stake ${sym}`}>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`${sym} amount to stake`}
            value={depositText}
            onChange={(e) => setDepositText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button variant="ghost" onClick={maxDeposit}>
            Max
          </Button>
        </div>
        <Button
          className="mt-3 w-full"
          disabled={!depositAmt || depositTx.busy || overBalance || overCap || !state?.canSupply}
          onClick={onDeposit}
        >
          {needsReset ? `1. Reset ${sym} approval` : needsApproval ? `1. Approve ${sym}` : "Stake"}
        </Button>
        {needsApproval && (
          <p className="mt-2 text-xs text-muted">
            Approves exactly this amount for the Aave Pool, then press again to stake.
          </p>
        )}
        {native && <p className="mt-2 text-xs text-muted">No approval needed: {sym} is sent with the transaction.</p>}
        {state?.headroom !== undefined && state.canSupply && (
          <p className="mt-2 text-xs text-muted">
            Aave&apos;s supply cap leaves room for about {fmtToken(state.headroom, decimals, 4)} {symbolLabel(state.reserve)} more.
          </p>
        )}
        {overBalance && <p className="mt-2 text-sm text-tomato">That&apos;s more than your wallet balance.</p>}
        {overCap && <p className="mt-2 text-sm text-tomato">That&apos;s over what Aave&apos;s supply cap still allows.</p>}
        {lowGas && <p className="mt-2 text-sm text-muted">Leave some {sym} in your wallet to pay for gas.</p>}
        <TxStatus tx={depositTx} />
        {reserve?.chainId === 84532 && (
          <div className="mt-3">
            <Notice>Testnet: get Aave test tokens from the Aave faucet (app.aave.com, testnet mode, Base Sepolia).</Notice>
          </div>
        )}
      </Card>

      <Card title="Withdraw">
        <p className="mb-3 text-sm text-muted">
          Your {aSym} is yours. Withdraw back to {sym} any time (subject to pool liquidity).
        </p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`${sym} amount to withdraw`}
            value={withdrawText}
            onChange={(e) => setWithdrawText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button
            disabled={!withdrawAmt || overWithdraw || withdrawTx.busy || !state?.canWithdraw}
            onClick={() => withdrawAmt && withdraw(withdrawAmt)}
          >
            {withdrawAmt && withdrawNeedsApproval(withdrawAmt) ? "1. Approve" : "Withdraw"}
          </Button>
        </div>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          disabled={!aBalance || withdrawTx.busy || !state?.canWithdraw}
          onClick={() => withdraw("all")}
        >
          {withdrawNeedsApproval("all") && aBalance ? `1. Approve ${aSym}, then withdraw all` : "Withdraw all"}
        </Button>
        {native && (
          <p className="mt-2 text-xs text-muted">
            Withdrawing {sym} goes through Aave&apos;s gateway: first approve {aSym} to it, then press again to withdraw.
          </p>
        )}
        {overWithdraw && <p className="mt-2 text-sm text-tomato">That&apos;s more than your {aSym} balance.</p>}
        <TxStatus tx={withdrawTx} />
      </Card>
    </div>
  );
}
