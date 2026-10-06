"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  bindUsageSender,
  createUsageSender,
  getCurrentUser,
  peekCurrentUser,
  type UsageEmitReason,
  type UsageExitBinding,
  type UsageSegment,
  type UsageSender,
} from "@dk-oasis/shared/portal-shell";

// 화면 사용 구간 기록 — 로그인 사용자 전원(AUTH_ONLY, proxy.ts 와 BE EndpointPermissionFilter 동기화).
const SCREEN_USAGE_ENDPOINT = "/api/mcm/oasis/screenUsage/record";

/**
 * 화면 사용 구간 전송기를 포털 수명에 묶는다.
 * - meta.userId 는 공유 사용자 확인(getCurrentUser — /api/auth/me 세션 캐시)에서 받아 둔다(서버는 인증 정보로 채우므로 참고용). 전송은 그 응답을 기다리지 않는다.
 * - 언마운트 때 남은 구간을 keepalive 로 보내고 주기 전송을 멈춘다. binding 은 비우지 않아
 *   PortalShell 언마운트가 뒤늦게 넘기는 마지막 구간도 받는 즉시 keepalive 로 보낸다.
 * - 로그아웃(reason "logout")은 구간을 큐에 넣고 keepalive flush 의 Promise 를 돌려준다. PortalShell 이 최대 1500ms
 *   기다린 뒤 signOut 하므로 로그아웃 이동 전에 전송이 끝나거나 keepalive 로 이어진다.
 * - 오류는 sender 가 console.warn 으로만 남긴다(화면을 막지 않는다).
 */
export function usePortalUsageReporter() {
  const senderRef = useRef<UsageSender | null>(null);
  const bindingRef = useRef<UsageExitBinding | null>(null);

  useEffect(() => {
    // userId 는 받아 둔 값만 쓴다 — buildMeta 가 /api/auth/me 를 기다리면 pagehide·로그아웃 keepalive 전송이
    // 페이지가 내려간 뒤로 밀려 사라진다. 서버는 이 값을 무시하므로 아직 없으면 빈 값으로 보낸다.
    let cachedUserId = peekCurrentUser()?.id ?? "";
    let loading: Promise<void> | null = null;
    const refreshUserId = () => {
      if (cachedUserId || loading) return;
      // 공유 사용자 확인(진행 중 요청 공유·세션 캐시, K3) — 셸이 이미 물었으면 요청 없이 받는다.
      loading = getCurrentUser()
        .then((me) => {
          cachedUserId = me.ok ? me.user.id : "";
        })
        .catch(() => {})
        .finally(() => {
          loading = null;
        });
    };
    refreshUserId(); // 첫 전송 전에 미리 받아 둔다(성공하면 다시 부르지 않는다)

    const sender = createUsageSender({
      endpoint: SCREEN_USAGE_ENDPOINT,
      buildMeta: async () => {
        refreshUserId(); // 아직 없으면 다음 전송을 위해 다시 묻기만 하고 기다리지 않는다
        return { userId: cachedUserId, menuId: "PORTAL_SHELL" };
      },
    });
    const binding = bindUsageSender(sender, { doc: document, win: window });
    senderRef.current = sender;
    bindingRef.current = binding;
    return () => {
      binding.closeAndFlush();
      binding.dispose();
      sender.dispose();
    };
  }, []);

  const onUsageSegments = useCallback(
    (segments: UsageSegment[], info: { reason: UsageEmitReason }): void | Promise<void> => {
      const sender = senderRef.current;
      const binding = bindingRef.current;
      if (info.reason === "logout" && sender && binding) {
        // 큐에 넣고 flush 하나만 만들어 그 Promise 를 돌려준다(flush 를 두 번 부르면 뒤 것이 빈 큐로 먼저 끝난다).
        sender.enqueue(segments);
        const sent = sender.flush({ keepalive: true });
        binding.closeAndFlush(); // 닫는 중 표시 — 큐는 이미 비어 있어 추가 요청은 없다
        return sent;
      }
      binding?.onSegments(segments);
      return undefined;
    },
    []
  );
  const flushUsageForLogout = useCallback(() => {
    bindingRef.current?.closeAndFlush();
  }, []);
  return { onUsageSegments, flushUsageForLogout };
}
