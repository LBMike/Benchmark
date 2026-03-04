// ============================================================
// Sky Protocol — Full Debt-Weighted Borrow Rate
// Supply: sUSDS (SSR) TVL + APY from DefiLlama
// Borrow: ALL active ilks — Core (Jug), Allocators (Block Analitica → SSR fallback)
// Excludes: RWA (winding down, 0% fee)
// ============================================================

import { SKY_DEFILLAMA_POOLS, CHAIN_NAME_TO_ID, RPC_URLS } from '../config.js';
import { normalizeMarket } from '../utils.js';

const DEFILLAMA_CHART_URL = 'https://yields.llama.fi/chart';

// ── On-chain contracts ──
const JUG_ADDRESS = '0x19c0976f590D67707E62397C87829d896Dc0f1F1';
const VAT_ADDRESS = '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B';

const JUG_ABI = [
  'function base() view returns (uint256)',
  'function ilks(bytes32) view returns (uint256 duty, uint256 rho)',
];

const VAT_ABI = [
  'function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)',
];

// ── Ilk categories ──

// Core crypto vaults + Staking — real stability fee from Jug
const CORE_ILKS = [
  'ETH-A', 'ETH-B', 'ETH-C',
  'WSTETH-A', 'WSTETH-B',
  'WBTC-A', 'WBTC-B', 'WBTC-C',
  'RETH-A',
  'LSEV2-SKY-A',
];

// Allocator / PSM — on-chain Jug duty = 0%, effective APY from revenue
const ALLOCATOR_ILKS = [
  'LITE-PSM-USDC-A',
  'ALLOCATOR-SPARK-A',
  'ALLOCATOR-BLOOM-A',
  'ALLOCATOR-OBEX-A',
];

const ALLOCATOR_SET = new Set(ALLOCATOR_ILKS);
const ALL_ILKS = [...CORE_ILKS, ...ALLOCATOR_ILKS];

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

// ── Fetch all ilk data (debt + stability fee) from Jug + Vat ──
async function fetchAllIlkData() {
  try {
    const provider = getProvider();
    const jug = new ethers.Contract(JUG_ADDRESS, JUG_ABI, provider);
    const vat = new ethers.Contract(VAT_ADDRESS, VAT_ABI, provider);

    const base = await jug.base();
    const baseNum = Number(base);

    const results = await Promise.allSettled(
      ALL_ILKS.map(async (ilk) => {
        const ilkBytes = ethers.encodeBytes32String(ilk);
        const [jugData, vatData] = await Promise.all([
          jug.ilks(ilkBytes),
          vat.ilks(ilkBytes),
        ]);

        const duty = jugData.duty;   // BigInt (ray)
        const art  = vatData.Art;     // BigInt (wad)
        const rate = vatData.rate;    // BigInt (ray)

        const debtUsd = Number(art * rate / RAY / WAD);

        const perSecRate = (baseNum + Number(duty)) / RAY_NUM;
        const annualFee = (Math.pow(perSecRate, SECONDS_PER_YEAR) - 1) * 100;

        return {
          ilk,
          annualFee,
          debtUsd,
          isAllocator: ALLOCATOR_SET.has(ilk),
        };
      })
    );

    const ilkData = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.debtUsd > 0) {
        ilkData.push(r.value);
      }
    }
    return ilkData.length > 0 ? ilkData : null;
  } catch (e) {
    console.warn('Sky on-chain ilk data fetch failed:', e.message);
    return null;
  }
}

// ── Try Block Analitica API for allocator effective APYs ──
// info.sky.money backend — may be CORS-blocked from browser origins
const BA_GROUPS_URL = 'https://info-sky.blockanalitica.com/groups/';

// Block Analitica group slug → ilk name mapping
const GROUP_TO_ILK = {
  stablecoins: 'LITE-PSM-USDC-A',
  spark: 'ALLOCATOR-SPARK-A',
  grove: 'ALLOCATOR-BLOOM-A',
  bloom: 'ALLOCATOR-BLOOM-A',
  obex: 'ALLOCATOR-OBEX-A',
};

async function fetchAllocatorAPYs() {
  try {
    const res = await fetch(`${BA_GROUPS_URL}?days_ago=1&order=-debt`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const groups = await res.json();
    if (!Array.isArray(groups)) return null;

    const apyMap = {};
    for (const g of groups) {
      const slug = (g.slug || g.name || '').toLowerCase();
      for (const [key, ilk] of Object.entries(GROUP_TO_ILK)) {
        if (slug.includes(key)) {
          // APY may be decimal (0.0335) or percent (3.35)
          const raw = Number(g.apy ?? g.revenue_rate ?? 0);
          if (raw > 0) {
            apyMap[ilk] = raw < 1 ? raw * 100 : raw;
          }
        }
      }
    }
    return Object.keys(apyMap).length > 0 ? apyMap : null;
  } catch (e) {
    // CORS block expected — silent fallback
    console.warn('Block Analitica API (CORS expected):', e.message);
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
  // Fetch supply (DefiLlama), ilk data (on-chain), allocator APYs (BA API) in parallel
  const [supplyResult, ilkResult, allocatorResult] = await Promise.allSettled([
    fetchSkySupplyData(),
    fetchAllIlkData(),
    fetchAllocatorAPYs(),
  ]);

  const supplyData  = supplyResult.status  === 'fulfilled' ? supplyResult.value  : null;
  const ilkData     = ilkResult.status     === 'fulfilled' ? ilkResult.value     : null;
  const allocAPYs   = allocatorResult.status === 'fulfilled' ? allocatorResult.value : null;

  if (!supplyData) {
    return { data: [], error: 'No supply data' };
  }

  const { avgSupplyAPY, totalTvl } = supplyData;

  let borrowAPY, totalBorrow, utilization;

  if (ilkData) {
    let weightedSum = 0;
    let totalDebt = 0;

    for (const ilk of ilkData) {
      let fee = ilk.annualFee;

      // Allocator/PSM ilks: on-chain Jug duty = 0%
      // 1) Use Block Analitica effective APY if available
      // 2) Else use SSR rate (≈ avgSupplyAPY) as proxy
      if (ilk.isAllocator && fee < 0.01) {
        fee = allocAPYs?.[ilk.ilk] ?? avgSupplyAPY;
      }

      if (ilk.debtUsd > 0 && fee > 0) {
        weightedSum += fee * ilk.debtUsd;
        totalDebt += ilk.debtUsd;
      }
    }

    borrowAPY   = totalDebt > 0 ? weightedSum / totalDebt : avgSupplyAPY;
    totalBorrow = totalDebt;
    utilization = totalTvl > 0 ? totalBorrow / totalTvl : 0;
  } else {
    // Fallback when on-chain fetch fails entirely
    borrowAPY   = avgSupplyAPY * 1.2;
    totalBorrow = totalTvl * 0.7;
    utilization = 0.7;
  }

  const market = normalizeMarket(
    'sky', 'ethereum', CHAIN_NAME_TO_ID.ethereum, 'USDS',
    avgSupplyAPY, borrowAPY, totalTvl, totalBorrow, utilization
  );

  return { data: [market], error: null };
}
