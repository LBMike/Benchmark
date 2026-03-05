// ============================================================
// Data Tables — Overview, Supply, Borrow
// ============================================================

import { PROTOCOL_COLORS, PROTOCOL_LABELS } from '../config.js';
import { formatAPY, formatUSD, formatUtilizationHtml, weightedAverage } from '../utils.js';

const sortState = {
  overview: { key: 'supplyAPY', dir: 'desc' },
  supply: { key: 'supplyAPY', dir: 'desc' },
  borrow: { key: 'borrowAPY', dir: 'desc' },
};

function sortMarkets(markets, key, dir) {
  return [...markets].sort((a, b) => {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    return dir === 'desc' ? vb - va : va - vb;
  });
}

function protocolDot(protocol) {
  const color = PROTOCOL_COLORS[protocol] || '#888';
  return `<span class="protocol-dot" style="background:${color}"></span>`;
}

function chainBadge(chain) {
  const labels = { ethereum: 'ETH', base: 'Base', arbitrum: 'ARB', plasma: 'Plasma', solana: 'SOL' };
  return `<span class="chain-badge">${labels[chain] || chain}</span>`;
}

function poolCell(market) {
  const label = PROTOCOL_LABELS[market.protocol] || market.protocol;
  return `
    <div class="pool-cell">
      ${protocolDot(market.protocol)}
      <div class="pool-info">
        <span class="pool-name">${market.asset}</span>
        <span class="pool-protocol">${label}</span>
      </div>
    </div>
  `;
}

function getTableSort(tableType) {
  return sortState[tableType] || sortState.overview;
}

// --- Net Flow 24h 헬퍼 ---
/**
 * 마켓 → DefiLlama/Morpho 히스토리 키 매핑 후 최근 24h 델타 계산
 * supplyUsdMap / borrowUsdMap = store.getHistory('supplyUsd') / ('borrowUsd')
 */
function getHistoryKey(m) {
  // DefiLlama key: dl-{protocol}-{chain}-{ASSET}
  return `dl-${m.protocol}-${m.chain}-${m.asset}`;
}

function compute24hDelta(histMap, key) {
  // 먼저 DefiLlama 키로 시도, 없으면 marketId(Morpho 등)로 폴백
  const points = histMap[key] || histMap[key?.toLowerCase?.()] || null;
  if (!points || points.length < 2) return null;
  const latest = points[points.length - 1].y;
  const prev = points[points.length - 2].y;
  return latest - prev;
}

function formatFlow(value) {
  if (value == null || !Number.isFinite(value)) return '<span class="flow-value" style="color:#888">—</span>';
  const abs = Math.abs(value);
  let display;
  if (abs >= 1e9) display = `$${(abs / 1e9).toFixed(2)}B`;
  else if (abs >= 1e6) display = `$${(abs / 1e6).toFixed(2)}M`;
  else if (abs >= 1e3) display = `$${(abs / 1e3).toFixed(1)}K`;
  else display = `$${abs.toFixed(0)}`;
  const sign = value >= 0 ? '+' : '-';
  const color = value >= 0 ? '#3fb950' : '#f85149';
  return `<span class="flow-value" style="color:${color}">${sign}${display}</span>`;
}

function enrichMarketsWithFlow(markets, supplyUsdMap, borrowUsdMap, lendBorrowDeltas) {
  return markets.map(m => {
    const dlKey = getHistoryKey(m);

    // 1순위: /lendBorrow 스냅샷 델타 (가장 신뢰도 높음)
    const snapshotDelta = lendBorrowDeltas[dlKey];
    if (snapshotDelta) {
      return {
        ...m,
        netSupply24h: snapshotDelta.supplyDelta,
        netBorrow24h: snapshotDelta.borrowDelta,
        _hasFlow: true,
      };
    }

    // 2순위: 히스토리 기반 델타 (Morpho 등)
    const ns = compute24hDelta(supplyUsdMap, dlKey) ?? compute24hDelta(supplyUsdMap, m.marketId);
    const nb = compute24hDelta(borrowUsdMap, dlKey) ?? compute24hDelta(borrowUsdMap, m.marketId);
    return { ...m, netSupply24h: ns ?? 0, netBorrow24h: nb ?? 0, _hasFlow: ns != null || nb != null };
  });
}

