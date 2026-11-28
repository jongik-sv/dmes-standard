/**
 * 권한 수준 칩 — 시안 B·D 공용. 권한이 셀수록 짙은 파랑이다.
 * 누를 수 있으면(onClick) 다음 수준으로 바꾸는 단추가 되고, 저장 전 변경이면 점선 테두리와 「이전 → 이후」 툴팁을 단다.
 * 권한 수준이라는 업무 개념을 그리므로 shared 가 아니라 시안 폴더에 둔다.
 */
import { PERM_LEVEL_BY_ID } from "../../data/role-mgmt-mock";
import { LEVEL_LABELS, levelClass, type ChangeKind } from "./role-model";

export function LevelChip({
  label,
  level,
  before,
  kind,
  onClick,
  compact,
}: {
  /** 칩 앞 글(보통 화면 이름). 없으면 수준 이름만. */
  label?: string;
  level: string;
  before?: string;
  kind?: ChangeKind | null;
  onClick?: () => void;
  compact?: boolean;
}) {
  const info = PERM_LEVEL_BY_ID.get(level);
  const actions = info?.actions.length ? info.actions.join("·") : "화면을 열 수 없음";
  const tip = [
    label ? `${label}: ${LEVEL_LABELS[level]}` : LEVEL_LABELS[level],
    `할 수 있는 일 — ${actions}`,
    kind ? `저장 전 변경 — ${LEVEL_LABELS[before ?? ""] ?? ""} → ${LEVEL_LABELS[level]}` : "",
    onClick ? "누르면 다음 수준으로 바뀝니다." : "",
  ]
    .filter(Boolean)
    .join("\n");
  const cls = [
    levelClass(level),
    "role-chip",
    compact ? "role-chip--compact" : "",
    kind ? "role-chip--changed" : "",
    onClick ? "role-chip--button" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      {label ? <span className="role-chip__name">{label}</span> : null}
      <span className="role-chip__level">{LEVEL_LABELS[level]}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={cls} title={tip} onClick={onClick}>
      {body}
    </button>
  ) : (
    <span className={cls} title={tip}>
      {body}
    </span>
  );
}

/** 수준 색 범례. */
export function LevelLegend({ levels }: { levels: string[] }) {
  return (
    <span className="role-legend">
      {levels.map((id) => (
        <LevelChip key={id} level={id} compact />
      ))}
    </span>
  );
}
