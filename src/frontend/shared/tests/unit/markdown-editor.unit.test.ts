/** @vitest-environment happy-dom */

// 마크다운 편집기(shared markdown-editor) — 마크다운 읽기·쓰기 왕복, 서식 모드 입력 규칙, 도구 막대(서식·MD 모드), 모드 전환·기억(저장 키),
// 읽기 전용 모습, 위험한 링크, 화면이 넘기는 클래스(editingClassName·linkClassName), 스타일(토큰·문단 간격).
// 서식 모드 글자 입력은 ProseMirror 의 handleTextInput 을 직접 불러 흉내 낸다(happy-dom 에는 브라우저 입력 이벤트→DOM 변화 관찰이 없다).
// 2026-10-02 m-mdm tests/dme/ruleSetEdit/note-editor.test.ts 에서 옮겼다(캔버스 z-index 규칙 시험은 m-mdm note-canvas-style.test.ts 로).
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";

import { DmesUiProvider } from "../../src/ui-provider";
import {
  MarkdownEditor,
  MarkdownField,
  MarkdownView,
  type MarkdownEditorProps,
} from "../../src/components/markdown-editor";
import { parseMarkdown, serializeMarkdown } from "../../src/components/markdown-editor/markdown";
import {
  DEFAULT_MODE_STORAGE_KEY,
  getEditMode,
  setEditMode,
} from "../../src/components/markdown-editor/edit-mode";
import {
  MARKDOWN_EDITOR_CSS,
  MARKDOWN_EDITOR_STYLE_HREF,
  PARAGRAPH_GAP,
} from "../../src/components/markdown-editor/styles";
import { flush, installDomStorage, polyfillLayout, typeInto } from "./markdown-editor-test-utils";

// ─────────────────────────────── 마크다운 왕복 ───────────────────────────────

const roundTrip = (md: string) => serializeMarkdown(parseMarkdown(md));

describe("markdown — 읽기·쓰기", () => {
  it("예전 일반 글: 줄바꿈 하나도 줄바꿈으로 남고, 다시 써도 같은 글이다", () => {
    const legacy = "첫 줄\n둘째 줄\n셋째 줄\n\n문단 둘\n  들여쓴 줄";
    const doc = parseMarkdown(legacy);
    expect(doc.content?.[0]).toMatchObject({
      type: "paragraph",
      content: [
        { text: "첫 줄" },
        { type: "hardBreak" },
        { text: "둘째 줄" },
        { type: "hardBreak" },
        { text: "셋째 줄" },
      ],
    });
    expect(roundTrip(legacy)).toBe(legacy);
  });

  it("빈 줄 여럿도 그대로 남는다", () => {
    expect(roundTrip("a\n\n\n\nb")).toBe("a\n\n\n\nb");
  });

  it.each([
    ["제목", "# 하나\n\n## 둘\n\n### 셋"],
    ["굵게·기울임·취소선", "**굵게** *기울임* ~~취소~~"],
    ["글머리 목록", "- 가\n- 나\n  - 안쪽"],
    ["번호 목록", "1. 가\n2. 나"],
    ["할 일 목록", "- [ ] 할 일\n- [x] **끝난** 일"],
    ["인용", "> 인용 **굵게**\n> 둘째 줄"],
    ["링크", "[문서](https://ex.com/a) 보기"],
    ["목록 안 줄바꿈", "- 가\n이어진 줄"],
  ])("%s — md → 편집기 문서 → md", (_name, md) => {
    expect(roundTrip(md)).toBe(md);
  });

  it("HTML 은 받지 않는다 — 태그는 글자 그대로", () => {
    const doc = parseMarkdown("앞 <b>굵게?</b> 뒤\n\n<div>블록</div>");
    expect(JSON.stringify(doc)).not.toContain('"bold"');
    expect(doc.content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "앞 <b>굵게?</b> 뒤" }],
    });
    expect(doc.content?.[1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "<div>블록</div>" }],
    });
  });

  it("< · & 는 &lt; · &amp; 로 바뀌지 않고, 글자 그대로의 &lt; 는 다시 읽어도 &lt; 다", () => {
    expect(roundTrip("a < b & c")).toBe("a < b & c");
    const typed = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "글자 &lt; 그대로" }],
        },
      ],
    };
    const md = serializeMarkdown(typed);
    expect(parseMarkdown(md).content?.[0]).toMatchObject({
      content: [{ text: "글자 &lt; 그대로" }],
    });
  });

  it("표·그림·맨 주소는 글자로 남는다(사라지지 않는다)", () => {
    expect(roundTrip("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(roundTrip("https://ex.com 참고")).toBe("https://ex.com 참고");
    expect(JSON.stringify(parseMarkdown("![그림](https://ex.com/a.png)"))).toContain(
      "![그림](https://ex.com/a.png)"
    );
  });

  it("글자 그대로의 줄 앞 기호(# - + > 1. --- ===)는 다시 읽어도 글자다", () => {
    const para = (...parts: string[]) => ({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: parts.flatMap((t, i) =>
            i ? [{ type: "hardBreak" }, { type: "text", text: t }] : [{ type: "text", text: t }]
          ),
        },
      ],
    });
    for (const parts of [
      ["## 제목"],
      ["# "],
      ["- 가"],
      ["+ 가"],
      ["> 인용"],
      ["1. 하나"],
      ["2) 둘"],
      ["---"],
      ["a", "---"],
      ["a", "==="],
      ["a", "- 가"],
      ["a", "1. 가"],
      ["a", "> 가"],
      ["  ## 들여"],
    ]) {
      const doc = para(...parts);
      expect(parseMarkdown(serializeMarkdown(doc)), JSON.stringify(parts)).toEqual(doc);
    }
  });

  it("기호가 아닌 글은 그대로 쓴다 — #태그, 낱말 안 밑줄(NG_A), 1.5", () => {
    const para = (text: string) => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    expect(serializeMarkdown(para("#태그"))).toBe("#태그");
    expect(serializeMarkdown(para("NG_A 와 R_01"))).toBe("NG_A 와 R_01");
    expect(serializeMarkdown(para("1.5 배"))).toBe("1.5 배");
    expect(parseMarkdown(serializeMarkdown(para("_가_ 와 a_b_c")))).toEqual(para("_가_ 와 a_b_c"));
  });

  it("빈 글은 빈 문서, 빈 문서는 빈 글", () => {
    expect(parseMarkdown("")).toEqual({ type: "doc", content: [] });
    expect(serializeMarkdown({ type: "doc", content: [] })).toBe("");
  });
});

