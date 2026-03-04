// ============================================================
// CEX Perpetual Funding Rate Fetcher
// Adds GOLD unified market (XAUT/XAU/PAXG) using OI-weighted averaging
// ============================================================

import { FUNDING_API, FUNDING_SYMBOLS, FUNDING_ASSETS } from '../config.js';

const TIMEOUT = 10000;
const HISTORY_TIMEOUT = 15000;
const HISTORY_DAYS = 365;

function getAssetSymbols(exchange, asset) {
  const raw = FUNDING_SYMBOLS[exchange]?.[asset];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function aggregateRatesByOi(rows) {
  if (!rows.length) return { ratePct: null, totalOiUsd: 0 };

  let weightedSum = 0;
  let totalOiUsd = 0;
  let simpleSum = 0;
  let simpleCount = 0;

  for (const row of rows) {
    const rate = Number(row.fundingRatePct);
    if (!Number.isFinite(rate)) continue;

    simpleSum += rate;
    simpleCount += 1;

    const oiUsd = Number(row.openInterestUsd) || 0;
    if (oiUsd > 0) {
      weightedSum += rate * oiUsd;
      totalOiUsd += oiUsd;
    }
  }

  if (totalOiUsd > 0) return { ratePct: weightedSum / totalOiUsd, totalOiUsd };
  if (simpleCount > 0) return { ratePct: simpleSum / simpleCount, totalOiUsd: 0 };
  return { ratePct: null, totalOiUsd: 0 };
}

function buildAggregatedCurrent(exchange, asset, rows) {
  const { ratePct, totalOiUsd } = aggregateRatesByOi(rows);
  if (ratePct == null) throw new Error(`${exchange} ${asset}: invalid rates`);

  const nextFundingCandidates = rows
    .map(r => Number(r.nextFundingTime))
    .filter(t => Number.isFinite(t) && t > 0);

  return {
    exchange,
    asset,
    fundingRate: ratePct / 100,
    fundingRatePct: ratePct,
    annualizedPct: ratePct * 3 * 365,
    nextFundingTime: nextFundingCandidates.length ? Math.min(...nextFundingCandidates) : null,
    openInterestUsd: totalOiUsd,
    symbols: rows.map(r => r.symbol),
    id: `${exchange}-${asset}`,
  };
}

function aggregateHistoryByOi(historyRows, oiBySymbol) {
  const pointMaps = {};
  const allTimestamps = new Set();

  for (const { symbol, points } of historyRows) {
    const map = {};
    for (const p of points || []) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      map[p.x] = p.y;
      allTimestamps.add(p.x);
    }
    pointMaps[symbol] = map;
  }

  const timestamps = [...allTimestamps].sort((a, b) => a - b);
  const aggregated = [];

  for (const ts of timestamps) {
    let weightedSum = 0;
    let totalOi = 0;
    let simpleSum = 0;
    let simpleCount = 0;

    for (const { symbol } of historyRows) {
      const y = pointMaps[symbol]?.[ts];
      if (!Number.isFinite(y)) continue;

      simpleSum += y;
      simpleCount += 1;

      const oi = Number(oiBySymbol[symbol]) || 0;
      if (oi > 0) {
        weightedSum += y * oi;
        totalOi += oi;
      }
    }

    if (simpleCount === 0) continue;
    const y = totalOi > 0 ? weightedSum / totalOi : simpleSum / simpleCount;
    aggregated.push({ x: ts, y });
  }

  return aggregated;
}

async function fetchCurrentByAsset(exchange, asset, fetchCurrentBySymbol) {
  const symbols = getAssetSymbols(exchange, asset);
  if (symbols.length === 0) throw new Error(`${exchange} ${asset}: symbol not configured`);

  const currentRows = (
    await Promise.all(
      symbols.map(symbol =>
        fetchCurrentBySymbol(asset, symbol).catch(err => {
          console.warn(`Funding ${exchange} current ${asset}/${symbol}:`, err.message);
          return null;
        })
      )
    )
  ).filter(Boolean);

  if (currentRows.length === 0) throw new Error(`${exchange} ${asset}: no current data`);

  return buildAggregatedCurrent(exchange, asset, currentRows);
}

