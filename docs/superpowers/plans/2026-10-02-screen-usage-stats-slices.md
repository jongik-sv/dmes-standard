# 사용자 화면 사용 통계 — 탭 단위 수직 분할(슬라이스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통계 화면 탭 6개(개요·화면별·부서별·사용자별·미사용 화면·이용 이력)를 "백엔드 action + 화면 탭" 하나씩 묶은 슬라이스로 나눠, 서로 다른 워크트리에서 동시에 구현하고 파일 충돌 없이 병합한다.

**Architecture:**
- 순차 기반 Task F 가 슬라이스들이 함께 쓰는 파일을 한 번에 만든다.
  - 백엔드: DTO, 얇은 퍼사드 `ScreenUsageStatService`, 공통 헬퍼 `ScreenUsageStatSupport`, 탭별 쿼리 클래스 6개 골격, BPMN 완성본, `allActions`, 계약 테스트, 슬라이스용 JPA 테스트 기반.
  - 프런트: `page.tsx`, 탭 계약(`tab-contract.ts`), 탭 등록표(`tab-modules.ts`), 공용 열(`columns.ts`), 탭 모듈·탭 화면 골격 6쌍, 시험 보조 파일.
- 슬라이스 S1~S6 은 자기 쿼리 클래스·그 테스트, 자기 탭 모듈(`*-tab.ts`)·탭 화면(`*Tab.tsx`)·그 시험만 고친다.
- 마지막 Task V 가 README 와 전체 검증을 한다.

**Tech Stack:** Java 21 · Spring Boot 4 · Spring Data JPA · OASIS BPMN · JUnit 5 / Mockito / AssertJ · H2(테스트) · React 19 · Next.js 16(m-mcm) · `@dk-oasis/shared` · vitest 3(m-mcm, node 환경)

**Spec:**
- 설계: `docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md` (§4.5 통계 조회, §5 통계 화면, §7 테스트)
- 총괄 계획: `docs/superpowers/plans/2026-10-02-screen-usage-stats.md` (Global Constraints, 공유 계약 C4·C5, Review Focus)
- 재편 원본:
  - U2 `docs/superpowers/plans/2026-10-02-screen-usage-stats-u2-backend.md` Task 6·7·9 와 "메인 결정"
  - U3 `docs/superpowers/plans/2026-10-02-screen-usage-stats-u3-screen.md` Task 3 과 "메인 결정"
- 이 문서가 위 Task 들을 **대체**한다. U2 Task 6 의 `ScreenUsageStatServiceJpaTest` 는 만들지 않는다. 그 시험들은 아래 F·S1~S6 테스트로 나뉘어 들어간다.

## Global Constraints

총괄 계획 Global Constraints 를 그대로 따른다(인용).

- 작업 위치는 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats` (브랜치 `feat/screen-usage-stats`). git 은 `/usr/bin/git` 사용, 명령의 경로·옵션 자리에 셸 변수·글롭을 쓰지 않는다.
- 도커 금지. 테스트 명령: mcm-core `cd src/backend/mcm-core && ../gradlew :test` (단일 `--tests <FQCN>`).
- 사용자 ID·부서는 서버가 `SecurityIdentity` 와 `SecUser.deptCd` 로 채운다. 클라이언트 값은 쓰지 않는다.
- OASIS 서비스 클래스에 `@Transactional` 금지(6-B-1), serviceTask `output` 필수(6-C-2), grids key = Java 파라미터 이름(6-E-3). 커밋 전 `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` ERROR 0.
- 화면 코드는 shared 래퍼만 쓴다(`@mantine/*`·`ag-grid-*` 직접 import 금지), 로컬 `.css` import 금지, `mantine-aggrid-ui` audit 0건.
- 커밋 메시지는 저장소 관례 `type(scope): 한국어 subject` + 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 문서·주석·UI 문구는 한국어.

이 문서에서 더하는 제약:

- **슬라이스는 자기 파일만 고친다.** 아래 "파일 소유 표" 밖의 파일을 고쳐야 하면 고치지 말고 메인에 보고한다. 특히 퍼사드·BPMN·`page.tsx`·`DataInitializer`·`ScreenUsageStatSupport`·`tab-contract.ts`·`tab-modules.ts`·`columns.ts`·`types.ts`·`format.ts`·`api.ts`·테스트 기반 파일은 F 와 기반 Task 소유다.
- `git add` 는 파일 경로를 하나씩 적는다(`-A`·`.` 금지).
- 프런트 시험 파일은 `@dk-oasis/shared/*` 를 런타임 import 하는 파일(`*.tsx`, `types.ts`)을 import 하지 않는다. 슬라이스 시험은 `*-tab.ts`·`columns.ts`·`format.ts`·`api.ts` 만 import 한다(vitest 가 shared dist 없이 돈다). 타입은 `import type` 으로만 가져온다.
- 쿼리 클래스는 테스트에서 `new` 로 만든다. 기반의 `ScreenUsageJpaTestConfig` 는 고치지 않는다.
- m-mcm 시험 스크립트 이름은 `test:unit` 이다(U3 메인 결정 9). F Step 1 에서 실제 이름을 확인하고, 다르면 이 문서의 명령을 실제 이름으로 읽는다.

## Review Focus

총괄 Review Focus 1~5 중 통계에 걸리는 5번과, U2·U3 메인 결정이 고정하라고 한 항목이다. 각 줄의 고정 시험이 붙는 Task 를 적었다.

1. **메뉴에서 지워진 화면·부서 없는 사용자** — 통계에서 `"(메뉴 없음)"`·`deptCd "-"`·`"(부서 없음)"` 으로 보인다. → F `namesAndMissing`, S2 `unknownMenu`, S3 `unknownMenuAndNoDept`, S6 `unknownMenuAndNoDept`, S1(화면) `toTopBars` 는 기반 Task 1 이 고정.
2. **조건 완전 일치(exactMatchFilters)** — `userId`·`pageId` 앞부분 일치는 걸리지 않고, `deptCd "-"` 는 집계 `'-'`·원본 `NULL` 만 거른다. → F `exactMatchFilters`(합산 단계), S2 `exactMatchFilters`, S6 `exactMatchFilters`.
3. **이용 이력 기간 경계** — 시작·종료일 포함 31일 통과, 32일 거절(서버·화면 같은 식). → S6 `historyPeriodBoundary`(서버), S6 `history-tab.test.ts` "31일 통과·32일 차단"(화면).
4. **원본 합산 경계** — 집계 최대 일자 다음 날부터 원본을 더하고 이중 집계하지 않는다(02:00 집계 전 어제분 포함). → F `sumsSplitAggregatedAndRaw`, `beforeRollupYesterdayStillCounted`, S2 `todayFromRawPlusAggregated`.
5. **사용자별 부서·개요 미사용 수·평균 null·10,000행** — `byUserLatestDept`·`byUserSameDayDeptChange`(S4), `overviewUsesUnusedDays`(S1 서버·화면), `avgDurationMsNullWhenNoOpen`(S2 서버·화면), `historyMaxRows`(S6 서버) 와 "최근 10,000건만 표시" 안내(S6 화면).

## 메인 결정 반영표

| 결정 | 반영 위치 |
|---|---|
| U2-1 history 판정 `DAYS.between(from,to) <= 30` | S6 `ScreenUsageHistoryQuery` (`DAYS.between + 1 > HISTORY_MAX_DAYS(31)` 이면 거절), 경계 시험 `20260903~20261003` 통과·`20260902~20261003` 거절 |
| U2-2 history 10,000행 | S6 `HISTORY_MAX_ROWS = 10_000`, package-private 생성자로 작은 상한 시험 |
| U2-2 미사용 = 이용 기록 없음, 원본 합산 = 집계 최대 일자 다음 날부터, daily 0 채움 | F `ScreenUsageStatSupport.unusedScreens`·`sums`·`split`, S1 `daily` |
| U2-2 `avgDurationMs` 열람 1회당, `openCnt = 0` 이면 `null` | S2 |
| U2-3 동시 재전송 고유 제약 위반 허용 | 기록 서비스(기반) 범위. 이 문서와 무관 |
| U3-1 overview 에도 `unusedDays` | 기반 Task 2 `buildStatParams`. F Step 1 확인, S1 화면 시험이 고정. 화면은 기준 일수 칸을 개요·미사용 탭에서 보이고 KPI 문구도 그 값을 쓴다 |
| U3-2 placeholder "정확히 입력", 부서 없음 `-` | F `page.tsx` |
| U3-3 byUser 행 키 | 기반 `fetchByUser` 의 `rowKey`(`userId|deptCd`) 그대로 사용(S4) |
| U3-4 엑셀 `exportToExcel`(현재 탭 그리드) | F `page.tsx` + 탭 모듈 `toExport` |
| U3-5 이력 31일(차 ≤ 30) | 기반 Task 1 `checkHistoryPeriod`. F Step 1 확인, S6 시험이 고정 |
| U3-6 10,000행 안내 | S6 `historyLimitNotice` + `HistoryTab.tsx` GridPanel 제목 |
| U3-7 `unusedDays` 숫자, 빈 값이면 키 빼기, 서버 오류 `meta.success=false` 문구 | 기반 api.ts. F `page.tsx` 가 오류 문구를 그대로 알린다 |
| U3-8 `avgDurationMs` null → 빈 칸 | F `columns.ts` 의 `durationCol`(`formatDuration(null) === ""`), S2 시험 |
| U3-9 `test:unit` 스크립트 | 이 문서의 모든 vitest 명령 |

---

## 파일 구조와 소유

백엔드 메인: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/` (아래 `…/` 로 줄임)
백엔드 테스트: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/` (아래 `T/` 로 줄임)
화면: `src/frontend/m-mcm/page-components/csa/screenUsageStat/` (아래 `P/` 로 줄임)
화면 시험: `src/frontend/m-mcm/tests/csa/screenUsageStat/` (아래 `PT/` 로 줄임)

| 소유 | 파일 | 책임 |
|---|---|---|
| F | `…/dto/ScreenUsageStatRequest.java` | 통계 공통 파라미터 DTO |
| F | `…/service/ScreenUsageStatSupport.java` | 기간·조건 해석, 집계+원본 합산, 미사용 판정, 메뉴명·부서명·사용자명 해석, 묶음 합산기, 정렬 |
| F | `…/service/ScreenUsageStatService.java` | OASIS 퍼사드 — 6 action 을 쿼리 클래스로 넘긴다 |
| F(골격) → S1 | `…/service/ScreenUsageOverviewQuery.java` | overview |
| F(골격) → S2 | `…/service/ScreenUsageByScreenQuery.java` | byScreen |
| F(골격) → S3 | `…/service/ScreenUsageByDeptQuery.java` | byDept |
| F(골격) → S4 | `…/service/ScreenUsageByUserQuery.java` | byUser |
| F(골격) → S5 | `…/service/ScreenUsageUnusedQuery.java` | unused |
| F(골격) → S6 | `…/service/ScreenUsageHistoryQuery.java` | history |
| F | `src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn` | serviceTask 6개 |
| F | `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` (`allActions` 블록만) | action 6개 |
| F | `T/ScreenUsageOasisContractTest.java` (기반 Task 3 생성, F 가 테스트 2개 추가) | BPMN↔Java·allActions 대조 |
| F | `T/service/ScreenUsageStatJpaTestBase.java` | 슬라이스 공통 JPA 테스트 기반 |
| F | `T/service/ScreenUsageStatSupportJpaTest.java` | 공통 헬퍼 시험 |
| F | `T/service/ScreenUsageStatServiceTest.java` | 퍼사드 위임 시험 |
| S1 | `T/service/ScreenUsageOverviewQueryJpaTest.java` | |
| S2 | `T/service/ScreenUsageByScreenQueryJpaTest.java` | |
| S3 | `T/service/ScreenUsageByDeptQueryJpaTest.java` | |
| S4 | `T/service/ScreenUsageByUserQueryJpaTest.java` | |
| S5 | `T/service/ScreenUsageUnusedQueryJpaTest.java` | |
| S6 | `T/service/ScreenUsageHistoryQueryJpaTest.java` | |
| F | `P/page.tsx` | 검색 영역·상단 버튼·탭 머리줄·조회 흐름·엑셀 |
| F | `P/tabs/tab-contract.ts` | 탭 모듈·탭 화면 props 계약, 엑셀 열 변환, 파일 이름 |
| F | `P/tabs/tab-modules.ts` | `TAB_MODULES` 등록표 |
| F | `P/tabs/columns.ts` | 공용 열 함수와 `SCREEN_COLUMNS`(화면별·부서 상세 공용) |
| F(골격) → S1 | `P/tabs/overview-tab.ts`, `P/tabs/OverviewTab.tsx` | |
| F(골격) → S2 | `P/tabs/screen-tab.ts`, `P/tabs/ScreenTab.tsx` | |
| F(골격) → S3 | `P/tabs/dept-tab.ts`, `P/tabs/DeptTab.tsx` | |
| F(골격) → S4 | `P/tabs/user-tab.ts`, `P/tabs/UserTab.tsx` | |
| F(골격) → S5 | `P/tabs/unused-tab.ts`, `P/tabs/UnusedTab.tsx` | |
| F(골격) → S6 | `P/tabs/history-tab.ts`, `P/tabs/HistoryTab.tsx` | |
| F | `PT/support/fetch-mock.ts`, `PT/support/query.ts` | 시험 보조(시험 파일이 아니라 vitest 가 직접 돌리지 않는다) |
| F | `PT/tab-contract.test.ts` | |
| S1~S6 | `PT/overview-tab.test.ts`, `PT/screen-tab.test.ts`, `PT/dept-tab.test.ts`, `PT/user-tab.test.ts`, `PT/unused-tab.test.ts`, `PT/history-tab.test.ts` | |
| F | `src/frontend/m-mcm/lib/generated/page-registry.ts` | 생성기 출력 한 줄 |
| V | `src/backend/mcm-core/README.md` | |

`tabs/` 는 화면 폴더의 3단 하위라 페이지 레지스트리 생성기(깊이 1~2 의 `page.tsx` 만 수집)에 잡히지 않는다.

## 실행 순서

```
기반(U1 전체, U2 Task 1~5·8, U3 Task 1·2·4) 병합
  → Task F (한 워크트리, 순차)
  → Task S1 · S2 · S3 · S4 · S5 · S6 (각자 워크트리, 동시)
  → 병합
  → Task V
```

---
### Task F0: 기반 병합 확인 (F 착수 전, 코드 변경 없음)

슬라이스가 기대는 기반 결과를 확인한다. 하나라도 기대와 다르면 F 를 시작하지 말고 표의 "다르면" 대로 메인에 보고한다.

**Files:** 없음(읽기만)

**Interfaces:**
- Consumes (기반 U2 Task 1·2·3·4·5, 해당 계획에 적힌 그대로):
  - `ScreenUsageDayRepository`: `String findMaxUsageDt()`, `List<UsageSum> sumByPageUserDept(String fromDt, String toDt, String deptCd, String userId, String pageId)`, `List<DailySum> sumByDay(String fromDt, String toDt, String deptCd, String userId, String pageId)`, `List<PageLastUsed> findLastUsedDtByPage()`
  - `ScreenUsageLogRepository`: `List<ScreenUsageLog> findStartedBetween(LocalDateTime from, LocalDateTime to)`, `LocalDateTime findMinStartedAt()`, `List<ScreenUsageLog> findHistory(LocalDateTime from, LocalDateTime to, String userId, String deptCd, String pageId, Pageable pageable)`
  - `record UsageSum(String pageId, String userId, String deptCd, Long openCnt, Long segCnt, Long durationMs, String lastUsedDt)`, `record DailySum(String usageDt, Long openCnt, Long userCnt, Long durationMs)`, `record PageLastUsed(String pageId, String lastUsedDt)`
  - `ScreenUsageDay`: getter `usageDt, pageId, userId, deptCd, openCnt(Integer), segCnt(Integer), durationMs(Long)`
  - `ScreenUsageDates`(패키지 전용): `ZONE`, `format(LocalDate)`, `usageDt(LocalDateTime)`, `parseDt(String)`, `timestamp(LocalDateTime)`
  - `ScreenUsageAggregator`(패키지 전용): `NO_DEPT = "-"`, `sumByDayKey(List<ScreenUsageLog>)`, `normalizeDept(String)`
  - `ScreenUsageRollup(ScreenUsageLogRepository, ScreenUsageDayRepository, ScreenUsageDayWriter, Clock)`, `Result rollup()`
  - `ScreenMenuCatalog.load() : Map<String, MenuInfo>`, `record MenuInfo(String pageId, String menuNm, String menuPath, boolean viewable)`
  - 테스트 기반: `ScreenUsageJpaTestConfig`(`ScreenUsageDayWriter` 빈 포함), `UsageFixtures.log(String userId, String deptCd, String pageId, String startKind, LocalDateTime startedAt, long durationMs)`, `UsageFixtures.day(String usageDt, String pageId, String userId, String deptCd, int openCnt, int segCnt, long durationMs)`
  - `ScreenUsageOasisContractTest`(Task 3): `SERVICES`, `DATA_INITIALIZER`, `parse(Path)`, `processId(Document)`, `tasksByAction(Document)`, `property(Element, String)`
- Consumes (기반 U3 Task 1·2, 해당 계획에 적힌 그대로):
  - `types.ts`: `StatTab`, `StatAction`, `StatFilters`, 행 타입 `ScreenUsageOverview`·`ScreenUsageScreenRow`·`ScreenUsageDeptRow`·`ScreenUsageUserRow`·`ScreenUsageUnusedRow`·`ScreenUsageHistoryRow`, `ScreenUsageUserGridRow`, `StatData`, `emptyStatData()`, `emptyFilters()`, `TAB_LABEL`, `TAB_ITEMS`
  - `format.ts`: `HISTORY_MAX_DAYS`, `DEFAULT_UNUSED_DAYS`, `formatDuration`, `formatYmd`, `startKindLabel`, `parseUnusedDays`, `checkFilters`, `checkHistoryPeriod`, `toDailyPoints`, `toTopBars`, `toExportRows`
  - `api.ts`: `buildStatParams`, `statQueryKey`, `fetchOverview`, `fetchByScreen(q, deptCd?)`, `fetchByDept`, `fetchByUser`, `fetchUnused`, `fetchHistory`, `createTabRequestTracker<K>()`
- Produces: 아래 확인 결과

- [ ] **Step 1: 기반 파일이 있는지 본다**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && /usr/bin/git log --oneline -15
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && ls src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service src/frontend/m-mcm/page-components/csa/screenUsageStat src/frontend/m-mcm/tests/csa/screenUsageStat
```
Expected:
- service 폴더에 `ScreenUsageDates.java`, `ScreenUsageAggregator.java`, `ScreenUsageDayWriter.java`, `ScreenUsageRollup.java`, `ScreenMenuCatalog.java` 가 있다.
- 화면 폴더에 `types.ts`, `format.ts`, `api.ts` 가 있고 `page.tsx` 는 없다.
- 시험 폴더에 `format.test.ts`, `api.test.ts` 가 있다.

- [ ] **Step 2: 메인 결정이 기반에 반영됐는지 본다**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && grep -n 'test:unit' package.json
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && grep -n 'include' vitest.config.mts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && grep -n 'avgDurationMs' page-components/csa/screenUsageStat/types.ts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && grep -n 'unusedDays' page-components/csa/screenUsageStat/api.ts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && grep -n -A 6 'export function checkHistoryPeriod' page-components/csa/screenUsageStat/format.ts
```

| 확인 대상 | 기대값 | 다르면 |
|---|---|---|
| m-mcm 시험 스크립트 | `"test:unit": "vitest run"` | 이 문서의 `test:unit` 을 실제 이름으로 읽는다(보고만) |
| `vitest.config.mts` `include` | `tests/csa/screenUsageStat/*.test.ts` 를 포함(`tests/**/*.test.ts` 등) | 기반 `format.test.ts` 가 실제로 있는 폴더를 `PT/` 로 읽고, 이 문서의 모든 화면 시험 경로를 그 폴더로 바꾼다(보고) |
| `types.ts` `avgDurationMs` | `number \| null` | 보고만. 화면은 `formatDuration(null) === ""` 로 견딘다 |
| `buildStatParams` 의 `unusedDays` | `overview`·`unused` 두 탭에 싣는다 | **멈추고 보고.** S1 이 기대는 메인 결정 U3-1 |
| `checkHistoryPeriod` | 시작·종료일 포함 31일(날짜 차 ≤ 30)이면 `null`, 32일부터 문구 | **멈추고 보고.** S6 이 기대는 메인 결정 U3-5 |

- [ ] **Step 3: 기반 시험이 녹색인지 본다**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests 'com.dongkuk.dmes.mcm.screenusage.*'
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
```
Expected: 둘 다 PASS. 프런트는 `format.test.ts`·`api.test.ts` 2개 파일. 실패하면 F 를 시작하지 않고 메인에 보고한다.

---

### Task F1: 백엔드 기반 — DTO · 공통 헬퍼 · 쿼리 골격 · 퍼사드 · BPMN · allActions

**Files:**
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/dto/ScreenUsageStatRequest.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatSupport.java`
- Create (골격): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQuery.java`
- Create (골격): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQuery.java`
- Create (골격): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQuery.java`
- Create (골격): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQuery.java`
- Create (골격): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQuery.java`
- Create (골격): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQuery.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatService.java`
- Create: `src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn` (bpmn-tool 로 생성)
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java:325` (`allActions` 의 `"changeStatus"` 줄)
- Modify: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/ScreenUsageOasisContractTest.java` (기반 Task 3 생성 파일에 테스트 2개 추가)
- Create: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatJpaTestBase.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatSupportJpaTest.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatServiceTest.java`

**Interfaces:**
- Consumes: Task F0 의 기반 이름 전부. 기존 `SecUserRepository.findAllById`, `DeptInfoRepository.findAllById`, `SecUser.getUserId()/getUserNm()`, `DeptInfo.getDeptCd()/getDeptNm()`, `BusinessException(ErrorCode, String)`, `ErrorCode.REQUIRED_VALUE`·`INVALID_VALUE`.
- Produces (슬라이스가 쓰는 이름 — 모두 패키지 `com.dongkuk.dmes.mcm.screenusage.service`):
  - `ScreenUsageStatRequest` — getter/setter `fromDt, toDt, deptCd, userId, pageId : String`, `unusedDays : Integer` (C4)
  - `@Component public class ScreenUsageStatSupport`:
    - 상수 `DEFAULT_UNUSED_DAYS = 90`, `NO_MENU_NM = "(메뉴 없음)"`, `NO_DEPT_NM = "(부서 없음)"`
    - 공개 생성자 `(ScreenUsageDayRepository, ScreenUsageLogRepository, ScreenMenuCatalog, SecUserRepository, DeptInfoRepository)`, 테스트용 package-private 생성자는 끝에 `Clock`
    - `LocalDate today()`, `Map<String, MenuInfo> menus()`
    - `static Range range(ScreenUsageStatRequest)` — 누락 `REQUIRED_VALUE`, 형식·역전 `INVALID_VALUE`
    - `static Filter filter(ScreenUsageStatRequest)` — 공백이면 null, 값은 앞뒤 공백 제거
    - `Split split(Range)`, `List<UsageSum> sums(Range, Filter)`, `List<ScreenUsageDay> rawDays(LocalDate from, LocalDate to, Filter)`
    - `List<UnusedScreen> unusedScreens(Map<String, MenuInfo> menus, int unusedDays)` — 표시 메뉴 중 오늘 포함 최근 N일 이용 기록 없음, `menuPath`→`pageId` 순
    - `Map<String, String> userNames(Set<String>)`, `Map<String, String> deptNames(Set<String>)`
    - `static String deptName(String deptCd, Map<String, String> names)`, `static String menuNm(String pageId, Map<String, MenuInfo> menus)`, `static int unusedDays(ScreenUsageStatRequest)`
    - `static <T extends UsageTotals> Map<String, T> groupBy(List<UsageSum>, Function<UsageSum, String>, Supplier<T>)`
    - `static Comparator<Map<String, Object>> longDesc(String key)`, `static Comparator<Map<String, Object>> text(String key)`
    - `record Range(LocalDate from, LocalDate to)`, `record Filter(String deptCd, String userId, String pageId)` + `boolean matches(ScreenUsageDay)`, `record Split(LocalDate dayFrom, LocalDate dayTo, LocalDate rawFrom, LocalDate rawTo)` + `hasDay()`·`hasRaw()`, `record UnusedScreen(MenuInfo menu, String lastUsedDt)`
    - `static class UsageTotals` — 필드 `long openCnt`, `long durationMs`, `String lastUsedDt`, `final Set<String> users`, 재정의 가능한 `void add(UsageSum)`
  - 쿼리 클래스(퍼사드가 부르는 메서드 시그니처는 고정, 생성자는 아래 그대로 시작):
    - `ScreenUsageOverviewQuery(ScreenUsageStatSupport, ScreenUsageDayRepository)` — `Map<String, Object> overview(ScreenUsageStatRequest)`
    - `ScreenUsageByScreenQuery(ScreenUsageStatSupport)` — `List<Map<String, Object>> byScreen(ScreenUsageStatRequest)`
    - `ScreenUsageByDeptQuery(ScreenUsageStatSupport)` — `List<Map<String, Object>> byDept(ScreenUsageStatRequest)`
    - `ScreenUsageByUserQuery(ScreenUsageStatSupport, ScreenUsageLogRepository)` — `List<Map<String, Object>> byUser(ScreenUsageStatRequest)`
    - `ScreenUsageUnusedQuery(ScreenUsageStatSupport)` — `List<Map<String, Object>> unused(ScreenUsageStatRequest)`
    - `ScreenUsageHistoryQuery(ScreenUsageStatSupport, ScreenUsageLogRepository)` — `List<Map<String, Object>> history(ScreenUsageStatRequest)`
  - `@Service("screenUsageStatService") ScreenUsageStatService(overview, byScreen, byDept, byUser, unused, history 쿼리 순)` — 6 메서드, `@Transactional` 없음
  - OASIS 서비스 ID `screenUsageStat`, action → output `overview→result`, `byScreen→screens`, `byDept→depts`, `byUser→users`, `unused→unused`, `history→history`
  - PERM_ALL `allActions` 에 `overview, byScreen, byDept, byUser, unused, history` (U4 가 쓴다)
  - 테스트 기반 `abstract class ScreenUsageStatJpaTestBase` (테스트 패키지 `…screenusage.service`, package-private):
    - 상수 `SEOUL`, `NOW = 2026-10-03 10:00`, `PATH = "공통관리 > 시스템관리"`, 화면 `USER="csa/commUserMng"`, `MENU="csa/commMenuMng"`, `ROLE="csa/commRoleMng"`, `PERM="csa/commPermMng"`, `HIDDEN="csa/hiddenScreen"`
    - 필드 `logRepository`·`dayRepository`·`dayWriter`(autowired), `menuCatalog`·`secUserRepository`·`deptInfoRepository`(Mockito mock), `menus`(가변 맵), `support`
    - 기본 메뉴: USER "사용자 관리", MENU "메뉴 관리", ROLE "역할 관리"(표시), HIDDEN "숨김 화면"(표시 안 함). 사용자 userA "김철수", userB "이영희". 부서 D100 "생산관리팀"
    - `static ScreenUsageStatRequest req(String fromDt, String toDt)`, `ScreenUsageLog save(String userId, String deptCd, String pageId, String kind, LocalDateTime at, long ms)`, `void rollupAtTwoAm()`(10-03 02:00 집계 → 10-02 까지 확정), `void addMenu(String pageId, String menuNm, boolean viewable)`

