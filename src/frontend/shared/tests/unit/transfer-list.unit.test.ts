/** @vitest-environment happy-dom */

// 전송 목록(shared transfer-list) — 순수 함수(검색·분류·숨김·범위 선택·이동·diff 집합)와 제어형 부품(value/onChange,
// testId 접두어 조립, 분류 필터 표시 조건, 배지, 버튼 활성 조건, editable=false, 문구 주입).
import { act, createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  diffSets, groupOptions, matchesGroup, matchesQuery, moveAllVisible, moveSelected, rangeSelect, removeAllVisible,
  removeSelected, selectAllVisible, toggleSelect, TransferList, visibleList, type TransferListProps,
} from "../../src/components/transfer-list";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

interface Item { code: string; name: string | null; cat: string | null; gone?: boolean }

const ITEMS: Item[] = [
  { code: "A1", name: "에이1", cat: "G" },
  { code: "A2", name: "에이2", cat: "H" },
  { code: "A3", name: null, cat: "G" },
  { code: "X9", name: "지움", cat: null, gone: true },
];
const getCat = (it: Item) => it.cat;
const isGone = (it: Item) => !!it.gone;
const codes = (list: { code: string }[]) => list.map((i) => i.code);

describe("transfer-set 순수 함수", () => {
  it("matchesQuery — 코드·이름 부분 일치, 공백·대소문자 무시, 이름 없으면 빈 글자", () => {
    expect(matchesQuery({ code: "AB-01", name: "에이비" }, " ab-0 ")).toBe(true);
    expect(matchesQuery({ code: "AB-01", name: "에이비" }, "에이")).toBe(true);
    expect(matchesQuery({ code: "AB-01" }, "zz")).toBe(false);
    expect(matchesQuery({ code: "AB-01", name: null }, "")).toBe(true);
  });

  it("matchesGroup — 고른 분류가 비면 통과", () => {
    expect(matchesGroup("G", null)).toBe(true);
    expect(matchesGroup(null, "")).toBe(true);
    expect(matchesGroup("G", "G")).toBe(true);
    expect(matchesGroup(null, "G")).toBe(false);
  });

  it("visibleList — 소속으로 나누고 검색·분류·가능 쪽 숨김을 함께 건다", () => {
    const value = new Set(["A2", "X9"]);
    expect(codes(visibleList(ITEMS, value, "available"))).toEqual(["A1", "A3"]);
    expect(codes(visibleList(ITEMS, new Set(), "available"))).toEqual(["A1", "A2", "A3", "X9"]);
    expect(codes(visibleList(ITEMS, new Set(), "available", { hideFromAvailable: isGone }))).toEqual(["A1", "A2", "A3"]);
    expect(codes(visibleList(ITEMS, value, "member", { hideFromAvailable: isGone }))).toEqual(["A2", "X9"]);
    expect(codes(visibleList(ITEMS, new Set(), "available", { group: "G", getGroup: getCat }))).toEqual(["A1", "A3"]);
    // getGroup 이 없으면 group 을 줘도 거르지 않는다.
    expect(codes(visibleList(ITEMS, new Set(), "available", { group: "G" }))).toEqual(["A1", "A2", "A3", "X9"]);
    expect(codes(visibleList(ITEMS, value, "member", { query: "x9" }))).toEqual(["X9"]);
  });

  it("groupOptions — 빈 값 빼고 중복 없이 기본 .sort()", () => {
    expect(groupOptions([...ITEMS, { code: "B", name: null, cat: "A" }, { code: "C", name: null, cat: "g" }], getCat))
      .toEqual(["A", "G", "H", "g"]);
  });

  it("rangeSelect·toggleSelect·selectAllVisible", () => {
    expect([...rangeSelect(ITEMS, "A3", "A1")]).toEqual(["A1", "A2", "A3"]);
    expect([...rangeSelect(ITEMS, null, "A2")]).toEqual(["A2"]);
    expect([...rangeSelect(ITEMS, "ZZ", "A2")]).toEqual(["A2"]);
    const s = new Set(["A1"]);
    expect([...toggleSelect(s, "A2")]).toEqual(["A1", "A2"]);
    expect([...toggleSelect(s, "A1")]).toEqual([]);
    expect([...s]).toEqual(["A1"]);
    expect([...selectAllVisible(ITEMS.slice(0, 2))]).toEqual(["A1", "A2"]);
  });

  it("이동 네 가지는 원본을 바꾸지 않고 새 Set 을 낸다", () => {
    const v = new Set(["A1"]);
    expect([...moveSelected(v, new Set(["A2"]))]).toEqual(["A1", "A2"]);
    expect([...removeSelected(v, new Set(["A1"]))]).toEqual([]);
    expect([...moveAllVisible(v, ITEMS.slice(1, 3))]).toEqual(["A1", "A2", "A3"]);
    expect([...removeAllVisible(new Set(["A1", "A2", "Z"]), ITEMS.slice(0, 2))]).toEqual(["Z"]);
    expect([...v]).toEqual(["A1"]);
  });

  it("diffSets — 정렬하지 않고 순회 순서대로 추가·해제를 낸다", () => {
    expect(diffSets(new Set(["b", "keep", "a"]), new Set(["z", "keep", "c"]))).toEqual({ added: ["z", "c"], removed: ["b", "a"] });
    expect(diffSets(new Set(["a"]), new Set(["a"]))).toEqual({ added: [], removed: [] });
  });
});

let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

const q = <T extends Element = HTMLElement>(id: string) => r!.host.querySelector<T>(`[data-testid="${id}"]`);
const btn = (id: string) => q<HTMLButtonElement>(id)!;
const listed = (prefix: string, side: "available" | "member") =>
  Array.from(q(`${prefix}-${side}`)!.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}-item-${side}-"]`))
    .map((el) => el.dataset.testid!.replace(`${prefix}-item-${side}-`, ""));
