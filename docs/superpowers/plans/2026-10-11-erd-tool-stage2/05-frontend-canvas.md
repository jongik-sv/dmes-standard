# ERD 도구 단계 2 — Task 12~13: shared 자동 배치와 캔버스 편집

> 공통 제약(Global Constraints)·단계 2 에서 정한 점(S2-1~S2-28)·Review Focus·인터페이스(정본)는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [04-frontend-core.md](04-frontend-core.md) · [README](README.md) · 다음: [06-frontend-grid-diff.md](06-frontend-grid-diff.md)

레인 FE2 가 Task 12 → 13 을 차례로 한다. Task 12 는 shared 만 고치므로 착수 조건(deferred 27 머지)만 맞으면 바로 시작한다. Task 12 커밋 뒤 조정 세션에 머지 허가를 받는다(README "머지 순서": FE1 Task 9 와 FE2 Task 12 를 먼저 합친다). Task 13 은 FE1 Task 9 가 dev 에 머지된 뒤 rebase 하고 시작한다.

README Review Focus 7개 가운데 이 문서의 Task 에 속하는 것은 없다(1 은 Task 10, 2 는 Task 2, 3·4 는 Task 4, 5 는 Task 3·5, 6 은 Task 6, 7 은 Task 1).

공통 명령(모두 `src/frontend` 에서 부른다):

```bash
# shared 를 바꾸면 먼저 빌드한다 — m-mdm 시험은 @dk-oasis/shared/* 를 shared dist 로 푼다
pnpm --filter @dk-oasis/shared build
# shared 단위 시험(src 를 읽는다. dist 시험은 dist 가 있을 때만 돈다)
pnpm --filter @dk-oasis/shared test:unit
# m-mdm 의존 패키지 빌드 → 이 문서의 화면 시험 → 타입 검사
pnpm --filter "@dk-oasis/m-mdm^..." build
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
pnpm --filter @dk-oasis/m-mdm lint
```

---

### Task 12: shared `react-flow` 자동 배치 함수 `autoLayout`

`@dagrejs/dagre` 로 노드 상자(`{id, width, height}`)와 선(`{source, target}`)을 받아 왼쪽 위 좌표를 돌려주는 순수 함수를 shared `react-flow` 서브패스에 더한다. 업무와 무관하므로 shared 에 둔다(Part B §18-1, CLAUDE.md 공통 컴포넌트 행동강령 — 새 export 는 묻지 않고 등록한다). 기존 shared 부품의 props·동작은 바꾸지 않는다(S2-6). 같은 Task 에서 dist 진입점의 export 누락을 잡는 시험을 더한다(deferred 45). 룰 세트 편집기의 `pages/dme/ruleSetEdit/flow-layout.ts` 는 업무 전용이라 옮기지 않고 고치지도 않는다.

**Files:**
- Create: `src/frontend/shared/src/components/react-flow/auto-layout.ts`
- Modify: `src/frontend/shared/src/components/react-flow/index.ts`
- Create: `src/frontend/shared/tests/unit/react-flow-auto-layout.unit.test.ts`
- Create: `src/frontend/shared/tests/unit/react-flow-dist-exports.unit.test.ts`
- Modify: `.claude/skills/mantine-aggrid-ui/references/components/react-flow.md`, `.claude/skills/mantine-aggrid-ui/SKILL.md`(업무 상황 표 한 줄), `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md`(§1 표 한 줄)
- Modify(생성물): `.claude/skills/mantine-aggrid-ui/references/components/llms.txt`, `llms-full.txt`
- 확인만: `.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs` — `GROUPS` 에 `['React Flow 캔버스 (`@dk-oasis/shared/react-flow`)', ['react-flow']]`, `EXPORT_FILES` 에 `'components/react-flow/index.ts'` 가 이미 있다(단계 1 Task 6). 새 서브패스가 아니므로 고치지 않는다.

**Interfaces:**
- Consumes: shared `dependencies` 의 `@dagrejs/dagre` 3.1.1(단계 1 S12 로 이미 있다), `./route-path` 의 `FlowPos`.
- Produces (`@dk-oasis/shared/react-flow`, Task 13 이 쓴다):

```ts
export type LayoutDirection = "TB" | "BT" | "LR" | "RL";
export interface LayoutNode { id: string; width: number; height: number }
export interface LayoutEdge { source: string; target: string }
export interface AutoLayoutOptions {
  direction?: LayoutDirection;   // 기본 "TB"
  nodeGap?: number;              // 같은 층 노드 사이(dagre nodesep), 기본 40. 격자 칸 사이도 이 값
  rankGap?: number;              // 층 사이(dagre ranksep), 기본 60. 격자를 선 묶음 아래에 둘 때 띄우는 거리도 이 값
  origin?: FlowPos;              // 결과의 가장 왼쪽 위, 기본 {x:0, y:0}
  isolated?: "rank" | "grid";    // 선이 없는 노드: "rank" 는 dagre 에 그대로(기본), "grid" 는 선 묶음 아래 격자
  gridColumns?: number;          // "grid" 의 열 수, 기본 ceil(sqrt(선 없는 노드 수))
}
export const AUTO_LAYOUT_DEFAULTS: { direction: "TB"; nodeGap: 40; rankGap: 60; isolated: "rank" };
/** 노드 왼쪽 위 좌표(정수). 같은 id 는 처음 것만, 자기 선·모르는 끝·같은 선 반복은 무시한다. 크기가 0·음수·NaN 이면 1 로 본다. */
export function autoLayout(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], options?: AutoLayoutOptions): Record<string, FlowPos>;
```

- [ ] **Step 1: 실패하는 시험 — 자동 배치**

`src/frontend/shared/tests/unit/react-flow-auto-layout.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { AUTO_LAYOUT_DEFAULTS, autoLayout, type LayoutNode } from "../../src/components/react-flow/auto-layout";

const box = (id: string, width = 240, height = 100): LayoutNode => ({ id, width, height });

/** 두 상자가 1px 이상 겹치는가. */
function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function assertNoOverlap(pos: Record<string, { x: number; y: number }>, nodes: LayoutNode[]) {
  const rects = nodes.map((n) => ({ id: n.id, x: pos[n.id].x, y: pos[n.id].y, w: n.width, h: n.height }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlap(rects[i], rects[j]), `${rects[i].id} ↔ ${rects[j].id}`).toBe(false);
    }
  }
}

describe("autoLayout", () => {
  it("기본값", () => {
    expect(AUTO_LAYOUT_DEFAULTS).toEqual({ direction: "TB", nodeGap: 40, rankGap: 60, isolated: "rank" });
  });

  it("빈 입력은 빈 결과", () => {
    expect(autoLayout([], [])).toEqual({});
    expect(autoLayout([], [{ source: "a", target: "b" }])).toEqual({});
  });

  it("TB 사슬 a→b→c 는 위에서 아래로 층을 쌓고, 층 사이를 rankGap 이상 띄운다", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const p = autoLayout(nodes, [{ source: "a", target: "b" }, { source: "b", target: "c" }]);
    expect(p.a.y).toBeLessThan(p.b.y);
    expect(p.b.y).toBeLessThan(p.c.y);
    expect(p.b.y - p.a.y).toBeGreaterThanOrEqual(100 + 60);
    assertNoOverlap(p, nodes);
  });

  it("LR 은 왼쪽에서 오른쪽으로 쌓는다", () => {
    const nodes = [box("a"), box("b")];
    const p = autoLayout(nodes, [{ source: "a", target: "b" }], { direction: "LR", rankGap: 100 });
    expect(p.b.x - p.a.x).toBeGreaterThanOrEqual(240 + 100);
    expect(p.a.y).toBe(p.b.y);
  });

  it("좌표는 정수이고, 가장 왼쪽 위가 origin 이다", () => {
    const nodes = [box("a", 201, 33), box("b", 157, 71), box("c", 99, 45)];
    const p = autoLayout(nodes, [{ source: "a", target: "b" }, { source: "a", target: "c" }], { origin: { x: 500, y: -20 } });
    const xs = Object.values(p).map((v) => v.x);
    const ys = Object.values(p).map((v) => v.y);
    expect([...xs, ...ys].every(Number.isInteger)).toBe(true);
    expect(Math.min(...xs)).toBe(500);
    expect(Math.min(...ys)).toBe(-20);
  });

  it("isolated grid — 선이 없는 노드는 선 묶음 아래에 격자로 놓는다", () => {
    const nodes = [box("a"), box("b"), box("c"), box("d"), box("e")];
    const p = autoLayout(nodes, [{ source: "a", target: "b" }], { isolated: "grid" });
    const bottom = Math.max(p.a.y + 100, p.b.y + 100);
    for (const id of ["c", "d", "e"]) expect(p[id].y).toBeGreaterThanOrEqual(bottom + 60);
    // 3개 → 열 2개: c·d 가 한 줄, e 가 다음 줄
    expect(p.c.y).toBe(p.d.y);
    expect(p.d.x).toBe(p.c.x + 240 + 40);
    expect(p.e.y).toBe(p.c.y + 100 + 40);
    expect(p.e.x).toBe(p.c.x);
    assertNoOverlap(p, nodes);
  });

  it("isolated grid 에 gridColumns 를 주면 그 열 수로 놓는다. 선이 하나도 없으면 origin 부터 격자다", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const p = autoLayout(nodes, [], { isolated: "grid", gridColumns: 3, origin: { x: 10, y: 20 } });
    expect(p).toEqual({ a: { x: 10, y: 20 }, b: { x: 290, y: 20 }, c: { x: 570, y: 20 } });
  });

  it("isolated rank — 선이 없어도 모두 dagre 로 놓고 겹치지 않는다", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const p = autoLayout(nodes, []);
    expect(Object.keys(p).sort()).toEqual(["a", "b", "c"]);
    assertNoOverlap(p, nodes);
  });

  it("자기 선·모르는 끝·같은 선 반복은 무시한다", () => {
    const nodes = [box("a"), box("b")];
    const p = autoLayout(nodes, [
      { source: "a", target: "a" }, { source: "a", target: "zz" }, { source: "a", target: "b" }, { source: "a", target: "b" },
    ]);
    expect(Object.keys(p).sort()).toEqual(["a", "b"]);
    expect(p.a.y).toBeLessThan(p.b.y);
  });

  it("같은 id 는 처음 것만 쓰고, 크기가 0·NaN 이어도 던지지 않는다", () => {
    const p = autoLayout([box("a"), box("a", 999, 999), { id: "b", width: 0, height: Number.NaN }], [{ source: "a", target: "b" }]);
    expect(Object.keys(p).sort()).toEqual(["a", "b"]);
    expect(Number.isInteger(p.b.x) && Number.isInteger(p.b.y)).toBe(true);
  });

  it("같은 입력이면 같은 결과(결정적)", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => box(`n${i}`, 200 + (i % 3) * 20, 60 + (i % 4) * 30));
    const edges = nodes.slice(1).map((n, i) => ({ source: `n${Math.floor(i / 3)}`, target: n.id }));
    expect(autoLayout(nodes, edges, { direction: "LR" })).toEqual(autoLayout(nodes, edges, { direction: "LR" }));
  });

  it("60개 트리(자식 3개씩) + 선 없는 10개 — 겹치지 않는다", () => {
    const tree = Array.from({ length: 60 }, (_, i) => box(`t${i}`, 240, 52 + (i % 5) * 20));
    const loose = Array.from({ length: 10 }, (_, i) => box(`l${i}`, 240, 92));
    const edges = tree.slice(1).map((n, i) => ({ source: `t${Math.floor(i / 3)}`, target: n.id }));
    const nodes = [...tree, ...loose];
    const p = autoLayout(nodes, edges, { direction: "LR", isolated: "grid", rankGap: 100 });
    expect(Object.keys(p)).toHaveLength(70);
    assertNoOverlap(p, nodes);
  });
});
```

- [ ] **Step 2: 실패하는 시험 — dist 진입점 export(deferred 45)**

`src/frontend/shared/tests/unit/react-flow-dist-exports.unit.test.ts`:

```ts
/** @vitest-environment happy-dom */
/**
 * deferred 45 — shared 단위 시험은 src 를 읽어서, dist 진입점의 export 누락(esbuild 가 내부 모듈의 `export *` 재내보내기를 잃음,
 * 단계 1 조정-6)을 잡지 못한다. react-flow 진입점의 src 값 export 를 dist 가 모두 내는지 본다.
 * dist 가 없으면(빌드 전) 건너뛴다 — shared 를 빌드한 뒤 돌린다(README 프런트 검증 명령 순서). dist 가 src 보다 낡았으면 실패한다.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const distFile = resolve(__dirname, "../../dist/react-flow.js");
const built = existsSync(distFile);

async function loadDist(): Promise<Record<string, unknown>> {
  return (await import(/* @vite-ignore */ distFile)) as Record<string, unknown>;
}

describe.skipIf(!built)("react-flow dist 진입점", () => {
  it("src 진입점의 값 export 를 dist 가 모두 낸다", async () => {
    const src = (await import("../../src/components/react-flow/index")) as Record<string, unknown>;
    const out = await loadDist();
    expect(Object.keys(src).filter((k) => !(k in out)).sort()).toEqual([]);
  });

  it("@xyflow/react 재수출과 자동 배치가 dist 에 있다", async () => {
    const out = await loadDist();
    const names = ["ReactFlow", "ReactFlowProvider", "useReactFlow", "useStoreApi", "Handle", "getViewportForBounds", "autoLayout", "AUTO_LAYOUT_DEFAULTS"];
    expect(names.filter((n) => out[n] === undefined)).toEqual([]);
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 확인**

dist 시험이 건너뛰지 않게 지금 상태로 한 번 빌드한 뒤 돌린다.

```bash
pnpm --filter @dk-oasis/shared build
pnpm --filter @dk-oasis/shared exec vitest run tests/unit/react-flow-auto-layout.unit.test.ts tests/unit/react-flow-dist-exports.unit.test.ts
```

Expected:
- `react-flow-auto-layout` 은 파일 전체 FAIL — `Failed to resolve import "../../src/components/react-flow/auto-layout"`.
- `react-flow-dist-exports` 의 첫 시험은 PASS(src 에도 아직 `autoLayout` 이 없다), 둘째 시험은 FAIL — `expected [ 'autoLayout', 'AUTO_LAYOUT_DEFAULTS' ] to deeply equal []`.

- [ ] **Step 4: 구현 — `auto-layout.ts`**

`src/frontend/shared/src/components/react-flow/auto-layout.ts`:

```ts
/**
 * 일반 자동 배치(순수, React 의존 없음) — 노드 상자와 선을 받아 dagre 로 층을 나눠 놓고 왼쪽 위 좌표(정수)를 돌려준다.
 * React Flow 의 node.position 은 왼쪽 위다. dagre 는 가운데 좌표를 주므로 여기서 바꾼다.
 * 업무와 무관하다. 업무 규칙(노드 크기 재기, 어떤 선을 넣을지)은 화면이 정해서 넘긴다(Part B §18-1).
 * 선이 없는 노드는 기본으로 dagre 에 그대로 넣는다(isolated "rank"). "grid" 를 주면 선 묶음 아래에 격자로 놓는다 —
 * 관계 없는 표가 많은 ERD 처럼 dagre 가 첫 층에 한 줄로 길게 늘어놓는 것을 막는다.
 */
import dagre from "@dagrejs/dagre";

import type { FlowPos } from "./route-path";

export type LayoutDirection = "TB" | "BT" | "LR" | "RL";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface AutoLayoutOptions {
  /** 층을 쌓는 방향(dagre rankdir). 기본 "TB". */
  direction?: LayoutDirection;
  /** 같은 층 노드 사이(dagre nodesep). 격자 칸 사이도 이 값이다. 기본 40. */
  nodeGap?: number;
  /** 층 사이(dagre ranksep). 격자를 선 묶음 아래에 둘 때 띄우는 거리도 이 값이다. 기본 60. */
  rankGap?: number;
  /** 결과의 가장 왼쪽 위. 기본 {x:0, y:0}. */
  origin?: FlowPos;
  /** 선이 없는 노드: "rank" 는 dagre 에 그대로, "grid" 는 선 묶음 아래 격자. 기본 "rank". */
  isolated?: "rank" | "grid";
  /** "grid" 의 열 수. 기본 ceil(sqrt(선 없는 노드 수)). */
  gridColumns?: number;
}

export const AUTO_LAYOUT_DEFAULTS = { direction: "TB", nodeGap: 40, rankGap: 60, isolated: "rank" } as const;

/** 크기가 0·음수·NaN 이면 1 로 본다(dagre 가 NaN 좌표를 내지 않게). */
const sizeOf = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 1);

export function autoLayout(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], options: AutoLayoutOptions = {}): Record<string, FlowPos> {
  const direction = options.direction ?? AUTO_LAYOUT_DEFAULTS.direction;
  const nodeGap = options.nodeGap ?? AUTO_LAYOUT_DEFAULTS.nodeGap;
  const rankGap = options.rankGap ?? AUTO_LAYOUT_DEFAULTS.rankGap;
  const isolated = options.isolated ?? AUTO_LAYOUT_DEFAULTS.isolated;
  const origin = options.origin ?? { x: 0, y: 0 };

  // 같은 id 는 처음 것만 쓴다.
  const ids = new Set<string>();
  const list: LayoutNode[] = [];
  for (const n of nodes) {
    if (ids.has(n.id)) continue;
    ids.add(n.id);
    list.push({ id: n.id, width: sizeOf(n.width), height: sizeOf(n.height) });
  }
  if (list.length === 0) return {};

  // 자기 선·모르는 끝·같은 선 반복을 뺀다.
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  const linked = new Set<string>();
  for (const e of edges) {
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target)) continue;
    const key = `${e.source}\u0000${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([e.source, e.target]);
    linked.add(e.source);
    linked.add(e.target);
  }

  const ranked = isolated === "grid" ? list.filter((n) => linked.has(n.id)) : list;
  const loose = isolated === "grid" ? list.filter((n) => !linked.has(n.id)) : [];
  const out: Record<string, FlowPos> = {};
  let gridTop = origin.y;

  if (ranked.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, nodesep: nodeGap, ranksep: rankGap, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of ranked) g.setNode(n.id, { width: n.width, height: n.height });
    for (const [s, t] of pairs) g.setEdge(s, t);
    dagre.layout(g);
    // dagre 가운데 좌표 → 왼쪽 위. 가장 왼쪽 위를 origin 에 맞춘다.
    const topLeft = ranked.map((n) => {
      const p = g.node(n.id) as { x: number; y: number };
      return { n, x: p.x - n.width / 2, y: p.y - n.height / 2 };
    });
    const minX = Math.min(...topLeft.map((p) => p.x));
    const minY = Math.min(...topLeft.map((p) => p.y));
    let bottom = origin.y;
    for (const p of topLeft) {
      const x = Math.round(p.x - minX + origin.x);
      const y = Math.round(p.y - minY + origin.y);
      out[p.n.id] = { x, y };
      bottom = Math.max(bottom, y + p.n.height);
    }
    gridTop = bottom + rankGap;
  }

  if (loose.length > 0) {
    const cols = Math.max(1, Math.floor(options.gridColumns ?? Math.ceil(Math.sqrt(loose.length))));
    let y = gridTop;
    for (let i = 0; i < loose.length; i += cols) {
      let x = origin.x;
      let rowHeight = 0;
      for (const n of loose.slice(i, i + cols)) {
        out[n.id] = { x: Math.round(x), y: Math.round(y) };
        x += n.width + nodeGap;
        rowHeight = Math.max(rowHeight, n.height);
      }
      y += rowHeight + nodeGap;
    }
  }
  return out;
}
```

- [ ] **Step 5: 배럴 `index.ts` 에 export**

`src/frontend/shared/src/components/react-flow/index.ts` 의 `route-path` 형 export 줄 바로 뒤에 두 줄을 넣는다. 나머지 줄은 그대로 둔다.

```diff
 export type { FlowPos, RoutePointGuide, SegmentAxis, SegmentHandle, Side, SmoothStepInput } from "./route-path";
+export { AUTO_LAYOUT_DEFAULTS, autoLayout } from "./auto-layout";
+export type { AutoLayoutOptions, LayoutDirection, LayoutEdge, LayoutNode } from "./auto-layout";
 export { SNAP_THRESHOLD_PX, boundsOf, snapHitIn, snapIndex, snapMove, snapMoveIn, snapThreshold } from "./snap";
```

- [ ] **Step 6: dist 시험이 낡은 dist 를 잡는지 확인(deferred 45 가 고친 것)**

아직 빌드하지 않고 돌린다.

Run: `pnpm --filter @dk-oasis/shared exec vitest run tests/unit/react-flow-auto-layout.unit.test.ts tests/unit/react-flow-dist-exports.unit.test.ts`

Expected:
- `react-flow-auto-layout` 12건 PASS.
- `react-flow-dist-exports` 두 시험 모두 FAIL — 첫 시험 `expected [ 'AUTO_LAYOUT_DEFAULTS', 'autoLayout' ] to deeply equal []`. src 에 있는 export 가 dist 에 없으면 이 시험이 알린다.

- [ ] **Step 7: 빌드와 통과 확인**

