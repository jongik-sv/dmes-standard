# MDM 화면 렌더링 findings 독립 검증

- 대상: `docs/perf-render/mdm-findings.md`(dev 46e70929, opencode 워커 OC 작성)와 하네스 `scripts/perf/render/`
- 검증: 2026-10-04 21:40~, 워크트리 `.claude/worktrees/perf-verify`(브랜치 `perf/render-verify`, 기준 dev 46e70929)
- 원칙: OC 값을 믿지 않고 같은 조건으로 다시 잰 뒤 주장마다 참·거짓을 판정한다. findings 본문은 고치지 않는다(§6 에 고칠 곳만 적는다).
- 원자료(저장소 밖): `$S/cc-verify/` — `S=/private/tmp/claude-501/-Users-jji-project-dmes-standard/f733ea8c-9350-4a0f-98e8-603ba013c51d/scratchpad`

## 0. 결론 요약

1. **cold 중앙값은 부분 재현이다**(5화면 ±25% 안, layoutConfirm 은 지표 무효, headerMng·codeMng 는 격자 안 동률). **순위와 서버 수치는 재현된다.** columnMng > termMng > 나머지 순서, 조건 없는 전체 조회, columnMng 2.89MB·7,858건, TTFB 수준(columnMng ≈345ms, termMng ≈130ms)이 같다.
2. **하네스 본 지표 `searchToRowMs` 는 Playwright 폴링 격자 값이다.** 같은 회차를 페이지 안 시계로 재면 columnMng 조회→첫 행은 **≈380ms**(하네스 ≈820ms), termMng 은 **≈167ms**(하네스 ≈211ms)다.
3. 그래서 **"columnMng 프런트 442ms" 는 존재하지 않는다.** 응답 헤더→첫 행은 ≈33ms 이고 그중 ≈20ms 는 모든 화면 공통 바닥값이다. columnMng 체감 시간의 ≈92% 가 서버 TTFB 다.
4. **"cold" 가 cold 가 아니었다.** 회차 하나의 6화면이 브라우저 컨텍스트를 공유해 앞 화면 탭이 뒤 화면에 복원됐다. 그래서 "진입 API 27~47건", "/api/auth/me 진입당 22회", "화면 무관 호출 7건" 은 측정 결함이 만든 숫자다. 메뉴 클릭 뒤 실제 값은 auth/me 4회(columnMng 6회), 화면 무관 호출 1건(secFavorite)이다.
5. 렌더 비용 가설은 "기각" 이 아니라 상당수가 **미측정**이었다. 이번에 React 커밋을 직접 셌다(§5): 동작마다 React 렌더 시간 합은 2~18ms 로 작다.
6. 하네스 결함 중 7건을 고쳤다(커밋 3건: 6883b632·19db68e2·0951d864). 렌더 횟수 세기 도구 `count-renders.mjs` 를 더했다. 고친 하네스로 다시 잰 값이 이 문서의 "재현 값" 이다.

## 1. 측정 조건

| 항목 | 값 |
|---|---|
| 빌드 | 워크트리에서 `pnpm install` → shared → 형제 패키지(m-mdm 등) → m-mcm `next build`(모두 `heavy.sh` 경유) |
| 서버 | `next start -p 5300`(본인 기동·종료). 백엔드 8100·8096·8092 는 읽기만 |
| `.env` | 메인 사본에서 `NEXTAUTH_URL` 만 5300 으로 변경. 메인 `.env` 무변경 |
| 계정 | admin / admin123. 로그인 실패 0회 |
| 전원·부하 | AC, lowpowermode 0. 측정 회차 load1 1.4~3.7(LOAD_LIMIT 5 이하, keep=0 회차 0건) |
| 독점 | 모든 시간 측정은 `heavy.sh --exclusive` 안에서 하나씩. 측정 중 서브에이전트·빌드 0 |
| 화면 순서 | OC 와 같게 `termMng,columnMng,layoutConfirm,headerMng,dataMng,codeMng` |

| 실행 | 하네스 | 조건 | 폴더 |
|---|---|---|---|
| 보정 1회 | 원본 | `RENDER_CALIBRATE=1` | `asis-calib/` |
| cold 3회 | 원본 | OC 와 동일(공유 컨텍스트) | `asis-cold/` |
| cold 3회 | 수정(페이지 안 시계) | 공유 컨텍스트 | `fix-cold/` |
| cold 3회 | 수정 | `RENDER_ISOLATE=1`(화면마다 새 컨텍스트) | `fix-iso/` |
| warm 3회 | 수정 | columnMng·termMng | `fix-warm/` |
| trace 1회 | 수정 | 격리, `RENDER_TRACE=1`, columnMng·termMng | `trace-run/` |
| 호출 집계 1회씩 | 수정(Resource Timing) | 공유·격리(시간 판정에 쓰지 않음) | `count-iso0/`, `count-iso1/` |
| 렌더 횟수 | `count-renders.mjs` | `next build --profile --no-mangling` 번들 | `renders/` |

## 2. 주장별 판정

판정 기준(주장 2): 순위 동일 + 각 값이 OC 값의 ±25% 안이면 "재현".

