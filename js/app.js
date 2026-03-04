// ============================================================
// DeFi Lending Rate Benchmark — Main App
// ============================================================

import { POLL_INTERVAL_MS, FUNDING_EXCHANGES } from './config.js';
import { store } from './store.js';
import { fetchAaveData, fetchAaveHistory } from './data/aave.js';
import { fetchMorphoData, fetchMorphoHistory } from './data/morpho.js';
import { fetchSparkData } from './data/spark.js';
import { fetchFluidData } from './data/fluid.js';
import { fetchEulerData } from './data/euler.js';
import { fetchCompoundData } from './data/compound.js';
import { fetchHorizonData } from './data/horizon.js';
import { fetchSkyData } from './data/sky.js';
import { fetchKaminoData } from './data/kamino.js';
import { fetchJupiterData } from './data/jupiter.js';
import { fetchFundingRates, fetchAllFundingHistory } from './data/funding.js';
import {
  renderBenchmarkCards,
  renderBenchmarkRateChart,
  renderTvlChart,
  renderUtilizationChart,
  renderStablecoinChart,
  renderProtocolRateChart,
  setChartCategory,
  updateProtocolStatus,
  updateLastUpdated,
} from './ui/benchmark.js';
import { renderOverviewTable, renderSupplyTable, renderBorrowTable, initTableSort } from './ui/table.js';
import { renderSupplyHistoryChart, renderBorrowHistoryChart } from './ui/charts.js';
import {
  renderFundingCards,
  renderFundingChart,
  renderFundingTable,
  initFundingAssetTabs,
  getCurrentFundingAsset,
} from './ui/funding.js';

// YTD: 1월 1일부터 오늘까지 일수
function getYTDDays() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((now - jan1) / 86400000);
}

const currentRangeByScope = {
  overview: 90,
  supply: 90,
  borrow: 90,
  funding: 30,
};

const VISIBILITY_REFRESH_COOLDOWN_MS = 5 * 60_000;
let refreshPromise = null;
let lastRefreshAt = 0;

// --- 데이터 폴링 (Lending) ---
async function pollAll() {
  const [aaveResult, morphoResult, sparkResult, fluidResult, eulerResult, compoundResult, kaminoResult, jupiterResult, horizonResult, skyResult] = await Promise.allSettled([
    fetchAaveData(),
    fetchMorphoData(),
    fetchSparkData(),
    fetchFluidData(),
    fetchEulerData(),
    fetchCompoundData(),
    fetchKaminoData(),
    fetchJupiterData(),
    fetchHorizonData(),
    fetchSkyData(),
  ]);

  const extract = (result) => {
    if (result.status === 'fulfilled') return result.value;
    return { data: [], error: result.reason?.message || 'Failed' };
  };

  const aave = extract(aaveResult);
  const morpho = extract(morphoResult);
  const spark = extract(sparkResult);
  const fluid = extract(fluidResult);
  const euler = extract(eulerResult);
  const compound = extract(compoundResult);
  const kamino = extract(kaminoResult);
  const jupiter = extract(jupiterResult);
  const horizon = extract(horizonResult);
  const sky = extract(skyResult);

  // 프로토콜 상태 업데이트
  store.setProtocolStatus('aave-v3', !aave.error, aave.error);
  store.setProtocolStatus('morpho', !morpho.error, morpho.error);
  store.setProtocolStatus('spark', !spark.error, spark.error);
  store.setProtocolStatus('fluid', !fluid.error, fluid.error);
  store.setProtocolStatus('euler', !euler.error, euler.error);
  store.setProtocolStatus('compound', !compound.error, compound.error);
  store.setProtocolStatus('kamino', !kamino.error, kamino.error);
  store.setProtocolStatus('jupiter', !jupiter.error, jupiter.error);
  store.setProtocolStatus('horizon', !horizon.error, horizon.error);
  store.setProtocolStatus('sky', !sky.error, sky.error);

  // 마켓 데이터 병합
  const allMarkets = [...aave.data, ...morpho.data, ...spark.data, ...fluid.data, ...euler.data, ...compound.data, ...kamino.data, ...jupiter.data, ...horizon.data, ...sky.data];
  store.setMarkets(allMarkets);

  updateLastUpdated();
}

// --- 데이터 폴링 (Funding) ---
async function pollFunding() {
  const result = await fetchFundingRates();
  if (!result.error) {
    store.setFundingRates(result.data);
    for (const exch of Object.keys(FUNDING_EXCHANGES)) {
      const exchRates = result.data.filter(r => r.exchange === exch);
      store.setFundingStatus(exch, exchRates.length > 0, exchRates.length === 0 ? 'No data' : null);
    }
  } else {
    for (const exch of Object.keys(FUNDING_EXCHANGES)) {
      store.setFundingStatus(exch, false, result.error);
    }
  }
}

