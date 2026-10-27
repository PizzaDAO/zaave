"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { erc20Abi, zeroAddress, type Address, type Hash } from "viem";
import { useAccount, useBytecode, useChainId, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { BASE, getChainConfig, getDefaultChainId, type SupportedChainId } from "./addresses";
import { fetchAaveUsdcApy } from "./aave";
import { DEFAULT_PIE_PRICE } from "./pizza";
import { zaaveAbi } from "./zaaveAbi";

/** Live Aave v3 USDC APY (fraction). Base mainnet by default; works with no wallet or deployment. */
export function useAaveApy(chainId: SupportedChainId = BASE) {
  return useQuery({
    queryKey: ["aave-usdc-apy", chainId],
    queryFn: () => fetchAaveUsdcApy(chainId),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
  });
}

export type ZaaveStatus = "unconfigured" | "checking" | "notDeployed" | "ready";

/** The active chain's config and whether a Zaave contract is live there. */
export function useZaaveChain() {
  const chainId = useChainId();
  const cfg = getChainConfig(chainId) ?? getChainConfig(getDefaultChainId())!;
  const supportedChainId = (getChainConfig(chainId) ? chainId : getDefaultChainId()) as SupportedChainId;
  const code = useBytecode({
    chainId: supportedChainId,
    address: cfg.zaave,
    query: { enabled: !!cfg.zaave },
  });
  let status: ZaaveStatus = "ready";
  if (!cfg.zaave) status = "unconfigured";
  else if (code.isLoading) status = "checking";
  else if (!code.data || code.data === "0x") status = "notDeployed";
  return { chainId: supportedChainId, cfg, zaave: cfg.zaave, status };
}

const refetchInterval = 15_000;

/** All per-user Zaave reads in one multicall. */
export function useZaaveData() {
  const { chainId, zaave, status } = useZaaveChain();
  const { address } = useAccount();
  const user = address ?? zeroAddress;
  const zaaveContract = { address: zaave, abi: zaaveAbi, chainId } as const;
  const enabled = status === "ready" && !!zaave;

  const result = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...zaaveContract, functionName: "principal", args: [user] },
      { ...zaaveContract, functionName: "credit", args: [user] },
      { ...zaaveContract, functionName: "pendingYield", args: [user] },
      { ...zaaveContract, functionName: "claimableYield", args: [user] },
      { ...zaaveContract, functionName: "piePriceOf", args: [user] },
      { ...zaaveContract, functionName: "nextZaDayAt" },
      { ...zaaveContract, functionName: "fulfillment" },
      { ...zaaveContract, functionName: "tvlCap" },
      { ...zaaveContract, functionName: "totalPrincipal" },
      { ...zaaveContract, functionName: "USDC" },
    ],
    query: { enabled, refetchInterval },
  });
  const d = result.data;
  return {
    isLoading: result.isLoading,
    principal: d?.[0].result as bigint | undefined,
    credit: d?.[1].result as bigint | undefined,
    pendingYield: d?.[2].result as bigint | undefined,
    claimableYield: d?.[3].result as bigint | undefined,
    piePrice: (d?.[4].result as bigint | undefined) ?? DEFAULT_PIE_PRICE,
    nextZaDayAt: d?.[5].result as bigint | undefined,
    fulfillment: d?.[6].result as Address | undefined,
    tvlCap: d?.[7].result as bigint | undefined,
    totalPrincipal: d?.[8].result as bigint | undefined,
    usdc: d?.[9].result as Address | undefined,
  };
}

/** USDC balance + allowance for the Zaave contract. */
export function useUsdc() {
  const { chainId, cfg, zaave, status } = useZaaveChain();
  const { address } = useAccount();
  const enabled = status === "ready" && !!zaave && !!address;
  const result = useReadContracts({
    contracts: [
      { address: cfg.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress], chainId },
      { address: cfg.usdc, abi: erc20Abi, functionName: "allowance", args: [address ?? zeroAddress, zaave ?? zeroAddress], chainId },
    ],
    query: { enabled, refetchInterval },
  });
  return {
    balance: result.data?.[0].result as bigint | undefined,
    allowance: result.data?.[1].result as bigint | undefined,
  };
}

/** Current chain time, ticking every second (seconds). */
export function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
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
    if (receipt.isSuccess) qc.invalidateQueries();
  }, [receipt.isSuccess, qc]);

  const run = useCallback(
    async (send: (write: typeof writeContractAsync) => Promise<Hash>) => {
      setError(undefined);
      setHash(undefined);
      setSigning(true);
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
