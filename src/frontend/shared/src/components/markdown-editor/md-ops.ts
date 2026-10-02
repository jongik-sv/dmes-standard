// 마크다운 편집기 MD 모드 — 원문 textarea 에서 도구 막대 단추가 마크다운 기호를 넣고 빼는 순수 함수 모음.
// 서식(WYSIWYG) 모드는 Tiptap 명령을 쓰고, 여기는 원문 글자만 다룬다(공유 계약: applyMdCommand·activeMdCommands·isSafeHref).
//  - 줄 단위(문단·제목·목록·할 일·인용): 선택이 걸친 모든 줄. 모두 켜져 있으면 끄고, 아니면 켠다(다른 줄 앞 기호는 바꾼다).
//    인용("> ")은 따로 겹치는 층이라 목록·제목을 지우지 않는다(Tiptap 이 인용 안 목록을 "> - a" 로 쓰는 것과 같다).
//  - 글 단위(굵게·기울임·취소선): 고른 글 바로 양쪽 기호만 토글한다(줄마다 따로). 별(*)은 개수로 굵게·기울임을 겹친다.
//  - 바뀐 뒤 선택은 사용자가 고른 글을 계속 가리킨다.

export type MdCommand =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "strike"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | { type: "link"; href: string };

export interface MdEdit {
  text: string;
  selStart: number;
  selEnd: number;
}

type LineCmd =
  "paragraph" | "h1" | "h2" | "h3" | "bulletList" | "orderedList" | "taskList" | "blockquote";
type InlineCmd = "bold" | "italic" | "strike";
type Block = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "bulletList" | "orderedList" | "taskList";

const LINE_CMDS: ReadonlySet<string> = new Set<LineCmd>([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
]);
const ACTIVE_BLOCKS: ReadonlySet<string> = new Set<Block>([
  "h1",
  "h2",
  "h3",
  "bulletList",
  "orderedList",
  "taskList",
]);

