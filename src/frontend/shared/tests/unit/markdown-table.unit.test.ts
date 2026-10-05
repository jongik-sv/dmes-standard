/** @vitest-environment happy-dom */

// 마크다운 표(GFM) — 읽기 전용 경로(MarkdownView · parseMarkdownView)만 표를 그리고, 편집기 경로(parseMarkdown · createMarkdownManager 기본)는
// 표를 토큰으로 만들지 않아 글자로 남는다(무변화 시험). 표 렌더: 머리글·본문·정렬·칸 안 인라인·`\|`·행마다 칸 수 불일치.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";

import { MarkdownView } from "../../src/components/markdown-editor";
import {
  createMarkdownManager,
  parseMarkdown,
  parseMarkdownView,
  serializeMarkdown,
} from "../../src/components/markdown-editor/markdown";
import { MARKDOWN_EDITOR_CSS } from "../../src/components/markdown-editor/styles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE = "| 이름 | 값 |\n|---|---|\n| a | 1 |\n| b | 2 |";

const hasType = (n: JSONContent, type: string): boolean =>
  n.type === type || (n.content ?? []).some((c) => hasType(c, type));

describe("편집기 경로 — 표를 여전히 무시한다(무변화)", () => {
  it("parseMarkdown·기본 createMarkdownManager 는 표 노드를 만들지 않고 글자로 남긴다", () => {
    expect(hasType(parseMarkdown(TABLE), "table")).toBe(false);
    expect(hasType(parseMarkdown(TABLE, createMarkdownManager()), "table")).toBe(false);
    expect(hasType(parseMarkdown(TABLE, createMarkdownManager(undefined, { tables: false })), "table")).toBe(false);
    expect(serializeMarkdown(parseMarkdown(TABLE))).toBe(TABLE);
  });

  it("표 줄 글자가 문단 글자로 그대로 들어 있다", () => {
    const text = JSON.stringify(parseMarkdown(TABLE));
    expect(text).toContain("| 이름 | 값 |");
    expect(text).toContain("|---|---|");
  });

  it("표를 켜 둔 읽기 경로를 부른 뒤에도 편집기 경로는 그대로다(인스턴스 분리)", () => {
    parseMarkdownView(TABLE);
    expect(hasType(parseMarkdown(TABLE), "table")).toBe(false);
    expect(serializeMarkdown(parseMarkdown(`앞\n\n${TABLE}\n\n뒤`))).toBe(`앞\n\n${TABLE}\n\n뒤`);
  });
});

describe("읽기 경로 — parseMarkdownView", () => {
  it("머리글 행·본문 행·정렬을 table 노드로 읽는다", () => {
    const doc = parseMarkdownView("| 가 | 나 | 다 |\n|:---|:---:|---:|\n| 1 | 2 | 3 |");
    const table = doc.content?.[0];
    expect(table?.type).toBe("table");
    const [head, body] = table?.content ?? [];
    expect(head?.content?.map((c) => [c.type, c.attrs?.align])).toEqual([
      ["tableHeader", "left"],
      ["tableHeader", "center"],
      ["tableHeader", "right"],
    ]);
    expect(body?.content?.map((c) => [c.type, c.attrs?.align])).toEqual([
      ["tableCell", "left"],
      ["tableCell", "center"],
      ["tableCell", "right"],
    ]);
  });

  it("표가 아닌 글은 편집기 경로와 같은 결과다", () => {
    const md = "# 제목\n\n문단 **굵게**\n둘째 줄\n\n- 가\n- 나\n\n> 인용\n\n```\n코드\n```";
    expect(parseMarkdownView(md)).toEqual(parseMarkdown(md));
  });
});

