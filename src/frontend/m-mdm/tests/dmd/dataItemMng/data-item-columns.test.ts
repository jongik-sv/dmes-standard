// TSK-07-03 design.md §3.4 — 항목 관리 순수 함수: 동적 열(Q5), 편집 가능(Q6), 저장 파라미터(A4·S5), 문구 판정(A2·F1).
import { describe, expect, it } from "vitest";

import {
  buildItemColumns,
  isClosedKeyGuide,
  isRowEditable,
  isRowVersionConflict,
  toSaveParams,
} from "../../../pages/dmd/dataItemMng/columns";
import { CLOSED_KEY_REOPEN, ROW_VERSION_CONFLICT_PREFIX } from "../../../pages/dmd/dataItemMng/messages";
import type { DataItemHeader } from "../../../pages/dmd/dataItemMng/types";

function header(over: Partial<DataItemHeader> = {}): DataItemHeader {
  return {
    maruDataId: "PORT",
    maruDataName: "항구",
    status: "INUSE",
    sourceKind: "MDM",
    sourceSystem: null,
    lvlCnt: 1,
    attrLabels: [
      { field: "attr01", label: "국가" },
      { field: "attr03", label: "비고" },
    ],
    editable: true,
    categories: [],
    ...over,
  };
}

const keys = (h: DataItemHeader) => buildItemColumns(h).map((c) => c.key);

describe("buildItemColumns (Q5)", () => {
  it("계층 열은 1차~lvlCnt차만 만든다", () => {
    expect(keys(header({ lvlCnt: 0 })).filter((k) => k.startsWith("lvl"))).toEqual([]);
    expect(keys(header({ lvlCnt: 1 })).filter((k) => k.startsWith("lvl"))).toEqual(["lvl1"]);
    expect(keys(header({ lvlCnt: 5 })).filter((k) => k.startsWith("lvl"))).toEqual(["lvl1", "lvl2", "lvl3", "lvl4", "lvl5"]);
    const cols = buildItemColumns(header({ lvlCnt: 2 }));
    expect(cols.filter((c) => c.key.startsWith("lvl")).map((c) => c.header)).toEqual(["1차", "2차"]);
  });

  it("추가 컬럼 열은 라벨이 있는 번호만이고 머리는 라벨 원문이다", () => {
    const cols = buildItemColumns(header());
    const attrs = cols.filter((c) => c.key.startsWith("attr"));
    expect(attrs.map((c) => c.key)).toEqual(["attr01", "attr03"]);
    expect(attrs.map((c) => c.header)).toEqual(["국가", "비고"]);
    expect(cols.some((c) => c.header === "attr02")).toBe(false);
  });

  it("머리가 없으면 고정 열만 둔다", () => {
    expect(keys(null as unknown as DataItemHeader)).toContain("code");
    expect(buildItemColumns(null).some((c) => c.key.startsWith("lvl") || c.key.startsWith("attr"))).toBe(false);
  });
});

describe("isRowEditable (Q6)", () => {
  it("MDM·INUSE 머리이고 그 행이 열려 있을 때만 편집한다", () => {
    expect(isRowEditable(header(), { open: true })).toBe(true);
    expect(isRowEditable(header(), { open: false })).toBe(false);
    expect(isRowEditable(header({ editable: false }), { open: true })).toBe(false);
    expect(isRowEditable(null, { open: true })).toBe(false);
  });

  it("편집 가능한 값 열의 editable 이 같은 판정을 쓴다", () => {
    const name = buildItemColumns(header()).find((c) => c.key === "name")!;
    const editable = name.editable as (row: Record<string, unknown>) => boolean;
    expect(editable({ open: true })).toBe(true);
    expect(editable({ open: false })).toBe(false);
    const external = buildItemColumns(header({ editable: false, sourceKind: "EXTERNAL" })).find((c) => c.key === "name")!;
    expect((external.editable as (row: Record<string, unknown>) => boolean)({ open: true })).toBe(false);
    const code = buildItemColumns(header()).find((c) => c.key === "code")!;
    expect(code.editable ?? false).toBe(false);
  });
});

describe("toSaveParams (A4·S5)", () => {
  it("빈 문자열·공백·null 값은 키를 뺀다", () => {
    const params = toSaveParams("PORT", {
      code: "KRPUS",
      name: " 부산 ",
      alterName: "",
      description: "   ",
      seq: null,
      lvl1: "KR",
      attr01: "KR",
      attr02: null,
      rowVersion: 3,
    });
    expect(params).toEqual({
      maruDataId: "PORT",
      code: "KRPUS",
      name: "부산",
      lvl1: "KR",
      attr01: "KR",
      expectedRowVersion: 3,
    });
    expect(Object.values(params).some((v) => v === null || Array.isArray(v))).toBe(false);
  });

  it("순서는 숫자로 보내고 숫자가 아니면 거부한다", () => {
    expect(toSaveParams("PORT", { code: "A", name: "a", seq: "7" }).seq).toBe(7);
    expect(toSaveParams("PORT", { code: "A", name: "a", seq: 2 }).seq).toBe(2);
    expect(() => toSaveParams("PORT", { code: "A", name: "a", seq: "x" })).toThrow("순서");
  });
});

describe("문구 판정 (A2·F1)", () => {
  it("충돌 문구는 서버 기본 문구로 시작하면 참이다", () => {
    expect(ROW_VERSION_CONFLICT_PREFIX).toBe("다른 사용자가 수정했습니다");
    expect(isRowVersionConflict("다른 사용자가 수정했습니다. 다시 불러오세요")).toBe(true);
    expect(isRowVersionConflict("다른 사용자가 수정했습니다. 다시 불러오세요: 상세")).toBe(true);
    expect(isRowVersionConflict("입력값이 올바르지 않습니다: 다른 사용자가 수정했습니다")).toBe(false);
    expect(isRowVersionConflict("입력값이 올바르지 않습니다")).toBe(false);
  });

  it("닫힌 키 안내는 서버 문구를 포함하면 참이다", () => {
    expect(CLOSED_KEY_REOPEN).toBe("닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요");
    expect(isClosedKeyGuide(`입력값이 올바르지 않습니다: ${CLOSED_KEY_REOPEN}`)).toBe(true);
    expect(isClosedKeyGuide("입력값이 올바르지 않습니다: 이미 있는 키입니다")).toBe(false);
  });
});
