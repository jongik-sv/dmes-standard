# 화면 사용 통계 U1 프런트 수집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포털(PortalShell)에서 사용자가 실제로 본 화면 구간(OPEN·SWITCH·RESUME)을 만들고, m-mcm 포털이 그 구간을 묶어 `POST /api/mcm/oasis/screenUsage/record` 로 보낸다.

**Architecture:** shared `usage-tracker.ts` 는 React 를 모르는 순수 클래스다. 시계와 이벤트 대상(document·window)을 주입받아 활성 화면, 가림, pagehide, 입력, 60초 판정으로 구간을 만든다. shared `usage-sender.ts` 는 큐와 묶음 전송, keepalive flush 를 맡는다(계약 C2). 추가로 `bindUsageSender` 가 pagehide·가림·로그아웃 때 "바로 keepalive 로 보내기"를 맡는다. `PortalShell` 은 `activeTabId` effect 하나로 추적기에 활성 화면을 알리고, m-mcm `portal/page.tsx` 는 sender 를 만들어 `onUsageSegments` 로 연결한다.

**Tech Stack:** React 19.2 · TypeScript 5.9 · `@dk-oasis/shared` (vitest 3.2, happy-dom 20, Mantine 9) · Next.js 16(m-mcm)

**Spec:**
- 설계: `docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md` (§3 프런트 수집, §7 테스트, §9 결정)
- 총괄 계획: `docs/superpowers/plans/2026-10-02-screen-usage-stats.md` (Global Constraints, 공유 계약 C1·C2·C3, Review Focus)

## Global Constraints

