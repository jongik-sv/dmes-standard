import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteLayout,
  fetchWidgetDefRows,
  loadLayout,
  saveLayout,
  searchDepts,
  searchLayouts,
} from "./layout-api";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

function sent(i = 0): { url: string; body: { meta: Record<string, unknown>; params: Record<string, unknown>; grids?: Record<string, { rows: unknown[] }> } } {
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

describe("searchLayouts", () => {
  it("commWidgetMng/searchLayouts 를 params 없이 부르고 data.result.layouts 를 푼다", async () => {
    reply({
      meta: { success: true },
      data: {
        result: {
          layouts: [
            { layoutKey: "*", deptNm: "전사", count: 11 },
            { layoutKey: "D100", deptNm: "생산팀", count: "5" },
          ],
        },
      },
    });
    const out = await searchLayouts();
    expect(out).toEqual([
      { layoutKey: "*", deptNm: "전사", count: 11 },
      { layoutKey: "D100", deptNm: "생산팀", count: 5 },
    ]);
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/commWidgetMng/searchLayouts");
    expect(body.meta).toEqual({ menuId: "commWidgetMng" });
    expect(body.params).toEqual({});
  });

  it("layouts 가 없으면 빈 배열, layoutKey 가 없는 줄은 버린다", async () => {
    reply({ meta: { success: true }, data: { result: { layouts: [{ deptNm: "키없음", count: 1 }, { layoutKey: "D1", deptNm: null, count: null }] } } });
    expect(await searchLayouts()).toEqual([{ layoutKey: "D1", deptNm: "", count: 0 }]);
    reply({ meta: { success: true }, data: { result: {} } });
    expect(await searchLayouts()).toEqual([]);
  });

  it("업무 거절(HTTP 200 + meta.success=false)은 서버 문구로 던진다", async () => {
    reply({ meta: { success: false, message: "권한이 없습니다." } });
    await expect(searchLayouts()).rejects.toThrow("권한이 없습니다.");
  });

  it("HTTP 오류는 서버 메시지로 던진다", async () => {
    reply({ message: "서버 오류" }, 500);
    await expect(searchLayouts()).rejects.toThrow("서버 오류");
  });
});

describe("loadLayout", () => {
  it("기본은 effective=Y 로 부르고 items 를 위젯 항목으로 바꾼다", async () => {
    reply({
      meta: { success: true },
      data: {
        result: {
          layoutKey: "D100",
          sourceKey: "*",
          items: [{ instId: "default-kpi", widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 24, sizeH: 7, lockYn: "N" }],
        },
      },
    });
    const out = await loadLayout("D100");
    expect(out).toEqual({
      layoutKey: "D100",
      sourceKey: "*",
      items: [{ instId: "default-kpi", widgetId: "home.kpi", x: 0, y: 0, w: 24, h: 7, locked: false, config: null }],
    });
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/commWidgetMng/loadLayout");
    expect(body.params).toEqual({ layoutKey: "D100", effective: "Y" });
  });

  it("effective 를 N 으로 줄 수 있다", async () => {
    reply({ meta: { success: true }, data: { result: { layoutKey: "*", sourceKey: null, items: [] } } });
    await loadLayout("*", "N");
    expect(sent().body.params).toEqual({ layoutKey: "*", effective: "N" });
  });

  it("아무 배치도 없으면 items=[]·sourceKey=null", async () => {
    reply({ meta: { success: true }, data: { result: { layoutKey: "*", sourceKey: null, items: [] } } });
    expect(await loadLayout("*")).toEqual({ layoutKey: "*", sourceKey: null, items: [] });
  });

  it("응답에 layoutKey 가 빠져도 요청한 키를 쓴다", async () => {
    reply({ meta: { success: true }, data: { result: { items: [] } } });
    expect(await loadLayout("D100")).toEqual({ layoutKey: "D100", sourceKey: null, items: [] });
  });
});

describe("saveLayout", () => {
  it("params.layoutKey + grids.widgets.rows(posX·sizeW·lockYn 모양)로 보내고 userId 는 싣지 않는다", async () => {
    reply({ meta: { success: true }, data: { result: { layoutKey: "D100", count: 2 } } });
    const out = await saveLayout("D100", [
      { instId: "a", widgetId: "home.kpi", x: 0, y: 0, w: 24, h: 7, locked: true, config: null },
      { instId: "b", widgetId: "home.notice", x: 0, y: 7, w: 10, h: 16, locked: false, config: null },
    ]);
    expect(out).toEqual({ layoutKey: "D100", count: 2 });
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/commWidgetMng/saveLayout");
    expect(body.params).toEqual({ layoutKey: "D100" });
    expect(body.grids).toEqual({
      widgets: {
        rows: [
          { instId: "a", widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 24, sizeH: 7, lockYn: "Y" },
          { instId: "b", widgetId: "home.notice", posX: 0, posY: 7, sizeW: 10, sizeH: 16, lockYn: "N" },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain("userId");
  });

  it("서버가 거절하면(빈 배치 등) 서버 문구로 던진다", async () => {
    reply({ meta: { success: false, message: "위젯이 하나도 없는 기본 배치는 저장할 수 없습니다." } });
    await expect(saveLayout("*", [])).rejects.toThrow("위젯이 하나도 없는 기본 배치는 저장할 수 없습니다.");
  });
});

describe("deleteLayout", () => {
  it("params.layoutKey 만 보낸다", async () => {
    reply({ meta: { success: true }, data: { result: { layoutKey: "D100" } } });
    await deleteLayout("D100");
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/commWidgetMng/deleteLayout");
    expect(body.params).toEqual({ layoutKey: "D100" });
    expect(body.grids).toBeUndefined();
  });
});

describe("searchDepts", () => {
  it("keyword 를 앞뒤 공백 없이 보내고 depts 를 푼다", async () => {
    reply({
      meta: { success: true },
      data: { result: { depts: [{ deptCd: "D100", deptNm: "생산팀", upperDeptCd: "D10" }, { deptCd: "D200", deptNm: "품질팀" }] } },
    });
    const out = await searchDepts("  생산 ");
    expect(out).toEqual([
      { deptCd: "D100", deptNm: "생산팀", upperDeptCd: "D10" },
      { deptCd: "D200", deptNm: "품질팀", upperDeptCd: null },
    ]);
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/commWidgetMng/searchDepts");
    expect(body.params).toEqual({ keyword: "생산" });
  });

  it("deptCd 가 없는 줄은 버린다", async () => {
    reply({ meta: { success: true }, data: { result: { depts: [{ deptNm: "코드없음" }] } } });
    expect(await searchDepts("")).toEqual([]);
  });
});

describe("fetchWidgetDefRows — 등록부 합치기용 정의 목록", () => {
  it("widgetDef/list 의 defs 줄을 그대로(변환 없이) 돌려준다", async () => {
    reply({
      meta: { success: true },
      data: {
        result: {
          defs: [{ widgetId: "def.k3x9q2ab", srcTp: "D", typeId: "markdown", title: "공지", useYn: "Y", configJson: "{}" }],
          homeDefault: null,
          homeDefaultKey: null,
        },
      },
    });
    const rows = await fetchWidgetDefRows();
    expect(rows).toEqual([{ widgetId: "def.k3x9q2ab", srcTp: "D", typeId: "markdown", title: "공지", useYn: "Y", configJson: "{}" }]);
    expect(sent().url).toBe("/api/mcm/oasis/widgetDef/list");
    expect(sent().body.params).toEqual({});
  });

  it("defs 가 없으면 빈 배열, 객체가 아닌 줄은 버린다", async () => {
    reply({ meta: { success: true }, data: { result: { defs: [null, "x", { widgetId: "a.b" }] } } });
    expect(await fetchWidgetDefRows()).toEqual([{ widgetId: "a.b" }]);
    reply({ meta: { success: true }, data: { result: {} } });
    expect(await fetchWidgetDefRows()).toEqual([]);
  });

  it("실패는 던진다(화면이 registryStatus=error 로 넘긴다)", async () => {
    reply({ meta: { success: false, message: "조회 실패" } });
    await expect(fetchWidgetDefRows()).rejects.toThrow("조회 실패");
  });
});