- [ ] **Step 1: 테스트 기반 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatJpaTestBase.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 통계 슬라이스 공통 JPA 테스트 기반 — H2 저장소는 실제, 메뉴·사용자·부서는 mock, 시계는 2026-10-03 10:00 고정.
 * 쿼리 클래스는 하위 테스트가 {@code new} 로 만든다(ScreenUsageJpaTestConfig 는 고치지 않는다).
 * 슬라이스는 이 파일을 고치지 않는다 — 더 필요한 것이 있으면 메인에 보고한다.
 */
@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
abstract class ScreenUsageStatJpaTestBase {

    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    /** 오늘 = 2026-10-03, 지금 10:00 */
    static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 10, 0);
    static final String PATH = "공통관리 > 시스템관리";
    static final String USER = "csa/commUserMng";
    static final String MENU = "csa/commMenuMng";
    static final String ROLE = "csa/commRoleMng";
    static final String PERM = "csa/commPermMng";
    static final String HIDDEN = "csa/hiddenScreen";

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;
    @Autowired ScreenUsageDayWriter dayWriter;

    final ScreenMenuCatalog menuCatalog = mock(ScreenMenuCatalog.class);
    final SecUserRepository secUserRepository = mock(SecUserRepository.class);
    final DeptInfoRepository deptInfoRepository = mock(DeptInfoRepository.class);
    final Map<String, MenuInfo> menus = new LinkedHashMap<>();
    ScreenUsageStatSupport support;

    @BeforeEach
    void setUpBase() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
        menus.clear();
        addMenu(USER, "사용자 관리", true);
        addMenu(MENU, "메뉴 관리", true);
        addMenu(ROLE, "역할 관리", true);
        addMenu(HIDDEN, "숨김 화면", false);
        when(menuCatalog.load()).thenReturn(menus);
        when(secUserRepository.findAllById(any())).thenReturn(List.of(user("userA", "김철수"), user("userB", "이영희")));
        when(deptInfoRepository.findAllById(any())).thenReturn(List.of(dept("D100", "생산관리팀")));
        support = new ScreenUsageStatSupport(dayRepository, logRepository, menuCatalog, secUserRepository,
                deptInfoRepository, Clock.fixed(NOW.atZone(SEOUL).toInstant(), SEOUL));
    }

    /** menuCatalog.load() 가 돌려주는 가변 맵에 메뉴를 더한다(같은 맵 참조라 다시 스텁하지 않아도 된다). */
    void addMenu(String pageId, String menuNm, boolean viewable) {
        menus.put(pageId, new MenuInfo(pageId, menuNm, PATH, viewable));
    }

    static SecUser user(String id, String nm) {
        SecUser u = new SecUser();
        u.setUserId(id);
        u.setUserNm(nm);
        return u;
    }

    static DeptInfo dept(String cd, String nm) {
        DeptInfo d = new DeptInfo();
        d.setDeptCd(cd);
        d.setDeptNm(nm);
        return d;
    }

    static ScreenUsageStatRequest req(String fromDt, String toDt) {
        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        r.setFromDt(fromDt);
        r.setToDt(toDt);
        return r;
    }

    ScreenUsageLog save(String userId, String deptCd, String pageId, String kind, LocalDateTime at, long ms) {
        return logRepository.save(log(userId, deptCd, pageId, kind, at, ms));
    }

    /** 2026-10-03 02:00 집계 → 10-02 까지 확정. */
    void rollupAtTwoAm() {
        new ScreenUsageRollup(logRepository, dayRepository, dayWriter,
                Clock.fixed(LocalDateTime.of(2026, 10, 3, 2, 0).atZone(SEOUL).toInstant(), SEOUL)).rollup();
    }
}
```

- [ ] **Step 2: 공통 헬퍼 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatSupportJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Filter;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Range;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UnusedScreen;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** 공통 헬퍼 — 기간 검증, 집계+원본 합산 경계(Review Focus 4), 완전 일치 조건(2), 미사용 판정, 이름 해석(1). */
class ScreenUsageStatSupportJpaTest extends ScreenUsageStatJpaTestBase {

    private List<UsageSum> sums(ScreenUsageStatRequest r) {
        return support.sums(ScreenUsageStatSupport.range(r), ScreenUsageStatSupport.filter(r));
    }

    @Test
    @DisplayName("기간 검증 — 누락은 REQUIRED_VALUE, 역전·형식 오류는 INVALID_VALUE")
    void validatesRange() {
        assertThat(assertThrows(BusinessException.class, () -> ScreenUsageStatSupport.range(req(null, "20261003")))
                .getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertThat(assertThrows(BusinessException.class, () -> ScreenUsageStatSupport.range(req("20261003", " ")))
                .getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertThat(assertThrows(BusinessException.class, () -> ScreenUsageStatSupport.range(req("20261003", "20261002")))
                .getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(assertThrows(BusinessException.class, () -> ScreenUsageStatSupport.range(req("2026-10-01", "20261003")))
                .getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(ScreenUsageStatSupport.range(req(" 20261001 ", "20261003")))
                .isEqualTo(new Range(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 3)));
    }

    @Test
    @DisplayName("조건은 공백이면 null, 값은 앞뒤 공백만 지운다")
    void filterTrims() {
        ScreenUsageStatRequest r = req("20261001", "20261003");
        r.setDeptCd(" ");
        r.setUserId(" userA ");
        assertThat(ScreenUsageStatSupport.filter(r)).isEqualTo(new Filter(null, "userA", null));
    }

    @Test
    @DisplayName("집계된 날은 집계 테이블, 그 다음 날부터(오늘 포함)는 원본 — 겹치지 않는다")
    void sumsSplitAggregatedAndRaw() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 10, 0), 120_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", USER, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);

        assertThat(sums(req("20261002", "20261003"))).containsExactlyInAnyOrder(
                new UsageSum(USER, "userA", "D100", 1L, 1L, 60_000L, "20261002"),
                new UsageSum(USER, "userB", "D200", 1L, 1L, 120_000L, "20261002"),
                new UsageSum(USER, "userA", "D100", 1L, 2L, 60_000L, "20261003"));
        assertThat(sums(req("20261003", "20261003")))
                .containsExactly(new UsageSum(USER, "userA", "D100", 1L, 2L, 60_000L, "20261003"));
        assertThat(sums(req("20261002", "20261002"))).hasSize(2);
    }

    @Test
    @DisplayName("02시 집계 전에도 집계되지 않은 어제분은 원본에서 더해진다")
    void beforeRollupYesterdayStillCounted() {
        dayRepository.save(day("20261001", USER, "userA", "D100", 1, 1, 10_000)); // 10-01 까지만 집계됨
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 15, 0), 20_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 0, 30), 5_000);

        assertThat(sums(req("20261001", "20261003")))
                .extracting(UsageSum::userId, UsageSum::lastUsedDt, UsageSum::durationMs)
                .containsExactlyInAnyOrder(
                        tuple("userA", "20261001", 10_000L),
                        tuple("userA", "20261002", 20_000L),
                        tuple("userB", "20261003", 5_000L));
    }

    @Test
    @DisplayName("조건은 완전 일치 — 앞부분 일치는 걸리지 않고, deptCd '-' 는 집계 '-'·원본 NULL 만 거른다")
    void exactMatchFilters() {
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userAB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();                                                                 // 집계 deptCd '-'
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);   // 원본 NULL
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 1_000);

        ScreenUsageStatRequest noDept = req("20261002", "20261003");
        noDept.setDeptCd("-");
        assertThat(sums(noDept)).extracting(UsageSum::userId, UsageSum::deptCd, UsageSum::lastUsedDt)
                .containsExactlyInAnyOrder(tuple("userA", "-", "20261002"), tuple("userA", "-", "20261003"));

        ScreenUsageStatRequest userPrefix = req("20261002", "20261003");
        userPrefix.setUserId("user");
        assertThat(sums(userPrefix)).isEmpty();

        ScreenUsageStatRequest pagePrefix = req("20261002", "20261003");
        pagePrefix.setPageId("csa/commUser");
        assertThat(sums(pagePrefix)).isEmpty();

        ScreenUsageStatRequest userA = req("20261002", "20261003");
        userA.setUserId("userA");
        assertThat(sums(userA)).hasSize(3).extracting(UsageSum::userId).containsOnly("userA");
    }

    @Test
    @DisplayName("미사용 판정 — 표시 메뉴 중 오늘 포함 최근 N일 이용 기록 없음, 창 시작일 당일은 사용, 원본 SWITCH 도 이용")
    void unusedScreensRule() {
        addMenu(PERM, "권한 관리", true);
        // 오늘 10-03, 90일 창 시작 = 2026-07-06
        dayRepository.save(day("20260706", USER, "userA", "D100", 1, 1, 1_000)); // 창 시작일 → 사용
        dayRepository.save(day("20260705", MENU, "userA", "D100", 1, 1, 1_000)); // 창 밖 → 미사용
        save("userA", "D100", PERM, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000); // 원본·SWITCH → 사용

        assertThat(support.unusedScreens(support.menus(), 90))
                .extracting(u -> u.menu().pageId(), UnusedScreen::lastUsedDt)
                .containsExactly(tuple(MENU, "20260705"), tuple(ROLE, null)); // HIDDEN 은 표시 안 함이라 제외
        assertThat(support.unusedScreens(support.menus(), 89))
                .extracting(u -> u.menu().pageId())
                .containsExactly(MENU, ROLE, USER);
    }

    @Test
    @DisplayName("이름 해석 — 메뉴 없음·부서 없음 문구, 부서 '-' 는 조회하지 않음, 기준 일수 기본 90")
    void namesAndMissing() {
        Map<String, String> deptNames = support.deptNames(Set.of("-", "D100"));

        assertThat(deptNames).containsExactly(Map.entry("D100", "생산관리팀"));
        assertThat(ScreenUsageStatSupport.deptName("-", deptNames)).isEqualTo("(부서 없음)");
        assertThat(ScreenUsageStatSupport.deptName("D999", deptNames)).isNull();
        assertThat(ScreenUsageStatSupport.menuNm("old/removedScreen", support.menus())).isEqualTo("(메뉴 없음)");
        assertThat(ScreenUsageStatSupport.menuNm(USER, support.menus())).isEqualTo("사용자 관리");
        assertThat(support.userNames(Set.of("userA"))).containsEntry("userA", "김철수");
        assertThat(support.userNames(Set.of())).isEmpty();

        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        assertThat(ScreenUsageStatSupport.unusedDays(r)).isEqualTo(90);
        r.setUnusedDays(0);
        assertThat(ScreenUsageStatSupport.unusedDays(r)).isEqualTo(90);
        r.setUnusedDays(30);
        assertThat(ScreenUsageStatSupport.unusedDays(r)).isEqualTo(30);
    }

    @Test
    @DisplayName("묶음 합산 — 열람·시간 합계, 이용자 수(중복 제거), 마지막 이용일 최대값")
    void groupByTotals() {
        Map<String, UsageTotals> byPage = ScreenUsageStatSupport.groupBy(List.of(
                        new UsageSum(USER, "userA", "D100", 1L, 1L, 1_000L, "20261001"),
                        new UsageSum(USER, "userA", "-", 2L, 2L, 2_000L, "20261003"),
                        new UsageSum(USER, "userB", "D100", 0L, 1L, 500L, "20261002"),
                        new UsageSum(MENU, "userA", "D100", 1L, 1L, 100L, "20261002")),
                UsageSum::pageId, UsageTotals::new);

        assertThat(byPage).containsOnlyKeys(USER, MENU);
        UsageTotals user = byPage.get(USER);
        assertThat(user.openCnt).isEqualTo(3L);
        assertThat(user.durationMs).isEqualTo(3_500L);
        assertThat(user.users).containsExactlyInAnyOrder("userA", "userB");
        assertThat(user.lastUsedDt).isEqualTo("20261003");
    }
}
```

- [ ] **Step 3: 퍼사드 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatServiceTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 퍼사드는 action 하나를 쿼리 클래스 하나로 그대로 넘긴다(슬라이스 병합 뒤에도 성립). */
class ScreenUsageStatServiceTest {

    private final ScreenUsageOverviewQuery overview = mock(ScreenUsageOverviewQuery.class);
    private final ScreenUsageByScreenQuery byScreen = mock(ScreenUsageByScreenQuery.class);
    private final ScreenUsageByDeptQuery byDept = mock(ScreenUsageByDeptQuery.class);
    private final ScreenUsageByUserQuery byUser = mock(ScreenUsageByUserQuery.class);
    private final ScreenUsageUnusedQuery unused = mock(ScreenUsageUnusedQuery.class);
    private final ScreenUsageHistoryQuery history = mock(ScreenUsageHistoryQuery.class);
    private final ScreenUsageStatService service =
            new ScreenUsageStatService(overview, byScreen, byDept, byUser, unused, history);

    @Test
    @DisplayName("6개 action 을 각 쿼리 클래스로 넘기고 결과를 그대로 돌려준다")
    void delegates() {
        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        Map<String, Object> ov = Map.of("totalOpenCnt", 1L);
        List<Map<String, Object>> s = List.of(Map.of("pageId", "a"));
        List<Map<String, Object>> d = List.of(Map.of("deptCd", "b"));
        List<Map<String, Object>> u = List.of(Map.of("userId", "c"));
        List<Map<String, Object>> n = List.of(Map.of("pageId", "d"));
        List<Map<String, Object>> h = List.of(Map.of("usageId", "e"));
        when(overview.overview(r)).thenReturn(ov);
        when(byScreen.byScreen(r)).thenReturn(s);
        when(byDept.byDept(r)).thenReturn(d);
        when(byUser.byUser(r)).thenReturn(u);
        when(unused.unused(r)).thenReturn(n);
        when(history.history(r)).thenReturn(h);

        assertThat(service.overview(r)).isSameAs(ov);
        assertThat(service.byScreen(r)).isSameAs(s);
        assertThat(service.byDept(r)).isSameAs(d);
        assertThat(service.byUser(r)).isSameAs(u);
        assertThat(service.unused(r)).isSameAs(n);
        assertThat(service.history(r)).isSameAs(h);
    }

    @Test
    @DisplayName("빈 이름은 screenUsageStatService 이고 @Transactional 이 없다 (6-B-1)")
    void beanContract() {
        assertThat(ScreenUsageStatService.class.getAnnotation(Service.class).value()).isEqualTo("screenUsageStatService");
        assertThat(ScreenUsageStatService.class.isAnnotationPresent(Transactional.class)).isFalse();
    }
}
```

- [ ] **Step 4: 계약 테스트 2개 추가**

`ScreenUsageOasisContractTest.java` 에 import `com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest`, `com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatService`, `java.nio.file.Files`, `java.util.LinkedHashSet`, `java.util.Set`, `java.util.regex.Matcher`, `java.util.regex.Pattern` 를 더하고(이미 있는 import 는 다시 넣지 않는다), `recordBpmn()` 바로 뒤에 아래 두 테스트를 넣는다.

```java
    @Test
    @DisplayName("screenUsageStat.bpmn 은 6개 action 을 C4 output 과 ScreenUsageStatRequest dto 로 보낸다")
    void statBpmn() throws Exception {
        Document doc = parse(SERVICES.resolve("csa/screenUsageStat.bpmn"));
        assertThat(processId(doc)).isEqualTo("screenUsageStat");

        Map<String, String> expectedOutput = new LinkedHashMap<>();
        expectedOutput.put("overview", "result");
        expectedOutput.put("byScreen", "screens");
        expectedOutput.put("byDept", "depts");
        expectedOutput.put("byUser", "users");
        expectedOutput.put("unused", "unused");
        expectedOutput.put("history", "history");

        Map<String, Element> tasks = tasksByAction(doc);
        assertThat(tasks.keySet()).containsExactlyInAnyOrderElementsOf(expectedOutput.keySet());
        for (Map.Entry<String, String> e : expectedOutput.entrySet()) {
            Element task = tasks.get(e.getKey());
            assertThat(task.getAttribute("camunda:class")).as(e.getKey()).isEqualTo("screenUsageStatService");
            assertThat(property(task, "method")).as(e.getKey()).isEqualTo(e.getKey());
            assertThat(property(task, "output")).as(e.getKey()).isEqualTo(e.getValue());
            assertThat(property(task, "dto")).as(e.getKey()).isEqualTo(ScreenUsageStatRequest.class.getName());
            assertThat(property(task, "grid")).as(e.getKey()).isNull();
            ScreenUsageStatService.class.getMethod(e.getKey(), ScreenUsageStatRequest.class);
        }
        assertThat(ScreenUsageStatService.class.getAnnotation(Service.class).value()).isEqualTo("screenUsageStatService");
        assertThat(ScreenUsageStatService.class.isAnnotationPresent(Transactional.class)).isFalse();
    }

    @Test
    @DisplayName("PERM_ALL allActions 에 통계 6개 action 이 있다 (없으면 SYSADMIN 도 403)")
    void permAllContainsStatActions() throws Exception {
        String source = Files.readString(DATA_INITIALIZER);
        int from = source.indexOf("String allActions = String.join(\",\",");
        assertThat(from).as("allActions 선언").isNotNegative();
        String block = source.substring(from, source.indexOf(");", from));
        Set<String> actions = new LinkedHashSet<>();
        Matcher m = Pattern.compile("\"([^\"]+)\"").matcher(block);
        while (m.find()) {
            actions.add(m.group(1));
        }

        assertThat(actions).contains("overview", "byScreen", "byDept", "byUser", "unused", "history");
    }
```

- [ ] **Step 5: 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupportJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: FAIL — `compileTestJava` 에서 `cannot find symbol: class ScreenUsageStatRequest`, `ScreenUsageStatSupport`, `ScreenUsageStatService`, `ScreenUsageOverviewQuery` 등.

- [ ] **Step 6: DTO 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/dto/ScreenUsageStatRequest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.dto;

/**
 * 화면 사용 통계 공통 파라미터 (계약 C4). OASIS params → DTO 바인딩(기존 *Request 처럼 기본 생성자 + setter).
 * meta.userId 는 cactus 가 params 에 넣지 않으므로 {@code userId} 는 관리자가 고른 조회 조건이다.
 */
public class ScreenUsageStatRequest {

    /** yyyyMMdd (unused 제외 필수) */
    private String fromDt;
    /** yyyyMMdd (unused 제외 필수) */
    private String toDt;
    /** 부서 조건(완전 일치) — '-' 는 부서 없음 */
    private String deptCd;
    /** 사용자 조건(완전 일치) */
    private String userId;
    /** 화면 조건(완전 일치) */
    private String pageId;
    /** overview·unused 의 미사용 기준 일수, 기본 90 */
    private Integer unusedDays;

    public ScreenUsageStatRequest() {}

    public String getFromDt() { return fromDt; }
    public void setFromDt(String fromDt) { this.fromDt = fromDt; }
    public String getToDt() { return toDt; }
    public void setToDt(String toDt) { this.toDt = toDt; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public Integer getUnusedDays() { return unusedDays; }
    public void setUnusedDays(Integer unusedDays) { this.unusedDays = unusedDays; }
}
```

- [ ] **Step 7: 공통 헬퍼 구현**

U2 Task 6 서비스 코드의 합산·이름·값 객체 부분을 그대로 옮기고, 미사용 판정과 묶음 합산기를 여러 탭이 쓰도록 꺼냈다.

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatSupport.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.PageLastUsed;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * 화면 사용 통계 탭 쿼리들이 함께 쓰는 헬퍼 (설계 4.5, 계약 C4).
 *
 * <p>출처 분할: 집계 테이블 최대 일자(MAX USAGE_DT)까지는 {@code TB_SEC_SCREEN_USAGE_DAY} 를 JPQL GROUP BY 로,
 * 그 다음 날부터 조회 종료일까지(오늘 포함)는 원본을 같은 키로 Java 합산해 더한다. 두 구간은 겹치지 않아 이중 집계가 없고,
 * 02:00 집계 전(00:00~02:00)에도 어제분이 빠지지 않는다.
 *
 * <p>조건(deptCd·userId·pageId)은 완전 일치다. deptCd '-' 는 집계 '-' 와 원본 NULL 만 거른다.
 * 메뉴에 없는 pageId 는 "(메뉴 없음)", 부서 없음은 deptCd "-" / deptNm "(부서 없음)".
 * 슬라이스(탭 쿼리)는 이 클래스를 고치지 않는다.
 */
@Component
public class ScreenUsageStatSupport {

    static final int DEFAULT_UNUSED_DAYS = 90;
    static final String NO_MENU_NM = "(메뉴 없음)";
    static final String NO_DEPT_NM = "(부서 없음)";

    private final ScreenUsageDayRepository dayRepository;
    private final ScreenUsageLogRepository logRepository;
    private final ScreenMenuCatalog menuCatalog;
    private final SecUserRepository secUserRepository;
    private final DeptInfoRepository deptInfoRepository;
    private final Clock clock;

    @Autowired
    public ScreenUsageStatSupport(ScreenUsageDayRepository dayRepository,
                                  ScreenUsageLogRepository logRepository,
                                  ScreenMenuCatalog menuCatalog,
                                  SecUserRepository secUserRepository,
                                  DeptInfoRepository deptInfoRepository) {
        this(dayRepository, logRepository, menuCatalog, secUserRepository, deptInfoRepository,
                Clock.system(ScreenUsageDates.ZONE));
    }

    ScreenUsageStatSupport(ScreenUsageDayRepository dayRepository,
                           ScreenUsageLogRepository logRepository,
                           ScreenMenuCatalog menuCatalog,
                           SecUserRepository secUserRepository,
                           DeptInfoRepository deptInfoRepository,
                           Clock clock) {
        this.dayRepository = dayRepository;
        this.logRepository = logRepository;
        this.menuCatalog = menuCatalog;
        this.secUserRepository = secUserRepository;
        this.deptInfoRepository = deptInfoRepository;
        this.clock = clock;
    }

    // ───────────────────────────────────────────── 기간·조건

    LocalDate today() {
        return LocalDate.now(clock);
    }

    Map<String, MenuInfo> menus() {
        return menuCatalog.load();
    }

    static Range range(ScreenUsageStatRequest request) {
        return Range.of(request);
    }

