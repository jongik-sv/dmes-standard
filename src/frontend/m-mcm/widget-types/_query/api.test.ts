import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PREVIEW_QUERY_URL, previewWidgetQuery, runWidgetQuery, unwrapResult, WIDGET_DATA_RUN_URL } from "./api";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

function sent(i = 0): { url: string; method: string; body: { meta: Record<string, unknown>; params: Record<string, unknown> } } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, method: String(init.method), body: JSON.parse(String(init.body)) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runWidgetQuery", () => {
  it("widgetData/run 에 defId 만 보낸다(SQL·userId 를 싣지 않는다 — W-D23)", async () => {
    reply({ meta: { success: true }, data: { result: { columns: ["A"], rows: [{ A: 1 }], truncated: false } } });

    await runWidgetQuery("def.k3x9q2ab");

    const req = sent();
    expect(WIDGET_DATA_RUN_URL).toBe("/api/mcm/oasis/widgetData/run");
    expect(req.url).toBe(WIDGET_DATA_RUN_URL);
    expect(req.method).toBe("POST");
    expect(req.body.params).toEqual({ defId: "def.k3x9q2ab" });
    expect(req.body.meta).toEqual({ menuId: "HOME" });
  });

  it("조건 값이 있으면 paramsJson(JSON 글자)으로 더해 보낸다 — defId 는 그대로", async () => {
    reply({ meta: { success: true }, data: { result: { columns: [], rows: [], truncated: false } } });

    await runWidgetQuery("def.k3x9q2ab", { dept: "A01", from: "2026-10-01", n: "" });

    const params = sent().body.params;
    expect(Object.keys(params).sort()).toEqual(["defId", "paramsJson"]);
    expect(params.defId).toBe("def.k3x9q2ab");
    expect(typeof params.paramsJson).toBe("string");
    expect(JSON.parse(String(params.paramsJson))).toEqual({ dept: "A01", from: "2026-10-01", n: "" });
  });

  it("조건 값이 없거나 비어 있으면 paramsJson 을 보내지 않는다", async () => {
    reply({ data: { result: { columns: [], rows: [], truncated: false } } });
    reply({ data: { result: { columns: [], rows: [], truncated: false } } });

    await runWidgetQuery("def.a1234567", undefined);
    await runWidgetQuery("def.a1234567", {});

    expect(sent(0).body.params).toEqual({ defId: "def.a1234567" });
    expect(sent(1).body.params).toEqual({ defId: "def.a1234567" });
  });

  it("data.result 를 풀어 { columns, rows, truncated } 로 돌려준다", async () => {
    reply({
      meta: { success: true },
      data: { result: { columns: ["MON", "QTY"], rows: [{ MON: "1월", QTY: 10 }], truncated: true } },
    });

    await expect(runWidgetQuery("def.a1234567")).resolves.toEqual({
      columns: ["MON", "QTY"],
      rows: [{ MON: "1월", QTY: 10 }],
      truncated: true,
    });
  });

  it("컬럼이 [{name}] 모양으로 와도 문자열 목록으로 바꾼다(스펙 §5.1 표기)", async () => {
    reply({ data: { result: { columns: [{ name: "A" }, { name: "B" }], rows: [], truncated: false } } });

    await expect(runWidgetQuery("def.a1234567")).resolves.toEqual({ columns: ["A", "B"], rows: [], truncated: false });
  });

  it("meta.success=false 면 서버 메시지로 거절한다", async () => {
    reply({ meta: { success: false, message: "사용 중지된 위젯입니다" } });

    await expect(runWidgetQuery("def.a1234567")).rejects.toThrow("사용 중지된 위젯입니다");
  });

  it("HTTP 오류면 거절한다", async () => {
    reply({ message: "권한이 없습니다." }, 403);

    await expect(runWidgetQuery("def.a1234567")).rejects.toThrow("권한이 없습니다.");
  });
});

describe("previewWidgetQuery", () => {
  it("commWidgetMng/previewQuery 에 dataSrc·sql 을 보낸다", async () => {
    reply({ meta: { success: true }, data: { result: { columns: ["A"], rows: [{ A: 1 }], truncated: false } } });

    const out = await previewWidgetQuery("mcm", "SELECT 1 AS A");

    const req = sent();
    expect(PREVIEW_QUERY_URL).toBe("/api/mcm/oasis/commWidgetMng/previewQuery");
    expect(req.url).toBe(PREVIEW_QUERY_URL);
    expect(req.method).toBe("POST");
    expect(req.body.params).toEqual({ dataSrc: "mcm", sql: "SELECT 1 AS A" });
    expect(req.body.meta).toEqual({ menuId: "commWidgetMng" });
    expect(out).toEqual({ columns: ["A"], rows: [{ A: 1 }], truncated: false });
  });

  it("조건 정의가 있으면 정의 배열 전체를 paramsJson 으로 더해 보낸다", async () => {
    reply({ meta: { success: true }, data: { result: { columns: ["A"], rows: [], truncated: false } } });
    const defs = [
      { name: "dept", type: "text" as const, label: "부서", required: true },
      { name: "lv", type: "select" as const, default: "1", options: [{ value: "1", label: "하" }] },
    ];

    await previewWidgetQuery("mcm", "SELECT :dept, :lv", defs);

    const params = sent().body.params;
    expect(Object.keys(params).sort()).toEqual(["dataSrc", "paramsJson", "sql"]);
    expect(JSON.parse(String(params.paramsJson))).toEqual(defs);
  });

  it("조건 정의가 없거나 비면 paramsJson 을 보내지 않는다", async () => {
    reply({ data: { result: { columns: [], rows: [], truncated: false } } });
    reply({ data: { result: { columns: [], rows: [], truncated: false } } });

    await previewWidgetQuery("mcm", "SELECT 1", undefined);
    await previewWidgetQuery("mcm", "SELECT 1", []);

    expect(sent(0).body.params).toEqual({ dataSrc: "mcm", sql: "SELECT 1" });
    expect(sent(1).body.params).toEqual({ dataSrc: "mcm", sql: "SELECT 1" });
  });

  it("SQL 오류는 서버 메시지 그대로 거절한다(관리자 SQL 작성 도움 — §7.3)", async () => {
    reply({ meta: { success: false, message: "쿼리 오류: no such table: T" } });

    await expect(previewWidgetQuery("mcm", "SELECT * FROM T")).rejects.toThrow("쿼리 오류: no such table: T");
  });

  it("메시지가 없는 거절은 기본 문구", async () => {
    reply({ meta: { success: false } });

    await expect(previewWidgetQuery("mcm", "SELECT 1")).rejects.toThrow("요청이 거부되었습니다.");
  });
});

describe("unwrapResult", () => {
  it("data 와 data.result 를 펼치고 grids.{key}.rows 를 꺼낸다", () => {
    expect(
      unwrapResult({
        data: { result: { columns: ["A"], truncated: false }, extra: 1 },
        grids: { rows: { rows: [{ A: 1 }] } },
      })
    ).toEqual({ result: { columns: ["A"], truncated: false }, extra: 1, columns: ["A"], truncated: false, rows: [{ A: 1 }] });
  });

  it("빈 봉투는 빈 객체", () => {
    expect(unwrapResult(null)).toEqual({});
    expect(unwrapResult({})).toEqual({});
  });
});
