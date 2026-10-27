import { Card } from "@/components/ui";

export const metadata = { title: "About | Zaave" };

const steps = [
  ["Pick your pizza", "Choose pies per month and what a pie costs near you. The calculator shows the stake it takes."],
  ["Stake USDC", "Your USDC is supplied to Aave v3's USDC pool on Base, and that is the only place yield comes from."],
  ["Earn slices", "Interest becomes slices (8 per pie). On Za Day each month it moves into your pizza credit."],
  ["Eat", "Cash out the credit as USDC, or redeem it for a DoorDash gift card once that is live."],
];

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">How Zaave works</h1>
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
          <li>Yield comes only from Aave v3&apos;s USDC pool.</li>
          <li>Your principal is withdrawable anytime, even if deposits are paused.</li>
          <li>0% fee. 100% of yield goes to stakers.</li>
          <li>No token. Pizza credit is not transferable.</li>
          <li>Partial slices carry over to the next month.</li>
        </ul>
      </Card>
      <Card title="Risks">
        <p className="text-sm text-muted">
          Zaave is experimental, unaudited software. Smart contract bugs, Aave failures or losses, USDC depegs and
          governance actions could cost you funds. Aave rates move, so your pizza target is a goal, not a promise, and
          pies per month can go down. There is a deposit cap while the contract is young. Nothing here is financial
          advice; only stake what you can afford to lose.
        </p>
      </Card>
    </div>
  );
}
