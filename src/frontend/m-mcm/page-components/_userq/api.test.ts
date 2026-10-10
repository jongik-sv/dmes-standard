import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanParams,
  deleteUserQuery,
  getUserQueryDef,
  getUserQueryRunDef,
  listMyUserQueries,
  previewUserQuery,
  runUserQuery,
  saveUserQuery,
  saveUserQueryAssigns,
  searchUserQueryDepts,
  searchUserQueries,
  searchUserQueryAssigns,
  searchUserQueryCandidates,
  validateUserQuery,
} from "./api";
import type { UserQueryDef } from "./types";

const fetchMock = vi.fn();

function reply(result: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ meta: { success: true }, data: { result } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function sent(i = 0): { url: string; body: { meta: Record<string, unknown>; params: Record<string, unknown> } } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const DEF: UserQueryDef = {
  queryId: "DAILY_PROD",
  queryNm: "일일 생산",
  categoryCd: "ETC",
  moduleCd: "MCM",
  queryDesc: null,
  ownerDeptCd: null,
  ownerDeptNm: null,
  sqlText: "SELECT 1 FROM DUAL WHERE :a = 1",
  params: [{ name: "a", type: "text" }],
  columns: [{ field: "X", header: "엑스" }],
  maxRowCnt: 1000,
  useYn: "Y",
  ver: null,
};

describe("cleanParams", () => {
  it("빈 값을 빼고 나머지는 글자로 바꾼다", () => {
    expect(cleanParams({ a: "x", b: null, c: undefined, d: "", e: 0, f: 12 })).toEqual({ a: "x", e: "0", f: "12" });
  });
});

describe("userQueryMng 호출", () => {
  it("search — 조건을 싣고 행을 변환한다", async () => {
    reply({ rows: [{ queryId: "Q1", queryNm: "이름", moduleCd: "MPP", useYn: "N", maxRowCnt: 5, assignCnt: 2, ownerDeptNm: "생산" }] });
    const rows = await searchUserQueries({ keyword: "q", useYn: "Y", ownerDept: "", moduleCd: "MPP" });
    const s = sent();
    expect(s.url).toBe("/api/mcm/oasis/userQueryMng/search");
    expect(s.body.meta).toEqual({ menuId: "userQueryMng" });
    expect(s.body.params).toEqual({ keyword: "q", useYn: "Y", moduleCd: "MPP" });
    expect(rows).toEqual([
      {
        queryId: "Q1", queryNm: "이름", categoryCd: null, moduleCd: "MPP", ownerDeptCd: null, ownerDeptNm: "생산",
        useYn: "N", maxRowCnt: 5, assignCnt: 2, uAt: null, uUsrId: null,
      },
    ]);
  });

  it("get — paramsJson·columnsJson 을 풀어 묶는다", async () => {
    reply({
      def: {
        queryId: "Q1", queryNm: "n", sqlText: "SELECT 1 FROM DUAL", maxRowCnt: 100, useYn: "Y", ver: 3,
        paramsJson: JSON.stringify([{ name: "d", type: "date", required: true }]),
        columnsJson: JSON.stringify([{ field: "A", align: "right" }]),
      },
    });
    const def = await getUserQueryDef("Q1");
    expect(sent().body.params).toEqual({ queryId: "Q1" });
    expect(def.params).toEqual([{ name: "d", type: "date", required: true }]);
    expect(def.columns).toEqual([{ field: "A", align: "right" }]);
    expect(def.ver).toBe(3);
  });

  it("get — def 가 없으면 거절한다", async () => {
    reply({});
    await expect(getUserQueryDef("Q1")).rejects.toThrow();
  });

  it("save — 신규는 ver 를 싣지 않고 정의를 JSON 글자로 싣는다", async () => {
    reply({ queryId: "DAILY_PROD", ver: 0 });
    const out = await saveUserQuery(DEF);
    const p = sent().body.params;
    expect(p.ver).toBeUndefined();
    expect(p.maxRowCnt).toBe("1000");
    expect(JSON.parse(String(p.paramsJson))).toEqual(DEF.params);
    expect(JSON.parse(String(p.columnsJson))).toEqual(DEF.columns);
    expect(p.queryDesc).toBeUndefined();
    expect(p.moduleCd).toBe("MCM");
    expect(out).toEqual({ queryId: "DAILY_PROD", ver: 0 });
  });

  it("save — 갱신은 ver 를 싣는다. 입력·출력 정의가 비면 JSON 칸을 싣지 않는다", async () => {
    reply({ queryId: "DAILY_PROD", ver: 4 });
    await saveUserQuery({ ...DEF, params: [], columns: [], ver: 3 });
    const p = sent().body.params;
    expect(p.ver).toBe("3");
    expect(p.paramsJson).toBeUndefined();
    expect(p.columnsJson).toBeUndefined();
  });

  it("get — ver·maxRowCnt 가 없으면 0 이 아니라 null·1000", async () => {
    reply({ def: { queryId: "Q1", queryNm: "n", sqlText: "SELECT 1 FROM DUAL", ver: null, maxRowCnt: null } });
    const def = await getUserQueryDef("Q1");
    expect(def.ver).toBeNull();
    expect(def.maxRowCnt).toBe(1000);
    expect(def.moduleCd).toBe("MCM"); // 모듈이 없거나 모르는 값이면 기본 MCM
  });

  it("delete — queryId·ver", async () => {
    reply({ deleted: 1, assignDeleted: 4 });
    expect(await deleteUserQuery("Q1", 2)).toEqual({ deleted: 1, assignDeleted: 4 });
    expect(sent().body.params).toEqual({ queryId: "Q1", ver: "2" });
  });

  it("previewQuery·validate — sqlText 와 paramsJson", async () => {
    reply({ columns: ["A"], rows: [{ A: 1 }], truncated: false });
    const preview = await previewUserQuery("SELECT 1 A FROM DUAL", [{ name: "a", type: "text" }]);
    expect(sent().url).toBe("/api/mcm/oasis/userQueryMng/previewQuery");
    expect(sent().body.params.sqlText).toBe("SELECT 1 A FROM DUAL");
    expect(preview).toEqual({ columns: ["A"], rows: [{ A: 1 }], truncated: false });
    reply({ binds: ["a", "b"] });
    expect(await validateUserQuery("SELECT :a, :b FROM DUAL")).toEqual(["a", "b"]);
    expect(sent(1).body.params.paramsJson).toBeUndefined();
  });

  it("searchAssign·saveAssign·searchUserList", async () => {
    reply({ rows: [{ userId: "u1", userNm: "홍", deptCd: "D1", deptNm: "생산", missingYn: "Y" }] });
    expect(await searchUserQueryAssigns("Q1")).toEqual([
      { userId: "u1", userNm: "홍", deptCd: "D1", deptNm: "생산", missing: true },
    ]);
    reply({ added: 2, removed: 1 });
    expect(await saveUserQueryAssigns("Q1", ["u1", "u2"])).toEqual({ added: 2, removed: 1 });
    expect(JSON.parse(String(sent(1).body.params.userIdsJson))).toEqual(["u1", "u2"]);
    reply({ rows: [{ userId: "u1", userNm: "홍" }], truncated: true });
    expect(await searchUserQueryCandidates()).toEqual({
      rows: [{ userId: "u1", userNm: "홍", deptCd: null, deptNm: null }],
      truncated: true,
    });
  });

  it("searchDepts — keyword 를 자르고 부서 코드가 없는 줄은 뺀다", async () => {
    reply({ depts: [{ deptCd: "D1", deptNm: "생산" }, { deptCd: "", deptNm: "빈" }, { deptCd: "D2" }] });
    expect(await searchUserQueryDepts(" 생 ")).toEqual([
      { deptCd: "D1", deptNm: "생산" },
      { deptCd: "D2", deptNm: "" },
    ]);
    expect(sent().url).toBe("/api/mcm/oasis/userQueryMng/searchDepts");
    expect(sent().body.params).toEqual({ keyword: "생" });
  });

  it("업무 거절(meta.success=false)은 서버 문구의 Error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ meta: { success: false, message: "다른 사람이 먼저 고쳤습니다" } }), { status: 200 })
    );
    await expect(deleteUserQuery("Q1", 1)).rejects.toThrow("다른 사람이 먼저 고쳤습니다");
  });
});

