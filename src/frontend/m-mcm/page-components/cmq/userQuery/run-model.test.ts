import { describe, expect, it } from "vitest";

import {
  conditionParams,
  decideRun,
  definedColumns,
  defaultValues,
  EMPTY_LIST_FILTER,
  filterQueryList,
  LIST_COLUMNS,
  NEED_INPUT_MESSAGE,
  pickInitialQueryId,
  resultColumns,
  resultRows,
  sameQueryList,
  toListRows,
  truncationNote,
  resultSumRows,
  withoutRows,
} from "./run-model";
import type { UserQueryParam, UserQueryRunResult, UserQuerySummary } from "../../_userq/types";

const q = (
  queryId: string,
  queryNm: string,
  categoryCd: string | null = null,
  queryDesc: string | null = null,
  moduleCd: UserQuerySummary["moduleCd"] = "MCM"
): UserQuerySummary => ({
  queryId,
  queryNm,
  categoryCd,
  queryDesc,
  moduleCd,
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

  it("정의 열이 있으면 조회 전에도 그 열로 빈 그리드 열을 만들고, 조회 뒤 열과 같다. 정의 열이 없으면 빈 배열", () => {
    const defined = [
      { field: "ITEM", header: "품목", width: 120 },
      { field: "QTY", header: "수량", format: "number" as const },
    ];
    const cols = definedColumns(defined);
    expect(cols.map((c) => [c.key, c.header])).toEqual([
      ["ITEM", "품목"],
      ["QTY", "수량"],
    ]);
    expect(cols.find((c) => c.key === "QTY")?.align).toBe("right");
    expect(resultColumns(result(), defined).map((c) => [c.key, c.header, c.width])).toEqual(cols.map((c) => [c.key, c.header, c.width]));
    expect(definedColumns([])).toEqual([]);
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

  it("검색어는 이름·쿼리 ID 부분 일치(대소문자·앞뒤 공백 무시), 설명은 보지 않고, 빈 검색어는 전부", () => {
    const ids = (keyword: string, categoryCd = "") => filterQueryList(list, { categoryCd, moduleCd: "", keyword }).map((x) => x.queryId);
    expect(filterQueryList(list, EMPTY_LIST_FILTER).map((x) => x.queryId)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(ids(" 불량 ")).toEqual(["Q2"]);
    expect(ids("q3")).toEqual(["Q3"]);
    expect(ids("Q")).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(ids("실적")).toEqual([]); // Q1 의 설명에만 있는 글자
  });

  it("분류를 고르면 그 분류만(분류 없는 쿼리는 빠진다), 검색어와 함께 쓰면 둘 다 맞는 것만, 순서는 입력 그대로", () => {
    const ids = (categoryCd: string, keyword = "") => filterQueryList(list, { categoryCd, moduleCd: "", keyword }).map((x) => x.queryId);
    expect(ids("PRD")).toEqual(["Q1", "Q4"]);
    expect(ids("PRD", "설비")).toEqual(["Q4"]);
    expect(ids("QLT", "설비")).toEqual([]);
    expect(ids("NONE")).toEqual([]);
  });

  it("모듈을 고르면 그 모듈만, 분류·검색어와 함께 쓰면 모두 맞는 것만", () => {
    const mixed = [q("A1", "생산 A", "PRD", null, "MPP"), q("A2", "생산 B", "PRD", null, "MCM"), q("A3", "품질 C", "QLT", null, "MQC")];
    const ids = (moduleCd: string, categoryCd = "", keyword = "") => filterQueryList(mixed, { categoryCd, moduleCd, keyword }).map((x) => x.queryId);
    expect(ids("MPP")).toEqual(["A1"]);
    expect(ids("MCM", "PRD")).toEqual(["A2"]);
    expect(ids("MQC", "PRD")).toEqual([]);
    expect(ids("", "", "생산")).toEqual(["A1", "A2"]);
    expect(toListRows(mixed, {}).map((r) => r.moduleCd)).toEqual(["MPP", "MCM", "MQC"]);
  });

  it("목록 행은 분류 이름을 풀고, 모르는 코드는 코드 그대로, 분류가 없으면 미분류", () => {
    expect(toListRows(list, { PRD: "생산" }).map((r) => [r.queryId, r.categoryNm])).toEqual([
      ["Q1", "생산"],
      ["Q2", "QLT"],
      ["Q3", "미분류"],
      ["Q4", "생산"],
    ]);
    expect(toListRows([], {})).toEqual([]);
  });

  it("같은 목록인지 값까지 비교한다", () => {
    expect(sameQueryList(list, list.map((x) => ({ ...x })))).toBe(true);
    expect(sameQueryList(list, list.slice(1))).toBe(false);
    expect(sameQueryList(list, [{ ...list[0], queryNm: "바뀜" }, ...list.slice(1)])).toBe(false);
  });

  it("목록 그리드 열의 최소 폭 합이 기본 20% 칸(1280 폭 약 200px − 스크롤바 17px)에 든다", () => {
    expect(LIST_COLUMNS.map((c) => c.key)).toEqual(["queryNm", "categoryNm", "queryId", "moduleCd"]);
    expect(LIST_COLUMNS.reduce((sum, c) => sum + (c.minWidth ?? 50), 0)).toBeLessThanOrEqual(190);
  });

  it("마지막에 고른 쿼리가 목록에 있을 때만 처음부터 고른다", () => {
    expect(pickInitialQueryId(list, "Q2")).toBe("Q2");
    expect(pickInitialQueryId(list, "GONE")).toBeNull();
    expect(pickInitialQueryId(list, null)).toBeNull();
    expect(pickInitialQueryId([], "Q2")).toBeNull();
  });
});

describe("합계 고정 행", () => {
  const cols = [
    { field: "NM", header: "이름" },
    { field: "QTY", format: "number" as const, mask: "#,##0.0", sum: true },
  ];
  const res = (over: Partial<UserQueryRunResult> = {}) => result({ columns: ["NM", "QTY"], rows: [{ NM: "a", QTY: 1.5 }, { NM: "b", QTY: 2 }], truncated: false, ...over });

  it("첫 비합계 열에 「합계」, 합계 열에 합", () => {
    expect(resultSumRows(res(), cols)).toEqual([{ NM: "합계", QTY: 3.5 }]);
  });

  it("잘렸으면 「표시한 행 합계」", () => {
    expect(resultSumRows(res({ truncated: true }), cols)?.[0].NM).toBe("표시한 행 합계");
  });

  it("합계 열이 없거나 행이 없으면 고정 행 없음", () => {
    expect(resultSumRows(res(), [{ field: "NM" }])).toBeUndefined();
    expect(resultSumRows(res({ rows: [] }), cols)).toBeUndefined();
  });
});
