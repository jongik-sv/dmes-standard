// FE3(그리드·차이) 시험 공용 — 가짜 편집 문맥·가짜 OASIS·그리기 도우미. 시험 파일이 아니다(vitest 는 *.test.ts 만 모은다).
// FE1 의 erd-fixtures.ts 는 고치지 않고 모델과 fakeEditContext 를 빌려 쓴다(README "화면 내부 계약" 시험 도구).
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { ApplyOutcome, EditRights, ErdEditContext, ErdNotice } from "../../../pages/dma/erdEdit/edit-context";
import type { ErdCommandJson, ErdNamePreview } from "../../../pages/dma/erdEdit/types";
import { RELEASED_TEXT } from "../../../pages/dma/erdEdit/state/permissions";
import { MENU_DIAGRAMS, fakeEditContext, menuModel, stateOf } from "./erd-fixtures";

const OK = { ok: true, reason: null };
export const ALL_RIGHTS: EditRights = { model: OK, diagram: OK, confirm: OK, manageEditors: OK, owner: true };
/** 서버·권한 판정이 주는 긴 이유(state/permissions RELEASED_TEXT) — 화면은 shortReason 으로 줄여 쓴다(U19). */
export const READ_ONLY = RELEASED_TEXT;
export const READ_ONLY_SHORT = "확정된 버전";
export const NO_MODEL_RIGHTS: EditRights = { ...ALL_RIGHTS, model: { ok: false, reason: READ_ONLY } };

export const APPLIED: ApplyOutcome = { ok: true, rev: 4, warnings: [] };
export type Respond = (commands: ErdCommandJson[], label: string) => ApplyOutcome;

/** 가짜 편집 문맥 — 메뉴·오브젝트 두 표(erd-fixtures menuModel), 고른 표 t-1, 모든 권한. apply 는 respond 결과를 돌려준다. */
export function fakeCtx(over: Partial<ErdEditContext> = {}, respond: Respond = () => APPLIED) {
  const apply = vi.fn(async (commands: ErdCommandJson[], label: string): Promise<ApplyOutcome> => respond(commands, label));
  const notify = vi.fn();
  const clearHighlight = vi.fn();
  const nav = { selectTable: vi.fn(), selectColumn: vi.fn(), openTableFind: vi.fn(), openColumnJump: vi.fn() };
  const ctx: ErdEditContext = fakeEditContext(stateOf(menuModel(), MENU_DIAGRAMS), {
    modelId: "mcm", session: "ui-test0001", me: "tester",
    rights: ALL_RIGHTS, diagramId: "d-all", selectedTableId: "t-1",
    apply, clearHighlight, notify, nav, ...over,
  });
  return { ctx, apply, notify, clearHighlight, nav };
}

function notice(over: Partial<ErdNotice>): ErdNotice {
  return { code: "INVALID", label: "", message: "", hint: null, commandIndex: 0, elementId: null, property: null, byRev: null,
    byUserId: null, bySession: null, current: null, mine: null, choices: null, ...over };
}

/** 서버 NEEDS_CHOICE choices(ErdColumnFill 모양 — 후보가 평평하다). 둘째 토막 "설명" 의 후보가 둘이다. */
export const DESC_CHOICES = [
  { seq: 1, surface: "메뉴", status: "MATCHED", candidates: [{ termId: 1, termName: "메뉴", senseNo: 1, engAbbr: "MENU", via: "NAME" }] },
  { seq: 2, surface: "설명", status: "AMBIGUOUS", candidates: [
    { termId: 5, termName: "설명", senseNo: 1, engAbbr: "DESC", via: "NAME" },
    { termId: 6, termName: "설명", senseNo: 2, engAbbr: "EXPL", via: "SYNONYM" },
  ] },
];

export function needsChoice(columnId: string): ApplyOutcome {
  return { ok: false, notice: notice({ code: "NEEDS_CHOICE", label: "토막 고르기", elementId: columnId, property: "phys",
    message: "논리명 '메뉴설명' 의 물리명을 하나로 정할 수 없습니다", hint: "choices 에서 토막별 약어를 골라 phys 를 직접 넣으세요",
    choices: DESC_CHOICES }) };
}

export function conflict(elementId: string, property: string): ApplyOutcome {
  return { ok: false, notice: notice({ code: "CONFLICT", label: "충돌", elementId, property, byRev: 5, byUserId: "41000207",
    bySession: "ui-other001", message: "다른 세션이 먼저 바꾼 값입니다", current: "역할설명" }) };
}

/** compare(kind 없음) 응답 — README ErdNamePreview 모양. 토막은 "메뉴"·"명" 둘이고 모두 MATCHED 다. */
export function previewOf(phys: string, over: Partial<ErdNamePreview> = {}): ErdNamePreview {
  const term = (termId: number, termName: string, engAbbr: string) => ({ termId, termName, engAbbr });
  return {
    physName: phys, logicalName: "메뉴 명", recommendedDomainId: null, status: "NEW",
    tokens: [
      { seq: 1, surface: "메뉴", status: "MATCHED", selected: term(1, "메뉴", "MENU"), abbr: "MENU", candidates: [{ term: term(1, "메뉴", "MENU"), via: "NAME" }] },
      { seq: 2, surface: "명", status: "MATCHED", selected: term(2, "명", "NM"), abbr: "NM", candidates: [{ term: term(2, "명", "NM"), via: "NAME" }] },
    ],
    ...over,
  };
}

export interface OasisCall { service: string; action: string; params: Record<string, unknown> }
type Handler = (params: Record<string, unknown>) => unknown;

/** fetch 가짜 — `/api/mdm/oasis/{service}/{action}` 을 handlers["service/action"] 로 답한다. 값은 data.result 로 싼다. */
export function stubOasis(handlers: Record<string, Handler>): OasisCall[] {
  const calls: OasisCall[] = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    const m = /^\/api\/mdm\/oasis\/([^/]+)\/([^/?]+)/.exec(u);
    if (!m) return new Response("{}", { status: 401 });
    const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
    calls.push({ service: m[1], action: m[2], params });
    const h = handlers[`${m[1]}/${m[2]}`];
    const result = h ? await h(params) : {};
    return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
  }) as typeof fetch;
  return calls;
}

/** Node 22+ 의 전역 localStorage 가 happy-dom 것을 가려 callOasis 의 토큰 읽기가 던진다(page-render.test 와 같은 갈음). */
export function installStorage(): void {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
}

export interface Mounted { host: HTMLDivElement; rerender(node: ReactElement): Promise<void>; unmount(): void }

export async function mount(node: ReactElement): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const draw = async (n: ReactElement) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, n));
    });
  };
  await draw(node);
  return { host, rerender: draw, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

export const inDoc = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.querySelector<T>(`[data-testid="${id}"]`);

export async function key(el: Element, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** 포털(body)의 [확인] 단추 — 공용 확인창(useMessage confirm). */
export function confirmButton(): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "확인");
}
