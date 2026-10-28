// Generates src/lib/markets.generated.ts from the pinned @bgd-labs/aave-address-book.
// Run: node scripts/gen-markets.mjs   (output is committed, so the package is a devDependency only)
//
// Every Aave v3 market in the address book becomes a market with one entry per listed reserve
// (symbol, underlying, aToken, decimals), plus the market's Pool, Oracle, UiPoolDataProvider,
// PoolAddressesProvider, WalletBalanceProvider and, when it has one, the WrappedTokenGateway with
// the wrapped-native reserve it wraps. Addresses come only from the address book, never from a
// runtime API. The address book can lag the chain: reserves Aave listed after 4.44.22 are not in
// it, and the app ignores any reserve the on-chain provider returns that is not here.
//
// On-chain top-up: for every market the script also reads the address-book Pool's getReservesList()
// and adds reserves the book lacks. The Pool (from the book) is the only trust root: each added
// reserve must satisfy pool.getReserveData(asset).aTokenAddress == aToken, aToken.POOL() == pool,
// aToken.UNDERLYING_ASSET_ADDRESS() == asset, and be active with the same aToken implementation
// (EIP-1967 slot) as a book reserve kept for that market. Anything else is skipped and
// logged. An RPC failure aborts the run (after retries); reserves are never silently dropped.
// RPC_<chainId>=url overrides the endpoint (Mantle's default rate-limits; the fallback used here
// is https://mantle-rpc.publicnode.com).
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as book from "@bgd-labs/aave-address-book";
import { createPublicClient, http, parseAbi, hexToString } from "viem";
import { PUBLIC_RPC } from "../src/lib/rpc-defaults.ts";

const pkg = JSON.parse(readFileSync(new URL("../node_modules/@bgd-labs/aave-address-book/package.json", import.meta.url), "utf8"));

// Note: the address book calls the Ink market "InkWhitelabel", but Aave's own API lists the same
// pool (0x2816...) as the public "AaveV3Ink" market, so it is included.

// Address book reserve key -> display symbol when it differs. USDC-family keys keep their old
// names (USDCn is Circle's native USDC on chains that also list a bridged one). Anything else
// uses the key itself with "_" shown as "-" (PT_USDe_5FEB2026 -> PT-USDe-5FEB2026).
const SYMBOLS = {
  // On-chain symbols of Pool-discovered reserves, matched to the book's spelling.
  "BTC.b": "BTCb",
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
  196: ["WOKB", "OKB"],
  // Monad (143): no entry. The gateway wraps WMON, which is not a reserve of the pool.
};

