"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { getChainConfig, getDefaultChainId } from "@/lib/addresses";
import { useAaveChain } from "@/lib/hooks";
import { Button, Card } from "./ui";

/** Renders children only when a wallet is connected on a supported chain. */
export function Gate({ children }: { children: ReactNode }) {
  const { cfg } = useAaveChain();
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

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
  return <>{children}</>;
}
