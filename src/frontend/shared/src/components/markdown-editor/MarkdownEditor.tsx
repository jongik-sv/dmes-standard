"use client";

/**
 * 마크다운 편집기 — 마크다운 글을 서식 모드(Tiptap)나 MD 모드(원문 textarea)로 고친다. 편집하지 않을 때는 모드와 상관없이
 * 서식이 적용된 읽기 전용 모습(MarkdownView)이다. 고른 모드는 보는 사람 설정(edit-mode, 저장 키 `modeStorageKey`)이라
 * 같은 키를 쓰는 편집기끼리 같은 값을 본다.
 *
 * - 두 모드 모두 같은 마크다운 글을 고치므로 편집 중 바꿔도 내용이 그대로다.
 * - 열기만 해서는 onChange 를 부르지 않는다(사용자가 고친 거래만 내보낸다) — 화면의 되돌리기 기록·저장 안 됨 표시를 만들지 않는다.
 * - value 가 밖에서 바뀌면(화면 되돌리기 등) 편집기 내용을 맞춘다. 이때 onChange 를 다시 부르지 않고, 편집기 되돌리기 기록에도 넣지 않는다.
 * - 나가기(onExit): Esc, 또는 초점이 편집기 밖으로 나갈 때. 도구 막대 단추·링크 입력 칸·모드 전환은 나가기가 아니다.
 * - Esc 가 아닌 키는 뿌리에서 전파를 멈춘다(도구 막대 단추에 초점이 있어도 Delete·Ctrl+Z 가 화면 단축키로 가지 않는다).
 * - 편집 중 뿌리에 `editingClassName` 을 더한다 — 끌기·확대 같은 바깥 동작을 끄는 클래스(예: React Flow 의 `nodrag nowheel nopan nokey`)를 화면이 넘긴다.
 * - 스타일은 컴포넌트가 직접 넣는다(styles.tsx, Part B §18-3).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { findWrapping, liftTarget } from "@tiptap/pm/transform";

import { MarkdownEditorKeys } from "./editor-extensions";
import { createMarkdownManager, markdownExtensions, parseMarkdown } from "./markdown";
import { activeMdCommands, applyMdCommand, type MdCommand } from "./md-ops";
import { DEFAULT_MODE_STORAGE_KEY, useMarkdownEditMode, type MarkdownEditMode } from "./edit-mode";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MarkdownView } from "./MarkdownView";
import { MarkdownEditorStyle } from "./styles";

/** 도구 막대 놓는 자리 — floating: 편집 칸 위로 뜬다(좁은 상자·캔버스 노드) · inline: 편집 칸 위에 줄로 놓인다(폼·패널). */
export type MarkdownToolbarPlacement = "floating" | "inline";

export interface MarkdownEditorProps {
  /** 글(마크다운 문자열). HTML 은 받지 않는다(태그는 글자 그대로). */
  value: string;
  /** 사용자가 고칠 때마다 새 마크다운. */
  onChange(md: string): void;
  /** true 면 편집 중(도구 막대 + 편집 칸), false 면 읽기 전용 서식 모습. */
  editable: boolean;
  /** 편집 칸이 나타날 때 초점을 준다(커서는 글 끝). */
  autoFocus?: boolean;
  /** Esc 또는 초점이 편집기 밖으로 나갈 때. */
  onExit?(): void;
  /** 도구 막대 놓는 자리(기본 inline). */
  toolbar?: MarkdownToolbarPlacement;
  /** true 면 부모(세로 flex)의 남은 높이를 채운다 — 편집 칸이 그 높이까지 늘고 넘치면 칸 안에서 스크롤한다. */
  fill?: boolean;
  /** 편집 중에만 뿌리에 더할 클래스(예: React Flow 노드 안이면 "nodrag nowheel nopan nokey"). */
  editingClassName?: string;
  /** 읽기 모습 링크(a)에 더할 클래스(예: React Flow 노드 안이면 "nodrag nopan"). */
  linkClassName?: string;
  /** 편집 방식(서식·MD) 기억 저장 키(기본 "cm-md:editMode"). 같은 키를 쓰는 편집기끼리 같이 바뀐다. */
  modeStorageKey?: string;
  /** 뿌리 data-testid(기본 "md-editor"). */
  testId?: string;
  /** 편집 칸 접근성 이름(기본 "메모"). */
  ariaLabel?: string;
}

