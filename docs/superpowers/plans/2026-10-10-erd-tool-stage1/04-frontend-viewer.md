# ERD 도구 단계 1 — Task 7~9: 화면 상태·캔버스·화면 조립

> 공통 제약(Global Constraints)·단계 1 에서 정한 점(S1~S17)·Review Focus·인터페이스는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [03-frontend-shared.md](03-frontend-shared.md) · [README](README.md) · 다음: [05-scripts.md](05-scripts.md)

레인 FE2 가 Task 7 → 8 → 9 를 차례로 한다. Task 7 은 Task 6(shared `react-flow` 서브패스)에 기대지 않으므로 FE1 이 합쳐지기 전에 시작한다. Task 8 은 FE1 이 합쳐진 뒤 rebase 하고 시작한다.

공통 명령(모두 `src/frontend` 에서 부른다):

```bash
# 의존 패키지(shared 포함) 빌드 — m-mdm 시험은 @dk-oasis/shared/* 를 shared dist 로 푼다
pnpm --filter "@dk-oasis/m-mdm^..." build
# 이 문서의 시험만
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
# 타입 검사(lint = tsc --noEmit, shared dist/types 가 있어야 한다)
pnpm --filter @dk-oasis/m-mdm lint
```

화면 폴더는 `src/frontend/m-mdm/pages/dma/erdEdit/`(S11), 시험 폴더는 `src/frontend/m-mdm/tests/dma/erdEdit/` 다. m-mdm vitest 는 `tests/**/*.test.ts` 만 모으므로 렌더 시험도 `.test.ts` 로 쓰고 `createElement` 를 쓴다. `page.tsx` 는 Task 9 에서 만든다. 먼저 만들면 `tests/tsup-entries.smoke.test.ts`·`tests/package-exports.test.ts` 가 Task 7·8 실행에서 실패한다.

---

### Task 7: 화면 상태 — API·델타 적용·SSE 구독·화면 공유

**Files:**
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/types.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/api.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/state/model-delta.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/state/useErdModel.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/state/useErdStream.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/state/view-sync.ts`
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/erd-fixtures.ts` (시험 공용 모델, 시험 파일이 아니다)
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/{api,model-delta,view-sync,erd-stream}.test.ts`

**Interfaces:**
- Consumes: README "인터페이스"의 OASIS `erdEdit` 액션 표(`view` kind 없음·`sinceRev`·`STATUS`·`SET_VIEW`, `compare kind=DB_DIFF`, `reg`, `import kind=FROM_DB`, `save`)와 응답 모양(`ErdStatusView`·`ErdDbDiffView`·`ErdImportResult`), 단계 0 DTO(`ErdModelView`·`ErdChangesView`·`ErdApplyResult`·`ErdDelta`·`ErdChange`·`ErdPresence`·`ErdClaimView`), SSE 이벤트(`hello`·`change`·`reload`·`presence`·`claim`·`ping`). 기존 `@dk-oasis/shared/http`(`callOasisAt`), `@dk-oasis/shared/portal-shell`(`useTabPage`), `@/oasis-screen`.
- Produces (Task 8·9 가 쓴다):
  - `types.ts`: `ErdState`, `ErdModelJson`, `ErdTable`, `ErdColumn`, `ErdKey`, `ErdRelation`(`candidateRank?: number | null`), `ErdDiagram`, `ErdDiagramNode`, `ErdPresence`, `ErdClaim`, `ErdDelta`, `ErdChange`, `ErdColumnStatus`, `ErdStatusView`, `ErdDbDiffView`, `ErdDbDiffItem`, `ErdChangesView`, `ErdApplyResult`, `ErdImportResult`, `ErdRejection`, `ErdModelRow`, `ErdViewState`.
  - `api.ts`: `SCREEN_ID = "erdEdit"`, `searchModels()`, `viewModel(modelId, ver?)`, `viewChanges(modelId, sinceRev)`, `viewStatus(modelId, ver?)`, `setViewState(modelId, session, view)`, `compareDbDiff(modelId)`, `regModel(input)`, `importFromDb(modelId, baseRev, session)`, `decideRelation(modelId, baseRev, session, op, relationId)`, `rejectionText(rejection)`, `type RelationDecision`.
  - `state/model-delta.ts`: `fromView(view): ErdState`, `applyDelta(state, delta): DeltaOutcome`(`applied`·`stale`·`gap`), `nodeKey(diagram, table)`, `touchesColumns(delta)`.
  - `state/useErdModel.ts`: `useErdModel(modelId, load?) : ErdModelApi` (`state`, `loading`, `error`, `columnsSeq`, `reload`, `applyDelta`, `setPresence`, `setClaims`).
  - `state/useErdStream.ts`: `useErdStream(options): ErdStreamStatus`(`idle`·`connecting`·`open`·`lost`), `ErdStreamClient`, `streamUrl`, `backoffDelay`, `newSession`, `useTabActive`, `type EventSourceLike`.
  - `state/view-sync.ts`: `createViewSync(send, intervalMs?) : ViewSync`(`push`·`forget`·`dispose`), `VIEW_SYNC_MS = 1000`.

동작 규칙(스펙 4.4, 단계 0 구현 결정):
1. 모델은 `view`(kind 없음)로 한 번 읽고 `fromView` 로 푼다. `model` 은 MODEL_JSON 문자열이라 `JSON.parse` 한다.
2. SSE 는 모델을 읽은 뒤 `sinceRev=<읽은 rev>` 로 연다. 그래서 `hello` 는 보통 오지 않는다. 서버는 그 rev 뒤의 `change` 를 순서대로 다시 보낸다.
3. 델타 rev 가 지금 rev 이하이면 버린다. 지금 rev + 1 이 아니면 놓친 델타가 있으므로 모델 전체를 다시 읽는다.
4. `reload{rev}` 를 받으면(DRAFT 삭제·새 DRAFT) 모델 전체를 다시 읽는다. 다시 읽는 동안 온 `change` 는 모아 두었다가 응답 rev 보다 큰 것만 얹는다.
5. 끊기면 브라우저 자동 재연결을 쓰지 않는다. 연결을 닫고 "lost"(연결 끊김 띠)로 알린 뒤 1·2·4·8·15·30초 간격으로 그때의 rev 를 `sinceRev` 로 붙여 다시 연다. 이벤트를 하나라도 받으면 "open" 으로 돌린다.
6. 문서가 숨었거나 포털 탭이 비활성이면 다시 연결을 미루고, 다시 보이면 곧바로 연결한다(Screen-Performance R10·R14). 열린 연결은 닫지 않는다. 접속자·화면 상태가 연결에 묶여 있고 MCP `getCurrentView` 가 그것을 읽는다(스펙 D14).
7. 화면 상태(`view kind=SET_VIEW`)는 연결이 "open" 일 때만, 1초에 한 번 이하로 보낸다. 마지막 선택은 1초 뒤에 꼭 보낸다. 다시 연결되면 서버의 화면 상태가 비므로 같은 값도 다시 보낸다.

- [ ] **Step 1: 시험 공용 모델 작성**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-fixtures.ts`:

```ts
// ERD 화면 시험 공용 모델. 시험 파일이 아니다(vitest 는 *.test.ts 만 모은다).
import { fromView } from "../../../pages/dma/erdEdit/state/model-delta";
import type {
  ErdColumn, ErdDiagram, ErdDiagramNode, ErdModelJson, ErdModelView, ErdRelation, ErdState, ErdTable,
} from "../../../pages/dma/erdEdit/types";

export function table(phys: string, logical: string, columnOrder: string[] = []): ErdTable {
  return { phys, logical, comment: "", columnOrder, _rev: {} };
}

export function column(tableId: string, phys: string, logical: string, extra: Partial<ErdColumn> = {}): ErdColumn {
  return { table: tableId, phys, logical, domainId: null, dataType: "VARCHAR2", length: 30, scale: null, notNull: false,
    default: null, comment: "", _rev: {}, ...extra };
}

export function relation(child: string, parent: string, pairs: [string, string][], extra: Partial<ErdRelation> = {}): ErdRelation {
  return { child, parent, pairs, identifying: false, cardinality: { parent: "ONE", child: "ZERO_OR_MORE" }, state: "CONFIRMED",
    dbFk: false, evidence: [], parentRef: null, candidateRank: null, _rev: {}, ...extra };
}

export function emptyModel(): ErdModelJson {
  return { schemaVersion: 1, model: { module: "mcm", schema: "MCMAPUSER" }, tables: {}, columns: {}, keys: {}, relations: {} };
}

export function viewOf(model: ErdModelJson, over: Partial<ErdModelView> = {}): ErdModelView {
  return { modelId: "mcm", rev: 3, ver: "1.000", status: "DRAFT", ownerId: "tester", editors: [], rowVersion: 0,
    model: JSON.stringify(model), diagrams: [], nodes: [], presence: [], ...over };
}

export function stateOf(model: ErdModelJson, over: Partial<ErdModelView> = {}): ErdState {
  return fromView(viewOf(model, over));
}

/** 메뉴(t-1)·오브젝트(t-2) 두 표와 추정 관계 r-1(메뉴.OBJECT_ID → 오브젝트.OBJECT_ID). */
export function menuModel(): ErdModelJson {
  const m = emptyModel();
  m.tables["t-1"] = table("TB_MCM_SEC_MENU", "메뉴", ["c-1", "c-2", "c-4"]);
  m.tables["t-2"] = table("TB_MCM_SEC_OBJ", "오브젝트", ["c-3"]);
  m.columns["c-1"] = column("t-1", "MENU_ID", "메뉴아이디", { domainId: 12, notNull: true });
  m.columns["c-2"] = column("t-1", "OBJECT_ID", "오브젝트아이디", { length: 50 });
  m.columns["c-4"] = column("t-1", "MENU_NM", "메뉴명", { length: 200 });
  m.columns["c-3"] = column("t-2", "OBJECT_ID", "오브젝트아이디", { length: 50, notNull: true });
  m.keys["k-1"] = { table: "t-1", kind: "PK", name: "PK_TB_MCM_SEC_MENU", columns: ["c-1"] };
  m.keys["k-2"] = { table: "t-2", kind: "PK", name: "PK_TB_MCM_SEC_OBJ", columns: ["c-3"] };
  m.relations["r-1"] = relation("t-1", "t-2", [["c-2", "c-3"]], {
    state: "INFERRED", evidence: [{ kind: "NAME_RULE", ref: "PK 이름 일치" }],
  });
  return m;
}

export const MENU_DIAGRAMS: { diagrams: ErdDiagram[]; nodes: ErdDiagramNode[] } = {
  diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }],
  nodes: [
    { diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE" },
    { diagram: "d-all", table: "t-2", x: 400, y: 0, foldMode: "NONE" },
  ],
};

/** 표 n 개 × 컬럼 m 개. 다이어그램 d-all 에 가로 8개 격자(280×220, S8)로 놓는다. 첫 컬럼이 PK 다. */
export function bigState(n: number, m: number): ErdState {
  const model = emptyModel();
  const nodes: ErdDiagramNode[] = [];
  for (let i = 0; i < n; i++) {
    const t = `t-${i}`;
    const cols: string[] = [];
    for (let j = 0; j < m; j++) {
      const c = `c-${i}-${j}`;
      cols.push(c);
      model.columns[c] = column(t, `COL_${j}`, `컬럼${j}`);
    }
    model.tables[t] = table(`TB_T${String(i).padStart(3, "0")}`, `표${i}`, cols);
    model.keys[`k-${i}`] = { table: t, kind: "PK", name: `PK_T${i}`, columns: [cols[0]] };
    nodes.push({ diagram: "d-all", table: t, x: (i % 8) * 280, y: Math.floor(i / 8) * 220, foldMode: "NONE" });
  }
  return stateOf(model, { diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }], nodes });
}

/** EventSource 가짜 — 시험이 이벤트를 직접 보낸다(SSE 훅 시험·화면 시험 공용). */
export class FakeEventSource {
  static all: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    const e = { data: data === undefined ? "" : JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
}
```

- [ ] **Step 2: 실패하는 시험 작성 — API·델타·화면 공유**

`src/frontend/m-mdm/tests/dma/erdEdit/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compareDbDiff, decideRelation, importFromDb, rejectionText, searchModels, setViewState, viewChanges, viewStatus,
} from "../../../pages/dma/erdEdit/api";

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; body: { meta: { menuId: string }; params: Record<string, unknown> } }> = [];

function stub(result: unknown, success = true) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const meta = success ? { success: true } : { success: false, message: "이미 표가 있습니다" };
    return new Response(JSON.stringify({ meta, data: { result } }), { status: 200 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("erdEdit api", () => {
  it("search 는 data.result 배열을 돌려준다", async () => {
    stub([{ modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM 스키마", rev: 3, draftVer: "1.000", ownerId: "tester" }]);
    const rows = await searchModels();
    expect(rows.map((r) => r.modelId)).toEqual(["mcm"]);
    expect(calls[0].url).toBe("/api/mdm/oasis/erdEdit/search");
    expect(calls[0].body.meta.menuId).toBe("erdEdit");
  });

  it("SET_VIEW 는 view 액션에 viewJson 문자열로 보낸다", async () => {
    stub({ ok: true });
    await setViewState("mcm", "ui-abc", { diagramId: "d-1", selectedTables: ["t-1"] });
    expect(calls[0].url).toBe("/api/mdm/oasis/erdEdit/view");
    expect(calls[0].body.params).toEqual({
      modelId: "mcm", session: "ui-abc", kind: "SET_VIEW", viewJson: '{"diagramId":"d-1","selectedTables":["t-1"]}',
    });
  });

  it("STATUS·DB_DIFF·sinceRev 는 kind 와 숫자 0 을 그대로 싣는다", async () => {
    stub({});
    await viewStatus("mcm");
    await compareDbDiff("mcm");
    await viewChanges("mcm", 0);
    expect(calls.map((c) => [c.url.split("/").pop(), c.body.params])).toEqual([
      ["view", { modelId: "mcm", kind: "STATUS" }],
      ["compare", { modelId: "mcm", kind: "DB_DIFF" }],
      ["view", { modelId: "mcm", sinceRev: 0 }],
    ]);
  });

  it("관계 확정은 save 에 commandsJson 문자열을 보내고, 거절은 던지지 않고 applied=false 로 돌려준다", async () => {
    const rejection = { code: "NOT_EDITOR", commandIndex: 0, message: "이 DRAFT 를 고칠 권한이 없습니다", hint: "소유자에게 공동 편집자 등록을 요청하세요",
      elementId: null, property: null, byRev: null, bySession: null, current: null, choices: null, ownerId: "owner" };
    stub({ applied: false, rev: 0, changes: [], warnings: [], rejection });
    const r = await decideRelation("mcm", 0, "ui-abc", "confirmRelation", "r-1");
    expect(calls[0].url).toBe("/api/mdm/oasis/erdEdit/save");
    expect(calls[0].body.params).toEqual({
      modelId: "mcm", baseRev: 0, session: "ui-abc", source: "UI", commandsJson: '[{"op":"confirmRelation","id":"r-1"}]',
    });
    expect(r.applied).toBe(false);
    expect(rejectionText(r.rejection)).toBe("이 DRAFT 를 고칠 권한이 없습니다 — 소유자에게 공동 편집자 등록을 요청하세요");
  });

  it("가져오기는 import 액션에 kind=FROM_DB 와 baseRev 를 보내고, 업무 거부는 Error 로 던진다", async () => {
    stub({ applied: true, rev: 1, changes: [], warnings: [], rejection: null, summary: null });
    await importFromDb("mcm", 0, "ui-abc");
    expect(calls[0].url).toBe("/api/mdm/oasis/erdEdit/import");
    expect(calls[0].body.params).toEqual({ modelId: "mcm", baseRev: 0, session: "ui-abc", source: "UI", kind: "FROM_DB" });
    stub(null, false);
    await expect(importFromDb("mcm", 0, "ui-abc")).rejects.toThrow("이미 표가 있습니다");
  });
});
```

`src/frontend/m-mdm/tests/dma/erdEdit/model-delta.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { applyDelta, nodeKey, touchesColumns } from "../../../pages/dma/erdEdit/state/model-delta";
import type { ErdChange, ErdDelta, ErdState } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, column, menuModel, stateOf, table } from "./erd-fixtures";

const v = (x: object) => x as Record<string, unknown>;
const delta = (rev: number, changes: ErdChange[]): ErdDelta => ({ modelId: "mcm", rev, userId: "u", session: "s", source: "UI", changes });

function applied(s: ErdState, d: ErdDelta): ErdState {
  const out = applyDelta(s, d);
  if (out.kind !== "applied") throw new Error(`applied 가 아니다: ${out.kind}`);
  return out.state;
}

describe("fromView", () => {
  it("MODEL_JSON 문자열을 풀고 다이어그램 노드를 '다이어그램:표' 키로 둔다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    expect(s.rev).toBe(3);
    expect(s.model.tables["t-1"].phys).toBe("TB_MCM_SEC_MENU");
    expect(Object.keys(s.nodes)).toEqual(["d-all:t-1", "d-all:t-2"]);
    expect(s.diagrams["d-all"].diagramName).toBe("전체");
    expect(s.claims).toEqual([]);
  });
});

describe("applyDelta", () => {
  it("upsert 는 요소를 넣고 rev 를 올린다. 건드리지 않은 모음은 참조를 그대로 둔다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const next = applied(s, delta(4, [
      { kind: "table", id: "t-9", op: "upsert", value: v(table("TB_NEW", "새 표", ["c-9"])) },
      { kind: "column", id: "c-9", op: "upsert", value: v(column("t-9", "NEW_ID", "새아이디")) },
    ]));
    expect(next.rev).toBe(4);
    expect(next.model.tables["t-9"].phys).toBe("TB_NEW");
    expect(next.model.columns["c-9"].table).toBe("t-9");
    expect(next.model.keys).toBe(s.model.keys);
    expect(next.model.relations).toBe(s.model.relations);
    expect(next.diagrams).toBe(s.diagrams);
    expect(next.nodes).toBe(s.nodes);
    expect(s.model.tables["t-9"]).toBeUndefined();
  });

  it("delete 는 지우고, patch 는 준 속성만 덮는다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const next = applied(s, delta(4, [
      { kind: "column", id: "c-4", op: "delete", value: null },
      { kind: "relation", id: "r-1", op: "patch", value: { state: "CONFIRMED" } },
    ]));
    expect(next.model.columns["c-4"]).toBeUndefined();
    expect(next.model.relations["r-1"].state).toBe("CONFIRMED");
    expect(next.model.relations["r-1"].pairs).toEqual([["c-2", "c-3"]]);
    expect(next.model.tables).toBe(s.model.tables);
  });

  it("diagram·diagramNode 를 반영한다. diagramNode id 는 '다이어그램:표' 다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const next = applied(s, delta(4, [
      { kind: "diagram", id: "d-2", op: "upsert", value: { id: "d-2", areaName: "시스템", diagramName: "메뉴", sortSeq: 1 } },
      { kind: "diagramNode", id: nodeKey("d-2", "t-1"), op: "upsert", value: { diagram: "d-2", table: "t-1", x: 10, y: 20, foldMode: "KEYS" } },
      { kind: "diagramNode", id: nodeKey("d-all", "t-2"), op: "delete", value: null },
    ]));
    expect(next.diagrams["d-2"].diagramName).toBe("메뉴");
    expect(next.nodes["d-2:t-1"].foldMode).toBe("KEYS");
    expect(next.nodes["d-all:t-2"]).toBeUndefined();
    expect(next.model).toBe(s.model);
  });

  it("이미 반영한 rev 는 stale, rev 를 건너뛰면 gap 이다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    expect(applyDelta(s, delta(3, [])).kind).toBe("stale");
    expect(applyDelta(s, delta(2, [])).kind).toBe("stale");
    expect(applyDelta(s, delta(5, [])).kind).toBe("gap");
  });

  it("touchesColumns 는 표·컬럼 변경만 참으로 본다", () => {
    expect(touchesColumns(delta(4, [{ kind: "relation", id: "r-1", op: "patch", value: { state: "REJECTED" } }]))).toBe(false);
    expect(touchesColumns(delta(4, [{ kind: "column", id: "c-1", op: "delete", value: null }]))).toBe(true);
  });
});
```

`src/frontend/m-mdm/tests/dma/erdEdit/view-sync.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createViewSync } from "../../../pages/dma/erdEdit/state/view-sync";
import type { ErdViewState } from "../../../pages/dma/erdEdit/types";

const view = (diagramId: string, ...selectedTables: string[]): ErdViewState => ({ diagramId, selectedTables });

describe("createViewSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("첫 값은 바로, 1초 안의 값은 모아 마지막 값 하나만 1초 뒤에 보낸다", () => {
    const sent: ErdViewState[] = [];
    const sync = createViewSync((v) => sent.push(v));
    sync.push(view("d-1"));
    sync.push(view("d-1", "t-1"));
    sync.push(view("d-1", "t-2"));
    expect(sent).toEqual([view("d-1")]);
    vi.advanceTimersByTime(999);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([view("d-1"), view("d-1", "t-2")]);
  });

  it("마지막으로 보낸 값과 같으면 보내지 않고, forget 뒤에는 같은 값도 다시 보낸다", () => {
    const sent: ErdViewState[] = [];
    const sync = createViewSync((v) => sent.push(v));
    sync.push(view("d-1", "t-2", "t-1"));
    vi.advanceTimersByTime(2000);
    sync.push(view("d-1", "t-1", "t-2"));
    expect(sent).toHaveLength(1);
    sync.forget();
    vi.advanceTimersByTime(2000);
    sync.push(view("d-1", "t-1", "t-2"));
    expect(sent).toHaveLength(2);
  });

  it("dispose 하면 기다리던 값을 보내지 않는다", () => {
    const sent: ErdViewState[] = [];
    const sync = createViewSync((v) => sent.push(v));
    sync.push(view("d-1"));
    sync.push(view("d-2"));
    sync.dispose();
    vi.advanceTimersByTime(5000);
    expect(sent).toEqual([view("d-1")]);
  });
});
```

- [ ] **Step 3: 실패하는 시험 작성 — SSE 구독(Review Focus 4)**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-stream.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { act, createElement, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useErdModel } from "../../../pages/dma/erdEdit/state/useErdModel";
import { ErdStreamClient, backoffDelay, newSession, streamUrl, useErdStream } from "../../../pages/dma/erdEdit/state/useErdStream";
import type { ErdDelta, ErdModelView } from "../../../pages/dma/erdEdit/types";
import { FakeEventSource as FakeES, emptyModel, table, viewOf } from "./erd-fixtures";

const factory = (url: string) => new FakeES(url);

function viewAt(rev: number, ...tableIds: string[]): ErdModelView {
  const m = emptyModel();
  for (const id of tableIds) m.tables[id] = table(`TB_${id.toUpperCase().replace("-", "_")}`, id);
  return viewOf(m, { rev });
}
const addTable = (rev: number, id: string): ErdDelta => ({
  modelId: "mcm", rev, userId: "other", session: "claude-a", source: "MCP",
  changes: [{ kind: "table", id, op: "upsert", value: table(`TB_${id}`, id) as unknown as Record<string, unknown> }],
});

