// On-chain sanity check of src/lib/markets.generated.ts over public RPCs.
// Run: node scripts/verify-markets.mjs [chainId ...]
// For every reserve: aToken.UNDERLYING_ASSET_ADDRESS() == underlying, aToken.POOL() == pool,
// underlying.decimals() == configured decimals, and prints name/symbol plus the reserve flags
// (active / frozen / paused) and supply APY so bridged labels can be eyeballed.
import { createPublicClient, http, parseAbi } from "viem";
import { MAINNET_MARKETS } from "../src/lib/markets.generated.ts";
import { PUBLIC_RPC } from "../src/lib/rpc-defaults.ts";

const abi = parseAbi([
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
  "function POOL() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);
const poolAbi = parseAbi([
  "function getReserveData(address) view returns ((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))",
]);

const only = process.argv.slice(2).map(Number);
let bad = 0;
for (const m of MAINNET_MARKETS) {
  if (only.length && !only.includes(m.chainId)) continue;
  const client = createPublicClient({ transport: http(PUBLIC_RPC[m.chainId]), batch: { multicall: false } });
  for (const r of m.reserves) {
    const tag = `${m.chainName}/${m.marketName}/${r.symbol}`;
    try {
      const [u, p, dec, sym, nm, rd] = await Promise.all([
        client.readContract({ address: r.aToken, abi, functionName: "UNDERLYING_ASSET_ADDRESS" }),
        client.readContract({ address: r.aToken, abi, functionName: "POOL" }),
        client.readContract({ address: r.underlying, abi, functionName: "decimals" }),
        client.readContract({ address: r.underlying, abi, functionName: "symbol" }),
        client.readContract({ address: r.underlying, abi, functionName: "name" }),
        client.readContract({ address: m.pool, abi: poolAbi, functionName: "getReserveData", args: [r.underlying] }),
      ]);
      const cfg = rd.configuration;
      const cfgDec = Number((cfg >> 48n) & 0xffn);
      const flags = `active=${(cfg >> 56n) & 1n} frozen=${(cfg >> 57n) & 1n} paused=${(cfg >> 60n) & 1n}`;
      const ok =
        u.toLowerCase() === r.underlying.toLowerCase() &&
        p.toLowerCase() === m.pool.toLowerCase() &&
        rd.aTokenAddress.toLowerCase() === r.aToken.toLowerCase() &&
        dec === r.decimals &&
        cfgDec === r.decimals;
      if (!ok) bad++;
      console.log(`${ok ? "OK  " : "FAIL"} ${tag} dec=${dec} "${nm}" (${sym}) ${flags} liqRate=${rd.currentLiquidityRate}`);
    } catch (e) {
      bad++;
      console.log(`ERR  ${tag}: ${String(e.shortMessage ?? e.message).slice(0, 120)}`);
    }
  }
}
console.log(bad ? `${bad} problem(s)` : "all good");
process.exit(bad ? 1 : 0);
