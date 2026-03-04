// ============================================================
// DeFi Lending Rate Benchmark — Configuration
// ============================================================

export const AAVE_ENDPOINT = 'https://api.v3.aave.com/graphql';
export const MORPHO_ENDPOINT = 'https://api.morpho.org/graphql';

export const RPC_URLS = {
  ethereum: 'https://1rpc.io/eth',
  base: 'https://base.llamarpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  plasma: 'https://rpc.plasma.to',
};

// Fallback RPCs (for heavy on-chain calls like Fluid resolver)
export const RPC_FALLBACKS = {
  ethereum: ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com'],
  base: ['https://base-rpc.publicnode.com'],
  arbitrum: ['https://arb1.arbitrum.io/rpc'],
  plasma: ['https://rpc.plasma.to'],
};

export const CHAINS = [
  { id: 1, name: 'ethereum', label: 'Ethereum' },
  { id: 8453, name: 'base', label: 'Base' },
  { id: 42161, name: 'arbitrum', label: 'Arbitrum' },
  { id: 9745, name: 'plasma', label: 'Plasma' },
  { id: 5000, name: 'mantle', label: 'Mantle' },
  { id: 101, name: 'solana', label: 'Solana' },
];

export const CHAIN_ID_TO_NAME = { 1: 'ethereum', 8453: 'base', 42161: 'arbitrum', 9745: 'plasma', 5000: 'mantle', 101: 'solana' };
export const CHAIN_NAME_TO_ID = { ethereum: 1, base: 8453, arbitrum: 42161, plasma: 9745, mantle: 5000, solana: 101 };

export const STABLECOIN_ADDRESSES = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDS: '0xdC035D45d973E3EC169d2276DDab16f1e407384F',
    USDe: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
    RLUSD: '0x8292bb45bf1ee4d140127049757c2e0ff06317ed',
    PYUSD: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  plasma: {
    USDT: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',  // USDT0
    USDe: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
  },
  mantle: {
    USDT: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',  // USDT0
  },
  solana: {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDS: 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
    PYUSD: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo',
  },
};

// address → symbol reverse lookup (lowercase for EVM, case-sensitive for Solana)
export const ADDRESS_TO_SYMBOL = {};
for (const [chain, tokens] of Object.entries(STABLECOIN_ADDRESSES)) {
  for (const [symbol, addr] of Object.entries(tokens)) {
    if (chain === 'solana') {
      ADDRESS_TO_SYMBOL[addr] = symbol; // Solana: base58 case-sensitive
    } else {
      ADDRESS_TO_SYMBOL[addr.toLowerCase()] = symbol;
    }
  }
}

// Non-stablecoin assets tracked only on Aave (need USD TVL from API)
export const AAVE_EXTRA_ASSETS = {
  ethereum: {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
};

// Aave Horizon (separate RWA market) — DefiLlama pool IDs
export const HORIZON_DEFILLAMA_POOLS = {
  RLUSD: '98d07333-f5e4-4a48-8061-cfb4b73ccf79',
};

// Sky Protocol (SSR + SparkLend) — DefiLlama pool IDs for USDS
export const SKY_DEFILLAMA_POOLS = {
  'USDS-SSR': 'd8c4eff5-c8a9-46fc-a888-057c4c668e72',       // sUSDS (Sky Savings Rate) — Ethereum
  'USDS-SparkLend': '0ed981dc-b49d-426d-ade5-6014728b1ef9',  // SparkLend USDS — Ethereum
};

export const PROTOCOL_COLORS = {
  'aave-v3': '#B6509E',
  morpho: '#2470FF',
  spark: '#F5841F',
  fluid: '#00D4AA',
  euler: '#E8475F',
  kamino: '#44D4B0',
  jupiter: '#93D43F',
  horizon: '#2564EB',
  sky: '#F5AC37',
};

export const PROTOCOL_LABELS = {
  'aave-v3': 'Aave V3',
  morpho: 'Morpho',
  spark: 'Spark',
  fluid: 'Fluid',
  euler: 'Euler V2',
  kamino: 'Kamino',
  jupiter: 'Jupiter',
  horizon: 'Horizon',
  sky: 'Sky',
};

// --- Euler V2 Subgraph Endpoints (Goldsky, free, no key) ---
export const EULER_ENDPOINTS = {
  ethereum: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn',
  base: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-base/latest/gn',
  arbitrum: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-arbitrum/latest/gn',
};

// --- AAVE V3 market addresses (Pool contracts per chain) ---
export const AAVE_MARKETS = {
  1: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',       // Ethereum
  8453: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',     // Base
  42161: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',    // Arbitrum
  9745: '0x925a2A7214Ed92428B5b1B090F80b25700095e12',     // Plasma
  5000: '0x458F293454fE0d67EC0655f3672301301DD51422',     // Mantle
};

// --- Spark Contracts (Ethereum only) ---
export const SPARK_CONFIG = {
  ethereum: {
    poolAddressesProvider: '0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE',
  },
};

export const SPARK_POOL_ADDRESSES_PROVIDER_ABI = [
  'function getPoolDataProvider() view returns (address)',
];

export const SPARK_POOL_DATA_PROVIDER_ABI = [
  'function getAllReservesTokens() view returns (tuple(string symbol, address tokenAddress)[])',
  'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
];

// --- Fluid Contracts (per-chain resolver addresses) ---
export const FLUID_RESOLVERS = {
  ethereum: {
    lending: '0x48D32f49aFeAEC7AE66ad7B9264f446fc11a1569',
    vault: '0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC',
  },
  arbitrum: {
    lending: '0x48D32f49aFeAEC7AE66ad7B9264f446fc11a1569',
    vault: '0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC',
  },
  plasma: {
    lending: '0xfbb7005c49520a4E54746487f0b28F4E4594b293',
    vault: null,  // VaultResolver 주소 미확인 — supply only
  },
};

// DefiLlama pool IDs for Fluid — fallback when on-chain resolver fails
export const FLUID_DEFILLAMA_POOLS = {
  ethereum: {
    USDC: '4438dabc-7f0c-430b-8136-2722711ae663',
    USDT: '4e8cc592-c8d5-4824-8155-128ba521e903',
  },
};

export const FLUID_LENDING_RESOLVER_ABI = [
  'function getFTokensEntireData() view returns (tuple(address tokenAddress, bool eip2612Deposits, bool isNativeUnderlying, string name, string symbol, uint256 decimals, address asset, uint256 totalAssets, uint256 totalSupply, uint256 convertToShares, uint256 convertToAssets, uint256 rewardsRate, uint256 supplyRate, int256 rebalanceDifference, tuple(bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 decayEndTimestamp, uint256 decayAmount) liquidityUserSupplyData)[])',
];

export const FLUID_VAULT_RESOLVER_ABI = [
  'function getVaultsEntireData() view returns (tuple(address vault, bool isSmartCol, bool isSmartDebt, tuple(address liquidity, address factory, address operateImplementation, address adminImplementation, address secondaryImplementation, address deployer, address supply, address borrow, tuple(address token0, address token1) supplyToken, tuple(address token0, address token1) borrowToken, uint256 vaultId, uint256 vaultType, bytes32 supplyExchangePriceSlot, bytes32 borrowExchangePriceSlot, bytes32 userSupplySlot, bytes32 userBorrowSlot) constantVariables, tuple(uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePriceOperate, uint256 oraclePriceLiquidate, address rebalancer, uint256 lastUpdateTimestamp) configs, tuple(uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, int256 supplyRateVault, int256 borrowRateVault, int256 rewardsOrFeeRateSupply, int256 rewardsOrFeeRateBorrow) exchangePricesAndRates, tuple(uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidityOrDex, uint256 totalBorrowLiquidityOrDex, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, tuple(uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization, uint256 minimumBorrowing) limitsAndAvailability, tuple(uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, tuple(uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinimaTick) currentBranchState) vaultState, tuple(bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 decayEndTimestamp, uint256 decayAmount) liquidityUserSupplyData, tuple(bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization) liquidityUserBorrowData)[])',
];

// --- Kamino Finance (Solana) ---
export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
export const KAMINO_API_BASE = 'https://api.kamino.finance';

// --- Jupiter Lending (Solana) ---
// Primary: DefiLlama pools API (free, no key)
export const JUPITER_DEFI_LLAMA_URL = 'https://yields.llama.fi/pools';

// Solana token mint → symbol mapping
export const SOLANA_MINT_TO_SYMBOL = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA': 'USDS',
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo': 'PYUSD',
};

