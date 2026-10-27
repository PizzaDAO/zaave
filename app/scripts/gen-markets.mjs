// Generates src/lib/markets.generated.ts from the pinned @bgd-labs/aave-address-book.
// Run: node scripts/gen-markets.mjs   (output is committed, so the package is a devDependency only)
//
// Every Aave v3 market in the address book becomes a market with one entry per listed reserve
// (symbol, underlying, aToken, decimals), plus the market's Pool, Oracle, UiPoolDataProvider,
// PoolAddressesProvider, WalletBalanceProvider and, when it has one, the WrappedTokenGateway with
// the wrapped-native reserve it wraps. Addresses come only from the address book, never from a
// runtime API. The address book can lag the chain: reserves Aave listed after 4.44.22 are not in
// it, and the app ignores any reserve the on-chain provider returns that is not here.
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as book from "@bgd-labs/aave-address-book";

const pkg = JSON.parse(readFileSync(new URL("../node_modules/@bgd-labs/aave-address-book/package.json", import.meta.url), "utf8"));

// Note: the address book calls the Ink market "InkWhitelabel", but Aave's own API lists the same
// pool (0x2816...) as the public "AaveV3Ink" market, so it is included.

// Address book reserve key -> display symbol when it differs. USDC-family keys keep their old
// names (USDCn is Circle's native USDC on chains that also list a bridged one). Anything else
// uses the key itself with "_" shown as "-" (PT_USDe_5FEB2026 -> PT-USDe-5FEB2026).
const SYMBOLS = {
  USDCe: "USDC.e",
  mUSDC: "m.USDC",
  ONE_INCH: "1INCH",
  DAIe: "DAI.e",
  LINKe: "LINK.e",
  WBTCe: "WBTC.e",
  WETHe: "WETH.e",
  AAVEe: "AAVE.e",
};

// Reserves users never supply (GHO is minted by Aave, its aToken is a stub).
const NEVER_SUPPLY = new Set(["GHO"]);
// Markets with permissioned reserves list only these keys. Horizon's RWA reserves (USTB, USCC,
// USYC, JTRSY, JAAA, VBILL) can only be supplied by whitelisted institutions.
const ONLY_KEYS = { AaveV3EthereumHorizon: ["USDC", "RLUSD"] };

// Wrapped-native reserve key and the native token's name, per chain. Each gateway's WETH() was
// checked on-chain against this (scripts/verify-markets.mjs checks it again).
const NATIVE = {
  1: ["WETH", "ETH"], 10: ["WETH", "ETH"], 56: ["WBNB", "BNB"], 100: ["WXDAI", "xDAI"], 137: ["WPOL", "POL"],
  146: ["wS", "S"], 324: ["WETH", "ETH"], 1868: ["WETH", "ETH"], 4326: ["WETH", "ETH"], 5000: ["WMNT", "MNT"],
  8453: ["WETH", "ETH"], 9745: ["WXPL", "XPL"], 42161: ["WETH", "ETH"], 43114: ["WAVAX", "AVAX"],
  57073: ["WETH", "ETH"], 59144: ["WETH", "ETH"], 534352: ["WETH", "ETH"], 84532: ["WETH", "ETH"],
};

const CHAIN_NAMES = {
  1: "Ethereum", 10: "Optimism", 56: "BNB Chain", 100: "Gnosis", 137: "Polygon", 146: "Sonic", 324: "zkSync",
  1088: "Metis", 5000: "Mantle", 8453: "Base", 9745: "Plasma", 42161: "Arbitrum", 42220: "Celo",
  43114: "Avalanche", 57073: "Ink", 59144: "Linea", 534352: "Scroll", 1868: "Soneium", 4326: "MegaETH",
  84532: "Base Sepolia",
};

// Address book export -> market name shown in the UI. Ethereum has four markets; the rest are "Core".
const MARKET_NAMES = {
  AaveV3EthereumLido: "Prime",
  AaveV3EthereumEtherFi: "EtherFi",
  AaveV3EthereumHorizon: "Horizon",
};

// Bridged (non-Circle-native) USDC, keyed `${chainId}:${bookKey}`. Confirmed against each token's
// on-chain name()/symbol() (see scripts/verify-markets.mjs, which prints them).
const BRIDGED = new Set([
  "10:USDC", // USDC.e
  "137:USDC", // USDC.e (PoS bridge)
  "42161:USDC", // USDC.e
  "8453:USDbC",
  "100:USDCe",
  "100:USDC", // "USD//C on xDai": the older xDai-bridged USDC
  "1868:USDCe",
  "1088:mUSDC",
  "56:USDC", // Binance-Peg USDC (18 decimals)
  "324:USDC", // USDC.e on zkSync Era
  "5000:USDC", // bridged to Mantle
  "534352:USDC", // bridged to Scroll
  "146:USDC", // USDC.e on Sonic
]);

// Binance-Peg ETH is an ordinary ERC20 on BNB Chain; keep its name apart from native ETH.
const SYMBOL_BY_CHAIN = { "56:ETH": "ETH.peg" };
const symbolOf = (chainId, key) => SYMBOL_BY_CHAIN[`${chainId}:${key}`] ?? SYMBOLS[key] ?? key.replaceAll("_", "-");

