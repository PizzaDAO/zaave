"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { erc20Abi, zeroAddress, type Hash } from "viem";
import { useAccount, useChainId, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { aTokenAbi } from "./abis";
import { BASE, getChainConfig, getDefaultChainId, type SupportedChainId } from "./addresses";
import { fetchAaveUsdcApy } from "./aave";
import { fetchUsdcHistory, interestFromHistory, interestSinceLastAction, type InterestBasis } from "./interest";
import { DEFAULT_PIE_PRICE, MAX_PIE_PRICE, MIN_PIE_PRICE, USDC_UNIT } from "./pizza";

/** Live Aave v3 USDC APY (fraction). Base mainnet by default; works with no wallet. */
export function useAaveApy(chainId: SupportedChainId = BASE) {
  return useQuery({
    queryKey: ["aave-usdc-apy", chainId],
    queryFn: () => fetchAaveUsdcApy(chainId),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
  });
}

/** The active chain's config (falls back to the default chain when the wallet is elsewhere). */
export function useAaveChain() {
  const walletChainId = useChainId();
  const supported = getChainConfig(walletChainId) !== undefined;
  const chainId = (supported ? walletChainId : getDefaultChainId()) as SupportedChainId;
  return { chainId, cfg: getChainConfig(chainId)! };
}

const refetchInterval = 15_000;

/** USDC wallet balance, allowance to the Aave Pool, and the aUSDC position, in one multicall. */
export function useAaveData() {
  const { chainId, cfg } = useAaveChain();
  const { address } = useAccount();
  const user = address ?? zeroAddress;
  const aToken = { address: cfg.aUsdc, abi: aTokenAbi, chainId } as const;

  const result = useReadContracts({
    contracts: [
      { address: cfg.usdc, abi: erc20Abi, functionName: "balanceOf", args: [user], chainId },
      { address: cfg.usdc, abi: erc20Abi, functionName: "allowance", args: [user, cfg.aavePool], chainId },
      { ...aToken, functionName: "balanceOf", args: [user] },
      { ...aToken, functionName: "scaledBalanceOf", args: [user] },
      { ...aToken, functionName: "getPreviousIndex", args: [user] },
    ],
    query: { enabled: !!address, refetchInterval },
  });
  const d = result.data;
  return {
    isLoading: result.isLoading,
    usdcBalance: d?.[0].result as bigint | undefined,
    allowance: d?.[1].result as bigint | undefined,
    aUsdcBalance: d?.[2].result as bigint | undefined,
    scaledBalance: d?.[3].result as bigint | undefined,
    previousIndex: d?.[4].result as bigint | undefined,
  };
}

export type PizzaMoney = {
  isLoading: boolean;
  /** aUSDC balance (principal + interest). */
  balance: bigint | undefined;
  /** Interest earned, i.e. cashable pizza money. */
  interest: bigint | undefined;
  /** "allTime" when Aave's history API answered, else "sinceLastAction". */
  basis: InterestBasis;
  /** All-time interest including anything already cashed out (all-time basis only). */
  lifetimeEarned: bigint | undefined;
};

/** Interest earned = aUSDC balance minus principal. Prefers Aave's lifetime history; falls back to on-chain. */
// Unix seconds just before the user's latest in-app transaction. Aave's history API lags the
// chain, so until it shows an event at or after this time, a fresh supply would read as interest.
let lastTxAt = 0;
const HISTORY_LAG_WINDOW = 600;

export function usePizzaMoney(): PizzaMoney {
  const { chainId, cfg } = useAaveChain();
  const { address } = useAccount();
  const d = useAaveData();

  const history = useQuery({
    queryKey: ["aave-usdc-history", chainId, address],
    enabled: !!address && cfg.aaveApi,
    queryFn: () => fetchUsdcHistory({ market: cfg.aavePool, user: address!, usdc: cfg.usdc, chainId }),
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const balance = d.aUsdcBalance;
  const newest = history.data?.reduce((m, e) => Math.max(m, e.timestamp), 0) ?? 0;
  const historyStale = lastTxAt > 0 && newest < lastTxAt;
  if (balance !== undefined && history.data && !historyStale) {
    const h = interestFromHistory(balance, history.data);
    return { isLoading: false, balance, interest: h.interest, basis: "allTime", lifetimeEarned: h.lifetimeEarned };
  }
  const fallback =
    balance !== undefined && d.scaledBalance !== undefined && d.previousIndex !== undefined
      ? interestSinceLastAction(balance, d.scaledBalance, d.previousIndex)
      : undefined;
  const waitingForHistory = !!address && cfg.aaveApi && history.isLoading && !historyStale;
  return {
    isLoading: d.isLoading || waitingForHistory,
    balance,
    interest: waitingForHistory ? undefined : fallback,
    basis: "sinceLastAction",
    lifetimeEarned: undefined,
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

/** Wraps a wallet write: tracks the hash, waits for the receipt, refreshes all reads on success. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();
  const [signing, setSigning] = useState(false);
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!receipt.isSuccess) return;
    qc.invalidateQueries();
    // Aave's history API indexes a few seconds after the block; refresh again.
    const timers = [5_000, 15_000].map((ms) => setTimeout(() => qc.invalidateQueries(), ms));
    return () => timers.forEach(clearTimeout);
  }, [receipt.isSuccess, qc]);

  const run = useCallback(
    async (send: (write: typeof writeContractAsync) => Promise<Hash>) => {
      setError(undefined);
      setHash(undefined);
      setSigning(true);
      const markedAt = Math.floor(Date.now() / 1000) - 60; // allow for clock skew vs block time
      lastTxAt = markedAt;
      setTimeout(() => {
        if (lastTxAt === markedAt) lastTxAt = 0;
      }, HISTORY_LAG_WINDOW * 1000);
      try {
        setHash(await send(writeContractAsync));
      } catch (e) {
        const err = e as { shortMessage?: string; message?: string };
        setError(err.shortMessage ?? err.message ?? "Transaction failed");
      } finally {
        setSigning(false);
      }
    },
    [writeContractAsync],
  );

  return {
    run,
    hash,
    error: error ?? (receipt.isError ? "Transaction reverted" : undefined),
    busy: signing || (!!hash && receipt.isLoading),
    signing,
    confirmed: receipt.isSuccess,
  };
}
