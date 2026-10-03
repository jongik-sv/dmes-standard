/**
 * 글 ↔ HTML 변환과 서식 편집 호환 검사 — 도메인과 무관한 도우미다(화면이 「글 | HTML」 형식을 바꿀 때도 쓴다).
 *
 * - 브라우저 DOM(`<template>`)으로 HTML 을 읽는다. template 안은 스크립트가 돌지 않고 그림도 내려받지 않는다.
 *   DOM 이 없는 환경(서버 렌더)에서는 htmlToText 가 태그만 지운 글을, unsupportedRichTags 가 빈 목록을 돌려준다.
 * - 빈 줄은 `<p><br></p>`(EMPTY_PARAGRAPH)로 쓴다. 빈 `<p></p>` 는 읽기 모습(NoticeBodyView)에서 높이가 0 이라 빈 줄이 사라진다.
 *   서식 편집기도 같은 모양으로 쓰고 읽는다(extensions.ts).
 */

/** 빈 줄 하나(빈 문단). */
export const EMPTY_PARAGRAPH = "<p><br></p>";

/**
 * 서식 편집기(Tiptap 스키마)가 지키는 태그. 굵게·기울임·밑줄·취소선(s·del·strike)·코드·코드 블록(pre)·제목(h1~h6)·목록·인용·링크·구분선·줄바꿈.
 * div·span 은 감싸개라 서식이 없다 — 안쪽 글은 문단으로 남으므로 지키는 쪽으로 본다.
 * 이 밖의 태그(table 계열·img·sub·sup·dl 등)는 서식 모드로 바꾸면 사라진다.
 */
const RICH_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "hr",
  "div",
  "span",
]);

/** 앞뒤에서 줄을 나누는 블록 태그(htmlToText). */
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "tr",
  "ul",
]);

/** 내용을 글자로 남기지 않는 태그. */
const SKIP_TAGS = new Set(["script", "style", "template", "noscript", "title", "head"]);

/** HTML 의 흰 공백(줄바꿈 포함). &nbsp;(U+00A0)는 넣지 않는다 — 들여쓰기를 지킨다. */
const HTML_SPACE = /[ \t\n\r\f]+/g;
const EDGE_SPACE = /^[ \t\n\r\f]+|[ \t\n\r\f]+$/g;
const NBSP = / /g;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => ESCAPES[c] ?? c);
}

/** HTML 조각을 DOM 으로 읽는다(template — 스크립트·그림이 돌지 않는다). DOM 이 없으면 null. */
function parseFragment(html: string): DocumentFragment | null {
  if (typeof document === "undefined") return null;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content;
}

const NBSP_ENTITY = "&nbsp;";

/** 줄 하나의 공백을 지키며 이스케이프한다(textToHtml). */
function keepSpaces(line: string): string {
  const spaced = line.replace(/\t/g, "    ");
  let out = "";
  let last = 0;
  for (const m of spaced.matchAll(/ +/g)) {
    const at = m.index ?? 0;
    const edge = at === 0 || at + m[0].length === spaced.length;
    out += escapeHtml(spaced.slice(last, at));
    out += edge ? NBSP_ENTITY.repeat(m[0].length) : ` ${NBSP_ENTITY.repeat(m[0].length - 1)}`;
    last = at + m[0].length;
  }
  return out + escapeHtml(spaced.slice(last));
}

/**
 * 일반 글을 HTML 로 — 줄마다 `<p>` 로 감싸고 `&`·`<`·`>` 를 이스케이프한다.
 * 가운데 빈 줄은 빈 문단(`<p><br></p>`), 끝 빈 줄은 버린다.
 * 줄 안 공백은 지킨다: 탭은 공백 4칸으로 바꾸고(탭 글자는 HTML 에서 공백 하나로 줄어든다), 연속 공백은 줄 앞·뒤면 모두,
 * 줄 안이면 첫 칸만 일반 공백(줄바꿈 자리를 남긴다)으로 두고 나머지를 `&nbsp;` 로 쓴다.
 * 되돌리면(htmlToText) 탭은 공백 4칸이 되고 나머지는 원래 글이다.
 * 빈 글·공백만 있는 글은 빈 값("")이다. 블록 사이는 줄바꿈으로 잇는다(원문 모드에서 읽기 쉽게).
 */
export function textToHtml(text: string): string {
  const lines = (text ?? "").split(/\r\n|\r|\n/);
  while (lines.length > 0 && !lines[lines.length - 1]!.trim()) lines.pop();
  if (lines.length === 0) return "";
  return lines
    .map((line) => {
      if (!line.trim()) return EMPTY_PARAGRAPH;
      return `<p>${keepSpaces(line)}</p>`;
    })
    .join("\n");
}

/**
 * HTML 을 일반 글로 — 글자만 남긴다(태그·속성은 버린다). 블록(문단·제목·목록 항목·표 행 등) 사이는 줄바꿈, `<br>` 도 줄바꿈이다.
 * 블록 끝 `<br>` 은 줄을 더하지 않고(브라우저가 그리는 모습과 같다), `<p><br></p>` 는 빈 줄이다. 표 칸은 탭으로 잇는다.
 * 태그 사이 공백은 HTML 처럼 하나로 줄이고, `pre` 안은 그대로 둔다. 실체(`&lt;`)는 글자(`<`)로 풀린다.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  const root = parseFragment(html);
  if (!root) return html.replace(/<[^>]*>/g, "");

  const lines: string[] = [];
  let line = "";
  let raw = false; // 이 줄이 pre 안 글이다(공백을 다듬지 않는다)
  let pre = 0;

  const finish = (s: string) => (raw ? s : s.replace(EDGE_SPACE, "")).replace(NBSP, " ");
  /** 줄을 끝낸다. force 면 빈 줄도 남긴다(<br>). */
  const endLine = (force: boolean) => {
    const done = finish(line);
    if (force || done !== "") lines.push(done);
    line = "";
    raw = false;
  };
  const addText = (text: string) => {
    if (pre === 0) {
      line += text.replace(HTML_SPACE, " ");
      return;
    }
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) endLine(true);
      line += part;
      raw = true;
    });
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      addText(node.nodeValue ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === "br") {
      endLine(true);
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if ((tag === "td" || tag === "th") && line.replace(EDGE_SPACE, "") !== "") line += "\t";
    if (block) endLine(false);
    if (tag === "pre") pre++;
    node.childNodes.forEach(walk);
    if (tag === "pre") pre--;
    if (block) endLine(false);
  };

  root.childNodes.forEach(walk);
  endLine(false);
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/**
 * 서식 편집기가 지키지 못하는 태그 이름(소문자, 처음 나온 순서로 한 번씩). 빈 목록이면 서식 모드로 열어도 서식이 사라지지 않는다.
 * 표·그림처럼 스키마 밖 태그가 있으면 HtmlEditor 는 원문 모드로 열고, 서식 모드로 바꿀 때 확인을 받는다.
 */
export function unsupportedRichTags(html: string): string[] {
  if (!html || !html.includes("<")) return [];
  const root = parseFragment(html);
  if (!root) return [];
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    if (!RICH_TAGS.has(tag) && !out.includes(tag)) out.push(tag);
  }
  return out;
}
