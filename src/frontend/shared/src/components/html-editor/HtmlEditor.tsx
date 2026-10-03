"use client";

/**
 * HTML 편집기 — 입력·출력이 HTML 문자열인 서식 편집기. 서식 모드(Tiptap)와 HTML 원문 모드(고정폭 textarea)를 [HTML] 단추로 오간다.
 *
 * - 서식 모드 자체가 미리보기다 — 글 모양이 읽기 모습(NoticeBodyView `.nbv-doc`)과 같다. 원문 모드에는 [미리보기](소독한 HTML)를 둔다.
 * - 값에 서식 모드가 지키지 못하는 태그(표·그림 등, unsupportedRichTags)가 있으면 원문 모드로 연다. 원문 → 서식으로 바꿀 때 지금 원문에
 *   그런 태그가 있으면 「표·이미지 등 일부 서식이 사라집니다」 확인을 받고, 확인하면 서식 모드가 읽은 HTML 을 곧바로 내보낸다(보이는 대로 값이 된다).
 * - 열기만 해서는 onChange 를 부르지 않는다(Tiptap 이 `<b>`→`<strong>` 처럼 다듬어도) — 사용자가 고친 거래만 내보낸다.
 * - value 가 밖에서 바뀌면 편집기 내용을 맞춘다(onChange 없음, 편집기 되돌리기 기록에도 넣지 않음). 서식 모드가 지키지 못할 값이면 원문 모드로 바꾼다.
 *   고치는 대상(행·항목)이 바뀌면 부르는 쪽이 key 로 새로 그리는 편이 낫다(되돌리기 기록이 다른 글로 넘어가지 않게).
 * - 다 지우면 빈 값("")을 낸다(`<p></p>` 가 아니다).
 * - maxLength: 글자 수(HTML 문자열 길이)를 보이고 넘으면 경고만 한다 — 입력을 막지 않는다(서버가 최종 판정한다).
 * - editable=false 면 소독한 HTML 읽기 모습만 보인다.
 * - 화면 단축키를 막지 않는다(키 전파를 멈추지 않는다) — 보통 입력 칸과 같다.
 * - 스타일은 컴포넌트가 직접 넣는다(styles.tsx, Part B §18-3).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  EditorContent,
  createDocument,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";

import { useMessage } from "../message-provider";
import { NoticeBodyView, NoticeBodyViewStyle } from "../notice-body-view/NoticeBodyView";
import { htmlToText, unsupportedRichTags } from "./convert";
import { htmlExtensions, serializeHtml } from "./extensions";
import { HtmlToolbar, type HtmlCommand, type HtmlEditMode } from "./HtmlToolbar";
import { HtmlEditorStyle } from "./styles";

export interface HtmlEditorProps {
  /** HTML 문자열. */
  value: string;
  /** 사용자가 고칠 때마다 새 HTML(다 지우면 ""). */
  onChange(html: string): void;
  /** true 면 편집기(도구 막대 + 편집 칸), false 면 소독한 HTML 읽기 모습. */
  editable: boolean;
  /** 글자 수 상한(HTML 문자열 길이). 주면 글자 수를 보이고 넘으면 경고한다 — 입력은 막지 않는다. */
  maxLength?: number;
  /** 뿌리 data-testid(기본 "html-editor"). 안쪽 요소는 이것을 앞에 붙인다(`<testId>-rich`·`-source`·`-tb-bold`·`-count` …). */
  testId?: string;
  /** 편집 칸 접근성 이름(기본 "본문"). */
  ariaLabel?: string;
  /** 편집 칸(서식·원문·미리보기) 최소 높이(기본 120px). */
  minHeight?: number | string;
  /**
   * 서식이 사라질 때 묻는 확인창. 주지 않으면 공용 메시지 확인창(MessageProvider), 그것도 없으면 window.confirm 으로 묻는다.
   */
  confirm?(message: string): Promise<boolean>;
}