describe("ErdStreamClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeES.all = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function client(rev: number | null = 5) {
    const statuses: string[] = [];
    const got: string[] = [];
    const c = new ErdStreamClient({
      modelId: "mcm", session: "ui-a", factory, lastRev: () => rev, onStatus: (s) => statuses.push(s),
      handlers: {
        onHello: (r) => got.push(`hello ${r}`), onDelta: (d) => got.push(`change ${d.rev}`), onReload: (r) => got.push(`reload ${r}`),
        onPresence: (p) => got.push(`presence ${p.length}`), onClaims: (l) => got.push(`claim ${l.length}`),
      },
    });
    return { c, statuses, got };
  }

  it("streamUrl 은 세션과 출처 UI 를 싣고, rev 가 있을 때만 sinceRev 를 붙인다", () => {
    expect(streamUrl("mcm", "ui-a", 5)).toBe("/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/mcm?session=ui-a&source=UI&sinceRev=5");
    expect(streamUrl("mcm", "ui-a", null)).toBe("/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/mcm?session=ui-a&source=UI");
    expect(newSession(() => 0)).toBe("ui-00000000");
  });

  it("끊기면 연결을 닫고 lost 로 알린 뒤 1초·2초 간격으로 그때의 rev 를 붙여 다시 연다", () => {
    const { c, statuses } = client();
    c.start();
    FakeES.all[0].emit("open");
    FakeES.all[0].emit("error");
    expect(FakeES.all[0].closed).toBe(true);
    expect(statuses).toEqual(["connecting", "open", "lost"]);
    vi.advanceTimersByTime(999);
    expect(FakeES.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeES.all).toHaveLength(2);
    expect(FakeES.all[1].url).toContain("sinceRev=5");
    FakeES.all[1].emit("error");
    vi.advanceTimersByTime(1999);
    expect(FakeES.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeES.all).toHaveLength(3);
    expect(statuses.at(-1)).toBe("lost"); // 다시 여는 동안 띠를 내리지 않는다
    FakeES.all[2].emit("ping", { at: "2026-10-11T00:00:00Z" });
    expect(statuses.at(-1)).toBe("open");
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(9)).toBe(30000);
  });

  it("숨은 동안은 다시 열지 않고, 보이면 곧바로 연다. 열린 연결은 숨어도 닫지 않는다", () => {
    const { c } = client();
    c.start();
    FakeES.all[0].emit("open");
    c.setAllowed(false);
    expect(FakeES.all[0].closed).toBe(false);
    FakeES.all[0].emit("error");
    vi.advanceTimersByTime(60000);
    expect(FakeES.all).toHaveLength(1);
    c.setAllowed(true);
    expect(FakeES.all).toHaveLength(2);
  });

  it("이벤트를 처리기로 넘기고, 닫은 연결의 늦은 이벤트와 같은 상태의 ping 은 무시한다", () => {
    const { c, statuses, got } = client();
    c.start();
    const es = FakeES.all[0];
    es.emit("hello", { rev: 5 });
    es.emit("change", addTable(6, "t-1"));
    es.emit("presence", [{ session: "ui-b" }]);
    es.emit("claim", []);
    es.emit("reload", { rev: 9 });
    es.emit("ping", { at: "x" });
    expect(got).toEqual(["hello 5", "change 6", "presence 1", "claim 0", "reload 9"]);
    expect(statuses).toEqual(["connecting", "open"]);
    c.stop();
    es.emit("change", addTable(7, "t-2"));
    expect(got).toHaveLength(5);
  });
});

