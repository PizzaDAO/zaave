# Zaave: plan

> A pizza-themed front end for Aave. Supply USDC, keep your principal, and watch the interest turn into pizza.

## 1. The idea

You pick how many pizzas a month you want and what a pie costs where you live, and Zaave tells you how much USDC to supply. Your USDC goes **straight into Aave v3's USDC pool on Base**, from your own wallet. You hold the aUSDC, and Zaave never has custody. The interest is shown as pizza: **slices** (8 slices = 1 pie) at your own pie price. You can withdraw any time, either everything or just the interest ("cash out your pizza money").

```
Want 2 pizzas/mo × $25/pie × 12 = $600/yr of interest needed
At 3.9% APY → supply ≈ $15,400 USDC
```

There is no Zaave smart contract, no fee and no token. The yield is entirely Aave's.

## 2. Vocabulary (UI copy)

| Aave | Zaave |
|---|---|
| Supply APY | **Pies Per Month** |
| Interest earned | **Pizza money**, shown as pies and **slices** (1 slice = 1/8 pie) |
| Health factor (phase 3) | **Crust Factor** |
| Liquidation (phase 3) | **Getting Sliced** |

## 3. How it works

```
User wallet ──supply USDC──► Aave v3 Pool (Base) ──► user holds aUSDC (balance grows)
                                                         │
Zaave app reads: aUSDC balance − net principal = interest → pies/slices at the user's pie price
                                                         │
cash out pizza money ──► pool.withdraw(USDC, interest, user)  (principal stays in Aave)
```

- **Pie price** is set per user (default $25, saved in the browser). It only changes how the numbers are displayed.
- **Interest** is calculated in the app: lifetime interest when the Aave API provides history, otherwise interest since the user's last deposit or withdraw, read on-chain from the aToken's previous index.
- **Pizza target is a goal, not a promise.** Aave rates move, so the calculator shows a ±1 point APY range.

## 4. Architecture
- **App:** Next.js on Vercel (project `pizza-dao/zaave`), with wagmi, viem and RainbowKit. Users interact directly with the Aave Pool and the USDC/aUSDC contracts on Base.
- **Live APY:** read from `pool.getReserveData(USDC).currentLiquidityRate`.
- **No backend** in v1. Gift card fulfillment (below) is the first thing that will need one.

### Turning USDC into pizza
The pizzeria network isn't ready, so the first redemption route will be delivery-app gift cards. See `plans/research-giftcards.md`: the Bitrefill Business API is recommended and needs someone to email bd@bitrefill.com. Without a contract, a gift card flow would be: the user withdraws interest and sends USDC to a fulfillment address (or pays a Bitrefill invoice directly), then the backend issues the code. Until then, users cash out USDC.

## 5. Phases
1. **Now:** calculator, supply and withdraw, pizza dashboard, and cashing out pizza money on Base mainnet.
2. **Gift cards:** DoorDash via Bitrefill. Also email "your pizza is ready" notifications.
3. **More pizza:** partner pizzerias paid in USDC, gifting pizza to a friend, Pizza Party Pools, and more assets and chains.
4. **Za Loans:** borrowing against your supply through Aave's own borrow, with the Crust Factor and Getting Sliced UI.

## 6. Risks
| Risk | Note |
|---|---|
| Aave smart contract / USDC depeg / pool liquidity | These are Aave's risks. Zaave adds no contract risk. |
| Front-end compromise (malicious transaction) | Hardcoded, verified addresses; minimal dependencies; Vercel deploy protection on the team |
| Rates drop | Show ranges, not promises |
| Gift card legal / money transmission | Prefer a provider that takes crypto directly, and get legal review before launching gift cards |

## 7. Decisions
1. **Chain:** EVM, Base first.
2. **Model:** a pure front end on Aave v3. There's no custom contract; the earlier vault design is at the git tag `custom-vault-contract`.
3. **Fulfillment:** USDC cash-out now, DoorDash gift cards next.
4. **Fee:** 0%. **Token:** none.
5. **Pie price:** $25 default, adjustable per user.
