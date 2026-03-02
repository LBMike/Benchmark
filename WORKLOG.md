# WORKLOG

작업 이력 기록 파일입니다. 최신 기록을 위에 추가하세요.

## Template
- 시각: `YYYY-MM-DD HH:mm TZ`
- 작업: 무엇을 바꿨는지
- 파일: 수정한 파일 경로 나열
- 이유: 왜 바꿨는지
- 검증: 무엇으로 확인했는지
- 다음: 다음 작업 메모

---

## 2026-03-03 02:55 KST
- 작업: 상단 헤더 네비게이션 → 좌측 사이드바 전환 (Delphi Digital 스타일)
- 파일: `index.html`, `css/style.css`
- 이유: 헤더에 탭이 많아 좌측 사이드바로 이동하여 콘텐츠 영역 확보
- 변경 내용:
  - `index.html`: `<header>` 제거 → `<aside class="sidebar">` 추가 (로고+탭+상태 세로 배치), 모든 `<main>` 탭을 `<div class="main-wrapper">`로 래핑
  - `css/style.css`: `.sidebar` (fixed, 100px 너비, flex-column), `.nav-tab` 세로 배치 + accent 좌측 보더, `.main-wrapper` (margin-left: 100px), 반응형 768px 이하 → 상단 가로 바로 전환
- 검증: 프리뷰에서 사이드바 표시, 4탭 전환 정상, 콘텐츠 레이아웃 깨짐 없음
- 다음: 추가 요청 대기

## 2026-03-03 02:30 KST
- 작업: Fluid ETH 기반 USDC, USDT 마켓 추가 (DefiLlama fallback)
- 파일: `js/config.js`, `js/data/fluid.js`
- 이유: Fluid Ethereum의 on-chain LendingResolver(`0x48D32f...`)가 execution reverted (ABI/의존성 변경). USDC $225M, USDT $150M 규모 마켓 누락 해결
- 변경 내용:
  - `js/config.js`: `FLUID_DEFILLAMA_POOLS` 추가 — Fluid ETH USDC/USDT의 DefiLlama pool ID 매핑
  - `js/data/fluid.js`: `fetchFluidFromDefiLlama(chain)` 함수 추가 — per-pool endpoint(`/chart/{poolId}`)로 최신 TVL/APY 가져오기. LendingResolver 실패 시 자동 fallback. Borrow rate는 supply × 1.4 추정
- 검증: 프리뷰에서 18마켓 확인 (16→18), Fluid ETH USDC(2.13%/$225M) + USDT(2.09%/$150M) 정상 표시
- 다음: 추가 요청 대기

## 2026-03-03 01:25 KST
- 작업: Overview > Rate Comparison에 탭형 필터 UI 추가 (체인/프로토콜/스테이블코인)
- 파일: `index.html`, `css/style.css`, `js/app.js`
- 이유: Rate Comparison 표를 조건별로 빠르게 필터링할 수 있도록 요청 반영
- 변경 내용:
  - `index.html`: `Rate Comparison` 섹션에 `comparison-filters` 영역 추가
    - Chain 탭: All, Ethereum, Base, Arbitrum, Plasma, Mantle, Solana
    - Protocol 탭: All, Aave V3, Morpho, Spark, Fluid, Euler V2, Kamino, Jupiter
    - Stablecoin 탭: All, USDC, USDT, USDS, USDe, PYUSD
  - `css/style.css`: 탭형 필터 스타일(`comparison-filter-*`) 및 모바일 반응형 정렬 추가
  - `js/app.js`: 탭 클릭 시 `store.setFilter('overview', key, value)` 적용 및 같은 key 그룹 active 상태 토글
- 검증: 로컬 서버에서 `index.html/css/app.js` 200 재로딩 확인, 기존 Overview 테이블 렌더 경로와 충돌 없음 확인
- 다음: 브라우저에서 탭 조합 필터링(예: Chain=Base + Protocol=Aave V3 + Stablecoin=USDC) 결과 수동 점검

## 2026-03-03 00:44 KST
- 작업: 상시 공유용 배포 설정 파일 및 가이드 추가
- 파일: `.gitignore`, `netlify.toml`, `vercel.json`, `DEPLOY.md`
- 이유: Git 연동 기반(Netlify/Vercel)으로 고정 URL 배포를 쉽게 진행하기 위함
- 변경 내용:
  - `.gitignore`: `.DS_Store`, `.claude/`, `node_modules/` 제외
  - `netlify.toml`: 정적 루트 퍼블리시(`.`) 및 기본 보안 헤더 추가
  - `vercel.json`: 정적 배포 옵션(cleanUrls/trailingSlash) 및 기본 보안 헤더 추가
  - `DEPLOY.md`: GitHub + Netlify 권장 배포 절차, Vercel 대안, 커스텀 도메인/업데이트 절차 정리