const CHAIN_NAMES = {
  1: "Ethereum", 10: "Optimism", 56: "BNB Chain", 100: "Gnosis", 137: "Polygon", 146: "Sonic", 324: "zkSync",
  1088: "Metis", 5000: "Mantle", 8453: "Base", 9745: "Plasma", 42161: "Arbitrum", 42220: "Celo",
  43114: "Avalanche", 57073: "Ink", 59144: "Linea", 534352: "Scroll", 1868: "Soneium", 4326: "MegaETH",
  84532: "Base Sepolia", 196: "X Layer", 143: "Monad",
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

// ---- on-chain top-up -------------------------------------------------------------------------
const GEN_RPC = { 5000: "https://mantle-rpc.publicnode.com" }; // public default rate-limits
const abi = parseAbi([
  "function getReservesList() view returns (address[])",
  "function getReserveData(address) view returns ((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))",
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
  "function POOL() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
const abi32 = parseAbi(["function symbol() view returns (bytes32)"]);
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"; // EIP-1967
const lc = (a) => a.toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clients = new Map();
function clientFor(chainId) {
  if (!clients.has(chainId)) {
    const url = process.env[`RPC_${chainId}`] ?? GEN_RPC[chainId] ?? PUBLIC_RPC[chainId];
    if (!url) throw new Error(`no RPC for chain ${chainId}`);
    clients.set(chainId, createPublicClient({ transport: http(url, { retryCount: 0 }) }));
  }
  return clients.get(chainId);
}
/** Retry a read a few times, then throw (never swallow). */
async function retry(label, fn) {
  let err;
  for (let i = 0; i < 6; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await sleep(500 * (i + 1));
    }
  }
  throw new Error(`${label}: ${err?.shortMessage ?? err?.message ?? err}`);
}
/** ERC20 symbol as a clean string; falls back to a bytes32 symbol (MKR-style). */
async function readSymbol(c, token, label) {
  let raw;
  try {
    raw = await retry(label, () => c.readContract({ address: token, abi, functionName: "symbol" }));
  } catch (e1) {
    // a non-string return (bytes32) fails ABI decoding; try that before giving up
    try {
      raw = hexToString(await c.readContract({ address: token, abi: abi32, functionName: "symbol" }), { size: 32 });
    } catch {
      throw e1;
    }
  }
  const clean = String(raw).replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
  if (!clean) throw new Error(`${label}: empty symbol`);
  return clean;
}

/**
 * Reserves in the Pool's list that the address book lacks, verified against the Pool.
 * Returns { rows: [{symbol, underlying, aToken, decimals, bridged}], skipped: [string] }.
 */
async function onchainReserves({ exportName, m, bookUnderlyings, openImplFrom, usedSymbols }) {
  const c = clientFor(m.CHAIN_ID);
  const L = exportName;
  const list = await retry(`${L} getReservesList`, () => c.readContract({ address: m.POOL, abi, functionName: "getReservesList" }));
  const extra = list.filter((a) => !bookUnderlyings.has(lc(a)));
  const rows = [];
  const skipped = [];
  if (extra.length === 0) return { rows, skipped };
  if (ONLY_KEYS[exportName]) {
    return { rows, skipped: extra.map((a) => `${a} (market is restricted to ${ONLY_KEYS[exportName].join("/")}; permissioned RWA)`) };
  }
  // aToken implementations in use by this market's kept book reserves (any status).
  const openImpls = new Set();
  for (const [, , aToken] of openImplFrom) {
    openImpls.add(await retry(`${L} impl ${aToken}`, () => c.getStorageAt({ address: aToken, slot: IMPL_SLOT })));
  }
  const used = new Set(usedSymbols);
  for (const asset of [...extra].sort((a, b) => lc(a).localeCompare(lc(b)))) {
    const tag = `${L} ${asset}`;
    const rd = await retry(`${tag} getReserveData`, () => c.readContract({ address: m.POOL, abi, functionName: "getReserveData", args: [asset] }));
    const aToken = rd.aTokenAddress;
    const under = await retry(`${tag} aToken.UNDERLYING`, () => c.readContract({ address: aToken, abi, functionName: "UNDERLYING_ASSET_ADDRESS" }));
    const pool = await retry(`${tag} aToken.POOL`, () => c.readContract({ address: aToken, abi, functionName: "POOL" }));
    const dec = await retry(`${tag} decimals`, () => c.readContract({ address: asset, abi, functionName: "decimals" }));
    const rawSym = await readSymbol(c, asset, `${tag} symbol`);
    if (lc(under) !== lc(asset)) throw new Error(`${tag}: aToken underlying ${under} != asset`);
    if (lc(pool) !== lc(m.POOL)) throw new Error(`${tag}: aToken pool ${pool} != ${m.POOL}`);
    const cfgDec = Number((rd.configuration >> 48n) & 0xffn);
    if (cfgDec !== dec) throw new Error(`${tag}: config decimals ${cfgDec} != token decimals ${dec}`);
    if (!((rd.configuration >> 56n) & 1n)) {
      skipped.push(`${rawSym} ${asset} (inactive)`);
      continue;
    }
    if (NEVER_SUPPLY.has(rawSym)) {
      skipped.push(`${rawSym} ${asset} (never supplied)`);
      continue;
    }
    const impl = await retry(`${tag} impl`, () => c.getStorageAt({ address: aToken, slot: IMPL_SLOT }));
    if (!openImpls.has(impl)) {
      skipped.push(`${rawSym} ${asset} (aToken implementation ${impl} differs from this market's open reserves; possibly permissioned)`);
      continue;
    }
    let symbol = SYMBOL_BY_CHAIN[`${m.CHAIN_ID}:${rawSym}`] ?? SYMBOLS[rawSym] ?? rawSym;
    if (used.has(symbol)) symbol = `${symbol}.${lc(asset).slice(2, 6)}`; // unique key within the market
    if (used.has(symbol)) throw new Error(`${tag}: cannot make symbol ${rawSym} unique`);
    used.add(symbol);
    rows.push({ symbol, underlying: asset, aToken, decimals: dec, bridged: BRIDGED.has(`${m.CHAIN_ID}:${rawSym}`) ? 1 : 0 });
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol) || lc(a.underlying).localeCompare(lc(b.underlying)));
  return { rows, skipped };
}

const onchainAdded = []; // for the summary
const onchainSkipped = [];
const onchainKeys = new Set(); // `${marketId}:${underlying}` of reserves that came from the Pool

// Markets in the address-book GitHub main branch but not yet in the pinned npm release. Copied from
// bgd-labs/aave-address-book commit aafdffd1a65017f7bc769bcac1dd45abd81199c9 (main, 2026-10-27,
// "chore(main): release 4.75.3"), src/ts/AaveV3XLayer.ts and src/ts/AaveV3Monad.ts. Each address was
// verified on-chain (scripts/verify-markets.mjs: pool ADDRESSES_PROVIDER == provider, provider
// getPool/getPriceOracle == pool/oracle, UiPoolDataProvider decodes with the v3.3+ ABI, gateway
// WETH()/POOL()). Entries are used only while the pinned package lacks the export; once a bump brings
// them in, the package wins and this block can be deleted. ASSETS: key -> [underlying, aToken, decimals].
const HARDCODED = {
  AaveV3XLayer: {
    CHAIN_ID: 196,
    POOL: "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116",
    ORACLE: "0x91FC11136d5615575a0fC5981Ab5C0C54418E2C6",
    UI_POOL_DATA_PROVIDER: "0xc851e6147dcE6A469CC33BE3121b6B2D4CaD2763",
    POOL_ADDRESSES_PROVIDER: "0xdFf435BCcf782f11187D3a4454d96702eD78e092",
    WALLET_BALANCE_PROVIDER: "0x421117D7319E96d831972b3F7e970bbfe29C4F21",
    WETH_GATEWAY: "0xd449FeD49d9C443688d6816fE6872F21402e41de",
    ASSETS: {
      USDT: ["0x779Ded0c9e1022225f8E0630b35a9b54bE713736", "0xF356ae412dB5df43BD3a10746f7ad4e1C4De4297", 6],
      USDG: ["0x4ae46a509F6b1D9056937BA4500cb143933D2dc8", "0x228765a3C18065C923F23a0CCb6c7cEFB3eA2223", 6],
      xBTC: ["0xb7C00000bcDEeF966b20B3D884B98E64d2b06b4f", "0xF5F9d4e9e2AFe7E0b193d291Befb41d61930464e", 8],
      WOKB: ["0xe538905cf8410324e03A5A23C1c177a474D59b2b", "0x3ea3A4038FbA5757A9A68de920b44698d7326A59", 18],
      xETH: ["0xE7B000003A45145decf8a28FC755aD5eC5EA025A", "0xe6639ba6c1d79Be6d4c776E4c17504538d1719cD", 18],
      xSOL: ["0x505000008DE8748DBd4422ff4687a4FC9bEba15b", "0x523dCe1b164327818fc5B41278fAe41f6B5753FE", 9],
      xBETH: ["0xAFeab3B85B6A56cF5F02317F0f7A23340eb983D7", "0xe9e78053f1Ef084f8cD01dBE8ccE95c6b0944d32", 18],
      xOKSOL: ["0x14a686103854DAB7b8801E31979CAA595835B25d", "0x38811564090aAb7bB455c5b771e26201a3535a01", 9],
      GHO: ["0xDe6539018B095353A40753Dc54C91C68c9487D4E", "0x77188335A21f4C409d2CfeDe3195A7B5f28651b0", 18],
      PT_USDG_29OCT2026: ["0x9a09a9E491DB3dd8Ada5B1B889991AC9Ad5fd362", "0x64768bE1b925Eb04a2Caa2E1F9ffEC2f959cAC9c", 6],
      USDC: ["0xB6CEceAB302E2E4948951eE7843FC24E92933061", "0x7Da9B238CBd6A227ff054704Ec5cF7e700f03414", 6],
      PT_USDG_25FEB2027: ["0x5eA1F184af5Ced57725213D8267B5c4C834557D4", "0xc6f45a13d8307a6a35a147a31DdA4ce370ee33B4", 6],
      USDe: ["0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", "0x1d919Fb33D8A3B5a0235e5d6F608bC53B9e87412", 18],
    },
  },
  AaveV3Monad: {
    CHAIN_ID: 143,
    POOL: "0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef",
    ORACLE: "0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf",
    UI_POOL_DATA_PROVIDER: "0xa7D38785be3422c25677A8aa4a44D3a0853A3a17",
    POOL_ADDRESSES_PROVIDER: "0x34793Fb9935F7bB5E5aE920fb963F39063E7A615",
    WALLET_BALANCE_PROVIDER: "0x1CC19583933Af0B70103797236267a9E049806F9",
    // The gateway wraps into WMON (0x3bd3...433A), which is not a reserve of this pool: native MON is
    // not offered and no gateway is emitted for this market.
    WETH_GATEWAY: "0x5bB847f1E529df8819038BA6d34a95c9C2FB6813",
    ASSETS: {
      USDT0: ["0xe7cd86e13AC4309349F30B3435a9d337750fC82D", "0x9531E6bC99D7F7f0596ed7bA5b846Ba9Eb60468c", 6],
      USDC: ["0x754704Bc059F8C67012fEd69BC8A327a5aafb603", "0x35a73BAcb179d3740395A3ceCc87FF2e581d6042", 6],
      USDe: ["0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", "0x37cAbe3eDD86165886877Cc8b6Be10269f21893d", 18],
      mUSD: ["0xacA92E438df0B2401fF60dA7E4337B687a2435DA", "0xDBb2e1b6BC94328Df2662A1796AB6A23fCde3199", 6],
      AUSD: ["0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", "0xdeBFeDF35faEd5d1664E553545e144C02227A2Ec", 6],
      WETH: ["0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242", "0x4377b53aAA8b8e3fF7AA2843832CAF004f5Cb8b6", 18],
      cbBTC: ["0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b", "0x1F5e388861A32226c716e922CE748a6FEE5e8e57", 8],
      wstETH: ["0x10Aeaf63194db8d453d4D85a06E5eFE1dd0b5417", "0xc31E3A273A93D238Ce49B053f801E8f385375df7", 18],
      weETH: ["0xA3D68b74bF0528fdD07263c60d6488749044914b", "0x4FAe5e2d191e012f503dE53023B0710f554FcFF0", 18],
      syrupUSDC: ["0xaB6e5a0C3799d020c790D34F7B2C02639e238AF7", "0xbc2A1FA0069e59e2552Ab40889520c7b0D413D9B", 6],
      sUSDe: ["0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", "0xCD11405D4a15a825B46254c42F5b5Cd8c2EDAe09", 18],
      GHO: ["0xfc421aD3C883Bf9E7C4f42dE845C4e4405799e73", "0x4586face17B0e3D4d51EcABb4B4EBC2354b61b0D", 18],
      PT_AUSD_8OCT2026: ["0x9FC74f8Ed616B5BaF52a170caa97d6d3898602d1", "0xb93Ce4EB85eBA317f954Dadcbe112Ce6c3af9ae4", 6],
      PT_AUSD_17DEC2026: ["0x8B562578b2f9Aa8C14cCda3c5d6CBCEaD3B06a57", "0x8F8d143F1FCe0A57A6e80D8DF7f7288703b2Eb7e", 6],
    },
  },
};
const sources = { ...book };
for (const [name, h] of Object.entries(HARDCODED)) {
  if (sources[name]) continue; // the pinned package has it: it wins
  sources[name] = { ...h, ASSETS: Object.fromEntries(Object.entries(h.ASSETS).map(([k, [u, a, d]]) => [k, { UNDERLYING: u, A_TOKEN: a, decimals: d }])) };
}

const markets = [];
const testnets = [];
for (const [exportName, m] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
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
  const marketId = `${m.CHAIN_ID}-${(MARKET_NAMES[exportName] ?? "Core").toLowerCase()}`;
  if (!isTestnet) {
    const top = await onchainReserves({
      exportName,
      m,
      bookUnderlyings: new Set(Object.values(m.ASSETS).map((a) => lc(a.UNDERLYING ?? ""))),
      openImplFrom: reserves.map((r) => r.row),
      usedSymbols: reserves.map((r) => r.row[0]),
    });
    for (const t of top.rows) {
      reserves.push({ key: t.symbol, row: [t.symbol, t.underlying, t.aToken, t.decimals, t.bridged] });
      onchainKeys.add(`${marketId}:${lc(t.underlying)}`);
      onchainAdded.push(`${marketId} ${t.symbol} ${t.underlying}`);
    }
    for (const sk of top.skipped) onchainSkipped.push(`${marketId} ${sk}`);
  }
  const [wrappedKey, nativeSymbol] = NATIVE[m.CHAIN_ID] ?? [];
  const wrapped = m.WETH_GATEWAY && wrappedKey ? reserves.find((r) => r.key === wrappedKey) : undefined;
  if (m.WETH_GATEWAY && wrappedKey && !wrapped && !only) {
    console.log(`note: ${exportName} has a gateway but no ${wrappedKey} reserve; native disabled`);
  }
  const entry = {
    id: marketId,
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
    const rows = reserves.map(
      (r, i) =>
        "      " + JSON.stringify(r) + (i < reserves.length - 1 ? "," : "") +
        (onchainKeys.has(`${m.id}:${lc(r[1])}`) ? " // from Pool.getReservesList (not in the address book)" : ""),
    );
    return `  ${head},\n    "reserves": [\n${rows.join("\n")}\n    ]\n  }`;
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
console.log("added from the Pool (not in the address book):");
for (const l of onchainAdded) console.log("  + " + l);
console.log("skipped Pool reserves:");
for (const l of onchainSkipped) console.log("  - " + l);
console.log(`wrote ${dest}: ${markets.length} markets on ${new Set(markets.map((m) => m.chainId)).size} chains, ${markets.reduce((n, m) => n + m.reserves.length, 0)} reserves`);
for (const m of markets) {
  console.log(`  ${m.id.padEnd(16)} ${String(m.reserves.length).padStart(3)} reserves  native: ${m.nativeSymbol ?? "none (no gateway)"}`);
}