| # | OC 주장 | OC 값 | 재현 값 | 판정 | 근거 |
|---|---|---|---|---|---|
| 1 | task 안(setTimeout·rAF) 200ms 루프는 long task 1건, `page.evaluate` 최상위 동기 루프는 안 잡힘 | 1건/200ms, 0건 | 보정 6화면 모두 long task 1건 이상 잡힘. about:blank 프로브 3회: evaluate 최상위 0건·0건·0건, setTimeout 안 202·200·200ms 1건씩 | **참** | `asis-calib`, `lt-probe.out`. OC 는 뒤 절반의 원자료를 남기지 않았다(`calib-probe*` 스크립트만). 다만: 보정은 관측기가 산다는 것만 보이고 "렌더가 가볍다" 를 증명하지 않는다(§4-3) |
| 2 | cold 3회 중앙값 순위·크기 | columnMng 826.9 · termMng 228.6 · headerMng 60.8 · codeMng 60.0 · dataMng 55.6 · layoutConfirm 40.7 | 원본 하네스: 822.1 · 213.0 · 61.5 · 62.4 · 56.9 · 29.7 | **부분 재현**(기준 미달 2곳, 원인 확인) | ±25% 안: 5개. layoutConfirm 은 −27% 로 벗어나는데 진입 자동 조회 때문에 지표 자체가 무효다(§2.1). headerMng(61.5)·codeMng(62.4) 순위가 뒤바뀌었으나 두 값이 같은 폴링 격자 칸이라 잡음이다(페이지 안 시계 25.4·24.8). **값이 폴링 격자에 붙는다**: 같은 회차 페이지 안 시계는 columnMng 379.1 · termMng 169.8 · headerMng 25.4 · codeMng 24.8 · dataMng 24.6 · layoutConfirm 16.7(`fix-cold`). 순위는 유지된다 |
| 3 | columnMng 조회 TTFB ≈371ms, 응답 ≈2.89MB·7,858건, 조건 없는 전체 조회 | 371 / 2.89MB / 7,858 | TTFB 하네스 343.8~350.5(중앙값), curl BFF 337~349ms, WAS(8096) 직접 318~325ms. 2,893,211B·7,858건. 요청 본문 `{"params":{"keyword":""}}` | **참**(TTFB −7%) | `fix-iso`, curl 3회씩. BFF 경유 비용은 ≈20~25ms 다(OC·리뷰가 가설로 든 "BFF 버퍼링 ≈118ms" 는 아니다) |
| 4 | columnMng 프런트 442ms 의 성분: RecalcStyle 129·Layout 59 등 작은 작업 다수 | 442ms | 응답 헤더→첫 행 **32.6ms**(본문 완료→첫 행 19.1ms). 이 구간 UpdateLayoutTree 4회·Layout 2회, 50ms 넘는 task 0 | **거짓** | trace(§3.1). 442 = 폴링 5번째 시도(≈770ms)+클릭 비용 − TTFB. 129/59 회는 공유 컨텍스트에서 재현되지만(57/123~59/132) 메뉴 펼침·포털 홈·shell 까지 합친 누적이다 |
| 5 | termMng TTFB ≈136ms, 조건 없는 전체 조회 | 136 | 하네스 131~134, curl BFF 125~131, WAS 111~112. 본문 `{"keyword":"","systems":"","context":""}` | **참** | 추가 발견: **termMng 응답도 3.07MB·8,155건**이다. findings 에 크기가 없다 |
| 6 | `/api/auth/me` 진입당 약 22회, 캐시 없는 fetch 9곳, `use-user-button-rbac.ts:150-183` 캐시 확인 전 호출 | 22회 / 9곳 | 메뉴 클릭 뒤 **4회**(columnMng 6회). 페이지 전체는 격리 13~15회, 공유 13→30회로 화면 순서대로 증가. 호출처 10곳 | **부분** | 22.2 는 공유 컨텍스트 페이지 전체 합의 평균이다(산술만 일치). `portal/page.tsx:61` 은 캐시가 있고(:43,55-68), `:147·191·246` 은 클릭 핸들러다. 빠진 호출처 `m-mcm/page-components/home/api.ts:65`. `:150-183` 순서 주장은 참이나 재로그인 감지라는 의도(:137-139)가 빠졌다 |
| 7 | 화면 무관 호출 7건, 워터폴 없음 | 7건 | 메뉴 클릭 뒤 화면 무관 호출은 **secFavorite 1건**. secWidget·widgetDef·noticeBoard·secStartPgm 은 메뉴 클릭 전(포털 홈 로딩) | **부분**(무관 호출 거짓, 워터폴 부분) | trace §3.2. 진입 호출은 클릭 후 53~75ms 에 끝나고 조회 송신은 85~116ms 라 겹치지 않는다. 다만 진입 안에 2~3단 짧은 사슬이 있다(auth/me→secFavorite, 그리드 마운트→`mdmMeta/columns` 404) |
| 8 | shellReadyMs 가 조회와 직렬로 더해진다 | clickToRow ≈ shell+조회 | 하네스가 shell 을 본 뒤 [조회] 를 누르므로 정의상 직렬. 진입 API 와 조회가 겹친 사례 0 | **부분(측정 구조)** | 제품 쪽 직렬 지점은 조회 단추가 RBAC 로딩 동안 비활성인 것 하나다(`use-user-button-rbac.ts:208`, `PageLayout.tsx:132`, 클릭 후 ≈70ms) |
| 9 | warm columnMng·termMng 약 38ms, API 0건 | 37.8 / 38.3 | 39.6 / 45.8(clickToRow), API 0(1회 1건) | **재현, 표기 오류** | warm 은 `row-at-entry`(조회 안 함)라 "조회→첫 행" 이 아니라 탭 전환+클릭 비용이다. 탭 2개 전환만 쟀으므로 "숨은 탭 유지 비용 판정 완료" 는 과하다 |
| 10 | layoutConfirm 메뉴는 「레이아웃 확정」(MdmMenuSeeder.java:589), 「전문 헤더 정의」는 headerMng | — | 시더·화면 title·e2e 모두 일치 | **참** | `MdmMenuSeeder.java:562,589`, `headerMng/page.tsx:222`, `layoutConfirm/page.tsx:213`, `mdm-layoutConfirm.spec.ts:32` |
| 11 | findings 의 file:line 인용 | — | 대부분 참. 거짓 2·줄 어긋남 7 | **부분** | §6 목록 |
| 12 | A1·A4~A8 기각, A2·C5 미판정 | — | A1 유지(코드 근거). A7 기각 유지(근거 교체). A4 미판정. A5·A6·A8 미측정 → §5 로 일부 측정. A2·C5 미판정 유지(근거 교체) | **부분** | §4-4 |