/** 클래스 이름 잇기 — 빈 값은 뺀다(문자열 안 공백에 기대지 않는다: 포맷터의 Tailwind 플러그인이 className 문자열 공백을 다듬는다). */
const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export function MarkdownEditor({
  value,
  onChange,
  editable,
  autoFocus,
  onExit,
  toolbar = "inline",
  fill = false,
  editingClassName,
  linkClassName,
  modeStorageKey = DEFAULT_MODE_STORAGE_KEY,
  testId = "md-editor",
  ariaLabel = "메모",
}: MarkdownEditorProps) {
  const [mode, setMode] = useMarkdownEditMode(modeStorageKey);
  const rootRef = useRef<HTMLDivElement>(null);
  /** 모드를 바꾸는 중 — 옛 편집 칸이 사라져 초점이 잠깐 빠져도 나가기가 아니다. 새 칸이 초점을 받으면 끈다. */
  const switching = useRef(false);
  /** 이번 편집에서 이미 나갔다(Esc 뒤 닫히며 오는 blur 로 두 번 부르지 않는다). 다시 초점을 받으면 끈다. */
  const exited = useRef(false);
  const [focusNext, setFocusNext] = useState(false);
  const live = useRef({ onExit, editable });
  live.current = { onExit, editable };

  useEffect(() => {
    if (!editable) {
      exited.current = false;
      switching.current = false;
      setFocusNext(false);
    }
  }, [editable]);

  const exit = useCallback(() => {
    if (exited.current || !live.current.editable) return;
    exited.current = true;
    live.current.onExit?.();
  }, []);

  const changeMode = useCallback(
    (m: MarkdownEditMode) => {
      if (m === mode) return;
      switching.current = true;
      setFocusNext(true);
      setMode(m);
    },
    [mode, setMode]
  );

  // 편집 중 키는 화면 단축키(감싸는 요소의 onKeyDown · document 되돌리기)로 보내지 않는다 — 초점이 도구 막대 단추·링크 칸에
  // 있어도 Delete·Backspace 가 화면의 항목을 지우거나 Ctrl/Cmd+Z 가 화면을 되돌리지 않게. Esc 만 나가기로 쓰고 위로도 올린다.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") {
      e.stopPropagation();
      return;
    }
    if (e.defaultPrevented) return;
    e.preventDefault();
    exit();
  };
  const onFocus = () => {
    switching.current = false;
    exited.current = false;
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    // 다음 초점이 정해진 뒤 본다(모드 전환·링크 칸 열기 중에는 잠깐 body 로 빠진다).
    setTimeout(() => {
      const root = rootRef.current;
      if (!root || switching.current) return;
      if (root.contains(document.activeElement)) return;
      exit();
    }, 0);
  };

  if (!editable) {
    return (
      <div
        className={classes("cm-md", `cm-md-${toolbar}`, fill && "cm-md-fill")}
        data-testid={testId}
        data-editing="false"
      >
        <MarkdownEditorStyle />
        <MarkdownView value={value} linkClassName={linkClassName} />
      </div>
    );
  }

  const bodyProps = {
    value,
    onChange,
    autoFocus: !!autoFocus || focusNext,
    mode,
    onModeChange: changeMode,
    ariaLabel,
  };
  return (
    <div
      ref={rootRef}
      className={classes(
        "cm-md",
        `cm-md-${toolbar}`,
        fill && "cm-md-fill",
        "cm-md-editing",
        editingClassName
      )}
      data-testid={testId}
      data-editing="true"
      data-mode={mode}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <MarkdownEditorStyle />
      {mode === "markdown" ? <MarkdownBody {...bodyProps} /> : <RichBody {...bodyProps} />}
    </div>
  );
}

