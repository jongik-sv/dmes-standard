/**
 * 버전 상태 배지(TSK-01-03 U4).
 *
 * RELEASED 라도 applyFrom 이 아직 오지 않았으면 "적용 대기" 로 보인다(미적용 버전, 04:284·378).
 * applyFrom 이 now 와 같으면 적용된 것으로 본다(경계 포함, 백엔드 APPLY_FROM > now 판정과 같다).
 */
import { badgeStyle, type MdmBadgeTone } from "./badge-style";

export type MdmVersionStatus = "DRAFT" | "REQUESTED" | "APPROVED" | "RELEASED" | "CANCELLED";

export interface VersionStatusBadgeProps {
  status: MdmVersionStatus;
  /** "yyyy-MM-dd HH:mm:ss"(KST, 서버 저장 형식) 또는 ISO 문자열. */
  applyFrom?: string | null;
  now?: Date;
}

interface BadgeView {
  key: string;
  label: string;
  tone: MdmBadgeTone;
}

const FIXED_VIEWS: Record<string, BadgeView> = {
  DRAFT: { key: "draft", label: "작성 중", tone: "warning" },
  REQUESTED: { key: "requested", label: "상신", tone: "neutral" },
  APPROVED: { key: "approved", label: "승인", tone: "neutral" },
  CANCELLED: { key: "cancelled", label: "철회", tone: "muted" },
};

/** "T" 없는 서버 형식은 KST(+09:00)로 읽는다. 읽을 수 없으면 null. */
function parseApplyFrom(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.includes("T") ? value : `${value.replace(" ", "T")}+09:00`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function viewOf(status: string, applyFrom: string | null | undefined, now: Date): BadgeView {
  if (status === "RELEASED") {
    const from = parseApplyFrom(applyFrom);
    if (from && from.getTime() > now.getTime()) {
      return { key: "pending", label: "적용 대기", tone: "info" };
    }
    return { key: "released", label: "확정", tone: "success" };
  }
  return FIXED_VIEWS[status] ?? { key: "unknown", label: status, tone: "neutral" };
}

export function VersionStatusBadge({ status, applyFrom, now }: VersionStatusBadgeProps) {
  const view = viewOf(status, applyFrom, now ?? new Date());
  return (
    <span
      className={`mdm-status-badge mdm-status-badge--${view.key}`}
      title={status}
      data-status={status}
      style={badgeStyle(view.tone)}
    >
      {view.label}
    </span>
  );
}