### 2.1 layoutConfirm 값이 무효인 이유
- 이 화면은 진입하면 자동으로 조회한다(`layoutConfirm/page.tsx:149-156`).
- Resource Timing 으로 보면 진입 자동 조회가 [조회] 클릭보다 ≈60ms 먼저 나가고, 클릭도 조회를 한 번 더 낸다(`count-iso1`: 클릭 전 1·클릭 뒤 1, 본문 같음).
- 첫 행은 자동 조회 응답으로 이미 그려지는 중이라 `searchToRowMs` 는 "조회 대기" 를 재지 않는다. OC 의 `searchCallCount=1` 은 첫 행 시점까지 **끝난** 요청만 센 값이라 두 번째 요청을 놓쳤다.

## 3. 재현 값 상세

### 3.1 조회→첫 행 분해 (격리 cold 3회 중앙값 + trace)

| 화면 | 페이지 안 시계 조회→첫 행 | TTFB | 응답→첫 행(상한) | 응답 크기 | 하네스 `searchToRowMs` |
|---|---|---|---|---|---|
| columnMng | 385.8 | 350.5 | ≈33 | 2.89MB / 7,858건 | 816.9 |
| termMng | 166.6 | 133.8 | ≈33 | 3.07MB / 8,155건 | 211.6 |
| headerMng | 26.0 | 6.1 | ≈20 | 2.9KB | 57.0 |
| codeMng | 25.4 | 4.1 | ≈21 | 4.5KB | 60.9 |
| dataMng | 25.6 | 4.0 | ≈21 | 2.2KB | 58.8 |
| layoutConfirm | 16.7(무효) | 3.4 | — | 1.2KB | 33.7(무효) |

- trace(columnMng, 클릭=0): 요청 송신 0.7 → 응답 헤더 362.0 → 본문 완료 375.5 → 첫 행 DOM 394.6. 응답 뒤 메인 스레드 최장 task 19.0ms, 50ms 넘는 task 없음.
- **응답 뒤 프런트 ≈20ms 는 모든 화면 공통 바닥**(React 커밋·AgDataGrid 행 렌더·첫 프레임), 3MB 응답이 더하는 몫은 ≈12~15ms(본문 수신 처리 포함)다.
- 하네스 TTFB 는 BFF(5300) 기준이다. WAS 직접과의 차이는 columnMng ≈20~25ms, termMng ≈15ms 다.

### 3.2 화면 진입 (메뉴 잎 클릭 → [조회] 클릭 사이)

| 화면 | 진입 호출(격리) | 그중 auth/me | 페이지 전체 auth/me 격리 / 공유 | 페이지 전체 API 격리 / 공유 | shellReady 격리 / 공유(하네스, 격자 값) |
|---|---|---|---|---|---|
| termMng | 6 | 4 | 13 / 13 | 27 / 27 | 74.5 / 77.5 |
| columnMng | 9 | 6 | 15 / 18 | 30 / 32~33 | 94.0 / 113.8 |
| layoutConfirm | 7 | 4 | 14 / 21 | 29 / 36~37 | 66.4 / 59.2 |
| headerMng | 6 | 4 | 13 / 24 | 28 / 40~41 | 61.6 / 117.5 |
| dataMng | 6 | 4 | 13 / 27 | 27 / 43~44 | 70.0 / 60.1 |
| codeMng | 6 | 4 | 13 / 30 | 27 / 46~47 | 69.5 / 60.5 |

- 공유 컨텍스트에서 페이지 전체 호출이 화면 순서대로 늘어나는 것이 회차 오염의 증거다. 격리하면 6화면 모두 27~30건으로 같다.
- 메뉴 클릭 뒤 진입 호출은 클릭 후 53~75ms 에 모두 끝난다. auth/me 는 즐겨찾기 1회(`use-portal-favorites.ts:40`) 뒤 RBAC 구독자 묶음이 동시에 나간다(`use-user-button-rbac.ts:64-72`, 구독자: `PageLayout.tsx:105`, `ContentBody.tsx:171` 의 ResizableBody, columnMng 은 `page.tsx:116`·`termRegPop.tsx:72` 추가).
- shell 비용의 주 성분은 메인 스레드 JS(탭 열기 ≈9ms + 청크 ≈10ms + 마운트 렌더 19~26ms)다. 화면 무관 호출이 아니다.

### 3.3 warm (columnMng·termMng, 탭 2개 전환)

| 화면 | clickToRow 3회 | 중앙값 | API |
|---|---|---|---|
| termMng | 45.8 / 35.5 / 53.1 | 45.8 | 0 / 0 / 0 |
| columnMng | 44.3 / 39.6 / 39.0 | 39.6 | 1 / 0 / 0 |

## 4. 하네스 결함

