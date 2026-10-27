# Zaave v1 build spec

This file is the contract between `contracts/` and `app/`. Both sides build against the interface below. Product context is in `plans/zaave.md`.

## Repo layout
```
contracts/   Foundry project (Solidity ^0.8.24, OpenZeppelin v5)
app/         Next.js App Router (TypeScript, Tailwind, wagmi v2 + viem + RainbowKit)
plans/       Plans (do not edit from build tasks)
```

## Change from plan: no ERC-4626 / transferable zaUSDC
A user's stake is split into principal and yield. Transferable shares would break that split, so v1 uses internal, non-transferable shares in a single contract, `Zaave`.

## Accounting model
- **Assets** = `aUSDC.balanceOf(address(this))`. Pizza credit backing is held separately as idle USDC.
- **Shares:** `shares[user]` and `totalShares`, using the virtual offset to block inflation attacks:
  `toShares(a) = a * (totalShares + 1e6) / (totalAssets + 1)` (rounded down on deposit, up on withdraw).
- `principal[user]` is the USDC the user deposited minus what they withdrew.
- `value(user) = toAssets(shares[user])`.
- **Za Day epochs:** `zaDay()` is permissionless and callable once the current UTC calendar month is later than the last Za Day's month (use a `BokkyPooBah`-style timestamp → year/month, or the simpler rule `block.timestamp >= lastZaDay + 28 days` plus month change; any correct, tested rule works). It increments `epoch` and stores `epochSharePrice[epoch]` = assets per 1e18 shares, at the current price.
- **Harvest (lazy, O(1) per user):** `harvest(user)` is permissionless and also runs automatically at the start of deposit, withdraw and redeem.
  - If `harvestedEpoch[user] < epoch`, compute `epochValue = shares[user] * epochSharePrice[epoch] / 1e18`.
  - If `epochValue > principal[user]`, then `y = epochValue - principal[user]`.
  - Burn `toSharesUp(y)` shares at the current price (capped at the user's shares).
  - `pool.withdraw(USDC, y, address(this))`, then `credit[user] += y` and `totalCredit += y`.
  - Set `harvestedEpoch[user] = epoch`.
  - Edge: a user who deposits after a Za Day must not be credited yield from before their deposit. Their shares were bought at the current price, so `epochValue` can't exceed principal from old yield, as long as deposits in the same epoch also run harvest first. Test this.
- **Deposit(amount):** harvest, pull USDC, `pool.supply`, mint shares, `principal += amount`. Enforce `tvlCap` (total principal) and `whenNotPaused`.
- **Withdraw(amount):** harvest, require `amount <= principal[user]` and `amount <= value(user)`, burn `toSharesUp(amount)`, `principal -= amount`, `pool.withdraw` to user. Works even when paused, because principal is sacred. `withdrawAll()` withdraws `min(principal, value)`. Leftover yield shares stay and are credited next Za Day.
- **Pie price:** `piePrice[user]` in USDC with 6 decimals. 0 means the default `DEFAULT_PIE_PRICE = 25e6`. `setPiePrice(uint256)` takes a value between 1e6 and 1000e6. It is display only and never changes credit.
- **Redeem:**
  - `cashOut(amount)`: harvest, debit credit, send USDC to the user.
  - `redeemForGiftCard(amount)`: harvest, debit credit, send USDC to `fulfillment`, emit `GiftCardRequested(requestId++, user, amount)`. Disabled while `fulfillment == address(0)`.
- **Admin (Ownable2Step, PizzaDAO multisig later):** `setTvlCap`, `setFulfillment`, `pause` / `unpause` (deposits and gift cards only). There is no fee and no way for the admin to take user funds. Add a `rescue(token)` for tokens other than USDC and aUSDC only.

## Public interface (the app depends on these exact names)
```solidity
// views
function USDC() external view returns (address);
function AUSDC() external view returns (address);
function POOL() external view returns (address);
function epoch() external view returns (uint256);
function lastZaDay() external view returns (uint256);
function nextZaDayAt() external view returns (uint256);   // earliest timestamp zaDay() can succeed
function totalPrincipal() external view returns (uint256);
function totalCredit() external view returns (uint256);
function totalAssets() external view returns (uint256);   // aUSDC held
function tvlCap() external view returns (uint256);
function principal(address) external view returns (uint256);
function shares(address) external view returns (uint256);
function credit(address) external view returns (uint256);
function piePriceOf(address) external view returns (uint256);   // resolves default
function pendingYield(address) external view returns (uint256); // live, unharvested: value - principal (0 floor)
function claimableYield(address) external view returns (uint256); // what harvest() would credit now
function fulfillment() external view returns (address);
// writes
function deposit(uint256 amount) external;
function withdraw(uint256 amount) external;
function withdrawAll() external;
function harvest(address user) external;
function zaDay() external;
function setPiePrice(uint256 price) external;
function cashOut(uint256 amount) external;
function redeemForGiftCard(uint256 amount) external returns (uint256 requestId);
// events
event Deposited(address indexed user, uint256 amount, uint256 shares);
event Withdrawn(address indexed user, uint256 amount, uint256 shares);
event Harvested(address indexed user, uint256 indexed epoch, uint256 amount);
event ZaDay(uint256 indexed epoch, uint256 sharePrice, uint256 timestamp);
event PiePriceSet(address indexed user, uint256 price);
event CashedOut(address indexed user, uint256 amount);
event GiftCardRequested(uint256 indexed requestId, address indexed user, uint256 amount);
```

## Addresses
Use `bgd-labs/aave-address-book` (forge dependency) for Base (`AaveV3Base`) and Base Sepolia (`AaveV3BaseSepolia`): the pool, USDC underlying, and aUSDC (also read via `pool.getReserveData(usdc).aTokenAddress` in the constructor). The constructor takes `(pool, usdc, owner, tvlCap)`.

## App ↔ chain
- The ABI is exported to `app/src/lib/zaaveAbi.ts` (generated from `contracts/out/Zaave.sol/Zaave.json`; a `pnpm abi` script copies it).
- Addresses live in `app/src/lib/addresses.ts`, keyed by chainId (8453 Base, 84532 Base Sepolia), read from `NEXT_PUBLIC_ZAAVE_ADDRESS_<chainId>` env vars with fallbacks.
- Live APY comes from Aave's `getReserveData(usdc).currentLiquidityRate` (ray, APR) on the pool, converted to APY. It's read client-side with viem via public RPC, so it works without a deployed Zaave contract.