- 작업 위치는 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats`(브랜치 `feat/screen-usage-stats`)다. 모든 명령은 이 루트에서 시작한다. git 은 `/usr/bin/git` 만 쓰고, 명령의 경로와 옵션 자리에 셸 변수나 글롭을 쓰지 않는다.
- 도커는 쓰지 않는다. 테스트 명령은 `cd src/frontend/shared && pnpm exec vitest run tests/unit/<file>` 와 `pnpm --filter @dk-oasis/shared test:unit`, 타입 검사는 `pnpm --filter @dk-oasis/shared lint`(`tsc --noEmit`)다.
- 홈 탭(`tab.isHome`)은 기록하지 않는다.
- 사용자 ID·부서는 서버가 채운다. 전송 body 의 `meta.userId` 는 참고용이고 서버는 무시한다.
- 수집 오류는 화면을 막지 않고 알림도 띄우지 않는다. `console.warn` 만 남긴다.
- 공유 계약 C1·C2·C3 의 이름, 형식, 기본값을 그대로 쓴다. C1 `UsageSegment`·`UsageStartKind`, C2 `UsageSenderOptions`·`UsageSender`·`createUsageSender`, C3 body `{ meta, params: {}, grids: { segments: { rows } } }` 다. 계약을 바꿀 필요가 생기면 직접 고치지 말고 메인에 보고한다.
- 기본값은 무입력 30분, 구간 상한 15분, 최소 1초, 판정 주기 60초다. sender 는 묶음 20건, 60초, 큐 200건, 요청당 100건이다.
- 기존 `onPageOpen` prop 은 건드리지 않는다. package.json 과 tsup 설정은 수정하지 않는다(`portal-shell/index.ts` 의 `export *` 만 추가한다).
- 백엔드 `EndpointPermissionFilter` 는 U2 담당이므로 이 계획에서 수정하지 않는다.
- shared vitest 기본 환경은 `node` 이고 include 는 `tests/**/*.test.ts` 다. DOM 이 필요한 테스트 파일은 첫 줄에 `/** @vitest-environment happy-dom */` 를 두고, JSX 대신 `createElement` 를 쓴다(`.tsx` 테스트는 실행되지 않는다).
- 커밋 메시지는 `type(scope): 한국어 subject` 이고 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 를 붙인다. 같은 워크트리에서 다른 단위(U2·U3)가 동시에 작업하므로 `git add` 에는 이 Task 의 파일 경로만 적는다(`-A`·`.` 금지).
- 문서, 주석, UI 문구는 한국어로 쓴다.

## Review Focus

1. **빠른 탭 전환과 StrictMode 이중 실행**(총괄 3번) — 같은 순간에 겹치는 구간이나 같은 `clientSegId` 가 두 번 나오면 안 된다. 새 탭마다 OPEN 은 한 번만 나와야 한다. 테스트는 Task 1 "빠른 전환"과 Task 3 "StrictMode" 다.
2. **백엔드 장애나 403** — 실패한 묶음은 다음 주기에만 다시 보낸다. 탭을 전환할 때마다 요청이 나가는 재시도 폭주가 없어야 하고, 큐는 200건을 넘지 않으며, 화면에 오류가 보이지 않아야 한다. 테스트는 Task 2 "재시도 폭주 방지"·"큐 상한"이다.
3. **새로고침·창 닫기** — `pagehide` 시점에는 `visibilityState` 가 아직 `visible` 일 수 있다. 그래도 마지막 구간이 keepalive 로 나가야 하고, 리스너가 등록된 순서에 결과가 좌우되면 안 된다. 테스트는 Task 2 `bindUsageSender` "pagehide"와 Task 3 "가림·pagehide"다.
4. **http(보안 컨텍스트가 아님)로 IP 접속** — `crypto.randomUUID` 가 없어도 36자 v4 UUID 를 만들어야 한다(`CLIENT_SEG_ID VARCHAR(36)`). 테스트는 Task 1 `createUsageSegmentId` 다.
5. **브라우저 탭이 가려진 상태에서 열린 탭** — 보이게 되면 OPEN 으로 시작해야 열람 횟수가 빠지지 않는다. 시계가 뒤로 가도 구간이 겹치면 안 된다. 테스트는 Task 1 "가려진 채 연 탭"·"시계 역행"이다.


## 메인 결정 (2026-10-02, 본문보다 우선 적용)

계획 작성 뒤 메인이 내린 결정이다. 본문 코드·테스트와 다르면 **이 절을 따라** 해당 Task 에서 고친다.

1. **C1 prop 변경** — `onUsageSegments?: (segments: UsageSegment[], info: { reason: UsageEmitReason }) => void | Promise<void>`, `export type UsageEmitReason = "normal" | "logout"`. PortalShell 의 `doLogout` 은 구간을 닫아 `reason: "logout"` 으로 넘기고, 돌려받은 Promise 를 최대 1500ms(`Promise.race` + 타이머) 기다린 뒤 `signOut` 한다. m-mcm `page.tsx` 는 `reason === "logout"` 이면 `enqueue` 후 `flush({ keepalive: true })` Promise 를 돌려준다. Task 3 연동 테스트 "로그아웃 순서"에 "1500ms 안에 끝난 flush 뒤 signOut, 끝나지 않으면 1500ms 뒤 signOut" 두 경우를 넣는다.
2. **기본 화면 자동 열기 = OPEN** — 기본 화면 effect 가 만든 탭 ID 도 OPEN 표시에 넣는다. Task 3 테스트에 "기본 화면 자동 열기 탭은 OPEN" 을 추가한다.
3. **15분 자르기 규칙** — 자르는 시점에 끝 = `max(구간 시작, 마지막 입력 시각)` 으로 내보내고 다음 구간을 그 시각에서 `RESUME` 으로 시작한다(끝 ≤ 시작이면 내보내지 않고 유지). Task 1 의 "15분 자르기 때문에 무입력 판정이 늦다"는 한계 기록 테스트를 지우고, "입력 없이 20분 → 15분 조각은 마지막 입력 시각까지만, 30분 무입력 뒤 추가 구간 없음" 테스트로 바꾼다.
4. pageId 모듈 접두 제거(`toUsagePageId`), 추가 export, `dispose` 동작, 가림 시 keepalive 즉시 전송은 계획대로 둔다.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| Create `src/frontend/shared/src/portal-shell/usage-tracker.ts` | C1 타입, 기본값 상수, `UsageTracker` 클래스, `toUsagePageId`, `createUsageSegmentId` | 1 |
| Create `src/frontend/shared/tests/unit/usage-tracker.unit.test.ts` | 추적기 단위 테스트(node 환경, 가짜 타이머, 가짜 EventTarget) | 1 |
| Create `src/frontend/shared/src/portal-shell/usage-sender.ts` | C2 `createUsageSender`, 추가 export `bindUsageSender` | 2 |
| Create `src/frontend/shared/tests/unit/usage-sender.unit.test.ts` | sender·binding 단위 테스트 | 2 |
| Modify `src/frontend/shared/src/portal-shell/portal-shell.tsx` | `onUsageSegments` prop, OPEN 표시 ref, 추적기 effect, 활성 탭 effect, `doLogout` 맨 앞 종료 | 3 |
| Modify `src/frontend/shared/src/portal-shell/index.ts` | `export *` 두 줄 | 3 |
| Create `src/frontend/shared/tests/unit/portal-shell-usage.unit.test.ts` | PortalShell 연동 테스트(happy-dom) | 3 |
| Modify `src/frontend/m-mcm/app/portal/page.tsx` | sender 생성, userId 캐시, 로그아웃·언마운트 flush, prop 연결 | 4 |
| Modify `src/frontend/m-mcm/proxy.ts:41-57` | `authOnlyPrefixes` 에 C3 경로 추가 | 4 |

pageId 변환: 탭의 pageId 는 `"{moduleId}:{componentPath}"`(예: `"mcm:csa/commUserMng"`, `portal/page.tsx:58` 주석, `menu-search.ts` `getPortalMenuItemPageId`)다. C1 의 `pageId` 는 `${PARENT_MENU_ID}/${OBJECT_ID}`(= componentPath, `SecFavoriteService.java:166` 의 `fullId`)다. 그래서 PortalShell 은 `toUsagePageId`(= `parsePageId(...).pageName`, 파싱이 안 되면 원문)로 바꿔서 넘긴다.

---

### Task 1: 화면 사용 구간 추적기 `UsageTracker`

**Files:**
- Create: `src/frontend/shared/src/portal-shell/usage-tracker.ts`
- Test: `src/frontend/shared/tests/unit/usage-tracker.unit.test.ts`

**Interfaces:**
- Consumes: `parsePageId(pageId: string): ParsedPageId | null` (`src/frontend/shared/src/portal-shell/module.ts`)
- Produces (Task 2·3 이 그대로 쓴다):
  ```ts
  export type UsageStartKind = "OPEN" | "SWITCH" | "RESUME";            // C1
  export interface UsageSegment { clientSegId: string; pageId: string; startKind: UsageStartKind; startedAt: number; endedAt: number } // C1
  export const USAGE_IDLE_MS: number;        // 30 * 60_000
  export const USAGE_MAX_SEGMENT_MS: number; // 15 * 60_000
  export const USAGE_MIN_SEGMENT_MS: number; // 1_000
  export const USAGE_TICK_MS: number;        // 60_000
  export interface UsageEventTarget { addEventListener(type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void; removeEventListener(type: string, listener: (event: Event) => void, options?: boolean | EventListenerOptions): void }
  export interface UsageDocumentLike extends UsageEventTarget { readonly visibilityState: string }
  export type UsageActivateKind = "OPEN" | "SWITCH";
  export interface UsageTrackerOptions { onSegments: (segments: UsageSegment[]) => void; now?: () => number; doc?: UsageDocumentLike | null; win?: UsageEventTarget | null; createId?: () => string; idleMs?: number; maxSegmentMs?: number; minSegmentMs?: number; tickMs?: number }
  export class UsageTracker {
    constructor(options: UsageTrackerOptions);
    activate(pageId: string | null, startKind?: UsageActivateKind): void; // null = 홈·탭 없음(끝내기만)
    end(): void;      // 로그아웃 — 열린 구간을 닫고 더 열지 않는다
    tick(): void;     // 60초 판정(무입력·15분 자르기). 생성자가 setInterval 로 부른다
    dispose(): void;  // end() 후 리스너·타이머 정리
  }
  export function toUsagePageId(tabPageId: string): string;
  export function createUsageSegmentId(): string;
  ```

- [ ] **Step 0: 의존성 설치 확인**

이 워크트리에는 `node_modules` 가 없다. 이미 있으면 건너뛴다. U2·U3 가 같은 명령을 동시에 돌려 잠금 오류가 나면 잠시 뒤 다시 실행한다.

Run: `cd src/frontend && pnpm install --frozen-lockfile`
Expected: `Done` 으로 끝나고 `src/frontend/shared/node_modules/.bin/vitest` 가 생긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/frontend/shared/tests/unit/usage-tracker.unit.test.ts`

```ts
/**
 * 화면 사용 구간 추적기(UsageTracker) — 설계 §3.1 구간 정의(2026-10-02).
 * node 환경. document·window 대신 EventTarget 을 주입하고, 가짜 타이머로 Date 와 60초 판정을 함께 움직인다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  USAGE_IDLE_MS,
  USAGE_MAX_SEGMENT_MS,
  USAGE_MIN_SEGMENT_MS,
  USAGE_TICK_MS,
  UsageTracker,
  createUsageSegmentId,
  toUsagePageId,
  type UsageSegment,
  type UsageTrackerOptions,
} from "../../src/portal-shell/usage-tracker";

const BASE = Date.UTC(2026, 9, 2, 0, 0, 0);
const MIN = 60_000;

class FakeDoc extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

let doc: FakeDoc;
let win: EventTarget;
let emitted: UsageSegment[][];
let tracker: UsageTracker | null;
let seq: number;

function create(overrides: Partial<UsageTrackerOptions> = {}): UsageTracker {
  tracker = new UsageTracker({
    onSegments: (segments) => {
      emitted.push(segments);
    },
    now: () => Date.now(),
    doc,
    win,
    createId: () => `seg-${++seq}`,
    ...overrides,
  });
  return tracker;
}

/** 한 번 넘긴 묶음을 [pageId, startKind, 시작(BASE 기준 ms), 끝] 으로 줄인다. */
function rows(batch: UsageSegment[]) {
  return batch.map((s) => [s.pageId, s.startKind, s.startedAt - BASE, s.endedAt - BASE]);
}
const all = () => emitted.flat();
const advance = (ms: number) => vi.advanceTimersByTime(ms);
const input = (type = "pointerdown") => doc.dispatchEvent(new Event(type));
function setVisibility(state: "visible" | "hidden") {
  doc.visibilityState = state;
  doc.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  doc = new FakeDoc();
  win = new EventTarget();
  emitted = [];
  tracker = null;
  seq = 0;
});

afterEach(() => {
  tracker?.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UsageTracker 기본값", () => {
  it("무입력 30분·구간 상한 15분·최소 1초·판정 주기 60초", () => {
    expect(USAGE_IDLE_MS).toBe(30 * MIN);
    expect(USAGE_MAX_SEGMENT_MS).toBe(15 * MIN);
    expect(USAGE_MIN_SEGMENT_MS).toBe(1000);
    expect(USAGE_TICK_MS).toBe(MIN);
  });
});

describe("UsageTracker 구간 전환", () => {
  it("OPEN 으로 연 구간은 다른 화면으로 넘어갈 때 닫히고, 다음 구간은 SWITCH 로 시작한다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(5000);
    t.activate("csa/b", "SWITCH");
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5000]]]);
    expect(emitted[0][0].clientSegId).toBe("seg-1");

    advance(3000);
    t.activate("csa/a"); // 기본값 SWITCH
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 5000]],
      [["csa/b", "SWITCH", 5000, 8000]],
    ]);
  });

  it("홈(null)은 구간을 끝내기만 하고, 홈에 있는 동안 입력이 와도 기록하지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(4000);
    t.activate(null);
    input();
    advance(MIN);
    t.activate("csa/b", "SWITCH");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 4000]],
      [["csa/b", "SWITCH", 64_000, 66_000]],
    ]);
  });

  it("1초 미만 구간은 버린다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(999);
    t.activate("csa/b");
    advance(1000);
    t.activate("csa/c");
    expect(emitted.map(rows)).toEqual([[["csa/b", "SWITCH", 999, 1999]]]);
  });

  it("같은 화면을 다시 활성화해도 열린 구간을 쪼개지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    t.activate("csa/a");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5000]]]);
  });

  it("end() 뒤에는 입력이나 주기 판정이 와도 구간을 다시 열지 않는다(로그아웃)", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    t.end();
    input();
    advance(5 * MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 3000]]]);
  });

  it("dispose() 는 열린 구간을 보낸 뒤 리스너와 타이머를 뗀다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2000);
    t.dispose();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2000]]]);

    setVisibility("hidden");
    setVisibility("visible");
    input();
    win.dispatchEvent(new Event("pagehide"));
    t.activate("csa/b");
    advance(20 * MIN);
    t.end();
    expect(emitted).toHaveLength(1);
  });

  it("onSegments 가 던져도 추적은 계속하고 console.warn 만 남긴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const t = create({
      onSegments: () => {
        calls += 1;
        throw new Error("boom");
      },
    });
    t.activate("csa/a", "OPEN");
    advance(2000);
    t.activate("csa/b");
    advance(2000);
    t.activate("csa/c");
    expect(calls).toBe(2);
    expect(warn).toHaveBeenCalled();
  });
});

describe("UsageTracker 브라우저 탭 가림·pagehide", () => {
  it("가리면 닫고, 다시 보이면 RESUME 으로 잇는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    setVisibility("hidden");
    advance(10_000);
    setVisibility("visible");
    advance(2000);
    t.activate("csa/b");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 3000]],
      [["csa/a", "RESUME", 13_000, 15_000]],
    ]);
  });

  it("가려진 동안 입력이 와도 구간을 열지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2000);
    setVisibility("hidden");
    input();
    advance(5000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2000]]]);
  });

  it("가려진 채 연 탭은 보이게 될 때 OPEN 으로 시작한다(열람 횟수 유지)", () => {
    doc.visibilityState = "hidden";
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(5000);
    setVisibility("visible");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 5000, 7000]]]);
  });

  it("pagehide 에서 닫고, 돌아와 입력이 오면 RESUME 으로 연다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(4000);
    win.dispatchEvent(new Event("pagehide"));
    advance(1000);
    input("keydown");
    advance(3000);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 4000]],
      [["csa/a", "RESUME", 5000, 8000]],
    ]);
  });
});

describe("UsageTracker 무입력", () => {
  it("30분 동안 입력이 없으면 마지막 입력 시각에서 끝내고, 입력이 돌아오면 RESUME 으로 연다", () => {
    const t = create({ maxSegmentMs: 3 * 60 * MIN }); // 자르기와 떼어 무입력 규칙만 본다
    t.activate("csa/a", "OPEN");
    advance(5 * MIN);
    input("keydown");
    advance(29 * MIN); // 34분 — 마지막 입력 뒤 29분
    expect(emitted).toEqual([]);
    advance(MIN); // 35분 판정
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN]]]);

    advance(5 * MIN); // 40분
    input("wheel");
    advance(2 * MIN);
    t.activate("csa/b");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 5 * MIN]],
      [["csa/a", "RESUME", 40 * MIN, 42 * MIN]],
    ]);
  });

  it("기본값에서는 15분 자르기 조각이 먼저 나가므로 무입력 판정은 마지막 조각만 버린다(설계 한계 기록)", () => {
    create().activate("csa/a", "OPEN");
    advance(5 * MIN);
    input();
    advance(35 * MIN); // 40분
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 15 * MIN]],
      [["csa/a", "RESUME", 15 * MIN, 30 * MIN]],
    ]);
  });
});

describe("UsageTracker 15분 자르기", () => {
  it("15분째에 자르고 RESUME 으로 이어 간다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(14 * MIN);
    input();
    advance(MIN); // 15분 판정
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 15 * MIN]]]);

    advance(14 * MIN);
    input();
    advance(MIN); // 30분 판정
    advance(MIN); // 31분
    t.activate("csa/b");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 15 * MIN]],
      [["csa/a", "RESUME", 15 * MIN, 30 * MIN]],
      [["csa/a", "RESUME", 30 * MIN, 31 * MIN]],
    ]);
    expect(new Set(all().map((s) => s.clientSegId)).size).toBe(3);
  });

  it("타이머가 멈춰 있다가 닫혀도(절전·백그라운드 제한) 15분 넘는 구간을 내지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    vi.setSystemTime(BASE + 40 * MIN); // 시계만 가고 타이머는 돌지 않았다
    input();
    t.activate("csa/b");
    expect(emitted.map(rows)).toEqual([
      [
        ["csa/a", "OPEN", 0, 15 * MIN],
        ["csa/a", "RESUME", 15 * MIN, 30 * MIN],
        ["csa/a", "RESUME", 30 * MIN, 40 * MIN],
      ],
    ]);
  });
});

describe("UsageTracker 빠른 전환", () => {
  it("짧은 간격으로 오가도 구간이 겹치거나 같은 clientSegId 가 두 번 나오지 않는다", () => {
    const t = create({ createId: createUsageSegmentId }); // 실제 ID 생성기
    const pages = ["csa/a", "csa/b", "csa/c", null, "csa/a", "csa/b", "csa/a"];
    const gaps = [1200, 300, 1500, 800, 2000, 50, 1000];
    pages.forEach((pageId, i) => {
      t.activate(pageId, i < 3 ? "OPEN" : "SWITCH");
      advance(gaps[i]);
    });
    t.end();

    const segs = all();
    expect(new Set(segs.map((s) => s.clientSegId)).size).toBe(segs.length);
    const sorted = [...segs].sort((x, y) => x.startedAt - y.startedAt);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].startedAt).toBeGreaterThanOrEqual(sorted[i - 1].endedAt);
    }
    for (const s of segs) expect(s.endedAt - s.startedAt).toBeGreaterThanOrEqual(1000);
    expect(segs.map((s) => [s.pageId, s.startKind])).toEqual([
      ["csa/a", "OPEN"],
      ["csa/c", "OPEN"],
      ["csa/a", "SWITCH"],
      ["csa/a", "SWITCH"],
    ]);
  });

  it("시계가 뒤로 가도 앞 구간 끝보다 이르게 시작하지 않는다", () => {
    let now = BASE + 10_000;
    const t = create({ now: () => now });
    t.activate("csa/a", "OPEN");
    now = BASE + 12_000;
    t.activate("csa/b"); // a 10→12
    now = BASE + 5_000; // 시계 역행
    t.activate("csa/c"); // b 는 12 에서 닫혀 0초라 버림, c 는 12 부터
    now = BASE + 14_000;
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 10_000, 12_000]],
      [["csa/c", "SWITCH", 12_000, 14_000]],
    ]);
  });
});

describe("toUsagePageId", () => {
  it("탭 pageId 에서 모듈 접두를 떼어 componentPath(PARENT_MENU_ID/OBJECT_ID) 만 남긴다", () => {
    expect(toUsagePageId("mcm:csa/commUserMng")).toBe("csa/commUserMng");
    expect(toUsagePageId("mdm:mdm/ruleMng")).toBe("mdm/ruleMng");
    expect(toUsagePageId("csa/commUserMng")).toBe("csa/commUserMng");
  });
});

describe("createUsageSegmentId", () => {
  it("crypto.randomUUID 가 있으면 그대로 쓴다", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
    expect(createUsageSegmentId()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("http(보안 컨텍스트 아님)라 randomUUID 가 없으면 getRandomValues 로 36자 v4 UUID 를 만든다", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab) });
    const id = createUsageSegmentId();
    expect(id).toBe("abababab-abab-4bab-abab-abababababab");
    expect(id).toHaveLength(36);
  });
});
```

- [ ] **Step 2: 테스트를 실행해 실패 확인**

Run: `cd src/frontend/shared && pnpm exec vitest run tests/unit/usage-tracker.unit.test.ts`
Expected: FAIL, `Failed to resolve import "../../src/portal-shell/usage-tracker"`

- [ ] **Step 3: 최소 구현**

`src/frontend/shared/src/portal-shell/usage-tracker.ts`

```ts
import { parsePageId } from "./module";

/**
 * 화면 사용 구간 추적기 — 사용자가 한 화면을 실제로 보고 있던 연속 시간(구간)을 만든다.
 * 설계: docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md §3.1.
 * React 에 의존하지 않는다. 시계(now)와 이벤트 대상(document·window)을 주입받는다.
 */

/** 구간 시작 사유(공유 계약 C1). 열람 횟수 = OPEN 구간 수, 이용 시간 = 모든 구간 길이 합. */
export type UsageStartKind = "OPEN" | "SWITCH" | "RESUME";

/** 공유 계약 C1 — 서버 원본 1행. */
export interface UsageSegment {
  clientSegId: string; // crypto.randomUUID()
  pageId: string; // `${PARENT_MENU_ID}/${OBJECT_ID}`
  startKind: UsageStartKind;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
}

/** 활성 화면을 알릴 때 쓰는 시작 사유. RESUME 은 추적기가 스스로 붙인다. */
export type UsageActivateKind = "OPEN" | "SWITCH";

/** 이 시간 동안 입력이 없으면 구간을 마지막 입력 시각에서 끝낸다. */
export const USAGE_IDLE_MS = 30 * 60 * 1000;
/** 구간이 이 길이에 이르면 자르고 RESUME 으로 잇는다(창이 비정상 종료돼도 잃는 시간을 묶는다). */
export const USAGE_MAX_SEGMENT_MS = 15 * 60 * 1000;
/** 이보다 짧은 구간은 버린다. */
export const USAGE_MIN_SEGMENT_MS = 1000;
/** 무입력·자르기 판정 주기. */
export const USAGE_TICK_MS = 60 * 1000;

export interface UsageEventTarget {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

export interface UsageDocumentLike extends UsageEventTarget {
  readonly visibilityState: string;
}

export interface UsageTrackerOptions {
  /** 닫힌 구간(1초 이상)을 한 번에 넘긴다. 던져도 추적은 계속한다. */
  onSegments: (segments: UsageSegment[]) => void;
  now?: () => number;
  /** visibilitychange·입력(pointerdown·keydown·wheel) 대상. 없으면 늘 보이는 것으로 본다. */
  doc?: UsageDocumentLike | null;
  /** pagehide 대상. */
  win?: UsageEventTarget | null;
  createId?: () => string;
  idleMs?: number;
  maxSegmentMs?: number;
  minSegmentMs?: number;
  tickMs?: number;
}

interface OpenSegment {
  id: string;
  pageId: string;
  startKind: UsageStartKind;
  startedAt: number;
}

const INPUT_EVENTS = ["pointerdown", "keydown", "wheel"] as const;
const INPUT_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

/** 탭 pageId(`moduleId:componentPath`) → 기록용 pageId(componentPath). 형식이 다르면 그대로 둔다. */
export function toUsagePageId(tabPageId: string): string {
  return parsePageId(tabPageId)?.pageName ?? tabPageId;
}

/**
 * 구간 ID(36자 UUID v4). http 로 IP 접속하면 보안 컨텍스트가 아니라 crypto.randomUUID 가 없으므로
 * getRandomValues(보안 컨텍스트 불필요)로 만든다. 그것도 없으면 Math.random 으로 채운다.
 */
export function createUsageSegmentId(): string {
  const cryptoApi = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // 버전 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 변형
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class UsageTracker {
  private readonly onSegments: (segments: UsageSegment[]) => void;
  private readonly now: () => number;
  private readonly doc: UsageDocumentLike | null;
  private readonly win: UsageEventTarget | null;
  private readonly createId: () => string;
  private readonly idleMs: number;
  private readonly maxSegmentMs: number;
  private readonly minSegmentMs: number;
  private readonly timer: ReturnType<typeof setInterval>;
  /** 지금 보고 있다고 보는 화면. 홈·탭 없음·로그아웃이면 null. */
  private pageId: string | null = null;
  /** 다음에 여는 구간의 시작 사유. 한 번 열면 RESUME 으로 돌아간다. */
  private nextKind: UsageStartKind = "RESUME";
  private open: OpenSegment | null = null;
  private lastInputAt = 0;
  /** 시계가 뒤로 가도 구간이 겹치지 않게 지금까지 본 가장 늦은 시각. */
  private lastTime = Number.NEGATIVE_INFINITY;
  private disposed = false;

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed) return;
    const t = this.time();
    if (this.isHidden()) {
      this.close(t);
      return;
    }
    this.lastInputAt = t;
    this.openIfVisible(t);
  };

  private readonly handlePageHide = (): void => {
    if (this.disposed) return;
    this.close(this.time());
  };

  private readonly handleInput = (): void => {
    if (this.disposed) return;
    const t = this.time();
    this.lastInputAt = t;
    if (!this.open) this.openIfVisible(t); // 무입력·pagehide 뒤 돌아온 입력 → RESUME
  };

  constructor(options: UsageTrackerOptions) {
    this.onSegments = options.onSegments;
    this.now = options.now ?? (() => Date.now());
    this.doc = options.doc ?? null;
    this.win = options.win ?? null;
    this.createId = options.createId ?? createUsageSegmentId;
    this.idleMs = options.idleMs ?? USAGE_IDLE_MS;
    this.maxSegmentMs = options.maxSegmentMs ?? USAGE_MAX_SEGMENT_MS;
    this.minSegmentMs = options.minSegmentMs ?? USAGE_MIN_SEGMENT_MS;
    this.lastInputAt = this.time();
    this.doc?.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.win?.addEventListener("pagehide", this.handlePageHide);
    for (const type of INPUT_EVENTS) {
      this.doc?.addEventListener(type, this.handleInput, INPUT_LISTENER_OPTIONS);
    }
    this.timer = setInterval(() => this.tick(), options.tickMs ?? USAGE_TICK_MS);
  }

  /** 활성 화면이 바뀌었다. 이전 구간을 지금 닫고, pageId 가 있으면 새 구간을 연다(가려져 있으면 보일 때 연다). */
  activate(pageId: string | null, startKind: UsageActivateKind = "SWITCH"): void {
    if (this.disposed) return;
    if (pageId != null && pageId === this.pageId && this.open) return;
    const t = this.time();
    this.close(t);
    this.pageId = pageId;
    this.nextKind = startKind;
    this.lastInputAt = t;
    this.openIfVisible(t);
  }

  /** 로그아웃 — 열린 구간을 닫고, 다시 activate 될 때까지 열지 않는다. */
  end(): void {
    if (this.disposed) return;
    this.close(this.time());
    this.pageId = null;
  }

  /** 60초 판정. 무입력 30분이면 마지막 입력 시각에서 끝내고, 아니면 15분 넘은 구간을 자른다. */
  tick(): void {
    if (this.disposed || !this.open) return;
    const t = this.time();
    if (t - this.lastInputAt >= this.idleMs) {
      this.close(Math.max(this.open.startedAt, this.lastInputAt));
      return; // 다음 입력 때 RESUME 으로 다시 연다
    }
    this.emit(this.cutLongPieces(t));
  }

  dispose(): void {
    if (this.disposed) return;
    this.end();
    this.disposed = true;
    clearInterval(this.timer);
    this.doc?.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.win?.removeEventListener("pagehide", this.handlePageHide);
    for (const type of INPUT_EVENTS) {
      this.doc?.removeEventListener(type, this.handleInput, { capture: true });
    }
  }

  private time(): number {
    const t = Math.max(this.now(), this.lastTime);
    this.lastTime = t;
    return t;
  }

  private isHidden(): boolean {
    return this.doc?.visibilityState === "hidden";
  }

  private openIfVisible(t: number): void {
    if (this.open || this.pageId == null || this.isHidden()) return;
    this.open = { id: this.createId(), pageId: this.pageId, startKind: this.nextKind, startedAt: t };
    this.nextKind = "RESUME";
  }

  /** 열린 구간을 at 에서 닫는다. 15분이 넘으면 15분 조각으로 나눠 함께 넘긴다. */
  private close(at: number): void {
    if (!this.open) return;
    const pieces = this.cutLongPieces(at);
    const last = this.open;
    this.open = null;
    if (last) pieces.push(this.toSegment(last, Math.max(at, last.startedAt)));
    this.emit(pieces);
  }

  /** 열린 구간이 at 까지 15분 이상이면 15분째에서 자르고 같은 화면의 RESUME 구간으로 잇는다. 잘린 조각을 돌려준다. */
  private cutLongPieces(at: number): UsageSegment[] {
    const pieces: UsageSegment[] = [];
    while (this.open && at - this.open.startedAt >= this.maxSegmentMs) {
      const cutAt = this.open.startedAt + this.maxSegmentMs;
      pieces.push(this.toSegment(this.open, cutAt));
      this.open = {
        id: this.createId(),
        pageId: this.open.pageId,
        startKind: "RESUME",
        startedAt: cutAt,
      };
    }
    return pieces;
  }

  private toSegment(open: OpenSegment, endedAt: number): UsageSegment {
    return {
      clientSegId: open.id,
      pageId: open.pageId,
      startKind: open.startKind,
      startedAt: open.startedAt,
      endedAt,
    };
  }

  private emit(pieces: UsageSegment[]): void {
    const kept = pieces.filter((s) => s.endedAt - s.startedAt >= this.minSegmentMs);
    if (kept.length === 0) return;
    try {
      this.onSegments(kept);
    } catch (err) {
      console.warn("[usage-tracker] 화면 사용 구간 처리 실패", err);
    }
  }
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `cd src/frontend/shared && pnpm exec vitest run tests/unit/usage-tracker.unit.test.ts`
Expected: PASS(21 tests)

Run: `pnpm --filter @dk-oasis/shared lint`
Expected: 오류 0, exit 0

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/shared/src/portal-shell/usage-tracker.ts src/frontend/shared/tests/unit/usage-tracker.unit.test.ts
/usr/bin/git commit -m "feat(shared): 포털 화면 사용 구간 추적기 UsageTracker 를 추가한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 구간 전송기 `createUsageSender` 와 종료 전송 연결 `bindUsageSender`

**Files:**
- Create: `src/frontend/shared/src/portal-shell/usage-sender.ts`
- Test: `src/frontend/shared/tests/unit/usage-sender.unit.test.ts`

**Interfaces:**
- Consumes (Task 1): `UsageSegment`, `UsageDocumentLike`, `UsageEventTarget` from `./usage-tracker`
- Produces (Task 4 가 쓴다):
  ```ts
  // 공유 계약 C2 — 그대로
  export interface UsageSenderOptions { endpoint: string; buildMeta?: () => Promise<Record<string, unknown>>; fetchImpl?: typeof fetch; batchSize?: number; intervalMs?: number; maxQueue?: number; maxPerRequest?: number }
  export interface UsageSender { enqueue(segments: UsageSegment[]): void; flush(opts?: { keepalive?: boolean }): Promise<void>; dispose(): void }
  export function createUsageSender(options: UsageSenderOptions): UsageSender;
  // 추가 export(계약 C2 를 바꾸지 않는 덧붙임)
  export interface UsageExitTargets { doc?: UsageDocumentLike | null; win?: UsageEventTarget | null }
  export interface UsageExitBinding { onSegments(segments: UsageSegment[]): void; closeAndFlush(): void; dispose(): void }
  export function bindUsageSender(sender: UsageSender, targets?: UsageExitTargets): UsageExitBinding;
  ```
- 동작 규칙. 실패한 묶음은 큐 앞에 되돌리고(넘치면 오래된 것부터 버림) "다음 주기까지 막힘"으로 표시한다. 막힌 동안에는 묶음 크기에 따른 자동 전송을 하지 않는다. 명시적 `flush()` 와 keepalive flush 는 막힘과 관계없이 보낸다. `dispose()` 는 주기 타이머만 멈추고, 그 뒤에도 `enqueue` 와 명시적 `flush` 는 동작한다(언마운트 뒤 늦게 도착한 마지막 구간용). `flush()` 는 결코 reject 하지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/frontend/shared/tests/unit/usage-sender.unit.test.ts`

```ts
/**
 * 화면 사용 구간 전송기(usage-sender) — 공유 계약 C2·C3, 설계 §3.3(2026-10-02).
 * node 환경. fetch 는 주입한 가짜이고, 응답은 Response 대신 단순 객체(ok·status·json)를 쓴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindUsageSender,
  createUsageSender,
  type UsageSender,
  type UsageSenderOptions,
} from "../../src/portal-shell/usage-sender";
import type { UsageSegment } from "../../src/portal-shell/usage-tracker";

const ENDPOINT = "/api/mcm/oasis/screenUsage/record";

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (): FakeResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ meta: { success: true }, data: { result: { saved: 1, skipped: 0 } } }),
});
const httpError = (status: number): FakeResponse => ({ ok: false, status, json: async () => ({}) });
const rejectedBody = (): FakeResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ meta: { success: false, message: "검증 실패" } }),
});

function seg(n: number): UsageSegment {
  return {
    clientSegId: `seg-${n}`,
    pageId: "csa/a",
    startKind: "OPEN",
    startedAt: 1_000 * n,
    endedAt: 1_000 * n + 5_000,
  };
}
const segs = (from: number, count: number) => Array.from({ length: count }, (_, i) => seg(from + i));
const ids = (list: UsageSegment[]) => list.map((s) => s.clientSegId);

/** 응답을 차례로 돌려주는 가짜 fetch. Error 를 넣으면 그 차례에 reject 한다. 다 쓰면 ok. */
function mockFetch(...responses: Array<FakeResponse | Error>) {
  const pending = [...responses];
  return vi.fn(async (_url: string, _init: RequestInit): Promise<FakeResponse> => {
    const next = pending.shift() ?? ok();
    if (next instanceof Error) throw next;
    return next;
  });
}
type CallLog = { mock: { calls: unknown[][] } };
function sentBody(fetchImpl: CallLog, call: number) {
  const init = fetchImpl.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body));
}
const sentRows = (fetchImpl: CallLog, call: number): UsageSegment[] =>
  sentBody(fetchImpl, call).grids.segments.rows;

/** 묶음 크기 자동 전송은 마이크로태스크로 미뤄 돌므로 몇 차례 비운다. */
async function settle() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}

let sender: UsageSender | null = null;
function create(fetchImpl: unknown, overrides: Partial<UsageSenderOptions> = {}): UsageSender {
  sender = createUsageSender({
    endpoint: ENDPOINT,
    fetchImpl: fetchImpl as typeof fetch,
    ...overrides,
  });
  return sender;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  sender?.dispose();
  sender = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createUsageSender", () => {
  it("20건이 차면 바로 한 묶음으로 보내고, 본문은 C3 형식이다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl, {
      buildMeta: async () => ({ userId: "u1", menuId: "PORTAL_SHELL" }),
    });
    s.enqueue(segs(0, 19));
    await settle();
    expect(fetchImpl).not.toHaveBeenCalled();

    s.enqueue([seg(19)]);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.keepalive).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({
      meta: { userId: "u1", menuId: "PORTAL_SHELL" },
      params: {},
      grids: { segments: { rows: segs(0, 20) } },
    });
  });

  it("20건이 안 돼도 60초마다 보내고, buildMeta 가 없으면 meta 는 { menuId: PORTAL_SHELL } 이다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl);
    s.enqueue(segs(0, 3));
    await vi.advanceTimersByTimeAsync(59_999);
    await settle();
    expect(fetchImpl).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchImpl, 0).meta).toEqual({ menuId: "PORTAL_SHELL" });
    expect(ids(sentRows(fetchImpl, 0))).toEqual(["seg-0", "seg-1", "seg-2"]);
  });

  it("실패하면 큐에 되돌리고, 다음 주기 전에는 묶음 크기가 차도 다시 보내지 않는다(재시도 폭주 방지)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = mockFetch(new Error("network down"));
    const s = create(fetchImpl);
    s.enqueue(segs(0, 20));
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    s.enqueue([seg(20)]);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ids(sentRows(fetchImpl, 1))).toEqual(ids(segs(0, 21))); // 원래 구간이 앞, 같은 clientSegId

    s.enqueue(segs(21, 20)); // 성공 뒤에는 묶음 크기 자동 전송이 다시 돈다
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("HTTP 오류와 meta.success=false 도 실패로 보고 같은 구간을 다시 보낸다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = mockFetch(httpError(403), rejectedBody(), ok());
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 2));
    await s.flush();
    await s.flush();
    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const call of [0, 1, 2]) expect(ids(sentRows(fetchImpl, call))).toEqual(["seg-0", "seg-1"]);

    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 다 보냈으면 더 보내지 않는다
  });

  it("buildMeta 가 실패해도 던지지 않고 구간을 남겨 다음에 보낸다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let first = true;
    const buildMeta = vi.fn(async () => {
      if (first) {
        first = false;
        throw new Error("me 실패");
      }
      return { userId: "u1", menuId: "PORTAL_SHELL" };
    });
    const fetchImpl = mockFetch();
    const s = create(fetchImpl, { batchSize: 1000, buildMeta });
    s.enqueue([seg(0)]);
    await expect(s.flush()).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();

    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchImpl, 0).meta).toEqual({ userId: "u1", menuId: "PORTAL_SHELL" });
  });

  it("큐는 200건까지만 두고 넘치면 오래된 것부터 버리며, 한 요청에는 100건까지 싣는다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 250));
    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ids(sentRows(fetchImpl, 0))).toEqual(ids(segs(50, 100)));
    expect(ids(sentRows(fetchImpl, 1))).toEqual(ids(segs(150, 100)));
  });

  it("실패해 되돌린 구간과 새 구간을 합쳐도 상한 200을 지킨다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = mockFetch(new Error("down"), new Error("down"));
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 150));
    await s.flush(); // 100 + 50 두 요청 모두 실패 → 150건 되돌림
    s.enqueue(segs(150, 100)); // 250건 → 오래된 50건 버림
    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(ids(sentRows(fetchImpl, 2))).toEqual(ids(segs(50, 100)));
    expect(ids(sentRows(fetchImpl, 3))).toEqual(ids(segs(150, 100)));
  });

  it("keepalive flush 는 keepalive:true 로 남은 것을 모두 보낸다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 120));
    await s.flush({ keepalive: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) expect(call[1].keepalive).toBe(true);
    expect(sentRows(fetchImpl, 0).length + sentRows(fetchImpl, 1).length).toBe(120);
  });

  it("보내는 중에 다시 flush 해도 같은 구간을 두 번 보내지 않는다", async () => {
    let release: (response: FakeResponse) => void = () => {};
    let n = 0;
    const fetchImpl = vi.fn((_url: string, _init: RequestInit): Promise<FakeResponse> => {
      n += 1;
      if (n === 1) {
        return new Promise<FakeResponse>((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve(ok());
    });
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 5));
    const first = s.flush();
    await settle();
    s.enqueue(segs(5, 3));
    const second = s.flush();
    await settle();
    release(ok());
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ids(sentRows(fetchImpl, 0))).toEqual(ids(segs(0, 5)));
    expect(ids(sentRows(fetchImpl, 1))).toEqual(ids(segs(5, 3)));
  });

  it("dispose 뒤에는 주기 전송을 멈추지만 명시적 flush 는 보낸다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl);
    s.enqueue(segs(0, 2));
    s.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    await settle();
    expect(fetchImpl).not.toHaveBeenCalled();

    await s.flush({ keepalive: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("bindUsageSender", () => {
  class FakeDoc extends EventTarget {
    visibilityState: "visible" | "hidden" = "visible";
  }
  function fakeSender() {
    return {
      enqueue: vi.fn((_segments: UsageSegment[]) => {}),
      flush: vi.fn(async (_opts?: { keepalive?: boolean }) => {}),
      dispose: vi.fn(() => {}),
    };
  }
  let doc: FakeDoc;
  let win: EventTarget;

  beforeEach(() => {
    doc = new FakeDoc();
    win = new EventTarget();
  });

  it("보이는 동안 받은 구간은 큐에만 넣는다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    b.onSegments([seg(1)]);
    expect(s.enqueue).toHaveBeenCalledWith([seg(1)]);
    expect(s.flush).not.toHaveBeenCalled();
    b.dispose();
  });

  it("가려진 상태에서 받은 구간은 넣자마자 keepalive 로 보낸다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    doc.visibilityState = "hidden";
    b.onSegments([seg(1)]);
    expect(s.enqueue).toHaveBeenCalledWith([seg(1)]);
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    b.dispose();
  });

  it("가려지면 남은 큐를 keepalive 로 비우고, 다시 보일 때는 보내지 않는다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.flush).toHaveBeenCalledTimes(1);
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.flush).toHaveBeenCalledTimes(1);
    b.dispose();
  });

  it("pagehide 뒤에는 아직 visible 이어도 받은 구간을 바로 keepalive 로 보낸다(새로고침·창 닫기, 리스너 순서 무관)", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    win.dispatchEvent(new Event("pagehide"));
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    s.flush.mockClear();

    b.onSegments([seg(1)]); // 추적기의 pagehide 리스너가 나중에 돌아 마지막 구간을 넘긴 경우
    expect(s.enqueue).toHaveBeenCalledWith([seg(1)]);
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    b.dispose();
  });

  it("bfcache 로 돌아오면(pageshow persisted) 닫는 중 표시를 푼다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    win.dispatchEvent(new Event("pagehide"));
    win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    s.flush.mockClear();
    b.onSegments([seg(1)]);
    expect(s.flush).not.toHaveBeenCalled();
    b.dispose();
  });

  it("closeAndFlush 는 바로 keepalive 로 보내고, 그 뒤 받은 구간도 바로 보낸다(로그아웃·언마운트)", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    b.closeAndFlush();
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    s.flush.mockClear();
    b.onSegments([seg(1)]);
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    b.dispose();
  });

  it("dispose 는 리스너만 떼고 sender 를 멈추지 않는다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    b.dispose();
    win.dispatchEvent(new Event("pagehide"));
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.flush).not.toHaveBeenCalled();
    expect(s.dispose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트를 실행해 실패 확인**

Run: `cd src/frontend/shared && pnpm exec vitest run tests/unit/usage-sender.unit.test.ts`
Expected: FAIL, `Failed to resolve import "../../src/portal-shell/usage-sender"`

- [ ] **Step 3: 최소 구현**

`src/frontend/shared/src/portal-shell/usage-sender.ts`

```ts
import type { UsageDocumentLike, UsageEventTarget, UsageSegment } from "./usage-tracker";

/**
 * 화면 사용 구간 전송기 — 큐(최대 200건, 넘치면 오래된 것부터 버림), 20건 또는 60초마다 묶음 전송
 * (최대 100건/요청), 실패 시 큐에 되돌려 다음 주기 재시도, flush({ keepalive: true }).
 * 공유 계약 C2·C3. 오류는 console.warn 만 남기고 던지지 않는다.
 */

export interface UsageSenderOptions {
  endpoint: string; // "/api/mcm/oasis/screenUsage/record"
  buildMeta?: () => Promise<Record<string, unknown>>; // 기본 { menuId: "PORTAL_SHELL" }
  fetchImpl?: typeof fetch;
  batchSize?: number; // 20
  intervalMs?: number; // 60_000
  maxQueue?: number; // 200
  maxPerRequest?: number; // 100
}

export interface UsageSender {
  enqueue(segments: UsageSegment[]): void;
  flush(opts?: { keepalive?: boolean }): Promise<void>;
  dispose(): void;
}

const DEFAULT_MENU_ID = "PORTAL_SHELL";

export function createUsageSender(options: UsageSenderOptions): UsageSender {
  const batchSize = options.batchSize ?? 20;
  const intervalMs = options.intervalMs ?? 60_000;
  const maxQueue = options.maxQueue ?? 200;
  const maxPerRequest = options.maxPerRequest ?? 100;
  let queue: UsageSegment[] = [];
  /** 실패하면 다음 주기까지 묶음 크기 자동 전송을 멈춘다(백엔드 장애·403 때 탭 전환마다 요청이 나가지 않게). */
  let blocked = false;
  let disposed = false;

  function trimOldest(): void {
    if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
  }

  async function send(rows: UsageSegment[], keepalive: boolean): Promise<boolean> {
    try {
      const meta = options.buildMeta ? await options.buildMeta() : { menuId: DEFAULT_MENU_ID };
      const fetchFn = options.fetchImpl ?? globalThis.fetch;
      const res = await fetchFn(options.endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta, params: {}, grids: { segments: { rows } } }),
        keepalive,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json().catch(() => null)) as {
        meta?: { success?: boolean; message?: string };
      } | null;
      if (body?.meta?.success === false) throw new Error(body.meta.message ?? "기록 실패");
      return true;
    } catch (err) {
      console.warn("[usage-sender] 화면 사용 구간 전송 실패 — 다음 주기에 다시 보낸다", err);
      return false;
    }
  }

  async function flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    if (queue.length === 0) return;
    // await 전에 큐에서 떼어 낸다 — 보내는 중에 다른 flush 가 와도 같은 구간을 두 번 싣지 않는다.
    const chunks: UsageSegment[][] = [];
    while (queue.length > 0) chunks.push(queue.splice(0, maxPerRequest));
    const keepalive = opts.keepalive === true;
    const results = await Promise.all(chunks.map((rows) => send(rows, keepalive)));
    const failed = chunks.filter((_, i) => !results[i]).flat();
    if (failed.length > 0) {
      queue = [...failed, ...queue];
      trimOldest();
      blocked = true;
    } else {
      blocked = false;
    }
  }

  const timer = setInterval(() => {
    blocked = false;
    void flush();
  }, intervalMs);

  return {
    enqueue(segments) {
      if (segments.length === 0) return;
      queue.push(...segments);
      trimOldest();
      if (disposed || blocked || queue.length < batchSize) return;
      // 마이크로태스크로 미룬다 — 같은 흐름에서 이어지는 keepalive flush(bindUsageSender)가 먼저 큐를 가져가게.
      void Promise.resolve().then(() => {
        if (!blocked && queue.length >= batchSize) void flush();
      });
    },
    flush,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer); // 큐는 남긴다 — 뒤늦게 온 구간도 명시적 flush 로 보낼 수 있다
    },
  };
}