| # | 심각도 | 위치 | 결함 | 영향 | 처리 |
|---|---|---|---|---|---|
| 1 | 치명 | `measure-screens.mjs` `waitFirstRow`·`waitShell`·`waitEmptyOverlay` | Playwright `waitFor` 는 0·20·50·100·100·500ms 간격으로 다시 확인한다(playwright-core 1.62.1 `retryWithProgressAndBackoff`). 270ms 이후 해상도 500ms | 모든 시간 지표. columnMng 380→820, "프런트 442ms" | 페이지 안 시계 `inPageSearchToRow*` 추가(6883b632). 기존 지표는 순위 확인용으로 남김 |
| 2 | 치명 | cold 루프 | 회차 하나의 6화면이 컨텍스트를 공유. 포털이 localStorage 로 열린 탭을 복원 | 진입 API 27→47, auth/me 22회, shell 화면 간 비교 | `RENDER_ISOLATE=1`(6883b632) |
| 3 | 높음 | 시작 시각 | 클릭 호출 **전**에 시각을 찍어 Playwright actionability·CDP 왕복 ≈30ms 가 모든 지표에 깔림 | 바닥값 ≈25~60ms 를 화면 비용으로 오독(headerMng "설명 안 되는 50ms") | 페이지 안 시계는 이벤트 timeStamp 를 써서 해소 |
| 4 | 높음 | CDP `Performance.getMetrics` | `*Duration` 은 초 단위인데 ms 로 적음. 구간이 메뉴 펼침부터라 응답 뒤 성분과 분리 안 됨 | scriptMs·layoutMs 등 0.x, RecalcStyle 129 해석 | README 에 함정으로 적음. 구간 분석은 trace 로 |
| 5 | 높음 | `encodedDataLength` | `responseReceived` 값(헤더까지 ≈250B)을 씀 | 응답 크기 전부 250B | `loadingFinished` 값으로(6883b632). 재측정 2,893,476B 확인 |
| 6 | 높음 | 조회 유효성 | `searchCallCount` 가 클릭 이후로 잘리지 않고, 첫 행 시점까지 끝난 요청만 셈 | layoutConfirm 무효 회차 통과 | `searchAfterClick`(Resource Timing, 0951d864) |
| 7 | 높음 | 진입 호출 집계(검증 중 내가 넣은 첫 판) | Node `Date.now()` 와 CDP `wallTime` 이 ≈123~156ms 어긋나 클릭 전후를 잘못 나눔 | apiAfterMenuClick 과대(columnMng 14→실제 9) | Resource Timing·이벤트 timeStamp 한 축으로(0951d864) |
| 8 | 중간 | `run-measure.sh:77` | 독점 슬롯 안에서 자신을 다시 불러 자식이 `HEAVY_EXCL_NESTED`(exit 2)로 거부됨. README 대로는 측정이 돌지 않음(실행 확인) | 독점 보장 | 자식에 `RENDER_NO_EXCLUSIVE=1`(19db68e2) |
| 9 | 중간 | README 절차 | 형제 패키지 dist 빌드가 빠져 `next build` 가 `Can't resolve '@dk-oasis/m-mdm/pages/...'` 로 실패. `pnpm start -- --port 5300` 은 package.json 의 `--port 5100` 과 겹쳐 실패 | 재현 불가 | README 수정(19db68e2) |
| 10 | 중간 | `queueMs` | `sendStart − requestTime` 단위 혼합이라 늘 0 | "큐 대기 0.0ms" | 미수정(지표 미사용) |
| 11 | 중간 | `summarize.mjs` | invalid·row-at-entry 회차를 걸러내지 않음, TTFB 계열 미집계 | 요약 중앙값 | 미수정(이번 판정은 원자료로 직접 계산) |
| 12 | 낮음 | 포털 홈 대기 | `waitMenuReady` 가 myMenusTree 만 기다려 포털 홈 로딩 중에 메뉴를 누름(잎 클릭 전 302ms 중 234ms 메인 스레드 사용) | 진입 구간에 홈 꼬리 섞임 | 미수정 |
| 13 | 낮음 | 예열 | 서버 첫 호출 회차를 버리지 않음 | 보정 첫 실행 termMng 826.6(TTFB 315) | 미수정, 중앙값으로 흡수 |

### 4-3. long task 0 해석
- 보정 회차는 관측기가 동작함을 보였다. 그러나 화면 렌더가 50ms 미만 조각들로 끝나면 long task 는 0 이다. "long task 0 → 렌더 가설 기각" 은 논리가 성립하지 않는다.
- 이번 trace 로는 응답 뒤 구간이 실제로 짧았다(≈33ms). 결론(조회 체감의 주체는 서버)은 맞지만 근거는 long task 가 아니라 구간 분해다.

### 4-4. 가설 판정 재평가

| 가설 | findings | 재평가 | 근거 |
|---|---|---|---|
| A1 autoSize storm 없음 | 기각 | 유지 | 11개 그리드 모두 `fit`(코드). headerMng 는 표에 없음 |
| A4 데이터 변경 시 행 전수 순회 | 기각 | **미판정** → 영향 상한 ≈12~15ms | 응답 뒤 구간 전체가 ≈33ms 라 커도 그 안이다 |
| A5 memo 파괴 · A6 레이아웃 껍데기 재생성 · A8 셀 래퍼 | 기각 | **미측정이었음** → §5 렌더 횟수로 측정 | 하네스가 행 클릭·입력을 재지 않았다 |
| A7 auth/me 중복 | 기각 | 기각 유지, 근거 교체 | 진입당 4~6회, 동시 발화 1왕복, 재렌더 3~9ms |
| A2 fit no-op 강제 리플로우 · C5 전 행 새 객체 | 미판정 | 미판정 유지, 근거 교체 | 응답 뒤 Layout 2회·UpdateLayoutTree 4회 |
| §6.5 숨은 탭 유지 비용 | 판정 완료 | **미판정** | 탭 2개 전환만 쟀다. 공유 컨텍스트 원자료는 복원 탭이 부팅 호출을 늘린다는 반대 증거를 준다 |

## 5. 중복 렌더링

조정자 추가 지시로 React 렌더 횟수를 처음 직접 쟀다. 시간 측정이 모두 끝난 뒤 별도 단계로 했다.

