/**
 * 마크다운 읽기·쓰기 — 저장 형식은 마크다운 문자열이다. 서식 편집기(Tiptap)와 읽기 전용 모습이 같은 변환을 쓴다.
 *
 * - 줄바꿈 하나도 줄바꿈이다(marked `breaks`). 예전 일반 글이 줄이 합쳐지지 않고 그대로 열린다. 쓰기도 줄바꿈 하나로 돌려놓는다
 *   (Tiptap 기본은 `"  \n"` — 저장 글 끝에 공백 둘이 붙는다).
 * - HTML 은 받지 않는다. 마크다운 안 `<b>` 같은 태그는 글자 그대로다(html·tag 토큰을 만들지 않는 marked 토크나이저).
 * - 쓰기에서 `<`·`&` 를 `&lt;`·`&amp;` 로 바꾸지 않는다 — HTML 로 읽지 않으니 바꿀 까닭이 없고, MD 모드 원문에 `&lt;` 가 보이면 안 된다.
 *   글자 그대로의 `&lt;` 는 `\&lt;` 로 써서 다시 읽어도 `&lt;` 다.
 *   마크다운 기호(`*`·`_`·`[` 등)는 Tiptap 그대로 `\` 를 붙여 글자로 남긴다.
 * - marked 는 이 편집기 전용 인스턴스를 쓴다(전역 `marked` 설정을 바꾸지 않는다).
 * - GFM 표는 읽기 전용 경로(`parseMarkdownView`·`viewMarkdownManager`, MarkdownView 가 쓴다)만 table 노드로 읽는다. 편집기·MarkdownField 파서
 *   (`parseMarkdown`·`createMarkdownManager()` 기본)는 표 토큰을 만들지 않아 표가 글자로 남고 저장 때 그대로 돌아간다.
 * - 빈 줄 수를 그대로 지킨다(예전 일반 글의 줄 간격). 맨 위 블록 사이 줄바꿈 k 개(k≥2)는 빈 문단 k-2 개, 글 끝 줄바꿈 k 개는 빈 문단 k 개,
 *   글 앞 줄바꿈 k 개는 빈 문단 k-1 개다(빈 줄만 있는 글은 k+1 개). 빈 문단은 <br> 하나라
 *   한 줄 높이의 빈 줄로 보이고, 문단 사이 간격은 읽기 모습·서식 편집 칸 모두 줄 간격 수준으로 좁다(styles.tsx PARAGRAPH_GAP). Tiptap 기본(빈 문단 = 줄바꿈 둘,
 *   이어진 빈 문단은 `&nbsp;`)은 쓰지 않는다.
 */
import { Marked, Tokenizer, type marked } from "marked";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import HardBreak from "@tiptap/extension-hard-break";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Node as TiptapNode, type AnyExtension, type JSONContent } from "@tiptap/react";

import { isSafeHref } from "./md-ops";

/**
 * 이 편집기가 다루지 않는 문법은 토큰으로 만들지 않는다 — undefined 면 marked 가 다음 규칙(문단·글자)으로 넘어가 글자로 남는다.
 * HTML 블록·태그(받지 않음), 표(편집기에 표가 없어 통째로 사라진다 — 읽기 전용 경로만 `tables` 로 표 토큰을 만든다), 맨 주소 자동 링크(저장할 때 `[주소](주소)` 로 바뀐다).
 * 그림 `![글](주소)` 은 편집기에 그림이 없으므로 글자 그대로 둔다.
 * 링크 참조 정의(`[TODO]: 내일`)는 정의로 읽으면 줄이 통째로 사라진다 — 예전 일반 글에 흔한 모양이라 글자로 둔다.
 * 들여쓴 코드 블록(줄 앞 공백 4칸·탭)도 만들지 않는다 — 들여쓴 예전 글·서식 모드에서 공백으로 시작한 문단이 코드 모양으로 바뀌지 않게(``` 코드는 그대로).
 */
class SafeTokenizer extends Tokenizer {
  private readonly tables: boolean;
  constructor(tables = false) {
    super();
    this.tables = tables;
  }
  override def(): undefined {
    return undefined;
  }
  override code(): undefined {
    return undefined;
  }
  override html(): undefined {
    return undefined;
  }
  override tag(): undefined {
    return undefined;
  }
  override table(src: string): ReturnType<Tokenizer["table"]> {
    return this.tables ? super.table(src) : undefined;
  }
  override url(): undefined {
    return undefined;
  }
  override link(src: string): ReturnType<Tokenizer["link"]> {
    const t = super.link(src);
    if (t && t.type === "image")
      return { type: "text", raw: t.raw, text: t.raw } as unknown as ReturnType<Tokenizer["link"]>;
    return t;
  }
}

