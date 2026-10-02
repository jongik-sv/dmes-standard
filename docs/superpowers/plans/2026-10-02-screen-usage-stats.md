# 사용자 화면 사용 통계 Implementation Plan (총괄)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포털에서 사용자가 실제로 본 화면 구간을 수집해 mcm 에 저장·일별 집계하고, 관리자 통계 화면(탭 6개)과 메뉴를 제공한다.

**Architecture:** shared 포털 셸이 활성 탭 변화로 이용 구간을 만들고 sender 가 묶어서 OASIS `screenUsage/record` 로 보낸다. mcm-core 가 원본(1년)·일별 집계(영구)를 관리하고 `screenUsageStat` 이 통계를 낸다. m-mcm `csa/screenUsageStat` 화면이 이를 보이고, 마지막에 메뉴로 등록한다.

**Tech Stack:** React 19 / Next.js(m-mcm) · `@dk-oasis/shared` (vitest 3, happy-dom) · Spring Boot + OASIS BPMN(mcm-core, mcm/api) · JPA(SQLite 로컬, MSSQL 계열 운영) · JUnit5/Mockito/AssertJ

**Spec:** `docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md`

**세부 계획 (병렬 실행 단위):**

| 단위 | 계획 파일 | 선행 |
|---|---|---|
| U1 프런트 수집 | `docs/superpowers/plans/2026-10-02-screen-usage-stats-u1-tracker.md` | 없음 |
| U2 백엔드 | `docs/superpowers/plans/2026-10-02-screen-usage-stats-u2-backend.md` | 없음 |
| U3 통계 화면 | `docs/superpowers/plans/2026-10-02-screen-usage-stats-u3-screen.md` | 없음(아래 계약 기준) |
| U4 메뉴 등록·통합 확인 | 본 문서 Task U4 | U1·U2·U3 |

## Global Constraints

