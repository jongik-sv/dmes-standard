/** @vitest-environment happy-dom */
import { act, createElement, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isMacPlatform } from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { RelationPickContext } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { settleGrid } from "../../dme/helpers/render";

import ErdEditPage from "../../../pages/dma/erdEdit/page";
import { LOST_TEXT, RELEASED_TEXT, shortReason } from "../../../pages/dma/erdEdit/state/permissions";
import { prefsKey } from "../../../pages/dma/erdEdit/state/prefs";
import { countTableViolations, modelSummary } from "../../../pages/dma/erdEdit/state/violations";
import type { ErdModelView } from "../../../pages/dma/erdEdit/types";
import { FakeEventSource as FakeES, MENU_DIAGRAMS, column, emptyModel, menuModel, viewOf } from "./erd-fixtures";

// happy-dom 은 손잡이를 재지 못해 React Flow 가 노드·선을 그리지 않는다. 캔버스 안(Provider 아래)에 눌림 단추 하나를 얹어
// 화면이 건 RelationPickContext 값(추정 선을 눌렀을 때 실제로 불리는 콜백)을 그대로 부른다. 운영 코드는 건드리지 않는다.
vi.mock("../../../pages/dma/erdEdit/canvas/useCanvasEditing", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../../pages/dma/erdEdit/canvas/useCanvasEditing")>();
  const PickProbe = () => {
    const onPick = useContext(RelationPickContext);
    return createElement("button", { type: "button", "data-testid": "erd-probe-pick", onClick: () => onPick?.("r-1") });
  };
  return {
    ...orig,
    useCanvasEditing: (...args: Parameters<typeof orig.useCanvasEditing>) => {
      const r = orig.useCanvasEditing(...args);
      return { ...r, overlay: createElement("div", null, r.overlay, createElement(PickProbe)) };
    },
  };
});

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
const g = globalThis as unknown as { EventSource?: unknown };
const originalEventSource = g.EventSource;

const MODEL_ROW = { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM 스키마", rev: 3, draftVer: "1.000", ownerId: "tester" };
let searchRows: unknown[] = [MODEL_ROW];
let statusResult: unknown;
const STATUS = {
  modelId: "mcm", ver: "1.000", rev: 3, statuses: { "c-1": "OK", "c-2": "MISS", "c-4": "NEW", "c-3": "OK" },
  domains: { "12": { name: "아이디", dataType: "VARCHAR2", length: 30, scale: null } },
  counts: { OK: 2, ALIAS: 0, NEW: 1, TYPE: 0, DOMAIN: 0, MISS: 1 }, elapsedMs: 5,
};

let calls: Array<{ action: string; params: Record<string, unknown> }> = [];
let currentView: ErdModelView;
let restoreResult: unknown;
let historyDeltas: Array<Record<string, unknown> & { rev: number }> = [];
/** 다시 읽기 지점(표시 행) rev. 서버 규칙대로 sinceRev 가 이보다 작으면 reload·fromRev 를 준다(ErdCommandService.changesSince). */
let historyMarker = 0;
let validateResult: unknown;
/** 버튼 권한 행. 기본은 전부 허용, 시험이 copy 를 뺄 수 있다(자동 DRAFT 가 꺼진 확정본 시험). */
let buttonRows: Array<{ objId: string; action: string }> = [{ objId: "*", action: "*" }];
const NO_COPY_ROWS = ["save", "confirm", "execute", "import", "reg", "delete", "lock", "unlock"].map((action) => ({ objId: "erdEdit", action }));
let host: HTMLDivElement;
let root: Root | null = null;
/** 시험마다 새로 만드는 localStorage 흉내(beforeEach). 작업 상태(prefs)를 미리 넣을 때 쓴다. */
let prefsStore: Map<string, string>;
const CURRENT_USER_STORE_KEY = "__dkOasisCurrentUserStore__";

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

/** 목록 결과 — 서버는 List 반환을 `grids.result.rows` 로 준다(search). */
function okRows(rows: unknown[]) {
  return new Response(JSON.stringify({ meta: { success: true }, data: {}, grids: { result: { rows } } }), { status: 200 });
}

function stubFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    if (u === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      return new Response(JSON.stringify({ grids: { buttons: { rows: buttonRows } } }), { status: 200 });
    }
    if (!u.startsWith("/api/mdm/oasis/erdEdit/")) return new Response("{}", { status: 401 });
    const action = u.split("/").pop() ?? "";
    const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
    calls.push({ action, params });
    if (action === "search") return okRows(searchRows);
    if (action === "view" && params.kind === "STATUS") return ok(statusResult);
    if (action === "view" && params.kind === "SET_VIEW") return ok({ ok: true });
    if (action === "view" && params.sinceRev !== undefined) {
      const since = Number(params.sinceRev);
      if (since < historyMarker) return ok({ rev: currentView.rev, reload: true, deltas: [], fromRev: historyMarker });
      return ok({ rev: currentView.rev, reload: false, deltas: historyDeltas.filter((d) => d.rev > since), fromRev: null });
    }
    if (action === "view") return ok(currentView);
    if (action === "compare") return ok({ modelId: "mcm", rev: currentView.rev, schema: "MCMAPUSER", items: [] });
    if (action === "save") {
      return ok({ applied: true, rev: currentView.rev + 1, warnings: [], rejection: null,
        changes: [{ kind: "relation", id: "r-1", op: "patch", value: { state: "CONFIRMED" } }] });
    }
    if (action === "restore") return ok(restoreResult);
    if (action === "lock" || action === "unlock") return ok({ rowVersion: Number(params.rowVersion) + 1 });
    if (action === "validate") return ok(validateResult);
    if (action === "copy") {
      currentView = { ...currentView, ver: "1.001", status: "DRAFT", ownerId: "tester", rev: currentView.rev + 1 };
      return ok({ ver: "1.001" });
    }
    if (action === "confirm" || action === "execute") return ok({ ok: true });
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
const docTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function typeInto(el: HTMLElement | null, value: string) {
  expect(el, "입력 칸이 없다").not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: Element | null) {
  expect(el, "누를 요소가 없다").not.toBeNull();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

/** 화면만 연다(모델은 고르지 않음). */
async function renderPage() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(ErdEditPage)));
  });
}

/** 화면을 열고 모델을 골라 SSE 를 연 상태까지 간다. */
async function openModel() {
  await renderPage();
  await click(await waitFor(() => byTestId("erd-model-mcm")));
  await waitFor(() => FakeES.all[0]);
  await act(async () => {
    FakeES.all[0].emit("open");
  });
  await settle(600); // 표준 상태는 0.5초 미뤄 읽는다
}

