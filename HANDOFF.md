# Zaave handoff (2026-10-27)

## What it is
A pizza-themed front end for **every asset you can supply on Aave v3, on every EVM network in the address book** (21 chains, 24 markets, 294 reserves). Users supply from their own wallet, hold the aToken, and the app shows their interest as pizza (pies and slices at a pie price each user sets, in USD). There's no Zaave smart contract, no fee and no token.

- **Live:** https://zaave.vercel.app (Vercel project `pizza-dao/zaave`, PizzaDAO team)
- **Repo:** https://github.com/PizzaDAO/zaave (public). The app is in `app/`, and plans are in `plans/`.
- **Plan:** `plans/zaave.md` (still describes the Base-only v1). **Gift card research:** `plans/research-giftcards.md`.

## Status
| Area | State |
|---|---|
| Calculator (`/`) | Asset selector next to the amount field (default "Best stable" = best-APY stablecoin with >= $1M liquidity). Pies <-> USD toggle. "Rates by network" is per selected asset. Non-stable note under the result. |
| Stake (`/stake`) | Searchable asset picker (holdings first, then popular, then A-Z), then a network picker for that asset. Switch chain, approve, `supply`, withdraw / withdraw all. Native gas tokens via the WrappedTokenGateway. **Not tested with a real wallet (no writes were sent).** |
| Dashboard (`/dashboard`) | USD totals over every reserve and chain, per-position rows (token + USD balance and interest, APY, basis). Read path tested in node with real wallets. |
| Redeem (`/redeem`) | Per-position cash out of interest in that token; native via `withdrawETH` (aToken approval first). Untested with a wallet. |
| About (`/about`) | Lists every network's assets. |
| Mobile (375px) | Layout built mobile-first; not checked on a real 375px viewport. Run `/mobile-check`. |

## How it works (code map)
- `app/scripts/gen-markets.mjs` generates `app/src/lib/markets.generated.ts` (committed) from the pinned devDependency `@bgd-labs/aave-address-book@4.44.22`. **This is the only source of transaction-target addresses**; nothing is fetched at runtime. Per market: POOL, ORACLE, UI_POOL_DATA_PROVIDER, POOL_ADDRESSES_PROVIDER, WALLET_BALANCE_PROVIDER, WETH_GATEWAY (+ wrapped-native underlying and native symbol) and one compact tuple per reserve `[symbol, underlying, aToken, decimals, bridged]`. Re-run `node scripts/gen-markets.mjs` after bumping the package. It also holds symbol renames, the bridged-USDC list, per-chain native/wrapped-native keys, `NEVER_SUPPLY` (GHO) and `ONLY_KEYS` (Horizon offers only USDC and RLUSD; its RWA reserves are permissioned).
- `app/src/lib/markets.ts`: flattens markets into `RESERVES` (key `<chainId>-<market>-<symbol>`), `ASSETS` (reserves grouped across chains by display label, plus `native:<SYM>` assets for gas tokens), `Choice` (reserve + native flag), the stablecoin list (`isStable`), `POPULAR_ASSETS`, wagmi `CHAINS`, labels.
- `app/src/lib/market-reads.ts`: `readMarket(read, market, user)`, shared by hooks and node scripts. Per market: `UiPoolDataProvider.getReservesData(provider)` (rate, status, liquidity, supply cap, oracle price, base currency); with a wallet also `getUserReservesData` and `WalletBalanceProvider.getUserWalletBalances`; then aToken `balanceOf/scaledBalanceOf/getPreviousIndex` only for reserves where the scaled balance > 0. Every provider reserve is cross-checked against the static config (underlying, aToken, decimals); others are ignored. USD price = `priceInMarketReferenceCurrency * marketReferenceCurrencyPriceInUsd / marketReferenceCurrencyUnit` (8 decimals, `priceE8`). Supply cap headroom ~ `supplyCap*10^dec - (availableLiquidity + rayMul(totalScaledVariableDebt, variableBorrowIndex))`; "cap reached" when under 0.01% is left.
- UiPoolDataProvider ABI (`abis.ts`): all 24 markets return the **same v3.3+ layout** (no stable-debt fields, `virtualUnderlyingBalance`/`deficit` at the end). The address book's older v3.0 ABI fails to decode on every one. `scripts/verify-markets.mjs` re-checks this (decode, rate and status vs the pool, token/pool/decimals, gateway `WETH()`/`POOL()`; `RPC_<chainId>=url` overrides a flaky RPC, Mantle's default rate-limits).
- `app/src/lib/hooks.ts`: `useMarketData` (one react-query per market, 30 s poll, a failed market is listed as unreachable), `usePortfolio` (positions + interest per reserve, USD), `useWalletReserve` (wallet balance/allowance, native balance, aToken->gateway allowance), `usePiePrice`, `useTx` (switches chain before writing).
- `app/src/lib/interest.ts`: same logic as before. History is requested once per market and split by each reserve's underlying and decimals (up to 3,000 events). Gateway **supplies** show up in Aave's history under the wrapped token with the right amount (checked on Base: 6 of 6). Gateway **withdrawals** emit the pool `Withdraw` event with user = to = the gateway, so they most likely do not appear in the user's history. Effect: interest is understated (never overstated) after a native full exit followed by a new supply. Not verified with a real wallet.
- `app/src/lib/pizza.ts`: all pizza math on USD6 bigint (`toUsd6(amount, decimals, priceE8)`, `fromUsd6`). Transactions always use the reserve's own token units.
- `app/src/lib/assets.ts`: per-asset roll-ups (best APY, supplied USD, wallet USD) for the picker and calculator.
- Native: `depositETH(pool, user, 0)` with `value`; `withdrawETH(pool, amount, user)` after approving the aToken to the gateway (approve exact amount; for "all", balance + 0.1%; max uint withdraws everything). Markets without a gateway (EtherFi, Horizon, Metis, Celo) show only the wrapped token. Native "Max" keeps a gas reserve (2 x 300k gas at the current price).
- `app/scripts/check-reads.mts` (`pnpm dlx tsx scripts/check-reads.mts 0xUser ...`) runs the read path for all markets in node. `app/scripts/bundle-size.mjs` prints first-load JS after a build.
- History API works for 16 of the original 20 markets, and answered without error for X Layer and Monad (no real wallet to confirm). **Metis, Mantle, Celo and Ink are not served**; Plasma and MegaETH were not probed and are treated as unsupported (`NO_HISTORY_CHAINS` in `markets.ts`).
- Frozen/paused/inactive/capped reserves are hidden from supply (shown as withdraw-only / "supply cap reached" in the network picker, selectable only if the user holds a balance). Many sunset markets (Sonic, zkSync, Metis, Soneium, Scroll) currently have every reserve frozen.