export interface UsageExitTargets {
  doc?: UsageDocumentLike | null;
  win?: UsageEventTarget | null;
}

export interface UsageExitBinding {
  /** PortalShell onUsageSegments 로 넘긴다. 큐에 넣고, 닫는 중이거나 가려져 있으면 바로 keepalive 로 보낸다. */
  onSegments(segments: UsageSegment[]): void;
  /** 로그아웃·언마운트 — 닫는 중으로 표시하고 남은 큐를 keepalive 로 보낸다. */
  closeAndFlush(): void;
  /** 리스너만 뗀다(sender.dispose 는 부르는 쪽 몫). */
  dispose(): void;
}

/**
 * 페이지를 떠날 때 마지막 구간이 빠지지 않게 sender 를 page 수명에 묶는다.
 * pagehide 때는 visibilityState 가 아직 visible 일 수 있고 추적기 리스너와의 실행 순서도 정해져 있지 않다.
 * 그래서 pagehide 에서 "닫는 중" 표시를 켜고, 그 뒤 들어오는 구간은 받는 즉시 keepalive 로 보낸다.
 */
export function bindUsageSender(
  sender: UsageSender,
  targets: UsageExitTargets = {}
): UsageExitBinding {
  const doc = targets.doc ?? null;
  const win = targets.win ?? null;
  let closing = false;
  const flushKeepalive = () => {
    void sender.flush({ keepalive: true });
  };
  const onVisibilityChange = () => {
    if (doc?.visibilityState === "hidden") flushKeepalive();
  };
  const onPageHide = () => {
    closing = true;
    flushKeepalive();
  };
  const onPageShow = (event: Event) => {
    if ((event as { persisted?: boolean }).persisted) closing = false;
  };
  doc?.addEventListener("visibilitychange", onVisibilityChange);
  win?.addEventListener("pagehide", onPageHide);
  win?.addEventListener("pageshow", onPageShow);

  return {
    onSegments(segments) {
      if (segments.length === 0) return;
      sender.enqueue(segments);
      if (closing || doc?.visibilityState === "hidden") flushKeepalive();
    },
    closeAndFlush() {
      closing = true;
      flushKeepalive();
    },
    dispose() {
      doc?.removeEventListener("visibilitychange", onVisibilityChange);
      win?.removeEventListener("pagehide", onPageHide);
      win?.removeEventListener("pageshow", onPageShow);
    },
  };
}
```

- [ ] **Step 4: 테스트와 타입 검사 통과 확인**

Run: `cd src/frontend/shared && pnpm exec vitest run tests/unit/usage-sender.unit.test.ts`
Expected: PASS(17 tests)

Run: `pnpm --filter @dk-oasis/shared lint`
Expected: 오류 0, exit 0

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/shared/src/portal-shell/usage-sender.ts src/frontend/shared/tests/unit/usage-sender.unit.test.ts
/usr/bin/git commit -m "feat(shared): 화면 사용 구간 전송기와 페이지 종료 때 keepalive 전송 연결을 추가한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PortalShell 연동(`onUsageSegments`)과 export

**Files:**
- Modify: `src/frontend/shared/src/portal-shell/portal-shell.tsx`. 줄번호는 수정 전 기준이다.
  - import 블록 `:40-43`
  - `PortalShellProps` `:138-172`
  - 구조 분해 `:227-245`
  - ref 영역 `:259-267`
  - `openPageTab` `:477-478`
  - `doLogout` `:535-536`
  - 기존 `portal-tab-activated` effect `:937-943` 바로 뒤
- Modify: `src/frontend/shared/src/portal-shell/index.ts:9` 뒤
- Test: `src/frontend/shared/tests/unit/portal-shell-usage.unit.test.ts`

**Interfaces:**
- Consumes (Task 1): `UsageTracker`, `toUsagePageId`, `type UsageSegment`
- Produces (Task 4 가 쓴다):
  - `PortalShellProps.onUsageSegments?: (segments: UsageSegment[]) => void` (C1)
  - `@dk-oasis/shared/portal-shell` 에서 `usage-tracker`·`usage-sender` 의 모든 export(`createUsageSender`, `bindUsageSender`, `UsageSegment`, `UsageExitBinding` 등)
- 동작 규칙
  - 활성 탭이 바뀌는 모든 경로(`openPageTab`, 탭 클릭 `navigateToTab`, 뒤로가기, `closeTab` 뒤 이웃 탭, 저장소 복원, 기본 화면 자동 열기)는 `activeTabId`(`:247`)로 모인다. 그래서 그 effect 하나에서 `tracker.activate` 를 부른다.
  - `openPageTab` 이 새 탭을 만들면 `usageOpenTabIdsRef` 에 그 탭 ID 를 넣고, effect 가 소비해 OPEN 으로 보낸다. 표시가 없으면 SWITCH 다. 새로고침 뒤 복원된 탭은 설계 §9.3 에 따라 SWITCH 다. 기본 화면 자동 열기(`:818-844`, `openPageTab` 을 거치지 않음)도 설계 §3.1 "OPEN = openPageTab 이 새 탭을 만든 경우"를 글자 그대로 따라 SWITCH 로 둔다. 이것은 이 계획의 결정이며 메인 보고에 올린다.
  - 홈 탭(`isHome`)과 활성 탭 없음은 `activate(null)` 로 처리한다.
  - document·window 리스너(visibilitychange, pagehide, pointerdown·keydown·wheel)는 PortalShell 이 effect 에서 만드는 추적기가 단다. `onUsageSegments` 가 없으면 추적기를 만들지 않아 리스너도 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/frontend/shared/tests/unit/portal-shell-usage.unit.test.ts`

