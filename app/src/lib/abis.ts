// Minimal Aave v3 ABIs (Pool + aToken), just what Zaave calls.

export const poolAbi = [
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    // amount = type(uint256).max withdraws the whole balance.
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getReserveNormalizedIncome",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "configuration", type: "uint256" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
      },
    ],
  },
] as const;

export const aTokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "scaledBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    // Liquidity index at the user's last balance update (supply / withdraw / transfer).
    type: "function",
    name: "getPreviousIndex",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Aave's UiPoolDataProviderV3. The struct layout is the v3.3+ one (no stable-debt fields,
// virtualUnderlyingBalance + deficit at the end). Checked by decoding on-chain against every
// market in markets.generated.ts (scripts/verify-markets.mjs): all of them return this layout.
// The older v3.0 layout (the address book's IUiPoolDataProvider ABI) does not decode on any of them.
export const uiPoolDataProviderAbi = [
  {
    type: "function",
    name: "getReservesData",
    stateMutability: "view",
    inputs: [{ name: "provider", type: "address" }],
    outputs: [
      { name: "", type: "tuple[]", components: [
          { name: "underlyingAsset", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "decimals", type: "uint256" },
          { name: "baseLTVasCollateral", type: "uint256" },
          { name: "reserveLiquidationThreshold", type: "uint256" },
          { name: "reserveLiquidationBonus", type: "uint256" },
          { name: "reserveFactor", type: "uint256" },
          { name: "usageAsCollateralEnabled", type: "bool" },
          { name: "borrowingEnabled", type: "bool" },
          { name: "isActive", type: "bool" },
          { name: "isFrozen", type: "bool" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "liquidityRate", type: "uint128" },
          { name: "variableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "aTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "availableLiquidity", type: "uint256" },
          { name: "totalScaledVariableDebt", type: "uint256" },
          { name: "priceInMarketReferenceCurrency", type: "uint256" },
          { name: "priceOracle", type: "address" },
          { name: "variableRateSlope1", type: "uint256" },
          { name: "variableRateSlope2", type: "uint256" },
          { name: "baseVariableBorrowRate", type: "uint256" },
          { name: "optimalUsageRatio", type: "uint256" },
          { name: "isPaused", type: "bool" },
          { name: "isSiloedBorrowing", type: "bool" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
          { name: "flashLoanEnabled", type: "bool" },
          { name: "debtCeiling", type: "uint256" },
          { name: "debtCeilingDecimals", type: "uint256" },
          { name: "borrowCap", type: "uint256" },
          { name: "supplyCap", type: "uint256" },
          { name: "borrowableInIsolation", type: "bool" },
          { name: "virtualUnderlyingBalance", type: "uint128" },
          { name: "deficit", type: "uint128" },
        ] },
      { name: "", type: "tuple", components: [
          { name: "marketReferenceCurrencyUnit", type: "uint256" },
          { name: "marketReferenceCurrencyPriceInUsd", type: "int256" },
          { name: "networkBaseTokenPriceInUsd", type: "int256" },
          { name: "networkBaseTokenPriceDecimals", type: "uint8" },
        ] },
    ],
  },
  {
    type: "function",
    name: "getUserReservesData",
    stateMutability: "view",
    inputs: [{ name: "provider", type: "address" }, { name: "user", type: "address" }],
    outputs: [
      { name: "", type: "tuple[]", components: [
          { name: "underlyingAsset", type: "address" },
          { name: "scaledATokenBalance", type: "uint256" },
          { name: "usageAsCollateralEnabledOnUser", type: "bool" },
          { name: "scaledVariableDebt", type: "uint256" },
        ] },
      { name: "", type: "uint8" },
    ],
  }
] as const;

// WrappedTokenGatewayV3. The first argument of depositETH / withdrawETH is ignored by the
// contract (it is bound to its pool at deploy time) but we pass the market's pool anyway.
export const gatewayAbi = [
  {
    type: "function",
    name: "depositETH",
    stateMutability: "payable",
    inputs: [
      { name: "pool", type: "address" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    // Pulls aWETH from the caller, so the aToken must be approved to the gateway first.
    // amount = type(uint256).max withdraws the whole balance.
    type: "function",
    name: "withdrawETH",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pool", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
] as const;

// WalletBalanceProvider: the user's balance of every reserve of a market in one call.
export const walletBalanceProviderAbi = [
  {
    type: "function",
    name: "getUserWalletBalances",
    stateMutability: "view",
    inputs: [
      { name: "provider", type: "address" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "", type: "address[]" },
      { name: "", type: "uint256[]" },
    ],
  },
] as const;
