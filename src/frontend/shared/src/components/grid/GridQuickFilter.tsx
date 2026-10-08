"use client";

/**
 * GridPanel 머리줄의 빠른 검색 칸과 거른 건수(내부 부품) — 그리드 `filter` 를 켠 AgDataGrid 가 올린 필터 명령을 쓴다.
 *
 * - 검색 칸: 처음 값은 그리드에 걸린 검색어(다시 마운트돼도 이어진다). 넣은 글자를 잠깐(GRID_QUICK_FILTER_DEBOUNCE_MS) 모았다가 그리드 빠른 검색어로 넣는다. 한글 조합 중 글자마다 그리드를 거르지 않게.
 *   Esc·× 단추로 비운다. 칸의 값은 이 부품이 들고 있다 — 그리드 상태로 다시 그리지 않는다.
 * - 안내 글: 받아 둔 행 안에서만 찾는다는 것을 툴팁(title)과 보조 설명(aria-describedby)으로 알린다. 서버 페이징이면 「지금 쪽에서만」, 편집 칸이 있으면 「새로 넣은 행도 조건에 맞지 않으면 숨습니다」 를 덧붙인다.
 * - 건수: 걸러져 있는 동안만 「보이는 행 / 전체 행」 을 돌려준다. 거르지 않으면 null 이라 GridPanel 이 원래 `count` 를 보인다.
 */
import { memo, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";

import type { GridFilterCount, GridPanelGridControls } from "./grid-panel-context";
import { GRID_SETTINGS_LABELS, gridFilterNotice } from "./grid-settings-labels";

/** 검색 칸 입력을 그리드에 넣기까지 기다리는 시간(ms). */
export const GRID_QUICK_FILTER_DEBOUNCE_MS = 200;

interface GridQuickFilterProps {
  controls: GridPanelGridControls;
  /** 서버 페이징 GridPanel — 안내 글이 「지금 쪽에서만」 으로 바뀐다. */
  serverPaged?: boolean;
}

const noEditable = () => false;

function GridQuickFilterComponent({ controls, serverPaged = false }: GridQuickFilterProps) {
  // 다시 마운트돼도(켜짐이 잠깐 꺼졌다 켜지거나 대상 그리드가 바뀔 때) 그리드에 걸려 있는 검색어로 시작한다 — 칸은 빈데 행이 숨는 일이 없게.
  const [text, setText] = useState(() => controls.getQuickFilterText?.() ?? "");
  const [boundControls, setBoundControls] = useState(controls);
  if (boundControls !== controls) {
    // 같은 칸이 다른 그리드를 가리키게 되면 그 그리드의 검색어로 맞춘다(렌더 중 상태 조정 — 한 번 더 그린 뒤 정착).
    setBoundControls(controls);
    setText(controls.getQuickFilterText?.() ?? "");
  }
  const isEditable = controls.isFilterEditable ?? noEditable;
  const notice = gridFilterNotice({ paged: serverPaged, editable: isEditable() });
  const noticeId = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const apply = useCallback(
    (next: string, immediate: boolean) => {
      clearTimeout(timerRef.current);
      if (immediate) controls.setQuickFilter?.(next);
      else timerRef.current = setTimeout(() => controls.setQuickFilter?.(next), GRID_QUICK_FILTER_DEBOUNCE_MS);
    },
    [controls],
  );
  useEffect(() => () => clearTimeout(timerRef.current), [controls]);
  const clear = useCallback(() => {
    setText("");
    apply("", true);
  }, [apply]);
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape" && text !== "") {
        e.stopPropagation();
        clear();
      }
    },
    [text, clear],
  );
  return (
    <div className="grid-quick-filter" data-testid="grid-quick-filter" title={notice}>
      <IconSearch className="grid-quick-filter-icon" size={14} aria-hidden="true" />
      <input
        type="text"
        className="grid-quick-filter-input"
        value={text}
        placeholder={GRID_SETTINGS_LABELS.quickFilter}
        aria-label={GRID_SETTINGS_LABELS.quickFilter}
        aria-describedby={noticeId}
        title={notice}
        autoComplete="off"
        data-testid="grid-quick-filter-input"
        onChange={(e) => {
          setText(e.target.value);
          apply(e.target.value, false);
        }}
        onKeyDown={onKeyDown}
      />
      <span id={noticeId} className="grid-quick-filter-notice" data-testid="grid-quick-filter-notice">
        {notice}
      </span>
      {text !== "" ? (
        <button
          type="button"
          className="grid-quick-filter-clear"
          title="검색어 지우기"
          aria-label="검색어 지우기"
          data-testid="grid-quick-filter-clear"
          onClick={clear}
        >
          <IconX size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export const GridQuickFilter = memo(GridQuickFilterComponent);

const noSubscribe = () => () => {};
const noCount = () => null;
const alwaysVisible = () => true;
const neverVisible = () => false;

/**
 * 빠른 검색 칸을 지금 보일 것인가. 대상이 없으면 false, `getQuickFilterVisible` 을 올리지 않았으면(filter={true}) 늘 true,
 * 올렸으면(filter 생략 — 「필터 창 보기」 를 켠 동안만) 그 값이다.
 */
export function useGridQuickFilterVisible(controls: GridPanelGridControls | null): boolean {
  return useSyncExternalStore(
    controls?.subscribeFilter ?? noSubscribe,
    controls ? (controls.getQuickFilterVisible ?? alwaysVisible) : neverVisible,
    neverVisible,
  );
}

/** 걸러져 있는 동안의 건수. 명령이 없거나 거르지 않으면 null. */
export function useGridFilterCount(controls: GridPanelGridControls | null): GridFilterCount | null {
  return useSyncExternalStore(
    controls?.subscribeFilter ?? noSubscribe,
    controls?.getFilterCount ?? noCount,
    noCount,
  );
}
