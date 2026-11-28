/**
 * 로그인 거절 사유 읽기(2026-11-28, 시안 「사용자 비활성화·퇴직 처리」 — 로그인 화면 안내 문구).
 *
 * 구체적인 사유는 비밀번호가 맞을 때만 서버가 준다. 틀린 비밀번호·없는 아이디·퇴직은 모두 일반 실패 문구다.
 */
/** 상태를 드러내지 않는 일반 실패 문구 — 틀린 비밀번호·없는 아이디·퇴직이 모두 이 문구다. */
const GENERIC_FAIL = "아이디 또는 비밀번호가 올바르지 않습니다.";

/**
 * signIn 응답 error("코드|문구", shared/auth/server.ts 의 authorize)를 읽는다.
 * 코드 = BE cactus ErrorCode — A005 잠금 · A006 사용 중지·기간 · A011 비밀번호 변경 필요 · A012 사용 기간 지남 · A013 임시 만료.
 */
export function parseLoginError(error: string | null | undefined): { code: string | null; message: string } {
  if (!error) return { code: null, message: GENERIC_FAIL };
  const i = error.indexOf("|");
  if (i <= 0) return { code: null, message: GENERIC_FAIL };
  const code = error.slice(0, i);
  const msg = error.slice(i + 1).trim();
  if (!/^A0\d\d$/.test(code)) return { code: null, message: GENERIC_FAIL };
  return { code, message: msg || GENERIC_FAIL };
}

/** 변경 창 위 안내 — 왜 바꾸는지. */
export function changeNotice(code: string | null, serverMessage: string): string {
  if (code === "A012") return serverMessage || "비밀번호 사용 기간이 지났습니다. 새 비밀번호로 바꾸세요.";
  return "임시 비밀번호로 로그인했습니다. 새 비밀번호로 바꿔야 들어갈 수 있습니다.";
}
