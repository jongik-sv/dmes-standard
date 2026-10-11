# ERD UX 정비 1차 — Task 1-4: 화면 틀·위 막대·문구 (레인 FE1)

> 공통 제약·결정(U1-U54)·Review Focus·인터페이스(정본)는 [README](README.md). 이 문서의 모든 Task 는 README Global Constraints 를 따른다.
> 다음: [02-fe2-canvas-server.md](02-fe2-canvas-server.md) · 마감: [03-close.md](03-close.md)

레인 FE1 이 Task 1 → 2 → 3 → 4 를 차례로 한다. Task 1 끝 = lane commit 하나로 합쳐 **dev 에 먼저 머지**(조정 허가). FE2 의 Task 6 Step 7·Task 7·Task 8 이 이 머지를 기다린다.

공통 명령(`src/frontend` 에서):

```bash
pnpm --filter "@dk-oasis/m-mdm^..." build
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
pnpm --filter @dk-oasis/m-mdm lint
node ../.claude/skills/mantine-aggrid-ui/scripts/mantine_docs.mjs audit <바꾼 파일…>
node ../.claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit <바꾼 파일…>
```

경로 줄임: `S/` = `src/frontend/m-mdm/pages/dma/erdEdit/`, `T/` = `src/frontend/m-mdm/tests/dma/erdEdit/`.

시작 전 읽기: `S/ErdViewer.tsx` 전부, `S/panels/{TopBar,VersionBar,ReviewPanel,ChangeLog,ConfirmDialog,DiagramTree,NoticeBar}.tsx`, `S/edit-context.ts`, `S/state/permissions.ts`, `S/canvas/erd-styles.ts`, `S/panels/core-styles.ts`, `T/page-render.test.ts`, `T/erd-fixtures.ts`. shared 부품 API: `node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs get content-body`(없으면 `src/frontend/shared/src/layout/ContentBody.tsx`·`ContentPanel.tsx`), `detail-popover`, `floating-panel`, `message-provider`. 선례: `src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx:906-913`(React Flow 화면의 ContentBody 중첩).

---

### Task 1: 뼈대 — 타입 칸, 문구 사전, 위반 규칙, 작업 상태 저장, 짧은 이유, nav 두 함수, ColumnGrid addRequest

**Files:**
- Modify: `S/types.ts` (`ErdDelta.at?`, `ErdRejection.userHint?`)
- Create: `S/labels.ts`, `S/state/violations.ts`, `S/state/prefs.ts`
- Modify: `S/state/permissions.ts` (`shortReason`, `readOnlyKind`, RELEASED_TEXT 글)
- Modify: `S/edit-context.ts` (`ErdNav.startColumnAdd`·`selectDiagram`)
- Modify: `S/ErdViewer.tsx` (nav 두 함수 구현만, `addRequest` 상태, ColumnGrid 에 넘김)
- Modify(한 번만): `S/panels/ColumnGrid.tsx` (`addRequest` prop + 효과 하나)
- Test: `T/erd-fixtures.ts`(`fakeEditContext` nav 두 함수), 새 `T/erd-labels.test.ts`, 새 `T/erd-prefs.test.ts`, `T/edit-core.test.ts`(shortReason·readOnlyKind)

**Interfaces:**
- Consumes: README 인터페이스 정본 `prefs.ts`·`violations.ts`·`labels.ts`·`permissions.ts`·`edit-context.ts`·`ColumnGrid` 절.
- Produces: 위 모듈 전부(FE2 Task 6 Step 7·Task 7·8 이 쓴다).

- [ ] **Step 1: 실패하는 시험 — `labels.ts`**

`T/erd-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { evidenceText, issueLabel, SOURCE_LABEL, timeText } from "../../../pages/dma/erdEdit/labels";

describe("문구 사전(U30)", () => {
  it("확정 코드를 한국어로, 모르는 코드는 그대로", () => {
    expect(issueLabel("ERD_STD_DOMAIN")).toBe("도메인 다름");
    expect(issueLabel("ERD_INFERRED_LEFT")).toBe("검토 안 한 추정 관계");
    expect(issueLabel("X_NEW")).toBe("X_NEW");
  });
  it("근거는 종류를 한국어로, 경로는 마지막 조각만", () => {
    expect(evidenceText({ kind: "SQL_JOIN", ref: "src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V1__baseline.sql:1108" }))
      .toBe("SQL 조인 V1__baseline.sql:1108");
    expect(evidenceText({ kind: "NAME_RULE", ref: "PK 이름 일치" })).toBe("이름 규칙 PK 이름 일치");
  });
  it("출처 한국어", () => {
    expect(SOURCE_LABEL.MCP).toBe("Claude");
    expect(SOURCE_LABEL.UI).toBe("화면");
  });
  it("시각 — 오늘이면 HH:mm, 아니면 MM-dd HH:mm, 없거나 깨지면 빈 글", () => {
    const now = new Date(2026, 9, 11, 15, 0, 0);
    expect(timeText("2026-10-11T14:03:22", now)).toBe("14:03");
    expect(timeText("2026-10-10T09:05:00", now)).toBe("10-10 09:05");
    expect(timeText(null, now)).toBe("");
    expect(timeText("어제", now)).toBe("");
  });
});
```

실행 → 모듈 없음으로 실패: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-labels.test.ts`

- [ ] **Step 2: `S/labels.ts` 작성**

```ts
/**
 * 사람이 읽는 문구 사전(UX 1차 U30) — 서버 코드·영어 값을 한국어로. 모르는 값은 원문을 그대로 돌려준다(숨기지 않음).
 * 화면 여러 곳(검토 패널·변경 기록·확정 창·도구 막대)이 함께 쓴다. 순수.
 */
import type { ErdSource } from "./types";

export const ISSUE_LABEL: Readonly<Record<string, string>> = {
  ERD_STD_TYPE: "타입 불일치", ERD_STD_DOMAIN: "도메인 다름", ERD_STD_MISS: "사전 없음", ERD_INFERRED_LEFT: "검토 안 한 추정 관계",
};
export const EVIDENCE_LABEL: Readonly<Record<string, string>> = { DOC: "설계 문서", SQL_JOIN: "SQL 조인", NAME_RULE: "이름 규칙" };
export const SOURCE_LABEL: Readonly<Record<ErdSource, string>> = { UI: "화면", MCP: "Claude", CLI: "CLI", SYSTEM: "시스템" };
export const KIND_LABEL: Readonly<Record<string, string>> = {
  table: "표", column: "컬럼", key: "키", relation: "관계", diagram: "다이어그램", diagramNode: "표 자리",
};

export const issueLabel = (code: string): string => ISSUE_LABEL[code] ?? code;

/** 경로 꼴 ref 는 마지막 조각(파일:줄)만. 원문은 부른 쪽이 title 로 보인다. */
export function evidenceText(e: { kind: string; ref: string }): string {
  const ref = e.ref.includes("/") ? e.ref.slice(e.ref.lastIndexOf("/") + 1) : e.ref;
  return `${EVIDENCE_LABEL[e.kind] ?? e.kind} ${ref}`.trim();
}

