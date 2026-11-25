/**
 * 시뮬레이션 화면 순수 함수 — 고친 항목, 추가 항목, 근거 경로 찾기, 기대값 글, 배지 색. React 에 기대지 않는다(시험 대상).
 */
import type { BadgeTone } from "@dk-oasis/shared/form";

import type { ValueTrace } from "@/qdr/qualityDesignResult/types";

import type { CaseEval, CaseStatus, OrderFields, Pin, VerdictExpect, VerdictResult } from "./types";

export const CASE_STATUS_TONE: Record<CaseStatus, BadgeTone> = {
  NOT_RUN: "neutral",
  PASS: "success",
  WARN: "warning",
  FAIL: "danger",
};

const norm = (v: string | null | undefined) => (v == null ? "" : String(v).trim());

/** 기준 주문과 값이 다른 항목(빈칸·null 은 같다). */
export function dirtyFields(order: OrderFields, base: OrderFields): string[] {
  const keys = new Set([...Object.keys(order), ...Object.keys(base)]);
  return [...keys].filter((k) => !k.startsWith("_") && norm(order[k]) !== norm(base[k])).sort();
}

/** 핵심 항목 밖의 주문 항목(라벨 순서 → 이름 순). */
export function extraFields(order: OrderFields, coreFields: readonly string[], labels: Record<string, string> = {}): string[] {
  const core = new Set(coreFields);
  const keys = new Set([...Object.keys(order), ...Object.keys(labels)]);
  return [...keys].filter((k) => !core.has(k) && !k.startsWith("_")).sort((a, b) => a.localeCompare(b));
}

/** 경로의 근거 — 정확히 맞는 것, 없으면 그 경로 아래 것들(「cgl.lines.적정」 → 「cgl.lines.적정.1」…). */
export function tracesFor(trace: Record<string, ValueTrace> | undefined, path: string | null): ValueTrace[] {
  if (!trace || !path) return [];
  const exact = trace[path];
  if (exact) return [exact];
  const prefix = path + ".";
  return Object.values(trace)
    .filter((t) => t.path.startsWith(prefix))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** 기대값 한 줄 글 「① 생산 가부 = P」 「② 주문 정합성 에러 A803」. */
export function verdictExpectText(v: VerdictExpect | VerdictResult): string {
  const code = "expectErrorCode" in v ? v.expectErrorCode : undefined;
  if (code) return `${v.stage}단계 에러 ${code}`;
  return `${v.stage}단계 = ${v.expect ?? "-"}`;
}

/** 「기대값 a/b」 — 핀과 단계 기대를 합친 통과 수. */
export function expectScore(ev: CaseEval | null | undefined): { pass: number; total: number } {
  if (!ev) return { pass: 0, total: 0 };
  return { pass: (ev.pinPass ?? 0) + (ev.verdictPass ?? 0), total: (ev.pinTotal ?? 0) + (ev.verdictTotal ?? 0) };
}

/** 핀 추가 — 같은 경로가 있으면 바꾼다. */
export function upsertPin(pins: Pin[], pin: Pin): Pin[] {
  const i = pins.findIndex((p) => p.path === pin.path);
  if (i < 0) return [...pins, pin];
  const out = pins.slice();
  out[i] = pin;
  return out;
}

export function removePin(pins: Pin[], path: string): Pin[] {
  return pins.filter((p) => p.path !== path);
}

/** 핀 라벨 기본값 — 경로 마지막 마디(열 번호면 그 앞 마디 포함). */
export function pinLabelOf(path: string): string {
  const parts = path.split(".");
  const last = parts[parts.length - 1] ?? path;
  return /^\d+$/.test(last) && parts.length > 1 ? `${parts[parts.length - 2]}[${last}]` : last;
}

/** 새 케이스 이름 — 주문 키가 있으면 그것을 붙인다. */
export function newCaseName(orderKey: string | null | undefined): string {
  return orderKey ? `새 케이스 — ${orderKey}` : "새 케이스";
}

/** 주문 키 「D260831014-010」 — ORD_REQ_NO·ORD_REQ_LN 에서. */
export function orderKeyOf(order: OrderFields): string | null {
  const no = norm(order.ORD_REQ_NO);
  const ln = norm(order.ORD_REQ_LN);
  return no ? (ln ? `${no}-${ln}` : no) : null;
}
