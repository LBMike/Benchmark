// ============================================================
// Spark Data Fetcher — On-chain via ethers.js (Ethereum only)
// ============================================================

import {
  SPARK_CONFIG, SPARK_POOL_ADDRESSES_PROVIDER_ABI,
  SPARK_POOL_DATA_PROVIDER_ABI, RPC_URLS, RPC_FALLBACKS, STABLECOIN_ADDRESSES,
} from '../config.js';
import { rayToAPY, normalizeMarket } from '../utils.js';

const STABLECOINS = ['USDC', 'USDT', 'USDS', 'DAI'];

async function getWorkingProvider() {
  const urls = [RPC_URLS.ethereum, ...(RPC_FALLBACKS.ethereum || [])];
  for (const url of urls) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await Promise.race([
        p.getBlockNumber(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]);
      return p;
    } catch { /* try next */ }
  }
  return new ethers.JsonRpcProvider(RPC_URLS.ethereum);
}

export async function fetchSparkData() {
  try {
    const provider = await getWorkingProvider();
    const config = SPARK_CONFIG.ethereum;

    // 1. PoolDataProvider 주소 가져오기
    const addressesProvider = new ethers.Contract(
      config.poolAddressesProvider,
      SPARK_POOL_ADDRESSES_PROVIDER_ABI,
      provider
    );
    const dataProviderAddr = await addressesProvider.getPoolDataProvider();

    // 2. 모든 리저브 토큰 목록
    const dataProvider = new ethers.Contract(
      dataProviderAddr,
      SPARK_POOL_DATA_PROVIDER_ABI,
      provider
    );
    const allTokens = await dataProvider.getAllReservesTokens();

    // 3. 스테이블코인 필터링
    const stableTokens = allTokens.filter(t => STABLECOINS.includes(t.symbol));

    const results = [];
    const ethStableAddrs = STABLECOIN_ADDRESSES.ethereum;

    for (const token of stableTokens) {
      try {
        const reserveData = await dataProvider.getReserveData(token.tokenAddress);

        const supplyAPY = rayToAPY(reserveData.liquidityRate);
        const borrowAPY = rayToAPY(reserveData.variableBorrowRate);

        // totalAToken = total supply in wei units
        // USDC/USDT = 6 decimals, USDS/DAI = 18 decimals
        const decimals = (token.symbol === 'USDC' || token.symbol === 'USDT') ? 6 : 18;
        const totalAToken = Number(reserveData.totalAToken) / (10 ** decimals);
        const totalVariableDebt = Number(reserveData.totalVariableDebt) / (10 ** decimals);
        const tvl = totalAToken; // stablecoin ≈ $1
        const totalBorrow = totalVariableDebt;
        const utilization = tvl > 0 ? totalBorrow / tvl : 0;

        // 비정상 APY 필터
        if (supplyAPY > 100 || borrowAPY > 100) continue;

        results.push(normalizeMarket(
          'spark', 'ethereum', 1, token.symbol,
          supplyAPY, borrowAPY, tvl, totalBorrow, utilization
        ));
      } catch (e) {
        console.warn(`Spark reserve ${token.symbol}:`, e.message);
      }
    }

    return { data: results, error: null };
  } catch (err) {
    console.error('Spark fetch error:', err);
    return { data: [], error: err.message };
  }
}
