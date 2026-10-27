# Zaave: plan

> Aave, but the yield is pizza. Stake stablecoins, keep your principal, and get a set number of pizzas every month.

## 1. The idea in one paragraph

You pick how many pizzas a month you want and what a pie costs where you live. Zaave tells you how much to stake. Your deposit goes into Aave v3 and earns interest there. Once a month, on **Za Day**, the interest is turned into **slices** (8 slices = 1 pie), and you spend them on real pizza. You can withdraw your principal at any time. This is a "no-loss" product: the pizza is paid for by your yield, never by your deposit.

```
Want 2 pizzas/mo × $25/pie × 12 = $600/yr of yield needed
At 4.5% APY → stake ≈ $13,333 USDC
At 4.5% APY → 1 pie/mo ≈ $6,667 staked
```

## 2. Pizza-themed vocabulary (also the UI copy)

| Aave | Zaave |
|---|---|
| aToken (aUSDC) | **zaUSDC**, a receipt token for your stake |
| Supply APY | **Pies Per Month (PPM)** |
| Interest | **Slices** (1 slice = 1/8 pie) |
| Health factor (phase 3) | **Crust Factor** |
| Liquidation (phase 3) | **Getting Sliced** |
| Harvest | **Za Day** (the 1st of each month; May 22 / Bitcoin Pizza Day gets a bonus) |

## 3. How it works

```
User USDC ──deposit──► ZaaveVault (ERC-4626, zaUSDC) ──supply──► Aave v3 Pool (Base)
                            │                                    │
                            │◄──────── aUSDC accrues interest ───┘
                            │
                  Za Day keeper: harvest(yield above principal)
                            │
                            ▼
                100% → user's pizza credit (no protocol fee)
                partial pies roll over to next month
                            │
     redeem ──► (a) DoorDash (or other delivery) gift card, bought with USDC
                (b) cash out as USDC (escape hatch)
                (c) later: partner pizzerias paid in USDC directly
```

### Key rules
- **Principal is sacred.** `withdraw()` always returns your deposit (less any Aave-level loss). Slices come only from yield.
- **Pizza target is a goal, not a promise.** Aave rates move. The dashboard shows a projected range ("1.6–2.3 pies/mo") and a "top up to stay at 2 pies" nudge when rates fall.
- **Partial slices carry over.** If you earn 0.7 of a pie, nothing is lost.
- **Each user sets their own pie price.** The default is $25, and you can change it to match your local pizza. On-chain, pizza credit is stored in USDC, and slices and pies are a per-user display unit (`slices = credit / (piePrice / 8)`). Changing your pie price changes how many pies you see and how much stake the calculator recommends, but never the USDC value you've earned.
- **No protocol fee and no token.** 100% of yield goes to stakers. There is no fee switch and no governance token.
- **Slices are non-transferable in v1.** This keeps it a reward, not a tradable token, which simplifies the legal picture. Gifting comes in phase 2.

## 4. Architecture

**Chain:** EVM, starting on Base. It's cheap, it has Aave v3 USDC, and it fits PizzaDAO's existing ecosystem. Develop on Base Sepolia. Keep the Aave pool, USDC and wrapper addresses in per-chain config so another Aave v3 chain (Arbitrum, Optimism, mainnet) is a deploy, not a rewrite.

### Smart contracts (Foundry, Solidity 0.8.x, OpenZeppelin)
| Contract | Role |
|---|---|
| `ZaaveVault` | ERC-4626 over USDC. Supplies into the Aave v3 Pool, holds aUSDC, and tracks `principal[user]` and `piePrice[user]` (default $25). The share token is zaUSDC. |
| `PizzaLedger` | Non-transferable, USDC-denominated pizza credit, written on harvest and burned on redeem. |
| `ZaDay` | `harvest()`: moves each user's yield above principal into pizza credit. Permissionless and callable once per epoch. A user-level checkpoint avoids looping over every user. |
| `RedemptionQueue` | `redeemForGiftCard(amount)` burns credit, moves the USDC to the fulfillment wallet, and emits an event the backend picks up. `cashOut(amount)` sends USDC straight to the user. |

