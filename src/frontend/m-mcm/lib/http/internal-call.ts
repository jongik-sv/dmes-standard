/**
 * BFF 내부 호출 판정 — 서버 전용(proxy.ts·Route Handler 에서만 import 한다. 화면 코드에서 부르지 않는다).
 *
 * <p>브라우저는 어떤 헤더든 붙일 수 있으므로, 헤더가 "있다"는 것만으로 검사를 건너뛰지 않는다
 * (옛 `x-internal-bff-call: 1` 통과는 로그인하지 않은 브라우저가 붙여도 통과했다 — 2026-10-03 보안 지적).
 *
 * <p>내부 호출로 인정하는 곳은 {@link INTERNAL_INVALIDATE_ROLE_PATH}(BE → BFF 권한 캐시 무효화) 한 경로뿐이고, 증명은
 * BE → BFF 전용 비밀 `BFF_INTERNAL_SECRET` 을 {@link INTERNAL_SECRET_HEADER} 헤더에 싣는 것이다.
 * BFF → BE 마스터 비밀 `BACKEND_CLIENT_KEY`(BE 에서 아무 사용자로 인증된다)는 이 용도로 받지 않는다 — 마스터 비밀을 BE 가
 * BFF 쪽으로 보내지 않게 하고, 이 경로가 마스터 비밀을 맞혀 보는 창구가 되지 않게 한다. 이 비밀로 열리는 것은 권한 캐시 비우기뿐이다.
 *
 * <p>비밀은 환경변수에서 부를 때마다 읽는다(`NEXT_PUBLIC_` 이 아니라 브라우저 번들에 들어가지 않는다). 다음이면 언제나 거짓:
 * <ul>
 *   <li>서버에 비밀이 없거나 비어 있다 — 빈 값끼리 같다고 통과하지 않는다.</li>
 *   <li>`NODE_ENV=production` 인데 비밀이 저장소에 적힌 로컬 전용 값({@link LOCAL_INTERNAL_SECRET})이다.</li>
 *   <li>비밀이 `BACKEND_CLIENT_KEY` 와 같다 — 같으면 BE 가 마스터 비밀을 보내는 것과 다르지 않다.</li>
 * </ul>
 * 비교는 SHA-256 다이제스트끼리 시간 상수로 한다(길이가 달라도 던지지 않는다). 비밀은 로그·응답에 남기지 않는다.
 */
import { createHash, timingSafeEqual } from "node:crypto";

/** 서버 간 호출 전용 BFF 경로 접두. 이 아래에서 열리는 경로는 {@link INTERNAL_INVALIDATE_ROLE_PATH} 하나뿐이다. */
export const INTERNAL_API_PREFIX = "/api/mcm/internal/";

/**
 * 권한 캐시 무효화 — BE RoleChangedEventListener 가 부른다. proxy 는 이 경로만 비밀로 열고 나머지 internal 하위는 404 —
 * 접두 전체를 열면 비밀을 가진 쪽이 internal 아래 다른 경로(지금은 없지만 catch-all 라우트로 BE 까지 간다)를 세션 없이 부를 수 있다.
 */
export const INTERNAL_INVALIDATE_ROLE_PATH = "/api/mcm/internal/cache/invalidate-role";

/** BE → BFF 내부 호출 비밀을 싣는 요청 헤더(소문자). BE RoleChangedEventListener 의 X-Bff-Internal-Secret 과 같다. */
export const INTERNAL_SECRET_HEADER = "x-bff-internal-secret";

/** 저장소(.env.example·BE application-local.yml)에 적힌 로컬 전용 값. 운영(NODE_ENV=production)에서는 거절한다. */
export const LOCAL_INTERNAL_SECRET = "dmes-bff-internal-local-2026";

const warned = new Set<string>();
/** 설정 오류는 한 번만 알린다(비밀 값은 남기지 않는다). */
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.error(`[internal-call] ${message}`);
}

/** 쓸 수 있는 내부 호출 비밀. 없거나 쓰면 안 되는 값이면 null — 내부 경로는 언제나 403 이 된다. */
export function resolveInternalSecret(): string | null {
  const secret = process.env.BFF_INTERNAL_SECRET;
  if (!secret || !secret.trim()) return null;
  if (process.env.NODE_ENV === "production" && secret.trim() === LOCAL_INTERNAL_SECRET) {
    warnOnce(
      "local-default",
      "운영(NODE_ENV=production)에서 BFF_INTERNAL_SECRET 이 저장소의 로컬 전용 값이라 내부 호출을 모두 거절합니다. 별도 비밀로 바꾸세요."
    );
    return null;
  }
  if (secret === process.env.BACKEND_CLIENT_KEY) {
    warnOnce(
      "same-as-client-key",
      "BFF_INTERNAL_SECRET 이 BACKEND_CLIENT_KEY 와 같아 내부 호출을 모두 거절합니다. 서로 다른 비밀을 쓰세요."
    );
    return null;
  }
  return secret;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** 요청이 BE → BFF 내부 호출 비밀을 들고 왔는지 본다. 비밀을 로그·응답에 남기지 않는다. */
export function isTrustedInternalCall(headers: Headers): boolean {
  const expected = resolveInternalSecret();
  if (!expected) return false;
  const presented = headers.get(INTERNAL_SECRET_HEADER);
  if (!presented) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}
