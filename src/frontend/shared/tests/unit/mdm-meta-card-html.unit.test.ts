/** @vitest-environment happy-dom */
/**
 * MdmMetaCard — 컬럼 설명 HTML(2026-10-03 계약: descriptionHtml 은 MDM 이 소독한 HTML, description 은 거기서 뽑은 글자, 일반 글이면 null).
 *  - HTML 을 우선한다. 브라우저에서 sanitizeNoticeHtml 로 한 번 더 소독한 결과만 넣는다(script·onerror·style·javascript: 링크 제거, 링크는 새 탭).
 *  - HTML 카드만 최대 폭 640px, 설명 영역 최대 높이 60vh 에 세로 스크롤. 일반 글 카드는 DOM·스타일이 예전 그대로다.
 *  - 소독 결과가 비거나(전부 위험 태그) 소독할 수 없으면(DOM 없음 → null) description 글자를 그린다. textOnly 면 늘 글자.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  MDM_META_CARD_HTML_MAX_HEIGHT,
  MDM_META_CARD_HTML_MAX_WIDTH,
  MdmMetaCard,
  mdmCardHasHtml,
  type MdmMetaCardProps,
} from "../../src/mdm-meta";
import { TITLE, column, domain } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root | null = null;

function render(props: MdmMetaCardProps) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(MdmMetaCard, props)));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

const card = () => host.querySelector(".mdm-meta-card") as HTMLElement;
const desc = () => host.querySelector('[data-mdm-section="description"]') as HTMLElement | null;
const htmlBody = () => host.querySelector(".mdm-meta-card-html") as HTMLElement | null;

const BODY = column("NOTICE_BODY", {
  columnName: "본문",
  labelLong: "공지 본문",
  description: "굵은 설명 링크",
  descriptionHtml: '<p><b>굵은</b> 설명 <a href="https://example.com/doc">링크</a></p>',
  usageNote: "메모는 글자",
  dataType: "STRING",
  length: 4000,
});

describe("MdmMetaCard — HTML 설명", () => {
  it("descriptionHtml 이 있으면 HTML 을 그리고(설명 칸 data-mdm-html=true), 사용 메모는 그 아래 글자로 둔다", () => {
    render({ column: BODY });
    const d = desc()!;
    expect(d.getAttribute("data-mdm-html")).toBe("true");
    const body = htmlBody()!;
    expect(body.querySelector("b")?.textContent).toBe("굵은");
    expect(body.textContent).toBe("굵은 설명 링크");
    expect(d.lastElementChild?.textContent).toBe("메모는 글자");
    expect(d.lastElementChild).not.toBe(body);
    // 순서는 그대로: 제목 → 설명 → 형식
    const sections = [...host.querySelectorAll("[data-mdm-section]")].map((el) =>
      el.getAttribute("data-mdm-section")
    );
    expect(sections).toEqual(["title", "description", "format"]);
  });

  it("링크는 새 탭(target=_blank rel=noopener noreferrer)으로 연다", () => {
    render({ column: BODY });
    const a = htmlBody()!.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://example.com/doc");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  // happy-dom 의 NodeIterator 는 명세의 "제거 전 단계"가 없어, DOMPurify 가 요소를 지우면 그 뒤 형제를 더 돌지 않는다(실제 브라우저는 명세대로 돈다).
  // 그래서 지워지는 요소(script·style)는 입력마다 하나씩 맨 뒤에 둔다. 속성 제거(on*·style·javascript:)는 앞에 모아도 된다.
  it("브라우저에서 한 번 더 소독한다 — script·on* 속성·인라인 style·javascript: 링크를 뺀다", () => {
    render({
      column: column("X", {
        description: "글자",
        descriptionHtml:
          '<p style="color:red" onclick="x()">글</p><img src="https://example.com/a.png" onerror="alert(1)">' +
          '<a href="javascript:alert(1)">위험</a><script>alert(1)</script>',
      }),
    });
    const body = htmlBody()!;
    const html = body.innerHTML;
    for (const bad of ["<script", "onerror", "onclick", "style=", "javascript:"])
      expect(html, bad).not.toContain(bad);
    expect(body.querySelector("p")?.textContent).toBe("글");
    expect(body.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.png");
    expect(body.querySelector("a")?.hasAttribute("href")).toBe(false);
  });

  it("style 태그도 뺀다", () => {
    render({
      column: column("X", {
        description: "글",
        descriptionHtml: "<p>글</p><style>p{color:red}</style>",
      }),
    });
    expect(htmlBody()!.innerHTML).toBe("<p>글</p>");
  });

  it("소독하고 남는 게 없으면(script 만) description 글자를 그린다", () => {
    render({
      column: column("X", {
        description: "대신 글자",
        descriptionHtml: "<script>alert(1)</script>",
      }),
    });
    expect(htmlBody()).toBeNull();
    expect(desc()!.textContent).toBe("대신 글자");
    expect(desc()!.hasAttribute("data-mdm-html")).toBe(false);
  });

  it("서버 렌더(소독할 DOM 없음)에서는 description 글자를 그린다 — 하이드레이션 뒤에 HTML 로 바뀐다", () => {
    const html = renderToString(createElement(MdmMetaCard, { column: BODY }));
    expect(html).toContain("굵은 설명 링크");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("data-mdm-html");
  });

  it("textOnly 면 HTML 대신 description 글자를 그린다(스크린리더용 숨은 사본 — 링크가 Tab 순서에 숨어 들지 않게)", () => {
    render({ column: BODY, textOnly: true });
    expect(htmlBody()).toBeNull();
    expect(host.querySelector("a")).toBeNull();
    expect(desc()!.textContent).toBe("굵은 설명 링크메모는 글자");
    expect(desc()!.hasAttribute("data-mdm-html")).toBe(false);
    expect(card().style.maxWidth).toBe("360px");
  });

  it("HTML 카드는 최대 폭 640px, 설명 칸은 최대 높이 60vh 에 세로 스크롤", () => {
    render({ column: BODY });
    expect(MDM_META_CARD_HTML_MAX_WIDTH).toBe(640);
    expect(MDM_META_CARD_HTML_MAX_HEIGHT).toBe("60vh");
    expect(card().style.maxWidth).toBe("640px");
    expect(desc()!.style.maxHeight).toBe("60vh");
    expect(desc()!.style.overflowY).toBe("auto");
  });

  it("설명 서식 스타일은 문서 머리(head)에 한 번만 싣는다(포털이 원격 CSS 파일을 싣지 않는다)", () => {
    render({ column: BODY });
    const styles = [...document.head.querySelectorAll("style")].filter((s) =>
      s.textContent?.includes(".mdm-meta-card-html")
    );
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toMatch(/\.mdm-meta-card-html img\s*\{[^}]*max-width:\s*100%/);
  });

  it("mdmCardHasHtml — 소독 결과에 보이는 내용(글자·그림)이 있을 때만 참", () => {
    expect(mdmCardHasHtml(BODY)).toBe(true);
    expect(
      mdmCardHasHtml(
        column("A", { descriptionHtml: '<p><img src="https://example.com/a.png"></p>' })
      )
    ).toBe(true);
    expect(mdmCardHasHtml(column("A", { descriptionHtml: null }))).toBe(false);
    expect(mdmCardHasHtml(column("A", { descriptionHtml: "  " }))).toBe(false);
    expect(mdmCardHasHtml(column("A", { descriptionHtml: "<script>x</script>" }))).toBe(false);
    expect(mdmCardHasHtml(column("A", { descriptionHtml: "<p></p>" }))).toBe(false);
    expect(mdmCardHasHtml(column("A", { descriptionHtml: "<p><br></p><p> </p>" }))).toBe(false);
    expect(mdmCardHasHtml(column("A"))).toBe(false);
    expect(mdmCardHasHtml(null)).toBe(false);
  });

  it("보이는 내용이 없는 HTML(<p><br></p>)은 글자 카드다 — 폭 360, 설명 칸은 글자", () => {
    render({ column: column("X", { description: "대신 글자", descriptionHtml: "<p><br></p>" }) });
    expect(htmlBody()).toBeNull();
    expect(card().style.maxWidth).toBe("360px");
    expect(desc()!.textContent).toBe("대신 글자");
    expect(desc()!.style.maxHeight).toBe("");
  });

  it("그림만 있는 HTML 은 HTML 카드다", () => {
    render({
      column: column("X", {
        description: "",
        descriptionHtml: '<p><img src="https://example.com/a.png"></p>',
      }),
    });
    expect(htmlBody()!.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.png");
    expect(card().style.maxWidth).toBe("640px");
  });

  it("HTML 대신 그리는 글자는 줄바꿈을 살린다(white-space: pre-line) — 일반 글 설명은 예전 그대로", () => {
    render({
      column: column("X", {
        description: "두께 < 10\n하나\n둘",
        descriptionHtml: "<script>x</script>",
      }),
    });
    expect((desc()!.firstElementChild as HTMLElement).style.whiteSpace).toBe("pre-line");
    act(() => root?.unmount());
    host.remove();
    render({ column: BODY, textOnly: true });
    expect((desc()!.firstElementChild as HTMLElement).style.whiteSpace).toBe("pre-line");
    act(() => root?.unmount());
    host.remove();
    render({ column: column("X", { description: "일반 글" }) });
    expect((desc()!.firstElementChild as HTMLElement).getAttribute("style")).toBe(
      "display: block;"
    );
  });
});

describe("MdmMetaCard — 일반 글 카드는 예전 그대로", () => {
  it("descriptionHtml 이 null 이거나 칸이 없으면 DOM·스타일이 바뀌지 않는다(리팩터링 전 FormGroup DOM 고정 시험과 같은 마크업)", () => {
    const fixed =
      '<span class="mdm-meta-card" style="display: flex; flex-direction: column; gap: 4px; max-width: 360px; line-height: 1.5; text-align: left; white-space: normal; word-break: break-word;"><span data-mdm-section="title" style="display: block;"><span style="font-weight: 600;">공지 제목</span><span style="margin-left: 6px; font-family: var(--font-family-mono, monospace); opacity: 0.75;">TITLE</span></span><span data-mdm-section="description" style="display: block;"><span style="display: block;">공지사항의 제목</span></span><span data-mdm-section="format" style="display: block;"><span style="opacity: 0.75; margin-right: 4px;">형식</span>STRING(1000) · 필수</span><span data-mdm-section="domain" style="display: block;"><span style="opacity: 0.75; margin-right: 4px;">도메인</span>텍스트 (D_TEXT · TEXT)</span></span>';
    const textDomain = domain("D_TEXT", { domainName: "텍스트", domainKind: "TEXT" });
    render({ column: TITLE, domain: textDomain });
    expect(host.innerHTML).toBe(fixed);
    act(() => root?.unmount());
    host.remove();
    render({ column: { ...TITLE, descriptionHtml: null }, domain: textDomain });
    expect(host.innerHTML).toBe(fixed);
  });
});