const viewCalls = () => calls.filter((c) => c.action === "view" && c.params.kind === undefined && c.params.sinceRev === undefined);
/** 위 막대 [버전 ▾] 의 번호(rev) — 트리거 글자 칸의 data-rev. */
const shownRev = () => byTestId("erd-ver-trigger")?.dataset.rev;
/** [버전 ▾] 팝오버를 연다. 본문은 document.body 로 포털된다. */
const openVersion = async () => {
  await click(byTestId("erd-ver-trigger"));
  await waitFor(() => docTestId("erd-ver-pop"));
};

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  FakeES.all = [];
  g.EventSource = FakeES;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  // Node 22+ 의 전역 localStorage(--localstorage-file 없으면 undefined)가 happy-dom 것을 가려 callOasis 의 토큰 읽기가 던진다.
  // 다른 화면 렌더 시험(dmb/layoutMng/page-render.test.ts)과 같이 갈음한다.
  // 작업 상태(prefs)가 시험 사이에 새지 않게 Map 은 시험마다 새로 만든다(앞 시험의 언마운트 저장이 다음 시험에 남지 않게).
  const store = new Map<string, string>();
  prefsStore = store;
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k), clear: () => store.clear(),
  });
  currentView = viewOf(menuModel(), MENU_DIAGRAMS);
  searchRows = [MODEL_ROW];
  statusResult = STATUS;
  historyDeltas = [];
  historyMarker = 0;
  buttonRows = [{ objId: "*", action: "*" }];
  validateResult = { errors: [], warnings: [] };
  restoreResult = { applied: true, rev: 5, rowVersion: 2, warnings: [], rejection: null,
    changes: [{ kind: "relation", id: "r-1", op: "patch", value: { state: "INFERRED" } }] };
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
    expect(shownRev()).toBe("3");
    expect(byTestId("erd-diagram-d-all")?.textContent).toContain("전체");
    expect(FakeES.all[0].url).toMatch(/^\/api\/mdm\/rest\/erdEdit\/view\/api\/mdm\/erd\/stream\/mcm\?session=ui-[0-9a-z]{8}&source=UI&sinceRev=3$/);
    const setView = calls.filter((c) => c.action === "view" && c.params.kind === "SET_VIEW");
    expect(setView).toHaveLength(1);
    expect(JSON.parse(String(setView[0].params.viewJson))).toEqual({ diagramId: "d-all", selectedTables: [] });
    expect(setView[0].params.session).toBe(new URL(FakeES.all[0].url, "http://x").searchParams.get("session"));
    expect(calls.some((c) => c.action === "view" && c.params.kind === "STATUS")).toBe(true);
    expect(byTestId("erd-readonly-chip")).toBeNull();
  });

  it("추정 관계를 확정하면 save 에 confirmRelation 을 보내고, 응답을 얹어 목록에서 뺀다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1")));
    const save = calls.filter((c) => c.action === "save");
    expect(save).toHaveLength(1);
    expect(save[0].params).toMatchObject({ modelId: "mcm", baseRev: 3, source: "UI", commandsJson: '[{"op":"confirmRelation","id":"r-1"}]' });
    expect(String(save[0].params.session)).toMatch(/^ui-/);
    expect(shownRev()).toBe("4");
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

  it("확정된 버전을 보면 [읽기 전용] 칩을 보이고(처음 한 번은 이유를 저절로 펼침) 확정을 막는다", async () => {
    buttonRows = NO_COPY_ROWS; // 새 버전을 만들 수 없으면 자동 DRAFT 가 꺼져 읽기 전용이다(p4)
    currentView = viewOf(menuModel(), { ...MENU_DIAGRAMS, status: "RELEASED" });
    await openModel();
    expect(byTestId("erd-readonly-chip")?.getAttribute("title")).toBe(shortReason(RELEASED_TEXT));
    expect((await waitFor(() => docTestId("erd-readonly-pop"))).textContent).toContain("확정된 버전");
    expect(byTestId("erd-banner-readonly")).toBeNull();
    // 본 것으로 적어 다음에는 저절로 열지 않는다(prefs 저장은 300ms 미룬다)
    await waitFor(() => ((JSON.parse(prefsStore.get(prefsKey("tester")) ?? "{}").seenReadOnly ?? []).includes("mcm:released") ? true : null));
    await click(byTestId("erd-tab-inferred"));
    expect(((await waitFor(() => byTestId("erd-confirm-r-1"))) as HTMLButtonElement).disabled).toBe(true);
  });

  it("자동 DRAFT(p4): 확정본을 보고 있어도 읽기 전용 칩이 없고, 첫 편집이 copy MINOR 뒤 save 한다", async () => {
    currentView = viewOf(menuModel(), { ...MENU_DIAGRAMS, status: "RELEASED", ownerId: null });
    await openModel();
    expect(byTestId("erd-readonly-chip")).toBeNull();
    expect(byTestId("erd-save-baseline")).toBeNull(); // DRAFT 가 아니라 [기준본으로 저장] 도 없다
    await click(byTestId("erd-tab-inferred"));
    await click((await waitFor(() => byTestId("erd-confirm-r-1"))) as HTMLElement);
    await settle(100);
    const seq = calls.map((c) => c.action).filter((a) => a === "copy" || a === "save");
    expect(seq).toEqual(["copy", "save"]);
    expect(calls.find((c) => c.action === "copy")?.params).toMatchObject({ modelId: "mcm", verKind: "MINOR" });
    expect(byTestId("erd-save-baseline")).not.toBeNull(); // 다시 읽은 모델이 DRAFT 라 위 막대에 [기준본으로 저장] 하나
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
    expect(shownRev()).toBe("4");
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
        if (action === "search") return okRows([MODEL_ROW, { ...MODEL_ROW, modelId: "mes", modelName: "MES 스키마" }]);
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
    await waitFor(() => (shownRev() === "7" ? true : null));
    const readsBefore = viewCalls().length;
    release();
    await settle(100);
    expect(byTestId("erd-message")?.textContent).not.toContain("가져왔습니다");
    expect(shownRev()).toBe("7");
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

  it("F3 은 논리·물리를 바꾸고 포털의 document F3(메뉴 검색)까지 가지 않는다", async () => {
    // 포털 셸은 document 버블 단계에서 F3 을 받아 메뉴 검색을 연다(shared portal-shell). 같은 자리에 듣는 쪽을 둔다.
    const portalF3 = vi.fn();
    document.addEventListener("keydown", portalF3);
    try {
      await openModel();
      const canvas = () => host.querySelector<HTMLElement>(".erd-canvas");
      expect(canvas()?.dataset.mode).toBe("logical");
      await act(async () => {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "F3", bubbles: true, cancelable: true }));
      });
      expect(canvas()?.dataset.mode).toBe("physical");
      expect(portalF3).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", portalF3);
    }
  });

  const key = (target: EventTarget, init: KeyboardEventInit) =>
    act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    });

  it("Ctrl+Z 는 내 마지막 반영을 restore 로 되돌리고, 되돌리기 rev 는 다시 되돌리지 않으며, 입력 칸 안에서는 넘긴다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1")));
    expect(shownRev()).toBe("4");
    const input = document.createElement("input");
    host.appendChild(input);
    await key(input, { key: "z", ctrlKey: true });
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(0);
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params)).toEqual([
      { modelId: "mcm", rev: 4, session: expect.stringMatching(/^ui-/), source: "UI" },
    ]);
    expect(shownRev()).toBe("5");
    await key(document.body, { key: "z", metaKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(1);
    expect(byTestId("erd-message")?.textContent).toBe("되돌릴 내 변경이 없습니다.");
  });

  it("Ctrl+K 는 표 찾기 칸을 열고 Alt+O(물리 키 KeyO)는 컬럼 점프를 연다. 입력 칸 안 Ctrl+K 는 넘긴다", async () => {
    await openModel();
    const input = document.createElement("input");
    host.appendChild(input);
    await key(input, { key: "k", ctrlKey: true });
    expect(byTestId("erd-find-widget")).toBeNull();
    await key(document.body, { key: "k", ctrlKey: true });
    expect(byTestId("erd-find-widget")).not.toBeNull();
    expect(byTestId("erd-column-jump")).toBeNull();
    await key(document.body, { key: "ø", code: "KeyO", altKey: true }); // macOS Option+O 는 key 가 바뀐다
    expect(byTestId("erd-column-jump")).not.toBeNull();
  });

  it("감사 컬럼 보기 단추는 꺼진 채 열리고, 켜면 저장하며(localStorage), 가려진 감사 컬럼을 컬럼 점프로 고르면 저절로 켜진다", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: () => {}, clear: () => {} });
    const m = menuModel();
    m.tables["t-1"].columnOrder.push("c-a1");
    m.columns["c-a1"] = column("t-1", "C_AT", "생성일시");
    currentView = viewOf(m, MENU_DIAGRAMS);
    await openModel();
    const toggle = () => byTestId("erd-audit-toggle");
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");
    await click(toggle());
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
    expect(store.get("dmes.erdEdit.showAudit")).toBe("1");
    await click(toggle());
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");
    expect(store.get("dmes.erdEdit.showAudit")).toBe("0");
    // 컬럼 점프(Alt+O) — 가려진 C_AT 도 찾고, 고르면 보기가 켜진다
    await key(document.body, { key: "ø", code: "KeyO", altKey: true });
    const box = await waitFor(() => docTestId("erd-jump-input"));
    await typeInto(box, "c_at");
    await key(box, { key: "Enter" });
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
    expect(store.get("dmes.erdEdit.showAudit")).toBe("1");
    // 그 컬럼의 표가 열리고 행이 나타나며 초점(입력 칸 대상)이 그 행이다
    await waitFor(() => byTestId("erd-columns")?.querySelector('.ag-row[row-id="c-a1"]'));
    await waitFor(() => (byTestId("erd-grid-target")?.textContent === "C_AT" ? byTestId("erd-grid-target") : null));
    expect(byTestId("erd-audit-hint")).toBeNull();
  });

  it("reviewStripOpensTabAndLoadsOnce — 접힘 줄의 탭을 누르면 펼쳐 그 탭을 열고, 접었다 다시 펼쳐도 변경 기록을 두 번 읽지 않는다", async () => {
    const historyReads = () => calls.filter((c) => c.action === "view" && c.params.sinceRev !== undefined);
    await openModel();
    expect(byTestId("erd-review-strip")).not.toBeNull();
    expect(byTestId("erd-review")).toBeNull();
    expect(historyReads()).toHaveLength(0); // 접힌 동안은 읽지 않는다
    await click(byTestId("erd-tab-history"));
    await waitFor(() => byTestId("erd-review"));
    expect(byTestId("erd-review-strip")).toBeNull();
    await waitFor(() => (historyReads().length === 1 ? true : null));
    await click(byTestId("erd-review-toggle")); // 접기
    expect(byTestId("erd-review")).toBeNull();
    expect(byTestId("erd-review-strip")).not.toBeNull();
    await click(byTestId("erd-tab-history")); // 이미 고른 탭을 눌러도 펼친다
    expect(byTestId("erd-review")).not.toBeNull();
    await settle(100);
    expect(historyReads()).toHaveLength(1);
  });

  it("propsPanelAutoHideKeepsFocusAndNode — 고른 표가 없으면 속성 패널을 그리지 않고, 입력 칸에 초점이 있는 동안은 선택이 풀려도 남는다", async () => {
    await openModel();
    expect(host.querySelector(".erd-area-grid")).toBeNull();
    expect(byTestId("erd-columns")).toBeNull();
    // 컬럼 점프로 표를 고른다(happy-dom 은 캔버스 크기가 0 이라 노드를 그리지 않는다)
    await key(document.body, { key: "ø", code: "KeyO", altKey: true });
    const box = await waitFor(() => docTestId("erd-jump-input"));
    await typeInto(box, "menu_nm");
    await key(box, { key: "Enter" });
    await waitFor(() => host.querySelector(".erd-area-grid"));
    const input = await waitFor(() => byTestId("erd-grid-input"));
    await act(async () => {
      input.focus();
    });
    // 캔버스 빈 곳을 눌러 선택을 푼다 — 초점이 패널 안이라 패널은 남는다
    await click(host.querySelector(".react-flow__pane"));
    expect(host.querySelector('.react-flow__node.selected')).toBeNull();
    expect(host.querySelector(".erd-area-grid")).not.toBeNull();
    expect(byTestId("erd-columns")).not.toBeNull();
    await act(async () => {
      input.blur();
    });
    await settle();
    expect(host.querySelector(".erd-area-grid")).toBeNull();
  });

  /** d-all(t-1·t-2) + d-obj(t-2 만). */
  const TWO_DIAGRAMS = {
    diagrams: [...MENU_DIAGRAMS.diagrams, { id: "d-obj", areaName: "기본", diagramName: "오브젝트", sortSeq: 1 }],
    nodes: [...MENU_DIAGRAMS.nodes, { diagram: "d-obj", table: "t-2", x: 0, y: 0, foldMode: "NONE" as const }],
  };
  /** 컬럼 점프로 그 컬럼의 표를 고른다(happy-dom 은 노드를 그리지 않는다). */
  async function jumpTo(text: string) {
    await key(document.body, { key: "ø", code: "KeyO", altKey: true });
    const box = await waitFor(() => docTestId("erd-jump-input"));
    await typeInto(box, text);
    await key(box, { key: "Enter" });
    await waitFor(() => host.querySelector(".erd-area-grid"));
  }

  it("staleSelectionClearedOnDiagramSwitch — 표를 고른 채 다른 다이어그램을 열면 속성 패널이 사라진다(U66)", async () => {
    currentView = viewOf(menuModel(), TWO_DIAGRAMS);
    await openModel();
    await jumpTo("menu_nm");
    // 패널 안에 초점이 있어도(U12 초점 유지) 다이어그램을 바꾸면 비운다
    const input = await waitFor(() => byTestId("erd-grid-input"));
    await act(async () => {
      input.focus();
    });
    await click(byTestId("erd-diagram-d-obj"));
    await settle();
    expect(byTestId("erd-diagram-d-obj")?.getAttribute("aria-current")).toBe("true");
    expect(host.querySelector(".erd-area-grid")).toBeNull();
  });

  it("crossDiagramSelectKeepsTable — 지금 다이어그램에 없는 표를 컬럼 점프로 고르면 그 다이어그램으로 가고 패널이 그 표를 보인다", async () => {
    currentView = viewOf(menuModel(), TWO_DIAGRAMS);
    await openModel();
    await click(byTestId("erd-diagram-d-obj"));
    await settle();
    await jumpTo("menu_nm"); // t-1 은 d-obj 에 없다
    expect(byTestId("erd-diagram-d-all")?.getAttribute("aria-current")).toBe("true");
    expect(byTestId("erd-columns")).not.toBeNull();
  });

  it("고른 표가 둘이면 속성 패널 머리에 '고른 표 2개 중 <첫 표>'(U65)", async () => {
    await openModel();
    const host2 = await waitFor(() => byTestId("erd-canvas-host"));
    await key(host2, { key: "a", ...(isMacPlatform() ? { metaKey: true } : { ctrlKey: true }) });
    await settle();
    expect(byTestId("erd-props-multi")?.textContent).toBe("속성 · 고른 표 2개 중 TB_MCM_SEC_MENU");
    await key(host2, { key: "Escape" });
    await settle();
    expect(byTestId("erd-props-multi")).toBeNull();
  });

  it("같은 다이어그램을 다시 눌러도 선택은 남는다", async () => {
    currentView = viewOf(menuModel(), TWO_DIAGRAMS);
    await openModel();
    await jumpTo("menu_nm");
    await click(byTestId("erd-diagram-d-all"));
    await settle();
    expect(host.querySelector(".erd-area-grid")).not.toBeNull();
  });

  it("속성 패널 [접기] 는 레일로 남기고 다시 펼칠 수 있다. 왼쪽 목록도 접고 펼친다", async () => {
    await openModel();
    await key(document.body, { key: "ø", code: "KeyO", altKey: true });
    const box = await waitFor(() => docTestId("erd-jump-input"));
    await typeInto(box, "menu_nm");
    await key(box, { key: "Enter" });
    await waitFor(() => byTestId("erd-columns"));
    await click(byTestId("erd-props-toggle"));
    expect(byTestId("erd-columns")).toBeNull();
    expect(byTestId("erd-props-rail")).not.toBeNull();
    await click(byTestId("erd-props-toggle"));
    expect(byTestId("erd-columns")).not.toBeNull();
    expect(byTestId("erd-props-rail")).toBeNull();
    expect(byTestId("erd-tree")).not.toBeNull();
    await click(byTestId("erd-side-toggle"));
    expect(byTestId("erd-tree")).toBeNull();
    expect(byTestId("erd-side-rail")).not.toBeNull();
    await click(byTestId("erd-side-toggle"));
    expect(byTestId("erd-tree")).not.toBeNull();
  });

  it("다음에 열면 저장해 둔 보기 상태로 시작한다", async () => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "dmes.erdEdit.showAudit" ? "1" : null), setItem: () => {}, removeItem: () => {}, clear: () => {} });
    await openModel();
    expect(byTestId("erd-audit-toggle")?.getAttribute("aria-pressed")).toBe("true");
  });

  describe("lastModelOpensOnlyWhenUntouched — 마지막 모델은 me·목록이 온 뒤, 사용자가 고르지 않았고 목록에 있을 때만 연다(U21)", () => {
    const viewedModels = () => viewCalls().map((c) => c.params.modelId);

    it("(a) 저장한 마지막 모델을 연다", async () => {
      prefsStore.set(prefsKey("tester"), JSON.stringify({ lastModelId: "mcm" }));
      await renderPage();
      await waitFor(() => (viewedModels().length > 0 ? true : null));
      expect(viewedModels()).toEqual(["mcm"]);
    });

    it("(b) me 가 늦게 오는 사이 사용자가 다른 모델을 고르면 그 모델을 그대로 둔다", async () => {
      prefsStore.set(prefsKey("tester"), JSON.stringify({ lastModelId: "mcm" }));
      delete (globalThis as Record<string, unknown>)[CURRENT_USER_STORE_KEY]; // 사용자 확인 캐시를 비워 /api/auth/me 를 다시 부르게 한다
      const inner = globalThis.fetch;
      let releaseMe: () => void = () => undefined;
      const meGate = new Promise<void>((r) => {
        releaseMe = r;
      });
      globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u === "/api/auth/me") await meGate;
        if (u.startsWith("/api/mdm/oasis/erdEdit/")) {
          const action = u.split("/").pop() ?? "";
          const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
          if (action === "search") return okRows([MODEL_ROW, { ...MODEL_ROW, modelId: "mdm", modelName: "MDM 스키마" }]);
          if (action === "view" && params.modelId === "mdm" && params.kind === undefined && params.sinceRev === undefined) {
            calls.push({ action, params });
            return ok({ ...currentView, modelId: "mdm" });
          }
        }
        return inner(url, init);
      }) as typeof fetch;
      await renderPage();
      await click(await waitFor(() => byTestId("erd-model-mdm")));
      await act(async () => {
        releaseMe();
      });
      // me 다음 RBAC·prefs 읽기, 300ms 미룬 저장까지 기다린다
      await waitFor(() => JSON.parse(prefsStore.get(prefsKey("tester")) ?? "{}").lastModelId === "mdm");
      await settle(100);
      expect(viewedModels()).toEqual(["mdm"]);
    });

    it("(c) 목록에 없는 id 면 열지 않는다", async () => {
      // sideOpen=false 가 보이면(레일) prefs 를 읽었다는 뜻 — 그 뒤에도 view 를 부르지 않아야 한다.
      prefsStore.set(prefsKey("tester"), JSON.stringify({ lastModelId: "gone", sideOpen: false }));
      await renderPage();
      await waitFor(() => byTestId("erd-model-mcm"));
      await waitFor(() => byTestId("erd-side-rail"));
      await settle(200);
      expect(viewedModels()).toEqual([]);
    });
  });

  it("altMTogglesMaximize — Alt+M(물리 키 KeyM)은 캔버스 최대화를 켜고 끄며, 입력 칸 안에서는 넘긴다", async () => {
    await openModel();
    const viewer = () => byTestId("erd-viewer");
    expect(host.querySelector(".erd-area-side")).not.toBeNull();
    expect(viewer()?.hasAttribute("data-maximized")).toBe(false);
    await key(window, { key: "µ", code: "KeyM", altKey: true }); // macOS Option+M 은 key 가 바뀐다
    expect(host.querySelector(".erd-area-side")).toBeNull();
    expect(byTestId("erd-review-strip")).toBeNull();
    expect(viewer()?.hasAttribute("data-maximized")).toBe(true);
    expect(byTestId("erd-maximize")?.getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("erd-maximize")?.getAttribute("title")).toBe("캔버스 최대화 풀기 (Alt+M)");
    const input = document.createElement("input");
    host.appendChild(input);
    await key(input, { key: "µ", code: "KeyM", altKey: true });
    expect(viewer()?.hasAttribute("data-maximized")).toBe(true);
    await key(window, { key: "µ", code: "KeyM", altKey: true });
    expect(viewer()?.hasAttribute("data-maximized")).toBe(false);
    expect(host.querySelector(".erd-area-side")).not.toBeNull();
    expect(byTestId("erd-review-strip")).not.toBeNull();
    expect(byTestId("erd-maximize")?.getAttribute("title")).toBe("캔버스 최대화 (Alt+M)");
  });

  it("최대화 중 고른 표는 떠 있는 속성 카드로 보이고, 카드를 닫아도 선택은 남으며, [최대화] 단추로 풀면 속성 패널로 돌아온다", async () => {
    await openModel();
    expect(byTestId("erd-zoom-in")?.getAttribute("title")).toBe("확대");
    expect(byTestId("erd-zoom-out")?.getAttribute("title")).toBe("축소");
    await key(document.body, { key: "ø", code: "KeyO", altKey: true });
    const box = await waitFor(() => docTestId("erd-jump-input"));
    await typeInto(box, "menu_nm");
    await key(box, { key: "Enter" });
    await waitFor(() => host.querySelector(".erd-area-grid"));
    await click(byTestId("erd-maximize"));
    expect(host.querySelector(".erd-area-grid")).toBeNull();
    const card = await waitFor(() => docTestId("erd-props-float"));
    expect(card.querySelector('[data-testid="erd-columns"]')).not.toBeNull();
    await click(card.querySelector('[aria-label="닫기"]'));
    expect(docTestId("erd-props-float")).toBeNull();
    await click(byTestId("erd-maximize"));
    expect(byTestId("erd-viewer")?.hasAttribute("data-maximized")).toBe(false);
    expect(host.querySelector(".erd-area-grid")).not.toBeNull(); // 선택은 그대로라 속성 패널이 다시 보인다
  });

  it("version 이벤트는 버전 칸만 바꿔 다시 읽지 않고, ver 가 바뀌면 모델을 다시 읽는다", async () => {
    buttonRows = NO_COPY_ROWS;
    await openModel();
    expect(viewCalls()).toHaveLength(1);
    const ev = { modelId: "mcm", ver: "1.000", status: "RELEASED", ownerId: "tester", editors: [], rowVersion: 9,
      reason: "CONFIRM", userId: "tester", at: "2026-10-11T05:10:03.120Z" };
    await act(async () => {
      FakeES.all[0].emit("version", ev);
    });
    await settle();
    expect(byTestId("erd-readonly-chip")?.getAttribute("title")).toBe("확정된 버전");
    expect(viewCalls()).toHaveLength(1);
    await act(async () => {
      FakeES.all[0].emit("version", { ...ev, ver: "1.001", status: "DRAFT", reason: "SUBSCRIBE" });
    });
    await settle();
    expect(viewCalls()).toHaveLength(2);
  });

  it("변경 기록 [되돌리기] 는 그 rev 를 restore 하고 CONFLICT 를 알린다. Ctrl+Z 의 CONFLICT 는 다른 변경을 고르라고 덧붙이고 그 rev 를 다시 꺼내지 않는다", async () => {
    historyDeltas = [{ modelId: "mcm", rev: 2, userId: "41000207", session: "ui-peer", source: "UI",
      changes: [{ kind: "column", id: "c-4", op: "patch", value: { logical: "메뉴이름" } }] }];
    restoreResult = { applied: false, rev: 3, rowVersion: null, changes: [], warnings: [], rejection: {
      code: "CONFLICT", commandIndex: 0, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(2) 로 바뀐 값을 읽고 다시 보내세요",
      userHint: "화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.",
      elementId: "c-4", property: "logical", byRev: 3, bySession: "ui-peer2", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null } };
    await openModel();
    await click(byTestId("erd-tab-history"));
    await click(await waitFor(() => byTestId("erd-undo-2")));
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params.rev)).toEqual([2]);
    expect(byTestId("erd-notice")?.dataset.code).toBe("CONFLICT");
    expect(byTestId("erd-notice-message")?.textContent).toBe('41000207 님이 먼저 바꿨습니다. 지금 값: "역할설명"');
    expect(byTestId("erd-notice")?.getAttribute("title")).toBe("번호 3");
    expect(byTestId("erd-notice-hint")?.textContent).toBe("화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.");
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1"))); // 내 반영 rev 4
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params.rev)).toEqual([2, 4]);
    expect(byTestId("erd-notice-hint")?.textContent).toContain("변경 기록에서 다른 변경을 고르세요.");
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(2);
    expect(byTestId("erd-message")?.textContent).toBe("되돌릴 내 변경이 없습니다.");
  });

  it("변경 기록 요청 구간 앞에 다시 읽기 지점이 있으면(copy 로 만든 DRAFT) 서버 fromRev 부터 한 번 더 읽어 행과 [되돌리기] 를 보인다", async () => {
    // defect.historyEmptyBeforeSpan: rev 3 인 DRAFT 가 rev 1 의 표시 행 뒤에 있다. 화면은 sinceRev 0 을 묻고 서버는 reload·fromRev 1 을 준다.
    historyMarker = 1;
    historyDeltas = [
      { modelId: "mcm", rev: 2, userId: "tester", session: "ui-peer", source: "UI", changes: [{ kind: "column", id: "c-4", op: "patch", value: { comment: "가" } }] },
      { modelId: "mcm", rev: 3, userId: "tester", session: "ui-peer", source: "CLI", changes: [{ kind: "column", id: "c-4", op: "patch", value: { comment: "나" } }] },
    ];
    await openModel();
    await click(byTestId("erd-tab-history"));
    await waitFor(() => byTestId("erd-undo-3"));
    expect(byTestId("erd-undo-2")).not.toBeNull();
    expect(calls.filter((c) => c.action === "view" && c.params.sinceRev !== undefined).map((c) => c.params.sinceRev)).toEqual([0, 1]);
    expect(byTestId("erd-history-note")?.textContent).toBe("번호 1 에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.");
    await click(byTestId("erd-undo-2"));
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params.rev)).toEqual([2]);
  });

  it("연결이 끊긴 동안 Ctrl+Z 는 보내지 않고 NETWORK 알림을 보이며, 다시 붙으면 같은 rev 를 되돌린다", async () => {
    await openModel();
    await click(byTestId("erd-tab-inferred"));
    await click(await waitFor(() => byTestId("erd-confirm-r-1")));
    await act(async () => {
      FakeES.all[0].emit("error");
    });
    expect(byTestId("erd-banner-lost")?.textContent).toBe(LOST_TEXT);
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(0);
    expect(byTestId("erd-notice")?.dataset.code).toBe("NETWORK");
    await settle(1100); // 1초 뒤 다시 연결
    await act(async () => {
      FakeES.all[1].emit("open");
    });
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params.rev)).toEqual([4]);
  });

  it("소유자 없는 DRAFT 를 선점하면 lock 에 rowVersion 을 보내고 응답 값으로 바로 바꿔 해제를 켠다", async () => {
    currentView = viewOf(menuModel(), { ...MENU_DIAGRAMS, ownerId: null, rowVersion: 4 });
    await openModel();
    await openVersion();
    const btn = (id: string) => docTestId(id) as HTMLButtonElement;
    expect([btn("erd-ver-lock").disabled, btn("erd-ver-unlock").disabled, btn("erd-ver-confirm").disabled]).toEqual([false, true, true]);
    await click(btn("erd-ver-lock"));
    expect(calls.find((c) => c.action === "lock")?.params).toEqual({ modelId: "mcm", ver: "1.000", rowVersion: 4 });
    expect([btn("erd-ver-lock").disabled, btn("erd-ver-unlock").disabled, btn("erd-ver-confirm").disabled]).toEqual([true, false, false]);
    await click(btn("erd-ver-unlock"));
    expect(calls.find((c) => c.action === "unlock")?.params).toEqual({ modelId: "mcm", ver: "1.000", rowVersion: 5 });
    expect(viewCalls()).toHaveLength(1); // 다시 읽지 않았다
  });

  it("확정은 검사 경고를 코드별 50건까지 보이고, 확인을 고른 뒤 warningsAcknowledged=true·applyFrom(지금)으로 보낸다", async () => {
    const issue = (code: string, i: number) => ({ code, message: `기존 위반 ${i}`, field: null, itemKey: `TB_MCM_SEC_MENU.C${i}` });
    validateResult = { errors: [], warnings: [...Array.from({ length: 60 }, (_, i) => issue("ERD_STD_DOMAIN", i)), issue("ERD_STD_TYPE", 0)] };
    await openModel();
    await openVersion();
    await click(docTestId("erd-ver-confirm"));
    await waitFor(() => docTestId("erd-confirm-summary"));
    expect(docTestId("erd-confirm-summary")?.textContent).toBe(
      "확정을 막는 문제 0건 · 확인할 경고 61건 · 검토 안 한 추정 관계 1건(확정을 막지 않음)");
    expect(docTestId("erd-confirm-warnings-ERD_STD_DOMAIN")?.querySelectorAll("li")).toHaveLength(50);
    expect(docTestId("erd-confirm-warnings-ERD_STD_DOMAIN")?.textContent).toContain("10건 더 있습니다");
    expect(document.body.textContent).toContain("도메인 다름 · 60건");
    expect((docTestId("erd-confirm-send") as HTMLButtonElement).disabled).toBe(true);
    expect((docTestId("erd-confirm-apply-from") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    await click(docTestId("erd-confirm-ack")?.querySelector("input") ?? null);
    expect((docTestId("erd-confirm-send") as HTMLButtonElement).disabled).toBe(false);
    const reads = viewCalls().length;
    await click(docTestId("erd-confirm-send"));
    expect(calls.find((c) => c.action === "confirm")?.params).toEqual({
      modelId: "mcm", ver: "1.000", rowVersion: 0, warningsAcknowledged: true, applyFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    });
    await waitFor(() => (viewCalls().length > reads ? true : null));
    expect(byTestId("erd-message")?.textContent).toBe("버전 1.000 를 확정했습니다.");
  });

  it("공동 편집자를 더하면 execute ADD_EDITOR 를 보내고 목록에 바로 보이며, 빼면 REMOVE_EDITOR 를 보낸다", async () => {
    await openModel();
    await openVersion();
    await click(docTestId("erd-editors-open"));
    expect(docTestId("erd-ver-pop")).toBeNull(); // 팝오버를 닫고 창을 연다
    await typeInto(await waitFor(() => docTestId("erd-editor-input")), "erd-mcp-a");
    await click(docTestId("erd-editor-add"));
    expect(calls.find((c) => c.action === "execute")?.params).toEqual({ modelId: "mcm", kind: "ADD_EDITOR", userId: "erd-mcp-a" });
    await waitFor(() => docTestId("erd-editor-erd-mcp-a"));
    await click(docTestId("erd-editors-close"));
    await openVersion();
    expect(docTestId("erd-editors-open")?.textContent).toBe("공동 편집자(1)");
    await click(docTestId("erd-editors-open"));
    await click(await waitFor(() => docTestId("erd-editor-remove-erd-mcp-a")));
    expect(calls.filter((c) => c.action === "execute").map((c) => c.params.kind)).toEqual(["ADD_EDITOR", "REMOVE_EDITOR"]);
    await click(docTestId("erd-editors-close"));
    await openVersion();
    expect(docTestId("erd-editors-open")?.textContent).toBe("공동 편집자(0)");
  });

  it("공동 편집자 응답을 기다리는 사이 SSE 로 rowVersion 이 바뀌어도 응답이 새 rowVersion 을 덮지 않는다", async () => {
    await openModel();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const inner = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/execute")) await gate;
      return inner(url, init);
    }) as typeof fetch;
    await openVersion();
    await click(docTestId("erd-editors-open"));
    await typeInto(await waitFor(() => docTestId("erd-editor-input")), "erd-mcp-a");
    await click(docTestId("erd-editor-add")); // 응답은 gate 가 열릴 때까지 안 온다
    const ev = { modelId: "mcm", ver: "1.000", status: "DRAFT", ownerId: "tester", editors: [], rowVersion: 9,
      reason: "LOCK", userId: "someone", at: "2026-10-11T05:10:03.120Z" };
    await act(async () => {
      FakeES.all[0].emit("version", ev);
    });
    await act(async () => {
      release();
    });
    await waitFor(() => docTestId("erd-editor-erd-mcp-a"));
    await click(docTestId("erd-editors-close"));
    await openVersion();
    await click(docTestId("erd-ver-unlock")); // 낡은 rowVersion(0)이 남았다면 0 을 보낸다
    expect(calls.find((c) => c.action === "unlock")?.params).toEqual({ modelId: "mcm", ver: "1.000", rowVersion: 9 });
  });

  it("confirmDialogSurvivesPopoverClose — [버전 ▾] 의 [확정] 은 팝오버를 닫아도 확정 창이 남아 끝까지 보낸다(Review Focus 4)", async () => {
    await openModel();
    await openVersion();
    expect(docTestId("erd-ver-rev")?.textContent).toBe("번호 3");
    await click(docTestId("erd-ver-confirm"));
    expect(docTestId("erd-ver-pop")).toBeNull();
    await waitFor(() => docTestId("erd-confirm-dialog"));
    const send = await waitFor(() => {
      const b = docTestId("erd-confirm-send") as HTMLButtonElement | null;
      return b && !b.disabled ? b : null;
    });
    await click(send);
    expect(calls.find((c) => c.action === "confirm")?.params).toMatchObject({ modelId: "mcm", ver: "1.000", rowVersion: 0 });
    await waitFor(() => (byTestId("erd-message")?.textContent === "버전 1.000 를 확정했습니다." ? true : null));
  });

  it("startPanelShowsModelCards — 고른 모델이 없으면 시작 화면에 모델 카드를 보이고, 카드를 누르면 그 모델을 연다", async () => {
    searchRows = [MODEL_ROW, { ...MODEL_ROW, modelId: "mdm", moduleId: "mdm", schemaName: "MDMAPUSER", modelName: "MDM 스키마" }];
    await renderPage();
    const card = await waitFor(() => byTestId("erd-start-model-mcm"));
    expect(byTestId("erd-start")?.textContent).toContain("열 모델을 고르세요.");
    expect(card.textContent).toBe("MCM 스키마 · mcm · MCMAPUSER");
    expect(byTestId("erd-start-model-mdm")).not.toBeNull();
    expect(byTestId("erd-start-reg")).not.toBeNull();
    expect(byTestId("erd-canvas-empty")).not.toBeNull();
    await click(card);
    await waitFor(() => (viewCalls().length > 0 ? true : null));
    expect(viewCalls().map((c) => c.params.modelId)).toEqual(["mcm"]);
  });

  it("summaryLineCountsByOneRule — 요약 줄은 고칠 위반(TYPE·DOMAIN·MISS)만 센다", async () => {
    statusResult = { ...STATUS, statuses: { "c-1": "TYPE", "c-2": "MISS", "c-4": "NEW", "c-3": "OK" } };
    await openModel();
    const summary = await waitFor(() => (byTestId("erd-summary")?.textContent?.includes("고칠 위반 2") ? byTestId("erd-summary") : null));
    expect(summary.textContent).toBe("표 2 · 관계 1(추정 1) · 고칠 위반 2");
    expect(summary.getAttribute("title")).toBe(summary.textContent);
  });

  it("violationCountsAgree — 요약 줄·왼쪽 목록 수·[표준 위반] 탭 수가 감사 컬럼을 숨겨도 보여도 같다(U25)", async () => {
    // 표가 모두 한 다이어그램(d-all)에 있다. 감사 컬럼 C_AT(DOMAIN)은 보기를 켰을 때만, NEW·ALIAS 는 늘 빠진다.
    const m = menuModel();
    m.tables["t-1"].columnOrder.push("c-a1");
    m.columns["c-a1"] = column("t-1", "C_AT", "생성일시");
    currentView = viewOf(m, MENU_DIAGRAMS);
    const statuses = { "c-1": "TYPE", "c-2": "MISS", "c-4": "NEW", "c-3": "ALIAS", "c-a1": "DOMAIN" } as const;
    statusResult = { ...STATUS, statuses };
    await openModel();
    const shown = () => {
      const summary = /고칠 위반 (\d+)/.exec(byTestId("erd-summary")?.textContent ?? "")?.[1];
      const tree = byTestId("erd-diagram-d-all")?.querySelector(".erd-tree__bad")?.textContent ?? "0";
      const tab = /표준 위반\((\d+)\)/.exec(byTestId("erd-tab-violations")?.textContent ?? "")?.[1];
      return [Number(summary), Number(tree), Number(tab)];
    };
    // 노드 머리 수(FE2 canvas)가 쓰는 countTableViolations 의 합도 같은 규칙이다
    const nodeSum = (showAudit: boolean) =>
      Object.keys(m.tables).reduce((n, t) => n + countTableViolations(m, t, statuses, showAudit), 0);
    await waitFor(() => (shown()[0] === 2 ? true : null));
    expect(shown()).toEqual([2, 2, 2]);
    expect(nodeSum(false)).toBe(2);
    expect(modelSummary(m, statuses, false).violations).toBe(2);
    await click(byTestId("erd-audit-toggle"));
    await waitFor(() => (shown()[0] === 3 ? true : null));
    expect(shown()).toEqual([3, 3, 3]);
    expect(nodeSum(true)).toBe(3);
  });

  it("noMachineTermsOnScreen — 네 탭을 차례로 펼쳐도 화면 글에 기계 용어·rev 가 없다", async () => {
    historyDeltas = [{ modelId: "mcm", rev: 2, at: "2026-10-11T14:03:22", userId: "41000207", session: "claude-ab12cd34", source: "MCP",
      changes: [{ kind: "column", id: "c-4", op: "patch", value: { logical: "메뉴이름" } }] }];
    const m = menuModel();
    m.relations["r-1"].evidence = [{ kind: "SQL_JOIN", ref: "db/V1__baseline.sql:1108" }, { kind: "NAME_RULE", ref: "PK 이름 일치" }];
    currentView = viewOf(m, MENU_DIAGRAMS);
    await openModel();
    const BANNED = ["getChangesSince", "baseRev", "getModelText", "ERD_STD_", "NAME_RULE", "SQL_JOIN", "rev "];
    const check = (where: string) => {
      const text = document.body.textContent ?? "";
      for (const b of BANNED) expect(text, `${where}: ${b}`).not.toContain(b);
    };
    check("처음");
    await click(byTestId("erd-tab-violations"));
    await waitFor(() => byTestId("erd-review-violations"));
    check("표준 위반");
    await click(byTestId("erd-tab-inferred"));
    await waitFor(() => byTestId("erd-confirm-r-1"));
    expect(byTestId("erd-review-inferred")?.textContent).toContain("SQL 조인 V1__baseline.sql:1108");
    check("추정 관계");
    await click(byTestId("erd-tab-diff"));
    await waitFor(() => byTestId("erd-diff-apply"));
    expect(byTestId("erd-tab-diff")?.textContent).toBe("DB 다시 가져오기(0)");
    check("DB 다시 가져오기");
    await click(byTestId("erd-tab-history"));
    await waitFor(() => byTestId("erd-undo-2"));
    expect(byTestId("erd-review-history")?.textContent).toContain("Claude");
    check("변경 기록");
  });

  it("topBarHasNoRevOrLlmText — 위 막대에 rev·LLM 용 글이 없다", async () => {
    await openModel();
    const text = byTestId("erd-bar")?.textContent ?? "";
    expect(text).toContain("버전 1.000");
    expect(text).not.toContain("rev ");
    expect(text).not.toContain("getChangesSince");
    expect(byTestId("erd-rev")).toBeNull();
    expect(byTestId("erd-ver")).toBeNull();
  });
  it("pickInferredRelationOpensTabAndHighlightsRow — 캔버스 점선을 누른 것과 같은 콜백이 접힌 검토 패널의 추정 탭을 펼치고 그 행에 커서를 둔다(Task 6)", async () => {
    prefsStore.set(prefsKey("tester"), JSON.stringify({ lastModelId: "mcm", reviewOpen: false, reviewTab: "violations" }));
    await openModel();
    expect(byTestId("erd-review-strip")).not.toBeNull();
    expect(byTestId("erd-review")).toBeNull();
    await click(await waitFor(() => byTestId("erd-probe-pick")));
    await waitFor(() => byTestId("erd-review-inferred"));
    expect(byTestId("erd-review-strip")).toBeNull();
    await settleGrid(byTestId("erd-review-inferred")!);
    const lit = () => [...host.querySelectorAll(".ag-row.ag-row-highlighted")].map((e) => e.getAttribute("row-id"));
    expect(lit()).toEqual(["r-1"]);
    // 저장값도 추정 탭·펼침으로 바뀐다(탭을 직접 누른 것과 같다).
    await waitFor(() => {
      const saved = JSON.parse(prefsStore.get(prefsKey("tester")) ?? "{}");
      return saved.reviewTab === "inferred" && saved.reviewOpen === true ? true : null;
    });
  });

  it("pickInferredRelationOnOtherTab — 펼친 채 다른 탭(표준 위반)에 있어도 추정 탭으로 옮기고, 이미 추정 탭이면 탭을 그대로 둔 채 다시 눌러도 커서가 남는다", async () => {
    prefsStore.set(prefsKey("tester"), JSON.stringify({ lastModelId: "mcm", reviewOpen: true, reviewTab: "violations" }));
    await openModel();
    await waitFor(() => byTestId("erd-review-violations"));
    await click(await waitFor(() => byTestId("erd-probe-pick")));
    await waitFor(() => byTestId("erd-review-inferred"));
    expect(byTestId("erd-review-violations")).toBeNull();
    await settleGrid(byTestId("erd-review-inferred")!);
    expect(host.querySelector(".ag-row.ag-row-highlighted")?.getAttribute("row-id")).toBe("r-1");
    await click(byTestId("erd-probe-pick")); // 같은 선을 다시 눌러도 탭은 그대로, 커서도 그대로 남는다
    await settleGrid(byTestId("erd-review-inferred")!);
    expect(byTestId("erd-review-inferred")).not.toBeNull();
    expect(host.querySelector(".ag-row.ag-row-highlighted")?.getAttribute("row-id")).toBe("r-1");
  });

  it("처음 둘러보기(p6): 모델을 읽으면 4단계를 열고, [완료] 하면 다시 보지 않기가 저장된다", async () => {
    await openModel();
    await waitFor(() => docTestId("erd-tour-bubble"));
    expect(docTestId("erd-tour-step")?.textContent).toBe("1 / 4");
    for (let i = 0; i < 3; i++) await click(docTestId("erd-tour-next") as HTMLElement);
    expect(docTestId("erd-tour-step")?.textContent).toBe("4 / 4");
    await click(docTestId("erd-tour-next") as HTMLElement);
    expect(docTestId("erd-tour-bubble")).toBeNull();
    await waitFor(() => (JSON.parse(prefsStore.get(prefsKey("tester")) ?? "{}").tourSeen === true ? true : null));
  });

  it("처음 둘러보기(p6): 본 적 있으면 열지 않고, [둘러보기] 단추로 다시 연다", async () => {
    prefsStore.set(prefsKey("tester"), JSON.stringify({ lastModelId: "mcm", tourSeen: true }));
    await openModel();
    await waitFor(() => byTestId("erd-tour-open"));
    expect(docTestId("erd-tour-bubble")).toBeNull();
    await click(byTestId("erd-tour-open") as HTMLElement);
    expect(docTestId("erd-tour-step")?.textContent).toBe("1 / 4");
  });

  it("모델 관리(p2): 지금 연 모델을 완전 삭제하면 delete kind=MODEL 을 보내고 목록을 다시 읽어 시작 화면으로 간다", async () => {
    await openModel();
    await click(await waitFor(() => byTestId("erd-models-manage")));
    await settleGrid(await waitFor(() => docTestId("erd-models")));
    await click(await waitFor(() => document.querySelector<HTMLElement>('.ag-row[row-id="mcm"] [col-id="name"]')));
    await click(docTestId("erd-models-delete") as HTMLElement);
    await typeInto(docTestId("erd-model-delete-input"), "mcm");
    searchRows = []; // 삭제 뒤 목록
    await click(docTestId("erd-model-delete-ok") as HTMLElement);
    await settle(100);
    const del = calls.filter((c) => c.action === "delete");
    expect(del).toHaveLength(1);
    expect(del[0].params).toEqual({ modelId: "mcm", kind: "MODEL" });
    expect(docTestId("erd-model-delete")).toBeNull();
    expect(byTestId("erd-start-reg")).not.toBeNull(); // 시작 화면(등록된 모델이 없습니다)
    expect(byTestId("erd-model-mcm")).toBeNull();
  });
});
