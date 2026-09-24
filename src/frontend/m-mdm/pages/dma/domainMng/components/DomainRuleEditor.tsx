"use client";

/** A-RULE 검증식 두 칸(D-013·D-014)과 유효 식(D-015·D-016)·요구 변수(L-011~L-013). */
import { Textarea } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import type { DomainDraft, RequiredVarRow } from "../types";
import { badge, hint, row as rowStyle } from "./styles";

export interface DomainRuleEditorProps {
  draft: DomainDraft;
  readOnly: boolean;
  effStdExpr: string | null;
  effBizExpr: string | null;
  requiredVars: RequiredVarRow[];
  onChange: (patch: Partial<DomainDraft>) => void;
}

export function DomainRuleEditor({ draft, readOnly, effStdExpr, effBizExpr, requiredVars, onChange }: DomainRuleEditorProps) {
  const isCode = draft.domainKind === "CODE";
  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            표준 검증식 <span style={badge}>화면·서버</span>
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <Textarea aria-label="표준 검증식" rows={2} value={draft.stdRule ?? ""} disabled={readOnly || isCode}
              placeholder={isCode ? "비움(코드 참조만)" : "value 만 사용"} onChange={(v) => onChange({ stdRule: v })} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            비즈니스 검증식 <span style={badge}>서버 전용</span>
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <Textarea aria-label="비즈니스 검증식" rows={2} value={draft.bizRule ?? ""} disabled={readOnly}
              onChange={(v) => onChange({ bizRule: v })} />
            {draft.bizRule && draft.bizRule.trim() !== "" && <span style={hint}>서버 확인 항목</span>}
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>유효 표준식</th>
          <td style={DETAIL_VALUE_CELL}>
            <div className="domain-mng__eff-std" style={{ fontFamily: "var(--font-family-mono, monospace)" }}>{effStdExpr ?? "-"}</div>
            <span style={hint}>저장하지 않음 · 조립</span>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>유효 비즈니스식</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={{ fontFamily: "var(--font-family-mono, monospace)" }}>{effBizExpr ?? "-"}</div>
            {requiredVars.length > 0 && (
              <div style={rowStyle}>
                {requiredVars.map((v) => (
                  <span key={v.PHYS_NAME} style={badge}>
                    {v.PHYS_NAME} {v.COLUMN_NAME ? `· ${v.COLUMN_NAME}` : ""} {v.REGISTERED ? "등재" : "미등재"}
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
