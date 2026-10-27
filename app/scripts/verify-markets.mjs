// On-chain sanity check of src/lib/markets.generated.ts over public RPCs.
// Run: node scripts/verify-markets.mjs [-v] [chainId ...]
// Per reserve: aToken.UNDERLYING_ASSET_ADDRESS() == underlying, aToken.POOL() == pool,
//   underlying.decimals() == configured decimals, and the pool's getReserveData agrees on aToken
//   and decimals. Also prints on-chain symbol vs configured symbol (info only).
// Per market: UiPoolDataProvider.getReservesData decodes with our ABI; for every static reserve
//   its liquidity rate and active/frozen/paused flags equal the pool's getReserveData (same block
//   modulo a few seconds), and its aToken/decimals equal the static config. If the market has a
//   gateway: gateway.WETH() == wrappedNative reserve underlying and gateway.POOL() == pool.
// Prints a summary line per market (full lines with -v) and exits non-zero on any problem.
import { createPublicClient, http, parseAbi } from "viem";
import { MAINNET_MARKETS } from "../src/lib/markets.generated.ts";
import { PUBLIC_RPC } from "../src/lib/rpc-defaults.ts";
import { uiPoolDataProviderAbi } from "../src/lib/abis.ts";

const abi = parseAbi([
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
  "function POOL() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function WETH() view returns (address)",
]);
const poolAbi = parseAbi([
  "function getReserveData(address) view returns ((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))",
]);

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
const eq = (a, b) => a?.toLowerCase() === b?.toLowerCase();
let bad = 0;
let checked = 0;

for (const m of MAINNET_MARKETS) {
  if (only.length && !only.includes(m.chainId)) continue;
  const client = createPublicClient({ transport: http(process.env[`RPC_${m.chainId}`] ?? PUBLIC_RPC[m.chainId]), batch: { multicall: false } });
  const problems = [];
  const notes = [];
  const read = (address, a, functionName, fnArgs) => client.readContract({ address, abi: a, functionName, args: fnArgs });

  // Static reserves vs on-chain token/pool data.
  // One reserve at a time: several public RPCs (Base, Mantle, Scroll) rate-limit bursts.
  const perReserve = [];
  for (const [symbol, underlying, aToken, decimals] of m.reserves) {
    perReserve.push(
      await (async () => {
      try {
        const [u, p, dec, sym, rd] = await Promise.all([
          read(aToken, abi, "UNDERLYING_ASSET_ADDRESS"),
          read(aToken, abi, "POOL"),
          read(underlying, abi, "decimals"),
          read(underlying, abi, "symbol").catch(() => "?"),
          read(m.pool, poolAbi, "getReserveData", [underlying]),
        ]);
        const cfgDec = Number((rd.configuration >> 48n) & 0xffn);
        const ok = eq(u, underlying) && eq(p, m.pool) && eq(rd.aTokenAddress, aToken) && dec === decimals && cfgDec === decimals;
        if (!ok) problems.push(`${symbol}: aToken/underlying/pool/decimals mismatch`);
        if (verbose) console.log(`${ok ? "OK  " : "FAIL"} ${m.id}/${symbol} dec=${dec} on-chain symbol "${sym}"`);
        return { underlying, rd, sym, symbol };
      } catch (e) {
        problems.push(`${symbol}: ${String(e.shortMessage ?? e.message).slice(0, 100)}`);
        return undefined;
      }
      })(),
    );
  }
  checked += m.reserves.length;

  // UiPoolDataProvider vs the pool.
  let uiCount = 0;
  let rateMatches = 0;
  let flagMatches = 0;
  try {
    const [list, base] = await read(m.uiPoolDataProvider, uiPoolDataProviderAbi, "getReservesData", [m.poolAddressesProvider]);
    uiCount = list.length;
    for (const x of perReserve.filter(Boolean)) {
      const p = list.find((y) => eq(y.underlyingAsset, x.underlying));
      if (!p) {
        notes.push(`${x.symbol} not listed by provider (delisted?)`);
        continue;
      }
      const cfg = x.rd.configuration;
      const flags = [(cfg >> 56n) & 1n, (cfg >> 57n) & 1n, (cfg >> 60n) & 1n].map(Boolean);
      if (p.isActive === flags[0] && p.isFrozen === flags[1] && p.isPaused === flags[2]) flagMatches++;
      else problems.push(`${x.symbol}: status flags differ (ui ${p.isActive}/${p.isFrozen}/${p.isPaused} vs pool ${flags})`);
      // rates can tick between two calls: allow 0.5% relative difference
      const a = Number(p.liquidityRate);
      const b = Number(x.rd.currentLiquidityRate);
      if (a === b || Math.abs(a - b) <= Math.max(a, b) * 0.005) rateMatches++;
      else problems.push(`${x.symbol}: liquidityRate differs (ui ${a} vs pool ${b})`);
      if (!eq(p.aTokenAddress, x.rd.aTokenAddress)) problems.push(`${x.symbol}: provider aToken differs`);
    }
    if (base.marketReferenceCurrencyUnit <= 0n || base.marketReferenceCurrencyPriceInUsd <= 0n) problems.push("bad base currency info");
  } catch (e) {
    problems.push(`UiPoolDataProvider: ${String(e.shortMessage ?? e.message).slice(0, 100)}`);
  }

  // Gateway.
  let gw = "no gateway";
  if (m.gateway) {
    try {
      const [weth, pool] = await Promise.all([read(m.gateway, abi, "WETH"), read(m.gateway, abi, "POOL")]);
      const okW = eq(weth, m.wrappedNative);
      const okP = eq(pool, m.pool);
      gw = `gateway WETH()${okW ? "==" : "!="}wrappedNative POOL()${okP ? "==" : "!="}pool`;
      if (!okW || !okP) problems.push(`gateway mismatch (WETH ${weth}, POOL ${pool})`);
      if (!m.reserves.some((r) => eq(r[1], weth))) problems.push("gateway's WETH is not a reserve of this market");
    } catch (e) {
      problems.push(`gateway: ${String(e.shortMessage ?? e.message).slice(0, 100)}`);
    }
  } else if (m.wrappedNative || m.nativeSymbol) problems.push("nativeSymbol set without gateway");

  bad += problems.length;
  console.log(
    `${problems.length ? "FAIL" : "OK  "} ${m.id.padEnd(12)} reserves ${String(m.reserves.length).padStart(2)} | provider lists ${String(uiCount).padStart(2)}, rate match ${rateMatches}, status match ${flagMatches} | ${gw}${notes.length ? ` | ${notes.join("; ")}` : ""}`,
  );
  for (const p of problems) console.log(`      ! ${p}`);
  const odd = perReserve.filter((x) => x && x.sym !== "?" && x.sym.replace(/[^A-Za-z0-9]/g, "").toLowerCase() !== x.symbol.replace(/[^A-Za-z0-9]/g, "").toLowerCase());
  if (odd.length && verbose) console.log(`      symbol differs from address-book key: ${odd.map((x) => `${x.symbol}->${x.sym}`).join(", ")}`);
}
console.log(`${checked} reserves checked;`, bad ? `${bad} problem(s)` : "all good");
process.exit(bad ? 1 : 0);
