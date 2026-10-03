/** @vitest-environment happy-dom */

// HTML 편집기(shared html-editor) — 글 ↔ HTML 변환, 서식 편집이 지키지 못하는 태그 찾기, 서식 모드(Tiptap) 도구 막대·빈 값·빈 문단,
// HTML 원문 모드(원문 그대로·미리보기 소독·스키마 밖 태그면 원문으로 열기·서식으로 바꿀 때 확인), 글자 수 경고(입력은 막지 않음),
// 읽기 전용 모습, 바깥 값 맞추기. 서식 모드 글자 입력은 markdown-editor 시험처럼 ProseMirror 거래로 흉내 낸다.
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";

import { DmesUiProvider } from "../../src/ui-provider";
import {
  HtmlEditor,
  htmlToText,
  textToHtml,
  unsupportedRichTags,
  type HtmlEditorProps,
} from "../../src/components/html-editor";
import { HTML_EDITOR_CSS } from "../../src/components/html-editor/styles";
import { flush, installDomStorage, polyfillLayout, typeInto } from "./markdown-editor-test-utils";

// ─────────────────────────────── 글 ↔ HTML ───────────────────────────────

describe("textToHtml — 글을 HTML 로", () => {
  it("빈 글·공백만 있는 글은 빈 값이다", () => {
    expect(textToHtml("")).toBe("");
    expect(textToHtml("  \n \n")).toBe("");
  });

  it("줄마다 <p> 로 감싸고 특수 문자를 이스케이프한다", () => {
    expect(textToHtml("a < b & c\nMap<String>")).toBe(
      "<p>a &lt; b &amp; c</p>\n<p>Map&lt;String&gt;</p>"
    );
  });

  it("가운데 빈 줄은 <p><br></p>, 끝 빈 줄은 버린다, \\r\\n 도 줄바꿈이다", () => {
    expect(textToHtml("a\n\nb\n\n")).toBe("<p>a</p>\n<p><br></p>\n<p>b</p>");
    expect(textToHtml("a\r\nb")).toBe("<p>a</p>\n<p>b</p>");
  });

  it("줄 앞 공백(들여쓰기)은 &nbsp; 로 지킨다", () => {
    expect(textToHtml("  - 항목")).toBe("<p>&nbsp;&nbsp;- 항목</p>");
  });

  it("줄 안 연속 공백은 첫 칸만 일반 공백, 나머지는 &nbsp; 로 지킨다", () => {
    expect(textToHtml("a  b")).toBe("<p>a &nbsp;b</p>");
    expect(textToHtml("a    b")).toBe("<p>a &nbsp;&nbsp;&nbsp;b</p>");
    expect(textToHtml("a b")).toBe("<p>a b</p>");
  });

  it("탭은 공백 4칸(&nbsp;)으로 바꿔 지킨다(줄 앞·줄 안 모두)", () => {
    expect(textToHtml("\tindent")).toBe("<p>&nbsp;&nbsp;&nbsp;&nbsp;indent</p>");
    expect(textToHtml("a\tb")).toBe("<p>a &nbsp;&nbsp;&nbsp;b</p>");
  });

  it("줄 끝 공백도 &nbsp; 로 지킨다", () => {
    expect(textToHtml("a  ")).toBe("<p>a&nbsp;&nbsp;</p>");
  });
});

describe("htmlToText — HTML 을 글로", () => {
  it("블록 사이는 줄바꿈, <br> 도 줄바꿈, 실체는 글자로 푼다", () => {
    expect(htmlToText("<h2>제목</h2><p>a &lt; b<br>둘째</p><ul><li>가</li><li>나</li></ul>")).toBe(
      "제목\na < b\n둘째\n가\n나"
    );
  });

  it("빈 값·태그 사이 공백", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("<p>a</p>\n  <p>b</p>")).toBe("a\nb");
    expect(htmlToText("<p>a <b>굵게</b>  뒤</p>")).toBe("a 굵게 뒤");
  });

  it("문단 끝 <br> 은 줄을 더하지 않는다(브라우저가 그리는 모습과 같다)", () => {
    expect(htmlToText("<p>a<br></p><p>b</p>")).toBe("a\nb");
  });

  it("pre 안 줄바꿈·공백은 그대로, 표 칸은 탭으로 잇는다", () => {
    expect(htmlToText("<pre><code>x\n  y</code></pre>")).toBe("x\n  y");
    expect(htmlToText("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>")).toBe(
      "a\tb\nc"
    );
  });

  it("script·style 의 내용은 글자로 남기지 않는다", () => {
    expect(htmlToText("<p>a</p><script>alert(1)</script><style>p{}</style>")).toBe("a");
  });

  it("탭은 공백 4칸으로 돌아온다(탭 글자는 되살리지 않는다)", () => {
    expect(htmlToText(textToHtml("a\tb"))).toBe("a    b");
  });

  it.each(["a\n\nb", "  - 항목\n줄", "Map<String> & x", "한 줄", "a  b", "a     b", "   들여쓰기  뒤"])(
    "%j — textToHtml 뒤 htmlToText 면 원래 글이다",
    (text) => {
      expect(htmlToText(textToHtml(text))).toBe(text);
    }
  );
});

