/** @vitest-environment happy-dom */

// 공지 본문 뷰어(shared notice-body-view) — 형식별(TEXT·MD·HTML) 렌더링, HTML 소독, TEXT 이스케이프, 빈 본문.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NoticeBodyView,
  sanitizeNoticeHtml,
  type NoticeBodyViewProps,
} from "../../src/components/notice-body-view";

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

function render(props: NoticeBodyViewProps) {
  act(() => root.render(createElement(NoticeBodyView, props)));
  return host.querySelector<HTMLElement>(`[data-testid="${props.testId ?? "notice-body-view"}"]`)!;
}

describe("NoticeBodyView — TEXT", () => {
  it("HTML 태그를 글자로 보이고 줄바꿈을 보존한다", () => {
    const el = render({ value: "첫 줄\n<b>둘째</b> & 셋째", format: "TEXT" });
    expect(el.querySelector("b")).toBeNull();
    expect(el.textContent).toBe("첫 줄\n<b>둘째</b> & 셋째");
    expect(el.querySelector(".nbv-text")).not.toBeNull();
  });
});

describe("NoticeBodyView — MD", () => {
  it("제목·목록·할 일 목록·링크를 그리고 링크는 새 탭으로 연다", () => {
    const el = render({
      value: "# 제목\n\n- 가\n- 나\n\n- [x] 끝\n- [ ] 할 일\n\n[링크](https://example.com)",
      format: "MD",
    });
    expect(el.querySelector("h1")?.textContent).toBe("제목");
    expect(el.querySelectorAll("ul li").length).toBeGreaterThanOrEqual(4);
    expect(el.querySelectorAll('input[type="checkbox"]').length).toBe(2);
    const a = el.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://example.com");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("마크다운 안 HTML 은 글자로 남는다", () => {
    const el = render({ value: "<script>alert(1)</script>", format: "MD" });
    expect(el.querySelector("script")).toBeNull();
    expect(el.textContent).toContain("<script>");
  });
});

describe("NoticeBodyView — HTML", () => {
  it("서식 태그를 그린다", () => {
    const el = render({
      value:
        "<h2>안내</h2><ul><li>하나</li></ul><blockquote>인용</blockquote><pre><code>x</code></pre><table><tr><td>셀</td></tr></table>",
      format: "HTML",
    });
    for (const sel of ["h2", "ul li", "blockquote", "pre code", "table td"]) {
      expect(el.querySelector(sel), sel).not.toBeNull();
    }
  });

  // happy-dom 의 노드 순회는 지운 노드의 다음 형제를 건너뛰는 결함이 있어(실제 브라우저에는 없다) 금지 요소를 하나씩 따로 시험한다.
  it("금지 태그를 제거한다(script·style·iframe·object·embed·form)", () => {
    const cases: Record<string, string> = {
      script: "<script>alert(1)</script>",
      style: "<style>p{color:red}</style>",
      iframe: '<iframe src="https://e.com"></iframe>',
      object: '<object data="a"></object>',
      embed: '<embed src="a">',
      form: '<form action="/x"></form>',
    };
    for (const [tag, bad] of Object.entries(cases)) {
      const el = render({ value: `<p>글</p>${bad}`, format: "HTML", testId: `t-${tag}` });
      expect(el.textContent, tag).toBe("글");
      expect(el.querySelector(tag), tag).toBeNull();
    }
  });

  it("on* 속성과 인라인 style 속성을 제거한다", () => {
    const el = render({
      value:
        '<p style="color:red" onclick="x()">글</p><img src="data:image/png;base64,AAAA" onerror="alert(1)">',
      format: "HTML",
    });
    const html = el.innerHTML;
    expect(html).toContain("글");
    for (const bad of ["onerror", "onclick", "style="]) expect(html, bad).not.toContain(bad);
  });

  it("링크는 새 탭으로 열고 javascript: 주소는 지운다", () => {
    const el = render({
      value:
        '<a href="https://example.com" target="_self">정상</a><a href="javascript:alert(1)">위험</a><a href="data:text/html,x">자료</a>',
      format: "HTML",
    });
    const [ok, js, data] = Array.from(el.querySelectorAll("a"));
    expect(ok.getAttribute("href")).toBe("https://example.com");
    expect(ok.getAttribute("target")).toBe("_blank");
    expect(ok.getAttribute("rel")).toBe("noopener noreferrer");
    expect(js.hasAttribute("href")).toBe(false);
    expect(data.hasAttribute("href")).toBe(false);
    expect(js.hasAttribute("target")).toBe(false);
  });

  it("이미지 주소는 http/https 만 남긴다 — data:·javascript:·상대 주소는 지운다(서버 소독과 같은 규칙)", () => {
    const el = render({
      value:
        '<img src="https://example.com/a.png" alt="정상"><img src="data:image/png;base64,AAAA" alt="자료"><img src="javascript:alert(1)" alt="위험"><img src="/img/b.png" alt="상대">',
      format: "HTML",
    });
    const [ok, data, js, rel] = Array.from(el.querySelectorAll("img"));
    expect(ok.getAttribute("src")).toBe("https://example.com/a.png");
    expect(data.hasAttribute("src")).toBe(false);
    expect(js.hasAttribute("src")).toBe(false);
    expect(rel.hasAttribute("src")).toBe(false);
  });

  it("sanitizeNoticeHtml 은 문자열을 소독해 돌려준다", () => {
    const out = sanitizeNoticeHtml('<b onmouseover="x()">굵게</b><script>1</script>');
    expect(out).toBe("<b>굵게</b>");
  });
});

describe("NoticeBodyView — 공통", () => {
  it("본문이 비면 emptyText 를 보인다", () => {
    const el = render({ value: "  ", format: "MD", emptyText: "내용 없음", testId: "n1" });
    expect(el.textContent).toBe("내용 없음");
  });

  it("className·testId 를 뿌리에 단다", () => {
    const el = render({ value: "가", format: "TEXT", className: "extra", testId: "n2" });
    expect(el.className).toContain("nbv");
    expect(el.className).toContain("extra");
  });

  it("스타일은 토큰만 쓰고 16진수 색을 쓰지 않으며 표·코드는 안에서 스크롤한다", async () => {
    const { NOTICE_BODY_VIEW_CSS: css } =
      await import("../../src/components/notice-body-view/NoticeBodyView");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toMatch(/table \{[^}]*overflow-x: auto/);
    expect(css).toMatch(/pre \{[^}]*overflow: auto/);
  });
});