describe("useErdModel + useErdStream", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeES.all = [];
    // 문서가 보이는 상태로 고정한다(숨은 문서면 연결을 미룬다).
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
    vi.useRealTimers();
  });

  function Harness({ load }: { load: (id: string) => Promise<ErdModelView> }) {
    const m = useErdModel("mcm", load);
    const handlers = useMemo(() => ({
      onHello: () => undefined, onDelta: m.applyDelta, onReload: () => void m.reload(), onPresence: m.setPresence, onClaims: m.setClaims,
    }), [m.applyDelta, m.reload, m.setPresence, m.setClaims]);
    const status = useErdStream({ modelId: "mcm", session: "ui-t", ready: m.state !== null, lastRev: m.state?.rev ?? null, handlers, factory });
    return createElement("div", {
      "data-testid": "h", "data-status": status, "data-rev": String(m.state?.rev ?? ""),
      "data-tables": Object.keys(m.state?.model.tables ?? {}).join(","),
    });
  }

  async function mount(load: (id: string) => Promise<ErdModelView>) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(Harness, { load }));
    });
    await act(async () => undefined);
  }
  const attr = (name: string) => host.querySelector('[data-testid="h"]')!.getAttribute(name);

  it("streamReloadRefetchesModel", async () => {
    const load = vi.fn(async (_id: string) => viewAt(5, "t-a"));
    await mount(load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(FakeES.all).toHaveLength(1);
    expect(FakeES.all[0].url).toContain("sinceRev=5");
    act(() => FakeES.all[0].emit("open"));
    expect(attr("data-status")).toBe("open");

    // 끊김 → 끊김 띠
    act(() => FakeES.all[0].emit("error"));
    expect(attr("data-status")).toBe("lost");

    // 1초 뒤 다시 연결(sinceRev=5). 그사이 DRAFT 를 새로 만들어 서버가 reload{9} 를 보낸다.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeES.all).toHaveLength(2);
    expect(FakeES.all[1].url).toContain("sinceRev=5");
    let resolve!: (v: ErdModelView) => void;
    load.mockImplementationOnce(() => new Promise<ErdModelView>((r) => { resolve = r; }));
    await act(async () => {
      FakeES.all[1].emit("reload", { rev: 9 });
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith("mcm");
    expect(attr("data-status")).toBe("open"); // 띠를 내린다

    // 다시 읽는 동안 온 델타: rev 7 은 응답(rev 9)에 이미 있으므로 버리고, rev 10 만 얹는다.
    act(() => {
      FakeES.all[1].emit("change", addTable(7, "t-stale"));
      FakeES.all[1].emit("change", addTable(10, "t-new"));
    });
    await act(async () => {
      resolve(viewAt(9, "t-b"));
    });
    expect(attr("data-rev")).toBe("10");
    expect(attr("data-tables")).toBe("t-b,t-new");
  });

  it("rev 를 건너뛴 델타를 받으면 모델 전체를 다시 읽는다", async () => {
    const load = vi.fn(async (_id: string) => viewAt(5, "t-a"));
    await mount(load);
    load.mockImplementationOnce(async () => viewAt(8, "t-a", "t-c"));
    await act(async () => {
      FakeES.all[0].emit("change", addTable(8, "t-c"));
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(attr("data-rev")).toBe("8");
    expect(attr("data-tables")).toBe("t-a,t-c");
  });
});
```

- [ ] **Step 4: 시험이 실패하는지 확인**

Run: `cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: FAIL — `Failed to resolve import "../../../pages/dma/erdEdit/api"`(그리고 `state/model-delta`·`state/view-sync`·`state/useErdStream`) 로 4개 파일이 모두 실패한다.

- [ ] **Step 5: 구현 — `types.ts`**

`src/frontend/m-mdm/pages/dma/erdEdit/types.ts`:

```ts
/**
 * ERD 설계(erdEdit) 화면 타입 — 서버 응답·모델 JSON·SSE 본문의 모양.
 * 정본: 단계 1 계획 README "인터페이스", 단계 0 DTO(ErdModelView·ErdChangesView·ErdApplyResult·ErdDelta·ErdChange·ErdPresence·ErdClaimView),
 * 모델 JSON(스펙 3.1, ErdModel). 시각 필드는 ISO 문자열이다(Local-Rules §48).
 */
export type ErdColumnStatus = "OK" | "ALIAS" | "NEW" | "TYPE" | "DOMAIN" | "MISS";
export type ErdRelationState = "DB" | "INFERRED" | "CONFIRMED" | "REJECTED";
export type ErdFoldMode = "NONE" | "KEYS" | "NAME";
export type ErdSource = "UI" | "MCP" | "CLI" | "SYSTEM";

/** 속성마다 마지막으로 바꾼 [rev, 세션](스펙 4.3). */
export interface PropRev { rev: number; session: string }
type Revs = Record<string, PropRev>;

export interface ErdTable { phys: string; logical: string; comment: string | null; columnOrder: string[]; _rev?: Revs }

export interface ErdColumn {
  table: string; phys: string; logical: string; domainId: number | null;
  dataType: string | null; length: number | null; scale: number | null; notNull: boolean;
  default: string | null; comment: string | null; _rev?: Revs;
}

export interface ErdKey { table: string; kind: "PK" | "UK" | "IX"; name: string; columns: string[]; _rev?: Revs }

export interface ErdEvidence { kind: "DB_FK" | "DOC" | "SQL_JOIN" | "NAME_RULE"; ref: string }

export interface ErdRelation {
  child: string;
  parent: string;
  /** [자식 컬럼 id, 부모 컬럼 id] 쌍. */
  pairs: [string, string][];
  identifying: boolean;
  cardinality: { parent: string; child: string };
  state: ErdRelationState;
  dbFk: boolean;
  evidence: ErdEvidence[];
  parentRef: { model: string; table: string; columns: string[] } | null;
  /** 허브 후보 순위(S7). 허브가 아니면 null, 가장 가까운 후보 1, 나머지 2..n. 단계 0 모델에는 없다. */
  candidateRank?: number | null;
  _rev?: Revs;
}

export interface ErdModelJson {
  schemaVersion: number;
  model: { module: string; schema: string };
  tables: Record<string, ErdTable>;
  columns: Record<string, ErdColumn>;
  keys: Record<string, ErdKey>;
  relations: Record<string, ErdRelation>;
  _tombstones?: Record<string, PropRev>;
}

export interface ErdDiagram { id: string; areaName: string; diagramName: string; sortSeq: number }
export interface ErdDiagramNode { diagram: string; table: string; x: number; y: number; foldMode: ErdFoldMode }
export interface ErdPresence { session: string; userId: string; source: ErdSource; diagramId: string | null; selectedTables: string[]; at: string }
export interface ErdClaim { tableId: string; session: string; userId: string; expiresAt: string }

/** search 응답 행. */
export interface ErdModelRow {
  modelId: string; moduleId: string; schemaName: string; modelName: string; rev: number; draftVer: string | null; ownerId: string | null;
}

/** view(kind 없음) 응답. model 은 MODEL_JSON 문자열이다. */
export interface ErdModelView {
  modelId: string; rev: number; ver: string; status: string; ownerId: string | null; editors: string[]; rowVersion: number;
  model: string; diagrams: ErdDiagram[]; nodes: ErdDiagramNode[]; presence: ErdPresence[];
}

export type ErdChangeKind = "table" | "column" | "key" | "relation" | "diagram" | "diagramNode";

/** 델타 한 건. upsert 면 요소 JSON 전체, delete 면 null, patch 면 바뀐 속성만(되돌리기). diagramNode id 는 "다이어그램:표". */
export interface ErdChange { kind: ErdChangeKind; id: string; op: "upsert" | "delete" | "patch"; value: Record<string, unknown> | null }
export interface ErdDelta { modelId: string; rev: number; userId: string; session: string; source: ErdSource; changes: ErdChange[] }
export interface ErdChangesView { rev: number; reload: boolean; deltas: ErdDelta[] }

export interface ErdRejection {
  code: string; commandIndex: number; message: string; hint: string | null; elementId: string | null; property: string | null;
  byRev: number | null; bySession: string | null; current: unknown; choices: unknown; ownerId: string | null;
}
export interface ErdWarning { code: string; elementId: string | null; message: string; claimedBy: string | null; expiresAt: string | null }
export interface ErdApplyResult { applied: boolean; rev: number; changes: ErdChange[]; warnings: ErdWarning[]; rejection: ErdRejection | null }

export interface ErdImportSummary {
  tables: number; columns: number; keys: number; relations: Partial<Record<"DB" | "INFERRED", number>>; diagramId: string;
}
/** import 응답 = ErdApplyResult + summary(거절이면 null). */
export interface ErdImportResult extends ErdApplyResult { summary: ErdImportSummary | null }

export interface ErdStatusView {
  modelId: string;
  ver: string;
  rev: number;
  statuses: Record<string, ErdColumnStatus>;
  /** 모델에 쓰인 domainId 만. 키는 domainId 문자열. */
  domains: Record<string, { name: string; dataType: string | null; length: number | null; scale: number | null }>;
  counts: Record<ErdColumnStatus, number>;
  elapsedMs: number;
}

export type ErdDbDiffKind =
  | "TABLE_ADDED" | "TABLE_REMOVED" | "COLUMN_ADDED" | "COLUMN_REMOVED" | "COLUMN_CHANGED" | "FK_ADDED" | "FK_REMOVED";
export interface ErdColumnSpec { dataType: string | null; length: number | null; scale: number | null; notNull: boolean }
export interface ErdDbDiffItem {
  id: string; kind: ErdDbDiffKind; table: string; column: string | null; before: ErdColumnSpec | null; after: ErdColumnSpec | null;
}
export interface ErdDbDiffView { modelId: string; rev: number; schema: string; items: ErdDbDiffItem[] }

/** SET_VIEW 본문(viewJson). */
export interface ErdViewState { diagramId: string | null; selectedTables: string[] }

/** 화면이 들고 있는 모델(스펙 4.4 아래층). nodes 키는 "다이어그램:표"(ErdChange diagramNode id 와 같다). */
export interface ErdState {
  modelId: string; rev: number; ver: string; status: string; ownerId: string | null; editors: string[]; rowVersion: number;
  model: ErdModelJson;
  diagrams: Record<string, ErdDiagram>;
  nodes: Record<string, ErdDiagramNode>;
  presence: ErdPresence[];
  claims: ErdClaim[];
}
```

- [ ] **Step 6: 구현 — `api.ts`**

`src/frontend/m-mdm/pages/dma/erdEdit/api.ts`:

```ts
/**
 * erdEdit 화면의 OASIS 호출 — `POST /api/mdm/oasis/erdEdit/{action}`(단계 0 BPMN + 단계 1 의 kind·import).
 * - OASIS params 는 배열을 싣지 못하므로 viewJson·commandsJson 은 JSON 문자열로 보낸다.
 * - search 응답은 목록이라 `data.result` 가 배열이다. 공통 계약(merge "data+result")은 객체만 펴므로 `result` 를 그대로 읽는다.
 * - save·import 의 명령 거절(INVALID·CONFLICT·NOT_EDITOR 등)은 성공 응답의 `applied=false`·`rejection` 으로 온다. 던지지 않는다.
 *   업무 오류(MDM0xx, 권한 등)는 `meta.success=false` 라 Error 로 던진다.
 */
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel, plainError } from "@/oasis-screen";

import type {
  ErdApplyResult, ErdChangesView, ErdDbDiffView, ErdImportResult, ErdModelRow, ErdModelView, ErdRejection, ErdStatusView, ErdViewState,
} from "./types";

export const SCREEN_ID = "erdEdit";

/** 서버 field → 화면 항목명(오류 문구용). */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  MODEL_ID: "모델 ID",
  MODULE_ID: "모듈",
  SCHEMA_NAME: "스키마",
  MODEL_NAME: "모델 이름",
  BASE_REV: "기준 rev",
  VIEW_JSON: "화면 상태",
};

const OASIS: OasisCallOptions = { omit: "nullish+blank", merge: "data+result", fieldLabel: mdmFieldLabel(FIELD_LABELS), errorFactory: plainError };

function call<T>(action: string, params: object): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SCREEN_ID, action, params, undefined, OASIS);
}

export async function searchModels(): Promise<ErdModelRow[]> {
  const out = await call<{ result?: unknown }>("search", {});
  return Array.isArray(out.result) ? (out.result as ErdModelRow[]) : [];
}

/** 모델 전체. ver 를 빼면 서버가 DRAFT, 없으면 최신 RELEASED 를 고른다. */
export function viewModel(modelId: string, ver?: string | null): Promise<ErdModelView> {
  return call("view", { modelId, ver });
}

/** sinceRev 뒤의 변경 기록(500건 초과·다시 읽기 지점이면 reload=true). */
export function viewChanges(modelId: string, sinceRev: number): Promise<ErdChangesView> {
  return call("view", { modelId, sinceRev });
}

export function viewStatus(modelId: string, ver?: string | null): Promise<ErdStatusView> {
  return call("view", { modelId, ver, kind: "STATUS" });
}

/** 화면 상태 알리기(S1). SSE 에 연결된 세션만 받는다(아니면 INVALID). */
export function setViewState(modelId: string, session: string, view: ErdViewState): Promise<{ ok: boolean }> {
  return call("view", { modelId, session, kind: "SET_VIEW", viewJson: JSON.stringify(view) });
}

export function compareDbDiff(modelId: string): Promise<ErdDbDiffView> {
  return call("compare", { modelId, kind: "DB_DIFF" });
}

export interface RegInput {
  modelId: string;
  moduleId: string;
  schemaName: string;
  modelName: string;
}

export function regModel(input: RegInput): Promise<{ modelId: string }> {
  return call("reg", input);
}

/** 첫 가져오기(S3). 표가 이미 있으면 applied=false·INVALID. */
export function importFromDb(modelId: string, baseRev: number, session: string): Promise<ErdImportResult> {
  return call("import", { modelId, baseRev, session, source: "UI", kind: "FROM_DB" });
}

export type RelationDecision = "confirmRelation" | "rejectRelation";

/** 관계 확정·기각(S14) — save 에 명령 하나. */
export function decideRelation(modelId: string, baseRev: number, session: string, op: RelationDecision, relationId: string): Promise<ErdApplyResult> {
  return call("save", { modelId, baseRev, session, source: "UI", commandsJson: JSON.stringify([{ op, id: relationId }]) });
}

/** 거절 문구 — 다음에 할 일(hint)까지 붙인다(스펙 4.5). */
export function rejectionText(r: ErdRejection | null): string {
  if (!r) return "요청이 거절되었습니다.";
  return r.hint ? `${r.message} — ${r.hint}` : r.message;
}
```

- [ ] **Step 7: 구현 — `state/model-delta.ts`**

`src/frontend/m-mdm/pages/dma/erdEdit/state/model-delta.ts`:

```ts
/**
 * ERD 델타 적용기(스펙 4.4 아래층) — view 응답을 화면 상태로 풀고, SSE change(ErdDelta)를 rev 순서대로 얹는다. React 의존이 없다.
 * - rev 가 지금 rev 이하면 이미 반영한 것(stale)이다. save 응답을 먼저 얹고 같은 rev 의 SSE 가 뒤에 와도 두 번 얹지 않는다.
 * - rev 가 지금 rev + 1 이 아니면 사이 델타를 놓친 것(gap)이다. 호출자는 모델 전체를 다시 읽는다.
 *   서버는 rev 마다 change 하나를 보내고, DRAFT 표지 rev 는 reload 로 보낸다(단계 0). 그래서 rev 는 빈틈없이 이어진다.
 * - 바뀐 모음만 새 객체로 바꾸고 나머지는 참조를 그대로 둔다(캔버스 참조 안정, Local-Rules §19). 입력은 바꾸지 않는다.
 */
import type { ErdChange, ErdDelta, ErdModelJson, ErdModelView, ErdState } from "../types";

export const nodeKey = (diagram: string, table: string): string => `${diagram}:${table}`;

export function fromView(v: ErdModelView): ErdState {
  const model = JSON.parse(v.model) as ErdModelJson;
  const diagrams: ErdState["diagrams"] = {};
  for (const d of v.diagrams) diagrams[d.id] = d;
  const nodes: ErdState["nodes"] = {};
  for (const n of v.nodes) nodes[nodeKey(n.diagram, n.table)] = n;
  return {
    modelId: v.modelId, rev: v.rev, ver: v.ver, status: v.status, ownerId: v.ownerId, editors: v.editors, rowVersion: v.rowVersion,
    model, diagrams, nodes, presence: v.presence, claims: [],
  };
}

type ModelCollection = "tables" | "columns" | "keys" | "relations";

const MODEL_COLLECTION: Partial<Record<ErdChange["kind"], ModelCollection>> = {
  table: "tables", column: "columns", key: "keys", relation: "relations",
};

/** 이미 복사한 모음에 변경 하나를 쓴다. patch 는 있는 요소에만 덮는다(없으면 무시 — 뒤이은 gap 이 다시 읽게 한다). */
function put(coll: Record<string, unknown>, c: ErdChange): void {
  if (c.op === "delete") {
    delete coll[c.id];
    return;
  }
  if (c.value === null) return;
  if (c.op === "patch") {
    const prev = coll[c.id];
    if (prev !== undefined) coll[c.id] = { ...(prev as object), ...c.value };
    return;
  }
  coll[c.id] = c.value;
}

export type DeltaOutcome = { kind: "applied"; state: ErdState } | { kind: "stale" } | { kind: "gap" };

export function applyDelta(state: ErdState, d: ErdDelta): DeltaOutcome {
  if (d.rev <= state.rev) return { kind: "stale" };
  if (d.rev !== state.rev + 1) return { kind: "gap" };
  let model: ErdModelJson = state.model;
  let diagrams = state.diagrams;
  let nodes = state.nodes;
  const copied = new Set<ModelCollection>();
  for (const c of d.changes) {
    const name = MODEL_COLLECTION[c.kind];
    if (name) {
      if (model === state.model) model = { ...state.model };
      if (!copied.has(name)) {
        (model as unknown as Record<ModelCollection, object>)[name] = { ...model[name] };
        copied.add(name);
      }
      put(model[name] as unknown as Record<string, unknown>, c);
    } else if (c.kind === "diagram") {
      if (diagrams === state.diagrams) diagrams = { ...diagrams };
      put(diagrams as unknown as Record<string, unknown>, c);
    } else if (c.kind === "diagramNode") {
      if (nodes === state.nodes) nodes = { ...nodes };
      put(nodes as unknown as Record<string, unknown>, c);
    }
  }
  return { kind: "applied", state: { ...state, rev: d.rev, model, diagrams, nodes } };
}

/** 표준 상태를 다시 읽어야 하는 델타인가(표·컬럼이 바뀜). */
export function touchesColumns(d: ErdDelta): boolean {
  return d.changes.some((c) => c.kind === "column" || c.kind === "table");
}
```

- [ ] **Step 8: 구현 — `state/view-sync.ts`**

`src/frontend/m-mdm/pages/dma/erdEdit/state/view-sync.ts`:

```ts
/**
 * 화면 상태 알리기(SET_VIEW) 묶음 — 1초에 한 번 이하로 보낸다(스펙 4.4). 첫 값은 바로 보내고, 1초 안에 들어온 값은 마지막 것 하나만
 * 1초가 지난 뒤 보낸다. 마지막으로 보낸 값과 같으면 보내지 않는다(선택 표 순서는 보지 않는다).
 * 다시 연결되면 서버의 화면 상태가 비므로 화면이 forget() 으로 "보낸 값" 을 잊게 한 뒤 다시 push 한다.
 */
import type { ErdViewState } from "../types";

export const VIEW_SYNC_MS = 1000;

export interface ViewSync {
  push(view: ErdViewState): void;
  forget(): void;
  dispose(): void;
}

export function viewKey(v: ErdViewState): string {
  return JSON.stringify([v.diagramId, [...v.selectedTables].sort()]);
}

export function createViewSync(send: (view: ErdViewState) => void, intervalMs: number = VIEW_SYNC_MS): ViewSync {
  let lastAt = Number.NEGATIVE_INFINITY;
  let lastKey: string | null = null;
  let pending: ErdViewState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const flush = () => {
    timer = null;
    if (disposed || !pending) return;
    const v = pending;
    pending = null;
    const key = viewKey(v);
    if (key === lastKey) return;
    lastKey = key;
    lastAt = Date.now();
    send(v);
  };

  return {
    push(view) {
      if (disposed) return;
      pending = view;
      if (timer !== null) return;
      const wait = lastAt + intervalMs - Date.now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    forget() {
      lastKey = null;
    },
    dispose() {
      disposed = true;
      pending = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
```

- [ ] **Step 9: 구현 — `state/useErdStream.ts`**

`src/frontend/m-mdm/pages/dma/erdEdit/state/useErdStream.ts`:

```ts
"use client";

/**
 * ERD 실시간 채널(SSE) 구독(스펙 4.4, 단계 0 ErdStreamController).
 * 경로는 포털 rest 프록시 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}`(권한키 mdm/erdEdit/view)다. OASIS 프록시는 응답을
 * 모아서 넘기므로 쓰지 않는다. 이벤트: hello{rev}(sinceRev 없이 처음 구독할 때만)·change(ErdDelta)·reload{rev}·presence·claim·ping.
 *
 * - 연결은 모델을 읽은 뒤 sinceRev=<읽은 rev> 로 연다. 서버는 그 rev 뒤의 change 를 순서대로 다시 보낸다.
 * - 끊기면(error) 브라우저 자동 재연결을 쓰지 않는다. 자동 재연결은 처음 URL(옛 sinceRev)로 붙고 간격을 고를 수 없다.
 *   곧바로 닫고 "lost" 로 알린 뒤 1·2·4·8·15·30초 간격으로 그때의 rev 를 sinceRev 로 붙여 다시 연다. 이벤트를 하나라도 받으면 "open".
 * - 문서가 숨었거나 포털 탭이 비활성이면 다시 연결을 미루고, 다시 보이면 곧바로 연다(Screen-Performance R10·R14).
 *   열린 연결은 닫지 않는다. 접속자·화면 상태(presence)가 연결에 묶여 있고 MCP getCurrentView 가 그것을 읽는다(스펙 D14).
 * - 상태가 바뀔 때만 onStatus 를 부른다. 그래서 15초마다 오는 ping 은 다시 그리기를 만들지 않는다(R7).
 */
import { useEffect, useRef, useState } from "react";

import { useTabPage } from "@dk-oasis/shared/portal-shell";

import type { ErdClaim, ErdDelta, ErdPresence } from "../types";

export const STREAM_PATH = "/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/";
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000, 30000];

export type ErdStreamStatus = "idle" | "connecting" | "open" | "lost";

/** EventSource 가운데 이 모듈이 쓰는 부분. 시험은 가짜를 넣는다. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (e: MessageEvent) => void): void;
  close(): void;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

export interface ErdStreamHandlers {
  onHello(rev: number): void;
  onDelta(delta: ErdDelta): void;
  onReload(rev: number): void;
  onPresence(list: ErdPresence[]): void;
  onClaims(list: ErdClaim[]): void;
}

export function streamUrl(modelId: string, session: string, sinceRev: number | null): string {
  const q = new URLSearchParams({ session, source: "UI" });
  if (sinceRev !== null && sinceRev >= 0) q.set("sinceRev", String(sinceRev));
  return `${STREAM_PATH}${encodeURIComponent(modelId)}?${q.toString()}`;
}

export function backoffDelay(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)];
}

/** 탭마다 하나인 화면 세션 이름(≤ 100자). 같은 사용자의 두 탭도 다른 접속자로 보인다. SSE·SET_VIEW·save 가 같은 값을 쓴다. */
export function newSession(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(random() * 36).toString(36);
  return `ui-${s}`;
}

function readRev(e: MessageEvent): number {
  return Number((JSON.parse(String(e.data)) as { rev: number }).rev);
}

export interface ErdStreamClientOptions {
  modelId: string;
  session: string;
  factory: EventSourceFactory;
  handlers: ErdStreamHandlers;
  /** 다시 열 때 sinceRev 로 쓸 rev(화면이 마지막으로 반영한 rev). null 이면 hello 부터 받는다. */
  lastRev(): number | null;
  onStatus(status: ErdStreamStatus): void;
}

export class ErdStreamClient {
  private es: EventSourceLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private allowed = true;
  private waiting = false;
  private stopped = true;
  private status: ErdStreamStatus = "idle";

  constructor(private readonly o: ErdStreamClientOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.es?.close();
    this.es = null;
    this.setStatus("idle");
  }

  /** 문서가 보이고 포털 탭이 활성인가. 거짓이면 다시 열기를 미루고, 거짓 → 참이면 끊긴 연결을 곧바로 다시 연다. 열린 연결은 그대로 둔다. */
  setAllowed(allowed: boolean): void {
    const was = this.allowed;
    this.allowed = allowed;
    if (!allowed) {
      this.clearTimer();
      return;
    }
    if (!was && this.waiting && !this.stopped) this.connect();
  }

  private connect(): void {
    this.clearTimer();
    if (!this.allowed) {
      this.waiting = true;
      return;
    }
    this.waiting = false;
    const es = this.o.factory(streamUrl(this.o.modelId, this.o.session, this.o.lastRev()));
    this.es = es;
    if (this.status !== "lost") this.setStatus("connecting");
    const on = (type: string, fn: (e: MessageEvent) => void) =>
      es.addEventListener(type, (e) => {
        if (this.es === es) fn(e); // 닫은 연결의 늦은 이벤트는 버린다
      });
    const h = this.o.handlers;
    on("open", () => this.opened());
    on("error", () => this.lost());
    on("ping", () => this.opened());
    on("hello", (e) => {
      this.opened();
      h.onHello(readRev(e));
    });
    on("change", (e) => {
      this.opened();
      h.onDelta(JSON.parse(String(e.data)) as ErdDelta);
    });
    on("reload", (e) => {
      this.opened();
      h.onReload(readRev(e));
    });
    on("presence", (e) => {
      this.opened();
      h.onPresence(JSON.parse(String(e.data)) as ErdPresence[]);
    });
    on("claim", (e) => {
      this.opened();
      h.onClaims(JSON.parse(String(e.data)) as ErdClaim[]);
    });
  }

  private opened(): void {
    this.attempt = 0;
    this.setStatus("open");
  }

  private lost(): void {
    this.es?.close();
    this.es = null;
    this.setStatus("lost");
    if (this.stopped) return;
    this.waiting = true;
    if (!this.allowed) return;
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private setStatus(s: ErdStreamStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.o.onStatus(s);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

const defaultFactory: EventSourceFactory = (url) => new EventSource(url) as unknown as EventSourceLike;
const docVisible = (): boolean => typeof document === "undefined" || document.visibilityState !== "hidden";

/** 이 화면이 든 포털 탭이 활성인가 — `portal-tab-activated` 의 tabId 를 자기 tabId 와 견준다(R10). 포털 밖이면 늘 참이다. */
export function useTabActive(): boolean {
  const { tabId } = useTabPage();
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!tabId) return;
    const on = (e: Event) => setActive((e as CustomEvent<{ tabId?: string }>).detail?.tabId === tabId);
    window.addEventListener("portal-tab-activated", on);
    return () => window.removeEventListener("portal-tab-activated", on);
  }, [tabId]);
  return active;
}

export interface UseErdStreamOptions {
  modelId: string | null;
  session: string;
  /** 모델을 다 읽었는가. 읽기 전에는 열지 않는다(sinceRev=<읽은 rev> 로 열기 위해). */
  ready: boolean;
  /** 화면이 마지막으로 반영한 rev. 다시 열 때 sinceRev 로 쓴다. */
  lastRev: number | null;
  handlers: ErdStreamHandlers;
  factory?: EventSourceFactory;
}

export function useErdStream({ modelId, session, ready, lastRev, handlers, factory = defaultFactory }: UseErdStreamOptions): ErdStreamStatus {
  const [status, setStatus] = useState<ErdStreamStatus>("idle");
  const active = useTabActive();
  const revRef = useRef(lastRev);
  revRef.current = lastRev;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const activeRef = useRef(active);
  activeRef.current = active;
  const clientRef = useRef<ErdStreamClient | null>(null);

  useEffect(() => {
    if (!modelId || !ready) return;
    const client = new ErdStreamClient({
      modelId,
      session,
      factory,
      lastRev: () => revRef.current,
      onStatus: setStatus,
      handlers: {
        onHello: (rev) => handlersRef.current.onHello(rev),
        onDelta: (d) => handlersRef.current.onDelta(d),
        onReload: (rev) => handlersRef.current.onReload(rev),
        onPresence: (list) => handlersRef.current.onPresence(list),
        onClaims: (list) => handlersRef.current.onClaims(list),
      },
    });
    clientRef.current = client;
    client.setAllowed(activeRef.current && docVisible());
    client.start();
    return () => {
      client.stop();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [modelId, session, ready, factory]);

  useEffect(() => {
    const sync = () => clientRef.current?.setAllowed(active && docVisible());
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [active]);

  return status;
}
```

- [ ] **Step 10: 구현 — `state/useErdModel.ts`**

`src/frontend/m-mdm/pages/dma/erdEdit/state/useErdModel.ts`:

```ts
"use client";

/**
 * ERD 모델 상태(스펙 4.4 아래층) — view 로 모델 전체를 읽고 SSE 델타를 rev 순서대로 얹는다. 단계 1 은 읽기 뷰어라 위층(대기 명령)이 없다(S14).
 * - 다시 읽기는 세대 번호로 늦은 응답을 버린다(Local-Rules §37).
 * - 다시 읽는 동안 온 델타는 모아 두었다가 응답 rev 보다 큰 것만 순서대로 얹는다. 응답 rev 이하는 응답에 이미 있다.
 *   같은 동안 온 presence·claim 도 응답 값보다 새것이므로 그것을 쓴다.
 * - rev 를 건너뛴 델타(gap)는 모델 전체를 다시 읽게 한다. 같은 rev 를 두 번 받으면 두 번째는 버린다(save 응답을 먼저 얹은 경우).
 * - presence·claim 이 바뀌지 않았으면 상태를 바꾸지 않는다(Screen-Performance R7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { viewModel } from "../api";
import type { ErdClaim, ErdDelta, ErdModelView, ErdPresence, ErdState } from "../types";
import { applyDelta, fromView, touchesColumns } from "./model-delta";

export interface ErdModelApi {
  state: ErdState | null;
  loading: boolean;
  error: string | null;
  /** 표·컬럼이 바뀔 때(전체 읽기 포함)마다 1 오른다. 화면은 이 값으로 표준 상태(view kind=STATUS)를 다시 읽는다. */
  columnsSeq: number;
  reload(): Promise<void>;
  applyDelta(delta: ErdDelta): void;
  setPresence(list: ErdPresence[]): void;
  setClaims(list: ErdClaim[]): void;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function useErdModel(modelId: string | null, load: (modelId: string) => Promise<ErdModelView> = viewModel): ErdModelApi {
  const [state, setState] = useState<ErdState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnsSeq, setColumnsSeq] = useState(0);
  const stateRef = useRef<ErdState | null>(null);
  const genRef = useRef(0);
  /** 다시 읽는 중이면 배열(그동안 온 델타), 아니면 null. */
  const bufferRef = useRef<ErdDelta[] | null>(null);
  const lateRef = useRef<{ presence?: ErdPresence[]; claims?: ErdClaim[] }>({});

  const commit = useCallback((next: ErdState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const reload = useCallback(async () => {
    const gen = ++genRef.current;
    if (!modelId) {
      bufferRef.current = null;
      commit(null);
      return;
    }
    bufferRef.current = [];
    lateRef.current = {};
    setLoading(true);
    try {
      const view = await load(modelId);
      if (gen !== genRef.current) return;
      const prev = stateRef.current;
      const late = lateRef.current;
      let next: ErdState = {
        ...fromView(view),
        presence: late.presence ?? view.presence,
        claims: late.claims ?? (prev?.modelId === modelId ? prev.claims : []),
      };
      for (const d of bufferRef.current ?? []) {
        const out = applyDelta(next, d);
        if (out.kind === "applied") next = out.state;
        else if (out.kind === "gap") break; // 다음 live 델타가 다시 gap 을 알려 한 번 더 읽는다
      }
      bufferRef.current = null;
      lateRef.current = {};
      commit(next);
      setError(null);
      setColumnsSeq((s) => s + 1);
    } catch (e) {
      if (gen !== genRef.current) return;
      bufferRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [modelId, load, commit]);

  useEffect(() => {
    if (stateRef.current && stateRef.current.modelId !== modelId) commit(null);
    void reload();
  }, [reload, commit, modelId]);

  const applyDeltaCb = useCallback(
    (d: ErdDelta) => {
      if (bufferRef.current) {
        bufferRef.current.push(d);
        return;
      }
      const cur = stateRef.current;
      if (!cur || cur.modelId !== d.modelId) return;
      const out = applyDelta(cur, d);
      if (out.kind === "gap") {
        void reload();
        return;
      }
      if (out.kind === "stale") return;
      commit(out.state);
      if (touchesColumns(d)) setColumnsSeq((s) => s + 1);
    },
    [reload, commit],
  );

  const setPresence = useCallback(
    (list: ErdPresence[]) => {
      if (bufferRef.current) lateRef.current.presence = list;
      const cur = stateRef.current;
      if (!cur || sameJson(cur.presence, list)) return;
      commit({ ...cur, presence: list });
    },
    [commit],
  );

  const setClaims = useCallback(
    (list: ErdClaim[]) => {
      if (bufferRef.current) lateRef.current.claims = list;
      const cur = stateRef.current;
      if (!cur || sameJson(cur.claims, list)) return;
      commit({ ...cur, claims: list });
    },
    [commit],
  );

  return useMemo(
    () => ({ state, loading, error, columnsSeq, reload, applyDelta: applyDeltaCb, setPresence, setClaims }),
    [state, loading, error, columnsSeq, reload, applyDeltaCb, setPresence, setClaims],
  );
}
```

- [ ] **Step 11: 시험 통과 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: PASS — `api.test.ts` 5건, `model-delta.test.ts` 6건, `view-sync.test.ts` 3건, `erd-stream.test.ts` 6건(`streamReloadRefetchesModel` 포함).

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0(`tsc --noEmit` 이 출력 없이 끝난다).

- [ ] **Step 12: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit src/frontend/m-mdm/tests/dma/erdEdit
/usr/bin/git commit -m "$(cat <<'MSG'
feat(erd-viewer): 화면 상태 — API·델타 적용·SSE 구독·화면 공유

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

---

### Task 8: 캔버스 — 표 노드·관계선·이름표

**Files:**
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-geometry.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-flow.ts`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/ErdTableNode.tsx`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/ErdRelationEdge.tsx`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/PresenceTag.tsx`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-styles.ts`
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/{erd-geometry,erd-flow,erd-canvas}.test.ts`

**Interfaces:**
- Consumes: Task 6 의 `@dk-oasis/shared/react-flow` — `@xyflow/react` 전부(`ReactFlow`, `ReactFlowProvider`, `Handle`, `Position`, `useStore`, `useUpdateNodeInternals`, `EdgeLabelRenderer`, 형 `Node`·`Edge`·`NodeProps`·`EdgeProps`·`NodeTypes`·`EdgeTypes`·`ReactFlowState`)와 선 경로 `smoothStepPoints`·`routePath`·`routeMidpoint`·`ROUTE_RADIUS`·형 `FlowPos`·`Side`. Task 7 의 `types.ts`, 시험 공용 모델 `erd-fixtures.ts`.
- Produces (Task 9 가 쓴다):
  - `erd-flow.ts`: `buildFlow(input: BuildFlowInput): ErdFlow`, `useStableById(raw)`, `reuseById(prev, next)`, `keyMarks(model)`, `isDrawn(relation)`, `candidateGroup(relation)`, `handleId(columnId, side, type)`, `TABLE_HANDLES`, `BAD_STATUSES`, 형 `ErdMode`(`logical`·`physical`)·`ErdPreset`(`basic`·`overview`·`both`)·`ErdFlowNode`·`ErdFlowEdge`·`KeyMark`.
  - `erd-geometry.ts`: `NODE_WIDTH`, `ZOOM_NAMES_ONLY = 0.5`, `relationSides`, `crowFootPath`, `oneBarsPath`, `zeroCirclePos`, `typeText`, `nodeHeight`.
  - `ErdTableNode`(노드 형 `erdTable`), `namesOnlySelector`, `ErdRelationEdge`(선 형 `erdRelation`), `PresenceTag`, `ERD_CSS`·`ERD_STYLE_HREF`.

그리는 규칙(스펙 2.2·8절, 시안, S7):
1. 노드 머리: 논리 모드는 논리명과 작은 물리명, 물리 모드는 물리명과 작은 논리명이다. 오른쪽에 표준 위반 수(TYPE·DOMAIN·MISS)를 빨갛게 둔다.
2. 컬럼 행은 키 표시, 이름, 보조 칸 순서다. 키 표시는 `PK`, DB·확정 관계의 자식이면 `FK`, 추정 관계뿐이면 `FK?` 다. 이름은 논리 모드 논리명, 물리 모드 물리명, 논리+물리 프리셋은 둘 다다. 보조 칸은 논리 모드면 도메인 이름, 그 밖에는 타입이다. MISS 행은 붉은 바탕, TYPE·DOMAIN 행은 노란 바탕이다.
3. 접기 `NAME` 과 E-R 개요 프리셋은 행을 그리지 않는다. 접기 `KEYS` 는 PK·UK·FK 컬럼만 그리고 아래에 "접힘 · 컬럼 n개 숨김" 을 둔다. 확대율이 50% 미만이면 노드가 스스로 표 이름 한 줄만 그린다(행·작은 이름·위반 수·이름표 없음, Review Focus 5). 노드는 확대율 값이 아니라 "50% 미만인가" 만 구독해 경계를 넘을 때만 다시 그린다(Local-Rules §19).
4. 관계선은 자식 컬럼 행에서 부모 컬럼 행으로 가는 직교 꺾은선이다(`smoothStepPoints` + `routePath`). 자식이 부모 왼쪽이면 자식 오른쪽 변에서 부모 왼쪽 변으로 간다. 반대면 반대이고, 자기 참조는 둘 다 오른쪽이다. 부모 끝은 이중 막대("1"), 자식 끝은 까마귀발(N)이다. 자식 쪽 기수가 `ZERO_…` 면 원("0")을 더한다.
5. 추정(`INFERRED`)은 노란 파선, DB·확정은 실선이다. 기각(`REJECTED`)은 그리지 않는다. 후보 순위가 null·1 인 것만 그리고, 1 에는 같은 묶음(자식 표 + 자식 컬럼 집합)의 접힌 후보 수를 "다른 후보 n개" 로 단다.
6. 행이 안 보이면(축소·접기·개요) 선은 표 머리 손잡이(`tbl|R|s` 등)에 붙는다. 컬럼 손잡이는 선이 실제로 쓰는 것만 만든다(컬럼 500개 모델의 손잡이 수를 줄인다). 다른 모델 표를 부모로 둔 관계(`parentRef`)와 다이어그램에 없는 표의 관계는 그리지 않는다.
7. 배경은 논리 모드 `--color-primary-soft`, 물리 모드 `--color-danger-soft` 다(시안의 푸른색·붉은색을 토큰으로). 관계선 본선에는 `react-flow__edge-path` 클래스를 붙인다. Task 12 브라우저 확인이 이 클래스의 `stroke-dasharray` 로 점선을 센다.

- [ ] **Step 0: Task 6 서브패스 확인 (rebase 직후)**

Run: `cd src/frontend && pnpm --filter @dk-oasis/shared build && grep -n "export" shared/src/components/react-flow/index.ts`
Expected: `@xyflow/react` 를 다시 내보내는 줄과 `routePath`·`routeMidpoint`·`smoothStepPoints`·`ROUTE_RADIUS`·`FlowPos`·`Side`·`FindWidget`·`compileFind`·`INVALID_FIND`·`DEFAULT_FIND_OPTIONS`·`FindOptions`·`FindState` 가 모두 보인다. 하나라도 없으면 멈추고 조정자에게 알린다(Task 6 Produces 와 다르다).

- [ ] **Step 1: 실패하는 시험 작성 — 기하·모델 매핑**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  NODE_WIDTH, crowFootPath, nodeHeight, oneBarsPath, relationSides, typeText, zeroCirclePos,
} from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import { column } from "./erd-fixtures";

describe("erd-geometry", () => {
  it("까마귀발은 끝에서 12px 안쪽 한 점에서 끝의 위아래 6px 로 벌어진다", () => {
    expect(crowFootPath({ x: 100, y: 0 }, { x: 80, y: 0 })).toBe("M 88 0 L 100 6 M 88 0 L 100 -6");
    expect(crowFootPath({ x: 0, y: 0 }, { x: 20, y: 0 })).toBe("M 12 0 L 0 -6 M 12 0 L 0 6");
  });

  it("이중 막대는 끝에서 6px·10px 안쪽의 세로선 둘이다", () => {
    expect(oneBarsPath({ x: 100, y: 0 }, { x: 80, y: 0 })).toBe("M 94 6 L 94 -6 M 90 6 L 90 -6");
  });

  it("0 표시 원은 끝에서 18px 안쪽이다", () => {
    expect(zeroCirclePos({ x: 100, y: 0 }, { x: 80, y: 0 })).toEqual({ x: 82, y: 0 });
  });

  it("관계 변: 자식이 왼쪽이면 자식 오른쪽 → 부모 왼쪽, 반대면 반대, 자기 참조는 둘 다 오른쪽", () => {
    expect(relationSides(0, 400, false)).toEqual({ child: "R", parent: "L" });
    expect(relationSides(400, 0, false)).toEqual({ child: "L", parent: "R" });
    expect(relationSides(0, 0, true)).toEqual({ child: "R", parent: "R" });
  });

  it("타입 글자와 노드 높이", () => {
    expect(typeText(column("t", "A", "a"))).toBe("VARCHAR2(30)");
    expect(typeText(column("t", "A", "a", { dataType: "NUMBER", length: 10, scale: 2 }))).toBe("NUMBER(10,2)");
    expect(typeText(column("t", "A", "a", { dataType: "DATE", length: null }))).toBe("DATE");
    expect(typeText(column("t", "A", "a", { dataType: null }))).toBe("");
    expect(nodeHeight(0, false)).toBe(32);
    expect(nodeHeight(3, true)).toBe(112);
    expect(NODE_WIDTH).toBe(240);
  });
});
```

`src/frontend/m-mdm/tests/dma/erdEdit/erd-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildFlow, keyMarks, reuseById, type BuildFlowInput } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import type { ErdColumnStatus, ErdState } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, relation, stateOf } from "./erd-fixtures";

function input(over: Partial<BuildFlowInput> = {}): BuildFlowInput {
  return {
    state: stateOf(menuModel(), MENU_DIAGRAMS), diagramId: "d-all", mode: "logical", preset: "basic", namesOnly: false,
    statuses: {}, domains: { "12": { name: "아이디" } }, selected: new Set(), mySession: "ui-me", ...over,
  };
}

/** r-2 기각, r-3 허브 1순위(c-4 → t-2.c-3), r-4 같은 묶음 2순위(c-4 → t-1.c-1), r-5 다른 모델 부모. */
function hubState(): ErdState {
  const m = menuModel();
  m.relations["r-2"] = relation("t-2", "t-1", [["c-3", "c-1"]], { state: "REJECTED" });
  m.relations["r-3"] = relation("t-1", "t-2", [["c-4", "c-3"]], { state: "INFERRED", candidateRank: 1 });
  m.relations["r-4"] = relation("t-1", "t-1", [["c-4", "c-1"]], { state: "INFERRED", candidateRank: 2 });
  m.relations["r-5"] = relation("t-1", "t-2", [["c-2", "c-3"]], { parentRef: { model: "mdm", table: "t-x", columns: ["c-x"] } });
  return stateOf(m, MENU_DIAGRAMS);
}

describe("buildFlow", () => {
  it("보는 다이어그램의 표만 물리명 순으로 노드를 만들고, 모델에 없는 표의 노드는 뺀다", () => {
    const gone = { diagram: "d-all", table: "t-gone", x: 0, y: 300, foldMode: "NONE" as const };
    const f = buildFlow(input({ state: stateOf(menuModel(), { ...MENU_DIAGRAMS, nodes: [...MENU_DIAGRAMS.nodes, gone] }) }));
    expect(f.nodes.map((n) => n.id)).toEqual(["t-1", "t-2"]);
    expect(f.nodes[0]).toMatchObject({ type: "erdTable", position: { x: 0, y: 0 }, draggable: false, initialWidth: 240 });
    expect(buildFlow(input({ diagramId: null })).nodes).toEqual([]);
  });

  it("논리 모드는 논리명·도메인, 물리 모드는 물리명·타입, 논리+물리는 이름 둘과 타입", () => {
    const logical = buildFlow(input()).nodes[0].data;
    expect([logical.title, logical.subtitle]).toEqual(["메뉴", "TB_MCM_SEC_MENU"]);
    expect(logical.rows[0]).toMatchObject({ id: "c-1", key: "PK", name: "메뉴아이디", nameSub: null, sub: "아이디" });
    expect(logical.rows[1]).toMatchObject({ id: "c-2", key: "FK?", name: "오브젝트아이디", sub: "" });
    const physical = buildFlow(input({ mode: "physical" })).nodes[0].data;
    expect([physical.title, physical.subtitle]).toEqual(["TB_MCM_SEC_MENU", "메뉴"]);
    expect(physical.rows[0]).toMatchObject({ name: "MENU_ID", sub: "VARCHAR2(30)" });
    const both = buildFlow(input({ preset: "both" })).nodes[0].data;
    expect(both.rows[0]).toMatchObject({ name: "메뉴아이디", nameSub: "MENU_ID", sub: "VARCHAR2(30)" });
  });

  it("접기 KEYS 는 키 컬럼만 그리고 숨긴 수를 단다. E-R 개요는 행도 숨긴 수도 없다", () => {
    const keys = stateOf(menuModel(), { ...MENU_DIAGRAMS, nodes: [{ ...MENU_DIAGRAMS.nodes[0], foldMode: "KEYS" }, MENU_DIAGRAMS.nodes[1]] });
    const n = buildFlow(input({ state: keys })).nodes[0].data;
    expect(n.rows.map((r) => r.id)).toEqual(["c-1", "c-2"]);
    expect(n.hiddenCount).toBe(1);
    const overview = buildFlow(input({ preset: "overview" })).nodes[0].data;
    expect(overview.rows).toEqual([]);
    expect(overview.hiddenCount).toBe(0);
  });

  it("표준 상태로 행 색과 노드 위반 수를 정한다", () => {
    const statuses: Record<string, ErdColumnStatus> = { "c-1": "OK", "c-2": "MISS", "c-4": "DOMAIN" };
    const n = buildFlow(input({ statuses })).nodes[0].data;
    expect(n.rows.map((r) => r.tone)).toEqual([null, "miss", "warn"]);
    expect(n.violations).toBe(2);
  });

  it("기각·접힌 후보·다른 모델 부모는 그리지 않고, 1순위 후보에 접힌 후보 수를 단다", () => {
    const f = buildFlow(input({ state: hubState() }));
    expect(f.edges.map((e) => e.id)).toEqual(["r-1", "r-3"]);
    expect(f.edges[0].data).toEqual({ state: "INFERRED", folded: 0, zeroChild: true });
    expect(f.edges[1].data?.folded).toBe(1);
    expect(keyMarks(hubState().model).get("c-3")).toBe("PK"); // 기각 관계(r-2)의 자식 표시는 그대로 PK
  });

  it("자식이 왼쪽이면 자식 오른쪽 → 부모 왼쪽 컬럼 손잡이를 쓰고, 행이 안 보이면 표 머리 손잡이를 쓴다", () => {
    const f = buildFlow(input());
    expect(f.edges[0]).toMatchObject({ source: "t-1", target: "t-2", sourceHandle: "c-2|R|s", targetHandle: "c-3|L|t", selectable: false });
    expect(f.nodes[0].data.rows[1].handles).toEqual([{ id: "c-2|R|s", type: "source", side: "R" }]);
    expect(f.nodes[1].data.rows[0].handles).toEqual([{ id: "c-3|L|t", type: "target", side: "L" }]);
    expect(f.nodes[0].data.rows[0].handles).toEqual([]);
    expect(buildFlow(input({ namesOnly: true })).edges[0]).toMatchObject({ sourceHandle: "tbl|R|s", targetHandle: "tbl|L|t" });
    expect(buildFlow(input({ preset: "overview" })).edges[0]).toMatchObject({ sourceHandle: "tbl|R|s", targetHandle: "tbl|L|t" });
  });

  it("축소 여부만 바뀌면 노드는 모두 이전 참조를 쓰고, 선택이 바뀐 노드만 새 참조다", () => {
    const a = buildFlow(input());
    expect(reuseById(a.nodes, buildFlow(input({ namesOnly: true })).nodes)).toBe(a.nodes);
    const b = reuseById(a.nodes, buildFlow(input({ selected: new Set(["t-1"]) })).nodes);
    expect(b[0]).not.toBe(a.nodes[0]);
    expect(b[0].selected).toBe(true);
    expect(b[1]).toBe(a.nodes[1]);
  });

  it("다른 세션이 고른 표에 이름표를 달고(내 세션 제외), 작업 중 표시를 함께 단다", () => {
    const at = "2026-10-11T00:00:00Z";
    const s: ErdState = {
      ...stateOf(menuModel(), MENU_DIAGRAMS),
      presence: [
        { session: "ui-me", userId: "tester", source: "UI", diagramId: "d-all", selectedTables: ["t-1"], at },
        { session: "claude-a", userId: "tester", source: "MCP", diagramId: null, selectedTables: ["t-1"], at },
      ],
      claims: [{ tableId: "t-1", session: "claude-a", userId: "tester", expiresAt: at }],
    };
    const f = buildFlow(input({ state: s }));
    expect(f.nodes[0].data.viewers).toEqual([{ session: "claude-a", userId: "tester", source: "MCP", claimed: true }]);
    expect(f.nodes[1].data.viewers).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패하는 시험 작성 — 축소 시 이름만(Review Focus 5)**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-canvas.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ReactFlow, ReactFlowProvider, type EdgeTypes, type NodeTypes } from "@dk-oasis/shared/react-flow";

import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { bigState } from "./erd-fixtures";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
let host: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

/** 표 60개 × 컬럼 9개 = 컬럼 540개 모델을 주어진 확대율로 그린다. */
async function renderAt(zoom: number) {
  const flow = buildFlow({
    state: bigState(60, 9), diagramId: "d-all", mode: "logical", preset: "basic", namesOnly: zoom < 0.5,
    statuses: {}, domains: {}, selected: new Set(), mySession: "ui-me",
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(ReactFlowProvider, null, createElement("div", { style: { width: 1200, height: 800 } },
      createElement(ReactFlow, {
        nodes: flow.nodes, edges: flow.edges, nodeTypes: NODE_TYPES, edgeTypes: EDGE_TYPES,
        defaultViewport: { x: 0, y: 0, zoom }, minZoom: 0.1, maxZoom: 2, fitView: false,
      }))));
  });
}

describe("ERD 캔버스", () => {
  it("zoomBelowHalfRendersNamesOnly", async () => {
    await renderAt(0.4);
    expect(host.querySelectorAll(".erd-node")).toHaveLength(60);
    expect(host.querySelectorAll(".erd-col")).toHaveLength(0);
    expect(host.querySelectorAll("[data-names-only]")).toHaveLength(60);
    expect(host.querySelectorAll(".erd-node__sub")).toHaveLength(0);
    expect(host.querySelector('[data-testid="erd-node-t-0"]')?.textContent).toBe("표0");
  });

  it("확대율 50% 이상이면 컬럼 행을 모두 그린다", async () => {
    await renderAt(1);
    expect(host.querySelectorAll(".erd-col")).toHaveLength(540);
    expect(host.querySelectorAll("[data-names-only]")).toHaveLength(0);
    expect(host.querySelectorAll(".erd-node__sub")).toHaveLength(60);
    expect(host.querySelector('[data-testid="erd-col-c-0-0"] .erd-col__key')?.textContent).toBe("PK");
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 확인**

Run: `cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-geometry.test.ts tests/dma/erdEdit/erd-flow.test.ts tests/dma/erdEdit/erd-canvas.test.ts`
Expected: FAIL — `Failed to resolve import "../../../pages/dma/erdEdit/canvas/erd-geometry"`(그리고 `erd-flow`·`ErdTableNode`·`ErdRelationEdge`).

- [ ] **Step 4: 구현 — `canvas/erd-geometry.ts`**

`src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-geometry.ts`:

```ts
/**
 * ERD 캔버스 기하(순수) — 노드 크기, 관계선이 나갈 변, 끝 모양 경로(스펙 2.2: 부모 "1" 이중 막대, 자식 "0..N" 까마귀발).
 * 끝 모양은 선의 끝 점(end, 노드에 닿는 점)과 바로 앞 점(inner)으로 방향을 정한다. 직교 꺾은선이라 끝 구간은 늘 수평이다.
 */
import type { FlowPos } from "@dk-oasis/shared/react-flow";

import type { ErdColumn } from "../types";

export const NODE_WIDTH = 240;
export const HEADER_HEIGHT = 30;
export const ROW_HEIGHT = 20;
/** 이 확대율 미만이면 노드는 이름만 그린다(스펙 8절). */
export const ZOOM_NAMES_ONLY = 0.5;
/** 손잡이에서 첫 꺾임까지 거리. 끝 모양(최대 22px)이 꺾임에 걸리지 않게 둔다. */
export const END_STUB = 28;

export type NodeSide = "L" | "R";

/** 노드 높이 추정(측정 전 initialHeight·화면 맞춤용). 테두리 2px 포함. */
export function nodeHeight(rows: number, more: boolean): number {
  return HEADER_HEIGHT + rows * ROW_HEIGHT + (more ? ROW_HEIGHT : 0) + 2;
}

/** 관계선이 나갈 변. 자식이 부모 왼쪽(같은 x 포함)이면 자식 오른쪽 → 부모 왼쪽, 아니면 반대. 자기 참조는 둘 다 오른쪽(시안). */
export function relationSides(childX: number, parentX: number, self: boolean): { child: NodeSide; parent: NodeSide } {
  if (self) return { child: "R", parent: "R" };
  return childX <= parentX ? { child: "R", parent: "L" } : { child: "L", parent: "R" };
}

/** 소수 둘째 자리까지. -0 은 0 으로 쓴다. */
const num = (n: number): string => String(Math.round(n * 100) / 100 || 0);

function frame(end: FlowPos, inner: FlowPos): { u: FlowPos; n: FlowPos } {
  const dx = end.x - inner.x;
  const dy = end.y - inner.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  return { u, n: { x: -u.y, y: u.x } };
}

/** 자식 끝 까마귀발(N) — 끝에서 depth 안쪽 한 점에서 끝의 양옆 size 로 벌어지는 두 선. */
export function crowFootPath(end: FlowPos, inner: FlowPos, size = 6, depth = 12): string {
  const { u, n } = frame(end, inner);
  const b = { x: end.x - u.x * depth, y: end.y - u.y * depth };
  return `M ${num(b.x)} ${num(b.y)} L ${num(end.x + n.x * size)} ${num(end.y + n.y * size)} `
    + `M ${num(b.x)} ${num(b.y)} L ${num(end.x - n.x * size)} ${num(end.y - n.y * size)}`;
}

/** 부모 끝 이중 막대("1") — 끝에서 6px·10px 안쪽을 가로지르는 선 둘. */
export function oneBarsPath(end: FlowPos, inner: FlowPos, size = 6): string {
  const { u, n } = frame(end, inner);
  return [6, 10]
    .map((d) => {
      const p = { x: end.x - u.x * d, y: end.y - u.y * d };
      return `M ${num(p.x + n.x * size)} ${num(p.y + n.y * size)} L ${num(p.x - n.x * size)} ${num(p.y - n.y * size)}`;
    })
    .join(" ");
}

/** 자식 쪽 "0"(선택) 원의 가운데 — 까마귀발 바로 바깥. */
export function zeroCirclePos(end: FlowPos, inner: FlowPos, gap = 18): FlowPos {
  const { u } = frame(end, inner);
  return { x: Number(num(end.x - u.x * gap)), y: Number(num(end.y - u.y * gap)) };
}

/** 타입 글자 — VARCHAR2(30), NUMBER(10,2), DATE. */
export function typeText(c: Pick<ErdColumn, "dataType" | "length" | "scale">): string {
  if (!c.dataType) return "";
  if (c.length == null) return c.dataType;
  return c.scale == null ? `${c.dataType}(${c.length})` : `${c.dataType}(${c.length},${c.scale})`;
}
```

- [ ] **Step 5: 구현 — `canvas/erd-flow.ts`**

`src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-flow.ts`:

```ts
/**
 * 모델 → React Flow 노드·선(순수). 캔버스는 결과를 useStableById 로 이전 참조와 맞춰 넘긴다(Local-Rules §19 — 내용이 같은 노드·선은
 * 이전 객체를 그대로 넘겨야 React Flow 가 다시 그리지 않는다).
 * - 지금 보는 버전에 없는 표의 다이어그램 노드는 그리지 않는다(스펙 3.2).
 * - 기각 관계·접힌 후보(candidateRank ≥ 2)는 그리지 않고, 1순위 후보에 같은 묶음의 접힌 후보 수를 단다(S7).
 * - 다른 모델 표를 부모로 둔 관계(parentRef)는 단계 1 에서 그리지 않는다. 회색 참조 노드(스펙 D8)는 단계 2 이고 가져오기는 이런 관계를 만들지 않는다.
 * - 컬럼 행이 안 보이면(축소·개요·접기) 선은 표 머리 손잡이에 붙는다. 컬럼 손잡이는 선이 쓰는 것만 행 데이터에 싣는다.
 *   행 데이터는 확대율과 무관하게 만든다. 그래서 확대율이 경계를 넘어도 노드 객체는 그대로이고 선만 바뀐다.
 */
import { useMemo, useRef } from "react";

import type { Edge, Node } from "@dk-oasis/shared/react-flow";

import type { ErdColumnStatus, ErdModelJson, ErdRelation, ErdRelationState, ErdState } from "../types";
import { NODE_WIDTH, nodeHeight, relationSides, typeText, type NodeSide } from "./erd-geometry";

export type ErdMode = "logical" | "physical";
export type ErdPreset = "basic" | "overview" | "both";
export type KeyMark = "PK" | "FK" | "FK?" | "";
export type RowTone = "miss" | "warn" | null;

export interface HandleSpec {
  id: string;
  type: "source" | "target";
  side: NodeSide;
}

export interface ErdRowView {
  id: string;
  key: KeyMark;
  name: string;
  /** 논리+물리 프리셋에서 함께 쓰는 물리명. 아니면 null. */
  nameSub: string | null;
  sub: string;
  tone: RowTone;
  handles: HandleSpec[];
}

export interface ErdNodeViewer {
  session: string;
  userId: string;
  source: string;
  /** 이 세션이 이 표에 작업 중 표시(claim)를 걸었다. */
  claimed: boolean;
}

export interface ErdNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  rows: ErdRowView[];
  hiddenCount: number;
  violations: number;
  viewers: ErdNodeViewer[];
}
export type ErdFlowNode = Node<ErdNodeData, "erdTable">;

export interface ErdEdgeData extends Record<string, unknown> {
  state: ErdRelationState;
  /** 같은 묶음의 접힌 후보 수(1순위 후보에만). */
  folded: number;
  /** 자식 쪽 기수가 0 을 포함하는가(ZERO_OR_MORE·ZERO_OR_ONE). */
  zeroChild: boolean;
}
export type ErdFlowEdge = Edge<ErdEdgeData, "erdRelation">;

export const BAD_STATUSES: ReadonlySet<string> = new Set<ErdColumnStatus>(["TYPE", "DOMAIN", "MISS"]);

export function handleId(columnId: string | null, side: NodeSide, type: HandleSpec["type"]): string {
  return `${columnId ?? "tbl"}|${side}|${type === "source" ? "s" : "t"}`;
}

/** 표 머리 손잡이 4개 — 컬럼 행이 안 보일 때 선이 붙는다. */
export const TABLE_HANDLES: readonly HandleSpec[] = (["L", "R"] as const).flatMap((side) =>
  (["source", "target"] as const).map((type) => ({ id: handleId(null, side, type), type, side })),
);

/** 허브 후보 묶음 키 — 자식 표 + 자식 컬럼 집합(S7). */
export function candidateGroup(r: ErdRelation): string {
  return `${r.child}|${r.pairs.map((p) => p[0]).sort().join(",")}`;
}

/** 캔버스에 그릴 관계인가. */
export function isDrawn(r: ErdRelation): boolean {
  return r.state !== "REJECTED" && r.parentRef == null && (r.candidateRank == null || r.candidateRank <= 1);
}

function foldedCounts(model: ErdModelJson): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of Object.values(model.relations)) {
    if (r.state === "REJECTED" || r.candidateRank == null || r.candidateRank <= 1) continue;
    const g = candidateGroup(r);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** 컬럼별 키 표시. PK 가 먼저다. DB·확정 관계의 자식은 FK, 추정 관계뿐이면 FK?. 기각 관계는 보지 않는다. */
export function keyMarks(model: ErdModelJson): Map<string, KeyMark> {
  const out = new Map<string, KeyMark>();
  for (const k of Object.values(model.keys)) if (k.kind === "PK") for (const c of k.columns) out.set(c, "PK");
  for (const r of Object.values(model.relations)) {
    if (r.state === "REJECTED") continue;
    const mark: KeyMark = r.state === "INFERRED" ? "FK?" : "FK";
    for (const [child] of r.pairs) {
      const cur = out.get(child);
      if (cur === "PK" || cur === "FK") continue;
      out.set(child, mark);
    }
  }
  return out;
}

export interface BuildFlowInput {
  state: ErdState;
  diagramId: string | null;
  mode: ErdMode;
  preset: ErdPreset;
  /** 확대율 50% 미만 — 선을 표 머리 손잡이에 붙인다. */
  namesOnly: boolean;
  statuses: Readonly<Record<string, ErdColumnStatus>>;
  domains: Readonly<Record<string, { name: string }>>;
  selected: ReadonlySet<string>;
  mySession: string;
}

export interface ErdFlow {
  nodes: ErdFlowNode[];
  edges: ErdFlowEdge[];
}

const NO_HANDLES: HandleSpec[] = [];
const NO_VIEWERS: ErdNodeViewer[] = [];
const EMPTY_FLOW: ErdFlow = { nodes: [], edges: [] };

function viewersByTable(state: ErdState, mySession: string): Map<string, ErdNodeViewer[]> {
  const claimed = new Set(state.claims.map((c) => `${c.tableId}|${c.session}`));
  const out = new Map<string, ErdNodeViewer[]>();
  for (const p of state.presence) {
    if (p.session === mySession) continue;
    for (const t of p.selectedTables) {
      const list = out.get(t) ?? [];
      list.push({ session: p.session, userId: p.userId, source: p.source, claimed: claimed.has(`${t}|${p.session}`) });
      out.set(t, list);
    }
  }
  return out;
}

export function buildFlow(i: BuildFlowInput): ErdFlow {
  if (!i.diagramId) return EMPTY_FLOW;
  const m = i.state.model;
  const placed = Object.values(i.state.nodes)
    .filter((n) => n.diagram === i.diagramId && m.tables[n.table])
    .sort((a, b) => m.tables[a.table].phys.localeCompare(m.tables[b.table].phys));
  const at = new Map(placed.map((n) => [n.table, n] as const));
  const marks = keyMarks(m);
  const ukCols = new Set(Object.values(m.keys).filter((k) => k.kind === "UK").flatMap((k) => k.columns));

  // 1. 표마다 그릴 컬럼(확대율과 무관)
  const shown = new Map<string, string[]>();
  for (const n of placed) {
    const order = m.tables[n.table].columnOrder.filter((c) => m.columns[c]);
    const rows = i.preset === "overview" || n.foldMode === "NAME" ? []
      : n.foldMode === "KEYS" ? order.filter((c) => (marks.get(c) ?? "") !== "" || ukCols.has(c))
      : order;
    shown.set(n.table, rows);
  }
  const visible = new Map([...shown].map(([t, rows]) => [t, new Set(rows)] as const));

  // 2. 선과 선이 쓰는 컬럼 손잡이
  const folded = foldedCounts(m);
  const handles = new Map<string, HandleSpec[]>();
  const need = (col: string, h: HandleSpec) => {
    const list = handles.get(col) ?? [];
    if (!list.some((x) => x.id === h.id)) list.push(h);
    handles.set(col, list);
  };
  const edges: ErdFlowEdge[] = [];
  for (const [id, r] of Object.entries(m.relations).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isDrawn(r) || r.pairs.length === 0) continue;
    const c = at.get(r.child);
    const p = at.get(r.parent);
    if (!c || !p) continue;
    const sides = relationSides(c.x, p.x, r.child === r.parent);
    const [childCol, parentCol] = r.pairs[0];
    const childRow = visible.get(r.child)!.has(childCol);
    const parentRow = visible.get(r.parent)!.has(parentCol);
    const src: HandleSpec = { id: handleId(childCol, sides.child, "source"), type: "source", side: sides.child };
    const tgt: HandleSpec = { id: handleId(parentCol, sides.parent, "target"), type: "target", side: sides.parent };
    if (childRow) need(childCol, src);
    if (parentRow) need(parentCol, tgt);
    edges.push({
      id, type: "erdRelation", source: r.child, target: r.parent,
      sourceHandle: childRow && !i.namesOnly ? src.id : handleId(null, sides.child, "source"),
      targetHandle: parentRow && !i.namesOnly ? tgt.id : handleId(null, sides.parent, "target"),
      selectable: false, focusable: false,
      data: {
        state: r.state, folded: r.candidateRank === 1 ? folded.get(candidateGroup(r)) ?? 0 : 0,
        zeroChild: r.cardinality.child.startsWith("ZERO"),
      },
    });
  }

  // 3. 노드
  const viewers = viewersByTable(i.state, i.mySession);
  const physical = i.mode === "physical";
  const both = i.preset === "both";
  const nodes = placed.map((n): ErdFlowNode => {
    const t = m.tables[n.table];
    const total = t.columnOrder.filter((c) => m.columns[c]).length;
    const rows = shown.get(n.table)!.map((cid): ErdRowView => {
      const c = m.columns[cid];
      const st = i.statuses[cid] as ErdColumnStatus | undefined;
      return {
        id: cid,
        key: marks.get(cid) ?? "",
        name: physical && !both ? c.phys : c.logical || c.phys,
        nameSub: both ? c.phys : null,
        sub: !physical && !both ? (c.domainId != null ? i.domains[String(c.domainId)]?.name ?? "" : "") : typeText(c),
        tone: st === "MISS" ? "miss" : st === "TYPE" || st === "DOMAIN" ? "warn" : null,
        handles: handles.get(cid) ?? NO_HANDLES,
      };
    });
    const hiddenCount = i.preset === "overview" ? 0 : total - rows.length;
    const violations = t.columnOrder.filter((cid) => BAD_STATUSES.has(i.statuses[cid] as string)).length;
    return {
      id: n.table, type: "erdTable", position: { x: n.x, y: n.y },
      data: {
        title: physical ? t.phys : t.logical || t.phys, subtitle: physical ? t.logical : t.phys,
        rows, hiddenCount, violations, viewers: viewers.get(n.table) ?? NO_VIEWERS,
      },
      selected: i.selected.has(n.table), draggable: false, connectable: false,
      initialWidth: NODE_WIDTH, initialHeight: nodeHeight(rows.length, hiddenCount > 0),
    };
  });
  return { nodes, edges };
}

// ── 참조 재사용. 룰 세트 편집기 canvas/reuse.ts 와 같은 방식이다. 그 파일은 shared 복사 대상(Task 6)이 아니어서 여기 둔다. ──

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

function sameValue(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let k = 0; k < a.length; k++) if (!sameValue(a[k], b[k], depth - 1)) return false;
    return true;
  }
  if (!isPlain(a) || !isPlain(b) || Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !sameValue(a[k], b[k], depth - 1)) return false;
  return true;
}

/** 노드 → data → rows → 행 → handles → 손잡이까지 견주는 깊이. */
const REUSE_DEPTH = 7;

/** next 의 항목마다 prev 에서 같은 id 를 찾아 내용이 같으면 prev 참조를 쓴다. 모두 같은 자리에서 재사용되면 prev 배열 자체를 돌려준다. */
export function reuseById<T extends { id: string }>(prev: readonly T[] | null, next: readonly T[]): T[] {
  if (!prev) return next as T[];
  const byId = new Map(prev.map((x) => [x.id, x] as const));
  let all = prev.length === next.length;
  const out = next.map((x, k) => {
    const p = byId.get(x.id);
    const kept = p !== undefined && sameValue(p, x, REUSE_DEPTH) ? p : x;
    if (kept !== prev[k]) all = false;
    return kept;
  });
  return all ? (prev as T[]) : out;
}

/** 렌더마다 새로 만든 배열을 이전 결과와 구조적으로 공유한 배열로 바꾼다. */
export function useStableById<T extends { id: string }>(raw: readonly T[]): T[] {
  const last = useRef<T[] | null>(null);
  return useMemo(() => {
    const out = reuseById(last.current, raw);
    last.current = out;
    return out;
  }, [raw]);
}
```

- [ ] **Step 6: 구현 — 노드·선·이름표·스타일**

`src/frontend/m-mdm/pages/dma/erdEdit/canvas/PresenceTag.tsx`:

```tsx
"use client";

/** 접속자 이름표(스펙 D17) — 다른 세션이 고른 표 위에 붙는다. 사람(UI)은 사용자 ID, LLM(MCP·CLI)은 세션 이름을 쓴다. */
import type { ErdNodeViewer } from "./erd-flow";

export function presenceLabel(v: Pick<ErdNodeViewer, "source" | "userId" | "session">): string {
  return v.source === "UI" ? v.userId : v.session;
}

export function PresenceTag({ viewer }: { viewer: ErdNodeViewer }) {
  return (
    <span
      className="erd-viewer"
      data-source={viewer.source === "UI" ? "ui" : "llm"}
      data-claimed={viewer.claimed ? "" : undefined}
      title={`${viewer.userId} · ${viewer.session}${viewer.claimed ? " · 작업 중" : ""}`}
    >
      {presenceLabel(viewer)}
      {viewer.claimed ? " · 작업 중" : ""}
    </span>
  );
}
```

`src/frontend/m-mdm/pages/dma/erdEdit/canvas/ErdTableNode.tsx`:

```tsx
"use client";

/**
 * ERD 표 노드 — 머리(이름·위반 수)와 컬럼 행. 확대율이 50% 미만이면 표 이름 한 줄만 그린다(스펙 8절, Review Focus 5) —
 * 컬럼 행·작은 이름·위반 수·이름표를 만들지 않는다(Task 12 가 노드 글자가 한 줄인지 본다).
 * 확대율은 "50% 미만인가" 만 구독한다. 확대·축소할 때마다가 아니라 경계를 넘을 때만 다시 그린다(Local-Rules §19).
 * 손잡이: 머리에 표 손잡이 4개(늘), 행에는 선이 쓰는 것만. 행이 바뀌면 React Flow 가 손잡이 자리를 다시 재게 한다.
 */
import { memo, useEffect, useRef } from "react";

import {
  Handle, Position, useStore, useUpdateNodeInternals, type NodeProps, type ReactFlowState,
} from "@dk-oasis/shared/react-flow";

import { TABLE_HANDLES, type ErdFlowNode, type ErdRowView, type HandleSpec } from "./erd-flow";
import { ZOOM_NAMES_ONLY } from "./erd-geometry";
import { PresenceTag } from "./PresenceTag";

export const namesOnlySelector = (s: ReactFlowState): boolean => s.transform[2] < ZOOM_NAMES_ONLY;

const NO_ROWS: ErdRowView[] = [];

function Handles({ list }: { list: readonly HandleSpec[] }) {
  return (
    <>
      {list.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={h.side === "L" ? Position.Left : Position.Right}
          isConnectable={false}
          className="erd-handle"
        />
      ))}
    </>
  );
}

export const ErdTableNode = memo(function ErdTableNode({ id, data, selected }: NodeProps<ErdFlowNode>) {
  const namesOnly = useStore(namesOnlySelector);
  const rows = namesOnly ? NO_ROWS : data.rows;
  const updateInternals = useUpdateNodeInternals();
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true; // 처음 그릴 때는 React Flow 가 스스로 잰다
      return;
    }
    updateInternals(id);
  }, [id, rows, updateInternals]);

  return (
    <div className="erd-node" data-testid={`erd-node-${id}`} data-selected={selected ? "" : undefined} data-names-only={namesOnly ? "" : undefined}>
      {!namesOnly && data.viewers.length > 0 && (
        <div className="erd-node__viewers">
          {data.viewers.map((v) => (
            <PresenceTag key={v.session} viewer={v} />
          ))}
        </div>
      )}
      <div className="erd-node__hd">
        <Handles list={TABLE_HANDLES} />
        <span className="erd-node__title">{data.title}</span>
        {!namesOnly && data.subtitle && <span className="erd-node__sub">{data.subtitle}</span>}
        {!namesOnly && data.violations > 0 && (
          <span className="erd-node__warn" title={`표준 위반 ${data.violations}건`}>
            {data.violations}
          </span>
        )}
      </div>
      {rows.map((r) => (
        <div key={r.id} className="erd-col" data-tone={r.tone ?? undefined} data-testid={`erd-col-${r.id}`}>
          <span className="erd-col__key" data-key={r.key || undefined}>
            {r.key}
          </span>
          <span className="erd-col__name">
            {r.name}
            {r.nameSub && <span className="erd-col__name-sub">{r.nameSub}</span>}
          </span>
          <span className="erd-col__sub">{r.sub}</span>
          <Handles list={r.handles} />
        </div>
      ))}
      {!namesOnly && data.hiddenCount > 0 && <div className="erd-node__more">접힘 · 컬럼 {data.hiddenCount}개 숨김</div>}
    </div>
  );
});
```

`src/frontend/m-mdm/pages/dma/erdEdit/canvas/ErdRelationEdge.tsx`:

```tsx
"use client";