// EVM-only chains (for AAVE, Morpho, etc.)
export const EVM_CHAINS = CHAINS.filter(c => c.name !== 'solana');
export const EVM_CHAIN_IDS = EVM_CHAINS.map(c => c.id);

// EVM-only stablecoin addresses
export const EVM_STABLECOIN_ADDRESSES = Object.fromEntries(
  Object.entries(STABLECOIN_ADDRESSES).filter(([chain]) => chain !== 'solana')
);

// --- Polling ---
export const POLL_INTERVAL_MS = 3_600_000;
export const DEFAULT_MIN_TVL = 100_000_000;
export const HISTORY_DAYS = 90;

// ============================================================
// CEX Perpetual Funding Rate Configuration
// ============================================================

export const FUNDING_EXCHANGES = {
  binance:     { label: 'Binance',     color: '#F0B90B' },
  okx:         { label: 'OKX',         color: '#E0E0E0' },
  bybit:       { label: 'Bybit',       color: '#F7A600' },
  hyperliquid: { label: 'HyperLiquid', color: '#50E3C2' },
};

export const FUNDING_ASSETS = ['BTC', 'ETH', 'XRP', 'SOL', 'GOLD'];

export const FUNDING_SYMBOLS = {
  binance: {
    BTC: 'BTCUSDT',
    ETH: 'ETHUSDT',
    XRP: 'XRPUSDT',
    SOL: 'SOLUSDT',
    GOLD: ['PAXGUSDT', 'XAUUSDT'],
  },
  okx: {
    BTC: 'BTC-USDT-SWAP',
    ETH: 'ETH-USDT-SWAP',
    XRP: 'XRP-USDT-SWAP',
    SOL: 'SOL-USDT-SWAP',
    GOLD: ['XAU-USDT-SWAP', 'XAU-USD_UM-SWAP'],
  },
  bybit: {
    BTC: 'BTCUSDT',
    ETH: 'ETHUSDT',
    XRP: 'XRPUSDT',
    SOL: 'SOLUSDT',
    GOLD: ['PAXGUSDT', 'XAUTUSDT', 'PAXGPERP', 'XAUTPERP'],
  },
  hyperliquid: {
    BTC: 'BTC',
    ETH: 'ETH',
    XRP: 'XRP',
    SOL: 'SOL',
    GOLD: ['PAXG'],
  },
};

export const FUNDING_API = {
  binance: {
    current: 'https://fapi.binance.com/fapi/v1/premiumIndex',
    history: 'https://fapi.binance.com/fapi/v1/fundingRate',
  },
  okx: {
    current: 'https://www.okx.com/api/v5/public/funding-rate',
    history: 'https://www.okx.com/api/v5/public/funding-rate-history',
  },
  bybit: {
    current: 'https://api.bybit.com/v5/market/tickers',
    history: 'https://api.bybit.com/v5/market/funding/history',
  },
  hyperliquid: {
    info: 'https://api.hyperliquid.xyz/info',
  },
};