```bash
pnpm --filter @dk-oasis/shared build
pnpm --filter @dk-oasis/shared exec vitest run tests/unit/react-flow-auto-layout.unit.test.ts tests/unit/react-flow-dist-exports.unit.test.ts
grep -c '@dagrejs/dagre' shared/dist/react-flow.js
grep -c 'autoLayout' shared/dist/types/components/react-flow/index.d.ts
wc -c shared/dist/react-flow.js
pnpm --filter @dk-oasis/shared lint
pnpm --filter @dk-oasis/shared test:unit
```

Expected:
- build 성공. 두 시험 파일 PASS(14건).
- 첫 `grep -c` 가 `1` 이상이다(dagre 를 번들에 넣지 않고 import 를 남겼다). `0` 이면 tsup 이 dagre 를 넣은 것이다. `shared/tsup.config.ts` 의 `external` 배열 끝에 `"@dagrejs/dagre"` 를 더하고 다시 빌드해 같은 확인을 한다.
- 둘째 `grep -c` 가 `1` 이상이다(선언에 export 가 있다).
- `react-flow.js` 는 100KB 미만이다.
- lint 오류 0. `test:unit` 전체 PASS — `package-exports.unit.test.ts` 도 그대로 통과한다(진입점은 늘지 않았다).

- [ ] **Step 8: m-mdm 이 그대로인지 확인**

```bash
pnpm --filter "@dk-oasis/m-mdm^..." build
pnpm --filter @dk-oasis/m-mdm lint
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/ tests/dme/ruleSetEdit/
/usr/bin/git status --short -- m-mdm
```

Expected: build·lint 성공. 두 폴더 시험 PASS(실패 0). `git status` 출력 없음(m-mdm 은 한 파일도 바뀌지 않았다).

- [ ] **Step 9: 문서 — 스킬 문서, Part B 표, 색인**

`.claude/skills/mantine-aggrid-ui/references/components/react-flow.md` 를 고친다.

첫 문단:

```diff
-노드·선을 그리는 캔버스 화면(React Flow)에서 업무와 무관한 부품을 함께 쓸 때 쓴다. `@xyflow/react` 전부와 선 경로 계산·끌기 스냅·화면 길잡이·우클릭 메뉴·단축키 판정·찾기 위젯을 한 서브패스로 준다.
+노드·선을 그리는 캔버스 화면(React Flow)에서 업무와 무관한 부품을 함께 쓸 때 쓴다. `@xyflow/react` 전부와 선 경로 계산·끌기 스냅·화면 길잡이·우클릭 메뉴·단축키 판정·찾기 위젯·자동 배치(dagre)를 한 서브패스로 준다.
```

"내보내는 것" 표의 `끌기 스냅(순수)` 행 바로 뒤에 한 행:

```markdown
| 자동 배치(순수) | `autoLayout`, `AUTO_LAYOUT_DEFAULTS`, 형 `LayoutNode`, `LayoutEdge`, `LayoutDirection`, `AutoLayoutOptions`. dagre 로 층을 나눠 왼쪽 위 좌표(정수)를 준다 |
```

"## Props" 절 바로 앞에 새 절을 넣는다.

````markdown
## 자동 배치

```ts
import { autoLayout, type LayoutEdge, type LayoutNode } from "@dk-oasis/shared/react-flow";

const nodes: LayoutNode[] = rf.getNodes().map((n) => ({ id: n.id, width: n.measured?.width ?? 240, height: n.measured?.height ?? 80 }));
const edges: LayoutEdge[] = rf.getEdges().map((e) => ({ source: e.source, target: e.target }));
const pos = autoLayout(nodes, edges, { direction: "LR", rankGap: 100, isolated: "grid" });
// pos[id] 는 node.position(왼쪽 위)에 그대로 넣는다. 서버에 저장하는 화면은 이 값으로 명령을 만든다.
```

| 옵션 | 기본 | 설명 |
|---|---|---|
| `direction` | `"TB"` | 층을 쌓는 방향(`TB`·`BT`·`LR`·`RL`) |
| `nodeGap` | `40` | 같은 층 노드 사이. 격자 칸 사이도 이 값 |
| `rankGap` | `60` | 층 사이. 격자를 선 묶음 아래에 둘 때 띄우는 거리도 이 값 |
| `origin` | `{x:0, y:0}` | 결과의 가장 왼쪽 위. 지금 그림 자리를 지키려면 지금 노드들의 최소 x·y 를 준다 |
| `isolated` | `"rank"` | 선이 없는 노드. `"grid"` 면 선 묶음 아래 격자(관계 없는 표가 많은 ERD) |
| `gridColumns` | `ceil(sqrt(n))` | `"grid"` 의 열 수 |

- 같은 id 는 처음 것만 쓴다. 자기 선·모르는 끝·같은 선 반복은 무시한다. 크기가 0·NaN 이면 1 로 본다.
- 같은 입력이면 같은 결과다. 노드·선 순서를 정해서(예: 이름 순) 넘기면 다시 눌러도 그림이 흔들리지 않는다.
````

"흔한 실수" 표 끝에 두 행:

```markdown
| 화면에서 `@dagrejs/dagre` 를 직접 import 해 배치를 짬 | 업무와 무관한 배치는 `autoLayout` 을 쓴다. 노드 크기·선 고르기만 화면이 정한다 |
| dagre 결과(가운데 좌표)를 `node.position` 에 그대로 넣음 | `autoLayout` 은 이미 왼쪽 위 좌표를 준다 |
```

`.claude/skills/mantine-aggrid-ui/SKILL.md` "업무 상황 → 컴포넌트" 표의 React Flow 행:

```diff
-| 노드·선을 그리는 캔버스 화면(React Flow) | `react-flow`: `@xyflow/react` 전부 + 선 경로(`routePath`·`smoothStepPoints`)·스냅·`ViewportGuard`·`ContextMenu`·`shortcutOf`/`dispatchShortcut`·`FindWidget`. `@xyflow/react` 를 직접 import 하지 않는다 |
+| 노드·선을 그리는 캔버스 화면(React Flow) | `react-flow`: `@xyflow/react` 전부 + 선 경로(`routePath`·`smoothStepPoints`)·스냅·`ViewportGuard`·`ContextMenu`·`shortcutOf`/`dispatchShortcut`·`FindWidget`·자동 배치 `autoLayout`. `@xyflow/react`·`@dagrejs/dagre` 를 직접 import 하지 않는다 |
```

`docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` §1 표의 `react-flow` 행:

```diff
-| `@dk-oasis/shared/react-flow`                 | SHOULD                 | React Flow 캔버스 공통 부품(진입점·선 경로·스냅·화면 길잡이·우클릭 메뉴·단축키·찾기 위젯) | §18              |
+| `@dk-oasis/shared/react-flow`                 | SHOULD                 | React Flow 캔버스 공통 부품(진입점·선 경로·스냅·화면 길잡이·우클릭 메뉴·단축키·찾기 위젯·자동 배치) | §18              |
```

`ui_docs.mjs` 는 고치지 않는다. 확인과 색인 생성(`src/frontend` 에서):

```bash
grep -n "\['react-flow'\]" ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs
grep -n "'components/react-flow/index.ts'" ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs
node ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs index --write
node ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs full --write
node ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs coverage
```

Expected: 두 `grep` 이 한 줄씩 찾는다. 마지막 줄 `coverage 통과`. `미등재 export: autoLayout …` 이 나오면 react-flow.md "내보내는 것" 표에 그 이름이 단어로 있는지 고치고 다시 돈다.

- [ ] **Step 10: 커밋**

```bash
/usr/bin/git add shared/src/components/react-flow/auto-layout.ts shared/src/components/react-flow/index.ts shared/tests/unit/react-flow-auto-layout.unit.test.ts shared/tests/unit/react-flow-dist-exports.unit.test.ts
/usr/bin/git add ../../.claude/skills/mantine-aggrid-ui/references/components/react-flow.md ../../.claude/skills/mantine-aggrid-ui/SKILL.md ../../.claude/skills/mantine-aggrid-ui/references/components/llms.txt ../../.claude/skills/mantine-aggrid-ui/references/components/llms-full.txt ../../docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md
/usr/bin/git commit -m "feat(shared): React Flow 자동 배치 autoLayout 과 dist export 시험

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r"
```

커밋 뒤 레인 보고에 "Task 12 머지 준비"를 적고 조정 세션의 머지 허가를 기다린다(README 머지 순서). 허가가 나면 Global Constraints 의 squash·`--ff-only` 순서로 머지한다.

---

### Task 13: 캔버스 편집

FE1 Task 9 가 만든 자리(`canvas/useCanvasEditing.ts` 빈 부품, `DiagramTree` 의 `ctx` prop)를 채운다. 화면 공통 파일(`ErdViewer.tsx`·`api.ts`·`types.ts`·`edit-context.ts`·`state/*`·`panels/TopBar.tsx`·`panels/ReviewPanel.tsx`)은 고치지 않는다(S2-19). 쓰기는 모두 `ctx.apply` 로 보낸다. 거절 알림·칸 강조는 `apply` 가 스스로 올린다. 이 Task 는 `NEEDS_CHOICE`(이름 겹침)만 받아 선택 창을 띄운다(README "화면 내부 계약").

다루는 것(조사 A 1.1 E5·E6·E9·E10·E11·E12·E13·E14·E15·E16, 1.3 P1·P2, GAP-2):

| 동작 | 키·도구 | 명령 | 권한(S2-20) |
|---|---|---|---|
| 표 끌기 → 놓을 때 한 번 | 선택 도구(1) | `moveNodes{diagram, nodes[{table,x,y}]}` | 다이어그램 |
| 표 추가 | 도구 2 → 빈 곳 누르기 → 새 표 창 | `[addTable{id,phys,logical,comment}, placeTables]` | 모델 |
| 관계 추가 | 도구 4(비식별)·5(식별) → 부모 표 → 자식 표(누르기 또는 끌기) | `addRelation{id,child,parent,identifying,onNameClash}` | 모델 |
| 이름 겹침 | `NEEDS_CHOICE`(`property=onNameClash`) | 선택 창 → `REUSE`·`RENAME` 으로 다시 보낸다 | 모델 |
| 다이어그램에서 빼기 | Delete·Backspace | `removeFromDiagram{diagram,tables}` | 다이어그램 |
| 모델에서 삭제 | Alt+Delete·Alt+Backspace(⌥⌫) → 확인 창 | `deleteTable{id}` × 고른 표 | 모델 |
| 접기 | 도구 막대·우클릭 메뉴 | `setFold{diagram,tables,foldMode}` | 다이어그램 |
| 자동 배치 | 도구 막대·빈 곳 우클릭 | `moveNodes`(바뀐 표만) | 다이어그램 |
| 다이어그램 마법사 | 왼쪽 목록 [새 다이어그램] | `[addDiagram{id,areaName,diagramName,sortSeq}, placeTables]` | 다이어그램 |
| 부모·자식 표 | Ctrl/⌘+↑·↓, Alt+↑·↓(S2-8) | 없음(`ctx.nav.selectTable`) | — |
| 표 찾기 | Ctrl/⌘+F(캔버스 초점). Ctrl/⌘+T·K 는 FE1 전역 키 | 없음(`ctx.nav.openTableFind`) | — |
| 도구·선택 해제 | Escape | 없음 | — |
| 작업 중 표시·Claude 이름표 | — | 없음(접속자·작업 중 표시를 따로 그리고 `expiresAt` 으로 거른다, S2-11·S2-26) | — |

**Files:**
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-commands.ts`(명령 만들기·부모·자식 찾기·id, 순수)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-shortcuts.ts`(캔버스 키 표, 순수)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-layout.ts`(ERD 크기·관계 → `autoLayout`, 순수)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-edit-styles.ts`(편집 부품 CSS 문자열)
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/ErdToolbar.tsx`, `canvas/RelationClashModal.tsx`, `canvas/CanvasDialogs.tsx`
- Create: `src/frontend/m-mdm/pages/dma/erdEdit/panels/DiagramWizard.tsx`
- Replace: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/useCanvasEditing.ts`(Task 9 빈 부품 → 구현), `panels/DiagramTree.tsx`(전체)
- Modify: `src/frontend/m-mdm/pages/dma/erdEdit/canvas/erd-flow.ts`(이름표·노드 끌기 막음 해제), `canvas/ErdTableNode.tsx`(관계 손잡이), `canvas/PresenceTag.tsx`(이름표 testid)
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/erd-canvas-fixtures.ts`(시험 공용, 시험 파일이 아니다)
- Test: `src/frontend/m-mdm/tests/dma/erdEdit/{erd-canvas-commands,erd-canvas-editing,diagram-wizard}.test.ts`, `erd-flow.test.ts`(고침)

**Interfaces:**
- Consumes: Task 12 `autoLayout`·`LayoutEdge`(`@dk-oasis/shared/react-flow`). FE1 Task 9 의 `edit-context.ts`(`ErdEditContext`·`ApplyOutcome`·`ErdNotice`·`Right`·`EditRights`), 시험 도구 `fakeEditContext(state, over)`(`tests/dma/erdEdit/erd-fixtures.ts`), `types.ts`(`ErdCommandJson`, `ErdPresence.expiresAt`, `ErdClaim`), `state/model-delta.ts`(`nodeKey`). README "화면 내부 계약"의 `CanvasEditing` 모양과 `CanvasPane` 이 지키는 약속(`flowProps` 키만 받는다, `onNodesChange` 에 모든 변경을 넘긴다, host div `tabIndex=0` 의 `onKeyDown`, `toolbar`·`overlay` 를 그린다). 서버 명령 모양은 단계 0 `ErdCommand`·`ErdDiagramCommand` 다. 이름 겹침 `choices` 는 `[{parentColumn, childColumn, phys}]` 다(`ErdRelationOps.add`).
- Produces:
  - `canvas/useCanvasEditing.ts`: `useCanvasEditing(ctx, rf): CanvasEditing`(README 모양 그대로), `SNAP_GRID`.
  - `canvas/erd-flow.ts`: `ErdNodeViewer` 에 `until`·`claimUntil`, `ErdNodeData.pickable?`, `BuildFlowInput.now?`, `viewersAt(viewers, now)`, `nextExpiry(state, now)`, `sourceOfSession(session)`. `buildFlow` 는 노드에 `draggable`·`connectable` 을 싣지 않는다(끌기·잇기는 `flowProps` 가 정한다).
  - `canvas/ErdTableNode.tsx`: `PICK_HANDLE = "pick"`.
  - `panels/DiagramTree.tsx`: 단계 1 props + `ctx: ErdEditContext | null`. `panels/DiagramWizard.tsx`: `DiagramWizard({open, ctx, onClose, onCreated})`.

동작 규칙:
1. 도구는 `select`·`table`·`relation`·`identifying` 넷이다. 그리는 도구(2·4·5)는 모델 편집 권한이 있어야 고를 수 있다. 권한이 없으면 `ctx.notify(이유, "warn")` 하고 선택 도구에 머문다. 권한이 사라지면(연결 끊김 등) 선택 도구로 돌아간다. 한 번 만들면(표·관계) 선택 도구로 돌아간다.
2. 끄는 동안의 위치는 이 훅의 끌기 덮개에만 두고 남에게 보내지 않는다(스펙 4.4 "끄는 동안은 보내지 않는다"). 놓으면 `moveNodes` 를 한 번 보내고 응답(받아들임·거절)이 오면 덮개를 지운다. 받아들이면 위층 투영(S2-18)이 새 자리를 그리고, 거절이면 서버 자리로 돌아간다. 위치는 10px 격자에 붙이고 정수로 보낸다.
3. 관계 도구에서는 모든 표 노드 위에 노드 전체를 덮는 손잡이(`PICK_HANDLE`)를 단다. 부모 표를 누른 뒤 자식 표를 누르거나(React Flow `connectOnClick`), 부모에서 자식으로 끈다. `connectionMode` 는 `Loose` 라 시작 손잡이가 부모, 끝 손잡이가 자식이다. 자기 참조는 도구로 만들지 않는다(`isValidConnection`).
4. 새 요소 id 는 화면이 정한다(`t-`·`r-`·`d-` + UUID, `^[a-z]-[0-9a-zA-Z-]{1,48}$`). 그래서 같은 묶음 뒤 명령(`placeTables`)이 앞 명령이 만든 id 를 쓴다. 안전한 문맥이 아니라서 `crypto.randomUUID` 가 없으면 `getRandomValues` 로 32자리 16진수를 만든다.
5. 노드 꾸미기(`decorateNodes`): 끌기 덮개 위치, `className` `erd-pending`(대기 묶음이 건드리는 표, S2-18 흐린 자리표시), `erd-hl`(`ctx.highlight` 요소가 속한 표), `data.pickable`(관계 도구), 지난 이름표 거르기를 얹는다. 바뀌지 않은 노드는 같은 참조, 같은 꾸밈이면 지난번 객체를 다시 준다(Local-Rules §19).
6. 이름표: 접속자 목록의 다른 세션이 고른 표에 단다(단계 1). 작업 중 표시는 접속자 목록과 따로 그린다 — 그 세션이 목록에 없거나 그 표를 고르지 않았어도 "작업 중" 이름표를 단다(조사 A GAP-2). 지난 `expiresAt`(작업 중 표시·MCP·CLI 시한 접속자)은 그리지 않는다. 화면은 가장 이른 만료 시각에 시계를 올려 다시 거른다(S2-26 — 서버가 만료를 방송하지 않는다).
7. 키는 캔버스 host 의 `onKeyDown` 에서만 받는다(S2-27). 입력 칸이면 `shortcutOf` 가 넘기고, 대화상자 안에서 올라온 키도 넘긴다. Delete·Alt+Delete 는 고른 표가 없으면 막지 않는다.

`data-testid` 정본(마감 Task 16 의 브라우저 확인은 이 이름을 쓴다. 이 Task 는 이름을 바꾸지 않는다):

| 부품 | `data-testid` | 비고 |
|---|---|---|
| 도구 막대 | `erd-toolbar` | `role="toolbar"` |
| 도구 단추 | `erd-tool-select`(1)·`erd-tool-table`(2)·`erd-tool-relation`(4)·`erd-tool-identifying`(5) | 고른 도구는 `aria-pressed="true"` |
| 접기 단추 | `erd-fold-NONE`·`erd-fold-KEYS`·`erd-fold-NAME` | |
| 빼기·삭제·자동 배치 단추 | `erd-tool-remove`·`erd-tool-delete`·`erd-tool-layout` | |
| 관계 잇기 손잡이 | `erd-pick-<표 id>` | 관계 도구일 때만 있다 |
| 표 노드·컬럼 행 | `erd-node-<표 id>`·`erd-col-<컬럼 id>` | 단계 1 그대로. 대기 표는 노드 바깥 `.react-flow__node` 에 `erd-pending`, 강조 표는 `erd-hl` 클래스 |
| 이름표(사람·Claude) | `erd-tag-<세션>` | 노드 안. `data-source="ui"`·`"llm"`. Claude 세션은 `erd-tag-claude-…` |
| 작업 중 표시 | `erd-tag-<세션>` 의 `data-claimed` 속성 | 글에 "· 작업 중" |
| 우클릭 메뉴 | `erd-menu`, 항목 `erd-menu-item-<id>` | 노드: `fold-none`·`fold-keys`·`fold-name`·`remove`·`delete`·`parent`·`child`. 빈 곳: `add-table`·`layout` |
| 새 표 창 | `erd-newtable-phys`·`erd-newtable-logical`·`erd-newtable-ok`·`erd-newtable-cancel`·`erd-newtable-error` | |
| 표 삭제 확인 창 | `erd-delete-confirm`·`erd-delete-ok`·`erd-delete-cancel` | |
| 이름 겹침 선택 창 | `erd-clash`·`erd-clash-reuse`·`erd-clash-rename`·`erd-clash-cancel` | |
| 새 다이어그램 단추 | `erd-diagram-new` | 왼쪽 목록 |
| 다이어그램 마법사 | `erd-wiz`(본문), `erd-wiz-area`·`erd-wiz-name`·`erd-wiz-error`·`erd-wiz-filter`·`erd-wiz-row`(`data-table`)·`erd-wiz-count`·`erd-wiz-all`·`erd-wiz-none`·`erd-wiz-prev`·`erd-wiz-next`·`erd-wiz-create`·`erd-wiz-cancel` | 표 고르기 칸은 `input[aria-label="<물리명>"]`, 배치는 `input[type=radio][value=auto|grid]` |
| 표 찾기 | `erd-find-open`(단추), `erd-find`(입력 칸), `erd-find-widget`·`erd-find-count`·`erd-find-next`·`erd-find-prev`·`erd-find-close` | 단계 1 shared FindWidget 규칙 |
| 다이어그램 목록 항목 | `erd-diagram-<다이어그램 id>` | 단계 1 그대로 |

- [ ] **Step 0: rebase 와 FE1 Task 9 계약 확인**

FE1 Task 9 와 이 레인의 Task 12 가 dev 에 머지된 뒤 한다(`src/frontend` 에서).

```bash
/usr/bin/git fetch --all --prune
/usr/bin/git rebase dev
grep -n "export interface ErdEditContext\|export type ApplyOutcome\|export interface ErdNotice\|export interface Right\b\|export interface EditRights" m-mdm/pages/dma/erdEdit/edit-context.ts
grep -n "export type ErdCommandJson\|expiresAt" m-mdm/pages/dma/erdEdit/types.ts
grep -n "export function useCanvasEditing\|export interface CanvasEditing" m-mdm/pages/dma/erdEdit/canvas/useCanvasEditing.ts
grep -n "useCanvasEditing\|decorateNodes\|editing.onKeyDown\|editing.toolbar\|editing.overlay\|flowProps" m-mdm/pages/dma/erdEdit/ErdViewer.tsx
grep -n "ctx" m-mdm/pages/dma/erdEdit/panels/DiagramTree.tsx
grep -n "export function fakeEditContext" m-mdm/tests/dma/erdEdit/erd-fixtures.ts
grep -n "autoLayout" shared/src/components/react-flow/index.ts
pnpm --filter "@dk-oasis/m-mdm^..." build
```

Expected:
- `edit-context.ts` 에서 다섯 이름이 모두 나온다. `types.ts` 에서 `ErdCommandJson` 과 `ErdPresence` 의 `expiresAt` 이 나온다.
- `useCanvasEditing.ts` 에 Task 9 의 빈 부품과 `CanvasEditing` 이 있다. `ErdViewer.tsx` 의 `CanvasPane` 이 `useCanvasEditing(ctx, rf)` 를 부르고, `decorateNodes`·`onKeyDown`·`toolbar`·`overlay`·`flowProps` 를 쓴다.
- `DiagramTree.tsx` 에 `ctx` prop 이 있다. `erd-fixtures.ts` 에 `fakeEditContext` 가 있다. `autoLayout` export 가 있다. build 성공.
- 하나라도 다르면 멈추지 않는다. 이름이 다르면 이 문서의 import 를 Task 9 이름에 맞춘다. 칸이 빠졌으면 자기 파일에서 `erdCall` 로 만들고(README) 레인 보고에 적는다. `CanvasPane` 이 `decorateNodes` 를 `useStableById` 뒤에 부르지 않거나, `decorateNodes` 가 바뀌어도 다시 계산하지 않으면 레인 보고에 적어 조정 세션을 거쳐 FE1 이 고치게 한다(끌기 덮개·이름표 만료가 그려지지 않는다).

- [ ] **Step 1: 시험 공용 편집 문맥**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-canvas-fixtures.ts`:

```ts
// ERD 캔버스 편집 시험 공용 — 가짜 편집 문맥. 시험 파일이 아니다(vitest 는 *.test.ts 만 모은다).
// 가짜 문맥은 FE1 Task 9 의 fakeEditContext(erd-fixtures.ts) 위에 이 레인의 기본값만 얹는다(README "화면 내부 계약").
// 그래서 FE1 이 ErdEditContext 에 칸을 더해도 여기를 고치지 않는다.
import { vi } from "vitest";

import type { ApplyOutcome, ErdEditContext, ErdNotice, Right } from "../../../pages/dma/erdEdit/edit-context";
import type { ErdCommandJson } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, fakeEditContext, menuModel, stateOf } from "./erd-fixtures";

export const OK: Right = { ok: true, reason: null };
export const deny = (reason: string): Right => ({ ok: false, reason });

export interface Applied {
  commands: ErdCommandJson[];
  label: string;
}

export interface FakeCtx extends ErdEditContext {
  /** apply 로 받은 묶음(차례대로). */
  applied: Applied[];
  /** apply 가 차례로 돌려줄 결과. 비면 받아들임(rev 4). */
  outcomes: ApplyOutcome[];
}

export function notice(over: Partial<ErdNotice> = {}): ErdNotice {
  return {
    code: "INVALID", label: "", message: "거절", hint: null, commandIndex: 0, elementId: null, property: null,
    byRev: null, byUserId: null, bySession: null, current: null, mine: null, choices: null, ...over,
  };
}

/** 메뉴(t-1, 자식)·오브젝트(t-2, 부모) 두 표, 다이어그램 d-all. 권한은 모두 있다. */
export function fakeCtx(over: Partial<ErdEditContext> = {}): FakeCtx {
  const applied: Applied[] = [];
  const outcomes: ApplyOutcome[] = [];
  const ctx = fakeEditContext(stateOf(menuModel(), MENU_DIAGRAMS), {
    modelId: "mcm", session: "ui-me", me: "tester",
    rights: { model: OK, diagram: OK, confirm: OK, manageEditors: OK, owner: true },
    diagramId: "d-all", selectedTableId: null,
    apply: vi.fn(async (commands: ErdCommandJson[], label: string): Promise<ApplyOutcome> => {
      applied.push({ commands, label });
      return outcomes.shift() ?? { ok: true, rev: 4, warnings: [] };
    }),
    ...over,
  });
  return { ...ctx, applied, outcomes };
}
```

- [ ] **Step 2: 실패하는 시험 — 명령 만들기·키 표·배치(순수)**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-canvas-commands.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { shortcutOf, type KeyLike } from "@dk-oasis/shared/react-flow";

import {
  MAX_BATCH, addRelationCommand, addTableCommands, deleteTablesCommands, moveNodesCommand, neighborTables, newElementId, nextNeighbor,
  nextSortSeq, parseClashChoices, removeFromDiagramCommand, setFoldCommand, tableOfElement, tablePhysError, wizardCommands,
} from "../../../pages/dma/erdEdit/canvas/erd-commands";
import { autoLayoutCommand, estimatedSize, relationEdges, wizardPlacement } from "../../../pages/dma/erdEdit/canvas/erd-layout";
import { ERD_CANVAS_SHORTCUTS, deleteKeyLabel } from "../../../pages/dma/erdEdit/canvas/erd-shortcuts";
import { nodeKey } from "../../../pages/dma/erdEdit/state/model-delta";
import type { ErdDiagramNode, ErdState } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, relation, stateOf, table } from "./erd-fixtures";

const menuState = (): ErdState => stateOf(menuModel(), MENU_DIAGRAMS);

