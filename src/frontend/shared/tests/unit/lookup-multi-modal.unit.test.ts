/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LookupMultiModal, type LookupMultiModalProps, type LookupMultiRow } from "../../src/components/lookup";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

const ROWS: LookupMultiRow[] = [
  { code: "u1", name: "김철수", detail: "생산팀" },
  { code: "u2", name: "이영희", detail: "품질팀" },
  { code: "me", name: "나", detail: "생산팀" },
];

let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

function mount(extra: Partial<LookupMultiModalProps> = {}) {
  const props: LookupMultiModalProps = {
    open: true,
    title: "받는 사람",
    search: vi.fn(async () => ROWS),
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...extra,
  };
  r = renderWithMantine(createElement(LookupMultiModal, props));
  return props;
}

const body = () => document.body;
const input = () => body().querySelector('input[aria-label="검색어"]') as HTMLInputElement;
const typeKeyword = (v: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input(), v);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
async function searchFor(v: string) {
  typeKeyword(v);
  await act(async () => {
    (body().querySelector('[data-action="lookup-multi-search"]') as HTMLButtonElement).click();
  });
  await act(async () => {});
}
const rowBox = (code: string) => body().querySelector(`[data-code="${code}"] input[type="checkbox"]`) as HTMLInputElement;
const confirmBtn = () => body().querySelector('[data-action="lookup-multi-confirm"]') as HTMLButtonElement;

describe("LookupMultiModal", () => {
  it("검색어가 최소 글자보다 짧으면 부르지 않고 안내한다", async () => {
    const p = mount({ minKeywordLength: 2 });
    await searchFor("김");
    expect(p.search).not.toHaveBeenCalled();
    expect(body().textContent).toContain("2자 이상 입력해 주세요.");
  });

  it("검색 결과를 보이고 excludeCodes 는 뺀다", async () => {
    const p = mount({ excludeCodes: ["me"] });
    await searchFor(" 김철 ");
    expect(p.search).toHaveBeenCalledWith("김철");
    expect(rowBox("u1")).not.toBeNull();
    expect(rowBox("me")).toBeNull();
    expect(body().textContent).toContain("생산팀");
  });

  it("여러 개 고르고 [확인] 은 고른 순서대로 onConfirm 에 넘기며 스스로 닫지 않는다", async () => {
    const p = mount();
    await searchFor("팀");
    expect(confirmBtn().disabled).toBe(true);
    act(() => rowBox("u2").click());
    act(() => rowBox("u1").click());
    expect(confirmBtn().textContent).toContain("(2)");
    await act(async () => confirmBtn().click());
    expect(p.onConfirm).toHaveBeenCalledWith([ROWS[1], ROWS[0]]);
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it("maxSelect 에 닿으면 고르지 않은 행이 막히고, 칩의 × 로 빼면 다시 열린다", async () => {
    mount({ maxSelect: 1 });
    await searchFor("팀");
    act(() => rowBox("u1").click());
    expect(rowBox("u2").disabled).toBe(true);
    expect(body().textContent).toContain("고른 항목 1/1");
    act(() => (body().querySelector('[aria-label="김철수 빼기"]') as HTMLButtonElement).click());
    expect(rowBox("u2").disabled).toBe(false);
  });

  it("검색이 실패하면 문구를 보인다", async () => {
    mount({ search: vi.fn(async () => Promise.reject(new Error("권한이 없습니다."))) });
    await searchFor("김철");
    expect(body().querySelector('[role="alert"]')?.textContent).toBe("권한이 없습니다.");
  });

  it("onConfirm 이 끝날 때까지 [확인]이 막히고, 실패해도 고른 것을 둔다", async () => {
    let fail!: (e: Error) => void;
    const onConfirm = vi.fn(() => new Promise<void>((_res, rej) => (fail = rej)));
    mount({ onConfirm });
    await searchFor("팀");
    act(() => rowBox("u1").click());
    await act(async () => confirmBtn().click());
    expect(confirmBtn().disabled).toBe(true);
    await act(async () => fail(new Error("x")));
    expect(confirmBtn().disabled).toBe(false);
    expect(rowBox("u1").checked).toBe(true);
  });

  it("다시 열면 검색어·결과·고른 것을 비운다", async () => {
    const p = mount();
    await searchFor("팀");
    act(() => rowBox("u1").click());
    rerender(r!, createElement(LookupMultiModal, { ...p, open: false }));
    rerender(r!, createElement(LookupMultiModal, { ...p, open: true }));
    await act(async () => {});
    expect(input().value).toBe("");
    expect(rowBox("u1")).toBeNull();
    expect(body().textContent).toContain("고른 항목 0");
  });
});