```ts
/** @vitest-environment happy-dom */
/**
 * PortalShell 화면 사용 구간 연동 — 탭 열기·전환·닫기·홈·가림·로그아웃 때 onUsageSegments 가 불리는 순서(2026-10-02).
 * Date 만 가짜로 돌린다(Mantine·act 가 쓰는 타이머는 그대로). 탭 pageId 는 "t:a" 형식이고 기록 pageId 는 "a" 다.
 */
import { StrictMode, act, createElement } from "react";
import { signOut } from "next-auth/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell, type PortalShellProps } from "../../src/portal-shell/portal-shell";
import type { PortalShellPageComponent } from "../../src/portal-shell/types";
import type { UsageSegment } from "../../src/portal-shell/usage-tracker";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (typeof globalThis[name] !== "undefined") continue;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const Page: PortalShellPageComponent = () => createElement("div", null, "page");
const BASE = Date.UTC(2026, 9, 2, 0, 0, 0);

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function openTab(pageId: string) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
  });
  await flush();
}

/** BASE 기준 ms 로 시계를 맞춘다. */
const at = (ms: number) => vi.setSystemTime(BASE + ms);

let rendered: Rendered | null = null;
let batches: UsageSegment[][];

function props(overrides: Partial<PortalShellProps> = {}): PortalShellProps {
  return {
    appName: "TEST",
    menu: { items: [] },
    resolvePage: async () => Page,
    homePageId: "t:home",
    storageKey: `portal-shell-usage-${Math.random()}`,
    onUsageSegments: (segments) => {
      batches.push(segments);
    },
    ...overrides,
  };
}

/** 넘긴 묶음마다 [pageId, startKind, 시작, 끝](BASE 기준 ms). */
const rows = () =>
  batches.map((batch) =>
    batch.map((s) => [s.pageId, s.startKind, s.startedAt - BASE, s.endedAt - BASE])
  );

function unmount() {
  rendered?.unmount();
  rendered = null;
}

describe("PortalShell 화면 사용 구간(onUsageSegments)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    batches = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 })
      )
    );
  });

  afterEach(() => {
    unmount();
    delete (document as unknown as Record<string, unknown>).visibilityState;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("탭 열기·전환·닫기·홈 이동 때 이전 구간을 닫아 순서대로 넘기고, 홈은 기록하지 않는다", async () => {
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    expect(batches).toEqual([]); // 홈만 보고 있다

    await openTab("t:a"); // 0초 — 새 탭 a
    at(5_000);
    await openTab("t:b"); // 새 탭 b
    at(10_000);
    await openTab("t:a"); // 열린 탭 a 로 전환
    at(15_000);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="t:a 탭 닫기"]')!.click();
    });
    await flush(); // 활성 탭 a 닫힘 → 이웃 탭 b
    at(20_000);
    await openTab("t:home"); // 홈 — 끝내기만
    at(30_000);
    await openTab("t:b"); // 홈에서 b
    at(33_000);
    unmount(); // 언마운트 — 열린 구간을 닫는다

    expect(rows()).toEqual([
      [["a", "OPEN", 0, 5_000]],
      [["b", "OPEN", 5_000, 10_000]],
      [["a", "SWITCH", 10_000, 15_000]],
      [["b", "SWITCH", 15_000, 20_000]],
      [["b", "SWITCH", 30_000, 33_000]],
    ]);
  });

  it("StrictMode 에서 빠르게 오가도 구간이 겹치거나 같은 clientSegId 가 두 번 나오지 않고, 새 탭마다 OPEN 이 한 번이다", async () => {
    rendered = renderWithMantine(createElement(StrictMode, null, createElement(PortalShell, props())));
    await flush();
    let now = 0;
    for (const pageId of ["t:a", "t:b", "t:c", "t:a", "t:b", "t:home", "t:c", "t:a"]) {
      await openTab(pageId);
      now += 1_500;
      at(now);
    }
    unmount();

    const segs = batches.flat();
    expect(segs).toHaveLength(7);
    expect(new Set(segs.map((s) => s.clientSegId)).size).toBe(segs.length);
    const sorted = [...segs].sort((x, y) => x.startedAt - y.startedAt);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].startedAt).toBeGreaterThanOrEqual(sorted[i - 1].endedAt);
    }
    expect(segs.filter((s) => s.startKind === "OPEN").map((s) => s.pageId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(segs.some((s) => s.pageId === "home")).toBe(false);
  });

  it("새로고침 뒤 복원된 활성 탭은 SWITCH 로 시작한다(설계 §9.3)", async () => {
    const storageKey = `portal-shell-usage-restore-${Math.random()}`;
    rendered = renderWithMantine(createElement(PortalShell, props({ storageKey })));
    await flush();
    await openTab("t:a");
    at(2_000);
    unmount();

    at(10_000);
    rendered = renderWithMantine(createElement(PortalShell, props({ storageKey })));
    await flush();
    at(13_000);
    await openTab("t:b");

    expect(rows()).toEqual([
      [["a", "OPEN", 0, 2_000]],
      [["a", "SWITCH", 10_000, 13_000]],
    ]);
  });

  it("브라우저 탭을 가리면 닫고 다시 보이면 RESUME 으로 잇고, pagehide 에서도 닫는다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    await openTab("t:a");
    at(3_000);
    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    at(10_000);
    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    at(12_000);
    await openTab("t:b");
    at(15_000);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    at(20_000);
    unmount(); // pagehide 뒤 입력이 없었으니 더 넘길 구간이 없다

    expect(rows()).toEqual([
      [["a", "OPEN", 0, 3_000]],
      [["a", "RESUME", 10_000, 12_000]],
      [["b", "OPEN", 12_000, 15_000]],
    ]);
  });

  it("로그아웃은 signOut 보다 먼저 열린 구간을 닫아 넘긴다", async () => {
    const order: string[] = [];
    vi.mocked(signOut).mockImplementationOnce(async () => {
      order.push("signOut");
      return undefined as never;
    });
    rendered = renderWithMantine(
      createElement(
        PortalShell,
        props({
          onUsageSegments: (segments) => {
            order.push("usage");
            batches.push(segments);
          },
        })
      )
    );
    await flush();
    await openTab("t:a");
    at(4_000);

    act(() => document.querySelector<HTMLElement>(".portal-header__user-button")!.click());
    const logout = [...document.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.textContent?.trim() === "로그아웃" && el.children.length === 0
    );
    expect(logout).toBeDefined();
    await act(async () => logout!.click());

    expect(order).toEqual(["usage", "signOut"]);
    expect(rows()).toEqual([[["a", "OPEN", 0, 4_000]]]);
    unmount();
    expect(batches).toHaveLength(1); // 로그아웃으로 이미 닫았다
  });

  it("onUsageSegments 가 없으면 추적기를 만들지 않는다(가림·pagehide 리스너 없음)", async () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const listenedTypes = () =>
      [...docAdd.mock.calls, ...winAdd.mock.calls].map(([type]) => type);

    rendered = renderWithMantine(createElement(PortalShell, props({ onUsageSegments: undefined })));
    await flush();
    await openTab("t:a");
    expect(listenedTypes()).not.toContain("visibilitychange");
    expect(listenedTypes()).not.toContain("pagehide");
    unmount();

    // 대조 — prop 이 있으면 단다.
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    expect(listenedTypes()).toContain("visibilitychange");
    expect(listenedTypes()).toContain("pagehide");
  });
});
```

