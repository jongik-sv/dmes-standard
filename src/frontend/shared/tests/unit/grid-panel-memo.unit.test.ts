/** @vitest-environment happy-dom */
/**
 * GridPanel·GridHeaderBar memo 실효화 — 화면이 렌더마다 새로 만드는 JSX·객체가 같은 내용이면 다시 그리지 않고,
 * 단추 onClick 이 인라인 함수로 바뀌어도 머리줄은 다시 그리지 않으면서 클릭은 최신 함수를 부른다.
 */
import { act, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { GridPanel } from "../../src/components/grid/GridPanel";
import { sameProps, sameValue } from "../../src/components/grid/grid-node-equal";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let r: Rendered | null = null;
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
});

const renders = { extra: 0, child: 0 };
function Extra({ label }: { label: string }) {
  renders.extra += 1;
  return createElement("i", { "data-testid": "extra" }, label);
}
function Child({ label }: { label: string }) {
  renders.child += 1;
  return createElement("b", { "data-testid": "child" }, label);
}

describe("grid-node-equal", () => {
  it("같은 부품·같은 props 요소와 같은 내용의 객체는 같다", () => {
    expect(sameValue(createElement(Child, { label: "a" }), createElement(Child, { label: "a" }))).toBe(true);
    expect(sameValue(createElement(Child, { label: "a" }), createElement(Child, { label: "b" }))).toBe(false);
    expect(sameValue(createElement(Child, { label: "a" }), createElement(Extra, { label: "a" }))).toBe(false);
    expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
  });
  it("인라인 함수는 참조가 다르면 다르다고 본다", () => {
    expect(sameProps({ onClick: () => {} }, { onClick: () => {} })).toBe(false);
    const f = () => {};
    expect(sameProps({ onClick: f }, { onClick: f })).toBe(true);
  });
  it("배열 길이 한도를 넘으면 참조 비교만 한다", () => {
    const big = () => Array.from({ length: 200 }, (_, i) => ({ i }));
    expect(sameValue(big(), big())).toBe(false);
  });
});

describe("GridPanel memo", () => {
  const panel = (extra: Record<string, unknown>) =>
    createElement(GridPanel, { title: "목록", count: 2, ...extra }, createElement(Child, { label: "그리드" }));

  it("새 JSX 를 같은 내용으로 넘기면 GridPanel 자식도 다시 그리지 않는다", async () => {
    renders.child = 0;
    await act(async () => void (r = renderWithMantine(panel({ titleExtra: createElement(Extra, { label: "e" }) }))));
    const childBase = renders.child;
    const extraBase = renders.extra;
    await act(async () => rerender(r!, panel({ titleExtra: createElement(Extra, { label: "e" }) })));
    expect(renders.child).toBe(childBase);
    expect(renders.extra).toBe(extraBase);
  });

  it("단추 onClick 이 인라인 함수로 바뀌어도 머리줄(titleExtra)은 다시 그리지 않고 클릭은 최신 함수를 부른다", async () => {
    const calls: string[] = [];
    const make = (tag: string) =>
      panel({
        titleExtra: createElement(Extra, { label: "e" }),
        buttons: [{ id: "btn_save", label: "저장", onClick: () => calls.push(tag) }],
      });
    await act(async () => void (r = renderWithMantine(make("v1"))));
    const extraBase = renders.extra;
    await act(async () => rerender(r!, make("v2")));
    expect(renders.extra).toBe(extraBase);
    await act(async () => void (document.getElementById("btn_save") as HTMLButtonElement).click());
    expect(calls).toEqual(["v2"]);
  });

  it("단추 모양이 바뀌면(비활성) 머리줄에 반영한다", async () => {
    const make = (disabled: boolean) => panel({ buttons: [{ id: "btn_x", label: "실행", disabled, onClick: () => {} }] });
    await act(async () => void (r = renderWithMantine(make(false))));
    expect((document.getElementById("btn_x") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => rerender(r!, make(true)));
    expect((document.getElementById("btn_x") as HTMLButtonElement).disabled).toBe(true);
  });
});
