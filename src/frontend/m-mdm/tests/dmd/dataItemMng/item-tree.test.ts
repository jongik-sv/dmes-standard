// TSK-07-04 design.md §3 「프론트엔드」 — 수용 기준 1 의 실제 검증. TSK-06-03 이 이미 시뮬레이터(sql/04-hier-tree-sim.py)와
// 대조해 둔 ORG 표본(tests/dmc/codeItemEdit/sim-fixtures.ts)을 그대로 가져와, dataItemMng 쪽 어댑터
// (`ItemTreePanel.toHierRows` — 서버 `DataItemRow[]` → `HierRow[]`)가 정확히 같은 필드(code/name/seq/lvl1~5)를
// 넘기는지, 그 결과로 `buildCodeTree`(이동 후 `@/hier-tree`, I8)가 code-tree.test.ts 와 같은 트리를 내는지 본다.
// 새 시뮬레이터 실행은 하지 않는다(design.md §3 — 알고리즘 자체는 이미 증명됐다).
import { describe, expect, it } from "vitest";
import { buildCodeTree, toTreeItems, type CodeTreeNode } from "@/hier-tree";
import { ORG, simBlock } from "../../dmc/codeItemEdit/sim-fixtures";
import { toHierRows } from "../../../pages/dmd/dataItemMng/ItemTreePanel";
import type { DataItemRow } from "../../../pages/dmd/dataItemMng/types";

/** ORG 표본을 서버 `DataItemRow` 모양(트리에 쓰지 않는 필드도 채운)으로 부풀린다 — 어댑터가 이 필드들을 드러내지 않고
 * code/name/seq/lvl1~5 만 뽑아내는지가 이 테스트의 핵심이다. */
function toDataItemRows(): DataItemRow[] {
  return ORG.map((r, i) => ({
    code: r.code,
    name: r.name ?? null,
    alterName: `약칭${i}`,
    seq: r.seq ?? null,
    description: "다른 필드",
    lvl1: r.lvl1 ?? null,
    lvl2: r.lvl2 ?? null,
    lvl3: r.lvl3 ?? null,
    lvl4: r.lvl4 ?? null,
    lvl5: r.lvl5 ?? null,
    attr01: "무관",
    attr02: null,
    attr03: null,
    attr04: null,
    attr05: null,
    attr06: null,
    attr07: null,
    attr08: null,
    attr09: null,
    attr10: null,
    validFrom: "2026-01-01 00:00:00",
    validTo: "9999-12-31 00:00:00",
    open: true,
    rowVersion: 0,
  }));
}

/** 시험 전용 출력기 — code-tree.test.ts 와 같은 줄 모양(§4.8). 제품 코드에 두지 않는다. */
function toSimLines(nodes: CodeTreeNode[], indent = ""): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const mark = (n.children.length > 0 ? "▸" : " ") + (n.isCode ? "·" : " ");
    out.push(`${indent}${mark} ${n.value}${n.isCode ? `  (${n.name})` : ""}`);
    out.push(...toSimLines(n.children, `${indent}   `));
  }
  return out;
}

const strip = (lines: string[]) => lines.map((l) => l.slice(2));

describe("toHierRows — 서버 DataItemRow[] → HierRow[] 어댑터", () => {
  it("code/name/seq/lvl1~5 만 넘기고 다른 필드는 드러내지 않는다", () => {
    const hierRows = toHierRows(toDataItemRows());
    expect(hierRows).toEqual(
      ORG.map((r) => ({
        code: r.code,
        name: r.name ?? null,
        seq: r.seq ?? null,
        lvl1: r.lvl1 ?? null,
        lvl2: r.lvl2 ?? null,
        lvl3: r.lvl3 ?? null,
        lvl4: r.lvl4 ?? null,
        lvl5: r.lvl5 ?? null,
      })),
    );
  });
});

describe("buildCodeTree(toHierRows(...)) — dataItemMng 트리도 ORG 시뮬레이터 결과와 글자 단위 일치(수용 기준 1)", () => {
  it("ORG 트리", () => {
    const expected = simBlock("ORG 콤보·트리").filter((l) => !l.startsWith("  고른 값"));
    const nodes = buildCodeTree(toHierRows(toDataItemRows()));
    expect(toSimLines(nodes)).toEqual(strip(expected));
    // buildCodeTree(ORG) 와도 같아야 한다 — 어댑터가 알고리즘 입력을 바꾸지 않았다는 직접 증명.
    expect(nodes).toEqual(buildCodeTree(ORG));
  });

  it("toTreeItems 로 그린 라벨도 code-tree.test.ts 와 같은 규칙(I8)이다", () => {
    const items = toTreeItems(buildCodeTree(toHierRows(toDataItemRows())));
    expect(items.map((i) => i.label)).toEqual(["HQ (1건)", "PH (4건)"]);
    const ph = items[1];
    expect(ph.children?.map((i) => i.label)).toEqual(["· PH-B B공장", "· PH-A A공장"]);
    const phA = ph.children?.[1];
    expect(phA?.children?.map((i) => i.label)).toEqual(["· PH-A-PRD A공장 생산팀", "· PH-A-MNT A공장 정비팀"]);
  });
});
