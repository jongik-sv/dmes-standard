"use client";

import { Fragment, useState } from "react";
import { Button, Textarea } from "@dk-oasis/shared/form";

import { previewWidgetQuery } from "./api";
import { summarizeResult, SYSTEM_VARIABLES, type QueryResult } from "./format";

export interface SqlEditorProps {
  sql: string;
  /** 마지막 [쿼리 시험] 결과(정의 설정의 `__preview`). */
  preview: QueryResult | null;
  onSqlChange: (sql: string) => void;
  /** [쿼리 시험] 성공 — 편집기가 `__preview` 로 value 에 얹는다(관리 화면 미리보기가 이 결과로 그린다). */
  onPreview: (result: QueryResult) => void;
}

/**
 * 쿼리 유형 편집기 공용 SQL 칸(스펙 §6 끝·§10.1) — 고정폭 입력 칸 + 시스템 변수 안내 + [쿼리 시험](commWidgetMng/previewQuery, 행 상한 50).
 * 시험이 실패하면 서버 메시지(「쿼리 오류: …」 등)를 그대로 보인다(관리자 SQL 작성 도움 — §7.3).
 */
export function SqlEditor({ sql, preview, onSqlChange, onPreview }: SqlEditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    if (sql.trim() === "") {
      setError("SQL 을 입력하세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onPreview(await previewWidgetQuery("mcm", sql));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "쿼리를 시험하지 못했습니다");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wq-editor">
      <Textarea
        className="wq-sql"
        rows={10}
        value={sql}
        onChange={onSqlChange}
        placeholder={"SELECT ...\n  FROM ...\n WHERE DEPT_CD = :deptCd"}
        spellCheck={false}
        aria-label="SQL"
      />
      <div className="wq-hint">
        조회문(SELECT·WITH) 한 문장만 쓸 수 있습니다. 시스템 변수:{" "}
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
}