async function refreshLiveData() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      await Promise.allSettled([pollAll(), pollFunding()]);
    } catch (e) {
      console.error('Live refresh error:', e);
    } finally {
      lastRefreshAt = Date.now();
    }
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// --- 히스토리 로드 (Lending, 초기 1회) ---
async function loadHistory() {
  const [aaveHist, morphoHist] = await Promise.allSettled([
    fetchAaveHistory(),
    fetchMorphoHistory(365),
  ]);

  if (aaveHist.status === 'fulfilled') {
    for (const [marketId, points] of Object.entries(aaveHist.value.supply)) {
      store.setHistory('supply', marketId, points);
    }
    for (const [marketId, points] of Object.entries(aaveHist.value.borrow)) {
      store.setHistory('borrow', marketId, points);
    }
  }

  if (morphoHist.status === 'fulfilled') {
    for (const [marketId, points] of Object.entries(morphoHist.value.supply)) {
      store.setHistory('supply', marketId, points);
    }
    for (const [marketId, points] of Object.entries(morphoHist.value.borrow)) {
      store.setHistory('borrow', marketId, points);
    }
    for (const [marketId, points] of Object.entries(morphoHist.value.supplyUsd || {})) {
      store.setHistory('supplyUsd', marketId, points);
    }
    for (const [marketId, points] of Object.entries(morphoHist.value.borrowUsd || {})) {
      store.setHistory('borrowUsd', marketId, points);
    }
  }
}

// --- 히스토리 로드 (Funding, 초기 1회) ---
async function loadFundingHistory() {
  try {
    const historyMap = await fetchAllFundingHistory();
    for (const [id, points] of Object.entries(historyMap)) {
      store.setFundingHistory(id, points);
    }
  } catch (e) {
    console.error('Funding history error:', e);
  }
}

// --- UI 업데이트 ---
function onStoreUpdate(data) {
  renderBenchmarkCards(data);
  renderOverviewTable(data.marketsByScope?.overview || data.markets);
  renderSupplyTable(data.marketsByScope?.supply || data.markets);
  renderBorrowTable(data.marketsByScope?.borrow || data.markets);
  updateProtocolStatus(data.statuses);
  // 벤치마크 차트: Benchmark (가중평균 2라인) + TVL + Utilization + Protocol (개별 라인)
  renderBenchmarkRateChart(
    data.history,
    data.marketsByScope?.overview || data.markets,
    currentRangeByScope.overview,
    data.fundingHistory || {},
    data.fundingRates || []
  );
  renderTvlChart(data.history, data.marketsByScope?.overview || data.markets, currentRangeByScope.overview);
  renderUtilizationChart(data.history, data.marketsByScope?.overview || data.markets, currentRangeByScope.overview);
  renderStablecoinChart(data.history, data.marketsByScope?.overview || data.markets, currentRangeByScope.overview);
  renderProtocolRateChart(data.history, currentRangeByScope.overview);
  renderSupplyHistoryChart(data.history.supply, currentRangeByScope.supply);
  renderBorrowHistoryChart(data.history.borrow, currentRangeByScope.borrow);

  // Funding tab
  if (data.fundingRates) {
    renderFundingCards(data.fundingRates);
    renderFundingTable(data.fundingRates);
  }
  if (data.fundingHistory) {
    renderFundingChart(data.fundingHistory, data.fundingRates || [], getCurrentFundingAsset(), currentRangeByScope.funding);
  }
}

// --- 탭 전환 ---
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');

      // Auto-expand parent accordion group when nested tab is clicked
      const parentGroup = tab.closest('.nav-group');
      if (parentGroup) {
        parentGroup.classList.remove('collapsed');
        parentGroup.classList.add('expanded');
      }
    });
  });

  // Accordion group toggle
  document.querySelectorAll('.nav-group-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const group = toggle.closest('.nav-group');
      group.classList.toggle('collapsed');
      group.classList.toggle('expanded');
    });
  });
}

// --- 필터 연동 ---
function initFilters() {
  // Overview 테이블 탭 필터
  document.querySelectorAll('.comparison-filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const value = btn.dataset.value;
      if (!key || value == null) return;

      document.querySelectorAll(`.comparison-filter-tab[data-key="${key}"]`).forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      store.setFilter('overview', key, value);
    });
  });

  // Supply 탭 필터
  ['supply-protocol-filter', 'supply-chain-filter', 'supply-asset-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const key = id.includes('protocol') ? 'protocol' : id.includes('chain') ? 'chain' : 'asset';
      store.setFilter('supply', key, el.value);
    });
  });

  // Borrow 탭 필터
  ['borrow-protocol-filter', 'borrow-chain-filter', 'borrow-asset-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const key = id.includes('protocol') ? 'protocol' : id.includes('chain') ? 'chain' : 'asset';
      store.setFilter('borrow', key, el.value);
    });
  });
}