- 방법: `next build --profile --no-mangling` 번들(StrictMode 이중 렌더 없음)에 DevTools 훅 흉내를 심어 커밋마다 실제로 함수가 실행된 컴포넌트를 모았다(`scripts/perf/render/count-renders.mjs`, 제품 코드 무변경). 화면마다 새 컨텍스트, 동작은 ① 메뉴 진입 ② [조회] ③ 첫 행 클릭 ④ 숨은 탭 복귀.
- 원자료 `$S/cc-verify/renders/renders.json`, 상세 분석 `$S/cc-verify/rerender-analysis.full.md`.
- `dur` 은 커밋 루트 actualDuration(렌더 단계만)이라 DOM 변경·AG Grid 의 React 밖 작업은 빠진다.

### 5.1 동작별 요약

| 화면 | ① 진입 커밋 / dur | ② 조회 | ③ 행 클릭 | ④ 탭 복귀 |
|---|---|---|---|---|
| termMng | 23 / 15.4ms | 36 / 5.7 | 19 / 5.6 | 5 / 2.3 |
| columnMng | 20 / 18.0 | 25 / 9.7 | 8 / 9.8 | 5 / 3.8 |
| layoutConfirm | 40 / 12.6 | 7 / 1.0 | 7 / 7.8 | 5 / 3.7 |
| headerMng | 18 / 11.2 | 41 / 5.5 | 59 / 9.0 | 5 / 3.9 |
| dataMng | 20 / 13.0 | 27 / 6.4 | 26 / 12.1 | 5 / 3.3 |
| codeMng | 22 / 12.1 | 25 / 6.6 | 22 / 11.9 | 5 / 3.2 |

- 커밋 수가 많은 이유의 대부분은 AG Grid 가 행마다 `flushSync` 로 따로 커밋하는 연쇄다(조회·행 클릭에서 17~49회, dur 합 ≤3ms).
- **조회 체감에서 React 렌더 비중**: 서버가 느린 columnMng·termMng 은 응답 뒤 렌더 3.6~4.2ms(체감의 1~2%). 서버가 빠른 화면(≈25ms)은 10~26% 지만 그중 "중복" 몫은 1ms 안팎이다.
- **숨은 탭 복귀 때 화면 본체는 다시 렌더되지 않는다.** 렌더는 `TabPageSlot` memo 에서 멈춘다(`shared/src/portal-shell/portal-shell.tsx:111-161`). 복귀 비용은 셸 2커밋 2.3~3.9ms 다.

### 5.2 중복 렌더 사례

| # | 계층 | 사례 | 동작 | 원인 file:line | 비용 | 판정 |
|---|---|---|---|---|---|---|
| C2 | **공통** + 화면 사용 | 행 클릭마다 포털 셸 전체 2회 렌더 | ③ dataMng·codeMng·layoutConfirm | 화면이 행 클릭 때 `onSnapshotChange`(`dataMng/page.tsx:121-126,225-231`, `codeMng/page.tsx:143-153`, `layoutConfirm/page.tsx:126-138`) → 셸 `setTabs`(`use-portal-tabs.ts:246-254`) → C1 effect 로 1회 더 | 행 클릭당 ≈3~4ms(행 클릭 렌더의 30~45%) | **이번 최대 순수 중복** |
| C1 | **공통** | 탭 상태가 바뀔 때마다 셸이 한 번 더 렌더 | ① 진입(셸 4커밋) | tabOrder 동기화 effect 가 변화가 없어도 새 배열로 `setTabOrder`(`use-portal-tabs.ts:429-447`) | 진입당 ≈2~4ms(추정) | 고칠 가치 중간 |
| C4 | **공통** | 홈을 떠날 때 숨은 홈 위젯 보드가 폭 0 으로 다시 렌더 | ① | ResizeObserver 0폭 통지(`widget/WidgetFrame.tsx:96-106`, `WidgetWorkspace.tsx:144`, `WidgetBoard.tsx:60`) | ≈2.5~3ms | 작음~중간 |
| C5 | **공통** | 탭이 바뀔 때마다 숨은 홈 바로가기 위젯이 즐겨찾기 재요청 | ①·④ | `m-mcm/widgets/home/quickLinks/widget.tsx:27-31` 가 어느 탭 활성화에도 fetch | 렌더 ≈0, 요청 1건/전환 | 요청 낭비. trace 의 "클릭 뒤 secFavorite 1건" 과 같은 계열로 보이나 같은 호출인지는 미확인 |
| C6 | **공통** | `useUserButtonRbac` 인스턴스마다 `/api/auth/me` 와 상태 | ①, 첫 상세 | `use-user-button-rbac.ts:64-73,141-185`, 구독자 `PageLayout.tsx:105`·`ContentBody.tsx:171` | 렌더 ≤0.4ms, 요청 진입당 3~5건 | 렌더 무시, 요청 중복은 줄일 가치 |
| C3 | 공통 | 메뉴 클릭마다 사이드바 TreeItem 전체 재렌더 | ①·④ | `sidebar/Sidebar.tsx:148-181`(effect setState), `:351-361`(전체 맵 prop) | ≤1ms | 무시 |
| C7·C8 | 공통 | 그리드 mount 뒤 gridReady·메타 도착 2~3회, 행 선택 뒤 커서 effect 1회 | ①·③ | `AgDataGrid.tsx:1022,1222-1229,1270-1272`, `mdm-meta/context.tsx:99-118` | 각 ≤0.6ms | 무시 |
| C9 | 라이브러리 | AG Grid 행별 단독 커밋 연쇄 | ②·③ | ag-grid-react `agFlushSync` | dur ≤1.1ms, 벽시계 연쇄 3~19ms(상한) | 앱 코드로 못 줄임 |
| S3 | 화면 고유 | columnMng 클릭 즉시 화면 루트 전체(261개) 렌더 | ②·③ | busy/로딩을 루트 state 로(`columnMng/page.tsx:145-147,215-262`) | 5.2ms(단일 렌더 최대) | 무거운 화면에서 의미 |
| S5 | 화면 고유 | headerMng 빈 목록이면 그리드를 내렸다가 조회 때 새로 생성 | ② | `headerMng/components/HeaderList.tsx:32-47` | 생성 2.9ms | 작음~중간 |
| S1 | 화면 고유 | termMng 진입 ≈300ms 뒤 `setCandidates([])` 새 배열로 화면 전체 재렌더 | ① | `termMng/page.tsx:182-188` | 2.3ms(체감 경로 밖) | 작음 |
| S4 | 화면 고유 | columnMng 설명 편집기 `key` 재마운트 | ③ | `columnMng/page.tsx:244,926-941` | ≤0.6ms, 재요청 없음 | 의도, 무시 |

