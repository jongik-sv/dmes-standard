"use client";

/**
 * 「걸린 조건」 칩 줄(내부 부품) — 그리드 머리줄 바로 아래에 빠른 검색어와 칸별 필터 조건을 칩으로 보인다. 칩의 × 는 그 조건만 지운다.
 *
 * - GridPanel 머리줄과 AgDataGrid 스스로 그리는 머리줄이 같은 부품(GridHeaderBar)을 쓰므로 이 줄도 어느 쪽에서나 같다.
 * - 걸린 조건이 없으면 줄 자체를 그리지 않는다(DOM 없음, 높이 0). 구독은 이 부품 안에 가둔다 — 조건이 바뀌어도 그리드를 다시 그리지 않는다.
 * - 칩은 Mantine 이 아니라 grid.css 의 토큰 CSS(`.grid-filter-chip`)로 그린다. 색은 의미 토큰만 쓴다.
 */
import { memo, useCallback, useSyncExternalStore } from "react";
import { IconX } from "@tabler/icons-react";

import { NO_FILTER_CHIPS } from "./grid-filter-chips";
import type { GridFilterChip, GridPanelGridControls } from "./grid-panel-context";

interface GridFilterChipsProps {
  controls: GridPanelGridControls | null;
  /** 검색어 칩을 지웠을 때 — 머리줄이 검색 칸의 입력을 비운다. */
  onQuickCleared?: () => void;
}

const noSubscribe = () => () => {};
const noChips = () => NO_FILTER_CHIPS;

function GridFilterChipsComponent({ controls, onQuickCleared }: GridFilterChipsProps) {
  const chips = useSyncExternalStore(controls?.subscribeFilter ?? noSubscribe, controls?.getFilterChips ?? noChips, noChips);
  const clearChip = useCallback(
    (chip: GridFilterChip) => {
      controls?.clearFilterChip?.(chip.id);
      if (chip.kind === "quick") onQuickCleared?.();
    },
    [controls, onQuickCleared],
  );
  if (chips.length === 0) return null;
  return (
    <div className="grid-filter-chips" role="group" aria-label="걸린 조건" data-testid="grid-filter-chips">
      <span className="grid-filter-chips-label">걸린 조건</span>
      {chips.map((chip) => (
        <span key={chip.id} className="grid-filter-chip" title={chip.title} data-testid="grid-filter-chip" data-chip-id={chip.id}>
          <span className="grid-filter-chip-text">{chip.kind === "quick" ? `${chip.label} ${chip.value}` : `${chip.label}: ${chip.value}`}</span>
          <button
            type="button"
            className="grid-filter-chip-clear"
            title={`${chip.label} 조건 지우기`}
            aria-label={`${chip.label} 조건 지우기`}
            data-testid="grid-filter-chip-clear"
            onClick={() => clearChip(chip)}
          >
            <IconX size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

export const GridFilterChips = memo(GridFilterChipsComponent);
