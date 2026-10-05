// 하위 세트 spec §9·§10.4 — SET 노드 편집 연산·선 칩·부르는 세트 링크(순수 함수, 계획 Task 8 Step 1).
import { describe, expect, it } from "vitest";

import { callerSetIds } from "../../../pages/dme/ruleSetEdit/caller-links";
import {
  addCatch,
  copyFragment,
  duplicateNode,
  flowJsonOf,
  insertSet,
  moveNode,
  pasteFragment,
  removeNode,
  setNodeStyle,
  setNodesColor,
  toEditFlow,
  type EditFlow,
  type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { edgeChips } from "../../../pages/dme/ruleSetEdit/flow-vars";
import { CATCH_NAMES } from "../../../pages/dme/ruleSetEdit/flow-model";
import type { SetCallIo } from "../../../pages/dme/ruleSetEdit/types";

const ok = (r: EditResult): EditFlow => {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};
/** start → r1(A) → end, 선 e1 start→r1 · e2 r1→end. */
const base = () => toEditFlow(null, ["A"]);
const call = (setId: string, outputs: string[]): SetCallIo => ({
  setId,
  setName: `${setId} 세트`,
  exists: true,
  status: "INUSE",
  inputs: [],
  outputs: outputs.map((name) => ({ name, dataType: null, scale: null, dateString: false, maruCodeId: null, always: true })),
  endsEarly: false,
});

describe("SET 노드 편집 연산", () => {
  it("insertSet 은 선 위에 SET 노드(s 접두)를 끼우고 setId 를 저장 JSON 의 SET 노드에만 쓴다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const s = f.nodes.find((n) => n.kind === "SET")!;
    expect(s.id).toBe("s1");
    expect(s.setId).toBe("QD_S_PRICE");
    expect(f.edges.find((e) => e.id === "e2")!.to).toBe("s1");
    expect(f.edges.some((e) => e.from === "s1" && e.to === "end")).toBe(true);
    const json = JSON.parse(flowJsonOf(f)) as { nodes: Array<Record<string, unknown>> };
    expect(json.nodes.filter((n) => "setId" in n)).toEqual([expect.objectContaining({ id: "s1", setId: "QD_S_PRICE" })]);
    // 키 순서 — label 뒤 setId(copyNode 와 같다, 서버 정규 JSON 순서)
    expect(Object.keys(json.nodes.find((n) => n.id === "s1")!)).toEqual(["id", "kind", "ruleId", "splitId", "label", "setId"]);
  });

  it("빈 세트 ID·없는 선은 거부한다", () => {
    expect(insertSet(base(), "e2", "  ").ok).toBe(false);
    expect(insertSet(base(), "e9", "QD_S_PRICE").ok).toBe(false);
  });

  it("SET 없는 세트의 저장 글자는 예전과 같다", () => {
    expect(flowJsonOf(base())).not.toContain("setId");
  });

  it("되돌리기 사본(toEditFlow)과 복사·붙여넣기·복제가 setId 를 지킨다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const again = toEditFlow(JSON.parse(flowJsonOf(f)), []);
    expect(again.nodes.find((n) => n.id === "s1")!.setId).toBe("QD_S_PRICE");
    const frag = copyFragment(f, "s1");
    if (typeof frag === "string") throw new Error(frag);
    const pasted = ok(pasteFragment(f, "e1", frag));
    const sets = pasted.nodes.filter((n) => n.kind === "SET");
    expect(sets.map((n) => n.setId)).toEqual(["QD_S_PRICE", "QD_S_PRICE"]);
    expect(sets.every((n) => n.id.startsWith("s"))).toBe(true);
    expect(new Set(sets.map((n) => n.id)).size).toBe(2);
    const dup = ok(duplicateNode(f, "s1"));
    expect(dup.nodes.filter((n) => n.kind === "SET").map((n) => n.setId)).toEqual(["QD_S_PRICE", "QD_S_PRICE"]);
    // 붙여 넣은 노드만 setId 를 갖고 다른 종류에는 칸이 생기지 않는다
    expect(pasted.nodes.filter((n) => n.kind !== "SET").every((n) => !("setId" in n))).toBe(true);
  });

  it("SET 노드는 단계처럼 지우면 앞뒤를 잇고 붙은 받는 노드도 같이 지운다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const g = ok(removeNode(f, "s1"));
    expect(g.nodes.some((n) => n.kind === "SET")).toBe(false);
    expect(g.edges.some((e) => e.from === "r1" && e.to === "end")).toBe(true);
    const withCatch = addCatch(f, "s1", null);
    if (!withCatch.ok) throw new Error(withCatch.reason);
    expect(withCatch.flow.nodes.some((n) => n.kind === "CATCH" && n.attachTo === "s1")).toBe(true);
    const h = ok(removeNode(withCatch.flow, "s1"));
    expect(h.nodes.some((n) => n.kind === "CATCH")).toBe(false);
  });

  it("SET 노드는 단계처럼 옮긴다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE")); // start → r1 → s1 → end
    const g = ok(moveNode(f, "s1", "e1")); // start → s1 → r1 → end
    expect(g.edges.find((e) => e.id === "e1")!.to).toBe("s1");
    expect(g.edges.some((e) => e.from === "s1" && e.to === "r1")).toBe(true);
    expect(g.edges.some((e) => e.from === "r1" && e.to === "end")).toBe(true);
  });

  it("SET 노드의 외관은 바꾸지 못한다(하위 세트 spec §9 — 외관은 룰·빈 단계만)", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    expect(setNodeStyle(f, "s1", { color: "blue" }).ok).toBe(false);
    expect(ok(setNodeStyle(f, "r1", { color: "blue" })).view.styles?.r1?.color).toBe("blue");
    const painted = setNodesColor(f, ["s1", "r1"], "blue");
    expect(Object.keys(painted.view.styles ?? {})).toEqual(["r1"]);
  });
});

