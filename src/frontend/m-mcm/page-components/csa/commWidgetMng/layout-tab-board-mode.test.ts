/** @vitest-environment happy-dom */
/**
 * 위젯관리 [기본 배치] 탭의 보드 맥락 시험(스펙 2026-10-02-widget-admin-generic §17.5).
 * 보드는 실제 칸을 그리므로 개인 메모 위젯이 관리자 본인 메모를 불러오거나 저장하지 않도록, LayoutTab 이 보드(WidgetWorkspace)를
 * WidgetBoardModeContext("preview")로 감싼다. shared 의 화면 부품(그리드·레이아웃·폼·메시지)과 WidgetWorkspace 는 대역으로 바꾸고,
 * WidgetWorkspace 대역은 자기 자리의 맥락 값을 data-board-mode 로 드러낸다. 서버 호출(./layout-api)과 생성 등록부도 대역이다.
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  /** useMessage 가 늘 같은 객체를 돌려줘야 loadList(useCallback)가 매번 새로 만들어져 효과가 되풀이되지 않는다. */
  message: { showMessage: vi.fn() },
  loadLayout: vi.fn(),
  searchLayouts: vi.fn(),
  fetchWidgetDefRows: vi.fn(),
}));

vi.mock("@dk-oasis/shared/message-provider", () => ({ useMessage: () => h.message }));

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    Button: (p: { children?: unknown; onClick?: () => void; disabled?: boolean }) =>
      el("button", { type: "button", onClick: p.onClick, disabled: p.disabled }, p.children as never),
    Spinner: (p: { label?: string }) => el("div", { role: "status" }, p.label),
  };
});

vi.mock("@dk-oasis/shared/grid", async () => {
  const { createElement: el } = await import("react");
  return {
    AgDataGrid: () => el("div", { "data-testid": "list-grid" }),
    GridPanel: (p: { title?: string; children?: unknown }) => el("section", { "data-panel": p.title }, p.children as never),
  };
});

vi.mock("@dk-oasis/shared/layout", async () => {
  const { createElement: el } = await import("react");
  const box = (p: { children?: unknown }) => el("div", null, p.children as never);
  return { ContentBody: box, ContentPanel: box };
});

vi.mock("@dk-oasis/shared/widget", async () => {
  const { createElement: el, useContext } = await import("react");
  const { WidgetBoardModeContext } = await import("@/lib/widget-board-mode");
  return {
    // 이 자리의 맥락 값을 그대로 드러낸다 — 실제 위젯 본체(WidgetFrame → 개인 메모)가 읽는 값과 같다.
    WidgetWorkspace: function WorkspaceDouble(p: { testId?: string }) {
      const mode = useContext(WidgetBoardModeContext);
      return el("div", { "data-testid": p.testId, "data-board-mode": mode });
    },
    mergeWidgetRegistry: () => ({}),
    toWidgetDefRow: (r: unknown) => r,
  };
});

vi.mock("@/lib/generated/widget-registry", () => ({ WIDGET_REGISTRY: {} }));
vi.mock("@/lib/generated/widget-type-registry", () => ({ WIDGET_TYPE_REGISTRY: {} }));
vi.mock("@/page-components/home/home-layout", () => ({ HOME_DEFAULT_LAYOUT: [] }));
vi.mock("./DeptPicker", () => ({ DeptPicker: () => null }));
vi.mock("./layout-api", () => ({
  searchLayouts: h.searchLayouts,
  loadLayout: h.loadLayout,
  fetchWidgetDefRows: h.fetchWidgetDefRows,
  deleteLayout: vi.fn(),
  saveLayout: vi.fn(),
  searchDepts: vi.fn(),
}));

const { LayoutTab } = await import("./LayoutTab");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  h.loadLayout.mockReset();
  h.searchLayouts.mockReset();
  h.fetchWidgetDefRows.mockReset();
  h.loadLayout.mockResolvedValue({ layoutKey: "*", sourceKey: null, items: [] });
  h.searchLayouts.mockResolvedValue([]);
  h.fetchWidgetDefRows.mockResolvedValue([]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("LayoutTab — 기본 배치 보드의 보드 맥락", () => {
  it("보드(WidgetWorkspace)를 WidgetBoardModeContext 의 preview 값으로 감싼다", async () => {
    await act(async () => {
      root.render(createElement(LayoutTab));
    });
    await flush();
    const board = container.querySelector<HTMLElement>('[data-testid="widget-layout-board"]');
    expect(board).not.toBeNull();
    expect(board!.getAttribute("data-board-mode")).toBe("preview");
  });
});
