"use client";

/**
 * 스스로 그리는 머리줄(AgDataGrid)의 `count`·`titleExtra` 통로(내부).
 *
 * 이 둘은 부른 화면이 렌더마다 새로 만들기 쉬운 값(React 요소)이라 AgDataGrid 본체의 props 로 흘리면 값이 바뀔 때마다 AgGridReact 까지 다시 그려진다.
 * 그래서 바깥 껍데기(AgDataGrid)가 이 둘을 작은 저장소에 넣고, 나머지 props 만 본체(memo)에 넘긴다 — 저장소를 구독하는 머리줄 칸(GridHeaderSlot)만 다시 그려진다.
 */
import { useSyncExternalStore, type ReactNode } from "react";

import { GridHeaderBar, type GridHeaderBarProps } from "./GridHeaderBar";

export interface GridHeaderExtras {
  count?: number;
  titleExtra?: ReactNode;
}

export interface GridHeaderExtrasStore {
  get: () => GridHeaderExtras;
  set: (next: GridHeaderExtras) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createGridHeaderExtrasStore(initial: GridHeaderExtras): GridHeaderExtrasStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      if (Object.is(next.count, current.count) && Object.is(next.titleExtra, current.titleExtra)) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

interface GridHeaderSlotProps extends Omit<GridHeaderBarProps, "count" | "titleExtra"> {
  store: GridHeaderExtrasStore;
  /** 화면이 `count` 를 주지 않았을 때 보이는 건수(그리드가 받은 행 수). */
  fallbackCount: number;
}

/** 머리줄 부품에 저장소의 `count`·`titleExtra` 를 이어 준다. 저장소가 바뀌면 이 칸(과 머리줄)만 다시 그려진다. */
export function GridHeaderSlot({ store, fallbackCount, ...barProps }: GridHeaderSlotProps) {
  const extras = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <GridHeaderBar {...barProps} count={extras.count ?? fallbackCount} titleExtra={extras.titleExtra} />;
}