/**
 * 편집기 전용 marked 인스턴스. MarkdownManager 는 `typeof marked`(전역 함수 모양)를 받지만 쓰는 것은 Lexer·defaults·setOptions·use 뿐이라
 * 인스턴스(`new Marked()`)도 그대로 돈다 — 타입만 맞춘다.
 */
function createSafeMarked(tables = false): typeof marked {
  const m = new Marked();
  m.setOptions({ gfm: true, breaks: true, tokenizer: new SafeTokenizer(tables) });
  return m as unknown as typeof marked;
}

/** marked 표 토큰(GFM) — 칸 수는 marked 가 머리글 칸 수에 맞춘다(모자라면 빈 칸, 넘치면 버림). `\|` 는 칸 안 글자 `|` 로 읽힌다. */
type TableCellToken = { tokens?: unknown[]; align?: "left" | "center" | "right" | null };
type TableToken = { header?: TableCellToken[]; rows?: TableCellToken[][]; align?: (string | null)[] };

/**
 * 읽기 전용 경로 전용 표 노드. 편집기에는 표 노드가 없으므로 편집기 확장(markdownExtensions)에는 넣지 않고,
 * view 파서(viewMarkdownManager)에만 더한다. 칸 안은 문단 없이 인라인 노드(굵게·기울임·코드·링크·취소선)를 바로 담는다.
 * 읽기만 하므로 렌더(renderMarkdown)는 두지 않는다 — 이 문서를 마크다운으로 되돌려 쓰지 않는다.
 */
const ViewTable = TiptapNode.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  markdownTokenName: "table",
  parseMarkdown: (token, helpers) => {
    const t = token as unknown as TableToken;
    const cell = (c: TableCellToken, type: "tableHeader" | "tableCell"): JSONContent => ({
      type,
      attrs: { align: c.align ?? null },
      content: helpers.parseInline((c.tokens ?? []) as never),
    });
    const rows: JSONContent[] = [
      { type: "tableRow", content: (t.header ?? []).map((c) => cell(c, "tableHeader")) },
      ...(t.rows ?? []).map((r) => ({
        type: "tableRow",
        content: r.map((c) => cell(c, "tableCell")),
      })),
    ];
    return { type: "table", content: rows };
  },
});

/** 줄바꿈 하나를 `\n` 으로 쓴다(읽기가 `breaks` 라 같은 뜻). */
const NewlineHardBreak = HardBreak.extend({
  renderMarkdown: () => "\n",
});

/**
 * 편집기·변환기 공용 확장. 밑줄은 마크다운에 없어 끈다. 끝 빈 문단 자동 추가(trailingNode)는 열기만 해도 글이 바뀌어
 * (되돌리기 기록·저장 안 됨 표시) 끈다. 링크는 http/https 만, 누르면 열지 않는다(편집 중) — 읽기 모습이 새 탭으로 연다.
 */
export function markdownExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      underline: false,
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
    NewlineHardBreak,
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
}

type Encoder = {
  encodeTextForMarkdown: (text: string, node: JSONContent, parent?: JSONContent) => string;
};

const CODE_TYPES = new Set(["code", "codeBlock"]);

/**
 * 글자 안 마크다운 기호 지키기. Tiptap 기본과 같되 낱말 안 밑줄(`NG_A`)은 그대로 둔다(CommonMark 는 낱말 안 `_` 를 기울임으로 읽지 않는다).
 * `&lt;` 처럼 실체로 읽힐 `&` 만 `\&` 로 지킨다(읽기가 실체를 글자로 푼다).
 */
