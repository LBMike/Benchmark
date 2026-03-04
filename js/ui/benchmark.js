// ============================================================
// Benchmark Cards + Overview Charts (Benchmark & Protocol)
// ============================================================

import { PROTOCOL_COLORS, PROTOCOL_LABELS } from '../config.js';
import { formatAPY, formatUSD, formatUtilization, utilizationColor, annualizeFunding } from '../utils.js';

let benchmarkChart = null;
let tvlChart = null;
let utilizationChart = null;
let stablecoinChart = null;
let protocolChart = null;
let currentCategory = 'benchmark';

// ── 공통 차트 옵션 ──
function baseChartOptions() {
  return {
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
  };
}

// ── Benchmark 카드 ──
export function renderBenchmarkCards({ benchmarks }) {
  const { supplyBenchmark, borrowBenchmark, fundingSpread, totalSupply, totalBorrow, utilizationBenchmark, marketCount } = benchmarks;

  document.getElementById('supply-benchmark').textContent = formatAPY(supplyBenchmark);
  document.getElementById('borrow-benchmark').textContent = formatAPY(borrowBenchmark);
  document.getElementById('funding-spread').textContent = formatAPY(fundingSpread);
  document.getElementById('total-supply').textContent = formatUSD(totalSupply);
  document.getElementById('total-borrow').textContent = formatUSD(totalBorrow);
  const utilEl = document.getElementById('utilization-benchmark');
  if (utilEl) {
    utilEl.textContent = formatUtilization(utilizationBenchmark);
    utilEl.style.color = utilizationColor(utilizationBenchmark);
  }
  document.getElementById('market-count').textContent = marketCount;
}

