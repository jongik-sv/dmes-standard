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
import { fitBoxScaleOf, MERMAID_VIEWER_ZOOM_STEPS, retargetSvgIds } from "../../src/components/markdown-editor/mermaid-zoom";

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

  it("맞춤은 자연 크기이고 본문 폭을 넘을 때만 폭에 맞춰 줄인다(높이로는 줄이지 않는다)", () => {
    expect(fitScaleOf({ w: 200, h: 100 }, 800)).toBe(1); // 작은 도식은 키우지 않는다
    expect(fitScaleOf({ w: 1000, h: 100 }, 500)).toBe(0.5); // 폭 기준
    expect(fitScaleOf({ w: 300, h: 1600 }, 800)).toBe(1); // 세로로 길어도 100%
    expect(fitScaleOf({ w: 300, h: 1600 }, 0)).toBe(1); // 폭을 모르면 자연 크기
  });

  it("단추 배율은 25·50·75·100·125·150·200% 단계를 오르내리고 끝에서 멈춘다", () => {
    expect(nextZoom(1, 1)).toBe(1.25);
    expect(nextZoom(1, -1)).toBe(0.75);
    expect(nextZoom(0.29, 1)).toBe(0.5); // 맞춤 배율이 단계 사이에 있으면 가까운 위 단계로
    expect(nextZoom(0.29, -1)).toBe(0.25); // 아래 단계로
    expect(nextZoom(0.6, -1)).toBe(0.5);
    expect(nextZoom(2, 1)).toBe(2);
    expect(nextZoom(0.25, -1)).toBe(0.25);
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
    expect(host.querySelector("style")?.textContent).toContain(".md-mermaid-frame{box-sizing:border-box;width:100%;min-width:0;overflow:auto");
  });

  it("세로로 긴 도식도 높이로 줄이지 않고 100% 자연 크기로 그리며 틀 안에서 스크롤한다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: '<svg viewBox="0 0 300 1600"><g></g></svg>' });
    await mount(SRC);
    const svg = host.querySelector<SVGElement>('[role="img"] svg')!;
    expect(svg.style.width).toBe("300px");
    expect(svg.style.height).toBe("1600px");
    expect(host.querySelector('[data-testid="md-view-mermaid-0-scale"]')?.textContent).toBe("100%");
    expect(host.querySelector<HTMLElement>(".md-mermaid-frame")!.style.maxHeight).toBe("min(480px, 60vh)");
  });

  it("mermaid 를 폭에 늘어나지 않게(useMaxWidth false) 글자 14px 로 초기화한다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount(SRC);
    const cfg = mermaidMock.initialize.mock.calls[0][0];
    expect(cfg.flowchart).toEqual({ useMaxWidth: false });
    expect(cfg.themeVariables.fontSize).toBe("14px");
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
    expect(btn("도식 확대").getAttribute("aria-disabled")).toBe("true");
    await click(btn("도식 확대"));
    expect(scale()).toBe("200%"); // 끝에서는 눌려도 그대로

    await click(btn("도식 크기 맞춤"));
    expect(scale()).toBe("100%");
    await click(btn("도식 축소"));
    await click(btn("도식 축소"));
    await click(btn("도식 축소"));
    await click(btn("도식 축소"));
    expect(scale()).toBe("25%");
    expect(svg().style.width).toBe("75px");
    expect(btn("도식 축소").getAttribute("aria-disabled")).toBe("true");
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

  it("viewBox 가 없는 svg 는 건드리지 않고 도구 막대도 두지 않는다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: '<svg data-x="nv"><g></g></svg>' });
    await mount(SRC);
    const svg = host.querySelector<SVGElement>('[role="img"] svg')!;
    expect(svg.style.width).toBe("");
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
  });

  it("틀 폭보다 넓은 도식은 폭에 맞춰 줄이고 라벨·svg 폭이 일치하며 다시 그려도 유지된다", async () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const w = this.classList.contains("md-mermaid-frame") ? 700 : 0;
      return { width: w, height: 0, top: 0, left: 0, right: w, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      mermaidMock.render.mockResolvedValue({ svg: '<svg width="100%" viewBox="0 0 1000 200"><g></g></svg>' });
      await mount(SRC);
      const svg = () => host.querySelector<SVGElement>('[role="img"] svg')!;
      expect(host.querySelector('[data-testid="md-view-mermaid-0-scale"]')?.textContent).toBe("70%");
      expect(svg().style.width).toBe("700px");
      expect(svg().style.height).toBe("140px");
      // 부모가 같은 값으로 다시 그려도 크기가 풀리지 않는다.
      await act(async () => {
        root.render(createElement(MarkdownView, { value: SRC }));
      });
      expect(svg().style.width).toBe("700px");
      expect(host.querySelector('[data-testid="md-view-mermaid-0"]')?.getAttribute("data-scale")).toBe("70");
      // 맞춤 아래로 [−] 는 한 단계(50%), [+] 는 75% 로 한 방향씩 움직인다.
      await click(btn("도식 확대"));
      expect(host.querySelector('[data-testid="md-view-mermaid-0-scale"]')?.textContent).toBe("75%");
      await click(btn("도식 크기 맞춤"));
      await click(btn("도식 축소"));
      expect(host.querySelector('[data-testid="md-view-mermaid-0-scale"]')?.textContent).toBe("50%");
      expect(svg().style.width).toBe("500px");
    } finally {
      spy.mockRestore();
    }
  });

  it("그리기에 실패하면 도구 막대 없이 코드 블록이 남는다", async () => {
    mermaidMock.render.mockRejectedValue(new Error("x"));
    await mount(SRC);
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(host.querySelector("pre code")?.textContent).toBe("graph TD\n  A-->B");
  });
});

