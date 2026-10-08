"use client";

/**
 * DB 뷰어 (anl/dbViewer) — SQL 편집창 (Monaco).
 * 로그 뷰어의 monaco 로더·테마를 그대로 쓴다(monaco 테마는 전역이라 같은 'logview' 를 써야 로그 하이라이트가 유지된다).
 *
 * 비제어 방식 — 타이핑마다 부모(그리드가 있는 화면 루트)를 다시 그리지 않는다.
 *  - 부모는 ref 의 getValue 로 실행 직전에만 현재 SQL 을 읽는다.
 *  - 테이블 선택처럼 부모가 SQL 을 바꿀 때만(value·revision 변경) 에디터 내용을 바꾼다.
 *  - Ctrl/⌘+Enter 와 F8 은 onRun 을 부른다.
 *  - 자동 완성은 SQL 키워드·표·칸만 낸다(단어 기반 제안은 끈다). 후보 제공자는 sql-completion.ts.
 *  - 화면이 칸 이름·셀 값을 넣을 때는 핸들의 insertAtCursor 를 쓴다(실행 취소 가능, 초점은 편집창으로).
 */

import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type * as Monaco from "monaco-editor";
import { loadMonaco } from "../log-viewer/monaco-loader";
import { LOG_THEME_ID } from "../log-viewer/log-language";
import { fetchColumns } from "./db-viewer-api";
import { columnAffixes, statementRange, valueAffixes } from "./sql-assist";
import { attachSqlAssist, cachedColumnLoader } from "./sql-completion";

export interface DbSqlEditorHandle {
  getValue: () => string;
  /**
   * 커서 위치(선택 영역이 있으면 그 자리)에 글을 끼우고 편집창으로 초점을 옮긴다.
   * kind "column" 은 칸 이름(목록 안이면 쉼표), "value" 는 SQL 리터럴(필요할 때만 공백).
   * 편집창이 아직 안 떴으면 false.
   */
  insertAtCursor: (text: string, kind: "column" | "value") => boolean;
}

interface DbSqlEditorProps {
  value: string;
  /** 같은 SQL 을 다시 넣을 때도(같은 테이블 재선택) 에디터를 되돌리도록 부모가 올리는 번호. */
  revision: number;
  /** 왼쪽 목록의 표(스키마 → 표 이름) — 표 이름 후보와 FROM 표의 칸 찾기에 쓴다. */
  tablesBySchema: Record<string, string[]>;
  onRun: () => void;
}

const DbSqlEditor = forwardRef<DbSqlEditorHandle, DbSqlEditorProps>(
  function DbSqlEditor({ value, revision, tablesBySchema, onRun }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [editor, setEditor] =
      useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;
    // 단축키 등록을 다시 하지 않도록 콜백을 ref 로 유지한다.
    const onRunRef = useRef(onRun);
    onRunRef.current = onRun;

    // 자동 완성이 호출 때마다 최신 표 목록을 읽도록 ref 로 둔다.
    const tablesRef = useRef(tablesBySchema);
    tablesRef.current = tablesBySchema;
    // 표 단위 칸 목록 캐시 — 편집창이 살아 있는 동안 유지한다.
    const columnLoaderRef = useRef(
      cachedColumnLoader(async (schema, table) =>
        (await fetchColumns(schema, table)).map((c) => c.COLUMN_NAME),
      ),
    );

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => editor?.getValue() ?? valueRef.current,
        insertAtCursor: (text, kind) => {
          const model = editor?.getModel();
          const selection = editor?.getSelection();
          if (!editor || !model || !selection) return false;
          const full = model.getValue();
          const start = model.getOffsetAt(selection.getStartPosition());
          const end = model.getOffsetAt(selection.getEndPosition());
          const [from, to] = statementRange(full, start);
          const before = full.slice(from, start);
          const after = full.slice(end, Math.max(to, end));
          const { prefix, suffix } =
            kind === "column"
              ? columnAffixes(before, after)
              : valueAffixes(before, after);
          const inserted = `${prefix}${text}${suffix}`;
          editor.executeEdits(
            "db-viewer-assist",
            [{ range: selection, text: inserted, forceMoveMarkers: true }],
            () => {
              const cursor = model.getPositionAt(start + inserted.length);
              return [
                {
                  selectionStartLineNumber: cursor.lineNumber,
                  selectionStartColumn: cursor.column,
                  positionLineNumber: cursor.lineNumber,
                  positionColumn: cursor.column,
                } as Monaco.Selection,
              ];
            },
          );
          editor.focus();
          return true;
        },
      }),
      [editor],
    );

    useEffect(() => {
      let disposed = false;
      let created: Monaco.editor.IStandaloneCodeEditor | null = null;
      let detachAssist: (() => void) | null = null;

      void loadMonaco().then((monaco) => {
        if (disposed || !hostRef.current) return;
        created = monaco.editor.create(hostRef.current, {
          theme: LOG_THEME_ID,
          value: valueRef.current,
          language: "sql",
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          renderLineHighlight: "line",
          padding: { top: 6, bottom: 6 },
          // 단어 기반 제안은 문서 안 아무 단어(예: 표 이름 조각)를 후보로 내서 헷갈린다 — 끄고 키워드·표·칸만 낸다.
          wordBasedSuggestions: "off",
          quickSuggestions: { other: true, comments: false, strings: false },
          // Enter 는 제안을 고른 경우에만 수락하고, 그 밖에는 줄바꿈을 그대로 둔다.
          acceptSuggestionOnEnter: "smart",
          suggestOnTriggerCharacters: true,
        });
        const model = created.getModel();
        if (model) {
          detachAssist = attachSqlAssist(monaco, model, {
            getTables: () => tablesRef.current,
            loadColumns: (schema, table) => columnLoaderRef.current(schema, table),
          });
        }
        created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
          onRunRef.current(),
        );
        // F8 은 Monaco 기본 키(다음 문제로 이동)라 편집창 포커스 중에는 PageLayout 까지 가지 않는다 — 여기서 실행으로 잇는다.
        created.addCommand(monaco.KeyCode.F8, () => onRunRef.current());
        setEditor(created);
      });

      return () => {
        disposed = true;
        detachAssist?.();
        created?.dispose();
      };
    }, []);

    useEffect(() => {
      if (!editor) return;
      if (editor.getValue() !== value) {
        editor.setValue(value);
      }
    }, [editor, value, revision]);

    return <div className="anl-db-sql-host" ref={hostRef} />;
  },
);

export default memo(DbSqlEditor);
