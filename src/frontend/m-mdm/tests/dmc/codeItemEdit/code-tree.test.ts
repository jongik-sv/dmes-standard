// TSK-06-03 design.md §4.8 — 수용 기준 4 「sql/04-hier-tree-sim.py 트리 결과와 일치」. 시뮬레이터 출력 전문(sim-fixtures)의
// 트리 블록과 buildCodeTree 결과를 같은 줄 모양으로 그려 글자 단위로 비교한다. 줄 모양(§1.4-1): 깊이마다 공백 3칸 +
// 마커 2글자(▸ 자식 있음 / · 코드 행 있음) + " " + 값 + (코드면 "  (" + 이름 + ")").
import { describe, expect, it } from "vitest";
import { buildCodeTree, toTreeItems, type CodeTreeNode } from "@/hier-tree";
import { ORG, STEEL_STD, simBlock } from "./sim-fixtures";

/** 시험 전용 출력기 — 제품 코드에 두지 않는다(§4.8). */
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

describe("buildCodeTree — 시뮬레이터 트리와 글자 단위 일치", () => {
  it("STEEL_STD 트리", () => {
    expect(toSimLines(buildCodeTree(STEEL_STD))).toEqual(strip(simBlock("STEEL_STD 트리")));
  });

  it("ORG 트리(05 표본) — 코드 행이 있는 노드를 seq 순으로 먼저 둔다", () => {
    const expected = simBlock("ORG 콤보·트리").filter((l) => !l.startsWith("  고른 값"));
    expect(toSimLines(buildCodeTree(ORG))).toEqual(strip(expected));
  });

  it("입력 순서가 달라도 결과는 같다", () => {
    expect(toSimLines(buildCodeTree([...STEEL_STD].reverse()))).toEqual(strip(simBlock("STEEL_STD 트리")));
  });

  it("계층을 쓰지 않으면 모든 코드가 한 단계에 seq 순으로 보인다", () => {
    const flat = [
      { code: "B", name: "비", seq: 2 },
      { code: "A", name: "에이", seq: 2 },
      { code: "C", name: "씨", seq: 1 },
    ];
    expect(buildCodeTree(flat).map((n) => n.value)).toEqual(["C", "A", "B"]);
  });
});

describe("toTreeItems", () => {
  it("코드 노드는 · 값 이름, 그룹 노드는 값 (n건) 라벨이다", () => {
    const items = toTreeItems(buildCodeTree(STEEL_STD));
    expect(items.map((i) => i.label)).toEqual(["JIS (2건)", "KS (6건)"]);
    const ks = items[1];
    expect(ks.children?.map((i) => i.label)).toEqual(["· KS-9 규격 외 KS", "KS-3 (5건)"]);
    const ks3 = ks.children?.[1];
    expect(ks3?.children?.map((i) => i.id)).toEqual(["KS-3-CGCC", "KS-3-CGCD", "KS-3-CGCH"]);
    expect(ks3?.children?.[2].label).toBe("· KS-3-CGCH CGCH(기본)");
  });
});
