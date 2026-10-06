# 포털 탭 새 창 분리 · 중복 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포털 탭 우클릭에 「새 창으로 분리」와 「새 탭으로 하나 더 열기」를 더해, 같은 화면 두 개를 동시에 띄워 비교할 수 있게 한다.

**Architecture:** 분리 창은 포털 셸이 아니라 화면 하나만 그리는 새 공통 부품 `PortalPageWindow` 가 `/popup/{moduleId}/{pageName}?h={token}` 에서 그린다. snapshot 은 localStorage token 키로 한 번 넘기고 새 창 sessionStorage 에 보관한다. 중복 탭은 `usePortalTabs.duplicateTab` 으로 만들고, 제목 번호는 표시 때 계산하며, 히스토리 state 에 탭 id 를 싣는다.

**Tech Stack:** React 19, Next.js(App Router, m-mcm), Mantine 9, vitest(happy-dom/jsdom), pnpm 워크스페이스.

**Spec:** `docs/superpowers/specs/2026-10-06-portal-tab-popout-design.md` (승인 2026-10-06, §8 항목 1~7 기본안)

## Global Constraints

- 공개 부품(`PortalShell`)에 더하는 prop 은 모두 선택이다. 미지정이면 DOM·동작이 지금과 같아야 한다(m-design-dummy 는 prop 을 넘기지 않는다).
- `window.open` 은 클릭 처리기에서 동기로 부른다. 앞에 await 를 두지 않는다. features 에 `noopener` 를 넣지 않는다.
- 셸(`portal-shell.tsx`)에서 `useGfnMessage` 를 쓰지 않는다. 차단 안내는 `popout.onBlocked` 콜백이 한다.
- 저장 키: 탭 `oasis.portal.tabs.v1`(변경 없음), handoff `oasis.portal.popout.{token}`(localStorage, writeSecureJson), 분리 창 snapshot `oasis.portal.popoutSnap.{token}`(sessionStorage, 평문 JSON). handoff TTL 10분.
- 기존 셸 시험(`portal-shell-characterization`·`portal-shell-tab-order`·`use-tab-history`·`portal-shell-usage` 등)은 고치지 않고 그대로 통과해야 한다.
- 시험 실행: shared 는 `cd src/frontend/shared && npx vitest run tests/unit/<파일>`, m-mcm 은 `cd src/frontend/m-mcm && npx vitest run tests/popup`. vitest workers 2(`--maxWorkers=2`). 도커 금지.
- git 은 `/usr/bin/git`. `pnpm install`·`ln`·메인 체크아웃(`/Users/jji/project/dmes-standard`)의 node_modules·dist 접촉 금지. 의존성은 Task 0 의 deps.sh 로만 설치한다.
- 다른 모듈 화면(m-mdm·m-mls 등 pages) 수정 금지. 백엔드·DB 변경 금지. proxy.ts 수정 금지.
- 코드 주석·커밋 메시지는 리포 관례(한국어 주석, `type(scope): 제목`, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## Review Focus

- 같은 화면 탭이 셋 이상일 때 하나를 닫으면 남은 탭 번호가 표시 순서대로 다시 매겨진다("(3)" 이 "(2)" 로). → Task 1 시험.
- 분리 창 URL 을 다른 사람이 받거나 handoff 가 만료된 뒤 열면(토큰 키 없음) 빈 snapshot 으로 정상 표시된다. → Task 4 시험.
- 분리 창에서 F5 를 누르면 handoff 는 이미 지워졌지만 sessionStorage 의 snapshot 으로 같은 상태가 다시 뜬다. → Task 4 시험.
- 팝업 차단 시 원래 탭과 그 snapshot 이 그대로 남고, handoff 키가 localStorage 에 남지 않는다. → Task 3·5 시험.
- 옛 히스토리 기록(`portalTabId` 없음)에서 뒤로가기하면 지금처럼 pageId 로 탭을 찾는다. → Task 1 시험.

---

### Task 0: 워크트리 의존성 준비

**Files:** 없음(설치만)

- [ ] **Step 1: node_modules 가 심링크가 아닌지 확인**

Run: `ls -ld src/frontend/node_modules src/frontend/shared/node_modules src/frontend/m-mcm/node_modules` (워크트리 루트에서)
Expected: 없음 또는 실제 폴더. 메인 체크아웃을 가리키는 심링크면 멈추고 조정 세션에 알린다.

- [ ] **Step 2: deps.sh 실행 (워크트리 루트)**

Run: `bash .claude/skills/dflow-dev/scripts/deps.sh`
Expected: `src/frontend` 줄이 성공(DEPS_OK 류)으로 끝난다. 실패하면 출력 그대로 조정 세션에 보고한다.

- [ ] **Step 3: 형제 패키지 빌드(m-mcm tsc 용)**

shared 는 `cd src/frontend/shared && npx tsup` 한 번. m-mcm tsc 에 필요한 형제 패키지(m-analog·m-mdm·m-mls·m-mpn·m-mpp·m-mqc) 중 dist 가 없는 폴더에서 `npx tsup` 을 한 번씩 돌린다(메모: 새 워크트리는 dist 가 없어 tsc 오류 21개).

- [ ] **Step 4: 기준 시험**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-shell-characterization.unit.test.ts tests/unit/portal-shell-tab-order.unit.test.ts tests/unit/use-tab-history.unit.test.ts tests/unit/portal-shell-usage.unit.test.ts`
Expected: 모두 PASS. 실패하면 기준 실패로 기록하고 이후 비교 기준으로 쓴다.

---

### Task 1: 중복 탭 순수 함수 + 히스토리 탭 id

**Files:**
- Create: `src/frontend/shared/src/portal-shell/tab-duplicates.ts`
- Modify: `src/frontend/shared/src/portal-shell/use-tab-history.ts` (PortalHistoryState, resolveTargetTabId, pushTabEntry, pushTabHistory, navigateToTab, popstate, baseline)
- Test: `src/frontend/shared/tests/unit/tab-duplicates.unit.test.ts`(신규), `src/frontend/shared/tests/unit/use-tab-history.unit.test.ts`(케이스 추가)

**Interfaces:**
- Produces:
  - `numberDuplicateTitles<T extends { id: string; pageId: string; title: string; isHome: boolean }>(tabs: T[]): T[]` — 같은 pageId(홈 제외)가 둘 이상이면 표시 순서대로 2번째부터 `"{title} (n)"`. 중복이 없으면 **입력 배열을 그대로** 돌려준다(참조 유지).
  - `pickTabForPage<T extends { id: string; pageId: string }>(orderedTabs: T[], pageId: string, activeTabId: string | null): T | undefined` — 활성 탭이 그 pageId 면 활성 탭, 아니면 orderedTabs 순서상 첫 탭.
  - `resolveTargetTabId(tabs, targetPageId: string, targetTabId?: string): string | null` — targetTabId 가 열린 탭이면 그것, 아니면 pageId 첫 탭(옛 동작).
  - `pushTabHistory(pageId: string, tabId?: string): void` — tabId 가 있으면 "활성 탭 id 와 같을 때만" 생략, 없으면 옛 규칙(활성 pageId 같으면 생략).
  - history state 필드 `portalTabId?: string`.

- [ ] **Step 1: 실패하는 시험 작성** — `tab-duplicates.unit.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { numberDuplicateTitles, pickTabForPage } from "../../src/portal-shell/tab-duplicates";

const t = (id: string, pageId: string, title = pageId, isHome = false) => ({ id, pageId, title, isHome });

describe("numberDuplicateTitles", () => {
  it("중복이 없으면 같은 배열을 돌려준다", () => {
    const tabs = [t("h", "x:home", "홈", true), t("a", "x:a", "A")];
    expect(numberDuplicateTitles(tabs)).toBe(tabs);
  });
  it("같은 pageId 는 표시 순서대로 (2)(3) 이 붙고 첫 탭은 그대로다", () => {
    const out = numberDuplicateTitles([t("a1", "x:a", "A"), t("b", "x:b", "B"), t("a2", "x:a", "A"), t("a3", "x:a", "A")]);
    expect(out.map((x) => x.title)).toEqual(["A", "B", "A (2)", "A (3)"]);
  });
  it("가운데 탭이 닫히면 번호를 다시 매긴다", () => {
    const out = numberDuplicateTitles([t("a1", "x:a", "A"), t("a3", "x:a", "A")]);
    expect(out.map((x) => x.title)).toEqual(["A", "A (2)"]);
  });
  it("홈 탭은 세지 않는다", () => {
    const tabs = [t("h", "x:a", "홈", true), t("a1", "x:a", "A")];
    expect(numberDuplicateTitles(tabs)).toBe(tabs);
  });
});

describe("pickTabForPage", () => {
  const tabs = [t("a1", "x:a"), t("b", "x:b"), t("a2", "x:a")];
  it("활성 탭이 그 화면이면 활성 탭", () => expect(pickTabForPage(tabs, "x:a", "a2")?.id).toBe("a2"));
  it("아니면 순서상 첫 탭", () => expect(pickTabForPage(tabs, "x:a", "b")?.id).toBe("a1"));
  it("없으면 undefined", () => expect(pickTabForPage(tabs, "x:z", null)).toBeUndefined());
});
```

`use-tab-history.unit.test.ts` 에 추가(기존 파일의 렌더 도우미·popstate 발생 방식을 그대로 따른다. 파일을 먼저 읽고 같은 패턴으로 쓴다):
- `resolveTargetTabId([{id:"a1",pageId:"x:a",isHome:false},{id:"a2",pageId:"x:a",isHome:false}], "x:a", "a2")` → `"a2"`.
- `resolveTargetTabId(같은 tabs, "x:a", "gone")` → `"a1"`(닫힌 탭 id 면 pageId 대체).
- `resolveTargetTabId(같은 tabs, "x:a")` → `"a1"`(옛 기록).
- 훅 시험: 활성 탭 a1(x:a) 상태에서 `navigateToTab("a2","x:a")` 를 부르면 `history.state.portalTabId === "a2"` 이고 pushState 가 한 번 불린다(옛 동작은 생략했다).

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/tab-duplicates.unit.test.ts tests/unit/use-tab-history.unit.test.ts`
Expected: tab-duplicates 는 모듈 없음으로 FAIL, 새 history 케이스 FAIL.

- [ ] **Step 3: 구현**

`tab-duplicates.ts`:

```ts
/*
 * 같은 화면(pageId) 탭 여러 개 — 제목 번호와 "이 화면을 열면 어느 탭으로 가나" 판정. 셸 전용 순수 함수.
 * 번호는 표시할 때만 붙인다. 저장 제목에 넣으면 제목 동기화 effect 가 메뉴 표시명으로 덮어쓴다.
 */
interface DuplicateTabLike { id: string; pageId: string; title: string; isHome: boolean }

export function numberDuplicateTitles<T extends DuplicateTabLike>(tabs: T[]): T[] {
  const counts = new Map<string, number>();
  for (const tab of tabs) if (!tab.isHome) counts.set(tab.pageId, (counts.get(tab.pageId) ?? 0) + 1);
  if (![...counts.values()].some((n) => n > 1)) return tabs;
  const seen = new Map<string, number>();
  return tabs.map((tab) => {
    if (tab.isHome || (counts.get(tab.pageId) ?? 0) < 2) return tab;
    const n = (seen.get(tab.pageId) ?? 0) + 1;
    seen.set(tab.pageId, n);
    return n === 1 ? tab : { ...tab, title: `${tab.title} (${n})` };
  });
}

export function pickTabForPage<T extends { id: string; pageId: string }>(
  orderedTabs: T[],
  pageId: string,
  activeTabId: string | null
): T | undefined {
  const active = activeTabId ? orderedTabs.find((tab) => tab.id === activeTabId) : undefined;
  if (active && active.pageId === pageId) return active;
  return orderedTabs.find((tab) => tab.pageId === pageId);
}
```

`use-tab-history.ts` 변경:
- `PortalHistoryState` 에 `/** 활성 탭 id — 같은 화면 탭이 여럿일 때 구분한다(없으면 portalTab 으로 찾는다). */ portalTabId?: string;`
- `resolveTargetTabId(tabs, targetPageId, targetTabId?)`: `if (targetTabId && tabs.some((t) => t.id === targetTabId)) return targetTabId;` 뒤에 옛 pageId 탐색.
- `pushTabEntry(pageId, tabId?)`: state 에 `portalTabId: tabId` 를 함께 쓴다.
- `pushTabHistory(pageId, tabId?)`: 생략 조건을 `tabId != null ? activeTabRef.current?.id === tabId : activeTabRef.current?.pageId === pageId` 로.
- `navigateToTab(tabId, pageId)`: `pushTabHistory(pageId, tabId)`.
- popstate: `resolveTargetTabId(tabsRef.current, targetPageId, st.portalTabId)`.
- baseline: replace/push 에 `portalTabId: activeTab?.id` 를 함께 싣는다(deps 에 `activeTab?.id` 추가).
- `UseTabHistoryResult.pushTabHistory` 타입 `(pageId: string, tabId?: string) => void`.

- [ ] **Step 4: 통과 확인 + 기존 시험**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/tab-duplicates.unit.test.ts tests/unit/use-tab-history.unit.test.ts tests/unit/portal-shell-characterization.unit.test.ts`
Expected: 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/shared/src/portal-shell/tab-duplicates.ts src/frontend/shared/src/portal-shell/use-tab-history.ts src/frontend/shared/tests/unit/tab-duplicates.unit.test.ts src/frontend/shared/tests/unit/use-tab-history.unit.test.ts
/usr/bin/git commit -m "feat(portal-shell): 같은 화면 탭 번호 계산과 히스토리 탭 id 를 더한다"
```

---

### Task 2: usePortalTabs — duplicateTab · 같은 화면 열기 규칙

**Files:**
- Modify: `src/frontend/shared/src/portal-shell/use-portal-tabs.ts` (openPageTab, 새 duplicateTab, return)
- Test: `src/frontend/shared/tests/unit/portal-shell-duplicate-tab.unit.test.ts`(신규, `portal-shell-tab-order.unit.test.ts` 의 저장소 대체·fetch stub·`flush`·`openTab` 도우미를 그대로 복사해 쓴다)

**Interfaces:**
- Consumes: `pickTabForPage`, `pushTabHistory(pageId, tabId?)` (Task 1)
- Produces: 훅 반환에 `duplicateTab: (tabId: string) => void`. 셸 Task 5 가 TabsBar 에 넘긴다.

셸 연결(TabsBar 메뉴)은 Task 5 몫이다. 이 Task 는 훅을 직접 시험한다 — 작은 시험 부품으로 `usePortalTabs` 를 감싸 반환값을 바깥 변수에 담는다(파라미터는 `menuLeaves: []`, `menuSearchItemByPageId: new Map()`, `isStartPagesLoaded: true`, `resolvePage: async () => Page`, `resolveDisplayText: (id, f) => f` 를 useCallback 없이 모듈 상수로, `rememberRecentMenuPage: () => {}`, `loggingOutRef: { current: false }`, `storageKey` 무작위, `resolvedHomePageId: "t:home"`, `homeTabId: "home:t:home"`).

- [ ] **Step 1: 실패하는 시험 작성**

케이스:
1. `t:a` 를 열고 `t:b` 를 연 뒤 a 탭에서 `duplicateTab(aId)` → `orderedTabs` 의 pageId 순서 `["t:home","t:a","t:a","t:b"]`, 활성 탭은 새 탭, 새 탭 id ≠ aId.
2. a 탭 snapshot 을 `onTabSnapshotChange(aId, { q: 1 })` 로 바꾼 뒤 duplicateTab → 새 탭 snapshot 이 `{ q: 1 }` 이고 원본과 다른 객체(`not.toBe`).
3. 중복 두 개(a1, a2)에서 a2 가 활성일 때 `portal-open-tab` 으로 `t:a` → 활성 a2 유지. b 가 활성일 때 → 순서상 첫 a1.
4. 저장·복원: 중복 두 개를 만든 뒤 언마운트, 같은 storageKey 로 다시 마운트 → 같은 두 탭 id 가 복원된다.
5. 홈 탭에 duplicateTab → 아무 변화 없음.

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-shell-duplicate-tab.unit.test.ts`
Expected: `duplicateTab is not a function` 등으로 FAIL.

- [ ] **Step 3: 구현**

`openPageTab` 을 다음처럼 바꾼다(나머지 줄·주석은 유지):

```ts
      const createdId = createTabId(pageId); // 업데이터 밖에서 만든다(StrictMode 두 번 호출에도 같은 ID)
      const order = tabOrderRef.current;
      const byOrder = (list: PortalShellTabState[]) => [
        ...list.filter((tab) => tab.isHome),
        ...order.map((id) => list.find((tab) => tab.id === id)).filter((tab): tab is PortalShellTabState => !!tab),
        ...list.filter((tab) => !tab.isHome && !order.includes(tab.id)),
      ];
      const expected = pickTabForPage(byOrder(tabsRef.current), pageId, activeTabIdRef.current);
      setTabs((prev) => {
        // 같은 화면 탭이 여럿이면 보고 있는 탭이 그 화면일 때 머물고, 아니면 표시 순서상 첫 탭으로 간다.
        const existing = pickTabForPage(byOrder(prev), pageId, activeTabIdRef.current);
        const displayText = resolveDisplayText(pageId, existing?.title ?? pageId);
        if (existing) { /* 기존과 같음 */ }
        const tabId = createdId;
        /* 이하 기존과 같음 */
      });
      pushTabHistory(pageId, expected?.id ?? createdId);
```

`duplicateTab` 추가(`closeTab` 아래):

```ts
  /** 탭 우클릭 '새 탭으로 하나 더 열기' — 같은 화면을 원래 탭 바로 오른쪽에 하나 더 열고 snapshot 을 복사한다. 홈은 안 한다. */
  const duplicateTab = useCallback(
    (tabId: string) => {
      const source = tabsRef.current.find((tab) => tab.id === tabId);
      if (!source || source.isHome) return;
      const createdId = createTabId(source.pageId);
      newTabAnchorRef.current.set(createdId, tabId);
      const created: PortalShellTabState = {
        id: createdId,
        title: source.title,
        pageId: source.pageId,
        isHome: false,
        snapshot: cloneSnapshot(source.snapshot),
        component: null,
        isLoading: true,
        errorMessage: null,
      };
      setTabs((prev) => (prev.some((tab) => tab.id === createdId) ? prev : [...prev, created]));
      pushTabHistory(source.pageId, createdId);
      setActiveTabId(createdId);
    },
    [pushTabHistory]
  );
```

반환 객체에 `duplicateTab` 을 더한다. import 에 `pickTabForPage` 추가.

- [ ] **Step 4: 통과 확인 + 회귀**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-shell-duplicate-tab.unit.test.ts tests/unit/portal-shell-tab-order.unit.test.ts tests/unit/portal-shell-characterization.unit.test.ts tests/unit/use-portal-tabs-same-value.unit.test.ts tests/unit/use-tab-history.unit.test.ts tests/unit/portal-shell-start-pages.unit.test.ts`
Expected: 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/shared/src/portal-shell/use-portal-tabs.ts src/frontend/shared/tests/unit/portal-shell-duplicate-tab.unit.test.ts
/usr/bin/git commit -m "feat(portal-shell): 같은 화면 탭을 하나 더 여는 duplicateTab 을 더한다"
```

---

### Task 3: 분리 창 열기·handoff 모듈 `popout.ts`

**Files:**
- Create: `src/frontend/shared/src/portal-shell/popout.ts`
- Test: `src/frontend/shared/tests/unit/portal-popout.unit.test.ts`(신규, `/** @vitest-environment happy-dom */`, 저장소 대체 도우미는 tab-order 시험에서 복사)

**Interfaces:**
- Produces:

```ts
export const POPOUT_HANDOFF_PREFIX = "oasis.portal.popout.";
export const POPOUT_SNAPSHOT_PREFIX = "oasis.portal.popoutSnap.";
export const POPOUT_HANDOFF_TTL_MS = 10 * 60 * 1000;
export interface PortalPopoutHandoff { pageId: string; snapshot: unknown; createdAt: number }
export interface OpenPagePopoutArgs {
  pageId: string;
  snapshot: unknown;
  buildUrl: (pageId: string, token: string) => string;
  win?: Pick<Window, "open" | "outerWidth" | "outerHeight" | "screenX" | "screenY">;
  now?: () => number;
  createToken?: () => string;
}
export function openPagePopout(args: OpenPagePopoutArgs): Window | null;
export function takePopoutHandoff(token: string, now?: () => number): PortalPopoutHandoff | null;
export function readPopoutSnapshot(token: string): { found: boolean; snapshot: unknown };
export function writePopoutSnapshot(token: string, snapshot: unknown): void;
```

- [ ] **Step 1: 실패하는 시험 작성**

케이스:
모든 케이스에서 `createToken: () => "tok"`, `now: () => 고정값`, `win: { open: vi.fn(...), outerWidth: 1200, outerHeight: 800, screenX: 0, screenY: 0 }` 을 주입한다.
1. 성공: `win.open` 이 가짜 창 객체를 돌려주면 그 객체를 돌려주고, `readSecureJson("oasis.portal.popout.tok")` 가 `{ pageId, snapshot, createdAt }` 이며, open 인자가 `(buildUrl(pageId,"tok"), "dmes-popout-tok", features)` 이고 features 에 `popup` 이 있고 `noopener` 가 없다.
2. 차단: `win.open` 이 null → null 반환, handoff 키 없음.
3. 정리: createdAt 이 11분 전인 `oasis.portal.popout.old` 와 1분 전인 `oasis.portal.popout.new` 를 미리 써 두고 열기 → old 는 지워지고 new 는 남는다. 다른 접두 키(`oasis.portal.tabs.v1`)는 그대로.
4. `takePopoutHandoff("tok")` 는 처음엔 값, 두 번째엔 null. 만료(10분 초과) handoff 는 null 이고 지운다.
5. `writePopoutSnapshot("tok", {q:1})` 뒤 `readPopoutSnapshot("tok")` → `{found:true, snapshot:{q:1}}`. 없는 토큰 → `{found:false, snapshot:null}`. 깨진 JSON → `{found:false, ...}`.

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-popout.unit.test.ts`
Expected: 모듈 없음 FAIL.

- [ ] **Step 3: 구현**

```ts
import { readSecureJson, removeSecureValue, writeSecureJson } from "../secure-storage";

/*
 * 포털 탭 → 단독 창 분리(설계 2026-10-06-portal-tab-popout §5.3). 셸과 PortalPageWindow 가 같이 쓴다.
 * snapshot 은 token 키로 localStorage 에 한 번 써 두고 새 창이 읽은 뒤 지운다. 새 창은 그 값을 자기 sessionStorage 에 둔다.
 * window.open 은 클릭 처리기 안에서 동기로 불러야 팝업 차단을 피한다 — 이 함수 안에 await 를 넣지 않는다.
 * noopener 를 넣지 않는다: 넣으면 반환값이 늘 null 이라 차단과 구분할 수 없다.
 */

export const POPOUT_HANDOFF_PREFIX = "oasis.portal.popout.";
export const POPOUT_SNAPSHOT_PREFIX = "oasis.portal.popoutSnap.";
export const POPOUT_HANDOFF_TTL_MS = 10 * 60 * 1000;

function sweepExpiredHandoffs(now: number): void {
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(POPOUT_HANDOFF_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    const value = readSecureJson<PortalPopoutHandoff>(key);
    if (!value || typeof value.createdAt !== "number" || now - value.createdAt > POPOUT_HANDOFF_TTL_MS) {
      removeSecureValue(key);
    }
  }
}

export function openPagePopout({ pageId, snapshot, buildUrl, win = window, now = Date.now, createToken = () => crypto.randomUUID() }: OpenPagePopoutArgs): Window | null {
  const at = now();
  sweepExpiredHandoffs(at);
  const token = createToken();
  const key = `${POPOUT_HANDOFF_PREFIX}${token}`;
  writeSecureJson<PortalPopoutHandoff>(key, { pageId, snapshot, createdAt: at });
  const width = Math.max(640, Math.round(win.outerWidth || 1280));
  const height = Math.max(480, Math.round(win.outerHeight || 800));
  const features = `popup,width=${width},height=${height},left=${Math.round((win.screenX || 0) + 40)},top=${Math.round((win.screenY || 0) + 40)}`;
  const opened = win.open(buildUrl(pageId, token), `dmes-popout-${token}`, features);
  if (!opened) {
    removeSecureValue(key);
    return null;
  }
  return opened;
}

export function takePopoutHandoff(token: string, now: () => number = Date.now): PortalPopoutHandoff | null {
  const key = `${POPOUT_HANDOFF_PREFIX}${token}`;
  const value = readSecureJson<PortalPopoutHandoff>(key);
  removeSecureValue(key);
  if (!value || typeof value.createdAt !== "number" || now() - value.createdAt > POPOUT_HANDOFF_TTL_MS) return null;
  return value;
}

export function readPopoutSnapshot(token: string): { found: boolean; snapshot: unknown } {
  try {
    const raw = sessionStorage.getItem(`${POPOUT_SNAPSHOT_PREFIX}${token}`);
    if (raw == null) return { found: false, snapshot: null };
    return { found: true, snapshot: JSON.parse(raw) as unknown };
  } catch {
    return { found: false, snapshot: null };
  }
}

export function writePopoutSnapshot(token: string, snapshot: unknown): void {
  try {
    sessionStorage.setItem(`${POPOUT_SNAPSHOT_PREFIX}${token}`, JSON.stringify(snapshot ?? null));
  } catch {
    /* 저장소를 못 쓰면 새로고침 때 상태만 잃는다 */
  }
}
```

(`removeSecureValue(key)` 는 shared/src/secure-storage/index.ts 에 이미 있다.)

- [ ] **Step 4: 통과 확인**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-popout.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/shared/src/portal-shell/popout.ts src/frontend/shared/tests/unit/portal-popout.unit.test.ts
/usr/bin/git commit -m "feat(portal-shell): 탭 분리 창 열기와 snapshot handoff 모듈을 더한다"
```

---

### Task 4: serviceId 순수 함수 추출 + 단독 창 호스트 `PortalPageWindow`

**Files:**
- Create: `src/frontend/shared/src/portal-shell/service-id.ts`
- Create: `src/frontend/shared/src/portal-shell/page-window/PortalPageWindow.tsx`
- Modify: `src/frontend/shared/src/portal-shell/portal-shell.tsx` (serviceIdByPageId useMemo 본문을 `buildServiceIdByPageId(menu.items)` 호출로)
- Modify: `src/frontend/shared/src/portal-shell/index.ts` (`export * from "./page-window/PortalPageWindow";`, `export * from "./popout";`)
- Test: `src/frontend/shared/tests/unit/portal-page-window.unit.test.ts`(신규), `src/frontend/shared/tests/unit/portal-shell-service-id.unit.test.ts`(신규)

**Interfaces:**
- Consumes: `takePopoutHandoff`, `readPopoutSnapshot`, `writePopoutSnapshot` (Task 3); `buildMenuSearchItems`·`getPortalMenuItemPageId`(menu-search.ts); `TabPageContext`; `MdmMetaProvider`, `mdmMetaTabProps`(`../mdm-meta/context`); `ErrorBoundary`(셸이 쓰는 것과 같은 import); `UsageTracker`, `toUsagePageId`(usage-tracker.ts); `installUsageActivity`(usage-activity.ts)
- Produces:

```ts
export function buildServiceIdByPageId(items: PortalShellMenuItem[]): Map<string, string>;

export interface PortalPageWindowProps {
  pageId: string;
  menu: PortalShellMenuResponse;
  resolvePage: PortalShellResolvePage;
  handoffToken?: string | null;
  appName?: string;
  onUsageSegments?: (segments: UsageSegment[], info: { reason: UsageEmitReason }) => void | Promise<void>;
  /** 시험용 — 기본 window.opener */
  opener?: Window | null;
}
export function PortalPageWindow(props: PortalPageWindowProps): ReactNode;
```

- [ ] **Step 1: 실패하는 시험 작성**

`portal-shell-service-id.unit.test.ts`: dir(d1) > page(p1), root 직계 page(p0), dir(d1) > folder... 아닌 dir(d2) > page(p2) 트리로 `buildServiceIdByPageId` 결과가 `{p0:"", p1:"d1", p2:"d2"}` 인지(셸 useMemo 의 옛 본문과 같은 규칙: page 의 serviceId 는 가장 가까운 상위 dir id).

`portal-page-window.unit.test.ts`(`/** @vitest-environment happy-dom */`, `renderWithMantine` 사용, fetch stub):
1. 메뉴에 없는 pageId → `resolvePage` 가 불리지 않고 "이 화면을 열 권한이 없습니다." 가 보인다.
2. 메뉴에 있는 pageId → 화면이 `useTabPage()` 로 읽은 값이 `{ pageId, serviceId: "d1", tabId: "popout-tok" }`.
3. handoff: `writeSecureJson("oasis.portal.popout.tok", {pageId, snapshot:{q:1}, createdAt: Date.now()})` 후 렌더 → 화면 props.snapshot 이 `{q:1}`, handoff 키는 지워지고 `sessionStorage["oasis.portal.popoutSnap.tok"]` 가 `{"q":1}`.
4. 새로고침 흉내: handoff 없이 sessionStorage 에 `{q:2}` 만 두고 렌더 → snapshot `{q:2}`.
5. handoff·sessionStorage 둘 다 없음 → snapshot `null` 로 정상 렌더.
6. 화면이 `onSnapshotChange({q:3})` → sessionStorage 갱신, 화면이 다시 받은 snapshot `{q:3}`.
7. `document.title` 이 `"{메뉴 표시명} - TEST"`.
8. 창 안에서 `window.dispatchEvent(new CustomEvent("portal-open-tab", {detail:{pageId:"x:b"}}))` → 가짜 opener(`{ closed:false, dispatchEvent: vi.fn(), focus: vi.fn() }`)의 dispatchEvent 가 type `portal-open-tab`, detail `{pageId:"x:b"}` 로 한 번 불리고 focus 가 불린다. opener 가 null 이면 오류 없음.

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-page-window.unit.test.ts tests/unit/portal-shell-service-id.unit.test.ts`
Expected: 모듈 없음 FAIL.

- [ ] **Step 3: 구현**

`service-id.ts` — 셸 `serviceIdByPageId` useMemo 안의 `walk` 를 그대로 옮긴다:

```ts
import { getPortalMenuItemPageId } from "./menu-search";
import type { PortalShellMenuItem } from "./types";

/**
 * pageId → serviceId. menu tree 에서 page 의 가장 가까운 상위 dir 메뉴 id(권한관리 endpoint `/api/{module}/{serviceId}/{objId}/{action}` 의 service segment).
 * root 직계 page 면 빈 문자열. 포털 셸과 단독 창(PortalPageWindow)이 같이 쓴다.
 */
export function buildServiceIdByPageId(items: PortalShellMenuItem[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(list: PortalShellMenuItem[], parentDirId: string) {
    for (const item of list) {
      if (item.type === "page") {
        const pageId = getPortalMenuItemPageId(item);
        if (pageId) map.set(pageId, parentDirId);
      }
      if (item.items.length > 0) walk(item.items, item.type === "dir" ? item.id : parentDirId);
    }
  }
  walk(items, "");
  return map;
}
```

셸: `const serviceIdByPageId = useMemo(() => buildServiceIdByPageId(menu.items), [menu]);` (기존 JSDoc 주석은 함수 쪽으로 옮겼으므로 한 줄 주석만 남긴다).

`PortalPageWindow.tsx` 골격:

```tsx
"use client";
/*
 * 포털 셸 없이 화면 하나를 탭 화면과 같은 조건(TabPageContext·MdmMetaProvider·ErrorBoundary)으로 그리는 단독 창 호스트.
 * 탭 「새 창으로 분리」 가 연 창(/popup/…)이 쓴다. 설계 2026-10-06-portal-tab-popout §5.4.
 * 포털 탭 저장소(oasis.portal.tabs.v1)를 읽거나 쓰지 않는다 — 두 창이 탭 목록을 서로 덮어쓰지 않게.
 */
export function PortalPageWindow({ pageId, menu, resolvePage, handoffToken, appName = "DMES", onUsageSegments, opener }: PortalPageWindowProps) {
  const token = handoffToken ?? null;
  const tabId = token ? `popout-${token}` : "popout";
  const menuItem = useMemo(() => buildMenuSearchItems(menu.items).find((item) => item.pageId === pageId) ?? null, [menu, pageId]);
  const serviceId = useMemo(() => buildServiceIdByPageId(menu.items).get(pageId) ?? "", [menu, pageId]);
  const allowed = menuItem != null;
  // 처음 snapshot: handoff(1회) > 이 창 sessionStorage > null. 마운트 때 한 번만 정한다.
  const [snapshot, setSnapshot] = useState<unknown>(() => {
    if (!token) return null;
    const handoff = takePopoutHandoff(token);
    if (handoff && handoff.pageId === pageId) {
      writePopoutSnapshot(token, handoff.snapshot);
      return handoff.snapshot;
    }
    const kept = readPopoutSnapshot(token);
    return kept.found ? kept.snapshot : null;
  });
  // 화면 불러오기(allowed 일 때만), document.title, portal-open-tab → opener 전달, 사용 통계 effect …
}
```

세부:
- `menuItem` 표시명: `buildMenuSearchItems` 가 돌려주는 `PortalMenuSearchItem.title` 을 쓴다. 시험 7 의 기대값도 메뉴 노드 `displayText` 가 들어간 `title` 이다.
- 화면 로딩: `useEffect` 에서 `allowed` 일 때 `resolvePage(pageId)` → 성공이면 `setComponent(() => comp)`, null/throw 면 셸과 같은 문구(`화면을 불러오지 못했습니다: ${pageId}` / `등록된 페이지를 찾을 수 없습니다: ${pageId}`). React 19 StrictMode 두 번 실행에 대비해 cancelled 플래그를 둔다.
- `useState` 초기화 함수가 StrictMode 에서 두 번 불리면 두 번째 호출은 handoff 가 이미 지워져 sessionStorage 값을 읽으므로 같은 값이 된다(시험 3 이 확인).
- `handleSnapshotChange = useCallback((next) => { if (token) writePopoutSnapshot(token, next); setSnapshot(next); }, [token])`.
- 렌더: `allowed` 가 아니면 `<div className="portal-shell__error">이 화면을 열 권한이 없습니다.</div>`. 맞으면 `<div className="portal-page-window" style={{ height: "100dvh", display: "flex", flexDirection: "column" }}><TabPageContext.Provider value={ctx}><MdmMetaProvider {...mdmMetaTabProps(pageId)}>{body}</MdmMetaProvider></TabPageContext.Provider></div>` — body 는 셸 TabPageSlot 과 같은 로딩·오류·ErrorBoundary 분기.
- 제목: `useEffect(() => { if (menuItem) document.title = \`${표시명} - ${appName}\`; }, [...])`.
- opener 전달: `useEffect` 로 `portal-open-tab` 리스너. `const target = opener !== undefined ? opener : window.opener;` `if (target && !target.closed) { target.dispatchEvent(new CustomEvent("portal-open-tab", { detail })); target.focus(); }` — opener 창의 CustomEvent 생성자를 쓰려면 `new (target as Window & typeof globalThis).CustomEvent(...)` 를 시도하고 없으면 현재 창 CustomEvent 를 쓴다.
- 사용 통계: `onUsageSegments` 가 있고 allowed 일 때 effect 에서 `new UsageTracker({ onSegments: (s) => onUsageSegmentsRef.current?.(s, { reason: "normal" }), doc: document, win: window })`, `installUsageActivity({ getScope: () => tabId, onBusinessCall: () => { if (activated) return; activated = true; tracker.activate({ key: tabId, pageId: toUsagePageId(pageId) }, "OPEN"); } })`, cleanup 에서 uninstall·`tracker.dispose()`. (UsageTracker 생성자 옵션 이름은 usage-tracker.ts 의 `UsageTrackerOptions` 그대로.)

index.ts 에 두 export 추가.

- [ ] **Step 4: 통과 확인 + 셸 회귀**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-page-window.unit.test.ts tests/unit/portal-shell-service-id.unit.test.ts tests/unit/portal-shell-characterization.unit.test.ts tests/unit/portal-shell-mdm-meta.unit.test.ts tests/unit/portal-shell-usage.unit.test.ts`
Expected: 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/shared/src/portal-shell/service-id.ts src/frontend/shared/src/portal-shell/page-window/PortalPageWindow.tsx src/frontend/shared/src/portal-shell/portal-shell.tsx src/frontend/shared/src/portal-shell/index.ts src/frontend/shared/tests/unit/portal-page-window.unit.test.ts src/frontend/shared/tests/unit/portal-shell-service-id.unit.test.ts
/usr/bin/git commit -m "feat(portal-shell): 화면 하나를 단독 창으로 그리는 PortalPageWindow 를 더한다"
```

---

### Task 5: 탭 우클릭 메뉴 + 셸 연결(popout·allowDuplicateTabs·로그아웃 정리·번호 표시)

**Files:**
- Modify: `src/frontend/shared/src/portal-shell/tabs-bar/TabsBar.tsx` (props 3개, contextActions 앞 두 항목)
- Modify: `src/frontend/shared/src/portal-shell/portal-shell.tsx` (props `popout`·`allowDuplicateTabs`, `handlePopoutTab`, `popoutWindowsRef`, doLogout, TabsBar 에 `numberedTabs`)
- Test: `src/frontend/shared/tests/unit/portal-shell-popout.unit.test.ts`(신규)

**Interfaces:**
- Consumes: `duplicateTab`(Task 2), `openPagePopout`(Task 3), `numberDuplicateTitles`(Task 1)
- Produces (공개 타입, `portal-shell.tsx` 에서 export):

```ts
export interface PortalShellPopout {
  /** 분리 창 URL. 호출부(m-mcm)가 라우트 규칙을 안다. */
  buildUrl: (pageId: string, token: string) => string;
  /** 팝업이 차단돼 창을 못 열었을 때 — 호출부가 안내한다(셸은 MessageProvider 를 요구하지 않는다). */
  onBlocked?: () => void;
}
// PortalShellProps 에 추가
popout?: PortalShellPopout;
allowDuplicateTabs?: boolean;
```

TabsBarProps 에 추가:

```ts
  /** 탭 우클릭 '새 창으로 분리'. 미지정 시 항목을 숨긴다. 홈 탭에는 보이지 않는다. */
  onPopoutTab?: (tabId: string) => void;
  /** '새 창으로 분리' 를 켤 화면인지(메뉴에 있는 화면만). 미지정 시 모두 허용. */
  canPopoutPage?: (pageId: string) => boolean;
  /** 탭 우클릭 '새 탭으로 하나 더 열기'. 미지정 시 항목을 숨긴다. 홈 탭에는 보이지 않는다. */
  onDuplicateTab?: (tabId: string) => void;
```

- [ ] **Step 1: 실패하는 시험 작성** — `portal-shell-popout.unit.test.ts`(tab-order 시험 도우미 복사, 메뉴는 `{items:[dir d1 > page t:a, page t:b]}` 처럼 t:a 가 메뉴에 있고 t:c 는 없게)

탭 우클릭은 `.tabs-scroll-area [data-tab-id]` 요소에 `contextmenu` 이벤트를 내고, 메뉴 항목은 `.tab-context-menu-item` 글자로 찾는다.

1. prop 없음 → t:a 우클릭 메뉴에 "새 창으로 분리"·"새 탭으로 하나 더 열기" 가 없다.
2. `allowDuplicateTabs` → "새 탭으로 하나 더 열기" 클릭 → 탭 제목 `["A", "A (2)"]`(표시명 A), 활성은 "A (2)".
3. `popout={{ buildUrl: (p,t)=>\`/popup/x?h=${t}\`, onBlocked }}` + `vi.spyOn(window, "open").mockReturnValue(fakeWin)` → "새 창으로 분리" 클릭 → t:a 탭 사라짐, `window.open` 1회, onBlocked 미호출.
4. 같은 설정에 `window.open` → null → 탭 남음, onBlocked 1회, localStorage 에 `oasis.portal.popout.` 키 없음.
5. 메뉴에 없는 t:c 탭 → "새 창으로 분리" 항목이 `is-disabled`.
6. 홈 탭 우클릭 → 두 항목 없음.
7. 로그아웃: 3번처럼 분리한 뒤 사용자 메뉴의 로그아웃을 실행(`onBeforeLogout` 를 `(go) => go()` 로 넘기고 셸 머리의 로그아웃 단추를 누른다 — characterization 시험이 로그아웃을 부르는 방법을 그대로 쓴다) → `fakeWin.close` 1회.

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-shell-popout.unit.test.ts`
Expected: 항목 없음으로 FAIL(1번은 PASS 가능).

- [ ] **Step 3: 구현**

TabsBar — `contextActions` 를 채우는 `if (contextTab)` 블록 맨 앞에(아이콘 import: `IconExternalLink`, `IconCopy` 를 `@tabler/icons-react` import 목록에 추가):

```tsx
    // 같은 화면 비교용(2026-10-06 사용자 요청) — 새 창 분리·하나 더 열기를 맨 앞에 둔다. 홈 탭은 닫을 수 없어 둘 다 숨긴다.
    if (!contextTab.isHome && onPopoutTab)
      contextActions.push({
        key: "popout",
        label: "새 창으로 분리",
        icon: IconExternalLink,
        disabled: !!canPopoutPage && !canPopoutPage(pageId),
        run: () => onPopoutTab(tabId),
      });
    if (!contextTab.isHome && onDuplicateTab)
      contextActions.push({
        key: "duplicate",
        label: "새 탭으로 하나 더 열기",
        icon: IconCopy,
        run: () => onDuplicateTab(tabId),
      });
```

(구조 분해 `{ id: tabId, pageId }` 바로 뒤. TabsBar 함수 인자 구조 분해에 세 prop 추가.)

portal-shell.tsx:
- props 구조 분해에 `popout`, `allowDuplicateTabs = false` 추가, 위 타입 export.
- `usePortalTabs` 반환에서 `duplicateTab` 받기.
- `const popoutRef = useRef(popout); popoutRef.current = popout;` `const popoutWindowsRef = useRef<Set<Window>>(new Set());`
- 핸들러:

```ts
  // 탭 우클릭 '새 창으로 분리' — 클릭 처리기에서 동기로 창을 연다(await 금지, 팝업 차단 판정). 열리면 탭을 닫고, 차단이면 탭을 두고 호출부가 안내한다.
  const handlePopoutTab = useCallback(
    (tabId: string) => {
      const current = popoutRef.current;
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!current || !tab || tab.isHome) return;
      const opened = openPagePopout({ pageId: tab.pageId, snapshot: tab.snapshot, buildUrl: current.buildUrl });
      if (!opened) {
        current.onBlocked?.();
        return;
      }
      popoutWindowsRef.current.add(opened);
      closeTab(tabId);
    },
    [closeTab, tabsRef]
  );
