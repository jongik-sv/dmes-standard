/** @vitest-environment happy-dom */

// MarkdownDocViewer — 절 나누기(코드 블록 안 # 무시)와 목차·본문 그리기.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MarkdownDocViewer } from "../../src/components/markdown-editor/MarkdownDocViewer";
import { splitMarkdownSections, tocOf } from "../../src/components/markdown-editor/doc-sections";

const DOC = [
  "# 문서 제목",
  "",
  "머리말",
  "",
  "## 1. 개요",
  "",
  "개요 본문",
  "",
  "```",
  "# 코드 안의 샵은 제목이 아니다",
  "```",
  "",
  "### 1.1 세부",
  "",
  "세부 본문",
  "",
  "## 2. 다음",
  "",
  "다음 본문",
].join("\n");

describe("splitMarkdownSections", () => {
  it("제목마다 절을 나누고 코드 블록 안 # 은 제목으로 보지 않는다", () => {
    const s = splitMarkdownSections(DOC);
    expect(s.map((x) => [x.level, x.title])).toEqual([
      [1, "문서 제목"],
      [2, "1. 개요"],
      [3, "1.1 세부"],
      [2, "2. 다음"],
    ]);
    expect(s[1].markdown).toContain("# 코드 안의 샵은 제목이 아니다");
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });

  it("첫 제목 앞의 글은 level 0 절이 되고 목차에서는 빠진다", () => {
    const s = splitMarkdownSections("서문\n\n## A\n\n본문");
    expect(s[0]).toMatchObject({ level: 0, title: "" });
    expect(tocOf(s).map((x) => x.title)).toEqual(["A"]);
  });

  it("빈 문서는 절이 없다", () => {
    expect(splitMarkdownSections("")).toEqual([]);
  });
});

describe("MarkdownDocViewer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("목차 항목(## · ###)과 모든 절 본문을 그린다", () => {
    act(() => root.render(createElement(MarkdownDocViewer, { markdown: DOC })));
    const tocButtons = host.querySelectorAll("[data-testid^='md-doc-viewer-toc-doc-sec-']");
    expect(Array.from(tocButtons).map((b) => b.textContent)).toEqual(["1. 개요", "1.1 세부", "2. 다음"]);
    const text = host.querySelector("[data-testid='md-doc-viewer-body']")?.textContent ?? "";
    expect(text).toContain("개요 본문");
    expect(text).toContain("다음 본문");
  });

  it("목차를 누르면 그 항목이 현재 절로 표시된다", () => {
    act(() => root.render(createElement(MarkdownDocViewer, { markdown: DOC })));
    const buttons = Array.from(host.querySelectorAll("[data-testid^='md-doc-viewer-toc-doc-sec-']")) as HTMLButtonElement[];
    (host.querySelector("[data-testid='md-doc-viewer-body']") as HTMLElement).scrollTo = () => {};
    act(() => buttons[2].click());
    expect(buttons[2].getAttribute("aria-current")).toBe("true");
    expect(buttons[0].getAttribute("aria-current")).toBeNull();
  });
});
