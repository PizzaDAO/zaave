import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { BASE, BASE_SEPOLIA, CHAINS, type SupportedChainId } from "./addresses";
import { rayAprToApy } from "./pizza";

const reserveAbi = [
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "configuration", type: "uint256" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
      },
    ],
  },
] as const;

/** Live Aave v3 USDC supply APY (fraction, e.g. 0.041) for the given chain, via public RPC. */
export async function fetchAaveUsdcApy(chainId: SupportedChainId = BASE): Promise<number> {
  const cfg = CHAINS[chainId];
  const client = createPublicClient({
    chain: chainId === BASE_SEPOLIA ? baseSepolia : base,
    transport: http(cfg.rpcUrl),
  });
  const data = await client.readContract({
    address: cfg.aavePool,
    abi: reserveAbi,
    functionName: "getReserveData",
    args: [cfg.usdc],
  });
  return rayAprToApy(data.currentLiquidityRate);
}