describe("userQuery 호출", () => {
  it("myList·getDef·run", async () => {
    reply({ rows: [{ queryId: "Q1", queryNm: "n" }] });
    expect((await listMyUserQueries())[0]).toEqual({ queryId: "Q1", queryNm: "n", categoryCd: null, queryDesc: null, moduleCd: null });
    expect(sent().url).toBe("/api/mcm/oasis/userQuery/myList");
    reply({ queryId: "Q1", queryNm: "n", params: [{ name: "a", type: "number" }], columns: [{ field: "X" }], maxRowCnt: 50 });
    const def = await getUserQueryRunDef("Q1");
    expect(def.params).toEqual([{ name: "a", type: "number" }]);
    expect(def.maxRowCnt).toBe(50);
    reply({ columns: ["X"], rows: [{ X: 1 }], truncated: true, maxRowCnt: 50 });
    const res = await runUserQuery("Q1", { a: "3" });
    expect(sent(2).body.params).toEqual({ queryId: "Q1", paramsJson: '{"a":"3"}' });
    expect(res).toEqual({ columns: ["X"], rows: [{ X: 1 }], truncated: true, maxRowCnt: 50 });
  });

  it("run — 값이 없으면 paramsJson 을 싣지 않는다", async () => {
    reply({ columns: [], rows: [], truncated: false, maxRowCnt: 1000 });
    await runUserQuery("Q1");
    expect(sent().body.params).toEqual({ queryId: "Q1" });
  });
});

describe("새 조건 값(배열·기간)", () => {
  it("runUserQuery 는 다중 선택 배열과 기간 두 키를 paramsJson 에 그대로 싣는다", async () => {
    reply({ columns: [], rows: [], truncated: false, maxRowCnt: 10 });
    await runUserQuery("Q1", { fromDt: "2026-10-03", toDt: "2026-10-10", statCd: ["S", "H"] });
    expect(JSON.parse(String(sent().body.params.paramsJson))).toEqual({ fromDt: "2026-10-03", toDt: "2026-10-10", statCd: ["S", "H"] });
  });

  it("getDef·get 은 새 조건 키를 잃지 않는다", async () => {
    const p = { name: "fromDt", type: "daterange", toName: "toDt", toDefault: "0d", maxSpanDays: 31 };
    reply({ queryId: "Q1", queryNm: "n", moduleCd: "MQC", params: [p], columns: [{ field: "A", format: "number", mask: "#,##0", sum: true }], maxRowCnt: 5 });
    const def = await getUserQueryRunDef("Q1");
    expect(def.params).toEqual([p]);
    expect(def.columns).toEqual([{ field: "A", format: "number", mask: "#,##0", sum: true }]);
    expect(def.moduleCd).toBe("MQC");
  });
});