    static Filter filter(ScreenUsageStatRequest request) {
        return Filter.of(request);
    }

    static int unusedDays(ScreenUsageStatRequest request) {
        Integer v = request.getUnusedDays();
        return v == null || v <= 0 ? DEFAULT_UNUSED_DAYS : v;
    }

    // ───────────────────────────────────────────── 합산

    /** (화면, 사용자, 부서) 합계 — 집계분 + 미집계 원본분(일자별 행). 같은 키가 양쪽에 있어도 상위 묶음에서 더해진다. */
    List<UsageSum> sums(Range range, Filter filter) {
        Split split = split(range);
        List<UsageSum> out = new ArrayList<>();
        if (split.hasDay()) {
            out.addAll(dayRepository.sumByPageUserDept(
                    ScreenUsageDates.format(split.dayFrom()), ScreenUsageDates.format(split.dayTo()),
                    filter.deptCd(), filter.userId(), filter.pageId()));
        }
        if (split.hasRaw()) {
            for (ScreenUsageDay d : rawDays(split.rawFrom(), split.rawTo(), filter)) {
                out.add(new UsageSum(d.getPageId(), d.getUserId(), d.getDeptCd(),
                        d.getOpenCnt().longValue(), d.getSegCnt().longValue(), d.getDurationMs(), d.getUsageDt()));
            }
        }
        return out;
    }

    /** 원본 [from, to] 일자를 집계 키(일자·화면·사용자·부서)로 합산하고 조건으로 거른다. */
    List<ScreenUsageDay> rawDays(LocalDate from, LocalDate to, Filter filter) {
        List<ScreenUsageLog> logs = logRepository.findStartedBetween(from.atStartOfDay(), to.plusDays(1).atStartOfDay());
        return ScreenUsageAggregator.sumByDayKey(logs).stream().filter(filter::matches).toList();
    }

    /** 조회 기간을 [집계 테이블 구간] + [원본 구간] 으로 겹치지 않게 나눈다. */
    Split split(Range range) {
        String maxDt = dayRepository.findMaxUsageDt();
        if (maxDt == null) {
            return new Split(null, null, range.from(), range.to());
        }
        LocalDate aggregatedTo = ScreenUsageDates.parseDt(maxDt);
        LocalDate dayTo = range.to().isBefore(aggregatedTo) ? range.to() : aggregatedTo;
        LocalDate rawFrom = range.from().isAfter(aggregatedTo) ? range.from() : aggregatedTo.plusDays(1);
        boolean hasDay = !dayTo.isBefore(range.from());
        boolean hasRaw = !rawFrom.isAfter(range.to());
        return new Split(hasDay ? range.from() : null, hasDay ? dayTo : null,
                hasRaw ? rawFrom : null, hasRaw ? range.to() : null);
    }

    /** 키별 묶음 합산. 순서는 처음 나온 순서(LinkedHashMap). */
    static <T extends UsageTotals> Map<String, T> groupBy(List<UsageSum> sums, Function<UsageSum, String> key,
                                                          Supplier<T> factory) {
        Map<String, T> out = new LinkedHashMap<>();
        for (UsageSum s : sums) {
            out.computeIfAbsent(key.apply(s), k -> factory.get()).add(s);
        }
        return out;
    }

    // ───────────────────────────────────────────── 미사용

    /**
     * 미사용 화면 — 표시 메뉴(viewable) 중 오늘 포함 최근 {@code unusedDays} 일 동안 이용 기록(구간 종류 무관)이 없는 화면.
     * lastUsedDt 는 전체 기간 마지막 이용일(없으면 null). 정렬은 메뉴 경로 → pageId.
     */
    List<UnusedScreen> unusedScreens(Map<String, MenuInfo> menus, int unusedDays) {
        LocalDate today = today();
        String windowStart = ScreenUsageDates.format(today.minusDays(unusedDays - 1L)); // 오늘 포함 최근 N일
        Map<String, String> lastUsed = lastUsedByPage(today);
        List<UnusedScreen> out = new ArrayList<>();
        for (MenuInfo menu : menus.values()) {
            if (!menu.viewable()) {
                continue;
            }
            String last = lastUsed.get(menu.pageId());
            if (last != null && last.compareTo(windowStart) >= 0) {
                continue;
            }
            out.add(new UnusedScreen(menu, last));
        }
        out.sort(Comparator.comparing((UnusedScreen u) -> u.menu().menuPath(),
                        Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(u -> u.menu().pageId()));
        return out;
    }

    /** 화면별 마지막 이용일(전체 기간) — 집계분 MAX + 미집계 원본의 시작 일자. 구간 종류와 무관. */
    private Map<String, String> lastUsedByPage(LocalDate today) {
        Map<String, String> last = new HashMap<>();
        for (PageLastUsed p : dayRepository.findLastUsedDtByPage()) {
            last.put(p.pageId(), p.lastUsedDt());
        }
        String maxDt = dayRepository.findMaxUsageDt();
        LocalDate rawFrom;
        if (maxDt != null) {
            rawFrom = ScreenUsageDates.parseDt(maxDt).plusDays(1);
        } else {
            LocalDateTime min = logRepository.findMinStartedAt();
            rawFrom = min == null ? null : min.toLocalDate();
        }
        if (rawFrom != null && !rawFrom.isAfter(today)) {
            for (ScreenUsageLog l : logRepository.findStartedBetween(rawFrom.atStartOfDay(), today.plusDays(1).atStartOfDay())) {
                last.merge(l.getPageId(), ScreenUsageDates.usageDt(l.getStartedAt()),
                        (a, b) -> a.compareTo(b) >= 0 ? a : b);
            }
        }
        return last;
    }

    // ───────────────────────────────────────────── 이름

    Map<String, String> userNames(Set<String> userIds) {
        Map<String, String> out = new HashMap<>();
        if (userIds.isEmpty()) {
            return out;
        }
        for (SecUser u : secUserRepository.findAllById(userIds)) {
            out.put(u.getUserId(), u.getUserNm());
        }
        return out;
    }

    /** 부서코드 → 부서명. '-'(부서 없음)·null 은 조회하지 않는다. */
    Map<String, String> deptNames(Set<String> deptCds) {
        Set<String> codes = deptCds.stream()
                .filter(c -> c != null && !ScreenUsageAggregator.NO_DEPT.equals(c))
                .collect(Collectors.toSet());
        Map<String, String> out = new HashMap<>();
        if (codes.isEmpty()) {
            return out;
        }
        for (DeptInfo d : deptInfoRepository.findAllById(codes)) {
            out.put(d.getDeptCd(), d.getDeptNm());
        }
        return out;
    }

    static String deptName(String deptCd, Map<String, String> names) {
        return ScreenUsageAggregator.NO_DEPT.equals(deptCd) ? NO_DEPT_NM : names.get(deptCd);
    }

    static String menuNm(String pageId, Map<String, MenuInfo> menus) {
        MenuInfo m = menus.get(pageId);
        return m != null ? m.menuNm() : NO_MENU_NM;
    }

    // ───────────────────────────────────────────── 정렬

    static Comparator<Map<String, Object>> longDesc(String key) {
        return Comparator.comparing((Map<String, Object> r) -> (Long) r.get(key)).reversed();
    }

    static Comparator<Map<String, Object>> text(String key) {
        return Comparator.comparing((Map<String, Object> r) -> (String) r.get(key),
                Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    // ───────────────────────────────────────────── 값 객체

    record Range(LocalDate from, LocalDate to) {
        static Range of(ScreenUsageStatRequest r) {
            LocalDate from = parse(r.getFromDt(), "fromDt");
            LocalDate to = parse(r.getToDt(), "toDt");
            if (from.isAfter(to)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "조회 시작일(fromDt)이 종료일(toDt)보다 늦습니다.");
            }
            return new Range(from, to);
        }

        private static LocalDate parse(String value, String name) {
            if (value == null || value.isBlank()) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, name + " 는 필수입니다.");
            }
            try {
                return ScreenUsageDates.parseDt(value.trim());
            } catch (DateTimeParseException e) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, name + " 는 yyyyMMdd 형식이어야 합니다: " + value);
            }
        }
    }

    record Filter(String deptCd, String userId, String pageId) {
        static Filter of(ScreenUsageStatRequest r) {
            return new Filter(blankToNull(r.getDeptCd()), blankToNull(r.getUserId()), blankToNull(r.getPageId()));
        }

        /** 원본 합산 행 거르기 — 합산 행의 deptCd 는 이미 '-' 로 정규화돼 있어 '-' 조건이 원본 NULL 을 잡는다. */
        boolean matches(ScreenUsageDay d) {
            return (deptCd == null || deptCd.equals(d.getDeptCd()))
                    && (userId == null || userId.equals(d.getUserId()))
                    && (pageId == null || pageId.equals(d.getPageId()));
        }
    }

    record Split(LocalDate dayFrom, LocalDate dayTo, LocalDate rawFrom, LocalDate rawTo) {
        boolean hasDay() { return dayFrom != null; }
        boolean hasRaw() { return rawFrom != null; }
    }

    record UnusedScreen(MenuInfo menu, String lastUsedDt) {}

    /** 화면·부서·사용자 공통 합산기. 탭 쿼리가 상속해 탭 전용 누적을 더한다. */
    static class UsageTotals {
        long openCnt;
        long durationMs;
        String lastUsedDt;
        final Set<String> users = new HashSet<>();

        void add(UsageSum s) {
            openCnt += s.openCnt();
            durationMs += s.durationMs();
            users.add(s.userId());
            if (lastUsedDt == null || s.lastUsedDt().compareTo(lastUsedDt) > 0) {
                lastUsedDt = s.lastUsedDt();
            }
        }
    }
}
```

- [ ] **Step 8: 쿼리 골격 6개 구현**

골격은 빈 결과만 돌려준다. 생성자와 공개 메서드 시그니처는 슬라이스가 그대로 쓴다.

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/** action=overview → data.result. 슬라이스 S1 이 채운다(골격). */
@Component
public class ScreenUsageOverviewQuery {

    private final ScreenUsageStatSupport support;
    private final ScreenUsageDayRepository dayRepository;

    public ScreenUsageOverviewQuery(ScreenUsageStatSupport support, ScreenUsageDayRepository dayRepository) {
        this.support = support;
        this.dayRepository = dayRepository;
    }

    public Map<String, Object> overview(ScreenUsageStatRequest request) {
        return new LinkedHashMap<>();
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=byScreen → grids.screens. 슬라이스 S2 가 채운다(골격). */
@Component
public class ScreenUsageByScreenQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageByScreenQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> byScreen(ScreenUsageStatRequest request) {
        return List.of();
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=byDept → grids.depts. 슬라이스 S3 이 채운다(골격). */
@Component
public class ScreenUsageByDeptQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageByDeptQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> byDept(ScreenUsageStatRequest request) {
        return List.of();
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=byUser → grids.users. 슬라이스 S4 가 채운다(골격). */
@Component
public class ScreenUsageByUserQuery {

    private final ScreenUsageStatSupport support;
    private final ScreenUsageLogRepository logRepository;

    public ScreenUsageByUserQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository) {
        this.support = support;
        this.logRepository = logRepository;
    }

    public List<Map<String, Object>> byUser(ScreenUsageStatRequest request) {
        return List.of();
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=unused → grids.unused. 슬라이스 S5 가 채운다(골격). */
@Component
public class ScreenUsageUnusedQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageUnusedQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> unused(ScreenUsageStatRequest request) {
        return List.of();
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=history → grids.history. 슬라이스 S6 이 채운다(골격). */
@Component
public class ScreenUsageHistoryQuery {

    private final ScreenUsageStatSupport support;
    private final ScreenUsageLogRepository logRepository;

    public ScreenUsageHistoryQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository) {
        this.support = support;
        this.logRepository = logRepository;
    }

    public List<Map<String, Object>> history(ScreenUsageStatRequest request) {
        return List.of();
    }
}
```

- [ ] **Step 9: 퍼사드 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatService.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 화면 사용 통계 조회 — OASIS {@code screenUsageStat} (설계 4.5, 계약 C4) 퍼사드.
 * action 하나를 탭별 쿼리 클래스 하나로 넘기기만 한다. 탭 구현은 각 쿼리 클래스(슬라이스 S1~S6) 몫이다.
 * {@code @Transactional} 미부착 — OASIS 진입점(6-B-1).
 */
@Service("screenUsageStatService")
public class ScreenUsageStatService {

    private final ScreenUsageOverviewQuery overviewQuery;
    private final ScreenUsageByScreenQuery byScreenQuery;
    private final ScreenUsageByDeptQuery byDeptQuery;
    private final ScreenUsageByUserQuery byUserQuery;
    private final ScreenUsageUnusedQuery unusedQuery;
    private final ScreenUsageHistoryQuery historyQuery;

    public ScreenUsageStatService(ScreenUsageOverviewQuery overviewQuery,
                                  ScreenUsageByScreenQuery byScreenQuery,
                                  ScreenUsageByDeptQuery byDeptQuery,
                                  ScreenUsageByUserQuery byUserQuery,
                                  ScreenUsageUnusedQuery unusedQuery,
                                  ScreenUsageHistoryQuery historyQuery) {
        this.overviewQuery = overviewQuery;
        this.byScreenQuery = byScreenQuery;
        this.byDeptQuery = byDeptQuery;
        this.byUserQuery = byUserQuery;
        this.unusedQuery = unusedQuery;
        this.historyQuery = historyQuery;
    }

    /** action=overview → data.result */
    public Map<String, Object> overview(ScreenUsageStatRequest request) {
        return overviewQuery.overview(request);
    }

    /** action=byScreen → grids.screens */
    public List<Map<String, Object>> byScreen(ScreenUsageStatRequest request) {
        return byScreenQuery.byScreen(request);
    }

    /** action=byDept → grids.depts */
    public List<Map<String, Object>> byDept(ScreenUsageStatRequest request) {
        return byDeptQuery.byDept(request);
    }

    /** action=byUser → grids.users */
    public List<Map<String, Object>> byUser(ScreenUsageStatRequest request) {
        return byUserQuery.byUser(request);
    }

    /** action=unused → grids.unused (기간 파라미터 무시) */
    public List<Map<String, Object>> unused(ScreenUsageStatRequest request) {
        return unusedQuery.unused(request);
    }

    /** action=history → grids.history */
    public List<Map<String, Object>> history(ScreenUsageStatRequest request) {
        return historyQuery.history(request);
    }
}
```

- [ ] **Step 10: allActions 추가**

`src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` 325행을 바꾼다.

old:
```java
                "changeStatus"

                // ── 업무 모듈을 붙일 때 여기에 해당 모듈의 OASIS action 을 추가한다 ──────────────
```
new:
```java
                "changeStatus",
                // 2026-10-02 — mcm 화면 사용 통계(services/csa/screenUsageStat.bpmn) 6개 action. 이미 시드된 DB 는
                //   아래 ensurePermAllActions 가 덧붙인다. screenUsage/record 는 AUTH_ONLY 라 여기 넣지 않는다.
                "overview", "byScreen", "byDept", "byUser", "unused", "history"

                // ── 업무 모듈을 붙일 때 여기에 해당 모듈의 OASIS action 을 추가한다 ──────────────
```
주석 안에 큰따옴표를 쓰지 않는다. mdm `MdmOasisActionVocabularyTest` 가 이 블록의 따옴표 문자열을 모두 action 으로 읽는다.

- [ ] **Step 11: BPMN 생성 (bpmn-tool)**

워크트리 루트에서 실행한다. U2 Task 7 Step 4 와 같은 스펙이다.

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
npx -y @cothe/bpmn-tool@1.3.0 create > src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn <<'EOF'
{
  "definitions": { "id": "Definitions_screenUsageStat", "targetNamespace": "http://bpmn.io/schema/bpmn" },
  "process": { "id": "screenUsageStat", "name": "화면 사용 통계 서비스", "isExecutable": true },
  "nodes": [
    { "id": "start", "type": "bpmn:StartEvent", "x": 152, "y": 482 },
    { "id": "actionGateway", "type": "bpmn:ExclusiveGateway", "x": 245, "y": 475,
      "camunda": { "properties": [{ "name": "input", "value": "action" }] } },
    { "id": "overviewTask", "type": "bpmn:ServiceTask", "name": "개요", "x": 370, "y": 60,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "overview" }, { "name": "output", "value": "result" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endOverview", "type": "bpmn:EndEvent", "x": 542, "y": 82 },
    { "id": "byScreenTask", "type": "bpmn:ServiceTask", "name": "화면별", "x": 370, "y": 220,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "byScreen" }, { "name": "output", "value": "screens" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endByScreen", "type": "bpmn:EndEvent", "x": 542, "y": 242 },
    { "id": "byDeptTask", "type": "bpmn:ServiceTask", "name": "부서별", "x": 370, "y": 380,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "byDept" }, { "name": "output", "value": "depts" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endByDept", "type": "bpmn:EndEvent", "x": 542, "y": 402 },
    { "id": "byUserTask", "type": "bpmn:ServiceTask", "name": "사용자별", "x": 370, "y": 540,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "byUser" }, { "name": "output", "value": "users" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endByUser", "type": "bpmn:EndEvent", "x": 542, "y": 562 },
    { "id": "unusedTask", "type": "bpmn:ServiceTask", "name": "미사용 화면", "x": 370, "y": 700,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "unused" }, { "name": "output", "value": "unused" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endUnused", "type": "bpmn:EndEvent", "x": 542, "y": 722 },
    { "id": "historyTask", "type": "bpmn:ServiceTask", "name": "이용 이력", "x": 370, "y": 860,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "history" }, { "name": "output", "value": "history" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endHistory", "type": "bpmn:EndEvent", "x": 542, "y": 882 }
  ],
  "flows": [
    { "id": "flow_to_gw", "source": "start", "target": "actionGateway" },
    { "id": "flow_overview", "name": "overview", "source": "actionGateway", "target": "overviewTask" },
    { "id": "flow_overview_end", "source": "overviewTask", "target": "endOverview" },
    { "id": "flow_byScreen", "name": "byScreen", "source": "actionGateway", "target": "byScreenTask" },
    { "id": "flow_byScreen_end", "source": "byScreenTask", "target": "endByScreen" },
    { "id": "flow_byDept", "name": "byDept", "source": "actionGateway", "target": "byDeptTask" },
    { "id": "flow_byDept_end", "source": "byDeptTask", "target": "endByDept" },
    { "id": "flow_byUser", "name": "byUser", "source": "actionGateway", "target": "byUserTask" },
    { "id": "flow_byUser_end", "source": "byUserTask", "target": "endByUser" },
    { "id": "flow_unused", "name": "unused", "source": "actionGateway", "target": "unusedTask" },
    { "id": "flow_unused_end", "source": "unusedTask", "target": "endUnused" },
    { "id": "flow_history", "name": "history", "source": "actionGateway", "target": "historyTask" },
    { "id": "flow_history_end", "source": "historyTask", "target": "endHistory" }
  ]
}
EOF
npx -y @cothe/bpmn-tool@1.3.0 validate src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn
```
Expected: `"유효": true`, `"오류": 0`. 경고 1건(default flow 미설정)은 기존 `secFavorite.bpmn` 과 같은 구조라 그대로 둔다.

- [ ] **Step 12: 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupportJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm && ../gradlew :api:compileJava
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mdm && ../gradlew :api:test --tests com.dongkuk.dmes.mdm.MdmOasisActionVocabularyTest
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected:
- mcm-core: PASS (Support 8 + Service 2 + Contract 3).
- mcm api 컴파일: BUILD SUCCESSFUL.
- mdm `MdmOasisActionVocabularyTest`: PASS. 같은 `allActions` 블록을 정규식으로 읽는다.
- 계약 검사: `ERROR 0`. overview 의 Map 반환은 INFO 6-D-2 로 집계된다(C4 가 `data.result` 를 정한다).

- [ ] **Step 13: 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/dto/ScreenUsageStatRequest.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatSupport.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQuery.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQuery.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQuery.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQuery.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQuery.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQuery.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatService.java
/usr/bin/git add src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/ScreenUsageOasisContractTest.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatJpaTestBase.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatSupportJpaTest.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatServiceTest.java
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 퍼사드·공통 헬퍼·탭 쿼리 골격과 BPMN 을 추가한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task F2: 프런트 기반 — page.tsx · 탭 계약 · 탭 등록표 · 탭 골격 6쌍

**Files:**
- Create: `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx`
- Create: `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/tab-contract.ts`
- Create: `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/tab-modules.ts`
- Create: `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/columns.ts`
- Create (골격): `…/tabs/overview-tab.ts`, `…/tabs/OverviewTab.tsx`
- Create (골격): `…/tabs/screen-tab.ts`, `…/tabs/ScreenTab.tsx`
- Create (골격): `…/tabs/dept-tab.ts`, `…/tabs/DeptTab.tsx`
- Create (골격): `…/tabs/user-tab.ts`, `…/tabs/UserTab.tsx`
- Create (골격): `…/tabs/unused-tab.ts`, `…/tabs/UnusedTab.tsx`
- Create (골격): `…/tabs/history-tab.ts`, `…/tabs/HistoryTab.tsx`
- Create: `src/frontend/m-mcm/tests/csa/screenUsageStat/support/fetch-mock.ts`
- Create: `src/frontend/m-mcm/tests/csa/screenUsageStat/support/query.ts`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/tab-contract.test.ts`
- Modify: `src/frontend/m-mcm/lib/generated/page-registry.ts` (생성기 출력 — 손으로 고치지 않는다)

(`…/` = `src/frontend/m-mcm/page-components/csa/screenUsageStat/`)

**Interfaces:**
- Consumes: Task F0 의 `types.ts`·`format.ts`·`api.ts` 이름. shared `PageLayout`(`title`·`breadcrumb`·`screenId`·`objId`·`buttons`), `SearchArea`(`onSearch`), `SearchField`(`label`·`value`·`onChange`·`placeholder`), `ContentBody`(`root`), `ContentPanel`, `GridPanel`(`title`·`count`·`loading`), `GridColumn`(타입), `DatePicker`, `Tabs`(`items`·`activeKey`·`onChange`), `useMessage().showMessage({ title?, message, alertType })`, `exportToExcel(rows, fileName, sheetName, columns)`, `today()`.
- Produces (슬라이스가 쓰는 계약):
  - `tab-contract.ts`:
    - `interface ExportColumn { key: string; header: string }`
    - `interface StatExportTarget { rows: Record<string, unknown>[]; columns: ExportColumn[] }`
    - `interface StatTabModule { load(q: StatFilters): Promise<Partial<StatData>>; check?(q: StatFilters): string | null; toExport(data: StatData): StatExportTarget }`
    - `interface StatTabViewProps { data: StatData; query: StatFilters | null; busy: boolean }`
    - `toExportColumns(cols: readonly GridColumn[]): ExportColumn[]`, `exportFileName(tabLabel: string, ymd: string): string`
  - 탭 모듈 export 이름: `overviewTab`(overview-tab.ts), `screenTab`(screen-tab.ts), `deptTab`(dept-tab.ts), `userTab`(user-tab.ts), `unusedTab`(unused-tab.ts), `historyTab`(history-tab.ts) — 모두 `StatTabModule`
  - 탭 화면: 각 `*Tab.tsx` 의 `export default function XxxTab(props: StatTabViewProps)`
  - `tab-modules.ts`: `TAB_MODULES: Record<StatTab, StatTabModule>`
  - `columns.ts`: `countCol(key, header)`, `durationCol(key, header)`, `ymdCol(key, header)` → `GridColumn`, `SCREEN_COLUMNS: GridColumn[]`(화면별 탭·부서 상세 공용)
  - 시험 보조: `installFetchMock(): { reply(body, status?), sent(i?) }`, `query(overrides?): StatFilters`, `emptyData(overrides?): StatData`
  - page 동작 계약:
    - [조회] → `checkFilters` → 조건 고정(`submitted`) → `tracker.reset()` → 활성 탭의 `TAB_MODULES[tab]` 로 조회(같은 조건이어도 다시)
    - 탭 전환 → 고정 조건이 있으면 그 탭 조회. 같은 조건 키(`statQueryKey`)로 받은 탭은 건너뜀
    - 조회 직전 `module.check(q)` 가 문구를 주면 warning 으로 알리고 부르지 않음
    - 늦게 온 이전 응답은 버림(`isLatest`), 다른 요청이 남으면 로딩 유지(`finish`)
    - 받은 조각은 `setData(prev => ({ ...prev, ...patch }))`
    - [엑셀] → `TAB_MODULES[tab].toExport(data)` → `toExportRows(rows)` → `exportToExcel(…, exportFileName(TAB_LABEL[tab], today()), "Sheet1", columns)`, 행이 0 이면 버튼 비활성
    - 미사용 기준 일수 칸은 **개요·미사용 화면 탭**에서 보인다(메인 결정 U3-1)

- [ ] **Step 1: 시험 보조와 실패 시험 작성**

`src/frontend/m-mcm/tests/csa/screenUsageStat/support/fetch-mock.ts`

```ts
/**
 * 화면 사용 통계 시험 공용 fetch 대역. describe 밖(파일 최상단)에서 한 번 부른다.
 * 시험 파일이 아니라(.test.ts 아님) vitest 가 직접 돌리지 않는다.
 */
