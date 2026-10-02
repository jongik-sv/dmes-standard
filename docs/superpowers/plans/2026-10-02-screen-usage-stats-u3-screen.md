# 사용자 화면 사용 통계 — U3 통계 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 기간·부서·사용자·화면 조건으로 화면 사용 통계를 탭 6개(개요·화면별·부서별·사용자별·미사용 화면·이용 이력)로 조회하고 엑셀로 내보내는 m-mcm 화면 `csa/screenUsageStat` 을 만든다.

**Architecture:** 조회 화면 A 유형(`PageLayout` + `SearchArea` + 본문) 사이에 shared `Tabs` 머리줄을 두고, 본문은 활성 탭 값으로 직접 고른다. [조회] 가 조건을 고정하고 활성 탭만 부르며, 탭을 바꾸면 고정된 조건으로 그 탭만 부른다(같은 조건으로 받은 탭은 건너뜀). 호출·envelope 해제·파라미터 조립은 `api.ts`, 표시·입력 변환과 검사는 `format.ts` 의 순수 함수로 두고 m-mcm 에 새로 들이는 vitest 로 시험한다.

**Tech Stack:** React 19 · Next.js 16(m-mcm) · `@dk-oasis/shared` 의 `layout`·`grid`·`form`·`tabs`·`dashboard`·`charts`·`message-provider`·`utils` · vitest 3(m-mcm, node 환경)

**Spec:**
- 설계: `docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md` (§5 통계 화면, §4.5 통계 조회 서비스, §9 결정)
- 총괄 계획: `docs/superpowers/plans/2026-10-02-screen-usage-stats.md` (Global Constraints, 공유 계약 C4·C5, Review Focus)

## Global Constraints

총괄 계획의 Global Constraints 를 그대로 따른다. 이 단위에 걸리는 것과 이 단위에서 정한 값:

- 작업 위치는 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats` (브랜치 `feat/screen-usage-stats`). git 은 `/usr/bin/git` 사용, 명령의 경로·옵션 자리에 셸 변수·글롭을 쓰지 않는다.
- 도커 금지. Playwright E2E 는 추가하지 않는다. 브라우저 확인은 U4 가 한다.
- 화면 코드는 shared 래퍼만 쓴다(`@mantine/*`·`ag-grid-*` 직접 import 금지), 로컬 `.css` import 금지, `mantine-aggrid-ui` audit 두 개 0건.
- 문서·주석·UI 문구는 한국어. 커밋 메시지는 `type(scope): 한국어 subject` + 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **커밋:** 같은 워크트리에서 U1·U2 가 동시에 돌면 커밋은 메인 세션이 모아서 한다. 이 경우 실행자는 각 Task 의 커밋 Step 에 적힌 파일 목록과 메시지를 메인에 넘기고 직접 커밋하지 않는다.
- 응답 계약은 총괄 계획 **C4** 그대로다. `POST /api/mcm/oasis/screenUsageStat/{action}`, action 6개(`overview`·`byScreen`·`byDept`·`byUser`·`unused`·`history`), `fromDt`·`toDt` 는 `yyyyMMdd`. 계약을 바꿀 필요가 생기면 고치지 말고 메인에 보고한다.
- 메뉴(C5): 객체 ID `screenUsageStat`, `componentPath` = `csa/screenUsageStat`, 화면 파일 `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx`(default export). 메뉴 시드(DataInitializer)는 U4 담당이라 이 계획에 없다.
- 상단 버튼은 `objId="screenUsageStat"` 의 RBAC 를 받는다. 버튼 action `search`·`export` 는 `DataInitializer` `PERM_ALL` 의 `allActions` 에 이미 있다(`src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java:298-299`). 6개 조회 action 추가는 U2 몫이다.
- 요청 `meta` 는 `{ menuId: "screenUsageStat" }` 만 보낸다. `userId` 는 넣지 않는다(서버가 인증 정보로 채운다. `m-mls/pages/lsh/noticeMgmt/api.ts:142` 와 같다).
- 테스트 러너: m-mcm 에 vitest 를 최소로 들인다(Task 1). 결정 근거:
  - (a) shared 로 옮기기를 고르지 않은 이유: `api.ts` 는 m-mcm 전용 `@/lib/http/json-api-client` 와 화면별 OASIS envelope 에 묶여 있어 shared 로 옮길 수 없으므로 어차피 m-mcm 쪽 러너가 필요하다. `format.ts` 의 `formatDuration` 만 범용이지만, 그것 하나 때문에 U1 이 동시에 고치는 shared 를 건드리고(`utils` 는 Part B §14 ASK) shared build 를 사이에 끼울 이유가 없다.
  - (b) 를 고른 근거: m-mls·m-mpp 가 `"test": "vitest run"` + devDependency `vitest ^3.2.4` 로 같은 방식을 쓴다(설정 파일 없이 node 환경). m-mcm 은 `@/` 경로 별칭을 쓰므로 별칭 하나만 둔 `vitest.config.mts` 를 더한다. 잠금 파일에 `vitest@3.2.7(@types/node@20.19.43)…` 해석이 이미 있어(@types/node 20 = m-mcm 과 같은 계열) 새 패키지를 내려받지 않는다.
- 시험 격리: `format.ts`·`api.ts` 는 `@dk-oasis/shared/*` 를 런타임 import 하지 않는다. `types.ts` 에서 가져오는 것은 모두 `import type` 이다. 그래야 vitest 가 shared dist 없이 돈다.
- 화면 표준과 다르게 정한 값(근거 포함, 최종 보고 대상):
  - 첫 진입 자동 조회를 하지 않는다 — screen-patterns.md §조회조건 "필수 조회조건이 없으면 진입 시 1회 자동 조회" 와 다르다. 근거: 설계 §5 "첫 진입 자동 조회는 하지 않고 [조회]로만 조회한다(커밋 `c564a05f` 방향)".
  - 기간 기본값은 오늘-30일 ~ 오늘이다 — 표준(오늘-7일)과 다르다. 근거: 설계 §5 "기본 최근 30일". 계산은 표준 방식 그대로 `formatDateStr(addDays(today(), -30))`·`formatDateStr(today())`.
  - `HBarChart` 부모에 인라인 `style={{ overflowX: "auto" }}` 를 둔다 — screen-patterns.md §스타일은 인라인 style 을 `DETAIL_*` 로 한정한다. 근거: `HBarChart` 는 고정 폭 SVG(`labelWidth + chartWidth + 50`)이고 `.cm-dash-card` 가 `overflow: hidden` 이라 감싸지 않으면 잘린다. Local-Rules §17 은 화면 스타일을 "인라인 style·shared 토큰·제공 클래스" 로 두라고 허용한다. 색 값은 쓰지 않는다.
  - 엑셀은 `exportToExcel`(`@dk-oasis/shared/utils`)로 한다 — 설계 §5 는 "그리드 기본 기능" 이라 적었지만 `AgDataGrid` 에는 내보내기 기능이 없다. screen-patterns.md §팝업·엑셀의 표준 호출을 쓴다.
  - 탭 전환은 [조회] 때 고정한 조건(`submitted`)으로 부른다 — 조회조건 칸을 고친 뒤 [조회] 없이 탭만 바꾸면 칸에 보이는 값이 아니라 마지막 [조회] 조건으로 조회된다. 근거: 과제 문구 "탭을 바꾸면 그 탭 기준으로 조회, 같은 조건으로 이미 조회한 탭은 다시 부르지 않는다" 를 "조건 = [조회] 로 확정한 조건" 으로 읽었다(조회 전 탭 전환은 아무것도 부르지 않는 규칙과도 맞다). 해석이라 보고한다.
  - `charts` 서브패스는 Part B §1 허용 목록에 없다(ASK, `charts.md`). 설계 §5 가 `LineChart`·`HBarChart` 를 이름으로 지정하고 사용자가 설계를 검토했으므로 쓰되, 허용 목록에는 `tabs` 만 더한다(사용자 승인 범위). `charts` 등재 여부는 사용자 결정 사항으로 보고한다.
- 부서·사용자 조건 입력: 기존 m-mcm 화면의 조회조건은 텍스트 칸이다(`csa/commUserMng/page.tsx:881-887` "사용자" `SearchField`, placeholder "ID / 사번 / 이름"). 부서 LoV(`LookupModal`)는 commUserMng 의 상세 폼에만 있고 그 조회 action(`commUserMng/searchDeptLov`)은 다른 화면의 엔드포인트·권한이라 C4 에 없다. 그래서 부서·사용자·화면 모두 텍스트 `SearchField` 로 둔다.

## Review Focus

1. **메뉴에서 지워진 화면이 상위 10개에 여러 개** — `menuNm` 이 모두 `"(메뉴 없음)"` 이면 `HBarChart` 가 `key={d.label}` 로 그려 React 키가 겹치고 막대가 사라진다. 서버 문구 `"(메뉴 없음)"` 은 그대로 보이고, 같은 라벨이 여럿이면 뒤에 `(pageId)` 를 붙여 유일하게 한다(`menuNm` 이 비면 pageId). → Task 1 `toTopBars` 시험.
2. **이용 이력 31일 경계** — C4 는 `toDt - fromDt ≤ 31` 이다. 31일 차는 조회되고 32일 차는 조회 전에 안내하고 막아야 한다. 탭 전환으로 들어올 때도 같다. → Task 1 `checkHistoryPeriod` 시험(31 통과·32 거절).
3. **빠른 탭 전환·부서 행 ↑↓ 이동** — `AgDataGrid` 는 ↑↓ 이동에도 `onRowClick` 을 부른다. 늦게 도착한 이전 응답이 새 결과를 덮거나, 다른 요청이 남았는데 로딩 표시가 먼저 꺼지면 안 된다. → Task 2 `createTabRequestTracker` 시험(최신 순번만 반영, 대기 수로 busy 판정).
4. **기간 중 부서를 옮긴 사용자** — 부서는 기록 시점 스냅숏이라 `byUser` 가 한 사용자를 부서별로 두 행 줄 수 있다. `rowKey="userId"` 면 행이 겹친다. → Task 2 `fetchByUser` 의 `rowKey = userId|deptCd` 시험.
5. **빈 응답(집계 전·신규 설치)과 빈 날** — `data.result` 에 필드가 빠지거나 grids 가 없어도 0·빈 배열로 그려야 하고, 이용이 없는 날은 추이 선에서 건너뛰지 말고 0 으로 보여야 한다. → Task 2 overview 빈 응답 시험, Task 1 `toDailyPoints` 빈 날 채움 시험.


## 메인 결정 (2026-10-02, 본문보다 우선 적용)

총괄 계약 C4 보충분이다. 본문과 다르면 이 절을 따라 해당 Task 에서 고친다.

1. `overview` 호출에도 미사용 탭의 기준 일수 `unusedDays` 를 함께 넘긴다(입력 칸 값, 기본 90). 기준 일수를 바꾸면 개요의 미사용 화면 수도 같은 기준으로 나온다. `api.ts` 파라미터 조립 테스트에 넣는다.
2. 부서·사용자·화면 조건은 완전 일치 텍스트 입력이다. 입력 칸 안내 문구(placeholder)에 "정확히 입력" 과 부서 없음은 `-` 임을 적는다.
3. `byUser` 는 서버가 사용자당 1행으로 준다. 행 키는 `userId` 로 충분하지만 `userId|deptCd` 를 써도 무방하다.
4. 엑셀은 `exportToExcel`(현재 탭 그리드). 설계 문서의 "그리드 기본 기능" 문구는 메인이 고친다.
5. 이용 이력 기간은 시작·종료일 포함 31일까지(날짜 차 ≤ 30). 32일부터 조회 전에 막는다. 본문 판정이 "차 ≤ 31" 이면 고치고 경계 테스트(31일 통과·32일 차단)를 둔다.
6. 이용 이력 응답이 10,000행이면 그리드 위에 "최근 10,000건만 표시됩니다. 기간을 줄여 조회하세요." 안내를 보인다.
7. `unusedDays` 는 숫자로 보내고 빈 값이면 키를 뺀다. 서버 오류는 `meta.success=false` 메시지를 그대로 알린다.
8. 화면별 그리드의 `avgDurationMs` 는 `null` 일 수 있다(열람 0회) — 빈 칸으로 표시.
9. dev 병합(위젯 기반)으로 m-mcm `package.json` 에 `test:scripts`(`node --test scripts/*.test.mjs`)와 위젯 레지스트리 predev 가 생겼다. vitest 는 `test:unit` 스크립트로 따로 추가하고 기존 `test:scripts`·`predev`·`prebuild` 는 건드리지 않는다. vitest `include` 를 `page-components/**/*.test.ts` 등으로 좁혀 `scripts/*.test.mjs` 를 잡지 않게 한다.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `src/frontend/m-mcm/package.json` | `test` 스크립트, devDependency `vitest` | 1 |
| `src/frontend/pnpm-lock.yaml` | m-mcm 의 vitest 해석 추가(자동) | 1 |
| `src/frontend/m-mcm/vitest.config.mts` | `@/` 별칭, node 환경, `tests/**/*.test.ts` | 1 |
| `src/frontend/m-mcm/page-components/csa/screenUsageStat/types.ts` | C4 행 타입, 탭·조건 타입, 탭 목록, 기본 조건 | 1 |
| `src/frontend/m-mcm/page-components/csa/screenUsageStat/format.ts` | 이용 시간·날짜 표기, 기간·입력 검사, 차트·엑셀 변환 순수 함수 | 1 |
| `src/frontend/m-mcm/tests/csa/screenUsageStat/format.test.ts` | format.ts 시험 | 1 |
| `src/frontend/m-mcm/page-components/csa/screenUsageStat/api.ts` | 파라미터 조립, OASIS 호출·envelope 해제, 탭 요청 추적기 | 2 |
| `src/frontend/m-mcm/tests/csa/screenUsageStat/api.test.ts` | api.ts 시험(fetch 대역) | 2 |
| `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx` | 화면(default export) | 3 |
| `src/frontend/m-mcm/lib/generated/page-registry.ts` | `csa/screenUsageStat` 키 1줄(생성기 출력, git 추적 파일) | 3 |
| `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` | §1 허용 목록에 `tabs` | 4 |
| `.claude/skills/mantine-aggrid-ui/references/components/tabs.md` | ASK 문구·실제 사용 예 갱신 | 4 |
| `.claude/skills/mantine-aggrid-ui/references/components/llms.txt`, `llms-full.txt` | 생성물 재생성 | 4 |

---

### Task 1: m-mcm vitest 도입 · types.ts · format.ts

**Files:**
- Modify: `src/frontend/m-mcm/package.json` (scripts·devDependencies)
- Modify: `src/frontend/pnpm-lock.yaml` (pnpm 이 고친다)
- Create: `src/frontend/m-mcm/vitest.config.mts`
- Create: `src/frontend/m-mcm/page-components/csa/screenUsageStat/types.ts`
- Create: `src/frontend/m-mcm/page-components/csa/screenUsageStat/format.ts`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/format.test.ts`