// --- 시간 범위 버튼 ---
function initTimeRangeBtns() {
  document.querySelectorAll('.time-range-btns').forEach(group => {
    const scope = group.dataset.scope || 'overview';
    group.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const rangeVal = btn.dataset.range;
        currentRangeByScope[scope] = rangeVal === 'ytd' ? getYTDDays() : (parseInt(rangeVal) || 90);

        const supplyHistory = store.getHistory('supply');
        const borrowHistory = store.getHistory('borrow');
        const supplyUsdHistory = store.getHistory('supplyUsd');
        const borrowUsdHistory = store.getHistory('borrowUsd');
        const overviewMarkets = store.getFilteredMarkets('overview');
        const histAll = { supply: supplyHistory, borrow: borrowHistory, supplyUsd: supplyUsdHistory, borrowUsd: borrowUsdHistory };

        if (scope === 'overview') {
          const fundingHistory = store.getFundingHistory();
          const fundingRates = store.getFundingRates();
          renderBenchmarkRateChart(
            histAll,
            overviewMarkets,
            currentRangeByScope.overview,
            fundingHistory,
            fundingRates
          );
          renderTvlChart(histAll, overviewMarkets, currentRangeByScope.overview);
          renderUtilizationChart(histAll, overviewMarkets, currentRangeByScope.overview);
          renderStablecoinChart(histAll, overviewMarkets, currentRangeByScope.overview);
          renderProtocolRateChart(histAll, currentRangeByScope.overview);
          return;
        }
        if (scope === 'supply') {
          renderSupplyHistoryChart(supplyHistory, currentRangeByScope.supply);
          return;
        }
        if (scope === 'funding') {
          const fundingHistory = store.getFundingHistory();
          const fundingRates = store.getFundingRates();
          renderFundingChart(fundingHistory, fundingRates, getCurrentFundingAsset(), currentRangeByScope.funding);
          return;
        }
        renderBorrowHistoryChart(borrowHistory, currentRangeByScope.borrow);
      });
    });
  });
}

// --- 차트 카테고리 토글 (Benchmark / By Protocol) ---
function initChartCategoryTabs() {
  const tabs = document.querySelectorAll('.category-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setChartCategory(tab.dataset.category);
    });
  });
}

// --- Sort 재렌더링 ---
function initSortListener() {
  document.addEventListener('sort-changed', () => {
    const data = {
      markets: store.getFilteredMarkets('overview'),
      marketsByScope: {
        overview: store.getFilteredMarkets('overview'),
        supply: store.getFilteredMarkets('supply'),
        borrow: store.getFilteredMarkets('borrow'),
      },
      benchmarks: store.getBenchmarks('overview'),
      statuses: store.getProtocolStatuses(),
      history: { supply: store.getHistory('supply'), borrow: store.getHistory('borrow'), supplyUsd: store.getHistory('supplyUsd'), borrowUsd: store.getHistory('borrowUsd') },
      fundingRates: store.getFundingRates(),
      fundingHistory: store.getFundingHistory(),
      fundingStatuses: store.getFundingStatuses(),
    };
    onStoreUpdate(data);
  });
}

// --- 로딩 오버레이 ---
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function setRefreshButtonState(isLoading) {
  const btn = document.getElementById('manual-refresh-btn');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Refreshing...' : 'Refresh';
}

function initRefreshControls() {
  const btn = document.getElementById('manual-refresh-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      setRefreshButtonState(true);
      try {
        await refreshLiveData();
      } finally {
        setRefreshButtonState(false);
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastRefreshAt < VISIBILITY_REFRESH_COOLDOWN_MS) return;
    refreshLiveData();
  });
}

// --- Init ---
async function init() {
  initTabs();
  initFilters();
  initTimeRangeBtns();
  initChartCategoryTabs();
  initTableSort();
  initSortListener();
  initRefreshControls();

  // Funding 자산 탭 초기화
  initFundingAssetTabs((asset) => {
    const fundingHistory = store.getFundingHistory();
    const fundingRates = store.getFundingRates();
    renderFundingChart(fundingHistory, fundingRates, asset, currentRangeByScope.funding);
  });

  store.subscribe(onStoreUpdate);

  // 초기 데이터 로드 (Lending + Funding 병렬)
  setRefreshButtonState(true);
  await refreshLiveData();
  setRefreshButtonState(false);
  hideLoading();

  // 히스토리 로드 (백그라운드, Lending + Funding 병렬)
  Promise.allSettled([loadHistory(), loadFundingHistory()]).then(() => {
    // 히스토리 로드 완료 후 차트 갱신
    const data = {
      markets: store.getFilteredMarkets('overview'),
      marketsByScope: {
        overview: store.getFilteredMarkets('overview'),
        supply: store.getFilteredMarkets('supply'),
        borrow: store.getFilteredMarkets('borrow'),
      },
      benchmarks: store.getBenchmarks('overview'),
      statuses: store.getProtocolStatuses(),
      history: { supply: store.getHistory('supply'), borrow: store.getHistory('borrow'), supplyUsd: store.getHistory('supplyUsd'), borrowUsd: store.getHistory('borrowUsd') },
      fundingRates: store.getFundingRates(),
      fundingHistory: store.getFundingHistory(),
      fundingStatuses: store.getFundingStatuses(),
    };
    onStoreUpdate(data);
  });

  // 폴링 시작
  setInterval(() => {
    refreshLiveData();
  }, POLL_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', init);
