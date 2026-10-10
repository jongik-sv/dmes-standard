"use client";

/**
 * 로그 분석 (anl/logViewer) — LOG 뷰 Monaco 에디터.
 * 원본: analog-express-ui-plate LogMonacoEditor.js 이식.
 *  - readOnly + minimap + 커스텀 'log' 언어/전역 테마 dmes-code(공용 편집기, 로그 토큰 색 포함).
 *  - value 갱신은 model.setValue (원본 동일).
 *  - 리사이즈: 원본 EventEmitter 버스 대신 automaticLayout(내장 ResizeObserver)으로 단순화 —
 *    사이드바 접힘 CSS transition(300ms) 후에도 자동 재배치된다.
 *  - getSelectedText 를 ref 로 노출 — 쿼리 바인더(Binder) 로 선택 텍스트를 넘길 때 사용.
 */

import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { DMES_CODE_THEME_ID, type Monaco } from "@dk-oasis/shared/code-editor";
import { loadMonaco } from "./monaco-loader";
import { LOG_LANGUAGE_ID } from "./log-language";

export interface LogMonacoEditorHandle {
  /** 에디터에서 현재 선택된 텍스트 반환 (선택 없으면 빈 문자열). */
  getSelectedText: () => string;
}

interface LogMonacoEditorProps {
  value: string;
}

const LogMonacoEditor = forwardRef<LogMonacoEditorHandle, LogMonacoEditorProps>(
  function LogMonacoEditor({ value }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [editor, setEditor] =
      useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
    // 생성 시점의 최신 value 사용을 위해 ref 로 미러링 (비동기 로드 완료가 렌더보다 늦을 수 있음).
    const valueRef = useRef(value);
    valueRef.current = value;

    useImperativeHandle(
      ref,
      () => ({
        getSelectedText: () => {
          if (!editor) return "";
          const selection = editor.getSelection();
          if (!selection) return "";
          return editor.getModel()?.getValueInRange(selection) ?? "";
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
          theme: DMES_CODE_THEME_ID,
          value: valueRef.current,
          readOnly: true,
          language: LOG_LANGUAGE_ID,
          minimap: { enabled: true },
          automaticLayout: true,
        });
        setEditor(created);
      });

      return () => {
        disposed = true;
        created?.dispose();
      };
    }, []);

    useEffect(() => {
      if (!editor) return;
      const model = editor.getModel();
      if (model && model.getValue() !== value) {
        model.setValue(value);
      }
    }, [editor, value]);

    return <div className="anl-monaco-host" ref={hostRef} />;
  },
);

export default memo(LogMonacoEditor);