import { afterEach, beforeEach, vi } from "vitest";

export interface SentRequest {
  url: string;
  body: { meta: Record<string, unknown>; params: Record<string, unknown> };
}

export function installFetchMock() {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  return {
    reply(body: unknown, status = 200) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
      );
    },
    sent(i = 0): SentRequest {
      const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
      return { url, body: JSON.parse(String(init.body)) };
    },
  };
}
```

`src/frontend/m-mcm/tests/csa/screenUsageStat/support/query.ts`

```ts
/** 화면 사용 통계 시험 공용 조건·빈 데이터. types.ts 는 shared 를 런타임 import 하므로 타입만 가져온다. */
import type { StatData, StatFilters } from "@/page-components/csa/screenUsageStat/types";

export function query(overrides: Partial<StatFilters> = {}): StatFilters {
  return {
    fromDt: "2026-09-01",
    toDt: "2026-09-30",
    deptCd: "",
    userId: "",
    pageId: "",
    unusedDays: "",
    ...overrides,
  };
}

export function emptyData(overrides: Partial<StatData> = {}): StatData {
  return {
    overview: null,
    overviewRange: null,
    screens: [],
    depts: [],
    users: [],
    unused: [],
    history: [],
    ...overrides,
  };
}
```

`src/frontend/m-mcm/tests/csa/screenUsageStat/tab-contract.test.ts`

```ts
import { describe, expect, it } from "vitest";

import {
  exportFileName,
  toExportColumns,
} from "@/page-components/csa/screenUsageStat/tabs/tab-contract";
import { TAB_MODULES } from "@/page-components/csa/screenUsageStat/tabs/tab-modules";

import { emptyData } from "./support/query";

describe("탭 등록표 (슬라이스 병합 뒤에도 성립)", () => {
  it("탭 6개가 모두 load·toExport 를 가진다", () => {
    expect(Object.keys(TAB_MODULES).sort()).toEqual(["dept", "history", "overview", "screen", "unused", "user"]);
    for (const m of Object.values(TAB_MODULES)) {
      expect(typeof m.load).toBe("function");
      expect(typeof m.toExport).toBe("function");
      if (m.check !== undefined) expect(typeof m.check).toBe("function");
    }
  });

  it("조회 전(빈 데이터)에는 어느 탭도 엑셀 행이 없다", () => {
    for (const m of Object.values(TAB_MODULES)) {
      expect(m.toExport(emptyData()).rows).toEqual([]);
    }
  });
});

describe("엑셀 보조", () => {
  it("그리드 열에서 key·header 만 남긴다", () => {
    expect(
      toExportColumns([
        { key: "menuNm", header: "화면명", width: 180, align: "left" },
        { key: "openCnt", header: "열람 횟수", width: 100, align: "right", type: "number" },
      ]),
    ).toEqual([
      { key: "menuNm", header: "화면명" },
      { key: "openCnt", header: "열람 횟수" },
    ]);
  });

  it("파일 이름은 화면사용통계_탭이름_일자.xlsx", () => {
    expect(exportFileName("화면별", "20261002")).toBe("화면사용통계_화면별_20261002.xlsx");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/tab-contract.test.ts`
Expected: FAIL — `Failed to resolve import "@/page-components/csa/screenUsageStat/tabs/tab-contract"`.

- [ ] **Step 3: 탭 계약·공용 열 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/tab-contract.ts`

```ts
/**
 * 화면 사용 통계 탭 계약 — 탭 하나 = 탭 모듈(`*-tab.ts`, 조회·검사·엑셀 대상) + 탭 화면(`*Tab.tsx`, 그리기).
 * page.tsx 는 TAB_MODULES 로 모듈을 부르고 탭 화면에 StatTabViewProps 를 넘긴다. 슬라이스는 이 파일을 고치지 않는다.
 * shared 는 타입만 가져온다(vitest 가 shared dist 없이 시험한다).
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

import type { StatData, StatFilters } from "../types";

/** exportToExcel 의 columns 인자(shared ExcelColumn)와 같은 모양. */
export interface ExportColumn {
  key: string;
  header: string;
}

/** [엑셀] 대상 — 현재 탭 그리드의 원본 행과 열. 표시용 글자 변환(toExportRows)은 page 가 한다. */
export interface StatExportTarget {
  rows: Record<string, unknown>[];
  columns: ExportColumn[];
}

export interface StatTabModule {
  /** 고정된 조건으로 이 탭을 조회해 StatData 에 합칠 조각을 돌려준다. */
  load(q: StatFilters): Promise<Partial<StatData>>;
  /** 조회 전 검사. 문구를 돌려주면 page 가 warning 으로 알리고 부르지 않는다. */
  check?(q: StatFilters): string | null;
  /** [엑셀] 대상. 조회 전이면 rows 는 빈 배열. */
  toExport(data: StatData): StatExportTarget;
}

/** 탭 화면 props. query 는 [조회] 로 고정한 조건(조회 전 null), busy 는 탭 조회 중 여부. */
export interface StatTabViewProps {
  data: StatData;
  query: StatFilters | null;
  busy: boolean;
}

export const toExportColumns = (cols: readonly GridColumn[]): ExportColumn[] =>
  cols.map(({ key, header }) => ({ key, header }));

export const exportFileName = (tabLabel: string, ymd: string): string => `화면사용통계_${tabLabel}_${ymd}.xlsx`;
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/columns.ts`

```ts
/**
 * 여러 탭이 함께 쓰는 그리드 열. SCREEN_COLUMNS 는 화면별 탭(S2)과 부서별 탭의 선택 부서 화면별 그리드(S3)가 같이 쓴다.
 * 슬라이스는 이 파일을 고치지 않는다. 자기 탭 전용 열은 자기 `*-tab.ts` 에 둔다.
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { formatDuration, formatYmd } from "../format";

export const countCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "right",
  type: "number",
});

/** 이용 시간(ms) → "1시간 2분". null(예: 열람 0회의 평균)은 빈 칸. */
export const durationCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "right",
  render: (v) => formatDuration(v),
});

export const ymdCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "center",
  render: (v) => formatYmd(v),
});

/** 화면별 — 8열이라 fit. 남는 폭은 메뉴 경로. 메뉴 없는 화면은 서버 문구 "(메뉴 없음)" 그대로. */
export const SCREEN_COLUMNS: GridColumn[] = [
  { key: "menuNm", header: "화면명", width: 180, align: "left" },
  { key: "pageId", header: "화면 ID", width: 120, align: "left" },
  { key: "menuPath", header: "메뉴 경로", width: 100, minWidth: 180, align: "left" },
  countCol("openCnt", "열람 횟수"),
  countCol("userCnt", "이용자 수"),
  durationCol("durationMs", "총 이용 시간"),
  durationCol("avgDurationMs", "평균 이용 시간"),
  ymdCol("lastUsedDt", "마지막 이용일"),
];
```

- [ ] **Step 4: 탭 모듈 골격 6개와 등록표 구현**

골격 모듈은 아무것도 부르지 않고 빈 조각·빈 엑셀 대상을 돌려준다. 슬라이스가 같은 export 이름을 유지한 채 채운다.

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts`

```ts
/** 개요 탭 모듈 — 슬라이스 S1 이 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const overviewTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/screen-tab.ts`

```ts
/** 화면별 탭 모듈 — 슬라이스 S2 가 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const screenTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/dept-tab.ts`

```ts
/** 부서별 탭 모듈 — 슬라이스 S3 이 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const deptTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/user-tab.ts`

```ts
/** 사용자별 탭 모듈 — 슬라이스 S4 가 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const userTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/unused-tab.ts`

```ts
/** 미사용 화면 탭 모듈 — 슬라이스 S5 가 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const unusedTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/history-tab.ts`

```ts
/** 이용 이력 탭 모듈 — 슬라이스 S6 이 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const historyTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/tab-modules.ts`

```ts
/** 탭 등록표 — page.tsx 가 조회·검사·엑셀을 이 표로 부른다. 슬라이스는 이 파일을 고치지 않는다. */
import type { StatTab } from "../types";

import { deptTab } from "./dept-tab";
import { historyTab } from "./history-tab";
import { overviewTab } from "./overview-tab";
import { screenTab } from "./screen-tab";
import type { StatTabModule } from "./tab-contract";
import { unusedTab } from "./unused-tab";
import { userTab } from "./user-tab";

export const TAB_MODULES: Record<StatTab, StatTabModule> = {
  overview: overviewTab,
  screen: screenTab,
  dept: deptTab,
  user: userTab,
  unused: unusedTab,
  history: historyTab,
};
```

- [ ] **Step 5: 시험 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/tab-contract.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: 탭 화면 골격 6개 구현**

골격 화면은 "준비 중" 제목의 빈 그리드 패널만 그린다(eslint 미사용 인자 경고가 없도록 `busy` 만 받는다).

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/OverviewTab.tsx`

```tsx
"use client";

/** 개요 탭 화면 — 슬라이스 S1 이 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function OverviewTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="개요 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/ScreenTab.tsx`

```tsx
"use client";

/** 화면별 탭 화면 — 슬라이스 S2 가 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function ScreenTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="화면별 이용 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/DeptTab.tsx`

```tsx
"use client";

/** 부서별 탭 화면 — 슬라이스 S3 이 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function DeptTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="부서별 이용 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UserTab.tsx`

```tsx
"use client";

/** 사용자별 탭 화면 — 슬라이스 S4 가 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function UserTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="사용자별 이용 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UnusedTab.tsx`

```tsx
"use client";

/** 미사용 화면 탭 화면 — 슬라이스 S5 가 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function UnusedTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="미사용 화면 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
```

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/HistoryTab.tsx`

```tsx
"use client";

/** 이용 이력 탭 화면 — 슬라이스 S6 이 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function HistoryTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="이용 이력 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
```

- [ ] **Step 7: page.tsx 작성**

U3 Task 3 page.tsx 에서 검색 영역·버튼·탭 머리줄·조회 흐름은 그대로 두고, 탭 본문·열 정의·`fetchTab`·`exportTarget` 은 탭 모듈·탭 화면으로 옮겼다. 부서별 상세 로직은 S3 의 `DeptTab.tsx` 로 간다.

`src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx`

```tsx
"use client";

/**
 * screenUsageStat — 화면 사용 통계(관리자). 조회 화면 A 유형 + shared Tabs 6개.
 * 설계: docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md §5 · 응답 계약: 총괄 계획 C4.
 * - 첫 진입 자동 조회는 하지 않는다(커밋 c564a05f 방향). [조회] 가 조건을 고정하고 활성 탭을 다시 부른다.
 * - 탭을 바꾸면 고정된 조건으로 그 탭만 부른다. 같은 조건으로 이미 받은 탭은 다시 부르지 않는다.
 * - 탭별 조회·검사·엑셀 대상은 tabs/*-tab.ts(TAB_MODULES), 그리기는 tabs/*Tab.tsx 가 맡는다.
 */
import { useCallback, useMemo, useState } from "react";

import { DatePicker } from "@dk-oasis/shared/form";
import { PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { Tabs } from "@dk-oasis/shared/tabs";
import { exportToExcel, today } from "@dk-oasis/shared/utils";

import { createTabRequestTracker, statQueryKey } from "./api";
import { DEFAULT_UNUSED_DAYS, checkFilters, toExportRows } from "./format";
import DeptTab from "./tabs/DeptTab";
import HistoryTab from "./tabs/HistoryTab";
import OverviewTab from "./tabs/OverviewTab";
import ScreenTab from "./tabs/ScreenTab";
import UnusedTab from "./tabs/UnusedTab";
import UserTab from "./tabs/UserTab";
import { exportFileName, type StatTabViewProps } from "./tabs/tab-contract";
import { TAB_MODULES } from "./tabs/tab-modules";
import {
  TAB_ITEMS,
  TAB_LABEL,
  emptyFilters,
  emptyStatData,
  type StatData,
  type StatFilters,
  type StatTab,
} from "./types";

const SCREEN_ID = "screenUsageStat";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function ScreenUsageStatPage() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<StatFilters>(emptyFilters);
  /** [조회] 로 고정한 조건. null 이면 아직 조회 전이라 탭을 바꿔도 부르지 않는다. */
  const [submitted, setSubmitted] = useState<StatFilters | null>(null);
  const [tab, setTab] = useState<StatTab>("overview");
  const [data, setData] = useState<StatData>(emptyStatData);
  const [isBusy, setIsBusy] = useState(false);
  // 요청 조정기는 렌더마다 새로 만들지 않도록 초기화 함수로 한 번만 만든다(렌더 중에는 읽지 않는다).
  const [tracker] = useState(() => createTabRequestTracker<StatTab>());

  const loadTab = useCallback(
    async (target: StatTab, q: StatFilters) => {
      const key = statQueryKey(target, q);
      if (tracker.isLoaded(target, key)) return;
      const mod = TAB_MODULES[target];
      const msg = mod.check?.(q) ?? null;
      if (msg) {
        showMessage({ message: msg, alertType: "warning" });
        return;
      }
      const n = tracker.begin(target);
      setIsBusy(true);
      try {
        const patch = await mod.load(q);
        if (!tracker.isLatest(target, n)) return;
        setData((prev) => ({ ...prev, ...patch }));
        tracker.markLoaded(target, key);
      } catch (e) {
        if (tracker.isLatest(target, n)) {
          // 서버 거절(meta.success=false)은 api.ts 가 서버 문구로 던진다 — 그대로 알린다.
          showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        }
      } finally {
        setIsBusy(tracker.finish());
      }
    },
    [tracker, showMessage],
  );

  const handleSearch = useCallback(() => {
    const msg = checkFilters(filters);
    if (msg) {
      showMessage({ message: msg, alertType: "warning" });
      return;
    }
    const q = { ...filters };
    setSubmitted(q);
    tracker.reset();
    void loadTab(tab, q);
  }, [filters, tab, tracker, loadTab, showMessage]);

  const handleTabChange = useCallback(
    (k: string) => {
      const next = k as StatTab;
      setTab(next);
      if (submitted) void loadTab(next, submitted);
    },
    [submitted, loadTab],
  );

  const exportInfo = useMemo(() => TAB_MODULES[tab].toExport(data), [tab, data]);

  const handleExport = useCallback(() => {
    void exportToExcel(
      toExportRows(exportInfo.rows),
      exportFileName(TAB_LABEL[tab], today()),
      "Sheet1",
      exportInfo.columns,
    );
  }, [tab, exportInfo]);

  const setFilter = (key: keyof StatFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const viewProps: StatTabViewProps = { data, query: submitted, busy: isBusy };

  return (
    <PageLayout
      title="화면 사용 통계"
      breadcrumb="공통관리 > 시스템관리 > 화면 사용 통계"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary", disabled: isBusy, action: "search" },
        {
          id: "btn_export",
          label: "엑셀",
          onClick: handleExport,
          disabled: isBusy || exportInfo.rows.length === 0,
          action: "export",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField label="조회 기간">
          <DatePicker value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        </SearchField>
        <SearchField label="~">
          <DatePicker value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        </SearchField>
        <SearchField
          label="부서코드"
          value={filters.deptCd}
          onChange={(v) => setFilter("deptCd", v)}
          placeholder="정확히 입력 (부서 없음: -)"
        />
        <SearchField
          label="사용자"
          value={filters.userId}
          onChange={(v) => setFilter("userId", v)}
          placeholder="사용자 ID 정확히 입력"
        />
        <SearchField
          label="화면"
          value={filters.pageId}
          onChange={(v) => setFilter("pageId", v)}
          placeholder="화면 ID 정확히 입력 (예: csa/commUserMng)"
        />
        {(tab === "overview" || tab === "unused") && (
          <SearchField
            label="미사용 기준(일)"
            value={filters.unusedDays}
            onChange={(v) => setFilter("unusedDays", v)}
            placeholder={String(DEFAULT_UNUSED_DAYS)}
          />
        )}
      </SearchArea>

      <Tabs items={TAB_ITEMS} activeKey={tab} onChange={handleTabChange} />

      {tab === "overview" && <OverviewTab {...viewProps} />}
      {tab === "screen" && <ScreenTab {...viewProps} />}
      {tab === "dept" && <DeptTab {...viewProps} />}
      {tab === "user" && <UserTab {...viewProps} />}
      {tab === "unused" && <UnusedTab {...viewProps} />}
      {tab === "history" && <HistoryTab {...viewProps} />}
    </PageLayout>
  );
}
```

메모(실행자 확인용):
- 탭 본문은 활성 탭만 그린다. 데이터는 page 의 `data` 에 남아 있어 탭을 떠났다 와도 다시 부르지 않는다.
- eslint-config-next 16(react-hooks 7.1.1)의 규칙이 `useState` 로 든 추적기의 메서드 호출을 잡으면 추적기를 `useRef(createTabRequestTracker<StatTab>())` 로 바꾸고 `.current` 는 콜백 안에서만 읽는다(U3 Task 3 메모와 같다).

- [ ] **Step 8: 페이지 레지스트리 생성과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm generate:page-registry
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && /usr/bin/git diff -- src/frontend/m-mcm/lib/generated/page-registry.ts
```
Expected: diff 는 한 줄 추가뿐이다(`csa/commUserRoleCopy` 다음 줄). `tabs/` 아래 파일은 등재되지 않는다.

```ts
  "csa/screenUsageStat": () => import("@/page-components/csa/screenUsageStat/page"),
```

다른 줄이 바뀌면 이 작업 것이 아니므로 메인에 보고하고 커밋에서 그 부분을 뺀다.

- [ ] **Step 9: 시험·타입·lint·audit 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm build:libs
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat tests/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected:
- `pnpm build:libs` 성공(tsc 가 shared `.d.ts` 를 읽는다. `TSUP_DTS=0` 금지. `pnpm dev` watch 가 돌고 있으면 빌드 대신 `lib-dev-stamp.json` 의 `dts: true` 를 기다린다).
- vitest: 3개 파일(format·api·tab-contract) PASS.
- tsc 필터: 출력 없음(이 화면·시험 파일에 타입 오류 0건). **이것만 통과 기준**이다. 전체 오류 수는 다른 단위 영향이 있을 수 있어 참고만 한다.
- eslint: 출력 없음(경고 포함 0).
- mantine·aggrid audit: `의심 0건 — 통과`.

- [ ] **Step 10: 포맷과 커밋**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/page.tsx page-components/csa/screenUsageStat/tabs tests/csa/screenUsageStat/tab-contract.test.ts tests/csa/screenUsageStat/support`
Expected: 파일 처리 후 Step 9 의 vitest·tsc 필터·eslint 를 다시 돌려 통과.

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/tab-contract.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/tab-modules.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/columns.ts
/usr/bin/git add src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/OverviewTab.tsx src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/screen-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/ScreenTab.tsx src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/dept-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/DeptTab.tsx
/usr/bin/git add src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/user-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UserTab.tsx src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/unused-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UnusedTab.tsx src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/history-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/HistoryTab.tsx
/usr/bin/git add src/frontend/m-mcm/tests/csa/screenUsageStat/support/fetch-mock.ts src/frontend/m-mcm/tests/csa/screenUsageStat/support/query.ts src/frontend/m-mcm/tests/csa/screenUsageStat/tab-contract.test.ts src/frontend/m-mcm/lib/generated/page-registry.ts
/usr/bin/git commit -m "feat(m-mcm): 화면 사용 통계 화면 틀과 탭 계약·탭 골격 6개를 만든다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## 슬라이스 공통 규칙 (S1~S6)

- 착수 조건: Task F0·F1·F2 가 병합된 커밋에서 슬라이스마다 새 워크트리를 만든다.
- 고치는 파일은 각 Task 의 **Files** 에 적힌 것뿐이다. 골격 파일(`ScreenUsage*Query.java`, `*-tab.ts`, `*Tab.tsx`)은 **파일 전체를 아래 코드로 바꾼다.**
- 공개 시그니처를 지킨다: 쿼리 클래스의 action 메서드(퍼사드가 부른다), 탭 모듈 export 이름(`tab-modules.ts` 가 import 한다), 탭 화면 default export 와 `StatTabViewProps`.
- 백엔드 검증: 자기 테스트 + `ScreenUsageStatServiceTest` + `ScreenUsageOasisContractTest` + 계약 검사 ERROR 0.
- 프런트 검증: `test:unit` 전체 PASS, tsc 필터 출력 없음, 자기 폴더 eslint 0, audit 0.
- 기반·F 의 함수가 기대와 다르게 동작해 시험이 실패하면 기반·F 파일을 고치지 말고 메인에 보고한다.

---

### Task S1: 개요 (overview) — 병렬

**Files:**
- Modify (골격 전체 교체): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQuery.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQueryJpaTest.java`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/OverviewTab.tsx`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/overview-tab.test.ts`

**Interfaces:**
- Consumes (F1): `ScreenUsageStatSupport.range/filter/sums/split/rawDays/today/menus/unusedScreens/unusedDays/menuNm/groupBy/longDesc/text`, `UsageTotals`, `Range`, `Filter`, `Split`, `ScreenUsageStatJpaTestBase`(`USER`·`MENU`·`ROLE`, `req`, `save`, `rollupAtTwoAm`, `support`, `dayRepository`)
- Consumes (기반): `ScreenUsageDayRepository.sumByDay(...) : List<DailySum>`, `UsageFixtures.day(...)`, `ScreenUsageDates.format`
- Consumes (F2): `StatTabModule`, `StatTabViewProps`, `ExportColumn`, `installFetchMock`, `query`, `emptyData`
- Consumes (기반 화면): `fetchOverview(q)`, `statQueryKey`, `DEFAULT_UNUSED_DAYS`, `parseUnusedDays`, `formatDuration`, `toDailyPoints`, `toTopBars`, `StatFilters`, shared `DashboardGrid`·`DashboardCell`·`DashboardCard`·`KpiTile`·`KpiTileGroup`·`LineChart`·`HBarChart`
- Produces:
  - `ScreenUsageOverviewQuery.overview(ScreenUsageStatRequest) : Map<String, Object>` — C4 `{ totalOpenCnt, userCnt, totalDurationMs, unusedScreenCnt, daily[], topScreens[] }`, 상위 화면 `TOP_SCREENS = 10`
  - `overviewTab: StatTabModule`, `DAILY_EXPORT_COLUMNS: ExportColumn[]`, `unusedKpiCaption(q: StatFilters | null): string`
  - `export default function OverviewTab(props: StatTabViewProps)`

- [ ] **Step 1: 백엔드 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQueryJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** 개요 — 합계·이용자 수(집계·원본 중복 제거)·일별 추이(0 채움)·상위 10개·미사용 수(unusedDays). */
class ScreenUsageOverviewQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageOverviewQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageOverviewQuery(support, dayRepository);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    @Test
    @DisplayName("개요 — 합계·이용자 수·일별 추이(이용 없는 날 0)·상위 화면·미사용 수")
    void overview() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", MENU, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 30_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 10_000);

        Map<String, Object> result = query.overview(req("20261001", "20261003"));

        assertThat(result).containsEntry("totalOpenCnt", 4L)
                .containsEntry("userCnt", 2L)
                .containsEntry("totalDurationMs", 130_000L)
                .containsEntry("unusedScreenCnt", 1L); // ROLE (HIDDEN 은 표시 안 함)
        assertThat(list(result, "daily"))
                .extracting(r -> r.get("usageDt"), r -> r.get("openCnt"), r -> r.get("userCnt"), r -> r.get("durationMs"))
                .containsExactly(
                        tuple("20261001", 0L, 0L, 0L),
                        tuple("20261002", 2L, 2L, 90_000L),
                        tuple("20261003", 2L, 1L, 40_000L));
        assertThat(list(result, "topScreens"))
                .extracting(r -> r.get("pageId"), r -> r.get("menuNm"), r -> r.get("openCnt"), r -> r.get("durationMs"))
                .containsExactly(tuple(USER, "사용자 관리", 2L, 90_000L), tuple(MENU, "메뉴 관리", 2L, 40_000L));
    }

    @Test
    @DisplayName("개요의 미사용 화면 수는 unusedDays(기본 90)를 미사용 탭과 같은 규칙으로 쓴다")
    void overviewUsesUnusedDays() {
        dayRepository.save(day("20260706", ROLE, "userA", "D100", 1, 1, 1_000)); // 90일 창 시작일(07-06) 이용
        ScreenUsageStatRequest r = req("20261003", "20261003");

        assertThat(query.overview(r)).containsEntry("unusedScreenCnt", 2L); // USER, MENU (ROLE 은 사용)
        r.setUnusedDays(89);                                                  // 창 시작 07-07 → ROLE 도 미사용
        assertThat(query.overview(r)).containsEntry("unusedScreenCnt", 3L);
    }

    @Test
    @DisplayName("상위 화면은 열람 많은 순 10개까지, 메뉴에 없는 화면은 (메뉴 없음)")
    void topScreensLimitTen() {
        for (int i = 1; i <= 11; i++) {
            String pageId = String.format("old/screen%02d", i);
            for (int k = 0; k < i; k++) {
                save("userA", "D100", pageId, "OPEN", LocalDateTime.of(2026, 10, 3, 8, k), 1_000);
            }
        }

        List<Map<String, Object>> top = list(query.overview(req("20261003", "20261003")), "topScreens");

        assertThat(top).hasSize(10);
        assertThat(top.get(0)).containsEntry("pageId", "old/screen11").containsEntry("openCnt", 11L)
                .containsEntry("menuNm", "(메뉴 없음)");
        assertThat(top).extracting(r -> r.get("pageId")).doesNotContain("old/screen01");
    }

    @Test
    @DisplayName("이용이 없으면 합계 0, 추이는 오늘까지만 0 으로 채우고 상위 화면은 빈 목록")
    void emptyPeriod() {
        Map<String, Object> result = query.overview(req("20261002", "20261005")); // 종료일이 오늘(10-03) 뒤

        assertThat(result).containsEntry("totalOpenCnt", 0L).containsEntry("userCnt", 0L)
                .containsEntry("totalDurationMs", 0L);
        assertThat(list(result, "daily")).extracting(r -> r.get("usageDt")).containsExactly("20261002", "20261003");
        assertThat(list(result, "topScreens")).isEmpty();
    }
}
```

- [ ] **Step 2: 백엔드 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageOverviewQueryJpaTest`
Expected: FAIL — 골격이 빈 맵을 돌려줘 `Expecting map ... to contain entry totalOpenCnt=4L` 등으로 4건 실패.

- [ ] **Step 3: 백엔드 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.repository.DailySum;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Filter;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Range;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Split;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * action=overview → data.result (계약 C4).
 * 합계·이용자 수는 집계분+원본분을 합쳐 사용자 Set 으로 센다. 일별 추이는 fromDt ~ min(toDt, 오늘) 의 빈 날을 0 으로 채운다.
 * 미사용 화면 수는 unusedDays(기본 90)로 미사용 탭과 같은 규칙(ScreenUsageStatSupport.unusedScreens)을 쓴다.
 */
@Component
public class ScreenUsageOverviewQuery {

    static final int TOP_SCREENS = 10;

    private final ScreenUsageStatSupport support;
    private final ScreenUsageDayRepository dayRepository;

    public ScreenUsageOverviewQuery(ScreenUsageStatSupport support, ScreenUsageDayRepository dayRepository) {
        this.support = support;
        this.dayRepository = dayRepository;
    }

    public Map<String, Object> overview(ScreenUsageStatRequest request) {
        Range range = ScreenUsageStatSupport.range(request);
        Filter filter = ScreenUsageStatSupport.filter(request);
        List<UsageSum> sums = support.sums(range, filter);
        Map<String, MenuInfo> menus = support.menus();

        long openCnt = 0;
        long durationMs = 0;
        Set<String> users = new HashSet<>();
        for (UsageSum s : sums) {
            openCnt += s.openCnt();
            durationMs += s.durationMs();
            users.add(s.userId());
        }

        List<Map<String, Object>> pages = new ArrayList<>();
        ScreenUsageStatSupport.groupBy(sums, UsageSum::pageId, UsageTotals::new).forEach((pageId, t) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", pageId);
            row.put("menuNm", ScreenUsageStatSupport.menuNm(pageId, menus));
            row.put("openCnt", t.openCnt);
            row.put("durationMs", t.durationMs);
            pages.add(row);
        });
        pages.sort(ScreenUsageStatSupport.longDesc("openCnt")
                .thenComparing(ScreenUsageStatSupport.longDesc("durationMs"))
                .thenComparing(ScreenUsageStatSupport.text("pageId")));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalOpenCnt", openCnt);
        result.put("userCnt", (long) users.size());
        result.put("totalDurationMs", durationMs);
        result.put("unusedScreenCnt",
                (long) support.unusedScreens(menus, ScreenUsageStatSupport.unusedDays(request)).size());
        result.put("daily", daily(range, filter));
        result.put("topScreens", new ArrayList<>(pages.subList(0, Math.min(TOP_SCREENS, pages.size()))));
        return result;
    }

    /** 일별 열람·이용자 수·이용 시간 — 집계분은 JPQL, 원본분은 Java 합산(이용자 수는 일자별 Set). */
    private List<Map<String, Object>> daily(Range range, Filter filter) {
        Split split = support.split(range);
        TreeMap<String, long[]> byDt = new TreeMap<>(); // usageDt → {openCnt, userCnt, durationMs}
        if (split.hasDay()) {
            for (DailySum d : dayRepository.sumByDay(
                    ScreenUsageDates.format(split.dayFrom()), ScreenUsageDates.format(split.dayTo()),
                    filter.deptCd(), filter.userId(), filter.pageId())) {
                byDt.put(d.usageDt(), new long[]{d.openCnt(), d.userCnt(), d.durationMs()});
            }
        }
        if (split.hasRaw()) {
            Map<String, Set<String>> usersByDt = new HashMap<>();
            for (ScreenUsageDay d : support.rawDays(split.rawFrom(), split.rawTo(), filter)) {
                long[] v = byDt.computeIfAbsent(d.getUsageDt(), k -> new long[3]);
                v[0] += d.getOpenCnt();
                v[2] += d.getDurationMs();
                usersByDt.computeIfAbsent(d.getUsageDt(), k -> new HashSet<>()).add(d.getUserId());
            }
            usersByDt.forEach((dt, u) -> byDt.get(dt)[1] = u.size());
        }
        LocalDate today = support.today();
        LocalDate last = range.to().isAfter(today) ? today : range.to();
        for (LocalDate d = range.from(); !d.isAfter(last); d = d.plusDays(1)) {
            byDt.putIfAbsent(ScreenUsageDates.format(d), new long[3]);
        }

        List<Map<String, Object>> rows = new ArrayList<>(byDt.size());
        byDt.forEach((dt, v) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("usageDt", dt);
            row.put("openCnt", v[0]);
            row.put("userCnt", v[1]);
            row.put("durationMs", v[2]);
            rows.add(row);
        });
        return rows;
    }
}
```

- [ ] **Step 4: 백엔드 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageOverviewQueryJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: PASS (4 + 2 + 3)

- [ ] **Step 5: 화면 실패 시험 작성**

`src/frontend/m-mcm/tests/csa/screenUsageStat/overview-tab.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { statQueryKey } from "@/page-components/csa/screenUsageStat/api";
import {
  DAILY_EXPORT_COLUMNS,
  overviewTab,
  unusedKpiCaption,
} from "@/page-components/csa/screenUsageStat/tabs/overview-tab";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

describe("개요 탭 조회", () => {
  it("overview 를 부르고 미사용 기준 일수를 숫자로 싣고, 추이 기간을 함께 돌려준다", async () => {
    http.reply({ meta: { success: true }, data: { result: { totalOpenCnt: 3, unusedScreenCnt: 2 } } });
    const patch = await overviewTab.load(query({ unusedDays: "30" }));
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/overview");
    expect(body.params.unusedDays).toBe(30);
    expect(patch.overview?.totalOpenCnt).toBe(3);
    expect(patch.overview?.unusedScreenCnt).toBe(2);
    expect(patch.overview?.daily).toEqual([]);
    expect(patch.overviewRange).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("미사용 기준 일수를 바꾸면 조건 키가 달라져 개요를 다시 부른다", () => {
    expect(statQueryKey("overview", query({ unusedDays: "30" }))).not.toBe(
      statQueryKey("overview", query({ unusedDays: "60" })),
    );
  });

  it("조회 전 검사는 없다", () => {
    expect(overviewTab.check).toBeUndefined();
  });
});

describe("미사용 KPI 문구", () => {
  it("조회 조건의 기준 일수를 쓰고, 조회 전·빈 값·잘못된 값이면 90", () => {
    expect(unusedKpiCaption(query({ unusedDays: "30" }))).toBe("최근 30일 이용 없음");
    expect(unusedKpiCaption(query({ unusedDays: "" }))).toBe("최근 90일 이용 없음");
    expect(unusedKpiCaption(query({ unusedDays: "abc" }))).toBe("최근 90일 이용 없음");
    expect(unusedKpiCaption(null)).toBe("최근 90일 이용 없음");
  });
});

describe("개요 엑셀", () => {
  it("일별 추이를 내보내고, 조회 전이면 행이 없다", () => {
    const daily = [{ usageDt: "20261001", openCnt: 2, userCnt: 1, durationMs: 60_000 }];
    const overview = {
      totalOpenCnt: 2,
      userCnt: 1,
      totalDurationMs: 60_000,
      unusedScreenCnt: 0,
      daily,
      topScreens: [],
    };
    expect(overviewTab.toExport(emptyData({ overview })).rows).toEqual(daily);
    expect(overviewTab.toExport(emptyData()).rows).toEqual([]);
    expect(DAILY_EXPORT_COLUMNS.map((c) => c.header)).toEqual(["일자", "열람 횟수", "이용자 수", "이용 시간"]);
  });
});
```

- [ ] **Step 6: 화면 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/overview-tab.test.ts`
Expected: FAIL — `DAILY_EXPORT_COLUMNS`·`unusedKpiCaption` 이 export 되지 않았고(`is not a function`/undefined), 골격 `load` 가 fetch 를 부르지 않아 `fetchMock.mock.calls[0]` 이 없다.

- [ ] **Step 7: 탭 모듈 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts`

```ts
/**
 * 개요 탭 모듈 — overview 조회(미사용 기준 일수 포함), 일별 추이 엑셀, 미사용 KPI 문구.
 * shared 를 런타임 import 하지 않는다(시험 격리).
 */
import { fetchOverview } from "../api";
import { DEFAULT_UNUSED_DAYS, parseUnusedDays } from "../format";
import type { StatFilters } from "../types";
import type { ExportColumn, StatTabModule } from "./tab-contract";

/** 개요 탭의 엑셀은 일별 추이를 내보낸다. */
export const DAILY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "usageDt", header: "일자" },
  { key: "openCnt", header: "열람 횟수" },
  { key: "userCnt", header: "이용자 수" },
  { key: "durationMs", header: "이용 시간" },
];

export const overviewTab: StatTabModule = {
  load: async (q) => ({ overview: await fetchOverview(q), overviewRange: [q.fromDt, q.toDt] as const }),
  toExport: (data) => ({ rows: data.overview?.daily ?? [], columns: DAILY_EXPORT_COLUMNS }),
};

/** 미사용 KPI 보조 문구 — [조회] 로 고정한 기준 일수(서버에 보낸 값과 같은 해석). */
export function unusedKpiCaption(q: StatFilters | null): string {
  const days = (q && parseUnusedDays(q.unusedDays)) ?? DEFAULT_UNUSED_DAYS;
  return `최근 ${days}일 이용 없음`;
}
```

- [ ] **Step 8: 탭 화면 구현**

U3 Task 3 의 `OverviewBody` 를 옮겼다. KPI 보조 문구만 기준 일수를 따르게 바꿨다.

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/OverviewTab.tsx`

```tsx
"use client";

/** 개요 탭 화면 — KPI 4개, 일별 열람 추이, 많이 연 화면 상위 10개. */
import { useMemo } from "react";

import { HBarChart, LineChart } from "@dk-oasis/shared/charts";
import {
  DashboardCard,
  DashboardCell,
  DashboardGrid,
  KpiTile,
  KpiTileGroup,
} from "@dk-oasis/shared/dashboard";

import { formatDuration, toDailyPoints, toTopBars } from "../format";
import { unusedKpiCaption } from "./overview-tab";
import type { StatTabViewProps } from "./tab-contract";

const fmtCount = (n: number | undefined) => (n === undefined ? "-" : n.toLocaleString("ko-KR"));

export default function OverviewTab({ data, query }: StatTabViewProps) {
  const { overview, overviewRange: range } = data;
  const points = useMemo(
    () => (overview && range ? toDailyPoints(overview.daily, range[0], range[1]) : []),
    [overview, range],
  );
  const bars = useMemo(
    () => (overview ? toTopBars(overview.topScreens, "var(--color-chart-1)") : []),
    [overview],
  );
  return (
    <DashboardGrid fill ariaLabel="화면 사용 개요">
      <DashboardCell span={12}>
        <KpiTileGroup ariaLabel="주요 지표">
          <KpiTile label="총 열람" value={fmtCount(overview?.totalOpenCnt)} unit="회" />
          <KpiTile label="이용자 수" value={fmtCount(overview?.userCnt)} unit="명" />
          <KpiTile label="총 이용 시간" value={overview ? formatDuration(overview.totalDurationMs) : "-"} />
          <KpiTile
            label="미사용 화면"
            value={fmtCount(overview?.unusedScreenCnt)}
            unit="개"
            target={unusedKpiCaption(query)}
          />
        </KpiTileGroup>
      </DashboardCell>
      <DashboardCard span={7} title="일별 열람 추이" subtitle="열람 횟수">
        <LineChart
          data={points}
          height={260}
          color="var(--color-primary)"
          avgColor="var(--color-success)"
          avgLabel="평균"
        />
      </DashboardCard>
      <DashboardCard span={5} title="많이 연 화면" subtitle="상위 10개 · 열람 횟수">
        {/* HBarChart 는 고정 폭 SVG 이고 카드가 overflow:hidden 이라 가로 스크롤을 부모가 맡는다(Local-Rules §17). */}
        <div style={{ overflowX: "auto" }}>
          <HBarChart data={bars} labelWidth={160} chartWidth={280} barHeight={20} />
        </div>
      </DashboardCard>
    </DashboardGrid>
  );
}
```

- [ ] **Step 9: 화면 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/tabs/overview-tab.ts page-components/csa/screenUsageStat/tabs/OverviewTab.tsx tests/csa/screenUsageStat/overview-tab.test.ts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat/tabs tests/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected: vitest 전체 PASS(overview-tab 5 tests 포함), tsc 필터 출력 없음, eslint 0, audit 두 개 `의심 0건`. tsc 가 shared `.d.ts` 를 못 찾으면 `cd src/frontend && pnpm build:libs` 를 먼저 돌린다.

- [ ] **Step 10: 계약 검사와 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQuery.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageOverviewQueryJpaTest.java src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/OverviewTab.tsx src/frontend/m-mcm/tests/csa/screenUsageStat/overview-tab.test.ts
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 개요 탭(합계·추이·상위 화면·미사용 수)을 구현한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task S2: 화면별 (byScreen) — 병렬

**Files:**
- Modify (골격 전체 교체): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQuery.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQueryJpaTest.java`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/screen-tab.ts`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/ScreenTab.tsx`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/screen-tab.test.ts`

**Interfaces:**
- Consumes (F1): `ScreenUsageStatSupport.range/filter/sums/menus/menuNm/groupBy/longDesc/text`, `UsageTotals`, `ScreenUsageStatJpaTestBase`
- Consumes (F2): `StatTabModule`, `StatTabViewProps`, `toExportColumns`, `SCREEN_COLUMNS`, `installFetchMock`, `query`, `emptyData`
- Consumes (기반 화면): `fetchByScreen(q, deptCd?)`, `toExportRows`, `ScreenUsageScreenRow`
- Produces:
  - `ScreenUsageByScreenQuery.byScreen(ScreenUsageStatRequest) : List<Map<String, Object>>` — 행 `pageId, menuNm, menuPath, openCnt, userCnt, durationMs, avgDurationMs(openCnt=0 이면 null), lastUsedDt`, 정렬 열람↓·시간↓·pageId↑. 부서별 탭의 "선택 부서의 화면별" 도 이 action 에 `deptCd` 를 넣어 부른다
  - `screenTab: StatTabModule`, `export default function ScreenTab(props: StatTabViewProps)`

- [ ] **Step 1: 백엔드 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQueryJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;

/** 화면별 — 집계+원본 합산, 완전 일치 조건, 평균(열람 0 이면 null), 메뉴 없음. */
class ScreenUsageByScreenQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageByScreenQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageByScreenQuery(support);
    }

    @Test
    @DisplayName("오늘분은 원본에서 합산해 집계분에 더하고, 집계된 날은 이중으로 세지 않는다")
    void todayFromRawPlusAggregated() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 10, 0), 120_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", USER, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);

        assertThat(query.byScreen(req("20261002", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("pageId", USER)
                        .containsEntry("menuNm", "사용자 관리")
                        .containsEntry("menuPath", "공통관리 > 시스템관리")
                        .containsEntry("openCnt", 3L)
                        .containsEntry("userCnt", 2L)
                        .containsEntry("durationMs", 240_000L)
                        .containsEntry("avgDurationMs", 80_000L)
                        .containsEntry("lastUsedDt", "20261003"));
        assertThat(query.byScreen(req("20261002", "20261002")).get(0))
                .containsEntry("openCnt", 2L).containsEntry("durationMs", 180_000L);
        assertThat(query.byScreen(req("20261003", "20261003")).get(0))
                .containsEntry("openCnt", 1L).containsEntry("durationMs", 60_000L);
    }

    @Test
    @DisplayName("02시 집계 전에도 집계되지 않은 어제분은 원본에서 더해져 빠지지 않는다")
    void beforeRollupYesterdayStillCounted() {
        dayRepository.save(day("20261001", USER, "userA", "D100", 1, 1, 10_000)); // 10-01 까지만 집계됨
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 15, 0), 20_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 0, 30), 5_000);

        assertThat(query.byScreen(req("20261001", "20261003")).get(0))
                .containsEntry("openCnt", 3L)
                .containsEntry("durationMs", 35_000L)
                .containsEntry("userCnt", 2L)
                .containsEntry("lastUsedDt", "20261003");
    }

    @Test
    @DisplayName("조건은 완전 일치 — userId·pageId 앞부분 일치는 걸리지 않고, deptCd '-' 는 집계 '-'·원본 NULL 만 거른다")
    void exactMatchFilters() {
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userAB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();                                                                 // 집계 deptCd '-'
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);   // 원본 NULL
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 1_000);

        ScreenUsageStatRequest noDept = req("20261002", "20261003");
        noDept.setDeptCd("-");
        assertThat(query.byScreen(noDept).get(0)).containsEntry("openCnt", 2L).containsEntry("userCnt", 1L);

        ScreenUsageStatRequest userPrefix = req("20261002", "20261003");
        userPrefix.setUserId("user");
        assertThat(query.byScreen(userPrefix)).isEmpty();

        ScreenUsageStatRequest pagePrefix = req("20261002", "20261003");
        pagePrefix.setPageId("csa/commUser");
        assertThat(query.byScreen(pagePrefix)).isEmpty();

        ScreenUsageStatRequest userA = req("20261002", "20261003");
        userA.setUserId("userA");
        assertThat(query.byScreen(userA).get(0)).containsEntry("openCnt", 3L).containsEntry("userCnt", 1L);
    }

    @Test
    @DisplayName("부서 조건은 집계분과 원본분 모두에 적용된다 (부서별 탭의 선택 부서 화면별)")
    void deptFilter() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        ScreenUsageStatRequest r = req("20261002", "20261003");
        r.setDeptCd("D100");

        assertThat(query.byScreen(r).get(0)).containsEntry("openCnt", 2L).containsEntry("userCnt", 1L);
    }

    @Test
    @DisplayName("열람(OPEN) 없이 전환·재개 구간만 있으면 평균 이용 시간은 null")
    void avgDurationMsNullWhenNoOpen() {
        save("userA", "D100", USER, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", USER, "RESUME", LocalDateTime.of(2026, 10, 3, 9, 30), 10_000);

        assertThat(query.byScreen(req("20261003", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("openCnt", 0L)
                        .containsEntry("durationMs", 40_000L)
                        .containsEntry("avgDurationMs", null));
    }

    @Test
    @DisplayName("메뉴에서 지워진 화면은 (메뉴 없음)·메뉴 경로 null 로 보인다 (Review Focus 1)")
    void unknownMenu() {
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byScreen(req("20261002", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("menuNm", "(메뉴 없음)").containsEntry("menuPath", null)
                        .containsEntry("openCnt", 2L));
    }

    @Test
    @DisplayName("정렬은 열람 많은 순 → 이용 시간 긴 순 → pageId")
    void sortOrder() {
        save("userA", "D100", ROLE, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 1), 5_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 2), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 3), 1_000);

        assertThat(query.byScreen(req("20261003", "20261003")))
                .extracting(r -> r.get("pageId")).containsExactly(USER, MENU, ROLE);
    }
}
```

- [ ] **Step 2: 백엔드 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageByScreenQueryJpaTest`
Expected: FAIL — 골격이 빈 목록을 돌려줘 `Expected size: 1 but was: 0` 등. `exactMatchFilters` 의 `isEmpty` 단언 2개는 골격에서도 통과하지만 앞 단언에서 먼저 실패한다.