- [ ] **Step 2: 테스트를 실행해 실패 확인**

Run: `cd src/frontend/shared && pnpm exec vitest run tests/unit/portal-shell-usage.unit.test.ts`
Expected: FAIL. `onUsageSegments` 를 아직 부르지 않으므로 첫 테스트는 `expected [] to deeply equal [ [ [ 'a', 'OPEN', 0, 5000 ] ], …]` 로 실패하고, 마지막 대조 단계는 `expected [...] to include 'visibilitychange'` 로 실패한다.

- [ ] **Step 3: 최소 구현**

(1) import — `:42` `import { useTabFullscreen } from "./use-tab-fullscreen";` 바로 뒤에 넣는다.

```ts
import { UsageTracker, toUsagePageId, type UsageSegment } from "./usage-tracker";
```

(2) prop — `PortalShellProps` 의 `onToggleStartPage?: (pageId: string) => void;`(`:171`) 바로 뒤, 닫는 `}` 앞에 넣는다.

```ts
  /**
   * 화면 사용 구간 수집 — 활성 탭(홈 제외)을 실제로 보고 있던 구간이 닫힐 때마다 호출한다.
   * 미지정이면 추적기를 만들지 않는다. 큐·전송·재시도는 호출부(usage-sender) 몫이다.
   */
  onUsageSegments?: (segments: UsageSegment[]) => void;
```

