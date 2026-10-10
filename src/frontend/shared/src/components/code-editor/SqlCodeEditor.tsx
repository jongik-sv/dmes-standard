"use client";

/**
 * 공용 SQL 편집기(Monaco) — DB 뷰어 편집기(m-analog db-sql-editor)를 기반으로 데이터와 무관한 부분만 올린 것이다.
 *
 * - 제어형(`value` + `onChange`)과 비제어형(`defaultValue` + `revision`, 부모가 ref.getValue 로 읽는 DB 뷰어 방식)을 모두 받는다.
 *   비제어형에서 같은 값으로 되돌리려면 부모가 `revision` 을 올린다. 부모가 바꾼 값은 `onChange` 를 부르지 않는다.
 * - 자동 완성은 SQL 키워드 + `completionProvider` 후보다. 표·칸 같은 데이터 후보는 부르는 쪽이 넘긴다.
 * - `:이름` 바인드는 언어를 새로 만들지 않고 모델 장식(CSS 클래스)으로 강조한다. 전역 `sql` 언어와 테마를 건드리지 않는다.
 * - [크게 보기]는 Modal 에 같은 내용의 두 번째 편집기를 띄운다. [적용]이 값을 돌려주고 [취소]·Esc 는 버린다. `readOnly` 면 [닫기]만 있다.
 * - Monaco 를 불러오는 동안과 불러오기에 실패했을 때는 Textarea(같은 testId·aria-label·값)를 보인다. 시험(jsdom)은 이 대체 칸으로 돈다.
 *   대체 칸 모습에서는 testId 가 Textarea 에 붙고, Monaco 가 뜬 뒤에는 뿌리 틀에 붙는다.
 * - 스타일은 컴포넌트가 `<style>` 을 직접 넣는다(Part B §18-3, `.css` export 없음).
 */
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type * as Monaco from "monaco-editor";
import { IconArrowsMaximize } from "@tabler/icons-react";
import { Button, Textarea } from "../form";
import { Modal } from "../modal";
import { findBindRanges } from "./bind-ranges";
import { DMES_CODE_THEME_ID } from "./code-theme";
import { loadMonaco } from "./monaco-loader";
import { attachCompletion, type SqlCompletionProvider } from "./sql-completion";
import { columnAffixes, statementRange, valueAffixes } from "./sql-text";

/** 어느 자리에 끼울지 미리 잡아 둔 위치 — 글자 오프셋과, 잡은 때의 편집기 내용 버전. */
export interface InsertPoint {
  start: number;
  end: number;
  version: number;
}

export interface SqlCodeEditorHandle {
  getValue(): string;
  /** 값을 바꾸고 `onChange` 를 부른다. */
  setValue(sql: string): void;
  focus(): void;
  /** 오프셋 구간을 선택한다(`SELECT *` 의 `*` 를 골라 두는 식). */
  setSelection(start: number, end: number): void;
  /** 지금 커서(선택 영역) 위치를 잡아 둔다. 비동기 작업 뒤에 그 자리에 끼우려고 쓴다. 편집기가 아직 없으면 null. */
  captureInsertPoint(): InsertPoint | null;
  /**
   * 커서 위치(선택 영역이 있으면 그 자리)에 글을 끼우고 초점을 편집기로 옮긴다. 실행 취소가 가능하다.
   * kind "column" 은 칸 이름(목록 안이면 쉼표), "value" 는 SQL 리터럴(필요할 때만 공백), "raw" 는 그대로(기본).
   * `at` 이 있고 그 뒤로 내용이 바뀌지 않았으면 그 자리에 끼우고, 바뀌었으면 지금 커서에 끼운다. 편집기가 아직 없으면 false.
   */
  insertAtCursor(text: string, kind?: "column" | "value" | "raw", at?: InsertPoint | null): boolean;
}

