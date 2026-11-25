/**
 * 품질판정·출력물 화면이 함께 쓰는 상태 표시 — 상태 코드 → 의미 색(배지 톤), 그리드 배지, 숫자 표시.
 * 색은 screen-patterns 배지 표(완료·합격 success, 진행 primary, 보류 warning, 불합격·오류 danger, 대기·비활성 muted)를 따른다.
 */
import { GridBadge } from "@dk-oasis/shared/grid";
import type { BadgeTone } from "@dk-oasis/shared/form";

/** 상태 코드 → 톤. 판정·검사 항목·보증서·증명서·Tag 상태 코드를 한 표에 둔다(코드가 겹쳐도 뜻이 같다). */
const TONE: Record<string, BadgeTone> = {
  PASS: "success",
  ISSUED: "success",
  REISSUED: "primary",
  REVIEW: "primary",
  DRAFT: "warning",
  WAIT: "neutral",
  HOLD: "warning",
  FAIL: "danger",
  RECALLED: "danger",
  DISCARDED: "neutral",
  NONE: "neutral",
};

export const toneOf = (code: unknown): BadgeTone => TONE[String(code ?? "")] ?? "neutral";

/** 그리드 셀 배지. neutral 은 muted 로 그린다. */
export function gridStatusBadge(code: unknown, label: unknown) {
  const tone = toneOf(code);
  const text = label == null || label === "" ? "—" : String(label);
  if (tone === "neutral") return <GridBadge label={text} muted />;
  return <GridBadge label={text} bg={`var(--color-${tone}-soft)`} color={`var(--color-${tone})`} />;
}

/** 숫자 칸 표시(없으면 —). */
export const num = (v: unknown) => (v == null || v === "" ? "—" : Number(v).toLocaleString("ko-KR"));
