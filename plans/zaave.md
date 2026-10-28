# Zaave: plan

> A pizza-themed front end for Aave. Supply crypto, keep your principal, and watch the interest turn into pizza.

## 1. The idea

You pick how many pizzas a month you want and what a pie costs where you live, and Zaave tells you how much to supply. Your tokens go **straight into an Aave v3 pool**, from your own wallet: any asset Aave lets you supply, on any EVM network in Aave's address book (22 markets on 19 chains). You hold the aToken, and Zaave never has custody. By default the calculator picks the best stablecoin rate with at least $1M available to withdraw. The interest is shown as pizza: **slices** (8 slices = 1 pie) at your own pie price. You can withdraw any time, either everything or just the interest ("cash out your pizza money").

```
Want 2 pizzas/mo × $25/pie × 12 = $600/yr of interest needed
At 3.9% APY → supply ≈ $15,400
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
User wallet ──supply token──► Aave v3 Pool (any market) ──► user holds the aToken (balance grows)
                                                         │
Zaave app reads: aToken balance − net principal = interest → USD (Aave oracle price) → pies/slices at the user's pie price
                                                         │
cash out pizza money ──► pool.withdraw(token, interest, user)  (principal stays in Aave)
```

- **Native gas tokens** (ETH, BNB, AVAX, POL…) go through Aave's WrappedTokenGateway, so users don't wrap first.
- **Non-stablecoins:** pizza value moves with the asset's price, and the app says so.
- **Pie price** is set per user (default $25, saved in the browser). It only changes how the numbers are displayed.
- **Interest** is calculated in the app: lifetime interest when the Aave API provides history, otherwise interest since the user's last deposit or withdraw, read on-chain from the aToken's previous index.
- **Pizza target is a goal, not a promise.** Aave rates move, so the calculator shows a ±1 point APY range.

## 4. Architecture
- **App:** Next.js on Vercel (project `pizza-dao/zaave`), with wagmi, viem and RainbowKit. Users interact directly with Aave's Pool, gateway and token contracts. Every transaction target comes from the pinned `@bgd-labs/aave-address-book`, generated into `app/src/lib/markets.generated.ts`.
- **Live data:** rates, liquidity, caps and prices from each market's UiPoolDataProvider; balances from its WalletBalanceProvider; lifetime interest from Aave's GraphQL history API where available.
- **No backend** in v1. Gift card fulfillment (below) is the first thing that will need one.

### Turning USDC into pizza
The pizzeria network isn't ready, so the first redemption route will be delivery-app gift cards. See `plans/research-giftcards.md`: the Bitrefill Business API is recommended and needs someone to email bd@bitrefill.com. Without a contract, a gift card flow would be: the user withdraws interest and sends USDC to a fulfillment address (or pays a Bitrefill invoice directly), then the backend issues the code. Until then, users cash out USDC.

## 5. Phases
1. **Done:** calculator, supply and withdraw, pizza dashboard, and cashing out pizza money, for every Aave v3 asset and network (started on Base USDC).
2. **Gift cards:** DoorDash via Bitrefill. Also email "your pizza is ready" notifications.
3. **More pizza:** partner pizzerias paid in USDC, gifting pizza to a friend, Pizza Party Pools.
4. **Za Loans:** borrowing against your supply through Aave's own borrow, with the Crust Factor and Getting Sliced UI.

## 6. Risks
| Risk | Note |
|---|---|
| Aave smart contracts / asset depeg or price drop / pool liquidity | These are Aave's and the asset's risks. Zaave adds no contract risk. |
| Front-end compromise (malicious transaction) | Hardcoded, verified addresses; minimal dependencies; Vercel deploy protection on the team |
| Rates drop | Show ranges, not promises |
| Gift card legal / money transmission | Prefer a provider that takes crypto directly, and get legal review before launching gift cards |

## 7. Decisions
1. **Chain:** EVM. Started on Base; now every Aave v3 market in the address book.
2. **Model:** a pure front end on Aave v3. There's no custom contract; the earlier vault design is at the git tag `custom-vault-contract`.
3. **Fulfillment:** USDC cash-out now, DoorDash gift cards next.
4. **Fee:** 0%. **Token:** none.
5. **Pie price:** $25 default, adjustable per user.
