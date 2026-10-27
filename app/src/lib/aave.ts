import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { poolAbi } from "./abis";
import { BASE, BASE_SEPOLIA, CHAINS, type SupportedChainId } from "./addresses";
import { rayAprToApy } from "./pizza";

/** Live Aave v3 USDC supply APY (fraction, e.g. 0.041) for the given chain, via public RPC. */
export async function fetchAaveUsdcApy(chainId: SupportedChainId = BASE): Promise<number> {
  const cfg = CHAINS[chainId];
  const client = createPublicClient({
    chain: chainId === BASE_SEPOLIA ? baseSepolia : base,
    transport: http(cfg.rpcUrl),
  });
  const data = await client.readContract({
    address: cfg.aavePool,
    abi: poolAbi,
    functionName: "getReserveData",
    args: [cfg.usdc],
  });
  return rayAprToApy(data.currentLiquidityRate);
}