## Known limitations
- A partial withdrawal of principal looks the same as cashing out interest, so pizza money reads 0 until the balance grows back above what was supplied.
- aTokens transferred in from another wallet count as interest. Aave's API has no transfer history.
- Public RPCs are rate limited and some are flaky (Mantle, Base, Scroll defaults in particular). Set `NEXT_PUBLIC_RPC_<chainId>` for any chain that misbehaves (especially 1, 8453, 42161).
- Bridged labels (`bridged: true`) are a hand-kept list in `gen-markets.mjs`, checked against on-chain names. Ink's USDC is treated as native (unconfirmed).
- X Layer (196) and Monad (143) are not in address-book 4.44.22. Their addresses are hardcoded in `gen-markets.mjs` (`HARDCODED`) from address-book GitHub main commit `aafdffd` (4.75.3) and verified on-chain by `verify-markets.mjs` (pool/provider/oracle wiring, UI provider decode, gateway). The package wins once a bump includes them. Monad has no native MON: its gateway wraps WMON, which is not a reserve of the pool.
- The supply cap headroom is an estimate from provider data (a few seconds stale); Aave is the final check.
- The address book lags the chain, so `gen-markets.mjs` also reads each book Pool's `getReservesList()` and adds reserves the book lacks (14 now: Ethereum Core +4, Ink +5, Plasma +3, MegaETH +2; marked with a comment in the generated file). The Pool vouches for each: `getReserveData` aToken, `aToken.POOL()`, `aToken.UNDERLYING_ASSET_ADDRESS()`, decimals, active, and the aToken proxy implementation (EIP-1967 slot) must equal that of an open reserve of the same market. Horizon extras (ACRED, mGLOBAL) and GHO are skipped. This is a heuristic for "not permissioned": a new aToken implementation revision would make new reserves get skipped (logged), not added. The generator needs network access (`RPC_<chainId>=url`; Mantle falls back to publicnode) and fails loudly if an RPC fails.
- Stablecoin detection is a hand-kept symbol list (`STABLE_SYMBOLS` in `markets.ts`), not price based.
- Without `NEXT_PUBLIC_WC_PROJECT_ID`, only browser-extension (injected) wallets connect, with no WalletConnect QR.

## Run / deploy
```bash
cd app && pnpm install && pnpm dev     # pnpm 12, node 24
pnpm lint && pnpm build
vercel-deploy --prod                   # from app/ (linked to pizza-dao/zaave)
```
- `app/pnpm-workspace.yaml` `allowBuilds` must keep sharp, unrs-resolver, bufferutil, keccak and utf-8-validate set to `false`. Without that, pnpm 12 fails the Vercel install with `ERR_PNPM_IGNORED_BUILDS`.
- `next.config.ts` aliases RainbowKit's optional `@x402/*` imports to `src/lib/empty-module.ts`. Keep this when upgrading wagmi or RainbowKit.
- Vercel env: `NEXT_PUBLIC_DEFAULT_CHAIN` is no longer used and can be removed.

## History
- The first design used a custom vault contract (principal/yield split, monthly "Za Day" harvest, pizza credit, gift card redemption). It was built and reviewed, then dropped for a pure front end because it needed no new contract risk or testnet deploy. It's preserved at the git tag **`custom-vault-contract`**.
- Leftover agent worktrees under `.claude/worktrees/` (gitignored) can be removed with `git worktree remove`.

## Next steps
1. **Smoke-test with a real wallet on Base**, with a few dollars: supply USDC, supply ETH (gateway), dashboard, cash out, withdraw all (both paths).
2. **Gift cards via Bitrefill.** Their US catalog appears to include Domino's, Pizza Hut and Papa John's, plus DoorDash, Uber Eats and Grubhub (from search results; not checked against live listings).
   - Email bd@bitrefill.com for Business API access. The questions to ask are in `plans/research-giftcards.md`.
   - Offering a pizza chain directly is more on-theme than DoorDash.
   - This is the first feature that needs a backend: the user pays USDC, then the backend buys the code and emails it.
3. Optional: a WalletConnect project ID, a custom domain, and a mobile check.
4. Later phases (from the plan): partner pizzerias paid in USDC, gifting pizza, Pizza Party Pools, and Za Loans (Aave borrow with "Crust Factor" UI).