interface BodyProps {
  value: string;
  onChange(md: string): void;
  autoFocus: boolean;
  mode: MarkdownEditMode;
  onModeChange(m: MarkdownEditMode): void;
  ariaLabel: string;
}

// ─────────────────────────────── 서식 모드(Tiptap) ───────────────────────────────

/** 안쪽이 꼭 있어야 하는 블록 → 비었을 때 채울 안쪽. 마크다운 `>` 만 있는 줄은 빈 인용으로 읽힌다. */
const FILL: Record<string, () => JSONContent> = {
  doc: () => ({ type: "paragraph" }),
  blockquote: () => ({ type: "paragraph" }),
  listItem: () => ({ type: "paragraph" }),
  taskItem: () => ({ type: "paragraph" }),
  bulletList: () => ({ type: "listItem", content: [{ type: "paragraph" }] }),
  orderedList: () => ({ type: "listItem", content: [{ type: "paragraph" }] }),
  taskList: () => ({
    type: "taskItem",
    attrs: { checked: false },
    content: [{ type: "paragraph" }],
  }),
};

/** ProseMirror 문서는 빈 블록을 받지 않는다 — 빈 글은 빈 문단 하나, 빈 인용·목록은 빈 문단을 채운다. */
function toDoc(node: JSONContent): JSONContent {
  const content = node.content?.map(toDoc);
  const fill = node.type ? FILL[node.type] : undefined;
  if (fill && !content?.length) return { ...node, content: [fill()] };
  return content ? { ...node, content } : node;
}

const LISTS = ["bulletList", "orderedList", "taskList"] as const;

/** 커서 위치에서 켜진 명령 이름(MD 모드 activeMdCommands 와 같은 이름). */
function activeOf(editor: Editor): string[] {
  const out: string[] = [];
  for (const level of [1, 2, 3] as const)
    if (editor.isActive("heading", { level })) out.push(`h${level}`);
  for (const m of ["bold", "italic", "strike"]) if (editor.isActive(m)) out.push(m);
  for (const l of LISTS) if (editor.isActive(l)) out.push(l);
  if (editor.isActive("blockquote")) out.push("blockquote");
  if (editor.isActive("link")) out.push("link");
  if (
    !out.some(
      (n) => /^h\d$/.test(n) || n === "blockquote" || (LISTS as readonly string[]).includes(n)
    ) &&
    editor.isActive("paragraph")
  )
    out.push("paragraph");
  return out;
}

const LIST_LIKE = new Set<string>([...LISTS, "listItem", "taskItem"]);

/**
 * 목록 안 커서의 인용 넣기·빼기 — 목록 항목은 첫 칸이 문단이어야 해 Tiptap toggleBlockquote 가 아무것도 하지 않는다(false).
 * 목록 전체를 인용으로 감싸고(`> - a`), 목록을 감싼 인용 안이면 그 인용에서 목록을 꺼낸다. MD 모드의 인용 단추와 같은 결과다.
 * 목록이 아니거나 인용이 목록 안쪽에 있으면 false — 그때는 Tiptap 기본(toggleBlockquote)이 맞다.
 */
function toggleQuoteAroundList(editor: Editor): boolean {
  const { $from, $to } = editor.state.selection;
  let listDepth = -1;
  let quoteDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if ((LISTS as readonly string[]).includes(name)) listDepth = d;
    else if (name === "blockquote" && quoteDepth < 0) quoteDepth = d;
  }
  if (listDepth < 0 || quoteDepth > listDepth) return false;
  const quote = editor.schema.nodes.blockquote;
  if (!quote) return false;
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      if (quoteDepth >= 0) {
        const range = $from.blockRange($to, (n) => n.type === quote);
        const target = range ? liftTarget(range) : null;
        if (!range || target == null) return false;
        tr.lift(range, target);
        return true;
      }
      const range = $from.blockRange($to, (n) => !LIST_LIKE.has(n.type.name));
      const wrapping = range ? findWrapping(range, quote) : null;
      if (!range || !wrapping) return false;
      tr.wrap(range, wrapping);
      return true;
    })
    .run();
}

