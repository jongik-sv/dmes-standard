# ERD UX 정비 1.5 — Task 1-4: 정렬·넣기·같은 컬럼·선택 고침 (레인 UX15)

> 공통 제약·결정(U55-U73)·Review Focus·인터페이스(정본)는 [README](README.md). 이 문서의 모든 Task 는 README Global Constraints 를 따른다.
> 다음: [02-close.md](02-close.md) · 앞 회차 형식: [UX 1차 02-fe2](../2026-10-11-erd-ux1/02-fe2-canvas-server.md)

레인 UX15 순서: Task 1 → Task 2 → Task 3 → Task 4. Task 4 Step 1-4 는 언제든 해도 된다(Step 5 는 Task 2 의 Ctrl/⌘+A 가 필요).

경로 줄임: `S/` = `src/frontend/m-mdm/pages/dma/erdEdit/`, `T/` = `src/frontend/m-mdm/tests/dma/erdEdit/`.

프런트 명령(`src/frontend` 에서):

```bash
pnpm --filter "@dk-oasis/m-mdm^..." build                        # 처음 한 번(shared dist)
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/<파일>
pnpm --filter @dk-oasis/m-mdm lint
```

레인이 고치지 않는 파일: `S/types.ts`·`S/api.ts`·`S/edit-context.ts`·`S/state/*`·`S/panels/*`. 빠진 것이 있으면 레인 보고 → 조정자.

---

### Task 1: 순수 모듈 `erd-multi.ts` — 맞춤·간격·넣기·같은 컬럼 명령

**Files:**
- Create: `S/canvas/erd-multi.ts`
- Test: `T/erd-multi.test.ts`(새)

**Interfaces:**
- Consumes: `PlacedNode`(`S/canvas/erd-commands.ts`), `estimatedSize`·`keyColumns`(`S/canvas/erd-layout.ts`), `nodeKey`(`S/state/model-delta.ts`), `isAuditColumn`(`S/audit-columns.ts`).
- Produces: README "인터페이스 (정본)" 의 `erd-multi.ts` 전부. Task 2·3 이 쓴다.

- [ ] **Step 1: 실패하는 시험**

`T/erd-multi.test.ts`:
```ts
// 여러 표 동시 처리(UX 1.5) 순수 함수 — 맞춤·간격(U58), 다른 다이어그램에 넣기(U61), 같은 컬럼 여러 표에(U63).
import { describe, expect, it } from "vitest";

import { NODE_WIDTH } from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import {
  alignBoxes, alreadyIn, arrangeLabel, bulkColumnCommands, bulkColumnPlan, columnPhysError, distributeBoxes, placeIntoCommand,
  type NodeBox,
} from "../../../pages/dma/erdEdit/canvas/erd-multi";
import type { ErdState } from "../../../pages/dma/erdEdit/types";
import { bigState, menuModel } from "./erd-fixtures";

const box = (table: string, x: number, y: number, width = 100, height = 50): NodeBox => ({ table, x, y, width, height });

describe("맞춤(U58)", () => {
  // 경계 상자 x 10-400, y 0-340
  const boxes = [box("a", 10, 0, 100, 50), box("b", 200, 30, 200, 100), box("c", 50, 300, 100, 40)];

  it("왼쪽·오른쪽·가운데 — 경계 상자 기준, y 는 그대로", () => {
    expect(alignBoxes(boxes, "left")).toEqual([{ table: "a", x: 10, y: 0 }, { table: "b", x: 10, y: 30 }, { table: "c", x: 10, y: 300 }]);
    expect(alignBoxes(boxes, "right").map((p) => p.x)).toEqual([300, 200, 300]);
    expect(alignBoxes(boxes, "hcenter").map((p) => p.x)).toEqual([155, 105, 155]);
  });

  it("위쪽·아래쪽·중간 — x 는 그대로", () => {
    expect(alignBoxes(boxes, "top").map((p) => [p.x, p.y])).toEqual([[10, 0], [200, 0], [50, 0]]);
    expect(alignBoxes(boxes, "bottom").map((p) => p.y)).toEqual([290, 240, 300]);
    expect(alignBoxes(boxes, "vcenter").map((p) => p.y)).toEqual([145, 120, 150]);
  });

  it("표가 2개 미만이면 빈 목록", () => {
    expect(alignBoxes([box("a", 0, 0)], "left")).toEqual([]);
  });

  it("arrangeLabel — 맞춤·간격 이름", () => {
    expect(arrangeLabel({ align: "left" })).toBe("왼쪽 맞춤");
    expect(arrangeLabel({ align: "vcenter" })).toBe("중간 맞춤");
    expect(arrangeLabel({ distribute: "x" })).toBe("가로 간격 같게");
  });
});

describe("간격(U58)", () => {
  it("양 끝 고정, 표 사이 빈 칸 같게(가로), 다른 축은 그대로", () => {
    expect(distributeBoxes([box("c", 500, 5), box("a", 0, 0), box("b", 150, 9)], "x"))
      .toEqual([{ table: "a", x: 0, y: 0 }, { table: "b", x: 250, y: 9 }, { table: "c", x: 500, y: 5 }]);
  });

  it("세로 — 높이가 달라도 빈 칸이 같다", () => {
    const r = distributeBoxes([box("a", 0, 0, 100, 50), box("b", 0, 100, 100, 100), box("c", 0, 400, 100, 50)], "y");
    expect(r.map((p) => p.y)).toEqual([0, 175, 400]);
  });

  it("distributeOverlapUsesMinGap — 겹치면 빈 칸 40, 첫 표부터 펼침", () => {
    expect(distributeBoxes([box("a", 0, 0), box("b", 10, 0), box("c", 20, 0)], "x").map((p) => p.x)).toEqual([0, 140, 280]);
  });

  it("distributeTieBreaksById — 같은 좌표면 id 순, 같은 입력 같은 결과", () => {
    const input = [box("b", 0, 0), box("a", 0, 0), box("c", 0, 400)];
    const r1 = distributeBoxes(input, "y");
    expect(r1.map((p) => [p.table, p.y])).toEqual([["a", 0], ["b", 200], ["c", 400]]);
    expect(distributeBoxes([...input].reverse(), "y")).toEqual(r1);
  });

  it("표가 3개 미만이면 빈 목록", () => {
    expect(distributeBoxes([box("a", 0, 0), box("b", 300, 0)], "x")).toEqual([]);
  });
});

/** bigState(4) = d-all 에 t-0..t-3 이 (0,0)(280,0)(560,0)(840,0). d-sub 에 t-1 이 (100,50). d-empty 는 비었음. */
function twoDiagrams(): ErdState {
  const s = bigState(4, 2);
  return {
    ...s,
    diagrams: {
      ...s.diagrams,
      "d-sub": { id: "d-sub", areaName: "기본", diagramName: "작은", sortSeq: 1 },
      "d-empty": { id: "d-empty", areaName: "기본", diagramName: "빈", sortSeq: 2 },
    },
    nodes: { ...s.nodes, "d-sub:t-1": { diagram: "d-sub", table: "t-1", x: 100, y: 50, foldMode: "NONE" } },
  };
}

describe("다른 다이어그램에 넣기(U61)", () => {
  it("placeIntoSkipsAlreadyPlaced — 대상에 있는 표는 빼고, 상대 배치를 지켜 대상 오른쪽 + 80 에 놓는다", () => {
    const plan = placeIntoCommand(twoDiagrams(), "d-all", "d-sub", ["t-0", "t-1", "t-2"], false);
    const x0 = 100 + NODE_WIDTH + 80;
    expect(plan.skipped).toEqual(["t-1"]);
    expect(plan.placed).toEqual(["t-0", "t-2"]);
    expect(plan.command).toEqual({ op: "placeTables", diagram: "d-sub", nodes: [{ table: "t-0", x: x0, y: 50 }, { table: "t-2", x: x0 + 560, y: 50 }] });
  });

  it("빈 대상이면 (0,0) 부터", () => {
    const plan = placeIntoCommand(twoDiagrams(), "d-all", "d-empty", ["t-2", "t-3"], false);
    expect(plan.command).toEqual({ op: "placeTables", diagram: "d-empty", nodes: [{ table: "t-2", x: 0, y: 0 }, { table: "t-3", x: 280, y: 0 }] });
  });

  it("모두 이미 있으면 명령 없음, 모델에 없는 표는 무시", () => {
    const plan = placeIntoCommand(twoDiagrams(), "d-all", "d-sub", ["t-1", "t-gone"], false);
    expect(plan).toEqual({ command: null, placed: [], skipped: ["t-1"] });
  });

  it("alreadyIn — 대상에 이미 있는 고른 표 수", () => {
    expect(alreadyIn(twoDiagrams(), "d-sub", ["t-0", "t-1"])).toBe(1);
    expect(alreadyIn(twoDiagrams(), "d-empty", ["t-0", "t-1"])).toBe(0);
  });
});

describe("같은 컬럼 여러 표에(U63)", () => {
  it("bulkColumnPlanSkipsSamePhysCaseInsensitive — 같은 물리명(대소문자 무시)이 있는 표는 건너뜀, 모르는 표는 뺌", () => {
    const m = menuModel(); // t-1·t-2 모두 OBJECT_ID, t-1 만 MENU_NM
    expect(bulkColumnPlan(m, ["t-1", "t-2"], "object_id")).toEqual({ targets: [], skipped: ["t-1", "t-2"] });
    expect(bulkColumnPlan(m, ["t-1", "t-2"], "MENU_NM")).toEqual({ targets: ["t-2"], skipped: ["t-1"] });
    expect(bulkColumnPlan(m, ["t-1", "t-2", "t-x"], "USE_YN")).toEqual({ targets: ["t-1", "t-2"], skipped: [] });
  });

  it("columnPhysErrorBlocksAudit — 빈 값·식별자 규칙·감사 컬럼", () => {
    expect(columnPhysError("")).toBe("물리명을 넣으세요.");
    expect(columnPhysError("1ABC")).toBe("물리명은 영문 대문자로 시작하고 대문자·숫자·_·$·# 만 씁니다(128자 이내).");
    expect(columnPhysError("C_AT")).toBe("감사 컬럼은 표마다 저절로 붙습니다. 다른 물리명을 쓰세요.");
    expect(columnPhysError("USE_YN")).toBeNull();
  });

  it("bulkColumnCommands — 표마다 addColumn 하나, phys·domainId 를 넣고 domainId 가 null 이면 뺀다", () => {
    const m = menuModel();
    let n = 0;
    const id = () => `c-new${++n}`;
    expect(bulkColumnCommands(m, ["t-1", "t-2"], { logical: "사용여부", phys: "USE_YN", domainId: 7 }, id)).toEqual([
      { op: "addColumn", id: "c-new1", table: "t-1", logical: "사용여부", phys: "USE_YN", domainId: 7 },
      { op: "addColumn", id: "c-new2", table: "t-2", logical: "사용여부", phys: "USE_YN", domainId: 7 },
    ]);
    expect(bulkColumnCommands(m, ["t-2"], { logical: "사용여부", phys: "USE_YN", domainId: null }, id))
      .toEqual([{ op: "addColumn", id: "c-new3", table: "t-2", logical: "사용여부", phys: "USE_YN" }]);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-multi.test.ts`
