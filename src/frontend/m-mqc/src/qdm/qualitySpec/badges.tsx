"use client";

/**
 * qualitySpec 화면의 표시 부품 — 상태 배지와 조건(IF)·설계결과(THEN) 칩. 색은 screen-patterns §배지 색 표의 의미 토큰만 쓴다.
 * 그리드 셀 안은 GridBadge, 그리드 밖(카드·창)은 form Badge 를 쓴다.
 */
import { GridBadge, GridBadgeGroup } from "@dk-oasis/shared/grid";
import { Badge, type BadgeTone } from "@dk-oasis/shared/form";

import { termText } from "./dsl";
import { STATUS_LABEL, type MatchVerdict, type SpecStatus, type Term } from "./types";

const STATUS_COLOR: Record<SpecStatus, { bg?: string; color?: string; muted?: boolean }> = {
  DRAFT: { muted: true },
  CONF: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  SENT: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  FAIL: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

export const STATUS_TONE: Record<SpecStatus, BadgeTone> = { DRAFT: "neutral", CONF: "primary", SENT: "success", FAIL: "danger" };

/** 그리드 셀 안 상태 배지. title 에 실패 메시지를 싣는다. */
export function StatusCellBadge({ status, title }: { status: SpecStatus; title?: string | null }) {
  const c = STATUS_COLOR[status];
  return <GridBadge label={STATUS_LABEL[status]} bg={c.bg} color={c.color} muted={c.muted} title={title ?? undefined} />;
}

/** 그리드 밖 상태 배지. */
export function StatusBadge({ status, title }: { status: SpecStatus; title?: string | null }) {
  return <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} title={title ?? undefined} />;
}

export interface ChipLabels {
  /** 고객사 코드 → 이름 */
  cusName?: (code: string) => string | null;
  /** 품명 코드 → 제품군 이름 */
  prdName?: (code: string) => string | null;
}

/** 칩 글 — 고객사 칩은 「코드 이름」, 품명 칩은 「코드 제품군」. */
export function chipText(t: Term, labels: ChipLabels = {}): string {
  if (t.attrCd === "CUS_CD") return `${t.val} ${labels.cusName?.(t.val) ?? ""}`.trim();
  if (t.attrCd === "PRD_NM_CD") return `${t.val} ${labels.prdName?.(t.val) ?? ""}`.trim();
  return termText(t);
}

/** 그리드 셀 안 칩 묶음 — max 개까지 보이고 나머지는 「+n」. 조건 칩은 흐린 색, 결과 칩은 강조 색, 미매핑은 경고 색. */
export function TermCellChips({ terms, side, max, labels }: { terms: Term[]; side: "IF" | "THEN"; max: number; labels?: ChipLabels }) {
  const shown = terms.slice(0, max);
  const rest = terms.length - shown.length;
  return (
    <GridBadgeGroup>
      {shown.map((t) => {
        const text = chipText(t, labels);
        if (!t.attrCd) return <GridBadge key={t.seq} label={text} title="코드 사전 미매핑" bg="var(--color-warning-soft)" color="var(--color-warning)" />;
        return side === "IF" ? (
          <GridBadge key={t.seq} label={text} title={t.attrCd} muted />
        ) : (
          <GridBadge key={t.seq} label={text} title={t.attrCd} bg="var(--color-primary-soft)" color="var(--color-primary)" />
        );
      })}
      {rest > 0 ? <GridBadge label={`+${rest}`} muted title={terms.slice(max).map((t) => chipText(t, labels)).join(", ")} /> : null}
    </GridBadgeGroup>
  );
}

/** 그리드 밖 칩(카드 안). */
export function TermChip({ term, side, labels }: { term: Pick<Term, "attrCd" | "attrNm" | "op" | "val" | "unit" | "seq" | "side">; side: "IF" | "THEN"; labels?: ChipLabels }) {
  const text = chipText(term as Term, labels);
  if (!term.attrCd) return <Badge label={text} tone="warning" title="코드 사전 미매핑" />;
  return <Badge label={text} tone={side === "IF" ? "neutral" : "primary"} title={term.attrCd} />;
}

export const VERDICT_LABEL: Record<MatchVerdict, string> = { APPLIED: "✓ 적용", EXCLUDED: "△ 조건 충족 · 적용 제외", NO_MATCH: "✕ 조건 불일치" };
export const VERDICT_TONE: Record<MatchVerdict, BadgeTone> = { APPLIED: "success", EXCLUDED: "warning", NO_MATCH: "neutral" };