### 5.3 측정 못 한 위험
- 상세 폼 **입력 중** 렌더: columnMng 은 `form` 이 루트 state(`page.tsx:135`)라 한 글자마다 루트 렌더(2.7~5.2ms)가 날 수 있다. termMng 추천 그리드 열(`recoColumns`, `page.tsx:251-272`)이 `form` 에 의존하고, headerMng 사용 전문 그리드는 rowData 를 매 렌더 새로 만든다(`HeaderUsagePanel.tsx:25,39`). count-renders 에 "상세 폼 입력" 동작을 더해 재야 한다.

## 6. findings 에서 고칠 곳 (본문은 고치지 않음)

1. §5·§6 의 `searchToRowMs` 표와 Top 3 해석: 폴링 격자 값임을 밝히고 페이지 안 시계 값(columnMng ≈380, termMng ≈167, 나머지 ≈25ms)으로 바꾼다.
2. §6.2 "TTFB 371 + 프런트 442ms(53%)" 와 §7.2 B안: 프런트는 ≈33ms(바닥 ≈20 포함)다. B-2·B-3 효과는 10ms 대다. 제목 826.9(perf-final)와 분해 812.6(perf-2nd) 두 실행이 섞인 것도 정리한다.
3. §6.2 의 "RecalcStyle 129·Layout 59·Script≈100·Task≈300": 메뉴 펼침부터의 누적이고 CDP 값은 초 단위다. 삭제하거나 trace 구간 값(응답 뒤 Layout 2·UpdateLayoutTree 4)으로 바꾼다.
4. §6.3 termMng "TTFB 136 + 프런트 68ms": 프런트 ≈33ms. **응답 3.07MB·8,155건**을 더한다.
5. §6.4 ① "/api/auth/me 진입당 22회": 메뉴 클릭 뒤 4회(columnMng 6회)로 바꾸고 22 는 공유 컨텍스트 페이지 전체 평균임을 적는다. 호출처 목록에서 `portal/page.tsx:61` 은 캐시가 있음, `:147·191·246` 은 클릭 핸들러, `use-portal-auth-user.ts:31` 은 `getJson`, 빠진 `home/api.ts:65` 추가(10곳). C-2 에 재로그인 감지 의도(`use-user-button-rbac.ts:137-139`)를 적는다.
6. A7·D2·K8·§6.4 ①: dataMng·codeMng 구독자는 진입 3·첫 행 선택 후 5 다(상세 ContentBody 2개는 `mode==="detail"` 일 때만). D2 안의 모순도 정리한다.
7. §6.4 ③ "화면 무관 호출 7건이 shellReadyMs 주 후보", C-1: 그 호출들은 메뉴 클릭 전 포털 홈 로딩에서 나간다. 클릭 뒤는 secFavorite 1건이다.
8. §6.4 ② "실조회가 인덱스 32/32": `apiCalls` 는 완료 순서라 근거가 안 된다. 진입 안 2~3단 사슬을 적는다.
9. §5 "headerMng 는 네트워크로 설명되지 않는 50ms": 하네스 바닥값이다(페이지 안 시계 ≈26ms 중 TTFB 6ms).
10. §5 표의 layoutConfirm 40.7ms: 진입 자동 조회 때문에 무효로 표시한다.
11. §6.5 warm "조회→첫 행 37.8ms": `row-at-entry` 의 탭 전환 값이다. "판정 완료" 를 "탭 2개 전환만 측정" 으로 낮춘다.
12. §4.8 "5개 화면 전부 long task 0": 중앙값 기준이다(OC 원자료 termMng R1 74ms, headerMng R2 54ms 있음). "렌더 가설 기각" 근거로 쓰지 않는다.
13. "TTFB 371ms 는 순수 서버 시간": BFF 경유 값이다. WAS 직접은 ≈20~25ms 짧다.
14. 줄 번호: `mdm-e2e.ts:66-68`→`:64-65`, `docs/idea.md:113`→`:112`, `ContentBody.tsx:170`→`:119`, `Input.tsx:29` 삭제(57·63 유지), K6 `ids` 10키→9키·범위 `:284-292`, L1 `useState` 11→10개, `use-user-button-rbac.ts:64-72`→`:64-73` 통일.
15. K3 `sizeColumnsToFit(:1316)` 경로: 11개 그리드 모두 fit 이라 `:1309` 에서 먼저 return 한다. A2 와의 모순을 정리하고 T5 의 "gridWidth 가드 덕" 도 고친다.
16. D5 `columns.tsx:12-30`: 카테고리 그리드가 아니라 dataMng 목록 그리드 ID 열이다.
17. A1 표에 headerMng 를 넣거나 "5개 화면 한정" 이라 적는다.
18. 하네스 README 의 "용어 관리 '코일' 22건" 은 키워드 조회 값이다. 하네스는 조건 없는 조회(8,155건)를 잰다.

## 7. 가이드 후보