/** 링크 주소 — 앞뒤 공백을 뺀 뒤 http/https 만 참. 제어 문자가 섞이면 거짓(javascript: 를 탭·줄바꿈으로 숨기는 경우 포함). */
export function isSafeHref(href: string): boolean {
  const t = href.trim();
  if (!t || /[\u0000-\u001f\u007f]/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function applyMdCommand(edit: MdEdit, cmd: MdCommand): MdEdit {
  const e = norm(edit);
  if (typeof cmd === "object") return cmd.type === "link" ? applyLink(e, cmd.href) : e;
  if (LINE_CMDS.has(cmd)) return applyLineCmd(e, cmd as LineCmd);
  return applyInline(e, cmd as InlineCmd);
}

export function activeMdCommands(edit: MdEdit): Set<string> {
  const e = norm(edit);
  const out = new Set<string>();

  const lines = targetLines(e.text, e.selStart, e.selEnd).map((l) => parseLine(l.text));
  const blocks = new Set(lines.map((l) => l.block));
  if (blocks.size === 1) {
    const b = lines[0].block;
    if (b && ACTIVE_BLOCKS.has(b)) out.add(b);
  }
  if (lines.every((l) => l.quote !== "")) out.add("blockquote");
  if (lines.every((l) => l.quote === "" && l.block === null)) out.add("paragraph");

  if (e.selStart === e.selEnd) {
    for (const k of caretInlineMarks(e.text, e.selStart)) out.add(k);
  } else {
    for (const cmd of ["bold", "italic", "strike"] as const) {
      const segs = inlineSegments(e.text, e.selStart, e.selEnd, MARK[cmd]);
      if (segs.length > 0 && segs.every((s) => s.mode !== null)) out.add(cmd);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 공통

function norm(edit: MdEdit): MdEdit {
  const n = edit.text.length;
  const clamp = (v: number) => Math.max(0, Math.min(n, Number.isFinite(v) ? Math.trunc(v) : 0));
  const a = clamp(edit.selStart);
  const b = clamp(edit.selEnd);
  return { text: edit.text, selStart: Math.min(a, b), selEnd: Math.max(a, b) };
}

interface LineSpan {
  start: number;
  end: number; // "\n" 앞(줄 끝)
  text: string;
}

function splitLines(text: string): LineSpan[] {
  const out: LineSpan[] = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf("\n", start);
    const end = nl < 0 ? text.length : nl;
    out.push({ start, end, text: text.slice(start, end) });
    if (nl < 0) return out;
    start = nl + 1;
  }
}

/** 선택이 걸친 줄 번호. 선택 끝이 다음 줄 첫머리(바로 앞이 "\n")면 그 줄은 빼고, 여러 줄이면 빈 줄을 건너뛴다. */
function targetIndexes(all: LineSpan[], text: string, s: number, e: number): number[] {
  const last = e > s && text[e - 1] === "\n" ? e - 1 : e;
  const idx: number[] = [];
  all.forEach((l, i) => {
    if (l.end >= s && l.start <= last) idx.push(i);
  });
  if (idx.length <= 1) return idx;
  const filled = idx.filter((i) => all[i].text.trim() !== "");
  return filled.length > 0 ? filled : idx;
}

function lineAt(text: string, p: number): LineSpan {
  const start = text.lastIndexOf("\n", p - 1) + 1;
  const nl = text.indexOf("\n", p);
  const end = nl < 0 ? text.length : nl;
  return { start, end, text: text.slice(start, end) };
}

function targetLines(text: string, s: number, e: number): LineSpan[] {
  const all = splitLines(text);
  return targetIndexes(all, text, s, e).map((i) => all[i]);
}

// ---------------------------------------------------------------- 줄 단위

interface ParsedLine {
  indent: string;
  quote: string; // "> " · ">" · ""
  block: Block | null;
  blockPrefix: string;
  rest: string;
}

const TASK_RE = /^[-*+] \[[ xX]\] /;
const BULLET_RE = /^[-*+] /;
const ORDERED_RE = /^\d{1,9}[.)] /;
const HEADING_RE = /^(#{1,6}) /;

function parseLine(line: string): ParsedLine {
  const indent = /^[ \t]*/.exec(line)![0];
  let rest = line.slice(indent.length);
  const q = /^> ?/.exec(rest);
  const quote = q ? q[0] : "";
  rest = rest.slice(quote.length);
  let block: Block | null = null;
  let m: RegExpExecArray | null;
  // 할 일("- [ ] ")은 글머리("- ")로 시작하므로 먼저 본다.
  if ((m = TASK_RE.exec(rest))) block = "taskList";
  else if ((m = BULLET_RE.exec(rest))) block = "bulletList";
  else if ((m = ORDERED_RE.exec(rest))) block = "orderedList";
  else if ((m = HEADING_RE.exec(rest))) block = `h${m[1].length}` as Block;
  const blockPrefix = m ? m[0] : "";
  return { indent, quote, block, blockPrefix, rest: rest.slice(blockPrefix.length) };
}

function isLineOn(l: ParsedLine, cmd: LineCmd): boolean {
  if (cmd === "blockquote") return l.quote !== "";
  if (cmd === "paragraph") return l.quote === "" && l.block === null;
  return l.block === cmd;
}

const BLOCK_PREFIX: Record<"h1" | "h2" | "h3" | "bulletList" | "taskList", string> = {
  h1: "# ",
  h2: "## ",
  h3: "### ",
  bulletList: "- ",
  taskList: "- [ ] ",
};

function applyLineCmd(edit: MdEdit, cmd: LineCmd): MdEdit {
  const { text, selStart, selEnd } = edit;
  const all = splitLines(text);
  const targets = targetIndexes(all, text, selStart, selEnd);
  const parsed = new Map(targets.map((i) => [i, parseLine(all[i].text)] as const));
  const allOn = targets.every((i) => isLineOn(parsed.get(i)!, cmd));

  interface Rewrite {
    text: string;
    oldIndent: number;
    oldContent: number;
    newContent: number;
  }
  const rewrites = new Map<number, Rewrite>();
  let order = 0;
  for (const i of targets) {
    const l = parsed.get(i)!;
    let quote = l.quote;
    let blockPrefix = l.blockPrefix;
    if (cmd === "paragraph") {
      quote = "";
      blockPrefix = "";
    } else if (cmd === "blockquote") {
      quote = allOn ? "" : l.quote || "> ";
    } else if (allOn) {
      blockPrefix = "";
    } else if (cmd === "orderedList") {
      order += 1;
      blockPrefix = `${order}. `;
    } else if (l.block !== cmd) {
      blockPrefix = BLOCK_PREFIX[cmd];
    }
    const newText = l.indent + quote + blockPrefix + l.rest;
    if (newText === all[i].text) continue;
    rewrites.set(i, {
      text: newText,
      oldIndent: l.indent.length,
      oldContent: l.indent.length + l.quote.length + l.blockPrefix.length,
      newContent: l.indent.length + quote.length + blockPrefix.length,
    });
  }
  if (rewrites.size === 0) return edit;

  const newLines = all.map((l, i) => rewrites.get(i)?.text ?? l.text);
  const newStarts: number[] = [];
  let acc = 0;
  for (const l of newLines) {
    newStarts.push(acc);
    acc += l.length + 1;
  }

  const mapPos = (p: number): number => {
    let i = all.findIndex((l) => p >= l.start && p <= l.end);
    if (i < 0) i = all.length - 1;
    const col = p - all[i].start;
    const r = rewrites.get(i);
    if (!r) return newStarts[i] + col;
    if (col >= r.oldContent) return newStarts[i] + col - r.oldContent + r.newContent;
    if (col <= r.oldIndent) return newStarts[i] + col;
    return newStarts[i] + r.newContent; // 옛 기호 안에 있던 위치 → 새 기호 뒤 글 첫머리
  };

  return { text: newLines.join("\n"), selStart: mapPos(selStart), selEnd: mapPos(selEnd) };
}

// ---------------------------------------------------------------- 글 단위

interface Mark {
  ch: string;
  w: number;
  /** 바깥·안쪽 기호 줄(run) 길이 n 에서 이 서식이 켜져 있는가. 별은 1 기울임·2 굵게·3 둘 다. */
  on: (n: number) => boolean;
}

const MARK: Record<InlineCmd, Mark> = {
  bold: { ch: "*", w: 2, on: (n) => n >= 2 },
  italic: { ch: "*", w: 1, on: (n) => n === 1 || n >= 3 },
  strike: { ch: "~", w: 2, on: (n) => n >= 2 },
};

function runBefore(text: string, pos: number, ch: string, min = 0): number {
  let n = 0;
  while (pos - n - 1 >= min && text[pos - n - 1] === ch) n += 1;
  return n;
}

function runAfter(text: string, pos: number, ch: string, max = text.length): number {
  let n = 0;
  while (pos + n < max && text[pos + n] === ch) n += 1;
  return n;
}

interface Segment {
  start: number;
  end: number;
  /** outside: 고른 글 바로 바깥에 기호, inside: 고른 글 양 끝이 기호, null: 꺼짐. */
  mode: "outside" | "inside" | null;
  innerL: number;
  innerR: number;
}

/** 줄 앞 기호(들여쓰기·인용·목록·제목) 뒤 글 첫머리 위치. */
function contentStartOf(l: LineSpan): number {
  const p = parseLine(l.text);
  return l.start + p.indent.length + p.quote.length + p.blockPrefix.length;
}

/** 고른 범위를 줄마다 잘라 줄 앞 기호와 양 끝 공백을 뺀 조각. 빈 조각은 버린다. */
function inlineSegments(text: string, s: number, e: number, mark: Mark): Segment[] {
  const out: Segment[] = [];
  for (const l of splitLines(text)) {
    const cs = contentStartOf(l);
    let a = Math.max(s, cs);
    let b = Math.min(e, l.end);
    if (a >= b) continue;
    while (a < b && /\s/.test(text[a])) a += 1;
    while (b > a && /\s/.test(text[b - 1])) b -= 1;
    if (a >= b) continue;

    let mode: Segment["mode"] = null;
    let innerL = 0;
    let innerR = 0;
    if (mark.on(Math.min(runBefore(text, a, mark.ch, cs), runAfter(text, b, mark.ch, l.end)))) {
      mode = "outside";
    } else {
      innerL = runAfter(text, a, mark.ch, b);
      innerR = runBefore(text, b, mark.ch, a + innerL);
      if (innerL + innerR < b - a && mark.on(Math.min(innerL, innerR))) mode = "inside";
    }
    out.push({ start: a, end: b, mode, innerL, innerR });
  }
  return out;
}

interface TextEdit {
  at: number;
  del: number;
  ins: string;
}

function applyEdits(text: string, edits: TextEdit[]): string {
  let out = "";
  let cur = 0;
  for (const ed of edits) {
    out += text.slice(cur, ed.at) + ed.ins;
    cur = ed.at + ed.del;
  }
  return out + text.slice(cur);
}

/** 원래 위치 p 를 고친 뒤 위치로. 같은 자리 넣기는 assocRight 면 넣은 글 뒤, 아니면 앞. 지운 범위 안은 그 첫머리로. */
function mapThrough(p: number, edits: TextEdit[], assocRight: boolean): number {
  let delta = 0;
  for (const ed of edits) {
    const end = ed.at + ed.del;
    if (p > end || (p === end && (ed.del > 0 || assocRight))) delta += ed.ins.length - ed.del;
    else if (p > ed.at) delta += ed.at - p;
  }
  return p + delta;
}

function applyInline(edit: MdEdit, cmd: InlineCmd): MdEdit {
  const { text, selStart: s, selEnd: e } = edit;
  const mark = MARK[cmd];
  const m = mark.ch.repeat(mark.w);

  if (s === e) {
    const line = lineAt(text, s);
    if (
      mark.on(
        Math.min(
          runBefore(text, s, mark.ch, contentStartOf(line)),
          runAfter(text, s, mark.ch, line.end)
        )
      )
    ) {
      // 빈 기호 쌍 가운데 → 쌍을 지운다
      return {
        text: text.slice(0, s - mark.w) + text.slice(s + mark.w),
        selStart: s - mark.w,
        selEnd: s - mark.w,
      };
    }
    // 커서가 그 서식 글 안(단추가 눌린 상태로 보이는 곳) → 감싼 기호를 뺀다. 눌린 표시(activeMdCommands)와 같은 범위를 쓴다.
    const span = caretInlineSpans(text, s).get(cmd);
    if (span) {
      const { a, b } = span;
      const out = text.slice(0, a - mark.w) + text.slice(a, b) + text.slice(b + mark.w);
      return { text: out, selStart: s - mark.w, selEnd: s - mark.w };
    }
    return {
      text: text.slice(0, s) + m + m + text.slice(s),
      selStart: s + mark.w,
      selEnd: s + mark.w,
    };
  }

  const segs = inlineSegments(text, s, e, mark);
  if (segs.length === 0) return edit;
  const allOn = segs.every((g) => g.mode !== null);
  const edits: TextEdit[] = [];
  for (const g of segs) {
    if (allOn) {
      if (g.mode === "outside") {
        edits.push(
          { at: g.start - mark.w, del: mark.w, ins: "" },
          { at: g.end, del: mark.w, ins: "" }
        );
      } else {
        edits.push(
          { at: g.start + g.innerL - mark.w, del: mark.w, ins: "" },
          { at: g.end - g.innerR, del: mark.w, ins: "" }
        );
      }
    } else if (g.mode === null) {
      edits.push({ at: g.start, del: 0, ins: m }, { at: g.end, del: 0, ins: m });
    }
  }
  return {
    text: applyEdits(text, edits),
    selStart: mapThrough(s, edits, true),
    selEnd: mapThrough(e, edits, false),
  };
}

/** 커서가 놓인 줄에서 굵게·기울임·취소선 범위를 찾아 커서가 그 안(글 첫머리~끝)에 있으면 켠다. 안쪽 겹침도 본다. */
function caretInlineMarks(text: string, p: number): Set<string> {
  return new Set(caretInlineSpans(text, p).keys());
}

/**
 * 커서를 감싼 서식 글 범위(기호 안쪽 a~b, 원문 위치). 같은 서식이 겹치면 가장 안쪽.
 * 별 셋(`***`)은 굵게·기울임 둘 다 같은 안쪽 범위다 — 빼는 쪽이 자기 기호 수(굵게 2·기울임 1)만큼 뺀다.
 */
function caretInlineSpans(text: string, p: number): Map<InlineCmd, { a: number; b: number }> {
  const span = lineAt(text, p);
  const cs = contentStartOf(span);
  const line = text.slice(cs, span.end);
  const col = p - cs;
  const out = new Map<InlineCmd, { a: number; b: number }>();

  const scan = (src: string, offset: number) => {
    const strike = /~~(?=\S)(.+?)(?<=\S)~~/g;
    for (let m = strike.exec(src); m; m = strike.exec(src)) {
      const a = offset + m.index + 2;
      const b = a + m[1].length;
      if (col >= a && col <= b) {
        out.set("strike", { a: cs + a, b: cs + b });
        scan(m[1], a);
      }
    }
    const stars = /(\*{1,3})(?=[^\s*])(.+?)(?<=[^\s*])\1(?!\*)/g;
    for (let m = stars.exec(src); m; m = stars.exec(src)) {
      const w = m[1].length;
      const a = offset + m.index + w;
      const b = a + m[2].length;
      if (col >= a && col <= b) {
        if (w >= 2) out.set("bold", { a: cs + a, b: cs + b });
        if (w !== 2) out.set("italic", { a: cs + a, b: cs + b });
        scan(m[2], a);
      }
    }
  };
  scan(line, 0);
  return out;
}

// ---------------------------------------------------------------- 링크

function applyLink(edit: MdEdit, href: string): MdEdit {
  if (!isSafeHref(href)) return edit;
  const url = href.trim().replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  const { text, selEnd: e } = edit;
  let s = edit.selStart;
  // 한 줄 선택이면 줄 앞 기호는 링크 글에서 뺀다("- item" → "- [item](…)").
  if (s < e && !text.slice(s, e).includes("\n"))
    s = Math.min(e, Math.max(s, contentStartOf(lineAt(text, s))));
  if (s === e) {
    const ins = `[${url}](${url})`;
    return {
      text: text.slice(0, s) + ins + text.slice(s),
      selStart: s + ins.length,
      selEnd: s + ins.length,
    };
  }
  const label = escapeLinkLabel(text.slice(s, e));
  return {
    text: `${text.slice(0, s)}[${label}](${url})${text.slice(e)}`,
    selStart: s + 1,
    selEnd: s + 1 + label.length,
  };
}

/**
 * 링크 글 안의 대괄호를 지킨다 — 지키지 않은 `[`·`]` 앞에 `\` 를 붙여 고른 글 전체가 링크 글로 남게 한다(`a](…) [b` 가 다른 링크가 되지 않게).
 * 이미 지킨 기호(`\[`·`\*`)는 그대로 두고, 끝의 홀수 `\` 는 하나 더해 닫는 `]` 를 지키지 않게 한다(보이는 글은 같다).
 */
function escapeLinkLabel(label: string): string {
  let out = "";
  let slashes = 0;
  for (const ch of label) {
    if ((ch === "[" || ch === "]") && slashes % 2 === 0) out += "\\";
    out += ch;
    slashes = ch === "\\" ? slashes + 1 : 0;
  }
  return slashes % 2 === 1 ? out + "\\" : out;
}
