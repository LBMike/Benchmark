// ============================================================
// Morpho Data Fetcher — GraphQL API
// ============================================================

import { MORPHO_ENDPOINT, EVM_STABLECOIN_ADDRESSES, CHAIN_ID_TO_NAME } from '../config.js';
import { normalizeMarket, daysAgoTimestamp, nowTimestamp } from '../utils.js';

const TARGET_CHAIN_IDS = [1, 8453, 42161];

// EVM 체인의 USDC/USDT 주소 목록 (API 필터용, Solana 주소 제외)
const ALL_STABLECOIN_ADDRS = [];
for (const [, tokens] of Object.entries(EVM_STABLECOIN_ADDRESSES)) {
  for (const addr of Object.values(tokens)) {
    ALL_STABLECOIN_ADDRS.push(addr.toLowerCase());
  }
}

// 심볼 정규화 (USDT0, USD₮0 → USDT 등)
function normalizeSymbol(sym, addr) {
  const addrLower = addr?.toLowerCase();
  for (const [, tokens] of Object.entries(EVM_STABLECOIN_ADDRESSES)) {
    for (const [symbol, tokenAddr] of Object.entries(tokens)) {
      if (tokenAddr.toLowerCase() === addrLower) return symbol;
    }
  }
  if (/^USDC/i.test(sym)) return 'USDC';
  if (/^USDT|^USD[₮T]0?$/i.test(sym)) return 'USDT';
  return sym;
}

