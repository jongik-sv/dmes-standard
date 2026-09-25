"use client";

/** REGEX 미리보기 결과(compare, TSK-07-02 design.md §2) — 문법 오류면 invalid 문구만, 아니면 매칭 건수·코드 목록. */
import type { ComparePreview } from "../types";

export interface PreviewPanelProps {
  preview: ComparePreview | null;
}

export function PreviewPanel({ preview }: PreviewPanelProps) {
  if (!preview) {
    return null;
  }
  if (preview.invalid) {
    return (
      <p data-testid="preview-invalid" style={{ color: "var(--color-danger)", padding: "0 var(--spacing-sm)" }}>
        정규식 문법이 올바르지 않습니다
      </p>
    );
  }
  return (
    <div data-testid="preview-panel" style={{ padding: "0 var(--spacing-sm)" }}>
      <p data-testid="preview-count">매칭 {preview.count ?? 0}건</p>
      <ul>
        {(preview.codes ?? []).slice(0, 20).map((code) => <li key={code}>{code}</li>)}
      </ul>
    </div>
  );
}
