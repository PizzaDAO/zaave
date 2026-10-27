# Zaave contracts

Foundry project (Solidity 0.8.28, OpenZeppelin v5.1.0). Interface and accounting: `../plans/spec-v1.md`.

## Layout
- `src/Zaave.sol`: the single contract (internal non-transferable shares, Aave v3 USDC, Za Day epochs, pizza credit)
- `src/interfaces/IPool.sol`: minimal Aave v3 `IPool`
- `test/Zaave.t.sol`: unit tests with `MockPool` / `MockAToken` (`test/mocks/Mocks.sol`), incl. fuzz
- `test/ZaaveFork.t.sol`: fork test against real Aave on Base mainnet
- `script/Deploy.s.sol`: deploy script; writes `deployments/<chainid>.json`

## Dependencies
Vendored in `lib/` (installed with `forge install --no-git`, so no submodules; nested `.git` dirs removed):
`openzeppelin-contracts@v5.1.0`, `forge-std`. Addresses are hardcoded in `script/Deploy.s.sol` (instead of the
aave-address-book package) and were verified on-chain.

| | Pool | USDC | aUSDC (from `getReserveData`) |
|---|---|---|---|
| Base 8453 | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` |
| Base Sepolia 84532 | `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` | `0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC` |

## Build / test
```bash
cd contracts
forge build
forge test                                   # unit + fuzz (fork test is skipped without FORK_URL)
FORK_URL=https://mainnet.base.org forge test # include the Base mainnet fork test
forge fmt
```

ABI: `out/Zaave.sol/Zaave.json` (the `abi` field). Export for the app with
`jq .abi out/Zaave.sol/Zaave.json`.

## Deploy
```bash
export OWNER=0x...        # optional, default = deployer
export TVL_CAP=50000000000 # optional, default 50_000e6 (50k USDC)
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --private-key $PK --broadcast
# Base mainnet: --rpc-url https://mainnet.base.org
```
The script picks pool/USDC from `block.chainid` (8453 or 84532) and writes the address to
`deployments/<chainid>.json`. Owner is `Ownable2Step`: a new owner (e.g. the PizzaDAO multisig) must call
`acceptOwnership()`. Then `setFulfillment(addr)` enables gift cards.

## Notes
- Za Day: `zaDay()` is callable once the UTC calendar month is later than the month of the previous Za Day
  (the first one: the month after deployment). Snapshot only; yield becomes credit lazily on `harvest`.
- `withdrawAll()` withdraws `min(principal, value)`; if value < principal it exits fully and clears principal.
- Admin cannot touch user funds: no fee, `rescue` excludes USDC/aUSDC, pause only blocks deposit and gift card redeem.