**Interfaces:**
- Consumes: C4 행·필드 이름(총괄 계획).
- Produces (`types.ts`):
  - `type StatTab = "overview" | "screen" | "dept" | "user" | "unused" | "history"`
  - `type StatAction = "overview" | "byScreen" | "byDept" | "byUser" | "unused" | "history"`
  - `type UsageStartKind = "OPEN" | "SWITCH" | "RESUME"`
  - `interface StatFilters { fromDt; toDt; deptCd; userId; pageId; unusedDays }` — 모두 `string`, 날짜는 `yyyy-MM-dd`(DatePicker 값)
  - 행 타입 `ScreenUsageDailyRow`·`ScreenUsageTopScreen`·`ScreenUsageOverview`·`ScreenUsageScreenRow`·`ScreenUsageDeptRow`·`ScreenUsageUserRow`·`ScreenUsageUnusedRow`·`ScreenUsageHistoryRow`, `type ScreenUsageUserGridRow = ScreenUsageUserRow & { rowKey: string }`
  - `interface StatData`, `emptyStatData(): StatData`, `emptyFilters(): StatFilters`, `TAB_LABEL: Record<StatTab, string>`, `TAB_ITEMS: TabItem[]`
- Produces (`format.ts`):
  - 상수 `HISTORY_MAX_DAYS = 31`, `DEFAULT_UNUSED_DAYS = 90`, `MAX_UNUSED_DAYS = 3650`, `START_KIND_LABEL`
  - `formatDuration(ms: unknown): string`, `formatYmd(v: unknown): string`, `formatMonthDay(ymd: string): string`, `toYmd(date: string): string`, `periodDays(from: string, to: string): number`
  - `parseUnusedDays(input: string): number | null`, `checkFilters(f: StatFilters): string | null`, `checkHistoryPeriod(from: string, to: string): string | null`
  - `startKindLabel(v: unknown): string`, `toDailyPoints(daily, fromDt, toDt): ChartPoint[]`, `toTopBars(top, color): BarPoint[]`, `toExportRows(rows): Record<string, unknown>[]`
  - `interface ChartPoint { label: string; value: number }`, `interface BarPoint extends ChartPoint { color: string }` (shared `LineDataPoint`·`BarData` 와 모양이 같다)

- [ ] **Step 1: 의존성 설치 확인과 vitest 추가**

워크트리에는 `src/frontend/node_modules` 가 없다. 먼저 설치하고, m-mcm 에 vitest 를 devDependency 로 더한다(잠금 파일에 이미 있는 3.2.7 로 해석된다).

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm install --frozen-lockfile --prefer-offline
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm add -D vitest@^3.2.4 --prefer-offline
```
Expected: 두 명령 모두 네트워크 내려받기 없이 끝나고, `m-mcm/package.json` 의 `devDependencies` 에 `"vitest": "^3.2.4"` 가 생긴다. `/usr/bin/git diff -- src/frontend/pnpm-lock.yaml` 에는 `importers.m-mcm.devDependencies.vitest`(version `3.2.7(...)`)가 보인다. m-mcm 에는 happy-dom 이 없어 `snapshots:` 에 vitest 3.2.7 의 새 peer 조합 항목이 생길 수 있는데 이것은 정상이다. `packages:` 절에 새 이름·새 버전이 생기면(다른 vitest 버전 등) 멈추고 메인에 보고한다.

- [ ] **Step 2: test 스크립트와 vitest 설정**

`src/frontend/m-mcm/package.json` 의 `scripts` 에 `"lint": "eslint"` 다음 줄로 넣는다:

```json
    "lint": "eslint",
    "test": "vitest run"
```

Create `src/frontend/m-mcm/vitest.config.mts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * m-mcm 단위 시험 — 화면 폴더의 순수 함수와 api 변환만 시험한다(렌더 시험 없음, 브라우저 확인은 별도).
 * `@/` 별칭은 tsconfig paths 와 같게 패키지 루트로 푼다. 정규식이라 `@dk-oasis/*` 는 건드리지 않는다.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: types.ts 작성 (C4 타입 그대로)**

Create `src/frontend/m-mcm/page-components/csa/screenUsageStat/types.ts`:

```ts
/**
 * screenUsageStat 타입·상수. 행 타입은 총괄 계획(docs/superpowers/plans/2026-10-02-screen-usage-stats.md) C4 그대로다.
 * 일자(usageDt·lastUsedDt)는 yyyyMMdd, 시각(startedAt·endedAt)은 "yyyy-MM-dd HH:mm:ss"(Asia/Seoul) 문자열, 시간·건수는 숫자.
 * 메뉴에 없는 화면은 menuNm "(메뉴 없음)", 부서 없음은 deptCd "-" · deptNm "(부서 없음)" 으로 온다.
 */
import type { TabItem } from "@dk-oasis/shared/tabs";
import { addDays, formatDateStr, today } from "@dk-oasis/shared/utils";

import { DEFAULT_UNUSED_DAYS } from "./format";

export type StatTab = "overview" | "screen" | "dept" | "user" | "unused" | "history";
export type StatAction = "overview" | "byScreen" | "byDept" | "byUser" | "unused" | "history";
export type UsageStartKind = "OPEN" | "SWITCH" | "RESUME";

/** 조회조건. 날짜는 DatePicker 값(yyyy-MM-dd), 서버로 보낼 때 api.ts 가 yyyyMMdd 로 바꾼다. */
export interface StatFilters {
  fromDt: string;
  toDt: string;
  deptCd: string;
  userId: string;
  pageId: string;
  /** 미사용 화면 탭의 기준 일수 입력값. 비면 90. */
  unusedDays: string;
}

export interface ScreenUsageDailyRow extends Record<string, unknown> {
  usageDt: string;
  openCnt: number;
  userCnt: number;
  durationMs: number;
}

export interface ScreenUsageTopScreen extends Record<string, unknown> {
  pageId: string;
  menuNm: string;
  openCnt: number;
  durationMs: number;
}

/** overview → data.result */
export interface ScreenUsageOverview {
  totalOpenCnt: number;
  userCnt: number;
  totalDurationMs: number;
  unusedScreenCnt: number;
  daily: ScreenUsageDailyRow[];
  topScreens: ScreenUsageTopScreen[];
}

/** byScreen → grids.screens.rows */
export interface ScreenUsageScreenRow extends Record<string, unknown> {
  pageId: string;
  menuNm: string;
  menuPath: string;
  openCnt: number;
  userCnt: number;
  durationMs: number;
  avgDurationMs: number;
  lastUsedDt: string | null;
}

/** byDept → grids.depts.rows */
export interface ScreenUsageDeptRow extends Record<string, unknown> {
  deptCd: string;
  deptNm: string;
  userCnt: number;
  openCnt: number;
  durationMs: number;
  topPageId: string | null;
  topMenuNm: string | null;
}

/** byUser → grids.users.rows */
export interface ScreenUsageUserRow extends Record<string, unknown> {
  userId: string;
  userNm: string;
  deptCd: string;
  deptNm: string;
  openCnt: number;
  durationMs: number;
  lastUsedDt: string | null;
}

/** 사용자별 그리드 행 — 부서 스냅숏 때문에 한 사용자가 여러 행일 수 있어 userId|deptCd 를 행 키로 쓴다. */
export type ScreenUsageUserGridRow = ScreenUsageUserRow & { rowKey: string };

/** unused → grids.unused.rows */
export interface ScreenUsageUnusedRow extends Record<string, unknown> {
  pageId: string;
  menuNm: string;
  menuPath: string;
  lastUsedDt: string | null;
}

/** history → grids.history.rows */
export interface ScreenUsageHistoryRow extends Record<string, unknown> {
  usageId: string;
  userId: string;
  userNm: string;
  deptCd: string;
  deptNm: string;
  pageId: string;
  menuNm: string;
  startKind: UsageStartKind;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  clientIp: string | null;
}

/** 탭별 조회 결과. overviewRange 는 개요를 부른 기간(yyyy-MM-dd 쌍) — 추이 선의 빈 날 채움에 쓴다. */
export interface StatData {
  overview: ScreenUsageOverview | null;
  overviewRange: readonly [string, string] | null;
  screens: ScreenUsageScreenRow[];
  depts: ScreenUsageDeptRow[];
  users: ScreenUsageUserGridRow[];
  unused: ScreenUsageUnusedRow[];
  history: ScreenUsageHistoryRow[];
}

export const emptyStatData = (): StatData => ({
  overview: null,
  overviewRange: null,
  screens: [],
  depts: [],
  users: [],
  unused: [],
  history: [],
});

/** 기간 기본값: 오늘-30일 ~ 오늘(설계 §5). today()·addDays() 는 yyyyMMdd 라 formatDateStr 로 DatePicker 형식으로 바꾼다. */
export const emptyFilters = (): StatFilters => ({
  fromDt: formatDateStr(addDays(today(), -30)),
  toDt: formatDateStr(today()),
  deptCd: "",
  userId: "",
  pageId: "",
  unusedDays: String(DEFAULT_UNUSED_DAYS),
});

export const TAB_LABEL: Record<StatTab, string> = {
  overview: "개요",
  screen: "화면별",
  dept: "부서별",
  user: "사용자별",
  unused: "미사용 화면",
  history: "이용 이력",
};

const TAB_ORDER: StatTab[] = ["overview", "screen", "dept", "user", "unused", "history"];

export const TAB_ITEMS: TabItem[] = TAB_ORDER.map((key) => ({ key, label: TAB_LABEL[key] }));
```

- [ ] **Step 4: 실패하는 시험 작성**

Create `src/frontend/m-mcm/tests/csa/screenUsageStat/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  HISTORY_MAX_DAYS,
  checkFilters,
  checkHistoryPeriod,
  formatDuration,
  formatMonthDay,
  formatYmd,
  parseUnusedDays,
  periodDays,
  startKindLabel,
  toDailyPoints,
  toExportRows,
  toTopBars,
  toYmd,
} from "@/page-components/csa/screenUsageStat/format";
import type {
  ScreenUsageDailyRow,
  ScreenUsageTopScreen,
  StatFilters,
} from "@/page-components/csa/screenUsageStat/types";

const MIN = 60_000;
const HOUR = 60 * MIN;

const VALID: StatFilters = {
  fromDt: "2026-09-01",
  toDt: "2026-09-30",
  deptCd: "",
  userId: "",
  pageId: "",
  unusedDays: "90",
};

const daily = (usageDt: string, openCnt: number): ScreenUsageDailyRow => ({
  usageDt,
  openCnt,
  userCnt: 1,
  durationMs: 0,
});

const top = (pageId: string, menuNm: string, openCnt: number): ScreenUsageTopScreen => ({
  pageId,
  menuNm,
  openCnt,
  durationMs: 0,
});

describe("formatDuration", () => {
  it("시간·분으로 적는다", () => {
    expect(formatDuration(HOUR + 2 * MIN)).toBe("1시간 2분");
    expect(formatDuration(2 * HOUR)).toBe("2시간");
    expect(formatDuration(5 * MIN + 59_000)).toBe("5분");
  });

  it("0 은 0분, 1분 미만은 '1분 미만'", () => {
    expect(formatDuration(0)).toBe("0분");
    expect(formatDuration(59_999)).toBe("1분 미만");
    expect(formatDuration(MIN)).toBe("1분");
  });

  it("큰 시간은 천 단위 구분", () => {
    expect(formatDuration(1234 * HOUR + 5 * MIN)).toBe("1,234시간 5분");
  });

  it("숫자 문자열도 받고, 값 없음·음수·NaN 은 빈 문자열", () => {
    expect(formatDuration("3720000")).toBe("1시간 2분");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(-1)).toBe("");
    expect(formatDuration(Number.NaN)).toBe("");
  });
});

describe("날짜 표기", () => {
  it("yyyyMMdd → yyyy-MM-dd, 비면 빈 문자열, 형식이 다르면 그대로", () => {
    expect(formatYmd("20261002")).toBe("2026-10-02");
    expect(formatYmd(null)).toBe("");
    expect(formatYmd("")).toBe("");
    expect(formatYmd("2026-10-02")).toBe("2026-10-02");
  });

  it("차트 라벨은 MM/dd", () => {
    expect(formatMonthDay("20261002")).toBe("10/02");
  });

  it("DatePicker 값 yyyy-MM-dd → 서버 yyyyMMdd", () => {
    expect(toYmd("2026-10-02")).toBe("20261002");
  });

  it("기간 일수 = 종료 - 시작(두 형식 모두), 형식이 틀리면 NaN", () => {
    expect(periodDays("2026-10-01", "2026-11-01")).toBe(31);
    expect(periodDays("20261001", "20261001")).toBe(0);
    expect(periodDays("2026-10-02", "2026-10-01")).toBe(-1);
    expect(periodDays("", "2026-10-01")).toBeNaN();
  });
});

describe("이용 이력 기간 경계 (C4: toDt - fromDt ≤ 31)", () => {
  it("31일 차는 통과", () => {
    expect(HISTORY_MAX_DAYS).toBe(31);
    expect(checkHistoryPeriod("2026-10-01", "2026-11-01")).toBeNull();
  });

  it("32일 차는 안내 문구로 막는다", () => {
    expect(checkHistoryPeriod("2026-10-01", "2026-11-02")).toBe(
      "이용 이력 조회 기간은 31일 이하여야 합니다.",
    );
  });
});

describe("조회조건 검사", () => {
  it("문제가 없으면 null", () => {
    expect(checkFilters(VALID)).toBeNull();
    expect(checkFilters({ ...VALID, unusedDays: "" })).toBeNull();
  });

  it("기간 누락·역전", () => {
    expect(checkFilters({ ...VALID, fromDt: "" })).toBe("조회 시작일을 입력하세요.");
    expect(checkFilters({ ...VALID, toDt: "" })).toBe("조회 종료일을 입력하세요.");
    expect(checkFilters({ ...VALID, fromDt: "2026-10-02", toDt: "2026-10-01" })).toBe(
      "시작일이 종료일보다 늦을 수 없습니다.",
    );
  });

  it("미사용 기준 일수는 1~3650 정수", () => {
    const msg = "미사용 기준 일수는 1~3650 사이의 정수여야 합니다.";
    expect(checkFilters({ ...VALID, unusedDays: "0" })).toBe(msg);
    expect(checkFilters({ ...VALID, unusedDays: "abc" })).toBe(msg);
  });

  it("parseUnusedDays: 비면 90, 범위·정수 밖이면 null", () => {
    expect(parseUnusedDays("")).toBe(90);
    expect(parseUnusedDays(" 30 ")).toBe(30);
    expect(parseUnusedDays("3650")).toBe(3650);
    expect(parseUnusedDays("3651")).toBeNull();
    expect(parseUnusedDays("1.5")).toBeNull();
    expect(parseUnusedDays("-1")).toBeNull();
  });
});

describe("차트 변환", () => {
  it("이용이 없는 날은 0 으로 채운다", () => {
    const points = toDailyPoints([daily("20261001", 3), daily("20261003", 5)], "2026-10-01", "2026-10-03");
    expect(points).toEqual([
      { label: "10/01", value: 3 },
      { label: "10/02", value: 0 },
      { label: "10/03", value: 5 },
    ]);
  });

  it("월 경계를 넘어 이어진다", () => {
    const points = toDailyPoints([], "2026-09-30", "2026-10-01");
    expect(points.map((p) => p.label)).toEqual(["09/30", "10/01"]);
  });

  it("기간이 틀리면 받은 행을 일자 순으로만 그린다", () => {
    const points = toDailyPoints([daily("20261003", 5), daily("20261001", 3)], "", "2026-10-03");
    expect(points).toEqual([
      { label: "10/01", value: 3 },
      { label: "10/03", value: 5 },
    ]);
  });

  it("메뉴 없는 화면·같은 이름 화면이 겹쳐도 막대 라벨은 유일하고 '(메뉴 없음)' 은 그대로 보인다", () => {
    const bars = toTopBars(
      [
        top("a/x", "(메뉴 없음)", 5),
        top("b/y", "(메뉴 없음)", 3),
        top("c/z", "사용자 관리", 2),
        top("d/w", "사용자 관리", 1),
        top("e/v", "메뉴 관리", 1),
        top("f/u", "", 1),
      ],
      "var(--color-chart-1)",
    );
    expect(bars.map((b) => b.label)).toEqual([
      "(메뉴 없음) (a/x)",
      "(메뉴 없음) (b/y)",
      "사용자 관리 (c/z)",
      "사용자 관리 (d/w)",
      "메뉴 관리",
      "f/u",
    ]);
    expect(new Set(bars.map((b) => b.label)).size).toBe(bars.length);
    expect(bars[0]).toEqual({ label: "(메뉴 없음) (a/x)", value: 5, color: "var(--color-chart-1)" });
  });

  it("메뉴 없는 화면이 하나뿐이면 '(메뉴 없음)' 그대로", () => {
    const bars = toTopBars([top("a/x", "(메뉴 없음)", 5), top("c/z", "사용자 관리", 2)], "var(--color-chart-1)");
    expect(bars.map((b) => b.label)).toEqual(["(메뉴 없음)", "사용자 관리"]);
  });
});

describe("엑셀 변환", () => {
  it("이용 시간·일자·시작 사유를 읽는 글자로 바꾸고 원본은 그대로 둔다", () => {
    const row = {
      menuNm: "사용자 관리",
      durationMs: HOUR + 2 * MIN,
      avgDurationMs: MIN,
      lastUsedDt: "20261002",
      usageDt: "20261001",
      startKind: "OPEN",
    };
    expect(toExportRows([row])).toEqual([
      {
        menuNm: "사용자 관리",
        durationMs: "1시간 2분",
        avgDurationMs: "1분",
        lastUsedDt: "2026-10-02",
        usageDt: "2026-10-01",
        startKind: "열기",
      },
    ]);
    expect(row.durationMs).toBe(HOUR + 2 * MIN);
  });

  it("시작 사유 라벨, 모르는 값은 그대로", () => {
    expect(startKindLabel("SWITCH")).toBe("전환");
    expect(startKindLabel("RESUME")).toBe("재개");
    expect(startKindLabel("X")).toBe("X");
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/format.test.ts`
Expected: FAIL — `Failed to resolve import "@/page-components/csa/screenUsageStat/format"` (format.ts 없음).

