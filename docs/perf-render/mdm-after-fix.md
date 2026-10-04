# MDM 화면 성능 수정 후 재측정

- 대상: dev 9a79d1db 에 머지된 수정 2건
  - eba58ab2 columnMng·termMng 첫 조회 상한(조건 없는 [조회] 는 `limit=1000`, 서버 `totalCount`·`truncated`, shared `GridLimitNotice` + [전체 보기])
  - 9a79d1db 공통 계층 K1~K7(셸 같은 값 재렌더 제거, `/api/auth/me` 세션 캐시, 홈 위젯 K5·K6)
- 수정 전 기준: [findings 독립 검증](mdm-findings-verification.md)(이하 "검증", f4378bef). 원자료 `$V/fix-iso`·`count-iso1`·`fix-warm`·`renders`
- 측정: 2026-10-04 23:06~23:15, 워크트리 `.claude/worktrees/perf-after`(브랜치 `perf/measure-after`, 기준 dev 9a79d1db)
- 원자료(저장소 밖): `$A/` — `A=/private/tmp/claude-501/-Users-jji-project-dmes-standard/0f5259b8-a807-4bb9-8f2d-bb2598383ded/scratchpad`, `V=/private/tmp/claude-501/-Users-jji-project-dmes-standard/f733ea8c-9350-4a0f-98e8-603ba013c51d/scratchpad/cc-verify`

## 0. 결론

1. **첫 조회 상한이 기대대로 동작한다.** columnMng·termMng 의 조건 없는 [조회] 응답은 각각 2.89MB·7,858건과 3.07MB·8,155건에서 **347KB·1,000건과 368KB·1,000건**으로 줄었다. 조회→첫 행(페이지 안 시계)은 columnMng 385.8→**126~156ms**, termMng 166.6→**64~68ms** 이다.
2. **[전체 보기]는 수정 전 전체 조회 수준이다.** columnMng 428ms(TTFB 385), termMng 200ms(TTFB 177)로, 수정 전 전체 조회(385.8·166.6ms)보다 10~20% 크다. 같은 시각 소형 화면 TTFB 도 5~15ms 커서, 차이의 상당 부분은 환경 차이로 본다(§4).
3. **`/api/auth/me` 는 페이지당 1건이다.** 페이지 전체는 13~15건에서 **1건**(포털 부팅)이고, 그 뒤 같은 페이지에서 메뉴를 눌러 화면에 들어갈 때는 4~6건에서 **0건**(캐시 적중)이다. 숨은 탭으로 돌아올 때도 0건이다(warm).
4. **진입 호출은 6~9건에서 2~3건이다.** 남은 호출은 `secUser/myButtonEndpoints`(RBAC)·`mdmMeta/columns`(그리드 메타)와 화면 고유 호출(columnMng `optionsOnly`, layoutConfirm 진입 자동 조회, headerMng 진입 조회)이다. 화면과 무관한 `secFavorite` 는 사라졌다.
5. **행 클릭 때 포털 셸 재렌더는 2회에서 1회다**(snapshot 을 쓰는 dataMng·codeMng·layoutConfirm). 나머지 화면은 0회다. 진입 때 셸 렌더는 4회에서 3회, 숨은 홈 위젯(QuickLinksWidget·WidgetBoard) 렌더는 진입·탭 복귀 모두 0회다.
6. **R11(행마다 무거운 가공)은 기각한다.** 7,858행 [전체 보기]에서 화면 코드(라벨 조합 포함) 몫은 응답 뒤 CPU 32~34ms 중 **0.6~0.8ms** 다. 응답 뒤 시간은 본문 파싱·엔진(`(program)`)과 AG Grid 적재가 차지하고, 둘 다 응답 크기에 비례한다.
7. **R12(입력 중 재렌더)는 확정한다.** 상세 폼에 한 글자를 칠 때마다 화면 루트 전체가 다시 렌더된다(columnMng 268개 컴포넌트 5.8~9.5ms, termMng 171개 + 추천 그리드 셀 재렌더 연쇄 ≈20커밋 5.4ms, profiling 번들).
8. **남은 문제**: columnMng 상한 조회 TTFB 가 107~136ms 로 예산(≤50ms)을 넘는다. 서버가 ID·논리명을 전부 읽어 정렬한 뒤 자르기 때문이다(`ColumnMngService.java:136-144`). 후속 후보는 §6 에 적는다.

## 1. 측정 조건

