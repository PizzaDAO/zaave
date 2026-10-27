# Research: USDC to DoorDash (etc.) gift cards for Zaave (2026-10-27)

Not signed up for anything. Items marked UNCONFIRMED could not be verified from public docs.

## Comparison

| Provider | API? | DoorDash US | Fund / pay with | Notes |
|---|---|---|---|---|
| Bitrefill Business API | Yes, but not self-serve: email bd@bitrefill.com, get API ID/Secret ([docs](https://docs.bitrefill.com/docs/Common%20Use%20Cases)) | Yes, "DoorDash USA", $10-$200 + custom, instant email ([page](https://www.bitrefill.com/us/en/gift-cards/doordash-usa/)) | Consumer checkout lists USDC, Base, Solana, Polygon. Business API: pre-fund balance via `account deposits` (USD/EUR/BTC currencies; "all crypto methods"; USDC/Base for the API path UNCONFIRMED), then `POST /invoices/{id}/pay` from balance ([deposits](https://docs.bitrefill.com/docs/account-deposits)) | Volume-based custom pricing/discounts; webhooks for delivery; codes via `GET /orders/{id}`. No discount shown on the DoorDash page. Best fit: crypto-native, no off-ramp. |
| Bitrefill via Base/Coinbase agent plugin | Wallet-MCP plugin ([Base docs](https://docs.base.org/agents/skills/plugins/bitrefill)) | Listed examples Amazon/Steam/Uber; DoorDash UNCONFIRMED | USDC on Base per-order | Agent/MCP oriented; docs have moved to CDP, I could not read details. Possible fallback, not a v1 base. |
| Coinsbee | API/reseller program UNCONFIRMED | Listed under Food and Grocery ([press](https://decrypt.co/323412/coinsbee-surpasses-5000-gift-card-brands-becoming-the-largest-crypto-gift-card-platform-worldwide?amp=1)) | Many coins, no KYC for buyers | Consumer storefront; no confirmed programmatic path. |
| Cryptorefills / CoinCards / Ripio | Nothing found | Unknown | Unknown | UNCONFIRMED; not researched further. |
| GIFQ | Yes: single or bulk via API ([page](https://www.gifq.com/brands/doordash-usa)) | Yes, US-only | Funding method UNCONFIRMED | Reseller; terms say no resale/return. Ask if they take USDC. |
| Tremendous | Yes | DoorDash in catalog UNCONFIRMED | Prefunded balance, fiat only (USD/CAD/EUR/GBP), topped up by bank/wire/card ([docs](https://developers.tremendous.com/docs/paying-for-orders)) | Needs an off-ramp. |
| Runa | Yes ([docs](https://developer.runa.io/docs)) | DoorDash appears in brand list ([API page](https://runa.io/payouts-api)) | Funding methods incl. stablecoin UNCONFIRMED | Contact sales; worth asking about USDC funding. |
| Tango Card, Giftbit | Yes (known products) | Giftbit has a bulk-DoorDash marketing page ([blog](https://www.giftbit.com/blog/bulk-doordash-gift-cards)); Tango UNCONFIRMED | Fiat prefund (assumed; UNCONFIRMED) | Need an off-ramp. |
| DoorDash for Business | No public API found | Native, $15-$500 digital, bulk ([blog](https://business.doordash.com/en-ca/blog/buy-gift-cards-in-bulk)); Blackhawk B2B program ([press](https://www.businesswire.com/news/home/20241029783826/en)) | Fiat invoice/card | Manual/B2B portal only; no automation. Uber Eats / Grubhub / Domino's availability on any of these: UNCONFIRMED except where listed above. |

Off-ramp if a fiat API is chosen: Bridge (USDC to USD via ACH/wire, liquidation addresses; business KYB required; partner-quoted fees roughly $0.50-$20 + ~0.5%, unofficial) ([Bridge docs](https://apidocs.bridge.xyz/docs/usd-integration-guide), [Squads summary](https://docs.squads.so/main/getting-started/on-and-off-ramp/bridge-off-ramp)). Coinbase Business off-ramp: UNCONFIRMED. A fiat route adds a 1-3 day settlement delay, so it needs a standing prefunded balance.

## Recommended v1: Bitrefill Business API, balance model

Why: only option confirmed to have DoorDash USA, an API, webhooks, and crypto-funded balances, with no fiat off-ramp or bank account in the loop.

Human steps (project owner):
1. Email bd@bitrefill.com: use case (consumer rewards app, US users, DoorDash/Uber Eats/Grubhub/Domino's, expected monthly volume). Ask in the same email: (a) is USDC on Base accepted for API balance deposits, and which deposit address type (per-invoice or static); (b) wholesale discount/fees; (c) KYB required?; (d) per-order and daily limits; (e) which of the four brands are in the US catalog; (f) is resale to end users permitted, and any terms on the gift card being "purchased on behalf of" the user.
2. Complete any Bitrefill KYB, receive API ID/Secret, store in the backend secret manager (never in the repo).
3. Fund the balance with a small amount of USDC (start with ~$100-200), set a low-balance alert.
4. Get a short legal read (see Regulatory) before launch.

Backend (watcher service, e.g. Node + viem on a small always-on worker or a Vercel cron/queue):
1. Subscribe to `GiftCardRequested(requestId, user, amount)` via `getLogs`/`watchContractEvent` on Base; wait N confirmations (e.g. 5-10 blocks; Base reorgs are rare), persist the last processed block.
2. Idempotency: DB row keyed on `requestId` (status: seen, ordered, delivered, failed). Never place a second Bitrefill order for the same `requestId`.
3. Validate: amount within allowed range/denominations, user's email on file (collected at request time in the app and linked to `user` address, or read from the app DB), per-user and global daily caps.
4. Look up product: `GET /products` (or search) for the DoorDash USA product id; check the value is in range.
5. `POST /invoices` with the product id, value, quantity 1, and `auto_pay` / then `POST /invoices/{id}/pay` from balance (exact field names to be checked against the Bitrefill API reference once credentials arrive).
6. Receive the webhook (or poll `GET /orders/{id}`) for delivered status and read the redemption code/link.
7. Email the code to the user (Resend/Postmark), with the code never logged; mark row delivered. Optionally write a delivered hash/flag on-chain or in-app.
8. Failure path: if the order fails or the balance is insufficient, mark failed, alert the operator, and have the contract's refund/cancel path (if any) triggered by the owner role; do not retry blindly.
9. Treasury: the contract's USDC (yield-earned "prize" side, since the app is no-loss) is swept by a multisig/relayer to the Bitrefill deposit address periodically (manual at first); keep the balance a buffer of a few days of expected demand. Keep the sweep a separate privileged action from the watcher key.

Tradeoff: Bitrefill buffer balance is a small custodial float (the project holds USDC at Bitrefill); keep it minimal. Per-order alternative (pay each invoice directly in USDC on Base) removes the float, but is UNCONFIRMED for the Business API.

Fallbacks: Runa (ask about stablecoin funding, DoorDash listed), GIFQ API. Tremendous/Giftbit/Tango only if you accept a Bridge off-ramp plus a fiat prefund.

## Regulatory (high level, not legal advice)
- Money transmission: if users send value and the project converts or delivers value to them, FinCEN/state MTL questions can arise. Gift cards for goods are generally treated as purchases from a merchant, but a prize/"redemption" funded from pooled user deposits is a grey area. Delivering a closed-loop gift card (DoorDash-only) bought from a licensed reseller is lower risk than sending cash or crypto.
- Gift card resale: Bitrefill/GIFQ terms may restrict commercial resale; get written permission via the Business program (question f above).
- Sweepstakes/prize-linked savings: the no-loss lottery framing has its own state gambling/PLS rules (outside this scope, but flag it to counsel).
- Sales tax/tax reporting for prizes (1099-MISC over $600) may apply.
- Privacy: collecting emails and linking to wallet addresses; handle per CCPA.
