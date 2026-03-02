// ============================================================
// DeFi Lending Rate Benchmark — Utility Functions
// ============================================================

import { CHAIN_ID_TO_NAME, CHAIN_NAME_TO_ID, ADDRESS_TO_SYMBOL } from './config.js';

const SECONDS_PER_YEAR = 31_536_000;

// RAY (10^27) APR → APY 변환 (Spark/AAVE subgraph용)
export function rayToAPY(rayRate) {
  const apr = Number(rayRate) / 1e27;
  return (Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;
}

// 소수 비율 → 퍼센트 (AAVE/Morpho API: 0.035 → 3.5%)
export function decimalToPercent(decimal) {
  return (Number(decimal) || 0) * 100;
}

// 숫자 포맷
export function formatUSD(value) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatAPY(value) {
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(2)}%`;
}

export function formatChange(value) {
  if (value == null || isNaN(value) || value === 0) return '';
  const sign = value >= 0 ? '↑' : '↓';
  const cls = value >= 0 ? 'change-up' : 'change-down';
  return `<span class="${cls}">${sign} ${Math.abs(value).toFixed(2)}%</span>`;
}

export function formatUtilization(value) {
  if (value == null || isNaN(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

export function utilizationColor(value) {
  const pct = (Number(value) || 0) * 100;
  if (pct <= 60) return '#3fb950';   // green
  if (pct <= 80) return '#d29922';   // orange
  return '#f85149';                   // red
}

export function formatUtilizationHtml(value) {
  if (value == null || isNaN(value)) return '—';
  const pct = (value * 100).toFixed(2);
  const color = utilizationColor(value);
  return `<span style="color:${color};font-weight:600">${pct}%</span>`;
}

// 체인 변환
export function chainIdToName(id) {
  return CHAIN_ID_TO_NAME[id] || 'unknown';
}

export function chainNameToId(name) {
  return CHAIN_NAME_TO_ID[name] || 0;
}

// 주소로 스테이블코인 심볼 확인
export function addressToSymbol(address) {
  if (!address) return null;
  // Solana 주소는 대소문자 구분, EVM 주소는 소문자 룩업
  return ADDRESS_TO_SYMBOL[address] || ADDRESS_TO_SYMBOL[address.toLowerCase()] || null;
}

// 정규화된 마켓 객체
export function normalizeMarket(protocol, chain, chainId, asset, supplyAPY, borrowAPY, tvl, totalBorrow = 0, utilization = 0) {
  return {
    protocol,
    chain,
    chainId,
    asset,
    supplyAPY: Number(supplyAPY) || 0,
    borrowAPY: Number(borrowAPY) || 0,
    tvl: Number(tvl) || 0,
    totalBorrow: Number(totalBorrow) || 0,
    utilization: Number(utilization) || 0,
    spread: (Number(borrowAPY) || 0) - (Number(supplyAPY) || 0),
    marketId: `${protocol}-${chain}-${asset.toLowerCase()}`,
    lastUpdated: Date.now(),
  };
}

// TVL 가중 평균 계산
export function weightedAverage(markets, valueKey, weightKey) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const m of markets) {
    const w = m[weightKey] || 0;
    const v = m[valueKey] || 0;
    if (w > 0 && !isNaN(v)) {
      weightedSum += v * w;
      totalWeight += w;
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// 타임스탬프 유틸
export function daysAgoTimestamp(days) {
  return Math.floor(Date.now() / 1000) - days * 86400;
}

export function formatDate(ts) {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function nowTimestamp() {
  return Math.floor(Date.now() / 1000);
}

// ── Funding Rate 포맷 ──

export function formatFundingRate(ratePct) {
  if (ratePct == null || isNaN(ratePct)) return '—';
  const sign = ratePct >= 0 ? '+' : '';
  return `${sign}${ratePct.toFixed(4)}%`;
}

export function annualizeFunding(ratePct) {
  return ratePct * 3 * 365;
}

export function formatAnnualizedFunding(ratePct) {
  if (ratePct == null || isNaN(ratePct)) return '—';
  const annual = annualizeFunding(ratePct);
  const sign = annual >= 0 ? '+' : '';
  return `${sign}${annual.toFixed(2)}%`;
}

export function fundingRateColor(ratePct) {
  if (ratePct == null || isNaN(ratePct)) return '#8b949e';
  return ratePct >= 0 ? '#3fb950' : '#f85149';
}

export function formatFundingRateHtml(ratePct) {
  if (ratePct == null || isNaN(ratePct)) return '—';
  const color = fundingRateColor(ratePct);
  const sign = ratePct >= 0 ? '+' : '';
  return `<span style="color:${color};font-weight:600">${sign}${ratePct.toFixed(4)}%</span>`;
}
