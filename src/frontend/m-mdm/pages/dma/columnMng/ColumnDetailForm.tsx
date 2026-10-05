"use client";

/**
 * columnMng 컬럼 상세 — 상세 표와 시스템별 실제 필드명 그리드.
 *
 * 입력 state 는 이 컴포넌트에만 둔다(Screen-Performance-Guide R12). 화면 루트가 폼을 들고 있으면 한 글자마다 루트 아래
 * 268개 컴포넌트가 다시 그려졌다(docs/perf-render/mdm-after-fix.md §3.2). 루트는 `ref` 핸들로 폼을 채우고(`load`)·
 * 자동 생성 결과 일부를 덮어쓰고(`apply`)·저장 때 읽는다(`getForm`·`getSystemRows`). 저장 단추가 루트 머리 버튼 줄에 있고,
 * [상세에 적용]은 다른 칸에 친 값을 지킨 채 일부 칸만 바꿔야 하기 때문이다.
 */
import { memo, useCallback, useImperativeHandle, useMemo, useState, type Ref } from "react";

import { ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, getRowIdentifier, type GridColumn } from "@dk-oasis/shared/grid";
import { Input, Select } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { DomainField } from "@/domain";

import { searchDomains } from "./api";
import { DescriptionField } from "./DescriptionField";
import { resolveLabels } from "./labels";
import { mutedText, panelScrollStyle, panelTitleStyle, rowStyle } from "./styles";
import { emptyForm, type ColumnForm, type SystemOption } from "./types";
import { DESCRIPTION_LABEL } from "@/ui-meta";

export const SYSTEM_ROW_KEY = "__rowId";

export type SystemGridRow = Record<string, unknown> & {
  systemCode: string;
  physName: string;
  transform: string;
  note: string;
};

/** 루트가 상세 폼과 대화하는 핸들. */
export type ColumnDetailHandle = {
  /** 폼을 새로 채운다(행 열기·신규·저장 뒤 다시 읽기). 설명·활용처 메모 칸 형식도 다시 판별한다. */
  load(next: { form: ColumnForm; domainLabel: string; systemRows: SystemGridRow[] }): void;
  /** [상세에 적용] — 자동 생성 결과로 일부 칸만 덮어쓴다. 다른 칸 입력은 그대로 둔다. */
  apply(next: { patch: Partial<ColumnForm>; domainLabel?: string; appliedPhys: string | null }): void;
  getForm(): ColumnForm;
  getSystemRows(): SystemGridRow[];
};

type Props = {
  ref: Ref<ColumnDetailHandle>;
  /** 시스템 콤보 값. */
  systems: SystemOption[];
  /** 설명 칸의 형식 바꾸기 확인(공용 확인창). */
  confirm: (message: string) => Promise<boolean>;
};