const markets = [];
const testnets = [];
for (const [exportName, m] of Object.entries(book)) {
  if (!/^AaveV3/.test(exportName) || typeof m !== "object" || !m.ASSETS) continue;
  const only = ONLY_KEYS[exportName];
  const reserves = Object.entries(m.ASSETS)
    .filter(([k, a]) => !NEVER_SUPPLY.has(k) && (!only || only.includes(k)) && a.A_TOKEN && a.UNDERLYING)
    .map(([k, a]) => ({
      key: k,
      // [symbol, underlying, aToken, decimals, bridged (1) | 0]
      row: [symbolOf(m.CHAIN_ID, k), a.UNDERLYING, a.A_TOKEN, a.decimals, BRIDGED.has(`${m.CHAIN_ID}:${k}`) ? 1 : 0],
    }));
  if (reserves.length === 0) continue;
  const isTestnet = /Sepolia|Fuji/.test(exportName);
  if (isTestnet && exportName !== "AaveV3BaseSepolia") continue; // only Base Sepolia's plain market is kept
  const [wrappedKey, nativeSymbol] = NATIVE[m.CHAIN_ID] ?? [];
  const wrapped = m.WETH_GATEWAY && wrappedKey ? reserves.find((r) => r.key === wrappedKey) : undefined;
  if (m.WETH_GATEWAY && wrappedKey && !wrapped && !only) {
    console.log(`note: ${exportName} has a gateway but no ${wrappedKey} reserve; native disabled`);
  }
  const entry = {
    id: `${m.CHAIN_ID}-${(MARKET_NAMES[exportName] ?? "Core").toLowerCase()}`,
    chainId: m.CHAIN_ID,
    chainName: CHAIN_NAMES[m.CHAIN_ID],
    marketName: MARKET_NAMES[exportName] ?? "Core",
    pool: m.POOL,
    oracle: m.ORACLE,
    uiPoolDataProvider: m.UI_POOL_DATA_PROVIDER,
    poolAddressesProvider: m.POOL_ADDRESSES_PROVIDER,
    walletBalanceProvider: m.WALLET_BALANCE_PROVIDER ?? null,
    nativeSymbol: wrapped ? nativeSymbol : null,
    gateway: wrapped ? m.WETH_GATEWAY : null,
    wrappedNative: wrapped ? wrapped.row[1] : null,
    reserves: reserves.map((r) => r.row),
  };
  for (const k of ["pool", "oracle", "uiPoolDataProvider", "poolAddressesProvider"]) {
    if (!entry[k]) throw new Error(`${exportName}: no ${k}`);
  }
  if (isTestnet) {
    testnets.push(entry);
    continue;
  }
  if (!entry.chainName) throw new Error(`no chain name for ${m.CHAIN_ID}`);
  markets.push(entry);
}
const byId = (a, b) => a.chainId - b.chainId || a.id.localeCompare(b.id);
markets.sort(byId);

/** JSON with each reserve tuple on one line (compact, still diffable). */
function fmtMarkets(list) {
  const body = list.map((m) => {
    const { reserves, ...rest } = m;
    const head = JSON.stringify(rest, null, 2).replace(/\n}$/, "").replace(/\n/g, "\n  ");
    return `  ${head},\n    "reserves": [\n${reserves.map((r) => "      " + JSON.stringify(r)).join(",\n")}\n    ]\n  }`;
  });
  return `[\n${body.join(",\n")}\n]`;
}

const out = `// GENERATED by scripts/gen-markets.mjs from @bgd-labs/aave-address-book@${pkg.version}. Do not edit.
// Source of truth for every transaction-target address in the app.

/** [symbol, underlying, aToken, decimals, bridged (1 = bridged / non-native USDC)] */
export type RawReserve = readonly [symbol: string, underlying: \`0x\${string}\`, aToken: \`0x\${string}\`, decimals: number, bridged: 0 | 1];

export type Market = {
  /** "<chainId>-<market>", unique. */
  id: string;
  chainId: number;
  chainName: string;
  marketName: string;
  pool: \`0x\${string}\`;
  oracle: \`0x\${string}\`;
  uiPoolDataProvider: \`0x\${string}\`;
  poolAddressesProvider: \`0x\${string}\`;
  walletBalanceProvider: \`0x\${string}\` | null;
  /** The chain's native gas token ("ETH", "BNB", ...), when this market has a WrappedTokenGateway and a wrapped-native reserve. */
  nativeSymbol: string | null;
  gateway: \`0x\${string}\` | null;
  /** Underlying of the wrapped-native reserve the gateway wraps into. */
  wrappedNative: \`0x\${string}\` | null;
  reserves: readonly RawReserve[];
};

export const ADDRESS_BOOK_VERSION = ${JSON.stringify(pkg.version)};

export const MAINNET_MARKETS: readonly Market[] = ${fmtMarkets(markets)};

/**
 * Optional per-chain RPC override. Each NEXT_PUBLIC_RPC_<chainId> must be referenced statically
 * (no computed keys) or Next will not inline it into the client bundle.
 */
export const RPC_OVERRIDES: Record<number, string | undefined> = {
${[...markets, ...testnets].map((m) => m.chainId).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((id) => `  ${id}: process.env.NEXT_PUBLIC_RPC_${id},`).join("\n")}
};

export const TESTNET_MARKETS: readonly Market[] = ${fmtMarkets(testnets)};
`;
const dest = fileURLToPath(new URL("../src/lib/markets.generated.ts", import.meta.url));
writeFileSync(dest, out);
console.log(`wrote ${dest}: ${markets.length} markets on ${new Set(markets.map((m) => m.chainId)).size} chains, ${markets.reduce((n, m) => n + m.reserves.length, 0)} reserves`);
for (const m of markets) {
  console.log(`  ${m.id.padEnd(16)} ${String(m.reserves.length).padStart(3)} reserves  native: ${m.nativeSymbol ?? "none (no gateway)"}`);
}
