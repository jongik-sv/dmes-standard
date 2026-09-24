"use client";

/** 전문 기본 속성(TSK-05-02 design.md §2) — 레이아웃 ID·버전 읽기, 전문 이름*, EAI, 송신*·수신* 시스템, 총 길이 계산값. */
import { Input, Select } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { hint } from "@/layout/styles";
import type { EaiRow, LayoutDraft, SystemRow } from "../types";

export interface LayoutBasicFormProps {
  draft: LayoutDraft;
  layoutVersion: number | null;
  systems: SystemRow[];
  eais: EaiRow[];
  readOnly: boolean;
  totalText: string;
  onChange: (patch: Partial<LayoutDraft>) => void;
  onEaiChange: (eaiCode: string | null) => void;
}

export function LayoutBasicForm({ draft, layoutVersion, systems, eais, readOnly, totalText, onChange, onEaiChange }: LayoutBasicFormProps) {
  const systemOptions = systems.map((s) => ({ value: s.SYSTEM_CODE, label: `${s.SYSTEM_NAME} (${s.SYSTEM_CODE})` }));
  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>레이아웃 ID / 버전</th>
          <td style={DETAIL_VALUE_CELL}>
            {draft.layoutId ?? "(신규)"} / {layoutVersion ?? 0}
            <span style={hint}> · 버전은 저장 시 자동(TSK-05-03)</span>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>전문 이름 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input data-testid="layout-form-name" aria-label="전문 이름" value={draft.layoutName} disabled={readOnly}
              onChange={(v) => onChange({ layoutName: v })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>EAI</th>
          <td style={DETAIL_VALUE_CELL}>
            <Select data-testid="layout-form-eai" aria-label="EAI" value={draft.eaiCode ?? ""} placeholder="(없음)"
              disabled={readOnly} options={eais.map((e) => ({ value: e.EAI_CODE, label: `${e.EAI_NAME} (${e.EAI_CODE})` }))}
              onChange={(v) => onEaiChange(v || null)} />
            <span style={hint}> 고르면 그 EAI 표준 헤더가 헤더 구성 1번에 들어갑니다</span>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>송신 / 수신 시스템 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Select data-testid="layout-form-snd" aria-label="송신 시스템" value={draft.sndSystem ?? ""} placeholder="송신"
              disabled={readOnly} options={systemOptions} onChange={(v) => onChange({ sndSystem: v || null })} />
            {" → "}
            <Select data-testid="layout-form-rcv" aria-label="수신 시스템" value={draft.rcvSystem ?? ""} placeholder="수신"
              disabled={readOnly} options={systemOptions} onChange={(v) => onChange({ rcvSystem: v || null })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>총 길이</th>
          <td style={DETAIL_VALUE_CELL}>
            <span data-testid="layout-total-length">{totalText}</span>
            <span style={hint}> · 계산값(저장 시 서버가 다시 계산)</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
