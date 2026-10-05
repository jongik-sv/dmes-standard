import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteWidgetDef, fetchWidgetDef, saveWidgetDef, searchWidgetDefs } from "./api";
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
  categoryCd: null,
  privateYn: "N",
  useYn: "Y",
  dataSrc: null,
  configJson: '{"markdown":""}',
};

describe("fetchWidgetDef", () => {
  it("widgetId 로 search 를 불러 정의 1건(configJson 포함)을 돌려준다", async () => {
    reply({
      meta: { success: true },
      data: { result: { defs: [{ widgetId: "def.a", srcTp: "D", configJson: '{"markdown":"본문"}' }] } },
    });
    const def = await fetchWidgetDef("def.a");
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/search");
    expect(sent().body).toEqual({ meta: { menuId: "commWidgetMng" }, params: { widgetId: "def.a" } });
    expect(def).toEqual({ widgetId: "def.a", srcTp: "D", configJson: '{"markdown":"본문"}' });
  });

  it("행이 없으면 null", async () => {
    reply({ meta: { success: true }, data: { result: { defs: [] } } });
    expect(await fetchWidgetDef("def.none")).toBeNull();
  });
});

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
    // 목록은 configJson 없이 받는다(행을 고를 때 fetchWidgetDef 로 받는다).
    expect(sent().body).toEqual({ meta: { menuId: "commWidgetMng" }, params: { includeConfig: false } });
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
  it("값이 있는 def 키를 params 로 평평하게 보내고 저장된 def(만든 widgetId)를 돌려준다", async () => {
    reply({ meta: { success: true }, data: { result: { def: { widgetId: "def.k3x9q2ab", srcTp: "D" } } } });
    const def = await saveWidgetDef(PARAMS);
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/save");
    expect(sent().body).toEqual({
      meta: { menuId: "commWidgetMng" },
      params: {
        widgetId: "",
        srcTp: "D",
        typeId: "markdown",
        title: "안내",
        defW: 8,
        defH: 10,
        multipleYn: "Y",
        useYn: "Y",
        privateYn: "N",
        configJson: '{"markdown":""}',
      },
    });
    expect(def.widgetId).toBe("def.k3x9q2ab");
  });

  it("null 값은 params 에서 뺀다(cactus 요청 변환기가 null 을 받으면 요청 전체가 실패한다)", async () => {
    reply({ meta: { success: true }, data: { result: { def: { widgetId: "def.k3x9q2ab" } } } });
    await saveWidgetDef(PARAMS);
    expect(Object.values(sent().body.params)).not.toContain(null);
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
