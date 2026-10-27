"use client";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { erc20Abi, type Hash } from "viem";
import { useAccount, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { fetchMarketHistory, interestFromHistory, interestSinceLastAction, type InterestBasis } from "./interest";
import { buildMarketContracts, parseMarketRows, unreachableChains, type ReserveState } from "./market-reads";
import { chainName, RESERVES, type Reserve } from "./markets";
import { DEFAULT_PIE_PRICE, MAX_PIE_PRICE, MIN_PIE_PRICE, toUsdc6, USDC_UNIT } from "./pizza";

/** One refresh cadence for all on-chain reads, across every chain. */
const POLL_MS = 30_000;

/**
 * Every USDC reserve on every chain, in one useReadContracts call: wagmi groups the calls by
 * chainId into one multicall per chain, and allowFailure lets a dead RPC fail only its own rows.
 * Rates need no wallet; the user's aToken position is added when connected.
 */
export function useMarketData() {
  const { address } = useAccount();
  const contracts = useMemo(() => buildMarketContracts(address), [address]);

  const result = useReadContracts({
    contracts: contracts as never,
    query: { refetchInterval: POLL_MS, staleTime: POLL_MS / 2 },
  });

  const reserves = useMemo(() => parseMarketRows(result.data as never, address), [result.data, address]);

  // A chain is "unreachable" when none of its reserves answered (only meaningful once loaded).
  const unreachable = useMemo(
    () => (result.isLoading || !result.data ? [] : unreachableChains(reserves, chainName)),
    [reserves, result.isLoading, result.data],
  );

  /** Reserves currently accepting deposits, best APY first. */
  const ranked = useMemo(
    () => reserves.filter((s) => s.canSupply && s.apy !== undefined).sort((a, b) => b.apy! - a.apy!),
    [reserves],
  );

  return { reserves, ranked, best: ranked[0], unreachable, isLoading: result.isLoading };
}

export type Position = {
  state: ReserveState;
  reserve: Reserve;
  /** aToken balance and interest in the reserve's own decimals (exact, for transactions). */
  balance: bigint;
  interest: bigint | undefined;
  /** Same two figures normalized to 6-decimal USDC, for totals and pizza math. */
  balance6: bigint;
  interest6: bigint | undefined;
  apy: number | undefined;
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
 * history (one API request per market, only for markets where the user holds a balance) and falls
 * back to the exact on-chain since-last-action figure.
 */
export function usePortfolio() {
  const { address } = useAccount();
  const market = useMarketData();

  const held = market.reserves.filter((s) => (s.balance ?? 0n) > 0n);
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
          decimals: Object.fromEntries(
            RESERVES.filter((x) => x.marketId === r.marketId).map((x) => [x.underlying.toLowerCase(), x.decimals]),
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
      balance6: toUsdc6(balance, reserve.decimals),
      interest6: interest === undefined ? undefined : toUsdc6(interest, reserve.decimals),
      apy: state.apy,
      basis,
      lifetimeEarned,
    };
  });
  positions.sort((a, b) => (a.balance6 < b.balance6 ? 1 : a.balance6 > b.balance6 ? -1 : 0));

  const balance6 = positions.reduce((n, p) => n + p.balance6, 0n);
  const interest6 = positions.reduce((n, p) => n + (p.interest6 ?? 0n), 0n);
  const lifetime6 = positions.reduce(
    (n, p) => n + (p.lifetimeEarned === undefined ? 0n : toUsdc6(p.lifetimeEarned, p.reserve.decimals)),
    0n,
  );
  const interestPending = positions.some((p) => p.interest === undefined);

  return {
    positions,
    totals: { balance6, interest6, lifetime6, interestPending },
    unreachable: market.unreachable,
    isLoading: market.isLoading || interestPending,
    market,
  };
}

/** The wallet's USDC balance and allowance to the Aave Pool for one reserve (on that reserve's chain). */
export function useWalletReserve(reserve: Reserve | undefined) {
  const { address } = useAccount();
  const result = useReadContracts({
    contracts:
      reserve && address
        ? [
            { address: reserve.underlying, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId: reserve.chainId },
            {
              address: reserve.underlying,
              abi: erc20Abi,
              functionName: "allowance",
              args: [address, reserve.pool],
              chainId: reserve.chainId,
            },
          ]
        : [],
    query: { enabled: !!reserve && !!address, refetchInterval: POLL_MS },
  });
  const d = result.data;
  return {
    isLoading: result.isLoading,
    usdcBalance: d?.[0]?.result as bigint | undefined,
    allowance: d?.[1]?.result as bigint | undefined,
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
    async (target: { chainId: number; reserveKey: string }, send: (write: typeof writeContractAsync) => Promise<Hash>) => {
      setError(undefined);
      setHash(undefined);
      setSigning(true);
      try {
        if (walletChainId !== target.chainId) await switchChainAsync({ chainId: target.chainId });
        const markedAt = Math.floor(Date.now() / 1000) - 60; // allow for clock skew vs block time
        lastTxAt.set(target.reserveKey, markedAt);
        setTimeout(() => {
          if (lastTxAt.get(target.reserveKey) === markedAt) lastTxAt.delete(target.reserveKey);
        }, HISTORY_LAG_WINDOW * 1000);
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