| 항목 | 값 |
|---|---|
| 빌드 | 워크트리 `pnpm install` → shared → 형제 패키지(m-mpn·m-mpp·m-mqc·m-mls·m-mdm·m-analog) → m-mcm `next build`(모두 `heavy.sh` 경유) |
| 서버 | `next start -p 5300`(본인 기동·종료). 백엔드 8100·8096·8092 읽기만. 백엔드에 상한 코드가 실려 있음을 시험 1회로 먼저 확인했다(`limit=1000` → 1,000행·`totalCount`) |
| `.env` | 메인 사본에서 `NEXTAUTH_URL` 만 5300. 메인 `.env` 무변경 |
| 계정 | admin / admin123. 로그인 실패 0회 |
| 전원·부하 | AC, lowpowermode 0. 회차 load1 3.9~4.6(검증 때 1.4~3.7). LOAD_LIMIT 5 초과 9회차는 버렸다 |
| 독점 | 시간 측정은 모두 `heavy.sh --exclusive` 안에서 하나씩 |
| 화면 순서 | `termMng,columnMng,layoutConfirm,headerMng,dataMng,codeMng`, 화면마다 새 컨텍스트(`RENDER_ISOLATE=1`) |

| 실행 | 하네스 조건 | 폴더 |
|---|---|---|
| 수정 전과 같은 조건 cold 3회 | `RENDER_HOME_IDLE=0 RENDER_WARMUP=0`(검증 때 하네스와 같은 진입 조건) | `after-iso-same/` |
| 새 기본값 cold 3회 × 2 | 홈 로딩 대기·예열 회차(결함 12·13 수정), `RENDER_FULL_VIEW=1` | `after-iso-new/`, `after-iso-new2/`(병합 `after-iso-new-merged.json`, 화면당 유효 5~6회) |
| warm 3회 | columnMng·termMng, `RENDER_HOME_IDLE=0` | `after-warm/` |
| 진입 호출 이름 1회 | `apiAfterMenuClickNames` | `after-names/` |
| 렌더 횟수 | `next build --profile --no-mangling` 번들, `count-renders.mjs`(⑤ 입력 포함) | `renders/` |
| CPU 프로파일 | 같은 번들, `cpu-profile-search.mjs`(limit·full × 3회) | `cpu/` |

- **전후 비교는 "같은 조건" 실행으로 한다.** 새 기본값 실행은 메뉴를 누르기 전 홈 로딩을 기다리고 예열 회차를 버리므로 진입 구간 값이 하네스 덕에도 바뀐다. 그 값은 §2 표의 괄호에 따로 적는다.
- 수정 전 진입 호출 수는 검증 §3.2 의 Resource Timing 판(`count-iso1`) 값이다. `fix-iso` 의 `apiAfterMenuClick` 은 결함 7(시계 어긋남) 수정 전 값이라 쓰지 않는다.

## 2. 전후 비교 (격리 cold 3회 중앙값)

### 2.1 조회

| 화면 | 조회→첫 행(페이지 안 시계) 전 → 후 | TTFB(BFF) 전 → 후 | 응답 크기 전 → 후 | 행 수 전 → 후(전체) |
|---|---|---|---|---|
| columnMng | 385.8 → **156.1**(126.1) | 350.5 → **136.2**(107.3) | 2,893,476 → **346,617** | 7,858 → **1,000**(7,858) |
| termMng | 166.6 → **68.0**(63.6) | 133.8 → **46.9**(46.0) | 3,074,111 → **368,080** | 8,155 → **1,000**(8,155) |
| headerMng | 26.0 → 29.4(27.2) | 6.1 → 21.7(16.7) | 2,851 → 2,851 | 9 |
| dataMng | 25.6 → 26.1(23.9) | 4.0 → 10.3(7.3) | 2,155 → 2,155 | 18 |
| codeMng | 25.4 → 27.0(24.4) | 4.1 → 13.8(9.8) | 4,452 → 4,452 | 17 |
| layoutConfirm | 16.7 → 17.0(무효) | 3.4 → 9.4(6.7) | 1,179 → 1,179 | 5 |

괄호 = 새 기본값 실행(예열·홈 대기). layoutConfirm 은 진입 자동 조회 화면이라 조회 지표가 무효다(검증 §2.1).

### 2.2 [전체 보기] (새 기본값 실행, 유효 5회 중앙값)