export interface SqlCodeEditorProps {
  /** 제어형(onChange 와 함께). */
  value?: string;
  /** 비제어형(ref.getValue 로 읽기, DB 뷰어 방식). */
  defaultValue?: string;
  /** 비제어형에서 같은 값으로 되돌릴 때 올리는 번호. */
  revision?: number;
  onChange?: (sql: string) => void;
  /** Ctrl/Cmd+Enter, F8. */
  onRun?: () => void;
  readOnly?: boolean;
  /** 기본 160. */
  height?: number | string;
  /** 기본 true. [크게 보기] 버튼. */
  expandable?: boolean;
  /** 큰 창 제목(기본 "SQL"). */
  expandTitle?: string;
  completionProvider?: SqlCompletionProvider;
  /** 기본 true. */
  highlightBinds?: boolean;
  /**
   * Monaco 생성 옵션 덮어쓰기(만들 때 한 번 적용, 이후 바꿔도 반영하지 않는다). 기본 설정(DB 뷰어 값)과 다르게 써야 하는 화면용 —
   * 예: 로그 뷰어 바인드 편집기가 옛 기본값(줄바꿈 없음·글자 14)을 유지할 때. `theme`·`language`·`value` 는 덮어쓰지 않는다.
   */
  editorOptions?: Monaco.editor.IStandaloneEditorConstructionOptions;
  /** 기본 false. 오른쪽 미니맵. */
  minimap?: boolean;
  /** 기본 true. 바깥 테두리. 부모가 이미 테두리를 두른 자리(패널 안 꽉 채움)에서는 false. */
  bordered?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** 내부용: 큰 창 안 편집기가 쓴다. 제안창·찾기창이 없을 때 Esc 를 받으면 부른다(Mantine 모달 Esc 보다 Monaco 의 Esc 를 먼저 쓰게 한다). */
  onEscape?: () => void;
  /** 뿌리 data-testid. 큰 창은 `${testId}-expand`(버튼)·`${testId}-modal`(큰 창 편집기 틀)·`${testId}-apply`(적용)·`${testId}-cancel`. */
  testId?: string;
}

type Status = "loading" | "ready" | "failed";

const DEFAULT_HEIGHT = 160;

const SQL_CODE_EDITOR_CSS = `
.cm-sqled { position: relative; box-sizing: border-box; width: 100%; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); overflow: hidden; }
.cm-sqled.cm-sqled-plain { border: 0; border-radius: 0; }
.cm-sqled-host { width: 100%; height: 100%; }
.cm-sqled-fallback { width: 100%; height: 100%; }
.cm-sqled-fallback .form-textarea { height: 100%; font-family: Consolas, "SFMono-Regular", Menlo, monospace; font-size: 13px; resize: none; }
.cm-sqled-fallback .mantine-Textarea-root, .cm-sqled-fallback .mantine-Textarea-wrapper { height: 100%; }
.cm-sqled-expand { position: absolute; top: 4px; right: 18px; z-index: 5; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg, #fff); color: var(--color-text-muted); cursor: pointer; opacity: 0.85; }
.cm-sqled-expand:hover { opacity: 1; color: var(--color-primary); border-color: var(--color-primary); }
.cm-sqled-bind { color: var(--color-primary); font-weight: 600; }
.cm-modal.cm-sqled-modal { --modal-size: 90vw; width: 90vw; }
.cm-sqled-modal-editor { height: calc(90dvh - 190px); min-height: 240px; }
`;

function SqlCodeEditorStyle() {
  return (
    <style href="cm-sql-code-editor" precedence="default">
      {SQL_CODE_EDITOR_CSS}
    </style>
  );
}

/** 오프셋 구간을 Monaco 범위로 바꾼다. */
function monacoRangeOf(model: Monaco.editor.ITextModel, start: number, end: number): Monaco.IRange {
  const from = model.getPositionAt(start);
  const to = model.getPositionAt(end);
  return {
    startLineNumber: from.lineNumber,
    startColumn: from.column,
    endLineNumber: to.lineNumber,
    endColumn: to.column,
  };
}

/** 끼울 글과 앞뒤에 붙일 공백·쉼표를 합친다. */
function insertedText(full: string, start: number, end: number, text: string, kind: "column" | "value" | "raw"): string {
  if (kind === "raw") return text;
  const [from, to] = statementRange(full, start);
  const before = full.slice(from, start);
  const after = full.slice(end, Math.max(to, end));
  const { prefix, suffix } = kind === "column" ? columnAffixes(before, after) : valueAffixes(before, after);
  return `${prefix}${text}${suffix}`;
}