(3) 구조 분해 — `onToggleStartPage,`(`:244`) 바로 뒤에 넣는다.

```ts
  onUsageSegments,
```

(4) ref — `const startPagesAppliedRef = useRef<boolean>(false);`(`:267`) 바로 뒤에 넣는다.

```ts
  /** 최신 tabs — 활성 탭 effect 가 deps 없이 탭 정보(pageId·isHome)를 읽는다. */
  const tabsRef = useRef<PortalShellTabState[]>(tabs);
  tabsRef.current = tabs;
  /** 화면 사용 추적기 — onUsageSegments 가 있을 때만 만든다. */
  const usageTrackerRef = useRef<UsageTracker | null>(null);
  /**
   * openPageTab 이 새로 만든 탭 ID — 그 탭의 첫 활성화를 OPEN 으로 센다. setTabs 업데이터 안에서 넣으므로
   * StrictMode 가 업데이터를 두 번 불러도 탭 ID 기준이라 OPEN 이 두 번 나오지 않는다(실제로 안 생긴 ID 는 effect 가 지운다).
   */
  const usageOpenTabIdsRef = useRef<Set<string>>(new Set());
  const onUsageSegmentsRef = useRef(onUsageSegments);
  onUsageSegmentsRef.current = onUsageSegments;
  const isUsageTrackingEnabled = onUsageSegments != null;
```