describe("명령 만들기", () => {
  it("moveNodesCommand — 정수로 반올림하고, 자리가 같거나 다이어그램에 없는 표는 뺀다", () => {
    const s = menuState();
    expect(moveNodesCommand("d-all", [{ table: "t-1", x: 10.4, y: 19.6 }, { table: "t-2", x: 400, y: 0 }, { table: "t-9", x: 1, y: 1 }], s.nodes))
      .toEqual({ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-1", x: 10, y: 20 }] });
    expect(moveNodesCommand("d-all", [{ table: "t-2", x: 400.2, y: 0 }], s.nodes)).toBeNull();
  });

  it("removeFromDiagramCommand·setFoldCommand — 놓인 표만, 바뀔 것이 없으면 null", () => {
    const s = menuState();
    expect(removeFromDiagramCommand("d-all", ["t-1", "t-9"], s.nodes)).toEqual({ op: "removeFromDiagram", diagram: "d-all", tables: ["t-1"] });
    expect(removeFromDiagramCommand("d-all", ["t-9"], s.nodes)).toBeNull();
    expect(setFoldCommand("d-all", ["t-1", "t-2"], "KEYS", s.nodes)).toEqual({ op: "setFold", diagram: "d-all", tables: ["t-1", "t-2"], foldMode: "KEYS" });
    expect(setFoldCommand("d-all", ["t-1"], "NONE", s.nodes)).toBeNull();
  });

  it("deleteTablesCommands — 표마다 deleteTable 하나", () => {
    expect(deleteTablesCommands(["t-1", "t-2"])).toEqual([{ op: "deleteTable", id: "t-1" }, { op: "deleteTable", id: "t-2" }]);
    expect(MAX_BATCH).toBe(200);
  });

  it("addTableCommands — 같은 id 로 표를 만들고 누른 자리(10px 격자)에 놓는다", () => {
    expect(addTableCommands({ id: "t-new", diagram: "d-all", phys: "TB_NEW", logical: "새 표", at: { x: 123, y: 47 } })).toEqual([
      { op: "addTable", id: "t-new", phys: "TB_NEW", logical: "새 표", comment: "" },
      { op: "placeTables", diagram: "d-all", nodes: [{ table: "t-new", x: 120, y: 50 }] },
    ]);
  });

  it("tablePhysError — 비었음·Oracle 식별자 규칙·같은 물리명", () => {
    const m = menuModel();
    expect(tablePhysError(m, "")).toBe("물리명을 넣으세요.");
    expect(tablePhysError(m, "1TB")).toMatch(/영문 대문자로 시작/);
    expect(tablePhysError(m, "TB-X")).toMatch(/영문 대문자로 시작/);
    expect(tablePhysError(m, "TB_MCM_SEC_MENU")).toBe("같은 물리명의 표가 이미 있습니다: TB_MCM_SEC_MENU");
    expect(tablePhysError(m, "TB_NEW$1")).toBeNull();
  });

  it("addRelationCommand — 부모 PK 를 서버가 복사하므로 pairs 를 싣지 않는다", () => {
    expect(addRelationCommand({ id: "r-x", parent: "t-2", child: "t-1", identifying: true, onNameClash: "ASK" }))
      .toEqual({ op: "addRelation", id: "r-x", child: "t-1", parent: "t-2", identifying: true, onNameClash: "ASK" });
  });

  it("wizardCommands·nextSortSeq — 다이어그램을 만들고 같은 묶음에서 표를 놓는다", () => {
    const s = menuState();
    expect(nextSortSeq(s.diagrams)).toBe(1);
    expect(nextSortSeq({})).toBe(0);
    expect(wizardCommands({ id: "d-new", areaName: "보안", diagramName: "메뉴", sortSeq: 1, nodes: [{ table: "t-1", x: 0, y: 0 }] })).toEqual([
      { op: "addDiagram", id: "d-new", areaName: "보안", diagramName: "메뉴", sortSeq: 1 },
      { op: "placeTables", diagram: "d-new", nodes: [{ table: "t-1", x: 0, y: 0 }] },
    ]);
    expect(wizardCommands({ id: "d-new", areaName: "보안", diagramName: "빈", sortSeq: 1, nodes: [] })).toHaveLength(1);
  });

  it("newElementId — 접두 + UUID, 서버 id 규칙을 지킨다", () => {
    expect(newElementId("r", () => "abc")).toBe("r-abc");
    expect(newElementId("t")).toMatch(/^t-[0-9a-zA-Z-]{1,48}$/);
  });
});

describe("요소 → 표, 부모·자식 표, 이름 겹침 선택지", () => {
  it("tableOfElement — 표·컬럼·키·관계(자식 표)·다이어그램 노드 키", () => {
    const m = menuModel();
    expect(tableOfElement(m, "t-2")).toBe("t-2");
    expect(tableOfElement(m, "c-2")).toBe("t-1");
    expect(tableOfElement(m, "k-2")).toBe("t-2");
    expect(tableOfElement(m, "r-1")).toBe("t-1");
    expect(tableOfElement(m, "d-all:t-2")).toBe("t-2");
    expect(tableOfElement(m, "x-none")).toBeNull();
    expect(tableOfElement(m, null)).toBeNull();
  });

  it("neighborTables — 기각·다른 모델·자기 참조 관계는 보지 않고, 물리명 순이다", () => {
    const m = menuModel();
    m.tables["t-3"] = table("TB_A_ROOT", "뿌리", []);
    m.tables["t-4"] = table("TB_Z_GONE", "기각", []);
    m.relations["r-2"] = relation("t-1", "t-3", [["c-1", "c-1"]]);
    m.relations["r-3"] = relation("t-1", "t-4", [["c-1", "c-1"]], { state: "REJECTED" });
    m.relations["r-4"] = relation("t-1", "t-1", [["c-2", "c-1"]]);
    m.relations["r-5"] = relation("t-1", "t-2", [["c-4", "c-3"]], { parentRef: { model: "mdm", table: "t-x", columns: [] } });
    expect(neighborTables(m, "t-1", "parent")).toEqual(["t-3", "t-2"]);
    expect(neighborTables(m, "t-2", "child")).toEqual(["t-1"]);
    expect(neighborTables(m, "t-2", "parent")).toEqual([]);
  });

  it("nextNeighbor — 지금 다이어그램에 놓인 표를 먼저 고른다", () => {
    const m = menuModel();
    m.tables["t-3"] = table("TB_A_ROOT", "뿌리", []);
    m.relations["r-2"] = relation("t-1", "t-3", [["c-1", "c-1"]]);
    const s = stateOf(m, MENU_DIAGRAMS); // t-3 은 d-all 에 없다
    expect(nextNeighbor(s, "t-1", "parent", "d-all")).toBe("t-2");
    expect(nextNeighbor(s, "t-1", "parent", null)).toBe("t-3");
    expect(nextNeighbor(s, "t-2", "parent", "d-all")).toBeNull();
  });

  it("parseClashChoices — 모양이 맞는 항목만", () => {
    expect(parseClashChoices([{ parentColumn: "c-3", childColumn: "c-2", phys: "OBJECT_ID" }, { phys: 1 }, null])).toEqual([
      { parentColumn: "c-3", childColumn: "c-2", phys: "OBJECT_ID" },
    ]);
    expect(parseClashChoices("x")).toEqual([]);
  });
});

describe("캔버스 키 표(S2-8·S2-27)", () => {
  const ev = (over: Partial<KeyLike>): KeyLike => ({ key: "", code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, ...over });
  it.each([
    ["1", ev({ key: "1", code: "Digit1" }), false, "toolSelect"],
    ["2", ev({ key: "2", code: "Digit2" }), false, "toolTable"],
    ["4", ev({ key: "4", code: "Digit4" }), false, "toolRelation"],
    ["5", ev({ key: "5", code: "Digit5" }), false, "toolIdentifying"],
    ["Shift+1 은 화면 맞춤", ev({ key: "!", code: "Digit1", shiftKey: true }), false, "fitView"],
    ["Delete", ev({ key: "Delete", code: "Delete" }), false, "delete"],
    ["mac delete(Backspace)", ev({ key: "Backspace", code: "Backspace" }), true, "delete"],
    ["Alt+Delete", ev({ key: "Delete", code: "Delete", altKey: true }), false, "deleteModel"],
    ["⌥⌫", ev({ key: "Backspace", code: "Backspace", altKey: true }), true, "deleteModel"],
    ["Ctrl+↑", ev({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true }), false, "parentTable"],
    ["⌘↓", ev({ key: "ArrowDown", code: "ArrowDown", metaKey: true }), true, "childTable"],
    ["⌥↑", ev({ key: "ArrowUp", code: "ArrowUp", altKey: true }), true, "parentTable"],
    ["Alt+↓", ev({ key: "ArrowDown", code: "ArrowDown", altKey: true }), false, "childTable"],
    ["mac Ctrl+↑ 는 OS 몫이라 받지 않는다", ev({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true }), true, null],
    ["Ctrl+F", ev({ key: "f", code: "KeyF", ctrlKey: true }), false, "find"],
    ["Escape", ev({ key: "Escape", code: "Escape" }), false, "escape"],
  ] as const)("%s", (_name, e, mac, id) => {
    expect(shortcutOf(e, mac, ERD_CANVAS_SHORTCUTS)).toBe(id);
  });

  it("입력 칸 안의 숫자·Delete 는 캔버스 키가 아니다", () => {
    const input = { tagName: "INPUT", isContentEditable: false, getAttribute: () => null } as unknown as EventTarget;
    expect(shortcutOf(ev({ key: "4", code: "Digit4", target: input }), false, ERD_CANVAS_SHORTCUTS)).toBeNull();
    expect(shortcutOf(ev({ key: "Delete", code: "Delete", target: input }), false, ERD_CANVAS_SHORTCUTS)).toBeNull();
  });

  it("deleteKeyLabel", () => {
    expect(deleteKeyLabel(false)).toBe("Alt+Delete");
    expect(deleteKeyLabel(true)).toBe("⌥⌫");
  });
});

describe("배치", () => {
  it("estimatedSize — 접기 모드대로 행 수를 센다(t-1: 컬럼 3, 키 컬럼 2)", () => {
    const m = menuModel();
    expect(estimatedSize(m, "t-1", "NONE")).toEqual({ width: 240, height: 92 });
    expect(estimatedSize(m, "t-1", "KEYS")).toEqual({ width: 240, height: 92 }); // 행 2 + "접힘" 줄
    expect(estimatedSize(m, "t-1", "NAME")).toEqual({ width: 240, height: 52 });
    expect(estimatedSize(m, "t-none", "NONE")).toEqual({ width: 240, height: 32 });
  });

  it("relationEdges — 부모 → 자식, 고른 표 안의 그리는 관계만", () => {
    const m = menuModel();
    expect(relationEdges(m, new Set(["t-1", "t-2"]))).toEqual([{ source: "t-2", target: "t-1" }]);
    expect(relationEdges(m, new Set(["t-1"]))).toEqual([]);
  });

  it("autoLayoutCommand — 부모를 자식 왼쪽에 놓고 지금 그림의 왼쪽 위를 지킨다. 이미 그 자리면 null", () => {
    const s = menuState();
    const cmd = autoLayoutCommand(s, "d-all", new Map());
    expect(cmd).not.toBeNull();
    const nodes = (cmd as { nodes: { table: string; x: number; y: number }[] }).nodes;
    const at = new Map(nodes.map((n) => [n.table, n] as const));
    const parent = at.get("t-2") ?? { table: "t-2", ...s.nodes[nodeKey("d-all", "t-2")] };
    const child = at.get("t-1") ?? { table: "t-1", ...s.nodes[nodeKey("d-all", "t-1")] };
    expect(parent.x).toBe(0);
    expect(child.x - parent.x).toBeGreaterThanOrEqual(240 + 100);
    expect(Math.min(parent.y, child.y)).toBe(0);
    // 결과 자리를 반영한 뒤 다시 누르면 옮길 것이 없다
    const placed: Record<string, ErdDiagramNode> = { ...s.nodes };
    for (const n of nodes) placed[nodeKey("d-all", n.table)] = { ...placed[nodeKey("d-all", n.table)], x: n.x, y: n.y };
    expect(autoLayoutCommand({ ...s, nodes: placed }, "d-all", new Map())).toBeNull();
  });

  it("wizardPlacement — grid 는 물리명 순 격자, auto 는 관계를 따른다", () => {
    const m = menuModel();
    expect(wizardPlacement(m, ["t-2", "t-1"], "grid")).toEqual([{ table: "t-1", x: 0, y: 0 }, { table: "t-2", x: 280, y: 0 }]);
    const auto = wizardPlacement(m, ["t-1", "t-2"], "auto");
    const x = Object.fromEntries(auto.map((n) => [n.table, n.x]));
    expect(x["t-2"]).toBe(0);
    expect(x["t-1"]).toBeGreaterThanOrEqual(340);
  });
});
```

- [ ] **Step 3: 실패하는 시험 — 이름표(작업 중 표시·만료)와 노드 끌기 막음 해제**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-flow.test.ts` 를 고친다.

import 줄:

```diff
-import { buildFlow, keyMarks, reuseById, type BuildFlowInput } from "../../../pages/dma/erdEdit/canvas/erd-flow";
+import {
+  buildFlow, keyMarks, nextExpiry, reuseById, sourceOfSession, viewersAt, type BuildFlowInput, type ErdNodeViewer,
+} from "../../../pages/dma/erdEdit/canvas/erd-flow";
```

첫 시험의 노드 단언(끌기·잇기는 이제 노드가 아니라 `flowProps` 가 정한다):

```diff
-    expect(f.nodes[0]).toMatchObject({ type: "erdTable", position: { x: 0, y: 0 }, draggable: false, initialWidth: 240 });
+    expect(f.nodes[0]).toMatchObject({ type: "erdTable", position: { x: 0, y: 0 }, initialWidth: 240 });
+    expect(f.nodes[0].draggable).toBeUndefined();
+    expect(f.nodes[0].connectable).toBeUndefined();
```

마지막 시험(이름표)의 기대값:

```diff
-    expect(f.nodes[0].data.viewers).toEqual([{ session: "claude-a", userId: "tester", source: "MCP", claimed: true }]);
+    expect(f.nodes[0].data.viewers).toEqual([
+      { session: "claude-a", userId: "tester", source: "MCP", claimed: true, until: null, claimUntil: at },
+    ]);
```

파일 끝에 새 `describe` 를 더한다.

```ts
describe("이름표 — 작업 중 표시·시한 접속자(단계 2, S2-11·S2-26)", () => {
  const past = "2026-10-11T05:00:00Z";
  const later = "2026-10-11T05:10:00Z";
  const now = Date.parse("2026-10-11T05:05:00Z");

  it("claimWithoutPresenceShowsTag — 접속자 목록에 없는 세션의 작업 중 표시도 이름표를 단다", () => {
    const s: ErdState = { ...stateOf(menuModel(), MENU_DIAGRAMS), claims: [{ tableId: "t-2", session: "claude-b", userId: "erd-mcp-b", expiresAt: later }] };
    const f = buildFlow(input({ state: s }));
    expect(f.nodes[1].data.viewers).toEqual([
      { session: "claude-b", userId: "erd-mcp-b", source: "MCP", claimed: true, until: later, claimUntil: later },
    ]);
  });

  it("MCP 시한 접속자는 건드린 표에 세션 이름표를 단다. 내 세션의 작업 중 표시는 달지 않는다", () => {
    const s: ErdState = {
      ...stateOf(menuModel(), MENU_DIAGRAMS),
      presence: [{ session: "claude-a", userId: "erd-mcp-a", source: "MCP", diagramId: null, selectedTables: ["t-1", "t-2"], at: past, expiresAt: later }],
      claims: [{ tableId: "t-1", session: "ui-me", userId: "tester", expiresAt: later }],
    };
    const f = buildFlow(input({ state: s }));
    expect(f.nodes[0].data.viewers).toEqual([{ session: "claude-a", userId: "erd-mcp-a", source: "MCP", claimed: false, until: later, claimUntil: null }]);
    expect(f.nodes[1].data.viewers.map((v) => v.session)).toEqual(["claude-a"]);
  });

  it("now 를 주면 지난 작업 중 표시·지난 시한 접속자를 뺀다", () => {
    const s: ErdState = {
      ...stateOf(menuModel(), MENU_DIAGRAMS),
      presence: [{ session: "claude-a", userId: "erd-mcp-a", source: "MCP", diagramId: null, selectedTables: ["t-1"], at: past, expiresAt: past }],
      claims: [{ tableId: "t-2", session: "claude-b", userId: "erd-mcp-b", expiresAt: past }],
    };
    expect(buildFlow(input({ state: s })).nodes.map((n) => n.data.viewers.length)).toEqual([1, 1]);
    expect(buildFlow(input({ state: s, now })).nodes.map((n) => n.data.viewers.length)).toEqual([0, 0]);
  });

  it("viewersAt — 작업 중만 지나면 이름표는 남기고 작업 중 표시를 끈다. 바뀐 것이 없으면 같은 배열", () => {
    const list: ErdNodeViewer[] = [
      { session: "ui-b", userId: "u2", source: "UI", claimed: true, until: null, claimUntil: past },
      { session: "claude-b", userId: "erd-mcp-b", source: "MCP", claimed: true, until: past, claimUntil: past },
    ];
    expect(viewersAt(list, now)).toEqual([{ session: "ui-b", userId: "u2", source: "UI", claimed: false, until: null, claimUntil: null }]);
    const fresh: ErdNodeViewer[] = [{ session: "ui-b", userId: "u2", source: "UI", claimed: true, until: null, claimUntil: later }];
    expect(viewersAt(fresh, now)).toBe(fresh);
  });

  it("nextExpiry — now 뒤의 가장 이른 만료 시각, 없으면 null", () => {
    const s = {
      claims: [{ tableId: "t-1", session: "claude-a", userId: "a", expiresAt: later }, { tableId: "t-2", session: "claude-b", userId: "b", expiresAt: past }],
      presence: [{ session: "claude-c", userId: "c", source: "MCP" as const, diagramId: null, selectedTables: [], at: past, expiresAt: "2026-10-11T05:07:00Z" }],
    };
    expect(nextExpiry(s, now)).toBe(Date.parse("2026-10-11T05:07:00Z"));
    expect(nextExpiry({ claims: [], presence: [] }, now)).toBeNull();
  });

  it("sourceOfSession — ui- 는 화면, cli- 는 CLI, 나머지는 MCP", () => {
    expect([sourceOfSession("ui-ab12cd34"), sourceOfSession("cli-admin"), sourceOfSession("claude-1a2b3c4d"), sourceOfSession("mcp-9f8e")])
      .toEqual(["UI", "CLI", "MCP", "MCP"]);
  });
});
```

- [ ] **Step 4: 시험이 실패하는지 확인**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-canvas-commands.test.ts tests/dma/erdEdit/erd-flow.test.ts`

Expected:
- `erd-canvas-commands` 파일 전체 FAIL — `Failed to resolve import "../../../pages/dma/erdEdit/canvas/erd-commands"`.
- `erd-flow` 파일 전체 FAIL — `nextExpiry`·`viewersAt`·`sourceOfSession` 이 없다(`is not a function`). 파일 import 오류로 기존 시험도 함께 돈다면 첫 시험은 `expected false to be undefined`(노드에 `draggable:false`)로 FAIL 이다.

- [ ] **Step 5: 구현 — `canvas/erd-commands.ts`**

```ts
/**
 * 캔버스 편집 명령 만들기(순수). 서버 명령 모양은 단계 0 ErdCommand·ErdDiagramCommand 다. 다이어그램 노드 자리는 정수(Java int)다.
 * 새 요소 id 는 화면이 정한다(조사 A 2.4d) — 같은 묶음의 뒤 명령이 앞 명령이 만든 id 를 쓴다.
 */
import type { FlowPos } from "@dk-oasis/shared/react-flow";

import { nodeKey } from "../state/model-delta";
import type { ErdCommandJson, ErdDiagram, ErdDiagramNode, ErdFoldMode, ErdModelJson, ErdState } from "../types";

/** save 한 묶음의 명령 수 상한(서버 ErdCommandService). */
export const MAX_BATCH = 200;
/** 새 표를 놓는 격자(px). 캔버스 끌기 격자와 같다. */
export const PLACE_GRID = 10;

export type IdPrefix = "t" | "c" | "k" | "r" | "d";

/** 안전한 문맥이 아니면(http 의 IP 주소 등) randomUUID 가 없다. 그때는 getRandomValues 로 32자리 16진수를 만든다. */
function defaultUuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 서버 ErdIds 규칙 ^[a-z]-[0-9a-zA-Z-]{1,48}$ 를 지키는 새 id. */
export function newElementId(prefix: IdPrefix, uuid: () => string = defaultUuid): string {
  return `${prefix}-${uuid()}`;
}

export interface PlacedNode {
  table: string;
  x: number;
  y: number;
}

const snap = (v: number): number => Math.round(v / PLACE_GRID) * PLACE_GRID;

/** 끈 표의 새 자리. 정수로 반올림하고, 자리가 같거나 이 다이어그램에 없는 표는 뺀다. 남는 것이 없으면 null. */
export function moveNodesCommand(diagram: string, moved: readonly PlacedNode[], nodes: Readonly<Record<string, ErdDiagramNode>>): ErdCommandJson | null {
  const out: PlacedNode[] = [];
  for (const m of moved) {
    const cur = nodes[nodeKey(diagram, m.table)];
    const x = Math.round(m.x);
    const y = Math.round(m.y);
    if (!cur || (cur.x === x && cur.y === y)) continue;
    out.push({ table: m.table, x, y });
  }
  return out.length > 0 ? { op: "moveNodes", diagram, nodes: out } : null;
}

const placedOnly = (diagram: string, tables: readonly string[], nodes: Readonly<Record<string, ErdDiagramNode>>): string[] =>
  tables.filter((t) => nodes[nodeKey(diagram, t)] !== undefined);

export function removeFromDiagramCommand(diagram: string, tables: readonly string[], nodes: Readonly<Record<string, ErdDiagramNode>>): ErdCommandJson | null {
  const list = placedOnly(diagram, tables, nodes);
  return list.length > 0 ? { op: "removeFromDiagram", diagram, tables: list } : null;
}

/** 접기. 이미 그 모드인 표는 뺀다. */
export function setFoldCommand(diagram: string, tables: readonly string[], foldMode: ErdFoldMode, nodes: Readonly<Record<string, ErdDiagramNode>>): ErdCommandJson | null {
  const list = placedOnly(diagram, tables, nodes).filter((t) => nodes[nodeKey(diagram, t)].foldMode !== foldMode);
  return list.length > 0 ? { op: "setFold", diagram, tables: list, foldMode } : null;
}

/** 모델에서 지운다. 딸린 컬럼·키·관계는 서버가 함께 지우고, 되돌리기 한 번으로 모두 돌아온다(단계 0). */
export function deleteTablesCommands(tables: readonly string[]): ErdCommandJson[] {
  return tables.map((id) => ({ op: "deleteTable", id }));
}

export function addTableCommands(i: { id: string; diagram: string; phys: string; logical: string; at: FlowPos }): ErdCommandJson[] {
  return [
    { op: "addTable", id: i.id, phys: i.phys, logical: i.logical, comment: "" },
    { op: "placeTables", diagram: i.diagram, nodes: [{ table: i.id, x: snap(i.at.x), y: snap(i.at.y) }] },
  ];
}

const ORACLE_ID = /^[A-Z][A-Z0-9_$#]{0,127}$/;

/** 새 표 물리명 검사(서버 ErdIds·addTable 과 같은 규칙). 맞으면 null. */
export function tablePhysError(model: ErdModelJson, phys: string): string | null {
  if (!phys) return "물리명을 넣으세요.";
  if (!ORACLE_ID.test(phys)) return "물리명은 영문 대문자로 시작하고 대문자·숫자·_·$·# 만 씁니다(128자 이내).";
  if (Object.values(model.tables).some((t) => t.phys === phys)) return `같은 물리명의 표가 이미 있습니다: ${phys}`;
  return null;
}

export type NameClashMode = "ASK" | "REUSE" | "RENAME";

/** 관계 추가. pairs 를 싣지 않으면 서버가 부모 PK 를 자식에 복사하고, 식별이면 자식 PK 에 넣는다(스펙 4.1·D7). */
export function addRelationCommand(i: { id: string; parent: string; child: string; identifying: boolean; onNameClash: NameClashMode }): ErdCommandJson {
  return { op: "addRelation", id: i.id, child: i.child, parent: i.parent, identifying: i.identifying, onNameClash: i.onNameClash };
}

export function nextSortSeq(diagrams: Readonly<Record<string, ErdDiagram>>): number {
  const seqs = Object.values(diagrams).map((d) => d.sortSeq);
  return seqs.length === 0 ? 0 : Math.max(...seqs) + 1;
}

/** 다이어그램 마법사 묶음 — addDiagram 뒤 같은 묶음에서 그 id 로 표를 놓는다. 고른 표가 없으면 addDiagram 만. */
export function wizardCommands(i: { id: string; areaName: string; diagramName: string; sortSeq: number; nodes: readonly PlacedNode[] }): ErdCommandJson[] {
  const out: ErdCommandJson[] = [{ op: "addDiagram", id: i.id, areaName: i.areaName, diagramName: i.diagramName, sortSeq: i.sortSeq }];
  if (i.nodes.length > 0) out.push({ op: "placeTables", diagram: i.id, nodes: i.nodes.map((n) => ({ table: n.table, x: n.x, y: n.y })) });
  return out;
}

/** 요소 id 가 속한 표 — 표·컬럼·키·관계(자식 표)·다이어그램 노드 키("다이어그램:표"). 모르면 null. */
export function tableOfElement(model: ErdModelJson, id: string | null): string | null {
  if (!id) return null;
  if (model.tables[id]) return id;
  const owner = model.columns[id]?.table ?? model.keys[id]?.table ?? model.relations[id]?.child;
  if (owner) return owner;
  const colon = id.indexOf(":");
  if (colon > 0 && model.tables[id.slice(colon + 1)]) return id.slice(colon + 1);
  return null;
}

/** 부모(이 표가 자식인 관계의 부모) 또는 자식 표. 기각·다른 모델 부모·자기 참조는 보지 않는다. 물리명 순. */
export function neighborTables(model: ErdModelJson, tableId: string, dir: "parent" | "child"): string[] {
  const out = new Set<string>();
  for (const r of Object.values(model.relations)) {
    if (r.state === "REJECTED" || r.parentRef != null || r.child === r.parent) continue;
    if (dir === "parent" && r.child === tableId && model.tables[r.parent]) out.add(r.parent);
    if (dir === "child" && r.parent === tableId && model.tables[r.child]) out.add(r.child);
  }
  return [...out].sort((a, b) => model.tables[a].phys.localeCompare(model.tables[b].phys));
}

/** 옮겨 갈 부모·자식 표 — 지금 다이어그램에 놓인 표를 먼저, 없으면 첫 표. */
export function nextNeighbor(state: ErdState, from: string, dir: "parent" | "child", diagramId: string | null): string | null {
  const list = neighborTables(state.model, from, dir);
  const here = diagramId ? list.find((t) => state.nodes[nodeKey(diagramId, t)]) : undefined;
  return here ?? list[0] ?? null;
}

export interface ClashChoice {
  parentColumn: string;
  childColumn: string;
  phys: string;
}

/** NEEDS_CHOICE(onNameClash) 의 choices — 서버 ErdRelationOps 가 [{parentColumn, childColumn, phys}] 로 준다. */
export function parseClashChoices(choices: unknown): ClashChoice[] {
  if (!Array.isArray(choices)) return [];
  return choices.filter((c): c is ClashChoice =>
    !!c && typeof c === "object"
    && typeof (c as ClashChoice).parentColumn === "string"
    && typeof (c as ClashChoice).childColumn === "string"
    && typeof (c as ClashChoice).phys === "string");
}
```

- [ ] **Step 6: 구현 — `canvas/erd-shortcuts.ts`**

```ts
/**
 * ERD 캔버스 키 표(S2-8·S2-27). 캔버스 host 의 onKeyDown 이 dispatchShortcut 으로 부른다(입력 칸이면 shared 가 넘긴다).
 * - 도구 숫자 키(1·2·4·5)는 캔버스에 초점이 있을 때만 받는다(그리드에서는 글자 입력이다).
 * - Alt 조합은 물리 키(code)로 본다. Mac 의 delete 키는 Backspace 라 Alt+Backspace(⌥⌫)도 모델에서 삭제다.
 * - macOS 는 Ctrl+↑/↓ 를 Mission Control 에 쓴다. Ctrl/⌘+↑/↓ 와 Alt+↑/↓ 를 함께 건다.
 * - Ctrl/⌘+Z·T·K·O 와 F3 은 ErdViewer 의 window 캡처 키(FE1)다. 여기 표의 undo 는 손잡이가 없어 막지 않는다.
 */
import { CANVAS_SHORTCUTS, type CanvasShortcutId, type ShortcutBinding } from "@dk-oasis/shared/react-flow";

export type ErdTool = "select" | "table" | "relation" | "identifying";

export type ErdCanvasKey =
  | CanvasShortcutId
  | "toolSelect" | "toolTable" | "toolRelation" | "toolIdentifying"
  | "deleteModel" | "parentTable" | "childTable";

export const ERD_CANVAS_SHORTCUTS: readonly ShortcutBinding<ErdCanvasKey>[] = [
  { id: "toolSelect", key: "1" },
  { id: "toolTable", key: "2" },
  { id: "toolRelation", key: "4" },
  { id: "toolIdentifying", key: "5" },
  { id: "deleteModel", code: "Delete", alt: true },
  { id: "deleteModel", code: "Backspace", alt: true },
  { id: "parentTable", key: "ArrowUp", mod: true },
  { id: "parentTable", code: "ArrowUp", alt: true },
  { id: "childTable", key: "ArrowDown", mod: true },
  { id: "childTable", code: "ArrowDown", alt: true },
  ...CANVAS_SHORTCUTS,
];

export const TOOL_KEY: Readonly<Record<ErdTool, string>> = { select: "1", table: "2", relation: "4", identifying: "5" };

export function deleteKeyLabel(mac: boolean): string {
  return mac ? "⌥⌫" : "Alt+Delete";
}

export function undoKeyLabel(mac: boolean): string {
  return mac ? "⌘Z" : "Ctrl+Z";
}
```

- [ ] **Step 7: 구현 — `canvas/erd-layout.ts`**

```ts
/**
 * ERD 배치(순수) — 표 크기 어림과 관계 선을 shared autoLayout 에 넘긴다. 업무 규칙(어떤 관계를 선으로 볼지, 접기에 따른 크기)만 여기 둔다.
 * 방향은 왼쪽 → 오른쪽(부모가 왼쪽)이다. 표 노드의 선이 좌우 손잡이에 붙어서다(erd-geometry relationSides).
 * 관계 없는 표는 관계 묶음 아래 격자로 놓는다(dagre 는 첫 층에 한 줄로 길게 늘어놓는다).
 */
import { autoLayout, type FlowPos, type LayoutEdge } from "@dk-oasis/shared/react-flow";

import { nodeKey } from "../state/model-delta";
import type { ErdCommandJson, ErdFoldMode, ErdModelJson, ErdState } from "../types";
import { moveNodesCommand, type PlacedNode } from "./erd-commands";
import { keyMarks } from "./erd-flow";
import { NODE_WIDTH, nodeHeight } from "./erd-geometry";

export const ERD_LAYOUT = { direction: "LR", nodeGap: 40, rankGap: 100, isolated: "grid" } as const;

export type WizardLayout = "auto" | "grid";

export interface Size {
  width: number;
  height: number;
}

/** 키 컬럼(PK·FK·추정 FK·UK) — 접기 KEYS 가 보이는 행. buildFlow 와 같은 규칙이다. */
export function keyColumns(model: ErdModelJson): Set<string> {
  const out = new Set<string>();
  for (const [c, mark] of keyMarks(model)) if (mark !== "") out.add(c);
  for (const k of Object.values(model.keys)) if (k.kind === "UK") for (const c of k.columns) out.add(c);
  return out;
}

/** 그리기 전 노드 크기 어림(buildFlow 의 initialHeight 와 같다). 모르는 표는 머리만. */
export function estimatedSize(model: ErdModelJson, tableId: string, foldMode: ErdFoldMode = "NONE", keys?: ReadonlySet<string>): Size {
  const t = model.tables[tableId];
  if (!t) return { width: NODE_WIDTH, height: nodeHeight(0, false) };
  const cols = t.columnOrder.filter((c) => model.columns[c]);
  const ks = keys ?? keyColumns(model);
  const rows = foldMode === "NAME" ? 0 : foldMode === "KEYS" ? cols.filter((c) => ks.has(c)).length : cols.length;
  return { width: NODE_WIDTH, height: nodeHeight(rows, rows < cols.length) };
}

/** 고른 표 안의 그리는 관계(기각·다른 모델 부모·자기 참조 제외)를 부모 → 자식 선으로. id 순이라 결과가 흔들리지 않는다. */
export function relationEdges(model: ErdModelJson, tables: ReadonlySet<string>): LayoutEdge[] {
  return Object.entries(model.relations)
    .filter(([, r]) => r.state !== "REJECTED" && r.parentRef == null && r.child !== r.parent && tables.has(r.child) && tables.has(r.parent))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, r]) => ({ source: r.parent, target: r.child }));
}

const byPhys = (model: ErdModelJson) => (a: string, b: string): number => model.tables[a].phys.localeCompare(model.tables[b].phys);

/** 표들을 배치한다. 순서는 물리명 순으로 정해 넘긴다(같은 모델이면 같은 결과). */
export function layoutTables(model: ErdModelJson, tables: readonly string[], size: (id: string) => Size, origin: FlowPos = { x: 0, y: 0 }): Record<string, FlowPos> {
  const list = tables.filter((t) => model.tables[t]).sort(byPhys(model));
  const edges = relationEdges(model, new Set(list));
  return autoLayout(list.map((id) => ({ id, ...size(id) })), edges, { ...ERD_LAYOUT, origin });
}

/**
 * 지금 다이어그램의 표 전부를 다시 놓는 moveNodes(바뀐 표만). 그림의 왼쪽 위(지금 노드들의 최소 x·y)를 지킨다.
 * measured 는 캔버스가 잰 크기(없으면 접기 모드로 어림). 옮길 것이 없으면 null.
 */
export function autoLayoutCommand(state: ErdState, diagramId: string, measured: ReadonlyMap<string, Size>): ErdCommandJson | null {
  const placed = Object.values(state.nodes).filter((n) => n.diagram === diagramId && state.model.tables[n.table]);
  if (placed.length === 0) return null;
  const keys = keyColumns(state.model);
  const origin = { x: Math.min(...placed.map((n) => n.x)), y: Math.min(...placed.map((n) => n.y)) };
  const size = (id: string): Size => measured.get(id) ?? estimatedSize(state.model, id, state.nodes[nodeKey(diagramId, id)].foldMode, keys);
  const pos = layoutTables(state.model, placed.map((n) => n.table), size, origin);
  return moveNodesCommand(diagramId, Object.entries(pos).map(([table, p]) => ({ table, x: p.x, y: p.y })), state.nodes);
}

/** 마법사가 고른 표의 자리(물리명 순). auto 는 관계를 따르고, grid 는 관계를 보지 않는 격자다. */
export function wizardPlacement(model: ErdModelJson, tables: readonly string[], mode: WizardLayout): PlacedNode[] {
  const keys = keyColumns(model);
  const list = tables.filter((t) => model.tables[t]).sort(byPhys(model));
  const size = (id: string) => estimatedSize(model, id, "NONE", keys);
  const pos = mode === "auto"
    ? layoutTables(model, list, size)
    : autoLayout(list.map((id) => ({ id, ...size(id) })), [], { ...ERD_LAYOUT, isolated: "grid" });
  return list.map((table) => ({ table, x: pos[table].x, y: pos[table].y }));
}
```

- [ ] **Step 8: 구현 — `canvas/erd-flow.ts` 이름표·노드 막음 해제**

머리 주석 끝(` *   행 데이터는 확대율과 무관하게 만든다 …` 줄 다음)에 두 줄을 더한다.

```diff
  *   행 데이터는 확대율과 무관하게 만든다. 그래서 확대율이 경계를 넘어도 노드 객체는 그대로이고 선만 바뀐다.
