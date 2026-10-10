/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import ErdEditPage from "../../../pages/dma/erdEdit/page";
import type { ErdModelView } from "../../../pages/dma/erdEdit/types";
import { FakeEventSource as FakeES, MENU_DIAGRAMS, emptyModel, menuModel, viewOf } from "./erd-fixtures";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
const g = globalThis as unknown as { EventSource?: unknown };
const originalEventSource = g.EventSource;

const MODEL_ROW = { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM 스키마", rev: 3, draftVer: "1.000", ownerId: "tester" };
const STATUS = {
  modelId: "mcm", ver: "1.000", rev: 3, statuses: { "c-1": "OK", "c-2": "MISS", "c-4": "NEW", "c-3": "OK" },
  domains: { "12": { name: "아이디", dataType: "VARCHAR2", length: 30, scale: null } },
  counts: { OK: 2, ALIAS: 0, NEW: 1, TYPE: 0, DOMAIN: 0, MISS: 1 }, elapsedMs: 5,
};

let calls: Array<{ action: string; params: Record<string, unknown> }> = [];
let currentView: ErdModelView;
let host: HTMLDivElement;
let root: Root | null = null;

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

function stubFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    if (u === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      return new Response(JSON.stringify({ grids: { buttons: { rows: [{ objId: "*", action: "*" }] } } }), { status: 200 });
    }
    if (!u.startsWith("/api/mdm/oasis/erdEdit/")) return new Response("{}", { status: 401 });
    const action = u.split("/").pop() ?? "";
    const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
    calls.push({ action, params });
    if (action === "search") return ok([MODEL_ROW]);
    if (action === "view" && params.kind === "STATUS") return ok(STATUS);
    if (action === "view" && params.kind === "SET_VIEW") return ok({ ok: true });
    if (action === "view" && params.sinceRev !== undefined) return ok({ rev: currentView.rev, reload: false, deltas: [] });
    if (action === "view") return ok(currentView);
    if (action === "compare") return ok({ modelId: "mcm", rev: currentView.rev, schema: "MCMAPUSER", items: [] });
    if (action === "save") {
      return ok({ applied: true, rev: currentView.rev + 1, warnings: [], rejection: null,
        changes: [{ kind: "relation", id: "r-1", op: "patch", value: { state: "CONFIRMED" } }] });
    }
    if (action === "import") {
      return ok({ applied: true, rev: 4, changes: [], warnings: [], rejection: null,
        summary: { tables: 2, columns: 4, keys: 2, relations: { DB: 0, INFERRED: 1 }, diagramId: "d-all" } });
    }
    return ok({});
  }) as typeof fetch;
}

async function settle(ms = 50) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function waitGone(get: () => unknown, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (get()) {
    if (Date.now() > end) throw new Error("사라져야 할 요소가 남아 있다");
    await settle(25);
  }
}

async function waitFor<T>(get: () => T | null | undefined, ms = 2000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() > end) throw new Error("기다린 요소가 나타나지 않았다");
    await settle(25);
  }
}

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function click(el: Element | null) {
  expect(el, "누를 요소가 없다").not.toBeNull();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

/** 화면을 열고 모델을 골라 SSE 를 연 상태까지 간다. */
async function openModel() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(ErdEditPage)));
  });
  await click(await waitFor(() => byTestId("erd-model-mcm")));
  await waitFor(() => FakeES.all[0]);
  await act(async () => {
    FakeES.all[0].emit("open");
  });
  await settle(600); // 표준 상태는 0.5초 미뤄 읽는다
}

const viewCalls = () => calls.filter((c) => c.action === "view" && c.params.kind === undefined && c.params.sinceRev === undefined);

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  FakeES.all = [];
  g.EventSource = FakeES;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  // Node 22+ 의 전역 localStorage(--localstorage-file 없으면 undefined)가 happy-dom 것을 가려 callOasis 의 토큰 읽기가 던진다.
  // 다른 화면 렌더 시험(dmb/layoutMng/page-render.test.ts)과 같이 갈음한다.
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  currentView = viewOf(menuModel(), MENU_DIAGRAMS);
  stubFetch();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  globalThis.fetch = originalFetch;
  g.EventSource = originalEventSource;
  vi.unstubAllGlobals();
});

