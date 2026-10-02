import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INITIAL_DEFS_STATE,
  defsReducer,
  fetchWidgetDefs,
  homeItemsFromRows,
  pickHomeDefault,
  typeTitlesOf,
  type DefsState,
} from "./widget-defs";

/** 홈 위젯 정의 호출 시험 — @dk-oasis/shared 를 런타임 import 하지 않는다(타입만). 스펙 widget-admin-generic §11. */

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

describe("homeItemsFromRows", () => {
  it("서버 한 줄(posX·sizeW·lockYn)을 WidgetItem(x·w·locked)으로 바꾼다 — 문자열 숫자도 숫자로", () => {
    const items = homeItemsFromRows([
      { instId: "default-kpi", widgetId: "home.kpi", posX: "0", posY: "0", sizeW: "24", sizeH: "7", lockYn: "Y" },
      { instId: "default-notice", widgetId: "home.notice", posX: 0, posY: 7, sizeW: 10, sizeH: 16, lockYn: "N" },
    ]);
    expect(items).toEqual([
      { instId: "default-kpi", widgetId: "home.kpi", x: 0, y: 0, w: 24, h: 7, locked: true, config: null },
      { instId: "default-notice", widgetId: "home.notice", x: 0, y: 7, w: 10, h: 16, locked: false, config: null },
    ]);
  });

  it("lockYn 이 Y 가 아니면 잠그지 않는다(없음·null 포함)", () => {
    const [a, b] = homeItemsFromRows([
      { instId: "a", widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 4, sizeH: 4 },
      { instId: "b", widgetId: "home.kpi", posX: 4, posY: 0, sizeW: 4, sizeH: 4, lockYn: null },
    ]);
    expect(a.locked).toBe(false);
    expect(b.locked).toBe(false);
  });

  it("빈 배열은 빈 배열", () => {
    expect(homeItemsFromRows([])).toEqual([]);
  });

  it("instId·widgetId 가 없는 줄과 객체가 아닌 줄은 건너뛴다", () => {
    const items = homeItemsFromRows([
      null,
      "x",
      { widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 4, sizeH: 4 },
      { instId: "n", posX: 0, posY: 0, sizeW: 4, sizeH: 4 },
      { instId: "ok", widgetId: "home.kpi", posX: 1, posY: 2, sizeW: 3, sizeH: 4 },
    ]);
    expect(items.map((i) => i.instId)).toEqual(["ok"]);
  });

  it("숫자가 아닌 좌표는 0 으로 둔다(보드가 크기 범위로 다시 자른다)", () => {
    const [it] = homeItemsFromRows([{ instId: "a", widgetId: "home.kpi", posX: "abc", posY: null, sizeW: undefined, sizeH: "" }]);
    expect([it.x, it.y, it.w, it.h]).toEqual([0, 0, 0, 0]);
  });
});

describe("fetchWidgetDefs", () => {
  it("POST /api/mcm/oasis/widgetDef/list 를 부르고 defs 원본과 기본 배치를 돌려준다", async () => {
    reply({
      meta: { success: true },
      data: {
        result: {
          defs: [
            { widgetId: "def.k3x9q2ab", srcTp: "D", typeId: "markdown", configJson: '{"md":"안녕"}', useYn: "Y" },
            { widgetId: "home.kpi", srcTp: "C", title: "핵심 지표", useYn: "N" },
          ],
          homeDefault: [{ instId: "default-kpi", widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 24, sizeH: 7, lockYn: "N" }],
          homeDefaultKey: "D100",
        },
      },
    });
    const out = await fetchWidgetDefs();

    const req = sent();
    expect(req.url).toBe("/api/mcm/oasis/widgetDef/list");
    expect(req.method).toBe("POST");
    expect(req.body.params).toEqual({});
    expect(req.body.meta).toEqual({ menuId: "HOME" });

    expect(out.rawDefs).toHaveLength(2);
    // 변환(toWidgetDefRow)은 page.tsx 가 shared 로 한다 — 여기서는 서버 줄을 그대로 둔다.
    expect(out.rawDefs[0]).toMatchObject({ widgetId: "def.k3x9q2ab", configJson: '{"md":"안녕"}' });
    expect(out.homeDefault).toEqual([
      { instId: "default-kpi", widgetId: "home.kpi", x: 0, y: 0, w: 24, h: 7, locked: false, config: null },
    ]);
  });

  it("homeDefault 가 null 이면 null 로 둔다(화면이 코드 상수를 쓴다)", async () => {
    reply({ meta: { success: true }, data: { result: { defs: [], homeDefault: null, homeDefaultKey: null } } });
    const out = await fetchWidgetDefs();
    expect(out.rawDefs).toEqual([]);
    expect(out.homeDefault).toBeNull();
  });

  it("homeDefault 키가 없거나 배열이 아니어도 null", async () => {
    reply({ meta: { success: true }, data: { result: { defs: [] } } });
    expect((await fetchWidgetDefs()).homeDefault).toBeNull();
    reply({ meta: { success: true }, data: { result: { defs: [], homeDefault: "x" } } });
    expect((await fetchWidgetDefs()).homeDefault).toBeNull();
  });

  it("defs 가 없거나 배열이 아니면 빈 목록, 객체가 아닌 줄은 뺀다", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    expect((await fetchWidgetDefs()).rawDefs).toEqual([]);
    reply({ meta: { success: true }, data: { result: { defs: [null, 3, "x", { widgetId: "home.kpi", srcTp: "C" }] } } });
    expect((await fetchWidgetDefs()).rawDefs).toEqual([{ widgetId: "home.kpi", srcTp: "C" }]);
  });

  it("meta.success=false 면 서버 메시지로 던진다(HTTP 200)", async () => {
    reply({ meta: { success: false, message: "위젯 정의를 불러올 수 없습니다." } });
    await expect(fetchWidgetDefs()).rejects.toThrow("위젯 정의를 불러올 수 없습니다.");
  });

  it("meta.success=false 에 메시지가 없으면 기본 문구", async () => {
    reply({ meta: { success: false, message: "  " } });
    await expect(fetchWidgetDefs()).rejects.toThrow("요청이 거부되었습니다.");
  });

  it("HTTP 오류(500)도 던진다 — 조용히 빈 목록으로 두지 않는다", async () => {
    reply({ message: "서버 오류" }, 500);
    await expect(fetchWidgetDefs()).rejects.toThrow("서버 오류");
  });

  it("네트워크 실패도 던진다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchWidgetDefs()).rejects.toThrow();
  });
});

