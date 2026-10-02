/**
 * 홈 공지 목록·선택 공유 저장소 — 공지 위젯·긴급 공지 띠·알림 위젯이 같은 상태를 본다(스펙 §5).
 * 위젯이 독립 프로그램이 되어 화면 수준 useState 를 나눌 수 없으므로 구독형 저장소(useSyncExternalStore)로 둔다.
 * 요청 순번으로 늦게 온 이전 응답을 버린다.
 */
import { useSyncExternalStore } from "react";

import { searchNoticeBoard } from "./api";
import { firstUrgent, keepSelection, noticeKey, type NoticeLoadState } from "./types";

interface NoticeStoreState {
  notices: NoticeLoadState;
  selectedId: string | null;
}

let state: NoticeStoreState = { notices: { status: "loading" }, selectedId: null };
let requested = false;
let seq = 0;
const listeners = new Set<() => void>();

function set(next: Partial<NoticeStoreState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function reloadNotices(): Promise<void> {
  requested = true;
  const mine = ++seq;
  if (state.notices.status !== "ok") set({ notices: { status: "loading" } });
  return searchNoticeBoard().then(
    (rows) => {
      if (mine !== seq) return;
      set({ notices: { status: "ok", rows }, selectedId: keepSelection(rows, state.selectedId) });
    },
    () => {
      if (mine !== seq) return;
      set({ notices: { status: "error" } });
    }
  );
}

/** 한 번도 부르지 않았으면 부른다(홈 화면·공지 위젯이 둘 다 불러도 요청은 하나). */
export function ensureNoticesLoaded(): void {
  if (!requested) void reloadNotices();
}

export function selectNotice(id: string | null): void {
  set({ selectedId: id });
}

/** 공지 알림·긴급 띠 「내용 보기」 — 긴급 공지(없으면 첫 공지)를 고른다. */
export function selectUrgentOrFirst(): void {
  if (state.notices.status !== "ok" || state.notices.rows.length === 0) return;
  const target = firstUrgent(state.notices.rows) ?? state.notices.rows[0];
  set({ selectedId: noticeKey(target) });
}

export function useNoticeStore(): NoticeStoreState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}
