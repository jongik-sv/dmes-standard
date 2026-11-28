/**
 * 업무 오류 문구에서 코드 접두를 떼는 도구.
 * 서버(SysadminGuard·UserLifecycleCore·OASIS 거절)는 「LAST_SYSADMIN: 문구」 처럼 코드를 앞에 붙이고,
 * 역할 화면의 businessError 는 meta.code 를 한 번 더 붙여 「E010: LAST_SYSADMIN: 문구」 가 된다.
 * 사용자에게는 문구만 보인다. 코드 판정이 필요한 곳은 Error.message·code 원문을 그대로 쓴다.
 */

const CODE_HEAD = /^([A-Z][A-Z0-9_]+):\s*([\s\S]*)$/;

/**
 * 「CODE: 문구」 를 나눈다. 앞에 붙은 코드가 여럿이면 모두 뗀다(codes = 붙은 차례).
 * code 는 맨 앞 코드, 코드가 없으면 null 이고 문구는 그대로다. 코드를 떼고 문구가 비면 원문을 둔다.
 */
export function parseBizError(message: string): { code: string | null; codes: string[]; text: string } {
  const raw = message.trim();
  const codes: string[] = [];
  let rest = raw;
  for (let m = CODE_HEAD.exec(rest); m; m = CODE_HEAD.exec(rest)) {
    codes.push(m[1]);
    rest = m[2].trim();
  }
  return { code: codes[0] ?? null, codes, text: rest || raw };
}

/** 문자열 오류 문구에서 코드 접두만 뗀다. */
export const stripBizCode = (message: string): string => parseBizError(message).text;

/** 사용자에게 보일 오류 문구 — 코드는 떼고 문구만. 오류 글이 없으면 fallback. */
export function bizErrorText(e: unknown, fallback = "요청을 처리하지 못했습니다."): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return msg.trim() ? stripBizCode(msg) : fallback;
}
