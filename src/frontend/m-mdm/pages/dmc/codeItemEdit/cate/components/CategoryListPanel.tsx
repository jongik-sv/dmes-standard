"use client";

/**
 * 카테고리 목록(좌측)+추가 폼(TSK-06-04 design.md §1·§2). BASE(cate_id="BASE")는 편집·닫기 버튼을 렌더링하지 않는다
 * (수용 기준 2, 서버 MDM012 와 짝). 행을 고르면 오른쪽 편집 영역(REGEX·TABLE)이 그 카테고리로 바뀐다. 합친 저장이
 * 거부되면 validate 의 카테고리 이슈(`cateIssues`) 가운데 그 행 cateId 의 것을 행에 붙여 보인다(D-101).
 */
import { useState, type MouseEvent } from "react";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { GridBadge } from "@dk-oasis/shared/grid";
import type { CategoryDef, CategoryEditRow } from "../categories";
import { BASE_CATE_ID, type Issue } from "../types";
import { fieldLabel, fieldRow, hint, issueText, toolbar } from "./styles";

export interface CategoryListPanelProps {
  rows: CategoryEditRow[];
  selectedCateId: string | null;
  onSelect: (cateId: string) => void;
  editable: boolean;
  canEdit: boolean;
  onAdd: (def: CategoryDef) => void;
  onRemove: (cateId: string) => void;
  onUndo: (cateId: string) => void;
  /** cateId 별 저장 검사 이슈. */
  issues?: Record<string, Issue[]>;
}

function badgeOf(row: CategoryEditRow): { label: string; bg: string; color: string } | null {
  if (row.__local === "deleted") return { label: "닫기", bg: "var(--color-danger-soft)", color: "var(--color-danger)" };
  if (row.__local === "new") return { label: "추가", bg: "var(--color-success-soft)", color: "var(--color-success)" };
  if (row.__local === "edited") return { label: "수정", bg: "var(--color-warning-soft)", color: "var(--color-warning)" };
  return null;
}

export function CategoryListPanel(props: CategoryListPanelProps) {
  const { rows, selectedCateId, onSelect, editable, canEdit, onAdd, onRemove, onUndo, issues = {} } = props;
  const [newCateId, setNewCateId] = useState("");
  const [newCateName, setNewCateName] = useState("");
  const [newDefKind, setNewDefKind] = useState<"REGEX" | "TABLE">("TABLE");

  const submitAdd = () => {
    if (!newCateId.trim() || !newCateName.trim()) return;
    onAdd({
      cateId: newCateId.trim(), cateName: newCateName.trim(), defKind: newDefKind,
      defExpr: newDefKind === "REGEX" ? ".*" : null, defTarget: newDefKind === "REGEX" ? "CODE" : null,
      description: null,
    });
    setNewCateId("");
    setNewCateName("");
  };

  return (
    <div data-testid="cate-list-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} data-testid="cate-list">
        {rows.length === 0 && <p style={{ ...hint, padding: "var(--spacing-sm)" }}>카테고리가 없습니다</p>}
        {rows.map((row) => {
          const isBase = row.cateId === BASE_CATE_ID;
          const badge = badgeOf(row);
          const rowIssues = issues[row.cateId] ?? [];
          return (
            <div key={row.cateId} data-testid={`cate-row-${row.cateId}`}
              onClick={() => onSelect(row.cateId)}
              style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-xs)",
                padding: "var(--spacing-xs) var(--spacing-sm)", cursor: "pointer",
                background: selectedCateId === row.cateId ? "var(--color-surface-selected)" : undefined,
                opacity: row.__local === "deleted" ? 0.6 : 1,
              }}>
              <span style={{ fontWeight: 600 }}>{row.cateId}</span>
              <span>{row.cateName}</span>
              <GridBadge label={row.defKind} />
              {badge && <GridBadge label={badge.label} bg={badge.bg} color={badge.color} />}
              {rowIssues.length > 0 && (
                // 이슈 문구는 버튼을 밀어내지 않게 행 아래 한 줄로 내린다(order·flexBasis).
                <span data-testid={`cate-row-issue-${row.cateId}`} style={{ ...issueText, order: 1, flexBasis: "100%" }}
                  title={rowIssues.map((i) => i.code).join(", ")}>
                  {rowIssues.map((i) => i.message).join(" · ")}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {editable && canEdit && !isBase && row.__local === "none" && (
                <Button data-testid={`cate-close-${row.cateId}`} size="mini"
                  onClick={(e: MouseEvent) => { e.stopPropagation(); onRemove(row.cateId); }}>
                  닫기
                </Button>
              )}
              {editable && canEdit && row.__local !== "none" && (
                <Button data-testid={`cate-undo-${row.cateId}`} size="mini"
                  onClick={(e: MouseEvent) => { e.stopPropagation(); onUndo(row.cateId); }}>
                  취소
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {editable && canEdit && (
        <div style={{ ...toolbar, flexDirection: "column", alignItems: "stretch", borderTop: "1px solid var(--color-border)" }}>
          <p style={fieldLabel}>카테고리 추가</p>
          <div style={fieldRow}>
            <span style={fieldLabel}>ID</span>
            <Input data-testid="cate-add-id" value={newCateId} onChange={setNewCateId} placeholder="cate_id" />
          </div>
          <div style={fieldRow}>
            <span style={fieldLabel}>이름</span>
            <Input data-testid="cate-add-name" value={newCateName} onChange={setNewCateName} placeholder="카테고리 이름" />
          </div>
          <div style={fieldRow}>
            <span style={fieldLabel}>종류</span>
            <Select data-testid="cate-add-kind" value={newDefKind} onChange={(v) => setNewDefKind(v as "REGEX" | "TABLE")}
              options={[{ value: "TABLE", label: "TABLE" }, { value: "REGEX", label: "REGEX" }]} />
          </div>
          <Button data-testid="cate-add-submit" size="sm" onClick={submitAdd}>추가</Button>
        </div>
      )}
    </div>
  );
}