Design notes:
- Yield is attributed per user with a **checkpoint/index pattern** (like Aave's liquidity index), so harvest is O(1) and never loops over users.
- Use Aave's `StataToken` (static aToken wrapper) or the Pool directly. The wrapper is preferred: it is already audited and ERC-4626.
- TVL cap and pause guardian ship in v1. Admin is a PizzaDAO multisig.

### App (Next.js App Router on Vercel)
- **Onboarding:** Privy or RainbowKit + wagmi/viem. Embedded wallets let non-crypto pizza fans sign up with email.
- **Pages:**
  - `/` Pizza calculator: "How many pizzas a month?" slider plus "What does your pie cost?" (default $25) → required stake at current APY.
  - `/stake` Deposit and withdraw.
  - `/dashboard` Pizza meter that fills slice by slice, next Za Day countdown, slice balance, projected PPM.
  - `/redeem` Get a DoorDash gift card code or cash out USDC.
- **Backend:** Vercel Functions read live APY from the Aave UI data provider and run the gift card fulfillment worker (it listens to `RedemptionQueue` events).
- **Keeper:** Vercel Cron on the 1st of each month calls `harvest()`, with Gelato as a backup. Anyone can call it, so a missed run is never fatal.
- **Data:** Neon Postgres (Marketplace) for redemption status, gift card delivery, and email notifications ("Your pizzas are ready 🍕").

### Turning USDC into pizza (needs research before phase 1)
The pizzeria network isn't ready, so v1 redeems through delivery-app gift cards. Candidates to evaluate:

| Route | How it works | Questions |
|---|---|---|
| **Bitrefill** | Sells DoorDash and Uber Eats gift cards for crypto and has a business API | Does it accept USDC on Base? API access terms, fees, US/regional availability |
| **Gift card APIs** (Tremendous, Tango Card, Giftbit) | Fiat-funded catalog that includes DoorDash | Needs a USDC → USD off-ramp (Coinbase Business / Bridge) to fund the balance; KYC and float management |
| **DoorDash direct** | DoorDash for Business / gift card bulk purchase | Minimums, whether codes can be issued programmatically |
| **USDC cash-out** | User gets USDC and buys their own pizza | Always available as a fallback |

Pick the route with the fewest custody and compliance steps; Bitrefill is the first one to check. Whatever route is chosen, the user's credit is burned on-chain before a code is issued, and the backend never holds more than a small float.

## 5. Phases

### Phase 0: Prototype (testnet, about 2 weeks)
- Foundry repo, `ZaaveVault` + `SliceLedger` + `ZaDay` against Aave v3 on Base Sepolia.
- Fork tests on a Base mainnet fork: deposit → time-warp 30 days → harvest → slices ≈ expected.
- Next.js app with calculator, stake, and dashboard on a Vercel preview.

### Phase 1: MVP mainnet (capped)
- TVL cap of $50k and a USDC-only market.
- Redemption through **DoorDash gift cards** (route chosen from the research above) plus the USDC cash-out escape hatch.
- An audit or competitive review (Code4rena / Cantina) before the cap is raised.

### Phase 2: More ways to get pizza
- **Partner pizzerias** paid in USDC directly (`PizzeriaRegistry`, allowlisted payout addresses, redeem by QR), once PizzaDAO's pizzeria network is ready.
- More delivery apps and regions for gift cards.
- **Pizza gifting:** stake on behalf of a friend so they get the pies.
- **Pizza Party Pools:** a group pools its stake and the yield funds one shared monthly party, which fits PizzaDAO's Global Pizza Party.
- Additional assets: ETH (wstETH yield) and other stables.

### Phase 3: Za Loans (the "borrow" half of Aave)
- Borrow against your stake to fund a party *now*, repaid from future slices.
- Introduces the Crust Factor and Getting Sliced (liquidation). This adds real risk, so it only comes after phase 1 has run cleanly for a while.

## 6. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Smart contract bug | Build on audited Aave/StataToken, keep custom code small, audit, TVL cap, pause guardian |
| Aave rates drop and pizza targets are missed | Show ranges instead of promises, send top-up nudges, carry over partial slices |
| Legal: yield product or money transmission for gift cards | Pizza credit is non-transferable and there is no token. Prefer a provider that sells gift cards for crypto directly (so Zaave never handles fiat), and get legal review before launch. |
| Gift card provider outage or fraud | Burn-then-issue flow, small float, per-user redemption limits, USDC cash-out always available |
| Keeper failure | Permissionless `harvest()` and a backup keeper |

## 7. Decisions
1. **Chain:** EVM, Base first.
2. **Fulfillment:** the pizzeria network isn't ready; turn USDC into pizza via DoorDash-style gift cards (research route), with USDC cash-out as fallback.
3. **Protocol fee:** 0%.
4. **Pie price:** $25 default, adjustable per user.
5. **Governance token:** none.
6. **Repo layout:** monorepo (`contracts/` Foundry + `app/` Next.js).

## 8. First tasks (for TASKS.md once approved)
1. Scaffold the monorepo: Foundry `contracts/` and Next.js `app/`, linked to Vercel.
2. `ZaaveVault` on StataToken with principal tracking, plus unit tests.
3. `SliceLedger` + `ZaDay` harvest with the checkpoint index, plus fork tests.
4. Pizza calculator page with live Aave APY.
5. Stake/withdraw flow and dashboard pizza meter.
6. Research USDC → DoorDash gift card routes (Bitrefill first) and pick one.
7. `RedemptionQueue` + gift card fulfillment worker + USDC cash-out.
8. Vercel Cron keeper for Za Day.
9. Deploy to Base Sepolia, then a Vercel preview for review.
