"use client";

import React from "react";

export interface MatrixTableColumn {
  /** 컬럼 식별자 (예: scenarioId) */
  key: string;
  /** 헤더 표시 내용 */
  header: React.ReactNode;
  /** 강조 컬럼 (예: 기준 시나리오) — 헤더/셀 배경 강조 */
  highlight?: boolean;
}

export interface MatrixTableRow {
  /** 행 식별자 */
  key: string;
  /** 첫 컬럼(라벨) 내용 */
  label: React.ReactNode;
  /** 행 전체 강조 (예: 합계/종합 점수 행) */
  highlight?: boolean;
  /** 각 데이터 컬럼의 셀 내용 — column.key 로 조회 */
  renderCell: (columnKey: string) => React.ReactNode;
  /** 셀별 추가 스타일 (색상 등) */
  cellStyle?: (columnKey: string) => React.CSSProperties | undefined;
}

export interface MatrixTableProps {
  /** 좌상단 코너(첫 컬럼) 헤더 */
  cornerHeader: React.ReactNode;
  /** 데이터 컬럼 정의 (보통 시나리오) */
  columns: MatrixTableColumn[];
  /** 행 정의 (보통 KPI/코드/breakdown key) */
  rows: MatrixTableRow[];
  /** 데이터 셀 정렬. default "right" */
  align?: "left" | "right" | "center";
  className?: string;
}

/**
 * 비교 매트릭스(피벗) 표 — "첫 컬럼(라벨) + 동적 컬럼(시나리오 등) + 셀별 렌더" 구조의
 * 공통 컴포넌트. KPI 비교(Summary/Delta/Composite/Drill-down)·Exception 매트릭스 등에서 사용.
 *
 * sticky 헤더, 기준 컬럼/합계 행 강조, 셀별 색상(cellStyle)을 지원한다.
 * (외부 CSS 없이 인라인 스타일로 자급 — shared CSS 자동 로드 이슈 회피)
 */
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
const thBase: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f9fafb",
  textAlign: "left",
  fontWeight: 600,
  position: "sticky",
  top: 0,
};
const tdBase: React.CSSProperties = {
  padding: "6px 12px",
  borderBottom: "1px solid #f3f4f6",
};

export function MatrixTable({ cornerHeader, columns, rows, align = "right", className = "" }: MatrixTableProps) {
  return (
    <table className={`cm-matrix-table ${className}`.trim()} style={tableStyle}>
      <thead>
        <tr>
          <th style={thBase}>{cornerHeader}</th>
          {columns.map((c) => (
            <th key={c.key} style={c.highlight ? { ...thBase, background: "#f1f5f9" } : thBase}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} style={r.highlight ? { background: "#f1f5f9", fontWeight: 600 } : undefined}>
            <td style={tdBase}>{r.label}</td>
            {columns.map((c) => (
              <td
                key={c.key}
                style={{
                  ...tdBase,
                  textAlign: align,
                  ...(c.highlight && !r.highlight ? { background: "#f8fafc" } : {}),
                  ...(r.cellStyle?.(c.key) ?? {}),
                }}
              >
                {r.renderCell(c.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default MatrixTable;
