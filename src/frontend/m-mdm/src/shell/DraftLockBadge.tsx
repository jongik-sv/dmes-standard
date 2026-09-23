/**
 * DRAFT 잠금(선점) 배지(TSK-01-03 U5).
 *
 * DRAFT 에서만 보인다. RELEASED 뒤의 OWNER_ID 는 확정한 담당자 기록일 뿐 잠금이 아니다(ADR-0002 D3).
 */
import { badgeStyle } from "./badge-style";
import type { MdmVersionStatus } from "./VersionStatusBadge";

export interface DraftLockBadgeProps {
  status: MdmVersionStatus;
  ownerId?: string | null;
  currentUserId?: string | null;
}

export function DraftLockBadge({ status, ownerId, currentUserId }: DraftLockBadgeProps) {
  if (status !== "DRAFT") return null;

  if (!ownerId) {
    return (
      <span className="mdm-lock-badge mdm-lock-badge--free" style={badgeStyle("neutral")}>
        선점 가능
      </span>
    );
  }
  const mine = currentUserId != null && ownerId === currentUserId;
  return (
    <span
      className={`mdm-lock-badge mdm-lock-badge--${mine ? "mine" : "locked"}`}
      data-owner={ownerId}
      style={badgeStyle(mine ? "info" : "warning")}
    >
      {mine ? "편집 중(나)" : `잠김 · ${ownerId} 편집 중`}
    </span>
  );
}