(5) `openPageTab` — `:477-478` 을 바꾼다.

```ts
        const tabId = createTabId(pageId);
        setActiveTabId(tabId);
```

다음과 같이 바꾼다.

```ts
        const tabId = createTabId(pageId);
        // 새 탭의 첫 활성화는 OPEN — 활성 탭 effect 가 소비한다.
        usageOpenTabIdsRef.current.add(tabId);
        setActiveTabId(tabId);
```

(6) `doLogout` — `:535-536` 을 바꾼다.

```ts
  const doLogout = useCallback(() => {
    writeSecureJson(storageKey, { tabs: [], activeTabId: null });
```

다음과 같이 바꾼다.

```ts
  const doLogout = useCallback(() => {
    // 화면 사용 구간을 맨 먼저 닫는다 — onUsageSegments 로 넘어가 호출부가 keepalive 로 보낸다(확인창 취소 때는 불리지 않는 위치).
    usageTrackerRef.current?.end();
    writeSecureJson(storageKey, { tabs: [], activeTabId: null });
```

(7) effect 두 개 — 기존 `// Dispatch tab activation event` effect(`:937-943`) 바로 뒤, `// Persist to storage` 앞에 넣는다. 추적기 effect 를 활성 탭 effect 보다 먼저 선언해야 같은 커밋에서 추적기가 먼저 생긴다.

```ts
  // 화면 사용 추적기 — onUsageSegments 가 있을 때만 만든다. document·window 를 넘겨 가림·pagehide·입력 리스너를 단다.
  useEffect(() => {
    if (!isUsageTrackingEnabled) return;
    const tracker = new UsageTracker({
      onSegments: (segments) => onUsageSegmentsRef.current?.(segments),
      doc: document,
      win: window,
    });
    usageTrackerRef.current = tracker;
    // prop 이 나중에 생긴 경우 지금 보고 있는 탭부터 잰다(첫 마운트에는 활성 탭이 없어 아무것도 안 한다).
    const current = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    tracker.activate(current && !current.isHome ? toUsagePageId(current.pageId) : null);
    return () => {
      if (usageTrackerRef.current === tracker) usageTrackerRef.current = null;
      tracker.dispose(); // 열린 구간을 넘기고 리스너·타이머를 뗀다
    };
  }, [isUsageTrackingEnabled]);

  // 활성 탭이 바뀌면 이전 구간을 닫고 새 구간을 연다. 활성 탭이 바뀌는 모든 경로가 activeTabId 로 모인다.
  useEffect(() => {
    const openIds = usageOpenTabIdsRef.current;
    const isNewTab = activeTabId != null && openIds.delete(activeTabId);
    // StrictMode 이중 업데이터가 남긴, 실제로 생기지 않은 탭 ID 는 지운다.
    for (const id of openIds) {
      if (!tabsRef.current.some((tab) => tab.id === id)) openIds.delete(id);
    }
    const tracker = usageTrackerRef.current;
    if (!tracker) return;
    const tab = activeTabId ? tabsRef.current.find((t) => t.id === activeTabId) : undefined;
    if (!tab || tab.isHome) {
      tracker.activate(null); // 홈·탭 없음 — 끝내기만
      return;
    }
    tracker.activate(toUsagePageId(tab.pageId), isNewTab ? "OPEN" : "SWITCH");
  }, [activeTabId]);
```

(8) `src/frontend/shared/src/portal-shell/index.ts` 맨 끝(`export * from "./tab-page-context";` 뒤)에 넣는다.

```ts
export * from "./usage-tracker";
export * from "./usage-sender";
```

- [ ] **Step 4: 테스트·전체 단위 테스트·타입 검사 통과 확인**

Run: `cd src/frontend/shared && pnpm exec vitest run tests/unit/portal-shell-usage.unit.test.ts`
Expected: PASS(6 tests)

Run: `pnpm --filter @dk-oasis/shared test:unit`
Expected: 전체 PASS(기존 portal-shell-tab-order·start-pages·menu-search·tab-error 포함 회귀 없음)

