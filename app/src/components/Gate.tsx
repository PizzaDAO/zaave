"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { getChainConfig, getDefaultChainId } from "@/lib/addresses";
import { useZaaveChain } from "@/lib/hooks";
import { Button, Card, Notice } from "./ui";

/** Renders children only when a wallet is connected on a chain with a live Zaave contract. */
export function Gate({ children }: { children: ReactNode }) {
  const { cfg, status } = useZaaveChain();
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  if (status === "unconfigured" || status === "notDeployed") {
    return (
      <Card title="Not deployed here yet">
        <Notice tone="warn">
          Zaave isn&apos;t deployed on {cfg.name} yet
          {status === "unconfigured" ? " (no contract address configured)" : " (nothing at the configured address)"}. The
          pizza calculator on the home page still works with live Aave rates.
        </Notice>
      </Card>
    );
  }
  if (!isConnected) {
    return (
      <Card title="Connect your wallet">
        <p className="mb-4 text-sm text-muted">Connect a wallet on {cfg.name} to continue.</p>
        <ConnectButton />
      </Card>
    );
  }
  if (!getChainConfig(chainId)) {
    const target = getDefaultChainId();
    return (
      <Card title="Wrong network">
        <p className="mb-4 text-sm text-muted">Zaave runs on Base. Switch networks to continue.</p>
        <Button onClick={() => switchChain({ chainId: target })}>Switch to {getChainConfig(target)?.name}</Button>
      </Card>
    );
  }
  if (status === "checking") return <Card>Checking contract…</Card>;
  return <>{children}</>;
}
