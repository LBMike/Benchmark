// ============================================================
// Kamino Finance Data Fetcher — REST API (Solana)
// ============================================================

import { KAMINO_API_BASE, KAMINO_MAIN_MARKET, SOLANA_MINT_TO_SYMBOL } from '../config.js';
import { normalizeMarket } from '../utils.js';

const TARGET_SYMBOLS = ['USDC', 'USDS', 'PYUSD'];

export async function fetchKaminoData() {
  try {
    const url = `${KAMINO_API_BASE}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`Kamino API ${res.status}`);
    const reserves = await res.json();

    if (!Array.isArray(reserves)) throw new Error('Invalid Kamino response');

    const results = [];

    for (const r of reserves) {
      // API 응답 구조: liquidityTokenMint = 토큰 mint 주소
      const mint = r.liquidityTokenMint || '';
      const symbol = SOLANA_MINT_TO_SYMBOL[mint] || '';

      if (!TARGET_SYMBOLS.includes(symbol)) continue;

      // Kamino API: supplyApy/borrowApy는 최상위, decimal (0.034 = 3.4%)
      const supplyAPY = (Number(r.supplyApy) || 0) * 100;
      const borrowAPY = (Number(r.borrowApy) || 0) * 100;
      const tvl = Number(r.totalSupplyUsd) || 0;
      const totalBorrow = Number(r.totalBorrowUsd) || 0;
      const utilization = tvl > 0 ? totalBorrow / tvl : 0;

      // 비정상 APY 필터
      if (supplyAPY > 100 || borrowAPY > 100 || supplyAPY < 0) continue;

      results.push(normalizeMarket(
        'kamino', 'solana', 101, symbol,
        supplyAPY, borrowAPY, tvl, totalBorrow, utilization
      ));
    }

    return { data: results, error: results.length === 0 ? 'No data' : null };
  } catch (err) {
    console.error('Kamino fetch error:', err);
    return { data: [], error: err.message };
  }
}