- 작업 위치는 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats` (브랜치 `feat/screen-usage-stats`). git 은 `/usr/bin/git` 사용, 명령의 경로·옵션 자리에 셸 변수·글롭을 쓰지 않는다.
- 도커 금지. 테스트 명령: shared `pnpm --filter @dk-oasis/shared test:unit` (단일 파일 `cd src/frontend/shared && pnpm exec vitest run tests/unit/<file>`), mcm-core `cd src/backend/mcm-core && ../gradlew :test` (단일 `--tests <FQCN>`).
- 홈 탭(`tab.isHome`)은 기록하지 않는다.
- 사용자 ID·부서는 서버가 `SecurityIdentity` 와 `SecUser.deptCd` 로 채운다. 클라이언트 값은 쓰지 않는다.
- OASIS 서비스 클래스에 `@Transactional` 금지(6-B-1), serviceTask `output` 필수(6-C-2), grids key = Java 파라미터 이름(6-E-3). 커밋 전 `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` ERROR 0.
- 화면 코드는 shared 래퍼만 쓴다(`@mantine/*`·`ag-grid-*` 직접 import 금지), 로컬 `.css` import 금지, `mantine-aggrid-ui` audit 0건.
- 수집 오류는 화면을 막거나 알림을 띄우지 않는다(`console.warn` 만).
- 커밋 메시지는 저장소 관례 `type(scope): 한국어 subject` + 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 문서·주석·UI 문구는 한국어.

## 공유 계약 (세 단위가 그대로 인용한다 — 바꿀 필요가 생기면 직접 고치지 말고 메인에 보고)

### C1. 프런트 타입 (`src/frontend/shared/src/portal-shell/usage-tracker.ts`)

```ts
export type UsageStartKind = "OPEN" | "SWITCH" | "RESUME";

export interface UsageSegment {
  clientSegId: string;   // crypto.randomUUID()
  pageId: string;        // `${PARENT_MENU_ID}/${OBJECT_ID}`
  startKind: UsageStartKind;
  startedAt: number;     // epoch ms
  endedAt: number;       // epoch ms
}
```

`PortalShellProps` 추가 prop:

```ts
export type UsageEmitReason = "normal" | "logout";
onUsageSegments?: (segments: UsageSegment[], info: { reason: UsageEmitReason }) => void | Promise<void>;
```

`doLogout` 은 활성 구간을 닫아 `reason: "logout"` 으로 넘기고, 돌려받은 Promise 를 **최대 1500ms** 기다린 뒤 `signOut` 한다(토큰 폐기보다 마지막 전송이 먼저 도착하게).

- `pageId` 는 탭 pageId(`mcm:csa/x`)에서 모듈 접두를 뗀 `componentPath`(`csa/x`)다. 즐겨찾기와 같은 규칙이며 `PARENT_MENU_ID` 는 모듈 전체에서 유일하다.
- 기본 화면(start pages) 자동 열기로 **새로 만든 탭도 `OPEN`** 이다.
- 15분 자르기: 자르는 시점에 구간 끝을 `max(구간 시작, 마지막 입력 시각)` 으로 두고 내보낸 뒤, 이어지는 구간을 **그 시각에서** `RESUME` 으로 시작한다(끝 ≤ 시작이면 내보내지 않고 구간 유지). 그래야 무입력 30분 판정이 이미 보낸 조각에 덮이지 않는다.

### C2. sender (`src/frontend/shared/src/portal-shell/usage-sender.ts`)

```ts
export interface UsageSenderOptions {
  endpoint: string;                                   // "/api/mcm/oasis/screenUsage/record"
  buildMeta?: () => Promise<Record<string, unknown>>; // 기본 { menuId: "PORTAL_SHELL" }
  fetchImpl?: typeof fetch;
  batchSize?: number;      // 20
  intervalMs?: number;     // 60_000
  maxQueue?: number;       // 200
  maxPerRequest?: number;  // 100
}
export interface UsageSender {
  enqueue(segments: UsageSegment[]): void;
  flush(opts?: { keepalive?: boolean }): Promise<void>;
  dispose(): void;
}
export function createUsageSender(options: UsageSenderOptions): UsageSender;
```

### C3. 기록 요청·응답 — `POST /api/mcm/oasis/screenUsage/record`

```json
{
  "meta": { "userId": "<세션 사용자, 서버는 무시>", "menuId": "PORTAL_SHELL" },
  "params": {},
  "grids": { "segments": { "rows": [
    { "clientSegId": "uuid", "pageId": "csa/commUserMng", "startKind": "OPEN",
      "startedAt": 1759380000000, "endedAt": 1759380060000 }
  ] } }
}
```

응답: `data.result = { "saved": <int>, "skipped": <int> }`.
Java: `@Service("screenUsageService")` `public Map<String,Object> record(List<Map<String,Object>> segments)` — 숫자는 `((Number) v).longValue()` 로 읽는다(Integer/Long 혼재).
권한: AUTH_ONLY. `src/frontend/m-mcm/proxy.ts` `authOnlyPrefixes` 에 `"/api/mcm/oasis/screenUsage/record"`, `EndpointPermissionFilter.AUTH_ONLY_OBJ_ACTION_PREFIXES` 에 `"screenusage/record"` (두 목록 동기화).

### C4. 통계 요청·응답 — `POST /api/mcm/oasis/screenUsageStat/{action}`

공통 params: `fromDt`, `toDt`(`yyyyMMdd` 문자열, 필수), `deptCd?`, `userId?`, `pageId?`. `unused` 는 `unusedDays?`(기본 90, 기간 무시). `history` 는 `toDt - fromDt` 가 31일 이하(초과 시 서버가 오류 메시지로 거절).
`@Service("screenUsageStatService")`. 각 action 은 BPMN serviceTask 하나, `dto` 는 `com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest`.

| action | 반환 | output | 행/필드 |
|---|---|---|---|
| `overview` | `Map` → `data.result` | `result` | `{ totalOpenCnt, userCnt, totalDurationMs, unusedScreenCnt, daily:[{usageDt, openCnt, userCnt, durationMs}], topScreens:[{pageId, menuNm, openCnt, durationMs}] }` |
| `byScreen` | `List<Map>` → `grids.screens.rows` | `screens` | `pageId, menuNm, menuPath, openCnt, userCnt, durationMs, avgDurationMs, lastUsedDt` |
| `byDept` | `List<Map>` → `grids.depts.rows` | `depts` | `deptCd, deptNm, userCnt, openCnt, durationMs, topPageId, topMenuNm` |
| `byUser` | `List<Map>` → `grids.users.rows` | `users` | `userId, userNm, deptCd, deptNm, openCnt, durationMs, lastUsedDt` |
| `unused` | `List<Map>` → `grids.unused.rows` | `unused` | `pageId, menuNm, menuPath, lastUsedDt`(없으면 null) |
| `history` | `List<Map>` → `grids.history.rows` | `history` | `usageId, userId, userNm, deptCd, deptNm, pageId, menuNm, startKind, startedAt, endedAt, durationMs, clientIp` |

- 일자 필드(`usageDt`, `lastUsedDt`)는 `yyyyMMdd`, 시각 필드(`startedAt`, `endedAt`)는 `yyyy-MM-dd HH:mm:ss`(Asia/Seoul) 문자열, 시간·건수는 숫자.
- 메뉴에 없는 `pageId` 의 `menuNm` 은 `"(메뉴 없음)"`, 부서 없음은 `deptCd = "-"`, `deptNm = "(부서 없음)"`.
- 6개 action 을 `DataInitializer` `PERM_ALL` 의 `allActions` 에 추가한다.
- 조건 일치: `deptCd`·`userId`·`pageId` 는 모두 **완전 일치**. `deptCd = "-"` 는 부서 없는 구간(집계 `'-'`, 원본 `NULL`)만 거른다.
- `overview` 도 `unusedDays?`(기본 90)를 받아 `unusedScreenCnt` 계산에 쓴다(미사용 탭과 같은 값을 넘긴다).
- `byUser` 는 **사용자당 1행**. `deptCd`·`deptNm` 은 기간 안 마지막 이용 구간의 부서.
- 엑셀은 shared 표준 `exportToExcel` 로 현재 탭 그리드를 내보낸다.
- `history` 는 최신순 **최대 10,000행**. 화면은 10,000행을 받으면 "최근 10,000건만 표시" 안내를 띄운다. 기간은 시작·종료일 포함 31일까지(`toDt - fromDt ≤ 30`일), 서버·화면이 같은 식으로 판정한다.
- 미사용 판정은 **구간 종류와 관계없이 이용 기록이 없는** 화면(`MENU_VIEW_YN='Y'` 이고 `USE_TP='Y'`). `lastUsedDt` 도 같은 기준.
- 원본 합산 범위는 집계 테이블 최대 `USAGE_DT` 다음 날부터(오늘 포함). 02:00 집계 전 어제분 누락을 막는다.
- `avgDurationMs` = `durationMs / openCnt`, `openCnt = 0` 이면 `null`. `daily` 는 이용 없는 날을 0 으로 채운다.
- `unusedDays` 는 숫자로 보낸다(빈 값이면 키를 뺀다). 서버 오류는 `meta.success=false` 로 온다.
- 부서·사용자·화면 조건은 텍스트 입력(완전 일치). 선택 팝업은 이번 범위 밖.

### C5. 메뉴

객체 ID `screenUsageStat`, 부모 폴더 `csa`, `componentPath` = `csa/screenUsageStat`, 화면 폴더 `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx`(default export), 메뉴명 "화면 사용 통계".

## Review Focus

1. **메뉴 권한이 없는 일반 사용자의 수집** — 일반 사용자 로그인에서도 `record` 가 403 없이 저장돼야 한다(sender 가 오류를 삼키므로 조용히 0건이 되기 쉽다). U2 에 권한 필터 테스트, U4 에 일반 사용자 계정 확인 단계.
2. **재전송·중복** — 네트워크 오류 뒤 같은 묶음을 다시 보내도 원본이 한 번만 저장된다. 같은 묶음 두 번째 전송은 `saved=0`. 고유 제약 위반을 catch 해서 넘기지 말고(트랜잭션 rollback-only) 사전 조회로 거른다. U2 테스트.
3. **빠른 탭 전환·StrictMode 이중 실행** — 같은 순간에 겹치는 구간이나 같은 `clientSegId` 가 두 번 나오지 않는다. U1 테스트.
4. **자정을 걸친 구간과 늦게 도착한 구간** — 집계 뒤 도착한 전날 구간도 다음 집계(최근 2일 재계산)에 반영된다. U2 테스트.
5. **메뉴에서 지워진 화면·부서 없는 사용자** — 기록은 받고, 통계에서 `"(메뉴 없음)"`·`"-"` 로 보인다. U2 테스트.

---

### Task U4: 메뉴 등록과 통합 확인 (U1·U2·U3 완료 후)

**Files:**
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` (`seedMlsMenus()` 호출 뒤 확장 지점, `seedMlsMenus` 873~892행 패턴)

**Interfaces:**
- Consumes: C5, U2 의 `allActions` 추가분, U3 의 `csa/screenUsageStat/page.tsx`
- Produces: 사이드바 "시스템관리 > 화면 사용 통계"

- [ ] **Step 1: 메뉴 시드 추가**

`seedMlsMenus()` 를 본떠 `seedScreenUsageMenus()` 를 추가하고 `seedMlsMenus()` 호출 바로 뒤에서 부른다(마지막 `recomputeMenuFullSeq()` 보다 앞).

```java
    /** 화면 사용 통계(csa/screenUsageStat) — OBJECT 1 + leaf 1 + SYSADMIN RBAC 1 (2026-10-02). */
    private void seedScreenUsageMenus() {
        String objId = "screenUsageStat";
        insertMcmSecObjIfAbsent(objId, "화면 사용 통계", "mcm");
        insertMcmSecMenuIfAbsent(objId, "001", 1020180L, "화면 사용 통계", "csa", objId);
        insertIfAbsentComposite("TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID", "OBJECT_ID", "PERMISSION_ID"},
                new Object[]{"SYSADMIN", objId, "PERM_ALL"});
    }