function runRich(editor: Editor, cmd: MdCommand) {
  const c = editor.chain().focus();
  if (typeof cmd === "object") {
    const href = cmd.href.trim();
    if (editor.state.selection.empty && !editor.isActive("link")) {
      c.insertContent({
        type: "text",
        text: href,
        marks: [{ type: "link", attrs: { href } }],
      })
        .unsetMark("link")
        .run();
    } else {
      c.extendMarkRange("link").setLink({ href }).run();
    }
    return;
  }
  switch (cmd) {
    case "paragraph":
      c.clearNodes().setParagraph().run();
      return;
    case "h1":
    case "h2":
    case "h3":
      c.toggleHeading({ level: Number(cmd[1]) as 1 | 2 | 3 }).run();
      return;
    case "bold":
      c.toggleBold().run();
      return;
    case "italic":
      c.toggleItalic().run();
      return;
    case "strike":
      c.toggleStrike().run();
      return;
    case "blockquote":
      if (!toggleQuoteAroundList(editor)) c.toggleBlockquote().run();
      return;
    case "bulletList":
    case "orderedList":
    case "taskList": {
      // 다른 목록에서 바꿀 때는 먼저 풀고 감싼다(글머리 ↔ 할 일은 항목 종류가 달라 그대로 바꿀 수 없다).
      const other = LISTS.some((l) => l !== cmd && editor.isActive(l));
      const chain = other ? c.clearNodes() : c;
      if (cmd === "bulletList") chain.toggleBulletList().run();
      else if (cmd === "orderedList") chain.toggleOrderedList().run();
      else chain.toggleTaskList().run();
      return;
    }
  }
}

function RichBody({ value, onChange, autoFocus, mode, onModeChange, ariaLabel }: BodyProps) {
  const extensions = useMemo(() => [...markdownExtensions(), MarkdownEditorKeys], []);
  const manager = useMemo(() => createMarkdownManager(extensions), [extensions]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /** 마지막으로 내보낸(또는 맞춘) 글 — 되돌아온 value 와 같으면 편집기를 다시 맞추지 않는다. */
  const lastSynced = useRef(value);

  const editor = useEditor(
    {
      extensions,
      content: toDoc(parseMarkdown(value, manager)),
      immediatelyRender: false,
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: {
          class: "cm-md-rich",
          "data-testid": "md-editor-rich",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel,
        },
      },
      // 입력 규칙은 거래 둘(글자 넣기 → 바꾸기)을 한 번에 보낸다 — 부모가 다시 그리기 전이라 value 가 아니라 마지막으로 내보낸 글과 비교한다.
      onUpdate: ({ editor: ed }) => {
        const md = manager.serialize(ed.getJSON());
        if (md === lastSynced.current) return;
        lastSynced.current = md;
        onChangeRef.current(md);
      },
    },
    []
  );

  // 밖에서 바뀐 value(되돌리기 등)를 편집기에 맞춘다 — 내보내지 않고(preventUpdate), 편집기 되돌리기 기록에도 넣지 않는다. 커서는 범위 안으로 자른다.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value === lastSynced.current) return;
    lastSynced.current = value;
    if (manager.serialize(editor.getJSON()) === value) return;
    const { from, to } = editor.state.selection;
    let doc;
    try {
      doc = editor.schema.nodeFromJSON(toDoc(parseMarkdown(value, manager)));
      doc.check();
    } catch {
      editor.commands.setContent(toDoc(parseMarkdown(value, manager)), {
        emitUpdate: false,
      });
      return;
    }
    const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content);
    const max = tr.doc.content.size;
    tr.setSelection(
      TextSelection.between(tr.doc.resolve(Math.min(from, max)), tr.doc.resolve(Math.min(to, max)))
    );
    tr.setMeta("addToHistory", false).setMeta("preventUpdate", true);
    editor.view.dispatch(tr);
  }, [editor, value, manager]);

  const activeKey =
    useEditorState({
      editor,
      selector: ({ editor: ed }) => (ed ? activeOf(ed).join(",") : ""),
    }) ?? "";
  const currentHref =
    useEditorState({
      editor,
      selector: ({ editor: ed }) => (ed ? String(ed.getAttributes("link").href ?? "") : ""),
    }) ?? "";
  const active = useMemo(() => new Set(activeKey.split(",").filter(Boolean)), [activeKey]);

  return (
    <>
      <MarkdownToolbar
        mode={mode}
        onModeChange={onModeChange}
        ariaLabel={`${ariaLabel} 서식`}
        active={active}
        currentHref={currentHref}
        onCommand={(cmd) => editor && runRich(editor, cmd)}
        onLinkClose={() => editor?.commands.focus()}
      />
      <EditorContent editor={editor} className="cm-md-body" />
    </>
  );
}

