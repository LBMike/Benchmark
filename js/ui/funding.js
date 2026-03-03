// ============================================================
// Funding Rate Tab — Cards, Chart, Table
// ============================================================

import { FUNDING_EXCHANGES, FUNDING_ASSETS } from '../config.js';
import {
  formatFundingRateHtml,
  formatAnnualizedFunding,
  annualizeFunding,
  fundingRateColor,
} from '../utils.js';

let fundingChart = null;
let currentFundingAsset = 'BENCHMARK';

function weightedAvgFundingByOi(assetRates) {
  let weightedSum = 0;
  let totalOiUsd = 0;
  let simpleSum = 0;
  let simpleCount = 0;

  for (const r of assetRates) {
    const rate = Number(r.fundingRatePct);
    if (!Number.isFinite(rate)) continue;
    simpleSum += rate;
    simpleCount += 1;

    const oiUsd = Number(r.openInterestUsd) || 0;
    if (oiUsd > 0) {
      weightedSum += rate * oiUsd;
      totalOiUsd += oiUsd;
    }
  }

  if (totalOiUsd > 0) return weightedSum / totalOiUsd;
  if (simpleCount > 0) return simpleSum / simpleCount;
  return null;
}

// ── Summary Cards (GOLD only: OI-weighted, others: simple avg across exchanges) ──

export function renderFundingCards(fundingRates) {
  for (const asset of FUNDING_ASSETS) {
    const el = document.getElementById(`funding-avg-${asset.toLowerCase()}`);
    if (!el) continue;

    const assetRates = fundingRates.filter(r => r.asset === asset);
    if (assetRates.length === 0) {
      el.innerHTML = '—';
      continue;
    }

    const avg = asset === 'GOLD'
      ? weightedAvgFundingByOi(assetRates)
      : assetRates.reduce((s, r) => s + r.fundingRatePct, 0) / assetRates.length;
    if (avg == null) {
      el.innerHTML = '—';
      continue;
    }
    el.innerHTML = formatFundingRateHtml(avg);

    const subEl = document.getElementById(`funding-annual-${asset.toLowerCase()}`);
    if (subEl) {
      subEl.textContent = `Ann: ${formatAnnualizedFunding(avg)}`;
      subEl.style.color = fundingRateColor(avg);
    }
  }
}

// ── Funding History Chart ──

// Per-asset OI-weighted benchmark (average across exchanges for a single asset)
function buildAssetBenchmarkSeries(fundingHistory, fundingRates, asset, cutoff) {
  const exchangeKeys = Object.keys(FUNDING_EXCHANGES);

  const weightByExch = {};
  for (const r of fundingRates || []) {
    if (r.asset === asset && r.exchange) {
      weightByExch[r.exchange] = Number(r.openInterestUsd) || 0;
    }
  }

  const allTimestamps = new Set();
  const pointMapByExch = {};

  for (const exch of exchangeKeys) {
    const id = `${exch}-${asset}`;
    pointMapByExch[exch] = {};
    for (const p of fundingHistory[id] || []) {
      if (p.x < cutoff) continue;
      pointMapByExch[exch][p.x] = p.y;
      allTimestamps.add(p.x);
    }
  }

  const timestamps = [...allTimestamps].sort((a, b) => a - b);
  const points = [];

  for (const ts of timestamps) {
    let weightedSum = 0;
    let totalWeight = 0;
    let simpleSum = 0;
    let simpleCount = 0;

    for (const exch of exchangeKeys) {
      const v = pointMapByExch[exch][ts];
      if (v == null) continue;
      simpleSum += v;
      simpleCount += 1;

      const w = weightByExch[exch] || 0;
      if (w > 0) {
        weightedSum += v * w;
        totalWeight += w;
      }
    }

    if (simpleCount === 0) continue;
    points.push({
      x: ts,
      y: totalWeight > 0 ? weightedSum / totalWeight : simpleSum / simpleCount,
    });
  }

  return points;
}

// Global benchmark (OI-weighted across all assets + exchanges)
function buildBenchmarkSeries(fundingHistory, fundingRates, cutoff) {
  const ids = [];
  for (const exch of Object.keys(FUNDING_EXCHANGES)) {
    for (const asset of FUNDING_ASSETS) {
      ids.push(`${exch}-${asset}`);
    }
  }

  const weightById = {};
  for (const r of fundingRates || []) {
    if (!r?.id) continue;
    weightById[r.id] = Number(r.openInterestUsd) || 0;
  }

  const allTimestamps = new Set();
  const pointMapById = {};
  for (const id of ids) {
    pointMapById[id] = {};
    for (const p of fundingHistory[id] || []) {
      if (p.x < cutoff) continue;
      pointMapById[id][p.x] = p.y;
      allTimestamps.add(p.x);
    }
  }

  const timestamps = [...allTimestamps].sort((a, b) => a - b);
  const benchmarkPoints = [];

  for (const ts of timestamps) {
    let weightedSum = 0;
    let totalWeight = 0;
    let simpleSum = 0;
    let simpleCount = 0;

    for (const id of ids) {
      const v = pointMapById[id][ts];
      if (v == null) continue;

      simpleSum += v;
      simpleCount += 1;

      const w = weightById[id] || 0;
      if (w > 0) {
        weightedSum += v * w;
        totalWeight += w;
      }
    }

    if (simpleCount === 0) continue;
    benchmarkPoints.push({
      x: ts,
      y: totalWeight > 0 ? weightedSum / totalWeight : simpleSum / simpleCount,
    });
  }

  return benchmarkPoints;
}

