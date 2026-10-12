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

  it("placeIntoUsesStoredWidth — 대상의 표 너비를 키웠으면(§7.4 w) 그 오른쪽 + 80 에 놓는다", () => {
    const s = twoDiagrams();
    const state = { ...s, nodes: { ...s.nodes, "d-sub:t-1": { ...s.nodes["d-sub:t-1"], w: 600 } } };
    const plan = placeIntoCommand(state, "d-all", "d-sub", ["t-0"], false);
    expect(plan.command).toEqual({ op: "placeTables", diagram: "d-sub", nodes: [{ table: "t-0", x: 100 + 600 + 80, y: 50 }] });
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
