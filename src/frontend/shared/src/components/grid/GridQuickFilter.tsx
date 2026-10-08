"use client";

/**
 * GridPanel 머리줄의 빠른 검색 칸과 거른 건수(내부 부품) — 그리드 `filter` 를 켠 AgDataGrid 가 올린 필터 명령을 쓴다.
 *
 * - 검색 칸: 넣은 글자를 잠깐(GRID_QUICK_FILTER_DEBOUNCE_MS) 모았다가 그리드 빠른 검색어로 넣는다. 한글 조합 중 글자마다 그리드를 거르지 않게.
 *   Esc·× 단추로 비운다. 칸의 값은 이 부품이 들고 있다 — 그리드 상태로 다시 그리지 않는다.
 * - 건수: 걸러져 있는 동안만 「보이는 행 / 전체 행」 을 돌려준다. 거르지 않으면 null 이라 GridPanel 이 원래 `count` 를 보인다.
 */
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";

import type { GridFilterCount, GridPanelGridControls } from "./grid-panel-context";
import { GRID_SETTINGS_LABELS } from "./grid-settings-labels";

/** 검색 칸 입력을 그리드에 넣기까지 기다리는 시간(ms). */
export const GRID_QUICK_FILTER_DEBOUNCE_MS = 200;

interface GridQuickFilterProps {
  controls: GridPanelGridControls;
}

function GridQuickFilterComponent({ controls }: GridQuickFilterProps) {
  const [text, setText] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const apply = useCallback(
    (next: string, immediate: boolean) => {
      clearTimeout(timerRef.current);
      if (immediate) controls.setQuickFilter?.(next);
      else timerRef.current = setTimeout(() => controls.setQuickFilter?.(next), GRID_QUICK_FILTER_DEBOUNCE_MS);
    },
    [controls],
  );
  useEffect(() => () => clearTimeout(timerRef.current), []);
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
    <div className="grid-quick-filter" data-testid="grid-quick-filter">
      <IconSearch className="grid-quick-filter-icon" size={14} aria-hidden="true" />
      <input
        type="text"
        className="grid-quick-filter-input"
        value={text}
        placeholder={GRID_SETTINGS_LABELS.quickFilter}
        aria-label={GRID_SETTINGS_LABELS.quickFilter}
        autoComplete="off"
        data-testid="grid-quick-filter-input"
        onChange={(e) => {
          setText(e.target.value);
          apply(e.target.value, false);
        }}
        onKeyDown={onKeyDown}
      />
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

/** 걸러져 있는 동안의 건수. 명령이 없거나 거르지 않으면 null. */
export function useGridFilterCount(controls: GridPanelGridControls | null): GridFilterCount | null {
  return useSyncExternalStore(
    controls?.subscribeFilter ?? noSubscribe,
    controls?.getFilterCount ?? noCount,
    noCount,
  );
}
