// Default public RPC per chain. Reads are batched into one multicall per chain, so the load is
// small, but public endpoints can still be flaky: override any of them with NEXT_PUBLIC_RPC_<chainId>
// (see rpc.ts). Plain data with no env access so the node scripts can import it too.
export const PUBLIC_RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  56: "https://bsc-rpc.publicnode.com",
  100: "https://gnosis-rpc.publicnode.com",
  137: "https://polygon-bor-rpc.publicnode.com",
  146: "https://rpc.soniclabs.com",
  324: "https://mainnet.era.zksync.io",
  1088: "https://andromeda.metis.io/?owner=1088",
  1868: "https://rpc.soneium.org",
  4326: "https://mainnet.megaeth.com/rpc",
  5000: "https://rpc.mantle.xyz",
  8453: "https://mainnet.base.org",
  9745: "https://rpc.plasma.to",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  42220: "https://forno.celo.org",
  43114: "https://avalanche-c-chain-rpc.publicnode.com",
  57073: "https://rpc-gel.inkonchain.com",
  59144: "https://rpc.linea.build",
  534352: "https://rpc.scroll.io",
  84532: "https://sepolia.base.org",
};
