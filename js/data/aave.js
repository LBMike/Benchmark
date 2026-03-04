// ============================================================
// AAVE V3 Data Fetcher — GraphQL API
// ============================================================

import { AAVE_ENDPOINT, AAVE_MARKETS, EVM_CHAINS, EVM_STABLECOIN_ADDRESSES, ADDRESS_TO_SYMBOL, AAVE_EXTRA_ASSETS } from '../config.js';
import { decimalToPercent, normalizeMarket, chainIdToName } from '../utils.js';

// Build Aave-specific address lookup (stablecoins + extra assets like WETH)
const AAVE_ADDR_TO_SYMBOL = { ...ADDRESS_TO_SYMBOL };
for (const [, tokens] of Object.entries(AAVE_EXTRA_ASSETS)) {
  for (const [symbol, addr] of Object.entries(tokens)) {
    AAVE_ADDR_TO_SYMBOL[addr.toLowerCase()] = symbol;
  }
}

// Non-stablecoin assets (TVL must use USD from API, not token count)
const NON_STABLE_SYMBOLS = new Set(
  Object.values(AAVE_EXTRA_ASSETS).flatMap(tokens => Object.keys(tokens))
);

async function gql(query, variables = {}) {
  const res = await fetch(AAVE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`AAVE API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// 현재 금리 데이터
export async function fetchAaveData() {
  try {
    const chainIds = EVM_CHAINS.map(c => c.id);
    const data = await gql(`{
      markets(request: { chainIds: [${chainIds.join(',')}] }) {
        name
        address
        chain { chainId }
        reserves {
          underlyingToken { symbol address decimals }
          supplyInfo {
            apy { value }
            total { value }
            supplyCap { usd }
          }
          borrowInfo {
            apy { value }
            total { usd amount { value } }
            utilizationRate { value }
          }
        }
      }
    }`);

    // 메인 마켓만 필터링 (AAVE_MARKETS 주소와 일치하는 것)
    const mainMarketAddrs = new Set(
      Object.values(AAVE_MARKETS).map(a => a.toLowerCase())
    );

    const results = [];
    for (const market of data.markets) {
      const chainId = market.chain.chainId;
      const chain = chainIdToName(chainId);
      if (!chain || chain === 'unknown') continue;

      // 메인 마켓만 사용 (Lido, EtherFi 등 서브 마켓 제외)
      if (!mainMarketAddrs.has(market.address?.toLowerCase())) continue;

      for (const reserve of market.reserves) {
        // 주소 기반 필터링 (심볼 변형 문제 해결: USD₮0, USDC.e 등)
        const tokenAddr = reserve.underlyingToken.address?.toLowerCase();
        const symbol = AAVE_ADDR_TO_SYMBOL[tokenAddr];
        if (!symbol) continue; // 추적 대상 주소 목록에 없으면 스킵

        const supplyAPY = decimalToPercent(reserve.supplyInfo.apy.value);
        const borrowAPY = decimalToPercent(reserve.borrowInfo.apy.value);

        const totalSupplyTokens = Number(reserve.supplyInfo.total.value) || 0;
        const totalBorrowUsd = Number(reserve.borrowInfo.total.usd) || 0;
        const utilization = Number(reserve.borrowInfo.utilizationRate.value) || 0;

        // TVL: for non-stablecoins (WETH), derive USD TVL from borrow USD / utilization
        let tvl;
        if (NON_STABLE_SYMBOLS.has(symbol)) {
          tvl = utilization > 0.01 ? totalBorrowUsd / utilization : totalBorrowUsd;
        } else {
          tvl = totalSupplyTokens; // stablecoin ≈ $1 each
        }

        // 비정상 APY 필터 (>100% 이상은 스킵)
        if (supplyAPY > 100 || borrowAPY > 100) continue;

        results.push(normalizeMarket(
          'aave-v3', chain, chainId, symbol,
          supplyAPY, borrowAPY, tvl, totalBorrowUsd, utilization
        ));
      }
    }

    return { data: results, error: null };
  } catch (err) {
    console.error('AAVE fetch error:', err);
    return { data: [], error: err.message };
  }
}

// 히스토리 데이터
export async function fetchAaveHistory() {
  const results = { supply: {}, borrow: {} };

  try {
    for (const chain of EVM_CHAINS) {
      const marketAddr = AAVE_MARKETS[chain.id];
      if (!marketAddr) continue;

      const stableAddrs = EVM_STABLECOIN_ADDRESSES[chain.name] || {};
      const extraAddrs = AAVE_EXTRA_ASSETS[chain.name] || {};
      const allAddrs = { ...stableAddrs, ...extraAddrs };
      for (const [symbol, tokenAddr] of Object.entries(allAddrs)) {
        try {
          const data = await gql(`{
            supplyAPYHistory(request: {
              market: "${marketAddr}",
              underlyingToken: "${tokenAddr}",
              window: LAST_YEAR,
              chainId: ${chain.id}
            }) { avgRate { value } date }
            borrowAPYHistory(request: {
              market: "${marketAddr}",
              underlyingToken: "${tokenAddr}",
              window: LAST_YEAR,
              chainId: ${chain.id}
            }) { avgRate { value } date }
          }`);

          const marketId = `aave-v3-${chain.name}-${symbol.toLowerCase()}`;

          const MAX_APY = 50; // 비정상 스파이크 필터
          if (data.supplyAPYHistory) {
            results.supply[marketId] = data.supplyAPYHistory
              .map(p => ({ x: new Date(p.date).getTime() / 1000, y: decimalToPercent(p.avgRate.value) }))
              .filter(p => p.y >= 0 && p.y <= MAX_APY)
              .sort((a, b) => a.x - b.x);
          }
          if (data.borrowAPYHistory) {
            results.borrow[marketId] = data.borrowAPYHistory
              .map(p => ({ x: new Date(p.date).getTime() / 1000, y: decimalToPercent(p.avgRate.value) }))
              .filter(p => p.y >= 0 && p.y <= MAX_APY)
              .sort((a, b) => a.x - b.x);
          }
        } catch (e) {
          console.warn(`AAVE history ${chain.name}/${symbol}:`, e.message);
        }
      }
    }
  } catch (err) {
    console.error('AAVE history error:', err);
  }

  return results;
}
