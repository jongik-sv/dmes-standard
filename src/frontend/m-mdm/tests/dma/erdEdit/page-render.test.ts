/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import ErdEditPage from "../../../pages/dma/erdEdit/page";
import { LOST_TEXT } from "../../../pages/dma/erdEdit/state/permissions";
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
let restoreResult: unknown;
let historyDeltas: unknown[] = [];
let validateResult: unknown;
let host: HTMLDivElement;
let root: Root | null = null;

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
      return new Response(JSON.stringify({ grids: { buttons: { rows: [{ objId: "*", action: "*" }] } } }), { status: 200 });
    }
    if (!u.startsWith("/api/mdm/oasis/erdEdit/")) return new Response("{}", { status: 401 });
    const action = u.split("/").pop() ?? "";
    const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
    calls.push({ action, params });
    if (action === "search") return okRows([MODEL_ROW]);
    if (action === "view" && params.kind === "STATUS") return ok(STATUS);
    if (action === "view" && params.kind === "SET_VIEW") return ok({ ok: true });
    if (action === "view" && params.sinceRev !== undefined) return ok({ rev: currentView.rev, reload: false, deltas: historyDeltas });
    if (action === "view") return ok(currentView);
    if (action === "compare") return ok({ modelId: "mcm", rev: currentView.rev, schema: "MCMAPUSER", items: [] });
    if (action === "save") {
      return ok({ applied: true, rev: currentView.rev + 1, warnings: [], rejection: null,
        changes: [{ kind: "relation", id: "r-1", op: "patch", value: { state: "CONFIRMED" } }] });
    }
    if (action === "restore") return ok(restoreResult);
    if (action === "lock" || action === "unlock") return ok({ rowVersion: Number(params.rowVersion) + 1 });
    if (action === "validate") return ok(validateResult);
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
  historyDeltas = [];
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
    expect(byTestId("erd-rev")?.textContent).toBe("rev 4");
    const input = document.createElement("input");
    host.appendChild(input);
    await key(input, { key: "z", ctrlKey: true });
    expect(calls.filter((c) => c.action === "restore")).toHaveLength(0);
    await key(document.body, { key: "z", ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params)).toEqual([
      { modelId: "mcm", rev: 4, session: expect.stringMatching(/^ui-/), source: "UI" },
    ]);
    expect(byTestId("erd-rev")?.textContent).toBe("rev 5");
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

  it("version 이벤트는 버전 칸만 바꿔 다시 읽지 않고, ver 가 바뀌면 모델을 다시 읽는다", async () => {
    await openModel();
    expect(viewCalls()).toHaveLength(1);
    const ev = { modelId: "mcm", ver: "1.000", status: "RELEASED", ownerId: "tester", editors: [], rowVersion: 9,
      reason: "CONFIRM", userId: "tester", at: "2026-10-11T05:10:03.120Z" };
    await act(async () => {
      FakeES.all[0].emit("version", ev);
    });
    await settle();
    expect(byTestId("erd-banner-readonly")?.textContent).toContain("확정된 버전");
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
      elementId: "c-4", property: "logical", byRev: 3, bySession: "ui-peer2", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null } };
    await openModel();
    await click(byTestId("erd-tab-history"));
    await click(await waitFor(() => byTestId("erd-undo-2")));
    expect(calls.filter((c) => c.action === "restore").map((c) => c.params.rev)).toEqual([2]);
    expect(byTestId("erd-notice")?.dataset.code).toBe("CONFLICT");
    expect(byTestId("erd-notice-message")?.textContent).toBe('41000207 님이 rev 3 에서 먼저 바꿨습니다. 지금 값: "역할설명"');
    expect(byTestId("erd-notice-hint")?.textContent).not.toContain("다른 변경을 고르세요");
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
    const btn = (id: string) => byTestId(id) as HTMLButtonElement;
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
    validateResult = { errors: [], warnings: [...Array.from({ length: 60 }, (_, i) => issue("STD_DOMAIN", i)), issue("STD_TYPE", 0)] };
    await openModel();
    await click(byTestId("erd-ver-confirm"));
    await waitFor(() => docTestId("erd-confirm-summary"));
    expect(docTestId("erd-confirm-summary")?.textContent).toContain("경고 61건");
    expect(docTestId("erd-confirm-summary")?.textContent).toContain("남은 추정 관계 1건");
    expect(docTestId("erd-confirm-warnings-STD_DOMAIN")?.querySelectorAll("li")).toHaveLength(50);
    expect(docTestId("erd-confirm-warnings-STD_DOMAIN")?.textContent).toContain("10건 더 있습니다");
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
    await click(byTestId("erd-editors-open"));
    await typeInto(await waitFor(() => docTestId("erd-editor-input")), "erd-mcp-a");
    await click(docTestId("erd-editor-add"));
    expect(calls.find((c) => c.action === "execute")?.params).toEqual({ modelId: "mcm", kind: "ADD_EDITOR", userId: "erd-mcp-a" });
    await waitFor(() => docTestId("erd-editor-erd-mcp-a"));
    expect(byTestId("erd-editors-open")?.textContent).toBe("공동 편집자(1)");
    await click(docTestId("erd-editor-remove-erd-mcp-a"));
    expect(calls.filter((c) => c.action === "execute").map((c) => c.params.kind)).toEqual(["ADD_EDITOR", "REMOVE_EDITOR"]);
    expect(byTestId("erd-editors-open")?.textContent).toBe("공동 편집자(0)");
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
    await click(byTestId("erd-editors-open"));
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
    await click(byTestId("erd-ver-unlock")); // 낡은 rowVersion(0)이 남았다면 0 을 보낸다
    expect(calls.find((c) => c.action === "unlock")?.params).toEqual({ modelId: "mcm", ver: "1.000", rowVersion: 9 });
  });
});