// ─────────────────────────────── MD 모드(원문) ───────────────────────────────

function MarkdownBody({ value, onChange, autoFocus, mode, onModeChange, ariaLabel }: BodyProps) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = useState({ s: value.length, e: value.length });
  /** 단추가 원문을 바꾼 뒤 맞출 고른 범위 — 제어 textarea 는 값이 바뀌면 커서가 끝으로 튄다. */
  const pending = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    const t = ta.current;
    if (!autoFocus || !t) return;
    t.focus({ preventScroll: true });
    t.setSelectionRange(t.value.length, t.value.length);
    // 처음 한 번만 — autoFocus 는 편집 칸이 나타날 때의 일이다.
  }, []);
  useLayoutEffect(() => {
    const p = pending.current;
    const t = ta.current;
    if (!p || !t) return;
    pending.current = null;
    t.setSelectionRange(p[0], p[1]);
  });

  const read = () => {
    const t = ta.current;
    if (t) setSel({ s: t.selectionStart, e: t.selectionEnd });
  };
  const active = useMemo(() => {
    const clamp = (n: number) => Math.max(0, Math.min(n, value.length));
    return activeMdCommands({
      text: value,
      selStart: clamp(sel.s),
      selEnd: clamp(sel.e),
    });
  }, [value, sel]);

  const run = (cmd: MdCommand) => {
    const t = ta.current;
    const edit = {
      text: value,
      selStart: t?.selectionStart ?? sel.s,
      selEnd: t?.selectionEnd ?? sel.e,
    };
    const next = applyMdCommand(edit, cmd);
    pending.current = [next.selStart, next.selEnd];
    setSel({ s: next.selStart, e: next.selEnd });
    if (next.text !== value) onChange(next.text);
    t?.focus({ preventScroll: true });
  };

  return (
    <>
      <MarkdownToolbar
        mode={mode}
        onModeChange={onModeChange}
        ariaLabel={`${ariaLabel} 서식`}
        active={active}
        onCommand={run}
        onLinkClose={() => ta.current?.focus({ preventScroll: true })}
      />
      <textarea
        ref={ta}
        className="cm-md-source"
        data-testid="md-editor-source"
        aria-label={`${ariaLabel} (마크다운 원문)`}
        spellCheck={false}
        value={value}
        onChange={(e) => {
          setSel({ s: e.target.selectionStart, e: e.target.selectionEnd });
          onChange(e.target.value);
        }}
        onSelect={read}
        onKeyUp={read}
        onMouseUp={read}
      />
    </>
  );
}
