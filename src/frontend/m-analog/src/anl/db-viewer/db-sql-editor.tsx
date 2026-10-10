"use client";

/**
 * DB 뷰어 (anl/dbViewer) — SQL 편집창. 공용 `SqlCodeEditor`(@dk-oasis/shared/code-editor) 위의 얇은 어댑터다.
 * Monaco 로더·전역 테마(dmes-code)·키 연결·표/칸 끼우기는 shared 가 맡고, 여기는 DB 뷰어 데이터만 끼운다.
 *
 * 비제어 방식 — 타이핑마다 부모(그리드가 있는 화면 루트)를 다시 그리지 않는다.
 *  - 부모는 ref 의 getValue 로 실행 직전에만 현재 SQL 을 읽는다.
 *  - 테이블 선택처럼 부모가 SQL 을 바꿀 때만(value·revision 변경) 편집기 내용을 바꾼다.
 *  - Ctrl/⌘+Enter 와 F8 은 onRun 을 부른다.
 *  - 자동 완성은 SQL 키워드·표·칸만 낸다(단어 기반 제안은 끈다). 후보 공급자는 sql-completion.ts.
 *  - 화면이 칸 이름·셀 값을 넣을 때는 핸들의 insertAtCursor 를 쓴다(실행 취소 가능, 초점은 편집창으로).
 */

import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  SqlCodeEditor,
  type InsertPoint,
  type SqlCodeEditorHandle,
} from "@dk-oasis/shared/code-editor";
import { fetchColumns } from "./db-viewer-api";
import { cachedColumnLoader, createDbSqlCompletion } from "./sql-completion";

export type { InsertPoint };

export interface DbSqlEditorHandle {
  getValue: () => string;
  /** 지금 커서(선택 영역) 위치를 잡아 둔다. 비동기 작업 뒤에 그 자리에 끼우려고 쓴다. 편집창이 아직 안 떴으면 null. */
  captureInsertPoint: () => InsertPoint | null;
  /**
   * 커서 위치(선택 영역이 있으면 그 자리)에 글을 끼우고 편집창으로 초점을 옮긴다.
   * kind "column" 은 칸 이름(목록 안이면 쉼표), "value" 는 SQL 리터럴(필요할 때만 공백).
   * `at` 이 있고 그 뒤로 편집창 내용이 바뀌지 않았으면 그 자리에 끼운다.
   * 그 사이 다른 글이 들어갔거나 타이핑이 있었으면 오프셋이 어긋나므로 지금 커서에 끼운다.
   * 편집창이 아직 안 떴으면 false.
   */
  insertAtCursor: (
    text: string,
    kind: "column" | "value",
    at?: InsertPoint | null,
  ) => boolean;
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
    const editorRef = useRef<SqlCodeEditorHandle>(null);

    // 자동 완성이 호출 때마다 최신 표 목록을 읽도록 ref 로 둔다.
    const tablesRef = useRef(tablesBySchema);
    tablesRef.current = tablesBySchema;
    // 표 단위 칸 목록 캐시 — 편집창이 살아 있는 동안 유지한다.
    const completionProvider = useMemo(() => {
      const loadColumns = cachedColumnLoader(async (schema, table) =>
        (await fetchColumns(schema, table)).map((c) => c.COLUMN_NAME),
      );
      return createDbSqlCompletion({
        getTables: () => tablesRef.current,
        loadColumns,
      });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => editorRef.current?.getValue() ?? value,
        captureInsertPoint: () =>
          editorRef.current?.captureInsertPoint() ?? null,
        insertAtCursor: (text, kind, at) =>
          editorRef.current?.insertAtCursor(text, kind, at) ?? false,
      }),
      [value],
    );

    // 표를 고르면 SQL 이 `SELECT * FROM …` 으로 바뀐다 — `*` 를 선택해 두면 칸 이름을 더블클릭해 넣을 때
    // 커서가 문서 맨 앞(1:1)이라 SQL 이 깨지는 대신 `*` 자리를 칸 이름이 대신한다.
    // (SqlCodeEditor 의 값 되돌리기 효과가 먼저 돌고, 이 효과가 그 뒤에 선택을 맞춘다.)
    const firstRef = useRef(true);
    useEffect(() => {
      if (firstRef.current) {
        firstRef.current = false;
        return;
      }
      const star = /^SELECT (\*) FROM\b/i.exec(value);
      if (star) {
        const at = star[0].indexOf("*");
        editorRef.current?.setSelection(at, at + 1);
      }
    }, [value, revision]);

    return (
      <div className="anl-db-sql-host">
        <SqlCodeEditor
          ref={editorRef}
          defaultValue={value}
          revision={revision}
          onRun={onRun}
          completionProvider={completionProvider}
          height="100%"
          bordered={false}
          expandable={false}
          ariaLabel="SQL"
          highlightBinds={false}
        />
      </div>
    );
  },
);

export default memo(DbSqlEditor);