```

실제 헬퍼 시그니처·`systemCode`·FULL_SEQ 값은 `seedMlsMenus` 와 `csa` 기존 leaf(507~514행)를 읽고 맞춘다. 다른 점이 있으면 기존 코드를 따른다.

- [ ] **Step 2: 컴파일**

Run: `cd src/backend/mcm/api && ../../gradlew compileJava` (모듈 경로는 `src/backend/settings.gradle` 기준으로 맞춘다)
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 로컬 서버 반영**

메모리 `local-run-mac-setup` 절차로 mcm 백엔드(8100)와 포털(5100)을 재기동한다(IfAbsent 시드 적용). shared 는 `pnpm --filter @dk-oasis/shared build` 후 m-mcm 이 dist 를 보게 한다.

- [ ] **Step 4: 브라우저 확인 (ego-browser)**

1. SYSADMIN 로그인 → 사이드바 "시스템관리 > 화면 사용 통계" 보임 → 화면 열림.
2. 다른 화면 3개를 열고 탭을 몇 번 전환, 1개 닫기, 60초 이상 대기 또는 로그아웃.
3. **일반 사용자(메뉴 권한 없는 계정)로 로그인** → 화면 2개 열고 전환 → 로그아웃.
4. SYSADMIN 재로그인 → 통계 화면 [조회] → 개요·화면별·사용자별·이용 이력 탭에 오늘 값이 보이고, 일반 사용자 구간도 이력에 있다. 홈 탭 구간은 없다.
5. 작업 공간을 닫는다.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 메뉴를 시스템관리 아래에 등록한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## 후속 (이번 범위 밖)

- dev/prod 는 `DataInitializer` 와 `ddl-auto` 가 꺼져 있다. `TB_SEC_SCREEN_USAGE_LOG`·`TB_SEC_SCREEN_USAGE_DAY` DDL(U2 의 MSSQL DDL 과 동일)을 DBA 에게 전달해야 한다.
