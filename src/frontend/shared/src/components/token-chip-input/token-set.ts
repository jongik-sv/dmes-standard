/**
 * 토큰 목록(쉼표로 이은 코드 목록) 순수 함수 — 업무 도메인과 무관하다.
 *
 * - 토큰은 공백·쉼표를 품지 않는 짧은 글자다. 순서는 입력 순서를 지키고 중복은 처음 것만 남긴다.
 * - 모든 함수는 입력 배열을 바꾸지 않는다.
 */

/** 기본 입력 규칙 — 영문자로 시작하고 영문자·숫자·밑줄만 쓴다. */
export const DEFAULT_TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** 거절 이유 — `pattern`(모양이 틀림), `outside`(허용 목록 밖), `duplicate`(이미 있음), `maxLength`(글자 수 초과). */
export type TokenRejectReason = "pattern" | "outside" | "duplicate" | "maxLength";

export interface RejectedToken {
  token: string;
  reason: TokenRejectReason;
}

export interface FilterTokensOptions {
  /** 있으면 이 목록 밖의 토큰을 거절한다. */
  allowed?: readonly string[];
  /** 토큰 모양. 기본 {@link DEFAULT_TOKEN_PATTERN}. `null` 이면 모양을 보지 않는다. */
  pattern?: RegExp | null;
  /** 이미 있는 토큰 — 같은 토큰은 `duplicate` 로 거절한다. */
  existing?: readonly string[];
  /** 쉼표로 이었을 때 전체 글자 수 상한(`existing` + 받아들인 것). 없으면 제한 없음. */
  maxLength?: number;
}

/** 글을 쉼표·공백(줄바꿈 포함)으로 쪼개 토큰 배열로 — 앞뒤 공백 제거, 빈 토큰 버림, 순서 유지, 중복은 처음 것만. */
export function parseTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** 토큰 배열을 쉼표(공백 없이)로 잇는다. 빈 토큰은 버린다. */
export function joinTokens(list: readonly string[] | null | undefined): string {
  return (list ?? []).filter((t) => t).join(",");
}

/** `g`·`y` 깃발이 있는 정규식은 `lastIndex` 에 상태가 남으므로 매번 되돌려 시험한다. */
function testPattern(pattern: RegExp, token: string): boolean {
  pattern.lastIndex = 0;
  const ok = pattern.test(token);
  pattern.lastIndex = 0;
  return ok;
}

/** 토큰 배열을 규칙으로 걸러 받아들인 것과 거절한 것(이유 포함)으로 나눈다. 입력 안 중복은 `duplicate`. */
export function filterTokens(
  list: readonly string[], options: FilterTokensOptions = {},
): { accepted: string[]; rejected: RejectedToken[] } {
  const { allowed, pattern = DEFAULT_TOKEN_PATTERN, existing = [], maxLength } = options;
  const allowSet = allowed ? new Set(allowed) : null;
  const seen = new Set(existing);
  const accepted: string[] = [];
  const rejected: RejectedToken[] = [];
  let total = joinTokens(existing).length;
  for (const token of list) {
    if (pattern && !testPattern(pattern, token)) rejected.push({ token, reason: "pattern" });
    else if (allowSet && !allowSet.has(token)) rejected.push({ token, reason: "outside" });
    else if (seen.has(token)) rejected.push({ token, reason: "duplicate" });
    else {
      const next = total + (total > 0 ? 1 : 0) + token.length;
      if (maxLength !== undefined && next > maxLength) {
        rejected.push({ token, reason: "maxLength" });
        continue;
      }
      seen.add(token);
      accepted.push(token);
      total = next;
    }
  }
  return { accepted, rejected };
}

/** 입력 글을 현재 값에 더한 결과 — 글을 쪼개 걸러 받아들인 것만 뒤에 붙인다. */
export function addTokens(
  value: readonly string[], text: string, options: Omit<FilterTokensOptions, "existing"> = {},
): { next: string[]; rejected: RejectedToken[] } {
  const { accepted, rejected } = filterTokens(parseTokens(text), { ...options, existing: value });
  return { next: accepted.length ? [...value, ...accepted] : [...value], rejected };
}