Expected: FAIL — `erd-multi` 모듈 없음.

- [ ] **Step 3: `S/canvas/erd-multi.ts`**

```ts
/**
 * 여러 표 동시 처리(UX 1.5) — 명령 만들기(순수).
 * - 맞춤·간격(U58): 고른 표 경계 상자 기준. 결과는 PlacedNode 목록이고, 부른 쪽이 moveNodesCommand 로 한 건을 만든다.
 * - 다른 다이어그램에 넣기(U61): 서버 placeTables 는 upsert(ErdDiagramStore.mergeNode)라 대상에 이미 있는 표를 다시 보내면
 *   자리를 덮어쓴다. 그래서 여기서 뺀다.
 * - 같은 컬럼 여러 표에(U63): 같은 물리명 하나가 묶음 전체를 거절시키므로 미리 거른다. phys·domainId 를 넣어 서버 NEEDS_CHOICE 를 피한다.
 *   명령 모양은 GridInputBar addColumnBatch(pk 아님)와 같다.
 */
import { isAuditColumn } from "../audit-columns";
import { nodeKey } from "../state/model-delta";
import type { ErdCommandJson, ErdModelJson, ErdState } from "../types";
import type { PlacedNode } from "./erd-commands";
import { estimatedSize, keyColumns } from "./erd-layout";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "x" | "y";
export type ArrangeKind = { align: AlignMode } | { distribute: DistributeAxis };
export interface NodeBox { table: string; x: number; y: number; width: number; height: number }

export const ALIGN_MIN = 2;
export const DISTRIBUTE_MIN = 3;
/** 간격 맞추기에서 표 사이 빈 칸의 하한(px). 겹친 표를 펼 때 쓴다. */
export const DISTRIBUTE_MIN_GAP = 40;
/** 다른 다이어그램에 넣을 때 대상 표들과 띄우는 거리(px). */
export const PLACE_GAP = 80;

export const ALIGN_MODES: readonly AlignMode[] = ["left", "hcenter", "right", "top", "vcenter", "bottom"];
export const ALIGN_LABEL: Readonly<Record<AlignMode, string>> = {
  left: "왼쪽 맞춤", hcenter: "가운데 맞춤", right: "오른쪽 맞춤", top: "위쪽 맞춤", vcenter: "중간 맞춤", bottom: "아래쪽 맞춤",
};
export const DISTRIBUTE_LABEL: Readonly<Record<DistributeAxis, string>> = { x: "가로 간격 같게", y: "세로 간격 같게" };

export function arrangeLabel(kind: ArrangeKind): string {
  return "align" in kind ? ALIGN_LABEL[kind.align] : DISTRIBUTE_LABEL[kind.distribute];
}

export function alignBoxes(boxes: readonly NodeBox[], mode: AlignMode): PlacedNode[] {
  if (boxes.length < ALIGN_MIN) return [];
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxR = Math.max(...boxes.map((b) => b.x + b.width));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxB = Math.max(...boxes.map((b) => b.y + b.height));
  const cx = (minX + maxR) / 2;
  const cy = (minY + maxB) / 2;
  return boxes.map((b): PlacedNode => {
    switch (mode) {
      case "left": return { table: b.table, x: minX, y: b.y };
      case "hcenter": return { table: b.table, x: Math.round(cx - b.width / 2), y: b.y };
      case "right": return { table: b.table, x: maxR - b.width, y: b.y };
      case "top": return { table: b.table, x: b.x, y: minY };
      case "vcenter": return { table: b.table, x: b.x, y: Math.round(cy - b.height / 2) };
      case "bottom": return { table: b.table, x: b.x, y: maxB - b.height };
    }
  });
}

/** 축 좌표 → 표 id 순. 양 끝 표를 고정하고 빈 칸을 같게. 빈 칸이 minGap 보다 작으면 minGap 으로 첫 표부터 펼친다. */
export function distributeBoxes(boxes: readonly NodeBox[], axis: DistributeAxis, minGap = DISTRIBUTE_MIN_GAP): PlacedNode[] {
  if (boxes.length < DISTRIBUTE_MIN) return [];
  const pos = (b: NodeBox) => (axis === "x" ? b.x : b.y);
  const size = (b: NodeBox) => (axis === "x" ? b.width : b.height);
  const sorted = [...boxes].sort((a, b) => pos(a) - pos(b) || (a.table < b.table ? -1 : a.table > b.table ? 1 : 0));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const free = pos(last) + size(last) - pos(first) - sorted.reduce((s, b) => s + size(b), 0);
  const gap = Math.max(minGap, free / (sorted.length - 1));
  let at = pos(first);
  return sorted.map((b): PlacedNode => {
    const p = Math.round(at);
    at += size(b) + gap;
    return axis === "x" ? { table: b.table, x: p, y: b.y } : { table: b.table, x: b.x, y: p };
  });
}

export interface PlaceIntoPlan { command: ErdCommandJson | null; placed: string[]; skipped: string[] }

export function alreadyIn(state: ErdState, to: string, tables: readonly string[]): number {
  return tables.reduce((k, t) => (state.nodes[nodeKey(to, t)] ? k + 1 : k), 0);
}

export function placeIntoCommand(state: ErdState, from: string, to: string, tables: readonly string[], showAudit: boolean): PlaceIntoPlan {
  const skipped: string[] = [];
  const moving: PlacedNode[] = [];
  for (const t of tables) {
    if (!state.model.tables[t]) continue;
    if (state.nodes[nodeKey(to, t)]) {
      skipped.push(t);
      continue;
    }
    const src = state.nodes[nodeKey(from, t)];
    moving.push({ table: t, x: src?.x ?? 0, y: src?.y ?? 0 });
  }
  if (moving.length === 0) return { command: null, placed: [], skipped };
  const keys = keyColumns(state.model);
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  for (const n of Object.values(state.nodes)) {
    if (n.diagram !== to || !state.model.tables[n.table]) continue;
    right = Math.max(right, n.x + estimatedSize(state.model, n.table, n.foldMode, keys, showAudit).width);
    top = Math.min(top, n.y);
  }
  const baseX = Number.isFinite(right) ? right + PLACE_GAP : 0;
  const baseY = Number.isFinite(top) ? top : 0;
  const minX = Math.min(...moving.map((m) => m.x));
  const minY = Math.min(...moving.map((m) => m.y));
  const nodes = moving.map((m) => ({ table: m.table, x: Math.round(baseX + m.x - minX), y: Math.round(baseY + m.y - minY) }));
  return { command: { op: "placeTables", diagram: to, nodes }, placed: nodes.map((n) => n.table), skipped };
}

export interface BulkColumnPlan { targets: string[]; skipped: string[] }
export interface BulkColumnInput { logical: string; phys: string; domainId: number | null }

export function bulkColumnPlan(model: ErdModelJson, tables: readonly string[], phys: string): BulkColumnPlan {
  const want = phys.trim().toUpperCase();
  const has = new Set<string>();
  for (const c of Object.values(model.columns)) if (c.phys.toUpperCase() === want) has.add(c.table);
  const targets: string[] = [];
  const skipped: string[] = [];
  for (const t of tables) {
    if (!model.tables[t]) continue;
    (has.has(t) ? skipped : targets).push(t);
  }
  return { targets, skipped };
}

const COLUMN_ID = /^[A-Z][A-Z0-9_$#]{0,127}$/;

export function columnPhysError(phys: string): string | null {
  if (!phys) return "물리명을 넣으세요.";
  if (!COLUMN_ID.test(phys)) return "물리명은 영문 대문자로 시작하고 대문자·숫자·_·$·# 만 씁니다(128자 이내).";
  if (isAuditColumn(phys)) return "감사 컬럼은 표마다 저절로 붙습니다. 다른 물리명을 쓰세요.";
  return null;
}

export function bulkColumnCommands(model: ErdModelJson, targets: readonly string[], col: BulkColumnInput, newId: () => string): ErdCommandJson[] {
  return targets.filter((t) => model.tables[t]).map((t) => {
    const add: ErdCommandJson = { op: "addColumn", id: newId(), table: t, logical: col.logical, phys: col.phys };
    if (col.domainId != null) add.domainId = col.domainId;
    return add;
  });
}
```
`ErdColumn` 의 칸 이름(`table`·`phys`)은 `S/types.ts` 를 보고 맞춘다(`erd-commands.ts` `tableOfElement` 가 `model.columns[id]?.table` 을 쓴다).