```

- doLogout 안 `writeSecureJson(storageKey, …)` 바로 앞:

```ts
    // 셸이 연 분리 창을 닫는다(공용 단말에 데이터가 띄워진 창이 남지 않게). 포털 새로고침 전 창은 참조가 없어 못 닫는다.
    for (const win of popoutWindowsRef.current) {
      try { win.close(); } catch { /* 이미 닫힘 */ }
    }
    popoutWindowsRef.current.clear();
```

- `const numberedTabs = useMemo(() => numberDuplicateTitles(orderedTabs), [orderedTabs]);` → `<TabsBar tabs={numberedTabs} …` 그리고 `onPopoutTab={popout ? handlePopoutTab : undefined}`, `canPopoutPage={canRegisterPage}`, `onDuplicateTab={allowDuplicateTabs ? duplicateTab : undefined}`.
  - 주의: `orderedTabs` 를 다른 곳(전체 화면 등)에서도 쓰면 그쪽은 그대로 둔다. TabsBar 에만 번호 붙인 목록을 넘긴다.

- [ ] **Step 4: 통과 확인 + 셸 회귀 전체**

Run: `cd src/frontend/shared && npx vitest run --maxWorkers=2 tests/unit/portal-shell-popout.unit.test.ts tests/unit/portal-shell-characterization.unit.test.ts tests/unit/portal-shell-tab-order.unit.test.ts tests/unit/portal-shell-tab-error.unit.test.ts tests/unit/portal-shell-start-pages.unit.test.ts tests/unit/portal-shell-usage.unit.test.ts tests/unit/tabs-bar-hover-style.unit.test.ts tests/unit/tabs-bar-visibility.unit.test.ts tests/unit/mantine-portal-shell.unit.test.ts tests/unit/widget-dock-portal.unit.test.ts`
Expected: 모두 PASS.

- [ ] **Step 5: shared 빌드·타입**

Run: `cd src/frontend/shared && npx tsc --noEmit -p .` 그리고 `npx tsup`
Expected: 오류 0. (dev watch 가 떠 있어 exit 144 면 실패가 아니다 — dist 에 `PortalPageWindow` 가 있는지 grep 으로 확인.)

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/frontend/shared/src/portal-shell/tabs-bar/TabsBar.tsx src/frontend/shared/src/portal-shell/portal-shell.tsx src/frontend/shared/tests/unit/portal-shell-popout.unit.test.ts
/usr/bin/git commit -m "feat(portal-shell): 탭 우클릭에 새 창 분리·하나 더 열기를 더한다"
```

