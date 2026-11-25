/**
 * 품질판정·출력물 화면이 함께 쓰는 상태 표시 — 상태 코드 → 의미 색(배지 톤), 그리드 배지, 판정 이력 그리드 열.
 * 색은 screen-patterns 배지 표(완료·합격 success, 진행 primary, 보류 warning, 불합격·오류 danger, 대기·비활성 muted)를 따른다.
 */
import { GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
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

/** 출력물 처리 이력 한 줄. */
export interface OutputEvent extends Record<string, unknown> {
  histNo: number;
  docNo: string;
  docRev: number | null;
  actCd: string;
  actNm: string;
  statBef: string | null;
  statBefNm: string | null;
  statAft: string | null;
  statAftNm: string | null;
  reason: string | null;
  actBy: string | null;
  actAt: string;
}

/** 출력물 처리 이력 그리드 열(문서 번호 열 포함). */
export const OUTPUT_HISTORY_COLUMNS: GridColumn[] = [
  { key: "actAt", header: "처리 시각", width: 130, align: "center" },
  { key: "docNo", header: "문서 번호", width: 130, align: "left" },
  { key: "docRev", header: "판", width: 50, align: "center", render: (v) => (v == null ? "—" : `v${String(v)}`) },
  { key: "actNm", header: "처리", width: 90, align: "center" },
  { key: "statBefNm", header: "이전", width: 80, align: "center", render: (v, r) => (v == null ? "—" : gridStatusBadge(r.statBef, v)) },
  { key: "statAftNm", header: "이후", width: 80, align: "center", render: (v, r) => gridStatusBadge(r.statAft, v) },
  { key: "reason", header: "사유", width: 200, minWidth: 160, align: "left" },
  { key: "actBy", header: "처리자", width: 80, align: "center" },
];

/** 상세 패널 안 작은 이력 그리드 열(문서 번호 없이). */
export const OUTPUT_HISTORY_SHORT_COLUMNS: GridColumn[] = [
  { key: "actAt", header: "시각", width: 120, align: "center" },
  { key: "actNm", header: "처리", width: 70, align: "center" },
  { key: "statAftNm", header: "결과", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.statAft, v) },
  { key: "reason", header: "사유", width: 160, minWidth: 120, align: "left" },
  { key: "actBy", header: "처리자", width: 70, align: "center" },
];

/** 숫자 칸 표시(없으면 —). */
export const num = (v: unknown) => (v == null || v === "" ? "—" : Number(v).toLocaleString("ko-KR"));