// ─────────────────────────────── 렌더 도우미 ───────────────────────────────

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  installDomStorage();
  localStorage.clear();
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
  onExit: ReturnType<typeof vi.fn>;
  value: () => string;
  setValue: (v: string) => Promise<void>;
}

/** 부모처럼 value 를 들고 onChange 로 바꾸는 틀. */
async function mount(initial: string, props: Partial<MarkdownEditorProps> = {}): Promise<Harness> {
  const onChange = vi.fn();
  const onExit = vi.fn();
  let current = initial;
  let setOuter: (v: string) => void = () => {};
  function Wrap() {
    const [v, setV] = useState(initial);
    setOuter = setV;
    current = v;
    return createElement(MarkdownEditor, {
      value: v,
      editable: true,
      toolbar: "inline",
      onExit,
      ...props,
      onChange: (md: string) => {
        onChange(md);
        setV(md);
      },
    });
  }
  await act(async () => root.render(createElement(DmesUiProvider, null, createElement(Wrap))));
  await flush();
  await flush();
  return {
    onChange,
    onExit,
    value: () => current,
    setValue: async (v) => {
      await act(async () => setOuter(v));
      await flush();
    },
  };
}

const q = <T extends Element = HTMLElement>(sel: string) =>
  host.querySelector<T & Element>(sel) as T | null;
const tid = <T extends Element = HTMLElement>(id: string) => q<T>(`[data-testid="${id}"]`);

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
}

const md = () => serializeMarkdown(editorOf().getJSON());

// ─────────────────────────────── 입력 규칙 ───────────────────────────────

