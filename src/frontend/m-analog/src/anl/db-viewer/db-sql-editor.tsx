"use client";

/**
 * DB 뷰어 (anl/dbViewer) — SQL 편집창 (Monaco).
 * 로그 뷰어의 monaco 로더·테마를 그대로 쓴다(monaco 테마는 전역이라 같은 'logview' 를 써야 로그 하이라이트가 유지된다).
 *
 * 비제어 방식 — 타이핑마다 부모(그리드가 있는 화면 루트)를 다시 그리지 않는다.
 *  - 부모는 ref 의 getValue 로 실행 직전에만 현재 SQL 을 읽는다.
 *  - 테이블 선택처럼 부모가 SQL 을 바꿀 때만(value·revision 변경) 에디터 내용을 바꾼다.
 *  - Ctrl/⌘+Enter 와 F8 은 onRun 을 부른다.
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

export interface DbSqlEditorHandle {
  getValue: () => string;
}

interface DbSqlEditorProps {
  value: string;
  /** 같은 SQL 을 다시 넣을 때도(같은 테이블 재선택) 에디터를 되돌리도록 부모가 올리는 번호. */
  revision: number;
  onRun: () => void;
}

const DbSqlEditor = forwardRef<DbSqlEditorHandle, DbSqlEditorProps>(
  function DbSqlEditor({ value, revision, onRun }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [editor, setEditor] =
      useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;
    // 단축키 등록을 다시 하지 않도록 콜백을 ref 로 유지한다.
    const onRunRef = useRef(onRun);
    onRunRef.current = onRun;

    useImperativeHandle(
      ref,
      () => ({ getValue: () => editor?.getValue() ?? valueRef.current }),
      [editor],
    );

    useEffect(() => {
      let disposed = false;
      let created: Monaco.editor.IStandaloneCodeEditor | null = null;

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
        });
        created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
          onRunRef.current(),
        );
        // F8 은 Monaco 기본 키(다음 문제로 이동)라 편집창 포커스 중에는 PageLayout 까지 가지 않는다 — 여기서 실행으로 잇는다.
        created.addCommand(monaco.KeyCode.F8, () => onRunRef.current());
        setEditor(created);
      });

      return () => {
        disposed = true;
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
