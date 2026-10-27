import { Card } from "@/components/ui";
import { ASSETS, MARKETS, networkLabel, RESERVES, symbolLabel } from "@/lib/markets";

export const metadata = { title: "About | Zaave" };

const steps = [
  ["Pick your pizza", "Choose pies per month and what a pie costs near you. The calculator shows the stake it takes."],
  ["Supply crypto", "Pick any asset Aave v3 lets you supply (USDC, ETH, WBTC, wstETH and many more) and a network that lists it. Your tokens are supplied to Aave's pool there from your own wallet, and you receive the matching aToken (aUSDC, aWETH...). Native coins like ETH go in through Aave's own gateway."],
  ["Earn slices", "Your aTokens grow as interest accrues. Interest is valued in USD at Aave's oracle price and becomes slices (8 per pie) on your dashboard."],
  ["Eat", "Cash out just the interest, in the token it was earned in, and buy a pie. Your principal stays in Aave, still earning."],
];

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">How Zaave works</h1>
      <Card>
        <p className="text-sm">
          Zaave is a pizza-themed interface to Aave v3 on every network that has a market. That&apos;s all it is: it
          helps you supply and withdraw on Aave, and shows your interest as pizza. The calculator defaults to the best
          live stablecoin rate across networks (or pick any asset), and the dashboard adds up your positions on all of
          them in USD. Some networks list bridged USDC (like USDC.e), which is a different token from Circle&apos;s
          native USDC and is labelled as such. If you supply something that isn&apos;t a stablecoin, your interest is
          paid in that asset, so its pizza value moves with its price.
        </p>
      </Card>
      <Card>
        <ol className="space-y-4">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tomato font-bold text-white">
                {i + 1}
              </span>
              <div>
                <div className="font-bold">{title}</div>
                <div className="text-sm text-muted">{body}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="The promises">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>There is no Zaave smart contract. You talk directly to Aave&apos;s own contracts.</li>
          <li>You hold the aTokens in your own wallet. Zaave never touches your funds.</li>
          <li>No fee. All the interest Aave pays is yours.</li>
          <li>No token.</li>
          <li>Withdraw any time on Aave itself, even if this site is down.</li>
        </ul>
      </Card>
      <Card title={`Assets (${ASSETS.filter((a) => !a.native).length} tokens, ${RESERVES.length} reserves)`}>
        <p className="mb-3 text-sm text-muted">
          Everything Aave v3 lists on each network, taken from Aave&apos;s official address book. Reserves that Aave has
          frozen, paused or filled to their supply cap show up on the Stake page as withdraw-only. GHO and permissioned
          assets (Horizon&apos;s tokenized funds) are not offered.
        </p>
        <div className="divide-y divide-border rounded-xl border border-border">
          {MARKETS.map((m) => {
            const rs = RESERVES.filter((r) => r.marketId === m.id);
            return (
              <details key={m.id} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold">
                  <span>{networkLabel({ chainId: m.chainId, chainName: m.chainName, marketName: m.marketName })}</span>
                  <span className="text-xs font-normal text-muted">
                    {rs.length} assets{m.nativeSymbol ? ` · native ${m.nativeSymbol}` : ""} ▾
                  </span>
                </summary>
                <p className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted">
                  {rs.map((r) => symbolLabel(r)).join(", ")}
                </p>
              </details>
            );
          })}
        </div>
      </Card>
      <Card title="Risks">
        <p className="text-sm text-muted">
          The risks are Aave&apos;s risks: smart contract bugs, a depeg or price drop of the asset you supply, and low
          pool liquidity that can delay withdrawals. Yield varies with Aave&apos;s rates, so your pizza target is a goal, not a promise, and pies per
          month can go down. Zaave itself is experimental, unaudited software. Nothing here is financial advice; only
          stake what you can afford to lose.
        </p>
      </Card>
    </div>
  );
}
