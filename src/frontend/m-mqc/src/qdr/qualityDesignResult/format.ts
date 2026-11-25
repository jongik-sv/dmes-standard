/**
 * 표시용 순수 함수 — 상태·판정 색, 크기 글, 근거 글, 포털 화면 열기. React 에 기대지 않는다(시험 대상).
 */
import { openPortalPage } from "@dk-oasis/shared/widget";

import { ruleTitle } from "@/common/rule/meta";
import { SCREENS } from "@/common/screens";

import type { BadgeTone } from "@dk-oasis/shared/form";

import type { DesignStatus, Evidence, EvidenceKind, EvidenceStatus, RunVerdict, Stage, Verdict } from "./types";

export const STATUS_TONE: Record<DesignStatus, BadgeTone> = {
  WAIT: "neutral",
  ING: "primary",
  CONF: "success",
  HOLD: "warning",
};

/** 단계 판정 → 배지 색. advisory(차단 뒤 참고값)는 회색. */
export function verdictTone(verdict: Verdict, advisory = false): BadgeTone {
  if (advisory) return "neutral";
  if (verdict === "P") return "success";
  if (verdict === "F") return "danger";
  if (verdict === "C") return "warning";
  return "neutral";
}

export function verdictText(verdict: Verdict): string {
  if (verdict === "P") return "통과";
  if (verdict === "F") return "불통";
  if (verdict === "C") return "조건부";
  return "판정 불가";
}

export const RUN_VERDICT_LABEL: Record<RunVerdict, string> = { OK: "정상", WARN: "경고", BLOCK: "차단" };
export const RUN_VERDICT_TONE: Record<RunVerdict, BadgeTone> = { OK: "success", WARN: "warning", BLOCK: "danger" };

export const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export function circled(n: number): string {
  return CIRCLED[n - 1] ?? String(n);
}

/** 단계 머리 글 「① 주문 입력 검증」. */
export function stageLabel(s: Pick<Stage, "no" | "name">): string {
  return `${circled(s.no)} ${s.name}`;
}

/** 두께 0.450 · 폭 1,490.0 형식. */
export function fmtThk(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(3);
}

export function fmtWid(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  MATCHED: "적중",
  NO_MATCH: "미적중",
  RULE_NOT_FOUND: "기준 없음",
  UNAVAILABLE: "MDM 불가",
  INPUT_ERROR: "입력 오류",
  SKIPPED: "건너뜀",
};

export const EVIDENCE_STATUS_TONE: Record<EvidenceStatus, BadgeTone> = {
  MATCHED: "success",
  NO_MATCH: "warning",
  RULE_NOT_FOUND: "danger",
  UNAVAILABLE: "danger",
  INPUT_ERROR: "danger",
  SKIPPED: "neutral",
};

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  rule: "기준 룰",
  spec: "품질사양",
  formula: "산식",
  constant: "표준값",
  missing: "기준 없음",
};

export const EVIDENCE_KIND_TONE: Record<EvidenceKind, BadgeTone> = {
  rule: "primary",
  spec: "success",
  formula: "neutral",
  constant: "neutral",
  missing: "danger",
};

/** 「C10B2060 v1.000 · TS-008」 — 룰 ID·버전·적중 행 키. 비면 빈 글. */
export function ruleRef(ruleId: string | null | undefined, ver?: string | null, ruleKey?: string | null, seq?: number | null): string {
  if (!ruleId) return "";
  const parts = [ver ? `${ruleId} v${ver}` : ruleId];
  if (ruleKey) parts.push(ruleKey);
  else if (seq != null) parts.push(`${seq}행`);
  return parts.join(" · ");
}

/** 룰 이름 — catalog 에 있으면 그것, 없으면 서버가 준 이름, 그것도 없으면 ID. */
export function evidenceTitle(e: Pick<Evidence, "ruleId" | "title">): string {
  const fromCatalog = ruleTitle(e.ruleId);
  if (fromCatalog && fromCatalog !== e.ruleId) return fromCatalog;
  return e.title || e.ruleId;
}

/** 화면 objectId → 포털 pageId(mqc:{folder}/{objectId}). 모르는 화면이면 null. */
export function portalPageId(objectId: string | null | undefined): string | null {
  if (!objectId) return null;
  const meta = SCREENS[objectId];
  return meta ? `mqc:${meta.folder}/${meta.objectId}` : null;
}

export function screenTitle(objectId: string | null | undefined): string {
  if (!objectId) return "";
  return SCREENS[objectId]?.title ?? objectId;
}

/** 다른 mqc 화면을 포털 탭으로 연다. 모르는 화면이면 아무것도 하지 않고 false. */
export function openScreen(objectId: string | null | undefined): boolean {
  const pageId = portalPageId(objectId);
  if (!pageId) return false;
  openPortalPage(pageId);
  return true;
}

/** 값 글 — null·빈 글은 「—」. */
export function text(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = String(v);
  return s.trim() === "" ? "—" : s;
}
