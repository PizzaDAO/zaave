// Pure (non-React) pieces of the cross-chain read path, shared by hooks.ts and the node scripts.
//
// Per market (pool): UiPoolDataProvider.getReservesData(provider) gives every reserve's rate,
// status, liquidity, supply cap and oracle price in ONE call; with a wallet,
// getUserReservesData(provider, user) gives the wallet's scaled aToken balances in a second call
// (plus WalletBalanceProvider.getUserWalletBalances for what the wallet holds, a third). A second
// round, only for reserves where the user's scaled balance is above zero, reads the aToken's
// balanceOf / scaledBalanceOf / getPreviousIndex (exact balance and the since-last-action basis).
//
// Everything the provider returns is cross-checked against the static address-book config
// (underlying, aToken, decimals); reserves that are not in the config, or whose aToken differs,
// are ignored. Transaction targets never come from here.
import { erc20Abi, type Abi, type Address } from "viem";
import { aTokenAbi, uiPoolDataProviderAbi, walletBalanceProviderAbi } from "./abis";
import { rayMul } from "./interest";
import { MARKETS, RESERVES, type Market, type Reserve } from "./markets";
import { rayAprToApy } from "./pizza";

/** Why a reserve cannot take new deposits. */
export type SupplyBlock = "frozen" | "paused" | "inactive" | "cap";

/** Live state of one reserve: rate, status, price, and (with a wallet) the user's position. */
export type ReserveState = {
  reserve: Reserve;
  /** Supply APY as a fraction (0.041 = 4.1%). */
  apy: number;
  /** False when frozen, paused, inactive or at its supply cap. */
  canSupply: boolean;
  /** Paused or inactive reserves cannot be withdrawn from either. */
  canWithdraw: boolean;
  frozen: boolean;
  supplyBlock: SupplyBlock | undefined;
  /** Room left under the supply cap in the reserve's own decimals; undefined when there is no cap. */
  headroom: bigint | undefined;
  /** Share of supplied tokens currently lent out (0-1). */
  utilization: number;
  /** Tokens in the pool that can be withdrawn right now, in the reserve's own decimals. */
  available: bigint;
  /** USD price with 8 decimals, from the market's oracle. */
  priceE8: bigint;
  /** aToken balance in the reserve's own decimals (undefined without a wallet or when the user read failed). */
  balance: bigint | undefined;
  scaledBalance: bigint | undefined;
  previousIndex: bigint | undefined;
  /** The wallet's own (not supplied) balance of the underlying token. */
  walletBalance: bigint | undefined;
};

export type MarketState = {
  market: Market;
  /** False when the provider call failed (RPC down, decode error). */
  reachable: boolean;
  /** With a wallet: false when the user-position call failed, so balances are unknown. */
  userOk: boolean;
  reserves: ReserveState[];
  /** Provider reserves ignored because they are not in (or disagree with) the static config. */
  ignored: number;
};

