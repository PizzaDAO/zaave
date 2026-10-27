"use client";

import { useState } from "react";
import { zeroAddress } from "viem";
import { fmtUsdc, parseUsdc } from "@/lib/format";
import { useTx, useZaaveChain, useZaaveData } from "@/lib/hooks";
import { zaaveAbi } from "@/lib/zaaveAbi";
import { Button, Card, Notice, TxStatus } from "./ui";

export function RedeemPanel() {
  const { chainId, zaave } = useZaaveChain();
  const d = useZaaveData();
  const cashTx = useTx();
  const giftTx = useTx();
  const [cashText, setCashText] = useState("");
  const [giftText, setGiftText] = useState("");
  const [email, setEmail] = useState("");

  if (!zaave) return null;
  // Contract harvests before redeeming, so claimable yield is spendable too.
  const available = (d.credit ?? 0n) + (d.claimableYield ?? 0n);
  const cashAmt = parseUsdc(cashText);
  const giftAmt = parseUsdc(giftText);
  const giftEnabled = !!d.fulfillment && d.fulfillment !== zeroAddress;

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-xs uppercase tracking-wide text-muted">Available to redeem</div>
        <div className="text-3xl font-extrabold">${fmtUsdc(available)}</div>
      </Card>

      <Card title="Cash out USDC">
        <p className="mb-3 text-sm text-muted">Take your pizza money as USDC and buy your own pie.</p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={cashText}
            onChange={(e) => setCashText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg"
          />
          <Button variant="ghost" onClick={() => setCashText((Number(available) / 1e6).toString())}>
            Max
          </Button>
        </div>
        <Button
          className="mt-3 w-full"
          disabled={!cashAmt || cashAmt > available || cashTx.busy}
          onClick={() =>
            cashAmt && cashTx.run((write) => write({ address: zaave, abi: zaaveAbi, functionName: "cashOut", args: [cashAmt], chainId }))
          }
        >
          Cash out
        </Button>
        <TxStatus tx={cashTx} />
      </Card>

      <Card title="DoorDash gift card">
        {!giftEnabled ? (
          <Notice>DoorDash gift cards: coming soon. Cash out USDC in the meantime.</Notice>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              Redeem credit for a DoorDash gift card. Fulfillment backend is still TBD, so the email below is not stored
              anywhere yet.
            </p>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-lg"
            />
            <input
              inputMode="decimal"
              placeholder="Amount in USDC"
              value={giftText}
              onChange={(e) => setGiftText(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-lg"
            />
            <Button
              className="mt-3 w-full"
              disabled={!giftAmt || giftAmt > available || !email.includes("@") || giftTx.busy}
              onClick={() =>
                giftAmt &&
                giftTx.run((write) => write({ address: zaave, abi: zaaveAbi, functionName: "redeemForGiftCard", args: [giftAmt], chainId }))
              }
            >
              Redeem for gift card
            </Button>
            <TxStatus tx={giftTx} />
          </>
        )}
      </Card>
    </div>
  );
}