export const ColumnDetailForm = memo(function ColumnDetailForm({ ref, systems, confirm }: Props) {
  const [form, setForm] = useState<ColumnForm>(emptyForm);
  /** 폼을 새로 채운 횟수 — 설명·활용처 메모 칸을 새로 그려 형식([글 | HTML])을 다시 판별한다(행 열기·다시 읽기·신규). */
  const [formSeq, setFormSeq] = useState(0);
  /** 도메인 칸에 보일 글자 — form.domainId 는 ID 만 갖는다. */
  const [domainLabel, setDomainLabel] = useState("");
  const [appliedPhys, setAppliedPhys] = useState<string | null>(null);
  const [systemRows, setSystemRows] = useState<SystemGridRow[]>([]);
  const [selectedSystemKey, setSelectedSystemKey] = useState<string | number | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      load: (next) => {
        setForm(next.form);
        setFormSeq((n) => n + 1);
        setDomainLabel(next.domainLabel);
        setAppliedPhys(null);
        setSystemRows(next.systemRows);
        setSelectedSystemKey(null);
      },
      apply: (next) => {
        setForm((prev) => ({ ...prev, ...next.patch }));
        if (next.domainLabel !== undefined) setDomainLabel(next.domainLabel);
        setAppliedPhys(next.appliedPhys);
      },
      getForm: () => form,
      getSystemRows: () => systemRows,
    }),
    [form, systemRows],
  );

  const change = useCallback((key: keyof ColumnForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: key === "physName" ? value.toUpperCase() : value,
    }));
  }, []);

  const labelPreview = resolveLabels({
    columnName: form.columnName,
    labelLong: form.labelLong,
    labelMid: form.labelMid,
    labelShort: form.labelShort,
  });
  const physMismatch = appliedPhys != null && form.physName !== "" && form.physName !== appliedPhys;

  return (
    <ContentPanel flex="1.2 1 0">
      <div style={panelScrollStyle}>
        <p style={panelTitleStyle}>컬럼 상세</p>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="columnName" label="논리명" required /></th>
              <td style={DETAIL_VALUE_CELL} colSpan={3}>
                <Input
                  data-testid="form-column-name"
                  value={form.columnName}
                  maxLength={100}
                  onChange={(v) => change("columnName", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="physName" label="표준 물리명" required /></th>
              <td style={DETAIL_VALUE_CELL} colSpan={3}>
                <Input
                  data-testid="form-phys-name"
                  value={form.physName}
                  maxLength={50}
                  onChange={(v) => change("physName", v)}
                />
                {physMismatch ? (
                  <span
                    style={{
                      ...mutedText,
                      color: "var(--color-warning)",
                    }}
                  >
                    약어 조합({appliedPhys})과 다릅니다. 저장은 막지
                    않습니다.
                  </span>
                ) : null}
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="labelLong" meta={false} label="표시명 긴/중간/짧은" /></th>
              <td style={DETAIL_VALUE_CELL} colSpan={3}>
                <div style={rowStyle}>
                  <Input
                    data-testid="form-label-long"
                    value={form.labelLong}
                    maxLength={24}
                    onChange={(v) => change("labelLong", v)}
                    style={{ width: 200 }}
                  />
                  <Input
                    data-testid="form-label-mid"
                    value={form.labelMid}
                    maxLength={12}
                    onChange={(v) => change("labelMid", v)}
                    style={{ width: 130 }}
                  />
                  <Input
                    data-testid="form-label-short"
                    value={form.labelShort}
                    maxLength={6}
                    onChange={(v) => change("labelShort", v)}
                    style={{ width: 90 }}
                  />
                </div>
                <span data-testid="form-label-preview" style={mutedText}>
                  표시: {labelPreview.labelLong} / {labelPreview.labelMid}{" "}
                  / {labelPreview.labelShort}
                </span>
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="domainId" label="도메인" /></th>
              <td style={DETAIL_VALUE_CELL}>
                <DomainField
                  testId="form-domain"
                  domainId={form.domainId === "" ? null : Number(form.domainId)}
                  label={domainLabel}
                  search={searchDomains}
                  onChange={(row) => {
                    setDomainLabel(row ? row.domainName || row.stdName : "");
                    change("domainId", row ? String(row.domainId) : "");
                  }}
                />
              </td>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="required" label="필수" /></th>
              <td style={DETAIL_VALUE_CELL}>
                <Select
                  data-testid="form-required"
                  value={form.required}
                  options={["Y", "N"]}
                  onChange={(v) => change("required", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="defaultValue" label="기본값" /></th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  value={form.defaultValue}
                  maxLength={50}
                  onChange={(v) => change("defaultValue", v)}
                />
              </td>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="refKind" label="참조 종류" /></th>
              <td style={DETAIL_VALUE_CELL}>
                <Select
                  value={form.refKind}
                  options={[
                    { value: "", label: "없음" },
                    { value: "MASTER", label: "MASTER" },
                  ]}
                  onChange={(v) => change("refKind", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="refTarget" label="참조 대상" /></th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  value={form.refTarget}
                  maxLength={50}
                  onChange={(v) => change("refTarget", v)}
                />
              </td>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="refCateId" label="참조 카테고리" /></th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  value={form.refCateId}
                  maxLength={50}
                  onChange={(v) => change("refCateId", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel {...DESCRIPTION_LABEL} /></th>
              <td style={DETAIL_VALUE_CELL} colSpan={3}>
                <DescriptionField
                  key={`description-${formSeq}`}
                  value={form.description}
                  testId="form-description"
                  ariaLabel="설명"
                  confirm={confirm}
                  onChange={(v) => change("description", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="usageNote" label="활용처 메모" /></th>
              <td style={DETAIL_VALUE_CELL} colSpan={3}>
                <DescriptionField
                  key={`usage-note-${formSeq}`}
                  value={form.usageNote}
                  testId="form-usage-note"
                  ariaLabel="활용처 메모"
                  confirm={confirm}
                  onChange={(v) => change("usageNote", v)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <SystemFieldsGrid
          rows={systemRows}
          systems={systems}
          physName={form.physName}
          selectedKey={selectedSystemKey}
          onRowsChange={setSystemRows}
          onSelect={setSelectedSystemKey}
        />
      </div>
    </ContentPanel>
  );
});

type SystemFieldsGridProps = {
  rows: SystemGridRow[];
  systems: SystemOption[];
  /** 새 행 기본 실제 필드명(`ZZ_{물리명}`)을 만든다. */
  physName: string;
  selectedKey: string | number | null;
  onRowsChange: (next: SystemGridRow[] | ((prev: SystemGridRow[]) => SystemGridRow[])) => void;
  onSelect: (key: string | number | null) => void;
};

/** 시스템별 실제 필드명 그리드 — 물리명 밖의 칸을 입력할 때는 다시 그리지 않도록 따로 memo 한다. */
const SystemFieldsGrid = memo(function SystemFieldsGrid({
  rows,
  systems,
  physName,
  selectedKey,
  onRowsChange,
  onSelect,
}: SystemFieldsGridProps) {
  const columns = useMemo<GridColumn[]>(
    () => [
      {
        key: "systemCode",
        header: "시스템",
        width: 110,
        editable: true,
        cellEditor: "select",
        cellEditorValues: systems.map((s) => s.systemCode),
      },
      { key: "physName", header: "실제 필드명", width: 200, editable: true },
      { key: "transform", header: "변환 규칙", width: 120, editable: true },
      { key: "note", header: "note", meta: false, width: 160, editable: true },
    ],
    [systems],
  );
  const defaultRowValues = useMemo(
    () => ({
      systemCode: "",
      physName: physName && !physName.includes("*") ? `ZZ_${physName}` : "",
      transform: "",
      note: "",
    }),
    [physName],
  );
  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      onRowsChange((prev) =>
        prev.map((r) =>
          getRowIdentifier(r, SYSTEM_ROW_KEY) === p.rowKey ? { ...r, [p.field]: p.newValue ?? "" } : r,
        ),
      );
    },
    [onRowsChange],
  );

  return (
    <div data-testid="system-grid" style={{ marginTop: "var(--spacing-sm)", height: 220 }}>
      <GridPanel
        title="시스템별 실제 필드명"
        count={rows.length}
        showAddButton
        showDeleteButton
        data={rows}
        columns={columns}
        rowKey={SYSTEM_ROW_KEY}
        selectedRowKey={selectedKey}
        defaultRowValues={defaultRowValues}
        onDataChange={(next) => {
          onRowsChange(next as SystemGridRow[]);
          onSelect(null);
        }}
      >
        <AgDataGrid
          columnSizing="fit"
          columns={columns}
          data={rows}
          rowKey={SYSTEM_ROW_KEY}
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          highlightedRowKey={selectedKey}
          onRowClick={(row) => onSelect(getRowIdentifier(row, SYSTEM_ROW_KEY))}
          onCellValueChanged={handleCellChange}
          emptyMessage="시스템별 실제 필드명이 없습니다. [행추가]로 넣으세요."
        />
      </GridPanel>
    </div>
  );
});