---

### Task 6: m-mcm 팝업 라우트·포털 연결

**Files:**
- Create: `src/frontend/m-mcm/app/popup/popup-target.ts`
- Create: `src/frontend/m-mcm/app/popup/layout.tsx`
- Rewrite: `src/frontend/m-mcm/app/popup/[...slug]/page.tsx`
- Create: `src/frontend/m-mcm/app/portal/use-portal-usage-reporter.ts` (portal/page.tsx 의 `usePortalUsageReporter` 와 그 상수 `SCREEN_USAGE_ENDPOINT` 를 내용 그대로 옮기고 export)
- Modify: `src/frontend/m-mcm/app/portal/page.tsx` (훅 import 로 교체, PortalShell 에 `popout`·`allowDuplicateTabs`)
- Test: `src/frontend/m-mcm/tests/popup/popup-target.test.ts`

**Interfaces:**
- Consumes: `PortalPageWindow`, `PortalShellPopout`(Task 4·5), `parsePageId`(`@dk-oasis/shared/portal-shell-core`)
- Produces:

```ts
export function popupSlugToPageId(slug: string[]): string | null;
export function buildPopoutUrl(pageId: string, token: string): string;
```

- [ ] **Step 1: 실패하는 시험 작성** — `tests/popup/popup-target.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildPopoutUrl, popupSlugToPageId } from "@/app/popup/popup-target";

describe("popup-target", () => {
  it("첫 칸은 moduleId, 나머지는 pageName", () => {
    expect(popupSlugToPageId(["mdm", "dmc", "codeMng"])).toBe("mdm:dmc/codeMng");
  });
  it("인코딩된 칸을 푼다", () => {
    expect(popupSlugToPageId(["mcm", "csa", encodeURIComponent("commUserMng")])).toBe("mcm:csa/commUserMng");
  });
  it("칸이 모자라거나 잘못되면 null", () => {
    expect(popupSlugToPageId([])).toBeNull();
    expect(popupSlugToPageId(["mdm"])).toBeNull();
    expect(popupSlugToPageId(["mdm", ".."])).toBeNull();
    expect(popupSlugToPageId(["mdm", "a:b"])).toBeNull();
  });
  it("URL 을 만들고 다시 풀면 같은 pageId", () => {
    const url = buildPopoutUrl("mdm:dmc/codeMng", "tok-1");
    expect(url).toBe("/popup/mdm/dmc/codeMng?h=tok-1");
    const slug = url.split("?")[0].split("/").slice(2);
    expect(popupSlugToPageId(slug)).toBe("mdm:dmc/codeMng");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/m-mcm && npx vitest run --maxWorkers=2 tests/popup`
