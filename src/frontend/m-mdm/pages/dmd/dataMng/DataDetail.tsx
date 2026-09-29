"use client";

/**
 * dataMng 오른쪽 상세(옛 dataEdit 화면 본문, 2026-09-29 통합 D-104) — 카드 내용 컴포넌트 셋.
 *
 * Part B §4-3 MUST: 분할 영역(ContentBody/ContentPanel)은 직접 자식이어야 drag bar 가 붙는다 — 그래서 이 파일은
 * 카드 **내용**만 반환하고 골격은 `page.tsx` 가 직접 그린다(codeMng/CodeDetail.tsx 와 같은 구조).
 * 저장·폐기는 옛 dataEdit 그대로 `dataEdit` 서비스를 부르고 권한도 `canDoButton(rbac,"dataEdit",action)` 으로 본다.
 * `allowed`(busy·권한 판정)는 page.tsx 가 한 번만 계산해 내려준다.
 */
import { useCallback } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { ATTR_KEYS, LVL_CNT_OPTIONS, type CategorySummaryRow, type AttrKey, type DataEditView, type HeaderForm } from "./edit-types";

export const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const cardTitle = { padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 } as const;

const CATEGORY_COLUMNS: GridColumn[] = [
  { key: "cateId", header: "카테고리 ID", width: 120, align: "left" },
  { key: "cateName", header: "이름", width: 140, align: "left" },
  { key: "defKind", header: "종류", width: 80, align: "center" },
  { key: "open", header: "열림", width: 70, align: "center", render: (v) => (v ? "열림" : "닫힘") },
  { key: "matchCount", header: "매칭 건수", width: 90, align: "right" },
];

/** busy·권한을 함께 보는 판정 — page.tsx 가 만들어 카드에 내려준다. */
export type Allowed = (enabled: boolean, action: string) => boolean;

// ── ① 헤더 ──

export interface DataHeaderCardProps {
  view: DataEditView;
  form: HeaderForm;
  disabled: boolean;
  onFieldChange: (key: keyof HeaderForm, value: string) => void;
}

export function DataHeaderCard({ view, form, disabled, onFieldChange }: DataHeaderCardProps) {
  return (
    <>
      <p style={cardTitle}>① 헤더</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>마루 데이터 ID</th>
            <td style={DETAIL_VALUE_CELL} data-testid="data-edit-id">{view.maruDataId}</td>
            <th style={DETAIL_LABEL_CELL}>원천</th>
            <td style={DETAIL_VALUE_CELL}>{view.sourceKind}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>상태</th>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              <span data-testid="data-edit-status">{view.status}</span>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>이름 *</th>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              <Input
                data-testid="data-edit-name"
                value={form.maruDataName}
                maxLength={100}
                disabled={disabled}
                onChange={(v) => onFieldChange("maruDataName", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>키 패턴 *</th>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              <Input
                data-testid="data-edit-pattern"
                value={form.codePattern}
                disabled={disabled}
                onChange={(v) => onFieldChange("codePattern", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              <Input
                data-testid="data-edit-desc"
                value={form.description}
                disabled={disabled}
                onChange={(v) => onFieldChange("description", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>계층 칸 수</th>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              <Select
                data-testid="data-edit-lvl"
                value={form.lvlCnt}
                options={LVL_CNT_OPTIONS}
                disabled={disabled}
                onChange={(v) => onFieldChange("lvlCnt", v)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ── ② 추가 컬럼 라벨 ──

export interface DataLabelsCardProps {
  form: HeaderForm;
  disabled: boolean;
  onFieldChange: (key: keyof HeaderForm, value: string) => void;
}

export function DataLabelsCard({ form, disabled, onFieldChange }: DataLabelsCardProps) {
  return (
    <>
      <p style={cardTitle}>② 추가 컬럼 라벨</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          {ATTR_KEYS.map((key: AttrKey, i) => (
            <tr key={key}>
              <th style={DETAIL_LABEL_CELL}>{`attr${String(i + 1).padStart(2, "0")}`}</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid={`data-edit-${key}`}
                  value={form[key]}
                  maxLength={100}
                  disabled={disabled}
                  onChange={(v) => onFieldChange(key, v)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ── ③ 카테고리 요약 ──

export interface DataCategoryCardProps {
  view: DataEditView;
  allowed: Allowed;
  editable: boolean;
  itemEditEnabled: boolean;
  onSaveHeader: () => void;
  onDeprecate: () => void;
  onItemEdit: () => void;
}

export function DataCategoryCard({ view, allowed, editable, itemEditEnabled, onSaveHeader, onDeprecate, onItemEdit }: DataCategoryCardProps) {
  const { showMessage } = useMessage();
  const canSave = allowed(editable, "save");
  const canDeprecate = allowed(editable, "delete");

  const handleDeprecate = useCallback(() => {
    showMessage({
      title: "확인",
      message: "폐기하면 이 마루 데이터의 저장·항목 편집을 더 할 수 없습니다. 폐기할까요?",
      alertType: "confirm",
      onConfirm: onDeprecate,
    });
  }, [onDeprecate, showMessage]);

  return (
    <>
      <p style={cardTitle}>
        ③ 카테고리 요약 · 항목 <span data-testid="data-edit-item-count">{view.itemCount}</span>건
      </p>
      <div data-testid="data-edit-categories" style={{ padding: "var(--spacing-xs) var(--spacing-md)" }}>
        <AgDataGrid
          columnSizing="fit"
          height="auto"
          columns={CATEGORY_COLUMNS}
          data={view.categories as CategorySummaryRow[] as unknown as Record<string, unknown>[]}
          rowKey="cateId"
          emptyMessage="카테고리가 없습니다"
          emptyTestId="data-edit-categories-empty"
        />
      </div>
      <div style={{ display: "flex", gap: "var(--spacing-sm)", padding: "var(--spacing-sm) var(--spacing-md)" }}>
        <Button data-testid="data-edit-save" variant="primary" disabled={!canSave} onClick={onSaveHeader}>
          헤더 저장
        </Button>
        <Button data-testid="data-edit-deprecate" variant="danger" disabled={!canDeprecate} onClick={handleDeprecate}>
          폐기
        </Button>
        <span style={{ marginLeft: "auto" }}>
          <Button data-testid="data-edit-item-edit" disabled={!itemEditEnabled} onClick={onItemEdit}>
            항목 편집 →
          </Button>
        </span>
      </div>
    </>
  );
}
