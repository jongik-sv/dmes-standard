/** @vitest-environment happy-dom */

// AgDataGrid height="auto" — 카드 안 작은 목록은 행 수만큼 높이가 늘어난다(ag domLayout="autoHeight").
// 기본은 부모 높이(100%)를 채우고 행은 안에서 스크롤한다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AgDataGrid } from "../../src/components/grid/AgDataGrid";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const columns = [{ key: "code", header: "코드" }];
let container: HTMLDivElement;
let root: Root | null = null;

async function render(props: Record<string, unknown>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AgDataGrid, { columns, rowKey: "code", data: [{ code: "A" }], ...props }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  return container.querySelector(".cm-data-grid") as HTMLElement;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
});

describe("AgDataGrid 높이", () => {
  it('height="auto" 면 컨테이너 높이를 두지 않고 ag 를 autoHeight 배치로 그린다', async () => {
    const grid = await render({ height: "auto" });
    expect(grid.style.height).toBe("auto");
    expect(grid.querySelector(".ag-layout-auto-height")).not.toBeNull();
  });

  it("height 를 주지 않으면 부모 높이(100%)를 채우는 normal 배치다", async () => {
    const grid = await render({});
    expect(grid.style.height).toBe("100%");
    expect(grid.querySelector(".ag-layout-normal")).not.toBeNull();
    expect(grid.querySelector(".ag-layout-auto-height")).toBeNull();
  });
});
