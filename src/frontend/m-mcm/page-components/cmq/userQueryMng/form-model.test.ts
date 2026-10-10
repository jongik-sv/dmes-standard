import { describe, expect, it } from "vitest";

import {
  buildAssignItems,
  diffIds,
  emptyDef,
  emptyFilters,
  formatDateTime,
  isDefDirty,
  sameSet,
  toGridRows,
  toSearchCond,
  validateDef,
} from "./form-model";

describe("toSearchCond", () => {
  it("빈 칸은 빼고 글자 칸은 공백을 자른다", () => {
    expect(toSearchCond(emptyFilters())).toEqual({});
    expect(
      toSearchCond({ categoryCd: "ETC", moduleCd: "MPP", keyword: " 생산 ", useYn: "Y", ownerDept: " ", assignUser: "u1" })
    ).toEqual({ categoryCd: "ETC", moduleCd: "MPP", keyword: "생산", useYn: "Y", assignUser: "u1" });
  });
});

describe("toGridRows·formatDateTime", () => {
  it("분류 코드를 이름으로 바꾸고 날짜시각을 줄인다", () => {
    const rows = toGridRows(
      [
        {
          queryId: "Q1", queryNm: "n", categoryCd: "ETC", moduleCd: "MPP", ownerDeptCd: "D1", ownerDeptNm: null,
          useYn: "N", maxRowCnt: 10, assignCnt: 3, uAt: "2026-10-10T13:05:09.123", uUsrId: "u",
        },
      ],
      { ETC: "기타" }
    );
    expect(rows[0]).toMatchObject({ categoryNm: "기타", moduleNm: "MPP 생산", ownerDeptNm: "D1", uAt: "2026-10-10 13:05", assignCnt: 3 });
    expect(formatDateTime(null)).toBe("");
  });
});

describe("validateDef", () => {
  const ok = { ...emptyDef(), queryId: "DAILY_PROD", queryNm: "일일 생산", sqlText: "SELECT 1 FROM DUAL" };

  it("정상 값은 통과한다", () => {
    expect(validateDef(ok, true)).toBeNull();
  });
  it("신규일 때만 쿼리 ID 형식을 본다", () => {
    expect(validateDef({ ...ok, queryId: "ab" }, true)).toMatch(/쿼리 ID/);
    expect(validateDef({ ...ok, queryId: "daily" }, true)).toMatch(/쿼리 ID/);
    expect(validateDef({ ...ok, queryId: "daily" }, false)).toBeNull();
  });
  it("이름·최대 행·SQL 을 검사한다", () => {
    expect(validateDef({ ...ok, queryNm: " " }, true)).toMatch(/이름/);
    expect(validateDef({ ...ok, maxRowCnt: 0 }, true)).toMatch(/최대 행/);
    expect(validateDef({ ...ok, maxRowCnt: 5001 }, true)).toMatch(/최대 행/);
    expect(validateDef({ ...ok, maxRowCnt: 1.5 }, true)).toMatch(/최대 행/);
    expect(validateDef({ ...ok, sqlText: "  " }, true)).toMatch(/SQL/);
  });
  it("입력 정의 오류와 빈 출력 필드를 거절한다", () => {
    expect(validateDef({ ...ok, params: [{ name: "1bad", type: "text" }] }, true)).toMatch(/조회 조건/);
    expect(validateDef({ ...ok, params: [{ name: "a", type: "text" }], columns: [{ field: "A" }] }, true)).toBeNull();
    expect(validateDef({ ...ok, columns: [{ field: " " }] }, true)).toMatch(/출력 정의/);
  });
});

describe("isDefDirty", () => {
  it("둘 중 하나가 없으면 false, 값이 다르면 true", () => {
    const a = emptyDef();
    expect(isDefDirty(null, a)).toBe(false);
    expect(isDefDirty(a, { ...a })).toBe(false);
    expect(isDefDirty(a, { ...a, queryNm: "x" })).toBe(true);
  });
});

describe("buildAssignItems", () => {
  it("후보 순서를 지키고 후보 밖 할당 사용자를 뒤에 붙인다", () => {
    const items = buildAssignItems(
      [
        { userId: "u1", userNm: "가", deptCd: "D", deptNm: "생산" },
        { userId: "u2", userNm: "나", deptCd: null, deptNm: null },
      ],
      [
        { userId: "u2", userNm: "나", deptCd: null, deptNm: null, missing: false },
        { userId: "ghost", userNm: null, deptCd: null, deptNm: null, missing: true },
      ]
    );
    expect(items.map((i) => i.code)).toEqual(["u1", "u2", "ghost"]);
    expect(items[2]).toMatchObject({ missing: true, name: "" });
    expect(items[0].missing).toBe(false);
  });
});

describe("sameSet·diffIds", () => {
  it("집합 비교와 차이", () => {
    expect(sameSet(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameSet(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    expect(diffIds(new Set(["a", "b"]), new Set(["b", "c"]))).toEqual({ added: ["c"], removed: ["a"] });
  });
});