async function fetchHistoryByAsset(exchange, asset, fetchCurrentBySymbol, fetchHistoryBySymbol) {
  const symbols = getAssetSymbols(exchange, asset);
  if (symbols.length === 0) throw new Error(`${exchange} ${asset}: symbol not configured`);

  const historyRows = (
    await Promise.all(
      symbols.map(symbol =>
        fetchHistoryBySymbol(asset, symbol).then(points => ({ symbol, points })).catch(err => {
          console.warn(`Funding ${exchange} history ${asset}/${symbol}:`, err.message);
          return { symbol, points: [] };
        })
      )
    )
  ).filter(row => row.points.length > 0);

  if (historyRows.length === 0) return [];
  if (historyRows.length === 1) return historyRows[0].points;

  const currentRows = (
    await Promise.all(
      symbols.map(symbol =>
        fetchCurrentBySymbol(asset, symbol).catch(err => {
          console.warn(`Funding ${exchange} current(weight) ${asset}/${symbol}:`, err.message);
          return null;
        })
      )
    )
  ).filter(Boolean);

  const oiBySymbol = Object.fromEntries(currentRows.map(r => [r.symbol, r.openInterestUsd || 0]));
  return aggregateHistoryByOi(historyRows, oiBySymbol);
}

// ── Binance ──

async function fetchBinanceCurrentBySymbol(asset, symbol) {
  const [fundingRes, oiRes] = await Promise.all([
    fetch(`${FUNDING_API.binance.current}?symbol=${symbol}`, {
      signal: AbortSignal.timeout(TIMEOUT),
    }),
    fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, {
      signal: AbortSignal.timeout(TIMEOUT),
    }),
  ]);

  if (!fundingRes.ok) throw new Error(`Binance ${fundingRes.status}`);
  if (!oiRes.ok) throw new Error(`Binance OI ${oiRes.status}`);

  const funding = await fundingRes.json();
  const oi = await oiRes.json();

  const rate = parseFloat(funding.lastFundingRate);
  const markPx = parseFloat(funding.markPrice);
  const openInterest = parseFloat(oi.openInterest);
  const openInterestUsd = (Number.isFinite(openInterest) && Number.isFinite(markPx)) ? openInterest * markPx : 0;

  return {
    exchange: 'binance',
    asset,
    symbol,
    fundingRate: rate,
    fundingRatePct: rate * 100,
    annualizedPct: rate * 100 * 3 * 365,
    nextFundingTime: Number(funding.nextFundingTime),
    openInterestUsd,
  };
}

async function fetchBinanceHistoryBySymbol(asset, symbol) {
  const res = await fetch(`${FUNDING_API.binance.history}?symbol=${symbol}&limit=1000`, {
    signal: AbortSignal.timeout(HISTORY_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Binance history ${res.status}`);
  const json = await res.json();
  return json
    .map(p => ({
      x: Math.floor(p.fundingTime / 1000),
      y: parseFloat(p.fundingRate) * 100,
    }))
    .sort((a, b) => a.x - b.x);
}

async function fetchBinanceCurrent(asset) {
  return fetchCurrentByAsset(
    'binance',
    asset,
    fetchBinanceCurrentBySymbol
  );
}

async function fetchBinanceHistory(asset) {
  return fetchHistoryByAsset(
    'binance',
    asset,
    fetchBinanceCurrentBySymbol,
    fetchBinanceHistoryBySymbol
  );
}

// ── OKX ──

async function fetchOKXCurrentBySymbol(asset, symbol) {
  const [fundingRes, oiRes] = await Promise.all([
    fetch(`${FUNDING_API.okx.current}?instId=${symbol}`, {
      signal: AbortSignal.timeout(TIMEOUT),
    }),
    fetch(`https://www.okx.com/api/v5/public/open-interest?instId=${symbol}`, {
      signal: AbortSignal.timeout(TIMEOUT),
    }),
  ]);

  if (!fundingRes.ok) throw new Error(`OKX ${fundingRes.status}`);
  if (!oiRes.ok) throw new Error(`OKX OI ${oiRes.status}`);

  const fundingJson = await fundingRes.json();
  if (fundingJson.code !== '0' || !fundingJson.data?.[0]) throw new Error(`OKX error: ${fundingJson.msg}`);

  const oiJson = await oiRes.json();
  if (oiJson.code !== '0' || !oiJson.data?.[0]) throw new Error(`OKX OI error: ${oiJson.msg}`);

  const d = fundingJson.data[0];
  const oi = oiJson.data[0];
  const rate = parseFloat(d.fundingRate);
  const openInterestUsd = parseFloat(oi.oiUsd) || 0;

  return {
    exchange: 'okx',
    asset,
    symbol,
    fundingRate: rate,
    fundingRatePct: rate * 100,
    annualizedPct: rate * 100 * 3 * 365,
    nextFundingTime: parseInt(d.nextFundingTime),
    openInterestUsd,
  };
}

