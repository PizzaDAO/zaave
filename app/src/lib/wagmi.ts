import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import type { Chain, Transport } from "viem";
import { createConfig, http } from "wagmi";
import { CHAINS, rpcUrl } from "./markets";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
const appName = "Zaave";

// Every chain with an Aave v3 USDC market. The first chain is used when no wallet is connected.
const chains = CHAINS as unknown as readonly [Chain, ...Chain[]];
const transports: Record<number, Transport> = Object.fromEntries(
  chains.map((c) => [c.id, http(rpcUrl(c.id), { batch: true })]),
);

// With a WalletConnect project id: full RainbowKit wallet list. Without: injected wallets only.
export const wagmiConfig = projectId
  ? getDefaultConfig({ appName, projectId, chains, transports, ssr: true })
  : createConfig({
      chains,
      transports,
      ssr: true,
      connectors: connectorsForWallets([{ groupName: "Wallets", wallets: [injectedWallet] }], {
        appName,
        projectId: "none",
      }),
    });