/** 원문 → 서식 모드로 바꿀 때 사라질 서식이 있으면 묻는 문구. */
export const HTML_EDITOR_LOSS_MESSAGE =
  "표·이미지 등 일부 서식이 사라집니다. 서식 편집으로 바꾸시겠습니까?";

const noopSubscribe = () => () => {};

/** MessageProvider 밖(시험 등)이면 null. useMessage 는 Provider 밖에서 던진다. */
function useOptionalMessage() {
  try {
    return useMessage();
  } catch {
    return null;
  }
}

export function HtmlEditor({
  value,
  onChange,
  editable,
  maxLength,
  testId = "html-editor",
  ariaLabel = "본문",
  minHeight = 120,
  confirm,
}: HtmlEditorProps) {
  // 서버 렌더·하이드레이션 중에는 틀만 그린다 — 처음 모드(원문/서식)를 정하려면 DOM 으로 HTML 을 읽어야 한다.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const text = value ?? "";
  const [mode, setMode] = useState<HtmlEditMode>(() =>
    unsupportedRichTags(text).length > 0 ? "source" : "rich"
  );
  const [preview, setPreview] = useState(false);
  /** 모드를 바꾼 뒤 새 편집 칸에 초점을 준다. */
  const [focusNext, setFocusNext] = useState(false);
  /** 확인을 받고 서식 모드로 바꿨다 — 서식 모드가 읽은(서식이 빠진) HTML 을 열자마자 내보낸다. */
  const [emitOnOpen, setEmitOnOpen] = useState(false);
  /** 마지막으로 내보냈거나 본 value — 다르면 밖에서 바뀐 값이다. */
  const lastSeen = useRef(text);
  const message = useOptionalMessage();

  const ask = useCallback(
    (msg: string): Promise<boolean> => {
      if (confirm) return confirm(msg);
      if (!message) return Promise.resolve(window.confirm(msg));
      return new Promise((resolve) =>
        message.showMessage({
          title: "확인",
          message: msg,
          alertType: "confirm",
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        })
      );
    },
    [confirm, message]
  );

  const emit = useCallback(
    (html: string) => {
      lastSeen.current = html;
      onChange(html);
    },
    [onChange]
  );

  // 밖에서 바뀐 값 — 서식 모드가 지키지 못할 값이면 원문 모드로 바꾼다(열기만 해서는 서식이 사라지지 않게).
  useEffect(() => {
    if (text === lastSeen.current) return;
    lastSeen.current = text;
    if (mode === "rich" && unsupportedRichTags(text).length > 0) {
      setMode("source");
      setPreview(false);
      setEmitOnOpen(false);
      setFocusNext(false);
    }
  }, [text, mode]);

  const toggleSource = useCallback(async () => {
    if (mode === "rich") {
      setPreview(false);
      setFocusNext(true);
      setMode("source");
      return;
    }
    const lost = unsupportedRichTags(text).length > 0;
    if (lost && !(await ask(HTML_EDITOR_LOSS_MESSAGE))) return;
    setEmitOnOpen(lost);
    setPreview(false);
    setFocusNext(true);
    setMode("rich");
  }, [ask, mode, text]);

  const boxStyle = useMemo(() => ({ minHeight }), [minHeight]);
  const length = text.length;
  const over = maxLength != null && length > maxLength;
  // 서식 모드에서는 상한이 HTML 길이 기준이라 보이는 글자 수를 따로 보인다.
  const visibleLength = useMemo(
    () => (maxLength != null && mode === "rich" ? htmlToText(text).length : 0),
    [maxLength, mode, text]
  );

  if (!editable) {
    return (
      <div className="cm-he" data-testid={testId} data-editing="false">
        <HtmlEditorStyle />
        <div className="cm-he-view">
          <NoticeBodyView value={text} format="HTML" testId={`${testId}-view`} />
        </div>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="cm-he" data-testid={testId} data-editing="true">
        <HtmlEditorStyle />
      </div>
    );
  }

  return (
    <div className="cm-he" data-testid={testId} data-editing="true" data-mode={mode}>
      <HtmlEditorStyle />
      <NoticeBodyViewStyle />
      {mode === "rich" ? (
        <RichBody
          value={text}
          onChange={emit}
          autoFocus={focusNext}
          emitOnOpen={emitOnOpen}
          ariaLabel={ariaLabel}
          testId={testId}
          boxStyle={boxStyle}
          onToggleSource={toggleSource}
        />
      ) : (
        <SourceBody
          value={text}
          onChange={emit}
          autoFocus={focusNext}
          preview={preview}
          onTogglePreview={() => setPreview((p) => !p)}
          ariaLabel={ariaLabel}
          testId={testId}
          boxStyle={boxStyle}
          onToggleSource={toggleSource}
        />
      )}
      {maxLength != null && (
        <div
          className="cm-he-count"
          data-testid={`${testId}-count`}
          data-over={over ? "true" : "false"}
        >
          {over && (
            <span data-testid={`${testId}-count-warning`} role="alert">
              {maxLength.toLocaleString("ko-KR")}자를 넘었습니다. 줄이지 않으면 저장하지 못합니다.
            </span>
          )}
          <span>
            {mode === "rich" ? `글자 ${visibleLength.toLocaleString("ko-KR")} · HTML ` : ""}
            {length.toLocaleString("ko-KR")} / {maxLength.toLocaleString("ko-KR")}자
          </span>
        </div>
      )}
    </div>
  );
}