const SqlCodeEditorImpl = forwardRef<SqlCodeEditorHandle, SqlCodeEditorProps>(function SqlCodeEditor(
  {
    value,
    defaultValue,
    revision,
    onChange,
    onRun,
    readOnly = false,
    height = DEFAULT_HEIGHT,
    expandable = true,
    expandTitle = "SQL",
    completionProvider,
    highlightBinds = true,
    minimap = false,
    editorOptions,
    bordered = true,
    placeholder,
    ariaLabel,
    onEscape,
    testId,
  },
  ref,
) {
  const controlled = value !== undefined;
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [text, setText] = useState(value ?? defaultValue ?? "");
  const textRef = useRef(text);
  /** 내용 버전 — Monaco 모델이 없는 대체 칸에서 captureInsertPoint 의 version 으로 쓴다. */
  const versionRef = useRef(0);
  /** 프로그램이 값을 바꾸는 동안 Monaco 의 내용 변경 알림이 onChange 로 새지 않게 한다. */
  const applyingRef = useRef(false);
  /** 대체 칸에 적용을 미룬 선택. 세 번째 값은 초점도 옮길지(글을 끼운 경우만 true, setSelection 은 초점을 빼앗지 않는다). */
  const pendingSelectionRef = useRef<[number, number, boolean] | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const providerRef = useRef(completionProvider);
  providerRef.current = completionProvider;
  const highlightRef = useRef(highlightBinds);
  highlightRef.current = highlightBinds;
  const minimapRef = useRef(minimap);
  minimapRef.current = minimap;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const editorOptionsRef = useRef(editorOptions);
  editorOptionsRef.current = editorOptions;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  /** 대체 칸에서 Monaco 로 바뀔 때 대체 칸에 있던 초점·선택을 넘기려고 잠시 담아 둔다. */
  const restoreFocusRef = useRef<[number, number] | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  const refreshBinds = useCallback(() => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    const collection = decorationsRef.current;
    if (!ed || !model || !collection) return;
    if (!highlightRef.current) {
      collection.set([]);
      return;
    }
    collection.set(
      findBindRanges(model.getValue()).map((b) => ({
        range: monacoRangeOf(model, b.start, b.end),
        options: { inlineClassName: "cm-sqled-bind" },
      })),
    );
  }, []);

  /** 값을 화면(상태·Monaco)에만 반영한다. onChange 는 부르지 않는다. */
  const applyExternal = useCallback(
    (next: string) => {
      // 부모가 값을 바꾸면 그 전에 잡아 둔 끼울 자리(InsertPoint)는 어긋나므로 버전을 올려 못 쓰게 한다.
      if (next !== textRef.current) versionRef.current += 1;
      textRef.current = next;
      setText(next);
      const ed = editorRef.current;
      if (ed && ed.getValue() !== next) {
        applyingRef.current = true;
        try {
          ed.setValue(next);
        } finally {
          applyingRef.current = false;
        }
        refreshBinds();
      }
    },
    [refreshBinds],
  );

  /** 사용자가 고친 값(또는 핸들의 setValue) — 상태에 담고 onChange 를 부른다. */
  const emitChange = useCallback((next: string) => {
    textRef.current = next;
    versionRef.current += 1;
    setText(next);
    onChangeRef.current?.(next);
  }, []);

  // Monaco 만들기(마운트 때 한 번). 불러오기에 실패하면 대체 칸이 남는다.
  useEffect(() => {
    let disposed = false;
    let created: Monaco.editor.IStandaloneCodeEditor | null = null;
    let detach: (() => void) | null = null;
    loadMonaco().then(
      (monaco) => {
        if (disposed || !hostRef.current) return;
        // 대체 칸에 초점이 있었으면(첫 불러오기가 느릴 때) 선택까지 Monaco 로 넘긴다.
        const ta = textareaOf();
        if (ta && document.activeElement === ta) restoreFocusRef.current = [ta.selectionStart, ta.selectionEnd];
        // 모달(transform 이 걸린 조상) 안에서는 fixed 위치 위젯이 어긋나므로 쓰지 않는다.
        const inDialog = !!hostRef.current.closest('[role="dialog"]');
        // 위젯이 틀 안에 머무르므로 제안 목록이 잘리지 않게 틀의 넘침 가림을 푼다.
        if (inDialog && wrapRef.current) wrapRef.current.style.overflow = "visible";
        created = monaco.editor.create(hostRef.current, {
          readOnly,
          ariaLabel,
          placeholder,
          automaticLayout: true,
          minimap: { enabled: minimapRef.current },
          fontSize: 13,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          // 편집기 끝까지 스크롤한 뒤의 휠은 바깥 영역(화면·모달 본문)으로 넘긴다. 편집기 안 스크롤은 그대로다.
          scrollbar: { alwaysConsumeMouseWheel: false },
          wordWrap: "on",
          renderLineHighlight: "line",
          padding: { top: 6, bottom: 6 },
          fixedOverflowWidgets: !inDialog,
          // 단어 기반 제안은 문서 안 아무 단어(예: 표 이름 조각)를 후보로 내서 헷갈린다 — 끄고 키워드와 후보 공급자만 쓴다.
          wordBasedSuggestions: "off",
          quickSuggestions: { other: true, comments: false, strings: false },
          // Enter 는 제안을 고른 경우에만 수락하고, 그 밖에는 줄바꿈을 그대로 둔다.
          acceptSuggestionOnEnter: "smart",
          suggestOnTriggerCharacters: true,
          ...editorOptionsRef.current,
          // 아래 셋은 공용 편집기가 정한다.
          theme: DMES_CODE_THEME_ID,
          language: "sql",
          value: textRef.current,
        });
        const model = created.getModel();
        if (model) {
          detach = attachCompletion(monaco, model, {
            provide: (ctx) => providerRef.current?.provide(ctx) ?? [],
            keywords: (ctx) => providerRef.current?.keywords?.(ctx) ?? true,
          });
        }
        decorationsRef.current = created.createDecorationsCollection([]);
        created.onDidChangeModelContent(() => {
          refreshBinds();
          if (applyingRef.current || !created) return;
          emitChange(created.getValue());
        });
        const editorForCommands = created;
        // onRun 이 없으면 Monaco 기본 동작(Ctrl+Enter = 아래에 줄 삽입)을 그대로 둔다.
        created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
          if (onRunRef.current) onRunRef.current();
          else editorForCommands.trigger("keyboard", "editor.action.insertLineAfter", null);
        });
        // F8 은 Monaco 기본 키(다음 문제로 이동)라 편집기 초점 중에는 PageLayout 까지 가지 않는다 — 여기서 실행으로 잇는다.
        created.addCommand(monaco.KeyCode.F8, () => onRunRef.current?.());
        if (onEscapeRef.current) {
          // Mantine 모달은 window 캡처 단계에서 Esc 로 닫는다 — 제안창·찾기창을 닫으려는 Esc 까지 가져가 초안이 사라진다.
          // 이 표식이 있는 대상의 Esc 는 모달이 무시하므로, 위젯이 없을 때만 우리가 닫는다.
          // 초점을 받는 요소는 브라우저마다 다르다(EditContext 의 div, textarea.inputarea, 찾기 입력 칸) — 초점이 가는 대로 표식을 단다.
          const dom = created.getDomNode();
          dom?.addEventListener("focusin", (e) => (e.target as HTMLElement | null)?.setAttribute?.("data-mantine-stop-propagation", "true"));
          // 선택·다중 커서를 풀려는 Esc 는 Monaco 가 쓰게 둔다.
          created.addCommand(
            monaco.KeyCode.Escape,
            () => onEscapeRef.current?.(),
            "!suggestWidgetVisible && !findWidgetVisible && !editorHasSelection && !editorHasMultipleSelections",
          );
        }
        editorRef.current = created;
        refreshBinds();
        setEditor(created);
        setStatus("ready");
      },
      () => {
        if (!disposed) setStatus("failed");
      },
    );
    return () => {
      disposed = true;
      detach?.();
      decorationsRef.current = null;
      editorRef.current = null;
      created?.dispose();
    };
    // 마운트 때 한 번만 만든다. 이후 바뀌는 값은 ref 와 아래 효과가 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const restore = restoreFocusRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !restore) return;
    restoreFocusRef.current = null;
    editor.focus();
    editor.setSelection(monacoRangeOf(model, restore[0], restore[1]));
  }, [editor]);

  useEffect(() => {
    editor?.updateOptions({ readOnly });
  }, [editor, readOnly]);

  useEffect(() => {
    editor?.updateOptions({ minimap: { enabled: minimap } });
  }, [editor, minimap]);

  useEffect(() => {
    refreshBinds();
  }, [editor, highlightBinds, refreshBinds]);

  // 제어형: 부모 값이 바뀌면 반영한다(같은 값이면 커서·되돌리기 기록을 건드리지 않는다).
  useEffect(() => {
    if (value === undefined) return;
    if (textRef.current !== value || (editorRef.current && editorRef.current.getValue() !== value)) applyExternal(value);
  }, [value, editor, applyExternal]);

  // 비제어형: 부모가 defaultValue 나 revision 을 바꿀 때만 되돌린다(처음 그릴 때는 이미 초기값이다).
  const firstUncontrolledRef = useRef(true);
  useEffect(() => {
    if (controlled) return;
    if (firstUncontrolledRef.current) {
      firstUncontrolledRef.current = false;
      return;
    }
    applyExternal(defaultValue ?? "");
  }, [controlled, defaultValue, revision, applyExternal]);

  const textareaOf = useCallback(
    (): HTMLTextAreaElement | null => wrapRef.current?.querySelector("textarea") ?? null,
    [],
  );

  // 대체 칸에서 글을 끼운 뒤 선택을 맞춘다(상태가 반영된 다음 DOM 에 적용).
  useLayoutEffect(() => {
    const sel = pendingSelectionRef.current;
    if (!sel) return;
    pendingSelectionRef.current = null;
    const ta = textareaOf();
    if (!ta) return;
    if (sel[2]) ta.focus();
    ta.setSelectionRange(sel[0], sel[1]);
  }, [text, textareaOf]);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => editorRef.current?.getValue() ?? textRef.current,
      setValue: (sql) => {
        applyExternal(sql);
        versionRef.current += 1;
        onChangeRef.current?.(sql);
      },
      focus: () => {
        const ed = editorRef.current;
        if (ed) ed.focus();
        else textareaOf()?.focus();
      },
      setSelection: (start, end) => {
        const ed = editorRef.current;
        const model = ed?.getModel();
        if (ed && model) {
          ed.setSelection(monacoRangeOf(model, start, end));
        } else {
          const ta = textareaOf();
          if (ta && ta.value === textRef.current) {
            ta.setSelectionRange(start, end);
            pendingSelectionRef.current = null;
          } else {
            // 새 값이 아직 칸에 반영되기 전이거나 칸이 없으면 다음 그리기 뒤로 미룬다.
            pendingSelectionRef.current = [start, end, false];
          }
        }
      },
      captureInsertPoint: () => {
        const ed = editorRef.current;
        const model = ed?.getModel();
        const selection = ed?.getSelection();
        if (ed && model && selection) {
          return {
            start: model.getOffsetAt(selection.getStartPosition()),
            end: model.getOffsetAt(selection.getEndPosition()),
            version: model.getVersionId(),
          };
        }
        const ta = textareaOf();
        if (!ta) return null;
        return { start: ta.selectionStart, end: ta.selectionEnd, version: versionRef.current };
      },
      insertAtCursor: (insert, kind = "raw", at) => {
        if (readOnlyRef.current) return false;
        const ed = editorRef.current;
        const model = ed?.getModel();
        const selection = ed?.getSelection();
        if (ed && model && selection) {
          const full = model.getValue();
          const usable = !!at && at.version === model.getVersionId();
          const start = usable ? at.start : model.getOffsetAt(selection.getStartPosition());
          const end = usable ? at.end : model.getOffsetAt(selection.getEndPosition());
          const range = usable ? monacoRangeOf(model, start, end) : selection;
          const inserted = insertedText(full, start, end, insert, kind);
          ed.executeEdits("sql-code-editor-assist", [{ range, text: inserted, forceMoveMarkers: true }], () => {
            const cursor = model.getPositionAt(start + inserted.length);
            return [
              {
                selectionStartLineNumber: cursor.lineNumber,
                selectionStartColumn: cursor.column,
                positionLineNumber: cursor.lineNumber,
                positionColumn: cursor.column,
              } as Monaco.Selection,
            ];
          });
          ed.focus();
          return true;
        }
        const ta = textareaOf();
        if (!ta) return false;
        const full = textRef.current;
        const usable = !!at && at.version === versionRef.current;
        const start = usable ? at.start : ta.selectionStart;
        const end = usable ? at.end : ta.selectionEnd;
        const inserted = insertedText(full, start, end, insert, kind);
        pendingSelectionRef.current = [start + inserted.length, start + inserted.length, true];
        emitChange(full.slice(0, start) + inserted + full.slice(end));
        return true;
      },
    }),
    [applyExternal, emitChange, textareaOf],
  );

  const openExpand = () => {
    setDraft(editorRef.current?.getValue() ?? textRef.current);
    setExpanded(true);
  };
  const closeExpand = () => {
    setExpanded(false);
    editorRef.current?.focus();
  };
  const applyDraft = (next: string, thenRun: boolean) => {
    setExpanded(false);
    if (next !== textRef.current) {
      const ed = editorRef.current;
      const model = ed?.getModel();
      if (ed && model) {
        // setValue 는 되돌리기 기록을 지우므로 전체 범위 교체로 넣는다(적용도 Ctrl+Z 로 되돌릴 수 있다).
        applyingRef.current = true;
        try {
          ed.pushUndoStop();
          ed.executeEdits("sql-code-editor-apply", [{ range: model.getFullModelRange(), text: next }]);
          ed.pushUndoStop();
        } finally {
          applyingRef.current = false;
        }
        refreshBinds();
        textRef.current = next;
        setText(next);
        versionRef.current += 1;
      } else {
        applyExternal(next);
      }
      // 실행이 이어지면 부모가 새 값으로 다시 그린 뒤 onRun 을 불러야 새 SQL 로 실행된다.
      if (thenRun) flushSync(() => onChangeRef.current?.(next));
      else onChangeRef.current?.(next);
    }
    if (thenRun) onRunRef.current?.();
    else editorRef.current?.focus();
  };
  // 큰 창의 Ctrl/Cmd+Enter 가 방금 고친 값으로 적용·실행하도록 최신 draft 를 ref 로 둔다.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const heightStyle = typeof height === "number" ? `${height}px` : height;
  const showFallback = status !== "ready";

  return (
    <div
      ref={wrapRef}
      className={bordered ? "cm-sqled" : "cm-sqled cm-sqled-plain"}
      style={{ height: heightStyle }}
      data-testid={showFallback ? undefined : testId}
      data-editor-status={status}
    >
      <SqlCodeEditorStyle />
      {/* Monaco 는 보이는 틀 안에 만들어야 크기를 잰다 — 준비되기 전에는 숨기고 대체 칸을 보인다. */}
      <div className="cm-sqled-host" ref={hostRef} style={{ display: showFallback ? "none" : "block" }} />
      {showFallback ? (
        <div
          className="cm-sqled-fallback"
          onKeyDown={(e) => {
            // 대체 칸에서도 Monaco 와 같은 실행 키(Ctrl/Cmd+Enter, F8)를 쓴다.
            if (onRunRef.current && ((e.key === "Enter" && (e.ctrlKey || e.metaKey)) || e.key === "F8")) {
              e.preventDefault();
              onRunRef.current();
            }
          }}
        >
          <Textarea
            value={text}
            onChange={(v) => {
              pendingSelectionRef.current = null;
              emitChange(v);
            }}
            readOnly={readOnly}
            placeholder={placeholder}
            aria-label={ariaLabel}
            data-testid={testId}
          />
        </div>
      ) : null}
      {expandable ? (
        <button
          type="button"
          className="cm-sqled-expand"
          title="크게 보기"
          aria-label="크게 보기"
          data-testid={testId ? `${testId}-expand` : undefined}
          onClick={openExpand}
        >
          <IconArrowsMaximize size={14} />
        </button>
      ) : null}
      {expandable ? (
        <Modal
          open={expanded}
          title={expandTitle}
          size="xl"
          className="cm-sqled-modal"
          closeOnClickOutside={false}
          onClose={closeExpand}
          footer={
            readOnly ? (
              <Button onClick={closeExpand} data-testid={testId ? `${testId}-cancel` : undefined}>
                닫기
              </Button>
            ) : (
              <>
                <Button onClick={closeExpand} data-testid={testId ? `${testId}-cancel` : undefined}>
                  취소
                </Button>
                <Button variant="primary" onClick={() => applyDraft(draftRef.current, false)} data-testid={testId ? `${testId}-apply` : undefined}>
                  적용
                </Button>
              </>
            )
          }
        >
          <div className="cm-sqled-modal-editor" data-testid={testId ? `${testId}-modal` : undefined}>
            <SqlCodeEditorImpl
              value={draft}
              onChange={setDraft}
              onRun={onRun ? () => applyDraft(draftRef.current, true) : undefined}
              readOnly={readOnly}
              height="100%"
              expandable={false}
              completionProvider={completionProvider}
              highlightBinds={highlightBinds}
              onEscape={closeExpand}
              placeholder={placeholder}
              ariaLabel={ariaLabel ? `${ariaLabel} (큰 창)` : undefined}
              testId={testId ? `${testId}-modal-editor` : undefined}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
});

export const SqlCodeEditor = memo(SqlCodeEditorImpl);
