import { describe, expect, it } from "vitest";

import { smoothStepPoints } from "@dk-oasis/shared/react-flow";

import {
  END_STUB, FACING_MIN_GAP, HANDLE_REACH, NODE_WIDTH, crowFootPath, endStub, liveEnds, nodeHeight, oneBarsPath, relationSides, typeText, zeroCirclePos,
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

  it("관계 변: 두 상자가 가로로 떨어져 있으면(빈 폭 8 초과) 마주 보는 변, 어느 쪽이 자식이든 같다", () => {
    expect(relationSides(0, 400, false)).toEqual({ child: "R", parent: "L" });
    expect(relationSides(400, 0, false)).toEqual({ child: "L", parent: "R" });
    expect(relationSides(-500, -100, false)).toEqual({ child: "R", parent: "L" });
    expect(relationSides(-100, -500, false)).toEqual({ child: "L", parent: "R" });
  });

  it("관계 변: 가로로 겹친(위아래로 쌓인) 두 상자는 같은 변(오른쪽)에 둘 다 붙는다 — x 가 같아도, 조금 달라도, 부모·자식 순서와 상관없다", () => {
    expect(relationSides(0, 0, false)).toEqual({ child: "R", parent: "R" });
    expect(relationSides(0, 20, false)).toEqual({ child: "R", parent: "R" });
    expect(relationSides(20, 0, false)).toEqual({ child: "R", parent: "R" });
    expect(relationSides(0, 239, false)).toEqual({ child: "R", parent: "R" });
    expect(relationSides(0, 240, false)).toEqual({ child: "R", parent: "R" }); // 맞닿음(빈 폭 0)
  });

  it("관계 변: 빈 폭이 8 이하인 띠는 겹침으로 본다 — 8 은 같은 변, 8 을 넘으면 마주 봄(양쪽 모두 같은 값)", () => {
    expect(FACING_MIN_GAP).toBe(8);
    expect(relationSides(0, NODE_WIDTH + FACING_MIN_GAP, false)).toEqual({ child: "R", parent: "R" });
    expect(relationSides(NODE_WIDTH + FACING_MIN_GAP, 0, false)).toEqual({ child: "R", parent: "R" });
    expect(relationSides(0, NODE_WIDTH + FACING_MIN_GAP + 0.5, false)).toEqual({ child: "R", parent: "L" });
    expect(relationSides(NODE_WIDTH + FACING_MIN_GAP + 0.5, 0, false)).toEqual({ child: "L", parent: "R" });
    // 격자(10px) 걸음으로 끄는 동안 바뀌는 곳은 한 군데뿐이다 — 빈 폭 0(맞닿음)까지 같은 변, 10 부터 마주 봄
    const kinds = [230, 240, 250, 260, 280, 300, 400].map((dx) => relationSides(0, dx, false).parent);
    expect(kinds).toEqual(["R", "R", "L", "L", "L", "L", "L"]);
  });

  it("관계 변: 좁은 틈(빈 폭 40, 예전 60 띠 안)도 마주 본다 — 같은 변으로 돌리면 ㄷ 선이 이웃 상자를 가로지른다", () => {
    expect(relationSides(0, NODE_WIDTH + 40, false)).toEqual({ child: "R", parent: "L" });
    expect(relationSides(NODE_WIDTH + 40, 0, false)).toEqual({ child: "L", parent: "R" });
  });

  it("끝 꼬리: 손잡이 점 사이 폭이 넉넉하면 END_STUB, 좁으면 폭의 절반 - HANDLE_REACH 로 줄고, 0 아래로는 내려가지 않는다", () => {
    expect(endStub(1000)).toBe(END_STUB);
    expect(endStub(2 * (END_STUB + HANDLE_REACH))).toBe(END_STUB); // 폭 60: 딱 맞음
    expect(endStub(44)).toBe(20); // 빈 폭 40 + 손잡이 4
    expect(endStub(12)).toBe(4); // 빈 폭 8(경계) + 손잡이 4
    expect(endStub(4)).toBe(0);
    expect(endStub(0)).toBe(0);
    expect(endStub(-10)).toBe(0);
  });

  it("좁은 틈의 마주 보는 선은 줄인 꼬리로 두 상자 사이에서만 가로 한 방향으로 이어진다", () => {
    for (const boxGap of [9, 20, 40, 56, 70]) {
      const parentLeft = NODE_WIDTH + boxGap;
      const sx = NODE_WIDTH + HANDLE_REACH;
      const tx = parentLeft - HANDLE_REACH;
      const pts = smoothStepPoints({
        sourceX: sx, sourceY: 50, sourcePosition: "right", targetX: tx, targetY: 200, targetPosition: "left", offset: endStub(tx - sx),
      });
      const xs = pts.map((p) => p.x);
      expect(xs).toEqual([...xs].sort((a, b) => a - b));
      // 가운데 꺾임이 두 상자 사이(자식 오른쪽 변 ~ 부모 왼쪽 변)에 든다
      for (const x of xs.slice(1, -1)) {
        expect(x).toBeGreaterThanOrEqual(NODE_WIDTH);
        expect(x).toBeLessThanOrEqual(parentLeft);
      }
    }
  });

  it("관계 변: 자기 참조는 늘 둘 다 오른쪽", () => {
    expect(relationSides(0, 0, true)).toEqual({ child: "R", parent: "R" });
    expect(relationSides(0, 900, true)).toEqual({ child: "R", parent: "R" });
  });

  it("마주 보는 변은 빈 폭이 경계 바로 위여도 고리 없이 단조(가로로 한 방향)로 이어진다", () => {
    const tgt = NODE_WIDTH + FACING_MIN_GAP + 10; // 자식 0, 부모 x
    const sx = NODE_WIDTH + HANDLE_REACH;
    const tx = tgt - HANDLE_REACH;
    const pts = smoothStepPoints({
      sourceX: sx, sourceY: 50, sourcePosition: "right", targetX: tx, targetY: 200, targetPosition: "left", offset: endStub(tx - sx),
    });
    const xs = pts.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("같은 변(오른쪽 둘)은 ㄷ 모양 — 세로 구간이 두 상자의 가로 범위 밖에 놓인다(x 같음·조금 다름)", () => {
    for (const dx of [0, 20, -20, 120]) {
      const childLeft = 100;
      const parentLeft = 100 + dx;
      const pts = smoothStepPoints({
        sourceX: childLeft + NODE_WIDTH + HANDLE_REACH, sourceY: 50, sourcePosition: "right",
        targetX: parentLeft + NODE_WIDTH + HANDLE_REACH, targetY: 300, targetPosition: "right", offset: END_STUB,
      });
      const farRight = Math.max(childLeft, parentLeft) + NODE_WIDTH;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a.x !== b.x) continue; // 세로 구간만
        expect(a.x).toBeGreaterThan(farRight);
      }
      expect(Math.max(...pts.map((p) => p.x))).toBe(farRight + HANDLE_REACH + END_STUB);
    }
  });

  // 끝 점(x)은 그 노드의 손잡이 점이다 — 왼쪽 변은 상자 왼쪽 -2, 오른쪽 변은 상자 오른쪽 +2 (HANDLE_REACH).
  const rightOf = (left: number) => ({ x: left + NODE_WIDTH + HANDLE_REACH, position: "right" as const });
  const leftOf = (left: number) => ({ x: left - HANDLE_REACH, position: "left" as const });

  it("끄는 동안 변: 놓기 전 손잡이 그대로, 부모를 끌어 겹치면 부모 끝이 같은 변(오른쪽)으로 접히고, 다시 멀리 끌면 돌아온다", () => {
    // 자식 0 (R), 부모 400 (L) — 규칙과 손잡이가 일치하면 입력 그대로
    expect(liveEnds(rightOf(0), 0, leftOf(400), 400)).toEqual({ source: rightOf(0), target: leftOf(400) });
    // 부모를 x=20 으로 끄는 중(손잡이는 아직 L) — 부모 끝이 상자 가운데 기준으로 오른쪽 변으로 접힌다. 자식 끝은 그대로
    expect(liveEnds(rightOf(0), 0, leftOf(20), 20)).toEqual({ source: rightOf(0), target: rightOf(20) });
    // 놓은 뒤 손잡이가 R/R 로 바뀐 상태에서 다시 x=400 으로 끌면 L 로 돌아온다
    expect(liveEnds(rightOf(0), 0, rightOf(400), 400)).toEqual({ source: rightOf(0), target: leftOf(400) });
  });

  it("끄는 동안 변: 자식(원천) 끝이 L → R 로 접히는 경우, 두 끝이 모두 접히는 경우", () => {
    expect(liveEnds(leftOf(400), 400, rightOf(0), 0)).toEqual({ source: leftOf(400), target: rightOf(0) });
    // 자식을 x=30 으로 끌어 겹침 → 자식 끝만 L → R
    expect(liveEnds(leftOf(30), 30, rightOf(0), 0)).toEqual({ source: rightOf(30), target: rightOf(0) });
    // 처음 손잡이가 R/L 인데 자식을 부모 오른쪽 가까이로 끈 경우(자식 100, 부모 0): 둘 다 R
    expect(liveEnds(rightOf(100), 100, leftOf(0), 0)).toEqual({ source: rightOf(100), target: rightOf(0) });
    // 자식이 부모 오른쪽 멀리(자식 500, 부모 0)이면 자식 L · 부모 R — 손잡이가 R/L 이었으면 둘 다 접힌다
    expect(liveEnds(rightOf(500), 500, leftOf(0), 0)).toEqual({ source: leftOf(500), target: rightOf(0) });
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
