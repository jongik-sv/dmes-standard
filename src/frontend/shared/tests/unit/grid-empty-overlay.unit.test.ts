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
    root!.render(
      createElement(AgDataGrid, {
        columns,
        rowKey: "code",
        emptyMessage: "없음",
        emptyTestId: "empty",
        ...props,
      })
    );
  });
}

// 안내(오버레이)는 ag-grid 가 setTimeout 사슬로 붙인다 — 준비 이벤트 → gridReady → 오버레이 부품 생성 →
// 포털 일괄 갱신 → 인스턴스 대기 → 붙이기. 한편 act(async) 는 그 사이의 React 갱신을 모아 두었다가 빠져나올 때
// 한꺼번에 처리하므로, "act 안에서 50ms 자기" 같은 고정 대기는 마지막 붙이기 단계가 act 뒤로 밀리면 놓친다
// (부하가 걸리면 가끔 실패했고, 대기를 200ms 로 늘려 보니 오히려 5회 모두 실패했다). 그래서 시간 대신 화면 조건을 기다린다:
// act 안에서 매크로태스크 한 번씩 흘려 ag-grid 타이머를 돌리고 React 갱신을 반영한 뒤 조건을 다시 본다.
// 상한은 실패를 알리기 위한 틱 수일 뿐 기다리는 시간이 아니다(평소 1~4 틱이면 맞는다).
const MAX_TICKS = 200;
async function waitUntil(what: string, cond: () => boolean) {
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    if (cond()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  throw new Error(`${MAX_TICKS} 틱을 흘려도 조건이 맞지 않았다: ${what}`);
}

const emptyShown = () => container.querySelector('[data-testid="empty"]') !== null;
const loadingShown = () => container.querySelector(".loading-spinner") !== null;
const rowShown = (code: string) =>
  container.querySelector(`.ag-center-cols-container [row-id="${code}"]`) !== null;

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
    await waitUntil("조회 중 표시", loadingShown);
    expect(emptyShown()).toBe(false);
    await render({ data: [], loading: false });
    await waitUntil("빈 상태 안내", emptyShown);
    expect(loadingShown()).toBe(false);
    await render({ data: [{ code: "A" }, { code: "B" }], loading: false });
    await waitUntil("행 A·B", () => rowShown("A") && rowShown("B"));
    expect(emptyShown()).toBe(false);
  });

  it("loading 을 쓰지 않는 그리드도 빈 채로 떴다가 행이 오면 안내를 거둔다", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await render({ data: [] });
    await waitUntil("빈 상태 안내", emptyShown);
    await render({ data: [{ code: "A" }] });
    await waitUntil("행 A", () => rowShown("A"));
    expect(emptyShown()).toBe(false);
  });
});