async function gql(query) {
  const res = await fetch(MORPHO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Morpho API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// 현재 금리 데이터
export async function fetchMorphoData() {
  try {
    // loanAssetAddress_in으로 서버 사이드 필터링 (USDC/USDT만)
    const addrList = ALL_STABLECOIN_ADDRS.map(a => `"${a}"`).join(',');
    const data = await gql(`{
      markets(
        first: 200
        orderBy: SupplyAssetsUsd
        orderDirection: Desc
        where: {
          chainId_in: [${TARGET_CHAIN_IDS.join(',')}]
          loanAssetAddress_in: [${addrList}]
        }
      ) {
        items {
          uniqueKey
          loanAsset { symbol address }
          collateralAsset { symbol }
          state {
            supplyApy
            borrowApy
            supplyAssetsUsd
            borrowAssetsUsd
            utilization
          }
          morphoBlue { chain { id } }
        }
      }
    }`);

    const stableMarkets = data.markets.items;

    // 비정상 마켓 필터 (APY > 100%이거나 utilization = 1.0인 마켓)
    const validMarkets = stableMarkets.filter(m => {
      const sApy = (m.state.supplyApy || 0) * 100;
      const bApy = (m.state.borrowApy || 0) * 100;
      return sApy < 100 && bApy < 100 && m.state.utilization < 0.999;
    });

    // 체인/에셋별 가중 평균으로 집계
    const groups = {};
    for (const m of validMarkets) {
      const chainId = m.morphoBlue.chain.id;
      const chain = CHAIN_ID_TO_NAME[chainId];
      if (!chain) continue;

      const asset = normalizeSymbol(m.loanAsset.symbol, m.loanAsset.address);
      const key = `${chain}-${asset}`;
      if (!groups[key]) {
        groups[key] = { chain, chainId, asset, markets: [] };
      }
      groups[key].markets.push(m);
    }

    const results = [];
    for (const [, group] of Object.entries(groups)) {
      let totalTVL = 0, totalBorrow = 0;
      let weightedSupply = 0, weightedBorrow = 0;
      let totalUtil = 0;

      for (const m of group.markets) {
        const tvl = m.state.supplyAssetsUsd || 0;
        const borrow = m.state.borrowAssetsUsd || 0;
        totalTVL += tvl;
        totalBorrow += borrow;
        weightedSupply += (m.state.supplyApy || 0) * 100 * tvl;
        weightedBorrow += (m.state.borrowApy || 0) * 100 * borrow;
        totalUtil += (m.state.utilization || 0) * tvl;
      }

      const supplyAPY = totalTVL > 0 ? weightedSupply / totalTVL : 0;
      const borrowAPY = totalBorrow > 0 ? weightedBorrow / totalBorrow : 0;
      const utilization = totalTVL > 0 ? totalUtil / totalTVL : 0;

      results.push(normalizeMarket(
        'morpho', group.chain, group.chainId, group.asset,
        supplyAPY, borrowAPY, totalTVL, totalBorrow, utilization
      ));
    }

    return { data: results, error: null };
  } catch (err) {
    console.error('Morpho fetch error:', err);
    return { data: [], error: err.message };
  }
}

// 히스토리 데이터 — 가장 큰 마켓의 히스토리를 대표로 사용
export async function fetchMorphoHistory(days = 90) {
  const results = { supply: {}, borrow: {}, supplyUsd: {}, borrowUsd: {} };
  const start = daysAgoTimestamp(days);
  const end = nowTimestamp();

  try {
    // USDC/USDT 중 가장 큰 마켓을 체인별로 찾기
    const addrList = ALL_STABLECOIN_ADDRS.map(a => `"${a}"`).join(',');
    const data = await gql(`{
      markets(
        first: 50
        orderBy: SupplyAssetsUsd
        orderDirection: Desc
        where: {
          chainId_in: [${TARGET_CHAIN_IDS.join(',')}]
          loanAssetAddress_in: [${addrList}]
          supplyAssetsUsd_gte: 10000000
        }
      ) {
        items {
          uniqueKey
          loanAsset { symbol address }
          state { supplyAssetsUsd }
          morphoBlue { chain { id } }
        }
      }
    }`);

    // 체인/에셋별 가장 큰 마켓 선택
    const topMarkets = {};
    for (const m of data.markets.items) {
      const sym = normalizeSymbol(m.loanAsset.symbol, m.loanAsset.address);
      const chainId = m.morphoBlue.chain.id;
      const chain = CHAIN_ID_TO_NAME[chainId];
      if (!chain) continue;

      const key = `morpho-${chain}-${sym.toLowerCase()}`;
      const tvl = m.state.supplyAssetsUsd || 0;
      if (!topMarkets[key] || tvl > topMarkets[key].tvl) {
        topMarkets[key] = { uniqueKey: m.uniqueKey, chainId, tvl };
      }
    }

    // 각 대표 마켓의 히스토리 가져오기
    for (const [marketId, info] of Object.entries(topMarkets)) {
      try {
        const histData = await gql(`{
          marketByUniqueKey(uniqueKey: "${info.uniqueKey}", chainId: ${info.chainId}) {
            historicalState {
              supplyApy(options: { startTimestamp: ${start}, endTimestamp: ${end}, interval: DAY }) { x y }
              borrowApy(options: { startTimestamp: ${start}, endTimestamp: ${end}, interval: DAY }) { x y }
              supplyAssetsUsd(options: { startTimestamp: ${start}, endTimestamp: ${end}, interval: DAY }) { x y }
              borrowAssetsUsd(options: { startTimestamp: ${start}, endTimestamp: ${end}, interval: DAY }) { x y }
            }
          }
        }`);

        const hist = histData.marketByUniqueKey?.historicalState;
        const MAX_APY = 50; // 비정상 스파이크 필터 (50% 이상 제거)
        if (hist?.supplyApy) {
          results.supply[marketId] = hist.supplyApy
            .map(p => ({ x: p.x, y: (p.y || 0) * 100 }))
            .filter(p => p.y >= 0 && p.y <= MAX_APY)
            .sort((a, b) => a.x - b.x);
        }
        if (hist?.borrowApy) {
          results.borrow[marketId] = hist.borrowApy
            .map(p => ({ x: p.x, y: (p.y || 0) * 100 }))
            .filter(p => p.y >= 0 && p.y <= MAX_APY)
            .sort((a, b) => a.x - b.x);
        }
        if (hist?.supplyAssetsUsd) {
          results.supplyUsd[marketId] = hist.supplyAssetsUsd
            .map(p => ({ x: p.x, y: Number(p.y) || 0 }))
            .filter(p => p.y >= 0)
            .sort((a, b) => a.x - b.x);
        }
        if (hist?.borrowAssetsUsd) {
          results.borrowUsd[marketId] = hist.borrowAssetsUsd
            .map(p => ({ x: p.x, y: Number(p.y) || 0 }))
            .filter(p => p.y >= 0)
            .sort((a, b) => a.x - b.x);
        }
      } catch (e) {
        console.warn(`Morpho history ${marketId}:`, e.message);
      }
    }
  } catch (err) {
    console.error('Morpho history error:', err);
  }

  return results;
}