export function renderFundingChart(fundingHistory, fundingRates, asset = 'BENCHMARK', range = 30) {
  const canvas = document.getElementById('funding-history-chart');
  if (!canvas) return;

  const cutoff = Date.now() / 1000 - range * 86400;
  const exchangeKeys = Object.keys(FUNDING_EXCHANGES);

  const allTimestamps = new Set();
  const seriesMap = {};

  if (asset === 'BENCHMARK') {
    const benchmarkPoints = buildBenchmarkSeries(fundingHistory, fundingRates, cutoff);
    seriesMap.benchmark = {};
    for (const p of benchmarkPoints) {
      allTimestamps.add(p.x);
      seriesMap.benchmark[p.x] = annualizeFunding(p.y); // 8h rate % → annualized %
    }
  } else {
    for (const exch of exchangeKeys) {
      const id = `${exch}-${asset}`;
      const points = fundingHistory[id] || [];
      seriesMap[exch] = {};
      for (const p of points) {
        if (p.x >= cutoff) {
          allTimestamps.add(p.x);
          seriesMap[exch][p.x] = annualizeFunding(p.y); // 8h rate % → annualized %
        }
      }
    }
    // Per-asset OI-weighted benchmark across exchanges
    const assetBenchmarkPts = buildAssetBenchmarkSeries(fundingHistory, fundingRates, asset, cutoff);
    seriesMap['__benchmark'] = {};
    for (const p of assetBenchmarkPts) {
      allTimestamps.add(p.x);
      seriesMap['__benchmark'][p.x] = annualizeFunding(p.y);
    }
  }

  const timestamps = [...allTimestamps].sort((a, b) => a - b);

  if (timestamps.length === 0) {
    if (fundingChart) { fundingChart.destroy(); fundingChart = null; }
    return;
  }

  const labels = timestamps.map(t => {
    const d = new Date(t * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = asset === 'BENCHMARK'
    ? [{
      label: 'Funding Benchmark (OI-weighted)',
      data: timestamps.map(t => seriesMap.benchmark[t] ?? null),
      borderColor: '#bc8cff',
      backgroundColor: '#bc8cff20',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
    }]
    : [
      // OI-weighted benchmark line first
      {
        label: `${asset} Benchmark (OI-weighted)`,
        data: timestamps.map(t => seriesMap['__benchmark']?.[t] ?? null),
        borderColor: '#bc8cff',
        backgroundColor: '#bc8cff20',
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      },
      // Individual exchange lines
      ...exchangeKeys.map(exch => ({
        label: FUNDING_EXCHANGES[exch].label,
        data: timestamps.map(t => seriesMap[exch][t] ?? null),
        borderColor: FUNDING_EXCHANGES[exch].color,
        backgroundColor: FUNDING_EXCHANGES[exch].color + '20',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      })),
    ];

  // Zero reference line
  datasets.push({
    label: 'Zero',
    data: timestamps.map(() => 0),
    borderColor: '#30363d',
    borderWidth: 1,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false,
  });

  if (fundingChart) fundingChart.destroy();

  fundingChart = new Chart(canvas, {
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
            padding: 16,
            filter: item => item.text !== 'Zero',
          },
        },
        tooltip: {
          backgroundColor: '#1c2128',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Zero') return null;
              const v = ctx.raw;
              if (v == null) return `${ctx.dataset.label}: —`;
              const sign = v >= 0 ? '+' : '';
              return `${ctx.dataset.label}: ${sign}${v.toFixed(2)}%`;
            },
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
            callback: v => {
              const sign = v >= 0 ? '+' : '';
              return `${sign}${v.toFixed(2)}%`;
            },
          },
          grid: { color: '#21262d' },
        },
      },
    },
  });
}

// ── Current Rates Table ──

export function renderFundingTable(fundingRates) {
  const tbody = document.getElementById('funding-table-body');
  if (!tbody) return;

  if (fundingRates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Loading funding rates...</td></tr>`;
    return;
  }

  const rows = [];
  for (const asset of FUNDING_ASSETS) {
    for (const [exchKey, exchCfg] of Object.entries(FUNDING_EXCHANGES)) {
      const rate = fundingRates.find(r => r.asset === asset && r.exchange === exchKey);
      const annualColor = rate ? fundingRateColor(rate.fundingRatePct) : '';
      rows.push(`
        <tr>
          <td><strong>${asset}</strong></td>
          <td>
            <span class="exchange-badge" style="border-left:3px solid ${exchCfg.color}; padding-left:8px;">
              ${exchCfg.label}
            </span>
          </td>
          <td>${rate ? formatFundingRateHtml(rate.fundingRatePct) : '—'}</td>
          <td style="color:${annualColor}">${rate ? formatAnnualizedFunding(rate.fundingRatePct) : '—'}</td>
          <td>${rate?.nextFundingTime ? new Date(rate.nextFundingTime).toLocaleTimeString() : '—'}</td>
        </tr>
      `);
    }
  }

  tbody.innerHTML = rows.join('');
}

// ── Asset Tab Controller ──

export function getCurrentFundingAsset() {
  return currentFundingAsset;
}

export function initFundingAssetTabs(onAssetChange) {
  document.querySelectorAll('.funding-asset-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.funding-asset-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFundingAsset = btn.dataset.asset;
      if (onAssetChange) onAssetChange(currentFundingAsset);
    });
  });
}
