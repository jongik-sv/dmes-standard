"use client";

/** A-DETAIL 기본 속성(기능설계서 §4 D-001~D-012). 고정·좁히기·대체 표시는 §7.3 편집 가능 표를 따른다. */
import { Input, Select, Textarea } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import type { DomainDraft, DomainRow } from "../types";
import { hint, row as rowStyle } from "./styles";

export const KIND_OPTIONS = [
  { value: "QTY", label: "QTY 계량" }, { value: "CODE", label: "CODE 코드" }, { value: "ID", label: "ID 식별자" },
  { value: "TEXT", label: "TEXT 문자" }, { value: "DATE", label: "DATE 날짜·시각" }, { value: "FLAG", label: "FLAG 고정값" },
];

export const TYPE_OPTIONS = [
  { value: "NUMBER", label: "숫자" }, { value: "STRING", label: "문자" }, { value: "BOOLEAN", label: "불린" },
  { value: "DATE", label: "일자" },
];

export interface DomainBasicFormProps {
  draft: DomainDraft;
  /** 부모가 있으면(하위 등록·수정) 종류·타입·단위 고정, 수정이면 부모도 고정. */
  structureLocked: boolean;
  parentLocked: boolean;
  readOnly: boolean;
  parentOptions: DomainRow[];
  parentRow: DomainRow | null;
  examplesText: string;
  onChange: (patch: Partial<DomainDraft>) => void;
  onExamplesChange: (text: string) => void;
}

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function DomainBasicForm(props: DomainBasicFormProps) {
  const { draft, structureLocked, parentLocked, readOnly, parentOptions, parentRow, onChange } = props;
  const isCode = draft.domainKind === "CODE";
  const fixed = <span style={hint}>고정</span>;
  const lenHint = parentRow?.EFF_LENGTH != null ? `부모 ${parentRow.EFF_LENGTH} 이하` : "";
  const scaleHint = parentRow?.EFF_SCALE != null ? `부모 ${parentRow.EFF_SCALE} 이하` : "";
  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>도메인명 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input aria-label="도메인명" value={draft.domainName ?? ""} disabled={readOnly}
              onChange={(v) => onChange({ domainName: v })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>표준명 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input aria-label="표준명" value={draft.stdName ?? ""} maxLength={50} disabled={readOnly}
              onChange={(v) => onChange({ stdName: v.toUpperCase() })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>부모 도메인</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={rowStyle}>
              <Select aria-label="부모 도메인" value={draft.parentDomainId ?? ""} placeholder="(없음 — 최상위)"
                options={parentOptions.map((r) => ({ value: String(r.DOMAIN_ID), label: `${r.DOMAIN_NAME} (${r.STD_NAME})` }))}
                disabled={readOnly || parentLocked}
                onChange={(v) => onChange({ parentDomainId: v === "" ? null : Number(v) })} />
              {parentLocked && fixed}
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>종류 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={rowStyle}>
              <Select aria-label="종류" value={draft.domainKind ?? ""} placeholder="선택" options={KIND_OPTIONS}
                disabled={readOnly || structureLocked} onChange={(v) => onChange({ domainKind: v || null })} />
              {structureLocked && fixed}
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>데이터 타입 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={rowStyle}>
              <Select aria-label="데이터 타입" value={draft.dataType ?? ""} placeholder="선택" options={TYPE_OPTIONS}
                disabled={readOnly || structureLocked} onChange={(v) => onChange({ dataType: v || null })} />
              {structureLocked && fixed}
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>길이 / 소수 자리</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={rowStyle}>
              <Input aria-label="길이" style={{ width: 90 }} value={draft.length ?? ""} disabled={readOnly}
                placeholder="(상속)" onChange={(v) => onChange({ length: num(v) })} />
              {lenHint && <span style={hint}>{lenHint}</span>}
              <Input aria-label="소수 자리" style={{ width: 90 }} value={draft.scale ?? ""} disabled={readOnly}
                placeholder="(상속)" onChange={(v) => onChange({ scale: num(v) })} />
              {scaleHint && <span style={hint}>{scaleHint}</span>}
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>단위</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={rowStyle}>
              <Input aria-label="단위" style={{ width: 120 }} value={draft.unitCode ?? ""}
                placeholder={structureLocked ? `(상속) ${parentRow?.EFF_UNIT_CODE ?? ""}` : "기준 단위"}
                disabled={readOnly || structureLocked} onChange={(v) => onChange({ unitCode: v || null })} />
              {structureLocked && fixed}
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>코드 참조</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={rowStyle}>
              <Input aria-label="마루 코드" style={{ width: 140 }} value={draft.maruCodeId ?? ""} disabled={readOnly || !isCode}
                placeholder={parentRow?.EFF_MARU_CODE_ID ? `(부모) ${parentRow.EFF_MARU_CODE_ID}` : "마루 코드"}
                onChange={(v) => onChange({ maruCodeId: v || null })} />
              <Input aria-label="카테고리" style={{ width: 140 }} value={draft.cateId ?? ""} disabled={readOnly || !isCode}
                placeholder={parentRow?.EFF_CATE_ID ? `(부모) ${parentRow.EFF_CATE_ID}` : "카테고리"}
                onChange={(v) => onChange({ cateId: v || null })} />
              <span style={hint}>CODE 종류만. 비우면 부모 참조를 쓴다</span>
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>정의</th>
          <td style={DETAIL_VALUE_CELL}>
            <Textarea aria-label="정의" rows={2} value={draft.description ?? ""} disabled={readOnly}
              onChange={(v) => onChange({ description: v })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>예시 값</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input aria-label="예시 값" value={props.examplesText} placeholder="쉼표로 구분" disabled={readOnly}
              onChange={props.onExamplesChange} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
