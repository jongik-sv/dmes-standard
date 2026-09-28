// 열 설정 그리드 — 칸 편집 → 초안 변경(cellPatch), 바뀐 칸 표시(changedFields), 적중 정책·산출 여부에 따른 열 구성.
import { describe, expect, it } from "vitest";

import { newColumn } from "../../../pages/dme/ruleEdit/sections/columns/column-draft";
import { buildColumnGridColumns, cellPatch, changedFields } from "../../../pages/dme/ruleEdit/sections/columns/column-grid";
import { matchDomain } from "../../../pages/dme/ruleEdit/sections/columns/DomainSearchBox";

const handlers = { current: { move: () => {}, remove: () => {}, openDomain: () => {}, clearDomain: () => {} } };
const keys = (opts: Parameters<typeof buildColumnGridColumns>[0]) => buildColumnGridColumns(opts).map((c) => c.key);

describe("cellPatch", () => {
  it("글자 칸은 그대로, 값 타입은 도메인을 풀고, 빈 값 타입은 null 이다", () => {
    expect(cellPatch("label", "두께")).toEqual({ label: "두께" });
    expect(cellPatch("grpCond", 'TOP_RESIN_CD == "F"')).toEqual({ grpCond: 'TOP_RESIN_CD == "F"' });
    expect(cellPatch("dataType", "NUMBER")).toEqual({ dataType: "NUMBER", domainId: null, domainType: null, domainName: null });
    expect(cellPatch("dataType", "")).toEqual({ dataType: null, domainId: null, domainType: null, domainName: null });
    expect(cellPatch("description", null)).toEqual({ description: "" });
  });

  it("순위는 쉼표로 나눠 공백·빈 값을 버린다", () => {
    expect(cellPatch("prio", " A, B ,, C ")).toEqual({ prioList: ["A", "B", "C"] });
  });

  it("편집 칸이 아닌 field 는 무시한다", () => {
    expect(cellPatch("check", "x")).toBeNull();
    expect(cellPatch("varId", 3)).toBeNull();
  });
});

describe("changedFields", () => {
  it("기준과 달라진 칸만, 도메인이 바뀌면 값 타입 칸도 표시한다", () => {
    const base = { ...newColumn("RESULT", "v1"), varId: 1, varName: "A", label: "가" };
    expect(changedFields(base, base)).toEqual([]);
    expect(changedFields({ ...base, label: "나" }, base)).toEqual(["label"]);
    expect(changedFields({ ...base, domainId: 7 }, base)).toEqual(["domain", "dataType"]);
    expect(changedFields(base, undefined)).toEqual([]);
  });
});

describe("buildColumnGridColumns", () => {
  it("결과 식은 산출 룰에만, 집계는 COLLECT·순위는 PRIORITY 에만 둔다", () => {
    expect(keys({ derive: false, hitPolicy: "FIRST", handlers })).not.toContain("expr");
    expect(keys({ derive: true, hitPolicy: null, handlers })).toContain("expr");
    expect(keys({ derive: false, hitPolicy: "COLLECT", handlers })).toContain("collectAgg");
    expect(keys({ derive: false, hitPolicy: "COLLECT", handlers })).not.toContain("prio");
    expect(keys({ derive: false, hitPolicy: "PRIORITY", handlers })).toContain("prio");
    expect(keys({ derive: false, hitPolicy: "FIRST", handlers })).not.toContain("collectAgg");
  });

  it("변수 칸은 '변수' 이고 Expression 조건 열에서는 편집할 수 없다(식은 행 칸마다 적는다)", () => {
    const col = buildColumnGridColumns({ derive: false, hitPolicy: "FIRST", handlers }).find((c) => c.key === "varName")!;
    expect(col.header).toBe("변수");
    const editable = col.editable as (row: Record<string, unknown>) => boolean;
    const at = (varKind: string, dispType: string) => ({ varKind, dispType, __editable: true });
    expect(editable(at("COND", "Expression"))).toBe(false);
    expect(editable(at("COND", "2"))).toBe(true);
    expect(editable(at("RESULT", "Expression"))).toBe(true);
  });

  it("검사·삭제 칸은 오른쪽에 고정한다", () => {
    const cols = buildColumnGridColumns({ derive: false, hitPolicy: "FIRST", handlers });
    expect(cols.filter((c) => c.pinned === "right").map((c) => c.key)).toEqual(["check", "del"]);
  });
});

describe("matchDomain", () => {
  const row = (domainId: number, stdName: string, domainName: string | null) => ({ domainId, stdName, domainName, dataType: "STRING" as const });
  const yn = row(50, "YN", "여부");
  const useYn = row(51, "USE_YN", "사용 여부");

  it("표준명·도메인명이 같은(대소문자·앞뒤 공백 무시) 도메인이 하나면 그것을 고른다", () => {
    expect(matchDomain([useYn, yn], "여부")).toBe(yn);
    expect(matchDomain([useYn, yn], " yn ")).toBe(yn);
    expect(matchDomain([useYn, yn], "사용 여부")).toBe(useYn);
  });

  it("같은 것이 없으면 결과가 하나일 때만 고르고, 여럿·없음·빈 글자는 null(팝업)이다", () => {
    expect(matchDomain([useYn], "USE")).toBe(useYn);
    expect(matchDomain([useYn, yn], "Y")).toBeNull();
    expect(matchDomain([], "X")).toBeNull();
    expect(matchDomain([useYn], "  ")).toBeNull();
  });

  it("도메인명이 없는 도메인도 표준명으로 고른다", () => {
    const noName = row(52, "NO_NAME", null);
    expect(matchDomain([noName, yn], "no_name")).toBe(noName);
  });
});