조정자 지시로 새 화면 가이드의 후보만 적는다. 본문 작성은 머지 뒤 따로 한다. **확인** = 이번 재측정·trace·렌더 횟수로 확인한 사실, **후보(미검증)** = 코드 근거만 있거나 재지 않은 것. 계층 열의 **공통** 은 portal·shared 에서 생겨 새 화면 전부에 영향을 주므로 1순위다.

### (가) 화면 설계 규칙

| 순 | 규칙 | 계층 | 근거 | 어기면 | 상태 |
|---|---|---|---|---|---|
| 1 | 목록 화면은 **조건 없는 전체 조회를 기본으로 두지 않는다.** 첫 조회 조건(기간·키워드 필수, 상한 건수, 페이징)을 정하고 응답 크기 기준선을 둔다(초안: 첫 조회 응답 ≤ 500KB·≤ 1,000건) | 화면(백엔드 포함) | columnMng 7,858건·2.89MB, termMng 8,155건·3.07MB. 체감 ≈380/167ms 중 서버 TTFB 92%/80% | 7천~8천 건이면 로컬에서도 조회 체감 4~15배(≈25ms → 167~380ms). 운영 망에서는 3MB 전송이 더해진다 | 확인(기준 수치는 초안) |
| 2 | 대량 목록 최적화는 **서버 쪽부터** 본다. 프런트 행 가공 메모이즈 같은 작업은 우선순위가 낮다 | 화면 | 응답 뒤 프런트 ≈33ms 중 ≈20ms 는 2KB 화면과 같은 바닥값, 3MB 추가분 ≈12~15ms | 프런트를 고쳐도 10ms 대만 준다 | 확인 |
| 3 | **탭 snapshot(`onSnapshotChange`)은 복원에 필요한 값이 바뀔 때만** 부른다. 행 클릭마다 부르지 않는다 | 공통 설계 + 화면 사용 | §5.2 C2 | 행 클릭마다 포털 셸 2회 렌더 ≈3~4ms(행 클릭 렌더의 30~45%) | 확인 |
| 4 | 무거운 화면은 **busy·로딩 플래그를 화면 루트 state 하나로 두지 않는다.** 로딩이 필요한 부분만 받게 하고 큰 상세 영역은 memo 로 분리한다 | 화면 | §5.2 S3 columnMng 클릭 즉시 루트 렌더 5.2ms | 빠른 서버 화면에서는 응답 처리 앞에 5ms 대가 놓인다 | 확인(크기 작음) |
| 5 | **빈 목록이라고 그리드를 내리지 않는다.** 빈 상태는 그리드 오버레이(`emptyMessage`)로 보인다 | 화면 | §5.2 S5 | 0건→조회마다 AG Grid 재생성 ≈3ms+ | 확인 |
| 6 | **화면 진입에 `/api/auth/me` 를 컴포넌트마다 부르지 않는다.** 사용자 확인은 한 번 하고 공유한다 | **공통**(`useUserButtonRbac`) | 진입당 4~6건, 동시 발화 1왕복. 조회 단추는 이 왕복 동안 비활성(≈70ms) | 구독자(ResizableBody·PageLayout·화면 루트·팝업) 수만큼 요청. 벽시계는 1왕복이라 작다 | 확인(공통 수정은 shared 동작 변경이라 승인 대상) |
| 7 | **패널 수만큼 구독이 늘어나는 구조를 피한다.** resizable `ContentBody` 마다 RBAC 구독자가 하나씩 붙는다 | **공통**(`ContentBody.tsx:171`) | columnMng 은 ContentBody 2 + PageLayout + 화면 루트 + 팝업 = 구독자 5, auth/me 6건 | 패널을 늘릴수록 요청·인스턴스 상태가 는다 | 확인 |
| 8 | **화면과 무관한 호출을 화면 진입에 붙이지 않는다.** 숨은 탭(홈 위젯 등)은 자기 탭이 활성화될 때만 재조회한다 | **공통**(홈 위젯) | 클릭 뒤 무관 호출은 secFavorite 1건. 바로가기 위젯이 어느 탭 활성화에도 재요청(`quickLinks/widget.tsx:27-31`) | 탭 전환마다 요청 1건 | 확인(규모 작음). OC 의 "7건" 은 측정 결함 |
| 9 | 숨은 탭은 **폭 0 통지로 다시 그리지 않는다** | **공통**(위젯) | §5.2 C4 | 홈을 떠날 때 ≈2.5~3ms | 확인 |
| 10 | effect 안에서 **변화 없는데 새 배열·객체로 setState 하지 않는다**(`prev` 를 그대로 돌려준다) | 공통·화면 | C1 tabOrder(셸 전체 1회 추가), S1 `setCandidates([])` | 셸 전체·화면 전체가 한 번 더 렌더 | 확인 |
| 11 | 행마다 무거운 가공(formatLabels 류)을 렌더 경로에 두지 않는다 | 화면 | columnMng `page.tsx:203-213`. 다만 응답 뒤 전체가 ≈33ms 라 상한이 작다 | ≤12~15ms(7,858행 기준 상한) | 후보(분해 미측정, CPU 프로파일 필요) |
| 12 | 입력 중 다시 렌더되는 그리드에는 columnDefs·rowData 참조를 매 렌더 새로 만들지 않는다 | 화면 | `termMng/page.tsx:251-272`, `HeaderUsagePanel.tsx:25,39` | 미측정 | 후보(미검증) |
| — | 신경 쓰지 않아도 되는 것: AG Grid 행별 커밋 연쇄, 그리드 mount 뒤 메타 도착 재렌더, TreeItem 전체 재렌더, 인라인 콜백으로 인한 memo 깨짐(입력 경로 제외) | 공통·라이브러리 | 각 ≤1ms | — | 확인 |

