"use client";

import { Fragment, useState } from "react";
import { Button, Textarea } from "@dk-oasis/shared/form";

import { previewWidgetQuery } from "./api";
import { summarizeResult, SYSTEM_VARIABLES, usableParams, type QueryParam, type QueryResult } from "./format";

/** 수집 SQL 이 쓸 수 있는 시스템 변수 — 사용자 없는 실행이라 :userId·:deptCd 는 뺀다. */
const COLLECT_VARIABLES = SYSTEM_VARIABLES.filter((v) => v.name !== ":userId" && v.name !== ":deptCd");

export interface SqlEditorProps {
  sql: string;
  /** 입력 조건 정의 — [쿼리 시험] 이 이름이 올바른(usableParams) 정의를 서버에 보낸다(서버가 각 기본값으로 시험한다). 없거나 비면 보내지 않는다. */
  params?: QueryParam[];
  /** 정시 수집(collect) 정의의 SQL 칸 — 수집에는 사용자·입력 조건이 없어 안내 문구와 쓸 수 있는 시스템 변수가 다르다. 기본은 쿼리 위젯. */
  variant?: "query" | "collect";
  /** 마지막 [쿼리 시험] 결과(정의 설정의 `__preview`). */
  preview: QueryResult | null;
  onSqlChange: (sql: string) => void;
  /** [쿼리 시험] 성공 — 편집기가 `__preview` 로 value 에 얹는다(관리 화면 미리보기가 이 결과로 그린다). 실패하면 null — 이전 결과를 지운다. */
  onPreview: (result: QueryResult | null) => void;
}

/**
 * 쿼리 유형 편집기 공용 SQL 칸(스펙 §6 끝·§10.1) — 고정폭 입력 칸 + 시스템 변수 안내 + [쿼리 시험](commWidgetMng/previewQuery, 행 상한 50).
 * 시험이 실패하면 서버 메시지(「쿼리 오류: …」 등)를 그대로 보인다(관리자 SQL 작성 도움 — §7.3).
 */
export function SqlEditor({ sql, params, variant = "query", preview, onSqlChange, onPreview }: SqlEditorProps) {
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
      onPreview(await previewWidgetQuery("mcm", sql, params && usableParams(params)));
    } catch (e) {
      // 이전 시험 결과가 남으면 미리보기·필드 고르기가 지금 SQL 과 어긋난다.
      onPreview(null);
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
        placeholder={
          variant === "collect" ? "SELECT LINE, COUNT(*) AS CNT\n  FROM ...\n WHERE WORK_DT = :today\n GROUP BY LINE" : "SELECT ...\n  FROM ...\n WHERE DEPT_CD = :deptCd"
        }
        spellCheck={false}
        aria-label="SQL"
      />
      <div className="wq-hint">
        {variant === "collect" ? (
          <>조회문(SELECT·WITH) 한 문장만 쓸 수 있습니다. 수집에는 사용자가 없어 <code>:userId</code>·<code>:deptCd</code> 와 사용자 입력 조건은 쓸 수 없습니다. 시스템 변수:{" "}</>
        ) : (
          <>조회문(SELECT·WITH) 한 문장만 쓸 수 있습니다. 사용자가 넣는 값은 아래 「조회 조건」 에 선언한 <code>:이름</code> 으로 씁니다. 시스템 변수:{" "}</>
        )}
        {(variant === "collect" ? COLLECT_VARIABLES : SYSTEM_VARIABLES).map((v, i) => (
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