const AT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** 서버 at(yyyy-MM-ddTHH:mm:ss, 서버 지역 시각) → 오늘이면 "HH:mm", 아니면 "MM-dd HH:mm". */
export function timeText(at: string | null | undefined, now: Date = new Date()): string {
  const m = at ? AT_RE.exec(at) : null;
  if (!m) return "";
  const [, y, mo, d, h, mi] = m;
  const today = Number(y) === now.getFullYear() && Number(mo) === now.getMonth() + 1 && Number(d) === now.getDate();
  return today ? `${h}:${mi}` : `${mo}-${d} ${h}:${mi}`;
}
```

시험 통과 확인.

- [ ] **Step 3: 실패하는 시험 — `prefs.ts`·`violations.ts`**

`T/erd-prefs.test.ts`(저장소는 Map 으로 흉내):

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_PREFS, PREFS_MAX_VIEWPORTS, loadPrefs, prefsKey, savePrefs, withSeen, withViewport } from "../../../pages/dma/erdEdit/state/prefs";
import { isCountedViolation, modelSummary, summaryText } from "../../../pages/dma/erdEdit/state/violations";
import { menuModel } from "./erd-fixtures";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

describe("작업 상태 저장(U21)", () => {
  it("사용자별 키에 저장하고 다시 읽는다", () => {
    const s = mem();
    savePrefs("u1", { ...DEFAULT_PREFS, lastModelId: "mcm", reviewOpen: true }, s);
    expect(s.m.has(prefsKey("u1"))).toBe(true);
    expect(loadPrefs("u1", s)).toMatchObject({ lastModelId: "mcm", reviewOpen: true });
    expect(loadPrefs("u2", s)).toEqual(DEFAULT_PREFS);
  });
  it("깨진 JSON·모르는 값·막힌 저장소는 기본값", () => {
    const s = mem();
    s.setItem(prefsKey("u1"), "{not json");
    expect(loadPrefs("u1", s)).toEqual(DEFAULT_PREFS);
    s.setItem(prefsKey("u1"), JSON.stringify({ mode: "weird", preset: "both", sideOpen: "yes" }));
    expect(loadPrefs("u1", s)).toMatchObject({ mode: "logical", preset: "both", sideOpen: true });
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadPrefs("u1", throwing)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs("u1", DEFAULT_PREFS, throwing)).not.toThrow();
    expect(loadPrefs(null, s)).toEqual(DEFAULT_PREFS);
  });
  it("viewport 는 최대 30개, 오래된 것부터 뺀다. 같은 키는 맨 뒤로", () => {
    let p = DEFAULT_PREFS;
    for (let i = 0; i < PREFS_MAX_VIEWPORTS + 2; i++) p = withViewport(p, "m", `d${i}`, { x: i, y: 0, zoom: 1 });
    expect(Object.keys(p.viewports)).toHaveLength(PREFS_MAX_VIEWPORTS);
    expect(p.viewports["m/d0"]).toBeUndefined();
    p = withViewport(p, "m", "d2", { x: 9, y: 9, zoom: 0.5 });
    expect(Object.keys(p.viewports).at(-1)).toBe("m/d2");
  });
  it("seenReadOnly 는 같은 키를 두 번 넣지 않고 20개까지", () => {
    let p = withSeen(withSeen(DEFAULT_PREFS, "mcm:released"), "mcm:released");
    expect(p.seenReadOnly).toEqual(["mcm:released"]);
    for (let i = 0; i < 25; i++) p = withSeen(p, `m${i}:notEditor`);
    expect(p.seenReadOnly).toHaveLength(20);
  });
});

describe("위반 정의 하나(U25)", () => {
  it("TYPE·DOMAIN·MISS 만, 감사 컬럼은 보기를 켰을 때만 센다", () => {
    const m = menuModel();
    // menuModel 의 컬럼 하나를 감사 컬럼(C_AT)으로 바꿔 시험한다 — 실제 id 는 erd-fixtures 를 보고 고른다
    const auditId = Object.keys(m.columns)[0];
    m.columns[auditId] = { ...m.columns[auditId], phys: "C_AT" };
    const st = { [auditId]: "DOMAIN" } as const;
    expect(isCountedViolation(m, auditId, st, false)).toBe(false);
    expect(isCountedViolation(m, auditId, st, true)).toBe(true);
  });
  it("요약 줄 — 관계는 REJECTED 를 빼고, 상태가 없으면 위반은 …", () => {
    const s = modelSummary(menuModel(), null, false);
    expect(s.violations).toBeNull();
    expect(summaryText(s)).toMatch(/^표 \d+ · 관계 \d+\(추정 \d+\) · 고칠 위반 …$/);
  });
});
```

실행 → 실패 확인.

- [ ] **Step 4: `S/state/prefs.ts`·`S/state/violations.ts` 작성**

`prefs.ts` 요점(정본 서명은 README):
- `DEFAULT_PREFS = { lastModelId: null, lastDiagram: {}, mode: "logical", preset: "basic", reviewOpen: false, reviewTab: "inferred", sideOpen: true, propsOpen: true, viewports: {}, seenReadOnly: [] }`.
- `loadPrefs`: `storage ?? globalThis.localStorage` 를 try 안에서 읽는다. JSON 이 객체가 아니면 기본값. 칸마다 검사: `mode ∈ {logical, physical}`, `preset ∈ {basic, overview, both}`, `reviewTab ∈ {violations, inferred, diff, history}`, 불리언 칸은 `typeof === "boolean"` 아니면 기본값, `viewports` 는 값마다 `x·y·zoom` 이 유한수이고 `zoom` 이 0.1-2 일 때만, `lastDiagram` 은 문자열 값만, `seenReadOnly` 는 문자열 배열 앞 20개.
- `savePrefs`: userId null 이면 아무것도 안 함. try/catch.
- `withViewport`: 키 `${modelId}/${diagramId}` 를 지우고 다시 넣어 맨 뒤로, 30개 넘으면 앞에서 뺀다(객체 키 순서 = 넣은 순서).
- `useErdPrefs(userId)`: `useState(DEFAULT_PREFS)`, `loaded` 상태. `userId` 가 처음 문자열이 되면 `loadPrefs` 한 번 → `loaded=true`. `update(fn)` 은 상태를 바꾸고 300ms 미뤄 `savePrefs`(언마운트 때 남은 저장을 바로 한다). userId 가 바뀌면(로그인 바뀜) 다시 읽는다.

`violations.ts`: README 정본 서명 그대로. `isCountedViolation` = `BLOCKING_STATUSES.has(statuses[cid]) && (showAudit || !isAuditColumnId(model, cid))`. `modelSummary.relations` = `state !== "REJECTED"` 수, `inferred` = `state === "INFERRED"` 수, `violations` = 모든 표 `columnOrder` 의 세는 컬럼 수(statuses null 이면 null). `summaryText` 형식 `표 ${t} · 관계 ${r}(추정 ${i}) · 고칠 위반 ${v ?? "…"}`.

시험 통과 확인.

- [ ] **Step 5: `permissions.ts` — `shortReason`·`readOnlyKind`, RELEASED 글**

- `RELEASED_TEXT = "확정된 버전이라 모델을 고칠 수 없습니다. [버전 ▾] 의 [새 버전] 으로 DRAFT 를 만드세요."`, `NO_OWNER_DIAGRAM_TEXT` 의 "[선점]하거나 [새 버전]" → "[버전 ▾] 에서 [선점] 하거나 [새 버전] 을". 
- `shortReason(reason)`: `NO_RIGHT_TEXT → "권한 없음"`, `RELEASED_TEXT → "확정된 버전"`, `reason.startsWith("공동 편집자가 아니어서") → "공동 편집자 아님"`, `NO_OWNER_DIAGRAM_TEXT → "소유자 없음"`, `LOST_TEXT → "연결 끊김"`, null → `""`, 그 밖 원문.
- `readOnlyKind(r)`: `readOnlyBanner(r)` 와 같은 분기로 `"noRight" | "released" | "notEditor" | "noOwner" | null`.

`T/edit-core.test.ts` 에 시험 더함: `shortReason` 다섯 값과 원문 통과, `readOnlyKind` 네 경우(기존 `editRights` 시험 입력 재사용). 기존 시험 중 RELEASED_TEXT 글자를 직접 비교하는 줄은 상수 비교로 바꾼다.

- [ ] **Step 6: `edit-context.ts`·`types.ts`·`erd-fixtures.ts`**

- `ErdNav` 에 `startColumnAdd(tableId, pk)`·`selectDiagram(diagramId)` (README 정본 주석 그대로).
- `types.ts`: `ErdDelta` 에 `at?: string | null`, `ErdRejection` 에 `userHint?: string | null`(주석: "UX 1차 U27·U28. 옛 서버는 없다 — 읽을 때 `?? null`").
- `T/erd-fixtures.ts` `fakeEditContext` 의 `nav` 에 `startColumnAdd: vi.fn(), selectDiagram: vi.fn()`.