- [ ] **Step 3: 백엔드 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * action=byScreen → grids.screens (계약 C4). 부서별 탭의 "선택 부서의 화면별" 도 deptCd 를 넣어 이 action 을 쓴다.
 * avgDurationMs 는 열람 1회당 이용 시간이고, 열람(OPEN)이 0 이면 null 이다(메인 결정 U2-2).
 */
@Component
public class ScreenUsageByScreenQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageByScreenQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> byScreen(ScreenUsageStatRequest request) {
        List<UsageSum> sums = support.sums(ScreenUsageStatSupport.range(request), ScreenUsageStatSupport.filter(request));
        Map<String, MenuInfo> menus = support.menus();

        List<Map<String, Object>> rows = new ArrayList<>();
        ScreenUsageStatSupport.groupBy(sums, UsageSum::pageId, UsageTotals::new).forEach((pageId, t) -> {
            MenuInfo menu = menus.get(pageId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", pageId);
            row.put("menuNm", ScreenUsageStatSupport.menuNm(pageId, menus));
            row.put("menuPath", menu != null ? menu.menuPath() : null);
            row.put("openCnt", t.openCnt);
            row.put("userCnt", (long) t.users.size());
            row.put("durationMs", t.durationMs);
            row.put("avgDurationMs", t.openCnt == 0 ? null : t.durationMs / t.openCnt); // 열람 1회당
            row.put("lastUsedDt", t.lastUsedDt);
            rows.add(row);
        });
        rows.sort(ScreenUsageStatSupport.longDesc("openCnt")
                .thenComparing(ScreenUsageStatSupport.longDesc("durationMs"))
                .thenComparing(ScreenUsageStatSupport.text("pageId")));
        return rows;
    }
}
```

`t.openCnt == 0 ? null : t.durationMs / t.openCnt` 는 삼항 타입이 `Long` 으로 박싱돼 null 이 그대로 들어간다(`long` 언박싱 NPE 없음 — 한쪽이 `null` 리터럴이면 결과형이 `Long`).

- [ ] **Step 4: 백엔드 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageByScreenQueryJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: PASS (7 + 2 + 3)

- [ ] **Step 5: 화면 실패 시험 작성**

`src/frontend/m-mcm/tests/csa/screenUsageStat/screen-tab.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { toExportRows } from "@/page-components/csa/screenUsageStat/format";
import { SCREEN_COLUMNS } from "@/page-components/csa/screenUsageStat/tabs/columns";
import { screenTab } from "@/page-components/csa/screenUsageStat/tabs/screen-tab";
import type { ScreenUsageScreenRow } from "@/page-components/csa/screenUsageStat/types";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

const row = (over: Partial<ScreenUsageScreenRow>): ScreenUsageScreenRow =>
  ({
    pageId: "csa/commUserMng",
    menuNm: "사용자 관리",
    menuPath: "공통관리 > 시스템관리",
    openCnt: 1,
    userCnt: 1,
    durationMs: 60_000,
    avgDurationMs: 60_000,
    lastUsedDt: "20261002",
    ...over,
  }) as ScreenUsageScreenRow;

describe("화면별 탭 조회", () => {
  it("byScreen 을 조회조건 그대로 부르고 grids.screens 를 screens 로 돌려준다", async () => {
    http.reply({ meta: { success: true }, grids: { screens: { rows: [{ pageId: "a/b" }] } } });
    const patch = await screenTab.load(query({ userId: " kim " }));
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/byScreen");
    expect(body.params).toEqual({ fromDt: "20260901", toDt: "20260930", userId: "kim" });
    expect(patch).toEqual({ screens: [{ pageId: "a/b" }] });
  });
});

