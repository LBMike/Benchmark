// ============================================================
// Data Tables — Overview, Supply, Borrow
// ============================================================

import { PROTOCOL_COLORS, PROTOCOL_LABELS } from '../config.js';
import { formatAPY, formatUSD, formatUtilizationHtml } from '../utils.js';

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

// --- Overview Table ---
export function renderOverviewTable(markets) {
  const tbody = document.getElementById('overview-table-body');
  if (!tbody) return;

  const sort = getTableSort('overview');
  const sorted = sortMarkets(markets, sort.key, sort.dir);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No markets match the current filter (TVL ≥ $100M)</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(m => `
    <tr>
      <td>${poolCell(m)}</td>
      <td>${chainBadge(m.chain)}</td>
      <td><strong>${m.asset}</strong></td>
      <td><span class="apy-value supply-high">${formatAPY(m.supplyAPY)}</span></td>
      <td><span class="apy-value">${formatAPY(m.borrowAPY)}</span></td>
      <td class="tvl-value">${formatUSD(m.tvl)}</td>
      <td><span class="apy-value">${formatAPY(m.spread)}</span></td>
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
