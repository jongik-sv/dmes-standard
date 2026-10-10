/**
 * 화면 상태 알리기(SET_VIEW) 묶음 — 1초에 한 번 이하로 보낸다(스펙 4.4). 첫 값은 바로 보내고, 1초 안에 들어온 값은 마지막 것 하나만
 * 1초가 지난 뒤 보낸다. 마지막으로 보낸 값과 같으면 보내지 않는다(선택 표 순서는 보지 않는다).
 * 다시 연결되면 서버의 화면 상태가 비므로 화면이 forget() 으로 "보낸 값" 을 잊게 한 뒤 다시 push 한다.
 */
import type { ErdViewState } from "../types";

export const VIEW_SYNC_MS = 1000;

export interface ViewSync {
  push(view: ErdViewState): void;
  forget(): void;
  dispose(): void;
}

export function viewKey(v: ErdViewState): string {
  return JSON.stringify([v.diagramId, [...v.selectedTables].sort()]);
}

export function createViewSync(send: (view: ErdViewState) => void, intervalMs: number = VIEW_SYNC_MS): ViewSync {
  let lastAt = Number.NEGATIVE_INFINITY;
  let lastKey: string | null = null;
  let pending: ErdViewState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const flush = () => {
    timer = null;
    if (disposed || !pending) return;
    const v = pending;
    pending = null;
    const key = viewKey(v);
    if (key === lastKey) return;
    lastKey = key;
    lastAt = Date.now();
    send(v);
  };

  return {
    push(view) {
      if (disposed) return;
      pending = view;
      if (timer !== null) return;
      const wait = lastAt + intervalMs - Date.now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    forget() {
      lastKey = null;
    },
    dispose() {
      disposed = true;
      pending = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
