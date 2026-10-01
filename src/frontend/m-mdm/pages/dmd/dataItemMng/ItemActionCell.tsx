"use client";

/**
 * 항목 그리드 「작업」 열의 셀 — 열 정의(columns)를 셀 편집마다 다시 만들지 않으려고 버튼 상태를 열 정의 밖에 둔다.
 *
 * 열의 `render` 는 고정이고, 이 셀이 page 가 갱신하는 작은 저장소(`ItemActionStore`)를 구독해 자기 행의 버튼 모양만
 * 다시 그린다. 구독 값은 그 행의 상태 문자열이라 다른 행이 바뀌어도 이 셀은 다시 그려지지 않는다.
 */
import { useSyncExternalStore } from "react";

import { Button } from "@dk-oasis/shared/form";

export type ItemRowAction = "save" | "close" | "reopen" | "history";

export interface ItemActionState {
  /** 행 코드 → 열림 여부(목록에서 읽은 값). */
  open: ReadonlyMap<string, boolean>;
  /** draft 가 있는 행 코드. */
  draftCodes: ReadonlySet<string>;
  busy: boolean;
  editable: boolean;
  canSave: boolean;
  canClose: boolean;
  canReopen: boolean;
}

export interface ItemActionStore {
  getState: () => ItemActionState;
  subscribe: (listener: () => void) => () => void;
  /** 행 동작 — 눌린 시점의 목록 행 + draft 를 합친 값으로 page 가 처리한다. */
  act: (code: string, action: ItemRowAction) => void;
  cancel: (code: string) => void;
}

/** 이 행의 버튼 모양을 정하는 값만 모은 문자열 — 같으면 셀을 다시 그리지 않는다. */
function rowKey(s: ItemActionState, code: string): string {
  return [
    s.editable ? 1 : 0,
    s.open.get(code) === true ? 1 : 0,
    s.draftCodes.has(code) ? 1 : 0,
    s.busy ? 1 : 0,
    s.canSave ? 1 : 0,
    s.canClose ? 1 : 0,
    s.canReopen ? 1 : 0,
  ].join("");
}

const groupStyle = { display: "inline-flex", gap: "var(--spacing-xs)" } as const;

export function ItemActionCell({ code, store }: { code: string; store: ItemActionStore }) {
  useSyncExternalStore(store.subscribe, () => rowKey(store.getState(), code));
  const s = store.getState();
  const isOpen = s.open.get(code) === true;
  const hasDraft = s.draftCodes.has(code);
  const historyButton = (
    <Button size="mini" data-testid={`item-history-${code}`} onClick={() => store.act(code, "history")}>
      이력
    </Button>
  );
  if (s.editable && isOpen && hasDraft) {
    return (
      <span style={groupStyle}>
        <Button
          size="mini"
          variant="primary"
          data-testid={`item-save-${code}`}
          disabled={s.busy || !s.canSave}
          onClick={() => store.act(code, "save")}
        >
          저장
        </Button>
        <Button size="mini" data-testid={`item-cancel-${code}`} onClick={() => store.cancel(code)}>
          취소
        </Button>
      </span>
    );
  }
  if (s.editable && isOpen) {
    return (
      <span style={groupStyle}>
        <Button
          size="mini"
          data-testid={`item-close-${code}`}
          disabled={s.busy || !s.canClose}
          onClick={() => store.act(code, "close")}
        >
          닫기
        </Button>
        {historyButton}
      </span>
    );
  }
  if (s.editable) {
    return (
      <span style={groupStyle}>
        <Button
          size="mini"
          data-testid={`item-reopen-${code}`}
          disabled={s.busy || !s.canReopen}
          onClick={() => store.act(code, "reopen")}
        >
          다시 열기
        </Button>
        {historyButton}
      </span>
    );
  }
  return historyButton;
}
