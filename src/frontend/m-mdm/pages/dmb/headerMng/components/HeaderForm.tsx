"use client";

/**
 * 헤더 상세(TSK-05-02 design.md §2·D2) — 헤더 ID 읽기·이름*·EAI(기존 코드 또는 신규 코드)·EAI 이름·인코딩·패딩 규칙·헤더 길이 계산값.
 * 인코딩·패딩은 EAI 가 소유한다 — 이 헤더를 표준 헤더로 쓰는 EAI 행을 함께 저장한다. EAI 가 없는 헤더(시스템 구간 헤더 등)는
 * 전문의 EAI 인코딩을 따른다.
 */
import { Input, Select } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { hint } from "@/layout/styles";
import type { EaiRow, HeaderDraft } from "../types";

const ENCODINGS = [{ value: "EUC-KR", label: "EUC-KR" }, { value: "UTF-8", label: "UTF-8" }];

export interface HeaderFormProps {
  draft: HeaderDraft;
  eais: EaiRow[];
  readOnly: boolean;
  lengthText: string;
  onChange: (patch: Partial<HeaderDraft>) => void;
}

export function HeaderForm({ draft, eais, readOnly, lengthText, onChange }: HeaderFormProps) {
  const existing = eais.find((e) => e.EAI_CODE === draft.eaiCode);
  const changeCode = (code: string) => {
    const c = code.trim().toUpperCase();
    const e = eais.find((x) => x.EAI_CODE === c);
    onChange(e ? { eaiCode: c, eaiName: e.EAI_NAME, encoding: e.ENCODING, padRule: e.PAD_RULE ?? null } : { eaiCode: c || null });
  };
  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>헤더 ID</th>
          <td style={DETAIL_VALUE_CELL}>{draft.layoutId ?? "(신규)"}</td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>헤더 이름 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input data-testid="header-form-name" aria-label="헤더 이름" value={draft.layoutName} disabled={readOnly}
              onChange={(v) => onChange({ layoutName: v })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>EAI 코드</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input data-testid="header-form-eai" aria-label="EAI 코드" style={{ width: 160 }} value={draft.eaiCode ?? ""} maxLength={20}
              placeholder="기존 코드 또는 새 코드" disabled={readOnly} list="header-form-eai-list" onChange={changeCode} />
            <datalist id="header-form-eai-list">
              {eais.map((e) => <option key={e.EAI_CODE} value={e.EAI_CODE}>{e.EAI_NAME}</option>)}
            </datalist>
            <span style={hint}>
              {draft.eaiCode ? (existing ? " 기존 EAI — 저장하면 이 헤더가 그 EAI 의 표준 헤더가 됩니다" : " 새 EAI 로 만듭니다")
                : " 비우면 전문의 EAI 인코딩을 따릅니다"}
            </span>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>EAI 이름</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input data-testid="header-form-eai-name" aria-label="EAI 이름" value={draft.eaiName ?? ""}
              disabled={readOnly || !draft.eaiCode} onChange={(v) => onChange({ eaiName: v })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>인코딩 / 패딩 규칙</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "center", flexWrap: "wrap" }}>
              <Select data-testid="header-form-encoding" aria-label="인코딩" value={draft.encoding ?? ""} placeholder="인코딩"
                options={ENCODINGS} disabled={readOnly || !draft.eaiCode} onChange={(v) => onChange({ encoding: v || null })} />
              <Input data-testid="header-form-pad-rule" aria-label="패딩 규칙" style={{ width: 240 }} value={draft.padRule ?? ""}
                placeholder="예: 숫자 왼쪽 0, 문자 오른쪽 공백" disabled={readOnly || !draft.eaiCode}
                onChange={(v) => onChange({ padRule: v })} />
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>헤더 길이</th>
          <td style={DETAIL_VALUE_CELL}>
            <span data-testid="header-length">{lengthText}</span>
            <span style={hint}> · 계산값(저장 시 서버가 다시 계산)</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
