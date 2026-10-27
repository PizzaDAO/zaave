# Zaave handoff (2026-10-27)

## What it is
A pizza-themed front end for **Aave v3's USDC pool on Base**. Users supply USDC from their own wallet, hold aUSDC, and the app shows their interest as pizza (pies and slices at a pie price each user sets). There's no Zaave smart contract, no fee and no token.

- **Live:** https://zaave.vercel.app (Vercel project `pizza-dao/zaave`, PizzaDAO team)
- **Repo:** https://github.com/PizzaDAO/zaave (public). The app is in `app/`, and plans are in `plans/`.
- **Plan:** `plans/zaave.md`. **Gift card research:** `plans/research-giftcards.md`.

## Status
| Area | State |
|---|---|
| Calculator (`/`) | Done. Reads the live Aave USDC APY on Base and has a pies ↔ USDC mode toggle on the amount field. Verified in a browser. |
| Stake (`/stake`) | Built: approve USDC to the Aave Pool, `supply`, `withdraw` / withdraw all (max uint). **Not yet tested with a real wallet.** |
| Dashboard (`/dashboard`) | Built: aUSDC balance, pizza meter, pies/slices earned, projected pies/month. Untested with a wallet. |
| Redeem (`/redeem`) | Built: "cash out pizza money" withdraws only the interest. Gift cards show "coming soon". Untested with a wallet. |
| About (`/about`) | Done |
| Mobile (375px) | Not checked. Run `/mobile-check`. |

## How it works (code map)
- `app/src/lib/addresses.ts`: per-chain config. Base 8453 is the default. Base Sepolia 84532 is optional and has no lifetime history.
  - Base Pool `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`
  - USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - aUSDC `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB`
  - All three were verified on-chain.
- `app/src/lib/abis.ts`: minimal Aave Pool and aToken ABIs.
- `app/src/lib/interest.ts`: "pizza money" (interest).
  - **All-time (default):** aUSDC balance minus the sum of supplies since the user last fully exited. History comes from Aave's GraphQL API (`https://api.v3.aave.com/graphql`, `userTransactionHistory`), called client-side.
  - **Fallback:** an exact on-chain figure for interest since the last action, `balanceOf − rayMul(scaledBalanceOf, getPreviousIndex)`. The UI labels which basis it's showing.
- `app/src/lib/hooks.ts`: `usePizzaMoney`, `usePiePrice` (localStorage, default $25, bounded $1 to $1,000) and `useTx`.
  - After an in-app transaction, history is treated as stale until Aave's API shows an event at or after that time (10 minutes at most). Without this, a fresh deposit would briefly read as cashable interest.
- `app/src/lib/pizza.ts`: slice and pie math in bigint. 8 slices = 1 pie.

## Known limitations
- A partial withdrawal of principal looks the same as cashing out interest, so pizza money reads 0 until the balance grows back above what was supplied.
- aUSDC transferred in from another wallet counts as interest. Aave's API has no transfer history.
- The public Base RPC is rate limited. Set `NEXT_PUBLIC_RPC_8453` to a paid RPC if reads get flaky.
- Without `NEXT_PUBLIC_WC_PROJECT_ID`, only browser-extension (injected) wallets connect, with no WalletConnect QR.

## Run / deploy
```bash
cd app && pnpm install && pnpm dev     # pnpm 12, node 24
pnpm lint && pnpm build
vercel-deploy --prod                   # from app/ (linked to pizza-dao/zaave)
```
- `app/pnpm-workspace.yaml` `allowBuilds` must keep sharp, unrs-resolver, bufferutil, keccak and utf-8-validate set to `false`. Without that, pnpm 12 fails the Vercel install with `ERR_PNPM_IGNORED_BUILDS`.
- `next.config.ts` aliases RainbowKit's optional `@x402/*` imports to `src/lib/empty-module.ts`. Keep this when upgrading wagmi or RainbowKit.
- Vercel env: `NEXT_PUBLIC_DEFAULT_CHAIN=8453` (production and preview).

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
