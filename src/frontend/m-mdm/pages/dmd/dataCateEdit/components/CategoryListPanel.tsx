"use client";

/**
 * 카테고리 목록(좌측)+등록 폼(TSK-07-02 design.md §2). BASE(cate_id="BASE")는 닫기·다시 열기 버튼을 렌더링하지
 * 않는다(R6, 서버 MDM012 와 짝). 행을 고르면 오른쪽 편집 영역이 그 카테고리로 바뀐다.
 */
import { useState, type MouseEvent } from "react";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { GridBadge } from "@dk-oasis/shared/grid";
import { BASE_CATE_ID, type CateRow } from "../types";

export interface CategoryListPanelProps {
  rows: CateRow[];
  selectedCateId: string | null;
  onSelect: (cateId: string) => void;
  canEdit: boolean;
  onClose: (cateId: string) => void;
  onReopen: (cateId: string) => void;
  onAdd: (cateId: string, cateName: string, defKind: "REGEX" | "TABLE") => void;
}

export function CategoryListPanel(props: CategoryListPanelProps) {
  const { rows, selectedCateId, onSelect, canEdit, onClose, onReopen, onAdd } = props;
  const [newCateId, setNewCateId] = useState("");
  const [newCateName, setNewCateName] = useState("");
  const [newDefKind, setNewDefKind] = useState<"REGEX" | "TABLE">("TABLE");

  const submitAdd = () => {
    if (!newCateId.trim() || !newCateName.trim()) return;
    onAdd(newCateId.trim(), newCateName.trim(), newDefKind);
    setNewCateId("");
    setNewCateName("");
  };

  return (
    <div data-testid="cate-list-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} data-testid="cate-list">
        {rows.length === 0 && (
          <p data-testid="cate-list-empty" style={{ padding: "var(--spacing-sm)", color: "var(--color-text-muted)" }}>
            카테고리가 없습니다
          </p>
        )}
        {rows.map((row) => {
          const isBase = row.cateId === BASE_CATE_ID;
          return (
            <div key={row.cateId} data-testid={`cate-row-${row.cateId}`} onClick={() => onSelect(row.cateId)}
              style={{
                display: "flex", alignItems: "center", gap: "var(--spacing-xs)",
                padding: "var(--spacing-xs) var(--spacing-sm)", cursor: "pointer",
                background: selectedCateId === row.cateId ? "var(--color-surface-selected)" : undefined,
                opacity: row.open ? 1 : 0.6,
              }}>
              <span style={{ fontWeight: 600 }}>{row.cateId}</span>
              <span>{row.cateName}</span>
              <GridBadge label={row.defKind} />
              <span data-testid={`cate-match-${row.cateId}`} style={{ color: "var(--color-text-muted)" }}>
                {row.matchCount}건
              </span>
              <span style={{ flex: 1 }} />
              {canEdit && !isBase && row.open && (
                <Button data-testid={`cate-close-${row.cateId}`} size="mini"
                  onClick={(e: MouseEvent) => { e.stopPropagation(); onClose(row.cateId); }}>
                  닫기
                </Button>
              )}
              {canEdit && !isBase && !row.open && (
                <Button data-testid={`cate-reopen-${row.cateId}`} size="mini"
                  onClick={(e: MouseEvent) => { e.stopPropagation(); onReopen(row.cateId); }}>
                  다시 열기
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div style={{
          display: "flex", flexDirection: "column", gap: "var(--spacing-xs)", padding: "var(--spacing-sm)",
          borderTop: "1px solid var(--color-border)",
        }}>
          <p style={{ fontWeight: 600, margin: 0 }}>카테고리 등록</p>
          <Input data-testid="cate-add-id" value={newCateId} onChange={setNewCateId} placeholder="cate_id" />
          <Input data-testid="cate-add-name" value={newCateName} onChange={setNewCateName} placeholder="카테고리 이름" />
          <Select data-testid="cate-add-kind" value={newDefKind} onChange={(v) => setNewDefKind(v as "REGEX" | "TABLE")}
            options={[{ value: "TABLE", label: "TABLE" }, { value: "REGEX", label: "REGEX" }]} />
          <Button data-testid="cate-add-submit" size="sm" onClick={submitAdd}>등록</Button>
        </div>
      )}
    </div>
  );
}