/** Minimal client: viem's PublicClient.readContract fits. */
export type ReadFn = (args: { address: Address; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown>;

type AggregatedReserve = {
  underlyingAsset: Address;
  decimals: bigint;
  isActive: boolean;
  isFrozen: boolean;
  isPaused: boolean;
  liquidityIndex: bigint;
  variableBorrowIndex: bigint;
  liquidityRate: bigint;
  aTokenAddress: Address;
  availableLiquidity: bigint;
  totalScaledVariableDebt: bigint;
  priceInMarketReferenceCurrency: bigint;
  supplyCap: bigint;
};
type BaseCurrency = { marketReferenceCurrencyUnit: bigint; marketReferenceCurrencyPriceInUsd: bigint };
type UserReserve = { underlyingAsset: Address; scaledATokenBalance: bigint };

const lc = (a: string) => a.toLowerCase();

/** Reserves of one market that exist in the static config, by lowercase underlying. */
const RESERVES_BY_MARKET = new Map<string, Map<string, Reserve>>();
for (const m of MARKETS) RESERVES_BY_MARKET.set(m.id, new Map());
for (const r of RESERVES) RESERVES_BY_MARKET.get(r.marketId)!.set(lc(r.underlying), r);

/**
 * Reads one market. Never throws: a failed provider call yields `reachable: false`.
 */
export async function readMarket(read: ReadFn, market: Market, user: Address | undefined): Promise<MarketState> {
  const base: MarketState = { market, reachable: false, userOk: !user, reserves: [], ignored: 0 };
  const ui = market.uiPoolDataProvider;
  const provider = market.poolAddressesProvider;

  const settle = <T>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), () => ({ ok: false as const, v: undefined }));
  const [reservesRes, userRes, walletRes] = await Promise.all([
    settle(read({ address: ui, abi: uiPoolDataProviderAbi, functionName: "getReservesData", args: [provider] })),
    user ? settle(read({ address: ui, abi: uiPoolDataProviderAbi, functionName: "getUserReservesData", args: [provider, user] })) : undefined,
    user && market.walletBalanceProvider
      ? settle(read({ address: market.walletBalanceProvider, abi: walletBalanceProviderAbi, functionName: "getUserWalletBalances", args: [provider, user] }))
      : undefined,
  ]);
  if (!reservesRes.ok || !Array.isArray(reservesRes.v)) return base;
  const [list, baseCurrency] = reservesRes.v as unknown as [AggregatedReserve[], BaseCurrency];
  if (!Array.isArray(list) || !baseCurrency) return base;

  const unit = baseCurrency.marketReferenceCurrencyUnit;
  const refUsd = baseCurrency.marketReferenceCurrencyPriceInUsd; // 8 decimals
  if (unit <= 0n || refUsd <= 0n) return base; // unusable price base: treat the market as unreachable

  // Wallet balances and user positions by lowercase underlying.
  const wallet = new Map<string, bigint>();
  if (walletRes?.ok) {
    const [tokens, balances] = walletRes.v as unknown as [Address[], bigint[]];
    tokens.forEach((t, i) => wallet.set(lc(t), balances[i]));
  }
  const scaled = new Map<string, bigint>();
  let userOk = !user;
  if (userRes?.ok) {
    userOk = true;
    for (const u of (userRes.v as unknown as [UserReserve[], number])[0]) scaled.set(lc(u.underlyingAsset), u.scaledATokenBalance);
  }

  const known = RESERVES_BY_MARKET.get(market.id)!;
  const states: ReserveState[] = [];
  let ignored = 0;
  for (const p of list) {
    const reserve = known.get(lc(p.underlyingAsset));
    if (!reserve || lc(p.aTokenAddress) !== lc(reserve.aToken) || Number(p.decimals) !== reserve.decimals) {
      ignored++;
      continue;
    }
    const debt = rayMul(p.totalScaledVariableDebt, p.variableBorrowIndex);
    const supplied = p.availableLiquidity + debt; // ~ aToken supply + treasury accrual, the quantity Aave caps
    const cap = p.supplyCap * 10n ** BigInt(reserve.decimals); // supplyCap is in whole tokens; 0 = no cap
    const headroom = p.supplyCap === 0n ? undefined : cap > supplied ? cap - supplied : 0n;
    // "Reached" when under 0.01% of the cap is left (the figure above is a few seconds stale).
    const capReached = headroom !== undefined && headroom * 10_000n < cap;
    const supplyBlock: SupplyBlock | undefined = !p.isActive
      ? "inactive"
      : p.isPaused
        ? "paused"
        : p.isFrozen
          ? "frozen"
          : capReached
            ? "cap"
            : undefined;
    const scaledBalance = user && userOk ? (scaled.get(lc(reserve.underlying)) ?? 0n) : undefined;
    states.push({
      reserve,
      apy: rayAprToApy(p.liquidityRate),
      canSupply: supplyBlock === undefined,
      canWithdraw: p.isActive && !p.isPaused,
      frozen: p.isFrozen,
      supplyBlock,
      headroom,
      utilization: supplied > 0n ? Math.min(1, Number((debt * 10_000n) / supplied) / 10_000) : 0,
      available: p.availableLiquidity,
      priceE8: (p.priceInMarketReferenceCurrency * refUsd) / unit,
      // Provisional balance from the (stored) liquidity index; the second round replaces it with the exact figure.
      balance: scaledBalance === undefined ? undefined : rayMul(scaledBalance, p.liquidityIndex),
      scaledBalance,
      previousIndex: undefined,
      walletBalance: user ? wallet.get(lc(reserve.underlying)) : undefined,
    });
  }

  // Second round: exact balance and last-action index, only where the user holds something.
  await Promise.all(
    states
      .filter((s) => (s.scaledBalance ?? 0n) > 0n)
      .map(async (s) => {
        const aToken = s.reserve.aToken;
        const [bal, sc, idx] = await Promise.all([
          settle(read({ address: aToken, abi: erc20Abi, functionName: "balanceOf", args: [user!] })),
          settle(read({ address: aToken, abi: aTokenAbi, functionName: "scaledBalanceOf", args: [user!] })),
          settle(read({ address: aToken, abi: aTokenAbi, functionName: "getPreviousIndex", args: [user!] })),
        ]);
        if (bal.ok) s.balance = bal.v as bigint;
        if (sc.ok) s.scaledBalance = sc.v as bigint;
        if (idx.ok) s.previousIndex = idx.v as bigint;
      }),
  );

  return { market, reachable: true, userOk, reserves: states, ignored };
}

