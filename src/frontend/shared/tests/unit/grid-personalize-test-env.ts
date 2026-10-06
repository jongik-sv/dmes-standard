/**
 * 컬럼 개인화(C2) 렌더 시험 도구.
 * - `installMemoryLocalStorage`: happy-dom 에서 localStorage 가 가려질 수 있어 Map 저장소를 전역·window 에 둔다.
 * - `seedCurrentUser`: 공유 사용자 저장소를 채운다(그리드는 사용자 확인을 부르지 않고 읽기만 한다).
 * - `traceAutoSize`: 마운트·데이터 갱신·그리드 폭 변경(gridSizeChanged)에서 ag-grid 의 autoSizeAllColumns·autoSizeColumns·
 *   sizeColumnsToFit 호출 순서와 최종 너비를 문자열로 남긴다. 개인화 전 코드(de442cdc)에서 얻은 기록과 비교해 저장값 없는 그리드가
 *   예전과 같음을 고정한다. happy-dom 은 폭이 0 이라 그리드 바깥 상자(.cm-data-grid)의 clientWidth 만 흉내 낸다.
 */
import { act, createElement, type ComponentType } from "react";
import type { Root } from "react-dom/client";
import { AgGridReact } from "ag-grid-react";
import type { Column, GridApi } from "ag-grid-community";
import { vi } from "vitest";

import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { getCurrentUser } from "../../src/portal-shell/current-user";

export class MemStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}

/** Map 저장소를 전역·window 의 localStorage 로 둔다(content-body-resizable 시험과 같은 방식). */
export function installMemoryLocalStorage(): MemStorage {
  const ls = new MemStorage();
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  if (typeof window !== "undefined") Object.defineProperty(window, "localStorage", { value: ls, configurable: true });
  return ls;
}

/** /api/auth/me 를 흉내 내고 공유 사용자 저장소를 채운다(포털 부팅의 사용자 확인 자리). 그 뒤 fetch 스텁은 걷는다. */
export async function seedCurrentUser(id: string): Promise<void> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ authenticated: true, user: { id, name: "u" } }), { status: 200 })),
  );
  await act(async () => {
    await getCurrentUser();
  });
  vi.unstubAllGlobals();
}

export const TRACE_COLUMNS = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number" as const },
];
export const TRACE_DATA = [
  { code: "A", name: "가", qty: 1 },
  { code: "B", name: "나", qty: 2 },
];

function tick(ms: number) {
  return act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

export interface AutoSizeTraceOptions {
  root: Root;
  /** 기록할 그리드 컴포넌트(AgDataGrid 또는 옛 코드). */
  Grid: ComponentType<Record<string, unknown>>;
  columnSizing: "auto" | "fixed" | "fit";
  props?: Record<string, unknown>;
  /** 마운트 뒤, 데이터 갱신 전에 할 일(정렬 클릭 흉내 등). */
  beforeData?: (api: GridApi) => Promise<void>;
  screen?: string;
}

/**
 * 시나리오: 폭 900 으로 마운트 → 행 하나 더(데이터 갱신) → 폭 1300 으로 넓힘(gridSizeChanged).
 * 결과: `호출 | 호출 ... || 컬럼=너비 ...` 한 줄.
 */
export async function traceAutoSize(o: AutoSizeTraceOptions): Promise<string> {
  let width = 900;
  const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")!;
  const widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList?.contains("cm-data-grid") ? width : (desc.get!.call(this) as number);
  });
  const renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  const el = (extra: Record<string, unknown>) =>
    createElement(
      TabPageContext.Provider,
      { value: { pageId: o.screen ?? "trace-screen", serviceId: "", tabId: "trace-tab" } },
      createElement(o.Grid, {
        columns: TRACE_COLUMNS,
        rowKey: "code",
        data: TRACE_DATA,
        columnSizing: o.columnSizing,
        ...o.props,
        ...extra,
      }),
    );
  const calls: string[] = [];
  await act(async () => o.root.render(el({})));
  const findApi = () => (renderSpy.mock.contexts as Array<{ api?: GridApi }>).map((c) => c?.api).filter(Boolean).at(-1);
  // 첫 시험은 모듈 적재로 그리드 생성이 늦을 수 있다 — api 가 생길 때까지만 짧게 기다린다(자동 너비 타이머 50ms 보다 짧게).
  for (let i = 0; i < 50 && !findApi(); i++) await act(async () => await Promise.resolve());
  const api = findApi()!;
  const record = (name: "autoSizeAllColumns" | "autoSizeColumns" | "sizeColumnsToFit") => {
    const orig = (api[name] as (...args: unknown[]) => void).bind(api);
    vi.spyOn(api, name).mockImplementation(((...args: unknown[]) => {
      if (name === "autoSizeColumns") {
        const keys = (args[0] as Array<string | Column>).map((k) => (typeof k === "string" ? k : k.getColId()));
        calls.push(`autoSizeColumns(${keys.join(",")})`);
      } else calls.push(name);
      return orig(...args);
    }) as never);
  };
  record("autoSizeAllColumns");
  record("autoSizeColumns");
  record("sizeColumnsToFit");
  await tick(400);
  if (o.beforeData) await o.beforeData(api);
  calls.push("data");
  await act(async () => o.root.render(el({ data: [...TRACE_DATA, { code: "C", name: "다다다다다", qty: 3 }] })));
  await tick(400);
  calls.push("resize");
  width = 1300;
  await act(async () => void api.dispatchEvent({ type: "gridSizeChanged", clientWidth: 1300, clientHeight: 400 } as never));
  await tick(400);
  const widths = api.getAllGridColumns().map((c) => `${c.getColId()}=${c.getActualWidth()}`);
  renderSpy.mockRestore();
  widthSpy.mockRestore();
  return `${calls.join(" ")} || ${widths.join(" ")}`;
}