- 검증: 설정 파일 생성 및 내용 확인 완료
- 다음: GitHub 원격 리포지토리 생성 후 첫 push -> Netlify Import 배포 진행

## 2026-03-02 21:30 KST
- 작업: Overview > Benchmark 차트에 Benchmark Funding Rate 라인 추가
- 파일: `js/ui/benchmark.js`, `js/app.js`
- 이유: 오버뷰 벤치마크 차트에서 Supply/Borrow와 함께 Funding Benchmark 추세를 같이 보기 위함
- 변경 내용:
  - `js/ui/benchmark.js`:
    - `renderBenchmarkRateChart()` 시그니처 확장: `fundingHistory`, `fundingRates` 파라미터 추가
    - funding 시계열(8h %)을 일 단위로 정규화 후 `annualizeFunding()` 적용
    - `openInterestUsd` 기준 OI 가중 평균으로 일자별 `Funding Benchmark (Ann.)` 계산
    - 기존 `Supply Benchmark`, `Borrow Benchmark` 라인에 `Funding Benchmark (Ann.)` 3번째 라인 추가
  - `js/app.js`:
    - `onStoreUpdate()`와 overview time range 핸들러에서 `renderBenchmarkRateChart()` 호출 시 funding 데이터 전달
- 검증: 실행 중 로컬 서버에서 최신 `js/app.js`, `js/ui/benchmark.js` 로드 확인
- 다음: 브라우저에서 Overview > Benchmark 탭에서 3개 라인(Supply/Borrow/Funding) 표시 수동 확인

## 2026-03-02 21:27 KST
- 작업: Funding 차트에 Benchmark 탭 추가 및 전체 마켓 OI 가중 평균 벤치마크 라인 구현
- 파일: `js/ui/funding.js`, `js/app.js`, `index.html`
- 이유: BTC 탭 앞에 전체 마켓 기준 OI 가중 펀딩 레이트 벤치마크 라인 차트 요구사항 반영
- 변경 내용:
  - `index.html`: Funding 자산 탭 맨 앞에 `Benchmark` 탭 추가 (기본 활성화)
  - `js/ui/funding.js`:
    - `currentFundingAsset` 기본값을 `BENCHMARK`로 변경
    - `buildBenchmarkSeries()` 추가: 거래소×자산 전체 시계열을 타임스탬프별로 합산하고 `openInterestUsd` 기준 가중 평균
    - `renderFundingChart()` 확장: `BENCHMARK` 선택 시 단일 라인(`Funding Benchmark (OI-weighted)`) 렌더
  - `js/app.js`: `renderFundingChart()` 호출부에 `fundingRates`를 전달하도록 수정
- 검증: 로컬 서버(8016)에서 `index.html`/`css`/`js` 로드 200/304 확인, Funding 모듈 최신 파일 응답 확인
- 다음: 브라우저에서 Benchmark/BTC/ETH/XRP/SOL/GOLD 탭 전환 시 라인 데이터 정상 전환 수동 점검

## 2026-03-02 21:13 KST
- 작업: Funding 탭에 GOLD 마켓 추가 및 XAUT/XAU/PAXG 통합 OI 가중 평균 적용
- 파일: `js/config.js`, `js/data/funding.js`, `js/ui/funding.js`, `index.html`, `css/style.css`
- 이유: GOLD를 단일 자산으로 보고 여러 골드 심볼(XAUT/XAU/PAXG) 펀딩을 OI 기준으로 통합 계산하기 위함
- 변경 내용:
  - `js/config.js`: `FUNDING_ASSETS`에 `GOLD` 추가, 거래소별 GOLD 심볼 그룹 설정
    - Binance: `PAXGUSDT`, `XAUUSDT`
    - OKX: `XAU-USDT-SWAP`, `XAU-USD_UM-SWAP`
    - Bybit: `PAXGUSDT`, `XAUTUSDT`, `PAXGPERP`, `XAUTPERP`
    - HyperLiquid: `PAXG`
  - `js/data/funding.js`: 거래소별 현재값/히스토리 페처를 `symbol 단위 수집 -> OI 가중 통합` 구조로 리팩터링
    - 현재값: 심볼별 `fundingRatePct`를 `openInterestUsd` 가중 평균으로 집계
    - 히스토리: 심볼별 시계열을 동일 타임스탬프 기준 `OI 가중 평균`으로 GOLD 통합
    - OI 수집
      - Binance: `openInterest` × `markPrice`
      - OKX: `open-interest`의 `oiUsd`
      - Bybit: `openInterestValue`
      - HyperLiquid: `openInterest` × `markPx`
  - `index.html`: Funding 카드에 `GOLD Avg Funding` 추가, 자산 탭에 `GOLD` 버튼 추가
  - `js/ui/funding.js`: GOLD 카드 평균을 OI 가중 평균으로 계산 (기존 자산은 기존 방식 유지)
  - `css/style.css`: funding 카드 5개 레이아웃 대응
