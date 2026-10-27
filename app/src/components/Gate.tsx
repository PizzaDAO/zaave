"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { Card } from "./ui";

/** Renders children only when a wallet is connected. Pages switch the wallet's network per action. */
export function Gate({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <Card title="Connect your wallet">
        <p className="mb-4 text-sm text-muted">Connect a wallet to continue. Zaave works on every Aave v3 network with USDC.</p>
        <ConnectButton />
      </Card>
    );
  }
  return <>{children}</>;
}
