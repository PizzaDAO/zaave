import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { BASE, BASE_SEPOLIA, CHAINS, getDefaultChainId } from "./addresses";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
const appName = "Zaave";

// Default chain goes first so it is used when no wallet is connected.
const chains = getDefaultChainId() === BASE ? ([base, baseSepolia] as const) : ([baseSepolia, base] as const);
const transports = {
  [base.id]: http(CHAINS[BASE].rpcUrl),
  [baseSepolia.id]: http(CHAINS[BASE_SEPOLIA].rpcUrl),
};

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
