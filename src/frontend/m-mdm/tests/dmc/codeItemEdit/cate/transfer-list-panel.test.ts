/** @vitest-environment happy-dom */

// 특성 시험 — dmc 코드 편집 카테고리 탭의 TransferListPanel 이 지금 그리는 testid·버튼 활성 조건·선택 동작을 고정한다
// (전체선택, >/>>/</<< 활성 조건, Shift 범위, lvl1 필터 표시 조건, 배지 testid, editable=false). 공통 골격(shared)으로
// 바꾼 뒤에도 고치지 않고 통과해야 한다. 선택은 행(div) 클릭으로 한다 — e2e(dmc.user.ts)도 행을 누른다.
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { TransferListPanel } from "../../../../pages/dmc/codeItemEdit/cate/components/TransferListPanel";
import type { TransferItem } from "../../../../pages/dmc/codeItemEdit/cate/transfer";

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
});

async function render(element: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, element));
  });
}

const testId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const button = (id: string) => testId(id) as HTMLButtonElement;

async function click(el: Element | null, init: MouseEventInit = {}) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
  });
}

async function typeInto(id: string, value: string) {
  const el = testId(id) as HTMLInputElement;
  expect(el, id).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function chooseOption(id: string, value: string) {
  const el = testId(id) as HTMLSelectElement;
  expect(el, id).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** 열 머리의 전체선택 체크박스 — 열 안 첫 checkbox. */
const selectAllOf = (side: "available" | "member") =>
  testId(`cate-transfer-${side}`)!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const rowCheckbox = (side: "available" | "member", code: string) =>
  testId(`cate-transfer-item-${side}-${code}`)!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const itemCodes = (side: "available" | "member") =>
  Array.from(testId(`cate-transfer-${side}`)!.querySelectorAll<HTMLElement>("[data-testid^='cate-transfer-item-']"))
    .map((el) => el.dataset.testid!.replace(`cate-transfer-item-${side}-`, ""));
const countText = (side: "available" | "member") =>
  testId(`cate-transfer-${side}`)!.querySelector("span")!.textContent;

const ITEMS: TransferItem[] = [
  { code: "A1", name: "에이1", lvl1: "G" },
  { code: "A2", name: "에이2", lvl1: "H" },
  { code: "A3", name: null, lvl1: "G" },
  { code: "A4", name: "에이4", lvl1: null },
  { code: "N1", name: "새 코드", lvl1: "G", mark: "unsaved" },
  { code: "D1", name: "지움", lvl1: "H", mark: "deleted" },
];

/** 제어형으로 감싼다 — onChange 를 받아 memberCodes 를 바꿔 다시 그린다. */
function Harness(props: { items: TransferItem[]; initial: string[]; editable?: boolean; spy: (next: Set<string>) => void }) {
  const [members, setMembers] = useState<ReadonlySet<string>>(new Set(props.initial));
  return createElement(TransferListPanel, {
    items: props.items,
    memberCodes: members,
    editable: props.editable ?? true,
    onChange: (next: Set<string>) => {
      props.spy(next);
      setMembers(next);
    },
  });
}

describe("dmc TransferListPanel — 구조와 testid", () => {
  it("뿌리·검색·두 열·항목·배지·이동 버튼 testid 를 그린다", async () => {
    await render(createElement(Harness, { items: ITEMS, initial: ["A2", "D1"], spy: () => {} }));
    for (const id of [
      "cate-transfer", "cate-transfer-search", "cate-transfer-lvl1", "cate-transfer-available", "cate-transfer-member",
      "cate-transfer-move-right", "cate-transfer-move-right-all", "cate-transfer-move-left", "cate-transfer-move-left-all",
    ]) expect(testId(id), id).not.toBeNull();
    // 삭제 표시 코드는 가능 쪽에 없고 소속 쪽에 배지와 함께 남는다.
    expect(itemCodes("available")).toEqual(["A1", "A3", "A4", "N1"]);
    expect(itemCodes("member")).toEqual(["A2", "D1"]);
    expect(testId("cate-transfer-mark-N1")?.textContent).toBe("미저장");
    expect(testId("cate-transfer-mark-D1")?.textContent).toBe("삭제 예정");
    expect(testId("cate-transfer-mark-A1")).toBeNull();
    // 행은 코드 칸과 이름 칸(null 이면 빈 글자) 두 span.
    const spans = testId("cate-transfer-item-available-A3")!.querySelectorAll(":scope > span");
    expect(spans[0].textContent).toBe("A3");
    expect(spans[1].textContent).toBe("");
    expect(countText("available")).toBe("가능 4건");
    expect(countText("member")).toBe("소속 2건");
    expect((testId("cate-transfer-search") as HTMLInputElement).placeholder).toBe("코드·이름 검색");
  });

  it("lvl1 값이 하나도 없으면 필터를 그리지 않는다", async () => {
    const items = ITEMS.map((i) => ({ ...i, lvl1: null }));
    await render(createElement(Harness, { items, initial: [], spy: () => {} }));
    expect(testId("cate-transfer-lvl1")).toBeNull();
    expect(testId("cate-transfer-search")).not.toBeNull();
  });

  it("lvl1 필터는 '1차 전체' + 값 목록이고 고르면 양쪽 목록을 거른다", async () => {
    await render(createElement(Harness, { items: ITEMS, initial: ["A2", "A1"], spy: () => {} }));
    const select = testId("cate-transfer-lvl1") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["1차 전체", "G", "H"]);
    await chooseOption("cate-transfer-lvl1", "G");
    expect(itemCodes("available")).toEqual(["A3", "N1"]);
    expect(itemCodes("member")).toEqual(["A1"]);
    await chooseOption("cate-transfer-lvl1", "");
    expect(itemCodes("available")).toEqual(["A3", "A4", "N1"]);
  });

  it("검색은 코드·이름으로 양쪽 목록을 함께 거른다", async () => {
    await render(createElement(Harness, { items: ITEMS, initial: ["A2"], spy: () => {} }));
    await typeInto("cate-transfer-search", "에이");
    expect(itemCodes("available")).toEqual(["A1", "A4"]);
    expect(itemCodes("member")).toEqual(["A2"]);
    expect(countText("available")).toBe("가능 2건");
  });
});

describe("dmc TransferListPanel — 이동 버튼 활성 조건과 동작", () => {
  it("> 와 < 는 그쪽 선택이 있어야, >> 와 << 는 그쪽 목록이 있어야 켜진다", async () => {
    await render(createElement(Harness, { items: ITEMS.slice(0, 2), initial: [], spy: () => {} }));
    expect(button("cate-transfer-move-right").disabled).toBe(true);
    expect(button("cate-transfer-move-right-all").disabled).toBe(false);
    expect(button("cate-transfer-move-left").disabled).toBe(true);
    expect(button("cate-transfer-move-left-all").disabled).toBe(true);
    await click(testId("cate-transfer-item-available-A1"));
    expect(rowCheckbox("available", "A1").checked).toBe(true);
    expect(button("cate-transfer-move-right").disabled).toBe(false);
  });

  it("> 는 고른 것만 옮기고 선택을 비운다, < 도 같다", async () => {
    const spy = vi.fn();
    await render(createElement(Harness, { items: ITEMS, initial: [], spy }));
    await click(testId("cate-transfer-item-available-A1"));
    await click(testId("cate-transfer-item-available-A3"));
    await click(button("cate-transfer-move-right"));
    expect([...spy.mock.calls[0][0]]).toEqual(["A1", "A3"]);
    expect(itemCodes("member")).toEqual(["A1", "A3"]);
    expect(button("cate-transfer-move-right").disabled).toBe(true);
    await click(testId("cate-transfer-item-member-A3"));
    await click(button("cate-transfer-move-left"));
    expect([...spy.mock.calls[1][0]]).toEqual(["A1"]);
    expect(button("cate-transfer-move-left").disabled).toBe(true);
  });

  it(">> 는 보이는 가능 목록 전부, << 는 보이는 소속 목록 전부를 옮긴다(검색 반영)", async () => {
    const spy = vi.fn();
    await render(createElement(Harness, { items: ITEMS, initial: ["A2"], spy }));
    await typeInto("cate-transfer-search", "에이");
    await click(button("cate-transfer-move-right-all"));
    expect([...spy.mock.calls[0][0]]).toEqual(["A2", "A1", "A4"]);
    await typeInto("cate-transfer-search", "A1");
    await click(button("cate-transfer-move-left-all"));
    expect([...spy.mock.calls[1][0]]).toEqual(["A2", "A4"]);
  });

  it(">> 는 이미 고른 선택을 비우지 않는다", async () => {
    await render(createElement(Harness, { items: ITEMS.slice(0, 3), initial: [], spy: () => {} }));
    await click(testId("cate-transfer-item-available-A1"));
    await click(button("cate-transfer-move-right-all"));
    expect(itemCodes("available")).toEqual([]);
    // 가능 쪽 선택(A1)은 남아 있어 > 가 켜진 채다.
    expect(button("cate-transfer-move-right").disabled).toBe(false);
  });
});

describe("dmc TransferListPanel — 선택", () => {
  it("행 클릭은 토글, Shift 클릭은 마지막으로 누른 행부터 범위를 고른다", async () => {
    await render(createElement(Harness, { items: ITEMS, initial: [], spy: () => {} }));
    await click(testId("cate-transfer-item-available-A1"));
    await click(testId("cate-transfer-item-available-N1"), { shiftKey: true });
    expect(["A1", "A3", "A4", "N1"].map((c) => rowCheckbox("available", c).checked)).toEqual([true, true, true, true]);
    // 위로 거슬러 Shift — 기준점(A1)은 그대로라 A1 하나만.
    await click(testId("cate-transfer-item-available-A1"), { shiftKey: true });
    expect(["A1", "A3", "A4", "N1"].map((c) => rowCheckbox("available", c).checked)).toEqual([true, false, false, false]);
    await click(testId("cate-transfer-item-available-A1"));
    expect(rowCheckbox("available", "A1").checked).toBe(false);
  });

  it("기준점 없이 Shift 클릭하면 그 행 하나만 고른다", async () => {
    await render(createElement(Harness, { items: ITEMS, initial: [], spy: () => {} }));
    await click(testId("cate-transfer-item-available-A3"), { shiftKey: true });
    expect(["A1", "A3", "A4"].map((c) => rowCheckbox("available", c).checked)).toEqual([false, true, false]);
  });

  it("전체선택은 보이는 목록을 모두 고르고 다시 누르면 비운다, 목록이 비면 꺼진다", async () => {
    await render(createElement(Harness, { items: ITEMS.slice(0, 3), initial: [], spy: () => {} }));
    expect(selectAllOf("member").disabled).toBe(true);
    expect(selectAllOf("available").checked).toBe(false);
    await click(selectAllOf("available"));
    expect(selectAllOf("available").checked).toBe(true);
    expect(["A1", "A2", "A3"].map((c) => rowCheckbox("available", c).checked)).toEqual([true, true, true]);
    expect(button("cate-transfer-move-right").disabled).toBe(false);
    await click(selectAllOf("available"));
    expect(["A1", "A2", "A3"].map((c) => rowCheckbox("available", c).checked)).toEqual([false, false, false]);
  });
});

describe("dmc TransferListPanel — editable=false", () => {
  it("이동·전체선택·행 체크박스가 꺼지고 행 클릭으로 고를 수 없다, 검색은 된다", async () => {
    const spy = vi.fn();
    await render(createElement(Harness, { items: ITEMS, initial: ["A2"], editable: false, spy }));
    for (const id of [
      "cate-transfer-move-right", "cate-transfer-move-right-all", "cate-transfer-move-left", "cate-transfer-move-left-all",
    ]) expect(button(id).disabled, id).toBe(true);
    expect(selectAllOf("available").disabled).toBe(true);
    expect(selectAllOf("member").disabled).toBe(true);
    expect(rowCheckbox("available", "A1").disabled).toBe(true);
    await click(testId("cate-transfer-item-available-A1"));
    expect(rowCheckbox("available", "A1").checked).toBe(false);
    expect((testId("cate-transfer-search") as HTMLInputElement).disabled).toBe(false);
    await typeInto("cate-transfer-search", "A2");
    expect(itemCodes("member")).toEqual(["A2"]);
    expect(spy).not.toHaveBeenCalled();
  });
});
