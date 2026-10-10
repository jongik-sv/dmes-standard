"use client";

/**
 * 로그 분석 (anl/logViewer) — Binder 탭 SQL 편집기. 공용 `SqlCodeEditor`(@dk-oasis/shared/code-editor) 위의 얇은 어댑터다.
 * 원본: analog-express-ui-plate ResizableMonacoEditor.js(sql 분기) 이식.
 *
 * 부모 값은 blur 때만 받는다 — 원본의 "value 변경마다 setValue" 루프 함정 회피:
 *  - 마운트 시 초기값만 세팅, 사용자의 타이핑은 편집기 내부 상태로 유지(SqlCodeEditor 비제어형: 부모 value 가 바뀔 때만 revision 으로 되돌린다).
 *  - 편집기 → 부모 반영: 편집기 틀에서 초점이 빠질 때 onFlush(현재값) (탭/워크스페이스 전환 클릭도 blur 로 커버).
 *  - 부모 → 편집기 반영: value prop 이 바뀔 때만 setValue (워크스페이스 전환, 쿼리 바인더 실행, 묶기/초기화 등 명시적 변경만 통과).
 *  - 툴바(묶기/초기화)용으로 getValue/setValue 를 ref 로 노출.
 * monaco 테마는 전역이다 — 공용 편집기가 쓰는 dmes-code 하나를 그대로 쓰므로 상시 마운트된 로그 편집기의 강조가 유지된다.
 */

import { forwardRef, memo, useImperativeHandle, useRef, useState } from "react";
import {
  SqlCodeEditor,
  type SqlCodeEditorHandle,
  type SqlCompletionProvider,
} from "@dk-oasis/shared/code-editor";

/**
 * 이 편집기는 옛 모습 그대로다 — SQL 키워드 후보 없이 Monaco 기본 단어 제안만 쓰고(옛 동작), 줄바꿈 없음·Monaco 기본 글자 크기·여백 없음.
 * 공용 편집기 기본값(DB 뷰어 값)과 달라서 생성 옵션을 덮어쓴다.
 */
const NO_KEYWORD_COMPLETION: SqlCompletionProvider = {
  provide: () => [],
  keywords: () => false,
};
const BINDER_EDITOR_OPTIONS = {
  wordWrap: "off",
  // undefined = 공용 편집기의 13 을 취소하고 Monaco 의 OS별 기본값(옛 모습)으로 돌린다.
  fontSize: undefined,
  padding: { top: 0, bottom: 0 },
  scrollBeyondLastLine: true,
  lineNumbersMinChars: 5,
  wordBasedSuggestions: "matchingDocuments",
  acceptSuggestionOnEnter: "on",
} as const;

export interface SqlBinderEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
}

interface SqlBinderEditorProps {
  value: string;
  /** blur 시 편집기 현재값을 부모(워크스페이스 bindData)로 반영. */
  onFlush: (value: string) => void;
}

const SqlBinderEditor = forwardRef<SqlBinderEditorHandle, SqlBinderEditorProps>(
  function SqlBinderEditor({ value, onFlush }, ref) {
    const editorRef = useRef<SqlCodeEditorHandle>(null);
    // 부모 value 가 바뀔 때만 편집기를 되돌린다(비제어 + revision). 제어형이면 Monaco 가 뜰 때 대체 칸에서 친 글을 되돌려 버린다.
    const [prevValue, setPrevValue] = useState(value);
    const [revision, setRevision] = useState(0);
    if (prevValue !== value) {
      setPrevValue(value);
      setRevision((r) => r + 1);
    }
    // blur 구독을 다시 달지 않도록 콜백을 ref 로 유지.
    const onFlushRef = useRef(onFlush);
    onFlushRef.current = onFlush;

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => editorRef.current?.getValue() ?? value,
        setValue: (next: string) => {
          editorRef.current?.setValue(next);
        },
      }),
      [value],
    );

    return (
      <div
        className="anl-monaco-host"
        style={{ position: "relative" }}
        onBlur={() => onFlushRef.current(editorRef.current?.getValue() ?? "")}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <SqlCodeEditor
            ref={editorRef}
            defaultValue={value}
            revision={revision}
            height="100%"
            bordered={false}
            minimap
            expandable={false}
            highlightBinds={false}
            completionProvider={NO_KEYWORD_COMPLETION}
            editorOptions={BINDER_EDITOR_OPTIONS}
            ariaLabel="바인드 SQL"
          />
        </div>
      </div>
    );
  },
);

export default memo(SqlBinderEditor);
