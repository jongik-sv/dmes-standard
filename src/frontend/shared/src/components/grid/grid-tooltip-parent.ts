"use client";

import { useEffect, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";

/**
 * 그리드 툴팁(머리글·셀 값·MDM 카드·검증 오류)을 그리드 밖(`document.body`)에 띄우는 훅 (2026-10-05).
 *
 * ag-grid 는 팝업을 그리드 안(`popupParent` 기본값)에 붙이고 위치를 그 안으로 맞춘다. 그리드(`.cm-data-grid`·`.grid-panel`)는 성능 때문에
 * `overflow: hidden`·`contain: strict` 라서 좁은 그리드의 넓은 툴팁은 오른쪽이 잘렸다.
 *
 * `popupParent` 를 항상 body 로 두면 필터·열 메뉴·셀 편집기 팝업도 body 로 가서 모달 위에 가려지거나 테마 변수가 끊길 수 있으므로,
 * **툴팁이 뜰 수 있는 동안에만** body 로 바꾼다. 머리글·셀 위에 마우스가 오르면 바꾸고, 눌림(mousedown)·키 입력·그리드를 떠남·툴팁 숨김(`tooltipHide`)에서 되돌린다.
 * 팝업은 만들어질 때의 부모에 붙고 그 부모에서 지워지므로 되돌려도 떠 있는 툴팁은 그대로다.
 * 편집·열 끌기·열 메뉴는 눌림이나 키 입력으로 시작하므로 그 팝업은 늘 그리드 안에 붙는다.
 *
 * 툴팁 바탕·글자 변수는 grid.css 의 `body > .ag-popup` 규칙이 body 쪽 팝업 감싸개에 준다. 감싸개에는 `ag-theme-alpine` 이 아니라 Theming API 의
 * `ag-theme-params-N` 클래스만 붙으므로 테마 클래스가 아니라 위치로 고른다.
 *
 * 호출자가 `popupParent` 를 따로 주는 그리드와는 함께 쓰지 않는다 — 그 값이 body 가 아니면 이 훅은 건드리지 않는다(켤 때 건너뛴다).
 */
export function useGridTooltipOutside(
  containerRef: RefObject<HTMLElement | null>,
  gridRef: RefObject<AgGridReact | null>
): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof document === "undefined") return;
    let outside = false;
    let hideListenerApi: unknown = null;

    const set = (on: boolean) => {
      if (outside === on) return;
      const api = gridRef.current?.api;
      if (!api || api.isDestroyed()) return;
      // 호출자가 popupParent 를 줬으면(body 가 아님) 그 값을 지키려고 건드리지 않는다.
      const given = api.getGridOption("popupParent");
      if (on && given && given !== document.body) return;
      if (hideListenerApi !== api) {
        hideListenerApi = api;
        api.addEventListener("tooltipHide", () => set(false));
      }
      outside = on;
      api.setGridOption("popupParent", on ? document.body : undefined);
    };

    const onOver = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(".ag-header-cell, .ag-cell")) set(true);
    };
    const off = () => set(false);

    el.addEventListener("mouseover", onOver);
    el.addEventListener("mouseleave", off);
    el.addEventListener("mousedown", off, true);
    el.addEventListener("keydown", off, true);
    return () => {
      el.removeEventListener("mouseover", onOver);
      el.removeEventListener("mouseleave", off);
      el.removeEventListener("mousedown", off, true);
      el.removeEventListener("keydown", off, true);
    };
  }, [containerRef, gridRef]);
}