- [ ] **Step 7: `ColumnGrid` `addRequest`(FE2 파일, 이 Task 에서 한 번만)**

`S/panels/ColumnGrid.tsx`:
- props 에 `addRequest?: { seq: number; tableId: string; pk: boolean } | null`.
- 효과 하나: `useEffect(() => { if (addRequest && addRequest.tableId === tableId) barHandle.current?.trigger(addRequest.pk ? "addPk" : "add"); }, [addRequest?.seq])` — `seq` 만 의존(같은 요청을 두 번 돌지 않게). `trigger` 는 글자가 비면 모드를 바꾸고 입력 칸에 초점(지금 `GridInputBar.add` 동작).
- 그 밖은 건드리지 않는다. 시험은 `T/column-grid.test.ts` 에 하나 더함: `addRequest` 를 `{seq:1, tableId, pk:true}` 로 주면 입력 칸 placeholder 가 "PK 컬럼 논리명" 으로 바뀌고 초점이 입력 칸.

- [ ] **Step 8: `ErdViewer` — nav 두 함수**

- 상태 `const [addRequest, setAddRequest] = useState<{ seq: number; tableId: string; pk: boolean } | null>(null)`.
- `nav.startColumnAdd(tableId, pk)`: `selectTable(tableId)` → `setAddRequest((r) => ({ seq: (r?.seq ?? 0) + 1, tableId, pk }))`. (Task 2 에서 속성 패널 열기 `update(p => ({...p, propsOpen: true}))` 를 더한다.)
- `nav.selectDiagram(id)`: `stateRef.current?.diagrams[id]` 있으면 `onSelectDiagram(id)`.
- `<ColumnGrid ctx={ctx} tableId={focusTable} addRequest={addRequest} />`.
- `T/page-render.test.ts` 에 시험 하나: 캔버스 문맥 없이 `nav` 를 직접 부를 수 없으므로, Task 7(FE2)의 도구 막대가 연결 시험을 맡는다. 여기서는 lint·기존 시험 통과만.

- [ ] **Step 9: 통과 확인·커밋**

```bash
pnpm --filter "@dk-oasis/m-mdm^..." build
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
pnpm --filter @dk-oasis/m-mdm lint
```
audit 두 개(바꾼 파일). 커밋 `feat(erd): UX 1차 뼈대 — 문구 사전·위반 규칙·작업 상태 저장·nav 더함`. lane commit 합치고 `머지 요청:` 보고(FE2 가 기다림).

---

### Task 2: 화면 틀 — 분할·접기·검토 접힘 줄·속성 자동 숨김·최대화·작업 상태·첫 viewport·첫 다이어그램

**Files:**
- Modify: `S/ErdViewer.tsx` (JSX 틀, 상태, prefs 연결, CanvasPane viewport·최대화·Controls)
- Modify: `S/panels/ReviewPanel.tsx` (`collapsed`·`onToggle` props, 접힘 줄 렌더)
- Modify: `S/panels/DiagramTree.tsx` (머리 [접기] 단추 prop `onCollapse`)
- Modify: `S/canvas/erd-styles.ts` (`.erd-app` grid 제거 → flex column, 레일·접힘 줄·`erd-sr-only`·최대화)
- Create: `S/state/viewport.ts` (순수: `initialViewport`, `nodeOutside`, `firstDiagram`)
- Test: 새 `T/erd-layout-frame.test.ts`, `T/page-render.test.ts`(바뀐 testid·새 시험)

**Interfaces:**
- Consumes: Task 1 전부, README "화면 틀" JSX 뼈대, U10-U14·U21·U22·U53.
- Produces: `.erd-area-*` 선택자(측정용, U5), `erd-review-strip`·`erd-side-rail`·`erd-props-rail`·`erd-*-toggle`·`erd-maximize`·`erd-zoom-in/out`·`erd-props-float` testid.

- [ ] **Step 1: 실패하는 시험 — 순수 `viewport.ts`**

`T/erd-layout-frame.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { FIRST_FIT_MIN_ZOOM, firstDiagram, initialViewport, nodeOutside } from "../../../pages/dma/erdEdit/state/viewport";

const box = (x: number, y: number, w = 240, h = 200) => ({ x, y, width: w, height: h });

describe("첫 viewport(U22)", () => {
  it("저장 viewport 가 있으면 그것", () => {
    expect(initialViewport([box(0, 0)], { width: 1000, height: 600 }, { x: 5, y: 6, zoom: 0.7 })).toEqual({ x: 5, y: 6, zoom: 0.7 });
  });
  it("맞춤 배율이 문턱 이상이면 맞춤", () => {
    const vp = initialViewport([box(0, 0), box(300, 0)], { width: 1000, height: 600 }, null);
    expect(vp.zoom).toBeGreaterThanOrEqual(FIRST_FIT_MIN_ZOOM);
    expect(vp.zoom).toBeLessThanOrEqual(1);
  });
  it("맞춤 배율이 문턱 미만이면 배율 1, 묶음 왼쪽 위를 40px 안쪽에", () => {
    const many = Array.from({ length: 60 }, (_, i) => box((i % 10) * 300, Math.floor(i / 10) * 1200 + 2762));
    expect(initialViewport(many, { width: 1000, height: 600 }, null)).toEqual({ x: 40, y: 40 - 2762, zoom: 1 });
  });
  it("노드가 없으면 원점 배율 1", () => {
    expect(initialViewport([], { width: 1000, height: 600 }, null)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("캔버스 폭이 바뀐 뒤 고른 노드(U12)", () => {
  it("화면 밖이면 true", () => {
    expect(nodeOutside({ x: 0, y: 0, zoom: 1 }, { width: 600, height: 400 }, box(700, 10))).toBe(true);
    expect(nodeOutside({ x: 0, y: 0, zoom: 1 }, { width: 600, height: 400 }, box(100, 10))).toBe(false);
  });
});

describe("첫 다이어그램(U53)", () => {
  const ds = [
    { id: "d-all", sortSeq: 0, tables: 57 }, { id: "d-sec", sortSeq: 1, tables: 12 }, { id: "d-job", sortSeq: 2, tables: 20 },
  ];
  it("기억한 다이어그램이 살아 있으면 그것", () => expect(firstDiagram(ds, "d-job")).toBe("d-job"));
  it("없으면 sortSeq 순 30개 이하 첫 것", () => expect(firstDiagram(ds, "d-gone")).toBe("d-sec"));
  it("작은 것이 없으면 sortSeq 첫 것", () => expect(firstDiagram([ds[0]], null)).toBe("d-all"));
  it("다이어그램이 없으면 null", () => expect(firstDiagram([], null)).toBeNull());
});
```

실행 → 실패.

- [ ] **Step 2: `S/state/viewport.ts` 작성**

