// ============================================================
// Fluid Data Fetcher — On-chain via ethers.js
// ============================================================

import {
  FLUID_RESOLVERS, FLUID_LENDING_RESOLVER_ABI,
  FLUID_VAULT_RESOLVER_ABI,
  RPC_URLS, CHAIN_NAME_TO_ID,
} from '../config.js';
import { normalizeMarket, addressToSymbol } from '../utils.js';

// Fluid 지원 체인 (config의 FLUID_RESOLVERS 키 기반)
const SUPPORTED_CHAINS = Object.keys(FLUID_RESOLVERS);
const providers = {};

function getProvider(chain) {
  if (!providers[chain]) {
    providers[chain] = new ethers.JsonRpcProvider(RPC_URLS[chain]);
  }
  return providers[chain];
}

// Fluid supplyRate는 per-second rate * 1e12
// APY = ((1 + rate/1e12)^(365.25*86400) - 1) * 100
function fluidRateToAPY(rate) {
  const rateNum = Number(rate);
  if (rateNum <= 0) return 0;
  const perSecond = rateNum / 1e12;
  const apy = (Math.pow(1 + perSecond, 365.25 * 86400) - 1) * 100;
  return isFinite(apy) && apy < 1000 ? apy : 0;
}

export async function fetchFluidData() {
  const allResults = [];

  for (const chain of SUPPORTED_CHAINS) {
    const resolvers = FLUID_RESOLVERS[chain];
    if (!resolvers?.lending) continue;

    try {
      const provider = getProvider(chain);
      const chainId = CHAIN_NAME_TO_ID[chain];

      // --- Supply data from LendingResolver ---
      const lendingResolver = new ethers.Contract(
        resolvers.lending,
        FLUID_LENDING_RESOLVER_ABI,
        provider
      );

      let fTokensData;
      try {
        fTokensData = await lendingResolver.getFTokensEntireData();
      } catch (e) {
        console.warn(`Fluid LendingResolver ${chain}:`, e.message);
        continue;
      }

      // fToken → supply rate, totalAssets 매핑 (에셋별 집계)
      const supplyMap = {}; // symbol → { totalAssets, weightedRate }
      for (const ft of fTokensData) {
        const assetAddr = (ft.asset || ft[6])?.toString()?.toLowerCase();
        if (!assetAddr) continue;
        const symbol = addressToSymbol(assetAddr);
        if (!symbol) continue; // 우리 타겟 에셋이 아니면 스킵

        const decimals = Number(ft.decimals || ft[5]) || 6;
        const totalAssets = Number(ft.totalAssets || ft[7]) / (10 ** decimals);
        const supplyRate = ft.supplyRate || ft[12];
        const supplyAPY = fluidRateToAPY(supplyRate);

        // 동일 에셋이 여러 fToken일 수 있으므로 TVL 가중합산
        if (!supplyMap[symbol]) {
          supplyMap[symbol] = { totalAssets: 0, weightedRate: 0 };
        }
        supplyMap[symbol].totalAssets += totalAssets;
        supplyMap[symbol].weightedRate += supplyAPY * totalAssets;
      }

      // --- Borrow data from VaultResolver (있을 때만) ---
      const borrowMap = {}; // symbol → { totalBorrow, weightedBorrowRate }
      if (resolvers.vault) {
        try {
          const vaultResolver = new ethers.Contract(
            resolvers.vault,
            FLUID_VAULT_RESOLVER_ABI,
            provider
          );

          const vaultsData = await vaultResolver.getVaultsEntireData();

          for (const vault of vaultsData) {
            try {
              // constantVariables에서 borrowToken 확인
              const constVars = vault.constantVariables || vault[3];
              if (!constVars) continue;

              const borrowToken = constVars.borrowToken || constVars[9];
              // token0이 실제 borrow 토큰 (smart debt vaults은 token0+token1)
              const borrowAddr = (borrowToken?.token0 || borrowToken?.[0])?.toString()?.toLowerCase();
              if (!borrowAddr) continue;
              const symbol = addressToSymbol(borrowAddr);
              if (!symbol) continue;

              // vaultType 확인 — smart debt (type >= 20000) vault은 복잡하므로 스킵
              const vaultType = Number(constVars.vaultType || constVars[11]) || 0;
              if (vaultType >= 20000) continue;

              // exchangePricesAndRates에서 borrow rate 추출
              const rates = vault.exchangePricesAndRates || vault[4];
              const borrowRateLiquidity = rates?.borrowRateLiquidity || rates?.[9];
              const borrowAPY = fluidRateToAPY(borrowRateLiquidity);
              if (borrowAPY <= 0 || borrowAPY > 100) continue;

              // totalSupplyAndBorrow에서 total borrow 추출
              const totals = vault.totalSupplyAndBorrow || vault[5];
              const rawBorrow = totals?.totalBorrowVault || totals?.[1];
              const decimals = symbol === 'USDC' || symbol === 'USDT' ? 6 : 18;
              const totalBorrowVault = Number(rawBorrow) / (10 ** decimals);

              // Sanity check: borrow가 TVL의 10배 이상이면 스킵 (파싱 오류)
              const maxReasonable = (supplyMap[symbol]?.totalAssets || 0) * 5;
              if (maxReasonable > 0 && totalBorrowVault > maxReasonable) continue;
              if (totalBorrowVault <= 0) continue;

              if (!borrowMap[symbol]) {
                borrowMap[symbol] = { totalBorrow: 0, weightedBorrowRate: 0 };
              }
              borrowMap[symbol].totalBorrow += totalBorrowVault;
              borrowMap[symbol].weightedBorrowRate += borrowAPY * totalBorrowVault;
            } catch (e) {
              // 개별 vault 파싱 에러 무시
            }
          }
        } catch (e) {
          console.warn(`Fluid VaultResolver ${chain}:`, e.message);
          // VaultResolver 실패 시 supply rate 기반 추정
        }
      }

      // 결과 조합
      for (const [symbol, sData] of Object.entries(supplyMap)) {
        const supplyAPY = sData.totalAssets > 0 ? sData.weightedRate / sData.totalAssets : 0;
        const tvl = sData.totalAssets;

        const bData = borrowMap[symbol];
        let borrowAPY, totalBorrow, utilization;

        if (bData && bData.totalBorrow > 0) {
          borrowAPY = bData.weightedBorrowRate / bData.totalBorrow;
          totalBorrow = bData.totalBorrow;
          utilization = tvl > 0 ? totalBorrow / tvl : 0;
        } else {
          // VaultResolver 없거나 실패 시 추정
          borrowAPY = supplyAPY > 0 ? supplyAPY * 1.4 : 0;
          totalBorrow = tvl * 0.7;
          utilization = 0.7;
        }

        if (supplyAPY > 100 || supplyAPY <= 0) continue;

        allResults.push(normalizeMarket(
          'fluid', chain, chainId, symbol,
          supplyAPY, borrowAPY, tvl, totalBorrow, utilization
        ));
      }
    } catch (err) {
      console.error(`Fluid ${chain} error:`, err);
    }
  }

  return { data: allResults, error: allResults.length === 0 ? 'No data' : null };
}
