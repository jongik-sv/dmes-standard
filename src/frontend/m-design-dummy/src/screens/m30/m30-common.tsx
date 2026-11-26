import { GridBadge } from "@dk-oasis/shared/grid";
import type { GridColumn } from "@dk-oasis/shared/grid";

/** M30 더미 화면 공통 도우미. 동작 없는 업무 버튼 안내와 숫자·배지 표시만 둔다. */

export const DUMMY_ACTION_MESSAGE =
  "디자인 더미 화면입니다. 이 버튼은 실제로 처리하지 않습니다.";

/** 숫자 칸 표시: 빈 값은 비우고 천 단위 쉼표를 넣는다. */
export const formatNumber = (value: unknown) =>
  value == null || value === "" ? "" : Number(value).toLocaleString();

export const numberColumn = (
  key: string,
  header: string,
  width = 90,
): GridColumn => ({
  key,
  header,
  width,
  align: "right",
  type: "number",
  render: (value) => formatNumber(value),
});

const BADGE_TONE = {
  success: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  info: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  warning: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  danger: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
} as const;

export type BadgeTone = keyof typeof BADGE_TONE | "muted";

/** 값에 따라 배지 색을 고른다. 표에 없는 값은 흐린 배지로 보인다. */
export function ToneBadge({
  value,
  tones,
}: {
  value: unknown;
  tones: Record<string, BadgeTone>;
}) {
  const text = String(value ?? "");
  if (!text) return null;
  const tone = tones[text] ?? "muted";
  return tone === "muted" ? (
    <GridBadge label={text} muted />
  ) : (
    <GridBadge label={text} {...BADGE_TONE[tone]} />
  );
}

/** 문자열 포함 검색(대소문자 무시). 조건이 비면 통과한다. */
export const includesText = (value: unknown, keyword: string) =>
  !keyword.trim() ||
  String(value ?? "")
    .toUpperCase()
    .includes(keyword.trim().toUpperCase());

/** 날짜 문자열(yyyy-MM-dd…) 기간 검사. 조건이 비면 통과한다. */
export const inDateRange = (value: unknown, from: string, to: string) => {
  const day = String(value ?? "").slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};
