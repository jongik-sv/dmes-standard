"use client";

/**
 * 코드 사전 탭 — 사양 항목(조건·설계결과) 사전. 왼쪽 목록, 오른쪽 등록·수정 폼(화면 유형 B).
 * 규칙(서버가 다시 검사): 항목명·코드 중복 불가, 사용 중인 항목은 코드 변경·삭제 불가(사용 스위치를 끈다), 사용 중지 항목은 해석기가 인식하지 않는다.
 * 「사용 건수」 를 누르면 그 항목을 쓰는 사양만 목록 탭에 보인다.
 */
import { memo, useCallback, useImperativeHandle, useMemo, useState, type Ref } from "react";

import { ContentBody, ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Checkbox, Input, Select, Textarea } from "@dk-oasis/shared/form";

import { DATA_TYPES, KIND_EDIT_OPTIONS, KIND_LABEL, type AttrForm, type AttrKind, type AttrView, type DataType } from "./types";

export const EMPTY_ATTR_FORM: AttrForm = {
  origAttrCd: null,
  attrCd: "",
  attrNm: "",
  kind: "COND",
  dataType: "VARCHAR2",
  dataLen: "",
  unit: "",
  description: "",
  useYn: "Y",
};

export function attrToForm(a: AttrView): AttrForm {
  return {
    origAttrCd: a.attrCd,
    attrCd: a.attrCd,
    attrNm: a.attrNm,
    kind: a.kind,
    dataType: a.dataType,
    dataLen: a.dataLen ?? "",
    unit: a.unit ?? "",
    description: a.description ?? "",
    useYn: a.useYn,
  };
}

/** 타입(자리수) 표기 — NUMBER(4,2), VARCHAR2(10), DATE. */
export function typeText(a: Pick<AttrView, "dataType" | "dataLen">): string {
  return a.dataType === "DATE" || !a.dataLen ? a.dataType : `${a.dataType}(${a.dataLen})`;
}

/** 폼 검사 — 처음 문제 하나만 돌려준다(screen-patterns §메시지). */
export function checkAttrForm(f: AttrForm): string | null {
  if (!f.attrNm.trim()) return "한글 항목명을(를) 입력하세요.";
  if (!f.attrCd.trim()) return "시스템 코드을(를) 입력하세요.";
  if (!/^[A-Z][A-Z0-9_]*$/.test(f.attrCd.trim().toUpperCase())) return "시스템 코드은(는) 영문 대문자·숫자·_ 이어야 합니다.";
  if (f.dataType === "NUMBER" && f.dataLen.trim() && !/^\d+(,\d+)?$/.test(f.dataLen.trim())) return "자리수은(는) 5 또는 5,2 형식이어야 합니다.";
  if ((f.dataType === "VARCHAR2" || f.dataType === "CHAR") && f.dataLen.trim() && !/^\d+$/.test(f.dataLen.trim())) return "자리수은(는) 숫자여야 합니다.";
  return null;
}

export type AttrDetailHandle = { load(form: AttrForm | null): void; getForm(): AttrForm | null };

export interface DictionaryPanelProps {
  detailRef: Ref<AttrDetailHandle>;
  attrs: AttrView[];
  loading: boolean;
  busy: boolean;
  selectedAttrCd: string | null;
  canSave: boolean;
  canDelete: boolean;
  onSelect: (attr: AttrView) => void;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
  onToggleUse: (attr: AttrView) => void;
  onJumpToSpecs: (attrCd: string, attrNm: string) => void;
}