- [ ] **Step 6: format.ts 구현**

Create `src/frontend/m-mcm/page-components/csa/screenUsageStat/format.ts`:

```ts
/**
 * screenUsageStat 표시·입력 변환과 검사 — 순수 함수만 둔다.
 * React·@dk-oasis/shared 를 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import type {
  ScreenUsageDailyRow,
  ScreenUsageTopScreen,
  StatFilters,
  UsageStartKind,
} from "./types";

/** C4: history 는 toDt - fromDt 가 31일 이하. */
export const HISTORY_MAX_DAYS = 31;
export const DEFAULT_UNUSED_DAYS = 90;
export const MAX_UNUSED_DAYS = 3650;

export const START_KIND_LABEL: Record<UsageStartKind, string> = {
  OPEN: "열기",
  SWITCH: "전환",
  RESUME: "재개",
};

/** shared LineDataPoint 와 같은 모양. */
export interface ChartPoint {
  label: string;
  value: number;
}

/** shared BarData 와 같은 모양. */
export interface BarPoint extends ChartPoint {
  color: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const YMD = /^\d{8}$/;

/** 이용 시간(ms) → "1시간 2분". 0 → "0분", 1분 미만 → "1분 미만", 값 없음·음수·숫자 아님 → "". */
export function formatDuration(ms: unknown): string {
  if (ms === null || ms === undefined || ms === "") return "";
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "0분";
  if (n < MINUTE_MS) return "1분 미만";
  const totalMin = Math.floor(n / MINUTE_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  const hText = `${h.toLocaleString("ko-KR")}시간`;
  return m === 0 ? hText : `${hText} ${m}분`;
}

/** yyyyMMdd → yyyy-MM-dd. 비면 "", 8자리 숫자가 아니면 그대로. */
export function formatYmd(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (s === "" || !YMD.test(s)) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** yyyyMMdd → MM/dd (추이 선 가로축 라벨). */
export function formatMonthDay(ymd: string): string {
  return YMD.test(ymd) ? `${ymd.slice(4, 6)}/${ymd.slice(6, 8)}` : ymd;
}

/** yyyy-MM-dd(DatePicker 값) → yyyyMMdd(서버 파라미터). 이미 yyyyMMdd 면 그대로. */
export function toYmd(date: string): string {
  return date.replace(/-/g, "");
}

function ymdToUtc(ymd: string): number {
  if (!YMD.test(ymd)) return Number.NaN;
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
}

function utcToYmd(t: number): string {
  const d = new Date(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${mm}${dd}`;
}

/** 기간 일수 = to - from (yyyy-MM-dd·yyyyMMdd 모두 받음). 형식이 틀리면 NaN. */
export function periodDays(from: string, to: string): number {
  return Math.round((ymdToUtc(toYmd(to)) - ymdToUtc(toYmd(from))) / DAY_MS);
}

/** 미사용 기준 일수 입력 → 정수. 비면 90, 1~3650 정수가 아니면 null. */
export function parseUnusedDays(input: string): number | null {
  const s = input.trim();
  if (s === "") return DEFAULT_UNUSED_DAYS;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_UNUSED_DAYS ? n : null;
}

/** [조회] 전 검사. 문제가 없으면 null, 있으면 처음 걸린 안내 문구 하나(screen-patterns.md §메시지). */
export function checkFilters(f: StatFilters): string | null {
  if (!f.fromDt) return "조회 시작일을 입력하세요.";
  if (!f.toDt) return "조회 종료일을 입력하세요.";
  if (periodDays(f.fromDt, f.toDt) < 0) return "시작일이 종료일보다 늦을 수 없습니다.";
  if (parseUnusedDays(f.unusedDays) === null) {
    return `미사용 기준 일수는 1~${MAX_UNUSED_DAYS} 사이의 정수여야 합니다.`;
  }
  return null;
}

/** 이용 이력 탭 조회 전 검사. 31일 이하면 null. */
export function checkHistoryPeriod(from: string, to: string): string | null {
  return periodDays(from, to) > HISTORY_MAX_DAYS
    ? `이용 이력 조회 기간은 ${HISTORY_MAX_DAYS}일 이하여야 합니다.`
    : null;
}

export function startKindLabel(v: unknown): string {
  return START_KIND_LABEL[v as UsageStartKind] ?? String(v ?? "");
}

/**
 * 일별 추이 → 차트 점. 기간 안의 빈 날은 0 으로 채운다(빈 날을 건너뛴 선이 추이를 왜곡하지 않게).
 * 기간이 틀리면 받은 행을 일자 순으로만 그린다.
 */
export function toDailyPoints(
  rows: readonly ScreenUsageDailyRow[],
  fromDt: string,
  toDt: string,
): ChartPoint[] {
  const start = ymdToUtc(toYmd(fromDt));
  const end = ymdToUtc(toYmd(toDt));
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return [...rows]
      .sort((a, b) => String(a.usageDt).localeCompare(String(b.usageDt)))
      .map((r) => ({ label: formatMonthDay(String(r.usageDt)), value: Number(r.openCnt) || 0 }));
  }
  const byDay = new Map(rows.map((r) => [String(r.usageDt), Number(r.openCnt) || 0]));
  const out: ChartPoint[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const ymd = utcToYmd(t);
    out.push({ label: formatMonthDay(ymd), value: byDay.get(ymd) ?? 0 });
  }
  return out;
}

/**
 * 상위 화면 → 가로 막대. HBarChart 는 label 을 React key 로 쓰므로 라벨을 유일하게 만든다.
 * 서버가 준 menuNm(메뉴 없는 화면은 "(메뉴 없음)")을 그대로 쓰고, 같은 라벨이 여럿이면 뒤에 "(pageId)" 를 붙인다.
 * menuNm 이 비면 pageId 를 쓴다(pageId 는 C4 에서 화면마다 하나라 결과가 유일하다).
 */
export function toTopBars(rows: readonly ScreenUsageTopScreen[], color: string): BarPoint[] {
  const base = rows.map((r) => (r.menuNm ? String(r.menuNm) : String(r.pageId)));
  const count = new Map<string, number>();
  for (const b of base) count.set(b, (count.get(b) ?? 0) + 1);
  return rows.map((r, i) => ({
    label: (count.get(base[i]) ?? 0) > 1 ? `${base[i]} (${r.pageId})` : base[i],
    value: Number(r.openCnt) || 0,
    color,
  }));
}

const DURATION_KEYS = ["durationMs", "avgDurationMs", "totalDurationMs"];
const YMD_KEYS = ["usageDt", "lastUsedDt"];

/** 엑셀용 행 — 이용 시간·일자·시작 사유를 화면과 같은 글자로 바꾼다. 원본 행은 바꾸지 않는다. */
export function toExportRows(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const k of DURATION_KEYS) if (k in out) out[k] = formatDuration(out[k]);
    for (const k of YMD_KEYS) if (k in out) out[k] = formatYmd(out[k]);
    if ("startKind" in out) out.startKind = startKindLabel(out.startKind);
    return out;
  });
}
```

- [ ] **Step 7: 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/format.test.ts`
Expected: PASS — 시험 파일 1개, 모든 시험 통과(0 failed).

- [ ] **Step 8: 포맷**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write package.json vitest.config.mts page-components/csa/screenUsageStat/types.ts page-components/csa/screenUsageStat/format.ts tests/csa/screenUsageStat/format.test.ts`
Expected: 5개 파일 처리. 그 뒤 Step 7 명령을 다시 돌려 PASS.

- [ ] **Step 9: 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/frontend/m-mcm/package.json src/frontend/pnpm-lock.yaml src/frontend/m-mcm/vitest.config.mts src/frontend/m-mcm/page-components/csa/screenUsageStat/types.ts src/frontend/m-mcm/page-components/csa/screenUsageStat/format.ts src/frontend/m-mcm/tests/csa/screenUsageStat/format.test.ts
/usr/bin/git commit -m "test(m-mcm): vitest 를 들이고 화면 사용 통계의 표시·검사 함수를 시험한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: api.ts — 파라미터 조립 · envelope 해제 · 탭 요청 추적기

**Files:**
- Create: `src/frontend/m-mcm/page-components/csa/screenUsageStat/api.ts`
- Test: `src/frontend/m-mcm/tests/csa/screenUsageStat/api.test.ts`

**Interfaces:**
- Consumes (Task 1): `StatFilters`·`StatTab`·`StatAction`·행 타입(`import type` 만), `toYmd`·`parseUnusedDays`·`DEFAULT_UNUSED_DAYS`(format.ts). m-mcm `createJsonApiClient()`(`@/lib/http/json-api-client` — HTTP 오류는 `STATUS_FALLBACK_MESSAGES` 문구로 throw).
- Produces:
  - `TAB_ACTION: Record<StatTab, StatAction>`
  - `buildStatParams(tab: StatTab, q: StatFilters, deptCd?: string): Record<string, string | number>`
  - `statQueryKey(tab: StatTab, q: StatFilters): string`
  - `fetchOverview(q): Promise<ScreenUsageOverview>`, `fetchByScreen(q, deptCd?): Promise<ScreenUsageScreenRow[]>`, `fetchByDept(q): Promise<ScreenUsageDeptRow[]>`, `fetchByUser(q): Promise<ScreenUsageUserGridRow[]>`, `fetchUnused(q): Promise<ScreenUsageUnusedRow[]>`, `fetchHistory(q): Promise<ScreenUsageHistoryRow[]>`
  - `createTabRequestTracker<K extends string>(): TabRequestTracker<K>` — `{ isLoaded(tab, key), begin(tab): number, isLatest(tab, n), markLoaded(tab, key), finish(): boolean, reset() }`

- [ ] **Step 1: 실패하는 시험 작성**

Create `src/frontend/m-mcm/tests/csa/screenUsageStat/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildStatParams,
  createTabRequestTracker,
  fetchByDept,
  fetchByScreen,
  fetchByUser,
  fetchHistory,
  fetchOverview,
  fetchUnused,
  statQueryKey,
} from "@/page-components/csa/screenUsageStat/api";
import type { StatFilters } from "@/page-components/csa/screenUsageStat/types";

