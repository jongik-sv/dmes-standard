"use client";

/**
 * REGEX 카테고리 정의 편집(TSK-07-02 design.md §2). defTarget 후보는 D5 — 그 마루 데이터의 lvlCnt·라벨 있는 attr
 * 로만 제한한다(서버 `cateDefIssues` 는 이 정합을 검사하지 않는다). 정규식은 화면이 실행하지 않고, 값이 바뀔 때마다
 * 부모가 compare 를 불러 미리보기(PreviewPanel)를 새로 그린다.
 */
import { useEffect, useState } from "react";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { buildDefTargetOptions } from "../defTargetOptions";
import type { CateRow } from "../types";

export interface RegexEditPanelProps {
  cate: CateRow;
  lvlCnt: number;
  attrLabels: (string | null)[];
  canEdit: boolean;
  onSave: (cateName: string, defExpr: string, defTarget: string, description: string) => void;
  onPreview: (defExpr: string, defTarget: string) => void;
}

export function RegexEditPanel(props: RegexEditPanelProps) {
  const { cate, lvlCnt, attrLabels, canEdit, onSave, onPreview } = props;
  const [cateName, setCateName] = useState(cate.cateName ?? "");
  const [defExpr, setDefExpr] = useState(cate.defExpr ?? "");
  const [defTarget, setDefTarget] = useState(cate.defTarget ?? "KEY");
  const [description, setDescription] = useState(cate.description ?? "");

  useEffect(() => {
    setCateName(cate.cateName ?? "");
    setDefExpr(cate.defExpr ?? "");
    setDefTarget(cate.defTarget ?? "KEY");
    setDescription(cate.description ?? "");
  }, [cate.cateId, cate.cateName, cate.defExpr, cate.defTarget, cate.description]);

  const options = buildDefTargetOptions(lvlCnt, attrLabels);
  const disabled = !canEdit || !cate.open;

  return (
    <div data-testid="regex-edit-panel" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)",
      padding: "var(--spacing-sm)" }}>
      <p style={{ fontWeight: 600, margin: 0 }}>{cate.cateId} — REGEX 정의</p>
      <Input data-testid="regex-name" value={cateName} disabled={disabled} onChange={setCateName} />
      <Input data-testid="regex-expr" value={defExpr} disabled={disabled}
        onChange={(v) => { setDefExpr(v); onPreview(v, defTarget); }} placeholder="예: ^[0-9]+$" />
      <Select data-testid="regex-target" value={defTarget} disabled={disabled} options={options}
        onChange={(v) => { setDefTarget(v); onPreview(defExpr, v); }} />
      <Input data-testid="regex-desc" value={description} disabled={disabled} onChange={setDescription} />
      <Button data-testid="regex-save" size="sm" disabled={disabled}
        onClick={() => onSave(cateName, defExpr, defTarget, description)}>
        저장
      </Button>
    </div>
  );
}
