"use client";

/** 검사 목록(L-041)과 하위 도메인 재실행 결과 — 도메인검증 응답. 첫 오류에서 멈추지 않고 모두 보인다. */
import { useMemo } from "react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { issueLevelLabel, resultLabel } from "../change-view";
import type { IssueRow, TestResultRow } from "../types";
import { hint } from "./styles";

const ISSUE_COLUMNS: GridColumn[] = [
  { key: "CODE", header: "규칙", meta: false, width: 70, align: "center" },
  { key: "LEVEL", header: "수준", meta: false, width: 60, align: "center", render: (v) => issueLevelLabel(String(v ?? "")) },
  { key: "FIELD", header: "필드", meta: false, width: 110 },
  { key: "MESSAGE", header: "메시지", meta: false, width: 420 },
];

const DESC_COLUMNS: GridColumn[] = [
  { key: "DOMAIN_NAME", header: "하위 도메인", width: 150 },
  { key: "VALUE", header: "입력", meta: false, width: 100 },
  { key: "EXPECT", header: "기대", meta: false, width: 60, render: (v) => String(v) },
  { key: "RESULT", header: "결과", meta: false, width: 90, render: (v) => resultLabel(String(v ?? "")) },
];

export interface DomainCheckListProps {
  validated: boolean;
  ok: boolean | undefined;
  issues: IssueRow[];
  descendantResults: TestResultRow[];
  /** 검사 전 안내 문구. */
  pendingHint?: string;
}

export function DomainCheckList({ validated, ok, issues, descendantResults, pendingHint }: DomainCheckListProps) {
  const issueData = useMemo(() => issues.map((i, idx) => ({ ...i, ROW_KEY: idx })), [issues]);
  const descData = useMemo(() => descendantResults.map((r, idx) => ({ ...r, ROW_KEY: idx })), [descendantResults]);
  if (!validated) return <p style={hint}>{pendingHint ?? "[도메인검증] 을 누르면 검사 목록이 보입니다"}</p>;
  return (
    <div className="domain-mng__checks">
      <p className="domain-mng__check-summary" style={ok ? { color: "var(--color-success)" } : { color: "var(--color-danger)" }}>
        {ok ? "검사 통과" : "검사 실패"} — 오류 {issues.filter((i) => i.LEVEL === "ERROR").length}건 · 경고{" "}
        {issues.filter((i) => i.LEVEL === "WARN").length}건
      </p>
      {issues.length > 0 && (
        <AgDataGrid columnSizing="fit" columns={ISSUE_COLUMNS} data={issueData} rowKey="ROW_KEY"
          height={160} />
      )}
      {descendantResults.length > 0 && (
        <AgDataGrid columnSizing="fit" columns={DESC_COLUMNS} data={descData}
          rowKey="ROW_KEY" height={140} />
      )}
    </div>
  );
}