+ * - 이름표(단계 2): 접속자가 고른 표와 작업 중 표시를 따로 모은다(조사 A GAP-2). 만료 시각(until·claimUntil)을 실어 두고, now 를 주면 지난 것을 뺀다.
+ *   끌기·잇기는 노드가 아니라 캔버스 flowProps 가 정한다(useCanvasEditing).
  */
```

`import type` 줄에 `ErdClaim`·`ErdPresence` 를 더한다.

```diff
-import type { ErdColumnStatus, ErdModelJson, ErdRelation, ErdRelationState, ErdState } from "../types";
+import type { ErdClaim, ErdColumnStatus, ErdModelJson, ErdPresence, ErdRelation, ErdRelationState, ErdState } from "../types";
```

`ErdNodeViewer`·`ErdNodeData`:

```diff
 export interface ErdNodeViewer {
   session: string;
   userId: string;
   source: string;
   /** 이 세션이 이 표에 작업 중 표시(claim)를 걸었다. */
   claimed: boolean;
+  /** 이름표가 사라지는 시각 — MCP·CLI 시한 접속자의 expiresAt, 작업 중 표시만 있으면 그 만료 시각. SSE 접속자는 null. */
+  until: string | null;
+  /** 작업 중 표시 만료 시각. 작업 중이 아니면 null. */
+  claimUntil: string | null;
 }
 
 export interface ErdNodeData extends Record<string, unknown> {
   title: string;
   subtitle: string;
   rows: ErdRowView[];
   hiddenCount: number;
   violations: number;
   viewers: ErdNodeViewer[];
+  /** 관계 도구(4·5) 동안 노드 전체를 덮는 잇기 손잡이를 단다(useCanvasEditing 이 꾸민다). */
+  pickable?: boolean;
 }
```

`BuildFlowInput` 에 칸 하나:

```diff
   selected: ReadonlySet<string>;
   mySession: string;
+  /** 주면 이 시각에 지난 작업 중 표시·시한 접속자를 뺀다(시험용. 화면은 decorateNodes 가 시계로 거른다). */
+  now?: number;
 }
```

`viewersByTable` 함수 전체를 아래로 바꾸고 바로 뒤에 세 함수를 더한다.

```ts
const isPast = (iso: string | null | undefined, now: number | undefined): boolean =>
  now !== undefined && !!iso && Date.parse(iso) <= now;

/** 작업 중 표시만 있고 접속자 목록에 없는 세션의 출처 — 화면 세션은 ui-, CLI 는 cli-, 나머지(claude-·mcp-·직접 준 이름)는 MCP. */
export function sourceOfSession(session: string): string {
  if (session.startsWith("ui-")) return "UI";
  if (session.startsWith("cli-")) return "CLI";
  return "MCP";
}

/**
 * 표마다 이름표. 접속자 목록에서 다른 세션이 고른 표(MCP·CLI 시한 항목은 서버가 건드린 표를 selectedTables 로 준다, S2-11),
 * 그리고 작업 중 표시를 따로 단다 — 그 세션이 목록에 없거나 그 표를 고르지 않았어도 단다. 내 세션은 달지 않는다.
 */
function viewersByTable(state: ErdState, mySession: string, now: number | undefined): Map<string, ErdNodeViewer[]> {
  const claimOf = new Map<string, ErdClaim>();
  for (const c of state.claims) if (!isPast(c.expiresAt, now)) claimOf.set(`${c.tableId}|${c.session}`, c);
  const out = new Map<string, ErdNodeViewer[]>();
  const seen = new Set<string>();
  const add = (table: string, v: ErdNodeViewer) => {
    const key = `${table}|${v.session}`;
    if (seen.has(key)) return;
    seen.add(key);
    const list = out.get(table) ?? [];
    list.push(v);
    out.set(table, list);
  };
  const bySession = new Map<string, ErdPresence>();
  for (const p of state.presence) {
    bySession.set(p.session, p);
    if (p.session === mySession || isPast(p.expiresAt, now)) continue;
    for (const t of p.selectedTables) {
      const c = claimOf.get(`${t}|${p.session}`);
      add(t, { session: p.session, userId: p.userId, source: p.source, claimed: !!c, until: p.expiresAt ?? null, claimUntil: c?.expiresAt ?? null });
    }
  }
  for (const c of claimOf.values()) {
    if (c.session === mySession) continue;
    add(c.tableId, {
      session: c.session, userId: c.userId, source: bySession.get(c.session)?.source ?? sourceOfSession(c.session),
      claimed: true, until: c.expiresAt, claimUntil: c.expiresAt,
    });
  }
  return out;
}

/** now 에 지난 이름표를 뺀다. 작업 중 표시만 지났으면 이름표는 남기고 작업 중을 끈다. 바뀐 것이 없으면 같은 배열(참조 안정). */
export function viewersAt(viewers: ErdNodeViewer[], now: number): ErdNodeViewer[] {
  let changed = false;
  const out: ErdNodeViewer[] = [];
  for (const v of viewers) {
    if (v.until && Date.parse(v.until) <= now) {
      changed = true;
      continue;
    }
    if (v.claimed && v.claimUntil && Date.parse(v.claimUntil) <= now) {
      changed = true;
      out.push({ ...v, claimed: false, claimUntil: null });
      continue;
    }
    out.push(v);
  }
  return changed ? out : viewers;
}

/** now 뒤의 가장 이른 만료 시각(작업 중 표시·시한 접속자). 없으면 null. 화면은 이때 시계를 올려 이름표를 다시 거른다(S2-26). */
export function nextExpiry(state: Pick<ErdState, "claims" | "presence">, now: number): number | null {
  let next: number | null = null;
  const consider = (iso: string | null | undefined) => {
    if (!iso) return;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t > now && (next === null || t < next)) next = t;
  };
  for (const c of state.claims) consider(c.expiresAt);
  for (const p of state.presence) consider(p.expiresAt);
  return next;
}
```

`buildFlow` 의 노드 만들기 두 곳:

```diff
-  const viewers = viewersByTable(i.state, i.mySession);
+  const viewers = viewersByTable(i.state, i.mySession, i.now);
```

```diff
-      selected: i.selected.has(n.table), draggable: false, connectable: false,
+      selected: i.selected.has(n.table),
       initialWidth: NODE_WIDTH, initialHeight: nodeHeight(rows.length, hiddenCount > 0),
```

- [ ] **Step 9: 순수 시험 통과 확인**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-canvas-commands.test.ts tests/dma/erdEdit/erd-flow.test.ts tests/dma/erdEdit/erd-canvas.test.ts`

Expected: 세 파일 PASS(실패 0). `erd-canvas.test.ts`(단계 1 렌더 시험)는 노드에 `draggable` 이 없어도 그대로 통과한다(ReactFlow 기본 `nodesDraggable` 은 시험이 주지 않아 true 지만, 그 시험은 끌지 않는다).

- [ ] **Step 10: 실패하는 시험 — 캔버스 편집 훅(렌더)**

`src/frontend/m-mdm/tests/dma/erdEdit/erd-canvas-editing.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  ReactFlow, ReactFlowProvider, isMacPlatform, useReactFlow, type EdgeTypes, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { useCanvasEditing, type CanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { flush, typeInto } from "../../dme/helpers/render";
import { deny, fakeCtx, notice, type FakeCtx } from "./erd-canvas-fixtures";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
let host: HTMLDivElement;
let root: Root | null = null;
let editing: CanvasEditing;
let raw: ErdFlowNode[] = [];

/** CanvasPane 과 같은 연결: buildFlow → decorateNodes → ReactFlow, flowProps 펼치기, host div 의 onKeyDown, toolbar·overlay. */
function Harness({ ctx, selected }: { ctx: ErdEditContext; selected: readonly string[] }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const e = useCanvasEditing(ctx, rf);
  editing = e;
  const flow = useMemo(
    () => buildFlow({
      state: ctx.state, diagramId: ctx.diagramId, mode: "logical", preset: "basic", namesOnly: false,
      statuses: {}, domains: {}, selected: new Set(selected), mySession: ctx.session,
    }),
    [ctx.state, ctx.diagramId, ctx.session, selected],
  );
  raw = flow.nodes;
  return h("div", { tabIndex: 0, "data-testid": "erd-host", onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    e.toolbar,
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES, edgeTypes: EDGE_TYPES,
      onNodesChange: e.onNodesChange, ...e.flowProps, fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay);
}

async function mount(ctx: FakeCtx, selected: readonly string[] = []) {
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

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("캔버스 편집 — 키", () => {
  it("Delete 는 고른 표를 이 다이어그램에서 뺀다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await press({ key: "Delete", code: "Delete" });
    expect(ctx.applied).toEqual([{ commands: [{ op: "removeFromDiagram", diagram: "d-all", tables: ["t-1"] }], label: "다이어그램에서 빼기" }]);
  });

  it("고른 표가 없으면 Delete 를 막지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await press({ key: "Delete", code: "Delete" });
    expect(ctx.applied).toEqual([]);
  });

  it("Alt+Backspace 는 확인 창을 띄우고, [삭제] 뒤에 deleteTable 을 보낸다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await press({ key: "Backspace", code: "Backspace", altKey: true });
    expect(document.querySelector('[data-testid="erd-delete-confirm"]')?.textContent).toContain("TB_MCM_SEC_MENU");
    expect(ctx.applied).toEqual([]);
    await click('[data-testid="erd-delete-ok"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "deleteTable", id: "t-1" }], label: "표 삭제" }]);
  });

  it("다이어그램 편집 권한이 없으면 Delete 는 이유를 알리고 보내지 않는다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, diagram: deny("공동 편집자가 아닙니다.") } });
    await mount(ctx, ["t-1"]);
    await press({ key: "Delete", code: "Delete" });
    expect(ctx.applied).toEqual([]);
    expect(ctx.notify).toHaveBeenCalledWith("공동 편집자가 아닙니다.", "warn");
  });

  it("4 는 비식별 관계 도구 — 끌기를 끄고 잇기를 켠다. Escape 는 선택 도구로 돌린다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    expect(editing.flowProps).toMatchObject({ nodesDraggable: true, nodesConnectable: false, deleteKeyCode: null });
    await press({ key: "4", code: "Digit4" });
    expect(document.querySelector('[data-testid="erd-tool-relation"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(editing.flowProps).toMatchObject({ nodesDraggable: false, nodesConnectable: true });
    expect(editing.decorateNodes(raw).every((n) => n.data.pickable === true)).toBe(true);
    expect(host.querySelectorAll('[data-testid^="erd-pick-"]')).toHaveLength(2);
    await press({ key: "Escape", code: "Escape" });
    expect(document.querySelector('[data-testid="erd-tool-select"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(editing.decorateNodes(raw)).toBe(raw);
  });

  it("모델 편집 권한이 없으면 그리는 도구를 고르지 못한다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, model: deny("확정된 버전이라 모델을 고칠 수 없습니다.") } });
    await mount(ctx);
    await press({ key: "5", code: "Digit5" });
    expect(ctx.notify).toHaveBeenCalledWith("확정된 버전이라 모델을 고칠 수 없습니다.", "warn");
    expect(document.querySelector('[data-testid="erd-tool-select"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("Alt+↑ 는 부모 표로, Alt+↓ 는 자식 표로 옮긴다", async () => {
    const child = fakeCtx({ selectedTableId: "t-1" });
    await mount(child, ["t-1"]);
    await press({ key: "ArrowUp", code: "ArrowUp", altKey: true });
    expect(child.nav.selectTable).toHaveBeenCalledWith("t-2");
    act(() => root?.unmount());
    const parent = fakeCtx({ selectedTableId: "t-2" });
    await mount(parent, ["t-2"]);
    await press({ key: "ArrowDown", code: "ArrowDown", altKey: true });
    expect(parent.nav.selectTable).toHaveBeenCalledWith("t-1");
    await press({ key: "ArrowUp", code: "ArrowUp", altKey: true });
    expect(parent.notify).toHaveBeenCalledWith("부모 표가 없습니다.", "info");
  });

  it("Ctrl/⌘+F 는 표 찾기를 연다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    const mac = isMacPlatform();
    await press({ key: "f", code: "KeyF", ctrlKey: !mac, metaKey: mac });
    expect(ctx.nav.openTableFind).toHaveBeenCalledTimes(1);
  });
});

describe("캔버스 편집 — 끌기·관계·표 추가·배치·꾸밈", () => {
  it("끄는 동안은 보내지 않고 덮개로 그리며, 놓을 때 moveNodes 를 한 번 보낸 뒤 덮개를 지운다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await act(async () => {
      editing.onNodesChange([{ type: "position", id: "t-1", position: { x: 100, y: 50 }, dragging: true }]);
    });
    expect(ctx.applied).toEqual([]);
    expect(editing.decorateNodes(raw)[0].position).toEqual({ x: 100, y: 50 });
    await act(async () => {
      editing.flowProps.onNodeDragStop!(new MouseEvent("mouseup"), raw[0], [raw[0]]);
    });
    await flush();
    expect(ctx.applied).toEqual([{ commands: [{ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-1", x: 100, y: 50 }] }], label: "표 옮기기" }]);
    expect(editing.decorateNodes(raw)[0]).toBe(raw[0]);
  });

  it("관계 이름 겹침(NEEDS_CHOICE) — 선택 창에서 [있는 컬럼 쓰기]를 누르면 REUSE 로 다시 보낸다", async () => {
    const ctx = fakeCtx();
    ctx.outcomes.push({
      ok: false,
      notice: notice({ code: "NEEDS_CHOICE", property: "onNameClash", choices: [{ parentColumn: "c-3", childColumn: "c-2", phys: "OBJECT_ID" }] }),
    });
    await mount(ctx);
    await press({ key: "4", code: "Digit4" });
    await act(async () => {
      editing.flowProps.onConnect!({ source: "t-2", target: "t-1", sourceHandle: "pick", targetHandle: "pick" });
    });
    await flush();
    expect(ctx.applied[0].commands[0]).toMatchObject({ op: "addRelation", child: "t-1", parent: "t-2", identifying: false, onNameClash: "ASK" });
    expect(document.querySelector('[data-testid="erd-clash"]')?.textContent).toContain("OBJECT_ID");
    await click('[data-testid="erd-clash-reuse"]');
    expect(ctx.applied[1].commands[0]).toMatchObject({ op: "addRelation", child: "t-1", parent: "t-2", identifying: false, onNameClash: "REUSE" });
    expect(ctx.applied[1].label).toBe("비식별 관계 추가");
    expect(document.querySelector('[data-testid="erd-tool-select"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("자기 자신으로는 잇지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    expect(editing.flowProps.isValidConnection!({ source: "t-1", target: "t-1", sourceHandle: null, targetHandle: null })).toBe(false);
    expect(editing.flowProps.isValidConnection!({ source: "t-2", target: "t-1", sourceHandle: null, targetHandle: null })).toBe(true);
  });

  it("표 도구 — 빈 곳을 누르면 새 표 창, [만들기]는 addTable·placeTables 한 묶음이고 새 표를 고른다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await press({ key: "2", code: "Digit2" });
    await act(async () => {
      editing.flowProps.onPaneClick!(new MouseEvent("click", { clientX: 123, clientY: 47 }) as unknown as React.MouseEvent);
    });
    await flush();
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-newtable-phys"]')!, "tb_new");
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-newtable-logical"]')!, "새 표");
    await click('[data-testid="erd-newtable-ok"]');
    const [add, place] = ctx.applied[0].commands as Array<Record<string, unknown>>;
    expect(add).toMatchObject({ op: "addTable", phys: "TB_NEW", logical: "새 표", comment: "" });
    expect(String(add.id)).toMatch(/^t-[0-9a-zA-Z-]{1,48}$/);
    expect(place).toMatchObject({ op: "placeTables", diagram: "d-all" });
    expect((place.nodes as Array<{ table: string; x: number; y: number }>)[0].table).toBe(add.id);
    expect(ctx.nav.selectTable).toHaveBeenCalledWith(add.id);
  });

  it("새 표 창은 같은 물리명을 막고, 서버 거절 문구를 창 안에 보인다", async () => {
    const ctx = fakeCtx();
    ctx.outcomes.push({ ok: false, notice: notice({ code: "INVALID", message: "Oracle 식별자 규칙에 맞지 않습니다: TB_X" }) });
    await mount(ctx);
    await press({ key: "2", code: "Digit2" });
    await act(async () => {
      editing.flowProps.onPaneClick!(new MouseEvent("click", { clientX: 10, clientY: 10 }) as unknown as React.MouseEvent);
    });
    await flush();
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-newtable-phys"]')!, "TB_MCM_SEC_MENU");
    expect(document.querySelector<HTMLButtonElement>('[data-testid="erd-newtable-ok"]')!.disabled).toBe(true);
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-newtable-phys"]')!, "TB_X");
    await click('[data-testid="erd-newtable-ok"]');
    expect(document.querySelector('[data-testid="erd-newtable-error"]')?.textContent).toBe("Oracle 식별자 규칙에 맞지 않습니다: TB_X");
  });

  it("[자동 배치]는 바뀐 표만 moveNodes 로 보낸다(부모 t-2 가 왼쪽)", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await click('[data-testid="erd-tool-layout"]');
    const cmd = ctx.applied[0].commands[0] as { op: string; nodes: { table: string; x: number }[] };
    expect(cmd.op).toBe("moveNodes");
    expect(cmd.nodes.find((n) => n.table === "t-2")?.x).toBe(0);
    expect(ctx.applied[0].label).toBe("자동 배치");
  });

  it("[키만] 접기는 고른 표에 setFold 를 보낸다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await click('[data-testid="erd-fold-KEYS"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "setFold", diagram: "d-all", tables: ["t-1"], foldMode: "KEYS" }], label: "키만 보이기" }]);
  });

  it("접속자 목록에 없는 Claude 세션의 작업 중 표시도 노드에 이름표(erd-tag-<세션>)로 그린다", async () => {
    const base = fakeCtx();
    const ctx = fakeCtx({
      state: { ...base.state, claims: [{ tableId: "t-2", session: "claude-b", userId: "erd-mcp-b", expiresAt: "2999-01-01T00:00:00Z" }] },
    });
    await mount(ctx);
    const tag = host.querySelector('[data-testid="erd-node-t-2"] [data-testid="erd-tag-claude-b"]');
    expect(tag?.getAttribute("data-source")).toBe("llm");
    expect(tag?.hasAttribute("data-claimed")).toBe(true);
    expect(tag?.textContent).toBe("claude-b · 작업 중");
  });

  it("decorateNodes — 대기 표는 erd-pending, 강조 칸의 표는 erd-hl, 같은 꾸밈이면 같은 객체", async () => {
    const ctx = fakeCtx({
      pendingIds: new Set(["t-2"]),
      highlight: { code: "CONFLICT", elementId: "c-1", property: "logical", message: "다른 세션이 먼저 바꾼 값입니다", mine: "x" },
    });
    await mount(ctx);
    const a = editing.decorateNodes(raw);
    expect(a.map((n) => n.className)).toEqual(["erd-hl", "erd-pending"]);
    const b = editing.decorateNodes(raw);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).toBe(a[1]);
  });
});
```

