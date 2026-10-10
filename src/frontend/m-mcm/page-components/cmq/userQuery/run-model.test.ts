import { describe, expect, it } from "vitest";

import {
  conditionParams,
  decideRun,
  defaultValues,
  filterQueries,
  groupByCategory,
  NEED_INPUT_MESSAGE,
  pickInitialQueryId,
  resultColumns,
  resultRows,
  truncationNote,
  withoutRows,
} from "./run-model";
import type { UserQueryParam, UserQueryRunResult, UserQuerySummary } from "../../_userq/types";

const q = (queryId: string, queryNm: string, categoryCd: string | null = null, queryDesc: string | null = null): UserQuerySummary => ({
  queryId,
  queryNm,
  categoryCd,
  queryDesc,
});

const result = (over: Partial<UserQueryRunResult> = {}): UserQueryRunResult => ({
  columns: ["ITEM", "QTY"],
  rows: [{ ITEM: "A", QTY: 3 }],
  truncated: false,
  maxRowCnt: 1000,
  ...over,
});

describe("decideRun — 필수 값", () => {
  const params: UserQueryParam[] = [
    { name: "lineCd", type: "text", required: true },
    { name: "memo", type: "text" },
  ];

  it("필수 값이 비면 서버를 부르지 않고 안내 문구를 돌려준다", () => {
    const d = decideRun(params, { lineCd: "  ", memo: "x" });
    expect(d).toEqual({ run: false, missing: ["lineCd"], message: NEED_INPUT_MESSAGE });
    expect(NEED_INPUT_MESSAGE).toBe("조건을 입력하고 조회하세요");
  });

  it("필수 값이 차면 선언된 이름만 앞뒤 공백을 지워 보낸다", () => {
    const d = decideRun(params, { lineCd: " L1 ", memo: "", extra: "무시" });
    expect(d).toEqual({ run: true, values: { lineCd: "L1", memo: "" } });
  });

  it("조건이 없으면 값 없이 부른다", () => {
    expect(decideRun([], {})).toEqual({ run: true });
  });
});

describe("조건 정의", () => {
  it("이름 형식이 틀리거나 겹친 조건은 그리지 않고, 기본값은 date 를 yyyy-MM-dd 로 바꾼다", () => {
    const params = conditionParams([
      { name: "fromDt", type: "date", default: "20261010" },
      { name: "fromDt", type: "text" },
      { name: "1bad", type: "text" },
      { name: "kind", type: "select", default: "A", options: [{ value: "A" }] },
    ]);
    expect(params.map((p) => p.name)).toEqual(["fromDt", "kind"]);
    expect(defaultValues(params)).toEqual({ fromDt: "2026-10-10", kind: "A" });
  });
});

describe("결과 열 규칙", () => {
  it("정의에 열이 없으면 결과 열 전부, 숫자 열은 오른쪽 정렬", () => {
    const cols = resultColumns(result(), []);
    expect(cols.map((c) => c.key)).toEqual(["ITEM", "QTY"]);
    expect(cols.find((c) => c.key === "QTY")?.align).toBe("right");
    expect(cols.find((c) => c.key === "ITEM")?.align).toBeUndefined();
  });

  it("정의에 열이 있으면 그 열만, 머리글·폭·정렬을 따른다", () => {
    const cols = resultColumns(result(), [{ field: "QTY", header: "수량", width: 80, format: "number" }]);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({ key: "QTY", header: "수량", width: 80, align: "right" });
  });

  it("행에 행 키를 달아 준다", () => {
    expect(resultRows(result({ rows: [{ ITEM: "A" }, { ITEM: "B" }] })).map((r) => r.__rowKey)).toEqual(["0", "1"]);
  });
});

describe("잘림 안내", () => {
  it("잘렸을 때만 「상위 N행만 표시합니다」", () => {
    expect(truncationNote(result({ truncated: true, rows: [{ A: 1 }, { A: 2 }] }))).toBe("상위 2행만 표시합니다");
    expect(truncationNote(result())).toBeUndefined();
  });
});

describe("withoutRows", () => {
  it("행과 잘림만 비우고 열·최대 행은 남긴다(그리드를 언마운트하지 않으려고)", () => {
    expect(withoutRows(result({ truncated: true, rows: [{ ITEM: "A", QTY: 1 }] }))).toEqual({
      columns: ["ITEM", "QTY"],
      rows: [],
      truncated: false,
      maxRowCnt: 1000,
    });
  });
});

describe("목록", () => {
  const list = [q("Q1", "라인별 생산", "PRD", "일 생산 실적"), q("Q2", "검사 불량", "QLT"), q("Q3", "기타 집계", null), q("Q4", "설비 가동", "PRD")];

  it("이름·ID·설명 부분 일치로 거르고 빈 검색어는 전부", () => {
    expect(filterQueries(list, "").map((x) => x.queryId)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(filterQueries(list, " 불량 ").map((x) => x.queryId)).toEqual(["Q2"]);
    expect(filterQueries(list, "q3").map((x) => x.queryId)).toEqual(["Q3"]);
    expect(filterQueries(list, "실적").map((x) => x.queryId)).toEqual(["Q1"]);
  });

  it("분류 이름으로 묶고 순서는 입력 그대로, 모르는 코드는 코드 그대로, 분류가 없으면 미분류", () => {
    const groups = groupByCategory(list, { PRD: "생산" });
    expect(groups.map((g) => [g.label, g.items.map((x) => x.queryId)])).toEqual([
      ["생산", ["Q1", "Q4"]],
      ["QLT", ["Q2"]],
      ["미분류", ["Q3"]],
    ]);
  });

  it("마지막에 고른 쿼리가 목록에 있을 때만 처음부터 고른다", () => {
    expect(pickInitialQueryId(list, "Q2")).toBe("Q2");
    expect(pickInitialQueryId(list, "GONE")).toBeNull();
    expect(pickInitialQueryId(list, null)).toBeNull();
    expect(pickInitialQueryId([], "Q2")).toBeNull();
  });
});
