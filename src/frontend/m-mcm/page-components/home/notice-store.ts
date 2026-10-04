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

/** 홈 화면이 내려갈 때 부른다 — 다시 마운트(탭 새로고침)되면 ensureNoticesLoaded 가 새로 조회한다. */
export function resetNoticesRequest(): void {
  requested = false;
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

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getState = () => state;
const getNotices = () => state.notices;
const getSelectedId = () => state.selectedId;

/** 통째 상태 — 목록과 선택을 둘 다 쓰는 공지 위젯용. 행 선택만 바뀌어도 다시 그려지므로 한쪽만 쓰면 아래 필드 훅을 쓴다. */
export function useNoticeStore(): NoticeStoreState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/**
 * 공지 목록만 — 행 선택(selectedId)이 바뀌어도 다시 그려지지 않는다. set 이 notices 를 건드리지 않으면 같은 객체라서다.
 * 홈 페이지(긴급 공지 띠)가 이 훅을 써서 행 클릭이 보드 전체로 번지지 않게 한다(widget-render-findings W8, Screen-Performance-Guide R16).
 */
export function useNotices(): NoticeLoadState {
  return useSyncExternalStore(subscribe, getNotices, getNotices);
}

/** 선택한 공지 키만. */
export function useSelectedNoticeId(): string | null {
  return useSyncExternalStore(subscribe, getSelectedId, getSelectedId);
}
