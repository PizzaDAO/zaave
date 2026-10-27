"use client";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { erc20Abi, type Hash } from "viem";
import {
  useAccount,
  useBalance,
  useConfig,
  useGasPrice,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { fetchMarketHistory, interestFromHistory, interestSinceLastAction, type InterestBasis } from "./interest";
import { readMarket, type MarketState, type ReserveState } from "./market-reads";
import { chainName, isStable, MARKETS, networkLabel, type Choice, type Reserve } from "./markets";
import { DEFAULT_PIE_PRICE, MAX_PIE_PRICE, MIN_PIE_PRICE, toUsd6, USDC_UNIT } from "./pizza";

/** One refresh cadence for all on-chain reads, across every chain. */
const POLL_MS = 30_000;

/** "Best" needs at least $1M withdrawable in the pool (USD, 6 decimals). */
export const MIN_BEST_AVAILABLE_USD6 = 1_000_000n * USDC_UNIT;

/** USD value (6 decimals) of the liquidity currently withdrawable from a reserve. */
export const availableUsd6 = (s: ReserveState) => toUsd6(s.available, s.reserve.decimals, s.priceE8);

/** Best-APY first among reserves that accept deposits. */
export function rankBySupplyApy(states: readonly ReserveState[]): ReserveState[] {
  return states.filter((s) => s.canSupply).sort((a, b) => b.apy - a.apy);
}

/** The best-APY reserve with enough liquidity that a large withdrawal won't revert; else simply the best. */
export function pickBest(ranked: readonly ReserveState[]): ReserveState | undefined {
  return ranked.find((s) => availableUsd6(s) >= MIN_BEST_AVAILABLE_USD6) ?? ranked[0];
}

type Combined = { markets: MarketState[]; loading: boolean };
const combineMarkets = (results: { data?: MarketState; isLoading: boolean }[]): Combined => ({
  markets: results.flatMap((r) => (r.data ? [r.data] : [])),
  loading: results.some((r) => r.isLoading),
});

/**
 * Every market on every chain: one query per market (1-2 provider calls plus a balance round for
 * reserves the wallet holds, see market-reads.ts). A market whose RPC fails only fails its own
 * query. Rates need no wallet; positions are added when connected. Polls every 30 s.
 */
export function useMarketData() {
  const { address } = useAccount();
  const config = useConfig();

  const combined = useQueries({
    queries: MARKETS.map((m) => ({
      queryKey: ["market", m.id, address ?? null],
      queryFn: () => {
        const client = getPublicClient(config, { chainId: m.chainId as never });
        return readMarket((args) => client!.readContract(args as never), m, address);
      },
      refetchInterval: POLL_MS,
      staleTime: POLL_MS / 2,
      retry: 1,
    })),
    combine: combineMarkets,
  });

  const { markets, loading } = combined;
  const reserves = useMemo(() => markets.flatMap((m) => m.reserves), [markets]);

  // Networks whose provider call failed (only meaningful once loaded). A chain with several
  // markets is listed when any of them failed.
  const unreachable = useMemo(
    () => [...new Set(markets.filter((m) => !m.reachable).map((m) => networkLabel({ chainId: m.market.chainId, chainName: m.market.chainName, marketName: m.market.marketName })))],
    [markets],
  );
  const userFailed = useMemo(() => markets.filter((m) => m.reachable && !m.userOk).map((m) => chainName(m.market.chainId)), [markets]);

  /** Reserves currently accepting deposits, best APY first. */
  const ranked = useMemo(() => rankBySupplyApy(reserves), [reserves]);
  /** Best stablecoin reserve (the calculator's default). */
  const best = useMemo(() => pickBest(ranked.filter((s) => isStable(s.reserve))), [ranked]);

  return { markets, reserves, ranked, best, unreachable, userFailed, isLoading: loading };
}

export type Position = {
  state: ReserveState;
  reserve: Reserve;
  /** aToken balance and interest in the reserve's own decimals (exact, for transactions). */
  balance: bigint;
  interest: bigint | undefined;
  /** The same two figures in USD (6 decimals) at the oracle price, for totals and pizza math. */
  balanceUsd: bigint;
  interestUsd: bigint | undefined;
  apy: number;
  /** "allTime" when Aave's history API answered for this reserve, else "sinceLastAction". */
  basis: InterestBasis;
  /** All-time interest including anything already cashed out (all-time basis only). */
  lifetimeEarned: bigint | undefined;
};

// Unix seconds just before the user's latest in-app transaction, per reserve. Aave's history API
// lags the chain, so until it shows an event at or after that time, a fresh supply would read as
// interest.
const lastTxAt = new Map<string, number>();
const HISTORY_LAG_WINDOW = 600;

/**
 * The user's positions across all chains, with interest per reserve. Prefers Aave's lifetime
 * history (one API request per market, only for markets where the user holds a balance, split by
 * each reserve's underlying) and falls back to the exact on-chain since-last-action figure.
 */
export function usePortfolio() {
  const { address } = useAccount();
  const market = useMarketData();

  const held = useMemo(() => market.reserves.filter((s) => (s.balance ?? 0n) > 0n), [market.reserves]);
  const historyMarkets = [...new Map(held.filter((s) => s.reserve.aaveApi).map((s) => [s.reserve.marketId, s.reserve])).values()];
  const histories = useQueries({
    queries: historyMarkets.map((r) => ({
      queryKey: ["aave-history", r.marketId, address],
      enabled: !!address,
      queryFn: () =>
        fetchMarketHistory({
          market: r.pool,
          user: address!,
          chainId: r.chainId,
          // every reserve of the market, by its own underlying and decimals (never normalized)
          decimals: Object.fromEntries(
            market.reserves.filter((x) => x.reserve.marketId === r.marketId).map((x) => [x.reserve.underlying.toLowerCase(), x.reserve.decimals]),
          ),
        }),
      staleTime: 20_000,
      refetchInterval: 60_000,
      retry: 1,
    })),
  });
  const historyByMarket = new Map(historyMarkets.map((r, i) => [r.marketId, histories[i]]));

  const positions: Position[] = held.map((state) => {
    const { reserve } = state;
    const balance = state.balance!;
    const h = historyByMarket.get(reserve.marketId);
    const events = h?.data?.[reserve.underlying.toLowerCase()];
    const newest = events?.reduce((m, e) => Math.max(m, e.timestamp), 0) ?? 0;
    const txAt = lastTxAt.get(reserve.key) ?? 0;
    const stale = txAt > 0 && newest < txAt;

    let interest: bigint | undefined;
    let basis: InterestBasis = "sinceLastAction";
    let lifetimeEarned: bigint | undefined;
    if (events && events.length > 0 && !stale) {
      const x = interestFromHistory(balance, events);
      interest = x.interest;
      basis = "allTime";
      lifetimeEarned = x.lifetimeEarned;
    } else if (!(h?.isLoading && !stale)) {
      interest =
        state.scaledBalance !== undefined && state.previousIndex !== undefined
          ? interestSinceLastAction(balance, state.scaledBalance, state.previousIndex)
          : undefined;
    }
    return {
      state,
      reserve,
      balance,
      interest,
      balanceUsd: toUsd6(balance, reserve.decimals, state.priceE8),
      interestUsd: interest === undefined ? undefined : toUsd6(interest, reserve.decimals, state.priceE8),
      apy: state.apy,
      basis,
      lifetimeEarned,
    };
  });
  positions.sort((a, b) => (a.balanceUsd < b.balanceUsd ? 1 : a.balanceUsd > b.balanceUsd ? -1 : 0));

  const balanceUsd = positions.reduce((n, p) => n + p.balanceUsd, 0n);
  const interestUsd = positions.reduce((n, p) => n + (p.interestUsd ?? 0n), 0n);
  const lifetimeUsd = positions.reduce(
    (n, p) => n + (p.lifetimeEarned === undefined ? 0n : toUsd6(p.lifetimeEarned, p.reserve.decimals, p.state.priceE8)),
    0n,
  );
  const interestPending = positions.some((p) => p.interest === undefined);

  return {
    positions,
    totals: { balanceUsd, interestUsd, lifetimeUsd, interestPending },
    unreachable: market.unreachable,
    userFailed: market.userFailed,
    isLoading: market.isLoading || interestPending,
    market,
  };
}

/**
 * The wallet's balance of what a choice spends (the ERC20, or the native gas token), the
 * allowance the supply path needs (underlying to the Pool; none for native), and, for native,
 * the allowance of the aToken to the gateway that withdrawETH needs. All on that reserve's chain.
 */
export function useWalletReserve(choice: Choice | undefined) {
  const { address } = useAccount();
  const reserve = choice?.reserve;
  const native = !!choice?.native;
  const enabled = !!reserve && !!address;

  const erc20 = useReadContracts({
    contracts: (
      reserve && address
        ? [
            { address: reserve.underlying, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId: reserve.chainId },
            { address: reserve.underlying, abi: erc20Abi, functionName: "allowance", args: [address, reserve.pool], chainId: reserve.chainId },
            ...(reserve.gateway
              ? [{ address: reserve.aToken, abi: erc20Abi, functionName: "allowance", args: [address, reserve.gateway], chainId: reserve.chainId } as const]
              : []),
          ]
        : []) as never,
    query: { enabled, refetchInterval: POLL_MS },
  });
  const nativeBal = useBalance({ address, chainId: reserve?.chainId, query: { enabled: enabled && native, refetchInterval: POLL_MS } });
  const gas = useGasPrice({ chainId: reserve?.chainId, query: { enabled: enabled && native } });

  const d = erc20.data as { result?: unknown }[] | undefined;
  const tokenBalance = d?.[0]?.result as bigint | undefined;
  const balance = native ? nativeBal.data?.value : tokenBalance;
  // Leave room for gas when sending the whole native balance: 2x a 300k-gas transaction at the current price.
  const gasReserve = native ? (gas.data ? gas.data * 300_000n * 2n : (balance ?? 0n) / 100n) : 0n;
  return {
    isLoading: erc20.isLoading || (native && nativeBal.isLoading),
    balance,
    /** The most to send in one go (native: balance minus a gas reserve). */
    maxSpend: balance === undefined ? undefined : balance > gasReserve ? balance - gasReserve : 0n,
    allowance: d?.[1]?.result as bigint | undefined,
    /** Allowance of the aToken to the WrappedTokenGateway (for native withdrawals). */
    gatewayAllowance: d?.[2]?.result as bigint | undefined,
  };
}

const PIE_KEY = "zaave:piePrice";
const PIE_EVENT = "zaave:piePrice-change";

function readPiePriceText(): string {
  try {
    return window.localStorage.getItem(PIE_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribePiePrice(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(PIE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(PIE_EVENT, cb);
  };
}

/** The user's pie price in USDC units (default $25, bounded $1 to $1,000), kept in localStorage. */
export function usePiePrice() {
  const text = useSyncExternalStore(subscribePiePrice, readPiePriceText, () => "");
  const dollars = Number(text);
  const valid = text !== "" && Number.isFinite(dollars);
  const price = valid ? BigInt(Math.round(dollars * Number(USDC_UNIT))) : DEFAULT_PIE_PRICE;
  const piePrice = price >= MIN_PIE_PRICE && price <= MAX_PIE_PRICE ? price : DEFAULT_PIE_PRICE;

  const setPiePrice = useCallback((value: bigint) => {
    if (value < MIN_PIE_PRICE || value > MAX_PIE_PRICE) return;
    try {
      window.localStorage.setItem(PIE_KEY, (Number(value) / Number(USDC_UNIT)).toString());
    } catch {
      // storage unavailable (private mode etc): the price just won't persist
    }
    window.dispatchEvent(new Event(PIE_EVENT));
  }, []);

  return { piePrice, setPiePrice };
}

/** Wraps a wallet write: switches the wallet to the right chain first, tracks the hash, waits for the receipt, refreshes reads on success. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const qc = useQueryClient();
  const [hash, setHash] = useState<Hash>();
  const [txChainId, setTxChainId] = useState<number>();
  const [error, setError] = useState<string>();
  const [signing, setSigning] = useState(false);
  const receipt = useWaitForTransactionReceipt({ hash, chainId: txChainId });

  useEffect(() => {
    if (!receipt.isSuccess) return;
    qc.invalidateQueries();
    // Aave's history API indexes a few seconds after the block; refresh again.
    const timers = [5_000, 15_000].map((ms) => setTimeout(() => qc.invalidateQueries(), ms));
    return () => timers.forEach(clearTimeout);
  }, [receipt.isSuccess, qc]);

  const run = useCallback(
    async (
      target: { chainId: number; reserveKey: string; approval?: boolean },
      send: (write: typeof writeContractAsync) => Promise<Hash>,
    ) => {
      setError(undefined);
      setHash(undefined);
      setSigning(true);
      try {
        if (walletChainId !== target.chainId) await switchChainAsync({ chainId: target.chainId });
        // Approvals create no supply/withdraw event, so they don't make Aave's history stale.
        if (!target.approval) {
          const markedAt = Math.floor(Date.now() / 1000) - 60; // allow for clock skew vs block time
          lastTxAt.set(target.reserveKey, markedAt);
          setTimeout(() => {
            if (lastTxAt.get(target.reserveKey) === markedAt) lastTxAt.delete(target.reserveKey);
          }, HISTORY_LAG_WINDOW * 1000);
        }
        setTxChainId(target.chainId);
        setHash(await send(writeContractAsync));
      } catch (e) {
        const err = e as { shortMessage?: string; message?: string };
        setError(err.shortMessage ?? err.message ?? "Transaction failed");
      } finally {
        setSigning(false);
      }
    },
    [writeContractAsync, switchChainAsync, walletChainId],
  );

  return {
    run,
    hash,
    chainId: txChainId,
    error: error ?? (receipt.isError ? "Transaction reverted" : undefined),
    busy: signing || (!!hash && receipt.isLoading),
    signing,
    confirmed: receipt.isSuccess,
  };
}