### (나) 새 화면 성능 확인 절차(초안)
1. `scripts/perf/render/screens.mjs` 에 화면을 등록한다: `trail`(메뉴 경로, **시더의 메뉴 이름**으로. e2e 준비 단계 경로를 베끼지 않는다), `breadcrumb`, `listPanelTitle`(목록 GridPanel 제목), `searchUrlPattern`, `searchUrlExclude`, `needsSearch`.
2. README 절차대로 프로덕션 빌드(형제 패키지 포함) → `next start -p 5300`.
3. `RENDER_ISOLATE=1 RENDER_SCREENS=<id> bash scripts/perf/render/run-measure.sh 3` 으로 cold 3회를 잰다. 판정은 `inPageSearchToRowMutMs`·`searchTtfbMs`·`searchEncodedBytes`·`apiAfterMenuClick`·`authMeAfterMenuClick`·`searchAfterClick`(0 이면 무효) 로 한다.
4. 필요하면 `next build --profile --no-mangling` 번들로 `count-renders.mjs` 를 돌려 동작별 커밋·셸 재렌더를 본다.
5. 예산 초안(근거: 이번 6화면 실측, 로컬):

| 지표 | 예산 초안 | 근거 |
|---|---|---|
| 조회 클릭→첫 행(페이지 안 시계) | ≤ 100ms(로컬) | 소형 응답 화면 ≈25ms, 사람이 느끼는 문턱 ≈100ms. columnMng 380·termMng 167 은 초과 |
| 조회 응답 크기 | ≤ 500KB(첫 조회) | 2KB 화면과 3MB 화면의 프런트 차이 ≈12~15ms 지만 운영 망 전송·서버 TTFB 가 크기에 비례 |
| 조회 서버 TTFB(BFF 기준) | ≤ 50ms(로컬) | 소형 화면 3~9ms, columnMng 345·termMng 130 |
| 메뉴 클릭 뒤 진입 호출 | ≤ 6건, `/api/auth/me` ≤ 1건(공통 수정 뒤) | 현재 6~9건, auth/me 4~6건 |
| 행 클릭 렌더 | 포털 셸 재렌더 0회 | C2 |

### (다) 측정 함정
1. **Playwright `waitFor` 값은 폴링 격자에 붙는다**(0·20·50·100·100·500ms). 270ms 이후 해상도 500ms. columnMng 380ms 가 820ms 로 잡혔다. 화면 안 시간은 페이지 안 시계(이벤트 timeStamp·MutationObserver)로 잰다.
2. **클릭 호출 전 시각**에는 Playwright actionability·CDP 왕복 ≈30ms 가 깔린다. 바닥값을 화면 비용으로 읽지 않는다.
3. **같은 브라우저 컨텍스트로 여러 화면을 재면 cold 가 아니다.** 포털이 localStorage 로 열린 탭을 복원한다. 화면마다 새 컨텍스트로 잰다.
4. **Node `Date.now()` 와 CDP `wallTime` 은 다른 시계다**(이 PC 에서 ≈123~156ms 어긋남). 클릭 전후 분류는 페이지 시계(Resource Timing) 한 축으로 한다.
5. **long task 0 은 렌더가 가볍다는 뜻이 아니다.** 50ms 미만 작업 여럿이면 0 이다. 구간 분해(trace)로 판정한다.
6. **`page.evaluate` 최상위 동기 루프는 long task 로 잡히지 않는다**(about:blank 프로브 3회 0건, setTimeout 안은 3회 모두 1건). 보정 루프는 `setTimeout` 안에서 돌린다.
7. **CDP `Performance.getMetrics` 의 `*Duration` 은 초 단위**이고 구간은 스냅샷 사이 전체다.
8. **`responseReceived.encodedDataLength` 는 헤더까지**다. 본문 크기는 `loadingFinished` 에서 받는다.
9. **진입 자동 조회 화면**은 [조회] 클릭 지표가 무효가 된다. 클릭 뒤 조회 요청 수로 확인한다.
10. **e2e 준비 단계의 메뉴 경로를 그대로 베끼지 않는다.** `mdm-layoutConfirm.spec.ts:32` 는 준비 단계로 「전문 헤더 정의」(headerMng)를 연다. OC 1차 하네스는 layoutConfirm 경로를 「전문 헤더 정의」로 잡아 headerMng 를 쟀다(findings §4.9 에서 정정).
11. **로컬은 전송 시간이 0 에 가깝다.** 3MB 도 본문 수신 ≈13ms 다. 응답 크기를 따로 기록하고 운영 망 영향을 적는다.
12. **TTFB 는 BFF 경유 값**이다. WAS 직접과 비교하면 BFF 몫(≈15~25ms)이 나온다.
13. **포털 홈 로딩 중에 메뉴를 누르면** 홈 호출이 진입 구간에 섞인다. 메뉴 트리만 기다리면 부족하다.
14. **렌더 횟수는 profiling 번들로 센다.** dev 서버는 StrictMode 이중 렌더가 섞이고, `--no-mangling` 없이는 컴포넌트 이름이 깨진다.

## 8. 한계
- 로컬 SQLite·로컬 망이다. 3MB 응답 전송이 로컬에서는 ≈13ms 지만 운영 망에서는 크기만큼 늘어난다.
- trace 에 CPU 프로파일러 카테고리를 넣지 않아 응답 뒤 ≈20ms 안의 JSON.parse·행 가공·AG Grid 적재를 나누지 못했다.
- 페이지 안 시계의 MutationObserver 콜백은 `getClientRects` 로 강제 레이아웃을 일으킨 뒤 시각을 적는다. trace 상 ≈2~3ms 라 `inPage*` 값은 그만큼 크다(≈25ms 화면에서 10% 안팎).
- warm 은 탭 2개 전환만 쟀다. 탭 여러 개를 열어 둔 상태의 새 화면 진입 비용은 재지 않았다.
