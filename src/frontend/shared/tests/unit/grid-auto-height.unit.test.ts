/** @vitest-environment happy-dom */

// AgDataGrid height="auto" — 카드 안 작은 목록은 행 수만큼 높이가 늘어난다(ag domLayout="autoHeight").
// 기본은 부모 높이(100%)를 채우고 행은 안에서 스크롤한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    expect(grid.classList.contains("cm-data-grid-auto-height")).toBe(true);
  });

  // .cm-data-grid 의 contain: strict 는 크기 격리를 포함해 높이 auto 를 0 으로 만든다(2026-09-29 표가 사라짐).
  it("자동 높이 그리드는 크기 격리를 풀어 내용 높이만큼 늘어난다", () => {
    const css = readFileSync(resolve(__dirname, "../../src/components/grid/grid.css"), "utf8");
    expect(css).toMatch(/\.cm-data-grid\.cm-data-grid-auto-height\s*\{[^}]*contain:\s*layout paint;/);
  });

  // ag 기본 CSS 가 autoHeight 본문에 min-height:150px 를 걸어 한 행짜리 표 아래가 비었다(2026-09-29 입력 계약).
  it("행이 있는 자동 높이 그리드는 ag 의 150px 하한을 풀고, 빈 그리드는 빈 표 문구 자리로 남긴다", async () => {
    const css = readFileSync(resolve(__dirname, "../../src/components/grid/grid.css"), "utf8");
    expect(css).toMatch(/\.cm-data-grid\.cm-data-grid-auto-height:not\(\.cm-data-grid-empty\) \.ag-center-cols-viewport,[^{]*\{[^}]*min-height:\s*0;/);
    expect((await render({ height: "auto" })).classList.contains("cm-data-grid-empty")).toBe(false);
    await act(async () => root?.unmount());
    container.remove();
    expect((await render({ height: "auto", data: [] })).classList.contains("cm-data-grid-empty")).toBe(true);
  });

  it("height 를 주지 않으면 부모 높이(100%)를 채우는 normal 배치다", async () => {
    const grid = await render({});
    expect(grid.style.height).toBe("100%");
    expect(grid.querySelector(".ag-layout-normal")).not.toBeNull();
    expect(grid.querySelector(".ag-layout-auto-height")).toBeNull();
    expect(grid.classList.contains("cm-data-grid-auto-height")).toBe(false);
  });
});
