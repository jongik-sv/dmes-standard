/**
 * 허용 값(BTN_PERM·POPUP_PERM) 계산 — 화면 안 순수 함수.
 * 서버 응답 searchObjPerm 의 역할 행(perms)으로 값별 사용 수와 「빼면 꺼지는 퍼미션」 을 센다.
 * 정확한 사람 수는 저장 응답 impacts 가 정본이다. 여기 사람 수는 역할별 받은 사람 수의 합(겹침 포함)이라 최대치다.
 */
import { parseTokens } from "@dk-oasis/shared/token-chip-input";
import type { ObjPermRow } from "./types";

export type PermKind = "BTN" | "POPUP";

const FIELD: Record<PermKind, "BTN_PERM" | "POPUP_PERM"> = { BTN: "BTN_PERM", POPUP: "POPUP_PERM" };

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 이 값을 가진 퍼미션(역할) 행들. 사용 안 하는 역할도 퍼미션 한 건이라 센다. */
function rolesUsing(perms: readonly ObjPermRow[], kind: PermKind, token: string): ObjPermRow[] {
  const f = FIELD[kind];
  return perms.filter((p) => parseTokens(String(p[f] ?? "")).includes(token));
}

/** 값별로 그 값을 켠 퍼미션 수 — 칩 아래 요약 줄에 쓴다. */
export function countByToken(
  perms: readonly ObjPermRow[],
  kind: PermKind,
  tokens: readonly string[],
): { token: string; count: number }[] {
  return tokens.map((token) => ({ token, count: rolesUsing(perms, kind, token).length }));
}

export interface RemovalImpact {
  kind: PermKind;
  token: string;
  /** 함께 꺼지는 퍼미션 수. */
  permCnt: number;
  /** 받은 사람 수의 합(겹침 포함 최대치). */
  userMax: number;
}

/** 조회 시점 값(origCsv)에서 지금 값(nowTokens)으로 바꿔 빠진 값 중 퍼미션이 쓰는 것의 영향. 쓰는 퍼미션이 없으면 넣지 않는다. */
export function removalImpacts(
  perms: readonly ObjPermRow[],
  kind: PermKind,
  origCsv: string | undefined,
  nowTokens: readonly string[],
): RemovalImpact[] {
  const now = new Set(nowTokens);
  const out: RemovalImpact[] = [];
  for (const token of parseTokens(origCsv ?? "")) {
    if (now.has(token)) continue;
    const used = rolesUsing(perms, kind, token);
    if (used.length === 0) continue;
    out.push({ kind, token, permCnt: used.length, userMax: used.reduce((a, p) => a + toNum(p.USER_CNT), 0) });
  }
  return out;
}

/** 안내 문장(STE) — 「x」을(를) 빼면 퍼미션 N건(사람 최대 M명)에서 함께 꺼집니다. */
export function removalMessage(i: RemovalImpact): string {
  return `「${i.token}」을(를) 빼면 퍼미션 ${i.permCnt}건(사람 최대 ${i.userMax}명)에서 함께 꺼집니다.`;
}

/** 저장 응답 impacts → 안내 줄(BTN·POPUP = 뺀 값, USE_TP = 사용 안 함). 서버가 센 정확한 건수·사람 수다. */
export function impactLines(
  impacts: readonly { OBJECT_ID: string; KIND: string; CODE?: string; PERM_CNT?: number | string; USER_CNT?: number | string }[],
): string[] {
  return impacts.map((i) => {
    const tail = `퍼미션 ${toNum(i.PERM_CNT)}건(사람 ${toNum(i.USER_CNT)}명)`;
    if (i.KIND === "USE_TP") return `「${i.OBJECT_ID}」을(를) 사용 안 함으로 바꿔 ${tail}이 멈춥니다.`;
    const kind = i.KIND === "POPUP" ? "팝업" : "버튼";
    return `「${i.OBJECT_ID}」 ${kind} 「${i.CODE ?? ""}」을(를) 빼서 ${tail}에서 꺼집니다.`;
  });
}