`src/frontend/m-mdm/tests/dma/erdEdit/diagram-wizard.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { DiagramTree } from "../../../pages/dma/erdEdit/panels/DiagramTree";
import { DiagramWizard } from "../../../pages/dma/erdEdit/panels/DiagramWizard";
import { flush, typeInto } from "../../dme/helpers/render";
import { deny, fakeCtx } from "./erd-canvas-fixtures";
import { menuModel, stateOf } from "./erd-fixtures";

let host: HTMLDivElement;
let root: Root | null = null;

async function render(node: ReturnType<typeof h>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, node));
  });
  await flush();
}

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`없는 요소: ${sel}`);
  return el;
};

async function click(sel: string) {
  await act(async () => {
    $<HTMLElement>(sel).click();
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("다이어그램 마법사", () => {
  it("이름 → 표 고르기 → 격자 배치로 [addDiagram, placeTables] 한 묶음을 보내고 새 다이어그램을 연다", async () => {
    const ctx = fakeCtx();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    await render(h(DiagramWizard, { open: true, ctx, onClose, onCreated }));
    expect($<HTMLButtonElement>('[data-testid="erd-wiz-next"]').disabled).toBe(true);
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-area"]'), "보안");
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-name"]'), "메뉴");
    await click('[data-testid="erd-wiz-next"]');
    await click('input[aria-label="TB_MCM_SEC_OBJ"]');
    expect($('[data-testid="erd-wiz-count"]').textContent).toBe("고른 표 1개");
    await click('[data-testid="erd-wiz-next"]');
    await click('input[type="radio"][value="grid"]');
    await click('[data-testid="erd-wiz-create"]');
    const [add, place] = ctx.applied[0].commands as Array<Record<string, unknown>>;
    expect(add).toMatchObject({ op: "addDiagram", areaName: "보안", diagramName: "메뉴", sortSeq: 1 });
    expect(String(add.id)).toMatch(/^d-[0-9a-zA-Z-]{1,48}$/);
    expect(place).toEqual({ op: "placeTables", diagram: add.id, nodes: [{ table: "t-2", x: 0, y: 0 }] });
    expect(ctx.applied[0].label).toBe("다이어그램 만들기");
    expect(onCreated).toHaveBeenCalledWith(add.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("같은 업무영역·이름이 있으면 다음으로 가지 못한다", async () => {
    const ctx = fakeCtx();
    await render(h(DiagramWizard, { open: true, ctx, onClose: vi.fn(), onCreated: vi.fn() }));
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-area"]'), "기본");
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-name"]'), "전체");
    expect($<HTMLButtonElement>('[data-testid="erd-wiz-next"]').disabled).toBe(true);
    expect($('[data-testid="erd-wiz-error"]').textContent).toContain("같은 이름");
  });

  it("[다이어그램에 없는 표만]은 놓이지 않은 표만 보인다", async () => {
    const ctx = fakeCtx({
      state: stateOf(menuModel(), {
        diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }],
        nodes: [{ diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE" }],
      }),
    });
    await render(h(DiagramWizard, { open: true, ctx, onClose: vi.fn(), onCreated: vi.fn() }));
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-area"]'), "보안");
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-name"]'), "새");
    await click('[data-testid="erd-wiz-next"]');
    expect(document.querySelectorAll('[data-testid="erd-wiz-row"]')).toHaveLength(2);
    await click('input[aria-label="다이어그램에 없는 표만"]');
    expect([...document.querySelectorAll('[data-testid="erd-wiz-row"]')].map((r) => r.getAttribute("data-table"))).toEqual(["t-2"]);
  });
});

describe("DiagramTree — 새 다이어그램 단추", () => {
  const props = (ctx: ErdEditContext | null) => ({
    state: ctx?.state ?? null, statuses: {}, activeDiagram: "d-all", onSelectDiagram: vi.fn(), onRevealTable: vi.fn(), findSeq: 0, ctx,
  });

  it("다이어그램 편집 권한이 없으면 막고 이유를 title 에 적는다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, diagram: deny("공동 편집자가 아닙니다.") } });
    await render(h(DiagramTree, props(ctx)));
    const b = $<HTMLButtonElement>('[data-testid="erd-diagram-new"]');
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("title")).toBe("공동 편집자가 아닙니다.");
  });

  it("모델을 읽기 전(ctx 없음)에는 막는다. 권한이 있으면 눌러 마법사를 연다", async () => {
    await render(h(DiagramTree, props(null)));
    expect($<HTMLButtonElement>('[data-testid="erd-diagram-new"]').disabled).toBe(true);
    act(() => root?.unmount());
    await render(h(DiagramTree, props(fakeCtx())));
    await click('[data-testid="erd-diagram-new"]');
    expect(document.querySelector('[data-testid="erd-wiz-area"]')).not.toBeNull();
  });
});
```

- [ ] **Step 11: 시험이 실패하는지 확인**

Run: `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-canvas-editing.test.ts tests/dma/erdEdit/diagram-wizard.test.ts`

Expected:
- `diagram-wizard` 파일 전체 FAIL — `Failed to resolve import "../../../pages/dma/erdEdit/panels/DiagramWizard"`.
- `erd-canvas-editing` 은 Task 9 빈 부품이라 시험마다 FAIL — 예: Delete 시험 `expected [] to deeply equal [ { commands: [ … ], label: '다이어그램에서 빼기' } ]`, 도구 시험 `Cannot read properties of null (reading 'getAttribute')`(빈 부품의 `toolbar` 는 null).

- [ ] **Step 12: 구현 — `canvas/erd-edit-styles.ts`**

화면 공통 스타일(`erd-styles.ts`·`page.tsx`)은 건드리지 않는다. 편집 부품이 자기 `<style href precedence>` 를 넣는다(Local-Rules §17, React 19 는 같은 href 를 한 번만 넣는다).