describe("크게 보기 크기·id 계산", () => {
  it("창 맞춤은 가로·세로가 모두 들어오게 줄이고 100% 를 넘겨 키우지 않으며 창 크기를 모르면 100% 이다", () => {
    expect(fitBoxScaleOf({ w: 2000, h: 400 }, 1000, 600)).toBe(0.5); // 가로 기준
    expect(fitBoxScaleOf({ w: 500, h: 1200 }, 1000, 600)).toBe(0.5); // 세로 기준
    expect(fitBoxScaleOf({ w: 300, h: 200 }, 1000, 600)).toBe(1); // 작은 도식은 키우지 않는다
    expect(fitBoxScaleOf({ w: 300, h: 200 }, 0, 0)).toBe(1);
  });

  it("창 배율 단계는 10%~400% 이고 단계 사이 값에서 가까운 단계로 움직인다", () => {
    expect(nextZoom(0.37, 1, MERMAID_VIEWER_ZOOM_STEPS)).toBe(0.5);
    expect(nextZoom(0.37, -1, MERMAID_VIEWER_ZOOM_STEPS)).toBe(0.25);
    expect(nextZoom(4, 1, MERMAID_VIEWER_ZOOM_STEPS)).toBe(4);
    expect(nextZoom(0.1, -1, MERMAID_VIEWER_ZOOM_STEPS)).toBe(0.1);
  });

  it("svg 뿌리 id 로 시작하는 이름(요소 id·marker·CSS·url)만 바꾸고 숫자만 다른 다른 id 는 건드리지 않는다", () => {
    const svg =
      '<svg id="mmd-r1-3" viewBox="0 0 10 10"><style>#mmd-r1-3 .a{fill:red}</style><defs><marker id="mmd-r1-3_flowchart-pointEnd"/></defs><path marker-end="url(#mmd-r1-3_flowchart-pointEnd)"/><g id="mmd-r1-30"/></svg>';
    const out = retargetSvgIds(svg, "-zoom");
    expect(out).toContain('<svg id="mmd-r1-3-zoom"');
    expect(out).toContain("#mmd-r1-3-zoom .a");
    expect(out).toContain('id="mmd-r1-3-zoom_flowchart-pointEnd"');
    expect(out).toContain("url(#mmd-r1-3-zoom_flowchart-pointEnd)");
    expect(out).toContain('id="mmd-r1-30"');
    expect(retargetSvgIds('<svg viewBox="0 0 1 1"/>', "-zoom")).toBe('<svg viewBox="0 0 1 1"/>');
  });
});