function buildWeightedOverviewRow(markets) {
  const totalSupply = markets.reduce((sum, m) => sum + (Number(m.tvl) || 0), 0);
  const totalBorrow = markets.reduce((sum, m) => sum + (Number(m.totalBorrow) || 0), 0);
  const supplyBenchmark = weightedAverage(markets, 'supplyAPY', 'tvl');
  const borrowBenchmark = weightedAverage(markets, 'borrowAPY', 'totalBorrow');
  // Sky 제외 utilization (랜딩 풀이 아니므로 비율 왜곡)
  const lendingMarkets = markets.filter(m => m.protocol !== 'sky');
  const lendingSupply = lendingMarkets.reduce((sum, m) => sum + (Number(m.tvl) || 0), 0);
  const lendingBorrow = lendingMarkets.reduce((sum, m) => sum + (Number(m.totalBorrow) || 0), 0);
  const utilization = lendingSupply > 0 ? lendingBorrow / lendingSupply : 0;

  // 전체 net flow 합산 (Sky 제외)
  const aggNetSupply = lendingMarkets.reduce((sum, m) => sum + (m.netSupply24h || 0), 0);
  const aggNetBorrow = lendingMarkets.reduce((sum, m) => sum + (m.netBorrow24h || 0), 0);

  return `
    <tr class="weighted-row">
      <td>
        <div class="pool-cell">
          <span class="protocol-dot weighted-dot"></span>
          <div class="pool-info">
            <span class="pool-name">Weighted Benchmark</span>
            <span class="pool-protocol">${markets.length} filtered markets</span>
          </div>
        </div>
      </td>
      <td><span class="chain-badge">ALL</span></td>
      <td><strong>ALL</strong></td>
      <td><span class="apy-value supply-high">${formatAPY(supplyBenchmark)}</span></td>
      <td><span class="apy-value">${formatAPY(borrowBenchmark)}</span></td>
      <td class="tvl-value">${formatUSD(totalSupply)}</td>
      <td class="tvl-value">${formatUSD(totalBorrow)}</td>
      <td>${formatFlow(aggNetSupply)}</td>
      <td>${formatFlow(aggNetBorrow)}</td>
      <td>${formatUtilizationHtml(utilization)}</td>
    </tr>
  `;
}

// --- Overview Table ---
export function renderOverviewTable(markets, history, lendBorrowDeltas) {
  const tbody = document.getElementById('overview-table-body');
  if (!tbody) return;

  const supplyUsdMap = history?.supplyUsd || {};
  const borrowUsdMap = history?.borrowUsd || {};
  const deltas = lendBorrowDeltas || {};

  // 마켓에 netFlow 필드 추가
  const enriched = enrichMarketsWithFlow(markets, supplyUsdMap, borrowUsdMap, deltas);

  const sort = getTableSort('overview');
  const sorted = sortMarkets(enriched, sort.key, sort.dir);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No markets match the current filter (TVL ≥ $100M)</td></tr>`;
    return;
  }

  const weightedRow = buildWeightedOverviewRow(sorted);

  tbody.innerHTML = weightedRow + sorted.map(m => `
    <tr>
      <td>${poolCell(m)}</td>
      <td>${chainBadge(m.chain)}</td>
      <td><strong>${m.asset}</strong></td>
      <td><span class="apy-value supply-high">${formatAPY(m.supplyAPY)}</span></td>
      <td><span class="apy-value">${formatAPY(m.borrowAPY)}</span></td>
      <td class="tvl-value">${formatUSD(m.tvl)}</td>
      <td class="tvl-value">${formatUSD(m.totalBorrow)}</td>
      <td>${m._hasFlow ? formatFlow(m.netSupply24h) : formatFlow(null)}</td>
      <td>${m._hasFlow ? formatFlow(m.netBorrow24h) : formatFlow(null)}</td>
      <td>${formatUtilizationHtml(m.utilization)}</td>
    </tr>
  `).join('');
}

// --- Supply Table ---
export function renderSupplyTable(markets) {
  const tbody = document.getElementById('supply-table-body');
  if (!tbody) return;

  const sort = getTableSort('supply');
  const sorted = sortMarkets(markets, sort.key, sort.dir);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No supply pools found</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(m => `
    <tr>
      <td>${poolCell(m)}</td>
      <td>${chainBadge(m.chain)}</td>
      <td><span class="apy-value supply-high">${formatAPY(m.supplyAPY)}</span></td>
      <td class="tvl-value">${formatUSD(m.tvl)}</td>
      <td>${formatUtilizationHtml(m.utilization)}</td>
    </tr>
  `).join('');
}

// --- Borrow Table ---
export function renderBorrowTable(markets) {
  const tbody = document.getElementById('borrow-table-body');
  if (!tbody) return;

  const sort = getTableSort('borrow');
  const sorted = sortMarkets(markets, sort.key, sort.dir);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No borrow pools found</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(m => `
    <tr>
      <td>${poolCell(m)}</td>
      <td>${chainBadge(m.chain)}</td>
      <td><span class="apy-value">${formatAPY(m.borrowAPY)}</span></td>
      <td class="tvl-value">${formatUSD(m.totalBorrow)}</td>
      <td>${formatUtilizationHtml(m.utilization)}</td>
    </tr>
  `).join('');
}

// --- Sort Handler ---
export function initTableSort() {
  document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const tableId = th.closest('table')?.id || '';
      const tableType = tableId === 'overview-table'
        ? 'overview'
        : tableId === 'supply-table'
          ? 'supply'
          : tableId === 'borrow-table'
            ? 'borrow'
            : 'overview';

      const key = th.dataset.sort;
      const state = getTableSort(tableType);
      if (state.key === key) {
        state.dir = state.dir === 'desc' ? 'asc' : 'desc';
      } else {
        state.key = key;
        state.dir = 'desc';
      }
      // 테이블은 store의 notify를 통해 다시 렌더링됨
      // 여기서는 sort 상태만 업데이트하고, 외부에서 rerender 호출
      document.dispatchEvent(new CustomEvent('sort-changed'));
    });
  });
}
