"use client";

/**
 * 「걸린 조건」 칩 줄(내부 부품) — 그리드 머리줄 바로 아래에 빠른 검색어와 칸별 필터 조건을 칩으로 보인다. 칩의 × 는 그 조건만 지운다.
 *
 * - GridPanel 머리줄과 AgDataGrid 스스로 그리는 머리줄이 같은 부품(GridHeaderBar)을 쓰므로 이 줄도 어느 쪽에서나 같다.
 * - 걸린 조건이 없으면 줄 자체를 그리지 않는다(DOM 없음, 높이 0). 구독은 이 부품 안에 가둔다 — 조건이 바뀌어도 그리드를 다시 그리지 않는다.
 * - 포커스: × 를 눌러 그 칩이 사라지면 포커스를 다음 칩의 ×, 없으면 앞 칩의 ×, 칩이 하나도 없으면 `getFocusFallback()`(빠른 검색 입력 칸 → 그리드)으로 옮긴다(포커스가 body 로 빠지지 않게).
 *   사용자가 그 사이 다른 곳으로 포커스를 옮겼으면(포커스가 body 도 칩 줄도 아니면) 건드리지 않는다.
 * - 칩은 Mantine 이 아니라 grid.css 의 토큰 CSS(`.grid-filter-chip`)로 그린다. 색은 의미 토큰만 쓴다.
 */
import { memo, useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { IconX } from "@tabler/icons-react";

import { NO_FILTER_CHIPS } from "./grid-filter-chips";
import type { GridFilterChip, GridPanelGridControls } from "./grid-panel-context";

interface GridFilterChipsProps {
  controls: GridPanelGridControls | null;
  /** 검색어 칩을 지웠을 때 — 머리줄이 검색 칸의 입력을 비운다. */
  onQuickCleared?: () => void;
  /** 칩이 하나도 안 남았을 때 포커스를 받을 곳(빠른 검색 입력 칸, 없으면 그리드 상자). */
  getFocusFallback?: () => HTMLElement | null;
}

const noSubscribe = () => () => {};
const noChips = () => NO_FILTER_CHIPS;

function GridFilterChipsComponent({ controls, onQuickCleared, getFocusFallback }: GridFilterChipsProps) {
  const chips = useSyncExternalStore(controls?.subscribeFilter ?? noSubscribe, controls?.getFilterChips ?? noChips, noChips);
  const groupRef = useRef<HTMLDivElement>(null);
  // × 를 누른 칩 — 누른 시점의 칩 순서(ids)와 그 자리(index). 칩이 실제로 사라진 렌더에서 포커스를 옮긴다(필터 반영이 한 박자 늦어도 따라간다).
  const pendingRef = useRef<{ id: string; ids: string[]; index: number } | null>(null);
  const clearChip = useCallback(
    (chip: GridFilterChip) => {
      pendingRef.current = { id: chip.id, ids: chips.map((c) => c.id), index: chips.findIndex((c) => c.id === chip.id) };
      controls?.clearFilterChip?.(chip.id);
      if (chip.kind === "quick") onQuickCleared?.();
    },
    [controls, onQuickCleared, chips],
  );
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (chips.some((c) => c.id === pending.id)) return; // 아직 안 사라졌다 — 반영을 기다린다
    pendingRef.current = null;
    // 지워진 칩의 × 가 포커스를 쥐고 있었으면 지금 body 로 빠져 있다. 그 사이 다른 곳으로 옮겼다면 건드리지 않는다.
    const active = document.activeElement;
    if (active && active.isConnected && active !== document.body && !groupRef.current?.contains(active)) return;
    const alive = new Set(chips.map((c) => c.id));
    const after = pending.ids.slice(pending.index + 1).find((id) => alive.has(id));
    const before = pending.ids.slice(0, Math.max(pending.index, 0)).reverse().find((id) => alive.has(id));
    const nextId = after ?? before;
    let target: HTMLElement | null | undefined;
    if (nextId) {
      const chipEls: HTMLElement[] = Array.from(groupRef.current?.querySelectorAll<HTMLElement>("[data-chip-id]") ?? []);
      target = chipEls.find((el) => el.dataset.chipId === nextId)?.querySelector<HTMLElement>(".grid-filter-chip-clear");
    } else {
      target = getFocusFallback?.();
    }
    target?.focus({ preventScroll: true });
  }, [chips, getFocusFallback]);
  if (chips.length === 0) return null;
  return (
    <div ref={groupRef} className="grid-filter-chips" role="group" aria-label="걸린 조건" data-testid="grid-filter-chips">
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