interface BodyProps {
  value: string;
  onChange(html: string): void;
  autoFocus: boolean;
  ariaLabel: string;
  testId: string;
  boxStyle: { minHeight: number | string };
  onToggleSource(): void;
}

// ─────────────────────────────── 서식 모드(Tiptap) ───────────────────────────────

/** 커서 위치에서 켜진 명령 이름. */
function activeOf(editor: Editor): string[] {
  const out: string[] = [];
  for (const m of ["bold", "italic", "underline", "strike", "code", "link"])
    if (editor.isActive(m)) out.push(m);
  for (const level of [2, 3] as const)
    if (editor.isActive("heading", { level })) out.push(`h${level}`);
  for (const n of ["bulletList", "orderedList", "blockquote"]) if (editor.isActive(n)) out.push(n);
  return out;
}

function runCommand(editor: Editor, cmd: HtmlCommand) {
  const c = editor.chain().focus();
  if (typeof cmd === "object") {
    if (cmd.type === "unlink") {
      c.extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = cmd.href.trim();
    if (editor.state.selection.empty && !editor.isActive("link")) {
      c.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .unsetMark("link")
        .run();
    } else {
      c.extendMarkRange("link").setLink({ href }).run();
    }
    return;
  }
  switch (cmd) {
    case "bold":
      c.toggleBold().run();
      return;
    case "italic":
      c.toggleItalic().run();
      return;
    case "underline":
      c.toggleUnderline().run();
      return;
    case "strike":
      c.toggleStrike().run();
      return;
    case "h2":
    case "h3":
      c.toggleHeading({ level: cmd === "h2" ? 2 : 3 }).run();
      return;
    case "bulletList":
      c.toggleBulletList().run();
      return;
    case "orderedList":
      c.toggleOrderedList().run();
      return;
    case "blockquote":
      c.toggleBlockquote().run();
      return;
    case "code":
      c.toggleCode().run();
      return;
    case "hr":
      c.setHorizontalRule().run();
      return;
    case "undo":
      c.undo().run();
      return;
    case "redo":
      c.redo().run();
      return;
  }
}

function RichBody({
  value,
  onChange,
  autoFocus,
  emitOnOpen,
  ariaLabel,
  testId,
  boxStyle,
  onToggleSource,
}: BodyProps & { emitOnOpen: boolean }) {
  const extensions = useMemo(() => htmlExtensions(), []);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /** 마지막으로 내보낸(또는 맞춘) HTML — 되돌아온 value 와 같으면 편집기를 다시 맞추지 않는다. */
  const lastSynced = useRef(value);

  const push = (ed: Editor) => {
    const html = serializeHtml(ed);
    if (html === lastSynced.current) return;
    lastSynced.current = html;
    onChangeRef.current(html);
  };

  const editor = useEditor(
    {
      extensions,
      content: value,
      immediatelyRender: false,
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: {
          class: "nbv-doc cm-he-rich",
          "data-testid": `${testId}-rich`,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel,
        },
      },
      onCreate: ({ editor: ed }) => {
        if (emitOnOpen) push(ed);
      },
      onUpdate: ({ editor: ed }) => push(ed),
    },
    []
  );

  // 밖에서 바뀐 value(되돌리기·다른 행 등)를 편집기에 맞춘다 — 내보내지 않고(preventUpdate), 편집기 되돌리기 기록에도 넣지 않는다.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value === lastSynced.current) return;
    lastSynced.current = value;
    if (serializeHtml(editor) === value) return;
    const { from, to } = editor.state.selection;
    const doc = createDocument(value, editor.schema);
    const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content);
    const max = tr.doc.content.size;
    tr.setSelection(
      TextSelection.between(tr.doc.resolve(Math.min(from, max)), tr.doc.resolve(Math.min(to, max)))
    );
    tr.setMeta("addToHistory", false).setMeta("preventUpdate", true);
    editor.view.dispatch(tr);
  }, [editor, value]);

  const stateKey =
    useEditorState({
      editor,
      selector: ({ editor: ed }) =>
        ed
          ? `${activeOf(ed).join(",")}|${ed.can().undo() ? 1 : 0}${ed.can().redo() ? 1 : 0}`
          : "|00",
    }) ?? "|00";
  const currentHref =
    useEditorState({
      editor,
      selector: ({ editor: ed }) => (ed ? String(ed.getAttributes("link").href ?? "") : ""),
    }) ?? "";
  const [activeKey = "", canKey = "00"] = stateKey.split("|");
  const active = useMemo(() => new Set(activeKey.split(",").filter(Boolean)), [activeKey]);

  return (
    <>
      <HtmlToolbar
        testId={testId}
        ariaLabel={`${ariaLabel} 서식`}
        mode="rich"
        onToggleSource={onToggleSource}
        onCommand={(cmd) => editor && runCommand(editor, cmd)}
        active={active}
        canUndo={canKey[0] === "1"}
        canRedo={canKey[1] === "1"}
        currentHref={currentHref}
        onLinkClose={() => editor?.commands.focus()}
      />
      <EditorContent editor={editor} className="cm-he-body nbv" style={boxStyle} />
    </>
  );
}

