// ============================================================
// Sky Protocol (SSR + SparkLend USDS) — DefiLlama per-pool API
// TVL-weighted average across all Sky USDS pools on Ethereum
// ============================================================

import { SKY_DEFILLAMA_POOLS, CHAIN_NAME_TO_ID } from '../config.js';
import { normalizeMarket } from '../utils.js';

const DEFILLAMA_CHART_URL = 'https://yields.llama.fi/chart';

export async function fetchSkyData() {
  const entries = Object.entries(SKY_DEFILLAMA_POOLS); // [['USDS-SSR', poolId], ...]

  const fetches = entries.map(async ([label, poolId]) => {
    try {
      const res = await fetch(`${DEFILLAMA_CHART_URL}/${poolId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const points = json.data || [];
      if (points.length === 0) return null;

      const latest = points[points.length - 1];
      const supplyAPY = latest.apyBase ?? latest.apy ?? 0;
      const tvl = latest.tvlUsd || 0;
      if (tvl < 1_000_000) return null;

      return { label, supplyAPY, tvl };
    } catch (e) {
      console.warn(`Sky DefiLlama ${label}:`, e.message);
      return null;
    }
  });

  const settled = await Promise.allSettled(fetches);
  const pools = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) pools.push(r.value);
  }

  if (pools.length === 0) {
    return { data: [], error: 'No data' };
  }

  // TVL-weighted average supply APY across all Sky USDS pools
  let weightedSupply = 0;
  let totalTvl = 0;

  for (const p of pools) {
    weightedSupply += p.supplyAPY * p.tvl;
    totalTvl += p.tvl;
  }

  const avgSupplyAPY = totalTvl > 0 ? weightedSupply / totalTvl : 0;

  // Sky is primarily supply-side (SSR); no direct borrow market data on DefiLlama
  // Use SparkLend-like estimate for borrow
  const borrowAPY = avgSupplyAPY * 1.2;
  const utilization = 0.7;
  const totalBorrow = totalTvl * utilization;

  const market = normalizeMarket(
    'sky', 'ethereum', CHAIN_NAME_TO_ID.ethereum, 'USDS',
    avgSupplyAPY, borrowAPY, totalTvl, totalBorrow, utilization
  );

  return { data: [market], error: null };
}
