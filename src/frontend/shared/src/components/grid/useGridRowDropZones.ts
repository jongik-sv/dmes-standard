"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { IRowNode, RowDragEvent, RowDropZoneParams } from "ag-grid-community";
import type { GridRowDropZone } from "./grid-types";

/** 끌고 있는 행들의 데이터. ag-grid 는 여러 행을 끌 때 `nodes`, 한 행이면 `node` 만 채울 수 있다. */
function draggedRows(event: RowDragEvent): Record<string, unknown>[] {
  const nodes: IRowNode[] = event.nodes && event.nodes.length > 0 ? event.nodes : event.node ? [event.node] : [];
  return nodes.map((n) => (n.data ?? {}) as Record<string, unknown>);
}

/** 놓을 자리 요소가 아직 없을 때 ag-grid 에 넘기는 빈 요소. 화면에 붙지 않으므로 어떤 마우스 위치와도 겹치지 않는다. */
let detachedContainer: HTMLElement | null = null;
function emptyContainer(): HTMLElement {
  if (!detachedContainer) detachedContainer = document.createElement("div");
  return detachedContainer;
}

/**
 * 그리드 밖 놓을 자리(`rowDropZones`)를 ag-grid `addRowDropZone` 으로 등록한다.
 *
 * 등록은 그리드가 준비된 뒤, 자리 개수가 바뀔 때만 다시 한다. 끄는 중에 화면이 강조 표시로 다시 그려져도 등록을 지우지 않게
 * 하기 위해서다(끄는 중 등록이 풀리면 놓기가 사라진다). 콜백과 `getContainer` 는 최신 값을 ref 로 읽는다.
 */
export function useGridRowDropZones(
  gridRef: RefObject<AgGridReact | null>,
  gridReady: boolean,
  zones: GridRowDropZone[] | undefined,
): void {
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const count = zones?.length ?? 0;

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!gridReady || !api || count === 0) return;
    const registered: RowDropZoneParams[] = [];
    for (let i = 0; i < count; i++) {
      const zone = (): GridRowDropZone | undefined => zonesRef.current?.[i];
      const params: RowDropZoneParams = {
        getContainer: () => zone()?.getContainer() ?? emptyContainer(),
        onDragging: (e) => zone()?.onDragging?.(draggedRows(e), e.event),
        onDragLeave: () => zone()?.onDragLeave?.(),
        onDragCancel: () => zone()?.onDragLeave?.(),
        onDragStop: (e) => zone()?.onDrop(draggedRows(e), e.event),
      };
      api.addRowDropZone(params);
      registered.push(params);
    }
    return () => {
      if (api.isDestroyed()) return;
      for (const params of registered) api.removeRowDropZone(params);
    };
  }, [gridRef, gridReady, count]);
}
