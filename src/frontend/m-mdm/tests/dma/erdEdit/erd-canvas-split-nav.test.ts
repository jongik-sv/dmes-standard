/** @vitest-environment happy-dom */
// 주제별로 나누기 끝 -> 첫 새 다이어그램으로 가기를 실제 화면(page)으로 확인한다.
// useCanvasEditing.onSplitCreated 가 응답 직후 nav.selectDiagram(첫 id) 를 부르고, 화면 상태에 아직 없으면 ErdViewer 가
// pendingDiagram 에 두었다가 나타날 때 연다. 여기서는 apply -> 응답 -> 델타 -> 상태 순서를 그대로 거쳐 열린 다이어그램을 본다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import ErdEditPage from "../../../pages/dma/erdEdit/page";
import type { ErdCommandJson, ErdModelView } from "../../../pages/dma/erdEdit/types";
import { settleGrid } from "../../dme/helpers/render";
import { mcmModel } from "./erd-canvas-fixtures";
import { FakeEventSource as FakeES, viewOf } from "./erd-fixtures";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
const g = globalThis as unknown as { EventSource?: unknown };
const originalEventSource = g.EventSource;

const MODEL_ROW = { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM 스키마", rev: 3, draftVer: "1.000", ownerId: "tester" };
const STATUS = {
  modelId: "mcm", ver: "1.000", rev: 3, statuses: {}, domains: {},
  counts: { OK: 0, ALIAS: 0, NEW: 0, TYPE: 0, DOMAIN: 0, MISS: 0 }, elapsedMs: 5,
};

let calls: Array<{ action: string; params: Record<string, unknown> }> = [];
let saves: ErdCommandJson[][] = [];
let serverRev = 3;
let currentView: ErdModelView;
let host: HTMLDivElement;
let root: Root | null = null;

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

/** save 응답 — 보낸 명령(addDiagram·placeTables)을 서버 변경(diagram·diagramNode)으로 풀어 돌려준다. rev 는 한 묶음에 1씩 오른다. */
function saveResult(commands: ErdCommandJson[]) {
  const changes: Array<{ kind: string; id: string; op: string; value: unknown }> = [];
  for (const c of commands) {
    if (c.op === "addDiagram") {
      const id = String(c.id);
      changes.push({ kind: "diagram", id, op: "add", value: { id, areaName: c.areaName, diagramName: c.diagramName, sortSeq: c.sortSeq } });
    } else if (c.op === "placeTables") {
      const diagram = String(c.diagram);
      for (const n of c.nodes as Array<{ table: string; x: number; y: number }>) {
        changes.push({ kind: "diagramNode", id: `${diagram}:${n.table}`, op: "add", value: { diagram, table: n.table, x: n.x, y: n.y, foldMode: "NONE" } });
      }
    }
  }
  serverRev += 1;
  return { applied: true, rev: serverRev, rowVersion: null, warnings: [], rejection: null, changes };
}

function stubFetch() {
  calls = [];
  saves = [];
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
    if (action === "search") return new Response(JSON.stringify({ meta: { success: true }, data: {}, grids: { result: { rows: [MODEL_ROW] } } }), { status: 200 });
    if (action === "view" && params.kind === "STATUS") return ok(STATUS);
    if (action === "view" && params.kind === "SET_VIEW") return ok({ ok: true });
    if (action === "view" && params.sinceRev !== undefined) return ok({ rev: currentView.rev, reload: false, deltas: [], fromRev: null });
    if (action === "view") return ok(currentView);
    if (action === "save") {
      const commands = JSON.parse(String(params.commandsJson)) as ErdCommandJson[];
      saves.push(commands);
      await new Promise((r) => setTimeout(r, 30)); // 서버 왕복 — 응답이 오기 전에는 상태에 새 다이어그램이 없다
      return ok(saveResult(commands));
    }
    return ok({});
  }) as typeof fetch;
}

async function settle(ms = 50) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function waitFor<T>(get: () => T | null | undefined, ms = 3000): Promise<T> {
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

async function click(el: Element | null) {
  expect(el, "누를 요소가 없다").not.toBeNull();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

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

/** 트리에서 지금 열려 있는 다이어그램 단추(aria-current). */
const activeItems = () => [...host.querySelectorAll<HTMLElement>('[data-testid^="erd-diagram-"][aria-current="true"]')];

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  FakeES.all = [];
  g.EventSource = FakeES;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k), clear: () => store.clear(),
  });
  serverRev = 3;
  currentView = viewOf(mcmModel(), { diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }], nodes: [] });
  stubFetch();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  document.body.innerHTML = "";
  globalThis.fetch = originalFetch;
  g.EventSource = originalEventSource;
  vi.unstubAllGlobals();
});

describe("주제별로 나누기 -> 첫 새 다이어그램 열기(U53)", () => {
  it("[만들기] 뒤 응답이 상태에 얹히면 첫 새 다이어그램(JOB 1)이 열린 다이어그램이 된다", async () => {
    await openModel();
    // 처음에는 전체(d-all)가 열려 있다
    expect(activeItems().map((e) => e.dataset.testid)).toEqual(["erd-diagram-d-all"]);

    await click(docTestId("erd-tool-split"));
    await settleGrid(docTestId("erd-split-dialog")!);
    expect(docTestId("erd-split-dialog")).not.toBeNull();
    expect((docTestId("erd-split-ok") as HTMLButtonElement).disabled).toBe(false);
    await click(docTestId("erd-split-ok"));

    // 묶음마다 save 가 가고, 첫 묶음의 첫 addDiagram 이 JOB 1 이다
    await waitFor(() => (saves.length > 0 ? true : null));
    const adds = saves.flat().filter((c) => c.op === "addDiagram");
    const first = saves[0].find((c) => c.op === "addDiagram")!;
    expect(first.diagramName).toBe("JOB 1");
    expect(first.areaName).toBe("주제별");

    // 새 다이어그램이 트리에 나타나고 그것이 열린 다이어그램이다
    const item = await waitFor(() => byTestId(`erd-diagram-${String(first.id)}`));
    await waitFor(() => (item.getAttribute("aria-current") === "true" ? true : null));
    expect(item.textContent).toContain("JOB 1");
    expect(activeItems().map((e) => e.dataset.testid)).toEqual([`erd-diagram-${String(first.id)}`]);
    expect(byTestId("erd-diagram-d-all")?.hasAttribute("aria-current")).toBe(false);

    // 만든 다이어그램이 모두 트리에 있고(마지막 묶음 응답까지 얹힘), 창은 닫혔으며, 열린 곳은 끝까지 JOB 1 이다
    await waitFor(() => (adds.every((c) => byTestId(`erd-diagram-${String(c.id)}`)) ? true : null));
    await settle(400);
    expect(docTestId("erd-split-dialog")).toBeNull();
    expect(activeItems().map((e) => e.dataset.testid)).toEqual([`erd-diagram-${String(first.id)}`]);
    expect(adds.map((c) => c.diagramName)).toEqual(["JOB 1", "JOB 2", "SEC", "기타"]);  });
});