Expected: 모듈 없음 FAIL.

- [ ] **Step 3: 구현**

`popup-target.ts`:

```ts
import { parsePageId } from "@dk-oasis/shared/portal-shell-core";

/** 탭 분리 창 경로 규칙 — `/popup/{moduleId}/{pageName…}?h={token}` (설계 2026-10-06-portal-tab-popout §5.6). */
export function popupSlugToPageId(slug: string[]): string | null {
  if (slug.length < 2) return null;
  let parts: string[];
  try {
    parts = slug.map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  const pageId = `${parts[0]}:${parts.slice(1).join("/")}`;
  return parsePageId(pageId) ? pageId : null;
}

export function buildPopoutUrl(pageId: string, token: string): string {
  const parsed = parsePageId(pageId);
  if (!parsed) throw new Error(`잘못된 pageId: ${pageId}`);
  const path = [parsed.moduleId, ...parsed.pageName.split("/")].map(encodeURIComponent).join("/");
  return `/popup/${path}?h=${encodeURIComponent(token)}`;
}
```

(`parsePageId` 는 moduleId 를 검증하지 않으므로 `["mdm:x","a"]` 같은 경우를 막으려면 parts[0] 에 `:` 나 `/` 가 있으면 null 을 돌려주는 줄을 더한다. 시험에 `["a:b","c"]` → null 케이스 추가.)

