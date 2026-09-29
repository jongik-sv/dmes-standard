"use client";

/**
 * REGEX 미리보기 결과(compare, TSK-07-02 design.md §2) — 문법 오류면 invalid 문구만, 아니면 매칭 건수·코드 목록.
 * D-104 부터 항목 편집 화면 오른쪽 열 위칸에 [카테고리] 탭일 때 놓인다. TABLE 이거나 아직 고르지 않았으면 안내만 보인다.
 */
import type { ComparePreview } from "../types";

export interface PreviewPanelProps {
  defKind: "REGEX" | "TABLE" | null;
  preview: ComparePreview | null;
}

const hint = { color: "var(--color-text-muted)", margin: 0 } as const;

function body(defKind: PreviewPanelProps["defKind"], preview: ComparePreview | null) {
  if (!defKind) return <p style={hint}>카테고리를 고르면 미리보기가 보입니다</p>;
  if (defKind === "TABLE") return <p style={hint}>TABLE 카테고리는 소속 목록이 곧 결과입니다</p>;
  if (!preview) return <p style={hint}>정규식을 입력하면 매칭 결과가 보입니다</p>;
  if (preview.invalid) {
    return (
      <p data-testid="preview-invalid" style={{ color: "var(--color-danger)", margin: 0 }}>
        정규식 문법이 올바르지 않습니다
      </p>
    );
  }
  return (
    <div data-testid="preview-panel">
      <p data-testid="preview-count">매칭 {preview.count ?? 0}건</p>
      <ul>
        {(preview.codes ?? []).slice(0, 20).map((code) => <li key={code}>{code}</li>)}
      </ul>
    </div>
  );
}

export function PreviewPanel({ defKind, preview }: PreviewPanelProps) {
  return (
    <div data-testid="cate-preview" style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>미리보기</span>
      {body(defKind, preview)}
    </div>
  );
}
