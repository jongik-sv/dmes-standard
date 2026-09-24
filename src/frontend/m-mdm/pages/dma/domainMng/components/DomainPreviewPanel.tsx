"use client";

/** A-TEST 미리보기(D-017) — 표준식은 화면 JS 즉시 판정, 비즈니스식은 서버 미리보기(디바운스) 결과를 보인다. */
import { Input } from "@dk-oasis/shared/form";
import type { PreviewResult } from "../preview";
import type { JudgeRow } from "../types";
import { badge, hint, row as rowStyle, statusColor } from "./styles";

export interface DomainPreviewPanelProps {
  value: string;
  onValueChange: (v: string) => void;
  std: PreviewResult;
  biz: JudgeRow | null | undefined;
  hasBiz: boolean;
  requiredVars: string[];
  varValues: Record<string, string>;
  onVarChange: (name: string, value: string) => void;
  serverEnabled: boolean;
  pending: boolean;
}

const BIZ_LABEL: Record<string, { text: string; tone: string }> = {
  true: { text: "비즈니스 통과", tone: "pass" },
  false: { text: "비즈니스 실패", tone: "fail" },
  UNDECIDED: { text: "판정 불가", tone: "server" },
  ERROR: { text: "판정 오류", tone: "error" },
};

export function DomainPreviewPanel(props: DomainPreviewPanelProps) {
  const biz = props.biz ? BIZ_LABEL[props.biz.RESULT] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <div style={rowStyle}>
        <Input aria-label="미리보기 입력값" style={{ width: 200 }} value={props.value} placeholder="값을 입력하세요"
          onChange={props.onValueChange} />
        <span className="domain-mng__preview-std" style={statusColor[props.std.status]} title={props.std.detail}>
          {props.std.label}
        </span>
        {props.hasBiz && (
          <span className="domain-mng__preview-biz" style={biz ? statusColor[biz.tone] : statusColor.none}>
            <span style={badge}>서버 확인 항목</span> {props.pending ? "확인 중…" : biz ? biz.text : "-"}
          </span>
        )}
      </div>
      {props.hasBiz && props.requiredVars.length > 0 && (
        <div style={rowStyle}>
          {props.requiredVars.map((name) => (
            <Input key={name} aria-label={`변수 ${name}`} style={{ width: 160 }} placeholder={name}
              value={props.varValues[name] ?? ""} onChange={(v) => props.onVarChange(name, v)} />
          ))}
        </div>
      )}
      {props.hasBiz && !props.serverEnabled && (
        <span style={hint}>서버 미리보기 권한이 없어 비즈니스식은 판정하지 않습니다</span>
      )}
    </div>
  );
}
