/**
 * 분해 토큰 조합(TSK-04-04 design.md §6.16, 불변 규칙 I1). FE 는 분해 규칙을 따로 구현하지 않는다 — 토큰을 고친 뒤의
 * 재계산(추천 도메인·중복·표시명)은 compare 재호출로 서버에 맡긴다. 여기서는 화면 표시와 선검사만 한다.
 */
import type { NameToken, PickedTerm } from "./types";

/** 미등록·약어 없는 자리. 글자 그대로 `***` 다. */
export const PLACEHOLDER = "***";

function isResolved(token: NameToken): boolean {
  return (
    token.status !== "UNKNOWN" &&
    token.status !== "NO_ABBR" &&
    token.termId != null
  );
}

export function composePhysName(tokens: NameToken[]): string {
  return tokens.map((t) => (isResolved(t) ? t.abbr : PLACEHOLDER)).join("_");
}

export function composeLogicalName(tokens: NameToken[]): string {
  return tokens
    .map((t) => (t.termId != null && t.termName ? t.termName : t.surface))
    .join(" ");
}

export function hasPlaceholder(tokens: NameToken[]): boolean {
  return tokens.some((t) => !isResolved(t));
}

/** seq 자리를 용어로 바꾼다(새 배열). 약어가 없는 용어면 NO_ABBR 로 남는다. */
export function replaceToken(
  tokens: NameToken[],
  seq: number,
  term: PickedTerm,
): NameToken[] {
  return tokens.map((t) => {
    if (t.seq !== seq) return t;
    const abbr =
      term.engAbbr && term.engAbbr.trim() !== "" ? term.engAbbr : null;
    return {
      ...t,
      status: abbr ? "MATCHED" : "NO_ABBR",
      termId: term.termId,
      termName: term.termName,
      senseNo: term.senseNo,
      engAbbr: abbr,
      abbr: abbr ?? PLACEHOLDER,
    };
  });
}

/**
 * 분해 토큰 표의 열 폭(`columnSizing="fit"` — `width` 는 비율, 칸이 좁으면 `minWidth`(없으면 `width`)까지 줄고 그 합이
 * 표 폭보다 넓으면 가로 스크롤이 생긴다. Local-Rules §30).
 */
export const TOKEN_COLUMN_SIZES = {
  // 최소 폭 합 518px — 1280 폭에서 이 표가 받는 565px(e2e 실측)에서 세로 스크롤바 몫 17px 을 뺀 548px 안에 든다.
  seq: { width: 50, minWidth: 44 },
  // 토큰·매칭·약어는 말줄임돼도 셀 툴팁(값)으로 다 볼 수 있어 줄인다.
  surface: { width: 120, minWidth: 90 },
  MATCH_TEXT: { width: 140, minWidth: 100 },
  ABBR_TEXT: { width: 90, minWidth: 64 },
  // 처리 칸은 버튼·긴 안내 문구(「약어 없음 — 용어 관리에서 약어 등록」)를 그리고 툴팁이 없어(tooltip:false) 덜 줄인다.
  ACTION: { width: 240, minWidth: 220 },
} as const satisfies Record<string, { width: number; minWidth?: number }>;