```ts
/**
 * 첫 viewport·첫 다이어그램·고른 노드가 화면 밖인지(UX 1차 U12·U22·U53). 순수 — React Flow 의 getViewportForBounds 를 쓴다.
 * FIRST_FIT_MIN_ZOOM 은 캔버스 개요 단계 문턱(canvas/erd-geometry ZOOM_OVERVIEW, FE2)과 같은 값이어야 한다. 마감에서 맞춰 본다.
 */
import { getViewportForBounds, type Viewport } from "@dk-oasis/shared/react-flow";

import type { ErdViewport } from "./prefs";

export const FIRST_FIT_MIN_ZOOM = 0.35;
export const FIRST_MARGIN = 40;
export const SMALL_DIAGRAM = 30;
export interface Rect { x: number; y: number; width: number; height: number }

const bounds = (rs: readonly Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) - x, height: Math.max(...rs.map((r) => r.y + r.height)) - y };
};

export function initialViewport(nodes: readonly Rect[], pane: { width: number; height: number }, saved: ErdViewport | null): Viewport {
  if (saved) return { x: saved.x, y: saved.y, zoom: saved.zoom };
  if (nodes.length === 0) return { x: 0, y: 0, zoom: 1 };
  const b = bounds(nodes);
  const fit = getViewportForBounds(b, pane.width, pane.height, 0.1, 1, 0.1);
  if (fit.zoom >= FIRST_FIT_MIN_ZOOM) return fit;
  return { x: FIRST_MARGIN - b.x, y: FIRST_MARGIN - b.y, zoom: 1 };
}

export function nodeOutside(vp: Viewport, pane: { width: number; height: number }, n: Rect): boolean {
  const l = n.x * vp.zoom + vp.x, t = n.y * vp.zoom + vp.y;
  return l + n.width * vp.zoom > pane.width || t > pane.height || l < 0 || t + 30 * vp.zoom < 0;
}

export function firstDiagram(ds: readonly { id: string; sortSeq: number; tables: number }[], remembered: string | null): string | null {
  if (remembered && ds.some((d) => d.id === remembered)) return remembered;
  const sorted = [...ds].sort((a, b) => a.sortSeq - b.sortSeq || a.id.localeCompare(b.id));
  return sorted.find((d) => d.tables > 0 && d.tables <= SMALL_DIAGRAM)?.id ?? sorted[0]?.id ?? null;
}
```
시험 기대값이 `getViewportForBounds` 반올림과 다르면 시험을 `toBeCloseTo` 로 고친다(값을 바꾸지 않음). 통과 확인.

- [ ] **Step 3: CSS — `erd-styles.ts` 의 `.erd-app` grid 를 걷는다**

`ERD_CSS` 에서 `.erd-app` grid 줄·`.erd-area-*` grid-area 줄·`@media (max-width: 1180px)` 묶음을 지우고 아래로 바꾼다(클래스 이름은 측정용으로 남김, U5):

```css
.erd-app { display: flex; flex-direction: column; height: 100%; min-height: 560px; border: 1px solid var(--color-border); background: var(--color-bg); }
.erd-app > .content-body { flex: 1 1 0; min-height: 0; }
.erd-area-bar { flex: none; border-bottom: 1px solid var(--color-border); }
.erd-area-side { height: 100%; min-height: 0; overflow-y: auto; padding: var(--spacing-sm); }
.erd-area-center { position: relative; height: 100%; min-width: 0; min-height: 0; }
.erd-area-grid { position: relative; height: 100%; min-height: 0; display: flex; flex-direction: column; }
.erd-area-review { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.erd-review-strip { flex: none; height: auto; max-height: 32px; border-top: 1px solid var(--color-border); }
.erd-rail { flex: none; width: 28px; height: 100%; padding: var(--spacing-xs) 0; display: flex; flex-direction: column; align-items: center;
  border: 1px solid var(--color-border); background: var(--color-bg-header); }
.erd-panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-xs); padding: 0 var(--spacing-xs); }
.erd-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
```
`page-layout.css` 의 `.page-layout .content-body` 규칙(높이·여백)과 겹치면 `.erd-app > .content-body` 한 단계로 맞춘다. 브라우저 확인은 Step 6.

- [ ] **Step 4: JSX 틀 — ContentBody 분할**

`S/ErdViewer.tsx` 의 return 을 README "화면 틀" 뼈대로 바꾼다. 요점:
- import `ContentBody, ContentPanel` from `@dk-oasis/shared/layout`, `FloatingPanel` from `@dk-oasis/shared/floating-panel`.
- `const { prefs, loaded, update } = useErdPrefs(me)`.
- 왼쪽: `prefs.sideOpen` 이면 ContentPanel(`key="side"` `width={220}` `minSize={160}`) 안 `DiagramTree`(새 prop `onCollapse={() => update(p => ({ ...p, sideOpen: false }))}`, 머리에 [‹] `erd-side-toggle`). 아니면 레일 `erd-side-rail`(세로 단추 [›] `erd-side-toggle` title "다이어그램 목록 펼치기").
- 속성: `focusTable` 이 있을 때만. `prefs.propsOpen || propsFocused` 면 ContentPanel(`key="props"` `width={400}` `minSize={320}`) 안 `<div className="erd-panel-head">` [›] `erd-props-toggle`(title "속성 접기") + ColumnGrid. 아니면 레일 `erd-props-rail`([‹] title "속성 펼치기").
- `propsFocused`: `erd-area-grid` 의 `onFocusCapture={() => setPropsFocused(true)}`, `onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPropsFocused(false); }}`. 선택이 풀려도 `propsFocused` 면 마지막 표(`lastFocusTable` ref)로 패널을 남긴다(U12). 초점이 나가면 사라진다.
- 검토: `prefs.reviewOpen` 이면 바깥 ContentBody 안 ContentPanel(`key="review"` `height={260}` `minSize={120}`)에 `ReviewPanel collapsed={false}`. 아니면 ContentBody **밖** 형제 `<div className="erd-area-review erd-review-strip">` 안 `ReviewPanel collapsed`.
- `ColumnJump` 는 `erd-area-grid` 밖, `erd-app` 의 자식으로 옮긴다.
- 캔버스 ContentPanel 은 늘 `key="canvas"`.

- [ ] **Step 5: `ReviewPanel` 접힘**

`ReviewPanelProps` 에 `collapsed: boolean; onToggle(open: boolean): void`.
- 접힘: 머리 줄만(Tabs + 오른쪽 [▴ 펼치기] `erd-review-toggle`). Tabs `onChange(k)` = `onTab(k)` 다음 `onToggle(true)`. 탭 이름은 건수 포함(지금 그대로, Task 4 에서 문구).
- 펼침: 지금 모양 + 머리 오른쪽 [▾ 접기] `erd-review-toggle`.
- `ErdViewer`: `onTab = (t) => update(p => ({ ...p, reviewTab: t }))`, `tab = prefs.reviewTab`, `onToggle = (open) => update(p => ({ ...p, reviewOpen: open }))`. 탭 열 때 읽기 효과(`tab === "history" && history === null`)는 **펼쳐졌을 때만** 돈다: 조건에 `prefs.reviewOpen` 을 더한다. 접어도 `history`·`diff` 는 남긴다(다시 펼칠 때 두 번 읽지 않음, Review Focus 1).
- 빈 글: 모델을 안 골랐으면 위반 그리드 `emptyMessage` = "모델을 고르면 보입니다."(C 8번).

- [ ] **Step 6: 시험 — 접힘 줄·속성 자동 숨김(page-render)**

