// "Pizza money" = interest earned on the user's aUSDC. All amounts are 6-decimal USDC bigints.

const RAY = 10n ** 27n;
const HALF_RAY = RAY / 2n;

export type InterestBasis = "allTime" | "sinceLastAction";

export type UsdcEvent = { kind: "supply" | "withdraw"; amount: bigint; timestamp: number };

/** Aave's rayMul (rounds half up). */
export function rayMul(a: bigint, b: bigint): bigint {
  return (a * b + HALF_RAY) / RAY;
}

/** Exact fallback: interest accrued since the user's last supply / withdraw / transfer. */
export function interestSinceLastAction(balance: bigint, scaledBalance: bigint, previousIndex: bigint): bigint {
  const atLastAction = rayMul(scaledBalance, previousIndex);
  return balance > atLastAction ? balance - atLastAction : 0n;
}

/**
 * Lifetime basis from supply/withdraw history (oldest first).
 *
 * Supplied principal is the sum of supplies since the user last fully exited (cumulative
 * withdrawals caught up with cumulative supplies). Interest = balance - that principal. Using
 * supplies rather than (supplies - withdrawals) keeps this correct after cashing out interest:
 * the withdrawal brings the balance back down to principal, so interest drops back to ~0.
 *
 * Limitations: a partial withdrawal of real principal is not distinguished from cashing out
 * interest, so interest reads as 0 until the balance grows back above total supplied. aUSDC
 * transferred in/out is not in Aave's history; received aUSDC counts as interest.
 */
export function interestFromHistory(
  balance: bigint,
  events: UsdcEvent[],
): { interest: bigint; lifetimeEarned: bigint } {
  let supplied = 0n;
  let withdrawn = 0n;
  let lifetimeIn = 0n;
  let lifetimeOut = 0n;
  for (const e of events) {
    if (e.kind === "supply") {
      supplied += e.amount;
      lifetimeIn += e.amount;
    } else {
      withdrawn += e.amount;
      lifetimeOut += e.amount;
      if (withdrawn >= supplied) {
        supplied = 0n;
        withdrawn = 0n;
      }
    }
  }
  const interest = balance > supplied ? balance - supplied : 0n;
  const earned = balance + lifetimeOut - lifetimeIn;
  return { interest, lifetimeEarned: earned > 0n ? earned : 0n };
}

const AAVE_API = "https://api.v3.aave.com/graphql";

const HISTORY_QUERY = `query UserUsdcHistory($market: EvmAddress!, $user: EvmAddress!, $chainId: ChainId!, $cursor: Cursor) {
  userTransactionHistory(request: {
    market: $market, user: $user, chainId: $chainId,
    orderBy: { date: DESC }, pageSize: FIFTY, filter: [SUPPLY, WITHDRAW], cursor: $cursor
  }) {
    items {
      __typename
      ... on UserSupplyTransaction { amount { amount { raw } } reserve { underlyingToken { address } } timestamp }
      ... on UserWithdrawTransaction { amount { amount { raw } } reserve { underlyingToken { address } } timestamp }
    }
    pageInfo { next }
  }
}`;

type HistoryItem = {
  __typename: string;
  amount?: { amount: { raw: string } };
  reserve?: { underlyingToken: { address: string } };
  timestamp?: string;
};

/** USDC supply/withdraw history from Aave's GraphQL API, oldest first. Throws on any failure. */
export async function fetchUsdcHistory(args: {
  market: string;
  user: string;
  usdc: string;
  chainId: number;
}): Promise<UsdcEvent[]> {
  const events: UsdcEvent[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const res = await fetch(AAVE_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: HISTORY_QUERY,
        variables: { market: args.market, user: args.user, chainId: args.chainId, cursor },
      }),
    });
    if (!res.ok) throw new Error(`Aave API ${res.status}`);
    const json = await res.json();
    if (json.errors || !json.data) throw new Error(json.errors?.[0]?.message ?? "Aave API error");
    const { items, pageInfo } = json.data.userTransactionHistory as {
      items: HistoryItem[];
      pageInfo: { next: string | null };
    };
    for (const it of items) {
      if (it.reserve?.underlyingToken.address.toLowerCase() !== args.usdc.toLowerCase() || !it.amount) continue;
      events.push({
        kind: it.__typename === "UserSupplyTransaction" ? "supply" : "withdraw",
        amount: BigInt(it.amount.amount.raw),
        timestamp: Date.parse(it.timestamp ?? "") / 1000 || 0,
      });
    }
    if (!pageInfo.next) return events.reverse();
    cursor = pageInfo.next;
  }
  throw new Error("Aave history too long");
}