const click = (el: Element, init: MouseEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
  });
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

function Harness(props: Omit<TransferListProps<Item>, "value" | "onChange"> & { initial: string[]; spy?: (n: Set<string>) => void }) {
  const { initial, spy, ...rest } = props;
  const [value, setValue] = useState<ReadonlySet<string>>(new Set(initial));
  return createElement(TransferList<Item>, {
    ...rest,
    value,
    onChange: (next: Set<string>) => {
      spy?.(next);
      setValue(next);
    },
  });
}

describe("TransferList", () => {
  it("기본 testId 접두어는 transfer-list, 기본 문구는 코드·이름 검색·가능·소속·건, 분류 함수가 없으면 필터가 없다", () => {
    r = renderWithMantine(createElement(Harness, { items: ITEMS, initial: ["A2"] }));
    for (const id of [
      "transfer-list", "transfer-list-search", "transfer-list-available", "transfer-list-member",
      "transfer-list-move-right", "transfer-list-move-right-all", "transfer-list-move-left", "transfer-list-move-left-all",
    ]) expect(q(id), id).not.toBeNull();
    expect(q("transfer-list-group")).toBeNull();
    expect(q<HTMLInputElement>("transfer-list-search")!.placeholder).toBe("코드·이름 검색");
    expect(q("transfer-list-available")!.querySelector("span")!.textContent).toBe("가능 3건");
    expect(q("transfer-list-member")!.querySelector("span")!.textContent).toBe("소속 1건");
    expect(listed("transfer-list", "available")).toEqual(["A1", "A3", "X9"]);
  });

  it("testId·분류 접미·문구·배지·숨김을 props 로 받는다", () => {
    r = renderWithMantine(createElement(Harness, {
      items: ITEMS, initial: ["X9"], testId: "pick", getGroup: getCat, groupTestIdSuffix: "lvl1",
      hideFromAvailable: isGone,
      getBadge: (it: Item) => (it.gone ? { label: "삭제 예정", bg: "var(--color-danger-soft)", color: "var(--color-danger)" } : null),
      labels: { search: "찾기", available: "왼쪽", member: "오른쪽", countUnit: "개", groupAll: "1차 전체" },
    }));
    const select = q<HTMLSelectElement>("pick-lvl1")!;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["1차 전체", "G", "H"]);
    expect(q<HTMLInputElement>("pick-search")!.placeholder).toBe("찾기");
    expect(q("pick-available")!.querySelector("span")!.textContent).toBe("왼쪽 3개");
    expect(q("pick-member")!.querySelector("span")!.textContent).toBe("오른쪽 1개");
    expect(q("pick-mark-X9")!.textContent).toBe("삭제 예정");
    expect(q("pick-mark-A1")).toBeNull();
    choose(select, "G");
    expect(listed("pick", "available")).toEqual(["A1", "A3"]);
    expect(listed("pick", "member")).toEqual([]);
  });

  it("분류 값이 하나도 없으면 getGroup 을 줘도 필터를 그리지 않는다", () => {
    r = renderWithMantine(createElement(Harness, { items: ITEMS.map((i) => ({ ...i, cat: null })), initial: [], getGroup: getCat }));
    expect(q("transfer-list-group")).toBeNull();
  });

  it("제어형 — 이동마다 onChange(새 Set) 를 부르고 부모 value 로 다시 그린다", () => {
    const spy = vi.fn();
    r = renderWithMantine(createElement(Harness, { items: ITEMS, initial: [], spy }));
    expect(btn("transfer-list-move-right").disabled).toBe(true);
    expect(btn("transfer-list-move-left-all").disabled).toBe(true);
    click(q("transfer-list-item-available-A1")!);
    click(q("transfer-list-item-available-A3")!, { shiftKey: true });
    click(btn("transfer-list-move-right"));
    expect([...spy.mock.calls[0][0]]).toEqual(["A1", "A2", "A3"]);
    expect(listed("transfer-list", "member")).toEqual(["A1", "A2", "A3"]);
    expect(btn("transfer-list-move-right").disabled).toBe(true);
    typeInto(q<HTMLInputElement>("transfer-list-search")!, "에이2");
    click(btn("transfer-list-move-left-all"));
    expect([...spy.mock.calls[1][0]]).toEqual(["A1", "A3"]);
  });

  it("value 를 복사해 두지 않는다 — 부모가 value 를 바꾸면 그대로 따른다", () => {
    const onChange = vi.fn();
    r = renderWithMantine(createElement(TransferList<Item>, { items: ITEMS, value: new Set(["A1"]), onChange }));
    click(q("transfer-list-item-available-A2")!);
    click(btn("transfer-list-move-right"));
    expect([...onChange.mock.calls[0][0]]).toEqual(["A1", "A2"]);
    // 부모가 value 를 바꾸지 않았으므로 목록은 그대로다.
    expect(listed("transfer-list", "member")).toEqual(["A1"]);
  });

  it("editable=false 면 이동·선택이 꺼지고 검색은 된다", () => {
    const spy = vi.fn();
    r = renderWithMantine(createElement(Harness, { items: ITEMS, initial: ["A1"], editable: false, spy }));
    for (const id of ["move-right", "move-right-all", "move-left", "move-left-all"]) {
      expect(btn(`transfer-list-${id}`).disabled, id).toBe(true);
    }
    click(q("transfer-list-item-available-A2")!);
    const box = q("transfer-list-item-available-A2")!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(q<HTMLInputElement>("transfer-list-search")!.disabled).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