- [ ] **Step 4: 실행 → 통과**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-multi.test.ts`
Expected: PASS(16개).

- [ ] **Step 5: lint·audit**

`pnpm --filter @dk-oasis/m-mdm lint` = 0. `mantine_docs.mjs audit S/canvas/erd-multi.ts`·`aggrid_docs.mjs audit …` = 0건.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-multi.ts src/frontend/m-mdm/tests/dma/erdEdit/erd-multi.test.ts
/usr/bin/git commit -m "feat(erd): 여러 표 정렬·간격·넣기·같은 컬럼 명령 만들기(순수)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 정렬 연결 — `measuredSizes`, [정렬 ▾], 표 메뉴 정렬, Ctrl/⌘+A, 툴팁 개수, 이미 되는 일괄 동작 고정

**Files:**
- Modify: `S/canvas/useCanvasEditing.ts`(`measuredSizes` 빼기, `arrange`, `selectAll`, 표 메뉴 "정렬", 도구 막대 props)
- Modify: `S/canvas/ErdToolbar.tsx`([정렬 ▾], 툴팁 개수)
- Modify: `S/canvas/erd-shortcuts.ts`(`selectAll`)
- Create: `T/erd-canvas-multi.test.ts`(하네스)

**Interfaces:**
- Consumes: Task 1 `alignBoxes`·`distributeBoxes`·`arrangeLabel`·`ALIGN_MODES`·`ALIGN_LABEL`·`DISTRIBUTE_LABEL`·`ALIGN_MIN`·`DISTRIBUTE_MIN`·`ArrangeKind`·`NodeBox`.
- Produces: `ErdToolbarProps.onArrange(kind: ArrangeKind)`, `ErdCanvasKey` `"selectAll"`. Task 3 이 `ErdToolbarProps` 에 `onPlaceInto`·`otherDiagrams` 를 더한다.

- [ ] **Step 1: 실패하는 시험 — 하네스와 시험**

`T/erd-canvas-multi.test.ts`(하네스는 `erd-canvas-editing.test.ts` 의 `Harness`·`mount`·`press`·`click` 을 줄여 옮긴다. 그 파일은 51KB 라 더 키우지 않는다):
```ts
/** @vitest-environment happy-dom */
// 여러 표 동시 처리(UX 1.5) — 캔버스 연결: 정렬(U58-U60), Ctrl/⌘+A(U67), 툴팁 개수(U68), 이미 되는 일괄 동작(U56), 넣기·같은 컬럼(Task 3).
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ReactFlow, ReactFlowProvider, isMacPlatform, useReactFlow, type NodeChange, type NodeTypes, type ReactFlowInstance,
} from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { useCanvasEditing, type CanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { RELEASED_TEXT } from "../../../pages/dma/erdEdit/state/permissions";
import type { ErdState } from "../../../pages/dma/erdEdit/types";
import { flush } from "../../dme/helpers/render";
import { deny, fakeCtx, type FakeCtx } from "./erd-canvas-fixtures";
import { bigState } from "./erd-fixtures";

vi.mock("../../../pages/dma/erdEdit/api", async (orig) => ({ ...(await orig<object>()), previewName: vi.fn() }));

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
let host: HTMLDivElement;
let root: Root | null = null;
let editing: CanvasEditing;
let raw: ErdFlowNode[] = [];
let rfNow: ReactFlowInstance<ErdFlowNode, ErdFlowEdge>;
/** React Flow 가 보낸 select 변경(하네스는 선택을 props 로만 준다 — Ctrl/⌘+A 결과는 여기서 본다). */
let picks: { id: string; selected: boolean }[] = [];

function Harness({ ctx, selected }: { ctx: ErdEditContext; selected: readonly string[] }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  rfNow = rf;
  const e = useCanvasEditing(ctx, rf);
  editing = e;
  const flow = useMemo(() => buildFlow({
    state: ctx.state, diagramId: ctx.diagramId, mode: "logical", preset: "basic", namesOnly: false, showAudit: ctx.audit.show,
    statuses: {}, domains: {}, selected: new Set(selected), mySession: ctx.session,
  }), [ctx.state, ctx.diagramId, ctx.session, ctx.audit.show, selected]);
  raw = flow.nodes;
  const onNodesChange = (changes: NodeChange<ErdFlowNode>[]) => {
    for (const c of changes) if (c.type === "select") picks.push({ id: c.id, selected: c.selected });
    e.onNodesChange(changes);
  };
  return h("div", { tabIndex: 0, "data-testid": "erd-host", onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    e.toolbar,
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES, onNodesChange, ...e.flowProps,
      fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay);
}

async function mount(ctx: FakeCtx, selected: readonly string[] = []) {
  picks = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null, h(Harness, { ctx, selected }))));
  });
  await flush();
}
async function press(init: KeyboardEventInit) {
  const el = host.querySelector<HTMLElement>('[data-testid="erd-host"]')!;
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
  await flush();
}
async function click(sel: string) {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`없는 요소: ${sel}`);
  await act(async () => {
    el.click();
  });
  await flush();
}
const btn = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
const MOD = (): KeyboardEventInit => (isMacPlatform() ? { metaKey: true } : { ctrlKey: true });
/** bigState(3) = d-all 에 t-0·t-1·t-2 가 (0,0)(280,0)(560,0). */
const three = (over: Partial<ErdEditContext> = {}) => fakeCtx({ state: bigState(3, 2), ...over });
async function nodeMenu(index: number) {
  await act(async () => {
    editing.flowProps.onNodeContextMenu!(new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }) as unknown as React.MouseEvent, raw[index]);
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("정렬(U58-U60)", () => {
  it("[정렬 ▾] 왼쪽 맞춤 — moveNodes 한 건, 안 바뀐 표는 뺌, 라벨에 표 수", async () => {
    const s = bigState(3, 2);
    s.nodes["d-all:t-1"] = { ...s.nodes["d-all:t-1"], y: 40 };
    const ctx = fakeCtx({ state: s });
    await mount(ctx, ["t-0", "t-1", "t-2"]);
    await click('[data-testid="erd-tool-align"]');
    await click('[data-testid="erd-alignmenu-item-align-left"]');
    expect(ctx.applied).toEqual([{
      commands: [{ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-1", x: 0, y: 40 }, { table: "t-2", x: 0, y: 0 }] }],
      label: "왼쪽 맞춤(표 3개)",
    }]);
  });

  it("alignUsesNodeHeights — 중간 맞춤은 표마다 높이(잰 값이 없으면 initialHeight)를 쓴다", async () => {
    // menuModel: t-1 컬럼 3개, t-2 컬럼 1개 → 높이가 다르다. (0,0)·(400,0)
    const ctx = fakeCtx();
    await mount(ctx, ["t-1", "t-2"]);
    const h1 = raw.find((n) => n.id === "t-1")!.initialHeight!;
    const h2 = raw.find((n) => n.id === "t-2")!.initialHeight!;
    expect(h1).toBeGreaterThan(h2);
    await click('[data-testid="erd-tool-align"]');
    await click('[data-testid="erd-alignmenu-item-align-vcenter"]');
    expect(ctx.applied[0].commands).toEqual([{ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-2", x: 400, y: Math.round((h1 - h2) / 2) }] }]);
  });

  it("모두 그대로면 보내지 않고 알림, 간격은 3개 미만이면 메뉴 항목이 꺼짐", async () => {
    const ctx = fakeCtx();
    await mount(ctx, ["t-1", "t-2"]); // 둘 다 y 0
    await click('[data-testid="erd-tool-align"]');
    expect(btn("erd-alignmenu-item-dist-x").disabled).toBe(true);
    expect(btn("erd-alignmenu-item-dist-x").getAttribute("title")).toBe("표를 3개 이상 고르세요");
    await click('[data-testid="erd-alignmenu-item-align-top"]');
    expect(ctx.applied).toEqual([]);
    expect(ctx.notify).toHaveBeenCalledWith("이미 맞춰져 있습니다.", "info");
  });

  it("[정렬 ▾] 은 고른 표 2개 미만이면 꺼지고 이유", async () => {
    await mount(three(), ["t-0"]);
    expect(btn("erd-tool-align").disabled).toBe(true);
    expect(btn("erd-tool-align").parentElement?.getAttribute("title")).toBe("정렬 — 표를 2개 이상 고르세요");
  });

  it("표 메뉴(여러 개) — 정렬 묶음의 가로 간격 같게", async () => {
    const s = bigState(3, 2);
    s.nodes["d-all:t-2"] = { ...s.nodes["d-all:t-2"], x: 900 };
    const ctx = fakeCtx({ state: s });
    await mount(ctx, ["t-0", "t-1", "t-2"]);
    await nodeMenu(0);
    expect(document.querySelector('[data-testid="erd-menu-item-align"]')?.textContent).toContain("정렬");
    await click('[data-testid="erd-menu-item-dist-x"]');
    const cmd = ctx.applied[0].commands[0] as { op: string; nodes: { table: string; x: number }[] };
    expect(cmd.op).toBe("moveNodes");
    expect(cmd.nodes).toEqual([{ table: "t-1", x: 450, y: 0 }]); // 0 · 450 · 900 (폭이 같아 가운데)
    expect(ctx.applied[0].label).toBe("가로 간격 같게(표 3개)");
  });

  it("다이어그램 편집 권한이 없으면 [정렬 ▾] 꺼짐, tip 에 짧은 이유", async () => {
    await mount(three({ rights: { ...three().rights, diagram: deny(RELEASED_TEXT) } }), ["t-0", "t-1"]);
    expect(btn("erd-tool-align").disabled).toBe(true);
    expect(btn("erd-tool-align").parentElement?.getAttribute("title")).toBe("정렬 — 확정된 버전");
  });
});

describe("Ctrl/⌘+A·툴팁(U67·U68)", () => {
  it("Ctrl/⌘+A 는 이 다이어그램 표를 모두 고른다", async () => {
    await mount(three());
    await press({ key: "a", ...MOD() });
    expect(picks.filter((p) => p.selected).map((p) => p.id).sort()).toEqual(["t-0", "t-1", "t-2"]);
  });

  it("한글 자판(e.key \"ㅁ\")에서도 Ctrl/⌘+A 는 물리 키 KeyA 로 받는다", async () => {
    await mount(three());
    await press({ key: "ㅁ", code: "KeyA", ...MOD() });
    expect(picks.filter((p) => p.selected).map((p) => p.id).sort()).toEqual(["t-0", "t-1", "t-2"]);
  });

  it("여러 개면 접기·빼기·삭제 툴팁 끝에 (표 n개), 고른 표가 없으면 '— 표를 먼저 고르세요'(disabledNoReason 판정)", async () => {
    await mount(three(), ["t-0", "t-1"]);
    expect(btn("erd-fold-KEYS").parentElement?.getAttribute("data-tip")).toBe("키 컬럼만 (표 2개)");
    expect(btn("erd-tool-remove").parentElement?.getAttribute("data-tip")).toBe("다이어그램에서 빼기 (Delete) (표 2개)");
    act(() => root?.unmount());
    await mount(three());
    for (const id of ["erd-fold-NONE", "erd-fold-KEYS", "erd-fold-NAME", "erd-tool-remove", "erd-tool-delete"]) {
      expect(btn(id).disabled).toBe(true);
      expect(btn(id).parentElement?.getAttribute("data-tip")).toMatch(/ — 표를 먼저 고르세요$/);
    }
  });
});

describe("이미 되는 일괄 동작(U56)", () => {
  it("[키만] 접기는 고른 표 모두에 setFold 한 건, 이미 KEYS 인 표는 뺀다", async () => {
    const s: ErdState = bigState(3, 2);
    s.nodes["d-all:t-1"] = { ...s.nodes["d-all:t-1"], foldMode: "KEYS" };
    const ctx = fakeCtx({ state: s });
    await mount(ctx, ["t-0", "t-1", "t-2"]);
    await click('[data-testid="erd-fold-KEYS"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "setFold", diagram: "d-all", tables: ["t-0", "t-2"], foldMode: "KEYS" }], label: "키만 보이기" }]);
  });

  it("관계로 이은 표 2개를 모델에서 삭제 = deleteTable 2건 한 묶음", async () => {
    const ctx = fakeCtx(); // menuModel: t-1 → t-2 관계 r-1
    await mount(ctx, ["t-1", "t-2"]);
    await press({ key: "Backspace", code: "Backspace", altKey: true });
    await click('[data-testid="erd-delete-ok"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "deleteTable", id: "t-1" }, { op: "deleteTable", id: "t-2" }], label: "표 2개 삭제" }]);
  });

  it("Delete 는 고른 표 모두를 removeFromDiagram 한 건으로 뺀다", async () => {
    const ctx = three();
    await mount(ctx, ["t-0", "t-2"]);
    await press({ key: "Delete", code: "Delete" });
    expect(ctx.applied).toEqual([{ commands: [{ op: "removeFromDiagram", diagram: "d-all", tables: ["t-0", "t-2"] }], label: "다이어그램에서 빼기" }]);
  });
});
```
`fakeEditContext`(`erd-fixtures.ts`)의 `notify`·`nav.*` 는 `vi.fn` 이다. 노드 높이는 `buildFlow` 의 `initialHeight`(happy-dom 은 노드를 재지 않는다). `rfNow` 는 지금 쓰지 않으면 지운다(lint 는 tests 를 안 보지만 남기지 않는다).

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-canvas-multi.test.ts`
Expected: 정렬·Ctrl/⌘+A·툴팁 개수 시험 FAIL(`erd-tool-align` 없음). U56 의 3개와 "표를 먼저 고르세요" 판정은 지금도 PASS 일 수 있다 — 그대로 둔다(고정 시험).

- [ ] **Step 3: `erd-shortcuts.ts` — `selectAll`**

```ts
export type ErdCanvasKey =
  | CanvasShortcutId
  | "toolSelect" | "toolTable" | "toolRelation" | "toolIdentifying"
  | "deleteModel" | "parentTable" | "childTable" | "selectAll";
```
`ERD_CANVAS_SHORTCUTS` 의 `childTable` 두 줄 뒤, `...CANVAS_SHORTCUTS` 앞에 두 줄:
```ts
  { id: "selectAll", key: "a", mod: true },
  { id: "selectAll", code: "KeyA", mod: true }, // 한글 자판이면 e.key 가 "ㅁ" — 물리 키로도 받는다(ErdViewer T·K·O·Z 와 같은 규칙)
```
shared `shortcutOf` 는 `code` + `mod` 묶음을 받는다(`b.code !== undefined ? b.code === e.code : b.key === key`). 머리 주석에 "Ctrl/⌘+A = 이 다이어그램 표 모두 고르기(UX 1.5 U67)" 한 줄.

- [ ] **Step 4: `useCanvasEditing.ts` — `measuredSizes`·`arrange`·`selectAll`·표 메뉴**

4-1. import 더함: `import { ALIGN_MIN, ALIGN_MODES, DISTRIBUTE_MIN, DISTRIBUTE_LABEL, ALIGN_LABEL, alignBoxes, arrangeLabel, distributeBoxes, type ArrangeKind, type NodeBox } from "./erd-multi";` 와 `import type { Size } from "./erd-layout";`.

4-2. `layout()` 안의 `namesOnly`·`measured` 계산을 위로 뺀다:
```ts
  /** 잰 크기(자동 배치·정렬 공용, U59). 이름만 배율이면 잰 높이에 컬럼 행이 빠져 있어 initialHeight 를 쓴다. 화면 밖 노드도 initial 값. */
  const measuredSizes = useCallback((): Map<string, Size> => {
    const namesOnly = storeApi.getState().transform[2] < ZOOM_NAMES_ONLY;
    return new Map(rf.getNodes().map((n) => {
      const m = namesOnly ? undefined : rf.getInternalNode(n.id)?.measured;
      return [n.id, {
        width: m?.width || (n.initialWidth ?? NODE_WIDTH),
        height: m?.height || (n.initialHeight ?? nodeHeight(0, false)),
      }] as const;
    }));
  }, [rf, storeApi]);
```
`layout()` 은 `const measured = measuredSizes();` 로 바꾸고 deps 에 `measuredSizes` 를 더한다(동작 같음 — 기존 `[자동 배치]` 시험이 지킨다).

4-3. `arrange`(`fold` 뒤):
```ts
  /** 정렬·간격(U58). 자리는 보이는 자리(rf 노드, 끄는 중 덮개 포함), 크기는 누를 때 잰다. 한 apply = 되돌리기 한 번. */
  const arrange = useCallback((kind: ArrangeKind, tables?: readonly string[]) => {
    const c = ctxRef.current;
    const ids = tables ?? selectedIds();
    const need = "align" in kind ? ALIGN_MIN : DISTRIBUTE_MIN;
    if (!c.diagramId) return;
    if (!c.rights.diagram.ok) {
      deny(c.rights.diagram);
      return;
    }
    if (ids.length < need) {
      c.notify(`표를 ${need}개 이상 고르세요.`, "info");
      return;
    }
    const sizes = measuredSizes();
    const boxes: NodeBox[] = [];
    for (const id of ids) {
      const n = rf.getNode(id);
      const s = sizes.get(id);
      if (n && s) boxes.push({ table: id, x: n.position.x, y: n.position.y, width: s.width, height: s.height });
    }
    const placed = "align" in kind ? alignBoxes(boxes, kind.align) : distributeBoxes(boxes, kind.distribute);
    const cmd = moveNodesCommand(c.diagramId, placed, c.state.nodes);
    if (!cmd) {
      c.notify("이미 맞춰져 있습니다.", "info");
      return;
    }
    void c.apply([cmd], `${arrangeLabel(kind)}(표 ${ids.length}개)`);
  }, [selectedIds, deny, measuredSizes, rf]);
```

4-4. 키 손잡이(`handlers`)에 더함:
```ts
      selectAll: () => {
        const ids = rf.getNodes().map((n) => n.id);
        if (ids.length === 0) return UNHANDLED;
        storeApi.getState().addSelectedNodes(ids); // select 변경 → CanvasPane → ErdViewer 선택
        return undefined;
      },
```
`onKeyDown` deps 에 `storeApi` 를 더한다.

4-5. 표 메뉴(`onNodeContextMenu`) — `fold` 항목 바로 뒤, `targets.length >= ALIGN_MIN` 일 때만:
```ts
    if (targets.length >= ALIGN_MIN) {
      const fewForDist = targets.length < DISTRIBUTE_MIN ? { disabled: true, title: `표를 ${DISTRIBUTE_MIN}개 이상 고르세요` } : {};
      items.push({
        id: "align", label: "정렬", children: [
          ...ALIGN_MODES.map((m) => ({ id: `align-${m}`, label: ALIGN_LABEL[m], run: () => arrange({ align: m }, targets), ...off(r.diagram) })),
          ...(["x", "y"] as const).map((a) => ({
            id: `dist-${a}`, label: DISTRIBUTE_LABEL[a], run: () => arrange({ distribute: a }, targets), ...off(r.diagram), ...(r.diagram.ok ? fewForDist : {}),
          })),
        ],
      });
    }
```
지금 `items.push(fold, remove, delete)` 한 번 호출을 `fold` / (정렬) / `remove`·`delete` 순으로 나눠 넣는다. deps 에 `arrange`.

4-6. 도구 막대 `h(ErdToolbar, { … })` 에 `onArrange: arrange` 를 넣는다(`arrange` 는 tables 를 안 넘기면 고른 표). deps 에 `arrange`.

- [ ] **Step 5: `ErdToolbar.tsx` — [정렬 ▾]·툴팁 개수**

5-1. props 에 `onArrange(kind: ArrangeKind): void;`. import `ALIGN_LABEL, ALIGN_MIN, ALIGN_MODES, DISTRIBUTE_LABEL, DISTRIBUTE_MIN, type ArrangeKind` from `./erd-multi`.

5-2. 함수 안([관계 ▾] 메뉴 옆):
```tsx
  // [정렬 ▾] 메뉴(U60) — [관계 ▾] 와 같은 방식.
  const [alignAt, setAlignAt] = useState<{ x: number; y: number } | null>(null);
  const openAlignMenu = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAlignAt({ x: r.left, y: r.bottom + 2 });
  }, []);
  const closeAlignMenu = useCallback(() => setAlignAt(null), []);
  const alignItems = useMemo<MenuItem[]>(() => [
    ...ALIGN_MODES.map((m) => ({ id: `align-${m}`, label: ALIGN_LABEL[m], run: () => onArrange({ align: m }) })),
    ...(["x", "y"] as const).map((a) => ({
      id: `dist-${a}`, label: DISTRIBUTE_LABEL[a], run: () => onArrange({ distribute: a }),
      ...(selection < DISTRIBUTE_MIN ? { disabled: true, title: `표를 ${DISTRIBUTE_MIN}개 이상 고르세요` } : {}),
    })),
  ], [onArrange, selection]);
  const alignTip = !diagram.ok ? `정렬 — ${reasonOf(diagram)}`
    : selection < ALIGN_MIN ? `정렬 — 표를 ${ALIGN_MIN}개 이상 고르세요` : `정렬 (표 ${selection}개)`;
  /** 여러 개를 고르면 툴팁 끝에 표 수(U68). 꺼진 단추에는 붙이지 않는다. */
  const many = (tip: string, on: boolean): string => (on && selection > 1 ? `${tip} (표 ${selection}개)` : tip);
```
5-3. JSX — [PK 추가] 와 `<ContextMenu … erd-relmenu />` 뒤에:
```tsx
      <TextToolButton className="erd-toolbar__txt" label="정렬 ▾" tip={alignTip} disabled={!diagram.ok || selection < ALIGN_MIN}
        testId="erd-tool-align" onClick={openAlignMenu} menu open={alignAt !== null} />
      <ContextMenu items={alignItems} at={alignAt} onClose={closeAlignMenu} testId="erd-alignmenu" />
```
5-4. 접기 `tip={many(tipOf(f.label, diagram, none), diagram.ok && !none)}`, 빼기 `tip={many(tipOf("다이어그램에서 빼기 (Delete)", diagram, none), diagram.ok && !none)}`, 삭제 `tip={many(tipOf(…, model, none), model.ok && !none)}`.
5-5. 머리 주석에 "[정렬 ▾](U60), 여러 개면 툴팁 끝에 표 수(U68)" 한 줄.

- [ ] **Step 6: 실행 → 통과**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-canvas-multi.test.ts tests/dma/erdEdit/erd-canvas-editing.test.ts`
Expected: PASS. `erd-canvas-editing.test.ts` 의 툴팁 문자열 비교(`data-tip` 고른 표 1개)는 개수가 안 붙어 그대로 통과해야 한다. 깨지면 기대값을 고치지 말고 `many` 조건(`selection > 1`)부터 본다.

- [ ] **Step 7: lint·audit**

`lint` = 0. 바꾼 파일 3개 audit 두 개 = 0건.

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit/canvas/{useCanvasEditing.ts,ErdToolbar.tsx,erd-shortcuts.ts} src/frontend/m-mdm/tests/dma/erdEdit/erd-canvas-multi.test.ts
/usr/bin/git commit -m "feat(erd): 여러 표 정렬·간격([정렬 ▾]·표 메뉴)·Ctrl/⌘+A·툴팁 표 수

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 창 2개 — 다른 다이어그램에 넣기, 같은 컬럼 여러 표에

**Files:**
- Create: `S/canvas/MultiDialogs.tsx`(`PlaceIntoDialog`·`BulkColumnModal`)
- Modify: `S/canvas/CanvasDialogs.tsx`(`usablePhys` 앞에 `export` 만)
- Modify: `S/canvas/useCanvasEditing.ts`(창 상태·열기·보내기·overlay·표 메뉴 `place`·`bulkcol`·`addColumn` 여러 개)
- Modify: `S/canvas/ErdToolbar.tsx`([다른 다이어그램에 넣기]·[컬럼 추가] 여러 개)
- Modify: `S/canvas/erd-edit-styles.ts`(필요하면 `.erd-dialog__list` 높이 상한 — 기존 규칙이 있으면 안 바꿈)
- Test: `T/multi-dialogs.test.ts`(새), `T/erd-canvas-multi.test.ts`(더함), `T/erd-canvas-editing.test.ts`(기대 1곳)

**Interfaces:**
- Consumes: Task 1 `placeIntoCommand`·`alreadyIn`·`bulkColumnPlan`·`bulkColumnCommands`·`columnPhysError`·`BulkColumnInput`. `previewName`(`S/api.ts`), `usablePhys`(`S/canvas/CanvasDialogs.tsx`), `newElementId`·`MAX_BATCH`(`S/canvas/erd-commands.ts`).
- Produces: README `MultiDialogs.tsx` 인터페이스, `ErdToolbarProps.onPlaceInto`·`otherDiagrams`.

- [ ] **Step 1: 실패하는 시험 — 창 부품**

`T/multi-dialogs.test.ts`(창만, `new-table-modal.test.ts` 와 같은 틀):
```ts
/** @vitest-environment happy-dom */
// 여러 표 창(UX 1.5) — 다른 다이어그램에 넣기(U61), 같은 컬럼 여러 표에(U63).
import { act, createElement as h } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { previewName } from "../../../pages/dma/erdEdit/api";
import { BulkColumnModal, PlaceIntoDialog } from "../../../pages/dma/erdEdit/canvas/MultiDialogs";
import { typeInto } from "../../dme/helpers/render";
import { menuModel } from "./erd-fixtures";
import { inDoc, installStorage, mount, previewOf, wait, type Mounted } from "./grid-fixtures";

vi.mock("../../../pages/dma/erdEdit/api", () => ({ previewName: vi.fn() }));
const preview = vi.mocked(previewName);

let view: Mounted | null = null;
beforeEach(() => {
  installStorage();
  preview.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  view?.unmount();
  view = null;
});
const tick = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});
const okBtn = (id: string) => inDoc<HTMLButtonElement>(id)!;
async function choose(sel: HTMLSelectElement, value: string) {
  await act(async () => {
    sel.value = value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("다른 다이어그램에 넣기 창(U61)", () => {
  const targets = [{ id: "d-a", label: "기본 / 가", already: 0 }, { id: "d-b", label: "기본 / 나", already: 3 }];

  it("첫 대상을 고른 채 열리고, [넣기] 는 고른 대상 id 로 onSubmit", async () => {
    const onSubmit = vi.fn(async () => null);
    view = await mount(h(PlaceIntoDialog, { open: true, count: 3, targets, onSubmit, onClose: vi.fn() }));
    expect(inDoc<HTMLSelectElement>("erd-place-target")!.value).toBe("d-a");
    expect(inDoc("erd-place-info")?.textContent).toBe("표 3개를 넣습니다.");
    await act(async () => okBtn("erd-place-ok").click());
    expect(onSubmit).toHaveBeenCalledWith("d-a");
  });

  it("placeDialogDisablesWhenAllPresent — 고른 표가 모두 대상에 있으면 [넣기] 꺼짐", async () => {
    view = await mount(h(PlaceIntoDialog, { open: true, count: 3, targets, onSubmit: vi.fn(), onClose: vi.fn() }));
    await choose(inDoc<HTMLSelectElement>("erd-place-target")!, "d-b");
    expect(inDoc("erd-place-info")?.textContent).toBe("고른 표가 모두 그 다이어그램에 이미 있습니다.");
    expect(okBtn("erd-place-ok").disabled).toBe(true);
  });

  it("거절 문구는 창 안에 보이고 창은 남는다", async () => {
    view = await mount(h(PlaceIntoDialog, { open: true, count: 1, targets, onSubmit: vi.fn(async () => "거절됨"), onClose: vi.fn() }));
    await act(async () => okBtn("erd-place-ok").click());
    expect(inDoc("erd-place-error")?.textContent).toBe("거절됨");
  });
});

describe("같은 컬럼 여러 표에 창(U63)", () => {
  async function open(tables: string[], onSubmit = vi.fn(async () => null)) {
    view = await mount(h(BulkColumnModal, { open: true, model: menuModel(), tables, onSubmit, onClose: vi.fn() }));
    await wait(100); // Mantine 초점 가두개 타이머를 먼저 끝낸다
    vi.useFakeTimers();
    return onSubmit;
  }

  it("논리명 → 300ms 뒤 물리명 미리보기, 추천 도메인과 함께 보낸다", async () => {
    preview.mockResolvedValue(previewOf("USE_YN", { recommendedDomainId: 7 }));
    const onSubmit = await open(["t-1", "t-2"]);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "사용여부");
    await tick(300);
    expect(preview).toHaveBeenCalledWith({ logical: "사용여부" });
    expect(inDoc<HTMLInputElement>("erd-bulkcol-phys")!.value).toBe("USE_YN");
    expect(inDoc("erd-bulkcol-targets")?.textContent).toContain("넣을 표 2개");
    await act(async () => okBtn("erd-bulkcol-ok").click());
    expect(onSubmit).toHaveBeenCalledWith({ logical: "사용여부", phys: "USE_YN", domainId: 7 });
  });

  it("같은 물리명이 모두 있으면 [추가] 꺼짐, 하나만 있으면 건너뜀 1", async () => {
    preview.mockResolvedValue(previewOf("OBJECT_ID"));
    await open(["t-1", "t-2"]);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "오브젝트아이디");
    await tick(300);
    expect(inDoc("erd-bulkcol-skip")?.textContent).toContain("건너뜀 2개");
    expect(okBtn("erd-bulkcol-ok").disabled).toBe(true);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-phys")!, "MENU_NM");
    expect(inDoc("erd-bulkcol-skip")?.textContent).toContain("건너뜀 1개");
    expect(okBtn("erd-bulkcol-ok").disabled).toBe(false);
  });

  it("물리명을 직접 고치면 보낼 때 previewName({phys}) 로 추천 도메인을 읽는다", async () => {
    preview.mockResolvedValueOnce(previewOf("USE_YN", { recommendedDomainId: 7 }));
    const onSubmit = await open(["t-1", "t-2"]);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "사용여부");
    await tick(300);
    preview.mockResolvedValueOnce(previewOf("DEL_YN", { recommendedDomainId: 9 }));
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-phys")!, "del_yn");
    expect(inDoc<HTMLInputElement>("erd-bulkcol-phys")!.value).toBe("DEL_YN");
    await act(async () => okBtn("erd-bulkcol-ok").click());
    expect(preview).toHaveBeenLastCalledWith({ phys: "DEL_YN" });
    expect(onSubmit).toHaveBeenCalledWith({ logical: "사용여부", phys: "DEL_YN", domainId: 9 });
  });

  it("감사 컬럼 물리명은 막는다", async () => {
    preview.mockResolvedValue(previewOf("C_AT"));
    await open(["t-1", "t-2"]);
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "생성일시");
    await tick(300);
    expect(document.body.textContent).toContain("감사 컬럼은 표마다 저절로 붙습니다.");
    expect(okBtn("erd-bulkcol-ok").disabled).toBe(true);
  });

  it("bulkColumnRejectKeepsDialog — 거절 문구는 창 안에", async () => {
    preview.mockResolvedValue(previewOf("USE_YN"));
    await open(["t-1"], vi.fn(async () => "표 TB_MCM_SEC_MENU 에 같은 물리명의 컬럼이 있습니다: USE_YN"));
    await typeInto(inDoc<HTMLInputElement>("erd-bulkcol-logical")!, "사용여부");
    await tick(300);
    await act(async () => okBtn("erd-bulkcol-ok").click());
    expect(inDoc("erd-bulkcol-error")?.textContent).toContain("같은 물리명의 컬럼");
  });
});
```
`previewOf(phys, over)` 의 칸(`recommendedDomainId` 등)은 `grid-fixtures.ts` 를 보고 맞춘다. `typeInto` 는 칸 값을 갈아 끼운다(`dme/helpers/render`). 가짜 시계에서 `typeInto` 가 멈추면 `new-table-modal.test.ts` 의 입력 방식을 그대로 쓴다.

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/multi-dialogs.test.ts`
Expected: FAIL — `MultiDialogs` 없음.

- [ ] **Step 3: `CanvasDialogs.tsx` export, `MultiDialogs.tsx`**

3-1. `CanvasDialogs.tsx`: `function usablePhys(` → `export function usablePhys(`. 다른 변경 없음.

3-2. `S/canvas/MultiDialogs.tsx`:
```tsx
"use client";

/**
 * 여러 표 창(UX 1.5) — 다른 다이어그램에 넣기(U61), 같은 컬럼 여러 표에(U63). shared Modal·form 을 쓴다.
 * 입력 상태는 창 안에 둔다(글자를 칠 때 캔버스·화면 루트를 다시 그리지 않는다, NewTableModal 과 같다).
 * 미리보기는 300ms 멈춘 뒤 한 번, 요청 순번으로 늦은 응답을 버린다(Local-Rules §37).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button, Input, Select } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { previewName } from "../api";
import type { ErdModelJson } from "../types";
import { usablePhys } from "./CanvasDialogs";
import { bulkColumnPlan, columnPhysError, type BulkColumnInput } from "./erd-multi";

const PREVIEW_DEBOUNCE_MS = 300;
/** 목록에 이름을 적는 표 수. 나머지는 "외 n개". */
const SHOWN = 10;
const NOTE: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const WARN: CSSProperties = { ...NOTE, color: "var(--color-warning)" };

export const PLACE_ALL_PRESENT_TEXT = "고른 표가 모두 그 다이어그램에 이미 있습니다.";
export const BULKCOL_UNKNOWN_TEXT = "사전에 없는 단어가 있어 물리명을 직접 넣으세요.";
export const BULKCOL_FAILED_TEXT = "물리명 미리보기를 불러오지 못했습니다. 물리명을 직접 넣으세요.";

const names = (list: readonly string[], model: ErdModelJson): string => {
  const shown = list.slice(0, SHOWN).map((id) => model.tables[id]?.phys ?? id).join(", ");
  return list.length > SHOWN ? `${shown} 외 ${list.length - SHOWN}개` : shown;
};

export interface PlaceTarget { id: string; label: string; already: number }
export interface PlaceIntoDialogProps {
  open: boolean;
  count: number;
  targets: readonly PlaceTarget[];
  onSubmit(to: string): Promise<string | null>;
  onClose(): void;
}

export function PlaceIntoDialog({ open, count, targets, onSubmit, onClose }: PlaceIntoDialogProps) {
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef("");
  firstRef.current = targets[0]?.id ?? "";
  useEffect(() => {
    if (!open) return;
    setTo(firstRef.current);
    setError(null);
    setBusy(false);
  }, [open]);
  const target = targets.find((t) => t.id === to) ?? null;
  const adds = target ? count - target.already : 0;
  const blocked = !target || adds <= 0 || busy;
  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      setError(await onSubmit(to));
    } finally {
      setBusy(false);
    }
  };
  const info = !target ? "다이어그램을 고르세요."
    : adds <= 0 ? PLACE_ALL_PRESENT_TEXT
    : `표 ${adds}개를 넣습니다.${target.already > 0 ? ` 이미 있는 ${target.already}개는 그대로 둡니다.` : ""}`;
  return (
    <Modal open={open} title="다른 다이어그램에 넣기" size="sm" onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-place-cancel" onClick={onClose}>취소</Button>
          <Button variant="primary" data-testid="erd-place-ok" disabled={blocked} onClick={() => void submit()}>넣기</Button>
        </div>
      }>
      <div data-testid="erd-place-dialog">
        <div className="erd-dialog__row">
          <label htmlFor="erd-place-target">넣을 다이어그램</label>
          <Select id="erd-place-target" data-testid="erd-place-target" value={to}
            options={targets.map((t) => ({ value: t.id, label: t.label }))}
            onChange={(v) => {
              setTo(v);
              setError(null);
            }} />
        </div>
        <p role="status" data-testid="erd-place-info" style={adds <= 0 && target ? WARN : NOTE}>{info}</p>
        <p className="erd-dialog__note">자리는 그 다이어그램 표들의 오른쪽입니다. 지금 다이어그램에서는 빠지지 않습니다.</p>
        {error && <div className="erd-dialog__error" role="alert" data-testid="erd-place-error">{error}</div>}
      </div>
    </Modal>
  );
}

interface ColumnPreview { forText: string; value: string | null; domainId: number | null; failed: boolean }

export interface BulkColumnModalProps {
  open: boolean;
  model: ErdModelJson;
  tables: readonly string[];
  onSubmit(col: BulkColumnInput): Promise<string | null>;
  onClose(): void;
}

export function BulkColumnModal({ open, model, tables, onSubmit, onClose }: BulkColumnModalProps) {
  const [logical, setLogical] = useState("");
  const [phys, setPhys] = useState("");
  const [preview, setPreview] = useState<ColumnPreview | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 사용자가 물리명 칸을 고쳤는가 — 늦은 응답이 그 사이 입력을 덮지 않게 ref 로 읽는다. */
  const physTouched = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setLogical("");
    setPhys("");
    setPreview(null);
    setServerError(null);
    setBusy(false);
    physTouched.current = false;
  }, [open]);

  const want = open ? logical.trim() : "";
  useEffect(() => {
    const mine = ++seq.current;
    if (want === "") {
      setPreview(null);
      if (!physTouched.current) setPhys("");
      return;
    }
    const timer = setTimeout(() => {
      previewName({ logical: want })
        .then((p) => {
          if (seq.current !== mine) return;
          const value = usablePhys(p)?.toUpperCase() ?? null;
          setPreview({ forText: want, value, domainId: p.recommendedDomainId, failed: false });
          if (!physTouched.current) setPhys(value ?? "");
        })
        .catch(() => {
          if (seq.current !== mine) return;
          setPreview({ forText: want, value: null, domainId: null, failed: true });
          if (!physTouched.current) setPhys("");
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [want]);
  useEffect(() => () => {
    seq.current += 1;
  }, []);

  const shown = preview !== null && preview.forText === want ? preview : null;
  const plan = useMemo(() => (open && phys ? bulkColumnPlan(model, tables, phys) : null), [open, model, tables, phys]);
  const localError = phys ? columnPhysError(phys) : null;
  // 물리명을 고치지 않은 채 논리명이 바뀌어 새 미리보기를 기다리는 동안은 앞 글의 물리명으로 보내지 않는다.
  const waitingPreview = !physTouched.current && want !== "" && shown === null;
  const blocked = want === "" || !phys || localError !== null || busy || waitingPreview || !plan || plan.targets.length === 0;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      let domainId: number | null = null;
      if (shown && shown.value === phys) domainId = shown.domainId;
      else {
        try {
          domainId = (await previewName({ phys })).recommendedDomainId;
        } catch {
          domainId = null; // 추천 도메인을 못 읽으면 도메인 없이 보낸다(나중에 도메인 칸에서 고른다)
        }
      }
      setServerError(await onSubmit({ logical: want, phys, domainId }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={`같은 컬럼 추가 — 표 ${tables.length}개`} size="sm" onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-bulkcol-cancel" onClick={onClose}>취소</Button>
          <Button variant="primary" data-testid="erd-bulkcol-ok" disabled={blocked} onClick={() => void submit()}>추가</Button>
        </div>
      }>
      <div data-testid="erd-bulkcol-dialog">
        <div className="erd-dialog__row">
          <label htmlFor="erd-bulkcol-logical">논리명</label>
          <Input id="erd-bulkcol-logical" data-testid="erd-bulkcol-logical" value={logical} autoFocus data-autofocus
            onChange={(v) => {
              setLogical(v);
              setServerError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
            }} />
        </div>
        <div className="erd-dialog__row">
          <label htmlFor="erd-bulkcol-phys">물리명</label>
          <Input id="erd-bulkcol-phys" data-testid="erd-bulkcol-phys" value={phys}
            onChange={(v) => {
              physTouched.current = true;
              setPhys(v.toUpperCase());
              setServerError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
            }}
            error={localError ?? undefined} />
        </div>
        {shown && (
          <div role="status" data-testid="erd-bulkcol-preview" style={shown.value === null ? WARN : NOTE}>
            {shown.value !== null ? `물리명 미리보기 ${shown.value} — 사전 기준, 고칠 수 있습니다`
              : shown.failed ? BULKCOL_FAILED_TEXT : BULKCOL_UNKNOWN_TEXT}
          </div>
        )}
        {plan && (
          <>
            <p data-testid="erd-bulkcol-targets" style={NOTE}>넣을 표 {plan.targets.length}개{plan.targets.length > 0 ? `: ${names(plan.targets, model)}` : ""}</p>
            {plan.skipped.length > 0 && (
              <p data-testid="erd-bulkcol-skip" style={WARN}>같은 물리명이 있어 건너뜀 {plan.skipped.length}개: {names(plan.skipped, model)}</p>
            )}
          </>
        )}
        <p className="erd-dialog__note">컬럼은 각 표의 끝(감사 컬럼 앞)에 들어갑니다. PK 컬럼은 표를 하나씩 골라 [PK 추가] 로 넣으세요.</p>
        {serverError && <div className="erd-dialog__error" role="alert" data-testid="erd-bulkcol-error">{serverError}</div>}
      </div>
    </Modal>
  );
}
```
shared `Select` 가 `data-testid` 를 `<select>` 에 넘기는지 확인한다(`...rest` → `NativeSelect`). 안 넘기면 감싼 `<div data-testid="erd-place-target-wrap">` 를 두지 말고 `id` 로 찾는다(시험의 `inDoc("erd-place-target")` 를 `document.getElementById("erd-place-target")` 로 바꿈).

- [ ] **Step 4: 실행 → 통과, 커밋**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/multi-dialogs.test.ts tests/dma/erdEdit/new-table-modal.test.ts`
Expected: PASS. audit 두 개 = 0건(`MultiDialogs.tsx`·`CanvasDialogs.tsx`).
```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit/canvas/{MultiDialogs.tsx,CanvasDialogs.tsx} src/frontend/m-mdm/tests/dma/erdEdit/multi-dialogs.test.ts
/usr/bin/git commit -m "feat(erd): 다른 다이어그램에 넣기·같은 컬럼 여러 표에 창

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: 실패하는 시험 — 연결**

`T/erd-canvas-multi.test.ts` 에 더함(머리 import 에 `previewName`·`previewOf`·`typeInto`·`MAX_BATCH`·`stateOf`·`menuModel`·`MENU_DIAGRAMS` 추가, `const preview = vi.mocked(previewName);`):
```ts
/** menuModel 두 표 + 다이어그램 d-sub(t-2 만, (50,60)). */
function withSub(): ErdState {
  return stateOf(menuModel(), {
    diagrams: [...MENU_DIAGRAMS.diagrams, { id: "d-sub", areaName: "기본", diagramName: "오브젝트", sortSeq: 1 }],
    nodes: [...MENU_DIAGRAMS.nodes, { diagram: "d-sub", table: "t-2", x: 50, y: 60, foldMode: "NONE" }],
  });
}

describe("다른 다이어그램에 넣기 연결(U61)", () => {
  it("[다른 다이어그램에 넣기] → 창 → 대상에 없는 표만 placeTables 한 건, 알림", async () => {
    const ctx = fakeCtx({ state: withSub() });
    await mount(ctx, ["t-1", "t-2"]);
    await click('[data-testid="erd-tool-place"]');
    expect(document.querySelector("[data-testid=erd-place-info]")?.textContent).toBe("표 1개를 넣습니다. 이미 있는 1개는 그대로 둡니다.");
    await click('[data-testid="erd-place-ok"]');
    expect(ctx.applied).toHaveLength(1);
    expect(ctx.applied[0].label).toBe("다른 다이어그램에 넣기(표 1개)");
    const cmd = ctx.applied[0].commands[0] as { op: string; diagram: string; nodes: { table: string }[] };
    expect([cmd.op, cmd.diagram, cmd.nodes.map((n) => n.table)]).toEqual(["placeTables", "d-sub", ["t-1"]]);
    expect(ctx.notify).toHaveBeenCalledWith("표 1개를 「기본 / 오브젝트」에 넣었습니다(이미 있던 1개 뺌).", "info");
    expect(document.querySelector("[data-testid=erd-place-dialog]")).toBeNull();
  });

  it("다른 다이어그램이 없으면 [넣기] 꺼짐·이유, 표 메뉴 항목도 꺼짐", async () => {
    await mount(fakeCtx(), ["t-1"]);
    expect(btn("erd-tool-place").disabled).toBe(true);
    expect(btn("erd-tool-place").parentElement?.getAttribute("data-tip")).toBe("다른 다이어그램에 넣기 — 다른 다이어그램이 없습니다");
    await nodeMenu(0);
    expect(btn("erd-menu-item-place").disabled).toBe(true);
  });
});

describe("같은 컬럼 여러 표에 연결(U63)", () => {
  it("bulkColumnSkipsAndSendsOneBatch — 둘 고르고 [컬럼 추가] → 창, MENU_NM 은 t-2 에만 addColumn 한 묶음", async () => {
    preview.mockResolvedValue(previewOf("MENU_NM", { recommendedDomainId: 3 }));
    const ctx = fakeCtx();
    await mount(ctx, ["t-1", "t-2"]);
    expect(btn("erd-tool-addcol").disabled).toBe(false);
    expect(btn("erd-tool-addcol").getAttribute("title")).toBe("컬럼 추가 — 고른 표 2개에 같은 컬럼");
    await click('[data-testid="erd-tool-addcol"]');
    expect(ctx.nav.startColumnAdd).not.toHaveBeenCalled();
    await typeInto(document.querySelector<HTMLInputElement>("[data-testid=erd-bulkcol-logical]")!, "메뉴명");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    await click('[data-testid="erd-bulkcol-ok"]');
    expect(ctx.applied).toHaveLength(1);
    expect(ctx.applied[0].label).toBe("컬럼 추가(표 1개)");
    expect(ctx.applied[0].commands).toEqual([
      { op: "addColumn", id: expect.stringMatching(/^c-/), table: "t-2", logical: "메뉴명", phys: "MENU_NM", domainId: 3 },
    ]);
    expect(ctx.notify).toHaveBeenCalledWith("MENU_NM 컬럼을 표 1개에 더했습니다(이미 있던 1개 건너뜀).", "info");
  });

  it("bulkColumnOverBatchRefuses — 고른 표가 201개면 창을 열지 않고 알림", async () => {
    const ctx = fakeCtx({ state: bigState(MAX_BATCH + 1, 1) });
    await mount(ctx, Array.from({ length: MAX_BATCH + 1 }, (_, i) => `t-${i}`));
    await click('[data-testid="erd-tool-addcol"]');
    expect(document.querySelector("[data-testid=erd-bulkcol-dialog]")).toBeNull();
    expect(ctx.notify).toHaveBeenCalledWith(`한 번에 ${MAX_BATCH}개 표까지 넣을 수 있습니다.`, "warn");
  });

  it("표 메뉴(여러 개)의 '표 2개에 같은 컬럼 추가…' 도 창을 연다", async () => {
    await mount(fakeCtx(), ["t-1", "t-2"]);
    await nodeMenu(0);
    await click('[data-testid="erd-menu-item-bulkcol"]');
    expect(document.querySelector("[data-testid=erd-bulkcol-dialog]")).not.toBeNull();
  });

  it("releasedAllowsDiagramOpsOnly — 확정된 버전: 정렬·넣기 켜짐, [컬럼 추가] 꺼짐", async () => {
    const base = fakeCtx({ state: withSub() });
    await mount(fakeCtx({ state: withSub(), rights: { ...base.rights, model: deny(RELEASED_TEXT) } }), ["t-1", "t-2"]);
    expect(btn("erd-tool-align").disabled).toBe(false);
    expect(btn("erd-tool-place").disabled).toBe(false);
    expect(btn("erd-tool-addcol").disabled).toBe(true);
    expect(btn("erd-tool-addcol").parentElement?.getAttribute("title")).toBe("컬럼 추가 — 확정된 버전");
  });
});
```
`T/erd-canvas-editing.test.ts` 의 "표를 둘 고르거나 안 고르면 [컬럼 추가]·[PK 추가]가 꺼지고 감싼 span title 에 이유" 시험을 바꾼다(U63): 둘 고르면 `erd-tool-addcol` 켜짐·단추 `title` = `"컬럼 추가 — 고른 표 2개에 같은 컬럼"`, `erd-tool-addpk` 꺼짐·감싼 span `title` = `"PK 추가 — 표를 하나만 고르세요"`, 이유 글(`erd-tool-addpk-reason`)·`aria-describedby` 검사는 addpk 로 옮긴다. 안 고른 경우 기대는 그대로. 시험 이름은 "표를 둘 고르면 [PK 추가]만 꺼지고, 안 고르면 둘 다 꺼진다" 로.

`bulkColumnOverBatchRefuses` 는 `bigState(201, 1)` 를 실제로 마운트한다. `selectedIds()` 가 store 노드에서 읽으므로 노드 201개가 실제로 있어야 한다(가짜 id 목록으로 줄이지 않는다). 느려도 그대로 둔다.

- [ ] **Step 6: 실행 → 실패 확인**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-canvas-multi.test.ts tests/dma/erdEdit/erd-canvas-editing.test.ts`
Expected: 새 시험 FAIL(`erd-tool-place` 없음, [컬럼 추가] 꺼짐).

- [ ] **Step 7: `useCanvasEditing.ts` — 창 연결**

7-1. import 더함: `import { BulkColumnModal, PlaceIntoDialog, type PlaceTarget } from "./MultiDialogs";`, Task 1 의 `alreadyIn, bulkColumnCommands, bulkColumnPlan, placeIntoCommand, type BulkColumnInput`.

7-2. 상태(다른 `useState` 옆): 
```ts
  /** 다른 다이어그램에 넣기 창의 대상 표(U61). null = 닫힘. */
  const [placing, setPlacing] = useState<string[] | null>(null);
  /** 같은 컬럼 창의 대상 표(U63). null = 닫힘. */
  const [bulkCol, setBulkCol] = useState<string[] | null>(null);
```
7-3. 다른 다이어그램 수(도구 막대용, 다이어그램 목록이 바뀔 때만 다시 셈):
```ts
  const stateDiagrams = ctx.state.diagrams;
  const otherDiagrams = useMemo(
    () => (viewDiagram ? Object.keys(stateDiagrams).filter((id) => id !== viewDiagram).length : 0),
    [stateDiagrams, viewDiagram],
  );
```
7-4. 열기·보내기(`askDelete` 뒤):
```ts
  const openPlace = useCallback((tables?: readonly string[]) => {
    const c = ctxRef.current;
    const ids = tables ?? selectedIds();
    if (ids.length === 0 || !c.diagramId) return;
    if (!c.rights.diagram.ok) {
      deny(c.rights.diagram);
      return;
    }
    setMenu(null);
    setPlacing([...ids]);
  }, [selectedIds, deny]);

  const submitPlace = useCallback(async (to: string): Promise<string | null> => {
    const c = ctxRef.current;
    const ids = placing;
    if (!ids || !c.diagramId) return null;
    const plan = placeIntoCommand(c.state, c.diagramId, to, ids, c.audit.show);
    if (!plan.command) return PLACE_ALL_PRESENT_TEXT;
    const { out, current } = await send([plan.command], `다른 다이어그램에 넣기(표 ${plan.placed.length}개)`);
    if (!current) return null;
    if (!out.ok) return out.notice.message;
    setPlacing(null);
    const d = ctxRef.current.state.diagrams[to];
    const skip = plan.skipped.length > 0 ? `(이미 있던 ${plan.skipped.length}개 뺌)` : "";
    ctxRef.current.notify(`표 ${plan.placed.length}개를 「${d ? `${d.areaName} / ${d.diagramName}` : to}」에 넣었습니다${skip}.`, "info");
    focusHost();
    return null;
  }, [placing, send, focusHost]);

  const openBulkColumn = useCallback((tables: readonly string[]) => {
    const c = ctxRef.current;
    if (!c.rights.model.ok) {
      deny(c.rights.model);
      return;
    }
    if (tables.length > MAX_BATCH) {
      c.notify(`한 번에 ${MAX_BATCH}개 표까지 넣을 수 있습니다.`, "warn");
      return;
    }
    setMenu(null);
    setBulkCol([...tables]);
  }, [deny]);

  const submitBulkColumn = useCallback(async (col: BulkColumnInput): Promise<string | null> => {
    const c = ctxRef.current;
    const ids = bulkCol;
    if (!ids) return null;
    const plan = bulkColumnPlan(c.state.model, ids, col.phys);
    if (plan.targets.length === 0) return "고른 표에 모두 같은 물리명 컬럼이 있습니다.";
    const commands = bulkColumnCommands(c.state.model, plan.targets, col, () => newElementId("c"));
    const { out, current } = await send(commands, `컬럼 추가(표 ${plan.targets.length}개)`);
    if (!current) return null;
    if (!out.ok) return out.notice.message;
    setBulkCol(null);
    const skip = plan.skipped.length > 0 ? `(이미 있던 ${plan.skipped.length}개 건너뜀)` : "";
    ctxRef.current.notify(`${col.phys} 컬럼을 표 ${plan.targets.length}개에 더했습니다${skip}.`, "info");
    focusHost();
    return null;
  }, [bulkCol, send, focusHost]);
```
`PLACE_ALL_PRESENT_TEXT` 는 `MultiDialogs` 에서 import.

7-5. `addColumn`(도구 막대 [컬럼 추가]·[PK 추가]) 바꿈 — 여러 개 + pk 아님이면 창:
```ts
    const ids = selectedIds();
    if (ids.length === 0) {
      c.notify("표를 먼저 고르세요.", "info");
      return;
    }
    if (ids.length > 1) {
      if (pk) c.notify("표를 하나만 고르세요.", "info"); // PK 는 표 하나씩(U64)
      else openBulkColumn(ids);
      return;
    }
    c.nav.startColumnAdd(ids[0], pk);
```
deps 에 `openBulkColumn`.

7-6. 표 메뉴: 정렬 묶음 뒤, `remove` 앞에:
```ts
    const noOther = Object.keys(ctxRef.current.state.diagrams).length < 2;
    items.push({
      id: "place", label: `${what} 다른 다이어그램에 넣기…`, run: () => openPlace(targets),
      ...(noOther ? { disabled: true, title: "다른 다이어그램이 없습니다" } : off(r.diagram)),
    });
    if (targets.length > 1) {
      items.push({ id: "bulkcol", label: `${what}에 같은 컬럼 추가…`, run: () => openBulkColumn(targets), ...off(r.model) });
    }
```
deps 에 `openPlace`·`openBulkColumn`.

7-7. 도구 막대 props 에 `onPlaceInto: () => openPlace(), otherDiagrams` 를 넣고 deps 에 `openPlace`·`otherDiagrams`.

7-8. overlay 에 창 2개(`SplitDialog` 뒤). 넣기 대상 목록은 창이 열린 동안만 만든다:
```ts
  const placeTargets = useMemo<PlaceTarget[]>(() => {
    if (!placing || !viewDiagram) return NO_TARGETS;
    return Object.values(stateDiagrams)
      .filter((d) => d.id !== viewDiagram)
      .sort((a, b) => a.sortSeq - b.sortSeq || a.id.localeCompare(b.id))
      .map((d) => ({ id: d.id, label: `${d.areaName} / ${d.diagramName}`, already: alreadyIn(ctx.state, d.id, placing) }));
  }, [placing, viewDiagram, stateDiagrams, ctx.state]);
  const closePlace = useCallback(() => {
    setPlacing(null);
    focusHost();
  }, [focusHost]);
  const closeBulkColumn = useCallback(() => {
    setBulkCol(null);
    focusHost();
  }, [focusHost]);
```
`const NO_TARGETS: PlaceTarget[] = [];`, `const NO_TABLES: string[] = [];` 를 파일 위 상수에. overlay 자식:
```ts
      h(PlaceIntoDialog, {
        open: placing !== null, count: placing?.length ?? 0, targets: placeTargets, onSubmit: submitPlace, onClose: closePlace,
      }),
      h(BulkColumnModal, {
        open: bulkCol !== null, model, tables: bulkCol ?? NO_TABLES, onSubmit: submitBulkColumn, onClose: closeBulkColumn,
      }),
```
overlay deps 에 `placing, placeTargets, submitPlace, closePlace, bulkCol, submitBulkColumn, closeBulkColumn`. `placeTargets` 는 `placing` 이 null 이면 늘 같은 `NO_TARGETS` 라 닫힌 동안 overlay 를 다시 만들지 않는다(U70).

- [ ] **Step 8: `ErdToolbar.tsx` — [넣기]·[컬럼 추가] 여러 개**

8-1. props 더함: `onPlaceInto(): void;`, `otherDiagrams: number;`. 아이콘 import `IconFolderPlus`(`@tabler/icons-react`).
8-2. [컬럼 추가] tip·꺼짐:
```tsx
  const addColTip = !model.ok ? `컬럼 추가 — ${reasonOf(model)}`
    : none ? "컬럼 추가 — 표를 먼저 고르세요"
    : selection > 1 ? `컬럼 추가 — 고른 표 ${selection}개에 같은 컬럼` : "컬럼 추가";
```
`<TextToolButton … label="컬럼 추가" tip={addColTip} disabled={!model.ok || none} …/>`. [PK 추가] 는 `oneTableTip` 그대로.
8-3. [다른 다이어그램에 넣기](빼기 단추 바로 앞):
```tsx
      <ToolButton label="다른 다이어그램에 넣기"
        tip={!diagram.ok ? `다른 다이어그램에 넣기 — ${reasonOf(diagram)}`
          : none ? "다른 다이어그램에 넣기 — 표를 먼저 고르세요"
          : otherDiagrams === 0 ? "다른 다이어그램에 넣기 — 다른 다이어그램이 없습니다"
          : many("다른 다이어그램에 넣기", true)}
        icon={<IconFolderPlus size={ICON} />} disabled={!diagram.ok || none || otherDiagrams === 0}
        data-testid="erd-tool-place" onClick={onPlaceInto} />
```
8-4. 머리 주석에 "[다른 다이어그램에 넣기](U61), [컬럼 추가] 는 여러 개면 같은 컬럼 창(U63)" 한 줄.

- [ ] **Step 9: 실행 → 통과, lint·audit, 커밋**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/`
Expected: PASS(알려진 흔들림 deferred 50·80 제외). `lint` = 0. 바꾼 파일 audit 두 개 = 0건.
```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit/canvas/{useCanvasEditing.ts,ErdToolbar.tsx,erd-edit-styles.ts} src/frontend/m-mdm/tests/dma/erdEdit/{erd-canvas-multi,erd-canvas-editing}.test.ts
/usr/bin/git commit -m "feat(erd): 여러 표 다른 다이어그램에 넣기·같은 컬럼 추가 연결

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
(`erd-edit-styles.ts` 를 안 고쳤으면 add 에서 뺀다.)

레인 보고 "도움말 반영 메모": §4.2(같은 컬럼 창), §4.4(정렬·넣기·Ctrl/⌘+A·툴팁 표 수), §5(Ctrl/⌘+A), 실제 화면 글(라벨·알림 정본 표 그대로인지).

---

### Task 4: `ErdViewer` 선택 — 다이어그램 바꾸면 비움, 지운 표 뺌, 머리 글

**Files:**
- Modify: `S/ErdViewer.tsx`(`onSelectDiagram`, `focusTable` 파생, 속성 패널 머리 글)
- Test: `T/page-render.test.ts`(시험 3개 더함)

**Interfaces:**
- Consumes: Task 2 Ctrl/⌘+A(Step 5 만).
- Produces: testid `erd-props-multi`. `ErdEditContext.selectedTableId` = 살아 있는 선택의 첫 표(지운 표 뺌), 뜻은 그대로.

- [ ] **Step 1: 실패하는 시험 — 다이어그램 바꾸기**

`T/page-render.test.ts` 의 `describe("erdEdit 화면")` 안, `propsPanelAutoHideKeepsFocusAndNode` 뒤에:
```ts
  /** d-all(t-1·t-2) + d-obj(t-2 만). */
  const TWO_DIAGRAMS = {
    diagrams: [...MENU_DIAGRAMS.diagrams, { id: "d-obj", areaName: "기본", diagramName: "오브젝트", sortSeq: 1 }],
    nodes: [...MENU_DIAGRAMS.nodes, { diagram: "d-obj", table: "t-2", x: 0, y: 0, foldMode: "NONE" as const }],
  };
  /** 컬럼 점프로 그 컬럼의 표를 고른다(happy-dom 은 노드를 그리지 않는다). */
  async function jumpTo(text: string) {
    await key(document.body, { key: "ø", code: "KeyO", altKey: true });
    const box = await waitFor(() => docTestId("erd-jump-input"));
    await typeInto(box, text);
    await key(box, { key: "Enter" });
    await waitFor(() => host.querySelector(".erd-area-grid"));
  }

  it("staleSelectionClearedOnDiagramSwitch — 표를 고른 채 다른 다이어그램을 열면 속성 패널이 사라진다(U66)", async () => {
    currentView = viewOf(menuModel(), TWO_DIAGRAMS);
    await openModel();
    await jumpTo("menu_nm");
    // 패널 안에 초점이 있어도(U12 초점 유지) 다이어그램을 바꾸면 비운다
    const input = await waitFor(() => byTestId("erd-grid-input"));
    await act(async () => {
      input.focus();
    });
    await click(byTestId("erd-diagram-d-obj"));
    await settle();
    expect(byTestId("erd-diagram-d-obj")?.getAttribute("aria-current")).toBe("true");
    expect(host.querySelector(".erd-area-grid")).toBeNull();
  });

  it("crossDiagramSelectKeepsTable — 지금 다이어그램에 없는 표를 컬럼 점프로 고르면 그 다이어그램으로 가고 패널이 그 표를 보인다", async () => {
    currentView = viewOf(menuModel(), TWO_DIAGRAMS);
    await openModel();
    await click(byTestId("erd-diagram-d-obj"));
    await settle();
    await jumpTo("menu_nm"); // t-1 은 d-obj 에 없다
    expect(byTestId("erd-diagram-d-all")?.getAttribute("aria-current")).toBe("true");
    expect(byTestId("erd-columns")).not.toBeNull();
  });

  it("같은 다이어그램을 다시 눌러도 선택은 남는다", async () => {
    currentView = viewOf(menuModel(), TWO_DIAGRAMS);
    await openModel();
    await jumpTo("menu_nm");
    await click(byTestId("erd-diagram-d-all"));
    await settle();
    expect(host.querySelector(".erd-area-grid")).not.toBeNull();
  });
```
`key`·`waitFor`·`docTestId`·`typeInto`·`click`·`settle`·`byTestId` 는 이 파일의 도우미 그대로. 표 t-1 컬럼 점프 글(`menu_nm`)은 `propsPanelAutoHideKeepsFocusAndNode` 와 같다. `MENU_DIAGRAMS` import 는 이미 있다.

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/page-render.test.ts -t "Diagram|다이어그램"`
Expected: `staleSelectionClearedOnDiagramSwitch` FAIL(패널 남음). 나머지 둘은 PASS 일 수 있다(고정 시험).

- [ ] **Step 3: `ErdViewer.tsx` — 다이어그램 바꾸면 비움, 지운 표 뺌**

3-1. `onSelectDiagram`:
```ts
  const onSelectDiagram = useCallback((id: string) => {
    pendingDiagram.current = null;
    // 다른 다이어그램으로 가면 선택·고른 컬럼·패널 초점 유지를 비운다(UX 1.5 U66, staleSelectionAcrossDiagram).
    // 같은 다이어그램을 다시 누르면 그대로 둔다. selectTable 의 다른 다이어그램 길은 여기를 거치지 않는다(선택을 지킨다).
    if (id !== activeRef.current) {
      setSelected((cur) => (cur.size === 0 ? cur : NO_SELECTION));
      setSelectedColumnId(null);
      setPropsFocused(false);
      lastFocusTable.current = null;
    }
    setDiagramId(id);
    setReveal(null);
  }, []);
```
3-2. `focusTable` 을 파생으로(지운 표 뺌, 새 상태 없음):
```ts
  // 살아 있는 선택 — 모델에서 지운 표는 뺀다(U66). 늘 거르지는 않는다: 다이어그램에 없는 표(컬럼 점프·찾기)도 고를 수 있다.
  const liveSelected = useMemo(() => {
    const tables = state?.model.tables;
    const out: string[] = [];
    if (tables) for (const id of selected) if (tables[id]) out.push(id);
    return out;
  }, [selected, state]);
  const focusTable = liveSelected[0] ?? null;
  const pickedCount = liveSelected.length;
```
지금 줄 `const focusTable = selected.size > 0 ? [...selected][0] : null;` 을 바꾼다. 그 아래 효과·`propsTable` 은 그대로 `focusTable` 을 쓴다.

- [ ] **Step 4: 실행 → 통과**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/page-render.test.ts`
Expected: PASS(새 3개 + 기존 전부).

- [ ] **Step 5: 머리 글 — 실패하는 시험 → 구현**

5-1. 시험(Task 2 Ctrl/⌘+A 가 필요):
```ts
  it("고른 표가 둘이면 속성 패널 머리에 '고른 표 2개 중 <첫 표>'(U65)", async () => {
    await openModel();
    const host2 = await waitFor(() => byTestId("erd-canvas-host"));
    await key(host2, { key: "a", ...(isMacPlatform() ? { metaKey: true } : { ctrlKey: true }) });
    await settle();
    expect(byTestId("erd-props-multi")?.textContent).toBe("속성 · 고른 표 2개 중 TB_MCM_SEC_MENU");
    await key(host2, { key: "Escape" });
    await settle();
    expect(byTestId("erd-props-multi")).toBeNull();
  });
```
`isMacPlatform` 은 `@dk-oasis/shared/react-flow` 에서 import. 첫 표 = Ctrl/⌘+A 의 노드 순서 첫 값(t-1). 실패 확인.

5-2. 구현 — 속성 패널 머리(`erd-panel-head__title` 줄):
```tsx
                  {pickedCount > 1 ? (
                    <span className="erd-panel-head__title" data-testid="erd-props-multi" style={MULTI_HEAD} title={multiText}>
                      {multiText}
                    </span>
                  ) : (
                    <span className="erd-panel-head__title">속성</span>
                  )}
```
`const multiText = pickedCount > 1 && propsTable ? \`속성 · 고른 표 ${pickedCount}개 중 ${state?.model.tables[propsTable]?.phys ?? propsTable}\` : "";` 를 `propsTable` 계산 뒤에. 파일 위 상수 `const MULTI_HEAD: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };`(`CSSProperties` import 더함). 최대화 카드(`FloatingPanel title`)는 그대로.

5-3. 실행 → 통과. Escape 로 선택을 풀면 `pickedCount` 0 → 패널 사라짐(머리 없음).

- [ ] **Step 6: lint·audit·커밋**

`lint` = 0, `ErdViewer.tsx` audit 두 개 = 0건. 화면 루트 렌더 판정: 새 상태 없음(`liveSelected` 는 파생). 1차 렌더 하네스 `formInput` 판정(입력 한 글자당 `ErdViewer` 렌더 0회)을 깨지 않는다 — 입력 칸 글자는 `selected`·`state` 를 바꾸지 않는다.
```bash
/usr/bin/git add src/frontend/m-mdm/pages/dma/erdEdit/ErdViewer.tsx src/frontend/m-mdm/tests/dma/erdEdit/page-render.test.ts
/usr/bin/git commit -m "fix(erd): 다이어그램을 바꾸면 선택을 비움·지운 표 뺌·여러 표 머리 글

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

레인 끝: README Global Constraints 의 squash(`squash-branch.mjs --onto dev --rebase`) → `머지 요청:`.

---

## 계획 작성자 메모

- Task 2 하네스는 `erd-canvas-editing.test.ts` 의 것을 줄여 옮겼다. 그 파일(51KB)을 더 키우지 않으려고 새 파일로 뺐다. 기존 파일은 기대 1곳(U63)만 바뀐다.
- `selectAll` 은 `storeApi.getState().addSelectedNodes(ids)` 다. xyflow 12 는 이 호출을 controlled `onNodesChange` select 변경으로 보낸다 → CanvasPane `onSelect` → ErdViewer `selected`. page-render 의 머리 글 시험(Task 4 Step 5)이 이 길 전체를 지킨다.
- `placeTargets`·창 상태를 `useCanvasEditing` 안에 둔 것은 `SplitDialog` 와 같은 이유다: 닫힌 동안 overlay 가 모델 변경에 다시 만들어지지 않게.
- 같은 컬럼 창은 `TokenChoiceModal`(토막 고르기)을 쓰지 않는다. 사전 없는 토막이면 "물리명 직접" 안내로 갈음했다(README 메모).