/**
 * ERD 관계선 — 직교 꺾은선(shared smoothStepPoints + routePath)과 끝 모양. 자식(source) 끝 까마귀발(+ 0 원), 부모(target) 끝 이중 막대.
 * 추정은 노란 파선(CSS)이고, 1순위 후보에는 "다른 후보 n개" 이름표를 단다. 본선 path 에 react-flow__edge-path 를 붙인다(브라우저 확인이 이 클래스로 센다).
 * 이름표는 EdgeLabelRenderer 층(pointer-events:none, Local-Rules §19)에 둔다. 누를 것이 없어 다시 켜지 않는다.
 */
import { memo } from "react";

import {
  EdgeLabelRenderer, ROUTE_RADIUS, routeMidpoint, routePath, smoothStepPoints, type EdgeProps,
} from "@dk-oasis/shared/react-flow";

import type { ErdFlowEdge } from "./erd-flow";
import { END_STUB, crowFootPath, oneBarsPath, zeroCirclePos } from "./erd-geometry";

export const ErdRelationEdge = memo(function ErdRelationEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}: EdgeProps<ErdFlowEdge>) {
  // 룰 세트 편집기와 같이 xyflow Position 을 그대로 넘긴다(값이 "left"·"right" 라 Side 에 맞는다).
  const pts = smoothStepPoints({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, offset: END_STUB });
  const childEnd = pts[0];
  const childInner = pts[1] ?? pts[0];
  const parentEnd = pts[pts.length - 1];
  const parentInner = pts[pts.length - 2] ?? parentEnd;
  const zero = data?.zeroChild ? zeroCirclePos(childEnd, childInner) : null;
  const folded = data?.folded ?? 0;
  const mid = folded > 0 ? routeMidpoint(pts) : null;
  return (
    <>
      <g className="erd-rel" data-state={data?.state} data-testid={`erd-rel-${id}`}>
        <path className="react-flow__edge-path erd-rel__line" d={routePath(pts, ROUTE_RADIUS)} fill="none" />
        <path className="erd-rel__end" d={crowFootPath(childEnd, childInner)} fill="none" />
        {zero && <circle className="erd-rel__zero" cx={zero.x} cy={zero.y} r={4} />}
        <path className="erd-rel__end" d={oneBarsPath(parentEnd, parentInner)} fill="none" />
      </g>
      {mid && (
        <EdgeLabelRenderer>
          <div className="erd-rel__label" style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}>
            다른 후보 {folded}개
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
```

`src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-styles.ts`:

```ts
/**
 * erdEdit 화면 스타일 — 포털은 모듈 dist 의 page.css 를 싣지 않으므로 TS 문자열로 두고 page 가 `<style href precedence>` 로 한 번 넣는다
 * (Local-Rules §17). 색은 의미 토큰만 쓴다(§8). 논리 모드 배경은 푸른 계열, 물리 모드 배경은 붉은 계열이다(스펙 8절 F3).
 * xyflow 스타일시트(.react-flow__handle·.react-flow__edge-path)와 겨루는 규칙은 선택자를 한 단계 높인다. 두 스타일의 순서가 정해지지 않아서다.
 * Task 9 가 화면 틀(위 막대·왼쪽·오른쪽·아래 패널) 규칙을 이 문자열 뒤에 더한다.
 */
export const ERD_STYLE_HREF = "dmes-erd-edit";

export const ERD_CSS = `
.erd-canvas { position: absolute; inset: 0; }
.erd-canvas[data-mode="logical"] .react-flow { background: var(--color-primary-soft); }
.erd-canvas[data-mode="physical"] .react-flow { background: var(--color-danger-soft); }
.erd-canvas .react-flow__nodesselection-rect { pointer-events: none; }
.erd-node { position: relative; width: 240px; box-sizing: border-box; background: var(--color-bg); color: var(--color-text);
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); font-size: var(--font-size-xs); }
.react-flow__node.selected .erd-node { border-color: var(--color-primary); box-shadow: var(--shadow-focus); }
.erd-node__hd { position: relative; display: flex; align-items: center; gap: var(--spacing-xs); height: 30px; padding: 0 var(--spacing-sm);
  background: var(--color-bg-header); border-bottom: 1px solid var(--color-border); font-weight: 600; overflow: hidden; }
.erd-node__title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erd-node__sub { min-width: 0; font-family: var(--font-family-mono); font-weight: 400; color: var(--color-text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erd-node__warn { margin-left: auto; color: var(--color-danger); }
.erd-node[data-names-only] .erd-node__hd { border-bottom: 0; }
.erd-col { position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; align-items: center; gap: var(--spacing-xs);
  height: 20px; padding: 0 var(--spacing-sm); }
.erd-col[data-tone="miss"] { background: var(--color-danger-soft); }
.erd-col[data-tone="warn"] { background: var(--color-warning-soft); }
.erd-col__key { font-weight: 600; color: var(--color-text-muted); }
.erd-col__key[data-key="PK"] { color: var(--color-warning); }
.erd-col__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erd-col__name-sub { margin-left: var(--spacing-xs); font-family: var(--font-family-mono); color: var(--color-text-muted); }
.erd-col__sub { font-family: var(--font-family-mono); color: var(--color-text-muted); white-space: nowrap; }
.erd-node__more { height: 20px; line-height: 20px; padding: 0 var(--spacing-sm); border-top: 1px dashed var(--color-border); color: var(--color-text-muted); }
.erd-node .erd-handle { width: 4px; height: 4px; min-width: 0; min-height: 0; border: 0; background: transparent; pointer-events: none; }
.erd-node__viewers { position: absolute; left: 0; bottom: 100%; display: flex; gap: 2px; }
.erd-viewer { padding: 0 var(--spacing-xs); border-radius: var(--radius-sm) var(--radius-sm) 0 0; font-size: var(--font-size-xs);
  white-space: nowrap; color: var(--color-on-primary); background: var(--color-warning); }
.erd-viewer[data-source="llm"] { background: var(--color-success); }
.erd-rel .erd-rel__line, .erd-rel .erd-rel__end { stroke: var(--color-text); stroke-width: 1.4; }
.erd-rel[data-state="INFERRED"] .erd-rel__line { stroke: var(--color-warning); stroke-dasharray: 5 4; }
.erd-rel[data-state="INFERRED"] .erd-rel__end { stroke: var(--color-warning); }
.erd-rel .erd-rel__zero { fill: var(--color-bg); stroke: var(--color-text); stroke-width: 1.2; }
.erd-rel[data-state="INFERRED"] .erd-rel__zero { stroke: var(--color-warning); }
.erd-rel__label { position: absolute; padding: 0 var(--spacing-xs); font-size: var(--font-size-xs); color: var(--color-warning);
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
`;
```

- [ ] **Step 7: 시험 통과 확인**

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: PASS — Task 7 의 20건과 `erd-geometry.test.ts` 5건, `erd-flow.test.ts` 8건, `erd-canvas.test.ts` 2건(`zoomBelowHalfRendersNamesOnly` 포함). happy-dom 은 크기를 재지 않으므로 React Flow 가 "parent container needs a width and a height" 경고를 찍을 수 있다. 실패가 아니다.

`erd-canvas.test.ts` 가 `.erd-node` 0개로 실패하면 React Flow 가 노드를 그리지 않은 것이다. 시험의 `ReactFlow` 에 `onlyRenderVisibleElements` 가 없는지, `shared/node_modules/@xyflow/react` 와 `m-mdm/node_modules/@xyflow/react` 의 `readlink -f` 경로가 같은지(Task 6 Step 1)를 먼저 본다.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0.

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit/canvas src/frontend/m-mdm/tests/dma/erdEdit
/usr/bin/git commit -m "$(cat <<'MSG'
feat(erd-viewer): 캔버스 — 표 노드·관계선 끝 모양·이름표, 축소 시 이름만

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

---

### Task 9: 화면 조립 — 위 막대·다이어그램 목록·컬럼 그리드·검토 패널·메뉴 등록

**Files:**
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/page.tsx`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/ErdViewer.tsx`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/panels/{TopBar,DiagramTree,ColumnGrid,ReviewPanel}.tsx`
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-styles.ts` (화면 틀 규칙 추가)
- Modify: `src/frontend/m-mdm/tsup.config.ts`, `src/frontend/m-mdm/package.json` (화면 진입점·exports)
- Modify: `src/frontend/m-mcm/lib/generated/page-registry.ts` (재생성 결과)
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java` (메뉴 leaf)
- Modify: `src/backend/mcm/api/src/test/resources/init/data-initializer-fingerprint.golden.txt` (지문 재생성)
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/{panel-rows,page-render}.test.ts`

**Interfaces:**
- Consumes: Task 7 전부(`api.ts`·`useErdModel`·`useErdStream`·`useTabActive`·`newSession`·`createViewSync`·`nodeKey`), Task 8 전부(`buildFlow`·`useStableById`·`ErdTableNode`·`namesOnlySelector`·`ErdRelationEdge`·`keyMarks`·`candidateGroup`·`BAD_STATUSES`·`typeText`·`ERD_CSS`), Task 6 의 `FindWidget`·`compileFind`·`INVALID_FIND`·`DEFAULT_FIND_OPTIONS`·형 `FindOptions`·`FindState`. 기존 `@dk-oasis/shared/{layout,form,grid,tabs}`, `@/shell`(`MdmPageLayout`·`VersionStatusBadge`).
- Produces: 화면 `dma/erdEdit`(포털 componentPath `dma/erdEdit`, 메뉴 이름 "ERD 설계"), 순수 함수 `readOnlyReason`·`nextMode`·`sortedDiagrams`·`diagramGroups`·`unplacedCount`·`findTables`·`columnRows`·`violationRows`·`inferredRows`·`diffRows`·`historyRows`. Task 12 브라우저 확인이 쓰는 글자: 모델 단추 = 모델 이름(`MCM 스키마`), 프리셋 단추 `기본`·`E-R 개요`·`논리+물리 동시`, 검토 탭 `추정 관계 검토(n)`, 단추 `확정`·`기각`.

화면 규칙(스펙 2.2·4.4·8절, S14):
1. 진입 때는 모델 목록(`search`)만 읽는다. 모델은 사용자가 고른다(진입 호출 최소, Screen-Performance R3·R13). 모델 단추 글자는 모델 이름이다.
2. 고른 모델을 `view` 로 읽은 뒤 SSE 를 연다. 표준 상태(`view kind=STATUS`)는 모델을 읽은 뒤와 표·컬럼 델타가 온 뒤 0.5초 미뤄 다시 읽는다.
3. 쓰기는 모델 등록, 첫 가져오기(표가 없을 때만 단추가 보인다), 추정 관계 확정·기각뿐이다. 응답을 받은 뒤 반영한다. 확정·기각 응답의 `changes` 는 rev 를 붙여 델타로 얹고, 같은 rev 의 SSE 는 `stale` 로 버려진다.
4. 읽기 전용 띠: 편집 권한(RBAC `save`)이 없으면, DRAFT 가 아니면(확정 버전), 소유자도 공동 편집자도 아니면 이유와 다음에 할 일을 적는다. 읽기 전용이거나 연결이 끊겼으면 확정·기각·가져오기 단추를 막는다(스펙 4.4 "편집을 멈춘다").
5. F3 은 논리·물리 전환, Ctrl+T 는 표 찾기다. 포털 탭이 활성일 때만 받는다. 크롬은 Ctrl+T(새 탭)를 페이지에 넘기지 않으므로 [표 찾기] 단추를 함께 둔다(계획 작성자 메모 참조).
6. 캔버스는 읽기 전용이다(끌기·잇기 없음). 노드 선택은 화면 상태(`selected`)로 들고 `SET_VIEW` 로 알린다. 다이어그램을 바꾸면 캔버스를 새로 맞춘다(`ReactFlowProvider` key + `fitView`, Local-Rules §33 의 "상태를 바꿔 다시 그리는 경로"). 찾기·검토 목록으로 표를 고르면 `setCenter` 로 곧바로 옮긴다.
7. 그리드는 모두 읽기 전용 `AgDataGrid` 이고 `gridId` 를 준다(§39). 열 정의는 모듈 상수다. 확정·기각 단추 열만 `locked`·`onDecide` 가 바뀔 때 다시 만든다(§20). 열은 MDM 컬럼 사전과 무관하므로 `meta: false` 다.

- [ ] **Step 1: 실패하는 시험 작성 — 패널 행·읽기 전용 이유**

`src/frontend/m-mdm/tests/dma/erdEdit/panel-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_FIND_OPTIONS } from "@dk-oasis/shared/react-flow";

import { columnRows } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { diagramGroups, findTables, unplacedCount } from "../../../pages/dma/erdEdit/panels/DiagramTree";
import { diffRows, historyRows, inferredRows, violationRows } from "../../../pages/dma/erdEdit/panels/ReviewPanel";
import { nextMode, readOnlyReason } from "../../../pages/dma/erdEdit/panels/TopBar";
import type { ErdStatusView } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, relation, stateOf, table } from "./erd-fixtures";

const status = (statuses: ErdStatusView["statuses"]): ErdStatusView => ({
  modelId: "mcm", ver: "1.000", rev: 3, statuses, domains: { "12": { name: "아이디", dataType: "VARCHAR2", length: 30, scale: null } },
  counts: { OK: 0, ALIAS: 0, NEW: 0, TYPE: 0, DOMAIN: 0, MISS: 0 }, elapsedMs: 1,
});

describe("읽기 전용 이유(스펙 4.4)", () => {
  it("권한·확정 버전·공동 편집자 순서로 이유를 고르고, 소유자·공동 편집자 DRAFT 는 null", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS); // DRAFT, 소유자 tester
    expect(readOnlyReason(s, "tester", true)).toBeNull();
    expect(readOnlyReason({ ...s, editors: ["mate"] }, "mate", true)).toBeNull();
    expect(readOnlyReason(s, "tester", false)).toContain("편집 권한");
    expect(readOnlyReason({ ...s, status: "RELEASED" }, "tester", true)).toContain("확정된 버전");
    expect(readOnlyReason(s, "stranger", true)).toContain("소유자(tester)");
    expect(nextMode("logical")).toBe("physical");
    expect(nextMode("physical")).toBe("logical");
  });
});

