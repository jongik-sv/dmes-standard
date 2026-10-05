/**
 * 룰 세트 목록 열 정의. 순수 함수로 두어 열 최소 폭 합·머리글 폭을 시험으로 고정한다(Local-Rules §30).
 * 세트 ID 링크를 누르면 `onOpenSet` 이 불린다.
 */
import type { GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle, fmtVer } from "@/shell";

export function buildRuleSetColumns(onOpenSet: (setId: string) => void): GridColumn[] {
  return [
    {
      key: "setId",
      meta: "MARU_RULE_SETS_ID",
      header: "세트 ID",
      width: 170,
      minWidth: 110,
      render: (value) => (
        <button
          type="button"
          data-testid={`set-link-${String(value)}`}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--color-primary)",
            textDecoration: "underline",
            font: "inherit",
          }}
          onClick={() => onOpenSet(String(value))}
        >
          {String(value)}
        </button>
      ),
    },
    { key: "setName", meta: "MARU_RULE_SETS_NM", header: "세트명", width: 180, minWidth: 90 },
    { key: "ruleCount", meta: false, header: "룰 수", width: 70, minWidth: 50, align: "center" },
    {
      key: "finalResults",
      meta: false,
      header: "최종 결과 변수",
      width: 180,
      minWidth: 100,
      render: (value) => {
        const names = Array.isArray(value) ? (value as string[]) : [];
        if (names.length === 0) return "-";
        return names.map((n) => (
          <code key={n} style={{ marginRight: 6 }}>
            {n}
          </code>
        ));
      },
    },
    { key: "inputCount", meta: false, header: "입력 변수 수", width: 90, minWidth: 80, align: "center" },
    { key: "description", meta: false, header: "설명", width: 200, minWidth: 90 },
    { key: "checkText", meta: false, header: "세트 검사", width: 130, minWidth: 60, align: "center" },
    {
      key: "ver",
      meta: false,
      header: "버전",
      width: 70,
      minWidth: 50,
      align: "center",
      render: (value, row) => <span data-testid={`rsm-ver-${String(row.setId)}`}>{fmtVer(value as string | null)}</span>,
    },
    {
      key: "status",
      meta: false,
      header: "상태",
      width: 100,
      minWidth: 70,
      align: "center",
      render: (value) => (
        <span style={badgeStyle(value === "INUSE" ? "success" : value === "DEPRECATED" ? "muted" : "neutral")}>{String(value ?? "")}</span>
      ),
    },
  ];
}