describe("erdEdit 화면", () => {
  it("모델을 고르면 rev·다이어그램을 보이고, SSE 를 sinceRev 로 열고, 화면 상태를 알린다", async () => {
    await openModel();
    expect(calls[0].action).toBe("search");
    expect(byTestId("erd-rev")?.textContent).toBe("rev 3");
    expect(byTestId("erd-diagram-d-all")?.textContent).toContain("전체");
    expect(FakeES.all[0].url).toMatch(/^\/api\/mdm\/rest\/erdEdit\/view\/api\/mdm\/erd\/stream\/mcm\?session=ui-[0-9a-z]{8}&source=UI&sinceRev=3$/);
    const setView = calls.filter((c) => c.action === "view" && c.params.kind === "SET_VIEW");
    expect(setView).toHaveLength(1);
    expect(JSON.parse(String(setView[0].params.viewJson))).toEqual({ diagramId: "d-all", selectedTables: [] });
    expect(setView[0].params.session).toBe(new URL(FakeES.all[0].url, "http://x").searchParams.get("session"));
    expect(calls.some((c) => c.action === "view" && c.params.kind === "STATUS")).toBe(true);
    expect(byTestId("erd-banner-readonly")).toBeNull();
  });

  it("추정 관계를 확정하면 save 에 confirmRelation 을 보내고, 응답을 얹어 목록에서 뺀다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1")));
    const save = calls.filter((c) => c.action === "save");
    expect(save).toHaveLength(1);
    expect(save[0].params).toMatchObject({ modelId: "mcm", baseRev: 3, source: "UI", commandsJson: '[{"op":"confirmRelation","id":"r-1"}]' });
    expect(String(save[0].params.session)).toMatch(/^ui-/);
    expect(byTestId("erd-rev")?.textContent).toBe("rev 4");
    expect(byTestId("erd-message")?.textContent).toBe("관계를 확정했습니다.");
    await waitGone(() => byTestId("erd-confirm-r-1"));
  });

  it("연결이 끊기면 끊김 띠를 띄우고 확정을 막는다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    const btn = await waitFor(() => byTestId("erd-confirm-r-1"));
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      FakeES.all[0].emit("error");
    });
    await settle();
    expect(byTestId("erd-banner-lost")).not.toBeNull();
    expect((byTestId("erd-confirm-r-1") as HTMLButtonElement).disabled).toBe(true);
  });

  it("확정된 버전을 보면 읽기 전용 띠를 보이고 확정을 막는다", async () => {
    currentView = viewOf(menuModel(), { ...MENU_DIAGRAMS, status: "RELEASED" });
    await openModel();
    expect(byTestId("erd-banner-readonly")?.textContent).toContain("확정된 버전");
    await click(byTestId("erd-tab-inferred"));
    expect(((await waitFor(() => byTestId("erd-confirm-r-1"))) as HTMLButtonElement).disabled).toBe(true);
  });

  it("표가 없는 모델은 [DB 가져오기] 로 import kind=FROM_DB 를 보내고 모델을 다시 읽는다", async () => {
    currentView = viewOf(emptyModel(), {});
    await openModel();
    expect(byTestId("erd-canvas-empty")?.textContent).toContain("표가 없습니다");
    expect(viewCalls()).toHaveLength(1);
    currentView = viewOf(menuModel(), { ...MENU_DIAGRAMS, rev: 4 });
    await click(byTestId("erd-import"));
    await settle();
    expect(calls.find((c) => c.action === "import")?.params).toEqual({
      modelId: "mcm", baseRev: 3, session: expect.stringMatching(/^ui-/), source: "UI", kind: "FROM_DB",
    });
    expect(viewCalls()).toHaveLength(2);
    expect(byTestId("erd-message")?.textContent).toBe("표 2개·컬럼 4개·키 2개, 관계 DB 0개·추정 1개를 가져왔습니다.");
    expect(byTestId("erd-rev")?.textContent).toBe("rev 4");
    expect(byTestId("erd-import")).toBeNull();
  });

  it("가져오기 응답을 기다리는 동안 다른 모델을 고르면 옛 응답으로 새 모델을 덮지 않는다", async () => {
    currentView = viewOf(emptyModel(), {});
    const inner = globalThis.fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const mesView = viewOf(menuModel(), { ...MENU_DIAGRAMS, modelId: "mes", rev: 7 });
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const action = u.split("/").pop() ?? "";
      const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
      if (u.startsWith("/api/mdm/oasis/erdEdit/")) {
        if (action === "search") return ok([MODEL_ROW, { ...MODEL_ROW, modelId: "mes", modelName: "MES 스키마" }]);
        if (action === "view" && params.modelId === "mes" && params.kind === undefined && params.sinceRev === undefined) {
          calls.push({ action, params });
          return ok(mesView);
        }
        if (action === "import") {
          calls.push({ action, params });
          await gate;
          return ok({ applied: true, rev: 4, changes: [], warnings: [], rejection: null,
            summary: { tables: 2, columns: 4, keys: 2, relations: { DB: 0, INFERRED: 1 }, diagramId: "d-all" } });
        }
      }
      return inner(url, init);
    }) as typeof fetch;
    await openModel();
    await click(byTestId("erd-import"));
    await click(byTestId("erd-model-mes"));
    await waitFor(() => (byTestId("erd-rev")?.textContent === "rev 7" ? byTestId("erd-rev") : null));
    const readsBefore = viewCalls().length;
    release();
    await settle(100);
    expect(byTestId("erd-message")?.textContent).not.toContain("가져왔습니다");
    expect(byTestId("erd-rev")?.textContent).toBe("rev 7");
    expect(viewCalls()).toHaveLength(readsBefore); // 옛 모델 기준 reload 가 새 모델 읽기를 덮지 않는다
  });

  it("관계를 확정하면 DB 차이 탭을 다시 읽는다", async () => {
    await openModel();
    await click(byTestId("erd-tab-diff"));
    await waitFor(() => calls.find((c) => c.action === "compare"));
    expect(calls.filter((c) => c.action === "compare")).toHaveLength(1);
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1")));
    await click(byTestId("erd-tab-diff"));
    await settle();
    expect(calls.filter((c) => c.action === "compare")).toHaveLength(2);
  });
});
