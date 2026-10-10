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