async function fetchOKXHistoryBySymbol(asset, symbol) {
  const res = await fetch(`${FUNDING_API.okx.history}?instId=${symbol}&limit=100`, {
    signal: AbortSignal.timeout(HISTORY_TIMEOUT),
  });
  if (!res.ok) throw new Error(`OKX history ${res.status}`);
  const json = await res.json();
  if (json.code !== '0') throw new Error(`OKX history error: ${json.msg}`);
  return (json.data || [])
    .map(p => ({
      x: Math.floor(parseInt(p.fundingTime) / 1000),
      y: parseFloat(p.fundingRate) * 100,
    }))
    .sort((a, b) => a.x - b.x);
}

async function fetchOKXCurrent(asset) {
  return fetchCurrentByAsset(
    'okx',
    asset,
    fetchOKXCurrentBySymbol
  );
}

async function fetchOKXHistory(asset) {
  return fetchHistoryByAsset(
    'okx',
    asset,
    fetchOKXCurrentBySymbol,
    fetchOKXHistoryBySymbol
  );
}

// ── Bybit ──

async function fetchBybitCurrentBySymbol(asset, symbol) {
  const res = await fetch(`${FUNDING_API.bybit.current}?category=linear&symbol=${symbol}`, {
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const json = await res.json();
  if (json.retCode !== 0 || !json.result?.list?.[0]) throw new Error(`Bybit error: ${json.retMsg}`);

  const d = json.result.list[0];
  const rate = parseFloat(d.fundingRate);
  const openInterestUsd = parseFloat(d.openInterestValue) || 0;

  return {
    exchange: 'bybit',
    asset,
    symbol,
    fundingRate: rate,
    fundingRatePct: rate * 100,
    annualizedPct: rate * 100 * 3 * 365,
    nextFundingTime: parseInt(d.nextFundingTime),
    openInterestUsd,
  };
}

async function fetchBybitHistoryBySymbol(asset, symbol) {
  const res = await fetch(`${FUNDING_API.bybit.history}?category=linear&symbol=${symbol}&limit=200`, {
    signal: AbortSignal.timeout(HISTORY_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Bybit history ${res.status}`);
  const json = await res.json();
  if (json.retCode !== 0) throw new Error(`Bybit history error: ${json.retMsg}`);
  return (json.result?.list || [])
    .map(p => ({
      x: Math.floor(parseInt(p.fundingRateTimestamp) / 1000),
      y: parseFloat(p.fundingRate) * 100,
    }))
    .sort((a, b) => a.x - b.x);
}

async function fetchBybitCurrent(asset) {
  return fetchCurrentByAsset(
    'bybit',
    asset,
    fetchBybitCurrentBySymbol
  );
}

async function fetchBybitHistory(asset) {
  return fetchHistoryByAsset(
    'bybit',
    asset,
    fetchBybitCurrentBySymbol,
    fetchBybitHistoryBySymbol
  );
}

// ── HyperLiquid ──
// Funding rate is hourly on HyperLiquid. Convert to 8h equivalent.

let _hlMetaCache = null;
let _hlMetaCacheTime = 0;

async function getHyperliquidMeta() {
  if (_hlMetaCache && Date.now() - _hlMetaCacheTime < 30000) return _hlMetaCache;
  const res = await fetch(FUNDING_API.hyperliquid.info, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HyperLiquid ${res.status}`);
  _hlMetaCache = await res.json();
  _hlMetaCacheTime = Date.now();
  return _hlMetaCache;
}

async function fetchHyperliquidCurrentBySymbol(asset, symbol) {
  const [meta, contexts] = await getHyperliquidMeta();
  const idx = meta.universe.findIndex(u => u.name === symbol);
  if (idx === -1) throw new Error(`HyperLiquid: ${symbol} not found`);

  const ctx = contexts[idx];
  const hourlyRate = parseFloat(ctx.funding);
  const rate8h = hourlyRate * 8;

  const openInterest = parseFloat(ctx.openInterest);
  const markPx = parseFloat(ctx.markPx || ctx.midPx || ctx.oraclePx);
  const openInterestUsd = (Number.isFinite(openInterest) && Number.isFinite(markPx)) ? openInterest * markPx : 0;

  return {
    exchange: 'hyperliquid',
    asset,
    symbol,
    fundingRate: rate8h,
    fundingRatePct: rate8h * 100,
    annualizedPct: rate8h * 100 * 3 * 365,
    nextFundingTime: Math.ceil(Date.now() / 3600000) * 3600000,
    openInterestUsd,
  };
}

async function fetchHyperliquidHistoryBySymbol(asset, symbol) {
  const coin = symbol;
  const now = Date.now();
  const startTime = now - HISTORY_DAYS * 86400000;
  const allPoints = [];
  let cursor = startTime;

  while (cursor < now) {
    const res = await fetch(FUNDING_API.hyperliquid.info, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'fundingHistory', coin, startTime: cursor, endTime: now }),
      signal: AbortSignal.timeout(HISTORY_TIMEOUT),
    });
    if (!res.ok) throw new Error(`HyperLiquid history ${res.status}`);
    const records = await res.json();
    if (!Array.isArray(records) || records.length === 0) break;

    for (const r of records) {
      const hourlyRate = parseFloat(r.fundingRate);
      const rate8h = hourlyRate * 8;
      allPoints.push({ x: Math.floor(r.time / 1000), y: rate8h * 100 });
    }

    if (records.length < 500) break;
    cursor = records[records.length - 1].time + 1;
  }

  return allPoints.sort((a, b) => a.x - b.x);
}

async function fetchHyperliquidCurrent(asset) {
  return fetchCurrentByAsset(
    'hyperliquid',
    asset,
    fetchHyperliquidCurrentBySymbol
  );
}

async function fetchHyperliquidHistory(asset) {
  return fetchHistoryByAsset(
    'hyperliquid',
    asset,
    fetchHyperliquidCurrentBySymbol,
    fetchHyperliquidHistoryBySymbol
  );
}

// ── Public API ──

/**
 * Fetch current funding rates: 4 exchanges × N assets.
 * GOLD is unified from XAUT/XAU/PAXG symbols with OI-weighted averaging.
 * @returns {{ data: Array, error: string|null }}
 */
export async function fetchFundingRates() {
  try {
    const fetchers = {
      binance: fetchBinanceCurrent,
      okx: fetchOKXCurrent,
      bybit: fetchBybitCurrent,
      hyperliquid: fetchHyperliquidCurrent,
    };

    const promises = [];
    for (const [exch, fn] of Object.entries(fetchers)) {
      for (const asset of FUNDING_ASSETS) {
        promises.push(
          fn(asset).catch(err => {
            console.warn(`Funding ${exch} ${asset}:`, err.message);
            return null;
          })
        );
      }
    }

    const results = await Promise.all(promises);
    const data = results.filter(Boolean);
    return { data, error: null };
  } catch (err) {
    console.error('Funding rates error:', err);
    return { data: [], error: err.message };
  }
}

/**
 * Fetch funding history for all assets × exchanges.
 * GOLD history is unified from XAUT/XAU/PAXG symbols with OI-weighted averaging.
 * @returns {{ [id]: Array<{x: number, y: number}> }}
 */
export async function fetchAllFundingHistory() {
  const histFetchers = {
    binance: fetchBinanceHistory,
    okx: fetchOKXHistory,
    bybit: fetchBybitHistory,
    hyperliquid: fetchHyperliquidHistory,
  };

  const result = {};
  const promises = [];
  const keys = [];

  for (const [exch, fn] of Object.entries(histFetchers)) {
    for (const asset of FUNDING_ASSETS) {
      const id = `${exch}-${asset}`;
      keys.push(id);
      promises.push(
        fn(asset).catch(err => {
          console.warn(`Funding history ${id}:`, err.message);
          return [];
        })
      );
    }
  }

  const results = await Promise.all(promises);
  for (let i = 0; i < keys.length; i++) {
    if (results[i].length > 0) result[keys[i]] = results[i];
  }

  return result;
}
