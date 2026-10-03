/**
 * 권한 캐시 즉시 무효화 BFF 엔드포인트 — 02 §5-4 권고.
 *
 * <p>BE 의 {@code RoleChangedEventListener} 가 권한 변경 후 호출하여 BFF 의
 * in-process 권한 캐시 (`api-permission-cache`) 를 즉시 비워 5분 TTL 대기 없이
 * 권한 변경이 반영되게 한다.
 *
 * <p>인증 정책:
 * <ul>
 *   <li>{@code X-Client-Key} 헤더가 BFF↔BE 합의 비밀 {@code BACKEND_CLIENT_KEY} 와 같아야 한다(시간 상수 비교,
 *       lib/http/internal-call.ts). proxy 가 먼저 보고 여기서 한 번 더 본다. 서버에 비밀이 없으면 언제나 403.</li>
 *   <li>옛 {@code X-Internal-Bff-Call: 1} 표식은 브라우저도 붙일 수 있어 더는 받지 않는다(2026-10-03 보안 지적).</li>
 *   <li>본 엔드포인트는 NextAuth 세션 검증을 거치지 않음 (BE → BFF 서버 간 호출)</li>
 * </ul>
 *
 * <p>요청 body: {@code {"roleId":"SYSADMIN"}} 또는 {@code {"roleIds":["A","B"]}} 또는 {@code {}} (전체 무효화).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  invalidateRole,
  invalidateAll,
} from "@/lib/auth/api-permission-cache";
import { isTrustedInternalCall } from "@/lib/http/internal-call";

export async function POST(req: NextRequest) {
  // 내부 호출 비밀 가드 — 외부에서 임의 호출 차단
  if (!isTrustedInternalCall(req.headers)) {
    return NextResponse.json(
      { ok: false, message: "internal call only" },
      { status: 403 }
    );
  }

  let body: { roleId?: string; roleIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // 빈 body 허용 → 전체 무효화
  }

  if (Array.isArray(body.roleIds) && body.roleIds.length > 0) {
    body.roleIds.forEach((id) => {
      if (id) invalidateRole(id);
    });
    return NextResponse.json({ ok: true, invalidated: body.roleIds.length });
  }

  if (body.roleId) {
    invalidateRole(body.roleId);
    return NextResponse.json({ ok: true, invalidated: 1 });
  }

  // 명시 없으면 전체 무효화
  invalidateAll();
  return NextResponse.json({ ok: true, invalidated: "all" });
}
