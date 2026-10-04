import type { Locator, Page } from "@playwright/test";

/**
 * ag-grid 본문(가운데 열 영역) 행·칸 찾기. 고정 열(.ag-pinned-left/right-cols-container)·머리 행은 빼고
 * 가운데 영역(.ag-center-cols-container)만 본다 — 스펙들이 쓰던 셀렉터 문자열을 그대로 만든다.
 * 칸 값 확인(열 가상화로 안 그려진 칸 굴려 보기)은 mdm-e2e.ts 의 expectRowCell·revealGridColumn 을 쓴다.
 */

type Root = Page | Locator;
type LocatorOptions = Parameters<Page["locator"]>[1];

const BODY = ".ag-center-cols-container";

/** 그리드 본문의 모든 행(그려진 것만). options 는 locator 의 두 번째 인자(hasText·has 등) 그대로. */
export function gridRows(root: Root, options?: LocatorOptions): Locator {
  return root.locator(`${BODY} .ag-row`, options);
}

/** row-id(그리드 getRowId 값)로 찾은 본문 행. */
export function gridRowById(root: Root, rowId: string): Locator {
  return root.locator(`${BODY} .ag-row[row-id="${rowId}"]`);
}

/** row-index(화면 순서, 0부터)로 찾은 본문 행. */
export function gridRowByIndex(root: Root, rowIndex: number): Locator {
  return root.locator(`${BODY} .ag-row[row-index="${rowIndex}"]`);
}

/** 본문에서 col-id 열의 모든 칸(행 순서). */
export function gridCells(root: Root, colId: string): Locator {
  return root.locator(`${BODY} .ag-cell[col-id="${colId}"]`);
}
