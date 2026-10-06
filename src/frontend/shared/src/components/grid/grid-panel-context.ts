/**
 * GridPanel ↔ 안쪽 AgDataGrid 연결 — 컬럼 개인화가 켜졌거나 엑셀 내려받기(excelExport)를 켠 그리드가 「컬럼 설정 열기·초기화 요청·자동 설정 저장 스위치·엑셀 내려받기」
 * 명령을 GridPanel 에 올려 두면 GridPanel 머리줄의 「그리드 설정」 아이콘 메뉴(GridSettingsMenu)가 그것을 부른다.
 *
 * - GridPanel 이 등록 함수를 Provider 로 내리고, 개인화가 켜진 AgDataGrid 가 등록·해제한다. Provider 밖(GridPanel 없이 쓰는 그리드)이면 null 이다.
 * - 이 파일은 GridPanel.tsx ↔ AgDataGrid.tsx 순환을 만들지 않으려고 따로 둔다(AgDataGrid 는 이미 GridPanel 에서 GRID_TEMP_ID_FIELD 를 가져온다).
 * - tsup 여러 entry 에서 Context 가 둘로 갈리지 않게 globalThis 에 캐시한다(portal-shell/tab-page-context.ts 와 같은 방식).
 */
import { createContext, useContext, type Context } from "react";

/**
 * 개인화가 켜졌거나 엑셀 내려받기(`excelExport`)를 켠 그리드가 GridPanel 에 내주는 명령. 객체는 그리드가 사는 동안(켜짐 상태가 같은 동안)
 * 같은 것이어야 한다(렌더마다 새로 만들지 않는다).
 * - 개인화 명령 5개(openSettings·requestReset·getAutoSave·setAutoSave·subscribeAutoSave)는 개인화가 켜진 그리드만 채운다. 엑셀만 켠 그리드는 비워 둔다.
 * - 엑셀 명령 2개(exportExcel·canExportExcel)는 `excelExport` 를 켠 그리드만 채운다.
 */
export interface GridPanelGridControls {
  /** 컬럼 설정 창을 연다. */
  openSettings?(): void;
  /** 초기화를 요청한다 — 그리드가 확인 창을 띄우고, 확인하면 저장값을 지우고 정의 기준으로 되돌린다(자동 설정 저장 스위치 값은 그대로). */
  requestReset?(): void;
  /** 자동 설정 저장 스위치의 지금 값. */
  getAutoSave?(): boolean;
  /** 자동 설정 저장 스위치를 바꾼다. */
  setAutoSave?(next: boolean): void;
  /** 스위치 값이 바뀔 때 알린다(`useSyncExternalStore` 의 subscribe). 돌려주는 함수로 해제한다. */
  subscribeAutoSave?(listener: () => void): () => void;
  /** 엑셀 파일을 내려받는다 — 아래 줄 [엑셀] 단추와 같은 로직(컬럼 순서·숨긴 열·정렬·필터 반영). */
  exportExcel?(): void;
  /** 내려받을 수 있는가 — 행이 0 이면 false. 메뉴를 열 때와 GridPanel 이 그릴 때 읽는다. */
  canExportExcel?(): boolean;
}

export interface GridPanelRegistry {
  /**
   * 명령을 등록한다. 돌려주는 함수로 해제한다. 같은 GridPanel 에 여럿이면 먼저 등록한 것이 대상이다.
   * `onTargetChange` 는 이 그리드가 대상이 되거나 대상에서 빠질 때(등록 직후 포함) 부른다 — 대상이 된 그리드만 아래 줄 [엑셀] 단추를 숨기려고 쓴다.
   */
  register(controls: GridPanelGridControls, onTargetChange?: (isTarget: boolean) => void): () => void;
}

const GLOBAL_KEY = "__dkOasisGridPanelContext__";

interface GlobalCache {
  [GLOBAL_KEY]?: Context<GridPanelRegistry | null>;
}

const cache = globalThis as unknown as GlobalCache;

export const GridPanelContext: Context<GridPanelRegistry | null> =
  cache[GLOBAL_KEY] ?? (cache[GLOBAL_KEY] = createContext<GridPanelRegistry | null>(null));

/** 가장 가까운 GridPanel 의 등록부. GridPanel 안이 아니면 null. */
export function useGridPanelRegistry(): GridPanelRegistry | null {
  return useContext(GridPanelContext);
}