describe("pickHomeDefault", () => {
  const fallback = [{ instId: "f", widgetId: "home.kpi", x: 0, y: 0, w: 4, h: 4, locked: false, config: null }];
  const server = [{ instId: "s", widgetId: "home.notice", x: 0, y: 0, w: 4, h: 4, locked: false, config: null }];

  it("서버 값이 있으면 그것", () => {
    expect(pickHomeDefault(server, fallback)).toBe(server);
  });

  it("null 이면 코드 상수", () => {
    expect(pickHomeDefault(null, fallback)).toBe(fallback);
  });

  it("빈 배열이면 코드 상수(위젯이 하나도 없는 홈을 기본으로 삼지 않는다)", () => {
    expect(pickHomeDefault([], fallback)).toBe(fallback);
  });
});

describe("typeTitlesOf", () => {
  it("유형 등록부에서 유형 ID → 이름 맵을 만든다", () => {
    expect(
      typeTitlesOf({
        "query-table": { meta: { title: "쿼리 표" } },
        markdown: { meta: { title: "글(md)" } },
      })
    ).toEqual({ "query-table": "쿼리 표", markdown: "글(md)" });
  });

  it("빈 등록부는 빈 맵", () => {
    expect(typeTitlesOf({})).toEqual({});
  });
});

/** Review Focus 1 — 정의 조회 중·실패일 때 화면이 WidgetWorkspace 에 넘길 상태(loading·error)가 맞게 바뀌는지. */
describe("defsReducer (registryStatus)", () => {
  const defs = [{ widgetId: "def.aaaaaaaa", srcTp: "D" }];
  const home = [{ instId: "s", widgetId: "home.kpi", x: 0, y: 0, w: 4, h: 4, locked: false, config: null }];

  it("처음은 loading — 응답 전에는 [배치 편집]을 막는다", () => {
    expect(INITIAL_DEFS_STATE).toEqual({ status: "loading", rawDefs: [], homeDefault: null });
  });

  it("응답이 오면 ready 와 정의·기본 배치", () => {
    const next = defsReducer(INITIAL_DEFS_STATE, { type: "loaded", rawDefs: defs, homeDefault: home });
    expect(next).toEqual({ status: "ready", rawDefs: defs, homeDefault: home });
  });

  it("실패하면 error — 코드 등록부만 남고 편집은 막힌다", () => {
    const next = defsReducer(INITIAL_DEFS_STATE, { type: "failed" });
    expect(next.status).toBe("error");
    expect(next.rawDefs).toEqual([]);
    expect(next.homeDefault).toBeNull();
  });

  it("다시 시도하면 error → loading(버튼이 막히고 띠가 사라진다), 성공하면 ready", () => {
    const failed = defsReducer(INITIAL_DEFS_STATE, { type: "failed" });
    const retrying = defsReducer(failed, { type: "retry" });
    expect(retrying.status).toBe("loading");
    expect(defsReducer(retrying, { type: "loaded", rawDefs: defs, homeDefault: null }).status).toBe("ready");
  });

  it("loading·error 로 바뀌어도 rawDefs 객체는 그대로(등록부가 다시 합쳐지지 않는다)", () => {
    const ready: DefsState = defsReducer(INITIAL_DEFS_STATE, { type: "loaded", rawDefs: defs, homeDefault: home });
    expect(defsReducer(ready, { type: "retry" }).rawDefs).toBe(ready.rawDefs);
    expect(defsReducer(ready, { type: "failed" }).rawDefs).toBe(ready.rawDefs);
  });
});
