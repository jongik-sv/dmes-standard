/** @vitest-environment happy-dom */

// AgDataGrid 빈 상태 안내 — 조회 중 표시가 풀리면 행이 없을 때 "데이터 없음" 안내를 다시 띄우고,
// 나중에 행이 들어오면 그 안내가 행을 덮지 않는다(loading 을 쓰지 않는 그리드 포함).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AgDataGrid } from "../../src/components/grid/AgDataGrid";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const columns = [{ key: "code", header: "코드" }];
let container: HTMLDivElement;
let root: Root | null = null;

async function render(props: Record<string, unknown>) {
  await act(async () => {
    root!.render(createElement(AgDataGrid, { columns, rowKey: "code", emptyMessage: "없음", emptyTestId: "empty", ...props }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

const emptyShown = () => container.querySelector('[data-testid="empty"]') !== null;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
});

describe("AgDataGrid 빈 상태 안내", () => {
  it("조회 중 표시가 풀린 뒤 행이 없으면 안내를 보이고, 행이 오면 거둔다", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await render({ data: [], loading: true });
    expect(emptyShown()).toBe(false);
    await render({ data: [], loading: false });
    expect(emptyShown()).toBe(true);
    await render({ data: [{ code: "A" }, { code: "B" }], loading: false });
    expect(emptyShown()).toBe(false);
  });

  it("loading 을 쓰지 않는 그리드도 빈 채로 떴다가 행이 오면 안내를 거둔다", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await render({ data: [] });
    expect(emptyShown()).toBe(true);
    await render({ data: [{ code: "A" }] });
    expect(emptyShown()).toBe(false);
  });
});
