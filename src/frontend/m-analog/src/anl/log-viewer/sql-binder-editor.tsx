"use client";

/**
 * 로그 분석 (anl/logViewer) — Binder 탭 SQL Monaco 에디터.
 * 원본: analog-express-ui-plate ResizableMonacoEditor.js(sql 분기) 이식.
 *
 * 비제어 방식 — 원본의 "value 변경마다 setValue" 루프 함정 회피:
 *  - 마운트 시 초기값만 세팅, 사용자의 타이핑은 에디터 내부 상태로 유지.
 *  - 에디터 → 부모 반영: 위젯 blur 시 onFlush(현재값) (탭/워크스페이스 전환 클릭도 blur 로 커버).
 *  - 부모 → 에디터 반영: value prop 이 에디터 현재값과 다를 때만 setValue
 *    (워크스페이스 전환, 쿼리 바인더 실행, 묶기/초기화 등 명시적 변경만 통과).
 *  - 툴바(묶기/초기화)용으로 getValue/setValue 를 ref 로 노출.
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
import { loadMonaco } from "./monaco-loader";
import { LOG_THEME_ID } from "./log-language";

export interface SqlBinderEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
}

interface SqlBinderEditorProps {
  value: string;
  /** blur 시 에디터 현재값을 부모(워크스페이스 bindData)로 반영. */
  onFlush: (value: string) => void;
}

const SqlBinderEditor = forwardRef<SqlBinderEditorHandle, SqlBinderEditorProps>(
  function SqlBinderEditor({ value, onFlush }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [editor, setEditor] =
      useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;
    // blur 구독을 재등록하지 않도록 콜백을 ref 로 유지.
    const onFlushRef = useRef(onFlush);
    onFlushRef.current = onFlush;

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => editor?.getValue() ?? valueRef.current,
        setValue: (next: string) => {
          editor?.setValue(next);
        },
      }),
      [editor],
    );

    useEffect(() => {
      let disposed = false;
      let created: Monaco.editor.IStandaloneCodeEditor | null = null;

      void loadMonaco().then((monaco) => {
        if (disposed || !hostRef.current) return;
        created = monaco.editor.create(hostRef.current, {
          // monaco standalone 의 theme 는 전역 — 'vs' 를 주면 상시 마운트된 본 에디터가
          // 로그 에디터의 'logview' 테마를 덮어써 로그 하이라이트가 사라진다.
          // 'logview' 는 base 'vs' + inherit 이므로 SQL 기본 색상은 그대로 유지된다.
          theme: LOG_THEME_ID,
          value: valueRef.current,
          language: "sql",
          minimap: { enabled: true },
          automaticLayout: true,
        });
        created.onDidBlurEditorWidget(() => {
          onFlushRef.current(created?.getValue() ?? "");
        });
        setEditor(created);
      });

      return () => {
        disposed = true;
        created?.dispose();
      };
    }, []);

    // 부모의 명시적 변경만 에디터로 밀어넣는다 (동일 값이면 커서/undo 보존을 위해 no-op).
    useEffect(() => {
      if (!editor) return;
      if (editor.getValue() !== value) {
        editor.setValue(value);
      }
    }, [editor, value]);

    return <div className="anl-monaco-host" ref={hostRef} />;
  },
);

export default memo(SqlBinderEditor);
