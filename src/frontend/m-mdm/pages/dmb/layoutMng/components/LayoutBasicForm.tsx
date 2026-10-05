"use client";

/**
 * 전문 기본 속성(TSK-05-02 design.md §2, D-144 3단계) — 레이아웃 ID·버전 선택, 시각 T, 전문 이름*, EAI, 송신*·수신* 시스템, 총 길이 계산값.
 * 버전 선택·시각 T 는 보기 대상을 고르는 칸이라 읽기 전용이어도 쓸 수 있다(읽기 중에도 끄지 않는다).
 */
import { DateTimePicker, Input, Select } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { hint } from "@/layout/styles";
import type { LayoutVersionRow } from "@/layout/types";
import { versionOptions } from "@/layout/version-rows";
import { normVer } from "@/shell";
import type { EaiRow, LayoutDraft, SystemRow } from "../types";

export interface LayoutBasicFormProps {
  draft: LayoutDraft;
  /** 고를 수 있는 버전(view.versions). 비면 신규 — 저장하면 v1.000 DRAFT 가 생긴다. */
  versions: LayoutVersionRow[];
  /** 지금 보고 있는 버전(view.selected.VER). */
  selectedVer: string | null;
  onSelectVersion: (ver: string) => void;
  /** 시각 T(`yyyy-MM-dd HH:mm:ss`). null 이면 지금. */
  asOf: string | null;
  onAsOfChange: (asOf: string | null) => void;
  /** 고른 버전이 이행 전 스냅샷(LEGACY)이다. */
  legacy: boolean;
  systems: SystemRow[];
  eais: EaiRow[];
  readOnly: boolean;
  totalText: string;
  onChange: (patch: Partial<LayoutDraft>) => void;
  onEaiChange: (eaiCode: string | null) => void;
}

export function LayoutBasicForm({
  draft, versions, selectedVer, onSelectVersion, asOf, onAsOfChange, legacy, systems, eais, readOnly, totalText, onChange, onEaiChange,
}: LayoutBasicFormProps) {
  const systemOptions = systems.map((s) => ({ value: s.SYSTEM_CODE, label: `${s.SYSTEM_NAME} (${s.SYSTEM_CODE})` }));
  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            <MdmFieldLabel name="layoutId" label="레이아웃 ID / 버전" meta={false} />
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "center", flexWrap: "wrap" }}>
              <span>{draft.layoutId ?? "(신규)"}</span>
              {versions.length > 0 ? (
                <Select data-testid="layout-ver-select" aria-label="버전" value={normVer(selectedVer) ?? ""} options={versionOptions(versions)}
                  onChange={(v) => v && onSelectVersion(v)} />
              ) : (
                <span style={hint}>저장하면 v1.000 DRAFT 가 생깁니다</span>
              )}
              {legacy && <span data-testid="layout-ver-legacy" style={hint}>이행 전 스냅샷(읽기 전용)</span>}
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            <MdmFieldLabel name="asOf" label="시각 T" meta={false} />
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "center", flexWrap: "wrap" }}>
              <DateTimePicker data-testid="layout-asof" aria-label="시각 T" value={asOf ?? ""} placeholder="지금"
                onChange={(v) => onAsOfChange(v || null)} />
              <span style={hint}>시각 T 의 헤더 버전으로 총 길이·샘플·내보내기를 합성합니다(비우면 지금)</span>
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            <MdmFieldLabel name="layoutName" label="전문 이름" required />
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <Input data-testid="layout-form-name" aria-label="전문 이름" value={draft.layoutName} disabled={readOnly}
              onChange={(v) => onChange({ layoutName: v })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            <MdmFieldLabel name="eaiCode" label="EAI" />
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <Select data-testid="layout-form-eai" aria-label="EAI" value={draft.eaiCode ?? ""} placeholder="(없음)"
              disabled={readOnly} options={eais.map((e) => ({ value: e.EAI_CODE, label: `${e.EAI_NAME} (${e.EAI_CODE})` }))}
              onChange={(v) => onEaiChange(v || null)} />
            <span style={hint}> 고르면 그 EAI 표준 헤더가 헤더 구성 1번에 들어갑니다</span>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            <MdmFieldLabel name="sndRcvSystem" label="송신 / 수신 시스템" required meta={false} />
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <Select data-testid="layout-form-snd" aria-label="송신 시스템" value={draft.sndSystem ?? ""} placeholder="송신"
              disabled={readOnly} options={systemOptions} onChange={(v) => onChange({ sndSystem: v || null })} />
            {" → "}
            <Select data-testid="layout-form-rcv" aria-label="수신 시스템" value={draft.rcvSystem ?? ""} placeholder="수신"
              disabled={readOnly} options={systemOptions} onChange={(v) => onChange({ rcvSystem: v || null })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            <MdmFieldLabel name="totalLength" label="총 길이" meta={false} />
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <span data-testid="layout-total-length">{totalText}</span>
            <span style={hint}> · 계산값(저장 시 서버가 다시 계산)</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