describe("서식 모드 입력 규칙", () => {
  it.each([
    ["# ", "heading", { level: 1 }],
    ["## ", "heading", { level: 2 }],
    ["### ", "heading", { level: 3 }],
    ["- ", "bulletList", undefined],
    ["* ", "bulletList", undefined],
    ["1. ", "orderedList", undefined],
    ["[ ] ", "taskList", undefined],
    ["> ", "blockquote", undefined],
  ])("%j → %s", async (typed, type, attrs) => {
    await mount("");
    await typeRich(typed + "글");
    const first = editorOf().getJSON().content?.[0];
    expect(first?.type).toBe(type);
    if (attrs) expect(first?.attrs).toMatchObject(attrs);
    expect(editorOf().getText()).toContain("글");
  });

  it('"[x] " 는 체크된 할 일', async () => {
    await mount("");
    await typeRich("[x] 끝");
    expect(editorOf().getJSON().content?.[0]).toMatchObject({
      type: "taskList",
      content: [{ type: "taskItem", attrs: { checked: true } }],
    });
  });

  it('"#태그" 는 띄어쓰기가 없으니 그대로 글이다', async () => {
    await mount("");
    await typeRich("#태그");
    expect(editorOf().getJSON().content?.[0]?.type).toBe("paragraph");
    expect(md()).toBe("#태그");
  });

  it("**글** → 굵게, *글* → 기울임, ~~글~~ → 취소선", async () => {
    const h = await mount("");
    await typeRich("**굵** *기* ~~취~~ ");
    expect(md().trim()).toBe("**굵** *기* ~~취~~");
    expect(h.onChange).toHaveBeenLastCalledWith(expect.stringContaining("**굵**"));
  });

  it("[글](https://…) → 링크, javascript: 주소는 링크가 되지 않는다", async () => {
    await mount("");
    await typeRich("[문서](https://ex.com) ");
    expect(md().trim()).toBe("[문서](https://ex.com)");
    await act(async () => {
      editorOf().commands.setContent("", { emitUpdate: false });
    });
    await typeRich("[나쁜](javascript:alert(1)) ");
    expect(JSON.stringify(editorOf().getJSON())).not.toContain('"link"');
  });

  it("바뀐 직후 Ctrl/Cmd+Z 는 기호 상태로 돌린다", async () => {
    await mount("");
    await typeRich("## ");
    expect(editorOf().getJSON().content?.[0]?.type).toBe("heading");
    await act(async () => {
      // ProseMirror 의 Mod 는 맥이면 Cmd, 아니면 Ctrl 이다(navigator.platform 으로 가른다).
      const mac = /Mac|iP(hone|[oa]d)/.test(navigator.platform);
      editorOf().view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          code: "KeyZ",
          ctrlKey: !mac,
          metaKey: mac,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(editorOf().getJSON().content?.[0]?.type).toBe("paragraph");
    expect(editorOf().getText()).toBe("## ");
  });
});

// ─────────────────────────────── 열기만 하면 바뀌지 않는다 ───────────────────────────────

describe("열기만 하면 글이 바뀌지 않는다", () => {
  it.each([
    "첫 줄\n둘째 줄",
    "# 제목",
    "- 가\n- 나",
    "1. 가",
    "- [ ] 할 일",
    "> 인용",
    "a * b < c",
  ])("%j — onChange 없음", async (text) => {
    const h = await mount(text, { autoFocus: true });
    expect(h.onChange).not.toHaveBeenCalled();
    expect(host.querySelector(".ProseMirror")).not.toBeNull();
  });
});

// ─────────────────────────────── 도구 막대 ───────────────────────────────

describe("도구 막대 — 서식 모드", () => {
  it("순서·이름·data-testid", async () => {
    await mount("");
    const ids = Array.from(host.querySelectorAll("[data-testid^='md-tb-']")).map((b) =>
      b.getAttribute("data-testid")
    );
    expect(ids).toEqual([
      "md-tb-paragraph",
      "md-tb-h1",
      "md-tb-h2",
      "md-tb-h3",
      "md-tb-bold",
      "md-tb-italic",
      "md-tb-strike",
      "md-tb-bulletList",
      "md-tb-orderedList",
      "md-tb-taskList",
      "md-tb-blockquote",
      "md-tb-link",
    ]);
    for (const b of Array.from(host.querySelectorAll("[data-testid^='md-tb-']"))) {
      expect(b.getAttribute("aria-label")).toMatch(/[가-힣]/);
      expect(b.getAttribute("title")).toMatch(/[가-힣]/);
    }
    expect(tid("md-mode-toggle")).not.toBeNull();
  });

  it("단추를 누르면(mousedown) 기본 동작을 막아 편집기 초점을 지킨다", async () => {
    await mount("");
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    tid("md-tb-bold")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("H2·굵게·목록 단추가 문서를 바꾸고 눌린 상태(aria-pressed)를 보인다", async () => {
    const h = await mount("글");
    await act(async () => {
      editorOf().commands.selectAll();
    });
    await click(tid("md-tb-h2"));
    expect(md()).toBe("## 글");
    expect(tid("md-tb-h2")!.getAttribute("aria-pressed")).toBe("true");
    expect(tid("md-tb-h1")!.getAttribute("aria-pressed")).toBe("false");
    await click(tid("md-tb-bold"));
    expect(md()).toBe("## **글**");
    expect(tid("md-tb-bold")!.getAttribute("aria-pressed")).toBe("true");
    await click(tid("md-tb-paragraph"));
    await click(tid("md-tb-bulletList"));
    expect(md()).toBe("- **글**");
    expect(tid("md-tb-bulletList")!.getAttribute("aria-pressed")).toBe("true");
    await click(tid("md-tb-taskList"));
    expect(md()).toBe("- [ ] **글**");
    expect(h.value()).toBe("- [ ] **글**");
  });

  it("링크 단추 — 작은 입력 칸에 주소를 받아 고른 글에 건다, javascript: 는 거부", async () => {
    await mount("문서");
    await act(async () => {
      editorOf().commands.selectAll();
    });
    const prompt = vi.spyOn(window, "prompt");
    await click(tid("md-tb-link"));
    const input = tid<HTMLInputElement>("md-link-input")!;
    expect(input).not.toBeNull();
    await typeInto(input, "javascript:alert(1)");
    await click(tid("md-link-apply"));
    expect(tid("md-link-error")?.textContent).toMatch(/http/);
    expect(JSON.stringify(editorOf().getJSON())).not.toContain('"link"');
    await typeInto(tid<HTMLInputElement>("md-link-input")!, "https://ex.com/a");
    await click(tid("md-link-apply"));
    expect(md()).toBe("[문서](https://ex.com/a)");
    expect(tid("md-link-input")).toBeNull();
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe("도구 막대 — MD 모드", () => {
  beforeEach(() => setEditMode("markdown"));

  it("원문 textarea 가 보이고, 단추가 원문에 기호를 넣고 뺀다", async () => {
    const h = await mount("제목");
    const ta = tid<HTMLTextAreaElement>("md-editor-source")!;
    expect(ta).not.toBeNull();
    expect(ta.value).toBe("제목");
    expect(host.querySelector(".ProseMirror")).toBeNull();
    ta.setSelectionRange(1, 1);
    await click(tid("md-tb-h2"));
    expect(h.value()).toBe("## 제목");
    expect(tid<HTMLTextAreaElement>("md-editor-source")!.value).toBe("## 제목");
    expect(tid("md-tb-h2")!.getAttribute("aria-pressed")).toBe("true");
    await click(tid("md-tb-h2"));
    expect(h.value()).toBe("제목");
    const t2 = tid<HTMLTextAreaElement>("md-editor-source")!;
    t2.setSelectionRange(0, 2);
    await click(tid("md-tb-bold"));
    expect(h.value()).toBe("**제목**");
  });

  it("링크 — 안전한 주소만 원문에 넣는다", async () => {
    const h = await mount("문서");
    tid<HTMLTextAreaElement>("md-editor-source")!.setSelectionRange(0, 2);
    await click(tid("md-tb-link"));
    await typeInto(tid<HTMLInputElement>("md-link-input")!, "javascript:alert(1)");
    await click(tid("md-link-apply"));
    expect(h.value()).toBe("문서");
    await typeInto(tid<HTMLInputElement>("md-link-input")!, "https://ex.com");
    await click(tid("md-link-apply"));
    expect(h.value()).toBe("[문서](https://ex.com)");
  });

  it("textarea 입력은 그대로 onChange", async () => {
    const h = await mount("");
    await typeInto(tid<HTMLTextAreaElement>("md-editor-source")!, "# 새 글");
    expect(h.onChange).toHaveBeenLastCalledWith("# 새 글");
  });
});

// ─────────────────────────────── 모드 전환·기억 ───────────────────────────────

describe("모드 전환·기억", () => {
  it("기본은 서식, 고른 모드는 보는 사람 설정(기본 키 cm-md:editMode)에 JSON 문자열로 남는다", async () => {
    expect(DEFAULT_MODE_STORAGE_KEY).toBe("cm-md:editMode");
    expect(getEditMode()).toBe("wysiwyg");
    await mount("x");
    await click(tid("md-mode-md"));
    expect(JSON.parse(localStorage.getItem("cm-md:editMode")!)).toBe("markdown");
    expect(getEditMode()).toBe("markdown");
    await click(tid("md-mode-wysiwyg"));
    expect(getEditMode()).toBe("wysiwyg");
  });

  it("편집 중 전환해도 내용이 그대로다(서식 → MD → 서식), 나가기가 아니고 새 칸이 초점을 받는다", async () => {
    const h = await mount("", { autoFocus: true });
    await typeRich("## 제목");
    expect(h.value()).toBe("## 제목");
    await click(tid("md-mode-md"));
    expect(tid<HTMLTextAreaElement>("md-editor-source")!.value).toBe("## 제목");
    expect(document.activeElement).toBe(tid("md-editor-source"));
    await typeInto(tid<HTMLTextAreaElement>("md-editor-source")!, "## 제목\n\n- 목록");
    await click(tid("md-mode-wysiwyg"));
    expect(md()).toBe("## 제목\n\n- 목록");
    expect(
      editorOf()
        .getJSON()
        .content?.map((n) => n.type)
    ).toEqual(["heading", "bulletList"]);
    await flush();
    expect(h.onExit).not.toHaveBeenCalled();
  });

  it("같은 화면의 두 편집기(캔버스·패널)가 같은 모드를 본다", async () => {
    function Two() {
      return createElement(
        "div",
        null,
        createElement(
          "div",
          { "data-testid": "a" },
          createElement(MarkdownEditor, {
            value: "x",
            onChange: () => {},
            editable: true,
            toolbar: "floating",
          })
        ),
        createElement(
          "div",
          { "data-testid": "b" },
          createElement(MarkdownEditor, {
            value: "x",
            onChange: () => {},
            editable: true,
            toolbar: "inline",
          })
        )
      );
    }
    await act(async () => root.render(createElement(DmesUiProvider, null, createElement(Two))));
    await flush();
    await click(host.querySelector('[data-testid="a"] [data-testid="md-mode-md"]'));
    expect(host.querySelector('[data-testid="b"] [data-testid="md-editor-source"]')).not.toBeNull();
    expect(
      host
        .querySelector('[data-testid="b"] [data-testid="md-mode-md"]')!
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});

// ─────────────────────────────── 밖에서 바뀐 값·나가기 ───────────────────────────────

describe("밖에서 바뀐 값·나가기", () => {
  it("되돌리기처럼 value 가 밖에서 바뀌면 편집기 내용을 맞추고 onChange 를 다시 부르지 않는다", async () => {
    const h = await mount("처음");
    await h.setValue("# 바뀜");
    expect(md()).toBe("# 바뀜");
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it("빈 인용(>)·빈 목록처럼 안쪽이 빈 글이 밖에서 와도 깨지지 않는다", async () => {
    const h = await mount("x");
    await h.setValue(">");
    expect(editorOf().getJSON().content?.[0]?.type).toBe("blockquote");
    await h.setValue("-");
    expect(editorOf().getJSON().content?.[0]?.type).toBe("bulletList");
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it("되돌린 기호(## )에 글을 이어 써도 저장 글은 제목이 아니다 — 다시 열어도·읽기 모습도 글자", async () => {
    const h = await mount("");
    await typeRich("## ");
    await act(async () => {
      const mac = /Mac|iP(hone|[oa]d)/.test(navigator.platform);
      editorOf().view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          code: "KeyZ",
          ctrlKey: !mac,
          metaKey: mac,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await typeRich("제목");
    expect(parseMarkdown(h.value()).content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ text: "## 제목" }],
    });
    await click(tid("md-mode-md"));
    await click(tid("md-mode-wysiwyg"));
    expect(editorOf().getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ text: "## 제목" }],
    });
    await act(async () => root.render(createElement(MarkdownView, { value: h.value() })));
    expect(host.querySelector("h2")).toBeNull();
    expect(host.textContent).toBe("## 제목");
  });

  it("입력 규칙 직후가 아니면 Ctrl/Cmd+Z 는 보통 되돌리기다", async () => {
    await mount("");
    await typeRich("가");
    await act(async () => {
      const mac = /Mac|iP(hone|[oa]d)/.test(navigator.platform);
      editorOf().view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          code: "KeyZ",
          ctrlKey: !mac,
          metaKey: mac,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(editorOf().getText()).toBe("");
  });

  it("Esc 는 onExit", async () => {
    const h = await mount("x");
    await act(async () => {
      editorOf().view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(h.onExit).toHaveBeenCalledTimes(1);
  });

  it("링크 입력 칸의 Esc 는 입력 칸만 닫는다", async () => {
    const h = await mount("x");
    await click(tid("md-tb-link"));
    await act(async () => {
      tid("md-link-input")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(tid("md-link-input")).toBeNull();
    expect(h.onExit).not.toHaveBeenCalled();
  });

  it("편집기 밖으로 초점이 나가면 onExit, 링크 입력 칸으로 옮기는 것은 나가기가 아니다", async () => {
    const h = await mount("x", { autoFocus: true });
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    await click(tid("md-tb-link"));
    await act(async () => tid<HTMLInputElement>("md-link-input")!.focus());
    await flush();
    expect(h.onExit).not.toHaveBeenCalled();
    await act(async () => outside.focus());
    await flush();
    expect(h.onExit).toHaveBeenCalledTimes(1);
    outside.remove();
  });
});

// ─────────────────────────────── 읽기 전용 모습 ───────────────────────────────

describe("읽기 전용 모습", () => {
  it("editable=false 면 모드와 상관없이 서식이 적용된 모습이고 고칠 수 없다", async () => {
    for (const mode of ["wysiwyg", "markdown"] as const) {
      await act(async () => setEditMode(mode));
      await act(async () =>
        root.render(
          createElement(
            DmesUiProvider,
            null,
            createElement(MarkdownEditor, {
              value: "# 제목\n**굵게**\n- [x] 끝",
              onChange: () => {},
              editable: false,
              toolbar: "floating",
            })
          )
        )
      );
      await flush();
      expect(host.querySelector("h1")?.textContent).toBe("제목");
      expect(host.querySelector("strong")?.textContent).toBe("굵게");
      expect(host.querySelector("textarea")).toBeNull();
      expect(host.querySelector("[contenteditable='true']")).toBeNull();
      expect(tid("md-tb-bold")).toBeNull();
      const box = host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
      expect(box.checked).toBe(true);
      expect(box.disabled).toBe(true);
    }
  });

  it("링크는 새 탭(noopener noreferrer), javascript: 링크는 링크로 그리지 않는다", async () => {
    await act(async () =>
      root.render(
        createElement(MarkdownView, {
          value: "[좋은](https://ex.com) [나쁜](javascript:alert(1))",
        })
      )
    );
    const links = Array.from(host.querySelectorAll("a"));
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://ex.com");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(host.textContent).toContain("나쁜");
  });

  it("편집 중에도 javascript: 링크는 a[href] 로 그리지 않는다", async () => {
    await mount("[나쁜](javascript:alert(1)) [좋은](https://ex.com)");
    expect(host.querySelector('.ProseMirror a[href^="javascript"]')).toBeNull();
    expect(host.querySelector('.ProseMirror a[href="https://ex.com"]')).not.toBeNull();
  });

  it("링크 누름은 위(메모 고르기·편집 열기)로 올라가지 않는다", async () => {
    const parentClick = vi.fn();
    await act(async () =>
      root.render(
        createElement(
          "div",
          { onClick: parentClick },
          createElement(MarkdownView, { value: "[좋은](https://ex.com)" })
        )
      )
    );
    const a = host.querySelector("a")!;
    a.addEventListener("click", (e) => e.preventDefault());
    await act(async () => a.click());
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("목록·인용·번호 시작·줄바꿈을 그린다, HTML 은 글자로", async () => {
    await act(async () =>
      root.render(
        createElement(MarkdownView, {
          value: "3. 셋\n4. 넷\n\n> 인용\n\n줄1\n줄2 <b>x</b>",
        })
      )
    );
    expect(host.querySelector("ol")?.getAttribute("start")).toBe("3");
    expect(host.querySelectorAll("ol > li")).toHaveLength(2);
    expect(host.querySelector("blockquote")?.textContent).toBe("인용");
    expect(host.querySelector("br")).not.toBeNull();
    expect(host.querySelector("b")).toBeNull();
    expect(host.textContent).toContain("<b>x</b>");
  });
});

// ─────────────────────────────── 스타일 ───────────────────────────────

/** 주석을 뺀 스타일 규칙(주석 안 클래스 이름을 규칙으로 잘못 읽지 않게). */
const cssRules = () => MARKDOWN_EDITOR_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("스타일", () => {
  it("의미 토큰만 쓰고(색 값 직접 사용 없음) 한 변 색 바가 없고, 화면 전용 클래스·변수가 없다", () => {
    expect(MARKDOWN_EDITOR_CSS).toContain(".cm-md");
    expect(MARKDOWN_EDITOR_CSS).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|hsl\(/);
    expect(MARKDOWN_EDITOR_CSS).not.toMatch(/border-(left|top|right|bottom)\s*:\s*[2-9]px/);
    expect(MARKDOWN_EDITOR_CSS).not.toMatch(/rsf-|--rsf-|react-flow|nodrag/);
  });

  it("편집기가 여럿이어도 스타일은 문서 head 에 한 번만 들어간다(<style href precedence>)", async () => {
    await act(async () =>
      root.render(
        createElement(
          "div",
          null,
          createElement(MarkdownView, { value: "a" }),
          createElement(MarkdownView, { value: "b" })
        )
      )
    );
    await flush();
    const styles = Array.from(document.querySelectorAll("style")).filter((el) =>
      (el.textContent ?? "").includes(".cm-md-view p + p")
    );
    expect(styles).toHaveLength(1);
    expect(styles[0].getAttribute("data-href") ?? styles[0].getAttribute("href")).toContain(
      MARKDOWN_EDITOR_STYLE_HREF
    );
    expect(host.querySelector("style")).toBeNull();
  });

  it("문단 사이 간격은 줄 간격 수준(0.25em 이하)이고 읽기 모습·서식 편집 칸이 같은 규칙이다", () => {
    expect(parseFloat(PARAGRAPH_GAP)).toBeGreaterThan(0);
    expect(parseFloat(PARAGRAPH_GAP)).toBeLessThanOrEqual(0.25);
    expect(PARAGRAPH_GAP).toMatch(/em$/);
    const rule = /\.cm-md-view p \+ p, \.cm-md-rich p \+ p \{\s*margin-top:\s*([^;]+);/.exec(
      MARKDOWN_EDITOR_CSS
    );
    expect(rule?.[1]).toBe(PARAGRAPH_GAP);
    // 다른 문단 위 간격 규칙(빈 문단만 따로 등)이 없다 — 두 모습에서 빈 줄 높이가 같다.
    const pMargins = cssRules().match(/p(\.[\w-]+)?\s*\{[^}]*margin-top/g) ?? [];
    expect(pMargins).toHaveLength(1);
  });
});

// ─────────────────────────────── 검토 고침(2026-10-02) ───────────────────────────────

/** 문서의 맨 끝으로 커서를 옮긴다. */
async function caretToEnd() {
  await act(async () => {
    editorOf().commands.focus("end");
  });
}

describe("검토 고침 — 링크 정의 모양 줄([TODO]: 내일)도 글로 남는다", () => {
  const paraText = (src: string) =>
    (parseMarkdown(src).content ?? []).map((b) =>
      (b.content ?? []).map((c) => (c.type === "hardBreak" ? "\n" : c.text)).join("")
    );
  it.each([
    ["[TODO]: 내일", ["[TODO]: 내일"]],
    ["[주의]: 배포전확인", ["[주의]: 배포전확인"]],
    ["본문\n\n[참고]: 위키페이지", ["본문", "[참고]: 위키페이지"]],
    ["[참고]: https://wiki/x", ["[참고]: https://wiki/x"]],
    ["[TODO]: 내일\n본문", ["[TODO]: 내일\n본문"]],
  ])("%j — 읽기에 남고, 다시 써서 읽어도 같다", (src, paras) => {
    expect(paraText(src)).toEqual(paras);
    expect(parseMarkdown(roundTrip(src))).toEqual(parseMarkdown(src));
  });
  it("읽기 모습에 그 줄이 보인다", async () => {
    await act(async () =>
      root.render(createElement(MarkdownView, { value: "[TODO]: 내일\n본문" }))
    );
    expect(tid("md-view")?.textContent).toContain("[TODO]: 내일");
  });
  it("서식 모드에서 한 글자 고쳐도 그 줄이 지워지지 않는다", async () => {
    const h = await mount("[TODO]: 내일\n본문", { autoFocus: true });
    await caretToEnd();
    await typeRich("!");
    const last = h.onChange.mock.calls.at(-1)?.[0] as string;
    expect(paraText(last)).toEqual(["[TODO]: 내일\n본문!"]);
  });
});

describe("검토 고침 — 빈 줄 수가 그대로 남는다", () => {
  it.each([
    "a\n\nb",
    "a\n\n\nb",
    "a\n\n\n\nb",
    "a\n\n\n\n\nb",
    "a\n",
    "a\n\n",
    "a\n\n\n",
    "\n\na",
    "\n\n\na",
    "\n",
    "\n\n",
    "- a\n- b\n\n\nc",
    "# 제목\n\n\n본문",
    "> 인용\n\n\n본문",
    "a\n\n\n- b",
  ])("%j", (src) => {
    expect(roundTrip(src)).toBe(src);
  });
  it("빈 문단이 여럿이어도 &nbsp; 를 쓰지 않는다", () => {
    const e = { type: "paragraph" };
    const p = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
    expect(serializeMarkdown({ type: "doc", content: [p("a"), e, e, e, p("b")] })).toBe(
      "a\n\n\n\n\nb"
    );
    expect(serializeMarkdown({ type: "doc", content: [p("a"), e, e] })).toBe("a\n\n");
    expect(roundTrip("a\n\n\n\n")).not.toContain("&nbsp;");
  });
  it("읽기 모습 — 빈 문단은 cm-md-blank(<br> 하나, 한 줄 높이)로 그리고 다른 문단과 같은 간격을 둔다", async () => {
    await act(async () => root.render(createElement(MarkdownView, { value: "a\n\n\nb" })));
    const ps = Array.from(host.querySelectorAll("[data-testid='md-view'] > p"));
    expect(ps.map((p) => p.className)).toEqual(["", "cm-md-blank", ""]);
    expect(ps[1].innerHTML).toBe("<br>");
    expect(cssRules()).not.toMatch(/\.cm-md-blank[^{]*\{[^}]*margin/);
  });
  it("열기만 하면 onChange 가 없다", async () => {
    const h = await mount("첫 문단\n\n\n둘째 문단", { autoFocus: true });
    expect(h.onChange).not.toHaveBeenCalled();
  });
  it("서식 모드에서 고쳐도 빈 줄 둘이 남는다", async () => {
    const h = await mount("첫 문단\n\n\n둘째 문단", { autoFocus: true });
    await caretToEnd();
    await typeRich("!");
    expect(h.onChange).toHaveBeenLastCalledWith("첫 문단\n\n\n둘째 문단!");
  });
});

describe("검토 고침 — 줄 앞 공백 4칸·탭은 코드 블록이 되지 않는다", () => {
  it.each(["위\n\n    들여쓴 글", "위\n\n\t탭 글", "    첫 줄부터 들여씀"])(
    "%j — 문단 글로 남는다",
    (src) => {
      const doc = parseMarkdown(src);
      expect(JSON.stringify(doc)).not.toContain("codeBlock");
      expect(roundTrip(src)).toBe(src);
    }
  );
  it("서식 모드에서 앞에 공백 4칸을 친 문단도 다시 열면 같은 글이다", () => {
    const p = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
    const md1 = serializeMarkdown({ type: "doc", content: [p("위"), p("    들여쓴 글")] });
    expect(parseMarkdown(md1).content?.[1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "    들여쓴 글" }],
    });
  });
});

describe("검토 고침 — 도구 막대 단추에 초점이 있어도 키가 화면 단축키로 가지 않는다", () => {
  it("단추 위 Delete·Backspace·Ctrl/Cmd+Z 는 편집기 밖(document)으로 올라가지 않는다", async () => {
    await mount("메모");
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    try {
      const btn = tid("md-tb-bold")!;
      btn.focus();
      for (const init of [
        { key: "Delete" },
        { key: "Backspace" },
        { key: "z", ctrlKey: true },
        { key: "z", metaKey: true },
      ]) {
        await act(async () => {
          btn.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
          );
        });
      }
      expect(seen).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", seen);
    }
  });
});

describe("검토 고침 — 서식 모드 인용 단추가 목록에도 걸린다", () => {
  it.each([
    ["- a\n- b", "> - a\n> - b"],
    ["1. a\n2. b", "> 1. a\n> 2. b"],
    ["- [ ] a", "> - [ ] a"],
  ])("%j → %j → 다시 누르면 처음대로", async (src, quoted) => {
    await mount(src);
    await act(async () => {
      editorOf().commands.setTextSelection(3);
    });
    await click(tid("md-tb-blockquote"));
    expect(md()).toBe(quoted);
    expect(tid("md-tb-blockquote")!.getAttribute("aria-pressed")).toBe("true");
    await click(tid("md-tb-blockquote"));
    expect(md()).toBe(src);
  });
});

describe("검토 고침 — MD 모드 링크 글의 대괄호", () => {
  it("고른 글 전체가 한 링크(https)다", () => {
    const doc = parseMarkdown("[a\\](javascript:alert(1)) \\[b](https://x.com)");
    const texts = doc.content?.[0]?.content ?? [];
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({
      text: "a](javascript:alert(1)) [b",
      marks: [{ type: "link", attrs: { href: "https://x.com" } }],
    });
  });
});

// ─────────────────────────────── 화면이 넘기는 값(shared 이관, 2026-10-02) ───────────────────────────────

describe("화면이 넘기는 값 — 저장 키·클래스·문구", () => {
  /** 같은 키 또는 다른 키를 쓰는 두 편집기를 그린다. */
  async function drawTwo(keyA?: string, keyB?: string) {
    function Two() {
      return createElement(
        "div",
        null,
        createElement(
          "div",
          { "data-testid": "a" },
          createElement(MarkdownEditor, {
            value: "x",
            onChange: () => {},
            editable: true,
            modeStorageKey: keyA,
          })
        ),
        createElement(
          "div",
          { "data-testid": "b" },
          createElement(MarkdownEditor, {
            value: "x",
            onChange: () => {},
            editable: true,
            modeStorageKey: keyB,
          })
        )
      );
    }
    await act(async () => root.render(createElement(DmesUiProvider, null, createElement(Two))));
    await flush();
  }
  const sourceIn = (box: string) =>
    host.querySelector(`[data-testid="${box}"] [data-testid="md-editor-source"]`);

  it("modeStorageKey 로 받은 키에 기억하고, 그 키에 이미 있는 값(JSON 문자열)으로 연다", async () => {
    localStorage.setItem("rsf:noteEditMode", JSON.stringify("markdown"));
    await mount("x", { modeStorageKey: "rsf:noteEditMode" });
    expect(tid("md-editor")!.getAttribute("data-mode")).toBe("markdown");
    expect(tid("md-editor-source")).not.toBeNull();
    await click(tid("md-mode-wysiwyg"));
    expect(JSON.parse(localStorage.getItem("rsf:noteEditMode")!)).toBe("wysiwyg");
    expect(localStorage.getItem(DEFAULT_MODE_STORAGE_KEY)).toBeNull();
  });

  it("키가 다른 편집기끼리는 따로 바뀐다", async () => {
    await drawTwo("k:one", "k:two");
    await click(host.querySelector('[data-testid="a"] [data-testid="md-mode-md"]'));
    expect(sourceIn("a")).not.toBeNull();
    expect(sourceIn("b")).toBeNull();
  });

  it("다른 탭에서 같은 키를 바꾸면(storage 이벤트) 따라간다", async () => {
    await drawTwo("k:tab", "k:tab");
    expect(sourceIn("a")).toBeNull();
    localStorage.setItem("k:tab", JSON.stringify("markdown"));
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "k:tab" }));
    });
    await flush();
    expect(sourceIn("a")).not.toBeNull();
    expect(sourceIn("b")).not.toBeNull();
  });

  it("저장소가 던져도(사설 창 등) 모드 전환이 이 탭 안에서 동작한다", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const key = "k:blocked";
    try {
      await drawTwo(key, key);
      await click(host.querySelector('[data-testid="a"] [data-testid="md-mode-md"]'));
      expect(sourceIn("a")).not.toBeNull();
      expect(sourceIn("b")).not.toBeNull();
      expect(getEditMode(key)).toBe("markdown");
    } finally {
      get.mockRestore();
      set.mockRestore();
      setEditMode("wysiwyg", key);
    }
  });

  it("editingClassName 은 편집 중에만 뿌리에 붙는다, 도구 막대 자리(toolbar)는 클래스로 나뉜다", async () => {
    await mount("x", { editingClassName: "nodrag nowheel", toolbar: "floating" });
    const ed = tid("md-editor")!;
    for (const c of ["cm-md", "cm-md-floating", "cm-md-editing", "nodrag", "nowheel"])
      expect(ed.classList.contains(c), c).toBe(true);
    await act(async () =>
      root.render(
        createElement(MarkdownEditor, {
          value: "x",
          onChange: () => {},
          editable: false,
          editingClassName: "nodrag nowheel",
        })
      )
    );
    const view = tid("md-editor")!;
    expect(view.classList.contains("nodrag")).toBe(false);
    expect(view.classList.contains("cm-md-inline")).toBe(true);
  });

  it("linkClassName 은 읽기 모습 링크에만 붙는다(기본은 클래스 없음)", async () => {
    await act(async () =>
      root.render(
        createElement(MarkdownView, {
          value: "[좋은](https://ex.com)",
          linkClassName: "nodrag nopan",
        })
      )
    );
    expect(host.querySelector("a")!.className).toBe("nodrag nopan");
    await act(async () =>
      root.render(createElement(MarkdownView, { value: "[좋은](https://ex.com)" }))
    );
    expect(host.querySelector("a")!.hasAttribute("class")).toBe(false);
  });

  it("testId·ariaLabel 기본값과 넘긴 값", async () => {
    await mount("x");
    expect(tid("md-editor")).not.toBeNull();
    expect(tid("md-editor-rich")!.getAttribute("aria-label")).toBe("메모");
    expect(tid("md-toolbar")!.getAttribute("aria-label")).toBe("메모 서식");
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount("x", { testId: "desc-editor", ariaLabel: "설명" });
    expect(tid("desc-editor")).not.toBeNull();
    expect(tid("md-editor-rich")!.getAttribute("aria-label")).toBe("설명");
    expect(tid("md-toolbar")!.getAttribute("aria-label")).toBe("설명 서식");
  });
});

describe("MarkdownField — 폼·패널 칸(편집 가능하면 처음부터 편집기)", () => {
  async function drawField(props: Partial<Parameters<typeof MarkdownField>[0]> = {}) {
    const onChange = vi.fn();
    function Wrap() {
      const [v, setV] = useState(props.value ?? "");
      return createElement(MarkdownField, {
        editable: true,
        ...props,
        value: v,
        onChange: (md: string) => {
          onChange(md);
          setV(md);
        },
      });
    }
    await act(async () => root.render(createElement(DmesUiProvider, null, createElement(Wrap))));
    await flush();
    await flush();
    return onChange;
  }

  it("고칠 수 없으면 읽기 모습만(빈 글은 emptyText), 편집기·도구 막대가 없다", async () => {
    await drawField({ editable: false });
    expect(tid("md-field-view")!.textContent).toBe("메모 없음");
    expect(tid("md-editor")).toBeNull();
    expect(tid("md-toolbar")).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    await drawField({ editable: false, value: "**굵게**", emptyText: "설명 없음" });
    expect(tid("md-field-view")!.querySelector("strong")?.textContent).toBe("굵게");
  });

  it("고칠 수 있으면 누르지 않아도 도구 막대와 편집 칸이 보이고, 열기만 해서는 onChange·초점 이동이 없다", async () => {
    const before = document.activeElement;
    const onChange = await drawField({ value: "# 제목\n- 하나" });
    const ed = tid("md-editor")!;
    expect(ed.getAttribute("data-editing")).toBe("true");
    expect(ed.classList.contains("cm-md-inline")).toBe(true);
    expect(tid("md-toolbar")).not.toBeNull();
    expect(tid("md-editor-rich")).not.toBeNull();
    expect(tid("md-field-view")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(ed.contains(document.activeElement)).toBe(false);
    expect(document.activeElement).toBe(before);
  });

  it("초점이 빠지거나 Esc 를 눌러도 도구 막대를 숨기지 않는다", async () => {
    localStorage.setItem("k:field", JSON.stringify("markdown"));
    const onChange = await drawField({ value: "메모", modeStorageKey: "k:field" });
    const ta = tid<HTMLTextAreaElement>("md-editor-source")!;
    await act(async () => ta.focus());
    await typeInto(ta, "새 글");
    expect(onChange).toHaveBeenLastCalledWith("새 글");
    await act(async () => {
      ta.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    await flush();
    expect(tid("md-toolbar")).not.toBeNull();
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    try {
      await act(async () => outside.focus());
      await flush();
      expect(tid("md-toolbar")).not.toBeNull();
      expect(tid<HTMLTextAreaElement>("md-editor-source")!.value).toBe("새 글");
    } finally {
      outside.remove();
    }
  });

  it("fill 이면 칸·편집기·읽기 상자에 cm-md-fill 이 붙는다(부모 높이 채우기)", async () => {
    await drawField({ fill: true });
    expect(host.querySelector(".cm-md-field")!.classList.contains("cm-md-fill")).toBe(true);
    expect(tid("md-editor")!.classList.contains("cm-md-fill")).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(host);
    await drawField({ fill: true, editable: false });
    expect(tid("md-field-view")!.classList.contains("cm-md-fill")).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(host);
    await drawField({});
    expect(tid("md-editor")!.classList.contains("cm-md-fill")).toBe(false);
  });
});

describe("스타일 — 목록 기호·높이 채우기", () => {
  it("글머리(disc·중첩 circle·square)·번호(decimal)를 명시하고 들여쓴다 — 포털 리셋(list-style: none)을 이긴다. 읽기 모습·서식 편집 칸 모두", () => {
    const css = cssRules();
    expect(css).toMatch(/\.cm-md-view ul, \.cm-md-rich ul \{\s*list-style: disc/);
    expect(css).toMatch(/\.cm-md-view ul ul, \.cm-md-rich ul ul \{\s*list-style-type: circle/);
    expect(css).toMatch(
      /\.cm-md-view ul ul ul, \.cm-md-rich ul ul ul \{\s*list-style-type: square/
    );
    expect(css).toMatch(/\.cm-md-view ol, \.cm-md-rich ol \{\s*list-style: decimal/);
    expect(css).toMatch(
      /\.cm-md-view ul, \.cm-md-view ol, \.cm-md-rich ul, \.cm-md-rich ol \{[^}]*padding-left: 1\.4em/
    );
    expect(css).toMatch(/\.cm-md-view li, \.cm-md-rich li \{[^}]*display: list-item/);
    // @layer 안에 두지 않는다 — 레이어 밖 규칙이 Tailwind preflight(layer base)보다 앞선다.
    expect(MARKDOWN_EDITOR_CSS).not.toContain("@layer");
  });

  it("할 일 목록은 기호 없이 체크박스만 — 할 일 규칙이 글머리 규칙보다 구체적이다", () => {
    const css = cssRules();
    expect(css).toMatch(
      /\.cm-md-view ul\[data-type="taskList"\], \.cm-md-rich ul\[data-type="taskList"\] \{\s*list-style: none/
    );
    expect(css).toMatch(/ul\[data-type="taskList"\] > li \{[^}]*list-style: none/);
  });

  it("읽기 모습이 글머리·번호·할 일 목록을 ul·ol·data-type=taskList 로 그린다", async () => {
    await act(async () =>
      root.render(createElement(MarkdownView, { value: "- 가\n  - 나\n\n1. 하나\n\n- [ ] 할 일" }))
    );
    expect(host.querySelector("ul:not([data-type]) > li > ul")).not.toBeNull();
    expect(host.querySelector("ol > li")?.textContent).toBe("하나");
    expect(host.querySelector('ul[data-type="taskList"] input[type=checkbox]')).not.toBeNull();
  });

  it("fill 은 세로 flex 로 남은 높이를 채우고 편집 칸(서식·MD)이 늘어나며 칸 안에서 스크롤한다", () => {
    const css = cssRules();
    expect(css).toMatch(
      /\.cm-md-fill \{[^}]*flex: 1 1 0;[^}]*min-height: 0;[^}]*flex-direction: column/
    );
    expect(css).toMatch(/\.cm-md-fill \.cm-md-body, \.cm-md-fill \.cm-md-source \{\s*flex: 1 1 0/);
    expect(css).toMatch(/\.cm-md-body \{[^}]*overflow: auto/);
  });
});