describe("MarkdownView — 표 그리기", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const draw = (value: string) => act(() => root.render(createElement(MarkdownView, { value })));
  const cells = (row: Element) => Array.from(row.children) as HTMLElement[];

  it("머리글은 thead, 본문은 tbody 로 나눠 table 로 그리고 틀(.cm-md-table)이 감싼다", () => {
    draw(TABLE);
    const wrap = host.querySelector(".cm-md-table") as HTMLElement;
    expect(wrap.querySelector(":scope > table")).not.toBeNull();
    const heads = Array.from(host.querySelectorAll("thead > tr > th"));
    expect(heads.map((h) => h.textContent)).toEqual(["이름", "값"]);
    expect(heads.every((h) => h.getAttribute("scope") === "col")).toBe(true);
    const rows = Array.from(host.querySelectorAll("tbody > tr"));
    expect(rows.map((r) => cells(r).map((c) => c.textContent))).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(host.querySelectorAll("thead > tr")).toHaveLength(1);
    // 표 글자가 원문 그대로 문단으로 새지 않는다.
    expect(host.textContent).not.toContain("|---|");
    expect(host.textContent).not.toContain("| 이름 |");
  });

  it("정렬(:--- · :---: · ---:)을 머리글·본문 칸 모두에 적용하고 정렬 표시가 없으면 style 을 넣지 않는다", () => {
    draw("| 가 | 나 | 다 | 라 |\n|:---|:---:|---:|---|\n| 1 | 2 | 3 | 4 |");
    const head = cells(host.querySelector("thead > tr")!);
    const body = cells(host.querySelector("tbody > tr")!);
    expect(head.map((c) => c.style.textAlign)).toEqual(["left", "center", "right", ""]);
    expect(body.map((c) => c.style.textAlign)).toEqual(["left", "center", "right", ""]);
  });

  it("칸 안 인라인 서식(굵게·기울임·코드·링크·취소선)을 그린다", () => {
    draw(
      "| 서식 | 예 |\n|---|---|\n| 굵게 | **진하게** |\n| 기울임 | *비스듬히* |\n| 코드 | `a_b` |\n| 취소 | ~~지움~~ |\n| 링크 | [열기](https://ex.com/x) |"
    );
    expect(host.querySelector("td strong")?.textContent).toBe("진하게");
    expect(host.querySelector("td em")?.textContent).toBe("비스듬히");
    expect(host.querySelector("td code")?.textContent).toBe("a_b");
    expect(host.querySelector("td s")?.textContent).toBe("지움");
    const a = host.querySelector("td a") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://ex.com/x");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("머리글 칸의 인라인 서식도 그린다", () => {
    draw("| **굵은 머리** | `코드` |\n|---|---|\n| x | y |");
    expect(host.querySelector("th strong")?.textContent).toBe("굵은 머리");
    expect(host.querySelector("th code")?.textContent).toBe("코드");
  });

  it("위험한 링크 주소는 링크가 되지 않고 글자만 남는다", () => {
    draw("| 링크 |\n|---|\n| [나쁨](javascript:alert(1)) |");
    expect(host.querySelector("td a")).toBeNull();
    expect(host.querySelector("td")?.textContent).toContain("나쁨");
  });

  it("칸 안 `\\|` 는 칸을 나누지 않고 글자 | 로 남는다", () => {
    draw("| 식 | 뜻 |\n|---|---|\n| a \\| b | 또는 |");
    const body = cells(host.querySelector("tbody > tr")!);
    expect(body).toHaveLength(2);
    expect(body[0].textContent).toBe("a | b");
    expect(body[1].textContent).toBe("또는");
  });

  it("행마다 칸 수가 달라도 머리글 칸 수에 맞춘다(모자라면 빈 칸, 넘치면 버림)", () => {
    draw("| 가 | 나 | 다 |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |");
    const rows = Array.from(host.querySelectorAll("tbody > tr"));
    expect(rows.map((r) => cells(r).map((c) => c.textContent))).toEqual([
      ["1", "", ""],
      ["1", "2", "3"],
    ]);
  });

  it("앞뒤 문단·다른 블록과 섞여도 표만 table 로 그린다", () => {
    draw(`앞 문단\n\n${TABLE}\n\n- 뒤 목록`);
    const kids = Array.from(host.querySelector("[data-testid='md-view']")!.children).filter(
      (c) => c.tagName !== "STYLE"
    );
    expect(kids.map((c) => c.tagName)).toEqual(["P", "DIV", "UL"]);
    expect(kids[1].className).toBe("cm-md-table");
  });

  it("목록 안·인용 안의 표도 그린다", () => {
    draw("> | 가 | 나 |\n> |---|---|\n> | 1 | 2 |");
    expect(host.querySelectorAll("blockquote table tbody td")).toHaveLength(2);
  });

  it("표 바로 아래 줄이 없는 한 줄짜리(구분선 없음)는 표가 아니라 글자다", () => {
    draw("| 가 | 나 |");
    expect(host.querySelector("table")).toBeNull();
    expect(host.textContent).toContain("| 가 | 나 |");
  });

  it("HTML 문자열을 넣지 않는다 — 칸 안 태그 글자는 글자 그대로다", () => {
    draw("| 가 |\n|---|\n| <b>x</b> |");
    expect(host.querySelector("td b")).toBeNull();
    expect(host.querySelector("td")?.textContent).toBe("<b>x</b>");
  });
});

describe("표 스타일", () => {
  it("가로 넘침 스크롤·토큰 색·인쇄 규칙이 있고 편집 칸(.cm-md-rich)에는 표 규칙이 없다", () => {
    expect(MARKDOWN_EDITOR_CSS).toMatch(/\.cm-md-view \.cm-md-table\s*\{[^}]*overflow-x: auto/);
    expect(MARKDOWN_EDITOR_CSS).toMatch(/\.cm-md-view th, \.cm-md-view td\s*\{[^}]*border: 1px solid var\(--color-border\)/);
    expect(MARKDOWN_EDITOR_CSS).toMatch(/@media print\s*\{[^@]*\.cm-md-table/);
    expect(MARKDOWN_EDITOR_CSS).not.toMatch(/\.cm-md-rich (table|th|td)/);
  });
});
