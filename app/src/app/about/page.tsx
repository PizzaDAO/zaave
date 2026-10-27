import { Card } from "@/components/ui";

export const metadata = { title: "About | Zaave" };

const steps = [
  ["Pick your pizza", "Choose pies per month and what a pie costs near you. The calculator shows the stake it takes."],
  ["Stake USDC", "Pick any network where Aave v3 has a USDC market, such as Ethereum, Base, Arbitrum, Optimism, Polygon or Avalanche. Your USDC is supplied to Aave's USDC pool there from your own wallet, and you receive aUSDC."],
  ["Earn slices", "Your aUSDC grows as interest accrues. Interest becomes slices (8 per pie) on your dashboard."],
  ["Eat", "Cash out just the interest as USDC and buy a pie. Your principal stays in Aave, still earning."],
];

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">How Zaave works</h1>
      <Card>
        <p className="text-sm">
          Zaave is a pizza-themed interface to Aave v3&apos;s USDC pools on every network that has one. That&apos;s all
          it is: it helps you supply and withdraw on Aave, and shows your interest as pizza. The calculator uses the
          best live rate across networks, and the dashboard adds up your positions on all of them. Some networks also
          list bridged USDC (like USDC.e), which is a different token from Circle&apos;s native USDC and is labelled
          as such.
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
          <li>You hold the aUSDC in your own wallet. Zaave never touches your funds.</li>
          <li>No fee. All the interest Aave pays is yours.</li>
          <li>No token.</li>
          <li>Withdraw any time on Aave itself, even if this site is down.</li>
        </ul>
      </Card>
      <Card title="Risks">
        <p className="text-sm text-muted">
          The risks are Aave&apos;s risks: smart contract bugs, a USDC depeg, and low pool liquidity that can delay
          withdrawals. Yield varies with Aave&apos;s rates, so your pizza target is a goal, not a promise, and pies per
          month can go down. Zaave itself is experimental, unaudited software. Nothing here is financial advice; only
          stake what you can afford to lose.
        </p>
      </Card>
    </div>
  );
}
