// ============================================================
// DefiLlama chartLendBorrow — Historical Supply/Borrow USD
// Used for Net Flow calculations across all lending protocols
// ============================================================

import { DEFILLAMA_LEND_BORROW_POOLS } from '../config.js';

const CHART_LEND_BORROW_URL = 'https://yields.llama.fi/chartLendBorrow';

export async function fetchDefiLlamaHistory() {
  const results = { supplyUsd: {}, borrowUsd: {} };
  const entries = Object.entries(DEFILLAMA_LEND_BORROW_POOLS);

  // Fetch all pools in parallel (with concurrency limit via allSettled)
  const fetches = entries.map(async ([marketId, poolId]) => {
    try {
      const res = await fetch(`${CHART_LEND_BORROW_URL}/${poolId}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return;

      const json = await res.json();
      const points = json.data || json || [];
      if (!Array.isArray(points) || points.length === 0) return;

      const supplyArr = [];
      const borrowArr = [];

      for (const p of points) {
        const ts = typeof p.timestamp === 'string'
          ? Math.floor(new Date(p.timestamp).getTime() / 1000)
          : Math.floor(Number(p.timestamp) / (p.timestamp > 1e12 ? 1000 : 1));

        if (!Number.isFinite(ts) || ts <= 0) continue;

        const supply = Number(p.totalSupplyUsd) || 0;
        const borrow = Number(p.totalBorrowUsd) || 0;

        if (supply > 0) supplyArr.push({ x: ts, y: supply });
        if (borrow >= 0) borrowArr.push({ x: ts, y: borrow });
      }

      // Sort by timestamp ascending
      supplyArr.sort((a, b) => a.x - b.x);
      borrowArr.sort((a, b) => a.x - b.x);

      if (supplyArr.length > 0) results.supplyUsd[marketId] = supplyArr;
      if (borrowArr.length > 0) results.borrowUsd[marketId] = borrowArr;
    } catch (e) {
      console.warn(`DefiLlama history ${marketId}:`, e.message);
    }
  });

  await Promise.allSettled(fetches);

  const supplyCount = Object.keys(results.supplyUsd).length;
  const borrowCount = Object.keys(results.borrowUsd).length;
  console.log(`DefiLlama history loaded: ${supplyCount} supply, ${borrowCount} borrow series`);

  return results;
}
