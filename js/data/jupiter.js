// ============================================================
// Jupiter Lending Data Fetcher — DefiLlama Pools API (Solana)
// ============================================================
//
// Jupiter's own API requires an API key (x-api-key).
// We use DefiLlama /pools endpoint instead (free, no auth).
// Jupiter Lend only has USDC and USDS (no PYUSD).
// Borrow rate is not publicly available — estimated from utilization.
// ============================================================

import { JUPITER_DEFI_LLAMA_URL } from '../config.js';
import { normalizeMarket } from '../utils.js';

const TARGET_SYMBOLS = ['USDC', 'USDS'];

// DefiLlama project name for Jupiter Lend
const JUPITER_PROJECT = 'jupiter-lend';

export async function fetchJupiterData() {
  try {
    const res = await fetch(JUPITER_DEFI_LLAMA_URL, {
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) throw new Error(`DefiLlama API ${res.status}`);
    const json = await res.json();
    const pools = json.data || json;

    if (!Array.isArray(pools)) throw new Error('Invalid DefiLlama response');

    // Filter for Jupiter Lend pools on Solana
    const jupiterPools = pools.filter(p =>
      p.project === JUPITER_PROJECT &&
      p.chain === 'Solana' &&
      TARGET_SYMBOLS.includes(p.symbol)
    );

    const results = [];

    for (const p of jupiterPools) {
      const symbol = p.symbol;
      const supplyAPY = Number(p.apy) || 0;
      const tvl = Number(p.tvlUsd) || 0;
      const totalBorrow = Number(p.totalBorrowUsd) || 0;
      const utilization = tvl > 0 ? totalBorrow / tvl : 0;

      // DefiLlama doesn't provide borrow rate directly
      // Use reported apyBorrow first, otherwise estimate from utilization.
      const reportedBorrowAPY = Number(p.apyBorrow);
      let borrowAPY;
      if (Number.isFinite(reportedBorrowAPY) && reportedBorrowAPY > 0) {
        borrowAPY = reportedBorrowAPY;
      } else if (utilization > 0.01) {
        borrowAPY = supplyAPY / utilization;
      } else {
        borrowAPY = supplyAPY * 1.4;
      }

      // 비정상 APY 필터
      if (supplyAPY > 100 || supplyAPY < 0 || borrowAPY > 100 || borrowAPY < 0) continue;

      results.push(normalizeMarket(
        'jupiter', 'solana', 101, symbol,
        supplyAPY, borrowAPY, tvl, totalBorrow, utilization
      ));
    }

    return { data: results, error: results.length === 0 ? 'No data' : null };
  } catch (err) {
    console.error('Jupiter fetch error:', err);
    return { data: [], error: err.message };
  }
}