describe("MermaidDiagram 크게 보기", () => {
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
    document.body.querySelectorAll(".md-mermaid-viewer-overlay").forEach((n) => n.remove());
  });
  const SRC = "```mermaid\ngraph TD\n  A-->B\n```";
  const SVG = '<svg id="mmd-x-1" width="100%" viewBox="0 0 300 200"><defs><marker id="mmd-x-1_pointEnd"/></defs><g></g></svg>';
  const mount = async (value = SRC) => {
    await act(async () => {
      root.render(createElement(MarkdownView, { value }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  const opener = () => host.querySelector<HTMLButtonElement>('button[aria-label="도식 크게 보기"]')!;
  const viewer = () => document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="도식 크게 보기"]');
  const open = async () => {
    await act(async () => {
      opener().click();
    });
  };
  const key = async (k: string, init: KeyboardEventInit = {}) => {
    await act(async () => {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
    });
  };
  /** 창 스크롤 영역 크기를 흉내 낸다(happy-dom 은 레이아웃이 없다). */
  const mockScrollSize = (w: number, h: number) => {
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("md-mermaid-viewer-scroll") ? w : 0;
    });
    const ch = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("md-mermaid-viewer-scroll") ? h : 0;
    });
    return () => {
      cw.mockRestore();
      ch.mockRestore();
    };
  };

  it("[크게 보기] 단추가 도구 막대에 있고 누르면 body 로 포털된 dialog 에 같은 도식이 열린다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    expect(opener().getAttribute("title")).toBe("도식 크게 보기");
    expect(viewer()).toBeNull();
    await open();
    const dlg = viewer()!;
    expect(dlg).not.toBeNull();
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(host.contains(dlg)).toBe(false);
    expect(dlg.querySelector("svg")).not.toBeNull();
    expect(document.activeElement).toBe(dlg);
  });

  it("창 안 svg 는 id·marker 이름이 본문 svg 와 겹치지 않는다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    await open();
    const ids = Array.from(document.body.querySelectorAll("[id]")).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(viewer()!.querySelector("#mmd-x-1-zoom")).not.toBeNull();
  });

  it("도식을 더블클릭해도 열린다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    await act(async () => {
      host.querySelector(".md-mermaid-frame")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(viewer()).not.toBeNull();
  });

  it("Esc 로 닫히고 [크게 보기] 단추로 초점이 돌아오며 Esc 가 바깥(window)으로 새지 않는다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    const leaked = vi.fn();
    // Mantine 9.6 Modal 흉내 — window 캡처 단계에서 Esc 로 닫되 대상에 data-mantine-stop-propagation 이 있으면 건너뛴다.
    const modalClose = vi.fn();
    const mantineEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (e.target as Element | null)?.getAttribute?.("data-mantine-stop-propagation") !== "true") modalClose();
    };
    window.addEventListener("keydown", leaked);
    window.addEventListener("keydown", mantineEsc, true);
    try {
      await open();
      await key("Escape");
      expect(viewer()).toBeNull();
      expect(document.activeElement).toBe(opener());
      expect(leaked).not.toHaveBeenCalled();
      expect(modalClose).not.toHaveBeenCalled(); // 아래 모달은 닫히지 않는다
      // 단추·스크롤 영역에 초점이 있어도 같다.
      await open();
      document.body.querySelector<HTMLElement>(".md-mermaid-viewer-scroll")!.focus();
      await key("Escape");
      document.body.querySelector<HTMLElement>("button")?.blur();
      expect(modalClose).not.toHaveBeenCalled();
      // 닫힌 뒤의 Esc 는 평소처럼 바깥으로 간다.
      await key("Escape");
      expect(leaked).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", leaked);
      window.removeEventListener("keydown", mantineEsc, true);
    }
  });

  it("닫기 단추와 바깥(어두운 배경) 누름으로 닫히고 창 안 누름은 닫지 않는다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    await open();
    await act(async () => {
      viewer()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(viewer()).not.toBeNull();
    const backdrop = () => document.body.querySelector<HTMLElement>('[data-testid="md-view-mermaid-0-viewer-overlay"]')!;
    await act(async () => {
      // 창 안에서 누르고 배경에서 뗀 것은 닫지 않는다.
      viewer()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      backdrop().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(viewer()).not.toBeNull();
    await act(async () => {
      backdrop().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 })); // 오른쪽 단추는 닫지 않는다
      backdrop().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(viewer()).not.toBeNull();
    await act(async () => {
      backdrop().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      backdrop().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(viewer()).toBeNull();
    expect(document.activeElement).toBe(opener());

    await open();
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('button[aria-label="도식 크게 보기 닫기"]')!.click();
    });
    expect(viewer()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it("어두운 모드에서는 창 배경·글자 색 변수를 어둡게 덮는 규칙이 있고 인쇄 때는 창을 숨긴다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    await open();
    const css = Array.from(document.body.querySelectorAll("style")).map((n) => n.textContent).join("");
    expect(css).toContain(':root[data-mantine-color-scheme="dark"] .md-mermaid-viewer{--color-bg:#1a1b1e');
    expect(css).toMatch(/@media print\{\.md-mermaid-viewer-overlay\{display:none!important\}\}/);
  });

  it("Tab 초점이 창 안에서만 돈다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    await open();
    const dlg = viewer()!;
    const scroll = dlg.querySelector<HTMLElement>(".md-mermaid-viewer-scroll")!;
    scroll.focus();
    await key("Tab"); // 마지막 → 처음으로
    expect(document.activeElement).toBe(dlg.querySelector("button"));
    await key("Tab", { shiftKey: true }); // 처음 → 마지막으로
    expect(document.activeElement).toBe(scroll);
  });

  it("맞춤 배율은 창 안에 도식 전체가 들어오게 정하고 맞춤 단추가 되돌린다", async () => {
    const restore = mockScrollSize(1032, 632); // 안쪽 1000 × 600
    try {
      mermaidMock.render.mockResolvedValue({ svg: '<svg id="mmd-x-2" viewBox="0 0 2000 400"><g></g></svg>' });
      await mount();
      await open();
      const scale = () => document.body.querySelector('[data-testid="md-view-mermaid-0-viewer-scale"]')?.textContent;
      const svg = () => viewer()!.querySelector<SVGElement>(".md-mermaid-viewer-inner svg")!;
      expect(scale()).toBe("50%");
      expect(svg().style.width).toBe("1000px");
      expect(svg().style.height).toBe("200px");
      await act(async () => {
        document.body.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="도식 확대"]')!.click();
      });
      expect(scale()).toBe("75%");
      await act(async () => {
        document.body.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="도식 크기 맞춤"]')!.click();
      });
      expect(scale()).toBe("50%");
    } finally {
      restore();
    }
  });

  it("세로로 긴 도식도 높이에 맞춰 줄이고 작은 도식은 100% 를 넘겨 키우지 않는다", async () => {
    const restore = mockScrollSize(1032, 632);
    try {
      mermaidMock.render.mockResolvedValue({ svg: '<svg id="mmd-x-3" viewBox="0 0 500 1200"><g></g></svg>' });
      await mount();
      await open();
      expect(document.body.querySelector('[data-testid="md-view-mermaid-0-viewer-scale"]')?.textContent).toBe("50%");
    } finally {
      restore();
    }
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('button[aria-label="도식 크게 보기 닫기"]')!.click();
    });
    await mount("```mermaid\ngraph TD\n  C-->D\n```");
    const restore2 = mockScrollSize(1032, 632);
    try {
      await open();
      expect(document.body.querySelector('[data-testid="md-view-mermaid-0-viewer-scale"]')?.textContent).toBe("100%");
    } finally {
      restore2();
    }
  });

  it("Ctrl+휠은 확대·축소하고 휠 이벤트는 바깥(document)으로 새지 않는다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    await open();
    const leaked = vi.fn();
    document.addEventListener("wheel", leaked);
    try {
      const scroll = viewer()!.querySelector<HTMLElement>(".md-mermaid-viewer-scroll")!;
      const ev = new Event("wheel", { bubbles: true, cancelable: true });
      Object.assign(ev, { deltaY: -100, ctrlKey: true });
      await act(async () => {
        scroll.dispatchEvent(ev);
      });
      expect(ev.defaultPrevented).toBe(true);
      expect(document.body.querySelector('[data-testid="md-view-mermaid-0-viewer-scale"]')?.textContent).toBe("150%");
      await act(async () => {
        const plain = new Event("wheel", { bubbles: true, cancelable: true });
        Object.assign(plain, { deltaY: 40 });
        scroll.dispatchEvent(plain);
      });
      expect(leaked).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("wheel", leaked);
    }
  });

  it("viewBox 가 없는 도식과 그리기 실패에는 [크게 보기] 단추가 없다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: '<svg data-x="nv"><g></g></svg>' });
    await mount();
    expect(opener()).toBeNull();
    mermaidMock.render.mockRejectedValue(new Error("x"));
    await mount("```mermaid\ngraph TD\n  E-->\n```");
    expect(opener()).toBeNull();
    expect(host.querySelector("pre code")?.textContent).toBe("graph TD\n  E-->");
  });

  it("화면이 사라지면(언마운트) 창도 함께 사라진다", async () => {
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    await mount();
    await open();
    await act(async () => {
      root.render(createElement("div"));
    });
    expect(viewer()).toBeNull();
  });
});
