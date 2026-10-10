"use client";

import { Fragment, memo, useRef, useState } from "react";
import { SqlCodeEditor } from "@dk-oasis/shared/code-editor";
import { Button } from "@dk-oasis/shared/form";

import { previewWidgetQuery } from "./api";
import { summarizeResult, SYSTEM_VARIABLES, usableParams, type QueryParam, type QueryResult } from "./format";

export interface SqlEditorProps {
  sql: string;
  /** 입력 조건 정의 — [쿼리 시험] 이 이름이 올바른(usableParams) 정의를 서버에 보낸다(서버가 각 기본값으로 시험한다). 없거나 비면 보내지 않는다. */
  params?: QueryParam[];
  /** 마지막 [쿼리 시험] 결과(정의 설정의 `__preview`). */
  preview: QueryResult | null;
  onSqlChange: (sql: string) => void;
  /** [쿼리 시험] 성공 — 편집기가 `__preview` 로 value 에 얹는다(관리 화면 미리보기가 이 결과로 그린다). 실패하면 null — 이전 결과를 지운다. */
  onPreview: (result: QueryResult | null) => void;
  /** [쿼리 시험] 호출 함수. 없으면 위젯 관리의 `commWidgetMng/previewQuery`(`previewWidgetQuery("mcm", …)`)를 부른다. 공용 쿼리 관리 화면이 자기 미리보기를 넘긴다. */
  runPreview?: (sql: string, params?: QueryParam[]) => Promise<QueryResult>;
}

/**
 * 쿼리 유형 편집기 공용 SQL 칸(스펙 §6 끝·§10.1) — 고정폭 입력 칸 + 시스템 변수 안내 + [쿼리 시험](commWidgetMng/previewQuery, 행 상한 50).
 * 시험이 실패하면 서버 메시지(「쿼리 오류: …」 등)를 그대로 보인다(관리자 SQL 작성 도움 — §7.3).
 */
export const SqlEditor = memo(function SqlEditor({ sql, params, preview, onSqlChange, onPreview, runPreview }: SqlEditorProps) {
  const [busy, setBusy] = useState(false);
  // 단축키(Ctrl/⌘+Enter, F8)로도 시험하므로 버튼의 disabled 만으로는 겹쳐 부르는 것을 못 막는다 — 렌더 사이에도 보이는 ref 로 막는다.
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    if (busyRef.current) return;
    if (sql.trim() === "") {
      setError("SQL 을 입력하세요");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const usable = params && usableParams(params);
      onPreview(await (runPreview ? runPreview(sql, usable) : previewWidgetQuery("mcm", sql, usable)));
    } catch (e) {
      // 이전 시험 결과가 남으면 미리보기·필드 고르기가 지금 SQL 과 어긋난다.
      onPreview(null);
      setError(e instanceof Error && e.message ? e.message : "쿼리를 시험하지 못했습니다");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="wq-editor">
      <SqlCodeEditor
        value={sql}
        onChange={onSqlChange}
        onRun={() => void runTest()}
        height={220}
        placeholder={"SELECT ...\n  FROM ...\n WHERE DEPT_CD = :deptCd"}
        ariaLabel="SQL"
        expandTitle="쿼리 SQL"
        testId="wq-sql"
      />
      <div className="wq-hint">
        조회문(SELECT·WITH) 한 문장만 쓸 수 있습니다. 사용자가 넣는 값은 아래 「조회 조건」 에 선언한 <code>:이름</code> 으로 씁니다. 시스템 변수:{" "}
        {SYSTEM_VARIABLES.map((v, i) => (
          <Fragment key={v.name}>
            {i > 0 && " · "}
            <code>{v.name}</code> {v.desc}
          </Fragment>
        ))}
      </div>
      <div className="wq-tools">
        <Button onClick={() => void runTest()} disabled={busy} data-testid="wq-preview-run">
          {busy ? "시험 중…" : "쿼리 시험"}
        </Button>
        {preview && !error && (
          <span className="wq-summary" data-testid="wq-preview-summary">
            {summarizeResult(preview)}
          </span>
        )}
      </div>
      {error && (
        <span className="form-error-message" role="alert" data-testid="wq-preview-error">
          {error}
        </span>
      )}
    </div>
  );
});
