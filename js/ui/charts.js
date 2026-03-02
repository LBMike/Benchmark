// ============================================================
// Supply / Borrow History Charts
// ============================================================

import { PROTOCOL_COLORS, PROTOCOL_LABELS } from '../config.js';

let supplyChart = null;
let borrowChart = null;

function buildHistoryChart(canvasId, historyMap, range = 90, existingChart = null) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const cutoff = Date.now() / 1000 - range * 86400;

  // 모든 타임스탬프 수집
  const allTimestamps = new Set();
  for (const points of Object.values(historyMap)) {
    for (const p of points) {
      if (p.x >= cutoff) allTimestamps.add(p.x);
    }
  }

  const timestamps = [...allTimestamps].sort((a, b) => a - b);

  if (timestamps.length === 0) {
    if (existingChart) { existingChart.destroy(); }
    return null;
  }

  const labels = timestamps.map(t => {
    const d = new Date(t * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = [];
  for (const [marketId, points] of Object.entries(historyMap)) {
    const parts = marketId.split('-');
    const protocol = parts[0] === 'aave' ? 'aave-v3' : parts[0];
    const chain = parts.length >= 3 ? parts[parts.length - 2] : '';
    const asset = parts[parts.length - 1]?.toUpperCase() || '';
    const color = PROTOCOL_COLORS[protocol] || '#888';
    const label = PROTOCOL_LABELS[protocol] || protocol;

    const pointMap = {};
    for (const p of points) { pointMap[p.x] = p.y; }

    datasets.push({
      label: `${label} ${chain} ${asset}`,
      data: timestamps.map(t => pointMap[t] ?? null),
      borderColor: color,
      backgroundColor: color + '15',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
    });
  }

  if (existingChart) existingChart.destroy();

  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#8b949e',
            font: { size: 11 },
            boxWidth: 12,
            padding: 12,
          },
        },
        tooltip: {
          backgroundColor: '#1c2128',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.raw?.toFixed(2) ?? '—'}%`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#8b949e', font: { size: 11 }, maxTicksLimit: 10 },
          grid: { color: '#21262d' },
        },
        y: {
          ticks: {
            color: '#8b949e',
            font: { size: 11 },
            callback: v => v.toFixed(1) + '%',
          },
          grid: { color: '#21262d' },
        },
      },
    },
  });
}

export function renderSupplyHistoryChart(historySupply, range = 90) {
  supplyChart = buildHistoryChart('supply-history-chart', historySupply, range, supplyChart);
}

export function renderBorrowHistoryChart(historyBorrow, range = 90) {
  borrowChart = buildHistoryChart('borrow-history-chart', historyBorrow, range, borrowChart);
}