describe("unsupportedRichTags — 서식 편집이 지키지 못하는 태그", () => {
  it("편집기 스키마가 다루는 태그(와 div·span 감싸개)만이면 빈 목록이다", () => {
    const html =
      "<h1>a</h1><h2>x</h2><h4>b</h4><p><strong>b</strong><b>b</b><em>i</em><i>i</i><u>u</u><s>s</s>" +
      "<del>d</del><strike>s</strike><code>c</code><a href='https://a.com'>l</a><br></p>" +
      "<ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote>" +
      "<pre><code>x</code></pre><hr><div><span>x</span></div>";
    expect(unsupportedRichTags(html)).toEqual([]);
  });

  it("표·그림·그 밖의 태그는 이름을 한 번씩 돌려준다", () => {
    const html =
      "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table><img src='https://x.com/a.png'>" +
      "<p>H<sub>2</sub>O</p><dl><dt>a</dt></dl>";
    expect(unsupportedRichTags(html)).toEqual([
      "table",
      "tbody",
      "tr",
      "td",
      "img",
      "sub",
      "dl",
      "dt",
    ]);
  });

  it("빈 값·일반 글은 빈 목록이다", () => {
    expect(unsupportedRichTags("")).toEqual([]);
    expect(unsupportedRichTags("a < b")).toEqual([]);
  });
});

// ─────────────────────────────── 렌더 시험 틀 ───────────────────────────────

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  installDomStorage();
  polyfillLayout();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

interface Harness {
  onChange: ReturnType<typeof vi.fn>;
  value: () => string;
  setValue: (v: string) => Promise<void>;
}

/** 부모처럼 value 를 들고 onChange 로 바꾸는 틀. */
async function mount(initial: string, props: Partial<HtmlEditorProps> = {}): Promise<Harness> {
  const onChange = vi.fn();
  let current = initial;
  let setOuter: (v: string) => void = () => {};
  function Wrap() {
    const [v, setV] = useState(initial);
    setOuter = setV;
    current = v;
    return createElement(HtmlEditor, {
      value: v,
      editable: true,
      ...props,
      onChange: (html: string) => {
        onChange(html);
        setV(html);
      },
    });
  }
  await act(async () => root.render(createElement(DmesUiProvider, null, createElement(Wrap))));
  await flush();
  await flush();
  return {
    onChange,
    value: () => current,
    setValue: async (v) => {
      await act(async () => setOuter(v));
      await flush();
    },
  };
}

const tid = <T extends Element = HTMLElement>(id: string) =>
  document.querySelector<T & Element>(`[data-testid="${id}"]`) as T | null;

function editorOf(): Editor {
  const dom = host.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  if (!dom?.editor) throw new Error("서식 편집기가 없다");
  return dom.editor;
}

/** 글자를 한 자씩 친다 — 입력 규칙(handleTextInput)이 먼저 받고, 안 받으면 그대로 넣는다. */
async function typeRich(text: string) {
  const editor = editorOf();
  for (const ch of text) {
    await act(async () => {
      const view = editor.view;
      const { from, to } = view.state.selection;
      const handled = view.someProp("handleTextInput", (f) =>
        f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to))
      );
      if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
    });
  }
}

async function click(el: Element | null) {
  if (!el) throw new Error("누를 요소가 없다");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    (el as HTMLElement).click();
  });
  await flush();
  await flush();
}

async function selectAll() {
  await act(async () => {
    editorOf().commands.selectAll();
  });
}

const TABLE = "<p>앞</p><table><tbody><tr><td>칸</td></tr></tbody></table>";

// ─────────────────────────────── 열기 ───────────────────────────────

