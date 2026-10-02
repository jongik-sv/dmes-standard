/** @vitest-environment happy-dom */

// JSON 값 트리(shared json-view) — 종류별 표시, 처음 펼칠 깊이, 가지 접고 펴기, 모두 펼치기·접기, 복사 글자, 빈 값.
import { act, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { JsonView, jsonText, type JsonViewProps } from "../../src/components/json-view";
import { jsonKindOf, jsonSummary } from "../../src/components/json-view/JsonView";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
});

function render(props: JsonViewProps) {
  r = renderWithMantine(createElement(JsonView, props));
  return r.host.querySelector<HTMLElement>(`[data-testid="${props.testId ?? "json-view"}"]`)!;
}

const sample = {
  physName: "COIL_THK",
  length: 10,
  required: true,
  defaultValue: null,
  bizExpr: { text: "value <= COIL_WID" },
  bizRequiredVars: ["COIL_WID"],
  domain: { ref: { id: "7" } },
  empty: {},
};

const buttonByText = (root: HTMLElement, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text)!;

describe("JsonView — 도우미", () => {
  it("값 종류를 가른다", () => {
    expect(jsonKindOf({})).toBe("object");
    expect(jsonKindOf([])).toBe("array");
    expect(jsonKindOf("a")).toBe("string");
    expect(jsonKindOf(1.5)).toBe("number");
    expect(jsonKindOf(false)).toBe("boolean");
    expect(jsonKindOf(null)).toBe("null");
  });

  it("접힌 가지 요약과 복사 글자", () => {
    expect(jsonSummary({ a: 1, b: 2 })).toBe("{…} 2개 키");
    expect(jsonSummary([1, 2, 3])).toBe("[…] 3개 항목");
    expect(jsonText({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}');
    expect(jsonText(undefined)).toBe("undefined");
  });
});

describe("JsonView — 그리기", () => {
  it("글자·수·참거짓·null 을 종류별 클래스로 보이고 키를 붙인다", () => {
    const el = render({ value: sample });
    expect(el.querySelector(".jv-string")?.textContent).toBe('"COIL_THK"');
    expect(el.querySelector(".jv-number")?.textContent).toBe("10");
    expect(el.querySelector(".jv-boolean")?.textContent).toBe("true");
    expect(el.querySelector(".jv-null")?.textContent).toBe("null");
    expect(Array.from(el.querySelectorAll(".jv-key")).map((k) => k.textContent)).toContain("physName");
    expect(el.textContent).toContain('"value <= COIL_WID"');
    // React 19 는 <style href precedence> 를 head 로 올린다(포털이 원격 모듈 CSS 파일을 싣지 않아 컴포넌트가 직접 넣는다)
    expect(document.head.textContent).toContain(".jv-tree");
  });

  it("처음에는 defaultExpandDepth 깊이까지만 펼친다", () => {
    const el = render({ value: sample, defaultExpandDepth: 2 });
    // 깊이 2(domain.ref) 는 접혀 요약만 보인다
    expect(el.textContent).toContain("{…} 1개 키");
    expect(el.textContent).not.toContain('"7"');
    // 빈 객체는 펼칠 것이 없어 단추가 없다
    expect(el.textContent).toContain("{}");
  });

  it("가지 단추로 접고 편다", () => {
    const el = render({ value: sample, defaultExpandDepth: 1 });
    expect(el.textContent).not.toContain('"value <= COIL_WID"');
    const toggles = Array.from(el.querySelectorAll<HTMLButtonElement>("button.jv-toggle"));
    const bizToggle = toggles.find((b) => b.parentElement?.textContent?.startsWith("bizExpr"))!;
    expect(bizToggle.getAttribute("aria-expanded")).toBe("false");
    act(() => bizToggle.click());
    expect(el.textContent).toContain('"value <= COIL_WID"');
    expect(bizToggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("모두 펼치기·모두 접기는 모든 가지에 적용한다", () => {
    const el = render({ value: sample, defaultExpandDepth: 1 });
    act(() => buttonByText(el, "모두 펼치기").click());
    expect(el.textContent).toContain('"7"');
    expect(el.textContent).toContain('"value <= COIL_WID"');
    act(() => buttonByText(el, "모두 접기").click());
    expect(el.textContent).not.toContain('"7"');
    expect(el.textContent).not.toContain('"value <= COIL_WID"');
    expect(el.textContent).toContain("physName"); // 뿌리는 펼친 채 둔다
  });

  it("배열은 순번을 키로 보인다", () => {
    const el = render({ value: ["a", 2] });
    expect(Array.from(el.querySelectorAll(".jv-index")).map((k) => k.textContent)).toEqual(["0", "1"]);
  });

  it("값이 undefined 면 emptyText, toolbar=false 면 도구 막대가 없다", () => {
    const empty = render({ value: undefined, emptyText: "캐시 값 없음", testId: "jv-empty" });
    expect(empty.querySelector(".jv-empty")?.textContent).toBe("캐시 값 없음");
    expect(empty.querySelector(".jv-tree")).toBeNull();
    r?.unmount();
    r = null;
    const bare = render({ value: { a: 1 }, toolbar: false });
    expect(bare.querySelector(".jv-toolbar")).toBeNull();
    expect(bare.querySelector('[data-testid="copy-text-button"]')).toBeNull();
  });

  it("fill 이면 남은 높이를 채우는 클래스를 붙이고 className·testId 를 받는다", () => {
    const el = render({ value: 1, fill: true, className: "extra", testId: "val" });
    expect(el.className).toBe("jv jv-fill extra");
    expect(el.querySelector('[data-testid="val-tree"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="copy-text-button"]')).not.toBeNull();
  });
});