// ══════════════════════════════════════════════════════════════
// Benchmark 카테고리: Supply/Borrow + Funding Benchmark 3개 라인
// ══════════════════════════════════════════════════════════════
export function renderBenchmarkRateChart(historyData, markets, range = 90, fundingHistory = {}, fundingRates = []) {
  const canvas = document.getElementById('benchmark-chart');
  if (!canvas) return;

  const cutoff = Date.now() / 1000 - range * 86400;

  // 마켓별 가중치 룩업 (현재 TVL / totalBorrow)
  const tvlByMarketId = {};
  const borrowByMarketId = {};
  for (const m of markets) {
    tvlByMarketId[m.marketId] = m.tvl;
    borrowByMarketId[m.marketId] = m.totalBorrow;
  }

  // 일별 포인트 맵 구축 (타임스탬프를 일 단위로 정규화)
  const supplyDayMaps = {}; // { marketId: { dayTs: apyValue } }
  const borrowDayMaps = {};
  const fundingDayMaps = {}; // { fundingId: { dayTs: annualizedFundingPct } }
  const allDays = new Set();

  for (const [marketId, points] of Object.entries(historyData.supply || {})) {
    supplyDayMaps[marketId] = {};
    for (const p of points) {
      if (p.x < cutoff) continue;
      const day = Math.floor(p.x / 86400) * 86400;
      supplyDayMaps[marketId][day] = p.y;
      allDays.add(day);
    }
  }

  for (const [marketId, points] of Object.entries(historyData.borrow || {})) {
    borrowDayMaps[marketId] = {};
    for (const p of points) {
      if (p.x < cutoff) continue;
      const day = Math.floor(p.x / 86400) * 86400;
      borrowDayMaps[marketId][day] = p.y;
      allDays.add(day);
    }
  }

  // Funding benchmark: id별 OI 가중치로 일자별 평균 계산
  const oiByFundingId = {};
  for (const r of fundingRates || []) {
    if (!r?.id) continue;
    oiByFundingId[r.id] = Number(r.openInterestUsd) || 0;
  }

  for (const [fundingId, points] of Object.entries(fundingHistory || {})) {
    fundingDayMaps[fundingId] = {};
    for (const p of points) {
      if (p.x < cutoff) continue;
      const day = Math.floor(p.x / 86400) * 86400;
      // p.y는 8h funding rate(%)이므로 연환산 퍼센트로 맞춤
      fundingDayMaps[fundingId][day] = annualizeFunding(p.y);
      allDays.add(day);
    }
  }

  const days = [...allDays].sort((a, b) => a - b);

  if (days.length === 0) {
    if (benchmarkChart) { benchmarkChart.destroy(); benchmarkChart = null; }
    return;
  }

  // 각 일자별 TVL 가중평균 계산
  const supplyBenchmarkValues = [];
  const borrowBenchmarkValues = [];
  const fundingBenchmarkValues = [];

  for (const day of days) {
    // Supply benchmark = Σ(APY × TVL) / Σ(TVL)
    let sWSum = 0, sWTotal = 0;
    for (const [marketId, dayMap] of Object.entries(supplyDayMaps)) {
      if (dayMap[day] != null) {
        const weight = tvlByMarketId[marketId] || 0;
        if (weight > 0) {
          sWSum += dayMap[day] * weight;
          sWTotal += weight;
        }
      }
    }
    supplyBenchmarkValues.push(sWTotal > 0 ? sWSum / sWTotal : null);

    // Borrow benchmark = Σ(APY × TotalBorrow) / Σ(TotalBorrow)
    let bWSum = 0, bWTotal = 0;
    for (const [marketId, dayMap] of Object.entries(borrowDayMaps)) {
      if (dayMap[day] != null) {
        const weight = borrowByMarketId[marketId] || 0;
        if (weight > 0) {
          bWSum += dayMap[day] * weight;
          bWTotal += weight;
        }
      }
    }
    borrowBenchmarkValues.push(bWTotal > 0 ? bWSum / bWTotal : null);

    // Funding benchmark = Σ(AnnualizedFunding × OI) / Σ(OI)
    let fWSum = 0, fWTotal = 0;
    let fSum = 0, fCount = 0;
    for (const [fundingId, dayMap] of Object.entries(fundingDayMaps)) {
      if (dayMap[day] != null) {
        const v = dayMap[day];
        fSum += v;
        fCount += 1;
        const w = oiByFundingId[fundingId] || 0;
        if (w > 0) {
          fWSum += v * w;
          fWTotal += w;
        }
      }
    }
    fundingBenchmarkValues.push(
      fWTotal > 0 ? fWSum / fWTotal : (fCount > 0 ? fSum / fCount : null)
    );
  }

  const labels = days.map(t => {
    const d = new Date(t * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = [
    {
      label: 'Supply Benchmark',
      data: supplyBenchmarkValues,
      borderColor: '#3fb950',
      backgroundColor: '#3fb95015',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
    },
    {
      label: 'Borrow Benchmark',
      data: borrowBenchmarkValues,
      borderColor: '#f85149',
      backgroundColor: '#f8514915',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
    },
  ];

  if (fundingBenchmarkValues.some(v => v != null)) {
    datasets.push({
      label: 'Funding Benchmark (Ann.)',
      data: fundingBenchmarkValues,
      borderColor: '#bc8cff',
      backgroundColor: '#bc8cff15',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
    });
  }

  if (benchmarkChart) benchmarkChart.destroy();

  benchmarkChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: baseChartOptions(),
  });
}

// ══════════════════════════════════════════════════════════════
// Protocol 카테고리: 프로토콜별 개별 Supply 라인
// ══════════════════════════════════════════════════════════════
export function renderProtocolRateChart(historyData, range = 90) {
  const canvas = document.getElementById('protocol-chart');
  if (!canvas) return;

  const supplyHistory = historyData.supply || {};
  const cutoff = Date.now() / 1000 - range * 86400;

  // 모든 타임스탬프 수집
  const allTimestamps = new Set();
  for (const points of Object.values(supplyHistory)) {
    for (const p of points) {
      if (p.x >= cutoff) allTimestamps.add(p.x);
    }
  }

  const timestamps = [...allTimestamps].sort((a, b) => a - b);

  if (timestamps.length === 0) {
    if (protocolChart) { protocolChart.destroy(); protocolChart = null; }
    return;
  }

  const labels = timestamps.map(t => {
    const d = new Date(t * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = [];
  for (const [marketId, points] of Object.entries(supplyHistory)) {
    // marketId 형식: 'aave-v3-ethereum-usdc', 'morpho-ethereum-usdc'
    const parts = marketId.split('-');
    const protocol = parts[0] === 'aave' ? 'aave-v3' : parts[0];
    const chain = parts[parts.length - 2] || '';
    const asset = parts[parts.length - 1]?.toUpperCase() || '';
    const color = PROTOCOL_COLORS[protocol] || '#888';
    const label = PROTOCOL_LABELS[protocol] || protocol;

    const pointMap = {};
    for (const p of points) { pointMap[p.x] = p.y; }

    datasets.push({
      label: `${label} ${chain} ${asset}`,
      data: timestamps.map(t => pointMap[t] ?? null),
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
    });
  }

  if (protocolChart) protocolChart.destroy();

  protocolChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: baseChartOptions(),
  });
}

// ══════════════════════════════════════════════════════════════
// Total Supply/Borrow 카테고리: 총 Supply/Borrow 금액 라인
// ══════════════════════════════════════════════════════════════
export function renderTvlChart(historyData, markets, range = 90) {
  const canvas = document.getElementById('tvl-chart');
  if (!canvas) return;

  const cutoff = Date.now() / 1000 - range * 86400;
  const supplyUsd = historyData.supplyUsd || {};
  const borrowUsd = historyData.borrowUsd || {};

  // 히스토리가 있는 마켓 ID 집합
  const histMarketIds = new Set([
    ...Object.keys(supplyUsd),
    ...Object.keys(borrowUsd),
  ]);

  // 히스토리가 없는 마켓의 현재 TVL/Borrow 합산 (상수로 추가)
  let nonHistSupply = 0;
  let nonHistBorrow = 0;
  for (const m of markets) {
    if (!histMarketIds.has(m.marketId)) {
      nonHistSupply += m.tvl || 0;
      nonHistBorrow += m.totalBorrow || 0;
    }
  }

  // 일별로 정규화 후 히스토리 마켓 합산
  const supplyDayMaps = {};
  const borrowDayMaps = {};
  const allDays = new Set();

  for (const [marketId, points] of Object.entries(supplyUsd)) {
    supplyDayMaps[marketId] = {};
    for (const p of points) {
      if (p.x < cutoff) continue;
      const day = Math.floor(p.x / 86400) * 86400;
      supplyDayMaps[marketId][day] = p.y;
      allDays.add(day);
    }
  }

  for (const [marketId, points] of Object.entries(borrowUsd)) {
    borrowDayMaps[marketId] = {};
    for (const p of points) {
      if (p.x < cutoff) continue;
      const day = Math.floor(p.x / 86400) * 86400;
      borrowDayMaps[marketId][day] = p.y;
      allDays.add(day);
    }
  }

  const days = [...allDays].sort((a, b) => a - b);

  if (days.length === 0) {
    if (tvlChart) { tvlChart.destroy(); tvlChart = null; }
    return;
  }

  const totalSupplyValues = [];
  const totalBorrowValues = [];

  for (const day of days) {
    // 히스토리 마켓 합산
    let supplySum = 0;
    for (const dayMap of Object.values(supplyDayMaps)) {
      if (dayMap[day] != null) supplySum += dayMap[day];
    }
    // 히스토리 없는 마켓의 현재값 추가
    totalSupplyValues.push(supplySum + nonHistSupply);

    let borrowSum = 0;
    for (const dayMap of Object.values(borrowDayMaps)) {
      if (dayMap[day] != null) borrowSum += dayMap[day];
    }
    totalBorrowValues.push(borrowSum + nonHistBorrow);
  }

  const labels = days.map(t => {
    const d = new Date(t * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = [
    {
      label: 'Total Supply',
      data: totalSupplyValues,
      borderColor: '#3fb950',
      backgroundColor: '#3fb95020',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
      fill: true,
    },
    {
      label: 'Total Borrow',
      data: totalBorrowValues,
      borderColor: '#f85149',
      backgroundColor: '#f8514920',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
      fill: true,
    },
  ];

  if (tvlChart) tvlChart.destroy();

  const opts = baseChartOptions();
  // Y축을 USD 포맷으로 변경
  opts.scales.y.ticks.callback = v => {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
    return '$' + v.toLocaleString();
  };
  opts.plugins.tooltip.callbacks.label = ctx => {
    const v = ctx.raw;
    if (v == null) return `${ctx.dataset.label}: —`;
    if (v >= 1e9) return `${ctx.dataset.label}: $${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${ctx.dataset.label}: $${(v / 1e6).toFixed(2)}M`;
    return `${ctx.dataset.label}: $${v.toLocaleString()}`;
  };

  tvlChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: opts,
  });
}

// ══════════════════════════════════════════════════════════════
// Utilization 카테고리: TVL 가중 Utilization 라인
// ══════════════════════════════════════════════════════════════
export function renderUtilizationChart(historyData, markets, range = 90) {
  const canvas = document.getElementById('utilization-chart');
  if (!canvas) return;

  const cutoff = Date.now() / 1000 - range * 86400;
  const supplyUsd = historyData.supplyUsd || {};
  const borrowUsd = historyData.borrowUsd || {};

  // 히스토리가 있는 마켓 ID 집합
  const histMarketIds = new Set([
    ...Object.keys(supplyUsd),
    ...Object.keys(borrowUsd),
  ]);

  // 히스토리가 없는 마켓의 현재 TVL/Borrow 합산 (상수로 추가)
  let nonHistSupply = 0;
  let nonHistBorrow = 0;
  for (const m of markets) {
    if (!histMarketIds.has(m.marketId)) {
      nonHistSupply += m.tvl || 0;
      nonHistBorrow += m.totalBorrow || 0;
    }
  }

  // 일별로 정규화 후 히스토리 마켓 합산
  const supplyDayMaps = {};
  const borrowDayMaps = {};
  const allDays = new Set();

  for (const [marketId, points] of Object.entries(supplyUsd)) {
    supplyDayMaps[marketId] = {};
    for (const p of points) {
      if (p.x < cutoff) continue;
      const day = Math.floor(p.x / 86400) * 86400;
      supplyDayMaps[marketId][day] = p.y;
      allDays.add(day);
    }
  }

  for (const [marketId, points] of Object.entries(borrowUsd)) {
    borrowDayMaps[marketId] = {};
    for (const p of points) {
      if (p.x < cutoff) continue;
      const day = Math.floor(p.x / 86400) * 86400;
      borrowDayMaps[marketId][day] = p.y;
      allDays.add(day);
    }
  }

  const days = [...allDays].sort((a, b) => a - b);

  if (days.length === 0) {
    if (utilizationChart) { utilizationChart.destroy(); utilizationChart = null; }
    return;
  }

  // 일별 TVL 가중 Utilization = totalBorrow / totalSupply
  const utilizationValues = [];

  for (const day of days) {
    let supplySum = 0;
    for (const dayMap of Object.values(supplyDayMaps)) {
      if (dayMap[day] != null) supplySum += dayMap[day];
    }
    const totalSupply = supplySum + nonHistSupply;

    let borrowSum = 0;
    for (const dayMap of Object.values(borrowDayMaps)) {
      if (dayMap[day] != null) borrowSum += dayMap[day];
    }
    const totalBorrow = borrowSum + nonHistBorrow;

    utilizationValues.push(totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : null);
  }

  const labels = days.map(t => {
    const d = new Date(t * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = [
    {
      label: 'Market Utilization',
      data: utilizationValues,
      borderColor: '#d29922',
      backgroundColor: '#d2992220',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
      fill: true,
    },
  ];

  if (utilizationChart) utilizationChart.destroy();

  const opts = baseChartOptions();
  // Y축: % 포맷, 0~100 범위
  opts.scales.y.min = 0;
  opts.scales.y.max = 100;
  opts.scales.y.ticks.callback = v => v.toFixed(0) + '%';
  opts.plugins.tooltip.callbacks.label = ctx => {
    const v = ctx.raw;
    if (v == null) return `${ctx.dataset.label}: —`;
    return `${ctx.dataset.label}: ${v.toFixed(2)}%`;
  };

  utilizationChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: opts,
  });
}

// ══════════════════════════════════════════════════════════════
// By Stablecoin 카테고리: 스테이블코인별 TVL 가중 Supply Benchmark 라인
// ══════════════════════════════════════════════════════════════

const STABLECOIN_CHART_COLORS = {
  USDC: '#2775ca',
  USDT: '#26a17b',
  USDS: '#f5ac37',
  USDe: '#c4a2fc',
  PYUSD: '#0070e0',
  RLUSD: '#00a3ff',
  WETH: '#627eea',
};

export function renderStablecoinChart(historyData, markets, range = 90) {
  const canvas = document.getElementById('stablecoin-chart');
  if (!canvas) return;

  const cutoff = Date.now() / 1000 - range * 86400;

  // 마켓별 TVL 가중치 + 스테이블코인 심볼 매핑
  const tvlByMarketId = {};
  const symbolByMarketId = {};
  for (const m of markets) {
    tvlByMarketId[m.marketId] = m.tvl;
    symbolByMarketId[m.marketId] = m.asset;
  }

  // 스테이블코인별 → { marketId: { dayTs: apyValue } } 그룹핑
  const groupBySymbol = {}; // { symbol: { marketId: { day: apy } } }
  const allDays = new Set();

  for (const [marketId, points] of Object.entries(historyData.supply || {})) {
    const symbol = symbolByMarketId[marketId];
    if (!symbol) continue;

    if (!groupBySymbol[symbol]) groupBySymbol[symbol] = {};
    groupBySymbol[symbol][marketId] = {};

    for (const p of points) {
      if (p.x < cutoff) continue;
      const day = Math.floor(p.x / 86400) * 86400;
      groupBySymbol[symbol][marketId][day] = p.y;
      allDays.add(day);
    }
  }

  const days = [...allDays].sort((a, b) => a - b);

  if (days.length === 0) {
    if (stablecoinChart) { stablecoinChart.destroy(); stablecoinChart = null; }
    return;
  }

  // 각 스테이블코인에 대해 일별 TVL 가중평균 Supply APR 계산
  const datasets = [];
  const symbols = Object.keys(groupBySymbol).sort();

  for (const symbol of symbols) {
    const marketDayMaps = groupBySymbol[symbol];
    const values = [];

    for (const day of days) {
      let wSum = 0, wTotal = 0;
      for (const [marketId, dayMap] of Object.entries(marketDayMaps)) {
        if (dayMap[day] != null) {
          const weight = tvlByMarketId[marketId] || 0;
          if (weight > 0) {
            wSum += dayMap[day] * weight;
            wTotal += weight;
          }
        }
      }
      values.push(wTotal > 0 ? wSum / wTotal : null);
    }

    // 데이터가 전부 null이면 건너뜀
    if (values.every(v => v == null)) continue;

    const color = STABLECOIN_CHART_COLORS[symbol] || '#888';
    datasets.push({
      label: `${symbol} Supply Benchmark`,
      data: values,
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
    });
  }

  const labels = days.map(t => {
    const d = new Date(t * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  if (stablecoinChart) stablecoinChart.destroy();

  stablecoinChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: baseChartOptions(),
  });
}

// ── 카테고리 토글 ──
export function setChartCategory(category) {
  currentCategory = category;
  const benchmarkWrapper = document.getElementById('benchmark-chart-wrapper');
  const tvlWrapper = document.getElementById('tvl-chart-wrapper');
  const utilizationWrapper = document.getElementById('utilization-chart-wrapper');
  const stablecoinWrapper = document.getElementById('stablecoin-chart-wrapper');
  const protocolWrapper = document.getElementById('protocol-chart-wrapper');

  if (benchmarkWrapper) benchmarkWrapper.style.display = category === 'benchmark' ? '' : 'none';
  if (tvlWrapper) tvlWrapper.style.display = category === 'tvl' ? '' : 'none';
  if (utilizationWrapper) utilizationWrapper.style.display = category === 'utilization' ? '' : 'none';
  if (stablecoinWrapper) stablecoinWrapper.style.display = category === 'stablecoin' ? '' : 'none';
  if (protocolWrapper) protocolWrapper.style.display = category === 'protocol' ? '' : 'none';
}

export function getChartCategory() {
  return currentCategory;
}

// ── 프로토콜 상태 ──
export function updateProtocolStatus(statuses) {
  const container = document.getElementById('protocol-status');
  if (!container) return;

  const protocols = ['aave-v3', 'morpho', 'spark', 'fluid', 'euler', 'kamino', 'jupiter'];
  container.innerHTML = protocols.map(p => {
    const s = statuses[p];
    const cls = !s ? 'loading' : s.ok ? 'ok' : 'error';
    const label = PROTOCOL_LABELS[p] || p;
    const title = s?.error ? `${label}: ${s.error}` : label;
    return `<span class="status-dot ${cls}" title="${title}" style="background:${cls === 'ok' ? PROTOCOL_COLORS[p] : ''}"></span>`;
  }).join('');
}

export function updateLastUpdated() {
  const el = document.getElementById('last-updated');
  if (el) el.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}
