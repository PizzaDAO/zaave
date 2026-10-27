// Exercises the app's cross-chain read path (the same call list and parsing the hooks use) in node.
// Run: pnpm dlx tsx scripts/check-reads.mts [0xUser ...]
// Prints per-chain reachability, the best rate, and each user's positions with interest, using
// Aave's history API where it answers (same logic as usePortfolio, minus React).
import { createConfig, http } from "wagmi";
import { readContracts } from "wagmi/actions";
import type { Address, Chain } from "viem";
import { fetchMarketHistory, interestFromHistory, interestSinceLastAction } from "../src/lib/interest";
import { buildMarketContracts, parseMarketRows, unreachableChains } from "../src/lib/market-reads";
import { CHAINS, chainName, networkLabel, RESERVES, rpcUrl, symbolLabel } from "../src/lib/markets";
import { toUsdc6 } from "../src/lib/pizza";
import { formatUnits } from "viem";

const chains = CHAINS as unknown as readonly [Chain, ...Chain[]];
const config = createConfig({
  chains,
  transports: Object.fromEntries(chains.map((c) => [c.id, http(rpcUrl(c.id), { batch: true })])),
});

const users = process.argv.slice(2) as Address[];
const t0 = Date.now();
for (const user of [undefined, ...users]) {
  const contracts = buildMarketContracts(user);
  const data = await readContracts(config, { contracts: contracts as never, allowFailure: true });
  const reserves = parseMarketRows(data as never, user);
  console.log(`\n=== ${user ?? "no wallet (rates only)"}: ${contracts.length} calls in ${Date.now() - t0}ms total`);
  console.log("unreachable chains:", unreachableChains(reserves, chainName).join(", ") || "none");
  const ranked = reserves.filter((s) => s.canSupply && s.apy !== undefined).sort((a, b) => b.apy! - a.apy!);
  if (!user) {
    console.log("rates (supply-open reserves):");
    for (const s of ranked) console.log(`  ${(s.apy! * 100).toFixed(2).padStart(6)}%  ${networkLabel(s.reserve)} ${symbolLabel(s.reserve)}`);
    console.log("withdraw-only (frozen):", reserves.filter((s) => s.reachable && !s.canSupply).map((s) => `${networkLabel(s.reserve)} ${s.reserve.symbol}`).join(", "));
    continue;
  }
  let total6 = 0n;
  for (const s of reserves.filter((s) => (s.balance ?? 0n) > 0n)) {
    const r = s.reserve;
    let basis = "sinceLastAction";
    let interest = interestSinceLastAction(s.balance!, s.scaledBalance!, s.previousIndex!);
    try {
      const h = await fetchMarketHistory({
        market: r.pool,
        user,
        chainId: r.chainId,
        decimals: Object.fromEntries(RESERVES.filter((x) => x.marketId === r.marketId).map((x) => [x.underlying.toLowerCase(), x.decimals])),
      });
      const ev = h[r.underlying.toLowerCase()];
      if (ev?.length) {
        interest = interestFromHistory(s.balance!, ev).interest;
        basis = `allTime (${ev.length} events)`;
      }
    } catch (e) {
      basis += ` [history failed: ${(e as Error).message}]`;
    }
    total6 += toUsdc6(s.balance!, r.decimals);
    console.log(
      `  ${networkLabel(r)} ${symbolLabel(r)}: balance ${formatUnits(s.balance!, r.decimals)} interest ${formatUnits(interest, r.decimals)} apy ${((s.apy ?? 0) * 100).toFixed(2)}% basis ${basis}`,
    );
  }
  console.log(`  TOTAL (6-dec normalized): ${formatUnits(total6, 6)}`);
}