const Q: StatFilters = {
  fromDt: "2026-09-01",
  toDt: "2026-09-30",
  deptCd: "",
  userId: "",
  pageId: "",
  unusedDays: "",
};

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function sent(i = 0): { url: string; body: { meta: Record<string, unknown>; params: Record<string, unknown> } } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildStatParams", () => {
  it("기간을 yyyyMMdd 로 바꾸고 빈 조건은 보내지 않는다", () => {
    expect(buildStatParams("screen", Q)).toEqual({ fromDt: "20260901", toDt: "20260930" });
  });

  it("부서·사용자·화면 조건은 앞뒤 공백을 지워 보낸다", () => {
    const q = { ...Q, deptCd: " D100 ", userId: " kim ", pageId: " csa/commUserMng " };
    expect(buildStatParams("user", q)).toEqual({
      fromDt: "20260901",
      toDt: "20260930",
      deptCd: "D100",
      userId: "kim",
      pageId: "csa/commUserMng",
    });
  });

  it("부서 상세 조회는 인자로 받은 부서코드가 조회조건 부서보다 우선한다", () => {
    expect(buildStatParams("screen", { ...Q, deptCd: "D100" }, "D200").deptCd).toBe("D200");
    expect(buildStatParams("screen", Q, "-").deptCd).toBe("-");
  });

  it("미사용 탭만 unusedDays 를 숫자로 보내고, 비면 90", () => {
    expect(buildStatParams("unused", Q).unusedDays).toBe(90);
    expect(buildStatParams("unused", { ...Q, unusedDays: "30" }).unusedDays).toBe(30);
    expect(buildStatParams("screen", { ...Q, unusedDays: "30" })).not.toHaveProperty("unusedDays");
  });
});

describe("statQueryKey", () => {
  it("같은 조건이면 같은 키, 미사용 기준 일수만 바뀌면 미사용 탭 키만 바뀐다", () => {
    const q30 = { ...Q, unusedDays: "30" };
    expect(statQueryKey("screen", Q)).toBe(statQueryKey("screen", { ...Q }));
    expect(statQueryKey("screen", Q)).toBe(statQueryKey("screen", q30));
    expect(statQueryKey("unused", Q)).not.toBe(statQueryKey("unused", q30));
    expect(statQueryKey("screen", Q)).not.toBe(statQueryKey("user", Q));
  });
});

describe("호출과 envelope 해제", () => {
  it("byScreen: 경로·meta·params 를 보내고 grids.screens.rows 를 돌려준다", async () => {
    reply({ meta: { success: true }, grids: { screens: { rows: [{ pageId: "csa/commUserMng", menuNm: "(메뉴 없음)" }] } } });
    const rows = await fetchByScreen(Q);
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/byScreen");
    expect(body.meta).toEqual({ menuId: "screenUsageStat" });
    expect(body.params).toEqual({ fromDt: "20260901", toDt: "20260930" });
    expect(rows).toEqual([{ pageId: "csa/commUserMng", menuNm: "(메뉴 없음)" }]);
  });

  it("byScreen(deptCd): 부서 상세는 deptCd 를 params 에 싣는다", async () => {
    reply({ meta: { success: true }, grids: { screens: { rows: [] } } });
    await fetchByScreen(Q, "D100");
    expect(sent().body.params.deptCd).toBe("D100");
  });

  it("overview: data.result 를 펴서 돌려준다", async () => {
    const result = {
      totalOpenCnt: 12,
      userCnt: 3,
      totalDurationMs: 3_720_000,
      unusedScreenCnt: 5,
      daily: [{ usageDt: "20260901", openCnt: 12, userCnt: 3, durationMs: 3_720_000 }],
      topScreens: [{ pageId: "csa/commUserMng", menuNm: "사용자 관리", openCnt: 12, durationMs: 3_720_000 }],
    };
    reply({ meta: { success: true }, data: { result } });
    expect(await fetchOverview(Q)).toEqual(result);
    expect(sent().url).toBe("/api/mcm/oasis/screenUsageStat/overview");
  });

  it("overview: 필드가 빠진 빈 응답은 0 과 빈 배열", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    expect(await fetchOverview(Q)).toEqual({
      totalOpenCnt: 0,
      userCnt: 0,
      totalDurationMs: 0,
      unusedScreenCnt: 0,
      daily: [],
      topScreens: [],
    });
  });

  it("grids 가 없으면 빈 배열", async () => {
    reply({ meta: { success: true } });
    expect(await fetchByDept(Q)).toEqual([]);
    expect(sent().url).toBe("/api/mcm/oasis/screenUsageStat/byDept");
  });

  it("byUser: 부서를 옮긴 사용자도 행 키가 겹치지 않는다", async () => {
    reply({
      meta: { success: true },
      grids: {
        users: {
          rows: [
            { userId: "kim", deptCd: "D100" },
            { userId: "kim", deptCd: "D200" },
          ],
        },
      },
    });
    const rows = await fetchByUser(Q);
    expect(rows.map((r) => r.rowKey)).toEqual(["kim|D100", "kim|D200"]);
    expect(sent().url).toBe("/api/mcm/oasis/screenUsageStat/byUser");
  });

  it("unused: unusedDays 를 싣고 grids.unused.rows 를 돌려준다", async () => {
    reply({ meta: { success: true }, grids: { unused: { rows: [{ pageId: "a/b", lastUsedDt: null }] } } });
    const rows = await fetchUnused(Q);
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/unused");
    expect(body.params.unusedDays).toBe(90);
    expect(rows).toEqual([{ pageId: "a/b", lastUsedDt: null }]);
  });

  it("history: grids.history.rows 를 돌려준다", async () => {
    reply({ meta: { success: true }, grids: { history: { rows: [{ usageId: "u1" }] } } });
    expect(await fetchHistory(Q)).toEqual([{ usageId: "u1" }]);
    expect(sent().url).toBe("/api/mcm/oasis/screenUsageStat/history");
  });

  it("meta.success=false 는 서버 문구로 거절한다", async () => {
    reply({ meta: { success: false, message: "조회 기간이 너무 깁니다." } });
    await expect(fetchHistory(Q)).rejects.toThrow("조회 기간이 너무 깁니다.");
  });

  it("meta.success=false 에 문구가 없으면 기본 문구", async () => {
    reply({ meta: { success: false } });
    await expect(fetchByUser(Q)).rejects.toThrow("요청이 거부되었습니다.");
  });

  it("HTTP 403 은 권한 문구로 거절한다", async () => {
    reply({}, 403);
    await expect(fetchByScreen(Q)).rejects.toThrow("권한이 없습니다.");
  });
});

