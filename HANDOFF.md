# Zaave handoff (2026-10-27)

## What it is
A pizza-themed front end for **Aave v3's USDC markets on every EVM network that has one** (17 chains, 20 markets, 25 USDC-family reserves). Users supply USDC from their own wallet, hold aUSDC, and the app shows their interest as pizza (pies and slices at a pie price each user sets). There's no Zaave smart contract, no fee and no token.

- **Live:** https://zaave.vercel.app (Vercel project `pizza-dao/zaave`, PizzaDAO team)
- **Repo:** https://github.com/PizzaDAO/zaave (public). The app is in `app/`, and plans are in `plans/`.
- **Plan:** `plans/zaave.md` (still describes the Base-only v1). **Gift card research:** `plans/research-giftcards.md`.

## Status
| Area | State |
|---|---|
| Calculator (`/`) | Best live USDC APY across all chains by default, "Rates by network" list to pick one. Pies ↔ USDC mode toggle. |
| Stake (`/stake`) | Network + reserve picker (default: largest position, else best APY). Switches the wallet chain, then approve / `supply` / `withdraw` / withdraw all. **Not tested with a real wallet.** |
| Dashboard (`/dashboard`) | Totals across all chains (balance, pizza money, projected pies/month, meter) plus a per-network breakdown. Untested with a wallet (read path tested in node, see below). |
| Redeem (`/redeem`) | One "Cash out" per reserve with interest > 0 (switches chain, withdraws exactly that interest). Untested with a wallet. |
| About (`/about`) | Updated for multi-network |
| Mobile (375px) | Not checked. Run `/mobile-check`. |

## How it works (code map)
- `app/scripts/gen-markets.mjs` generates `app/src/lib/markets.generated.ts` (committed) from the pinned devDependency `@bgd-labs/aave-address-book@4.44.22`. **This is the only source of transaction-target addresses**; nothing is fetched at runtime. Re-run `node scripts/gen-markets.mjs` after bumping the package. It also holds the bridged-USDC list and market names, and emits the static `NEXT_PUBLIC_RPC_<chainId>` map.
- `app/scripts/verify-markets.mjs` re-checks every reserve on-chain (aToken `UNDERLYING_ASSET_ADDRESS()`/`POOL()`, decimals, frozen/paused flags). `app/scripts/check-reads.mts` (`pnpm dlx tsx scripts/check-reads.mts 0xUser`) runs the cross-chain read path in node. `app/scripts/bundle-size.mjs` prints first-load JS after a build.
- `app/src/lib/markets.ts`: flattens markets into `RESERVES` (key `<chainId>-<market>-<symbol>`), the wagmi `CHAINS`, labels, explorer URLs, and which markets use Aave's history API. `NEXT_PUBLIC_ENABLE_TESTNETS=1` adds Base Sepolia.
- `app/src/lib/rpc-defaults.ts`: default public RPC per chain. Override with `NEXT_PUBLIC_RPC_<chainId>`.
- `app/src/lib/market-reads.ts`: pure call-list builder and parser (shared by hooks and the node script). Per reserve: pool `getReserveData` (APY, active/frozen/paused bits), and with a wallet the aToken `balanceOf` / `scaledBalanceOf` / `getPreviousIndex`.
- `app/src/lib/hooks.ts`: `useMarketData` (one `useReadContracts`, wagmi makes one multicall per chain, `allowFailure`, 30 s poll, a chain whose reserves all fail is listed as unreachable), `usePortfolio` (positions + interest per reserve), `useWalletReserve`, `usePiePrice`, `useTx` (switches chain before writing).
- `app/src/lib/interest.ts`: interest = aToken balance minus supplies since the user last fully exited, from Aave's GraphQL `userTransactionHistory` (one request per market where the user holds a balance, split by reserve underlying), else the on-chain since-last-action figure. The UI labels the basis per reserve.
  - History API works for 16 of the 20 markets. **Metis, Mantle, Celo and Ink are not served** (`NO_HISTORY_CHAINS` in `markets.ts`), so they always use the since-last-action basis.
  - After an in-app tx, history for that reserve is ignored until the API shows an event at or after that time (10 minutes at most), tracked per reserve.
- `app/src/lib/pizza.ts`: slice/pie math in bigint; `toUsdc6` normalizes any reserve's decimals to 6 for totals. Per-reserve amounts and all transactions stay in the reserve's own decimals (BNB Chain's USDC is 18).
- Frozen reserves (Aave closed them to deposits: 10 legacy/bridged ones) are hidden from rates and the stake picker unless the user holds a balance there, and are withdraw-only.

## Known limitations
- A partial withdrawal of principal looks the same as cashing out interest, so pizza money reads 0 until the balance grows back above what was supplied.
- aUSDC transferred in from another wallet counts as interest. Aave's API has no transfer history.
- Public RPCs are rate limited and some are flaky. Set `NEXT_PUBLIC_RPC_<chainId>` for any chain that misbehaves (especially 1, 8453, 42161).
- Bridged labels (`bridged: true`) are a hand-kept list in `gen-markets.mjs`, checked against on-chain names. Ink's USDC is treated as native (unconfirmed).
- Aave X Layer and Monad markets exist in Aave's API but not in address-book 4.44.22, so they're not supported yet. Plasma and MegaETH are in the book with no USDC reserve.
- Supply caps are not checked before a deposit; Aave will revert if a cap is hit.
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
1. **Smoke-test with a real wallet on Base**, with a few dollars: supply → dashboard → cash out → withdraw all.
2. **Gift cards via Bitrefill.** Their US catalog appears to include Domino's, Pizza Hut and Papa John's, plus DoorDash, Uber Eats and Grubhub (from search results; not checked against live listings).
   - Email bd@bitrefill.com for Business API access. The questions to ask are in `plans/research-giftcards.md`.
   - Offering a pizza chain directly is more on-theme than DoorDash.
   - This is the first feature that needs a backend: the user pays USDC, then the backend buys the code and emails it.
3. Optional: a WalletConnect project ID, a custom domain, and a mobile check.
4. Later phases (from the plan): partner pizzerias paid in USDC, gifting pizza, Pizza Party Pools, and Za Loans (Aave borrow with "Crust Factor" UI).
