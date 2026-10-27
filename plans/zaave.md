# Zaave: plan

> Aave, but the yield is pizza. Stake stablecoins, keep your principal, and get a set number of pizzas every month.

## 1. The idea in one paragraph

You pick how many pizzas a month you want. Zaave tells you how much to stake. Your deposit goes into Aave v3 and earns interest there. Once a month, on **Za Day**, the interest is turned into **slices** (8 slices = 1 pie), and you spend them on real pizza. You can withdraw your principal at any time. This is a "no-loss" product: the pizza is paid for by your yield, never by your deposit.

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
| Treasury fee | **Tip jar** (goes to PizzaDAO) |

## 3. How it works

```
User USDC ──deposit──► ZaaveVault (ERC-4626, zaUSDC) ──supply──► Aave v3 Pool (Base)
                            │                                    │
                            │◄──────── aUSDC accrues interest ───┘
                            │
                  Za Day keeper: harvest(yield above principal)
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
       90% → user      10% → tip jar   leftovers roll over
       Slices balance   (PizzaDAO)     to next month
             │
     redeem slices ──► (a) partner pizzeria paid in USDC (on-chain QR)
                       (b) gift card (Domino's / local chains) via API
                       (c) cash out as USDC (escape hatch)
```

### Key rules
- **Principal is sacred.** `withdraw()` always returns your deposit (less any Aave-level loss). Slices come only from yield.
- **Pizza target is a goal, not a promise.** Aave rates move. The dashboard shows a projected range ("1.6–2.3 pies/mo") and a "top up to stay at 2 pies" nudge when rates fall.
- **Partial slices carry over.** If you earn 0.7 of a pie, nothing is lost.
- **Pie price is fixed by governance** (start at $25 USDC/pie, adjustable later by PizzaDAO vote). Regional pricing is out of scope for v1.
- **Slices are non-transferable in v1.** This keeps it a reward, not a tradable token, which simplifies the legal picture. Gifting comes in phase 2.

## 4. Architecture

**Chain:** Base. It's cheap, it has Aave v3 USDC, and it fits PizzaDAO's existing ecosystem. Develop on Base Sepolia.

### Smart contracts (Foundry, Solidity 0.8.x, OpenZeppelin)
| Contract | Role |
|---|---|
| `ZaaveVault` | ERC-4626 over USDC. Supplies into the Aave v3 Pool, holds aUSDC, and tracks `principal[user]`. The share token is zaUSDC. |
| `SliceLedger` | Non-transferable slice balances, written by the vault on harvest and burned on redeem. |
| `ZaDay` | `harvest()`: computes each user's yield above principal, mints slices, and sends the fee to the tip jar. Permissionless and callable once per epoch. A user-level checkpoint avoids looping over every user. |
| `PizzeriaRegistry` | Allowlisted pizzeria payout addresses. `redeemAtPizzeria(pizzeria, slices)` burns slices and pays USDC directly. |
| `RedemptionQueue` | Burns slices for off-chain fulfillment (gift cards) and emits an event the backend picks up. |

Design notes:
- Yield is attributed per user with a **checkpoint/index pattern** (like Aave's liquidity index), so harvest is O(1) and never loops over users.
- Use Aave's `StataToken` (static aToken wrapper) or the Pool directly. The wrapper is preferred: it is already audited and ERC-4626.
- TVL cap and pause guardian ship in v1. Admin is a PizzaDAO multisig.

### App (Next.js App Router on Vercel)
- **Onboarding:** Privy or RainbowKit + wagmi/viem. Embedded wallets let non-crypto pizza fans sign up with email.
- **Pages:**
  - `/` Pizza calculator: "How many pizzas a month?" slider → required stake at current APY.
  - `/stake` Deposit and withdraw.
  - `/dashboard` Pizza meter that fills slice by slice, next Za Day countdown, slice balance, projected PPM.
  - `/redeem` Choose a pizzeria near you, a gift card, or USDC.
  - `/pizzerias` Partner map.
- **Backend:** Vercel Functions read live APY from the Aave UI data provider and run the gift card fulfillment worker (it listens to `RedemptionQueue` events).
- **Keeper:** Vercel Cron on the 1st of each month calls `harvest()`, with Gelato as a backup. Anyone can call it, so a missed run is never fatal.
- **Data:** Neon Postgres (Marketplace) for pizzeria metadata, redemption status, and email notifications ("Your pizzas are ready 🍕").

## 5. Phases

### Phase 0: Prototype (testnet, about 2 weeks)
- Foundry repo, `ZaaveVault` + `SliceLedger` + `ZaDay` against Aave v3 on Base Sepolia.
- Fork tests on a Base mainnet fork: deposit → time-warp 30 days → harvest → slices ≈ expected.
- Next.js app with calculator, stake, and dashboard on a Vercel preview.

### Phase 1: MVP mainnet (capped)
- TVL cap of $50k and a USDC-only market.
- Redemption through **partner pizzerias** (PizzaDAO's existing pizzeria network, paid in USDC) plus the USDC cash-out escape hatch.
- Tip jar → PizzaDAO multisig.
- An audit or competitive review (Code4rena / Cantina) before the cap is raised.

### Phase 2: More ways to get pizza
- Gift card fulfillment (Tremendous / Giftbit-style API).
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
| Legal: yield product or money transmission for gift cards | Slices are non-transferable rewards and there is no token sale. Get legal review before phase 2 gift cards, and start with direct pizzeria payouts. |
| Pizzeria fraud or non-delivery | Allowlisted registry, per-pizzeria redemption caps, user ratings |
| Keeper failure | Permissionless `harvest()` and a backup keeper |

## 7. Open questions for Snax
1. **Chain:** Base OK? Arbitrum and Optimism also have Aave v3 USDC.
2. **Fulfillment for v1:** Is PizzaDAO's pizzeria network ready to accept USDC redemptions, or should we lead with gift cards or USDC cash-out?
3. **Tip jar %:** 10% to PizzaDAO treasury, or 0% at launch for growth?
4. **Pie price:** a flat $25 or another number?
5. **Governance token:** none planned (recommended) unless PizzaDAO wants a $ZA tie-in.
6. **Repo layout:** a monorepo (`contracts/` Foundry + `app/` Next.js), which is the recommendation.

## 8. First tasks (for TASKS.md once approved)
1. Scaffold the monorepo: Foundry `contracts/` and Next.js `app/`, linked to Vercel.
2. `ZaaveVault` on StataToken with principal tracking, plus unit tests.
3. `SliceLedger` + `ZaDay` harvest with the checkpoint index, plus fork tests.
4. Pizza calculator page with live Aave APY.
5. Stake/withdraw flow and dashboard pizza meter.
6. `PizzeriaRegistry` + redeem-at-pizzeria flow.
7. Vercel Cron keeper for Za Day.
8. Deploy to Base Sepolia, then a Vercel preview for review.
