/** @vitest-environment happy-dom */

// 특성 시험 — dmd 데이터 항목 카테고리 탭의 TransferListPanel(단순형)이 지금 그리는 testid·동작을 고정한다.
// 클릭 토글 → > → onChange 인자, 선택이 없어도 > 가 켜져 있고 누르면 바뀌지 않은 사본으로 onChange 를 부르는 점,
// [적용] → onApply, canEdit=false 비활성. 패널 교체(추가 B) 전까지 고치지 않고 통과해야 한다.
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { TransferListPanel } from "../../../../pages/dmd/dataItemMng/cate/components/TransferListPanel";
import type { TransferItem } from "../../../../pages/dmd/dataItemMng/cate/transfer";

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

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

const listed = (side: "available" | "member") =>
  Array.from(testId(`transfer-${side}`)!.querySelectorAll<HTMLElement>(":scope > div"))
    .map((el) => el.dataset.testid!.replace(`transfer-${side}-`, ""));

const ITEMS: TransferItem[] = [
  { code: "KRPUS", name: "부산", lvl1: "KR" },
  { code: "KRINC", name: "인천", lvl1: "KR" },
  { code: "CNSHA", name: null, lvl1: "CN" },
];

function Harness(props: { initial: string[]; canEdit?: boolean; spy: (next: Set<string>) => void; onApply?: () => void }) {
  const [members, setMembers] = useState<ReadonlySet<string>>(new Set(props.initial));
  return createElement(TransferListPanel, {
    items: ITEMS,
    memberCodes: members,
    canEdit: props.canEdit ?? true,
    onChange: (next: Set<string>) => {
      props.spy(next);
      setMembers(next);
    },
    onApply: props.onApply ?? (() => {}),
  });
}

describe("dmd TransferListPanel", () => {
  it("testid 와 항목 글(코드 + 공백 + 이름)을 그린다", async () => {
    await render(createElement(Harness, { initial: ["KRINC"], spy: () => {} }));
    for (const id of [
      "transfer-list-panel", "transfer-query", "transfer-available", "transfer-member", "transfer-move-right",
      "transfer-move-left", "transfer-apply",
    ]) expect(testId(id), id).not.toBeNull();
    expect(listed("available")).toEqual(["KRPUS", "CNSHA"]);
    expect(listed("member")).toEqual(["KRINC"]);
    expect(testId("transfer-available-KRPUS")!.textContent).toBe("KRPUS 부산");
    expect(testId("transfer-available-CNSHA")!.textContent).toBe("CNSHA ");
    expect(testId("transfer-apply")!.textContent).toBe("적용");
    expect((testId("transfer-query") as HTMLInputElement).placeholder).toBe("코드·이름 검색");
    // 체크박스·전체 이동(>>·<<)·건수는 없다.
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(3);
  });

  it("검색은 양쪽 목록을 함께 거른다", async () => {
    await render(createElement(Harness, { initial: ["KRINC"], spy: () => {} }));
    await typeInto("transfer-query", "인천");
    expect(listed("available")).toEqual([]);
    expect(listed("member")).toEqual(["KRINC"]);
    await typeInto("transfer-query", "kr");
    expect(listed("available")).toEqual(["KRPUS"]);
  });

  it("클릭 토글로 고르고 > 로 옮기면 onChange 에 옮긴 집합이 가고 선택이 비워진다", async () => {
    const spy = vi.fn();
    await render(createElement(Harness, { initial: [], spy }));
    await click(testId("transfer-available-KRPUS"));
    await click(testId("transfer-available-CNSHA"));
    await click(testId("transfer-available-CNSHA"));
    expect(testId("transfer-available-KRPUS")!.style.background).toBe("var(--color-surface-selected)");
    expect(testId("transfer-available-CNSHA")!.style.background).toBe("");
    await click(button("transfer-move-right"));
    expect([...spy.mock.calls[0][0]]).toEqual(["KRPUS"]);
    expect(listed("member")).toEqual(["KRPUS"]);
    await click(testId("transfer-member-KRPUS"));
    await click(button("transfer-move-left"));
    expect([...spy.mock.calls[1][0]]).toEqual([]);
  });

  it("선택이 없어도 > · < 는 켜져 있고 누르면 바뀌지 않은 사본으로 onChange 를 부른다", async () => {
    const spy = vi.fn();
    await render(createElement(Harness, { initial: ["KRINC"], spy }));
    expect(button("transfer-move-right").disabled).toBe(false);
    expect(button("transfer-move-left").disabled).toBe(false);
    await click(button("transfer-move-right"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect([...spy.mock.calls[0][0]]).toEqual(["KRINC"]);
  });

  it("[적용] 은 onApply 를 부른다", async () => {
    const onApply = vi.fn();
    await render(createElement(Harness, { initial: [], spy: () => {}, onApply }));
    await click(button("transfer-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("canEdit=false 면 >·<·[적용] 이 꺼지고 클릭해도 고르지 않는다, 검색은 된다", async () => {
    const onApply = vi.fn();
    await render(createElement(Harness, { initial: [], canEdit: false, spy: () => {}, onApply }));
    expect(button("transfer-move-right").disabled).toBe(true);
    expect(button("transfer-move-left").disabled).toBe(true);
    expect(button("transfer-apply").disabled).toBe(true);
    await click(testId("transfer-available-KRPUS"));
    expect(testId("transfer-available-KRPUS")!.style.background).toBe("");
    expect(testId("transfer-available-KRPUS")!.style.cursor).toBe("default");
    expect((testId("transfer-query") as HTMLInputElement).disabled).toBe(false);
  });
});
