/**
 * HTML 편집기(Tiptap) 확장과 HTML 쓰기.
 *
 * - StarterKit 한 벌(밑줄·링크·코드·코드 블록·구분선·되돌리기 포함)로 충분하다 — 새 패키지가 없다. 표 확장은 넣지 않는다(원문 모드로 다룬다).
 * - 제목은 h1~h6 을 모두 스키마에 둔다(도구 막대는 H2·H3 만). 수준을 줄이면 이미 있는 `<h1>` 이 열자마자 문단이 된다.
 * - 끝 빈 문단 자동 추가(trailingNode)는 끈다 — 열기만 해도 글이 바뀐다.
 * - 링크는 http/https 만, 누르면 열지 않는다(편집 중). 읽기 모습(NoticeBodyView)은 새 탭으로 연다.
 * - 빈 줄 모양: 읽기 모습은 `p { margin: 0 }` 라 빈 `<p></p>` 의 높이가 0 이다. 그래서 빈 문단·줄바꿈으로 끝나는 문단은 `<br>` 을 하나 더 써서
 *   (`<p><br></p>`, `<p>a<br><br></p>`) 편집 칸에서 보이던 줄 수를 읽기 모습에서도 지킨다. 읽을 때는 블록 끝 `<br>` 을 버려 같은 문서로 돌아온다.
 */
import StarterKit from "@tiptap/starter-kit";
import HardBreak from "@tiptap/extension-hard-break";
import { Fragment } from "@tiptap/pm/model";
import { getHTMLFromFragment, type AnyExtension, type Editor } from "@tiptap/react";

import { isSafeHref } from "../markdown-editor/md-ops";

/** 끝 `<br>` 을 버리는 블록 — 브라우저가 이 블록 끝 `<br>` 로 줄을 더 그리지 않는다. */
const BREAK_PARENTS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "DIV"]);
/** 끝 `<br>` 과 블록 사이에 끼어도 되는 글자 서식 태그(`<p><strong>a<br></strong></p>`). */
const INLINE_PARENTS = new Set([
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "CODE",
  "A",
  "SPAN",
]);

/** 뒤에 요소나 (공백 아닌) 글자가 없는가. */
function isLastMeaningful(node: Node): boolean {
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (next.nodeType === 1) return false;
    if (next.nodeType === 3 && (next.nodeValue ?? "").trim() !== "") return false;
  }
  return true;
}

/** 블록의 마지막 의미 있는 내용인 `<br>` 인가 — 글자 서식 태그 안에 있어도 그 태그들이 블록 끝이면 끝이다. */
function isTrailingBreak(el: HTMLElement): boolean {
  let node: HTMLElement = el;
  for (;;) {
    if (!isLastMeaningful(node)) return false;
    const parent = node.parentElement;
    if (!parent) return false;
    if (BREAK_PARENTS.has(parent.tagName)) return true;
    if (!INLINE_PARENTS.has(parent.tagName)) return false;
    node = parent;
  }
}

/** 블록 끝 `<br>` 은 줄바꿈으로 읽지 않는다(`<p><br></p>` → 빈 문단). */
const BlockAwareHardBreak = HardBreak.extend({
  parseHTML() {
    return [
      {
        tag: "br",
        getAttrs: (el) => (isTrailingBreak(el as HTMLElement) ? false : null),
      },
    ];
  },
});

/**
 * StarterKit 안의 Link 확장을 고쳐 target·rel·class 를 불러올 때·붙여 넣을 때 버리고 항상 고정값으로 쓴다(심층 방어).
 * Link 는 별도 의존성이 아니라 StarterKit 이 들고 있어 직접 extend 하지 못하므로, 하위 확장 목록에서 골라 바꾼다.
 */
const SafeStarterKit = StarterKit.extend({
  addExtensions() {
    const parent = this.parent?.() ?? [];
    return parent.map((ext) =>
      ext.name === "link"
        ? ext.extend({
            addAttributes() {
              const self = this as unknown as { parent?: () => Record<string, Record<string, unknown>> };
              const base = self.parent?.() ?? {};
              return {
                ...base,
                target: { default: "_blank", parseHTML: () => "_blank" },
                rel: { default: "noopener noreferrer", parseHTML: () => "noopener noreferrer" },
                class: { default: null, parseHTML: () => null },
              };
            },
          })
        : ext
    );
  },
});

/** 편집기 확장(편집기마다 새로 만든다). */
export function htmlExtensions(): AnyExtension[] {
  return [
    SafeStarterKit.configure({
      trailingNode: false,
      hardBreak: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        protocols: [],
        defaultProtocol: "https",
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      },
    }),
    BlockAwareHardBreak,
  ];
}

/**
 * 빈 글줄 블록(`<p></p>`)·줄바꿈으로 끝나는 블록(`…<br></p>`, `…<br></strong></p>`)에 `<br>` 하나를 더한다 — 읽기 모습에서 줄이 사라지지 않게.
 * 쓴 HTML 은 Tiptap 이 만든 것이라 태그만 마크업이다(글자 속 `<` 는 `&lt;`) — 정규식으로 다뤄도 된다.
 */
function keepLines(html: string): string {
  // 순서가 중요하다 — 빈 블록에 넣은 <br> 을 다시 「줄바꿈으로 끝나는 블록」으로 보지 않게 끝 <br> 부터 바꾼다.
  return html
    .replace(/<br>((?:<\/[a-z]+>)*)<\/(p|h[1-6])>/g, "<br><br>$1</$2>")
    .replace(/<(p|h[1-6])><\/\1>/g, "<$1><br></$1>");
}

/**
 * 편집기 문서를 HTML 로 — 맨 위 블록마다 줄을 나눈다(원문 모드에서 읽기 쉽게). 글자도 구분선도 없으면 빈 값("")이다
 * (빈 문단만 남은 편집기가 `<p></p>` 를 내면 "HTML 인데 알려진 태그가 없는 값" 같은 애매한 값이 생긴다).
 */
export function serializeHtml(editor: Editor): string {
  const { doc, schema } = editor.state;
  let meaningful = false;
  doc.descendants((node) => {
    if (meaningful) return false;
    if ((node.isText && (node.text ?? "").trim() !== "") || node.type.name === "horizontalRule")
      meaningful = true;
    return !meaningful;
  });
  if (!meaningful) return "";
  const blocks: string[] = [];
  doc.forEach((node) => blocks.push(keepLines(getHTMLFromFragment(Fragment.from(node), schema))));
  return blocks.join("\n");
}