describe("화면별 표시·엑셀", () => {
  it("평균 이용 시간이 null(열람 0회)이면 그리드·엑셀 모두 빈 칸", () => {
    const avg = SCREEN_COLUMNS.find((c) => c.key === "avgDurationMs");
    expect(avg?.render?.(null, {})).toBe("");
    const out = toExportRows([row({ openCnt: 0, avgDurationMs: null as unknown as number })]);
    expect(out[0].avgDurationMs).toBe("");
  });

  it("메뉴 없는 화면은 서버 문구 '(메뉴 없음)' 을 그대로 내보낸다", () => {
    const target = screenTab.toExport(emptyData({ screens: [row({ menuNm: "(메뉴 없음)", menuPath: "" })] }));
    expect(toExportRows(target.rows)[0].menuNm).toBe("(메뉴 없음)");
  });

  it("엑셀 열은 화면별 그리드 열과 같다", () => {
    const target = screenTab.toExport(emptyData({ screens: [row({})] }));
    expect(target.rows).toHaveLength(1);
    expect(target.columns.map((c) => c.header)).toEqual([
      "화면명",
      "화면 ID",
      "메뉴 경로",
      "열람 횟수",
      "이용자 수",
      "총 이용 시간",
      "평균 이용 시간",
      "마지막 이용일",
    ]);
  });
});
```

- [ ] **Step 6: 화면 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/screen-tab.test.ts`
Expected: FAIL — 골격 `load` 가 fetch 를 부르지 않고(`mock.calls[0]` 없음), `toExport` 가 빈 행·빈 열을 돌려준다. 평균 빈 칸 시험(F 의 `columns.ts`·기반 `format.ts`)은 이미 통과한다.

- [ ] **Step 7: 탭 모듈 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/screen-tab.ts`

```ts
/** 화면별 탭 모듈 — byScreen 조회와 엑셀 대상. shared 를 런타임 import 하지 않는다. */
import { fetchByScreen } from "../api";
import { SCREEN_COLUMNS } from "./columns";
import { toExportColumns, type StatTabModule } from "./tab-contract";

const EXPORT_COLUMNS = toExportColumns(SCREEN_COLUMNS);

export const screenTab: StatTabModule = {
  load: async (q) => ({ screens: await fetchByScreen(q) }),
  toExport: (data) => ({ rows: data.screens, columns: EXPORT_COLUMNS }),
};
```

- [ ] **Step 8: 탭 화면 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/ScreenTab.tsx`

```tsx
"use client";

/** 화면별 탭 화면 — 8열이라 fit. 평균 이용 시간 null(열람 0회)은 빈 칸. */
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import { SCREEN_COLUMNS } from "./columns";
import type { StatTabViewProps } from "./tab-contract";

export default function ScreenTab({ data, busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="화면별 이용" count={data.screens.length}>
          <AgDataGrid
            rowKey="pageId"
            columns={SCREEN_COLUMNS}
            data={data.screens}
            columnSizing="fit"
            loading={busy}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
```

- [ ] **Step 9: 화면 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/tabs/screen-tab.ts page-components/csa/screenUsageStat/tabs/ScreenTab.tsx tests/csa/screenUsageStat/screen-tab.test.ts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat/tabs tests/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected: vitest 전체 PASS, tsc 필터 출력 없음, eslint 0, audit 두 개 `의심 0건`.

- [ ] **Step 10: 계약 검사와 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQuery.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByScreenQueryJpaTest.java src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/screen-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/ScreenTab.tsx src/frontend/m-mcm/tests/csa/screenUsageStat/screen-tab.test.ts
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 화면별 탭을 구현한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task S3: 부서별 (byDept + 선택 부서의 화면별) — 병렬

**Files:**
- Modify (골격 전체 교체): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQuery.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQueryJpaTest.java`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/dept-tab.ts`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/DeptTab.tsx`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/dept-tab.test.ts`

**Interfaces:**
- Consumes (F1): `ScreenUsageStatSupport.range/filter/sums/menus/menuNm/deptNames/deptName/groupBy/longDesc/text`, `UsageTotals`, `ScreenUsageStatJpaTestBase`
- Consumes (F2): `StatTabModule`, `StatTabViewProps`, `toExportColumns`, `countCol`, `durationCol`, `SCREEN_COLUMNS`, `installFetchMock`, `query`, `emptyData`
- Consumes (기반 화면): `fetchByDept(q)`, `fetchByScreen(q, deptCd)`, `statQueryKey`, `createTabRequestTracker<K>()`, `ScreenUsageDeptRow`, `ScreenUsageScreenRow`, shared `useMessage`
- Consumes (S2 와의 관계): 서버 `byScreen` 의 `deptCd` 처리는 S2 가 구현한다. S3 은 그 action 을 화면에서 부르기만 하고 S2 파일을 import 하지 않는다(시험은 fetch 대역).
- Produces:
  - `ScreenUsageByDeptQuery.byDept(ScreenUsageStatRequest) : List<Map<String, Object>>` — 행 `deptCd, deptNm, userCnt, openCnt, durationMs, topPageId, topMenuNm`, 정렬 열람↓·시간↓·deptCd↑, 최다 이용 화면은 열람 → 시간 → pageId 순
  - `deptTab: StatTabModule`, `DEPT_COLUMNS: GridColumn[]`, `nextDeptSelection(row, selected): string | null`, `loadDeptScreens(q, deptCd): Promise<ScreenUsageScreenRow[]>`
  - `export default function DeptTab(props: StatTabViewProps)` — 위 부서별·아래 선택 부서 화면별(높이 40%) 상하 분할

- [ ] **Step 1: 백엔드 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQueryJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** 부서별 — 부서명·이용자 수·최다 이용 화면, 부서 없음은 '-'/(부서 없음), 메뉴 없음(Review Focus 1). */
class ScreenUsageByDeptQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageByDeptQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageByDeptQuery(support);
    }

    @Test
    @DisplayName("부서별 — 부서명·이용자 수·최다 이용 화면, 부서 없음은 '-'/(부서 없음)")
    void byDept() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 60_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 10_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 20), 10_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 25), 10_000);
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);
        save("userC", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 40), 5_000);

        List<Map<String, Object>> rows = query.byDept(req("20261003", "20261003"));

        assertThat(rows).extracting(r -> r.get("deptCd"), r -> r.get("deptNm"), r -> r.get("userCnt"),
                        r -> r.get("openCnt"), r -> r.get("durationMs"), r -> r.get("topPageId"), r -> r.get("topMenuNm"))
                .containsExactly(
                        tuple("D100", "생산관리팀", 2L, 5L, 120_000L, MENU, "메뉴 관리"),
                        tuple("-", "(부서 없음)", 1L, 1L, 5_000L, USER, "사용자 관리"));
    }

    @Test
    @DisplayName("최다 이용 화면 동률은 이용 시간 긴 화면, 그것도 같으면 pageId 앞선 화면")
    void topPageTieBreak() {
        save("userA", "D100", ROLE, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 1), 5_000);
        save("userA", "D200", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 2), 1_000);
        save("userA", "D200", ROLE, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 3), 1_000);

        assertThat(query.byDept(req("20261003", "20261003")))
                .extracting(r -> r.get("deptCd"), r -> r.get("topPageId"))
                .containsExactly(tuple("D100", USER), tuple("D200", MENU));
    }

    @Test
    @DisplayName("메뉴에서 지워진 화면·부서 없는 사용자 — '-'·(부서 없음)·(메뉴 없음), 집계분과 원본분을 합친다")
    void unknownMenuAndNoDept() {
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byDept(req("20261002", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("deptCd", "-").containsEntry("deptNm", "(부서 없음)")
                        .containsEntry("openCnt", 2L).containsEntry("userCnt", 1L)
                        .containsEntry("topPageId", "old/removedScreen")
                        .containsEntry("topMenuNm", "(메뉴 없음)"));
    }

    @Test
    @DisplayName("부서 마스터에 없는 부서코드는 부서명 null")
    void unknownDeptName() {
        save("userA", "D999", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byDept(req("20261003", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D999").containsEntry("deptNm", null));
    }
}
```

- [ ] **Step 2: 백엔드 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageByDeptQueryJpaTest`
Expected: FAIL — 골격이 빈 목록을 돌려줘 4건 모두 실패.

- [ ] **Step 3: 백엔드 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * action=byDept → grids.depts (계약 C4). 부서는 기록 시점 스냅숏(집계 키)이다. 부서 없음은 '-' / "(부서 없음)".
 * "선택 부서의 화면별 내역" 은 화면이 byScreen 에 deptCd 를 넣어 부른다(설계 4.5).
 */
@Component
public class ScreenUsageByDeptQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageByDeptQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> byDept(ScreenUsageStatRequest request) {
        List<UsageSum> sums = support.sums(ScreenUsageStatSupport.range(request), ScreenUsageStatSupport.filter(request));
        Map<String, MenuInfo> menus = support.menus();
        Map<String, DeptTotals> byDept = ScreenUsageStatSupport.groupBy(sums, UsageSum::deptCd, DeptTotals::new);
        Map<String, String> deptNames = support.deptNames(byDept.keySet());

        List<Map<String, Object>> rows = new ArrayList<>(byDept.size());
        byDept.forEach((deptCd, t) -> {
            String topPageId = t.topPageId();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("deptCd", deptCd);
            row.put("deptNm", ScreenUsageStatSupport.deptName(deptCd, deptNames));
            row.put("userCnt", (long) t.users.size());
            row.put("openCnt", t.openCnt);
            row.put("durationMs", t.durationMs);
            row.put("topPageId", topPageId);
            row.put("topMenuNm", topPageId == null ? null : ScreenUsageStatSupport.menuNm(topPageId, menus));
            rows.add(row);
        });
        rows.sort(ScreenUsageStatSupport.longDesc("openCnt")
                .thenComparing(ScreenUsageStatSupport.longDesc("durationMs"))
                .thenComparing(ScreenUsageStatSupport.text("deptCd")));
        return rows;
    }

    /** 부서 합산 + 화면별 열람·시간 — 최다 이용 화면(열람 → 시간 → pageId 순). */
    static final class DeptTotals extends UsageTotals {
        private final Map<String, long[]> pages = new TreeMap<>();

        @Override
        void add(UsageSum s) {
            super.add(s);
            long[] p = pages.computeIfAbsent(s.pageId(), k -> new long[2]);
            p[0] += s.openCnt();
            p[1] += s.durationMs();
        }

        String topPageId() {
            String top = null;
            long[] best = null;
            for (Map.Entry<String, long[]> e : pages.entrySet()) { // TreeMap 이라 동률이면 pageId 앞선 것이 남는다
                long[] v = e.getValue();
                if (best == null || v[0] > best[0] || (v[0] == best[0] && v[1] > best[1])) {
                    top = e.getKey();
                    best = v;
                }
            }
            return top;
        }
    }
}
```

- [ ] **Step 4: 백엔드 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageByDeptQueryJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: PASS (4 + 2 + 3)

- [ ] **Step 5: 화면 실패 시험 작성**

`src/frontend/m-mcm/tests/csa/screenUsageStat/dept-tab.test.ts`

```ts
import { describe, expect, it } from "vitest";

import {
  deptTab,
  loadDeptScreens,
  nextDeptSelection,
} from "@/page-components/csa/screenUsageStat/tabs/dept-tab";
import type { ScreenUsageDeptRow } from "@/page-components/csa/screenUsageStat/types";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

const dept = (deptCd: string, deptNm: string): ScreenUsageDeptRow => ({
  deptCd,
  deptNm,
  userCnt: 1,
  openCnt: 1,
  durationMs: 60_000,
  topPageId: "old/removedScreen",
  topMenuNm: "(메뉴 없음)",
});

describe("부서별 탭 조회", () => {
  it("byDept 를 부르고 grids.depts 를 depts 로 돌려준다", async () => {
    http.reply({ meta: { success: true }, grids: { depts: { rows: [dept("D100", "생산관리팀")] } } });
    const patch = await deptTab.load(query());
    expect(http.sent().url).toBe("/api/mcm/oasis/screenUsageStat/byDept");
    expect(patch.depts).toEqual([dept("D100", "생산관리팀")]);
  });

  it("선택 부서의 화면별은 byScreen 에 그 부서코드를 싣는다 — 부서 없음 '-' 도 그대로", async () => {
    http.reply({ meta: { success: true }, grids: { screens: { rows: [{ pageId: "a/b" }] } } });
    const rows = await loadDeptScreens(query({ deptCd: "D100" }), "-");
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/byScreen");
    expect(body.params.deptCd).toBe("-");
    expect(rows).toEqual([{ pageId: "a/b" }]);
  });
});

describe("부서 행 선택", () => {
  it("다른 부서를 고르면 그 부서코드, 같은 부서·빈 코드면 null(다시 부르지 않음)", () => {
    expect(nextDeptSelection({ deptCd: "D100" }, null)).toBe("D100");
    expect(nextDeptSelection({ deptCd: "-" }, "D100")).toBe("-");
    expect(nextDeptSelection({ deptCd: "D100" }, "D100")).toBeNull();
    expect(nextDeptSelection({ deptCd: "" }, null)).toBeNull();
    expect(nextDeptSelection({}, null)).toBeNull();
  });
});

describe("부서별 엑셀", () => {
  it("부서 목록을 내보내고 부서 없음·메뉴 없음 문구를 그대로 둔다", () => {
    const target = deptTab.toExport(emptyData({ depts: [dept("-", "(부서 없음)")] }));
    expect(target.rows[0]).toMatchObject({ deptCd: "-", deptNm: "(부서 없음)", topMenuNm: "(메뉴 없음)" });
    expect(target.columns.map((c) => c.header)).toEqual([
      "부서코드",
      "부서명",
      "이용자 수",
      "열람 횟수",
      "이용 시간",
      "최다 이용 화면",
    ]);
  });
});
```

- [ ] **Step 6: 화면 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/dept-tab.test.ts`
Expected: FAIL — `loadDeptScreens`·`nextDeptSelection` 이 export 되지 않았고 골격 `load` 가 fetch 를 부르지 않는다.

- [ ] **Step 7: 탭 모듈 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/dept-tab.ts`

```ts
/** 부서별 탭 모듈 — byDept 조회, 선택 부서의 화면별(byScreen + deptCd), 엑셀 대상. shared 를 런타임 import 하지 않는다. */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { fetchByDept, fetchByScreen } from "../api";
import type { ScreenUsageScreenRow, StatFilters } from "../types";
import { countCol, durationCol } from "./columns";
import { toExportColumns, type StatTabModule } from "./tab-contract";

export const DEPT_COLUMNS: GridColumn[] = [
  { key: "deptCd", header: "부서코드", width: 120, align: "left" },
  { key: "deptNm", header: "부서명", width: 180, align: "left" },
  countCol("userCnt", "이용자 수"),
  countCol("openCnt", "열람 횟수"),
  durationCol("durationMs", "이용 시간"),
  { key: "topMenuNm", header: "최다 이용 화면", width: 100, minWidth: 180, align: "left" },
];

const EXPORT_COLUMNS = toExportColumns(DEPT_COLUMNS);

export const deptTab: StatTabModule = {
  load: async (q) => ({ depts: await fetchByDept(q) }),
  toExport: (data) => ({ rows: data.depts, columns: EXPORT_COLUMNS }),
};

/**
 * 부서 행을 눌렀을 때(↑↓ 이동 포함) 새로 부를 부서코드. 같은 부서이거나 코드가 비면 null(부르지 않음).
 * 부서 없음 '-' 도 하나의 부서로 고른다(서버가 '-' 를 부서 없는 구간으로 거른다).
 */
export function nextDeptSelection(row: Record<string, unknown>, selected: string | null): string | null {
  const deptCd = String(row.deptCd ?? "");
  return deptCd && deptCd !== selected ? deptCd : null;
}

/** 선택 부서의 화면별 — [조회] 로 고정한 조건에 부서만 바꿔 byScreen 을 부른다. */
export function loadDeptScreens(q: StatFilters, deptCd: string): Promise<ScreenUsageScreenRow[]> {
  return fetchByScreen(q, deptCd);
}
```

- [ ] **Step 8: 탭 화면 구현**

U3 Task 3 의 부서 상세 로직(`handleDeptRowClick`, `detailTracker`, 부서별을 다시 받으면 선택·아래 목록 비우기)을 탭 안으로 옮겼다. 부서 목록이 바뀐 것은 `data.depts` 참조로 알아낸다. effect 안에서 setState 를 부르지 않도록(react-hooks/set-state-in-effect) 선택을 "어느 목록에서 고른 것인지" 와 함께 저장하고, 목록이 바뀌면 선택이 없는 것으로 읽는다.

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/DeptTab.tsx`

```tsx
"use client";

/**
 * 부서별 탭 화면 — 위 부서별, 아래 선택 부서의 화면별(높이 40%) 상하 분할.
 * - AgDataGrid 는 ↑↓ 이동에도 onRowClick 을 부른다. 같은 부서는 다시 부르지 않고, 늦게 온 이전 응답은 버린다.
 * - 부서별을 다시 받으면(data.depts 가 바뀌면) 선택과 아래 목록은 없는 것으로 본다.
 */
import { useCallback, useState } from "react";

import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { createTabRequestTracker } from "../api";
import type { ScreenUsageDeptRow, ScreenUsageScreenRow } from "../types";
import { SCREEN_COLUMNS } from "./columns";
import { DEPT_COLUMNS, loadDeptScreens, nextDeptSelection } from "./dept-tab";
import type { StatTabViewProps } from "./tab-contract";

interface DeptDetail {
  /** 이 선택을 한 부서 목록(참조). 목록이 바뀌면 선택은 무효다. */
  source: ScreenUsageDeptRow[];
  deptCd: string;
  rows: ScreenUsageScreenRow[];
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function DeptTab({ data, query, busy }: StatTabViewProps) {
  const { showMessage } = useMessage();
  const [detail, setDetail] = useState<DeptDetail | null>(null);
  const [isDetailBusy, setIsDetailBusy] = useState(false);
  const [detailTracker] = useState(() => createTabRequestTracker<"deptScreens">());

  const current = detail && detail.source === data.depts ? detail : null;
  const selectedDeptCd = current?.deptCd ?? null;

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const deptCd = nextDeptSelection(row, selectedDeptCd);
      if (!query || !deptCd) return;
      const source = data.depts;
      setDetail({ source, deptCd, rows: [] });
      const n = detailTracker.begin("deptScreens");
      setIsDetailBusy(true);
      void (async () => {
        try {
          const rows = await loadDeptScreens(query, deptCd);
          if (detailTracker.isLatest("deptScreens", n)) setDetail({ source, deptCd, rows });
        } catch (e) {
          if (detailTracker.isLatest("deptScreens", n)) {
            showMessage({ title: "오류", message: errorText(e), alertType: "error" });
          }
        } finally {
          setIsDetailBusy(detailTracker.finish());
        }
      })();
    },
    [query, selectedDeptCd, data.depts, detailTracker, showMessage],
  );

  const deptScreens = current?.rows ?? [];

  return (
    <ContentBody root direction="column" resizable storageKey="mcm.csa.screenUsageStat">
      <ContentPanel>
        <GridPanel title="부서별 이용" count={data.depts.length}>
          <AgDataGrid
            rowKey="deptCd"
            columns={DEPT_COLUMNS}
            data={data.depts}
            columnSizing="fit"
            highlightedRowKey={selectedDeptCd}
            onRowClick={handleRowClick}
            loading={busy}
          />
        </GridPanel>
      </ContentPanel>
      <ContentPanel height="40%">
        <GridPanel title="선택 부서의 화면별 이용" count={deptScreens.length}>
          <AgDataGrid
            rowKey="pageId"
            columns={SCREEN_COLUMNS}
            data={deptScreens}
            columnSizing="fit"
            loading={isDetailBusy && current !== null}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
```

메모(실행자 확인용):
- 탭을 떠났다 오면 이 화면이 다시 마운트돼 선택은 풀린다(부서 목록은 page 가 들고 있어 다시 부르지 않는다). U3 원안은 선택을 유지했지만 슬라이스 분리 뒤에는 탭 안 상태라 풀린다. 보고 대상이다.
- 늦게 온 응답이 다른 목록에서 고른 것이면 `source` 가 달라 화면에 보이지 않는다.
- eslint-config-next 16(react-hooks 7.1.1)이 `useState` 로 든 `detailTracker` 의 메서드 호출을 잡으면 `useRef(createTabRequestTracker<"deptScreens">())` 로 바꾸고 `.current` 는 콜백 안에서만 읽는다(렌더 중에 읽지 않는다). page.tsx 메모와 같다.

- [ ] **Step 9: 화면 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/tabs/dept-tab.ts page-components/csa/screenUsageStat/tabs/DeptTab.tsx tests/csa/screenUsageStat/dept-tab.test.ts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat/tabs tests/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected: vitest 전체 PASS, tsc 필터 출력 없음, eslint 0, audit 두 개 `의심 0건`.

- [ ] **Step 10: 계약 검사와 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQuery.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByDeptQueryJpaTest.java src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/dept-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/DeptTab.tsx src/frontend/m-mcm/tests/csa/screenUsageStat/dept-tab.test.ts
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 부서별 탭과 선택 부서의 화면별 내역을 구현한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task S4: 사용자별 (byUser) — 병렬

**Files:**
- Modify (골격 전체 교체): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQuery.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQueryJpaTest.java`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/user-tab.ts`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UserTab.tsx`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/user-tab.test.ts`

**Interfaces:**
- Consumes (F1): `ScreenUsageStatSupport.range/filter/sums/userNames/deptNames/deptName/groupBy/longDesc/text`, `UsageTotals`, `Filter`, `ScreenUsageStatJpaTestBase`
- Consumes (기반): `ScreenUsageLogRepository.findHistory(from, to, userId, deptCd, pageId, Pageable)`, `ScreenUsageDates.parseDt`, `ScreenUsageAggregator.normalizeDept`, `UsageFixtures.day`
- Consumes (F2): `StatTabModule`, `StatTabViewProps`, `toExportColumns`, `countCol`, `durationCol`, `ymdCol`, `installFetchMock`, `query`, `emptyData`
- Consumes (기반 화면): `fetchByUser(q)`(행마다 `rowKey = userId|deptCd`), `ScreenUsageUserGridRow`
- Produces:
  - `ScreenUsageByUserQuery.byUser(ScreenUsageStatRequest) : List<Map<String, Object>>` — **사용자당 1행** `userId, userNm, deptCd, deptNm, openCnt, durationMs, lastUsedDt`. 부서는 기간 안 마지막 이용 구간의 부서(마지막 이용일에 부서가 둘 이상이면 그날 원본에서 가장 늦게 시작한 구간). 정렬 열람↓·시간↓·userId↑
  - `userTab: StatTabModule`, `USER_COLUMNS: GridColumn[]`, `export default function UserTab(props: StatTabViewProps)`

- [ ] **Step 1: 백엔드 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQueryJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** 사용자별 — 사용자당 1행, 부서는 기간 안 마지막 이용 구간의 부서(C4 보충 3). */
class ScreenUsageByUserQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageByUserQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageByUserQuery(support, logRepository);
    }

    @Test
    @DisplayName("사용자별 — 이름·부서·열람·시간·마지막 이용일, 이름 모르는 사용자는 userNm null, 부서 없음은 '-'")
    void byUser() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 60_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 30_000);
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);
        save("userC", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 40), 5_000);

        List<Map<String, Object>> rows = query.byUser(req("20261003", "20261003"));

        assertThat(rows).extracting(r -> r.get("userId"), r -> r.get("userNm"), r -> r.get("deptCd"), r -> r.get("deptNm"),
                        r -> r.get("openCnt"), r -> r.get("durationMs"), r -> r.get("lastUsedDt"))
                .containsExactly(
                        tuple("userA", "김철수", "D100", "생산관리팀", 2L, 90_000L, "20261003"),
                        tuple("userB", "이영희", "D100", "생산관리팀", 1L, 30_000L, "20261003"),
                        tuple("userC", null, "-", "(부서 없음)", 1L, 5_000L, "20261003"));
    }

    @Test
    @DisplayName("사용자별 부서는 가장 최근 이용일의 부서이고, 부서가 바뀌어도 사용자당 1행이다")
    void byUserLatestDept() {
        dayRepository.save(day("20261001", USER, "userA", "D100", 1, 1, 1_000));
        save("userA", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byUser(req("20261001", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D200").containsEntry("openCnt", 2L)
                        .containsEntry("durationMs", 2_000L).containsEntry("lastUsedDt", "20261003"));
    }

    @Test
    @DisplayName("마지막 이용일에 부서가 둘이면 그날 가장 늦게 시작한 구간의 부서 (집계분·원본분 모두)")
    void byUserSameDayDeptChange() {
        // 집계분: 10-02 에 D100·D200 두 행 → 시각이 없으므로 그날 원본에서 가장 늦은 구간(15:00, D200)으로 정한다
        dayRepository.save(day("20261002", USER, "userA", "D100", 1, 1, 1_000));
        dayRepository.save(day("20261002", USER, "userA", "D200", 1, 1, 1_000));
        save("userA", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 15, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        assertThat(query.byUser(req("20261002", "20261002"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D200").containsEntry("openCnt", 2L));

        // 원본분(오늘): 저장 순서와 무관하게 시작 시각이 늦은 11:00(D100) 구간의 부서
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 11, 0), 1_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        assertThat(query.byUser(req("20261003", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("userId", "userB")
                        .containsEntry("deptCd", "D100").containsEntry("deptNm", "생산관리팀"));
    }

    @Test
    @DisplayName("부서 조건을 주면 그 부서 구간만 합산하고 부서도 그 부서다")
    void deptFilterKeepsOneRow() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 10, 0), 1_000);
        var r = req("20261003", "20261003");
        r.setDeptCd("D100");

        assertThat(query.byUser(r)).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D100").containsEntry("openCnt", 1L));
    }
}
```

- [ ] **Step 2: 백엔드 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageByUserQueryJpaTest`
Expected: FAIL — 골격이 빈 목록을 돌려줘 4건 모두 실패.

- [ ] **Step 3: 백엔드 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Filter;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * action=byUser → grids.users (계약 C4). 사용자당 1행, 부서는 기간 안 마지막 이용 구간의 부서(C4 보충 3).
 * 일 단위로 먼저 가리고, 마지막 이용일에 부서가 둘 이상이면 집계 테이블에는 시각이 없으므로 그날 원본(1년 보관)에서
 * 같은 조건으로 가장 늦게 시작한 구간 1건을 읽어 정한다.
 */
@Component
public class ScreenUsageByUserQuery {

    private final ScreenUsageStatSupport support;
    private final ScreenUsageLogRepository logRepository;

    public ScreenUsageByUserQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository) {
        this.support = support;
        this.logRepository = logRepository;
    }

    public List<Map<String, Object>> byUser(ScreenUsageStatRequest request) {
        Filter filter = ScreenUsageStatSupport.filter(request);
        List<UsageSum> sums = support.sums(ScreenUsageStatSupport.range(request), filter);
        Map<String, UserTotals> byUser = ScreenUsageStatSupport.groupBy(sums, UsageSum::userId, UserTotals::new);

        Map<String, String> deptByUser = new HashMap<>();
        byUser.forEach((userId, t) -> deptByUser.put(userId, lastSegmentDept(userId, t, filter)));
        Map<String, String> userNames = support.userNames(byUser.keySet());
        Map<String, String> deptNames = support.deptNames(new HashSet<>(deptByUser.values()));

        List<Map<String, Object>> rows = new ArrayList<>(byUser.size());
        byUser.forEach((userId, t) -> {
            String deptCd = deptByUser.get(userId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("userId", userId);
            row.put("userNm", userNames.get(userId));
            row.put("deptCd", deptCd);
            row.put("deptNm", ScreenUsageStatSupport.deptName(deptCd, deptNames));
            row.put("openCnt", t.openCnt);
            row.put("durationMs", t.durationMs);
            row.put("lastUsedDt", t.lastUsedDt);
            rows.add(row);
        });
        rows.sort(ScreenUsageStatSupport.longDesc("openCnt")
                .thenComparing(ScreenUsageStatSupport.longDesc("durationMs"))
                .thenComparing(ScreenUsageStatSupport.text("userId")));
        return rows;
    }

    /** 마지막 이용일의 부서가 하나면 그대로, 둘 이상이면 그날 원본에서 가장 늦게 시작한 구간의 부서. */
    private String lastSegmentDept(String userId, UserTotals t, Filter filter) {
        String first = t.latestDepts.iterator().next();
        if (t.latestDepts.size() == 1) {
            return first;
        }
        LocalDate day = ScreenUsageDates.parseDt(t.lastUsedDt);
        List<ScreenUsageLog> last = logRepository.findHistory(day.atStartOfDay(), day.plusDays(1).atStartOfDay(),
                userId, filter.deptCd(), filter.pageId(), PageRequest.of(0, 1));
        return last.isEmpty() ? first : ScreenUsageAggregator.normalizeDept(last.get(0).getDeptCd());
    }

    /** 사용자 합산 + 마지막 이용일에 쓰인 부서들(하나면 확정, 둘 이상이면 원본으로 가린다). */
    static final class UserTotals extends UsageTotals {
        final Set<String> latestDepts = new TreeSet<>();

        @Override
        void add(UsageSum s) {
            String before = lastUsedDt;
            super.add(s);
            if (before == null || s.lastUsedDt().compareTo(before) > 0) {
                latestDepts.clear();
                latestDepts.add(s.deptCd());
            } else if (s.lastUsedDt().equals(before)) {
                latestDepts.add(s.deptCd());
            }
        }
    }
}
```

- [ ] **Step 4: 백엔드 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageByUserQueryJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: PASS (4 + 2 + 3)

- [ ] **Step 5: 화면 실패 시험 작성**

`src/frontend/m-mcm/tests/csa/screenUsageStat/user-tab.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { toExportRows } from "@/page-components/csa/screenUsageStat/format";
import { userTab } from "@/page-components/csa/screenUsageStat/tabs/user-tab";
import type { ScreenUsageUserGridRow } from "@/page-components/csa/screenUsageStat/types";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

const user = (over: Partial<ScreenUsageUserGridRow>): ScreenUsageUserGridRow => ({
  userId: "kim",
  userNm: "김철수",
  deptCd: "D100",
  deptNm: "생산관리팀",
  openCnt: 2,
  durationMs: 90_000,
  lastUsedDt: "20261003",
  rowKey: "kim|D100",
  ...over,
});

describe("사용자별 탭 조회", () => {
  it("byUser 를 부르고 행 키를 붙인 users 를 돌려준다", async () => {
    http.reply({ meta: { success: true }, grids: { users: { rows: [{ userId: "kim", deptCd: "-" }] } } });
    const patch = await userTab.load(query({ deptCd: "-" }));
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/byUser");
    expect(body.params.deptCd).toBe("-");
    expect(patch.users?.map((r) => r.rowKey)).toEqual(["kim|-"]);
  });
});

describe("사용자별 엑셀", () => {
  it("부서 없음 사용자는 '(부서 없음)' 그대로, 마지막 이용일은 yyyy-MM-dd, 이용 시간은 읽는 글자", () => {
    const target = userTab.toExport(emptyData({ users: [user({ deptCd: "-", deptNm: "(부서 없음)" })] }));
    const out = toExportRows(target.rows)[0];
    expect(out.deptNm).toBe("(부서 없음)");
    expect(out.lastUsedDt).toBe("2026-10-03");
    expect(out.durationMs).toBe("1분");
    expect(target.columns.map((c) => c.key)).toEqual([
      "userId",
      "userNm",
      "deptNm",
      "openCnt",
      "durationMs",
      "lastUsedDt",
    ]);
  });
});
```

- [ ] **Step 6: 화면 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/user-tab.test.ts`
Expected: FAIL — 골격 `load` 가 fetch 를 부르지 않고 `toExport` 가 빈 행을 돌려준다.

- [ ] **Step 7: 탭 모듈 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/user-tab.ts`

```ts
/** 사용자별 탭 모듈 — byUser 조회(서버가 사용자당 1행)와 엑셀 대상. shared 를 런타임 import 하지 않는다. */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { fetchByUser } from "../api";
import { countCol, durationCol, ymdCol } from "./columns";
import { toExportColumns, type StatTabModule } from "./tab-contract";

export const USER_COLUMNS: GridColumn[] = [
  { key: "userId", header: "사용자 ID", width: 120, align: "left" },
  { key: "userNm", header: "사용자명", width: 180, align: "left" },
  { key: "deptNm", header: "부서", width: 100, minWidth: 180, align: "left" },
  countCol("openCnt", "열람 횟수"),
  durationCol("durationMs", "이용 시간"),
  ymdCol("lastUsedDt", "마지막 이용일"),
];

const EXPORT_COLUMNS = toExportColumns(USER_COLUMNS);

export const userTab: StatTabModule = {
  load: async (q) => ({ users: await fetchByUser(q) }),
  toExport: (data) => ({ rows: data.users, columns: EXPORT_COLUMNS }),
};
```

- [ ] **Step 8: 탭 화면 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UserTab.tsx`

```tsx
"use client";

/** 사용자별 탭 화면 — 행 키는 api.ts 가 붙인 rowKey(userId|deptCd). 서버가 사용자당 1행을 주므로 겹치지 않는다. */
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";
import { USER_COLUMNS } from "./user-tab";

export default function UserTab({ data, busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="사용자별 이용" count={data.users.length}>
          <AgDataGrid rowKey="rowKey" columns={USER_COLUMNS} data={data.users} columnSizing="fit" loading={busy} />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
```

- [ ] **Step 9: 화면 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/tabs/user-tab.ts page-components/csa/screenUsageStat/tabs/UserTab.tsx tests/csa/screenUsageStat/user-tab.test.ts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat/tabs tests/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected: vitest 전체 PASS, tsc 필터 출력 없음, eslint 0, audit 두 개 `의심 0건`.

- [ ] **Step 10: 계약 검사와 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQuery.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageByUserQueryJpaTest.java src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/user-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UserTab.tsx src/frontend/m-mcm/tests/csa/screenUsageStat/user-tab.test.ts
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 사용자별 탭을 사용자당 1행·마지막 이용 부서로 구현한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task S5: 미사용 화면 (unused) — 병렬

**Files:**
- Modify (골격 전체 교체): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQuery.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQueryJpaTest.java`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/unused-tab.ts`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UnusedTab.tsx`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/unused-tab.test.ts`

**Interfaces:**
- Consumes (F1): `ScreenUsageStatSupport.menus/unusedScreens/unusedDays`, `UnusedScreen`, `ScreenUsageStatJpaTestBase`(`addMenu`, `PERM`)
- Consumes (기반): `UsageFixtures.day`
- Consumes (F2): `StatTabModule`, `StatTabViewProps`, `toExportColumns`, `installFetchMock`, `query`, `emptyData`
- Consumes (기반 화면): `fetchUnused(q)`, `formatYmd`, `ScreenUsageUnusedRow`
- Produces:
  - `ScreenUsageUnusedQuery.unused(ScreenUsageStatRequest) : List<Map<String, Object>>` — 행 `pageId, menuNm, menuPath, lastUsedDt(없으면 null)`, 기간 파라미터 무시
  - `unusedTab: StatTabModule`, `UNUSED_COLUMNS: GridColumn[]`, `lastUsedText(v: unknown): string`, `export default function UnusedTab(props: StatTabViewProps)`

- [ ] **Step 1: 백엔드 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQueryJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** 미사용 화면 — 오늘 포함 최근 N일 이용 기록이 없는 표시 메뉴. 개요 미사용 수와 같은 규칙(F 의 unusedScreens). */
class ScreenUsageUnusedQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageUnusedQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageUnusedQuery(support);
    }

    @Test
    @DisplayName("미사용 — 창 시작일 당일 이용은 사용, 원본 SWITCH 도 이용, 기간 파라미터 없이 기본 90일")
    void unusedBoundary() {
        addMenu(PERM, "권한 관리", true);
        // 오늘 10-03, 90일 창 시작 = 10-03 - 89일 = 2026-07-06
        dayRepository.save(day("20260706", USER, "userA", "D100", 1, 1, 1_000)); // 창 시작일 → 사용
        dayRepository.save(day("20260705", MENU, "userA", "D100", 1, 1, 1_000)); // 창 밖 → 미사용
        save("userA", "D100", PERM, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000); // 원본·SWITCH 도 이용

        ScreenUsageStatRequest r90 = new ScreenUsageStatRequest();
        r90.setUnusedDays(90);
        assertThat(query.unused(r90))
                .extracting(r -> r.get("pageId"), r -> r.get("menuNm"), r -> r.get("menuPath"), r -> r.get("lastUsedDt"))
                .containsExactly(
                        tuple(MENU, "메뉴 관리", "공통관리 > 시스템관리", "20260705"),
                        tuple(ROLE, "역할 관리", "공통관리 > 시스템관리", null));

        assertThat(query.unused(new ScreenUsageStatRequest())).hasSize(2); // 기본 90일, 기간 파라미터 불필요

        ScreenUsageStatRequest r89 = new ScreenUsageStatRequest();
        r89.setUnusedDays(89); // 창 시작 07-07 → USER 도 미사용
        assertThat(query.unused(r89)).extracting(r -> r.get("pageId")).containsExactly(MENU, ROLE, USER);
    }

    @Test
    @DisplayName("표시하지 않는 메뉴(MENU_VIEW_YN·USE_TP 가 Y 아님)는 이용이 없어도 미사용 목록에 없다")
    void hiddenMenuExcluded() {
        assertThat(query.unused(new ScreenUsageStatRequest())).extracting(r -> r.get("pageId"))
                .containsExactly(MENU, ROLE, USER)
                .doesNotContain(HIDDEN);
    }

    @Test
    @DisplayName("기간 파라미터가 형식에 맞지 않아도 무시한다(unused 는 기간을 쓰지 않는다)")
    void ignoresPeriod() {
        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        r.setFromDt("bad");
        r.setToDt("20000101");
        assertThat(query.unused(r)).hasSize(3);
    }
}
```

- [ ] **Step 2: 백엔드 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageUnusedQueryJpaTest`
Expected: FAIL — 골격이 빈 목록을 돌려줘 3건 모두 실패.

- [ ] **Step 3: 백엔드 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UnusedScreen;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * action=unused → grids.unused (계약 C4). 기간 파라미터는 무시하고 unusedDays(기본 90)만 쓴다.
 * 판정 규칙은 개요의 미사용 수와 같아야 하므로 ScreenUsageStatSupport.unusedScreens 에 둔다.
 */
@Component
public class ScreenUsageUnusedQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageUnusedQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> unused(ScreenUsageStatRequest request) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UnusedScreen u : support.unusedScreens(support.menus(), ScreenUsageStatSupport.unusedDays(request))) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", u.menu().pageId());
            row.put("menuNm", u.menu().menuNm());
            row.put("menuPath", u.menu().menuPath());
            row.put("lastUsedDt", u.lastUsedDt());
            rows.add(row);
        }
        return rows;
    }
}
```

- [ ] **Step 4: 백엔드 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageUnusedQueryJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: PASS (3 + 2 + 3)

- [ ] **Step 5: 화면 실패 시험 작성**

`src/frontend/m-mcm/tests/csa/screenUsageStat/unused-tab.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { lastUsedText, unusedTab } from "@/page-components/csa/screenUsageStat/tabs/unused-tab";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

