/** @vitest-environment happy-dom */

// 카드 틀·카드 묶음(shared card) — 제목 줄·오른쪽 자리·testId, 접어도 본문을 내리지 않는 hidden, testId 접두어·격자 칸 수.
import { act, createElement, useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CardFrame, CardGroup, MutedText } from "../../src/components/card";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
});

const q = <T extends Element = HTMLElement>(id: string) => r!.host.querySelector<T>(`[data-testid="${id}"]`);

describe("CardFrame", () => {
  it("section 안에 제목 줄(제목·오른쪽 자리)과 본문을 그린다", () => {
    r = renderWithMantine(
      createElement(CardFrame, { title: "④ 값 테스트", testId: "c1", right: createElement("b", null, "API") }, "본문"),
    );
    const card = q("c1")!;
    expect(card.tagName).toBe("SECTION");
    const header = card.querySelector(":scope > header")!;
    expect(header.querySelector(":scope > span")!.textContent).toBe("④ 값 테스트");
    expect(header.querySelector(":scope > b")!.textContent).toBe("API");
    expect(card.querySelector(":scope > div")!.textContent).toBe("본문");
    expect(card.getAttribute("style")).toContain("var(--color-border)");
  });

  it("testId 를 주지 않으면 data-testid 를 붙이지 않는다", () => {
    r = renderWithMantine(createElement(CardFrame, { title: "제목" }, "본문"));
    expect(r.host.querySelector("section")!.hasAttribute("data-testid")).toBe(false);
  });
});

describe("MutedText", () => {
  it("흐린 글 색 토큰의 span 이다", () => {
    r = renderWithMantine(createElement(MutedText, null, "없음"));
    const span = r.host.querySelector("span")!;
    expect(span.textContent).toBe("없음");
    expect(span.getAttribute("style")).toContain("var(--color-text-muted)");
  });
});

describe("CardGroup", () => {
  it("기본 접두어 card-group 으로 뿌리·단추·본문 testId 를 만들고 격자는 깔지 않는다", () => {
    r = renderWithMantine(createElement(CardGroup, { id: "g", title: "묶음" }, "안"));
    expect(q("card-group-g")).not.toBeNull();
    const toggle = q<HTMLButtonElement>("card-group-g-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe("묶음 접기");
    const body = q("card-group-g-body")!;
    expect(body.hidden).toBe(false);
    expect((body.firstElementChild as HTMLElement).getAttribute("style") ?? "").not.toContain("grid");
  });

  it("testIdPrefix·columns 를 주면 그 접두어와 n칸 격자로 그린다", () => {
    r = renderWithMantine(createElement(CardGroup, { id: "valueTests", title: "값", testIdPrefix: "rule-group", columns: 16 }, "안"));
    const body = q("rule-group-valueTests-body")!;
    expect(q("rule-group-valueTests-toggle")).not.toBeNull();
    expect((body.firstElementChild as HTMLElement).getAttribute("style")).toContain("repeat(16, minmax(0, 1fr))");
  });

  it("접으면 본문을 hidden 으로 숨기기만 하고 자식을 내리지 않는다", () => {
    let mounts = 0;
    let unmounts = 0;
    function Child() {
      useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return createElement("i", { "data-testid": "child" }, "카드");
    }
    r = renderWithMantine(createElement(CardGroup, { id: "g", title: "묶음" }, createElement(Child)));
    const toggle = q<HTMLButtonElement>("card-group-g-toggle")!;
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("묶음 펼치기");
    expect(q("card-group-g-body")!.hidden).toBe(true);
    expect(q("child")).not.toBeNull();
    act(() => toggle.click());
    expect(q("card-group-g-body")!.hidden).toBe(false);
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });

  it("defaultOpen=false 면 접힌 채로 시작하고 labels 로 동작 말을 바꾼다", () => {
    r = renderWithMantine(
      createElement(CardGroup, { id: "g", title: "묶음", defaultOpen: false, labels: { collapse: "닫기", expand: "열기" } }, "안"),
    );
    const toggle = q<HTMLButtonElement>("card-group-g-toggle")!;
    expect(q("card-group-g-body")!.hidden).toBe(true);
    expect(toggle.getAttribute("aria-label")).toBe("묶음 열기");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-label")).toBe("묶음 닫기");
  });
});