| 화면 | 클릭→안내 띠 사라짐 | TTFB | 응답 크기 | 행 수 | 수정 전 전체 조회(조회→첫 행 / TTFB) |
|---|---|---|---|---|---|
| columnMng | 428.2 | 385.1 | 2,893,476 | 7,858 | 385.8 / 350.5 |
| termMng | 199.8 | 177.4 | 3,074,147 | 8,155 | 166.6 / 133.8 |

- 요청 본문은 `limit` 이 빠진 수정 전 본문과 같다(`{"keyword":""}` 류). 행 수는 같고, 응답 크기는 columnMng 은 같고 termMng 은 +36B 다. termMng 은 `limit` 이 없어도 `totalCount`·`truncated` 두 필드를 싣는다(`TermSearchResult.java`, 상한 없는 경로의 조회는 수정 전과 같다).
- TTFB 는 columnMng +35ms(+10%), termMng +44ms(+33%)다. 상한 없는 경로의 서버 코드는 두 필드 외에 바뀌지 않았고(`git diff f4378bef..9a79d1db`), 같은 실행에서 바뀌지 않은 소형 화면 TTFB 도 2~4배(+5~15ms) 커져 있다(§4). termMng 증가폭은 소형 화면보다 커서 환경 차이만으로 다 설명되지는 않는다. 부하가 낮은 시점에 다시 볼 항목으로 남기고(§6 F6), 크기·행 수·본문이 같으므로 "기존 수준" 으로 판정한다.

### 2.3 화면 진입 (메뉴 잎 클릭 → [조회] 클릭)

| 화면 | 진입 호출 전 → 후 | 그중 auth/me 전 → 후 | 페이지 전체 auth/me 전 → 후 | 페이지 전체 API 전 → 후 | shellReady 전 → 후(하네스 격자 값) |
|---|---|---|---|---|---|
| termMng | 6 → **2** | 4 → **0** | 13 → **1** | 27 → 15 | 74.5 → 82.7 |
| columnMng | 9 → **3** | 6 → **0** | 15 → **1** | 30 → 16 | 94.0 → 89.9 |
| layoutConfirm | 7 → **3** | 4 → **0** | 14 → **1** | 29 → 16 | 66.4 → 58.8 |
| headerMng | 6 → **2** | 4 → **0** | 13 → **1** | 28 → 15 | 61.6 → 61.0 |
| dataMng | 6 → **2** | 4 → **0** | 13 → **1** | 27 → 14 | 70.0 → 66.0 |
| codeMng | 6 → **2** | 4 → **0** | 13 → **1** | 27 → 14 | 69.5 → 61.9 |

수정 후 진입 호출 목록(시작 순):

| 화면 | 호출 |
|---|---|
| termMng | `secUser/myButtonEndpoints`, `mdmMeta/columns` |
| columnMng | `columnMng/search`(optionsOnly), `secUser/myButtonEndpoints`, `mdmMeta/columns` |
| layoutConfirm | `layoutConfirm/search`(진입 자동 조회), `secUser/myButtonEndpoints`, `mdmMeta/columns` |
| headerMng | `headerMng/search`, `secUser/myButtonEndpoints` |
| dataMng·codeMng | `secUser/myButtonEndpoints`, `mdmMeta/columns` |

- 수정 전 클릭 뒤 화면 무관 호출이던 `secFavorite`(검증 §2 주장 7)는 없다.
- shellReady 는 폴링 격자 값이라 ±20ms 안 변화는 판정하지 않는다.

### 2.4 warm (columnMng·termMng, 숨은 탭 다시 보기)

| 화면 | clickToRow 3회 전 → 후 | 중앙값 전 → 후 | API 전 → 후 |
|---|---|---|---|
| termMng | 45.8/35.5/53.1 → 37.6/38.4/39.2 | 45.8 → 38.4 | 0/0/0 → 0/0/0 |
| columnMng | 44.3/39.6/39.0 → 49.8/38.9/35.1 | 39.6 → 38.9 | 1/0/0(auth/me) → 0/0/0 |

같은 페이지에서 여러 화면을 연 뒤 숨은 탭으로 돌아올 때 `/api/auth/me` 는 0건이다.

### 2.5 동작별 React 렌더 (`count-renders`, profiling 번들, 1회)

