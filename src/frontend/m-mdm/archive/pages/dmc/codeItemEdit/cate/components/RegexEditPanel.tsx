"use client";

/**
 * REGEX 카테고리 편집 영역(TSK-06-04 design.md §1). defExpr·defTarget 입력만 하고 판정은 하지 않는다 — 화면은 정규식을
 * 실행하지 않는다(원천 04:183). 매 변경마다 부모가 `compare` 를 불러 재해석 결과(PreviewPanel)를 그린다.
 */
import { Input, Select } from "@dk-oasis/shared/form";
import { DEF_TARGET_OPTIONS } from "../types";
import { fieldLabel, fieldRow } from "./styles";

export interface RegexEditPanelProps {
  cateName: string;
  defExpr: string;
  defTarget: string;
  editable: boolean;
  onChangeName: (v: string) => void;
  onChangeExpr: (v: string) => void;
  onChangeTarget: (v: string) => void;
}

export function RegexEditPanel(props: RegexEditPanelProps) {
  const { cateName, defExpr, defTarget, editable, onChangeName, onChangeExpr, onChangeTarget } = props;
  return (
    <div data-testid="cate-regex-edit">
      <p style={fieldLabel}>REGEX 카테고리</p>
      <div style={fieldRow}>
        <span style={fieldLabel}>이름</span>
        <Input data-testid="cate-regex-name" value={cateName} disabled={!editable} onChange={onChangeName} />
      </div>
      <div style={fieldRow}>
        <span style={fieldLabel}>대상 칸</span>
        <Select data-testid="cate-regex-target" value={defTarget} disabled={!editable} onChange={onChangeTarget}
          options={DEF_TARGET_OPTIONS.map((t) => ({ value: t, label: t }))} />
      </div>
      <div style={fieldRow}>
        <span style={fieldLabel}>정규식</span>
        <Input data-testid="cate-regex-expr" value={defExpr} disabled={!editable} onChange={onChangeExpr}
          placeholder="예: 8[0-9]" />
      </div>
    </div>
  );
}
