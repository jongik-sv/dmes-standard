/**
 * 의사결정표 가운데 머리(변수) — 표시명·물리명·값 타입 배지·표시 타입 배지(06 「열 머리」). ag-grid 열 그룹 머리 컴포넌트로 쓴다
 * (shared `GridColumn.headerComponent` → 그룹의 headerGroupComponent). 툴팁은 `headerTooltip` 이 맡는다.
 */
import { badgeStyle } from "@/shell";

export interface VarHeaderProps {
  displayName?: string;
  label?: string;
  physName?: string;
  typeBadge?: string;
  dispBadge?: string;
}

export function VarHeader({ displayName, label, physName, typeBadge, dispBadge }: VarHeaderProps) {
  return (
    <span className="dt-var-header" style={{ display: "inline-flex", alignItems: "center", gap: 4, overflow: "hidden", whiteSpace: "nowrap" }}>
      <strong>{label ?? displayName}</strong>
      {physName && physName !== label ? <span style={{ color: "var(--color-text-muted)" }}>{physName}</span> : null}
      {typeBadge ? <span style={badgeStyle(typeBadge === "타입 없음" ? "warning" : "neutral")}>{typeBadge}</span> : null}
      {dispBadge ? <span style={badgeStyle("info")}>{dispBadge}</span> : null}
    </span>
  );
}