describe("createTabRequestTracker", () => {
  it("같은 탭의 마지막 요청만 최신이다", () => {
    const t = createTabRequestTracker<"screen" | "dept">();
    const first = t.begin("screen");
    const second = t.begin("screen");
    expect(t.isLatest("screen", first)).toBe(false);
    expect(t.isLatest("screen", second)).toBe(true);
    const other = t.begin("dept");
    expect(t.isLatest("dept", other)).toBe(true);
    expect(t.isLatest("screen", second)).toBe(true);
  });

  it("남은 요청이 있으면 finish 가 true(로딩 유지), 모두 끝나면 false", () => {
    const t = createTabRequestTracker<"screen" | "dept">();
    t.begin("screen");
    t.begin("dept");
    expect(t.finish()).toBe(true);
    expect(t.finish()).toBe(false);
    expect(t.finish()).toBe(false);
  });

  it("받은 조건 키를 기억하고 reset 으로 모두 잊는다", () => {
    const t = createTabRequestTracker<"screen">();
    expect(t.isLoaded("screen", "k1")).toBe(false);
    t.markLoaded("screen", "k1");
    expect(t.isLoaded("screen", "k1")).toBe(true);
    expect(t.isLoaded("screen", "k2")).toBe(false);
    t.reset();
    expect(t.isLoaded("screen", "k1")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/api.test.ts`
Expected: FAIL — `Failed to resolve import "@/page-components/csa/screenUsageStat/api"`.

- [ ] **Step 3: api.ts 구현**

Create `src/frontend/m-mcm/page-components/csa/screenUsageStat/api.ts`:

```ts
/**
 * screenUsageStat OASIS 호출 — POST /api/mcm/oasis/screenUsageStat/{action}.
 * 응답 계약: docs/superpowers/plans/2026-10-02-screen-usage-stats.md C4.
 * envelope 해제는 csa/commSyncMng/api.ts 와 같은 규칙이다: meta.success=false 거절, data(+data.result) 펼침, grids.{key}.rows.
 * meta.userId 는 보내지 않는다 — 서버가 인증 정보로 채운다(m-mls noticeMgmt/api.ts 와 같다).
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { DEFAULT_UNUSED_DAYS, parseUnusedDays, toYmd } from "./format";
import type {
  ScreenUsageDeptRow,
  ScreenUsageHistoryRow,
  ScreenUsageOverview,
  ScreenUsageScreenRow,
  ScreenUsageUnusedRow,
  ScreenUsageUserGridRow,
  ScreenUsageUserRow,
  StatAction,
  StatFilters,
  StatTab,
} from "./types";

const api = createJsonApiClient();

const SCREEN_ID = "screenUsageStat";
const OASIS_BASE = `/api/mcm/oasis/${SCREEN_ID}`;

export const TAB_ACTION: Record<StatTab, StatAction> = {
  overview: "overview",
  screen: "byScreen",
  dept: "byDept",
  user: "byUser",
  unused: "unused",
  history: "history",
};

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

function unwrapPayload(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope;
  // OASIS 실행기는 업무 거절을 HTTP 200 + meta.success=false 로 돌려준다(commSyncMng/api.ts 주석 참고).
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  if (env?.grids) {
    for (const [key, val] of Object.entries(env.grids)) {
      out[key] = val?.rows ?? [];
    }
  }
  return out;
}

async function callAction(
  action: StatAction,
  params: Record<string, string | number>,
): Promise<Record<string, unknown>> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: { meta: { menuId: SCREEN_ID }, params },
  });
  return unwrapPayload(res);
}

function rowsOf<T>(out: Record<string, unknown>, key: string): T[] {
  const v = out[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * C4 공통 params. 기간은 yyyyMMdd, 빈 조건은 보내지 않는다.
 * deptCd 인자는 부서별 탭의 "선택 부서 화면별" 조회용으로 조회조건 부서보다 우선한다.
 * unusedDays 는 unused 탭에만 숫자로 싣는다(비면 90).
 */
export function buildStatParams(
  tab: StatTab,
  q: StatFilters,
  deptCd?: string,
): Record<string, string | number> {
  const params: Record<string, string | number> = { fromDt: toYmd(q.fromDt), toDt: toYmd(q.toDt) };
  const dept = (deptCd ?? q.deptCd).trim();
  if (dept) params.deptCd = dept;
  const userId = q.userId.trim();
  if (userId) params.userId = userId;
  const pageId = q.pageId.trim();
  if (pageId) params.pageId = pageId;
  if (tab === "unused") params.unusedDays = parseUnusedDays(q.unusedDays) ?? DEFAULT_UNUSED_DAYS;
  return params;
}

/** 탭별 조회 조건 키 — 실제로 보낼 params 로 만든다. 같으면 탭 전환 때 다시 부르지 않는다. */
export function statQueryKey(tab: StatTab, q: StatFilters): string {
  return `${tab}:${JSON.stringify(buildStatParams(tab, q))}`;
}

export async function fetchOverview(q: StatFilters): Promise<ScreenUsageOverview> {
  const out = await callAction("overview", buildStatParams("overview", q));
  return {
    totalOpenCnt: num(out.totalOpenCnt),
    userCnt: num(out.userCnt),
    totalDurationMs: num(out.totalDurationMs),
    unusedScreenCnt: num(out.unusedScreenCnt),
    daily: rowsOf(out, "daily"),
    topScreens: rowsOf(out, "topScreens"),
  };
}

export async function fetchByScreen(q: StatFilters, deptCd?: string): Promise<ScreenUsageScreenRow[]> {
  const out = await callAction("byScreen", buildStatParams("screen", q, deptCd));
  return rowsOf(out, "screens");
}

export async function fetchByDept(q: StatFilters): Promise<ScreenUsageDeptRow[]> {
  const out = await callAction("byDept", buildStatParams("dept", q));
  return rowsOf(out, "depts");
}

export async function fetchByUser(q: StatFilters): Promise<ScreenUsageUserGridRow[]> {
  const out = await callAction("byUser", buildStatParams("user", q));
  return rowsOf<ScreenUsageUserRow>(out, "users").map((r) => ({ ...r, rowKey: `${r.userId}|${r.deptCd}` }));
}

export async function fetchUnused(q: StatFilters): Promise<ScreenUsageUnusedRow[]> {
  const out = await callAction("unused", buildStatParams("unused", q));
  return rowsOf(out, "unused");
}

export async function fetchHistory(q: StatFilters): Promise<ScreenUsageHistoryRow[]> {
  const out = await callAction("history", buildStatParams("history", q));
  return rowsOf(out, "history");
}

export interface TabRequestTracker<K extends string> {
  /** 이 탭을 이 조건 키로 이미 받았는가. */
  isLoaded(tab: K, key: string): boolean;
  /** 요청 시작 — 탭별 순번을 올리고 대기 수를 하나 늘린다. 돌려준 순번으로 isLatest 를 묻는다. */
  begin(tab: K): number;
  /** 이 순번이 그 탭의 마지막 요청인가(늦게 온 이전 응답은 버린다). */
  isLatest(tab: K, n: number): boolean;
  markLoaded(tab: K, key: string): void;
  /** 요청 끝 — 대기 수를 하나 줄이고, 아직 남은 요청이 있으면 true(로딩 표시 유지). */
  finish(): boolean;
  /** [조회] 로 조건을 새로 고정할 때 받은 키를 모두 잊는다. 순번은 그대로 둔다. */
  reset(): void;
}

/** 탭 요청 조정 — React 밖 작은 상태라 시험할 수 있다. 화면은 useState 초기화 함수로 한 번만 만든다. */
export function createTabRequestTracker<K extends string>(): TabRequestTracker<K> {
  const loaded = new Map<K, string>();
  const seq = new Map<K, number>();
  let pending = 0;
  return {
    isLoaded: (tab, key) => loaded.get(tab) === key,
    begin: (tab) => {
      const n = (seq.get(tab) ?? 0) + 1;
      seq.set(tab, n);
      pending += 1;
      return n;
    },
    isLatest: (tab, n) => seq.get(tab) === n,
    markLoaded: (tab, key) => {
      loaded.set(tab, key);
    },
    finish: () => {
      pending = Math.max(0, pending - 1);
      return pending > 0;
    },
    reset: () => {
      loaded.clear();
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec vitest run tests/csa/screenUsageStat/api.test.ts`
Expected: PASS — 0 failed.

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test`
Expected: PASS — 시험 파일 2개(format·api) 모두 통과.

- [ ] **Step 5: 포맷**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/api.ts tests/csa/screenUsageStat/api.test.ts`
Expected: 2개 파일 처리. Step 4 첫 명령 다시 PASS.

- [ ] **Step 6: 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/frontend/m-mcm/page-components/csa/screenUsageStat/api.ts src/frontend/m-mcm/tests/csa/screenUsageStat/api.test.ts
/usr/bin/git commit -m "feat(m-mcm): 화면 사용 통계 조회 API 호출과 탭 요청 추적기를 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: page.tsx — 탭 6개 화면 · 페이지 레지스트리 · 정적 검사

**Files:**
- Create: `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx`
- Modify: `src/frontend/m-mcm/lib/generated/page-registry.ts` (생성기 출력 — 손으로 고치지 않는다)

**Interfaces:**
- Consumes (Task 1): `TAB_ITEMS`·`TAB_LABEL`·`emptyFilters`·`emptyStatData`·`StatData`·`StatFilters`·`StatTab`·`ScreenUsageOverview`·`ScreenUsageScreenRow`, `DEFAULT_UNUSED_DAYS`·`checkFilters`·`checkHistoryPeriod`·`formatDuration`·`formatYmd`·`startKindLabel`·`toDailyPoints`·`toExportRows`·`toTopBars`.
- Consumes (Task 2): `fetchOverview`·`fetchByScreen`·`fetchByDept`·`fetchByUser`·`fetchUnused`·`fetchHistory`·`statQueryKey`·`createTabRequestTracker`.
- Consumes (shared): `PageLayout`(`title`·`breadcrumb`·`screenId`·`objId`·`buttons`), `SearchArea`(`onSearch`), `SearchField`, `ContentBody`(`root`·`direction`·`resizable`·`storageKey`), `ContentPanel`(`height`), `GridPanel`(`title`·`count`), `AgDataGrid`, `GridBadge`, `DatePicker`, `Tabs`(`items`·`activeKey`·`onChange`), `DashboardGrid`(`fill`·`ariaLabel`), `DashboardCell`(`span`), `DashboardCard`(`span`·`title`·`subtitle`), `KpiTile`·`KpiTileGroup`, `LineChart`·`HBarChart`, `useMessage`, `exportToExcel`·`today`.
- Produces: `export default function ScreenUsageStatPage()` (C5), 레지스트리 키 `"csa/screenUsageStat"` — U4 의 `componentPath` 와 같아야 한다.

동작 규칙(코드가 지켜야 할 것):
- 첫 진입에 조회하지 않는다. [조회] 전에는 탭을 바꿔도 아무것도 부르지 않는다.
- [조회]: `checkFilters` 로 검사 → 조건을 `submitted` 로 고정 → 받은 키를 모두 잊고(`reset`) → 활성 탭을 부른다(같은 조건이어도 다시 부른다).
- 탭 전환: `submitted` 가 있으면 그 조건으로 그 탭을 부른다. 같은 조건 키로 받은 탭이면 부르지 않는다.
- 이용 이력 탭은 부르기 전에 `checkHistoryPeriod` 로 31일 초과를 안내하고 막는다([조회]·탭 전환 둘 다).
- 미사용 기준 일수 칸은 미사용 화면 탭에서만 조회조건 영역에 보인다.
- 부서별 탭은 위(부서별)·아래(선택 부서의 화면별, `height="40%"`) 상하 분할이고, 부서 행을 고르면 `fetchByScreen(submitted, deptCd)` 로 아래를 채운다. 부서별을 다시 받으면 선택과 아래 목록을 비운다.
- 늦게 온 이전 응답은 버리고(`isLatest`), 다른 요청이 남아 있으면 로딩 표시를 끄지 않는다(`finish`).
- 메뉴 없는 화면은 서버가 준 `"(메뉴 없음)"` 을 그대로 보인다.

- [ ] **Step 1: 정적 검사 기준선 기록**

m-mcm 은 `tsc` 스크립트가 없고 `lint` 는 eslint 만이다. tsc 는 모든 모듈의 `.d.ts` 를 읽으므로 라이브러리를 `.d.ts` 를 켠 채 빌드한다(`TSUP_DTS=0` 금지). Local-Rules §2-2: `pnpm dev` watch 가 이 작업 트리에서 돌고 있으면 따로 빌드하지 않고 `<패키지>/node_modules/.cache/lib-dev-stamp.json` 의 `dts: true` 를 기다린다.

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm build:libs
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"
```
Expected: 빌드 성공. 두 번째 명령이 출력한 수(N, 0 일 수도 있다)를 참고값으로 적어 둔다. 같은 워크트리에서 U1 이 `m-mcm/app/portal/page.tsx`·`PortalShell` props 를 고치므로 이 수는 이 단위와 무관하게 바뀔 수 있다. 통과 기준은 Step 5 의 경로 필터뿐이다.

- [ ] **Step 2: 실패 확인 — 레지스트리에 키가 없다**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && grep -c '"csa/screenUsageStat"' lib/generated/page-registry.ts`
Expected: `0` (화면 파일이 없어 키가 없다).

- [ ] **Step 3: page.tsx 작성**

Create `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx`:

```tsx
"use client";

/**
 * screenUsageStat — 화면 사용 통계(관리자). 조회 화면 A 유형 + shared Tabs 6개.
 * 설계: docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md §5 · 응답 계약: 총괄 계획 C4.
 * - 첫 진입 자동 조회는 하지 않는다(커밋 c564a05f 방향). [조회] 가 조건을 고정하고 활성 탭을 다시 부른다.
 * - 탭을 바꾸면 고정된 조건으로 그 탭만 부른다. 같은 조건으로 이미 받은 탭은 다시 부르지 않는다.
 */
import { useCallback, useMemo, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { DatePicker } from "@dk-oasis/shared/form";
import { Tabs } from "@dk-oasis/shared/tabs";
import {
  DashboardCard,
  DashboardCell,
  DashboardGrid,
  KpiTile,
  KpiTileGroup,
} from "@dk-oasis/shared/dashboard";
import { HBarChart, LineChart } from "@dk-oasis/shared/charts";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { exportToExcel, today } from "@dk-oasis/shared/utils";

import {
  createTabRequestTracker,
  fetchByDept,
  fetchByScreen,
  fetchByUser,
  fetchHistory,
  fetchOverview,
  fetchUnused,
  statQueryKey,
} from "./api";
import {
  DEFAULT_UNUSED_DAYS,
  checkFilters,
  checkHistoryPeriod,
  formatDuration,
  formatYmd,
  startKindLabel,
  toDailyPoints,
  toExportRows,
  toTopBars,
} from "./format";
import {
  TAB_ITEMS,
  TAB_LABEL,
  emptyFilters,
  emptyStatData,
  type ScreenUsageOverview,
  type ScreenUsageScreenRow,
  type StatData,
  type StatFilters,
  type StatTab,
} from "./types";

const SCREEN_ID = "screenUsageStat";

type Row = Record<string, unknown>;
type ExportColumn = { key: string; header: string };

const countCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "right",
  type: "number",
});
const durationCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "right",
  render: (v) => formatDuration(v),
});
const ymdCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "center",
  render: (v) => formatYmd(v),
});

/** 화면별 — 8열이라 fit. 남는 폭은 메뉴 경로. */
const SCREEN_COLUMNS: GridColumn[] = [
  { key: "menuNm", header: "화면명", width: 180, align: "left" },
  { key: "pageId", header: "화면 ID", width: 120, align: "left" },
  { key: "menuPath", header: "메뉴 경로", width: 100, minWidth: 180, align: "left" },
  countCol("openCnt", "열람 횟수"),
  countCol("userCnt", "이용자 수"),
  durationCol("durationMs", "총 이용 시간"),
  durationCol("avgDurationMs", "평균 이용 시간"),
  ymdCol("lastUsedDt", "마지막 이용일"),
];

const DEPT_COLUMNS: GridColumn[] = [
  { key: "deptCd", header: "부서코드", width: 120, align: "left" },
  { key: "deptNm", header: "부서명", width: 180, align: "left" },
  countCol("userCnt", "이용자 수"),
  countCol("openCnt", "열람 횟수"),
  durationCol("durationMs", "이용 시간"),
  { key: "topMenuNm", header: "최다 이용 화면", width: 100, minWidth: 180, align: "left" },
];

const USER_COLUMNS: GridColumn[] = [
  { key: "userId", header: "사용자 ID", width: 120, align: "left" },
  { key: "userNm", header: "사용자명", width: 180, align: "left" },
  { key: "deptNm", header: "부서", width: 100, minWidth: 180, align: "left" },
  countCol("openCnt", "열람 횟수"),
  durationCol("durationMs", "이용 시간"),
  ymdCol("lastUsedDt", "마지막 이용일"),
];

const UNUSED_COLUMNS: GridColumn[] = [
  { key: "menuNm", header: "화면명", width: 180, align: "left" },
  { key: "pageId", header: "화면 ID", width: 120, align: "left" },
  { key: "menuPath", header: "메뉴 경로", width: 100, minWidth: 180, align: "left" },
  {
    key: "lastUsedDt",
    header: "마지막 이용일",
    width: 100,
    align: "center",
    render: (v) => formatYmd(v) || "기록 없음",
  },
];

/** 이용 이력 — 10열이라 fixed(픽셀 폭, 가로 스크롤). */
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

/** 개요 탭의 엑셀은 일별 추이를 내보낸다. */
const DAILY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "usageDt", header: "일자" },
  { key: "openCnt", header: "열람 횟수" },
  { key: "userCnt", header: "이용자 수" },
  { key: "durationMs", header: "이용 시간" },
];

const toExportColumns = (cols: GridColumn[]): ExportColumn[] =>
  cols.map(({ key, header }) => ({ key, header }));

function exportTarget(tab: StatTab, data: StatData): { rows: Row[]; columns: ExportColumn[] } {
  switch (tab) {
    case "overview":
      return { rows: data.overview?.daily ?? [], columns: DAILY_EXPORT_COLUMNS };
    case "screen":
      return { rows: data.screens, columns: toExportColumns(SCREEN_COLUMNS) };
    case "dept":
      return { rows: data.depts, columns: toExportColumns(DEPT_COLUMNS) };
    case "user":
      return { rows: data.users, columns: toExportColumns(USER_COLUMNS) };
    case "unused":
      return { rows: data.unused, columns: toExportColumns(UNUSED_COLUMNS) };
    case "history":
      return { rows: data.history, columns: toExportColumns(HISTORY_COLUMNS) };
  }
}

/** 탭 하나를 불러 StatData 에 합칠 조각을 돌려준다. */
async function fetchTab(tab: StatTab, q: StatFilters): Promise<Partial<StatData>> {
  switch (tab) {
    case "overview":
      return { overview: await fetchOverview(q), overviewRange: [q.fromDt, q.toDt] };
    case "screen":
      return { screens: await fetchByScreen(q) };
    case "dept":
      return { depts: await fetchByDept(q) };
    case "user":
      return { users: await fetchByUser(q) };
    case "unused":
      return { unused: await fetchUnused(q) };
    case "history":
      return { history: await fetchHistory(q) };
  }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmtCount = (n: number | undefined) => (n === undefined ? "-" : n.toLocaleString("ko-KR"));

function OverviewBody({
  overview,
  range,
}: {
  overview: ScreenUsageOverview | null;
  range: readonly [string, string] | null;
}) {
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
          <KpiTile
            label="총 이용 시간"
            value={overview ? formatDuration(overview.totalDurationMs) : "-"}
          />
          <KpiTile
            label="미사용 화면"
            value={fmtCount(overview?.unusedScreenCnt)}
            unit="개"
            target={`최근 ${DEFAULT_UNUSED_DAYS}일 열람 없음`}
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

export default function ScreenUsageStatPage() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<StatFilters>(emptyFilters);
  /** [조회] 로 고정한 조건. null 이면 아직 조회 전이라 탭을 바꿔도 부르지 않는다. */
  const [submitted, setSubmitted] = useState<StatFilters | null>(null);
  const [tab, setTab] = useState<StatTab>("overview");
  const [data, setData] = useState<StatData>(emptyStatData);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedDeptCd, setSelectedDeptCd] = useState<string | null>(null);
  const [deptScreens, setDeptScreens] = useState<ScreenUsageScreenRow[]>([]);
  const [isDetailBusy, setIsDetailBusy] = useState(false);
  // 요청 조정기는 렌더마다 새로 만들지 않도록 초기화 함수로 한 번만 만든다(ref.current 를 렌더 중에 읽지 않는다).
  const [tracker] = useState(() => createTabRequestTracker<StatTab>());
  const [detailTracker] = useState(() => createTabRequestTracker<"deptScreens">());

  const loadTab = useCallback(
    async (target: StatTab, q: StatFilters) => {
      const key = statQueryKey(target, q);
      if (tracker.isLoaded(target, key)) return;
      if (target === "history") {
        const msg = checkHistoryPeriod(q.fromDt, q.toDt);
        if (msg) {
          showMessage({ message: msg, alertType: "warning" });
          return;
        }
      }
      const n = tracker.begin(target);
      setIsBusy(true);
      try {
        const patch = await fetchTab(target, q);
        if (!tracker.isLatest(target, n)) return;
        setData((prev) => ({ ...prev, ...patch }));
        tracker.markLoaded(target, key);
        if (target === "dept") {
          detailTracker.begin("deptScreens");
          detailTracker.finish();
          setSelectedDeptCd(null);
          setDeptScreens([]);
          setIsDetailBusy(false);
        }
      } catch (e) {
        if (tracker.isLatest(target, n)) {
          showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        }
      } finally {
        setIsBusy(tracker.finish());
      }
    },
    [tracker, detailTracker, showMessage],
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

  const handleDeptRowClick = useCallback(
    (row: Row) => {
      const deptCd = String(row.deptCd ?? "");
      if (!submitted || !deptCd || deptCd === selectedDeptCd) return;
      setSelectedDeptCd(deptCd);
      const n = detailTracker.begin("deptScreens");
      setIsDetailBusy(true);
      void (async () => {
        try {
          const rows = await fetchByScreen(submitted, deptCd);
          if (detailTracker.isLatest("deptScreens", n)) setDeptScreens(rows);
        } catch (e) {
          if (detailTracker.isLatest("deptScreens", n)) {
            showMessage({ title: "오류", message: errorText(e), alertType: "error" });
          }
        } finally {
          setIsDetailBusy(detailTracker.finish());
        }
      })();
    },
    [submitted, selectedDeptCd, detailTracker, showMessage],
  );

  const exportInfo = useMemo(() => exportTarget(tab, data), [tab, data]);

  const handleExport = useCallback(() => {
    void exportToExcel(
      toExportRows(exportInfo.rows),
      `화면사용통계_${TAB_LABEL[tab]}_${today()}.xlsx`,
      "Sheet1",
      exportInfo.columns,
    );
  }, [tab, exportInfo]);

  const setFilter = (key: keyof StatFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

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
        <SearchField label="부서코드" value={filters.deptCd} onChange={(v) => setFilter("deptCd", v)} />
        <SearchField
          label="사용자"
          value={filters.userId}
          onChange={(v) => setFilter("userId", v)}
          placeholder="사용자 ID"
        />
        <SearchField
          label="화면"
          value={filters.pageId}
          onChange={(v) => setFilter("pageId", v)}
          placeholder="화면 ID (예: csa/commUserMng)"
        />
        {tab === "unused" && (
          <SearchField
            label="미사용 기준(일)"
            value={filters.unusedDays}
            onChange={(v) => setFilter("unusedDays", v)}
            placeholder={String(DEFAULT_UNUSED_DAYS)}
          />
        )}
      </SearchArea>

      <Tabs items={TAB_ITEMS} activeKey={tab} onChange={handleTabChange} />

      {tab === "overview" && <OverviewBody overview={data.overview} range={data.overviewRange} />}

      {tab === "screen" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="화면별 이용" count={data.screens.length}>
              <AgDataGrid
                rowKey="pageId"
                columns={SCREEN_COLUMNS}
                data={data.screens}
                columnSizing="fit"
                loading={isBusy}
              />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}

      {tab === "dept" && (
        <ContentBody root direction="column" resizable storageKey="mcm.csa.screenUsageStat">
          <ContentPanel>
            <GridPanel title="부서별 이용" count={data.depts.length}>
              <AgDataGrid
                rowKey="deptCd"
                columns={DEPT_COLUMNS}
                data={data.depts}
                columnSizing="fit"
                highlightedRowKey={selectedDeptCd}
                onRowClick={handleDeptRowClick}
                loading={isBusy}
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
                loading={isDetailBusy}
              />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}

      {tab === "user" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="사용자별 이용" count={data.users.length}>
              <AgDataGrid
                rowKey="rowKey"
                columns={USER_COLUMNS}
                data={data.users}
                columnSizing="fit"
                loading={isBusy}
              />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}

      {tab === "unused" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="미사용 화면" count={data.unused.length}>
              <AgDataGrid
                rowKey="pageId"
                columns={UNUSED_COLUMNS}
                data={data.unused}
                columnSizing="fit"
                loading={isBusy}
              />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}

      {tab === "history" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="이용 이력" count={data.history.length}>
              <AgDataGrid
                rowKey="usageId"
                columns={HISTORY_COLUMNS}
                data={data.history}
                columnSizing="fixed"
                loading={isBusy}
              />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}
    </PageLayout>
  );
}
```

메모(실행자 확인용):
- 부서별을 다시 받을 때 `detailTracker.begin`+`finish` 를 한 번 부르는 것은 진행 중이던 부서 상세 응답을 "최신 아님" 으로 만들어 버리게 하려는 것이다(대기 수는 그대로).
- `onRowClick` 은 ↑↓ 이동에도 불린다. 같은 부서를 다시 누르면 부르지 않는다(`deptCd === selectedDeptCd`).
- `columns`·`data` 는 모듈 상수·state 참조라 조회조건 입력 한 글자에 그리드가 다시 그려지지 않는다(Local-Rules §20).
- eslint-config-next 16 의 새 react-hooks 규칙이 `useState` 로 든 추적기의 메서드 호출을 상태 변경으로 잡으면, 추적기를 `useRef(createTabRequestTracker<…>())` 로 바꾸고 `.current` 는 콜백 안에서만 읽는다(렌더 중에 읽지 않는다). 시험·동작은 같다.

- [ ] **Step 4: 페이지 레지스트리 생성과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm generate:page-registry
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && /usr/bin/git diff -- src/frontend/m-mcm/lib/generated/page-registry.ts
```
Expected: 생성기가 오류 없이 끝나고, diff 는 아래 한 줄 추가뿐이다(`csa/commUserRoleCopy` 다음 줄).

```ts
  "csa/screenUsageStat": () => import("@/page-components/csa/screenUsageStat/page"),
```

다른 줄이 바뀌면(다른 모듈 화면 추가·삭제) 그 줄은 이 작업 것이 아니므로 메인에 보고하고 이 Task 커밋에서 그 부분을 빼 달라고 한다.

- [ ] **Step 5: 시험·타입·lint·audit 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend && pnpm --filter @dk-oasis/mcm test
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page-components/csa/screenUsageStat|tests/csa/screenUsageStat|vitest\.config\.mts"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec eslint page-components/csa/screenUsageStat tests vitest.config.mts
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mcm/page-components/csa/screenUsageStat
```
Expected:
- vitest: 2개 파일 PASS.
- tsc 필터(두 번째 명령): 출력 없음(이 단위 파일에 타입 오류 0건). **이것만 통과 기준이다.**
- tsc 오류 수(세 번째 명령): 참고값. Step 1 의 N 과 다르면 다른 단위(U1 등) 파일에서 생긴 오류인지 확인해 메인에 보고하고, 이 단위에서 고치지 않는다.
- eslint: 출력 없음(0 problems, 경고 포함).
- mantine audit: `4개 파일 점검, 의심 0건 — 통과`.
- aggrid audit: `4개 파일 점검, 의심 0건 (deprecated 기준: …) — 통과`.

하나라도 다르면 고친 뒤 이 Step 을 다시 돌린다. audit 의심 건이 오탐이면 고치지 말고 이유를 메인 보고에 적는다.

- [ ] **Step 6: 포맷**

Run: `cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats/src/frontend/m-mcm && pnpm exec prettier --write page-components/csa/screenUsageStat/page.tsx`
Expected: 1개 파일 처리. Step 5 의 eslint·tsc 필터 명령을 다시 돌려 출력 없음.

- [ ] **Step 7: 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx src/frontend/m-mcm/lib/generated/page-registry.ts
/usr/bin/git commit -m "feat(m-mcm): 화면 사용 통계 화면(탭 6개)을 만든다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Part B 허용 목록에 `tabs` 추가 · tabs 컴포넌트 문서 갱신

**Files:**
- Modify: `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md:39` 다음 줄(§1 표)
- Modify: `.claude/skills/mantine-aggrid-ui/references/components/tabs.md:8` (ASK 문구), `:76` (실제 사용 예)
- Modify: `.claude/skills/mantine-aggrid-ui/references/components/llms.txt`, `llms-full.txt` (생성물)

**Interfaces:**
- Consumes: 설계 §9-1 확정 사항(사용자 승인: `tabs` 서브패스를 허용 목록에 추가), Task 3 의 `page.tsx`(첫 MES 사용처).
- Produces: Part B §1 의 `@dk-oasis/shared/tabs` SHOULD 행, tabs.md 의 갱신된 허용 상태.

- [ ] **Step 1: 실패 확인 — 아직 ASK 다**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && grep -c "shared/tabs" docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && grep -c "tabs\` 서브패스가 없다" .claude/skills/mantine-aggrid-ui/references/components/tabs.md
```
Expected: 첫 줄 `0`, 둘째 줄 `1`.

- [ ] **Step 2: Part B §1 표에 행 추가**

`docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` 에서 `dashboard` 행 바로 아래에 넣는다.

old:
```md
| `@dk-oasis/shared/dashboard`                  | SHOULD                 | 대시보드 격자·카드·KPI 타일·추이 선  | §18              |
```
new:
```md
| `@dk-oasis/shared/dashboard`                  | SHOULD                 | 대시보드 격자·카드·KPI 타일·추이 선  | §18              |
| `@dk-oasis/shared/tabs`                       | SHOULD                 | 영역 안 밑줄형 탭 머리줄(본문 전환은 화면) | —                |
```

- [ ] **Step 3: tabs.md 갱신**

`.claude/skills/mantine-aggrid-ui/references/components/tabs.md`

old:
```md
- Part B 허용 목록(§1)에 `tabs` 서브패스가 없다. 사용 전 확인이 필요한 항목이다(ASK).
```
new:
```md
- Part B 허용 목록(§1): `tabs` SHOULD (2026-10-02 사용자 승인으로 추가).
```

old:
```md
- MES 모듈(m-mpp·m-mqc·m-mls·m-mcm)에서는 아직 사용처 없음.
```
new:
```md
- `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx`: `TAB_ITEMS` 모듈 상수 + 탭을 바꾸면 그 탭만 조회(MES 모듈 첫 사용처, 표준과 같다).
```

- [ ] **Step 4: 생성물 갱신과 통과 확인**

Run:
```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py index --write
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py full --write
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py coverage
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py check-examples
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && grep -c "shared/tabs" docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats && grep -c "tabs\` 서브패스가 없다" .claude/skills/mantine-aggrid-ui/references/components/tabs.md .claude/skills/mantine-aggrid-ui/references/components/llms-full.txt
```
Expected:
- `coverage 통과`. 실패가 tabs 와 무관한 shared export 의 `미등재 export:` 뿐이면(동시에 도는 다른 단위가 더한 심볼) 문서를 쓰지 말고 그 목록을 메인에 보고한다. `생성물 낡음` 이 남으면 index·full `--write` 를 다시 돌린다.
- `check-examples` 가 오류 없이 끝난다(예제 타입 검사 + audit. shared 가 Task 3 Step 1 에서 빌드돼 있어야 한다).
- `shared/tabs` 수 `1`, ASK 문구 수 두 파일 모두 `0`.
- `/usr/bin/git diff --stat -- .claude/skills/mantine-aggrid-ui/references/components/llms.txt` 는 변경 없음 또는 tabs 항목만, `llms-full.txt` 는 tabs 절의 두 줄만 바뀐다. 다른 문서 내용이 바뀌면(동시에 도는 다른 작업의 문서 변경) 메인에 보고한다.

- [ ] **Step 5: 커밋**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats
/usr/bin/git add docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md .claude/skills/mantine-aggrid-ui/references/components/tabs.md .claude/skills/mantine-aggrid-ui/references/components/llms.txt .claude/skills/mantine-aggrid-ui/references/components/llms-full.txt
/usr/bin/git commit -m "docs(guide): shared tabs 를 Part B 허용 목록에 올리고 탭 문서를 고친다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## 실행 뒤 메인에 보고할 것

- audit·lint·tsc·vitest 결과(Task 3 Step 5 출력 그대로), tsc 기준선 N.
- 레지스트리 diff 가 한 줄뿐이었는지.
- 아래 미확인 가정 중 실행하며 확인된 것.
  - 서버가 `deptCd`·`userId`·`pageId` 를 완전 일치로 거르는지 부분 일치로 거르는지(화면 문구 "부서코드"·"사용자 ID"·"화면 ID" 는 완전 일치 기준).
  - `byScreen` 에 `deptCd="-"`(부서 없음)를 넘기면 부서 없는 사용자 구간만 거르는지.
  - overview 의 `unusedScreenCnt` 가 90일 기준인지(KPI 문구가 "최근 90일 열람 없음" 으로 고정이다. 미사용 탭에서 기준 일수를 바꿔도 개요 숫자는 따라가지 않는다).
  - 서버의 31일 판정이 `toDt - fromDt`(일수 차) 인지(화면은 31 허용·32 거절).
  - `byUser` 가 사용자당 한 행인지 부서별 여러 행인지(화면은 둘 다 견딘다).
- 브라우저 확인(레이아웃: SearchArea 아래 Tabs, 개요 탭 `DashboardGrid fill` 높이, 부서별 상하 분할)은 U4 에서 한다.
