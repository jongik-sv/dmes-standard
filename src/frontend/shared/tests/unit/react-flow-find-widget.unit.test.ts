/** @vitest-environment happy-dom */
// 찾기 위젯·일치 판정 — 룰 세트 편집기 find-widget.test.ts·find.test.ts 의 단언을 위젯 단위로 옮겼다.
import { act, createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FIND_OPTIONS, INVALID_FIND, compileFind, escapeRegExp, type FindState } from "../../src/components/react-flow/find";
import { FIND_NO_RESULT, FindWidget, findCountText, type FindWidgetProps } from "../../src/components/react-flow/FindWidget";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

function stub(over: Partial<FindState> = {}): FindState {
  return {
    query: "", setQuery: vi.fn(), options: { ...DEFAULT_FIND_OPTIONS }, toggleOption: vi.fn(), invalid: false,
    hits: [], index: -1, next: vi.fn(), prev: vi.fn(), ...over,
  };
}
let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});
function mount(find: FindState, extra: Partial<FindWidgetProps> = {}) {
  const onClose = vi.fn();
  const onParentKey = vi.fn();
  r = renderWithMantine(
    createElement("div", { onKeyDown: onParentKey },
      createElement(FindWidget, { find, inputRef: createRef<HTMLInputElement>(), focusSeq: 1, onClose, mac: false, ...extra })),
  );
  return { onClose, onParentKey };
}
const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector(`[data-testid="${id}"]`) as T;
function key(el: Element, init: KeyboardEventInit): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    el.dispatchEvent(ev);
  });
  return ev;
}

describe("compileFind·escapeRegExp", () => {
  it("빈 질의는 null, 기본은 대소문자 무시 부분 일치", () => {
    expect(compileFind("  ")).toBeNull();
    const m = compileFind("grd") as (t: string) => boolean;
    expect(m("E2S_GRD")).toBe(true);
    expect(m("E2S_FCT")).toBe(false);
  });
  it("대소문자 구분·단어 단위(한글 포함)·정규식", () => {
    expect((compileFind("grd", { ...DEFAULT_FIND_OPTIONS, caseSensitive: true }) as (t: string) => boolean)("E2S_GRD")).toBe(false);
    const word = compileFind("판정", { ...DEFAULT_FIND_OPTIONS, wholeWord: true }) as (t: string) => boolean;
    expect(word("등급 판정")).toBe(true);
    expect(word("등급 재판정")).toBe(false);
    expect((compileFind("^E2S_GRD\\d$", { ...DEFAULT_FIND_OPTIONS, regex: true }) as (t: string) => boolean)("E2S_GRD2")).toBe(true);
  });
  it("잘못된 정규식은 INVALID_FIND, 빈 일치(x*)는 결과로 치지 않는다, 정규식이 아니면 글자 그대로", () => {
    expect(compileFind("E2S_(GRD", { ...DEFAULT_FIND_OPTIONS, regex: true })).toBe(INVALID_FIND);
    expect((compileFind("x*", { ...DEFAULT_FIND_OPTIONS, regex: true }) as (t: string) => boolean)("abc")).toBe(false);
    expect((compileFind("a.b") as (t: string) => boolean)("axb")).toBe(false);
    expect(escapeRegExp("a.b*(c)")).toBe("a\\.b\\*\\(c\\)");
  });
});

