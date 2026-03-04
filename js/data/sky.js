// ============================================================
// Sky Protocol — DefiLlama (Supply APY) + On-chain Jug/Vat (Borrow APY)
// Supply: sUSDS (SSR) TVL + APY from DefiLlama
// Borrow: Debt-weighted avg stability fee from MakerDAO Jug + Vat
// ============================================================

import { SKY_DEFILLAMA_POOLS, CHAIN_NAME_TO_ID, RPC_URLS } from '../config.js';
import { normalizeMarket } from '../utils.js';

const DEFILLAMA_CHART_URL = 'https://yields.llama.fi/chart';

// ── Sky (MakerDAO) on-chain contracts ──
const JUG_ADDRESS = '0x19c0976f590D67707E62397C87829d896Dc0f1F1';
const VAT_ADDRESS = '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B';

const JUG_ABI = [
  'function base() view returns (uint256)',
  'function ilks(bytes32) view returns (uint256 duty, uint256 rho)',
];

const VAT_ABI = [
  'function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)',
];

// Major Sky/Maker vault types — covers most outstanding debt
const SKY_ILKS = [
  'ETH-A', 'ETH-B', 'ETH-C',
  'WSTETH-A', 'WSTETH-B',
  'WBTC-A', 'WBTC-B', 'WBTC-C',
  'RETH-A',
];

const SECONDS_PER_YEAR = 31_536_000;
const WAD = BigInt('1000000000000000000');          // 1e18
const RAY = BigInt('1000000000000000000000000000');  // 1e27
const RAY_NUM = 1e27;

let _provider = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(RPC_URLS.ethereum);
  }
  return _provider;
}

// ── Fetch debt-weighted average stability fee from Jug + Vat ──
async function fetchSkyBorrowRate() {
  try {
    const provider = getProvider();
    const jug = new ethers.Contract(JUG_ADDRESS, JUG_ABI, provider);
    const vat = new ethers.Contract(VAT_ADDRESS, VAT_ABI, provider);

    // Global base rate (usually 0)
    const base = await jug.base();
    const baseNum = Number(base);

    // Fetch duty + debt for each ilk in parallel
    const results = await Promise.allSettled(
      SKY_ILKS.map(async (ilk) => {
        const ilkBytes = ethers.encodeBytes32String(ilk);
        const [jugData, vatData] = await Promise.all([
          jug.ilks(ilkBytes),
          vat.ilks(ilkBytes),
        ]);

        const duty = jugData.duty;   // BigInt (ray)
        const art  = vatData.Art;     // BigInt (wad) — normalized debt
        const rate = vatData.rate;    // BigInt (ray) — rate accumulator

        // Total debt in USD ≈ Art × rate / RAY / WAD (stablecoin ≈ $1)
        const debtUsd = Number(art * rate / RAY / WAD);

        // Annual stability fee = ((base + duty) / 1e27) ^ SECONDS_PER_YEAR - 1
        const perSecRate = (baseNum + Number(duty)) / RAY_NUM;
        const annualFee = (Math.pow(perSecRate, SECONDS_PER_YEAR) - 1) * 100; // percent

        return { ilk, annualFee, debtUsd };
      })
    );

    let weightedSum = 0;
    let totalDebt = 0;

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { annualFee, debtUsd } = r.value;
      if (debtUsd <= 0 || isNaN(annualFee) || annualFee <= 0) continue;
      weightedSum += annualFee * debtUsd;
      totalDebt += debtUsd;
    }

    if (totalDebt <= 0) return null;

    return {
      borrowAPY: weightedSum / totalDebt, // debt-weighted avg (%)
      totalDebt,                           // total outstanding debt ($)
    };
  } catch (e) {
    console.warn('Sky on-chain borrow rate fetch failed:', e.message);
    return null;
  }
}

// ── Fetch supply APY from DefiLlama ──
async function fetchSkySupplyData() {
  const entries = Object.entries(SKY_DEFILLAMA_POOLS);

  const fetches = entries.map(async ([label, poolId]) => {
    try {
      const res = await fetch(`${DEFILLAMA_CHART_URL}/${poolId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const points = json.data || [];
      if (points.length === 0) return null;

      const latest = points[points.length - 1];
      const supplyAPY = latest.apyBase ?? latest.apy ?? 0;
      const tvl = latest.tvlUsd || 0;
      if (tvl < 1_000_000) return null;

      return { label, supplyAPY, tvl };
    } catch (e) {
      console.warn(`Sky DefiLlama ${label}:`, e.message);
      return null;
    }
  });

  const settled = await Promise.allSettled(fetches);
  const pools = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) pools.push(r.value);
  }

  if (pools.length === 0) return null;

  let weightedSupply = 0;
  let totalTvl = 0;

  for (const p of pools) {
    weightedSupply += p.supplyAPY * p.tvl;
    totalTvl += p.tvl;
  }

  return {
    avgSupplyAPY: totalTvl > 0 ? weightedSupply / totalTvl : 0,
    totalTvl,
  };
}

// ── Main entry ──
export async function fetchSkyData() {
  // Fetch supply (DefiLlama) + borrow (on-chain) in parallel
  const [supplyResult, borrowResult] = await Promise.allSettled([
    fetchSkySupplyData(),
    fetchSkyBorrowRate(),
  ]);

  const supplyData = supplyResult.status === 'fulfilled' ? supplyResult.value : null;
  const borrowData = borrowResult.status === 'fulfilled' ? borrowResult.value : null;

  if (!supplyData) {
    return { data: [], error: 'No supply data' };
  }

  const { avgSupplyAPY, totalTvl } = supplyData;

  // Use real on-chain borrow rate if available, else fall back to estimate
  let borrowAPY, totalBorrow, utilization;

  if (borrowData) {
    borrowAPY = borrowData.borrowAPY;
    totalBorrow = borrowData.totalDebt;
    utilization = totalTvl > 0 ? totalBorrow / totalTvl : 0;
  } else {
    // Fallback (shouldn't normally reach here)
    borrowAPY = avgSupplyAPY * 1.2;
    totalBorrow = totalTvl * 0.7;
    utilization = 0.7;
  }

  const market = normalizeMarket(
    'sky', 'ethereum', CHAIN_NAME_TO_ID.ethereum, 'USDS',
    avgSupplyAPY, borrowAPY, totalTvl, totalBorrow, utilization
  );

  return { data: [market], error: null };
}