```ts
/**
 * 캔버스 편집 부품 스타일(단계 2 Task 13) — 도구 막대·대기·강조 노드·관계 손잡이·대화상자·마법사. 색은 의미 토큰만(§8).
 * ErdToolbar·DiagramWizard 가 <style href precedence> 로 넣는다. 화면 공통 스타일(erd-styles.ts)과 따로 두어 다른 레인과 겹치지 않게 한다.
 * xyflow 손잡이 규칙(.react-flow__handle)과 겨루는 규칙은 선택자를 한 단계 높인다.
 */
export const ERD_EDIT_STYLE_HREF = "dmes-erd-edit-canvas";

export const ERD_EDIT_CSS = `
.erd-toolbar { position: absolute; top: var(--spacing-sm); left: var(--spacing-sm); z-index: 5; display: flex; align-items: center; gap: 2px;
  padding: 2px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.erd-toolbar__sep { width: 1px; align-self: stretch; margin: 0 2px; background: var(--color-border); }
.react-flow__node.erd-pending .erd-node { opacity: 0.6; border-style: dashed; }
.react-flow__node.erd-hl .erd-node { border-color: var(--color-danger); box-shadow: 0 0 0 2px var(--color-danger-soft); }
.erd-node .react-flow__handle.erd-pick { position: absolute; top: 0; left: 0; width: 100%; height: 100%; min-width: 0; min-height: 0;
  transform: none; border: 0; border-radius: 0; background: transparent; opacity: 1; z-index: 4; cursor: crosshair; pointer-events: all; }
.erd-node .react-flow__handle.erd-pick:hover, .erd-node .react-flow__handle.erd-pick.connectingto,
.erd-node .react-flow__handle.erd-pick.connectingfrom { background: var(--color-primary-soft); opacity: 0.5; }
.erd-dialog__row { display: flex; flex-direction: column; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm); }
.erd-dialog__actions { display: flex; justify-content: flex-end; gap: var(--spacing-xs); }
.erd-dialog__list { margin: var(--spacing-xs) 0; padding-left: var(--spacing-lg); font-family: var(--font-family-mono); font-size: var(--font-size-sm); }
.erd-dialog__note { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-dialog__error { font-size: var(--font-size-sm); color: var(--color-danger); }
.erd-wizard__steps { display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); font-size: var(--font-size-sm); color: var(--color-text-muted); }
.erd-wizard__steps [data-current] { font-weight: 600; color: var(--color-text); }
.erd-wizard__tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-xs); }
.erd-wizard__list { max-height: 320px; overflow-y: auto; padding: var(--spacing-xs); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.erd-wizard__row { display: flex; align-items: center; gap: var(--spacing-xs); min-height: 24px; }
.erd-wizard__logical { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.erd-tree__actions { margin-bottom: var(--spacing-sm); }
`;
```

- [ ] **Step 13: 구현 — `canvas/ErdTableNode.tsx` 관계 손잡이**

```diff
 export const namesOnlySelector = (s: ReactFlowState): boolean => s.transform[2] < ZOOM_NAMES_ONLY;
 
+/** 관계 도구(4·5) 동안 노드 전체를 덮는 잇기 손잡이 id. 부모 표를 누르고 자식 표를 누르거나(connectOnClick), 부모에서 자식으로 끈다. */
+export const PICK_HANDLE = "pick";
+
 const NO_ROWS: ErdRowView[] = [];
```

```diff
-export const ErdTableNode = memo(function ErdTableNode({ id, data, selected }: NodeProps<ErdFlowNode>) {
+export const ErdTableNode = memo(function ErdTableNode({ id, data, selected, isConnectable }: NodeProps<ErdFlowNode>) {
```

```diff
     <div className="erd-node" data-testid={`erd-node-${id}`} data-selected={selected ? "" : undefined} data-names-only={namesOnly ? "" : undefined}>
+      {data.pickable && (
+        <Handle id={PICK_HANDLE} type="source" position={Position.Top} isConnectable={isConnectable}
+          className="erd-pick nodrag" data-testid={`erd-pick-${id}`} />
+      )}
       {!namesOnly && data.viewers.length > 0 && (
```

`canvas/PresenceTag.tsx` — 마감 확인이 이름표·작업 중 표시를 찾을 수 있게 testid 를 단다(나머지는 그대로).

```diff
     <span
       className="erd-viewer"
+      data-testid={`erd-tag-${viewer.session}`}
       data-source={viewer.source === "UI" ? "ui" : "llm"}
       data-claimed={viewer.claimed ? "" : undefined}
```

- [ ] **Step 14: 구현 — `canvas/ErdToolbar.tsx`**

```tsx
"use client";

/**
 * 캔버스 도구 막대(스펙 8절·시안) — 도구(선택 1·표 2·비식별 4·식별 5), 접기(모두·키만·이름만), 다이어그램에서 빼기, 모델에서 삭제, 자동 배치.
 * 단추는 shared ToolButton(아이콘 + CSS 툴팁)이다. 단추를 눌러도 초점이 캔버스에 남게 mousedown 을 막는다(Local-Rules §19).
 * 꺼진 단추의 툴팁에 이유를 적는다(S2-20 권한 문구).
 */
import type { ReactNode } from "react";

import { ToolButton, keepFocusOffButtons } from "@dk-oasis/shared/react-flow";
import {
  IconEyeOff, IconKey, IconLayoutList, IconLetterCase, IconLink, IconLinkPlus, IconPointer, IconSitemap, IconTablePlus, IconTrash,
} from "@tabler/icons-react";

import type { Right } from "../edit-context";
import type { ErdFoldMode } from "../types";
import { ERD_EDIT_CSS, ERD_EDIT_STYLE_HREF } from "./erd-edit-styles";
import { TOOL_KEY, deleteKeyLabel, type ErdTool } from "./erd-shortcuts";

export interface ErdToolbarProps {
  tool: ErdTool;
  mac: boolean;
  model: Right;
  diagram: Right;
  /** 고른 표 수. */
  selection: number;
  onTool(tool: ErdTool): void;
  onFold(mode: ErdFoldMode): void;
  onRemove(): void;
  onDelete(): void;
  onAutoLayout(): void;
}

const ICON = 16;

const TOOLS: readonly { tool: ErdTool; label: string; icon: ReactNode; model: boolean }[] = [
  { tool: "select", label: "선택", icon: <IconPointer size={ICON} />, model: false },
  { tool: "table", label: "표 추가", icon: <IconTablePlus size={ICON} />, model: true },
  { tool: "relation", label: "비식별 관계", icon: <IconLink size={ICON} />, model: true },
  { tool: "identifying", label: "식별 관계", icon: <IconLinkPlus size={ICON} />, model: true },
];

const FOLDS: readonly { mode: ErdFoldMode; label: string; icon: ReactNode }[] = [
  { mode: "NONE", label: "컬럼 모두 보이기", icon: <IconLayoutList size={ICON} /> },
  { mode: "KEYS", label: "키 컬럼만", icon: <IconKey size={ICON} /> },
  { mode: "NAME", label: "표 이름만", icon: <IconLetterCase size={ICON} /> },
];

/** 꺼진 단추 툴팁 — 할 일 + 이유. */
const tipOf = (label: string, r: Right | null, noSelection: boolean): string => {
  if (r && !r.ok) return `${label} — ${r.reason ?? "지금은 고칠 수 없습니다."}`;
  if (noSelection) return `${label} — 표를 먼저 고르세요`;
  return label;
};

export function ErdToolbar({ tool, mac, model, diagram, selection, onTool, onFold, onRemove, onDelete, onAutoLayout }: ErdToolbarProps) {
  const none = selection === 0;
  return (
    <div className="erd-toolbar nopan nodrag nowheel" role="toolbar" aria-label="캔버스 도구" data-testid="erd-toolbar" onMouseDown={keepFocusOffButtons}>
      <style href={ERD_EDIT_STYLE_HREF} precedence="default">
        {ERD_EDIT_CSS}
      </style>
      {TOOLS.map((t) => {
        const label = `${t.label} (${TOOL_KEY[t.tool]})`;
        const off = t.model && !model.ok;
        return (
          <ToolButton key={t.tool} label={label} tip={tipOf(label, t.model ? model : null, false)} icon={t.icon}
            variant={tool === t.tool ? "primary" : "default"} aria-pressed={tool === t.tool} disabled={off}
            data-testid={`erd-tool-${t.tool}`} onClick={() => onTool(t.tool)} />
        );
      })}
      <span className="erd-toolbar__sep" />
      {FOLDS.map((f) => (
        <ToolButton key={f.mode} label={f.label} tip={tipOf(f.label, diagram, none)} icon={f.icon}
          disabled={!diagram.ok || none} data-testid={`erd-fold-${f.mode}`} onClick={() => onFold(f.mode)} />
      ))}
      <span className="erd-toolbar__sep" />
      <ToolButton label="다이어그램에서 빼기 (Delete)" tip={tipOf("다이어그램에서 빼기 (Delete)", diagram, none)} icon={<IconEyeOff size={ICON} />}
        disabled={!diagram.ok || none} data-testid="erd-tool-remove" onClick={onRemove} />
      <ToolButton label={`모델에서 삭제 (${deleteKeyLabel(mac)})`} tip={tipOf(`모델에서 삭제 (${deleteKeyLabel(mac)})`, model, none)}
        icon={<IconTrash size={ICON} />} disabled={!model.ok || none} data-testid="erd-tool-delete" onClick={onDelete} />
      <span className="erd-toolbar__sep" />
      <ToolButton label="자동 배치" tip={tipOf("자동 배치", diagram, false)} icon={<IconSitemap size={ICON} />} align="end"
        disabled={!diagram.ok} data-testid="erd-tool-layout" onClick={onAutoLayout} />
    </div>
  );
}
```

- [ ] **Step 15: 구현 — `canvas/RelationClashModal.tsx`, `canvas/CanvasDialogs.tsx`**

`canvas/RelationClashModal.tsx`:

```tsx
"use client";

/**
 * 관계 이름 겹침 선택 창(스펙 4.1 addRelation onNameClash, 조사 A E6). 서버가 NEEDS_CHOICE 로 겹친 컬럼을 주면 띄운다.
 * 고르는 단위는 관계 전체다(컬럼별로 따로 고르지 못한다 — 서버 규칙). REUSE 는 그 컬럼을 자식 컬럼으로 쓰고, RENAME 은 부모 접두를 붙여 새로 만든다.
 */
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { ClashChoice } from "./erd-commands";

export interface RelationClashModalProps {
  open: boolean;
  /** 부모·자식 표 물리명. */
  parent: string;
  child: string;
  choices: readonly ClashChoice[];
  onPick(mode: "REUSE" | "RENAME"): void;
  onClose(): void;
}

export function RelationClashModal({ open, parent, child, choices, onPick, onClose }: RelationClashModalProps) {
  return (
    <Modal
      open={open}
      title="같은 이름의 컬럼"
      size="md"
      onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-clash-cancel" onClick={onClose}>취소</Button>
          <Button data-testid="erd-clash-rename" onClick={() => onPick("RENAME")}>새 컬럼 만들기</Button>
          <Button variant="primary" data-testid="erd-clash-reuse" onClick={() => onPick("REUSE")}>있는 컬럼 쓰기</Button>
        </div>
      }
    >
      <div data-testid="erd-clash">
        <p>
          자식 표 <span className="erd-mono">{child}</span> 에 부모 표 <span className="erd-mono">{parent}</span> 의 기본키와 같은 이름의 컬럼이 있습니다.
        </p>
        <ul className="erd-dialog__list">
          {choices.map((c) => (
            <li key={c.childColumn}>{c.phys}</li>
          ))}
        </ul>
        <p className="erd-dialog__note">
          [있는 컬럼 쓰기]는 그 컬럼을 관계의 자식 컬럼으로 씁니다. [새 컬럼 만들기]는 부모 표 접두를 붙인 컬럼을 새로 만듭니다. 고른 방식은 이 관계의 모든 컬럼에 같이 쓰입니다.
        </p>
      </div>
    </Modal>
  );
}
```

`canvas/CanvasDialogs.tsx`:

```tsx
"use client";

/** 캔버스 대화상자 — 모델에서 표 삭제 확인(Alt+Delete), 새 표(도구 2). shared Modal·form 을 쓴다. */
import { useEffect, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { ErdModelJson } from "../types";
import { tablePhysError } from "./erd-commands";

/** 확인 창에 이름을 적는 표 수. 나머지는 "외 n개". */
const SHOWN = 10;

export interface DeleteTablesModalProps {
  open: boolean;
  /** 지울 표 물리명. */
  names: readonly string[];
  undoKey: string;
  onConfirm(): void;
  onClose(): void;
}

export function DeleteTablesModal({ open, names, undoKey, onConfirm, onClose }: DeleteTablesModalProps) {
  return (
    <Modal
      open={open}
      title="모델에서 표 삭제"
      size="sm"
      onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-delete-cancel" onClick={onClose}>취소</Button>
          <Button variant="danger" data-testid="erd-delete-ok" onClick={onConfirm}>삭제</Button>
        </div>
      }
    >
      <div data-testid="erd-delete-confirm">
        <p>{names.length > 1 ? `표 ${names.length}개를` : "이 표를"} 모델에서 지웁니다. 컬럼·키와 이 표에 걸린 관계도 함께 지워지고, 어느 다이어그램에도 보이지 않습니다.</p>
        <ul className="erd-dialog__list">
          {names.slice(0, SHOWN).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {names.length > SHOWN && <p>외 {names.length - SHOWN}개</p>}
        <p className="erd-dialog__note">{undoKey} 또는 변경 기록의 [되돌리기]로 한 번에 되살릴 수 있습니다.</p>
      </div>
    </Modal>
  );
}

export interface NewTableModalProps {
  open: boolean;
  model: ErdModelJson;
  /** 만들기. 거절이면 창에 보일 문구, 받아들이면 null. */
  onSubmit(phys: string, logical: string): Promise<string | null>;
  onClose(): void;
}

export function NewTableModal({ open, model, onSubmit, onClose }: NewTableModalProps) {
  const [phys, setPhys] = useState("");
  const [logical, setLogical] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhys("");
    setLogical("");
    setServerError(null);
    setBusy(false);
  }, [open]);

  const localError = phys ? tablePhysError(model, phys) : null;
  const blocked = !phys || localError !== null || busy;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      setServerError(await onSubmit(phys, logical.trim()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="새 표"
      size="sm"
      onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-newtable-cancel" onClick={onClose}>취소</Button>
          <Button variant="primary" data-testid="erd-newtable-ok" disabled={blocked} onClick={() => void submit()}>만들기</Button>
        </div>
      }
    >
      <div className="erd-dialog__row">
        <label htmlFor="erd-newtable-phys">물리명</label>
        <Input id="erd-newtable-phys" data-testid="erd-newtable-phys" value={phys} autoFocus
          onChange={(v) => {
            setPhys(v.toUpperCase());
            setServerError(null);
          }}
          error={localError ?? undefined} />
      </div>
      <div className="erd-dialog__row">
        <label htmlFor="erd-newtable-logical">논리명</label>
        <Input id="erd-newtable-logical" data-testid="erd-newtable-logical" value={logical} onChange={setLogical}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }} />
      </div>
      {serverError && (
        <div className="erd-dialog__error" role="alert" data-testid="erd-newtable-error">
          {serverError}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 16: 구현 — `canvas/useCanvasEditing.ts`(빈 부품을 바꾼다)**

Task 9 의 `CanvasEditing` 모양은 그대로 둔다. 파일 전체를 아래로 바꾼다.

```tsx
"use client";

/**
 * 캔버스 편집(단계 2 Task 13) — 끌기 → moveNodes, 표 추가(도구 2), 관계 도구(4 비식별·5 식별) + 이름 겹침 창, Delete(다이어그램에서 빼기)·
 * Alt+Delete(모델에서 삭제), 접기, 자동 배치, 우클릭 메뉴, 부모·자식 표(Ctrl/⌘+↑↓·Alt+↑↓), 표 찾기(Ctrl/⌘+F), 이름표 만료.
 * ErdViewer 의 CanvasPane(ReactFlowProvider 안)이 부른다(README "화면 내부 계약"). rf 는 CanvasPane 의 useReactFlow() 값이다.
 * - 쓰기는 모두 ctx.apply 로 보낸다. 거절 알림·칸 강조는 apply 가 올린다. 여기서는 NEEDS_CHOICE(onNameClash)만 받아 선택 창을 띄운다.
 * - 권한(S2-20): addTable·addRelation·deleteTable 은 rights.model, 다이어그램 명령은 rights.diagram.
 * - 키(S2-27): 캔버스 host 의 onKeyDown 에서만 받는다. 입력 칸·대화상자 안 키는 넘긴다. Ctrl/⌘+Z·T·K·O·F3 은 ErdViewer 의 window 캡처가 받는다.
 * - 끄는 동안 위치는 덮개(drag)에만 둔다. 놓으면 moveNodes 를 한 번 보내고 응답이 오면 덮개를 지운다(스펙 4.4).
 * - 응답을 기다리는 동안 모델이 바뀌었으면 창을 띄우지 않는다(Local-Rules §37).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  ConnectionMode, ContextMenu, UNHANDLED, dispatchShortcut, isMacPlatform, useStore, useStoreApi,
  type Connection, type MenuItem, type NodeChange, type ReactFlowInstance, type ReactFlowProps, type ShortcutHandlers, type XYPosition,
} from "@dk-oasis/shared/react-flow";

import type { ApplyOutcome, ErdEditContext, Right } from "../edit-context";
import type { ErdCommandJson, ErdFoldMode } from "../types";
import { DeleteTablesModal, NewTableModal } from "./CanvasDialogs";
import { ErdToolbar } from "./ErdToolbar";
import {
  MAX_BATCH, addRelationCommand, addTableCommands, deleteTablesCommands, moveNodesCommand, newElementId, nextNeighbor, parseClashChoices,
  removeFromDiagramCommand, setFoldCommand, tableOfElement, type ClashChoice, type NameClashMode,
} from "./erd-commands";
import { nextExpiry, viewersAt, type ErdFlowEdge, type ErdFlowNode } from "./erd-flow";
import { NODE_WIDTH, nodeHeight } from "./erd-geometry";
import { autoLayoutCommand } from "./erd-layout";
import { ERD_CANVAS_SHORTCUTS, deleteKeyLabel, undoKeyLabel, type ErdCanvasKey, type ErdTool } from "./erd-shortcuts";
import { RelationClashModal } from "./RelationClashModal";

type FlowProps = ReactFlowProps<ErdFlowNode, ErdFlowEdge>;

export interface CanvasEditing {
  flowProps: Pick<FlowProps, "nodesDraggable" | "nodesConnectable" | "deleteKeyCode" | "onNodeDragStop" | "onConnect" | "isValidConnection"
    | "connectionMode" | "onPaneClick" | "onNodeContextMenu" | "onPaneContextMenu" | "snapToGrid" | "snapGrid">;
  onNodesChange(changes: NodeChange<ErdFlowNode>[]): void;
  decorateNodes(nodes: ErdFlowNode[]): ErdFlowNode[];
  onKeyDown(e: KeyboardEvent): void;
  toolbar: ReactNode;
  overlay: ReactNode;
}

/** 끌기·새 표 자리 격자(px). */
export const SNAP_GRID: [number, number] = [10, 10];

const NO_DRAG: ReadonlyMap<string, XYPosition> = new Map();
const NO_ITEMS: MenuItem[] = [];
const NO_CHOICES: ClashChoice[] = [];
const FOLD_LABEL: Readonly<Record<ErdFoldMode, string>> = { NONE: "접기 풀기", KEYS: "키만 보이기", NAME: "이름만 보이기" };

interface ClashState {
  parent: string;
  child: string;
  identifying: boolean;
  choices: ClashChoice[];
}

interface MenuState {
  at: { x: number; y: number };
  items: MenuItem[];
}

/** 포털로 뜬 대화상자 안에서 올라온 키(React 트리로는 host 아래다)는 캔버스 키가 아니다. */
const inDialog = (t: EventTarget | null): boolean => !!(t as Element | null)?.closest?.('[role="dialog"]');

export function useCanvasEditing(ctx: ErdEditContext, rf: ReactFlowInstance<ErdFlowNode, ErdFlowEdge>): CanvasEditing {
  const storeApi = useStoreApi<ErdFlowNode, ErdFlowEdge>();
  const mac = useMemo(() => isMacPlatform(), []);
  const [tool, setTool] = useState<ErdTool>("select");
  const [drag, setDrag] = useState<ReadonlyMap<string, XYPosition>>(NO_DRAG);
  const [clash, setClash] = useState<ClashState | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [newTableAt, setNewTableAt] = useState<XYPosition | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const selection = useStore((s) => s.nodes.reduce((k, n) => (n.selected ? k + 1 : k), 0));

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const dragRef = useRef(drag);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  const canModel = ctx.rights.model.ok;
  const canDiagram = ctx.rights.diagram.ok;
  const relationTool = tool === "relation" || tool === "identifying";

  // 모델 편집 권한이 사라지면(연결 끊김·남의 확정 등) 그리는 도구를 선택 도구로 돌린다.
  useEffect(() => {
    if (!canModel) setTool("select");
  }, [canModel]);

  // 이름표 만료(S2-26) — 가장 이른 만료 시각에 시계를 올려 decorateNodes 가 지난 이름표를 거르게 한다.
  useEffect(() => {
    const next = nextExpiry(ctx.state, clock);
    if (next === null) return;
    const t = setTimeout(() => setClock(Date.now()), Math.max(0, next - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [ctx.state, clock]);

  const deny = useCallback((r: Right) => {
    ctxRef.current.notify(r.reason ?? "지금은 고칠 수 없습니다.", "warn");
  }, []);

  const selectedIds = useCallback((): string[] => storeApi.getState().nodes.filter((n) => n.selected).map((n) => n.id), [storeApi]);

  /** 대화상자가 닫힌 뒤 초점을 캔버스 host 로 돌린다(지운 노드에서 body 로 빠지면 단축키가 끊긴다, Local-Rules §19). */
  const focusHost = useCallback(() => {
    storeApi.getState().domNode?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
  }, [storeApi]);

  /** apply 를 부르고, 시작한 모델이 응답 때도 그대로인지 함께 돌려준다(§37). */
  const send = useCallback(async (commands: ErdCommandJson[], label: string): Promise<{ out: ApplyOutcome; current: boolean }> => {
    const start = ctxRef.current.modelId;
    const out = await ctxRef.current.apply(commands, label);
    return { out, current: ctxRef.current.modelId === start };
  }, []);

  const chooseTool = useCallback((t: ErdTool) => {
    const rights = ctxRef.current.rights;
    if (t !== "select" && !rights.model.ok) {
      deny(rights.model);
      return;
    }
    setTool(t);
    setMenu(null);
  }, [deny]);

  // ── 끌기 ──
  const onNodesChange = useCallback((changes: NodeChange<ErdFlowNode>[]) => {
    let next: Map<string, XYPosition> | null = null;
    for (const c of changes) {
      if (c.type !== "position" || !c.position) continue;
      next ??= new Map(dragRef.current);
      next.set(c.id, { x: c.position.x, y: c.position.y });
    }
    if (next) {
      dragRef.current = next;
      setDrag(next);
    }
  }, []);

  const clearDrag = useCallback((ids: readonly string[]) => {
    const next = new Map(dragRef.current);
    for (const id of ids) next.delete(id);
    dragRef.current = next.size === 0 ? NO_DRAG : next;
    setDrag(dragRef.current);
  }, []);

  const onNodeDragStop = useCallback<NonNullable<FlowProps["onNodeDragStop"]>>((_e, _node, dragged) => {
    const c = ctxRef.current;
    const ids = dragged.map((n) => n.id);
    const cmd = c.diagramId
      ? moveNodesCommand(c.diagramId, dragged.map((n) => ({ table: n.id, ...(dragRef.current.get(n.id) ?? n.position) })), c.state.nodes)
      : null;
    if (!cmd) {
      clearDrag(ids);
      return;
    }
    void c.apply([cmd], ids.length > 1 ? `표 ${ids.length}개 옮기기` : "표 옮기기").finally(() => clearDrag(ids));
  }, [clearDrag]);

  // ── 관계 도구 ──
  const addRelation = useCallback(async (parent: string, child: string, identifying: boolean, mode: NameClashMode) => {
    const { out, current } = await send(
      [addRelationCommand({ id: newElementId("r"), parent, child, identifying, onNameClash: mode })],
      identifying ? "식별 관계 추가" : "비식별 관계 추가",
    );
    if (!current) return;
    if (out.ok) {
      setClash(null);
      setTool("select");
      return;
    }
    if (out.notice.code === "NEEDS_CHOICE" && out.notice.property === "onNameClash") {
      setClash({ parent, child, identifying, choices: parseClashChoices(out.notice.choices) });
      return;
    }
    setClash(null); // 다른 거절은 apply 가 알린다
  }, [send]);

  const onConnect = useCallback((conn: Connection) => {
    const t = toolRef.current;
    if (t !== "relation" && t !== "identifying") return;
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    // Loose 모드라 시작 손잡이가 부모, 끝 손잡이가 자식이다(부모 → 자식 순서로 누른다, 스펙 4.1).
    void addRelation(conn.source, conn.target, t === "identifying", "ASK");
  }, [addRelation]);

  const isValidConnection = useCallback((c: ErdFlowEdge | Connection): boolean => c.source !== c.target, []);

  // ── 빼기·삭제·접기·배치 ──
  const removeTables = useCallback((tables?: readonly string[]): boolean => {
    const c = ctxRef.current;
    const ids = tables ?? selectedIds();
    if (ids.length === 0 || !c.diagramId) return false;
    if (!c.rights.diagram.ok) {
      deny(c.rights.diagram);
      return true;
    }
    const cmd = removeFromDiagramCommand(c.diagramId, ids, c.state.nodes);
    if (cmd) void c.apply([cmd], "다이어그램에서 빼기");
    return true;
  }, [selectedIds, deny]);

  const askDelete = useCallback((tables?: readonly string[]): boolean => {
    const c = ctxRef.current;
    const ids = tables ?? selectedIds();
    if (ids.length === 0) return false;
    if (!c.rights.model.ok) {
      deny(c.rights.model);
      return true;
    }
    if (ids.length > MAX_BATCH) {
      c.notify(`한 번에 ${MAX_BATCH}개까지 지울 수 있습니다.`, "warn");
      return true;
    }
    setDeleting([...ids]);
    return true;
  }, [selectedIds, deny]);

  const confirmDelete = useCallback(async () => {
    const ids = deleting;
    if (!ids) return;
    setDeleting(null);
    await send(deleteTablesCommands(ids), ids.length > 1 ? `표 ${ids.length}개 삭제` : "표 삭제");
    focusHost();
  }, [deleting, send, focusHost]);

  const fold = useCallback((mode: ErdFoldMode, tables?: readonly string[]) => {
    const c = ctxRef.current;
    const ids = tables ?? selectedIds();
    if (!c.diagramId || ids.length === 0) return;
    if (!c.rights.diagram.ok) {
      deny(c.rights.diagram);
      return;
    }
    const cmd = setFoldCommand(c.diagramId, ids, mode, c.state.nodes);
    if (cmd) void c.apply([cmd], FOLD_LABEL[mode]);
  }, [selectedIds, deny]);

  const layout = useCallback(async () => {
    const c = ctxRef.current;
    if (!c.diagramId) return;
    if (!c.rights.diagram.ok) {
      deny(c.rights.diagram);
      return;
    }
    // 잰 크기를 쓴다. 화면 밖이라 그리지 않은 노드는 buildFlow 의 initialWidth·initialHeight 다.
    const measured = new Map(rf.getNodes().map((n) => [n.id, {
      width: n.measured?.width ?? n.initialWidth ?? NODE_WIDTH,
      height: n.measured?.height ?? n.initialHeight ?? nodeHeight(0, false),
    }] as const));
    const cmd = autoLayoutCommand(c.state, c.diagramId, measured);
    if (!cmd) {
      c.notify("이미 자동 배치대로 놓여 있습니다.", "info");
      return;
    }
    const { out, current } = await send([cmd], "자동 배치");
    if (!out.ok || !current) return;
    ctxRef.current.notify(`자동 배치했습니다. ${undoKeyLabel(mac)} 로 되돌릴 수 있습니다.`, "info");
    void rf.fitView({ includeHiddenNodes: true, padding: 0.1, maxZoom: 1, duration: 200 });
  }, [rf, send, deny, mac]);

  const goNeighbor = useCallback((dir: "parent" | "child", from?: string | null) => {
    const c = ctxRef.current;
    const start = from ?? c.selectedTableId;
    if (!start) return UNHANDLED;
    const next = nextNeighbor(c.state, start, dir, c.diagramId);
    if (next) c.nav.selectTable(next);
    else c.notify(dir === "parent" ? "부모 표가 없습니다." : "자식 표가 없습니다.", "info");
    return undefined;
  }, []);

  const escape = useCallback(() => {
    if (menuRef.current) {
      setMenu(null);
      return undefined;
    }
    if (toolRef.current !== "select") {
      setTool("select");
      return undefined;
    }
    if (selectedIds().length > 0) {
      storeApi.getState().unselectNodesAndEdges(); // select 변경으로 CanvasPane → ErdViewer 선택이 비워진다
      return undefined;
    }
    return UNHANDLED;
  }, [selectedIds, storeApi]);

  // ── 키 ──
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (inDialog(e.target)) return;
    const handlers: ShortcutHandlers<ErdCanvasKey> = {
      toolSelect: () => chooseTool("select"),
      toolTable: () => chooseTool("table"),
      toolRelation: () => chooseTool("relation"),
      toolIdentifying: () => chooseTool("identifying"),
      delete: () => (removeTables() ? undefined : UNHANDLED),
      deleteModel: () => (askDelete() ? undefined : UNHANDLED),
      parentTable: () => goNeighbor("parent"),
      childTable: () => goNeighbor("child"),
      escape,
      find: () => ctxRef.current.nav.openTableFind(),
    };
    dispatchShortcut(e, handlers, mac, ERD_CANVAS_SHORTCUTS);
  }, [chooseTool, removeTables, askDelete, goNeighbor, escape, mac]);

  // ── 누르기·우클릭 ──
  const onPaneClick = useCallback<NonNullable<FlowProps["onPaneClick"]>>((e) => {
    setMenu(null);
    if (toolRef.current !== "table") return;
    const rights = ctxRef.current.rights;
    if (!rights.model.ok) {
      deny(rights.model);
      return;
    }
    setNewTableAt(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [rf, deny]);

  const onNodeContextMenu = useCallback<NonNullable<FlowProps["onNodeContextMenu"]>>((e, node) => {
    e.preventDefault();
    const r = ctxRef.current.rights;
    const sel = selectedIds();
    const targets = sel.includes(node.id) ? sel : [node.id];
    if (!sel.includes(node.id)) storeApi.getState().addSelectedNodes([node.id]);
    const what = targets.length > 1 ? `표 ${targets.length}개` : "표";
    const off = (x: Right) => (x.ok ? {} : { disabled: true, title: x.reason ?? undefined });
    const items: MenuItem[] = [
      {
        id: "fold", label: "접기", children: [
          { id: "fold-none", label: "컬럼 모두 보이기", run: () => fold("NONE", targets), ...off(r.diagram) },
          { id: "fold-keys", label: "키 컬럼만", run: () => fold("KEYS", targets), ...off(r.diagram) },
          { id: "fold-name", label: "표 이름만", run: () => fold("NAME", targets), ...off(r.diagram) },
        ],
      },
      { id: "remove", label: `${what} 다이어그램에서 빼기 (Delete)`, run: () => void removeTables(targets), ...off(r.diagram) },
      { id: "delete", label: `${what} 모델에서 삭제 (${deleteKeyLabel(mac)})`, danger: true, run: () => void askDelete(targets), ...off(r.model) },
    ];
    if (targets.length === 1) {
      items.push(
        { id: "parent", label: "부모 표로", run: () => void goNeighbor("parent", node.id) },
        { id: "child", label: "자식 표로", run: () => void goNeighbor("child", node.id) },
      );
    }
    setMenu({ at: { x: e.clientX, y: e.clientY }, items });
  }, [selectedIds, storeApi, fold, removeTables, askDelete, goNeighbor, mac]);

  const onPaneContextMenu = useCallback<NonNullable<FlowProps["onPaneContextMenu"]>>((e) => {
    e.preventDefault();
    const r = ctxRef.current.rights;
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const off = (x: Right) => (x.ok ? {} : { disabled: true, title: x.reason ?? undefined });
    setMenu({
      at: { x: e.clientX, y: e.clientY },
      items: [
        { id: "add-table", label: "여기에 표 추가", run: () => setNewTableAt(at), ...off(r.model) },
        { id: "layout", label: "자동 배치", run: () => void layout(), ...off(r.diagram) },
      ],
    });
  }, [rf, layout]);

  // ── 새 표 ──
  const submitNewTable = useCallback(async (phys: string, logical: string): Promise<string | null> => {
    const c = ctxRef.current;
    const at = newTableAt;
    if (!c.diagramId || !at) return null;
    const id = newElementId("t");
    const { out, current } = await send(addTableCommands({ id, diagram: c.diagramId, phys, logical, at }), "표 추가");
    if (!current) return null;
    if (!out.ok) return out.notice.message;
    setNewTableAt(null);
    setTool("select");
    ctxRef.current.nav.selectTable(id);
    return null;
  }, [newTableAt, send]);

  // ── 꾸미기(Local-Rules §19 — 바뀌지 않은 노드는 같은 참조, 같은 꾸밈이면 지난번 객체) ──
  const cache = useRef(new WeakMap<ErdFlowNode, { key: string; out: ErdFlowNode }>());
  const hlTable = ctx.highlight ? tableOfElement(ctx.state.model, ctx.highlight.elementId) : null;
  const pickable = relationTool && canModel;
  const pendingIds = ctx.pendingIds;
  const decorateNodes = useCallback((nodes: ErdFlowNode[]): ErdFlowNode[] => {
    let changed = false;
    const out = nodes.map((n) => {
      const pos = drag.get(n.id);
      const viewers = viewersAt(n.data.viewers, clock);
      const pending = pendingIds.has(n.id); // pendingIds 키는 요소 id 다. 다이어그램 명령의 노드도 표 id 로 든다(README "pendingIds 키")
      const cls = [pending ? "erd-pending" : "", hlTable === n.id ? "erd-hl" : ""].filter(Boolean).join(" ");
      if (!pos && viewers === n.data.viewers && !cls && !pickable) return n;
      changed = true;
      const key = `${pos ? `${pos.x},${pos.y}` : "-"}|${viewers.map((v) => `${v.session}${v.claimed ? "*" : ""}`).join(",")}|${cls}|${pickable ? 1 : 0}`;
      const hit = cache.current.get(n);
      if (hit?.key === key) return hit.out;
      const data = viewers !== n.data.viewers || pickable ? { ...n.data, viewers, ...(pickable ? { pickable: true } : {}) } : n.data;
      const d: ErdFlowNode = { ...n, ...(pos ? { position: pos } : {}), ...(cls ? { className: cls } : {}), data };
      cache.current.set(n, { key, out: d });
      return d;
    });
    return changed ? out : nodes;
  }, [drag, clock, pendingIds, hlTable, pickable]);

  const flowProps = useMemo<CanvasEditing["flowProps"]>(() => ({
    nodesDraggable: canDiagram && tool === "select",
    nodesConnectable: canModel && relationTool,
    deleteKeyCode: null,
    connectionMode: ConnectionMode.Loose,
    isValidConnection, onConnect, onNodeDragStop, onPaneClick, onNodeContextMenu, onPaneContextMenu,
    snapToGrid: true, snapGrid: SNAP_GRID,
  }), [canDiagram, canModel, tool, relationTool, isValidConnection, onConnect, onNodeDragStop, onPaneClick, onNodeContextMenu, onPaneContextMenu]);

  const phys = (id: string): string => ctx.state.model.tables[id]?.phys ?? id;

  const toolbar = (
    <ErdToolbar tool={tool} mac={mac} model={ctx.rights.model} diagram={ctx.rights.diagram} selection={selection}
      onTool={chooseTool} onFold={(m) => fold(m)} onRemove={() => void removeTables()} onDelete={() => void askDelete()}
      onAutoLayout={() => void layout()} />
  );

  const overlay = (
    <>
      <ContextMenu items={menu?.items ?? NO_ITEMS} at={menu?.at ?? null} onClose={() => setMenu(null)} testId="erd-menu" />
      <RelationClashModal open={clash !== null} parent={clash ? phys(clash.parent) : ""} child={clash ? phys(clash.child) : ""}
        choices={clash?.choices ?? NO_CHOICES}
        onPick={(mode) => {
          if (clash) void addRelation(clash.parent, clash.child, clash.identifying, mode);
        }}
        onClose={() => setClash(null)} />
      <DeleteTablesModal open={deleting !== null} names={(deleting ?? []).map(phys)} undoKey={undoKeyLabel(mac)}
        onConfirm={() => void confirmDelete()} onClose={() => setDeleting(null)} />
      <NewTableModal open={newTableAt !== null} model={ctx.state.model} onSubmit={submitNewTable} onClose={() => setNewTableAt(null)} />
    </>
  );

  return { flowProps, onNodesChange, decorateNodes, onKeyDown, toolbar, overlay };
}
```

- [ ] **Step 17: 구현 — `panels/DiagramWizard.tsx`, `panels/DiagramTree.tsx`**

`panels/DiagramWizard.tsx`:

```tsx
"use client";

/**
 * 다이어그램 만들기 마법사(스펙 8절 "다이어그램 생성 마법사", 단계 1 README 의 단계 2 할 일) — 1) 업무영역·이름 2) 표 고르기 3) 배치 방식.
 * 한 묶음 [addDiagram, placeTables] 로 보낸다(같은 묶음의 뒤 명령이 앞 명령이 만든 id 를 쓴다, 단계 0 Review Focus 1).
 * 다이어그램 명령이라 rights.diagram 을 본다(S2-20). 거절은 ctx.apply 가 알리고 창은 열어 둔다.
 */
import { useEffect, useMemo, useState } from "react";

import { Button, Checkbox, Input, Radio } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { newElementId, nextSortSeq, wizardCommands } from "../canvas/erd-commands";
import { ERD_EDIT_CSS, ERD_EDIT_STYLE_HREF } from "../canvas/erd-edit-styles";
import { wizardPlacement, type WizardLayout } from "../canvas/erd-layout";
import type { ErdEditContext } from "../edit-context";

type Step = 1 | 2 | 3;

const STEPS: readonly { step: Step; label: string }[] = [
  { step: 1, label: "1. 이름" },
  { step: 2, label: "2. 표 고르기" },
  { step: 3, label: "3. 배치" },
];

const LAYOUTS = [
  { value: "auto", label: "자동 배치 — 관계를 따라 부모를 왼쪽에 둔다" },
  { value: "grid", label: "격자 — 물리명 순으로 줄지어 둔다" },
];

export interface DiagramWizardProps {
  open: boolean;
  ctx: ErdEditContext;
  onClose(): void;
  /** 만든 뒤 그 다이어그램을 연다. */
  onCreated(diagramId: string): void;
}

export function DiagramWizard({ open, ctx, onClose, onCreated }: DiagramWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [area, setArea] = useState("");
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [onlyUnplaced, setOnlyUnplaced] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [layout, setLayout] = useState<WizardLayout>("auto");
  const [busy, setBusy] = useState(false);

  const model = ctx.state.model;
  const currentArea = ctx.diagramId ? ctx.state.diagrams[ctx.diagramId]?.areaName ?? "" : "";

  // 열 때마다 처음부터. 업무영역은 지금 보는 다이어그램의 것을 미리 넣는다.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setArea(currentArea);
    setName("");
    setFilter("");
    setOnlyUnplaced(false);
    setPicked(new Set());
    setLayout("auto");
    setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- 여는 순간의 업무영역만 쓴다

  const placed = useMemo(() => new Set(Object.values(ctx.state.nodes).map((n) => n.table)), [ctx.state.nodes]);
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.entries(model.tables)
      .filter(([id, t]) => (!onlyUnplaced || !placed.has(id)) && (!q || t.phys.toLowerCase().includes(q) || t.logical.toLowerCase().includes(q)))
      .sort(([, a], [, b]) => a.phys.localeCompare(b.phys));
  }, [model.tables, filter, onlyUnplaced, placed]);

  const a = area.trim();
  const n = name.trim();
  const nameError = !a || !n
    ? "업무영역과 이름을 넣으세요."
    : Object.values(ctx.state.diagrams).some((d) => d.areaName === a && d.diagramName === n)
      ? "같은 업무영역에 같은 이름의 다이어그램이 있습니다."
      : null;
  const rightError = ctx.rights.diagram.ok ? null : ctx.rights.diagram.reason ?? "지금은 고칠 수 없습니다.";

  const toggle = (id: string, on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const create = async () => {
    if (busy || nameError || rightError) return;
    setBusy(true);
    try {
      const id = newElementId("d");
      const nodes = wizardPlacement(model, [...picked], layout);
      const out = await ctx.apply(wizardCommands({ id, areaName: a, diagramName: n, sortSeq: nextSortSeq(ctx.state.diagrams), nodes }), "다이어그램 만들기");
      if (out.ok) {
        onCreated(id);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <div className="erd-dialog__actions">
      {step === 1 ? (
        <Button data-testid="erd-wiz-cancel" onClick={onClose}>취소</Button>
      ) : (
        <Button data-testid="erd-wiz-prev" onClick={() => setStep((s) => (s - 1) as Step)}>이전</Button>
      )}
      {step < 3 ? (
        <Button variant="primary" data-testid="erd-wiz-next" disabled={nameError !== null} onClick={() => setStep((s) => (s + 1) as Step)}>다음</Button>
      ) : (
        <Button variant="primary" data-testid="erd-wiz-create" disabled={busy || rightError !== null} onClick={() => void create()}>만들기</Button>
      )}
    </div>
  );

  return (
    <Modal open={open} title="새 다이어그램" size="lg" onClose={onClose} footer={footer}>
      <style href={ERD_EDIT_STYLE_HREF} precedence="default">
        {ERD_EDIT_CSS}
      </style>
      <div className="erd-wizard__steps" data-testid="erd-wiz">
        {STEPS.map((s) => (
          <span key={s.step} data-current={s.step === step ? "" : undefined}>{s.label}</span>
        ))}
      </div>
      {rightError && <div className="erd-dialog__error" role="alert">{rightError}</div>}
      {step === 1 && (
        <>
          <div className="erd-dialog__row">
            <label htmlFor="erd-wiz-area">업무영역</label>
            <Input id="erd-wiz-area" data-testid="erd-wiz-area" value={area} onChange={setArea} autoFocus />
          </div>
          <div className="erd-dialog__row">
            <label htmlFor="erd-wiz-name">다이어그램 이름</label>
            <Input id="erd-wiz-name" data-testid="erd-wiz-name" value={name} onChange={setName} />
          </div>
          {nameError && (a || n) && <div className="erd-dialog__error" data-testid="erd-wiz-error">{nameError}</div>}
        </>
      )}
      {step === 2 && (
        <>
          <div className="erd-wizard__tools">
            <Input data-testid="erd-wiz-filter" placeholder="물리명·논리명으로 거르기" value={filter} onChange={setFilter} />
            <Checkbox aria-label="다이어그램에 없는 표만" label="다이어그램에 없는 표만" checked={onlyUnplaced} onChange={setOnlyUnplaced} />
            <Button size="sm" data-testid="erd-wiz-all" onClick={() => setPicked((cur) => new Set([...cur, ...rows.map(([id]) => id)]))}>보이는 표 모두 고르기</Button>
            <Button size="sm" data-testid="erd-wiz-none" onClick={() => setPicked(new Set())}>모두 풀기</Button>
            <span data-testid="erd-wiz-count">고른 표 {picked.size}개</span>
          </div>
          <div className="erd-wizard__list">
            {rows.map(([id, t]) => (
              <div key={id} className="erd-wizard__row" data-testid="erd-wiz-row" data-table={id}>
                <Checkbox aria-label={t.phys} label={t.phys} checked={picked.has(id)} onChange={(on) => toggle(id, on)} />
                <span className="erd-wizard__logical">{t.logical}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <Radio name="erd-wiz-layout" aria-label="배치 방식" value={layout} options={LAYOUTS} onChange={(v) => setLayout(v as WizardLayout)} />
          <p className="erd-dialog__note">
            {a} / {n} 에 표 {picked.size}개를 놓습니다. 만든 뒤에도 끌어서 옮기거나 [자동 배치]로 다시 놓을 수 있습니다.
          </p>
        </>
      )}
    </Modal>
  );
}
```

`panels/DiagramTree.tsx` 전체를 아래로 바꾼다. 단계 1 동작(목록·찾기·놓이지 않은 표 수·범례)은 그대로이고, `ctx`·[새 다이어그램]·찾기 단추 글만 더한다.

```tsx
"use client";

/**
 * 왼쪽 패널(스펙 2.2) — 업무영역 → 다이어그램 목록(표 수·위반 수), 다이어그램에 없는 표 수, 표 찾기(물리명·논리명·주석),
 * [새 다이어그램](마법사, 단계 2). 찾기는 shared FindWidget 을 쓴다. 다음·이전으로 돌 때마다 그 표를 고르고 캔버스를 그 표로 옮긴다(onRevealTable).
 * 표 찾기 키(Ctrl/⌘+T·K)는 ErdViewer 의 전역 키가 findSeq 를 올려 연다(S2-8·S2-27).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@dk-oasis/shared/form";
import {
  DEFAULT_FIND_OPTIONS, FindWidget, INVALID_FIND, compileFind, isMacPlatform, type FindOptions, type FindState,
} from "@dk-oasis/shared/react-flow";

import { BAD_STATUSES } from "../canvas/erd-flow";
import type { ErdEditContext } from "../edit-context";
import type { ErdColumnStatus, ErdDiagram, ErdState, ErdTable } from "../types";
import { DiagramWizard } from "./DiagramWizard";

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

export interface DiagramTreeProps {
  state: ErdState | null;
  statuses: Readonly<Record<string, ErdColumnStatus>>;
  activeDiagram: string | null;
  onSelectDiagram(diagramId: string): void;
  onRevealTable(tableId: string): void;
  /** 오를 때마다 찾기 칸을 연다(Ctrl/⌘+T·K). */
  findSeq: number;
  /** 편집 문맥(단계 2). 모델을 읽기 전에는 null — [새 다이어그램]을 막는다. */
  ctx: ErdEditContext | null;
}

export function DiagramTree({ state, statuses, activeDiagram, onSelectDiagram, onRevealTable, findSeq, ctx }: DiagramTreeProps) {
  const [openSeq, setOpenSeq] = useState(0); // 0 = 닫힘, 오를 때마다 입력 칸에 초점
  const [wizard, setWizard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mac = useMemo(() => isMacPlatform(), []);
  const find = useTableFind(state?.model.tables ?? NO_TABLES, onRevealTable);
  const groups = useMemo(() => (state ? diagramGroups(state, statuses) : []), [state, statuses]);
  const unplaced = useMemo(() => (state ? unplacedCount(state) : 0), [state]);
  const newOff = !ctx || !ctx.rights.diagram.ok;
  const newTitle = ctx && !ctx.rights.diagram.ok ? ctx.rights.diagram.reason ?? undefined : undefined;

  useEffect(() => {
    if (findSeq > 0) setOpenSeq((s) => s + 1);
  }, [findSeq]);

  return (
    <div className="erd-tree" data-testid="erd-tree">
      <div className="erd-tree__find">
        {openSeq > 0 ? (
          <FindWidget find={find} inputRef={inputRef} focusSeq={openSeq} onClose={() => setOpenSeq(0)} mac={mac}
            testId="erd-find" label="표 찾기" inputLabel="표 찾기 — 물리명·논리명·주석" placeholder="표 찾기" />
        ) : (
          <Button size="sm" data-testid="erd-find-open" disabled={!state} onClick={() => setOpenSeq((s) => s + 1)}>
            표 찾기 ({mac ? "⌘K" : "Ctrl+K"})
          </Button>
        )}
      </div>
      <div className="erd-tree__actions">
        <Button size="sm" data-testid="erd-diagram-new" disabled={newOff} title={newTitle} onClick={() => setWizard(true)}>
          새 다이어그램
        </Button>
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
          다이어그램에 없는 표 {unplaced}개 — [새 다이어그램]에서 놓을 수 있습니다
        </div>
      )}
      <div className="erd-tree__legend">
        <div>실선: DB FK·확정 관계</div>
        <div>노란 파선: 추정 관계(검토 대기)</div>
        <div>행 바탕: 붉은색 사전 없음, 노란색 타입·도메인 다름</div>
      </div>
      {ctx && <DiagramWizard open={wizard} ctx={ctx} onClose={() => setWizard(false)} onCreated={onSelectDiagram} />}
    </div>
  );
}
```

`page-render.test.ts`(단계 1)는 찾기 단추 글 `표 찾기 (Ctrl+T)` 를 보지 않는다. 확인: `grep -n "Ctrl+T" src/frontend/m-mdm/tests/dma/erdEdit/*.ts` 가 아무것도 찾지 않아야 한다. 찾으면 그 단언을 `Ctrl+K` 로 고친다(이 레인 소유 시험이다).

- [ ] **Step 18: 시험 통과 확인**

```bash
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/erd-canvas-editing.test.ts tests/dma/erdEdit/diagram-wizard.test.ts
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
pnpm --filter @dk-oasis/m-mdm lint
/usr/bin/git status --short -- m-mdm/pages/dma/erdEdit
```

Expected:
- 두 파일 PASS(실패 0). `tests/dma/erdEdit/` 전체 PASS — Task 9~11 시험과 단계 1 시험(`page-render`·`erd-canvas`·`panel-rows`·`erd-stream` 등)이 함께 통과한다.
- lint 오류 0.
- `git status` 는 이 Task 의 파일만 보인다: `canvas/{erd-commands,erd-shortcuts,erd-layout,erd-edit-styles}.ts`, `canvas/{ErdToolbar,RelationClashModal,CanvasDialogs}.tsx`, `canvas/useCanvasEditing.ts`, `canvas/erd-flow.ts`, `canvas/ErdTableNode.tsx`, `canvas/PresenceTag.tsx`, `panels/{DiagramTree,DiagramWizard}.tsx`. `ErdViewer.tsx`·`api.ts`·`types.ts`·`edit-context.ts`·`state/*`·`panels/TopBar.tsx`·`panels/ReviewPanel.tsx` 가 보이면 되돌린다(S2-19).
- `page-render` 가 실패하면 Task 9 의 `CanvasPane` 연결 문제인지 본다. `decorateNodes` 를 부르지 않거나 `flowProps` 를 펼치지 않으면 레인 보고에 적고 조정 세션을 거쳐 FE1 이 고친다. 이 레인은 `ErdViewer.tsx` 를 고치지 않는다.
- happy-dom 은 크기를 재지 않아 실제 끌기·잇기·자동 배치 뒤 화면 맞춤을 시험할 수 없다(조사 D 6절). 아래 확인 항목을 레인 보고에 적어 Task 16 브라우저 마감으로 넘긴다:
  1. 표를 끌어 놓으면 다른 창에 0.5~1초 안에 같은 자리로 옮겨진다. 끄는 동안 다른 창은 움직이지 않는다.
  2. 도구 4 로 부모 표를 누르고 자식 표를 누르면 관계가 생긴다. 끌어서도 생긴다. 이름 겹침 창이 뜨는 표 짝에서 [있는 컬럼 쓰기]가 동작한다.
  3. Alt+Delete(Mac ⌥⌫) 확인 창, Ctrl+Z 로 표·컬럼·관계가 모두 돌아온다.
  4. [자동 배치] 뒤 화면 맞춤이 모든 표를 보인다.
  5. Claude 세션이 `claimTable` 한 표에 "작업 중" 이름표가 서고, 10분 뒤(또는 `releaseTable` 뒤) 사라진다.
  6. Ctrl/⌘+↑·↓ 와 Alt+↑·↓ 가 부모·자식 표로 옮긴다(macOS 는 Alt).

- [ ] **Step 19: 커밋**

```bash
/usr/bin/git add m-mdm/pages/dma/erdEdit/canvas/erd-commands.ts m-mdm/pages/dma/erdEdit/canvas/erd-shortcuts.ts m-mdm/pages/dma/erdEdit/canvas/erd-layout.ts m-mdm/pages/dma/erdEdit/canvas/erd-edit-styles.ts
/usr/bin/git add m-mdm/pages/dma/erdEdit/canvas/ErdToolbar.tsx m-mdm/pages/dma/erdEdit/canvas/RelationClashModal.tsx m-mdm/pages/dma/erdEdit/canvas/CanvasDialogs.tsx m-mdm/pages/dma/erdEdit/canvas/useCanvasEditing.ts
/usr/bin/git add m-mdm/pages/dma/erdEdit/canvas/erd-flow.ts m-mdm/pages/dma/erdEdit/canvas/ErdTableNode.tsx m-mdm/pages/dma/erdEdit/canvas/PresenceTag.tsx m-mdm/pages/dma/erdEdit/panels/DiagramTree.tsx m-mdm/pages/dma/erdEdit/panels/DiagramWizard.tsx
/usr/bin/git add m-mdm/tests/dma/erdEdit/erd-canvas-fixtures.ts m-mdm/tests/dma/erdEdit/erd-canvas-commands.test.ts m-mdm/tests/dma/erdEdit/erd-canvas-editing.test.ts m-mdm/tests/dma/erdEdit/diagram-wizard.test.ts m-mdm/tests/dma/erdEdit/erd-flow.test.ts
/usr/bin/git commit -m "feat(mdm): ERD 단계 2 캔버스 편집 — 끌기·표 추가·관계 도구·삭제·접기·자동 배치·마법사·이름표

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r"
```

커밋 뒤 Step 18 의 브라우저 확인 항목과 Step 0·18 에서 찾은 FE1 계약 차이를 레인 보고에 적고, 조정 세션의 머지 허가를 기다린다.

## 계획 작성자 메모

- 마감 계획(07-close.md, Task 16)의 브라우저 확인은 Task 13 "`data-testid` 정본" 표의 이름(`erd-tool-relation`·`erd-tool-identifying`·`erd-tool-table`·`erd-tool-layout`·`erd-diagram-new`·`erd-wiz*`·`erd-clash*`·`erd-find*`·`erd-tag-<세션>`+`data-claimed` 등)을 써야 한다. 조정자 요청으로 표를 두었다. `PresenceTag.tsx` 에 `erd-tag-<세션>` testid 를 더했다(README 파일 구조에 Task 13 파일로 있다).
- README 파일 구조에 없는 파일을 `canvas/**`(FE2 소유) 안에 더했다: `erd-commands.ts`(명령 만들기·순수), `CanvasDialogs.tsx`(삭제 확인·새 표 창), `erd-edit-styles.ts`(편집 CSS). 시험 공용 `tests/dma/erdEdit/erd-canvas-fixtures.ts` 도 더했다.
- 편집 CSS 를 `erd-styles.ts`·`page.tsx` 에 넣지 않고 부품이 `<style href="dmes-erd-edit-canvas" precedence>` 로 넣게 했다. 화면 공통 스타일을 FE1·FE3 와 함께 고치다 겹치는 일을 피하려는 것이다.
- `CanvasEditing.flowProps` 에 `onNodeClick` 이 없어서, 관계 도구는 "누르기"를 React Flow 잇기(`connectOnClick`·`ConnectionMode.Loose`)로 한다. `decorateNodes` 가 `data.pickable` 을 실으면 `ErdTableNode` 가 노드 전체를 덮는 손잡이를 단다.
- FE1 `CanvasPane` 에 바라는 점: `decorateNodes` 를 `useStableById` 결과에 부르고, `editing.decorateNodes` 가 바뀌면 다시 계산한다(끌기 덮개·이름표 만료가 이것에 기댄다). host div 에 `tabIndex` 속성이 있어야 한다(`focusHost` 가 `closest("[tabindex]")` 로 찾는다). README 계약을 이렇게 읽었다.
- `buildFlow` 가 노드에 `draggable:false`·`connectable:false` 를 싣지 않게 바꿨다. 끌기·잇기는 `flowProps` 가 정한다. Task 9 빈 부품의 기본값(`nodesDraggable:false`, `nodesConnectable:false`)이 단계 1 동작을 지킨다. `ErdNodeViewer` 에 `until`·`claimUntil` 이 붙어 단계 1 `erd-flow.test.ts` 기대값 두 곳을 고쳤다.
- `DiagramTree` 의 `ctx` 를 `ErdEditContext | null` 로 넓혔다. 모델을 읽기 전에도 목록 패널을 그리기 때문이다. Task 9 가 `ErdEditContext` 로만 넘겨도 타입이 맞는다.
- `ctx.pendingIds` 에 표 id 와 `"다이어그램:표"` 키가 모두 올 수 있다고 보고 둘 다 봤다. 정합 검토에서 README 정본("pendingIds 키": 요소 id 만, 다이어그램 명령의 노드도 표 id)에 맞춰 표 id 만 보게 고쳤다.
- 캔버스 초점에서 Ctrl/⌘+F 를 표 찾기로 받는다(`CANVAS_SHORTCUTS.find`). README 키 목록에 없지만 Task 13 범위 "표 찾기 키"를 이렇게 읽었다. 그때는 브라우저의 페이지 찾기가 뜨지 않는다. 찾기 단추 글은 `표 찾기 (Ctrl+K)`(Mac `⌘K`)로 바꿨다(S2-8 의 Ctrl+T 대체 키).
- 자기 참조 관계는 관계 도구로 만들지 않는다(`isValidConnection`). MCP·CLI `addRelation` 으로는 만들 수 있다. 화면에서도 필요하면 deferred 새 행으로 둔다.
- 마법사는 같은 업무영역·이름의 다이어그램을 화면에서 막는다. 서버가 막는지는 확인하지 않았다(`ErdDiagramStore` 는 `requireName` 만 본다).
- Escape 로 선택을 풀 때 React Flow 저장소의 `unselectNodesAndEdges` 를 부른다. 이것이 select 변경으로 `CanvasPane` → `ErdViewer` 선택을 비운다. `CanvasPane` 이 select 변경을 처리한다는 README 계약에 기댄다.
- dist export 시험은 dist 가 없으면 건너뛴다(단계 1 `layout-context-boundary-dist` 선례). README 프런트 검증 순서는 shared 빌드가 먼저라 레인·마감에서는 돈다. dist 가 낡으면 실패한다.
- `ui_docs.mjs` 의 `GROUPS`·`EXPORT_FILES` 는 단계 1 에 이미 `react-flow` 가 있어 고치지 않는다(Global Constraints 의 "갱신"은 확인으로 갈음했다).
- Task 13 본문이 약 2,500줄로 브리프 상한(700줄)을 넘는다(Task 12 는 약 470줄). 키·도구·대화상자·마법사·시험의 전체 코드를 실었다. Task 경계는 README 대로 두었다.
