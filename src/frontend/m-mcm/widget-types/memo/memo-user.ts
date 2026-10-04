"use client";

/**
 * 개인 메모 임시 저장 키에 넣는 현재 사용자 ID — shared 포털 셸의 사용자 확인(`/api/auth/me`)을 그대로 쓴다.
 * 위젯 props(WidgetProps)·틀 맥락(WidgetFrameContext)에는 사용자 ID 가 없다(shared 대시보드 배치 기억·단위 계산기가 쓰는 방식과 같다).
 * 단위 계산기와 달리 첫 렌더를 이 세션의 마지막 확인 사용자(peekLastUserId)로 읽지 않는다 — 재로그인 직후엔 이전 사용자일 수 있고,
 * 메모 글은 다른 사람에게 비치면 안 되는 내용이라 확인된 사용자만 쓴다(확인 전에는 임시 저장을 읽지도 쓰지도 않는다).
 * 확인 상태(memoUserStatus)도 함께 돌려준다 — 렌더러는 확인이 끝나기 전(pending)에는 [편집]을 막아 편집 도중 사용자가 늦게 확인돼
 * 입력이 잠기는 일을 없앤다. 확인이 실패로 끝나면(failed) 임시 저장 없이 편집을 허용한다.
 * 한 모듈로 모아 두어 시험이 이 모듈만 바꿔 끼운다(portal-shell 전체를 올리지 않고 `/api/auth/me` 호출도 막는다).
 */
import { useCurrentUserState } from "@dk-oasis/shared/portal-shell";

import { memoUserStatus, type MemoUserStatus } from "./memo-model";

export interface ConfirmedUser {
  /** 지금 로그인한 사용자 ID — 확인되기 전·실패·enabled=false 면 "". */
  userId: string;
  status: MemoUserStatus;
}

/** enabled=false 면 확인하지 않는다(status failed·userId ""). 확인이 끝나면 다시 그려진다. */
export function useConfirmedUser(enabled: boolean): ConfirmedUser {
  const state = useCurrentUserState(enabled);
  return { userId: state.userId, status: memoUserStatus(state) };
}