describe("다이어그램 목록", () => {
  it("업무영역별로 묶고 다이어그램마다 표 수·위반 수를 센다. 다이어그램에 없는 표를 센다", () => {
    const m = menuModel();
    m.tables["t-3"] = table("TB_LONE", "외톨이");
    const s = stateOf(m, {
      diagrams: [...MENU_DIAGRAMS.diagrams, { id: "d-3", areaName: "시스템", diagramName: "빈 것", sortSeq: 2 },
        { id: "d-2", areaName: "기본", diagramName: "메뉴만", sortSeq: 1 }],
      nodes: [...MENU_DIAGRAMS.nodes, { diagram: "d-2", table: "t-1", x: 0, y: 0, foldMode: "NONE" }],
    });
    expect(diagramGroups(s, { "c-1": "OK", "c-2": "MISS", "c-4": "TYPE" })).toEqual([
      { area: "기본", diagrams: [{ id: "d-all", name: "전체", tables: 2, violations: 2 }, { id: "d-2", name: "메뉴만", tables: 1, violations: 2 }] },
      { area: "시스템", diagrams: [{ id: "d-3", name: "빈 것", tables: 0, violations: 0 }] },
    ]);
    expect(unplacedCount(s)).toBe(1);
  });

  it("표 찾기는 물리명·논리명·주석으로 찾고 물리명 순이다. 잘못된 정규식은 invalid", () => {
    const tables = menuModel().tables;
    expect(findTables(tables, "sec", DEFAULT_FIND_OPTIONS)).toEqual({ hits: ["t-1", "t-2"], invalid: false });
    expect(findTables(tables, "오브젝트", DEFAULT_FIND_OPTIONS).hits).toEqual(["t-2"]);
    expect(findTables(tables, "(", { ...DEFAULT_FIND_OPTIONS, regex: true })).toEqual({ hits: [], invalid: true });
    expect(findTables(tables, "  ", DEFAULT_FIND_OPTIONS)).toEqual({ hits: [], invalid: false });
  });
});

