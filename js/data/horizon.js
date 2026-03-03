// ============================================================
// Aave Horizon (RWA Market) — DefiLlama per-pool API
// ============================================================

import { HORIZON_DEFILLAMA_POOLS, CHAIN_NAME_TO_ID } from '../config.js';
import { normalizeMarket } from '../utils.js';

const DEFILLAMA_CHART_URL = 'https://yields.llama.fi/chart';

export async function fetchHorizonData() {
  const results = [];

  const entries = Object.entries(HORIZON_DEFILLAMA_POOLS); // [['RLUSD', poolId], ...]

  const fetches = entries.map(async ([symbol, poolId]) => {
    try {
      const res = await fetch(`${DEFILLAMA_CHART_URL}/${poolId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const points = json.data || [];
      if (points.length === 0) return null;

      const latest = points[points.length - 1];
      const supplyAPY = latest.apyBase || latest.apy || 0;
      const tvl = latest.tvlUsd || 0;
      if (tvl < 1_000_000) return null;

      // Horizon is supply-only for stablecoin lenders; estimate borrow from utilization
      const borrowAPY = supplyAPY * 1.3;
      const utilization = 0.6;
      const totalBorrow = tvl * utilization;

      return normalizeMarket(
        'horizon', 'ethereum', CHAIN_NAME_TO_ID.ethereum, symbol,
        supplyAPY, borrowAPY, tvl, totalBorrow, utilization
      );
    } catch (e) {
      console.warn(`Horizon DefiLlama ${symbol}:`, e.message);
      return null;
    }
  });

  const settled = await Promise.allSettled(fetches);
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) results.push(r.value);
  }

  return { data: results, error: results.length === 0 ? 'No data' : null };
}
