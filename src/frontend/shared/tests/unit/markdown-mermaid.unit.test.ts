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
import { fitScaleOf, naturalSizeOf, nextZoom } from "../../src/components/markdown-editor/MermaidDiagram";

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

describe("mermaid 도식 크기 계산", () => {
  it("viewBox 에서 자연 크기를 읽고 없으면 null 이다", () => {
    expect(naturalSizeOf('<svg id="a" width="100%" style="max-width: 300px;" viewBox="0 0 300 640"><g/></svg>')).toEqual({ w: 300, h: 640 });
    expect(naturalSizeOf('<svg viewBox="-8 -8 200.5 100"></svg>')).toEqual({ w: 200.5, h: 100 });
    expect(naturalSizeOf("<svg><g/></svg>")).toBeNull();
  });

  it("작은 도식은 키우지 않고 폭·최대 높이를 넘으면 비율을 지켜 줄인다", () => {
    expect(fitScaleOf({ w: 200, h: 100 }, 800, 480)).toBe(1);
    expect(fitScaleOf({ w: 1000, h: 100 }, 500, 480)).toBe(0.5); // 폭 기준
    expect(fitScaleOf({ w: 300, h: 960 }, 800, 480)).toBe(0.5); // 높이 기준
    expect(fitScaleOf({ w: 1000, h: 1000 }, 500, 400)).toBe(0.4); // 둘 중 더 작은 쪽
    expect(fitScaleOf({ w: 300, h: 960 }, 0, 480)).toBe(0.5); // 폭을 모르면 높이만 본다
  });

  it("단추 배율은 50·75·100·125·150·200% 단계를 오르내리고 끝에서 멈춘다", () => {
    expect(nextZoom(1, 1)).toBe(1.25);
    expect(nextZoom(1, -1)).toBe(0.75);
    expect(nextZoom(0.4, 1)).toBe(0.5); // 맞춤 배율이 단계 사이에 있으면 가까운 위 단계로
    expect(nextZoom(0.6, -1)).toBe(0.5);
    expect(nextZoom(2, 1)).toBe(2);
    expect(nextZoom(0.5, -1)).toBe(0.5);
  });
});

describe("MermaidDiagram 크기 조절 도구 막대", () => {
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
  const mount = async (value: string) => {
    await act(async () => {
      root.render(createElement(MarkdownView, { value }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  const btn = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const click = async (b: HTMLButtonElement) => {
    await act(async () => {
      b.click();
    });
  };
  const SRC = "```mermaid\ngraph TD\n  A-->B\n```";
  const SVG = '<svg width="100%" style="max-width: 300px;" viewBox="0 0 300 200"><g></g></svg>';

  it("작은 도식은 100% 로 그려지고 svg 가 자연 크기 픽셀로 잡힌다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount(SRC);
    const svg = host.querySelector<SVGElement>('[role="img"] svg')!;
    expect(svg.style.width).toBe("300px");
    expect(svg.style.height).toBe("200px");
    expect(svg.style.maxWidth).toBe("none");
    expect(host.querySelector('[data-testid="md-view-mermaid-0-scale"]')?.textContent).toBe("100%");
  });

  it("도식 틀에 최대 높이(480px·60vh 중 작은 값)와 스크롤이 걸린다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount(SRC);
    const frame = host.querySelector<HTMLElement>(".md-mermaid-frame")!;
    expect(frame.getAttribute("role")).toBe("img");
    expect(frame.style.maxHeight).toBe("min(480px, 60vh)");
    expect(host.querySelector("style")?.textContent).toContain(".md-mermaid-frame{box-sizing:border-box;overflow:auto");
  });

  it("세로로 긴 도식은 최대 높이 안에 들어오게 줄어 그려진다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: '<svg viewBox="0 0 300 1000"><g></g></svg>' });
    await mount(SRC);
    const svg = host.querySelector<SVGElement>('[role="img"] svg')!;
    const h = parseFloat(svg.style.height);
    expect(h).toBeLessThanOrEqual(480);
    expect(h).toBeGreaterThan(0);
    expect(parseFloat(svg.style.width) / h).toBeCloseTo(0.3, 2); // 비율 유지
  });

  it("축소·확대 단추가 배율을 바꾸고 맞춤이 처음 배율로 되돌린다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount(SRC);
    const scale = () => host.querySelector('[data-testid="md-view-mermaid-0-scale"]')?.textContent;
    const svg = () => host.querySelector<SVGElement>('[role="img"] svg')!;

    await click(btn("도식 확대"));
    expect(scale()).toBe("125%");
    expect(svg().style.width).toBe("375px");
    await click(btn("도식 확대"));
    await click(btn("도식 확대"));
    await click(btn("도식 확대"));
    expect(scale()).toBe("200%");
    expect(btn("도식 확대").disabled).toBe(true);

    await click(btn("도식 크기 맞춤"));
    expect(scale()).toBe("100%");
    await click(btn("도식 축소"));
    await click(btn("도식 축소"));
    await click(btn("도식 축소"));
    expect(scale()).toBe("50%");
    expect(svg().style.width).toBe("150px");
    expect(btn("도식 축소").disabled).toBe(true);
  });

  it("단추는 button 이고 접근 가능한 이름과 도구 막대 역할을 가진다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount(SRC);
    for (const name of ["도식 축소", "도식 확대", "도식 크기 맞춤"]) {
      const b = btn(name);
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("type")).toBe("button");
    }
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it("그리기에 실패하면 도구 막대 없이 코드 블록이 남는다", async () => {
    mermaidMock.render.mockRejectedValue(new Error("x"));
    await mount(SRC);
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(host.querySelector("pre code")?.textContent).toBe("graph TD\n  A-->B");
  });
});
