// ============================================================
// Euler V2 Data Fetcher — Goldsky Subgraph
// ============================================================

import { EULER_ENDPOINTS, EVM_STABLECOIN_ADDRESSES, CHAIN_NAME_TO_ID } from '../config.js';
import { normalizeMarket } from '../utils.js';

const TARGET_CHAINS = ['ethereum', 'base', 'arbitrum'];

// EVM 체인의 스테이블코인 주소 → 심볼 매핑 (lowercase)
const ASSET_TO_SYMBOL = {};
for (const [, tokens] of Object.entries(EVM_STABLECOIN_ADDRESSES)) {
  for (const [symbol, addr] of Object.entries(tokens)) {
    ASSET_TO_SYMBOL[addr.toLowerCase()] = symbol;
  }
}

// 심볼별 decimals
const SYMBOL_DECIMALS = { USDC: 6, USDT: 6, USDS: 18, RLUSD: 18, PYUSD: 6 };

async function gql(endpoint, query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Euler API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// ray (1e27) → 퍼센트 변환
function rayToPercent(ray) {
  const n = Number(ray);
  if (!n || !isFinite(n)) return 0;
  // ray 단위: 3.5% → 3.5e25, /1e25 → 3.5
  return n / 1e25;
}

export async function fetchEulerData() {
  const allResults = [];

  for (const chain of TARGET_CHAINS) {
    const endpoint = EULER_ENDPOINTS[chain];
    if (!endpoint) continue;

    try {
      const data = await gql(endpoint, `{
        eulerVaults(first: 500) {
          evault
          name
          asset
          decimals
          state {
            totalBorrows
            cash
            supplyApy
            borrowApy
          }
        }
      }`);

      if (!data.eulerVaults) continue;

      // 스테이블코인 vault만 필터링
      const stableVaults = data.eulerVaults.filter(v => {
        const symbol = ASSET_TO_SYMBOL[v.asset?.toLowerCase()];
        return !!symbol && v.state;
      });

      // 체인/에셋별 가중평균 집계 (Morpho와 동일 방식)
      const groups = {};

      for (const v of stableVaults) {
        const symbol = ASSET_TO_SYMBOL[v.asset.toLowerCase()];
        const decimals = Number(v.decimals) || SYMBOL_DECIMALS[symbol] || 6;
        const totalBorrows = Number(v.state.totalBorrows) / (10 ** decimals);
        const cash = Number(v.state.cash) / (10 ** decimals);
        const tvl = cash + totalBorrows; // totalAssets = cash + totalBorrows

        if (tvl <= 0) continue;

        const supplyAPY = rayToPercent(v.state.supplyApy);
        const borrowAPY = rayToPercent(v.state.borrowApy);

        // 비정상 필터
        if (supplyAPY > 100 || borrowAPY > 100 || supplyAPY < 0) continue;

        if (!groups[symbol]) {
          groups[symbol] = { tvl: 0, borrow: 0, weightedSupply: 0, weightedBorrow: 0 };
        }
        groups[symbol].tvl += tvl;
        groups[symbol].borrow += totalBorrows;
        groups[symbol].weightedSupply += supplyAPY * tvl;
        groups[symbol].weightedBorrow += borrowAPY * (totalBorrows > 0 ? totalBorrows : tvl);
      }

      const chainId = CHAIN_NAME_TO_ID[chain];
      for (const [symbol, g] of Object.entries(groups)) {
        const supplyAPY = g.tvl > 0 ? g.weightedSupply / g.tvl : 0;
        const borrowAPY = g.borrow > 0 ? g.weightedBorrow / g.borrow : 0;
        const utilization = g.tvl > 0 ? g.borrow / g.tvl : 0;

        allResults.push(normalizeMarket(
          'euler', chain, chainId, symbol,
          supplyAPY, borrowAPY, g.tvl, g.borrow, utilization
        ));
      }
    } catch (err) {
      console.warn(`Euler ${chain} error:`, err.message);
    }
  }

  return { data: allResults, error: allResults.length === 0 ? 'No data' : null };
}
