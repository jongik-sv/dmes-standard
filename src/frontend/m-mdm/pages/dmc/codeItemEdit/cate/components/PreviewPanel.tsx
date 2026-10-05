"use client";

/**
 * 카테고리 탭 미리보기 패널(TSK-06-04 design.md §1) — REGEX 후보 정의의 서버 재해석 결과(compare)를 보인다. 코드 편집
 * 화면 오른쪽 미리보기 자리에 카테고리 탭일 때만 놓인다(코드·트리 탭은 ../../components/PreviewPanel, 저장된 정의 기준,
 * D-101). 편집 중 후보값을 매 변경마다 다시 부른다. 정규식 실행은 하지 않는다(원천 04:183) — 여기 그리는 값은 모두 서버가
 * 돌려준 것이다. TABLE 카테고리를 고르면 이 패널은 안내 문구만 보인다(소속 여부는 TransferListPanel 이 이미 들고 있다).
 */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import type { PreviewResult } from "../types";
import { hint, issueText, toolbar } from "./styles";

export interface PreviewPanelProps {
  defKind: "REGEX" | "TABLE" | null;
  result: PreviewResult | null;
}

export function PreviewPanel({ defKind, result }: PreviewPanelProps) {
  const columns: GridColumn[] = [
    { key: "code", header: "코드", width: 140 },
    { key: "name", header: "이름", meta: false, width: 160 },
    { key: "targetValue", header: "대상 값", meta: false, width: 140 },
    { key: "hitMark", header: "해당", meta: false, width: 60, align: "center" },
  ];
  const rows = (result?.rows ?? []).map((r) => ({ ...r, hitMark: r.hit ? "●" : "○" }));

  if (defKind === "TABLE") {
    return <p data-testid="cate-preview" style={{ ...hint, padding: "var(--spacing-sm)" }}>
      TABLE 카테고리는 소속 목록이 곧 결과입니다 — 서버 재해석이 필요 없습니다.
    </p>;
  }

  return (
    <div data-testid="cate-preview" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {result && (
        <div style={toolbar}>
          <span data-testid="cate-preview-summary" style={hint}>
            {`${result.hitCount ?? 0} / ${result.total ?? 0}건 해당`}
          </span>
          {result.invalidExpression && (
            <span data-testid="cate-preview-invalid" style={issueText}>정규식 문법 오류로 해석하지 못했습니다</span>
          )}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 160 }}>
        <AgDataGrid columns={columns} data={rows} rowKey="code" columnSizing="fit"
          emptyMessage="미리볼 코드가 없습니다." />
      </div>
      {(result?.warnings ?? []).map((w) => (
        <p key={`${w.code}-${w.itemKey}`} style={issueText}>{`${w.itemKey ?? ""} — ${w.message}`}</p>
      ))}
    </div>
  );
}