describe("미사용 화면 탭 조회", () => {
  it("unused 를 부르고 기준 일수를 숫자로 싣는다(비면 90)", async () => {
    http.reply({ meta: { success: true }, grids: { unused: { rows: [{ pageId: "a/b", lastUsedDt: null }] } } });
    const patch = await unusedTab.load(query({ unusedDays: "" }));
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/unused");
    expect(body.params.unusedDays).toBe(90);
    expect(patch.unused).toEqual([{ pageId: "a/b", lastUsedDt: null }]);
  });

  it("기준 일수 30 은 숫자 30 으로 보낸다", async () => {
    http.reply({ meta: { success: true }, grids: { unused: { rows: [] } } });
    await unusedTab.load(query({ unusedDays: "30" }));
    expect(http.sent().body.params.unusedDays).toBe(30);
  });
});

describe("마지막 이용일 표시", () => {
  it("기록이 없으면 '기록 없음', 있으면 yyyy-MM-dd", () => {
    expect(lastUsedText(null)).toBe("기록 없음");
    expect(lastUsedText("")).toBe("기록 없음");
    expect(lastUsedText("20260705")).toBe("2026-07-05");
  });
});

describe("미사용 화면 엑셀", () => {
  it("미사용 목록을 화면명·화면 ID·메뉴 경로·마지막 이용일 열로 내보낸다", () => {
    const rows = [{ pageId: "a/b", menuNm: "메뉴 관리", menuPath: "공통관리", lastUsedDt: null }];
    const target = unusedTab.toExport(emptyData({ unused: rows }));
    expect(target.rows).toEqual(rows);
    expect(target.columns.map((c) => c.header)).toEqual(["화면명", "화면 ID", "메뉴 경로", "마지막 이용일"]);
  });
});
```

- [ ] **Step 6: 화면 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/unused-tab.test.ts`
Expected: FAIL — `lastUsedText` 가 export 되지 않았고 골격 `load` 가 fetch 를 부르지 않는다.

- [ ] **Step 7: 탭 모듈 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/unused-tab.ts`

```ts
/** 미사용 화면 탭 모듈 — unused 조회(기준 일수)와 엑셀 대상. shared 를 런타임 import 하지 않는다. */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { fetchUnused } from "../api";
import { formatYmd } from "../format";
import { toExportColumns, type StatTabModule } from "./tab-contract";

/** 마지막 이용일 — 이용 기록이 한 번도 없으면 "기록 없음". */
export const lastUsedText = (v: unknown): string => formatYmd(v) || "기록 없음";

export const UNUSED_COLUMNS: GridColumn[] = [
  { key: "menuNm", header: "화면명", width: 180, align: "left" },
  { key: "pageId", header: "화면 ID", width: 120, align: "left" },
  { key: "menuPath", header: "메뉴 경로", width: 100, minWidth: 180, align: "left" },
  { key: "lastUsedDt", header: "마지막 이용일", width: 100, align: "center", render: (v) => lastUsedText(v) },
];

const EXPORT_COLUMNS = toExportColumns(UNUSED_COLUMNS);

export const unusedTab: StatTabModule = {
  load: async (q) => ({ unused: await fetchUnused(q) }),
  toExport: (data) => ({ rows: data.unused, columns: EXPORT_COLUMNS }),
};
```

- [ ] **Step 8: 탭 화면 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UnusedTab.tsx`

```tsx
"use client";

/** 미사용 화면 탭 화면 — 기준 일수 입력 칸은 page.tsx 검색 영역에 있다(개요·미사용 탭에서 보임). */
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";
import { UNUSED_COLUMNS } from "./unused-tab";

export default function UnusedTab({ data, busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="미사용 화면" count={data.unused.length}>
          <AgDataGrid rowKey="pageId" columns={UNUSED_COLUMNS} data={data.unused} columnSizing="fit" loading={busy} />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
```

- [ ] **Step 9: 화면 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/tabs/unused-tab.ts page-components/csa/screenUsageStat/tabs/UnusedTab.tsx tests/csa/screenUsageStat/unused-tab.test.ts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat/tabs tests/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected: vitest 전체 PASS, tsc 필터 출력 없음, eslint 0, audit 두 개 `의심 0건`.

- [ ] **Step 10: 계약 검사와 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQuery.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageUnusedQueryJpaTest.java src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/unused-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/UnusedTab.tsx src/frontend/m-mcm/tests/csa/screenUsageStat/unused-tab.test.ts
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 미사용 화면 탭을 구현한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task S6: 이용 이력 (history) — 병렬

**Files:**
- Modify (골격 전체 교체): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQuery.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQueryJpaTest.java`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/history-tab.ts`
- Modify (골격 전체 교체): `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/HistoryTab.tsx`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/history-tab.test.ts`

**Interfaces:**
- Consumes (F1): `ScreenUsageStatSupport.range/filter/menus/menuNm/userNames/deptNames/deptName`, `Range`, `Filter`, `ScreenUsageStatJpaTestBase`
- Consumes (기반): `ScreenUsageLogRepository.findHistory(from, to, userId, deptCd, pageId, Pageable)`(최신순, deptCd '-' 는 NULL), `ScreenUsageDates.timestamp`, `ScreenUsageAggregator.normalizeDept`, `UsageFixtures.log`, `BusinessException`·`ErrorCode.INVALID_VALUE`
- Consumes (F2): `StatTabModule`, `StatTabViewProps`, `ExportColumn`, `durationCol`, `installFetchMock`, `query`, `emptyData`
- Consumes (기반 화면): `fetchHistory(q)`, `checkHistoryPeriod(from, to)`(메인 결정 U3-5 반영본), `startKindLabel`, `ScreenUsageHistoryRow`, shared `GridBadge`
- Produces:
  - `ScreenUsageHistoryQuery.history(ScreenUsageStatRequest) : List<Map<String, Object>>` — 행 `usageId, userId, userNm, deptCd, deptNm, pageId, menuNm, startKind, startedAt, endedAt, durationMs, clientIp`, 시각은 `yyyy-MM-dd HH:mm:ss`
  - 상수 `HISTORY_MAX_DAYS = 31`(시작·종료일 포함, `DAYS.between ≤ 30`), `HISTORY_MAX_ROWS = 10_000`. 테스트용 package-private 생성자 `(support, logRepository, int maxRows)`
  - `historyTab: StatTabModule`(`check` 있음), `HISTORY_EXPORT_COLUMNS: ExportColumn[]`, `HISTORY_ROW_LIMIT = 10_000`, `historyLimitNotice(rowCount: number): string | null`
  - `export default function HistoryTab(props: StatTabViewProps)`

- [ ] **Step 1: 백엔드 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQueryJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** 이용 이력 — 원본 그대로 최신순, 31일(시작·종료일 포함) 경계, 10,000행 상한, 완전 일치, 메뉴·부서 없음. */
class ScreenUsageHistoryQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageHistoryQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageHistoryQuery(support, logRepository);
    }

    @Test
    @DisplayName("원본 그대로 최신순, 이름·부서명·메뉴명을 붙이고 시각은 yyyy-MM-dd HH:mm:ss")
    void historyRows() {
        ScreenUsageLog first = log("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0, 5), 61_000);
        first.setClientIp("10.0.0.7");
        logRepository.save(first);
        save("userB", null, MENU, "RESUME", LocalDateTime.of(2026, 10, 3, 8, 0), 1_000);

        List<Map<String, Object>> rows = query.history(req("20261002", "20261003"));

        assertThat(rows).extracting(r -> r.get("userId")).containsExactly("userB", "userA");
        assertThat(rows.get(1)).containsEntry("usageId", first.getUsageId())
                .containsEntry("userNm", "김철수")
                .containsEntry("deptCd", "D100")
                .containsEntry("deptNm", "생산관리팀")
                .containsEntry("pageId", USER)
                .containsEntry("menuNm", "사용자 관리")
                .containsEntry("startKind", "OPEN")
                .containsEntry("startedAt", "2026-10-02 09:00:05")
                .containsEntry("endedAt", "2026-10-02 09:01:06")
                .containsEntry("durationMs", 61_000L)
                .containsEntry("clientIp", "10.0.0.7");
        assertThat(rows.get(0)).containsEntry("deptCd", "-").containsEntry("deptNm", "(부서 없음)")
                .containsEntry("clientIp", null);
    }

    @Test
    @DisplayName("기간은 시작·종료일 포함 31일까지 — 31일 통과, 32일 INVALID_VALUE (메인 결정 U2-1)")
    void historyPeriodBoundary() {
        assertThatCode(() -> query.history(req("20260903", "20261003"))).doesNotThrowAnyException(); // 31일
        assertThatCode(() -> query.history(req("20261003", "20261003"))).doesNotThrowAnyException(); // 1일
        BusinessException e = assertThrows(BusinessException.class,
                () -> query.history(req("20260902", "20261003")));                                     // 32일
        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(e.getMessage()).contains("31일");
    }

    @Test
    @DisplayName("최신순 상한(기본 10,000행)까지만 돌려준다")
    void historyMaxRows() {
        assertThat(ScreenUsageHistoryQuery.HISTORY_MAX_ROWS).isEqualTo(10_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 1), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 2), 1_000);
        ScreenUsageHistoryQuery capped = new ScreenUsageHistoryQuery(support, logRepository, 2);

        assertThat(capped.history(req("20261003", "20261003")))
                .extracting(r -> r.get("startedAt"))
                .containsExactly("2026-10-03 09:02:00", "2026-10-03 09:01:00");
    }

    @Test
    @DisplayName("조건은 완전 일치 — 앞부분 일치는 걸리지 않고, deptCd '-' 는 부서 없는 구간만")
    void exactMatchFilters() {
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userAB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 1_000);

        ScreenUsageStatRequest noDept = req("20261002", "20261003");
        noDept.setDeptCd("-");
        assertThat(query.history(noDept)).hasSize(2).allSatisfy(row -> assertThat(row).containsEntry("deptCd", "-"));

        ScreenUsageStatRequest userPrefix = req("20261002", "20261003");
        userPrefix.setUserId("user");
        assertThat(query.history(userPrefix)).isEmpty();

        ScreenUsageStatRequest pagePrefix = req("20261002", "20261003");
        pagePrefix.setPageId("csa/commUser");
        assertThat(query.history(pagePrefix)).isEmpty();

        ScreenUsageStatRequest userA = req("20261002", "20261003");
        userA.setUserId("userA");
        assertThat(query.history(userA)).hasSize(3);
    }

    @Test
    @DisplayName("메뉴에서 지워진 화면·부서 없는 사용자 — (메뉴 없음)·'-'·(부서 없음) (Review Focus 1)")
    void unknownMenuAndNoDept() {
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.history(req("20261002", "20261003"))).hasSize(2).allSatisfy(row ->
                assertThat(row).containsEntry("deptCd", "-").containsEntry("deptNm", "(부서 없음)")
                        .containsEntry("menuNm", "(메뉴 없음)").containsEntry("userNm", null));
    }
}
```