| 화면 | ① 진입 커밋/렌더 시간 전 → 후 | ① PortalShell 렌더 | ③ 행 클릭 렌더 시간 전 → 후 | ③ PortalShell 렌더 | ④ 탭 복귀 커밋 |
|---|---|---|---|---|---|
| termMng | 23/15.4 → 23/12.0 | 4 → 3 | 5.6 → 8.6 | 0 → 0 | 5 → 4 |
| columnMng | 20/18.0 → 24/19.7 | 4 → 3 | 9.8 → 5.8 | 0 → 0 | 5 → 4 |
| layoutConfirm | 40/12.6 → 38/12.7 | 4 → 3 | 7.8 → 7.7 | **2 → 1** | 5 → 4 |
| headerMng | 18/11.2 → 14/10.3 | 4 → 3 | 9.0 → 8.2 | 0 → 0 | 5 → 4 |
| dataMng | 20/13.0 → 19/11.6 | 4 → 3 | 12.1 → 5.8 | **2 → 1** | 5 → 4 |
| codeMng | 22/12.1 → 20/8.7 | 4 → 3 | 11.9 → 13.8 | **2 → 1** | 5 → 4 |

- 진입 때 QuickLinksWidget 3회·WidgetBoard 1회·FormatBadge 8회, 탭 복귀 때 QuickLinksWidget 2회가 **모두 0회**다(K5·K6).
- 행 클릭 렌더 시간은 1회 측정이라 ±5ms 는 잡음이다(codeMng 11.9→13.8 등). 판정은 PortalShell 렌더 수로 한다.
- 남은 셸 1회는 화면이 선택 행을 snapshot 에 넣어 값이 실제로 바뀌기 때문이다(가이드 R8, 선택 행 복원 여부는 사용자 결정 사항).

## 3. R11·R12 확정 측정

### 3.1 R11 — 조회 응답 뒤 CPU 배분 (`cpu-profile-search.mjs`, 3회 중앙값)

profiling 번들이고 프로파일러가 켜져 있어 절대값은 일반 번들보다 크다. 비율로 읽는다. 표의 값은 응답 헤더 도착부터 첫 행(또는 안내 띠 사라짐) 다음 프레임까지의 CPU self 시간이다.

| 화면·경로 | 응답 | 바쁨 합 | 본문 파싱·엔진(`(program)`) | GC | AG Grid | React | Mantine | 화면 코드 | native DOM |
|---|---|---|---|---|---|---|---|---|---|
| columnMng 상한(1,000행) | 347KB | 23.3 | 4.1 | 0.8 | 8.3 | 4.4 | 1.5 | 0.6 | 3.6 |
| columnMng 전체(7,858행) | 2.89MB | 33.6 | 16.2 | 1.4 | 11.1 | 2.0 | 1.3 | **0.8** | 0.4 |
| termMng 상한(1,000행) | 368KB | 30.0 | 9.6 | 0.8 | 8.7 | 5.8 | 0.7 | 0.0 | 3.7 |
| termMng 전체(8,155행) | 3.07MB | 41.9 | 20.8 | 2.8 | 12.3 | 2.1 | 0.7 | 0.7 | 1.2 |

- columnMng 의 행마다 라벨 조합(`listRows` 의 `formatLabels`, `columnMng/page.tsx:212-222`)이 든 화면 청크 self 합은 7,858행에서도 **0.8ms** 다. **R11 은 기각한다.**
- 응답 뒤 시간의 주 성분은 `(program)`(응답 본문 JSON 파싱 등 V8 내부)과 AG Grid 행 노드 생성·적재다. 전체 응답에서 둘 다 커진다(파싱 4~10 → 16~21ms, AG Grid 8 → 11~12ms). 줄일 방법은 R1(응답 크기)이다.
- 상한 경로의 native DOM 3.6ms 중 `getClientRects` 2.7ms 는 측정기의 첫 행 판정(MutationObserver)이다(검증 §8 의 "≈2~3ms 크게 잡힌다" 와 같은 몫).

### 3.2 R12 — 상세 폼 입력 (`count-renders` ⑤, "ABCDE" 150ms 간격, 저장 안 함)

| 화면 | 입력 칸 | 커밋 / 렌더 시간(5글자) | 한 글자당 | 한 글자마다 다시 렌더되는 것 |
|---|---|---|---|---|
| columnMng | 표시명 긴 | 5 / 38.2ms | 1커밋 · 7.6ms(5.8~9.5) | 화면 루트 `ColumnMngPage` 와 그 아래 268개 컴포넌트(입력 칸 17·Box 88 등), AgDataGrid 래퍼 2개(AG Grid 셀 재렌더 없음) |
| termMng | 맥락 | 105 / 27.2ms | 21커밋 · 5.4ms | 화면 루트 `TermMngPage` 아래 171개 + 추천 그리드 셀 렌더러 142개 재렌더 + 셀 단위 단독 커밋 ≈19회(추천 그리드 열이 `form` 에 의존, `termMng/page.tsx:259` `recoColumns`) |

