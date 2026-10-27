// Exercises the app's cross-chain read path (the same readMarket() the hooks use) in node.
// Run: pnpm dlx tsx scripts/check-reads.mts [0xUser ...]
// Without a wallet: per-market reachability, reserve counts, rates and oracle prices.
// With wallets: every non-zero position, with interest from Aave's history API where it
// answers (same logic as usePortfolio, minus React), else the on-chain since-last-action figure.
import { createPublicClient, formatUnits, http, type Address } from "viem";
import { fetchMarketHistory, interestFromHistory, interestSinceLastAction } from "../src/lib/interest";
import { readMarket, type MarketState } from "../src/lib/market-reads";
import { CHAINS, isStable, MARKETS, networkLabel, rpcUrl, symbolLabel } from "../src/lib/markets";
import { toUsd6 } from "../src/lib/pizza";

const clients = new Map(CHAINS.map((c) => [c.id, createPublicClient({ chain: c, transport: http(rpcUrl(c.id), { batch: true }) })]));
const readerFor = (chainId: number) => {
  const client = clients.get(chainId)!;
  return (args: unknown) => client.readContract(args as never);
};

async function readAll(user: Address | undefined): Promise<MarketState[]> {
  return Promise.all(MARKETS.map((m) => readMarket(readerFor(m.chainId), m, user)));
}

const users = process.argv.slice(2) as Address[];
const usd = (v: bigint) => formatUnits(v, 6);

const t0 = Date.now();
const rates = await readAll(undefined);
console.log(`=== no wallet (rates only): ${MARKETS.length} markets read in ${Date.now() - t0}ms`);
console.log("market           reachable  reserves  ignored  open   capped  frozen/paused  top APY (open reserves)");
let totalReserves = 0;
for (const ms of rates) {
  const open = ms.reserves.filter((s) => s.canSupply);
  const top = [...open].sort((a, b) => b.apy - a.apy)[0];
  totalReserves += ms.reserves.length;
  console.log(
    `${ms.market.id.padEnd(16)} ${String(ms.reachable).padEnd(9)}  ${String(ms.reserves.length).padStart(8)}  ${String(ms.ignored).padStart(7)}  ${String(open.length).padStart(4)}  ${String(ms.reserves.filter((s) => s.supplyBlock === "cap").length).padStart(6)}  ${String(ms.reserves.filter((s) => s.supplyBlock && s.supplyBlock !== "cap").length).padStart(13)}  ${top ? `${(top.apy * 100).toFixed(2)}% ${symbolLabel(top.reserve)}` : "-"}`,
  );
}
console.log(`total reserves with live data: ${totalReserves}`);
console.log("unreachable:", rates.filter((m) => !m.reachable).map((m) => m.market.id).join(", ") || "none");

const all = rates.flatMap((m) => m.reserves);
console.log("\nbest open stablecoin rates (>= $1M liquidity):");
for (const s of all
  .filter((s) => s.canSupply && isStable(s.reserve) && toUsd6(s.available, s.reserve.decimals, s.priceE8) >= 1_000_000_000_000n)
  .sort((a, b) => b.apy - a.apy)
  .slice(0, 6)) {
  console.log(`  ${(s.apy * 100).toFixed(2).padStart(6)}%  ${networkLabel(s.reserve)} ${symbolLabel(s.reserve)}  price $${formatUnits(s.priceE8, 8)}  liquidity $${Math.round(Number(usd(toUsd6(s.available, s.reserve.decimals, s.priceE8))))}`);
}
console.log("\noracle price samples:");
for (const sym of ["WETH", "WBTC", "wstETH", "USDC", "USDT", "DAI", "AAVE", "WBNB", "WAVAX", "WPOL", "WXDAI", "wS", "WMNT", "WXPL", "CELO", "Metis"]) {
  const s = all.find((x) => x.reserve.symbol === sym);
  if (s) console.log(`  ${sym.padEnd(7)} $${Number(formatUnits(s.priceE8, 8)).toFixed(4)}  (${networkLabel(s.reserve)})`);
}
console.log("\nsupply-cap reached / blocked reserves (first 12):");
for (const s of all.filter((s) => s.supplyBlock).slice(0, 12)) {
  console.log(`  ${networkLabel(s.reserve)} ${symbolLabel(s.reserve)}: ${s.supplyBlock}${s.headroom !== undefined ? ` headroom ${formatUnits(s.headroom, s.reserve.decimals)}` : ""}`);
}

for (const user of users) {
  const t1 = Date.now();
  const states = await readAll(user);
  console.log(`\n=== ${user}: ${MARKETS.length} markets read in ${Date.now() - t1}ms`);
  console.log("user read failed on:", states.filter((m) => m.reachable && !m.userOk).map((m) => m.market.id).join(", ") || "none");
  let totalUsd = 0n;
  let interestUsd = 0n;
  for (const ms of states) {
    const held = ms.reserves.filter((s) => (s.balance ?? 0n) > 0n);
    if (held.length === 0) continue;
    let hist: Record<string, { kind: "supply" | "withdraw"; amount: bigint; timestamp: number }[]> | undefined;
    let histErr = "";
    if (held.some((s) => s.reserve.aaveApi)) {
      try {
        hist = await fetchMarketHistory({
          market: ms.market.pool,
          user,
          chainId: ms.market.chainId,
          decimals: Object.fromEntries(ms.reserves.map((x) => [x.reserve.underlying.toLowerCase(), x.reserve.decimals])),
        });
      } catch (e) {
        histErr = ` [history failed: ${(e as Error).message}]`;
      }
    }
    for (const s of held) {
      const r = s.reserve;
      let basis = "sinceLastAction";
      let interest =
        s.scaledBalance !== undefined && s.previousIndex !== undefined ? interestSinceLastAction(s.balance!, s.scaledBalance, s.previousIndex) : 0n;
      const ev = hist?.[r.underlying.toLowerCase()];
      if (ev?.length) {
        interest = interestFromHistory(s.balance!, ev).interest;
        basis = `allTime (${ev.length} events)`;
      }
      const balUsd = toUsd6(s.balance!, r.decimals, s.priceE8);
      const intUsd = toUsd6(interest, r.decimals, s.priceE8);
      totalUsd += balUsd;
      interestUsd += intUsd;
      console.log(
        `  ${networkLabel(r)} ${symbolLabel(r)}: balance ${formatUnits(s.balance!, r.decimals)} ($${Number(usd(balUsd)).toFixed(2)}) interest ${formatUnits(interest, r.decimals)} ($${Number(usd(intUsd)).toFixed(4)}) apy ${(s.apy * 100).toFixed(2)}% price $${formatUnits(s.priceE8, 8)} basis ${basis}${histErr}`,
      );
    }
    const w = ms.reserves.filter((s) => (s.walletBalance ?? 0n) > 0n);
    if (w.length) console.log(`    wallet on ${ms.market.id}: ${w.map((s) => `${formatUnits(s.walletBalance!, s.reserve.decimals)} ${s.reserve.symbol}`).join(", ")}`);
  }
  console.log(`  TOTAL: $${Number(usd(totalUsd)).toFixed(2)} supplied, $${Number(usd(interestUsd)).toFixed(4)} interest`);
}