- 검증: 각 거래소 공개 API에서 GOLD 관련 심볼 펀딩/OI/히스토리 응답 확인, `python3 -m http.server`로 `index.html` 응답 `200` 확인
- 다음: 브라우저에서 GOLD 탭 차트/테이블 렌더 및 값 산출(가중치) 수동 점검

## 2026-03-02 21:00 KST
- 작업: Funding Rate 차트를 Annualized(연환산) 표시로 변경
- 파일: `js/ui/funding.js`, `index.html`
- 이유: 8h 레이트(±0.01%)보다 연환산(±10%) 스케일이 직관적
- 변경 내용:
  - `js/ui/funding.js`: `renderFundingChart()`에서 `seriesMap` 데이터 포인트에 `annualizeFunding()` (×3×365) 적용, Y축/툴팁 포맷 `toFixed(4)` → `toFixed(2)` 변경
  - `index.html`: 차트 제목 "Funding Rate History" → "Funding Rate History (Annualized)"
- 검증: 프리뷰에서 Y축 ±20% ~ ±70% 연환산 스케일 확인, 4거래소 라인 정상 표시
- 다음: 추가 요청 대기

## 2026-03-02 20:50 KST
- 작업: Funding Rate 탭에 HyperLiquid 거래소 추가
- 파일: `js/config.js`, `js/data/funding.js`, `js/app.js`
- 이유: Binance/OKX/Bybit에 추가로 HyperLiquid DEX의 펀딩 레이트 모니터링 요청
- 변경 내용:
  - `js/config.js`: `FUNDING_EXCHANGES`에 `hyperliquid` 추가 (색상 #50E3C2 teal), `FUNDING_SYMBOLS.hyperliquid` (심볼: 순수 코인명 `BTC`/`ETH`/`XRP`/`SOL`), `FUNDING_API.hyperliquid` (POST `https://api.hyperliquid.xyz/info` 단일 엔드포인트)
  - `js/data/funding.js`: HyperLiquid 페처 구현
    - `getHyperliquidMeta()`: `metaAndAssetCtxs` POST → 전체 자산 메타+컨텍스트 (30초 캐시로 중복 호출 방지)
    - `fetchHyperliquidCurrent(asset)`: 1시간 펀딩 레이트 → 8h 환산 (×8) 후 통일된 데이터 형식 반환
    - `fetchHyperliquidHistory(asset)`: `fundingHistory` POST, 90일 히스토리 페이지네이션 (500건/요청), 1h→8h 환산
    - `fetchFundingRates()`/`fetchAllFundingHistory()` fetchers에 hyperliquid 추가
  - `js/app.js`: `FUNDING_EXCHANGES` import 추가, `pollFunding()`의 하드코딩된 거래소 배열을 `Object.keys(FUNDING_EXCHANGES)`로 동적 변경
- 검증: 프리뷰에서 16개 현재 레이트 (4거래소 × 4자산) 로드 확인. 차트에 4개 라인 표시 (Binance 90pts, OKX 90pts, Bybit 90pts, HyperLiquid 720pts). 카드 4개 평균 레이트 정상, 테이블 16행 정상
- 다음: 추가 요청 대기

## 2026-03-02 20:25 KST
- 작업: Funding Rate 탭 추가 (Binance, OKX, Bybit × BTC/ETH/XRP/SOL)
- 파일: `js/config.js`, `js/utils.js`, `js/data/funding.js`(신규), `js/store.js`, `index.html`, `css/style.css`, `js/ui/funding.js`(신규), `js/app.js`
- 이유: CEX 무기한 선물 펀딩 레이트 모니터링 탭 추가 요청
- 변경 내용:
  - `js/config.js`: `FUNDING_EXCHANGES`, `FUNDING_ASSETS`, `FUNDING_SYMBOLS`, `FUNDING_API` 설정 추가
  - `js/utils.js`: `formatFundingRate()`, `annualizeFunding()`, `formatFundingRateHtml()`, `formatAnnualizedFunding()`, `fundingRateColor()` 함수 추가
  - `js/data/funding.js`: Binance/OKX/Bybit 현재 레이트 + 히스토리 페처 구현 (모두 무료 공개 API, 인증 불필요)
  - `js/store.js`: `_fundingRates`, `_fundingHistory`, `_fundingStatuses` 상태 및 getter/setter 추가, `_notify()` 페이로드 확장
  - `index.html`: Funding 네비 탭 + 카드 4개(BTC/ETH/XRP/SOL 평균) + 차트(자산 탭 BTC|ETH|XRP|SOL + 기간 1W|1M|3M) + 테이블(12행)
  - `css/style.css`: `.funding-asset-tabs`, `.funding-asset-tab`, `.exchange-badge` 스타일
  - `js/ui/funding.js`: `renderFundingCards()`, `renderFundingChart()` (Chart.js 라인 3거래소 + 제로라인), `renderFundingTable()`, `initFundingAssetTabs()`
  - `js/app.js`: `pollFunding()`, `loadFundingHistory()` 추가, `onStoreUpdate()`에 펀딩 렌더 호출, `initFundingAssetTabs()` 초기화, funding scope 시간 범위 핸들러
- 검증: 프리뷰에서 12개 현재 레이트 + 12개 히스토리 시리즈 로드 확인. 카드(양수=초록, 음수=빨강), 차트(3거래소 라인 + 제로라인), 테이블(12행), 자산 탭 전환 모두 정상 동작
- 다음: 추가 요청 대기

## 2026-03-02 19:35 KST
- 작업: AAVE Mantle USDT 마켓 추가
- 파일: `js/config.js`
- 이유: AAVE V3 Mantle 체인의 USDT 마켓 추가 요청
- 변경 내용:
  - `CHAINS`에 `{ id: 5000, name: 'mantle', label: 'Mantle' }` 추가
  - `CHAIN_ID_TO_NAME`, `CHAIN_NAME_TO_ID`에 mantle/5000 매핑 추가
  - `STABLECOIN_ADDRESSES.mantle`에 `USDT: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736'` 추가 (USDT0)
  - `AAVE_MARKETS`에 `5000: '0x458F293454fE0d67EC0655f3672301301DD51422'` 추가
  - 초기 USDT 주소(bridged `0x201E...`)가 AAVE 실제 reserve 주소(USDT0 `0x779D...`)와 달라 API 조회 후 수정
- 검증: 프리뷰에서 20개 마켓 로드 확인. AAVE Mantle USDT ($515.20M TVL, 1.69%/3.27%, Utilization 57.89%) 정상 표시
- 다음: 추가 요청 대기

## 2026-03-02 19:25 KST
- 작업: AAVE ETH/Plasma USDe 마켓 추가
- 파일: `js/config.js`
- 이유: AAVE V3 Ethereum 및 Plasma 체인의 USDe(Ethena) 스테이블코인 마켓 추가 요청
- 변경 내용:
  - `STABLECOIN_ADDRESSES.ethereum`에 `USDe: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3'` 추가
  - `STABLECOIN_ADDRESSES.plasma`에 `USDe: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34'` 추가
  - `ADDRESS_TO_SYMBOL` 자동 생성으로 AAVE 페처가 USDe reserve를 자동 인식
- 검증: 프리뷰에서 19개 마켓 로드 확인. AAVE ETH USDe ($1.06B TVL, 0.88%/2.65%), AAVE Plasma USDe ($587.69M TVL, 1.36%/3.39%) 정상 표시
- 다음: 추가 요청 대기

## 2026-03-02 19:15 KST
- 작업: Utilization 라인 차트 탭 추가
- 파일: `index.html`, `js/ui/benchmark.js`, `js/app.js`
- 이유: Total Supply/Borrow 탭 옆에 TVL 가중 Utilization 추세를 시각화하는 차트 필요
- 변경 내용:
  - `index.html`: "Total Supply/Borrow"와 "By Protocol" 사이에 `Utilization` 카테고리 탭 버튼 추가, `utilization-chart-wrapper` + canvas 추가
  - `js/ui/benchmark.js`: `utilizationChart` 변수 추가, `renderUtilizationChart()` 함수 구현 (일별 totalBorrow/totalSupply × 100으로 TVL 가중 Utilization 산출, Morpho 히스토리 마켓은 일별 변동 반영 + 비히스토리 마켓은 현재값 상수 합산, Y축 0~100% 범위, 주황색 #d29922 라인), `setChartCategory()`에 4번째 `utilization` 토글 추가
  - `js/app.js`: `renderUtilizationChart` import, `onStoreUpdate()` 및 시간 범위 핸들러에 호출 추가
- 검증: 프리뷰에서 17개 마켓 로드 후 Utilization 탭 클릭 → 약 65% 라인 표시 확인, 벤치마크 카드 Market Utilization 65.50%와 일치
- 다음: 추가 요청 대기

## 2026-03-02 16:15 KST
- 작업: TVL 차트 총액 불일치 수정 ($2.2B → $16.87B)
- 파일: `js/ui/benchmark.js`
- 이유: TVL 차트가 Morpho 히스토리 데이터만 반영하여 $2.2B로 표시됨. 실제 Total Supply $16.87B와 불일치
- 변경 내용:
  - `renderTvlChart()`에서 히스토리가 없는 마켓(AAVE, Spark, Fluid, Euler, Kamino, Jupiter)의 현재 TVL/Borrow를 상수로 합산하여 매일의 히스토리 합계에 추가
- 검증: 프리뷰에서 차트 Y축 $16.0B~$17.0B 표시 확인, 카드 $16.87B와 일치
- 다음: Utilization 차트 추가

## 2026-03-02 15:30 KST
- 작업: Total Supply/Borrow 라인 차트 탭 추가
- 파일: `index.html`, `js/ui/benchmark.js`, `js/app.js`, `js/store.js`, `js/data/morpho.js`
- 이유: Benchmark와 By Protocol 사이에 총 Supply/Borrow 금액 추세 차트 필요
- 변경 내용:
  - `js/store.js`: `_history`에 `supplyUsd`, `borrowUsd` 타입 추가
  - `js/data/morpho.js`: `fetchMorphoHistory()`에서 `supplyAssetsUsd`, `borrowAssetsUsd` GraphQL 필드 추가
  - `index.html`: "Total Supply/Borrow" 카테고리 탭 버튼 + `tvl-chart-wrapper` canvas 추가
  - `js/ui/benchmark.js`: `renderTvlChart()` 함수 구현 (USD 포맷 Y축), `setChartCategory()` 3개 카테고리 토글
  - `js/app.js`: `renderTvlChart` import 및 호출, `loadHistory()`에서 supplyUsd/borrowUsd 저장
- 검증: Morpho API에서 supplyAssetsUsd/borrowAssetsUsd 데이터 수신 확인, 차트 표시 확인
- 다음: TVL 총액 불일치 수정

## 2026-03-02 14:30 KST
- 작업: Utilization 색상 코딩 적용
- 파일: `js/utils.js`, `js/ui/table.js`, `js/ui/benchmark.js`
- 이유: Utilization 값의 시각적 구분 필요 (0-60% 초록, 60-80% 주황, 80-100% 빨강)
- 변경 내용:
  - `js/utils.js`: `utilizationColor()`, `formatUtilizationHtml()` 함수 추가
  - `js/ui/table.js`: `formatUtilizationHtml` 사용으로 변경
  - `js/ui/benchmark.js`: 벤치마크 카드에 `utilizationColor` 적용
- 검증: 프리뷰에서 색상 정상 표시 확인
- 다음: Total Supply/Borrow 차트 추가

## 2026-03-02 14:00 KST
- 작업: Utilization 메트릭 추가 (벤치마크 카드 + 테이블 컬럼)
- 파일: `index.html`, `js/store.js`, `js/ui/benchmark.js`, `js/ui/table.js`, `css/style.css`
- 이유: 전체 시장 및 개별 마켓의 Utilization(= Borrow/Supply) 지표 표시 필요
- 변경 내용:
  - `js/store.js`: `getBenchmarks()`에 `utilizationBenchmark` 반환 추가
  - `index.html`: Market Utilization 벤치마크 카드 추가, Overview 테이블에 Utilization 컬럼 추가
  - `js/ui/benchmark.js`: utilization 카드 값 렌더링
  - `js/ui/table.js`: Overview 테이블에 Utilization 컬럼, colspan 7→8
  - `css/style.css`: 벤치마크 카드 그리드 3→4 컬럼
- 검증: 프리뷰에서 4개 벤치마크 카드 및 테이블 컬럼 표시 확인
- 다음: Utilization 색상 코딩

## 2026-03-02 17:00 KST
- 작업: 정렬/필터/기간 상태 분리, Solana 주소 매핑 보정
- 파일: `index.html`, `js/app.js`, `js/store.js`, `js/ui/table.js`, `js/utils.js`
- 이유: 탭 간 상태 꼬임 및 전역 상태 충돌 문제 해소
- 검증: `python3 -m http.server`로 `index.html` 응답 `200` 확인
- 다음: 브라우저에서 정렬/필터/기간 버튼 수동 클릭 시나리오 점검