// ─────────────────────────────── 원문 모드 ───────────────────────────────

function SourceBody({
  value,
  onChange,
  autoFocus,
  preview,
  onTogglePreview,
  ariaLabel,
  testId,
  boxStyle,
  onToggleSource,
}: BodyProps & { preview: boolean; onTogglePreview(): void }) {
  const ta = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const t = ta.current;
    if (!autoFocus || !t) return;
    t.focus({ preventScroll: true });
    // 처음 한 번만 — autoFocus 는 편집 칸이 나타날 때의 일이다.
  }, []);

  return (
    <>
      <HtmlToolbar
        testId={testId}
        ariaLabel={`${ariaLabel} 서식`}
        mode="source"
        onToggleSource={onToggleSource}
        preview={preview}
        onTogglePreview={onTogglePreview}
      />
      {preview ? (
        <div className="cm-he-preview" data-testid={`${testId}-preview`} style={boxStyle}>
          <NoticeBodyView
            value={value}
            format="HTML"
            testId={`${testId}-preview-view`}
            emptyText="내용이 없습니다."
          />
        </div>
      ) : (
        <textarea
          ref={ta}
          className="cm-he-source"
          data-testid={`${testId}-source`}
          aria-label={`${ariaLabel} (HTML 원문)`}
          spellCheck={false}
          value={value}
          style={boxStyle}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}
