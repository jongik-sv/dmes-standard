// 룰 세트 편집 화면 렌더 테스트 공용 도우미 — 3단계 계획 F11. 목 서버(ruleSetEdit OASIS·로그인·RBAC 응답)·화면 렌더·testid 찾기·누르기·기다리기.
// `.test.ts` 가 아니라 수집되지 않는다(`render.ts` 선례). `vi.mock`·`vi.hoisted` 는 파일마다(호출하는 테스트 파일에) 둔다 —
// 이 파일이 가져오는 page 모듈도 그 목을 따른다.
//
// 쓰는 법: beforeEach 에서 `installServer()`, afterEach 에서 `uninstallServer()`. 응답은 `srv.views`·`srv.replies` 에 두고,
// 요청은 `calls(action)` 으로 읽는다. 화면은 `renderPage()`(또는 `openSet(id, view)`)로 그리고 `q`·`byTestId`·`click` 로 다룬다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import RuleSetEditPage from "../../../pages/dme/ruleSetEdit/page";
import type { RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "./render";

export interface RuleSetServer {
  /** 받은 ruleSetEdit 요청(action·본문) — 순서대로. */
  requests: Array<{ action: string; body: Record<string, unknown> }>;
  /** view 응답 — 세트 ID → view. 없으면 "룰 세트를 찾을 수 없습니다" 실패. */
  views: Record<string, RuleSetView>;
  /** 그 밖 응답 — 키는 action(search 는 `search:{target}`). 없으면 빈 결과. */
  replies: Record<string, unknown>;
  /** validate 응답을 손으로 풀 때 — 비어 있으면 replies.validate 를 곧바로 돌려준다. */
  validateQueue: Array<Promise<unknown>>;
  /** 값이 있으면 execute 응답을 이 약속이 풀릴 때까지 붙잡아 둔다(늦은 응답 재현). */
  executeGate: Promise<void> | null;
  /** 내 버튼 권한 행(RBAC). 기본은 모두 허용. */
  rbacRows: Array<Record<string, string>>;
}

export const ALL_RBAC: Array<Record<string, string>> = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];

export const srv: RuleSetServer = { requests: [], views: {}, replies: {}, validateQueue: [], executeGate: null, rbacRows: ALL_RBAC };

export const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });
export const calls = (action: string) => srv.requests.filter((r) => r.action === action);

const originalFetch = globalThis.fetch;
const originalConfirm = typeof window === "undefined" ? undefined : window.confirm;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** 저장소·목 서버를 새로 깐다(응답·요청·권한을 비우고 confirm 은 늘 true). */
export function installServer(): void {
  installDomStorage();
  srv.requests = [];
  srv.views = {};
  srv.replies = {};
  srv.validateQueue = [];
  srv.executeGate = null;
  srv.rbacRows = ALL_RBAC;
  window.confirm = vi.fn(() => true);
  delete (globalThis as Record<string, unknown>).__mdmPageHandoff__;
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const m = url.match(/\/oasis\/ruleSetEdit\/(\w+)/);
    if (m) {
      const action = m[1];
      srv.requests.push({ action, body });
      const params = (body.params ?? {}) as Record<string, string>;
      if (action === "view") {
        const v = srv.views[params.setId];
        return jsonResponse(v ? ok(v) : { meta: { success: false, message: `룰 세트를 찾을 수 없습니다: ${params.setId}` } });
      }
      if (action === "validate" && srv.validateQueue.length > 0) return jsonResponse(await srv.validateQueue.shift()!);
      if (action === "execute" && srv.executeGate) await srv.executeGate;
      const key = action === "search" ? `search:${params.target ?? "SET"}` : action;
      return jsonResponse(srv.replies[key] ?? ok({}));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) return jsonResponse({ grids: { buttons: { rows: srv.rbacRows } } });
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

/** 화면을 내리고 fetch·confirm·전역 넘김 값을 되돌린다. */
export function uninstallServer(): void {
  unmountPage();
  globalThis.fetch = originalFetch;
  if (originalConfirm) window.confirm = originalConfirm;
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  delete (globalThis as Record<string, unknown>).__mdmPageHandoff__;
}

/** 화면 간 넘김 — 다음 렌더(또는 탭 다시 활성화)가 이 세트를 연다. */
export function handoff(setId: string): void {
  const g = globalThis as Record<string, unknown>;
  const store = (g.__mdmPageHandoff__ ??= {}) as Record<string, Record<string, string>>;
  store["mdm:dme/ruleSetEdit"] = { setId };
}

export async function settle(ms = 300): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** 화면을 새 루트로 그리고 첫 요청이 끝나기를 기다린다. */
export async function renderPage(props: { tabId?: string } = {}): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleSetEditPage, props)));
  });
  await flush();
  await settle();
}

/** view 를 두고 넘김으로 그 세트를 연다. */
export async function openSet(setId: string, view: RuleSetView, props: { tabId?: string } = {}): Promise<void> {
  srv.views[setId] = view;
  handoff(setId);
  await renderPage(props);
}

export function unmountPage(): void {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
}

/** 지금 그린 화면 틀(renderPage 전이면 던진다). */
export function pageContainer(): HTMLDivElement {
  if (!container) throw new Error("화면을 먼저 그린다(renderPage)");
  return container;
}

export function q<T extends Element = HTMLElement>(id: string): T | null {
  return pageContainer().querySelector(`[data-testid="${id}"]`) as T | null;
}

export function byTestId<T extends Element = HTMLElement>(id: string): T {
  const el = q<T>(id);
  if (!el) throw new Error(`data-testid ${id} 없음`);
  return el;
}

/** 팝업(Modal)은 body 로 포털되므로 문서 전체에서 찾는다. */
export function inDoc<T extends Element = HTMLElement>(id: string): T {
  const el = document.querySelector(`[data-testid="${id}"]`) as T | null;
  if (!el) throw new Error(`문서에 data-testid ${id} 없음`);
  return el;
}

export async function click(id: string): Promise<void> {
  await act(async () => {
    byTestId<HTMLElement>(id).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

/**
 * 선에 마우스를 올린다(L1 — 편집 모드의 선 [+] 는 올리거나 고른 선에만 보인다). React 의 onMouseEnter 흉내는
 * relatedTarget 이 없는 mouseover 를 "창 밖에서 들어옴" 으로 받는다.
 */
export async function hoverEdge(edgeId: string): Promise<void> {
  const path = pageContainer().querySelector(`[data-testid="rf__edge-${edgeId}"] path`);
  if (!path) throw new Error(`선 ${edgeId} 없음`);
  await act(async () => {
    path.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
  });
  await flush();
}

/** 가짜 타이머에서 누르기 — flush(진짜 setTimeout)를 쓰지 않는다. */
export async function clickFake(id: string): Promise<void> {
  await act(async () => {
    byTestId<HTMLElement>(id).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** 캔버스에 그려진 흐름 노드 ID(메모·그룹·배지 제외). */
export function canvasNodeIds(): string[] {
  return Array.from(pageContainer().querySelectorAll('[data-testid^="flow-node-"]'))
    .map((e) => e.getAttribute("data-testid")!)
    .filter((t) => !/^flow-node-(mark|seq|chip|icon|edited|grip)-/.test(t))
    .map((t) => t.slice("flow-node-".length));
}