export function escapeMarkdownInline(text: string): string {
  return text
    .replace(/[\\`*[\]~]/g, "\\$&")
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, "\\_")
    .replace(/&(?=#?[a-zA-Z0-9]+;)/g, "\\&");
}

/**
 * 줄 첫머리 블록 기호 지키기 — 글자로 친 `## `·`- `·`> `·`1. `·`---`·`===` 가 다시 읽을 때 제목·목록·인용·구분선이 되지 않게 한다
 * (입력 규칙을 Ctrl+Z 로 되돌린 글, 줄바꿈 뒤 `- 가` 등). 앞 공백 3칸까지는 같은 줄 앞으로 본다.
 */
export function escapeMarkdownLineStart(text: string): string {
  return text
    .replace(/^( {0,3})(#{1,6})(?=\s|$)/, "$1\\$2")
    .replace(/^( {0,3})([-+])(?=\s|$)/, "$1\\$2")
    .replace(/^( {0,3})>/, "$1\\>")
    .replace(/^( {0,3})(\d{1,9})([.)])(?=\s|$)/, "$1$2\\$3")
    .replace(/^( {0,3})(-+|=+)(\s*)$/, "$1\\$2$3");
}

/** 문단 안에서 줄 첫머리에 오는 글자 조각인가(문단 첫 조각이거나 줄바꿈 바로 뒤, 서식 없음). */
function atLineStart(node: JSONContent, parent?: JSONContent): boolean {
  if (parent?.type !== "paragraph" || node.marks?.length) return false;
  const siblings = parent.content ?? [];
  const i = siblings.indexOf(node);
  return i === 0 || (i > 0 && siblings[i - 1]?.type === "hardBreak");
}

/**
 * 편집기용 MarkdownManager. 편집기마다 새로 만든다(marked 인스턴스에 확장이 토크나이저를 더하므로 공유하지 않는다).
 * `tables` 는 읽기 전용(view) 경로만 켠다 — 기본(편집기·MarkdownField)은 표를 토큰으로 만들지 않고 글자로 둔다.
 */
export function createMarkdownManager(
  extensions: AnyExtension[] = markdownExtensions(),
  options: { tables?: boolean } = {}
): MarkdownManager {
  const manager = new MarkdownManager({
    marked: createSafeMarked(options.tables === true),
    extensions,
  });
  // 글자 쓰기: Tiptap 은 HTML 실체(&lt;)로 바꾼 뒤 마크다운 기호를 이스케이프한다. 이 편집기는 HTML 을 읽지 않으므로 기호만 지키고,
  // 줄 첫머리 블록 기호도 지킨다. (MarkdownManager 의 내부 메서드 — 이름이 바뀌면 markdown-editor 단위 시험의 `<`·줄 앞 기호 왕복이 깨져 알려 준다.)
  const internal = manager as unknown as Encoder;
  if (typeof internal.encodeTextForMarkdown === "function") {
    internal.encodeTextForMarkdown = (text, node, parent) => {
      const inCode =
        (parent?.type != null && CODE_TYPES.has(parent.type)) ||
        (node.marks ?? []).some((m) => CODE_TYPES.has(m.type));
      if (inCode) return text;
      const escaped = escapeMarkdownInline(text);
      return atLineStart(node, parent) ? escapeMarkdownLineStart(escaped) : escaped;
    };
  }
  keepBlankLines(manager);
  return manager;
}

// ─────────────────────────────── 빈 줄 지키기 ───────────────────────────────

/** 맨 위 빈 문단 자리표(쓰기 중간에만 쓴다 — 사용 영역 글자라 사용자 글에 나오지 않는다). */
const BLANK = "\uE000";

type MarkedToken = { type?: string; raw?: string };
type BlankInternals = {
  parseTokens: (tokens: MarkedToken[], implicit?: boolean) => JSONContent[];
};

const countNewlines = (s: string) => (s.match(/\n/g) ?? []).length;
const trailingNewlines = (s: string) => countNewlines(/\s*$/.exec(s)?.[0] ?? "");
const emptyParagraphs = (n: number): JSONContent[] =>
  Array.from({ length: Math.max(n, 0) }, () => ({ type: "paragraph", content: [] }));
const isEmptyParagraph = (n: JSONContent) => n.type === "paragraph" && !(n.content ?? []).length;

/** 안쪽(인용·목록) 빈 문단이 이어지면 둘째부터 뺀다 — Tiptap 이 `&nbsp;` 로 쓰는 경우다. */
function dropNestedEmptyRuns(node: JSONContent): JSONContent {
  if (!node.content) return node;
  const content: JSONContent[] = [];
  for (const c of node.content) {
    const prev = content[content.length - 1];
    if (isEmptyParagraph(c) && prev && isEmptyParagraph(prev)) continue;
    content.push(dropNestedEmptyRuns(c));
  }
  return { ...node, content };
}

/** 쓴 글의 빈 문단 자리표를 줄바꿈 수로 바꾼다(머리말의 규칙). 자리표는 맨 위 블록이라 앞뒤가 늘 `\n\n`(또는 글 처음·끝)이다. */
function collapseBlankMarks(out: string): string {
  if (!out.includes(BLANK)) return out;
  if (new RegExp(`^${BLANK}(?:\n\n${BLANK})*$`).test(out))
    return "\n".repeat(countNewlines(out) / 2);
  return out
    .replace(new RegExp(`^(?:${BLANK}\n\n)+`), (m) => "\n".repeat(m.length / 3 + 1))
    .replace(new RegExp(`(?:\n\n${BLANK})+$`), (m) => "\n".repeat(m.length / 3))
    .replace(new RegExp(`${BLANK}\n\n`, "g"), "\n");
}

/**
 * 빈 줄 수 지키기 — 맨 위 블록 사이 줄바꿈을 세어 빈 문단을 만들고(읽기), 빈 문단을 줄바꿈으로 돌려놓는다(쓰기).
 * MarkdownManager 의 내부 메서드(parseTokens)·공개 serialize 를 이 인스턴스에서만 감싼다 — 이름이 바뀌면 markdown-editor 단위 시험의 빈 줄 왕복이 깨져 알려 준다.
 */
function keepBlankLines(manager: MarkdownManager): void {
  const internal = manager as unknown as BlankInternals;
  if (typeof internal.parseTokens !== "function")
    throw new Error("MarkdownManager.parseTokens 가 없다 — @tiptap/markdown 판이 바뀌었다");
  const parseTokens = internal.parseTokens.bind(manager);
  const parse = manager.parse.bind(manager);
  /** 지금 읽는 원문(marked 처럼 \r\n → \n). 확장 토큰(taskList)의 raw 는 글 끝에서도 `\n` 을 덧붙이므로 줄바꿈은 원문에서 센다. */
  let source: string | null = null;
  manager.parse = ((md: string) => {
    const prev = source;
    source = (md ?? "").replace(/\r\n?/g, "\n");
    try {
      return parse(md);
    } finally {
      source = prev;
    }
  }) as MarkdownManager["parse"];
  let depth = 0;
  internal.parseTokens = (tokens, implicit = false) => {
    depth += 1;
    try {
      // 맨 위(parse 가 부르는 첫 호출)만 다룬다. 블록 안쪽은 Tiptap 그대로.
      if (depth > 1 || !implicit || source === null) return parseTokens(tokens, implicit);
      const src = source;
      const out: JSONContent[] = [];
      let pending = 0;
      let seenBlock = false;
      let at = 0;
      for (const t of tokens) {
        const rawLen = (t.raw ?? "").length;
        const raw = src.slice(at, at + rawLen);
        at += rawLen;
        if (t.type === "space") {
          pending += countNewlines(raw);
          continue;
        }
        out.push(...emptyParagraphs(seenBlock ? pending - 2 : pending - 1));
        out.push(...parseTokens([t], false));
        pending = trailingNewlines(raw);
        seenBlock = true;
      }
      out.push(...emptyParagraphs(seenBlock ? pending : pending > 0 ? pending + 1 : 0));
      return out;
    } finally {
      depth -= 1;
    }
  };

  const serialize = manager.serialize.bind(manager);
  manager.serialize = ((doc: JSONContent) => {
    if (!doc || Array.isArray(doc) || doc.type !== "doc") return serialize(doc);
    const content = (doc.content ?? []).map((n) =>
      isEmptyParagraph(n)
        ? { type: "paragraph", content: [{ type: "text", text: BLANK }] }
        : dropNestedEmptyRuns(n)
    );
    return collapseBlankMarks(serialize({ ...doc, content }));
  }) as MarkdownManager["serialize"];
}

let shared: MarkdownManager | null = null;
/** 읽기 전용 모습·시험용 공용 변환기(편집기가 없는 곳). */
export function defaultMarkdownManager(): MarkdownManager {
  return (shared ??= createMarkdownManager());
}

/** 마크다운 → Tiptap JSON 문서. */
export function parseMarkdown(
  md: string,
  manager: MarkdownManager = defaultMarkdownManager()
): JSONContent {
  const doc = manager.parse(md ?? "");
  return { type: "doc", content: doc.content ?? [] };
}

let sharedView: MarkdownManager | null = null;
/** 읽기 전용(MarkdownView) 전용 변환기 — 편집기와 같되 GFM 표를 table 노드로 만든다. 읽기만 하므로 serializeMarkdown 에 넘기지 않는다. */
export function viewMarkdownManager(): MarkdownManager {
  return (sharedView ??= createMarkdownManager([...markdownExtensions(), ViewTable], { tables: true }));
}

/** 마크다운 → Tiptap JSON 문서(읽기 전용 경로: 표 포함). 편집기는 `parseMarkdown` 을 쓴다. */
export function parseMarkdownView(md: string): JSONContent {
  return parseMarkdown(md, viewMarkdownManager());
}

/** Tiptap JSON 문서 → 마크다운. 빈 문서는 "". */
export function serializeMarkdown(
  doc: JSONContent,
  manager: MarkdownManager = defaultMarkdownManager()
): string {
  return manager.serialize(doc);
}
