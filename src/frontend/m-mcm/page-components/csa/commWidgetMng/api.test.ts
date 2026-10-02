import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteWidgetDef, saveWidgetDef, searchWidgetDefs } from "./api";
import type { WidgetSaveParams } from "./types";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
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

const PARAMS: WidgetSaveParams = {
  widgetId: "",
  srcTp: "D",
  typeId: "markdown",
  title: "안내",
  subtitle: null,
  description: null,
  defW: 8,
  defH: 10,
  minW: null,
  minH: null,
  maxW: null,
  maxH: null,
  refreshSec: null,
  linkPageId: null,
  multipleYn: "Y",
  useYn: "Y",
  dataSrc: null,
  configJson: '{"markdown":""}',
};

describe("searchWidgetDefs", () => {
  it("commWidgetMng/search 를 부르고 data.result 의 defs·usage 를 푼다", async () => {
    reply({
      meta: { success: true },
      data: {
        result: {
          defs: [{ widgetId: "home.notice", srcTp: "C", title: "사내 공지", userCount: 3 }],
          usage: { "home.notice": 3, "home.kpi": "2" },
        },
      },
    });
    const out = await searchWidgetDefs();
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/search");
    expect(sent().body).toEqual({ meta: { menuId: "commWidgetMng" }, params: {} });
    expect(out.defs).toEqual([{ widgetId: "home.notice", srcTp: "C", title: "사내 공지", userCount: 3 }]);
    expect(out.usage).toEqual({ "home.notice": 3, "home.kpi": 2 });
  });

  it("빈 응답은 빈 목록·빈 사용 맵", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    expect(await searchWidgetDefs()).toEqual({ defs: [], usage: {} });
  });

  it("meta.success=false 면 서버 문구로 던진다", async () => {
    reply({ meta: { success: false, message: "권한이 없습니다(commWidgetMng.search)" } });
    await expect(searchWidgetDefs()).rejects.toThrow("권한이 없습니다(commWidgetMng.search)");
  });

  it("HTTP 오류면 던진다", async () => {
    reply({ error: { message: "서버 오류" } }, 500);
    await expect(searchWidgetDefs()).rejects.toThrow("서버 오류");
  });
});

describe("saveWidgetDef", () => {
  it("def Map 키 전부를 params 로 평평하게 보내고 저장된 def(만든 widgetId)를 돌려준다", async () => {
    reply({ meta: { success: true }, data: { result: { def: { widgetId: "def.k3x9q2ab", srcTp: "D" } } } });
    const def = await saveWidgetDef(PARAMS);
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/save");
    expect(sent().body).toEqual({ meta: { menuId: "commWidgetMng" }, params: PARAMS });
    expect(def.widgetId).toBe("def.k3x9q2ab");
  });

  it("거절 문구를 그대로 던진다", async () => {
    reply({ meta: { success: false, message: "아직 지원하지 않는 모듈입니다" } });
    await expect(saveWidgetDef(PARAMS)).rejects.toThrow("아직 지원하지 않는 모듈입니다");
  });

  it("응답에 def 가 없으면 보낸 widgetId 로 대신한다", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    expect((await saveWidgetDef({ ...PARAMS, widgetId: "home.notice", srcTp: "C" })).widgetId).toBe("home.notice");
  });
});

describe("deleteWidgetDef", () => {
  it("widgetId 를 보내고 지운 ID 를 돌려준다", async () => {
    reply({ meta: { success: true }, data: { result: { deleted: "def.k3x9q2ab" } } });
    expect(await deleteWidgetDef("def.k3x9q2ab")).toBe("def.k3x9q2ab");
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/delete");
    expect(sent().body.params).toEqual({ widgetId: "def.k3x9q2ab" });
  });

  it("사용 중 거절 문구를 그대로 던진다", async () => {
    reply({ meta: { success: false, message: "사용 중인 위젯은 지울 수 없습니다. 사용 중지하세요" } });
    await expect(deleteWidgetDef("def.k3x9q2ab")).rejects.toThrow("사용 중인 위젯은 지울 수 없습니다. 사용 중지하세요");
  });
});