describe("열기만 하면 onChange 를 부르지 않는다", () => {
  it.each(["<b>x</b>", "plain", "<p>a</p><p></p>", "<p>a</p>\n<p><br></p>\n<p>b</p>", "", TABLE])(
    "%j",
    async (html) => {
      const h = await mount(html);
      expect(h.onChange).not.toHaveBeenCalled();
      expect(tid("html-editor")).not.toBeNull();
      if (html === TABLE) {
        expect(host.querySelector(".ProseMirror")).toBeNull();
        expect(tid("html-editor")!.getAttribute("data-mode")).toBe("source");
      } else {
        expect(host.querySelector(".ProseMirror")).not.toBeNull();
        expect(tid("html-editor")!.getAttribute("data-mode")).toBe("rich");
      }
    }
  );
});

// ─────────────────────────────── 서식 모드 ───────────────────────────────

describe("서식 모드 — 도구 막대", () => {
  it("단추 순서·이름·data-testid(testId 를 앞에 붙인다)", async () => {
    await mount("", { testId: "desc" });
    const ids = Array.from(host.querySelectorAll("[data-testid^='desc-tb-']")).map((b) =>
      b.getAttribute("data-testid")
    );
    expect(ids).toEqual([
      "desc-tb-bold",
      "desc-tb-italic",
      "desc-tb-underline",
      "desc-tb-strike",
      "desc-tb-h2",
      "desc-tb-h3",
      "desc-tb-bulletList",
      "desc-tb-orderedList",
      "desc-tb-blockquote",
      "desc-tb-code",
      "desc-tb-link",
      "desc-tb-hr",
      "desc-tb-undo",
      "desc-tb-redo",
    ]);
    for (const b of Array.from(host.querySelectorAll("[data-testid^='desc-tb-']"))) {
      expect(b.getAttribute("aria-label")).toMatch(/[가-힣]/);
      expect(b.getAttribute("title")).toMatch(/[가-힣]/);
    }
    expect(tid("desc-mode-html")).not.toBeNull();
    expect(tid("desc-rich")).not.toBeNull();
  });

  it("단추를 누르면(mousedown) 기본 동작을 막아 편집기 초점을 지킨다", async () => {
    await mount("");
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    tid("html-editor-tb-bold")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("굵게·밑줄·H2·인용·코드·구분선 단추가 HTML 을 바꾸고 눌린 상태를 보인다", async () => {
    const h = await mount("<p>글</p>");
    await selectAll();
    await click(tid("html-editor-tb-bold"));
    expect(h.value()).toBe("<p><strong>글</strong></p>");
    expect(tid("html-editor-tb-bold")!.getAttribute("aria-pressed")).toBe("true");
    await click(tid("html-editor-tb-underline"));
    expect(h.value()).toContain("<u>글</u>");
    await click(tid("html-editor-tb-h2"));
    expect(h.value()).toMatch(/^<h2>/);
    expect(tid("html-editor-tb-h2")!.getAttribute("aria-pressed")).toBe("true");
    expect(tid("html-editor-tb-h3")!.getAttribute("aria-pressed")).toBe("false");
    await click(tid("html-editor-tb-h2"));
    await click(tid("html-editor-tb-blockquote"));
    expect(h.value()).toMatch(/^<blockquote>/);
    await click(tid("html-editor-tb-hr"));
    expect(h.value()).toContain("<hr>");
  });

  it("구분선 단추는 토글이 아니라서 aria-pressed 가 없다", async () => {
    await mount("<p>글</p>");
    expect(tid("html-editor-tb-hr")!.hasAttribute("aria-pressed")).toBe(false);
    expect(tid("html-editor-tb-bold")!.hasAttribute("aria-pressed")).toBe(true);
  });

  it("글머리·번호 목록, 코드", async () => {
    const h = await mount("<p>가</p>");
    await selectAll();
    await click(tid("html-editor-tb-bulletList"));
    expect(h.value()).toBe("<ul><li><p>가</p></li></ul>");
    await click(tid("html-editor-tb-orderedList"));
    expect(h.value()).toBe("<ol><li><p>가</p></li></ol>");
    await selectAll();
    await click(tid("html-editor-tb-code"));
    expect(h.value()).toContain("<code>가</code>");
  });

  it("되돌리기·다시하기", async () => {
    const h = await mount("<p>글</p>");
    expect(tid<HTMLButtonElement>("html-editor-tb-undo")!.disabled).toBe(true);
    await selectAll();
    await click(tid("html-editor-tb-bold"));
    expect(h.value()).toBe("<p><strong>글</strong></p>");
    await click(tid("html-editor-tb-undo"));
    expect(h.value()).toBe("<p>글</p>");
    await click(tid("html-editor-tb-redo"));
    expect(h.value()).toBe("<p><strong>글</strong></p>");
  });

  it("다 지우면 빈 값('')을 낸다 — <p></p> 가 아니다", async () => {
    const h = await mount("<p>a</p><p>b</p>");
    await selectAll();
    await act(async () => {
      editorOf().commands.deleteSelection();
    });
    await flush();
    expect(h.onChange).toHaveBeenLastCalledWith("");
    expect(h.value()).toBe("");
  });

  it("빈 문단은 <p><br></p> 로 쓰고, 다시 열면 빈 문단 하나다(블록마다 줄을 나눈다)", async () => {
    const h = await mount("<p>a</p>\n<p><br></p>\n<p>b</p>");
    const doc = editorOf().getJSON();
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(doc.content?.[1]?.content ?? []).toEqual([]);
    await act(async () => {
      editorOf().commands.focus("end");
    });
    await typeRich("c");
    expect(h.value()).toBe("<p>a</p>\n<p><br></p>\n<p>bc</p>");
  });

  it("줄바꿈으로 끝나는 문단은 <br> 을 하나 더 써서 편집 칸에 보이던 줄 수를 지킨다(다시 읽어도 같은 문서)", async () => {
    const h = await mount("<p>a<br><br></p>");
    expect(
      editorOf()
        .getJSON()
        .content?.[0]?.content?.map((n) => n.type)
    ).toEqual(["text", "hardBreak"]);
    await selectAll();
    await click(tid("html-editor-tb-bold"));
    // 굵게가 줄바꿈까지 감싼다 — 더한 <br> 도 그 안에 들어가고, 다시 읽으면 끝 <br> 은 버려져 같은 문서다.
    expect(h.value()).toBe("<p><strong>a<br><br></strong></p>");
    await h.setValue("<p>바깥</p>");
    await h.setValue("<p><strong>a<br><br></strong></p>");
    expect(
      editorOf()
        .getJSON()
        .content?.[0]?.content?.map((n) => n.type)
    ).toEqual(["text", "hardBreak"]);
  });

  it("h1·h4 처럼 도구 막대에 없는 제목도 지킨다", async () => {
    const h = await mount("<h1>큰 제목</h1><h4>작은 제목</h4>");
    await act(async () => {
      editorOf().commands.focus("end");
    });
    await typeRich("!");
    expect(h.value()).toBe("<h1>큰 제목</h1>\n<h4>작은 제목!</h4>");
  });

  it("링크 — 작은 입력 칸에 주소를 받는다, javascript: 는 거부하고 https 는 건다", async () => {
    const h = await mount("<p>문서</p>");
    await selectAll();
    const prompt = vi.spyOn(window, "prompt");
    await click(tid("html-editor-tb-link"));
    const input = tid<HTMLInputElement>("html-editor-link-input")!;
    expect(input).not.toBeNull();
    await typeInto(input, "javascript:alert(1)");
    await click(tid("html-editor-link-apply"));
    expect(tid("html-editor-link-error")?.textContent).toMatch(/http/);
    expect(h.value()).not.toContain("javascript");
    await typeInto(tid<HTMLInputElement>("html-editor-link-input")!, "https://ex.com/a");
    await click(tid("html-editor-link-apply"));
    expect(h.value()).toContain('href="https://ex.com/a"');
    expect(tid("html-editor-link-input")).toBeNull();
    expect(prompt).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────── 원문 모드 ───────────────────────────────

describe("HTML 원문 모드", () => {
  it("[HTML] 로 원문(고정폭 textarea)을 보이고, 고친 원문을 그대로 낸다", async () => {
    const h = await mount("<p>a</p>");
    await click(tid("html-editor-mode-html"));
    expect(h.onChange).not.toHaveBeenCalled();
    expect(tid("html-editor-mode-html")!.getAttribute("aria-pressed")).toBe("true");
    const ta = tid<HTMLTextAreaElement>("html-editor-source")!;
    expect(ta.value).toBe("<p>a</p>");
    expect(host.querySelector(".ProseMirror")).toBeNull();
    // 원문 모드에서는 서식 단추를 쓰지 않는다
    expect(tid<HTMLButtonElement>("html-editor-tb-bold")!.disabled).toBe(true);
    await typeInto(ta, "<p>b</p><custom>x</custom>");
    expect(h.onChange).toHaveBeenLastCalledWith("<p>b</p><custom>x</custom>");
  });

  it("편집기 스키마 밖 태그(표 등)가 있으면 원문 모드로 연다", async () => {
    await mount(TABLE);
    expect(tid<HTMLTextAreaElement>("html-editor-source")?.value).toBe(TABLE);
    expect(host.querySelector(".ProseMirror")).toBeNull();
  });

  it("원문 → 서식: 사라질 서식이 있으면 확인을 받는다 — 취소면 그대로, 확인이면 표가 빠진 HTML 을 낸다", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const h = await mount(TABLE, { confirm });
    await click(tid("html-editor-mode-html"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]?.[0]).toContain("표·이미지 등 일부 서식이 사라집니다");
    expect(tid("html-editor-source")).not.toBeNull();
    expect(h.onChange).not.toHaveBeenCalled();

    await click(tid("html-editor-mode-html"));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".ProseMirror")).not.toBeNull();
    expect(h.onChange).toHaveBeenCalledTimes(1);
    expect(h.value()).not.toContain("<table");
    expect(h.value()).toContain("앞");
    expect(h.value()).toContain("칸");
  });

  it("원문 → 서식: 지금 원문을 다시 본다 — 고친 원문에 표가 없으면 묻지 않고 onChange 도 없다", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const h = await mount(TABLE, { confirm });
    await typeInto(tid<HTMLTextAreaElement>("html-editor-source")!, "<p>표 없음</p>");
    h.onChange.mockClear();
    await click(tid("html-editor-mode-html"));
    expect(confirm).not.toHaveBeenCalled();
    expect(host.querySelector(".ProseMirror")).not.toBeNull();
    expect(h.onChange).not.toHaveBeenCalled();
    expect(editorOf().getText()).toBe("표 없음");
  });

  it("confirm 을 주지 않으면 공용 메시지 확인창으로 묻는다", async () => {
    await mount(TABLE);
    await click(tid("html-editor-mode-html"));
    expect(document.body.textContent).toContain("표·이미지 등 일부 서식이 사라집니다");
    const ok = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "확인"
    );
    await click(ok ?? null);
    expect(host.querySelector(".ProseMirror")).not.toBeNull();
  });

  it("[미리보기] 는 소독한 HTML 을 보이고, 다시 누르면 원문으로 돌아간다", async () => {
    await mount(TABLE);
    expect(tid("html-editor-preview-toggle")).not.toBeNull();
    await typeInto(
      tid<HTMLTextAreaElement>("html-editor-source")!,
      // script 는 맨 뒤에 둔다 — happy-dom 에서는 DOMPurify 가 지운 script 바로 뒤 노드를 건너뛴다(시험 환경 한계, 브라우저는 그렇지 않다).
      '<p>안녕</p><a href="javascript:x">위험</a><script>alert(1)</script>'
    );
    await click(tid("html-editor-preview-toggle"));
    const preview = tid("html-editor-preview")!;
    expect(preview).not.toBeNull();
    expect(preview.textContent).toContain("안녕");
    expect(preview.querySelector("script")).toBeNull();
    expect(preview.innerHTML).not.toContain("javascript");
    expect(tid("html-editor-source")).toBeNull();
    await click(tid("html-editor-preview-toggle"));
    expect(tid("html-editor-source")).not.toBeNull();
  });

  it("서식 모드에는 [미리보기] 가 없다(서식 모드 자체가 보기다)", async () => {
    await mount("<p>a</p>");
    expect(tid("html-editor-preview-toggle")).toBeNull();
  });
});

// ─────────────────────────────── 서식 모드 안전 ───────────────────────────────

describe("서식 모드 — 불러온·붙여 넣은 HTML 의 위험 요소", () => {
  const BAD =
    '<p onclick="x()">a <a href="javascript:alert(1)" onmouseover="y()">bad</a> ' +
    '<a href=" JAVASCRIPT:alert(2)">bad2</a> <span style="color:red" onclick="z()">s</span></p>';

  it("불러올 때 on*·style·javascript: 링크를 버린다", async () => {
    await mount(BAD);
    const html = editorOf().getHTML();
    expect(html).not.toMatch(/onclick|onmouseover|style=|javascript/i);
    expect(html).toContain("bad");
    expect(html).not.toContain("<a");
  });

  it("붙여 넣을 때도 같다", async () => {
    await mount("<p>x</p>");
    await act(async () => {
      editorOf().view.pasteHTML(BAD + '<img src="x" onerror="w()">');
    });
    await flush();
    const html = editorOf().getHTML();
    expect(html).not.toMatch(/onclick|onmouseover|onerror|style=|javascript|<img/i);
    expect(html).toContain("bad");
  });

  it("링크의 target·rel·class 는 원문을 버리고 고정값으로 쓴다(불러오기)", async () => {
    await mount('<p><a href="https://ok.com" target="_top" rel="opener" class="evil">ok</a></p>');
    const html = editorOf().getHTML();
    expect(html).toContain('href="https://ok.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toMatch(/_top|opener"|evil|class=/);
  });

  it("링크의 target·rel·class 는 붙여 넣어도 고정값이다", async () => {
    const h = await mount("<p>x</p>");
    await act(async () => {
      editorOf().view.pasteHTML(
        '<a href="https://a.com" target="_top" rel="opener" class="evil">ok</a>'
      );
    });
    await flush();
    const html = editorOf().getHTML();
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toMatch(/_top|rel="opener"|evil|class=/);
    expect(h.value()).not.toMatch(/_top|evil/);
  });
});

// ─────────────────────────────── 글자 수 ───────────────────────────────

describe("글자 수(maxLength)", () => {
  it("글자 수를 보이고, 넘으면 경고하되 입력은 막지 않는다", async () => {
    const h = await mount("<p>a</p>", { maxLength: 10 });
    expect(tid("html-editor-count")?.textContent).toContain("8 / 10");
    await click(tid("html-editor-mode-html"));
    expect(tid("html-editor-count")?.textContent).toBe("8 / 10자");
    await click(tid("html-editor-mode-html"));
    expect(tid("html-editor-count")?.getAttribute("data-over")).toBe("false");
    await click(tid("html-editor-mode-html"));
    const ta = tid<HTMLTextAreaElement>("html-editor-source")!;
    expect(ta.hasAttribute("maxlength")).toBe(false);
    await typeInto(ta, "<p>abcdefgh</p>");
    expect(h.onChange).toHaveBeenLastCalledWith("<p>abcdefgh</p>");
    expect(tid("html-editor-count")?.textContent).toContain("15 / 10");
    expect(tid("html-editor-count")?.getAttribute("data-over")).toBe("true");
    expect(tid("html-editor-count-warning")?.textContent).toMatch(/넘었습니다/);
  });

  it("서식 모드는 HTML 길이임을 밝히고 보이는 글자 수를 따로 보인다", async () => {
    await mount("<p>가나</p>", { maxLength: 20000 });
    expect(tid("html-editor-count")?.textContent).toBe("글자 2 · HTML 9 / 20,000자");
    expect(tid("html-editor-count")?.getAttribute("data-over")).toBe("false");
  });

  it("maxLength 가 없으면 글자 수를 보이지 않는다", async () => {
    await mount("<p>a</p>");
    expect(tid("html-editor-count")).toBeNull();
  });
});

// ─────────────────────────────── 읽기 전용·바깥 값 ───────────────────────────────

describe("읽기 전용·바깥 값", () => {
  it("editable=false 면 소독한 HTML 보기만 있다", async () => {
    await mount("<p>본문</p><script>alert(1)</script>", { editable: false });
    expect(host.querySelector(".ProseMirror")).toBeNull();
    expect(tid("html-editor-source")).toBeNull();
    expect(host.querySelector("[role='toolbar']")).toBeNull();
    const root = tid("html-editor")!;
    expect(root.getAttribute("data-editing")).toBe("false");
    expect(root.textContent).toContain("본문");
    expect(root.querySelector("script")).toBeNull();
  });

  it("서식 모드에서 바깥 값이 바뀌면 편집기 내용을 맞추고 onChange 는 없다", async () => {
    const h = await mount("<p>처음</p>");
    await h.setValue("<p>바깥</p>");
    expect(editorOf().getText()).toBe("바깥");
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it("바깥 값이 표를 가진 값으로 바뀌면 원문 모드로 바꾼다", async () => {
    const h = await mount("<p>처음</p>");
    await h.setValue(TABLE);
    expect(tid<HTMLTextAreaElement>("html-editor-source")?.value).toBe(TABLE);
    expect(h.onChange).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────── 스타일 ───────────────────────────────

describe("스타일", () => {
  it("색은 토큰만 쓴다", () => {
    expect(HTML_EDITOR_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(HTML_EDITOR_CSS).toContain("var(--color-border)");
  });
});