describe("검토 패널·컬럼 그리드 행", () => {
  it("표준 위반은 OK·ALIAS 가 아닌 컬럼을 표 물리명·컬럼 순서로 보인다", () => {
    const rows = violationRows(menuModel(), status({ "c-1": "OK", "c-2": "MISS", "c-4": "NEW", "c-3": "ALIAS" }));
    expect(rows.map((r) => [r.table, r.column, r.status])).toEqual([["TB_MCM_SEC_MENU", "OBJECT_ID", "MISS"], ["TB_MCM_SEC_MENU", "MENU_NM", "NEW"]]);
    expect(rows[0].tableId).toBe("t-1");
    expect(violationRows(menuModel(), null)).toEqual([]);
  });

  it("추정 관계는 접힌 후보까지 자식·순위 순으로 보이고, 확정·기각된 관계는 뺀다", () => {
    const m = menuModel();
    m.relations["r-3"] = relation("t-1", "t-2", [["c-4", "c-3"]], { state: "INFERRED", candidateRank: 2 });
    m.relations["r-2"] = relation("t-1", "t-1", [["c-4", "c-1"]], { state: "INFERRED", candidateRank: 1 });
    m.relations["r-9"] = relation("t-2", "t-1", [["c-3", "c-1"]], { state: "REJECTED" });
    const rows = inferredRows(m);
    expect(rows.map((r) => [r.id, r.child, r.parent, r.rank, r.folded])).toEqual([
      ["r-2", "TB_MCM_SEC_MENU.MENU_NM", "TB_MCM_SEC_MENU.MENU_ID", "1순위", false],
      ["r-3", "TB_MCM_SEC_MENU.MENU_NM", "TB_MCM_SEC_OBJ.OBJECT_ID", "후보 2", true],
      ["r-1", "TB_MCM_SEC_MENU.OBJECT_ID", "TB_MCM_SEC_OBJ.OBJECT_ID", "", false],
    ]);
    expect(rows[2].evidence).toBe("NAME_RULE PK 이름 일치");
  });

  it("변경 기록은 최근 rev 부터 종류별 수로 줄이고, DB 차이는 종류 이름과 타입 글자로 보인다", () => {
    const h = historyRows({ rev: 5, reload: false, deltas: [
      { modelId: "mcm", rev: 4, userId: "tester", session: "ui-a", source: "UI", changes: [{ kind: "relation", id: "r-1", op: "upsert", value: {} }] },
      { modelId: "mcm", rev: 5, userId: "tester", session: "claude-a", source: "MCP", changes: [
        { kind: "table", id: "t-9", op: "upsert", value: {} },
        { kind: "column", id: "c-9", op: "upsert", value: {} },
        { kind: "column", id: "c-8", op: "upsert", value: {} },
      ] },
    ] });
    expect(h.map((r) => [r.rev, r.session, r.summary])).toEqual([[5, "claude-a", "표 1·컬럼 2"], [4, "ui-a", "관계 1"]]);
    const d = diffRows({ modelId: "mcm", rev: 5, schema: "MCMAPUSER", items: [{
      id: "COLUMN_CHANGED:TB_A.NM", kind: "COLUMN_CHANGED", table: "TB_A", column: "NM",
      before: { dataType: "VARCHAR2", length: 100, scale: null, notNull: true }, after: { dataType: "NUMBER", length: 10, scale: 2, notNull: false },
    }] });
    expect(d).toEqual([{ id: "COLUMN_CHANGED:TB_A.NM", kind: "컬럼 다름", table: "TB_A", column: "NM", before: "VARCHAR2(100) NN", after: "NUMBER(10,2)" }]);
    expect(historyRows(null)).toEqual([]);
    expect(diffRows(null)).toEqual([]);
  });

  it("컬럼 그리드 행은 키·도메인 이름·타입·NN·표준 상태를 싣는다", () => {
    const rows = columnRows(menuModel(), "t-1", status({ "c-1": "OK", "c-2": "MISS" }));
    expect(rows[0]).toEqual({ id: "c-1", key: "PK", logical: "메뉴아이디", phys: "MENU_ID", domain: "아이디", type: "VARCHAR2(30)", nn: "Y", status: "OK" });
    expect(rows[1]).toMatchObject({ id: "c-2", key: "FK?", domain: "", status: "MISS" });
    expect(rows[2]).toMatchObject({ id: "c-4", status: null });
    expect(columnRows(menuModel(), null, null)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패하는 시험 작성 — 화면 렌더**

`src/frontend/m-mdm/tests/dma/erdEdit/page-render.test.ts` (선례: `tests/dmb/headerMng/page-render.test.ts` 의 fetch 가짜와 RBAC 저장소 초기화):

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import ErdEditPage from "../../../pages/dma/erdEdit/page";
import type { ErdModelView } from "../../../pages/dma/erdEdit/types";
import { FakeEventSource as FakeES, MENU_DIAGRAMS, emptyModel, menuModel, viewOf } from "./erd-fixtures";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
const g = globalThis as unknown as { EventSource?: unknown };
const originalEventSource = g.EventSource;

const MODEL_ROW = { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM 스키마", rev: 3, draftVer: "1.000", ownerId: "tester" };
const STATUS = {
  modelId: "mcm", ver: "1.000", rev: 3, statuses: { "c-1": "OK", "c-2": "MISS", "c-4": "NEW", "c-3": "OK" },
  domains: { "12": { name: "아이디", dataType: "VARCHAR2", length: 30, scale: null } },
  counts: { OK: 2, ALIAS: 0, NEW: 1, TYPE: 0, DOMAIN: 0, MISS: 1 }, elapsedMs: 5,
};

let calls: Array<{ action: string; params: Record<string, unknown> }> = [];
let currentView: ErdModelView;
let host: HTMLDivElement;
let root: Root | null = null;

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

function stubFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    if (u === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      return new Response(JSON.stringify({ grids: { buttons: { rows: [{ objId: "*", action: "*" }] } } }), { status: 200 });
    }
    if (!u.startsWith("/api/mdm/oasis/erdEdit/")) return new Response("{}", { status: 401 });
    const action = u.split("/").pop() ?? "";
    const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
    calls.push({ action, params });
    if (action === "search") return ok([MODEL_ROW]);
    if (action === "view" && params.kind === "STATUS") return ok(STATUS);
    if (action === "view" && params.kind === "SET_VIEW") return ok({ ok: true });
    if (action === "view" && params.sinceRev !== undefined) return ok({ rev: currentView.rev, reload: false, deltas: [] });
    if (action === "view") return ok(currentView);
    if (action === "compare") return ok({ modelId: "mcm", rev: currentView.rev, schema: "MCMAPUSER", items: [] });
    if (action === "save") {
      return ok({ applied: true, rev: currentView.rev + 1, warnings: [], rejection: null,
        changes: [{ kind: "relation", id: "r-1", op: "patch", value: { state: "CONFIRMED" } }] });
    }
    if (action === "import") {
      return ok({ applied: true, rev: 4, changes: [], warnings: [], rejection: null,
        summary: { tables: 2, columns: 4, keys: 2, relations: { DB: 0, INFERRED: 1 }, diagramId: "d-all" } });
    }
    return ok({});
  }) as typeof fetch;
}

async function settle(ms = 50) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function waitGone(get: () => unknown, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (get()) {
    if (Date.now() > end) throw new Error("사라져야 할 요소가 남아 있다");
    await settle(25);
  }
}

async function waitFor<T>(get: () => T | null | undefined, ms = 2000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() > end) throw new Error("기다린 요소가 나타나지 않았다");
    await settle(25);
  }
}

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function click(el: Element | null) {
  expect(el, "누를 요소가 없다").not.toBeNull();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

/** 화면을 열고 모델을 골라 SSE 를 연 상태까지 간다. */
async function openModel() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(ErdEditPage)));
  });
  await click(await waitFor(() => byTestId("erd-model-mcm")));
  await waitFor(() => FakeES.all[0]);
  await act(async () => {
    FakeES.all[0].emit("open");
  });
  await settle(600); // 표준 상태는 0.5초 미뤄 읽는다
}

const viewCalls = () => calls.filter((c) => c.action === "view" && c.params.kind === undefined && c.params.sinceRev === undefined);

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  FakeES.all = [];
  g.EventSource = FakeES;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  currentView = viewOf(menuModel(), MENU_DIAGRAMS);
  stubFetch();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  globalThis.fetch = originalFetch;
  g.EventSource = originalEventSource;
});

