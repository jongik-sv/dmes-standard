/**
 * 의사결정표 가운데 머리(변수) — 표시명·물리명·값 타입 배지·표시 타입 배지(06 「열 머리」). ag-grid 열 그룹 머리 컴포넌트로 쓴다
 * (shared `GridColumn.headerComponent` → 그룹의 headerGroupComponent). 툴팁은 `headerTooltip` 이 맡는다.
 * 물리명 옆 정보 아이콘은 컬럼 사전 상세 팝오버를 연다 — 아이콘 클릭은 머리 클릭(onSelect)·열 끌기로 번지지 않는다.
 */
import { ColumnInfoPopover } from "@/column-info";
import { badgeStyle } from "@/shell";

export interface VarHeaderProps {
  displayName?: string;
  label?: string;
  physName?: string;
  typeBadge?: string;
  dispBadge?: string;
  /** 머리 클릭 — 열 설정 표의 대응 줄을 하이라이트한다(design §6). */
  onSelect?: () => void;
  varId?: number;
}

export function VarHeader({ displayName, label, physName, typeBadge, dispBadge, onSelect, varId }: VarHeaderProps) {
  return (
    <span
      className="dt-var-header"
      data-testid={varId != null ? `dt-var-header-${varId}` : undefined}
      onClick={onSelect}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, overflow: "hidden", whiteSpace: "nowrap", cursor: onSelect ? "pointer" : undefined }}
    >
      <strong>{label ?? displayName}</strong>
      {physName && physName !== label ? (
        <span style={{ color: "var(--color-text-muted)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{physName}</span>
      ) : null}
      {physName ? (
        <ColumnInfoPopover physName={physName} testId={varId != null ? `dt-var-info-${varId}` : "dt-var-info"} />
      ) : null}
      {typeBadge ? <span style={badgeStyle(typeBadge === "타입 없음" ? "warning" : "neutral")}>{typeBadge}</span> : null}
      {dispBadge ? <span style={badgeStyle("info")}>{dispBadge}</span> : null}
    </span>
  );
}