`layout.tsx`: `portal/layout.tsx` 와 같은 내용(함수 이름만 `PopupLayout`).

`[...slug]/page.tsx`:

```tsx
"use client";

/**
 * 포털 탭 「새 창으로 분리」 가 여는 단독 화면 — `/popup/{moduleId}/{pageName…}?h={token}`.
 * 포털 탭·사이드바 없이 PortalPageWindow 가 화면 하나만 그린다. 권한·serviceId·창 제목은 내 메뉴(myMenusTree)로 정한다.
 * 설계: docs/superpowers/specs/2026-10-06-portal-tab-popout-design.md §5.4·§5.6
 */
import { use, useEffect } from "react";
import { PortalPageWindow, usePortalMenu } from "@dk-oasis/shared/portal-shell";
import "@dk-oasis/shared/portal-shell.css";
import "@dk-oasis/shared/grid.css";
import "@dk-oasis/shared/form.css";
import "@dk-oasis/shared/modal.css";
import { resolvePortalPage } from "../../portal/registered-modules";
import { usePortalUsageReporter } from "../../portal/use-portal-usage-reporter";
import { publishPortalMenu } from "@/lib/portal-menu-store";
import { popupSlugToPageId } from "../popup-target";

const MENU_ENDPOINT = { endpoint: "/api/mcm/oasis/secUser/myMenusTree" };

export default function PopupRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ h?: string | string[] }>;
}) {
  const { slug } = use(params);
  const { h } = use(searchParams);
  const token = typeof h === "string" ? h : null;
  const pageId = popupSlugToPageId(slug);
  const { menu, isLoading, errorMessage } = usePortalMenu(MENU_ENDPOINT);
  const { onUsageSegments } = usePortalUsageReporter();

  useEffect(() => {
    publishPortalMenu(menu?.items ?? null);
  }, [menu]);

  if (!pageId) return <p style={{ padding: 24, color: "#dc3545" }}>잘못된 화면 경로입니다.</p>;
  if (isLoading) return <p style={{ padding: 24, color: "#666" }}>로딩 중...</p>;
  if (!menu || errorMessage) return <p style={{ padding: 24, color: "#dc3545" }}>{errorMessage ?? "메뉴를 불러올 수 없습니다."}</p>;
  return (
    <PortalPageWindow
      pageId={pageId}
      menu={menu}
      resolvePage={resolvePortalPage}
      handoffToken={token}
      appName="DMES Portal"
      onUsageSegments={onUsageSegments}
    />
  );
}
```

