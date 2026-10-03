"use client";

/**
 * 단위 계산기가 기억 키에 넣는 현재 사용자 ID — shared 포털 셸의 사용자 확인(`/api/auth/me`)을 그대로 쓴다.
 * 위젯 props(WidgetProps)·틀 맥락(WidgetFrameContext)에는 사용자 ID 가 없다(작업 공간의 userId 는 마지막 탭 기억 전용이다).
 * 대시보드 배치 기억(shared dashboard/layout.tsx)과 같은 규칙: 첫 렌더는 이 세션에서 확인된 사용자(peek)로 읽고, 쓰기는 확인된 사용자로만 한다.
 * 한 모듈로 모아 두어 시험이 이 모듈만 바꿔 끼운다(portal-shell 전체를 올리지 않고 `/api/auth/me` 호출도 막는다).
 */
import { peekLastUserId, useUserButtonRbac } from "@dk-oasis/shared/portal-shell";

/** 이 세션에서 마지막으로 확인된 사용자 ID(동기, 없으면 ""). 재로그인 직후엔 이전 사용자일 수 있어 읽기 전용 첫 그림에만 쓴다. */
export function peekUserId(): string {
  return peekLastUserId();
}

/** 지금 로그인한 사용자 ID — 확인되기 전·실패·enabled=false 면 "". 확인이 끝나면 다시 그려진다. */
export function useConfirmedUserId(enabled: boolean): string {
  return useUserButtonRbac(enabled).userId;
}
