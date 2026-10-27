import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { BASE, getDefaultChainId, CHAINS } from "@/lib/addresses";
import { zaaveAbi } from "@/lib/zaaveAbi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const chainId = getDefaultChainId();
  const cfg = CHAINS[chainId];
  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!key || !cfg.zaave) {
    return NextResponse.json({ ok: true, noop: true, reason: "KEEPER_PRIVATE_KEY or Zaave address not set" });
  }

  const chain = chainId === BASE ? base : baseSepolia;
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const [nextAt, block] = await Promise.all([
    publicClient.readContract({ address: cfg.zaave, abi: zaaveAbi, functionName: "nextZaDayAt" }),
    publicClient.getBlock(),
  ]);
  if (block.timestamp < nextAt) {
    return NextResponse.json({ ok: true, noop: true, reason: "not yet Za Day", nextZaDayAt: nextAt.toString() });
  }

  const account = privateKeyToAccount(key.startsWith("0x") ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`));
  const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
  const hash = await wallet.writeContract({ address: cfg.zaave, abi: zaaveAbi, functionName: "zaDay" });
  return NextResponse.json({ ok: true, hash, chainId });
}