describe("선 칩(edgeChips)", () => {
  it("SET 노드에서 나가는 선의 칩은 하위 세트 출력 이름이다 — 겉모양이 없으면 키가 없다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const out = f.edges.find((e) => e.from === "s1")!;
    expect(edgeChips(f, {}, { QD_S_PRICE: call("QD_S_PRICE", ["P", "Q"]) })[out.id]).toEqual(["P", "Q"]);
    expect(edgeChips(f, {})[out.id]).toBeUndefined();
    expect(edgeChips(f, {}, { QD_S_PRICE: call("QD_S_PRICE", []) })[out.id]).toBeUndefined();
  });

  it("받는 노드 처리 갈래 첫 선은 그대로 CATCH_* 이름이다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const r = addCatch(f, "s1", null);
    if (!r.ok) throw new Error(r.reason);
    const c = r.flow.nodes.find((n) => n.kind === "CATCH")!;
    const first = r.flow.edges.find((e) => e.from === c.id)!;
    expect(edgeChips(r.flow, {}, { QD_S_PRICE: call("QD_S_PRICE", ["P"]) })[first.id]).toEqual([...CATCH_NAMES]);
  });
});

describe("부르는 세트 링크(callerSetIds)", () => {
  it("거부 문구의 CALLER_BROKEN 세트 머리에서 세트 ID 를 순서대로 중복 없이 뽑는다(버전 꼬리표 포함)", () => {
    const err = "룰 세트를 저장할 수 없습니다: P[-] CALLER_BROKEN 세트 P: R1의 조건 변수 X는 …; G[-] CALLER_BROKEN 세트 G v1.001: R2가 …; P[-] CALLER_BROKEN 세트 P: 또";
    expect(callerSetIds(err, [])).toEqual(["P", "G"]);
  });

  it("폐기 거부 문구의 사용 중인 세트 목록", () => {
    expect(callerSetIds("C[-] CALLER_BROKEN 사용 중인 세트 M_1, P가 이 세트를 불러 폐기할 수 없다. 부르는 세트를 먼저 고치거나 폐기한다", [])).toEqual(["M_1", "P"]);
  });

  it("저장 경고 줄 — CALLER_WARN 목록과 CALLER_BROKEN WARN 사본(세트 P: · 세트 P v1.001:)", () => {
    expect(callerSetIds("저장 · row_version 3", ["부르는 세트에 경고가 생겼다: P, G", "다른 경고"])).toEqual(["P", "G"]);
    expect(callerSetIds("저장 · row_version 3", ["세트 QD_P: r1의 입력 X를 …", "세트 QD_G v2.001: …", "부르는 세트에 경고가 생겼다: QD_P"])).toEqual(["QD_P", "QD_G"]);
  });

  it("비슷한 다른 경고 문구는 걸리지 않는다", () => {
    expect(
      callerSetIds("저장 · row_version 3", [
        "세트 호출이 순환한다: A › B › A",
        "세트 호출이 6단계다. 5단계까지 부른다: A › B",
        "세트 노드 s1에 세트 ID가 없다",
        "받는 노드 c1: 세트 S에는 END 로 가는 처리 갈래가 없어 하위 세트 예외 끝이 일어나지 않는다",
        "부르는 세트에 경고가 생겼다: P 외",
      ]),
    ).toEqual([]);
    expect(callerSetIds("저장 · row_version 3", [])).toEqual([]);
    expect(callerSetIds("세트 P: 문구 머리지만 경고 줄이 아니다")).toEqual([]);
  });
});
