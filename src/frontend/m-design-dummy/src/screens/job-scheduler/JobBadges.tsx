/** 예약 작업 그리드 셀 배지 — 최근 결과·사용 여부·유형(코드 없음 포함). 색은 의미 토큰만 쓴다. */
import { GridBadge, GridBadgeGroup } from "@dk-oasis/shared/grid";
import { RUN_STATUS_LABEL, type RunStatus } from "../../data/job-scheduler-mock";

const STATUS_COLORS: Record<RunStatus, { bg?: string; color?: string; muted?: boolean }> = {
  OK: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  FAIL: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
  RUN: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  SKIP: { muted: true },
  TIMEOUT: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
};

export function RunStatusBadge({ status }: { status: string }) {
  if (!(status in STATUS_COLORS)) return null;
  const key = status as RunStatus;
  const style = STATUS_COLORS[key];
  return <GridBadge label={RUN_STATUS_LABEL[key]} bg={style.bg} color={style.color} muted={style.muted} />;
}

export function UseBadge({ useYn }: { useYn: string }) {
  return useYn === "N" ? (
    <GridBadge label="중지" muted />
  ) : (
    <GridBadge label="사용" bg="var(--color-success-soft)" color="var(--color-success)" />
  );
}

export function KindBadges({ label, codeMissing }: { label: string; codeMissing: boolean }) {
  return (
    <GridBadgeGroup>
      <GridBadge label={label} bg="var(--color-primary-soft)" color="var(--color-primary)" />
      {codeMissing ? <GridBadge label="코드 없음" bg="var(--color-danger-soft)" color="var(--color-danger)" /> : null}
    </GridBadgeGroup>
  );
}