- 루트 state 에 둔 폼(`columnMng/page.tsx:137` 류)은 한 글자마다 화면 전체를 다시 렌더한다. 지금 크기로는 한 프레임(16ms) 안이지만 화면이 커질수록 비례해 는다. termMng 은 그리드 열 정의가 폼에 의존해 AG Grid 셀까지 다시 그린다.
- **R12 를 확정한다**(비용 작음, 구조 규칙).

## 4. 기대값 판정

| 기대(지시) | 결과 | 판정 |
|---|---|---|
| columnMng·termMng 첫 조회 응답 ≤ 500KB·1,000건 | 347KB·1,000건 / 368KB·1,000건 | **충족** |
| TTFB 감소 | columnMng 350.5→107~136, termMng 133.8→46~47 | **충족**(columnMng 은 예산 50ms 초과, §6) |
| auth/me 첫 진입 1건·두 번째부터 0건 | 페이지 전체 1건(포털 부팅 때 첫 확인), 그 뒤 메뉴 클릭 진입 0건(캐시 적중), 숨은 탭 복귀 0건. 같은 페이지에서 새 화면 두 개를 차례로 여는 순서는 따로 재지 않았다 | **충족** |
| 행 클릭 셸 재렌더 0~1회 | snapshot 화면 1회, 나머지 0회 | **충족** |
| 홈 위젯 무관 재요청 0 | 진입 호출에 `secFavorite` 없음, QuickLinksWidget 렌더 0 | **충족** |
| [전체 보기] 가 기존(전체 조회) 수준 | 428/200ms(수정 전 386/167), 크기·행 수 같음 | **충족**(+10~20%, 환경 차이 포함) |

**환경 차이**: 수정과 무관한 소형 화면(headerMng·dataMng·codeMng·layoutConfirm)의 TTFB 가 수정 전 3~6ms 에서 7~22ms 로 커졌다. 수정 전후 백엔드 변경은 columnMng·termMng 서비스뿐이고(`git diff f4378bef..9a79d1db -- src/backend`), BFF 라우트도 바뀌지 않았다. 측정 load 가 3.6 → 4.4 로 높았고 백엔드가 재기동된 뒤였다. curl BFF 경유 headerMng 는 9~16ms 다. 조회→첫 행(페이지 안 시계)은 24~29ms 로 수정 전과 같다.

## 5. 브라우저 확인 (5100 메인 dev 서버, ego-browser, 읽기만)

| 확인 | 결과 |
|---|---|
| 컬럼 사전 조건 없는 [조회] | 「컬럼 목록 1000건 · 전체 7,858건 중 1,000건을 표시합니다. 조건을 좁히거나 [전체 보기]를 누르세요. [전체 보기]」 |
| 컬럼 사전 [전체 보기] | 안내 띠 사라짐, 「7858건」 |
| 컬럼 사전 조건 조회(검색어 "코일") | 「273건」, 안내 없음 |
| 용어 관리 조건 없는 [조회] | 「1000건 · 전체 8,155건 중 1,000건을 표시합니다…」 |
| 용어 관리 [전체 보기] | 안내 띠 사라짐, 「8155건」 |
| 용어 관리 조건 조회(검색어 "코일") | 「22건」, 안내 없음 |
| 포털 탭 전환·홈 위젯 | 탭 전환 정상, 홈 주요 지표·공지·내 알림·바로가기 위젯 표시 정상 |
| 콘솔 오류(조작 중) | 0건(페이지 로드 뒤 `console.error`·`error` 이벤트 수집) |
| 콘솔 오류(부팅, 모든 5300 측정 뒤 다시 확인) | CDP Runtime·Log 를 켜고 다시 읽기: JS 예외·`console.error` 0건, 네트워크 오류 1건(`/api/mdm/mdmMeta/columns` 404 — 수정 전부터 있던 호출, 검증 §2 주장 7) |
| 5100 로그인 유지 | 5300 에서 admin 로그인을 여러 번 한 뒤에도 5100 포털 세션 유지(로그인 화면으로 가지 않음) |

