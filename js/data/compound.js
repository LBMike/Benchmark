// ============================================================
// Compound V3 Data Fetcher — On-chain (Comet)
// Uses totalSupply / totalBorrow for USDC, USDT markets on Ethereum
// ============================================================

import { RPC_URLS, RPC_FALLBACKS } from '../config.js';
import { normalizeMarket } from '../utils.js';

const MIN_TVL_USD = 100_000_000;
const SECONDS_PER_YEAR = 31_536_000;
const RATE_SCALE = 1e18;

// Source: Compound III docs (Comet proxy addresses)
const COMPOUND_ETH_MARKETS = [
  { asset: 'USDC', comet: '0xc3d688B66703497DAA19211EEdff47f25384cdc3', decimals: 6 },
  { asset: 'USDT', comet: '0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840', decimals: 6 },
];

const COMET_ABI = [
  'function totalSupply() view returns (uint256)',
  'function totalBorrow() view returns (uint256)',
  'function getUtilization() view returns (uint256)',
  'function getSupplyRate(uint256 utilization) view returns (uint64)',
  'function getBorrowRate(uint256 utilization) view returns (uint64)',
];

function rateToAprPct(ratePerSecondScaled) {
  const r = Number(ratePerSecondScaled || 0);
  return (r * SECONDS_PER_YEAR / RATE_SCALE) * 100;
}

async function getWorkingProvider() {
  const urls = [RPC_URLS.ethereum, ...(RPC_FALLBACKS.ethereum || [])];
  for (const url of urls) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await Promise.race([
        p.getBlockNumber(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]);
      return p;
    } catch { /* try next */ }
  }
  return new ethers.JsonRpcProvider(RPC_URLS.ethereum);
}

export async function fetchCompoundData() {
  try {
    const provider = await getWorkingProvider();
    const results = [];

    for (const m of COMPOUND_ETH_MARKETS) {
      try {
        const comet = new ethers.Contract(m.comet, COMET_ABI, provider);
        const [rawSupply, rawBorrow, rawUtil] = await Promise.all([
          comet.totalSupply(),
          comet.totalBorrow(),
          comet.getUtilization(),
        ]);

        const tvl = Number(rawSupply) / (10 ** m.decimals);
        const totalBorrow = Number(rawBorrow) / (10 ** m.decimals);
        if (!Number.isFinite(tvl) || tvl < MIN_TVL_USD) continue;

        const utilFromComet = Number(rawUtil) / RATE_SCALE;
        const utilization = (Number.isFinite(utilFromComet) && utilFromComet >= 0 && utilFromComet <= 1)
          ? utilFromComet
          : (tvl > 0 ? totalBorrow / tvl : 0);

        const [supplyRate, borrowRate] = await Promise.all([
          comet.getSupplyRate(rawUtil),
          comet.getBorrowRate(rawUtil),
        ]);

        const supplyAPY = rateToAprPct(supplyRate);
        const borrowAPY = rateToAprPct(borrowRate);

        if (supplyAPY < 0 || supplyAPY > 100 || borrowAPY < 0 || borrowAPY > 100) continue;

        results.push(normalizeMarket(
          'compound', 'ethereum', 1, m.asset,
          supplyAPY, borrowAPY, tvl, totalBorrow, utilization
        ));
      } catch (e) {
        console.warn(`Compound ${m.asset} fetch failed:`, e.message);
      }
    }

    return { data: results, error: results.length === 0 ? 'No data' : null };
  } catch (err) {
    console.error('Compound fetch error:', err);
    return { data: [], error: err.message };
  }
}