portal/page.tsx:
- `usePortalUsageReporter` 정의·`SCREEN_USAGE_ENDPOINT` 상수를 새 파일로 옮기고 `import { usePortalUsageReporter } from "./use-portal-usage-reporter";` 로 바꾼다(새 파일은 `"use client";` 와 필요한 import 를 가진다).
- `PortalShellWithMessage` 안:

```ts
  // 탭 「새 창으로 분리」 — 팝업이 차단되면 안내만 하고 탭은 그대로 둔다(설계 2026-10-06 §5.3).
  const popout = useMemo(
    () => ({
      buildUrl: buildPopoutUrl,
      onBlocked: () =>
        gfn_message(
          "팝업이 차단되어 새 창을 열지 못했습니다. 브라우저 주소창의 팝업 차단을 이 사이트에 대해 허용한 뒤 다시 시도해 주세요.",
          "",
          "",
          "warning"
        ),
    }),
    [gfn_message]
  );
```

("warning" 은 `AlertType`(shared/src/components/modal.tsx) 값이다.) `<PortalShell … popout={popout} allowDuplicateTabs />`. import 에 `useMemo`, `buildPopoutUrl`(`../popup/popup-target`).

- [ ] **Step 4: 통과 확인 + tsc**

Run: `cd src/frontend/m-mcm && npx vitest run --maxWorkers=2 tests/popup` 그리고 `npx tsc --noEmit -p .`
Expected: 시험 PASS, tsc 오류 0(형제 패키지 dist 가 없어서 나는 기준 오류는 Task 0 에서 기록한 것과 비교).

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/m-mcm/app/popup src/frontend/m-mcm/app/portal/page.tsx src/frontend/m-mcm/app/portal/use-portal-usage-reporter.ts src/frontend/m-mcm/tests/popup
/usr/bin/git commit -m "feat(m-mcm): 탭 분리 창 라우트를 모듈 공통으로 넓히고 포털에 연결한다"
```

---

### Task 7: 문서 — 공통 컴포넌트 문서·색인·설계 결정

**Files:**
- Create: `.claude/skills/mantine-aggrid-ui/references/components/portal-page-window.md`
- Regenerate: `.claude/skills/mantine-aggrid-ui/references/components/llms.txt`, `llms-full.txt`
- Modify: `.claude/skills/mantine-aggrid-ui/SKILL.md` (포털·위젯 줄 근처 라우팅 표에 한 줄 언급, 필요할 때만)
- Modify: `docs/superpowers/specs/2026-10-06-portal-tab-popout-design.md` §9 (구현 중 바뀐 결정이 있으면 D7~ 로 추가)

- [ ] **Step 1: 컴포넌트 문서 작성** — `floating-window.md` 형식(제목, 한 줄 용도, import·소스·내부 구현·진입점 목록, 「언제 쓰나」, 「표준 사용」 코드, props 표, 주의)을 따른다. 내용: 용도(포털 셸 없이 화면 하나를 탭과 같은 조건으로), import `import { PortalPageWindow } from "@dk-oasis/shared/portal-shell";`, 소스 경로, props 표(Task 4 인터페이스), 표준 사용(m-mcm `/popup` 라우트 예), 주의(포털 탭 저장소를 쓰지 않음·handoff/sessionStorage 키·메뉴에 없는 화면 차단·`openPagePopout` 은 클릭 처리기에서 동기 호출).

- [ ] **Step 2: 색인 갱신**

Run: `cd .claude/skills/mantine-aggrid-ui/scripts && python3 ui_docs.py index --write && python3 ui_docs.py full --write && python3 ui_docs.py coverage`
Expected: coverage 에 `PortalPageWindow`·`openPagePopout` 등 새 export 가 "문서 없음" 으로 나오지 않는다(나오면 문서에 이름을 적거나 제외 목록 규칙을 따른다).

- [ ] **Step 3: 커밋**

```bash
/usr/bin/git add .claude/skills/mantine-aggrid-ui docs/superpowers/specs/2026-10-06-portal-tab-popout-design.md
/usr/bin/git commit -m "docs(mantine-aggrid-ui): PortalPageWindow 문서와 색인을 더한다"
```

---

### 마감 (계획 밖 공통 절차)

1. 브랜치 전체 리뷰(opus/high) — 동작 보존(기존 셸 시험·prop 미지정 동작)·팝업 차단 경로·handoff 키 누수를 본다.
2. 머지 직전 전체 시험 한 번: `.claude/skills/dflow-dev/scripts/heavy.sh` 경유.
3. 조정 세션에 `머지 요청` (겹칠 수 있는 파일: `shared/src/portal-shell/portal-shell.tsx`, `tabs-bar/TabsBar.tsx`, `use-portal-tabs.ts`, `m-mcm/app/portal/page.tsx`, `.claude/skills/mantine-aggrid-ui/references/components/llms*.txt`).
4. 머지 뒤 브라우저 확인 항목(조정 세션 몫): 실제 팝업 창 열림·차단 안내, 분리 창에서 조회·버튼 권한, F5 상태 유지, 중복 탭 번호·뒤로가기, 로그아웃 때 분리 창 닫힘, rule-handoff 화면에서 분리 시 동작.
