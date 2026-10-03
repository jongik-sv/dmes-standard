/**
 * BFF 내부 호출 판정 — 서버 전용(proxy.ts·Route Handler 에서만 import 한다. 화면 코드에서 부르지 않는다).
 *
 * <p>브라우저는 어떤 헤더든 붙일 수 있으므로, 헤더가 "있다"는 것만으로 검사를 건너뛰지 않는다
 * (옛 `x-internal-bff-call: 1` 통과는 로그인하지 않은 브라우저가 붙여도 통과했다 — 2026-10-03 보안 지적).
 *
 * <p>내부 호출로 인정하는 곳은 {@link INTERNAL_API_PREFIX}(BE → BFF 권한 캐시 무효화) 한 갈래뿐이고, 증명은 BFF↔BE 합의 비밀
 * `BACKEND_CLIENT_KEY` 를 `X-Client-Key` 헤더에 싣는 것이다(BFF → BE 와 같은 비밀·같은 헤더). 이 비밀로 열리는 것은 권한 캐시
 * 비우기뿐이라, 사용자 사칭(X-Authenticated-*)은 BFF 에서 어떤 비밀로도 열지 않는다 — bff-auth 는 세션 쿠키만 본다.
 *
 * <p>비밀은 환경변수에서 부를 때마다 읽는다(`NEXT_PUBLIC_` 이 아니라 브라우저 번들에 들어가지 않는다). 서버에 비밀이 없거나
 * 비어 있으면 언제나 거짓 — 빈 값끼리 같다고 통과하지 않는다. 비교는 SHA-256 다이제스트끼리 시간 상수로 한다(길이가 달라도 던지지 않는다).
 * 여러 인스턴스·next dev 여러 워커가 같은 환경변수를 보므로 어느 프로세스에 닿아도 같은 판정이다.
 */
import { createHash, timingSafeEqual } from "node:crypto";

/** 서버 간 호출 전용 BFF 경로 접두. proxy 가 여기서는 세션·RBAC 대신 {@link isTrustedInternalCall} 을 본다. */
export const INTERNAL_API_PREFIX = "/api/mcm/internal/";

/** 내부 호출 비밀을 싣는 요청 헤더(소문자). BFF → BE 신뢰 채널과 같은 이름이다. */
export const INTERNAL_CALL_KEY_HEADER = "x-client-key";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** 요청이 BFF↔BE 합의 비밀을 들고 왔는지 본다. 비밀을 로그·응답에 남기지 않는다. */
export function isTrustedInternalCall(headers: Headers): boolean {
  const expected = process.env.BACKEND_CLIENT_KEY;
  if (!expected || !expected.trim()) return false;
  const presented = headers.get(INTERNAL_CALL_KEY_HEADER);
  if (!presented) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}