저장·삭제 단추는 누르지 않았고 로그아웃하지 않았다. 검색어 칸은 확인 뒤 비웠다. 작업 공간은 닫았다.

## 6. 남은 문제와 후속 후보

| # | 문제 | 근거 | 제안 |
|---|---|---|---|
| F1 | columnMng 상한 조회 TTFB 107~136ms(예산 ≤50ms 초과, termMng 은 46ms) | `ColumnMngService.java:136-144` 가 조건 없는 상한 조회에서 ID·논리명을 **전부** 읽어 Java 로 정렬한 뒤 앞 1,000건을 고른다 | 정렬 키 인덱스·DB 정렬로 앞쪽만 읽기(방언 콜레이션 차이를 감수할지 결정 필요) |
| F2 | `TermMngService.save` 가 저장마다 전체 목록(≈8천 건) 재구성 | `TermMngService.java:227` 이 `search(new TermSearchRequest())` 로 상한 없는 전체 목록을 돌려준다. 저장 응답이 ≈3MB 다 | 저장 응답은 저장한 행·경고만, 목록 재조회는 화면이 현재 조건(상한 포함)으로 |
| F3 | 사용자 ID 만 쓰려고 RBAC 를 구독하는 곳(K4 형태) | `DashboardBoard.tsx:148`, `dashboard/layout.tsx:165`, `m-mcm/widget-types/memo/memo-user.ts:24`, `unit-converter/unit-user.ts:18` 이 `useUserButtonRbac` 로 `userId` 만 쓴다 | `useCurrentUserId()` 로 바꾸기(K4 와 같은 방식). auth/me 는 이미 캐시라 요청은 늘지 않고 RBAC 인스턴스 상태만 준다 |
| F4 | 입력 한 글자마다 화면 루트 전체 렌더(R12) | §3.2 | columnMng·termMng 상세 폼을 별도 컴포넌트로, termMng 추천 그리드 열을 `form` 에서 떼기 |
| F5 | 행 클릭 셸 1회 | §2.5 | 선택 행 snapshot 복원이 요구사항인지 사용자 결정(가이드 R8) |
| F6 | 소형 화면 TTFB 가 이번 측정에서 2~4배, termMng [전체 보기] TTFB +44ms | §2.2·§4 | 다음 측정 때 load 가 낮은 시점에 다시 본다. 코드 원인은 찾지 못했다(상한 없는 경로 서버 코드 무변경) |
| F7 | 진입 때 `mdmMeta/columns` 404 | §5, 검증 §2 주장 7 | 그리드 마운트마다 404 를 받는다. 메타가 없는 화면이면 호출하지 않게 할지 확인 |

## 7. 하네스 변경 (이번 브랜치)

| 커밋 | 내용 | 검증 §4 결함 |
|---|---|---|
| 52a59be3 | `queueMs` 를 요청 생성→송신 시작 구간으로(단위 혼합으로 늘 0) | 10 |
| e9f45501 | 메뉴를 누르기 전에 포털 홈 로딩이 조용해질 때까지 대기(`RENDER_HOME_IDLE`) | 12 |
| 96515d24 | cold 앞 예열 회차(round 0) 버림(`RENDER_WARMUP`) | 13 |
| 7f98e007 | `summarize.mjs` 가 무효 회차를 거르고 페이지 안 시계·TTFB·크기·진입 호출을 집계 | 11 |
| 2c5e1ea1 | 조회 응답 행 수·`totalCount`, [전체 보기] 재조회 측정(`RENDER_FULL_VIEW`) | — |
| 3c16aee9 | `count-renders` ⑤ 상세 폼 입력 | — |
| f2a10122 | 진입 호출 이름(`apiAfterMenuClickNames`) | — |
| 65c20a44 | `cpu-profile-search.mjs`(응답 뒤 CPU 배분) | — |

## 8. 한계
- 로컬 SQLite·로컬 망이다. 상한 덕에 운영 망에서 줄어드는 전송 시간(≈2.5MB)은 이 측정에 보이지 않는다.
- 렌더 횟수·CPU 프로파일은 profiling 번들 1회(렌더)·3회(CPU)다. 렌더 시간 ±5ms 는 잡음으로 본다.
- 측정 load 가 검증 때보다 높았다(3.9~4.6). 개수·크기 지표는 영향을 받지 않고, ms 지표는 참고로만 읽는다.
