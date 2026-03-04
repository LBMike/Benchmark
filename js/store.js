// ============================================================
// DeFi Lending Rate Benchmark — Central Data Store
// ============================================================

import { DEFAULT_MIN_TVL } from './config.js';
import { weightedAverage } from './utils.js';

class Store {
  constructor() {
    this._rawMarkets = [];
    this._history = { supply: {}, borrow: {}, supplyUsd: {}, borrowUsd: {} };
    this._listeners = [];
    this._protocolStatus = {};

    // Funding rate state
    this._fundingRates = [];
    this._fundingHistory = {};
    this._fundingStatuses = {};

    this.filters = {
      minTVL: DEFAULT_MIN_TVL,
      overview: { asset: 'all', chain: 'all', protocol: 'all' },
      supply: { asset: 'all', chain: 'all', protocol: 'all' },
      borrow: { asset: 'all', chain: 'all', protocol: 'all' },
    };
  }

  setMarkets(markets) {
    this._rawMarkets = markets;
    this._notify();
  }

  _resolveScope(scope) {
    return scope === 'supply' || scope === 'borrow' || scope === 'overview'
      ? scope
      : 'overview';
  }

  _applyFilters(markets, scope = 'overview') {
    const scoped = this.filters[this._resolveScope(scope)];
    return markets.filter(m => {
      if (m.tvl < this.filters.minTVL) return false;
      if (scoped.asset !== 'all' && m.asset !== scoped.asset) return false;
      if (scoped.chain !== 'all' && m.chain !== scoped.chain) return false;
      if (scoped.protocol !== 'all' && m.protocol !== scoped.protocol) return false;
      return true;
    });
  }

  getFilteredMarkets(scope = 'overview') {
    return this._applyFilters(this._rawMarkets, scope);
  }

  getAllMarkets() {
    return this._rawMarkets;
  }

  getBenchmarks(scope = 'overview') {
    const markets = this.getFilteredMarkets(scope);
    // Sky는 랜딩 풀이 아니므로 borrow/utilization 벤치마크에서 제외
    const lendingMarkets = markets.filter(m => m.protocol !== 'sky');
    const supplyBenchmark = weightedAverage(markets, 'supplyAPY', 'tvl');
    const borrowBenchmark = weightedAverage(lendingMarkets, 'borrowAPY', 'totalBorrow');
    const fundingSpread = borrowBenchmark - supplyBenchmark;
    const totalSupply = markets.reduce((s, m) => s + m.tvl, 0);
    const totalBorrow = lendingMarkets.reduce((s, m) => s + m.totalBorrow, 0);
    const utilizationBenchmark = totalSupply > 0 ? totalBorrow / totalSupply : 0;
    return { supplyBenchmark, borrowBenchmark, fundingSpread, totalSupply, totalBorrow, utilizationBenchmark, marketCount: markets.length };
  }

  setHistory(type, marketId, data) {
    this._history[type][marketId] = data;
  }

  getHistory(type) {
    return this._history[type];
  }

  setProtocolStatus(protocol, ok, error = null) {
    this._protocolStatus[protocol] = { ok, error, updatedAt: Date.now() };
  }

  getProtocolStatuses() {
    return { ...this._protocolStatus };
  }

  // ── Funding Rate ──

  setFundingRates(rates) {
    this._fundingRates = rates;
    this._notify();
  }

  getFundingRates() {
    return this._fundingRates;
  }

  setFundingHistory(id, points) {
    this._fundingHistory[id] = points;
  }

  getFundingHistory() {
    return this._fundingHistory;
  }

  setFundingStatus(exchange, ok, error = null) {
    this._fundingStatuses[exchange] = { ok, error, updatedAt: Date.now() };
  }

  getFundingStatuses() {
    return { ...this._fundingStatuses };
  }

  setFilter(scope, key, value) {
    // backward-compat: setFilter(key, value) => overview scope
    if (arguments.length === 2) {
      value = key;
      key = scope;
      scope = 'overview';
    }
    const resolvedScope = this._resolveScope(scope);
    if (!(key in this.filters[resolvedScope])) return;
    this.filters[resolvedScope][key] = value;
    this._notify();
  }

  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  _notify() {
    const marketsByScope = {
      overview: this.getFilteredMarkets('overview'),
      supply: this.getFilteredMarkets('supply'),
      borrow: this.getFilteredMarkets('borrow'),
    };
    const data = {
      markets: marketsByScope.overview,
      marketsByScope,
      benchmarks: this.getBenchmarks('overview'),
      statuses: this._protocolStatus,
      history: this._history,
      fundingRates: this._fundingRates,
      fundingHistory: this._fundingHistory,
      fundingStatuses: this._fundingStatuses,
    };
    for (const fn of this._listeners) {
      try { fn(data); } catch (e) { console.error('Store listener error:', e); }
    }
  }
}

export const store = new Store();