describe("FindWidget", () => {
  it("건수 글 — 빈 글은 빈 글, 결과가 없으면 「결과 없음」, 있으면 순번/전체", () => {
    expect(findCountText({ query: "", hits: [], index: -1 })).toBe("");
    expect(findCountText({ query: "a", hits: [], index: -1 })).toBe(FIND_NO_RESULT);
    expect(findCountText({ query: "a", hits: ["x", "y"], index: 1 })).toBe("2/2");
    expect(findCountText({ query: "a", hits: [], index: -1 }, "표 없음")).toBe("표 없음");
    mount(stub({ query: "zz" }));
    expect(q("flow-find-count").textContent).toBe("결과 없음");
    expect(q("flow-find-count").hasAttribute("data-empty")).toBe(true);
    expect(q<HTMLButtonElement>("flow-find-next").disabled).toBe(true);
    expect(q<HTMLButtonElement>("flow-find-prev").disabled).toBe(true);
  });

  it("처음 그리면 입력 칸에 초점을 둔다", () => {
    mount(stub({ query: "abc" }));
    expect(document.activeElement).toBe(q("flow-find"));
  });

  it("Enter 는 다음, Shift+Enter 는 이전 — 한글 조합 중(isComposing)이면 무시한다", () => {
    const find = stub({ query: "x", hits: ["a", "b"], index: 0 });
    mount(find);
    expect(key(q("flow-find"), { key: "Enter" }).defaultPrevented).toBe(true);
    expect(find.next).toHaveBeenCalledOnce();
    key(q("flow-find"), { key: "Enter", shiftKey: true });
    expect(find.prev).toHaveBeenCalledOnce();
    expect(key(q("flow-find"), { key: "Enter", isComposing: true }).defaultPrevented).toBe(false);
    expect(key(q("flow-find"), { key: "Enter", shiftKey: true, isComposing: true }).defaultPrevented).toBe(false);
    expect(find.next).toHaveBeenCalledOnce();
    expect(find.prev).toHaveBeenCalledOnce();
  });

  it("옵션 셋 — aria-pressed 는 find.options, 누르면 toggleOption(키)", () => {
    const find = stub({ options: { caseSensitive: true, wholeWord: false, regex: false } });
    mount(find);
    expect(q("flow-find-case").getAttribute("aria-pressed")).toBe("true");
    expect(q("flow-find-word").getAttribute("aria-pressed")).toBe("false");
    act(() => q("flow-find-word").click());
    expect(find.toggleOption).toHaveBeenCalledWith("wholeWord");
  });

  it("잘못된 정규식 — 입력 칸에 오류 테두리(form-error)·aria-invalid", () => {
    mount(stub({ query: "(", invalid: true, options: { ...DEFAULT_FIND_OPTIONS, regex: true } }));
    expect(q("flow-find").classList.contains("form-error")).toBe(true);
    expect(q("flow-find").getAttribute("aria-invalid")).toBe("true");
  });

  it("Esc 는 onClose, 위젯 안의 키는 부모 onKeyDown 으로 올라가지 않는다", () => {
    const m = mount(stub({ query: "x", hits: ["a"], index: 0 }));
    key(q("flow-find-next"), { key: "Delete" });
    expect(m.onParentKey).not.toHaveBeenCalled();
    key(q("flow-find"), { key: "Escape" });
    expect(m.onClose).toHaveBeenCalledOnce();
    expect(m.onParentKey).not.toHaveBeenCalled();
  });

  it("위젯 안의 Ctrl+F(Mac 은 Cmd+F)는 입력 칸을 다시 고르고 브라우저 찾기를 막는다", () => {
    mount(stub(), { mac: true });
    expect(key(q("flow-find-close"), { key: "f", metaKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q("flow-find"));
  });

  it("testId·문구·클래스 접두를 props 로 바꾼다", () => {
    mount(stub({ query: "q" }), {
      testId: "erd-find", label: "표 찾기", inputLabel: "표 찾기 — 물리명·논리명", placeholder: "표 이름", noResultText: "표 없음", classPrefix: "erdx",
    });
    expect(q("erd-find-widget").getAttribute("aria-label")).toBe("표 찾기");
    expect(q("erd-find-widget").className).toBe("erdx-find-widget");
    expect(q("erd-find").getAttribute("aria-label")).toBe("표 찾기 — 물리명·논리명");
    expect(q("erd-find").getAttribute("placeholder")).toBe("표 이름");
    expect(q("erd-find-count").textContent).toBe("표 없음");
    expect(document.head.textContent).toContain(".erdx-find-widget");
  });
});