export const DictionaryPanel = memo(function DictionaryPanel(props: DictionaryPanelProps) {
  const { detailRef, attrs, loading, busy, selectedAttrCd, canSave, canDelete, onSelect, onNew, onSave, onDelete, onToggleUse, onJumpToSpecs } = props;

  const columns = useMemo<GridColumn[]>(
    () => [
      { key: "attrNm", header: "한글 항목명", width: 140, minWidth: 120, align: "left" },
      { key: "attrCd", header: "시스템 코드", width: 120, minWidth: 110, align: "center", render: (v) => <GridBadge label={String(v)} muted /> },
      { key: "dataType", header: "타입(자리수)", width: 120, minWidth: 110, align: "left", render: (_v, row) => typeText(row as unknown as AttrView) },
      {
        key: "kind",
        header: "구분",
        width: 80,
        minWidth: 74,
        align: "center",
        render: (v) =>
          v === "COND" ? (
            <GridBadge label={KIND_LABEL.COND} muted />
          ) : v === "RESULT" ? (
            <GridBadge label={KIND_LABEL.RESULT} bg="var(--color-primary-soft)" color="var(--color-primary)" />
          ) : (
            <GridBadge label={KIND_LABEL.BOTH} bg="var(--color-warning-soft)" color="var(--color-warning)" />
          ),
      },
      { key: "unit", header: "단위", width: 60, minWidth: 56, align: "center" },
      { key: "description", header: "설명", width: 200, minWidth: 180, align: "left" },
      {
        key: "useCount",
        header: "사용 건수",
        width: 80,
        minWidth: 80,
        align: "right",
        type: "number",
        render: (v, row) => {
          const a = row as unknown as AttrView;
          return Number(v) > 0 ? (
            <Button title="이 항목을 쓰는 사양 보기" onClick={() => onJumpToSpecs(a.attrCd, a.attrNm)}>
              {String(v)}건
            </Button>
          ) : (
            "0"
          );
        },
      },
      {
        key: "useYn",
        header: "사용",
        width: 70,
        minWidth: 64,
        align: "center",
        render: (v, row) => (
          <Checkbox aria-label="사용 여부" checked={v === "Y"} onChange={() => onToggleUse(row as unknown as AttrView)} disabled={busy || !canSave} />
        ),
      },
    ],
    [onJumpToSpecs, onToggleUse, busy, canSave],
  );

  const handleRowClick = useCallback(
    (row: Record<string, unknown>, event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.("button, input")) return;
      onSelect(row as unknown as AttrView);
    },
    [onSelect],
  );

  return (
    <ContentBody root resizable storageKey="mqc.qdm.qualitySpec.dict">
      <ContentPanel>
        <GridPanel
          title="코드 사전"
          count={attrs.length}
          loading={loading}
          buttons={[{ id: "btn_attr_new", label: "+ 항목 추가", onClick: onNew, disabled: busy || !canSave }]}
        >
          <AgDataGrid
            gridId="dict"
            rowKey="attrCd"
            columns={columns}
            data={attrs as unknown as Record<string, unknown>[]}
            columnSizing="fit"
            highlightedRowKey={selectedAttrCd}
            onRowClick={handleRowClick}
            loading={loading}
            getRowClassExtra={inactiveRow}
          />
        </GridPanel>
      </ContentPanel>
      <ContentPanel width={460} scrollY>
        <AttrDetailPane ref={detailRef} busy={busy} canSave={canSave} canDelete={canDelete} onSave={onSave} onDelete={onDelete} />
      </ContentPanel>
    </ContentBody>
  );
});

const inactiveRow = (row: Record<string, unknown>) => (row.useYn === "N" ? "ag-row-deleted" : undefined);

interface AttrDetailPaneProps {
  ref: Ref<AttrDetailHandle>;
  busy: boolean;
  canSave: boolean;
  canDelete: boolean;
  onSave: () => void;
  onDelete: () => void;
}

/** 항목 등록·수정 폼 — 입력 state 는 여기에만 둔다. 루트는 ref 로 load·getForm 한다. */
function AttrDetailPane({ ref, busy, canSave, canDelete, onSave, onDelete }: AttrDetailPaneProps) {
  const [form, setForm] = useState<AttrForm | null>(null);
  useImperativeHandle(ref, () => ({ load: setForm, getForm: () => form }), [form]);
  const disabled = busy || !form;
  const set = <K extends keyof AttrForm>(k: K, v: AttrForm[K]) => setForm((p) => (p ? { ...p, [k]: v } : p));
  const isNew = !form?.origAttrCd;

  return (
    <>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>한글 항목명 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="한글 항목명" value={form?.attrNm ?? ""} onChange={(v) => set("attrNm", v)} disabled={disabled} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>시스템 코드 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="시스템 코드" value={form?.attrCd ?? ""} onChange={(v) => set("attrCd", v.toUpperCase())} disabled={disabled} placeholder="예: RAW_THK" />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>데이터 타입 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                aria-label="데이터 타입"
                value={form?.dataType ?? "VARCHAR2"}
                options={DATA_TYPES}
                onChange={(v) => {
                  set("dataType", v as DataType);
                  if (v === "DATE") set("dataLen", "");
                }}
                disabled={disabled}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>자리수</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                aria-label="자리수"
                value={form?.dataLen ?? ""}
                onChange={(v) => set("dataLen", v)}
                disabled={disabled || form?.dataType === "DATE"}
                placeholder={form?.dataType === "NUMBER" ? "5 또는 5,2" : "10"}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>구분 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select aria-label="구분" value={form?.kind ?? "COND"} options={KIND_EDIT_OPTIONS} onChange={(v) => set("kind", v as AttrKind)} disabled={disabled} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>단위</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="단위" value={form?.unit ?? ""} onChange={(v) => set("unit", v)} disabled={disabled} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea aria-label="설명" value={form?.description ?? ""} onChange={(v) => set("description", v)} rows={3} disabled={disabled} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>사용</th>
            <td style={DETAIL_VALUE_CELL}>
              <Checkbox label="사용" checked={(form?.useYn ?? "Y") === "Y"} onChange={(c) => set("useYn", c ? "Y" : "N")} disabled={disabled} />
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={DETAIL_VALUE_CELL}>
              <Button variant="primary" onClick={onSave} disabled={disabled || !canSave}>
                {isNew ? "+ 항목 추가" : "저장"}
              </Button>{" "}
              <Button variant="danger" onClick={onDelete} disabled={disabled || isNew || !canDelete}>
                삭제
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