describe("erdEdit 화면", () => {
  it("모델을 고르면 rev·다이어그램을 보이고, SSE 를 sinceRev 로 열고, 화면 상태를 알린다", async () => {
    await openModel();
    expect(calls[0].action).toBe("search");
    expect(byTestId("erd-rev")?.textContent).toBe("rev 3");
    expect(byTestId("erd-diagram-d-all")?.textContent).toContain("전체");
    expect(FakeES.all[0].url).toMatch(/^\/api\/mdm\/rest\/erdEdit\/view\/api\/mdm\/erd\/stream\/mcm\?session=ui-[0-9a-z]{8}&source=UI&sinceRev=3$/);
    const setView = calls.filter((c) => c.action === "view" && c.params.kind === "SET_VIEW");
    expect(setView).toHaveLength(1);
    expect(JSON.parse(String(setView[0].params.viewJson))).toEqual({ diagramId: "d-all", selectedTables: [] });
    expect(setView[0].params.session).toBe(new URL(FakeES.all[0].url, "http://x").searchParams.get("session"));
    expect(calls.some((c) => c.action === "view" && c.params.kind === "STATUS")).toBe(true);
    expect(byTestId("erd-banner-readonly")).toBeNull();
  });

  it("추정 관계를 확정하면 save 에 confirmRelation 을 보내고, 응답을 얹어 목록에서 뺀다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1")));
    const save = calls.filter((c) => c.action === "save");
    expect(save).toHaveLength(1);
    expect(save[0].params).toMatchObject({ modelId: "mcm", baseRev: 3, source: "UI", commandsJson: '[{"op":"confirmRelation","id":"r-1"}]' });
    expect(String(save[0].params.session)).toMatch(/^ui-/);
    expect(byTestId("erd-rev")?.textContent).toBe("rev 4");
    expect(byTestId("erd-message")?.textContent).toBe("관계를 확정했습니다.");
    await waitGone(() => byTestId("erd-confirm-r-1"));
  });

  it("연결이 끊기면 끊김 띠를 띄우고 확정을 막는다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    const btn = await waitFor(() => byTestId("erd-confirm-r-1"));
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      FakeES.all[0].emit("error");
    });
    await settle();
    expect(byTestId("erd-banner-lost")).not.toBeNull();
    expect((byTestId("erd-confirm-r-1") as HTMLButtonElement).disabled).toBe(true);
  });

  it("확정된 버전을 보면 읽기 전용 띠를 보이고 확정을 막는다", async () => {
    currentView = viewOf(menuModel(), { ...MENU_DIAGRAMS, status: "RELEASED" });
    await openModel();
    expect(byTestId("erd-banner-readonly")?.textContent).toContain("확정된 버전");
    await click(byTestId("erd-tab-inferred"));
    expect(((await waitFor(() => byTestId("erd-confirm-r-1"))) as HTMLButtonElement).disabled).toBe(true);
  });

  it("표가 없는 모델은 [DB 가져오기] 로 import kind=FROM_DB 를 보내고 모델을 다시 읽는다", async () => {
    currentView = viewOf(emptyModel(), {});
    await openModel();
    expect(byTestId("erd-canvas-empty")?.textContent).toContain("표가 없습니다");
    expect(viewCalls()).toHaveLength(1);
    currentView = viewOf(menuModel(), { ...MENU_DIAGRAMS, rev: 4 });
    await click(byTestId("erd-import"));
    await settle();
    expect(calls.find((c) => c.action === "import")?.params).toEqual({
      modelId: "mcm", baseRev: 3, session: expect.stringMatching(/^ui-/), source: "UI", kind: "FROM_DB",
    });
    expect(viewCalls()).toHaveLength(2);
    expect(byTestId("erd-message")?.textContent).toBe("표 2개·컬럼 4개·키 2개, 관계 DB 0개·추정 1개를 가져왔습니다.");
    expect(byTestId("erd-rev")?.textContent).toBe("rev 4");
    expect(byTestId("erd-import")).toBeNull();
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 확인**

Run: `cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/panel-rows.test.ts tests/dma/erdEdit/page-render.test.ts`
Expected: FAIL — `Failed to resolve import "../../../pages/dma/erdEdit/panels/ColumnGrid"`(그리고 `DiagramTree`·`ReviewPanel`·`TopBar`·`page`).

- [ ] **Step 4: 구현 — `panels/TopBar.tsx`**

`src/frontend/m-mdm/pages/dma/erdEdit/panels/TopBar.tsx`:

```tsx
"use client";

/**
 * 위 막대(스펙 2.2·4.4) — 모델 고르기·등록, 버전·rev, 접속자, 논리·물리 전환(F3), 보기 프리셋, 첫 가져오기, 띠(연결 끊김·읽기 전용), 메시지 줄.
 * 길이가 바뀌는 상태 글은 단추 줄이 아니라 아래 띠·메시지 줄에 둔다(Local-Rules §38).
 */
import { useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";

import { VersionStatusBadge, type MdmVersionStatus } from "@/shell";

import type { RegInput } from "../api";
import type { ErdMode, ErdPreset } from "../canvas/erd-flow";
import type { ErdStreamStatus } from "../state/useErdStream";
import type { ErdModelRow, ErdPresence, ErdState } from "../types";

export const PRESETS: readonly { value: ErdPreset; label: string }[] = [
  { value: "basic", label: "기본" },
  { value: "overview", label: "E-R 개요" },
  { value: "both", label: "논리+물리 동시" },
];

export const nextMode = (m: ErdMode): ErdMode => (m === "logical" ? "physical" : "logical");

/** 읽기 전용 이유(스펙 4.4). null 이면 확정·기각·가져오기를 할 수 있다. 문구에 다음에 할 일을 적는다(스펙 4.5). */
export function readOnlyReason(state: ErdState, me: string | null, canEdit: boolean): string | null {
  if (!canEdit) return "이 화면의 편집 권한이 없어 읽기만 할 수 있습니다. 권한은 시스템 관리자에게 요청하세요.";
  if (state.status !== "DRAFT") return "확정된 버전을 보고 있어 읽기만 할 수 있습니다. 고치려면 새 버전(DRAFT)을 만드세요.";
  if (!me || (me !== state.ownerId && !state.editors.includes(me))) {
    return `공동 편집자가 아니어서 읽기만 할 수 있습니다. 소유자(${state.ownerId ?? "없음"})에게 공동 편집자 등록을 요청하세요.`;
  }
  return null;
}

/** 접속자 동그라미 글자 — 내 세션은 "나", 사람은 사용자 ID, LLM 은 세션 이름. */
export function avatarLabel(p: ErdPresence, mySession: string): string {
  if (p.session === mySession) return "나";
  return p.source === "UI" ? p.userId : p.session;
}

export interface TopBarProps {
  models: ErdModelRow[];
  modelId: string | null;
  onModelChange(modelId: string): void;
  state: ErdState | null;
  mySession: string;
  mode: ErdMode;
  onModeChange(mode: ErdMode): void;
  preset: ErdPreset;
  onPresetChange(preset: ErdPreset): void;
  streamStatus: ErdStreamStatus;
  readOnly: string | null;
  message: string | null;
  canReg: boolean;
  canImport: boolean;
  /** 읽기 전용·연결 끊김·처리 중 — 쓰기 단추를 막는다. */
  locked: boolean;
  onRegister(input: RegInput): void;
  onImport(): void;
}

const EMPTY_REG: RegInput = { modelId: "", moduleId: "", schemaName: "", modelName: "" };
const REG_FIELDS: readonly { key: keyof RegInput; label: string }[] = [
  { key: "modelId", label: "모델 ID" },
  { key: "moduleId", label: "모듈" },
  { key: "schemaName", label: "스키마" },
  { key: "modelName", label: "모델 이름" },
];

export function TopBar(p: TopBarProps) {
  const [reg, setReg] = useState<RegInput | null>(null);
  const s = p.state;
  const empty = !!s && Object.keys(s.model.tables).length === 0;
  return (
    <div className="erd-bar" data-testid="erd-bar">
      <div className="erd-bar__row">
        <span className="erd-bar__label">모델</span>
        {p.models.map((m) => (
          <Button
            key={m.modelId}
            size="sm"
            variant={m.modelId === p.modelId ? "primary" : "default"}
            data-testid={`erd-model-${m.modelId}`}
            title={`${m.moduleId} · ${m.schemaName}`}
            onClick={() => p.onModelChange(m.modelId)}
          >
            {m.modelName}
          </Button>
        ))}
        {p.canReg && (
          <Button size="sm" data-testid="erd-reg-open" onClick={() => setReg(reg ? null : EMPTY_REG)}>
            모델 등록
          </Button>
        )}
        {s && (
          <>
            <span className="erd-bar__meta" data-testid="erd-ver">
              {s.ver}
            </span>
            <VersionStatusBadge status={s.status as MdmVersionStatus} />
            <span className="erd-bar__meta" data-testid="erd-rev">
              rev {s.rev}
            </span>
            <span className="erd-bar__people" data-testid="erd-presence" title="접속자">
              {s.presence.map((x) => (
                <span key={x.session} className="erd-avatar" data-source={x.source === "UI" ? "ui" : "llm"} title={`${x.userId} · ${x.session}`}>
                  {avatarLabel(x, p.mySession)}
                </span>
              ))}
            </span>
          </>
        )}
        <span className="erd-bar__spacer" />
        <span className="erd-bar__group" role="group" aria-label="논리·물리 전환 (F3)">
          <Button size="sm" variant={p.mode === "logical" ? "primary" : "default"} aria-pressed={p.mode === "logical"}
            data-testid="erd-mode-logical" title="논리 모드 (F3)" onClick={() => p.onModeChange("logical")}>
            논리
          </Button>
          <Button size="sm" variant={p.mode === "physical" ? "primary" : "default"} aria-pressed={p.mode === "physical"}
            data-testid="erd-mode-physical" title="물리 모드 (F3)" onClick={() => p.onModeChange("physical")}>
            물리
          </Button>
        </span>
        <span className="erd-bar__group" role="group" aria-label="보기 프리셋">
          {PRESETS.map((x) => (
            <Button key={x.value} size="sm" variant={p.preset === x.value ? "primary" : "default"} aria-pressed={p.preset === x.value}
              data-testid={`erd-preset-${x.value}`} onClick={() => p.onPresetChange(x.value)}>
              {x.label}
            </Button>
          ))}
        </span>
        {empty && p.canImport && (
          <Button size="sm" variant="primary" data-testid="erd-import" disabled={p.locked} onClick={p.onImport}>
            DB 가져오기
          </Button>
        )}
      </div>
      {reg && (
        <div className="erd-bar__row" data-testid="erd-reg-form">
          {REG_FIELDS.map((f) => (
            <Input key={f.key} data-testid={`erd-reg-${f.key}`} aria-label={f.label} placeholder={f.label} value={reg[f.key]}
              onChange={(v) => setReg((r) => ({ ...(r ?? EMPTY_REG), [f.key]: v }))} />
          ))}
          <Button size="sm" variant="primary" data-testid="erd-reg-submit"
            onClick={() => {
              p.onRegister(reg);
              setReg(null);
            }}>
            등록
          </Button>
          <Button size="sm" onClick={() => setReg(null)}>
            취소
          </Button>
        </div>
      )}
      {p.streamStatus === "lost" && (
        <div className="erd-banner" data-kind="lost" role="alert" data-testid="erd-banner-lost">
          연결이 끊겼습니다. 다시 연결하는 중이며, 연결될 때까지 확정·기각·가져오기를 멈춥니다.
        </div>
      )}
      {p.readOnly && (
        <div className="erd-banner" data-kind="readonly" data-testid="erd-banner-readonly">
          {p.readOnly}
        </div>
      )}
      <div className="erd-message" role="status" data-testid="erd-message">
        {p.message ?? ""}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 구현 — `panels/DiagramTree.tsx`**

`src/frontend/m-mdm/pages/dma/erdEdit/panels/DiagramTree.tsx`:

```tsx
"use client";

/**
 * 왼쪽 패널(스펙 2.2) — 업무영역 → 다이어그램 목록(표 수·위반 수), 다이어그램에 없는 표 수, 표 찾기(Ctrl+T, 물리명·논리명·주석).
 * 찾기는 shared FindWidget 을 쓴다. 다음·이전으로 돌 때마다 그 표를 고르고 캔버스를 그 표로 옮긴다(onRevealTable).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@dk-oasis/shared/form";
import {
  DEFAULT_FIND_OPTIONS, FindWidget, INVALID_FIND, compileFind, type FindOptions, type FindState,
} from "@dk-oasis/shared/react-flow";

import { BAD_STATUSES } from "../canvas/erd-flow";
import type { ErdColumnStatus, ErdDiagram, ErdState, ErdTable } from "../types";

export interface DiagramItem {
  id: string;
  name: string;
  tables: number;
  violations: number;
}

export interface DiagramGroup {
  area: string;
  diagrams: DiagramItem[];
}

export function sortedDiagrams(diagrams: Readonly<Record<string, ErdDiagram>>): ErdDiagram[] {
  return Object.values(diagrams).sort((a, b) => a.sortSeq - b.sortSeq || a.id.localeCompare(b.id));
}

/** 업무영역별 다이어그램. 표 수는 지금 버전에 있는 표만, 위반 수는 그 표들의 TYPE·DOMAIN·MISS 컬럼 수다. */
export function diagramGroups(state: ErdState, statuses: Readonly<Record<string, ErdColumnStatus>>): DiagramGroup[] {
  const m = state.model;
  const per = new Map<string, { tables: number; violations: number }>();
  for (const n of Object.values(state.nodes)) {
    const t = m.tables[n.table];
    if (!t) continue;
    const e = per.get(n.diagram) ?? { tables: 0, violations: 0 };
    e.tables += 1;
    e.violations += t.columnOrder.filter((c) => BAD_STATUSES.has(statuses[c] as string)).length;
    per.set(n.diagram, e);
  }
  const groups: DiagramGroup[] = [];
  for (const d of sortedDiagrams(state.diagrams)) {
    let g = groups.find((x) => x.area === d.areaName);
    if (!g) {
      g = { area: d.areaName, diagrams: [] };
      groups.push(g);
    }
    g.diagrams.push({ id: d.id, name: d.diagramName, ...(per.get(d.id) ?? { tables: 0, violations: 0 }) });
  }
  return groups;
}

export function unplacedCount(state: ErdState): number {
  const placed = new Set(Object.values(state.nodes).map((n) => n.table));
  return Object.keys(state.model.tables).filter((id) => !placed.has(id)).length;
}

/** 물리명·논리명·주석 가운데 하나라도 맞는 표(물리명 순). */
export function findTables(tables: Readonly<Record<string, ErdTable>>, query: string, options: FindOptions): { hits: string[]; invalid: boolean } {
  const match = compileFind(query, options);
  if (match === null) return { hits: [], invalid: false };
  if (match === INVALID_FIND) return { hits: [], invalid: true };
  const hits = Object.entries(tables)
    .filter(([, t]) => match(t.phys) || match(t.logical) || (!!t.comment && match(t.comment)))
    .sort(([, a], [, b]) => a.phys.localeCompare(b.phys))
    .map(([id]) => id);
  return { hits, invalid: false };
}

const NO_TABLES: Readonly<Record<string, ErdTable>> = {};

function useTableFind(tables: Readonly<Record<string, ErdTable>>, onReveal: (tableId: string) => void): FindState {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FindOptions>({ ...DEFAULT_FIND_OPTIONS });
  const [index, setIndex] = useState(-1);
  const { hits, invalid } = useMemo(() => findTables(tables, query, options), [tables, query, options]);
  const move = (step: 1 | -1) => {
    if (hits.length === 0) return;
    const i = index < 0 ? (step > 0 ? 0 : hits.length - 1) : (index + step + hits.length) % hits.length;
    setIndex(i);
    onReveal(hits[i]);
  };
  return {
    query, options, invalid, hits, index,
    setQuery: (q) => {
      setQuery(q);
      setIndex(-1);
    },
    toggleOption: (key) => {
      setOptions((o) => ({ ...o, [key]: !o[key] }));
      setIndex(-1);
    },
    next: () => move(1),
    prev: () => move(-1),
  };
}

const isMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export interface DiagramTreeProps {
  state: ErdState | null;
  statuses: Readonly<Record<string, ErdColumnStatus>>;
  activeDiagram: string | null;
  onSelectDiagram(diagramId: string): void;
  onRevealTable(tableId: string): void;
  /** 오를 때마다 찾기 칸을 연다(Ctrl+T). */
  findSeq: number;
}

export function DiagramTree({ state, statuses, activeDiagram, onSelectDiagram, onRevealTable, findSeq }: DiagramTreeProps) {
  const [openSeq, setOpenSeq] = useState(0); // 0 = 닫힘, 오를 때마다 입력 칸에 초점
  const inputRef = useRef<HTMLInputElement>(null);
  const find = useTableFind(state?.model.tables ?? NO_TABLES, onRevealTable);
  const groups = useMemo(() => (state ? diagramGroups(state, statuses) : []), [state, statuses]);
  const unplaced = useMemo(() => (state ? unplacedCount(state) : 0), [state]);

  useEffect(() => {
    if (findSeq > 0) setOpenSeq((s) => s + 1);
  }, [findSeq]);

  return (
    <div className="erd-tree" data-testid="erd-tree">
      <div className="erd-tree__find">
        {openSeq > 0 ? (
          <FindWidget find={find} inputRef={inputRef} focusSeq={openSeq} onClose={() => setOpenSeq(0)} mac={isMac()}
            testId="erd-find" label="표 찾기" inputLabel="표 찾기 — 물리명·논리명·주석" placeholder="표 찾기" />
        ) : (
          <Button size="sm" data-testid="erd-find-open" disabled={!state} onClick={() => setOpenSeq((s) => s + 1)}>
            표 찾기 (Ctrl+T)
          </Button>
        )}
      </div>
      {groups.map((g) => (
        <div key={g.area} className="erd-tree__area">
          <div className="erd-tree__area-name">{g.area}</div>
          {g.diagrams.map((d) => (
            <button
              type="button"
              key={d.id}
              className="erd-tree__item"
              data-active={d.id === activeDiagram ? "" : undefined}
              aria-current={d.id === activeDiagram ? "true" : undefined}
              data-testid={`erd-diagram-${d.id}`}
              onClick={() => onSelectDiagram(d.id)}
            >
              <span>{d.name}</span>
              <span className="erd-tree__count">{d.tables}</span>
              {d.violations > 0 && (
                <span className="erd-tree__bad" title="표준 위반 컬럼 수">
                  {d.violations}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      {state && unplaced > 0 && (
        <div className="erd-tree__note" data-testid="erd-unplaced">
          다이어그램에 없는 표 {unplaced}개
        </div>
      )}
      <div className="erd-tree__legend">
        <div>실선: DB FK·확정 관계</div>
        <div>노란 파선: 추정 관계(검토 대기)</div>
        <div>행 바탕: 붉은색 사전 없음, 노란색 타입·도메인 다름</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 구현 — `panels/ColumnGrid.tsx`, `panels/ReviewPanel.tsx`**

`src/frontend/m-mdm/pages/dma/erdEdit/panels/ColumnGrid.tsx`:

```tsx
"use client";

/** 오른쪽 컬럼 그리드(읽기 전용, 스펙 2.2) — 고른 표의 컬럼: 키|논리명|물리명|도메인|타입|NN|표준. */
import { useMemo } from "react";

import { Badge, type BadgeTone } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

import { keyMarks } from "../canvas/erd-flow";
import { typeText } from "../canvas/erd-geometry";
import type { ErdColumnStatus, ErdModelJson, ErdStatusView } from "../types";

export const STATUS_LABEL: Record<ErdColumnStatus, string> = {
  OK: "표준", ALIAS: "별칭", NEW: "새 이름", TYPE: "타입 불일치", DOMAIN: "도메인 다름", MISS: "사전 없음",
};
const STATUS_TONE: Record<ErdColumnStatus, BadgeTone> = {
  OK: "success", ALIAS: "success", NEW: "primary", TYPE: "warning", DOMAIN: "warning", MISS: "danger",
};

export function statusBadge(value: unknown) {
  const s = value as ErdColumnStatus | null;
  return s && STATUS_LABEL[s] ? <Badge label={STATUS_LABEL[s]} tone={STATUS_TONE[s]} /> : null;
}

/** 칸 정의는 모듈 상수다(Local-Rules §20·§31). meta:false — MDM 컬럼 사전 캡션을 쓰지 않는다. */
const COLUMNS: GridColumn[] = [
  { key: "key", header: "키", width: 44, align: "center", meta: false },
  { key: "logical", header: "논리명", width: 110, meta: false },
  { key: "phys", header: "물리명", width: 120, meta: false },
  { key: "domain", header: "도메인", width: 80, meta: false },
  { key: "type", header: "타입", width: 100, meta: false },
  { key: "nn", header: "NN", width: 40, align: "center", meta: false },
  { key: "status", header: "표준", width: 90, align: "center", meta: false, tooltip: false, render: statusBadge },
];

export function columnRows(model: ErdModelJson, tableId: string | null, status: ErdStatusView | null): Record<string, unknown>[] {
  const t = tableId ? model.tables[tableId] : undefined;
  if (!t) return [];
  const marks = keyMarks(model);
  return t.columnOrder
    .filter((cid) => model.columns[cid])
    .map((cid) => {
      const c = model.columns[cid];
      return {
        id: cid,
        key: marks.get(cid) ?? "",
        logical: c.logical,
        phys: c.phys,
        domain: c.domainId != null ? status?.domains[String(c.domainId)]?.name ?? String(c.domainId) : "",
        type: typeText(c),
        nn: c.notNull ? "Y" : "",
        status: status?.statuses[cid] ?? null,
      };
    });
}

export interface ColumnGridProps {
  model: ErdModelJson | null;
  tableId: string | null;
  status: ErdStatusView | null;
}

export function ColumnGrid({ model, tableId, status }: ColumnGridProps) {
  const rows = useMemo(() => (model ? columnRows(model, tableId, status) : []), [model, tableId, status]);
  const table = model && tableId ? model.tables[tableId] : undefined;
  return (
    <GridPanel title={table ? table.logical || table.phys : "컬럼"} count={rows.length}
      titleExtra={table ? <span className="erd-mono">{table.phys}</span> : undefined}>
      <div data-testid="erd-columns" style={{ position: "absolute", inset: 0 }}>
        <AgDataGrid gridId="erdColumns" columnSizing="fit" columns={COLUMNS} data={rows} rowKey="id"
          emptyMessage="캔버스나 검토 목록에서 표를 고르세요." emptyTestId="erd-columns-empty" />
      </div>
    </GridPanel>
  );
}
```

`src/frontend/m-mdm/pages/dma/erdEdit/panels/ReviewPanel.tsx`:

```tsx
"use client";

/**
 * 아래 검토 패널(스펙 2.2) — 표준 위반 / 추정 관계 검토(확정·기각, 접힌 후보 포함, S7) / DB 차이(읽기, S4) / 변경 기록(view sinceRev).
 * 확정·기각 단추는 읽기 전용·연결 끊김·처리 중이면 막는다(locked). 단추 열 정의는 locked·onDecide 가 바뀔 때만 새로 만든다(Local-Rules §20).
 * 행을 누르면 그 표를 고른다(컬럼 그리드·캔버스가 따라간다).
 */
import { useCallback, useMemo } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import type { RelationDecision } from "../api";
import { typeText } from "../canvas/erd-geometry";
import type { ErdChangesView, ErdColumnSpec, ErdColumnStatus, ErdDbDiffItem, ErdDbDiffView, ErdModelJson, ErdStatusView } from "../types";
import { statusBadge } from "./ColumnGrid";

export type ReviewTab = "violations" | "inferred" | "diff" | "history";

export interface ViolationRow extends Record<string, unknown> {
  id: string;
  tableId: string;
  table: string;
  column: string;
  logical: string;
  status: ErdColumnStatus;
  domain: string;
}

/** 상태가 OK·ALIAS 가 아닌 컬럼(README MCP listViolations 와 같은 기준). */
export function violationRows(model: ErdModelJson, status: ErdStatusView | null): ViolationRow[] {
  if (!status) return [];
  const out: ViolationRow[] = [];
  const tables = Object.entries(model.tables).sort(([, a], [, b]) => a.phys.localeCompare(b.phys));
  for (const [tableId, t] of tables) {
    for (const cid of t.columnOrder) {
      const c = model.columns[cid];
      const s = status.statuses[cid];
      if (!c || !s || s === "OK" || s === "ALIAS") continue;
      out.push({
        id: cid, tableId, table: t.phys, column: c.phys, logical: c.logical, status: s,
        domain: c.domainId != null ? status.domains[String(c.domainId)]?.name ?? String(c.domainId) : "",
      });
    }
  }
  return out;
}

export interface InferredRow extends Record<string, unknown> {
  id: string;
  tableId: string;
  child: string;
  parent: string;
  evidence: string;
  rank: string;
  folded: boolean;
}

/** 추정 관계 전부(접힌 후보 포함). 자식 글자 → 순위(없음·1·2…) → id 순. */
export function inferredRows(model: ErdModelJson): InferredRow[] {
  const name = (tableId: string, cols: string[]) =>
    `${model.tables[tableId]?.phys ?? tableId}.${cols.map((c) => model.columns[c]?.phys ?? c).join(",")}`;
  return Object.entries(model.relations)
    .filter(([, r]) => r.state === "INFERRED")
    .map(([id, r]) => ({
      id, tableId: r.child,
      child: name(r.child, r.pairs.map((p) => p[0])),
      parent: name(r.parent, r.pairs.map((p) => p[1])),
      evidence: r.evidence.map((e) => `${e.kind} ${e.ref}`).join(", "),
      rank: r.candidateRank == null ? "" : r.candidateRank === 1 ? "1순위" : `후보 ${r.candidateRank}`,
      folded: (r.candidateRank ?? 0) > 1,
      order: r.candidateRank ?? 0,
    }))
    .sort((a, b) => a.child.localeCompare(b.child) || a.order - b.order || a.id.localeCompare(b.id))
    .map(({ order: _order, ...row }) => row);
}

const DIFF_LABEL: Record<ErdDbDiffItem["kind"], string> = {
  TABLE_ADDED: "DB 에 생긴 표", TABLE_REMOVED: "DB 에서 사라진 표", COLUMN_ADDED: "DB 에 생긴 컬럼", COLUMN_REMOVED: "DB 에서 사라진 컬럼",
  COLUMN_CHANGED: "컬럼 다름", FK_ADDED: "DB 에 생긴 FK", FK_REMOVED: "DB 에서 사라진 FK",
};

const specText = (s: ErdColumnSpec | null): string => (s ? `${typeText(s)}${s.notNull ? " NN" : ""}` : "");

export function diffRows(view: ErdDbDiffView | null): Record<string, unknown>[] {
  if (!view) return [];
  return view.items.map((i) => ({ id: i.id, kind: DIFF_LABEL[i.kind], table: i.table, column: i.column ?? "", before: specText(i.before), after: specText(i.after) }));
}

const KIND_LABEL: Record<string, string> = { table: "표", column: "컬럼", key: "키", relation: "관계", diagram: "다이어그램", diagramNode: "배치" };

/** 최근 rev 부터. 변경은 종류별 수로 줄인다. */
export function historyRows(view: ErdChangesView | null): Record<string, unknown>[] {
  if (!view) return [];
  return [...view.deltas].reverse().map((d) => {
    const counts = new Map<string, number>();
    for (const c of d.changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    return {
      id: String(d.rev), rev: d.rev, userId: d.userId, session: d.session, source: d.source,
      summary: [...counts].map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}`).join("·"),
    };
  });
}

const VIOLATION_COLUMNS: GridColumn[] = [
  { key: "table", header: "표", width: 200, meta: false },
  { key: "column", header: "컬럼", width: 180, meta: false },
  { key: "logical", header: "논리명", width: 160, meta: false },
  { key: "status", header: "상태", width: 110, align: "center", meta: false, tooltip: false, render: statusBadge },
  { key: "domain", header: "도메인", width: 140, meta: false },
];
const DIFF_COLUMNS: GridColumn[] = [
  { key: "kind", header: "종류", width: 150, meta: false },
  { key: "table", header: "표", width: 200, meta: false },
  { key: "column", header: "컬럼", width: 160, meta: false },
  { key: "before", header: "모델", width: 160, meta: false },
  { key: "after", header: "DB", width: 160, meta: false },
];
const HISTORY_COLUMNS: GridColumn[] = [
  { key: "rev", header: "rev", width: 70, align: "right", meta: false },
  { key: "userId", header: "사용자", width: 120, meta: false },
  { key: "session", header: "세션", width: 160, meta: false },
  { key: "source", header: "출처", width: 70, align: "center", meta: false },
  { key: "summary", header: "변경", width: 260, meta: false },
];

function inferredColumns(onDecide: (relationId: string, op: RelationDecision) => void, locked: boolean): GridColumn[] {
  return [
    { key: "child", header: "자식(FK 쪽)", width: 240, meta: false },
    { key: "parent", header: "부모", width: 240, meta: false },
    { key: "evidence", header: "근거", width: 240, meta: false },
    { key: "rank", header: "후보", width: 80, align: "center", meta: false },
    {
      key: "actions", header: "", width: 130, meta: false, sortable: false, tooltip: false,
      render: (_v, row) => (
        <span className="erd-actions">
          <Button size="mini" data-testid={`erd-confirm-${String(row.id)}`} disabled={locked} onClick={() => onDecide(String(row.id), "confirmRelation")}>
            확정
          </Button>
          <Button size="mini" data-testid={`erd-reject-${String(row.id)}`} disabled={locked} onClick={() => onDecide(String(row.id), "rejectRelation")}>
            기각
          </Button>
        </span>
      ),
    },
  ];
}

export interface ReviewPanelProps {
  model: ErdModelJson | null;
  status: ErdStatusView | null;
  tab: ReviewTab;
  onTab(tab: ReviewTab): void;
  diff: ErdDbDiffView | null;
  history: ErdChangesView | null;
  onReloadDiff(): void;
  onReloadHistory(): void;
  onDecide(relationId: string, op: RelationDecision): void;
  onSelectTable(tableId: string): void;
  locked: boolean;
}

export function ReviewPanel({
  model, status, tab, onTab, diff, history, onReloadDiff, onReloadHistory, onDecide, onSelectTable, locked,
}: ReviewPanelProps) {
  const violations = useMemo(() => (model ? violationRows(model, status) : []), [model, status]);
  const inferred = useMemo(() => (model ? inferredRows(model) : []), [model]);
  const diffList = useMemo(() => diffRows(diff), [diff]);
  const historyList = useMemo(() => historyRows(history), [history]);
  const inferredCols = useMemo(() => inferredColumns(onDecide, locked), [onDecide, locked]);
  const onRow = useCallback((row: Record<string, unknown>) => {
    if (typeof row.tableId === "string") onSelectTable(row.tableId);
  }, [onSelectTable]);
  const items: TabItem[] = [
    { key: "violations", label: <span data-testid="erd-tab-violations">표준 위반({violations.length})</span> },
    { key: "inferred", label: <span data-testid="erd-tab-inferred">추정 관계 검토({inferred.length})</span> },
    { key: "diff", label: <span data-testid="erd-tab-diff">DB 차이{diff ? `(${diff.items.length})` : ""}</span> },
    { key: "history", label: <span data-testid="erd-tab-history">변경 기록</span> },
  ];
  return (
    <div className="erd-review__panel" data-testid="erd-review">
      <div className="erd-review__head">
        <Tabs items={items} activeKey={tab} onChange={(k) => onTab(k as ReviewTab)} />
        {tab === "diff" && (
          <Button size="sm" data-testid="erd-diff-reload" onClick={onReloadDiff}>
            다시 읽기
          </Button>
        )}
        {tab === "history" && (
          <Button size="sm" data-testid="erd-history-reload" onClick={onReloadHistory}>
            다시 읽기
          </Button>
        )}
      </div>
      {tab === "history" && history?.reload && (
        <div className="erd-review__note">rev {history.rev} 앞에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.</div>
      )}
      <div className="erd-review__body" data-testid={`erd-review-${tab}`}>
        <div className="erd-review__grid">
          {tab === "violations" && (
            <AgDataGrid gridId="erdViolations" columnSizing="fit" columns={VIOLATION_COLUMNS} data={violations} rowKey="id" onRowClick={onRow}
              emptyMessage={status ? "표준 위반이 없습니다." : "표준 상태를 읽는 중입니다."} />
          )}
          {tab === "inferred" && (
            <AgDataGrid gridId="erdInferred" columnSizing="fit" columns={inferredCols} data={inferred} rowKey="id" onRowClick={onRow}
              emptyMessage="검토할 추정 관계가 없습니다." />
          )}
          {tab === "diff" && (
            <AgDataGrid gridId="erdDbDiff" columnSizing="fit" columns={DIFF_COLUMNS} data={diffList} rowKey="id"
              emptyMessage={diff ? "DB 와 모델이 같습니다." : "DB 차이를 읽는 중입니다."} />
          )}
          {tab === "history" && (
            <AgDataGrid gridId="erdHistory" columnSizing="fit" columns={HISTORY_COLUMNS} data={historyList} rowKey="id"
              emptyMessage={history ? "변경 기록이 없습니다." : "변경 기록을 읽는 중입니다."} />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 구현 — `ErdViewer.tsx`, `page.tsx`, 화면 틀 스타일**

`src/frontend/m-mdm/pages/dma/erdEdit/ErdViewer.tsx`:

```tsx
"use client";

/**
 * ERD 설계 화면(단계 1 — 가져오기·뷰어). 정본: 스펙 2.2(화면 구성)·4.4(서버와 맞추기)·8절(exERD 동작), 계획 S11·S14.
 * 위 막대 · 왼쪽 다이어그램 목록 · 가운데 캔버스 · 오른쪽 컬럼 그리드 · 아래 검토 패널.
 * 쓰기는 모델 등록(reg)·첫 가져오기(import)·관계 확정/기각(save)뿐이고, 응답을 받은 뒤 반영한다(S14). 두 층 모델은 단계 2 다.
 * 읽기 전용(권한 없음·확정 버전·공동 편집자 아님)이거나 연결이 끊겼으면 쓰기 단추를 막는다(스펙 4.4).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import {
  ReactFlow, ReactFlowProvider, useReactFlow, useStore, type EdgeTypes, type NodeChange, type NodeTypes,
} from "@dk-oasis/shared/react-flow";

import {
  SCREEN_ID, compareDbDiff, decideRelation, importFromDb, regModel, rejectionText, searchModels, setViewState, viewChanges, viewStatus,
  type RegInput, type RelationDecision,
} from "./api";
import { ErdRelationEdge } from "./canvas/ErdRelationEdge";
import { ErdTableNode, namesOnlySelector } from "./canvas/ErdTableNode";
import { buildFlow, useStableById, type ErdFlowNode, type ErdMode, type ErdPreset } from "./canvas/erd-flow";
import { NODE_WIDTH } from "./canvas/erd-geometry";
import { ColumnGrid } from "./panels/ColumnGrid";
import { DiagramTree, sortedDiagrams } from "./panels/DiagramTree";
import { ReviewPanel, type ReviewTab } from "./panels/ReviewPanel";
import { TopBar, nextMode, readOnlyReason } from "./panels/TopBar";
import { nodeKey } from "./state/model-delta";
import { useErdModel } from "./state/useErdModel";
import { newSession, useErdStream, useTabActive } from "./state/useErdStream";
import { createViewSync, type ViewSync } from "./state/view-sync";
import type { ErdChangesView, ErdColumnStatus, ErdDbDiffView, ErdModelRow, ErdState, ErdStatusView } from "./types";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
const PRO_OPTIONS = { hideAttribution: true };
const STATUS_DEBOUNCE_MS = 500;
const HISTORY_SPAN = 100;
const NO_STATUSES: Record<string, ErdColumnStatus> = {};
const NO_DOMAINS: Record<string, { name: string }> = {};
const NO_SELECTION: ReadonlySet<string> = new Set();

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Reveal {
  tableId: string;
  seq: number;
}

interface CanvasPaneProps {
  state: ErdState;
  diagramId: string;
  mode: ErdMode;
  preset: ErdPreset;
  status: ErdStatusView | null;
  selected: ReadonlySet<string>;
  session: string;
  reveal: Reveal | null;
  onSelect(changes: { id: string; selected: boolean }[]): void;
}

/** 캔버스(React Flow 문맥 안). 확대율은 "50% 미만인가" 만 구독한다 — 선을 표 머리 손잡이에 붙일지 정하는 데 쓴다. */
function CanvasPane({ state, diagramId, mode, preset, status, selected, session, reveal, onSelect }: CanvasPaneProps) {
  const namesOnly = useStore(namesOnlySelector);
  const statuses = status?.statuses ?? NO_STATUSES;
  const domains = status?.domains ?? NO_DOMAINS;
  const raw = useMemo(
    () => buildFlow({ state, diagramId, mode, preset, namesOnly, statuses, domains, selected, mySession: session }),
    [state, diagramId, mode, preset, namesOnly, statuses, domains, selected, session],
  );
  const nodes = useStableById(raw.nodes);
  const edges = useStableById(raw.edges);
  const rf = useReactFlow();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!reveal) return;
    const n = stateRef.current.nodes[nodeKey(diagramId, reveal.tableId)];
    if (!n) return;
    // 곧바로 옮긴다(Local-Rules §33 — fitView 는 다음 노드 갱신까지 미뤄진다).
    void rf.setCenter(n.x + NODE_WIDTH / 2, n.y + 60, { zoom: Math.max(rf.getZoom(), 0.8), duration: 200 });
  }, [reveal, diagramId, rf]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ErdFlowNode>[]) => {
      const picks: { id: string; selected: boolean }[] = [];
      for (const c of changes) if (c.type === "select") picks.push({ id: c.id, selected: c.selected });
      if (picks.length > 0) onSelect(picks);
    },
    [onSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable
      deleteKeyCode={null}
      disableKeyboardA11y
      onlyRenderVisibleElements
      minZoom={0.1}
      maxZoom={2}
      fitView={reveal === null} // 다른 다이어그램의 표로 옮겨 가며 새로 그릴 때는 화면 맞춤이 setCenter 를 덮지 않게 한다
      proOptions={PRO_OPTIONS}
    />
  );
}

export function ErdViewer() {
  const rbac = useUserButtonRbac();
  const me = rbac.userId;
  const canEdit = canDoButton(rbac, SCREEN_ID, "save");
  const canImport = canDoButton(rbac, SCREEN_ID, "import");
  const canReg = canDoButton(rbac, SCREEN_ID, "reg");
  const active = useTabActive();
  const [session] = useState(() => newSession());
  const [models, setModels] = useState<ErdModelRow[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ErdMode>("logical");
  const [preset, setPreset] = useState<ErdPreset>("basic");
  const [diagramId, setDiagramId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [findSeq, setFindSeq] = useState(0);
  const [status, setStatus] = useState<ErdStatusView | null>(null);
  const [tab, setTab] = useState<ReviewTab>("violations");
  const [diff, setDiff] = useState<ErdDbDiffView | null>(null);
  const [history, setHistory] = useState<ErdChangesView | null>(null);

  const erd = useErdModel(modelId);
  const { state } = erd;
  const stateRef = useRef(state);
  stateRef.current = state;
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const ready = state !== null && state.modelId === modelId;

  // ── 실시간 채널 ──
  const handlers = useMemo(
    () => ({
      onHello: (rev: number) => {
        if (rev !== stateRef.current?.rev) void erd.reload();
      },
      onDelta: erd.applyDelta,
      onReload: () => void erd.reload(),
      onPresence: erd.setPresence,
      onClaims: erd.setClaims,
    }),
    [erd.applyDelta, erd.reload, erd.setPresence, erd.setClaims],
  );
  const streamStatus = useErdStream({ modelId, session, ready, lastRev: state?.rev ?? null, handlers });
  const connected = streamStatus === "open";

  // ── 모델 목록(진입 때 한 번) ──
  const loadModels = useCallback(async (select?: string) => {
    try {
      setModels(await searchModels());
      if (select) setModelId(select);
    } catch (e) {
      setMessage(errText(e));
    }
  }, []);
  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  // 모델이 바뀌면 모델에 묶인 화면 상태를 비운다.
  useEffect(() => {
    setStatus(null);
    setDiff(null);
    setHistory(null);
    setSelected(NO_SELECTION);
    setDiagramId(null);
    setReveal(null);
  }, [modelId]);

  // ── 표준 상태: 모델을 읽은 뒤와 표·컬럼 델타 뒤 0.5초 미뤄 읽는다. 늦은 응답은 버린다(§37). ──
  useEffect(() => {
    if (!ready || !modelId) return;
    let alive = true;
    const t = setTimeout(() => {
      viewStatus(modelId)
        .then((s) => {
          if (alive && modelIdRef.current === modelId) setStatus(s);
        })
        .catch((e) => {
          if (alive) setMessage(errText(e));
        });
    }, STATUS_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [modelId, ready, erd.columnsSeq]);

  // ── 다이어그램·선택 ──
  const diagrams = useMemo(() => (state ? sortedDiagrams(state.diagrams) : []), [state]);
  const activeDiagram = diagramId && state?.diagrams[diagramId] ? diagramId : diagrams[0]?.id ?? null;
  const activeRef = useRef(activeDiagram);
  activeRef.current = activeDiagram;
  const focusTable = selected.size > 0 ? [...selected][0] : null;

  const onSelect = useCallback((changes: { id: string; selected: boolean }[]) => {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const c of changes) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      return next.size === cur.size && [...next].every((x) => cur.has(x)) ? cur : next;
    });
  }, []);

  const selectTable = useCallback((tableId: string) => {
    const s = stateRef.current;
    if (!s) return;
    setSelected(new Set([tableId]));
    const here = activeRef.current;
    if (!here || !s.nodes[nodeKey(here, tableId)]) {
      const other = Object.values(s.nodes).find((n) => n.table === tableId);
      if (other) setDiagramId(other.diagram);
    }
    setReveal((r) => ({ tableId, seq: (r?.seq ?? 0) + 1 }));
  }, []);

  const onSelectDiagram = useCallback((id: string) => {
    setDiagramId(id);
    setReveal(null);
  }, []);

  // ── 화면 상태 알리기(SET_VIEW, 1초에 한 번 이하). 다시 연결되면 서버 화면 상태가 비므로 같은 값도 다시 보낸다. ──
  const syncRef = useRef<ViewSync | null>(null);
  useEffect(() => {
    if (!modelId) return;
    const sync = createViewSync((v) => {
      // 알리기 실패(연결 직후 경합 등)는 화면 동작과 무관하다. 다음 선택 때 다시 보낸다.
      setViewState(modelId, session, v).catch(() => undefined);
    });
    syncRef.current = sync;
    return () => {
      sync.dispose();
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [modelId, session]);
  const selectedKey = [...selected].sort().join(",");
  useEffect(() => {
    if (connected) syncRef.current?.forget();
  }, [connected]);
  useEffect(() => {
    if (!connected) return;
    syncRef.current?.push({ diagramId: activeDiagram, selectedTables: selectedKey ? selectedKey.split(",") : [] });
  }, [connected, activeDiagram, selectedKey]);

  // ── 단축키: F3 논리·물리, Ctrl+T 표 찾기. 포털 탭이 활성일 때만. ──
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        setMode(nextMode);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setFindSeq((s) => s + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // ── 읽기 전용(스펙 4.4) ──
  const roReason = state && !rbac.isLoading ? readOnlyReason(state, me, canEdit) : null;
  const locked = rbac.isLoading || roReason !== null || !connected || busy;

  // ── 쓰기(S14) ──
  const onDecide = useCallback(
    async (relationId: string, op: RelationDecision) => {
      const s = stateRef.current;
      if (!s) return;
      setBusy(true);
      try {
        const r = await decideRelation(s.modelId, s.rev, session, op, relationId);
        if (!r.applied) {
          setMessage(rejectionText(r.rejection));
          return;
        }
        erd.applyDelta({ modelId: s.modelId, rev: r.rev, userId: me, session, source: "UI", changes: r.changes });
        setMessage(op === "confirmRelation" ? "관계를 확정했습니다." : "관계를 기각했습니다.");
      } catch (e) {
        setMessage(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [erd.applyDelta, session, me],
  );

  const onImport = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    setBusy(true);
    try {
      const r = await importFromDb(s.modelId, s.rev, session);
      if (!r.applied) {
        setMessage(rejectionText(r.rejection));
        return;
      }
      const sm = r.summary;
      setMessage(sm
        ? `표 ${sm.tables}개·컬럼 ${sm.columns}개·키 ${sm.keys}개, 관계 DB ${sm.relations.DB ?? 0}개·추정 ${sm.relations.INFERRED ?? 0}개를 가져왔습니다.`
        : "가져왔습니다.");
      if (sm) setDiagramId(sm.diagramId);
      await erd.reload();
    } catch (e) {
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  }, [erd.reload, session]);

  const onRegister = useCallback(async (input: RegInput) => {
    setBusy(true);
    try {
      const r = await regModel(input);
      setMessage(`모델 ${r.modelId} 를 등록했습니다. [DB 가져오기] 로 스키마를 가져오세요.`);
      await loadModels(r.modelId);
    } catch (e) {
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  }, [loadModels]);

  // ── 검토 패널의 DB 차이·변경 기록: 탭을 처음 열 때 읽는다. ──
  const loadDiff = useCallback(async () => {
    const id = modelIdRef.current;
    if (!id) return;
    try {
      const v = await compareDbDiff(id);
      if (modelIdRef.current === id) setDiff(v);
    } catch (e) {
      setMessage(errText(e));
    }
  }, []);
  const loadHistory = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    try {
      const v = await viewChanges(s.modelId, Math.max(0, s.rev - HISTORY_SPAN));
      if (modelIdRef.current === s.modelId) setHistory(v);
    } catch (e) {
      setMessage(errText(e));
    }
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (tab === "diff" && diff === null) void loadDiff();
    if (tab === "history" && history === null) void loadHistory();
  }, [tab, ready, diff, history, loadDiff, loadHistory]);

  const emptyText = !modelId
    ? "위 막대에서 모델을 고르거나 등록하세요."
    : !ready
      ? erd.error ?? "모델을 읽는 중입니다."
      : Object.keys(state!.model.tables).length === 0
        ? "표가 없습니다. [DB 가져오기] 로 스키마를 가져오세요."
        : "다이어그램이 없습니다.";

  return (
    <div className="erd-app" data-testid="erd-viewer">
      <div className="erd-area-bar">
        <TopBar
          models={models} modelId={modelId} onModelChange={setModelId} state={state} mySession={session}
          mode={mode} onModeChange={setMode} preset={preset} onPresetChange={setPreset}
          streamStatus={streamStatus} readOnly={roReason} message={message}
          canReg={canReg} canImport={canImport} locked={locked} onRegister={onRegister} onImport={onImport}
        />
      </div>
      <div className="erd-area-side">
        <DiagramTree state={state} statuses={status?.statuses ?? NO_STATUSES} activeDiagram={activeDiagram}
          onSelectDiagram={onSelectDiagram} onRevealTable={selectTable} findSeq={findSeq} />
      </div>
      <div className="erd-area-center">
        {ready && activeDiagram ? (
          <ReactFlowProvider key={activeDiagram}>
            <div className="erd-canvas" data-mode={mode}>
              <CanvasPane state={state!} diagramId={activeDiagram} mode={mode} preset={preset} status={status}
                selected={selected} session={session} reveal={reveal} onSelect={onSelect} />
            </div>
          </ReactFlowProvider>
        ) : (
          <div className="erd-empty" data-testid="erd-canvas-empty">
            {emptyText}
          </div>
        )}
      </div>
      <div className="erd-area-grid">
        <ColumnGrid model={state?.model ?? null} tableId={focusTable} status={status} />
      </div>
      <div className="erd-area-review">
        <ReviewPanel model={state?.model ?? null} status={status} tab={tab} onTab={setTab} diff={diff} history={history}
          onReloadDiff={loadDiff} onReloadHistory={loadHistory} onDecide={onDecide} onSelectTable={selectTable} locked={locked} />
      </div>
    </div>
  );
}
```

`src/frontend/m-mdm/pages/dma/erdEdit/page.tsx`:

```tsx
"use client";

/**
 * erdEdit — ERD 설계(단계 1: DB 가져오기·뷰어·추정 관계 검토). 정본: docs/superpowers/specs/2026-10-10-erd-tool-design.md,
 * 계획 docs/superpowers/plans/2026-10-10-erd-tool-stage1/. 메뉴: 용어·도메인(dma) > ERD 설계.
 */
import { MdmPageLayout } from "@/shell";

import { ErdViewer } from "./ErdViewer";
import { SCREEN_ID } from "./api";
import { ERD_CSS, ERD_STYLE_HREF } from "./canvas/erd-styles";

export default function ErdEditPage() {
  return (
    <>
      {/* 화면 스타일 — 포털이 dist 의 page.css 를 싣지 않으므로 문서 head 에 한 번만 넣는다(React 19 precedence, href 로 중복 제거). */}
      <style href={ERD_STYLE_HREF} precedence="default">
        {ERD_CSS}
      </style>
      <MdmPageLayout group="dma" screenId={SCREEN_ID} title="ERD 설계">
        <ErdViewer />
      </MdmPageLayout>
    </>
  );
}
```

`src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-styles.ts` — `ERD_CSS` 문자열의 마지막 규칙(`.erd-rel__label { … }`) 뒤, 닫는 백틱 앞에 화면 틀 규칙을 더한다. 주석 마지막 줄("Task 9 가 … 더한다")은 지운다.

```diff
 .erd-rel__label { position: absolute; padding: 0 var(--spacing-xs); font-size: var(--font-size-xs); color: var(--color-warning);
   background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
+.erd-app { display: grid; grid-template-columns: 220px minmax(0, 1fr) 400px; grid-template-rows: auto minmax(360px, 1fr) 260px;
+  grid-template-areas: "bar bar bar" "side center grid" "review review review"; height: 100%; min-height: 720px;
+  border: 1px solid var(--color-border); background: var(--color-bg); }
+.erd-area-bar { grid-area: bar; border-bottom: 1px solid var(--color-border); }
+.erd-area-side { grid-area: side; min-height: 0; overflow-y: auto; padding: var(--spacing-sm); border-right: 1px solid var(--color-border); }
+.erd-area-center { grid-area: center; position: relative; min-width: 0; min-height: 0; }
+.erd-area-grid { grid-area: grid; position: relative; min-height: 0; display: flex; flex-direction: column; border-left: 1px solid var(--color-border); }
+.erd-area-review { grid-area: review; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--color-border); }
+.erd-bar__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-sm); }
+.erd-bar__label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
+.erd-bar__meta { font-family: var(--font-family-mono); font-size: var(--font-size-sm); color: var(--color-text-secondary); }
+.erd-bar__people, .erd-bar__group { display: inline-flex; gap: 2px; }
+.erd-bar__spacer { flex: 1; }
+.erd-avatar { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 var(--spacing-xs);
+  border-radius: 11px; border: 1px solid var(--color-border); background: var(--color-bg-header); font-size: var(--font-size-xs); }
+.erd-avatar[data-source="llm"] { color: var(--color-success); background: var(--color-success-soft); }
+.erd-banner { padding: var(--spacing-xs) var(--spacing-sm); font-size: var(--font-size-sm); }
+.erd-banner[data-kind="lost"] { color: var(--color-danger); background: var(--color-danger-soft); }
+.erd-banner[data-kind="readonly"] { color: var(--color-warning); background: var(--color-warning-soft); }
+.erd-message { min-height: 18px; padding: 0 var(--spacing-sm) var(--spacing-xs); font-size: var(--font-size-sm); color: var(--color-text-secondary); }
+.erd-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-muted); }
+.erd-tree__find { margin-bottom: var(--spacing-sm); }
+.erd-tree__area-name { margin-top: var(--spacing-sm); font-size: var(--font-size-sm); font-weight: 600; }
+.erd-tree__item { display: flex; width: 100%; align-items: center; gap: var(--spacing-xs); padding: 2px var(--spacing-sm); border: 0;
+  border-radius: var(--radius-sm); background: transparent; color: var(--color-text); font-size: var(--font-size-sm); text-align: left; cursor: pointer; }
+.erd-tree__item:hover { background: var(--color-bg-hover); }
+.erd-tree__item[data-active] { background: var(--color-selection); }
+.erd-tree__count { margin-left: auto; color: var(--color-text-muted); }
+.erd-tree__bad { color: var(--color-danger); }
+.erd-tree__note, .erd-tree__legend { margin-top: var(--spacing-sm); font-size: var(--font-size-xs); color: var(--color-text-muted); }
+.erd-review__panel { display: flex; flex: 1; flex-direction: column; min-height: 0; }
+.erd-review__head { display: flex; align-items: center; gap: var(--spacing-sm); padding: 0 var(--spacing-sm); }
+.erd-review__note { padding: 0 var(--spacing-sm); font-size: var(--font-size-xs); color: var(--color-text-muted); }
+.erd-review__body { position: relative; flex: 1; min-height: 0; }
+.erd-review__grid { position: absolute; inset: 0; }
+.erd-actions { display: inline-flex; gap: var(--spacing-xs); }
+.erd-mono { font-family: var(--font-family-mono); }
+@media (max-width: 1180px) {
+  .erd-app { grid-template-columns: 200px minmax(0, 1fr); grid-template-rows: auto minmax(360px, 1fr) 280px 260px;
+    grid-template-areas: "bar bar" "side center" "grid grid" "review review"; }
+}
 `;
```

- [ ] **Step 8: 화면 진입점·exports 등록**

`src/frontend/m-mdm/tsup.config.ts` 두 번째 config 의 `entry`:

```diff
       "pages/dma/columnMng/page": "pages/dma/columnMng/page.tsx",
+      "pages/dma/erdEdit/page": "pages/dma/erdEdit/page.tsx",
       "pages/dmb/headerMng/page": "pages/dmb/headerMng/page.tsx",
```

`src/frontend/m-mdm/package.json` 의 `exports`(알파벳순, `domainMng` 다음):

```diff
     "./pages/dma/domainMng/page": {
       "types": "./dist/types/pages/dma/domainMng/page.d.ts",
       "import": "./dist/pages/dma/domainMng/page.js"
     },
+    "./pages/dma/erdEdit/page": {
+      "types": "./dist/types/pages/dma/erdEdit/page.d.ts",
+      "import": "./dist/pages/dma/erdEdit/page.js"
+    },
     "./pages/dma/mdmSample/page": {
```

- [ ] **Step 9: 시험 통과 확인 (m-mdm 전체)**

Run: `cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: PASS — Task 7·8 의 35건과 `panel-rows.test.ts` 7건, `page-render.test.ts` 5건.

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm build && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint`
Expected: 빌드 성공(`dist/pages/dma/erdEdit/page.js`·`dist/types/pages/dma/erdEdit/page.d.ts` 생성), 합계 줄 `[m-mdm test 합계]` 에 실패 0. `tests/package-exports.test.ts`·`tests/tsup-entries.smoke.test.ts` 가 새 화면을 포함해 통과한다. lint 오류 0.

`page-render.test.ts` 의 확정 단추를 못 찾으면(`기다린 요소가 나타나지 않았다`) AG Grid 셀 렌더러가 늦게 붙은 것이다. `waitFor` 의 상한(2초)을 늘리기 전에 `erd-review-inferred` 안에 `.ag-row` 가 있는지 먼저 본다. 행이 없으면 `inferredRows` 결과, 행은 있는데 단추가 없으면 `inferredColumns` 의 `render` 를 본다.

- [ ] **Step 10: 포털 레지스트리 재생성**

Run: `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs && /usr/bin/git diff -U0 -- lib/generated/page-registry.ts`
Expected: 한 줄만 더해진다.

```diff
+  "dma/erdEdit": () => import("@dk-oasis/m-mdm/pages/dma/erdEdit/page"),
```

Run: `cd src/frontend && pnpm --filter @dk-oasis/m-mcm test`
Expected: 실패 0.

- [ ] **Step 11: 프런트 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit src/frontend/m-mdm/tests/dma/erdEdit src/frontend/m-mdm/tsup.config.ts \
  src/frontend/m-mdm/package.json src/frontend/m-mcm/lib/generated/page-registry.ts
/usr/bin/git commit -m "$(cat <<'MSG'
feat(erd-viewer): ERD 설계 화면 조립 — 위 막대·다이어그램 목록·컬럼 그리드·검토 패널

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

- [ ] **Step 12: 메뉴 leaf 시드 (mcm)**

먼저 dma 의 빈 번호를 확인한다.

Run: `cd src/backend/mcm && grep -n '"dma", "' api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java && grep -rn '5010150' api/src/main/java`
Expected: dma leaf 는 MENU_SEQ `001`(mdmSample·domainMng)·`002`·`003`·`004`, FULL_SEQ `5010100`·`5010130`·`5010140`·`5010200`·`5010300` 이다. `5010150` 은 결과가 없다(쓰이지 않는다). 다르면 비어 있는 다음 값으로 바꿔 아래에 쓴다.

`src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java` 의 `seedMdmErdObject()`:

```diff
-    /** ERD 설계(erdEdit) — 단계 0 은 OBJECT·권한만. 메뉴 leaf 는 화면과 함께 단계 1 에서 넣는다. */
+    /** ERD 설계(erdEdit) — 단계 0 의 OBJECT·권한에, 단계 1 에서 화면과 함께 메뉴 leaf(dma 폴더, 계획 S11)를 더했다. */
     private void seedMdmErdObject() {
         String objectId = "erdEdit";
         insertMcmSecObjIfAbsent(objectId, "ERD 설계", "mdm");
+        // 메뉴 leaf — componentPath 'dma/erdEdit'(FE pages/dma/erdEdit/page.tsx). MENU_SEQ 005·FULL_SEQ 5010150 은 dma 에서 비어 있다.
+        // FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
+        insertMcmSecMenuIfAbsent("erdEdit", "005", "5010150", "ERD 설계", "dma", "erdEdit");
         insertIfAbsentComposite(
```

같은 메서드의 로그 줄:

```diff
-        log.info("[DataInitializer] ERD 설계(erdEdit) 시드 — OBJECT 1 + RBAC(SYSADMIN 1 + MDM 역할 2)");
+        log.info("[DataInitializer] ERD 설계(erdEdit) 시드 — OBJECT 1 + 메뉴 leaf 1 + RBAC(SYSADMIN 1 + MDM 역할 2)");
```

`seedMdmObjectRbac("erdEdit", "dmb")` 줄과 그 위 주석은 그대로 둔다(`MdmOasisActionVocabularyTest` 가 그 글자를 읽는다).

Run: `cd src/backend/mcm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home && ../gradlew :api:compileJava --max-workers=2`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 13: 지문 골든 재생성과 확인**

골든을 새로 쓴다(Oracle 시험 PDB, heavy 잠금).

Run: `cd src/backend/mcm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home && FINGERPRINT_UPDATE=true DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*DataInitializerSeedFingerprintTest'`
Expected: `BUILD SUCCESSFUL`(갱신 모드는 비교하지 않고 골든을 쓴다).

Run: `cd src/backend/mcm && /usr/bin/git diff -U0 -- api/src/test/resources/init/data-initializer-fingerprint.golden.txt`
Expected: `MCMAPUSER."TB_MCM_SEC_MENU"=49:…` 줄이 `=50:…` 로 바뀐 한 줄만 다르다. 다른 표의 줄이나 `__SCHEMA__` 줄이 바뀌었으면 멈추고 원인(시드 순서·다른 브랜치 변경)을 찾는다. 그대로 커밋하지 않는다.

갱신 없이 다시 돌려 골든과 맞는지 본다.

Run: `cd src/backend/mcm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*DataInitializerSeedFingerprintTest'`
Expected: `BUILD SUCCESSFUL`, 시험 PASS.

mdm 의 어휘 시험이 시더 글자를 읽으므로 함께 돈다(DB 없이 파일만 읽는다).

Run: `cd src/backend/mdm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home && ../gradlew :api:test --max-workers=2 --tests '*MdmOasisActionVocabularyTest'`
Expected: PASS.

- [ ] **Step 14: 백엔드 커밋**

```bash
/usr/bin/git add src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java \
  src/backend/mcm/api/src/test/resources/init/data-initializer-fingerprint.golden.txt
/usr/bin/git commit -m "$(cat <<'MSG'
feat(mcm): ERD 설계 메뉴 leaf(dma/erdEdit) 시드·지문 골든 갱신

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
MSG
)"
```

- [ ] **Step 15: 레인 마감 확인 (FE2 전체)**

Run: `cd src/frontend && pnpm --filter @dk-oasis/shared build && pnpm --filter @dk-oasis/shared test:unit && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint && pnpm --filter @dk-oasis/m-mcm test`
Expected: 모두 성공. 각 합계 줄의 실패 0.

---

## 계획 작성자 메모

- README Review Focus 4·5 의 Task 번호가 한 칸씩 밀려 있다(`streamReloadRefetchesModel` 를 Task 8, `zoomBelowHalfRendersNamesOnly` 를 Task 9 로 적음). 코드가 있는 곳에 맞춰 각각 Task 7(`erd-stream.test.ts`)·Task 8(`erd-canvas.test.ts`)에 두었다.
- 크롬은 Ctrl+T(새 탭)를 페이지에 넘기지 않아 스펙 8절의 "Ctrl+T 표 찾기" 가 일반 브라우저 탭에서는 동작하지 않는다. 처리기는 두고 [표 찾기] 단추를 더했다. 단계 2 에서 다른 키(예: Ctrl+Shift+F)로 바꿀지 정해야 한다.
- 다른 모델 표를 부모로 둔 관계(`parentRef`, 스펙 D8 의 회색 참조 노드)는 단계 1 캔버스에서 그리지 않는다. 가져오기(Task 3·4)가 이런 관계를 만들지 않아서다. 단계 2 로 미룬다(deferred 에 적을지 조정자가 정한다).
- 룰 세트 편집기의 `canvas/reuse.ts`(참조 재사용)는 Task 6 복사 대상이 아니어서 `erd-flow.ts` 에 같은 30줄을 다시 썼다. deferred 15번(캔버스 공통화)에서 shared 로 합칠 후보다.
- SSE 는 문서가 숨거나 포털 탭이 비활성이어도 열린 연결을 닫지 않는다(다시 연결만 미룬다). 접속자·화면 상태를 유지해 MCP `getCurrentView` 가 읽게 하려는 것이다. 숨은 탭에도 델타가 들어와 상태가 바뀐다(R10 과 부딪칠 수 있다).
- 스펙 2.1 "화면은 기존 VersionActionBar 를 다시 쓴다" 는 단계 1 에 넣지 않았다(S14 의 화면 쓰기 범위 밖). 위 막대는 버전·상태 배지만 보인다. 새 버전·확정은 단계 2 에서 붙인다.
- 진입 때 모델을 자동으로 고르지 않는다(R3·R13). Task 12 브라우저 확인은 모델 이름 단추(`text=MCM 스키마`)를 누르므로 맞는다.
- 분량이 지침(Task 당 250~700줄)을 넘는다: Task 7 약 1,360줄, Task 8 약 880줄, Task 9 약 1,650줄. 화면 파일(상태 훅 6개, 캔버스 6개, 패널 4개와 화면)과 렌더 시험의 코드를 모두 실었기 때문이다. Task 를 나눌지(예: Task 9 를 "패널·화면" 과 "메뉴 시드·골든" 으로) 조정자가 정한다.
- 확대율 50% 미만에서는 노드가 표 이름 한 줄만 그린다. 그래서 접속자 이름표도 그때는 숨는다(Task 12 3-4 의 "노드 글자가 한 줄" 확인에 맞춘 것이다).
