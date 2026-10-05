/** @vitest-environment happy-dom */

// MarkdownDocViewer 의 mermaid 도식 — 블록 분리(순수 함수)와 그리기 성공·실패·지연 불러오기.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => {
  return { default: { initialize: mermaidMock.initialize, render: mermaidMock.render } };
});

import { MarkdownView } from "../../src/components/markdown-editor/MarkdownView";
import { MarkdownDocViewer } from "../../src/components/markdown-editor/MarkdownDocViewer";
import { splitMermaidBlocks } from "../../src/components/markdown-editor/mermaid-blocks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("splitMermaidBlocks", () => {
  it("mermaid 블록을 따로 뽑고 앞뒤 글은 md 조각으로 둔다", () => {
    const p = splitMermaidBlocks("앞글\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n뒷글");
    expect(p).toEqual([
      { kind: "md", text: "앞글\n" },
      { kind: "mermaid", code: "graph TD\n  A-->B" },
      { kind: "md", text: "\n뒷글" },
    ]);
  });

  it("mermaid 가 없으면 한 조각이고 일반 코드 블록은 그대로 둔다", () => {
    const src = "글\n\n```js\nconst a = 1;\n```";
    expect(splitMermaidBlocks(src)).toEqual([{ kind: "md", text: src }]);
  });

  it("일반 코드 블록(~~~·더 긴 펜스) 안의 ```mermaid 는 도식으로 보지 않는다", () => {
    const a = "~~~text\n```mermaid\ngraph TD\n```\n~~~";
    expect(splitMermaidBlocks(a)).toEqual([{ kind: "md", text: a }]);
    const b = "````md\n```mermaid\ngraph TD\n```\n````";
    expect(splitMermaidBlocks(b)).toEqual([{ kind: "md", text: b }]);
  });

  it("~~~mermaid 와 들여쓰기 3칸 이하 펜스를 인정하고 4칸은 코드로 본다", () => {
    expect(splitMermaidBlocks("   ~~~mermaid\ngraph TD\n   ~~~")).toEqual([{ kind: "mermaid", code: "graph TD" }]);
    const four = "    ```mermaid\n    graph TD\n    ```";
    expect(splitMermaidBlocks(four).every((x) => x.kind === "md")).toBe(true);
  });

  it("닫히지 않은 mermaid 블록은 일반 글로 남기고 mermaid 블록이 여럿이면 모두 뽑는다", () => {
    expect(splitMermaidBlocks("```mermaid\ngraph TD")).toEqual([{ kind: "md", text: "```mermaid\ngraph TD" }]);
    const p = splitMermaidBlocks("```mermaid\nA\n```\n```mermaid\nB\n```");
    expect(p.filter((x) => x.kind === "mermaid")).toHaveLength(2);
  });
});

describe("MarkdownDocViewer mermaid 그리기", () => {
  let host: HTMLDivElement;
  let root: Root;

  const mount = async (md: string) => {
    await act(async () => {
      root.render(createElement(MarkdownDocViewer, { markdown: md }));
    });
    // 동적 import·render 의 마이크로태스크를 비운다.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("그리기에 성공하면 svg 가 role=img 안에 나온다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: '<svg data-x="ok"><g></g></svg>' });
    await mount("## 도식\n\n```mermaid\ngraph TD\n  A-->B\n```");
    const fig = host.querySelector('[role="img"]');
    expect(fig).not.toBeNull();
    expect(fig!.querySelector('svg[data-x="ok"]')).not.toBeNull();
    expect(mermaidMock.render).toHaveBeenCalledWith(expect.stringMatching(/^mmd-/), "graph TD\n  A-->B");
    expect(mermaidMock.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict", startOnLoad: false }));
  });

  it("render 가 실패하면 원래 코드를 pre>code 로 남기고 role=img 는 없다", async () => {
    mermaidMock.render.mockRejectedValue(new Error("Parse error"));
    await mount("## 도식\n\n```mermaid\ngraph TD\n  A-->\n```");
    expect(host.querySelector('[role="img"]')).toBeNull();
    const code = host.querySelector("pre code");
    expect(code?.textContent).toBe("graph TD\n  A-->");
    expect(host.querySelector('[data-state="error"]')).not.toBeNull();
  });

  it("mermaid 가 없는 문서에서는 mermaid 를 불러오지 않고 기존 testId 규칙을 유지한다", async () => {
    await mount("## 일반\n\n본문");
    expect(mermaidMock.initialize).not.toHaveBeenCalled();
    expect(mermaidMock.render).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="md-doc-viewer-doc-sec-0"]')).not.toBeNull();
  });
});

describe("MarkdownView mermaid 기본 지원", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const mount = async (props: { value: string; mermaid?: boolean }) => {
    await act(async () => {
      root.render(createElement(MarkdownView, props));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  it("기본으로 mermaid 블록을 도식으로 그리고 앞뒤 글은 그대로 그린다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: "<svg data-x=\"v\"></svg>" });
    await mount({ value: "앞글\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n뒷글" });
    expect(host.querySelector('[role="img"] svg[data-x="v"]')).not.toBeNull();
    expect(host.textContent).toContain("앞글");
    expect(host.textContent).toContain("뒷글");
  });

  it("mermaid={false} 면 코드 블록 그대로 두고 mermaid 를 부르지 않는다", async () => {
    await mount({ value: "```mermaid\ngraph TD\n```", mermaid: false });
    expect(host.querySelector('[role="img"]')).toBeNull();
    expect(host.querySelector("pre code")?.textContent).toContain("graph TD");
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it("그리기 실패 시 코드 블록이 남는다", async () => {
    mermaidMock.render.mockRejectedValue(new Error("x"));
    await mount({ value: "```mermaid\ngraph TD\n```" });
    expect(host.querySelector("pre code")?.textContent).toBe("graph TD");
  });
});