`T/page-render.test.ts`:
- `beforeEach` 의 localStorage 흉내를 Map 기반으로 바꾼다. Map 은 `beforeEach` 안에서 **시험마다 새로** 만든다(모듈 범위 금지 — 앞 시험의 `lastModelId`·언마운트 때 저장이 다음 시험에서 모델을 저절로 연다). 빈 Map 은 기존 no-op 과 같은 동작.
- 새 시험 `reviewStripOpensTabAndLoadsOnce`: 모델 고름 → `erd-review-strip` 있음, `erd-review` 없음 → `erd-tab-history` 누름 → `erd-review` 있음, `view sinceRev` 호출 1회 → `erd-review-toggle`(접기) → 다시 `erd-tab-history` → `view sinceRev` 호출 여전히 1회.
- 새 시험 `propsPanelAutoHideKeepsFocusAndNode`: 표를 고르기 전 `.erd-area-grid` 없음 → 노드 고름(기존 시험의 고르기 도우미) → `.erd-area-grid` 있음 → 입력 칸 `erd-grid-input` 에 초점 → Esc 로 선택 풀기 대신 `ctx.nav` 없이 캔버스 빈 곳 클릭(기존 도우미)으로 선택 해제 → 패널 남음 → 입력 칸 blur → 패널 사라짐.
- 기존 시험 중 탭을 누르는 것은 그대로 통과해야 한다(접힘 줄 = 같은 testid). `erd-columns-empty` 를 보던 시험은 `.erd-area-grid` 없음으로 바꾼다.
- 통과 확인: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/page-render.test.ts tests/dma/erdEdit/erd-layout-frame.test.ts`. 커밋(t2a).

- [ ] **Step 7: prefs 연결 — 마지막 모델·다이어그램·모드·프리셋**

- `mode`·`preset` 상태를 prefs 로 옮긴다: `mode = prefs.mode`, `setMode = (m) => update(p => ({ ...p, mode: typeof m === "function" ? m(p.mode) : m }))`(F3 의 `setMode(nextMode)` 유지).
- 마지막 모델(U21): `const touched = useRef(false)`; 모델 단추·시작 카드 클릭 = `touched.current = true; setModelId(id)`. 효과: `loaded && models.length > 0 && !touched.current && modelId === null && prefs.lastModelId && models.some(m => m.modelId === prefs.lastModelId)` 면 `setModelId(prefs.lastModelId)`. 한 번만(ref 로 막음). `modelId` 가 바뀌면 `update(p => ({ ...p, lastModelId: modelId }))`.
- 첫 다이어그램(U53): `activeDiagram` 계산을 `diagramId ?? firstDiagram(diagramRows, prefs.lastDiagram[modelId] ?? null)` 로. `diagramRows` = `sortedDiagrams` 에 표 수(`state.nodes` 중 살아 있는 표)를 붙인 것. `activeDiagram` 이 바뀌면 `update(p => ({ ...p, lastDiagram: { ...p.lastDiagram, [modelId]: activeDiagram } }))`.
- 새 시험 `lastModelOpensOnlyWhenUntouched`(Review Focus 3): (a) prefs `lastModelId: "mcm"` 저장 후 렌더 → `view` 호출 mcm. (b) `/api/auth/me` 응답을 늦춘(약속을 나중에 푸는) fetch 흉내에서 그 전에 사용자가 다른 모델을 누르면 그 모델 유지. (c) 목록에 없는 id 면 view 호출 없음. 목록에 모델 2개(mcm·mdm)가 필요하면 `MODEL_ROW` 옆에 두 번째 행을 이 시험만 넣는다.

- [ ] **Step 8: 첫 viewport·viewport 저장·고른 노드 따라가기**

`CanvasPane`:
- `fitView`·`fitViewOptions` prop 을 지운다. `defaultViewport={initialViewport(rects, paneSize, saved)}` — `ReactFlowProvider` 가 다이어그램마다 `key` 로 다시 마운트되므로 첫 렌더 값만 쓰인다. `rects` = 이 다이어그램 노드의 `x·y` + `estimatedSize`(FE2 `erd-layout.ts` export, 읽기만) 또는 `NODE_WIDTH`×`nodeHeight(0,false)`. `paneSize` = 첫 렌더 때 캔버스 host 크기(모르면 `{ width: 1000, height: 600 }`). 첫 렌더 전 크기를 알 수 없으면 `onInit` 에서 `rf.setViewport(initialViewport(…실제 크기…))` 로 한 번 더 맞춘다(Local-Rules §33: `setViewport` 는 바로 옮긴다).
- `reveal` 이 있을 때는 지금처럼 `setCenter`(첫 viewport 를 덮음).
- 저장: `onMoveEnd={(_e, vp) => onViewport(vp)}` → `ErdViewer` 에서 `update(p => withViewport(p, modelId, diagramId, vp))`(prefs 의 300ms 미룸이 묶음 저장).
- 고른 노드 따라가기(U12): `const paneW = useStore((s) => s.width)`; 효과 `[paneW]`: 고른 표 노드가 있고 `nodeOutside(rf.getViewport(), {width: paneW, height: s.height}, rect)` 면 `rf.setCenter(cx, cy, { zoom: rf.getZoom(), duration: 150 })`.
- `Controls` 를 `showZoom={false}` 로 하고 `ControlButton` 넷: [확대](`erd-zoom-in`, title "확대", `rf.zoomIn()`), [축소](`erd-zoom-out`, "축소"), [화면 맞춤](그대로 `erd-fit`), [최대화](`erd-maximize`, title "캔버스 최대화 (Alt+M)" / 켜짐이면 "캔버스 최대화 풀기 (Alt+M)", `aria-pressed`).

- [ ] **Step 9: 최대화(U14)**

- `const [maximized, setMaximized] = useState(false)`. `CanvasPane` 에 `maximized`·`onToggleMaximize` prop.
- 전역 키(지금 `onKey`): `if (e.altKey && !mod && !e.shiftKey && e.code === "KeyM") { stop(e); setMaximized((v) => !v); return; }` — `isTypingTarget` 판정 뒤에 둔다(입력 칸이면 넘김).
- 최대화면 왼쪽·속성·검토·접힘 줄을 렌더 안 함(README 뼈대). 고른 표가 있으면 `FloatingPanel`(`title`= 표 물리명, `open`, `onClose={() => setMaximized(false)}` 대신 선택 해제 없이 카드만 닫기 상태 `floatClosed`, `storageKey="mdm.dma.erdEdit.props"`, `testId="erd-props-float"`) 안에 `ColumnGrid`.
- `nav.startColumnAdd` 는 최대화 중이면 카드를 다시 연다(`floatClosed=false`), 아니면 `update(p => ({ ...p, propsOpen: true }))`.

- [ ] **Step 10: 시험 — 최대화·viewport**

`T/page-render.test.ts` 새 시험:
- `altMTogglesMaximize`: 모델 고름 → `.erd-area-side` 있음 → `window` 에 `KeyboardEvent("keydown", { key: "µ", code: "KeyM", altKey: true })` → `.erd-area-side`·`erd-review-strip` 없음, `erd-viewer` 의 `data-maximized` 있음 → 다시 Alt+M → 돌아옴. 입력 칸 안 Alt+M 은 넘김.
- `viewportSavedOnMoveEnd`: prefs 흉내 저장소에 `viewports` 가 쓰이는지 — React Flow 이동을 happy-dom 에서 만들기 어려우면 `onMoveEnd` 를 직접 부를 수 없으므로 이 시험은 순수 `withViewport` 시험(Task 1)으로 갈음하고 보고에 적는다.

- [ ] **Step 11: 통과 확인·커밋(t2b)**

전체 화면 시험·lint·audit. 기존 시험이 실패하면 testid 호환표(README)대로 시험을 고친다. 바꾼 시험 목록을 레인 보고에. 커밋 `feat(erd): UX 1차 화면 틀 — 분할·접기·검토 접힘·최대화·작업 상태 기억·첫 viewport`.

브라우저 빠른 확인(L_MAIN 읽기만, 쓰기 없음): 5100 에서 MCM 열기 → 접기·끌기·더블클릭·Alt+M·새로 고침 뒤 모델·패널 복원. 문제는 보고(마감이 정식 확인).

---

### Task 3: 위 막대 한 줄 — 요약 줄·버전 ▾·읽기 전용 칩·toast·등록 창·빈 상태·제목·비활성 확정·하네스

**Files:**
- Modify: `S/panels/TopBar.tsx`, `S/panels/VersionBar.tsx`, `S/ErdViewer.tsx`(notify·빈 상태·제목 class), `S/page.tsx`
- Create: `S/panels/StartPanel.tsx`, `S/panels/ModelRegisterModal.tsx`
- Modify: `S/panels/core-styles.ts`(위 막대·칩·팝오버·시작 화면·비활성 확정·제목 숨김)
- Modify: `scripts/perf/render/screens.mjs`(erdEdit 항목), `scripts/perf/render/count-renders.mjs`(`formPrepare`)
- Test: `T/page-render.test.ts`, `T/version-bar.test.ts`, `T/core-panels.test.ts`

**Interfaces:**
- Consumes: Task 1·2, U15-U20·U26·U45·U47.
- Produces: testid `erd-summary`·`erd-ver-trigger`(`data-rev`)·`erd-ver-pop`·`erd-ver-rev`·`erd-readonly-chip`·`erd-readonly-pop`·`erd-legend-open`·`erd-start*`·`erd-reg-modal`.

- [ ] **Step 1: 실패하는 시험 — 버전 팝오버와 확정 창**

`T/page-render.test.ts` 에 도우미와 시험:
```ts
const openVersion = async () => { await click(byTestId("erd-ver-trigger")); await waitFor(() => byTestId("erd-ver-pop")); };
```
- `confirmDialogSurvivesPopoverClose`(Review Focus 4): 모델 고름 → `openVersion()` → `erd-ver-confirm` 클릭 → `erd-ver-pop` 없음(팝오버 닫힘) → `erd-confirm-dialog` 있음 → `erd-confirm-send` → `confirm` 호출 → 끝.
- 기존 버전 단추 시험(462-531줄 근처)은 단추를 누르기 전 `openVersion()`. `erd-rev` 비교는 `byTestId("erd-ver-trigger")?.dataset.rev` 로.
실행 → 실패.

- [ ] **Step 2: `VersionBar` 를 팝오버로**

- 바깥 요소: `<DetailPopover opened={open} onOpenChange={setOpen} title="버전" width={720} testId="erd-ver-pop-root" content={<div className="erd-ver-pop" data-testid="erd-ver-pop">…</div>}>` + 트리거 `<Button size="sm" data-testid="erd-ver-trigger" data-rev={s.rev} title={`번호 ${s.rev} · ${statusLabel}`}>버전 {s.ver} · {statusLabel} ▾</Button>`(`statusLabel` = `VersionStatusBadge` 와 같은 한국어. 그 부품의 라벨 함수가 export 되지 않으면 트리거 안에 `VersionStatusBadge` 를 그대로 둔다).
- 팝오버 본문: `<span data-testid="erd-ver-rev">번호 {s.rev}</span>` + `VersionActionBar`(지금 props 그대로, `onConfirm={() => { setOpen(false); setConfirmOpen(true); }}`, 공동 편집자 `trailing` 단추도 `setOpen(false)` 뒤 `setEditorsOpen(true)`).
- `ConfirmDialog`·`EditorsModal` 은 `DetailPopover` **밖**(VersionBar 가 돌려주는 Fragment 의 형제)에 둔다(U16).
- `versionButtons`: 켜진 단추에도 `title` 을 준다 — 새 버전 "확정본을 복사해 새 DRAFT 를 만듭니다(major = 큰 변경, minor = 작은 변경)", 삭제 "이 DRAFT 를 지웁니다", 확정 "검사 뒤 이 DRAFT 를 확정본으로 만듭니다", 선점 "이 DRAFT 의 소유자가 됩니다", 해제 "소유를 내려놓습니다". 꺼진 단추의 이유 글은 그대로.
- `T/version-bar.test.ts` 에 title 시험 하나(켜진 newVersion 에 title 있음).

- [ ] **Step 3: 비활성 [확정] 모양(U17)**

`core-styles.ts` 에:
```css
.erd-ver-pop [data-testid="erd-ver-confirm"]:disabled { background: var(--color-bg-disabled); border-color: var(--color-border); color: var(--color-text-disabled); }
```
브라우저에서 계산 스타일을 본다. shared Button 이 인라인 스타일·Mantine 변수로 칠해 이기지 못하면 이 줄을 지우고 레인 보고(승인 표 A2 로).

- [ ] **Step 4: `TopBar` 한 줄**

행 하나 `erd-bar__row`(flex-wrap: nowrap, 넘치면 요약 줄이 `…`):
1. 모델 단추(지금 그대로, `erd-model-{id}`) + `[+ 모델]`(`erd-reg-open`, `canReg` 일 때) → `ModelRegisterModal` 열기.
2. 요약 줄 `<span className="erd-bar__summary" data-testid="erd-summary" title={…같은 글}>{summaryText(modelSummary(model, status?.statuses ?? null, showAudit))}</span>`(고정 `min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`).
3. `VersionBar`(트리거). `TopBar` props 에 `versionSlot: ReactNode` 를 더해 `ErdViewer` 가 넘긴다(`VersionBar` 는 `ctx` 가 있을 때만).
4. 읽기 전용 칩(U19): `readOnlyKind(rights)` 가 있으면 `<DetailPopover opened={roOpen} onOpenChange={setRoOpen} content={<div data-testid="erd-readonly-pop">{readOnlyBanner(rights)}</div>}><Button size="xs" data-testid="erd-readonly-chip" title={shortReason(…)}>읽기 전용</Button></DetailPopover>`. 처음 한 번 저절로 열기: `ErdViewer` 효과 — `kind && loaded && !prefs.seenReadOnly.includes(`${modelId}:${kind}`)` 면 `setRoOpen(true)` + `update(p => withSeen(p, key))`.
5. 접속자(그대로). 6. 빈 칸. 7. [논리|물리] 단추 묶음(그대로 testid). `preset === "both"` 면 두 단추 `disabled`, `title` "논리+물리 동시 보기에서는 쓰지 않습니다"(C 14번). 8. 프리셋 단추 묶음(그대로). 9. `[범례]`(`erd-legend-open`, `DetailPopover` 로 Task 4 의 범례 표 — Task 3 에서는 자리 부품 `Legend` 를 `DiagramTree.tsx` 에서 export 해 쓴다. 내용은 Task 4). 10. `DB 에서 가져오기`(그대로 `erd-import`, 글 "DB 에서 가져오기").
- 지움: `erd-ver`·`erd-rev`·`erd-banner-readonly`·`erd-message` 줄·인라인 등록 줄. 끊김 띠는 그대로(행 아래).
- 모델 단추 묶음 앞 "모델" 라벨은 지운다(폭).

- [ ] **Step 5: `ModelRegisterModal`**

shared `Modal`(`title="새 모델 등록"`, `size="sm"`, `data-testid` 는 본문 `div` 에 `erd-reg-modal`). 칸 4개를 라벨과 함께(`<label htmlFor>` + `Input id`), 아래 도움글 "모델 ID 와 모듈은 보통 같습니다(예: mcm). 스키마는 DB 사용자(예: MCMAPUSER)." testid `erd-reg-{key}`·`erd-reg-submit`(지금 그대로). 등록 성공이면 닫고 실패면 열어 둔다(지금 `onRegister` 규칙).

- [ ] **Step 6: toast + live region(U20)**

`ErdViewer`:
```ts
const { showMessage } = useMessage();
const TOAST_MS: Record<MessageTone, number> = { info: 3000, warn: 5000, error: 8000 };
const ALERT: Record<MessageTone, "info" | "warning" | "error"> = { info: "info", warn: "warning", error: "error" };
const notify = useCallback((text: string, tone: MessageTone = "info") => {
  setMessage(text); setMessageTone(tone);
  showMessage({ message: text, alertType: ALERT[tone], toast: true, toastDuration: TOAST_MS[tone] });
}, [showMessage]);
```
JSX 에 `<div className="erd-sr-only" role="status" aria-live="polite" data-testid="erd-message" data-tone={messageTone}>{message ?? ""}</div>`. 시험 환경에 `MessageProvider` 가 있는지(`DmesUiProvider` 안) 확인 — `VersionActionBar` 가 이미 `useMessage` 를 쓰므로 있다. toast 가 happy-dom 에서 오류를 내면 `notifications` 흉내를 `vi.mock` 으로 두지 말고 레인 보고(먼저 실제로 돌려 본다).

- [ ] **Step 7: 빈 상태 시작 화면(U45)**

`S/panels/StartPanel.tsx`(`data-testid="erd-start"`):
```ts
export interface StartPanelProps {
  models: ErdModelRow[]; modelId: string | null; loading: boolean; error: string | null; empty: boolean;
  canReg: boolean; canImport: boolean; importLocked: boolean;
  onPick(modelId: string): void; onRegister(): void; onImport(): void;
}
```
- `modelId === null`: 모델이 없으면 "등록된 모델이 없습니다." + [새 모델 등록](`erd-start-reg`). 있으면 "열 모델을 고르세요." + 모델 카드 단추(`erd-start-model-{id}`, 글 `모델이름 · 모듈 · 스키마`) + [새 모델 등록].
- 읽는 중·오류: 지금 글("모델을 읽는 중입니다." / `erd.error`).
- `empty`(표 없음): "표가 없습니다. DB 스키마를 가져오면 표·관계를 만듭니다." + [DB 에서 가져오기](`erd-start-import`, `disabled={!canImport || importLocked}`, 꺼지면 `title` 이유).
- `erd-canvas-empty` testid 는 `StartPanel` 바깥 `div` 에 같이 단다(기존 시험 호환).
- 권한 없는 단추는 끄고 `title` "권한 없음".

- [ ] **Step 8: 화면 제목 숨김(U18)**

`S/page.tsx`: `<MdmPageLayout group="dma" screenId={SCREEN_ID} title="ERD 설계" className="erd-page">`. `core-styles.ts`:
```css
.page-layout.erd-page > .page-layout__header { display: none; }
```
`.page-layout__footer` 는 건드리지 않는다(하네스 신호). 다른 탭 화면 제목이 그대로인지 브라우저로 본다(MCM 컬럼 사전 탭을 같이 열어 둠).

- [ ] **Step 9: 시험 고치기·더하기**

- `erd-message` 비교 시험은 그대로 통과해야 한다(live region).
- `erd-banner-readonly` 2곳 → `byTestId("erd-readonly-chip")` 있음 + `title` 에 `shortReason(RELEASED_TEXT)` = "확정된 버전". 처음 저절로 열림: `erd-readonly-pop` 글에 "확정된 버전" 포함.
- 새 시험 `startPanelShowsModelCards`: 모델 목록 2개, prefs 없음 → `erd-start-model-mcm` 클릭 → view 호출.
- 새 시험 `summaryLineCountsByOneRule`: 상태 응답 `statuses` 에 TYPE 1·MISS 1·NEW 1 → `erd-summary` 글에 "고칠 위반 2".
- 새 시험 `topBarHasNoRevOrLlmText`: 모델 고른 뒤 `erd-bar` 글에 `rev `·`getChangesSince` 가 없다.

- [ ] **Step 10: 렌더 하네스(U47)**

`scripts/perf/render/screens.mjs` erdEdit 항목에 더함:
```js
    /** ⑤ 입력 — 컬럼 논리명 입력 칸(R12). 모델·표를 골라야 켜진다. 복제 PDB 에서 admin 이 DRAFT 소유자일 때만 편집 가능(L_MAIN admin 은 읽기 전용 → 건너뜀). */
    formPrepare: ['[data-testid^="erd-model-"]', '.react-flow__node'],
    formInput: 'input[data-testid="erd-grid-input"]',