Run: `pnpm --filter @dk-oasis/shared lint`
Expected: 오류 0, exit 0

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/shared/src/portal-shell/portal-shell.tsx src/frontend/shared/src/portal-shell/index.ts src/frontend/shared/tests/unit/portal-shell-usage.unit.test.ts
/usr/bin/git commit -m "feat(shared): PortalShell 에 onUsageSegments 를 더해 활성 탭의 화면 사용 구간을 넘긴다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: m-mcm 포털 연결과 AUTH_ONLY 경로

**Files:**
- Modify: `src/frontend/m-mcm/app/portal/page.tsx`
  - import `:3-11`
  - 상수 `:28` 뒤
  - `PortalShellWithMessage` `:48-55`
  - JSX `:196-209`
- Modify: `src/frontend/m-mcm/proxy.ts:50` 뒤

**Interfaces:**
- Consumes (Task 2·3, `@dk-oasis/shared/portal-shell`): `createUsageSender(options: UsageSenderOptions): UsageSender`, `bindUsageSender(sender: UsageSender, targets?: UsageExitTargets): UsageExitBinding`, `type UsageExitBinding`, `type UsageSegment`, `PortalShellProps.onUsageSegments`
- Consumes (계약 C3): `POST /api/mcm/oasis/screenUsage/record`, body `{ meta: { userId, menuId: "PORTAL_SHELL" }, params: {}, grids: { segments: { rows } } }`. 권한은 AUTH_ONLY 이고, BE 의 `EndpointPermissionFilter.AUTH_ONLY_OBJ_ACTION_PREFIXES` `"screenusage/record"` 는 U2 가 맞춘다.
- Produces: 포털에서 구간이 실제로 전송된다. U4 의 브라우저 확인이 이것을 소비한다.

m-mcm 에는 단위 테스트 러너(vitest)와 `test` 스크립트가 없다. 그래서 이 Task 는 실패하는 테스트 대신 기준선 타입 검사 → 수정 → 같은 타입 검사로 검증한다. 동작 규칙(종료 때 keepalive, 리스너 순서와 무관)은 Task 2 의 `bindUsageSender` 테스트가 고정한다. `page.tsx` 는 연결만 한다.

- [ ] **Step 1: shared 빌드와 m-mcm 타입 검사 기준선**

m-mcm 은 `@dk-oasis/shared/portal-shell` 의 타입을 `dist/types` 에서 읽으므로 shared 를 먼저 빌드한다. 페이지 레지스트리(`generate:page-registry`)도 만들어 둔다.

Run: `pnpm --filter @dk-oasis/shared build`
Expected: exit 0, `src/frontend/shared/dist/types/portal-shell/usage-sender.d.ts` 생성

Run: `pnpm --filter @dk-oasis/mcm generate:page-registry`
Expected: exit 0

Run: `cd src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: 숫자 하나(기준선 N, 0 이 아니어도 된다). 이 값을 Step 4 에서 비교한다.

Run: `cd src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/portal/page.tsx|proxy.ts"`
Expected: 대개 출력 없음. 출력이 있으면 그 줄들이 기준선 M 이다(Step 4 에서 같은 줄만 남아야 한다).

Run: `cd src/frontend/m-mcm && pnpm exec tsc -p tsconfig.rbac-check.json`
Expected: exit 0(proxy.ts 기준선)

- [ ] **Step 2: proxy.ts AUTH_ONLY 경로 추가**

`src/frontend/m-mcm/proxy.ts` 의 `"/api/mcm/oasis/secStartPgm/toggle", // 탭 우클릭 기본 화면 등록/해제`(`:50`) 바로 뒤에 넣는다.

```ts
    // 화면 사용 구간 기록(포털 PortalShell) — 로그인한 모든 사용자. 서버가 인증 정보로 사용자·부서를 채운다.
    // BE EndpointPermissionFilter.AUTH_ONLY_OBJ_ACTION_PREFIXES 의 "screenusage/record" 와 동기화.
    "/api/mcm/oasis/screenUsage/record",
```

- [ ] **Step 3: page.tsx 에 sender 연결**

(1) import — `:3-11` 을 바꾼다.

```ts
import { useCallback, useEffect } from "react";
import {
  type FavoriteFolderChoice,
  PortalShell,
  resolvePortalHomePageId,
  usePortalFavorites,
  usePortalMenu,
  usePortalStartPages,
} from "@dk-oasis/shared/portal-shell";
```

다음과 같이 바꾼다.

```ts
import { useCallback, useEffect, useRef } from "react";
import {
  bindUsageSender,
  createUsageSender,
  type FavoriteFolderChoice,
  PortalShell,
  resolvePortalHomePageId,
  type UsageExitBinding,
  type UsageSegment,
  usePortalFavorites,
  usePortalMenu,
  usePortalStartPages,
} from "@dk-oasis/shared/portal-shell";
```

(2) 상수와 훅 — `const START_PAGE_TOGGLE_ENDPOINT = "/api/mcm/oasis/secStartPgm/toggle";`(`:28`) 바로 뒤에 상수를 넣는다.

```ts
// 화면 사용 구간 기록 — 로그인 사용자 전원(AUTH_ONLY, proxy.ts 와 BE EndpointPermissionFilter 동기화).
const SCREEN_USAGE_ENDPOINT = "/api/mcm/oasis/screenUsage/record";
```

`const DEFAULT_HOME_PAGE_ID = resolvePortalHomePageId(MODULE_ID, "home");`(`:31`) 바로 뒤에 훅을 넣는다.

```ts
/**
 * 화면 사용 구간 전송기를 포털 수명에 묶는다.
 * - meta.userId 는 /api/auth/me 를 한 번만 불러 캐시한다(서버는 인증 정보로 채우므로 참고용). 전송은 그 응답을 기다리지 않는다.
 * - 언마운트 때 남은 구간을 keepalive 로 보내고 주기 전송을 멈춘다. binding 은 비우지 않아
 *   PortalShell 언마운트가 뒤늦게 넘기는 마지막 구간도 받는 즉시 keepalive 로 보낸다.
 * - 오류는 sender 가 console.warn 으로만 남긴다(화면을 막지 않는다).
 */
function usePortalUsageReporter() {
  const bindingRef = useRef<UsageExitBinding | null>(null);

  useEffect(() => {
    // userId 는 받아 둔 값만 쓴다 — buildMeta 가 /api/auth/me 를 기다리면 pagehide·로그아웃 keepalive 전송이
    // 페이지가 내려간 뒤로 밀려 사라진다. 서버는 이 값을 무시하므로 아직 없으면 빈 값으로 보낸다.
    let cachedUserId = "";
    let loading: Promise<void> | null = null;
    const refreshUserId = () => {
      if (cachedUserId || loading) return;
      loading = fetch("/api/auth/me", { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((me: { user?: { id?: string | null } | null } | null) => {
          cachedUserId = me?.user?.id ?? "";
        })
        .catch(() => {})
        .finally(() => {
          loading = null;
        });
    };
    refreshUserId(); // 첫 전송 전에 미리 받아 둔다(성공하면 다시 부르지 않는다)

    const sender = createUsageSender({
      endpoint: SCREEN_USAGE_ENDPOINT,
      buildMeta: async () => {
        refreshUserId(); // 아직 없으면 다음 전송을 위해 다시 묻기만 하고 기다리지 않는다
        return { userId: cachedUserId, menuId: "PORTAL_SHELL" };
      },
    });
    const binding = bindUsageSender(sender, { doc: document, win: window });
    bindingRef.current = binding;
    return () => {
      binding.closeAndFlush();
      binding.dispose();
      sender.dispose();
    };
  }, []);

  const onUsageSegments = useCallback((segments: UsageSegment[]) => {
    bindingRef.current?.onSegments(segments);
  }, []);
  const flushUsageForLogout = useCallback(() => {
    bindingRef.current?.closeAndFlush();
  }, []);
  return { onUsageSegments, flushUsageForLogout };
}
```

(3) `PortalShellWithMessage` 로그아웃 — `:48-55` 를 바꾼다.

```ts
  const gfn_message = useGfnMessage();

  const handleBeforeLogout = useCallback(
    (doLogout: () => void) => {
      gfn_message("로그아웃 하시겠습니까?", "", "", "confirm", "로그아웃", doLogout);
    },
    [gfn_message]
  );
```

다음과 같이 바꾼다.

```ts
  const gfn_message = useGfnMessage();
  const { onUsageSegments, flushUsageForLogout } = usePortalUsageReporter();

  const handleBeforeLogout = useCallback(
    (doLogout: () => void) => {
      gfn_message("로그아웃 하시겠습니까?", "", "", "confirm", "로그아웃", () => {
        doLogout(); // PortalShell 이 맨 앞에서 열린 구간을 닫아 onUsageSegments 로 넘긴다
        flushUsageForLogout(); // 남은 큐를 keepalive 로 보낸다(signOut 이동 중에도 전송 유지)
      });
    },
    [gfn_message, flushUsageForLogout]
  );
```

(4) JSX — `onToggleStartPage={handleToggleStartPage}`(`:208`) 바로 뒤에 넣는다.

```tsx
      onUsageSegments={onUsageSegments}
```

- [ ] **Step 4: 타입 검사·린트 통과 확인**

Run: `cd src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: Step 1 기준선 N 과 같다.

Run: `cd src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/portal/page.tsx|proxy.ts"`
Expected: Step 1 의 기준선 M 과 같다(대개 출력 없음, exit 1). 새 줄이 생기면 이 Task 의 수정이 원인이다.

Run: `cd src/frontend/m-mcm && pnpm exec tsc -p tsconfig.rbac-check.json`
Expected: exit 0

Run: `cd src/frontend/m-mcm && pnpm exec eslint app/portal/page.tsx proxy.ts`
Expected: 오류 0

Run: `pnpm --filter @dk-oasis/shared test:unit`
Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/m-mcm/app/portal/page.tsx src/frontend/m-mcm/proxy.ts
/usr/bin/git commit -m "feat(m-mcm): 포털에서 화면 사용 구간을 screenUsage/record 로 보낸다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

브라우저에서 실제 저장을 확인하는 단계는 총괄 계획 Task U4 Step 4 가 맡는다. 이 단계는 U2 백엔드가 있어야 하고, 일반 사용자 403 여부도 그때 함께 본다.
