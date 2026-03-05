// ============================================================
// DefiLlama — Supply/Borrow Flow Data
// /lendBorrow (bulk, 무료) + localStorage 스냅샷 → 24h 델타
// /chart/{poolId} (무료) → tvlUsd 히스토리 (차트용)
// ============================================================

import { DEFILLAMA_LEND_BORROW_POOLS } from '../config.js';

const LEND_BORROW_URL = 'https://yields.llama.fi/lendBorrow';
const CHART_URL = 'https://yields.llama.fi/chart';

// --- localStorage 키 ---
const SNAPSHOT_STORE_KEY = 'dl_snapshots_v2';
const MAX_SNAPSHOTS = 48;          // 최대 48개 보관 (~48시간, 1시간 간격 가정)
const MIN_SNAPSHOT_GAP_MS = 30 * 60_000; // 최소 30분 간격으로 스냅샷 저장
const TARGET_DELTA_MS = 24 * 60 * 60_000; // 24시간

// --- Pool ID → dl- 키 매핑 (역방향) ---
const POOL_TO_DL_KEY = {};
for (const [dlKey, poolId] of Object.entries(DEFILLAMA_LEND_BORROW_POOLS)) {
  POOL_TO_DL_KEY[poolId] = dlKey;
}

// --- localStorage 헬퍼 ---
function loadSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_STORE_KEY)) || [];
  } catch { return []; }
}

function saveSnapshots(snapshots) {
  try {
    // 오래된 것 제거 (MAX_SNAPSHOTS 유지)
    while (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
    localStorage.setItem(SNAPSHOT_STORE_KEY, JSON.stringify(snapshots));
  } catch (e) {
    console.warn('localStorage snapshot save failed:', e.message);
  }
}

function findBestPreviousSnapshot(snapshots, now) {
  if (snapshots.length === 0) return null;

  // 24시간 전에 가장 가까운 스냅샷 찾기
  const targetTs = now - TARGET_DELTA_MS;
  let best = null;
  let bestDiff = Infinity;

  for (const snap of snapshots) {
    // 최소 1시간 이전 데이터만 비교 대상
    if (now - snap.ts < 60 * 60_000) continue;
    const diff = Math.abs(snap.ts - targetTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = snap;
    }
  }
  return best;
}

// ============================================================
// 1) /lendBorrow 벌크 스냅샷 → 24h 델타 계산
// ============================================================
export async function fetchLendBorrowSnapshot() {
  try {
    const res = await fetch(LEND_BORROW_URL, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`/lendBorrow ${res.status}`);
    const data = await res.json();
    const pools = Array.isArray(data) ? data : data.data || [];

    // config에 등록된 풀만 필터링
    const poolIds = new Set(Object.values(DEFILLAMA_LEND_BORROW_POOLS));
    const currentData = {};
    for (const p of pools) {
      if (!poolIds.has(p.pool)) continue;
      const dlKey = POOL_TO_DL_KEY[p.pool];
      if (!dlKey) continue;
      currentData[dlKey] = {
        supply: Number(p.totalSupplyUsd) || 0,
        borrow: Number(p.totalBorrowUsd) || 0,
      };
    }

    // 스냅샷 로드 및 저장
    const now = Date.now();
    const snapshots = loadSnapshots();

    // 이전 스냅샷과 비교하여 24h 델타 계산
    const prevSnap = findBestPreviousSnapshot(snapshots, now);
    const deltas = {};

    if (prevSnap) {
      for (const [dlKey, current] of Object.entries(currentData)) {
        const prev = prevSnap.data[dlKey];
        if (prev) {
          deltas[dlKey] = {
            supplyDelta: current.supply - prev.supply,
            borrowDelta: current.borrow - prev.borrow,
          };
        }
      }
    }

    // 최근 스냅샷과의 간격 확인 후 저장
    const lastSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    if (!lastSnap || (now - lastSnap.ts) >= MIN_SNAPSHOT_GAP_MS) {
      snapshots.push({ ts: now, data: currentData });
      saveSnapshots(snapshots);
    }

    console.log(`/lendBorrow snapshot: ${Object.keys(currentData).length} pools, ${Object.keys(deltas).length} deltas${prevSnap ? ` (vs ${Math.round((now - prevSnap.ts) / 3600000)}h ago)` : ' (no previous snapshot)'}`);
    return { snapshot: currentData, deltas };
  } catch (e) {
    console.warn('DefiLlama /lendBorrow error:', e.message);
    return { snapshot: {}, deltas: {} };
  }
}

// ============================================================
// 2) /chart/{poolId} — tvlUsd 히스토리 (차트용)
//    tvlUsd = totalSupplyUsd - totalBorrowUsd 로만 사용 가능
//    개별 supply/borrow 분리 불가 → 차트는 /lendBorrow 스냅샷 축적으로 대체
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 차트용 히스토리: localStorage 스냅샷을 시계열로 변환
export function buildHistoryFromSnapshots() {
  const results = { supplyUsd: {}, borrowUsd: {} };
  const snapshots = loadSnapshots();
  if (snapshots.length < 2) return results;

  // 모든 스냅샷에서 dl-key별 시계열 생성
  const supplyMap = {};
  const borrowMap = {};

  for (const snap of snapshots) {
    const ts = Math.floor(snap.ts / 1000); // epoch seconds
    for (const [dlKey, vals] of Object.entries(snap.data)) {
      if (!supplyMap[dlKey]) supplyMap[dlKey] = [];
      if (!borrowMap[dlKey]) borrowMap[dlKey] = [];
      supplyMap[dlKey].push({ x: ts, y: vals.supply });
      borrowMap[dlKey].push({ x: ts, y: vals.borrow });
    }
  }

  for (const [key, points] of Object.entries(supplyMap)) {
    if (points.length >= 2) results.supplyUsd[key] = points;
  }
  for (const [key, points] of Object.entries(borrowMap)) {
    if (points.length >= 2) results.borrowUsd[key] = points;
  }

  return results;
}

// 호환성 유지: fetchDefiLlamaHistory() → 스냅샷 기반 히스토리 반환
export async function fetchDefiLlamaHistory() {
  // 스냅샷에서 히스토리 빌드 (네트워크 요청 없음)
  const results = buildHistoryFromSnapshots();
  const supplyCount = Object.keys(results.supplyUsd).length;
  const borrowCount = Object.keys(results.borrowUsd).length;
  console.log(`DefiLlama snapshot history: ${supplyCount} supply, ${borrowCount} borrow series`);
  return results;
}