```
`count-renders.mjs` ⑤ 앞(`if (screen.formInput)` 안 첫 줄):
```js
      for (const sel of screen.formPrepare ?? []) {
        const el = page.locator(`${VISIBLE_GRID}${sel}`).first();
        if (await el.isVisible().catch(() => false)) { await el.click(); await settle(page); }
      }
```
`README.md`(같은 폴더) 의 화면 정의 칸 표에 `formPrepare` 한 줄. 다른 화면 항목은 안 바꿈. 실행은 마감(Task 9 Step 7).

- [ ] **Step 11: 전체 시험·lint·audit**

- [ ] **Step 12: 커밋**

`feat(erd): UX 1차 위 막대 한 줄 — 요약·버전 펼침·읽기 전용 칩·toast·시작 화면·하네스 입력`. 레인 보고에 도움말 반영 메모(README 도움말 표 §2.2·§2.4·§3·§4.9·§4.10).

---

### Task 4: 문구 — 검토 패널·변경 기록·알림·확정 창·범례·색

**Files:**
- Modify: `S/panels/ReviewPanel.tsx`, `S/panels/ChangeLog.tsx`, `S/panels/NoticeBar.tsx`, `S/edit-context.ts`(`noticeFromRejection`), `S/ErdViewer.tsx`(되돌리기 글·`onRow`), `S/panels/ConfirmDialog.tsx`, `S/panels/DiagramTree.tsx`(범례·수), `S/canvas/erd-styles.ts`(색)
- Test: `T/panel-rows.test.ts`, `T/core-panels.test.ts`, `T/edit-core.test.ts`, `T/page-render.test.ts`

**Interfaces:**
- Consumes: Task 1(`labels.ts`·`violations.ts`·`shortReason`), U25·U27·U30-U36·U39.
- Produces: `historyRows` 새 모양(README 정본), `Legend` export(TopBar 범례 팝오버가 씀).

- [ ] **Step 1: 실패하는 시험 — 행 함수**

`T/panel-rows.test.ts`:
- `historyRows`: 정본 모양으로 `toEqual` 고침. 델타 `{ rev: 7, at: "2026-10-11T14:03:22", userId: "41000207", session: "claude-ab12cd34", source: "MCP", changes: [표 1 upsert, 감사 컬럼 8 upsert, 컬럼 1 upsert] }` → `{ at: "14:03"(시각 고정 now 주입), who: "41000207", whoTitle: "claude-ab12cd34 · Claude", source: "Claude", summary: "표 TB_A · 컬럼 TB_A.COL_X · 감사 컬럼 8" }`. 내 세션이면 `who: "나"`. `historyRows(view, mySession, model, now)` 로 서명이 바뀐다.
- `changeSummary`: `diagramNode` 57개 → "표 자리 57", 삭제는 앞에 "삭제: ". 이름 3개 넘으면 "컬럼 TB_A.X 외 2".
- `violationRows`: U25 규칙(NEW 빠짐, 감사 컬럼은 `showAudit` 일 때만) — 서명 `violationRows(model, status, showAudit)`.
- `inferredRows`: `evidence` = `evidenceText` 를 `, ` 로, 새 칸 `evidenceTitle`(원문), `rank` = 순위 1 은 "1", 그 밖 `${n}`.
실행 → 실패.

- [ ] **Step 2: `ChangeLog.tsx`**

- `changeSummary(d, model)`: 종류별로 묶는다. 이름: 표 = `value.phys ?? model.tables[id]?.phys ?? id`, 컬럼 = `${표 phys}.${컬럼 phys}`(값·모델에서), 관계 = `${자식 phys}→${부모 phys}`, 다이어그램 = `diagramName`. 컬럼 중 감사 컬럼(`isAuditColumn(phys)`)은 따로 세어 "감사 컬럼 n". `diagramNode` 는 수만 "표 자리 n". 묶음마다 이름 최대 1개 + " 외 n". 삭제(op `delete`)는 "삭제: …" 로 따로.
- 칸: `at`(머리 "시각", 70), `rev`(머리 "번호", 60, 오른쪽), `who`(머리 "사람", 120, `tooltip` = `whoTitle`), `source`(머리 "출처", 70), `summary`(머리 "내용", 나머지), `undo`(머리 "", 단추 `title` = 꺼지면 `undoReason`).
- props 에 `model: ErdModelJson`·`undoReason: string | null` 를 더한다(`ErdViewer` 가 `shortReason(rights.model.reason ?? rights.diagram.reason)`).
- 안내문(`historyNote`): "rev N" → "번호 N" 으로.

- [ ] **Step 3: `ReviewPanel.tsx`**

- 탭 이름: "표준 위반(n)", "추정 관계 검토(n)", "DB 다시 가져오기(n)"(읽기 전엔 수 없음), "변경 기록". 새로 읽기 단추 글 "새로 읽기".
- 위반 그리드 `onRowClick` = `ctx?.nav.selectColumn(String(row.id))`(U39). 추정 관계 그리드는 지금처럼 자식 표.
- 추정 관계 칸: 근거 `tooltip` = `evidenceTitle`, 후보 머리 "후보 순위"(머리 `headerTooltip` 있으면 "같은 자식 컬럼에 부모 후보가 여럿일 때의 순위. 1 이 가장 그럴듯함"), 판정 칸 머리 "판정", 단추 글 [맞음]·[아님](testid 그대로), 꺼지면 감싼 `span title={lockReason}`(`ReviewPanelProps.lockReason: string | null`, `ErdViewer` 가 `shortReason`).
- `violationRows` 에 `ctx.audit.show` 를 넘긴다.

- [ ] **Step 4: 알림(U27·U32)**

`edit-context.ts` `noticeFromRejection`:
```ts
const hint = r.userHint ?? null;            // r.hint 는 쓰지 않는다(LLM 용)
if (code === "CONFLICT" && who) message = `${who} 님이 먼저 바꿨습니다. 지금 값: ${valueText(r.current)}`;
if (code === "NOT_FOUND" && who) message = `${who} 님이 지웠습니다.`;
```
`ErdNotice` 에 `title: string | null` 을 더해 `byRev != null` 이면 `번호 ${byRev}` 를 둔다. `NoticeBar` 는 바깥 `div` 에 `title={notice.title ?? undefined}`. `blockedNotice` 의 hint "위 띠의 안내를 따르세요." → "[읽기 전용] 표시를 눌러 이유를 보세요.". `ErdViewer`: `notify(\`rev ${rev} 를 되돌렸습니다(rev ${out.rev}).\`)` → `notify("변경을 되돌렸습니다.")`. `api.ts` `rejectionText` = `r.userHint ? \`${r.message} — ${r.userHint}\` : r.message`(FE2 의 DbDiffApply 가 쓴다).

시험(`T/edit-core.test.ts`): 기존 CONFLICT 기대 글을 새 글로, `n.hint` 는 `userHint` 값, `hint` 만 있고 `userHint` 없으면 `n.hint === null`. 새 시험 `noticeShowsUserHintOnly`(Review Focus 6): `hint: "getChangesSince(212) 로 최신 값을 읽고 다시 보내세요"`, `userHint: "화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요."` → 렌더한 `NoticeBar` 글에 `getChangesSince` 없음, userHint 있음.

- [ ] **Step 5: 확정 창(U29·U30)**

`ConfirmDialog.tsx`:
- 묶음 머리 `{issueLabel(g.code)} · {g.count}건`, `title={g.code}`.
- 항목 글: `itemKey` 가 컬럼 id 면 `${표 phys}.${컬럼 phys}${logical ? \` (${logical})\` : ""}${isAuditColumn(phys) ? " · 감사 컬럼" : ""}`. 모르면 서버 `message`.
- `ERD_INFERRED_LEFT` 묶음은 그리지 않는다(요약 줄에 있음).
- 요약: `확정을 막는 문제 ${nErr}건 · 확인할 경고 ${nWarn - leftInferred}건 · 검토 안 한 추정 관계 ${inferred}건(확정을 막지 않음)`.
- 오류 머리 글 "이번 버전에서 넣거나 바꾼 컬럼이 표준에 맞지 않아 확정할 수 없습니다. 고친 뒤 다시 확정하세요.", 경고 머리 "기존 위반과 감사 컬럼 위반입니다. 확정을 막지 않습니다. 확인했으면 아래를 고르세요."
- 미래 시각 글에서 "(MDM006)" 를 뺀다.
- `T/core-panels.test.ts`: `groupIssues` 는 그대로, 렌더 시험 하나 — 감사 컬럼 항목에 "· 감사 컬럼", 머리에 "도메인 다름", `ERD_INFERRED_LEFT` 묶음 없음.

- [ ] **Step 6: 범례·목록 수(U25·U35)**

`DiagramTree.tsx`:
- 다이어그램별 위반 수를 `countTableViolations(model, t, statuses, showAudit)` 합으로(prop `showAudit` 더함). `title` "고칠 위반 컬럼 수(타입·도메인·사전 없음)".
- `export function Legend()`(`data-testid="erd-legend"`): 표 두 칸(견본 · 뜻). 견본은 CSS 상자(`.erd-legend__sw[data-k=…]`):
  - 선 실선(`--color-text`) = DB FK·확정 관계
  - 선 파선(`--color-warning`) = 추정 관계(검토 대기)
  - 행 바탕 `--color-danger-soft` = 사전 없음
  - 행 바탕 `--color-warning-soft` = 타입 불일치·도메인 다름
  - 머리의 빨간 수 = 고칠 위반 수
  - `감사 8` = 숨긴 감사 컬럼 수
  - `PK`·`FK`·`FK?` = 기본 키·외래 키·추정 외래 키
  - `다른 후보 n개` = 같은 자식 컬럼의 다른 부모 후보
  - 캔버스 바탕 푸른색 = 논리 모드, (U36 새 색) = 물리 모드
- 범례 아래 "배율이 낮으면 이름만, 더 낮으면 큰 이름판으로 보입니다(개요)." 한 줄(FE2 U50).
- 지금 범례 세 줄을 지운다. "[새 다이어그램]에서 놓을 수 있습니다" 안내는 그 단추가 꺼져 있으면 `shortReason` 을 붙인다(C 25번).

- [ ] **Step 7: 색 줄이기(U36)**

`erd-styles.ts`:
- `.erd-canvas[data-mode="physical"] .react-flow { background: <새 토큰>; }` — `src/frontend/shared` 의 토큰 정의(`grep -rn "\-\-color-bg-header\|--color-info-soft\|--color-bg-muted" src/frontend/shared/src`)에서 위반 행 색과 다른 연한 색을 고른다. 고른 토큰과 이유를 보고.
- `.erd-col__key[data-key="PK"] { color: var(--color-primary); }`, `.erd-viewer { background: var(--color-primary); }`(사람). Claude 이름표(`data-source="llm"`)는 그대로 `--color-success`.
- 범례 견본 규칙 `.erd-legend*` 를 같은 파일에.

- [ ] **Step 8: 비활성 이유 남은 곳**

- `ErdViewer` 가 `ReviewPanel` 에 `lockReason`, `ChangeLog` 에 `undoReason` 를 넘긴다.
- `readOnlyBanner` 긴 글은 읽기 전용 팝오버 한 곳에만(U19). `GridInputBar`·`DbDiffApply`·도구 막대는 FE2 가 `shortReason` 으로 바꾼다(Task 7·8).

- [ ] **Step 9: 화면 글 검사 시험**

`T/page-render.test.ts` 새 시험 `noMachineTermsOnScreen`: 모델 고름 → 네 탭을 차례로 펼침 → `document.body.textContent` 에 `getChangesSince`·`baseRev`·`getModelText`·`ERD_STD_`·`NAME_RULE`·`SQL_JOIN`·`rev ` 가 없다(`title` 속성은 textContent 에 안 든다).

- [ ] **Step 10: 전체 시험·lint·audit**

- [ ] **Step 11: 커밋**

`feat(erd): UX 1차 문구 — 쉬운 한국어·변경 기록 시각·위반 행 컬럼 고르기·범례 견본·색 줄이기`. 레인 보고에 도움말 반영 메모(§3.1·§4.1·§4.5·§4.7·§4.8·§6·문제 해결·용어집)와 바꾼 시험 목록.

---

## 계획 작성자 메모

- Task 1 은 FE2 가 기다리는 뼈대라 작게 잡았다. `ColumnGrid` 한 번 고침은 단계 2 Task 9 와 같은 "차례가 정해진 한 번 고침" 이다.
- `initialViewport` 는 첫 렌더에 캔버스 크기를 모를 수 있다. `defaultViewport` + `onInit` 두 번 맞춤으로 정했다. `fitView` prop 을 남겨 두면 저장 viewport 를 덮는다.
- 검토 탭의 DB 차이·변경 기록 읽기는 "펼쳤을 때만" 으로 바꿨다. 접힌 줄에서 탭 이름 건수는 위반·추정만 바로 보인다(지금과 같음).
- 위 막대 한 줄 폭은 모델 2개·1440 기준 어림이다. 넘치면 요약 줄이 먼저 줄어든다. 그래도 넘치면 프리셋 묶음을 `ContextMenu` [보기 ▾] 로 접는 안을 보고(이번 Task 에서 바로 하지 않음).
- toast 는 shared `useMessage` 의 Mantine notifications 다. happy-dom 렌더 시험에서 문제가 나면 그때 판단한다. live region 덕에 시험 판정은 toast 에 기대지 않는다.
- `StartPanel`·`ModelRegisterModal` 은 ERD 업무에 묶인 부품이라 shared 등록 대상이 아니다(Part B §18-1).