- [ ] **Step 2: 백엔드 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageHistoryQueryJpaTest`
Expected: FAIL — `compileTestJava` 에서 `cannot find symbol: variable HISTORY_MAX_ROWS` 와 3인자 생성자 없음.

- [ ] **Step 3: 백엔드 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQuery.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Filter;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Range;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * action=history → grids.history (계약 C4). 원본 구간 그대로, 최신순 최대 10,000행.
 * 기간은 시작·종료일 포함 31일까지(DAYS.between(from, to) ≤ 30) — 화면 checkHistoryPeriod 와 같은 식(메인 결정 U2-1).
 */
@Component
public class ScreenUsageHistoryQuery {

    /** 시작·종료일 포함 최대 일수. */
    static final int HISTORY_MAX_DAYS = 31;
    static final int HISTORY_MAX_ROWS = 10_000;

    private final ScreenUsageStatSupport support;
    private final ScreenUsageLogRepository logRepository;
    private final int maxRows;

    @Autowired
    public ScreenUsageHistoryQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository) {
        this(support, logRepository, HISTORY_MAX_ROWS);
    }

    /** 테스트용 — 상한을 작게 줘 잘림을 확인한다. */
    ScreenUsageHistoryQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository, int maxRows) {
        this.support = support;
        this.logRepository = logRepository;
        this.maxRows = maxRows;
    }

    public List<Map<String, Object>> history(ScreenUsageStatRequest request) {
        Range range = ScreenUsageStatSupport.range(request);
        if (ChronoUnit.DAYS.between(range.from(), range.to()) + 1 > HISTORY_MAX_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "이용 이력은 시작·종료일 포함 " + HISTORY_MAX_DAYS + "일까지 조회할 수 있습니다.");
        }
        Filter filter = ScreenUsageStatSupport.filter(request);
        List<ScreenUsageLog> logs = logRepository.findHistory(
                range.from().atStartOfDay(), range.to().plusDays(1).atStartOfDay(),
                filter.userId(), filter.deptCd(), filter.pageId(), PageRequest.of(0, maxRows));
        Map<String, MenuInfo> menus = support.menus();
        Map<String, String> userNames = support.userNames(
                logs.stream().map(ScreenUsageLog::getUserId).collect(Collectors.toSet()));
        Map<String, String> deptNames = support.deptNames(
                logs.stream().map(l -> ScreenUsageAggregator.normalizeDept(l.getDeptCd())).collect(Collectors.toSet()));

        List<Map<String, Object>> rows = new ArrayList<>(logs.size());
        for (ScreenUsageLog l : logs) {
            String deptCd = ScreenUsageAggregator.normalizeDept(l.getDeptCd());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("usageId", l.getUsageId());
            row.put("userId", l.getUserId());
            row.put("userNm", userNames.get(l.getUserId()));
            row.put("deptCd", deptCd);
            row.put("deptNm", ScreenUsageStatSupport.deptName(deptCd, deptNames));
            row.put("pageId", l.getPageId());
            row.put("menuNm", ScreenUsageStatSupport.menuNm(l.getPageId(), menus));
            row.put("startKind", l.getStartKind());
            row.put("startedAt", ScreenUsageDates.timestamp(l.getStartedAt()));
            row.put("endedAt", ScreenUsageDates.timestamp(l.getEndedAt()));
            row.put("durationMs", l.getDurationMs());
            row.put("clientIp", l.getClientIp());
            rows.add(row);
        }
        return rows;
    }
}
```

`unknownMenuAndNoDept` 의 `userNm null` 은 기반 테스트 mock 이 userA·userB 만 돌려주기 때문이다.

- [ ] **Step 4: 백엔드 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageHistoryQueryJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: PASS (5 + 2 + 3)

- [ ] **Step 5: 화면 실패 시험 작성**

`src/frontend/m-mcm/tests/csa/screenUsageStat/history-tab.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { toExportRows } from "@/page-components/csa/screenUsageStat/format";
import {
  HISTORY_ROW_LIMIT,
  historyLimitNotice,
  historyTab,
} from "@/page-components/csa/screenUsageStat/tabs/history-tab";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

describe("이용 이력 기간 검사 (시작·종료일 포함 31일)", () => {
  it("31일은 통과, 32일은 조회 전에 막는다", () => {
    expect(historyTab.check?.(query({ fromDt: "2026-10-01", toDt: "2026-10-31" }))).toBeNull();
    expect(historyTab.check?.(query({ fromDt: "2026-10-03", toDt: "2026-10-03" }))).toBeNull();
    expect(historyTab.check?.(query({ fromDt: "2026-10-01", toDt: "2026-11-01" }))).toEqual(expect.any(String));
  });
});

describe("이용 이력 조회", () => {
  it("history 를 부르고 grids.history 를 history 로 돌려준다", async () => {
    http.reply({ meta: { success: true }, grids: { history: { rows: [{ usageId: "u1" }] } } });
    const patch = await historyTab.load(query());
    expect(http.sent().url).toBe("/api/mcm/oasis/screenUsageStat/history");
    expect(patch).toEqual({ history: [{ usageId: "u1" }] });
  });

  it("서버 거절(meta.success=false)은 서버 문구 그대로 던진다", async () => {
    http.reply({ meta: { success: false, message: "이용 이력은 시작·종료일 포함 31일까지 조회할 수 있습니다." } });
    await expect(historyTab.load(query())).rejects.toThrow("이용 이력은 시작·종료일 포함 31일까지 조회할 수 있습니다.");
  });
});

describe("10,000행 안내", () => {
  it("10,000행을 받으면 안내, 그보다 적으면 없음", () => {
    expect(HISTORY_ROW_LIMIT).toBe(10_000);
    expect(historyLimitNotice(10_000)).toBe("최근 10,000건만 표시됩니다. 기간을 줄여 조회하세요.");
    expect(historyLimitNotice(9_999)).toBeNull();
    expect(historyLimitNotice(0)).toBeNull();
  });
});

describe("이용 이력 엑셀", () => {
  it("시작 사유는 글자로, 이용 시간은 읽는 글자로, 부서 없음·메뉴 없음은 그대로", () => {
    const row = {
      usageId: "u1",
      startedAt: "2026-10-02 09:00:05",
      endedAt: "2026-10-02 09:01:06",
      durationMs: 61_000,
      startKind: "SWITCH",
      userId: "kim",
      userNm: "김철수",
      deptCd: "-",
      deptNm: "(부서 없음)",
      menuNm: "(메뉴 없음)",
      pageId: "old/x",
      clientIp: null,
    };
    const target = historyTab.toExport(emptyData({ history: [row as never] }));
    const out = toExportRows(target.rows)[0];
    expect(out.startKind).toBe("전환");
    expect(out.durationMs).toBe("1분");
    expect(out.deptNm).toBe("(부서 없음)");
    expect(out.menuNm).toBe("(메뉴 없음)");
    expect(target.columns.map((c) => c.header)).toEqual([
      "시작",
      "종료",
      "이용 시간",
      "시작 사유",
      "사용자 ID",
      "사용자명",
      "부서",
      "화면명",
      "화면 ID",
      "IP",
    ]);
  });
});
```

- [ ] **Step 6: 화면 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/history-tab.test.ts`
Expected: FAIL — `HISTORY_ROW_LIMIT`·`historyLimitNotice` 가 없고 골격에 `check` 가 없다.
31일 통과 단언만 실패하고 나머지가 통과하면 기반 `checkHistoryPeriod` 에 메인 결정 U3-5 가 반영되지 않은 것이다. `format.ts` 를 고치지 말고 메인에 보고한다.

- [ ] **Step 7: 탭 모듈 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/history-tab.ts`

```ts
/**
 * 이용 이력 탭 모듈 — 31일 검사(조회 전), history 조회, 10,000행 안내, 엑셀 대상.
 * 그리드 열(배지 렌더 포함)은 HistoryTab.tsx 에 있다. 여기는 shared 를 런타임 import 하지 않는다(시험 격리).
 */
import { fetchHistory } from "../api";
import { checkHistoryPeriod } from "../format";
import type { ExportColumn, StatTabModule } from "./tab-contract";

/** 서버 최신순 상한(ScreenUsageHistoryQuery.HISTORY_MAX_ROWS)과 같다. */
export const HISTORY_ROW_LIMIT = 10_000;

/** HistoryTab.tsx 의 그리드 열과 같은 순서·제목. */
export const HISTORY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "startedAt", header: "시작" },
  { key: "endedAt", header: "종료" },
  { key: "durationMs", header: "이용 시간" },
  { key: "startKind", header: "시작 사유" },
  { key: "userId", header: "사용자 ID" },
  { key: "userNm", header: "사용자명" },
  { key: "deptNm", header: "부서" },
  { key: "menuNm", header: "화면명" },
  { key: "pageId", header: "화면 ID" },
  { key: "clientIp", header: "IP" },
];

export const historyTab: StatTabModule = {
  load: async (q) => ({ history: await fetchHistory(q) }),
  check: (q) => checkHistoryPeriod(q.fromDt, q.toDt),
  toExport: (data) => ({ rows: data.history, columns: HISTORY_EXPORT_COLUMNS }),
};

/** 상한만큼 받았으면 잘렸을 수 있으므로 안내한다(메인 결정 U3-6). */
export function historyLimitNotice(rowCount: number): string | null {
  return rowCount >= HISTORY_ROW_LIMIT
    ? `최근 ${HISTORY_ROW_LIMIT.toLocaleString("ko-KR")}건만 표시됩니다. 기간을 줄여 조회하세요.`
    : null;
}
```

- [ ] **Step 8: 탭 화면 구현**

`src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/HistoryTab.tsx`

```tsx
"use client";

/** 이용 이력 탭 화면 — 10열이라 fixed(가로 스크롤). 10,000행이면 패널 제목에 안내를 붙인다. */
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import { startKindLabel } from "../format";
import { durationCol } from "./columns";
import { historyLimitNotice } from "./history-tab";
import type { StatTabViewProps } from "./tab-contract";

/** HISTORY_EXPORT_COLUMNS(history-tab.ts)와 같은 순서·제목. */
const HISTORY_COLUMNS: GridColumn[] = [
  { key: "startedAt", header: "시작", width: 150, align: "center" },
  { key: "endedAt", header: "종료", width: 150, align: "center" },
  durationCol("durationMs", "이용 시간"),
  {
    key: "startKind",
    header: "시작 사유",
    width: 80,
    align: "center",
    render: (v) =>
      v === "OPEN" ? (
        <GridBadge label={startKindLabel(v)} bg="var(--color-primary-soft)" color="var(--color-primary)" />
      ) : (
        <GridBadge label={startKindLabel(v)} muted />
      ),
  },
  { key: "userId", header: "사용자 ID", width: 120, align: "left" },
  { key: "userNm", header: "사용자명", width: 120, align: "left" },
  { key: "deptNm", header: "부서", width: 140, align: "left" },
  { key: "menuNm", header: "화면명", width: 180, align: "left" },
  { key: "pageId", header: "화면 ID", width: 200, align: "left" },
  { key: "clientIp", header: "IP", width: 120, align: "left" },
];

export default function HistoryTab({ data, busy }: StatTabViewProps) {
  const notice = historyLimitNotice(data.history.length);
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title={notice ? `이용 이력 — ${notice}` : "이용 이력"} count={data.history.length}>
          <AgDataGrid
            rowKey="usageId"
            columns={HISTORY_COLUMNS}
            data={data.history}
            columnSizing="fixed"
            loading={busy}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
```

- [ ] **Step 9: 화면 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/tabs/history-tab.ts page-components/csa/screenUsageStat/tabs/HistoryTab.tsx tests/csa/screenUsageStat/history-tab.test.ts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat/tabs tests/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected: vitest 전체 PASS, tsc 필터 출력 없음, eslint 0, audit 두 개 `의심 0건`.

- [ ] **Step 10: 계약 검사와 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQuery.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageHistoryQueryJpaTest.java src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/history-tab.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/HistoryTab.tsx src/frontend/m-mcm/tests/csa/screenUsageStat/history-tab.test.ts
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 이용 이력 탭(31일·10,000행 제한)을 구현한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task V: README 와 통합 검증 (S1~S6 병합 뒤)

**Files:**
- Modify: `src/backend/mcm-core/README.md` ("이들을 떠받치는 공통 계층" 표, "스키마 관리" 절)

**Interfaces:**
- Consumes: 기반 U2 Task 1~5·8, F1·F2, S1~S6 전체
- Produces: 없음(문서·검증)

- [ ] **Step 1: 병합 결과에 골격이 남지 않았는지 본다**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && grep -rn "골격\|준비 중" src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected: 출력 없음. 남아 있으면 그 탭의 슬라이스 커밋이 빠진 것이므로 메인에 보고한다.

- [ ] **Step 2: mcm-core 전체 테스트(ArchUnit 포함)**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm-core && ../gradlew :test`
Expected: PASS. `McmCoreArchitectureTest` 5건이 포함된다. 새 클래스는 모두 `screenusage` 안에 있고 `entity`·`repository`·`common` 만 의존하므로 사이클이 없다. 실패하면 원인 슬라이스 파일만 고친 뒤 다시 돌린다.

- [ ] **Step 3: mcm api 컴파일·mdm 어휘 테스트·계약 검사**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mcm && ../gradlew :api:compileJava
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/backend/mdm && ../gradlew :api:test --tests com.dongkuk.dmes.mdm.MdmOasisActionVocabularyTest
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: BUILD SUCCESSFUL, PASS, `ERROR 0`(진입점 bean `screenUsageService`·`screenUsageStatService` 해석, 미해석 0).

- [ ] **Step 4: m-mcm 시험·tsc·eslint·audit**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm build:libs
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test:unit
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat|vitest\.config\.mts"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat tests/csa/screenUsageStat vitest.config.mts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm generate:page-registry
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && /usr/bin/git status --short -- src/frontend/m-mcm/lib/generated/page-registry.ts
```
Expected:
- vitest: 9개 파일(format·api·tab-contract·overview-tab·screen-tab·dept-tab·user-tab·unused-tab·history-tab) PASS.
- tsc 필터: 출력 없음(통과 기준). 전체 오류 수는 참고값으로 보고만 한다.
- eslint: 출력 없음. audit 두 개: `의심 0건 — 통과`.
- 레지스트리 재생성 뒤 `git status` 출력 없음(F2 에서 커밋한 한 줄 그대로).

- [ ] **Step 5: README 갱신**

`src/backend/mcm-core/README.md` 의 공통 계층 표에서 `| favorite | 포털 즐겨찾기 |` 행 바로 뒤에 추가한다.

```markdown
| `screenusage` | 포털 화면 사용 구간 기록(`screenUsage/record`, AUTH_ONLY) · 02:00 일별 집계·1년 보관(`ScreenUsageRollup`) · 통계 6종(`screenUsageStat` — 퍼사드 `ScreenUsageStatService` 가 탭별 `ScreenUsage*Query` 로 넘기고 공통 합산은 `ScreenUsageStatSupport`) |
```

"스키마 관리" 절 마지막 문단 뒤에 추가한다.

```markdown
화면 사용 통계 테이블(`TB_SEC_SCREEN_USAGE_LOG`·`TB_SEC_SCREEN_USAGE_DAY`)은 감사 계열처럼 schema 접두가 없다.
MSSQL DDL 정본은 `screenusage/schema/ScreenUsageMssqlDdl` 이며 `DataInitializer` 와 운영 DBA 전달본이 같은 문장을 쓴다.
```

- [ ] **Step 6: 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/backend/mcm-core/README.md
/usr/bin/git commit -m "docs(mcm-core): 화면 사용 통계 패키지 구성과 테이블 DDL 정본 위치를 README 에 적는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

브라우저 확인과 메뉴 등록은 총괄 계획 Task U4 가 한다.

---

## Self-Review

### 1. Spec coverage

| 요구(설계·C4) | Task |
|---|---|
| 4.5 공통 파라미터·완전 일치·`'-'` | F1 `range`/`filter`/`sums` (`validatesRange`, `filterTrims`, `exactMatchFilters`) |
| 4.5 원본 합산 = 집계 최대 일자 다음 날부터(오늘 포함) | F1 `split`/`sums` (`sumsSplitAggregatedAndRaw`, `beforeRollupYesterdayStillCounted`), S2 `todayFromRawPlusAggregated` |
| overview 6필드·daily 0 채움·상위 10·`unusedDays` | S1 |
| byScreen 8필드·`avgDurationMs` null | S2 |
| byDept 7필드·최다 이용 화면·선택 부서 화면별 | S3 (서버), S3 `DeptTab`(화면, byScreen+deptCd) |
| byUser 사용자당 1행·마지막 이용 부서 | S4 |
| unused 표시 메뉴·이용 기록 없음·기본 90·기간 무시 | F1 `unusedScreens`, S5 |
| history 원본·31일(포함)·10,000행·최신순 | S6 |
| "(메뉴 없음)"·`'-'`·"(부서 없음)" | F1 `namesAndMissing`, S2·S3·S6 |
| BPMN serviceTask 6개·`output`·dto | F1 Step 11, `statBpmn` |
| `allActions` 6개 | F1 Step 10, `permAllContainsStatActions` |
| `@Transactional` 금지 | F1 `beanContract`, `statBpmn` |
| §5 검색 조건·[조회] 만·탭 전환 조회·같은 조건 재조회 없음 | F2 `page.tsx` |
| §5 엑셀 = 현재 탭 그리드 | F2 `page.tsx` + 각 탭 `toExport`, F2 `tab-contract.test.ts` |
| §5 탭 6개 화면 구성 | S1~S6 `*Tab.tsx` |
| §5 이력 31일 초과 조회 전 차단 | S6 `historyTab.check` + F2 `loadTab` |
| §7 ArchUnit·계약 검사·audit·tsc | V |
| README | V |

범위 밖(다른 계획 소유): 기록·집계·DDL(U2 Task 1~5·8), 수집(U1), vitest 도입·types·format·api·tabs 허용 목록(U3 Task 1·2·4), 메뉴 등록·브라우저 확인(U4).

### 2. Placeholder scan

TBD·TODO·"적절히"·"Task N 과 같음" 없음. 골격 코드의 "슬라이스가 채운다" 주석은 실제 동작 코드(빈 결과 반환)이고, 같은 파일을 교체하는 슬라이스 Task 에 전체 코드가 있다. 모든 코드 Step 에 실제 코드가 있다.

### 3. Type consistency

- `ScreenUsageStatSupport` 생성자 순서 `(dayRepository, logRepository, menuCatalog, secUserRepository, deptInfoRepository[, clock])` — F1 구현·`ScreenUsageStatJpaTestBase` 같음.
- 쿼리 생성자 — 골격(F1)과 슬라이스 구현·테스트가 같음: Overview `(support, dayRepository)`, ByScreen/ByDept/Unused `(support)`, ByUser/History `(support, logRepository)`, History 테스트용 `(support, logRepository, int)`.
- 퍼사드 생성자 순서 `(overview, byScreen, byDept, byUser, unused, history)` — F1 구현·`ScreenUsageStatServiceTest` 같음.
- `groupBy(List<UsageSum>, Function, Supplier)` — S1·S2 `UsageTotals::new`, S3 `DeptTotals::new`, S4 `UserTotals::new`.
- `UnusedScreen(MenuInfo menu, String lastUsedDt)` — F1·S1·S5 같음.
- 화면: `StatTabModule`·`StatTabViewProps`·export 이름(`overviewTab`… `historyTab`)이 `tab-modules.ts`·각 슬라이스 파일과 같음. `DEPT_COLUMNS`·`USER_COLUMNS`·`UNUSED_COLUMNS` 는 각 `*-tab.ts`, `HISTORY_COLUMNS` 는 배지 JSX 때문에 `HistoryTab.tsx` 안에 두고 엑셀 열(`HISTORY_EXPORT_COLUMNS`)은 `history-tab.ts` 에 두었다(시험이 제목 순서를 고정).
- 기반 이름은 F0 표 그대로 인용.

### 4. Review Focus

다섯 항목 모두 위 "Review Focus" 절에 적은 테스트가 해당 Task 에 들어 있다. 추가로 확인한 항목:
- 메인 결정 U2-1(31일 포함)은 U2 원안의 `> 31` 을 `DAYS.between + 1 > 31` 로 고쳤고, 경계 날짜도 `20260903~20261003` 통과·`20260902~20261003` 거절로 바꿨다(S6).
- 메인 결정 U2-2 `avgDurationMs` null — U2 원안의 `max(openCnt,1)` 을 바꿨다(S2).
- 빠른 탭 전환의 늦은 응답은 F2 `page.tsx` 의 `isLatest`/`finish`(기반 `createTabRequestTracker` 시험이 고정)와 S3 `DeptTab` 의 `source` 비교로 막는다.

### 5. 슬라이스 간 파일 겹침 확인

각 슬라이스가 쓰는 파일(아래 경로는 `…/service/` = `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/`, `T/` = `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/`, `P/` = `src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/`, `PT/` = `src/frontend/m-mcm/tests/csa/screenUsageStat/`):

| 슬라이스 | 백엔드 | 백엔드 테스트 | 화면 | 화면 시험 |
|---|---|---|---|---|
| S1 | `…/ScreenUsageOverviewQuery.java` | `T/ScreenUsageOverviewQueryJpaTest.java` | `P/overview-tab.ts`, `P/OverviewTab.tsx` | `PT/overview-tab.test.ts` |
| S2 | `…/ScreenUsageByScreenQuery.java` | `T/ScreenUsageByScreenQueryJpaTest.java` | `P/screen-tab.ts`, `P/ScreenTab.tsx` | `PT/screen-tab.test.ts` |
| S3 | `…/ScreenUsageByDeptQuery.java` | `T/ScreenUsageByDeptQueryJpaTest.java` | `P/dept-tab.ts`, `P/DeptTab.tsx` | `PT/dept-tab.test.ts` |
| S4 | `…/ScreenUsageByUserQuery.java` | `T/ScreenUsageByUserQueryJpaTest.java` | `P/user-tab.ts`, `P/UserTab.tsx` | `PT/user-tab.test.ts` |
| S5 | `…/ScreenUsageUnusedQuery.java` | `T/ScreenUsageUnusedQueryJpaTest.java` | `P/unused-tab.ts`, `P/UnusedTab.tsx` | `PT/unused-tab.test.ts` |
| S6 | `…/ScreenUsageHistoryQuery.java` | `T/ScreenUsageHistoryQueryJpaTest.java` | `P/history-tab.ts`, `P/HistoryTab.tsx` | `PT/history-tab.test.ts` |

- 행끼리 같은 파일이 없다(30개 파일, 겹침 0).
- 슬라이스가 **읽기만** 하는 공용 파일: `ScreenUsageStatSupport.java`, `ScreenUsageStatJpaTestBase.java`, `tab-contract.ts`, `columns.ts`, 기반 `types.ts`·`format.ts`·`api.ts`, 시험 보조 `support/*.ts`. 슬라이스는 이 파일들을 고치지 않는다.
- 퍼사드·BPMN·`DataInitializer`·`page.tsx`·`tab-modules.ts`·`page-registry.ts`·`ScreenUsageOasisContractTest.java` 는 F 만 고친다.
- 슬라이스 간 import: S3 `DeptTab.tsx` 는 `columns.ts`(F)의 `SCREEN_COLUMNS` 를 쓰고 S2 파일은 쓰지 않는다. 다른 슬라이스 파일을 import 하는 슬라이스는 없다.
- 병합 충돌 가능 지점: 없음. 단, 슬라이스가 골격 파일 전체를 바꾸므로 같은 골격을 두 슬라이스가 받지 않는지(위 표)만 확인하면 된다.

---

## 실행 뒤 메인에 보고할 것

- F0 Step 2 표 결과(특히 `buildStatParams` 의 overview `unusedDays`, `checkHistoryPeriod` 31일 포함 여부, `test:unit` 이름, vitest include).
- V Step 2~4 출력 요약, tsc 전체 오류 수.
- S3 메모: 부서별 탭을 떠났다 오면 부서 선택이 풀린다(U3 원안과 다름).
- 이력 10,000행 안내를 GridPanel 제목에 붙였다(별도 안내 영역 없음 — 로컬 CSS 금지 때문).
- 이 문서가 대체한 원본(U2 Task 6·7·9, U3 Task 3)은 각 계획 파일에서 "slices 계획으로 대체" 로 표시해 달라.
