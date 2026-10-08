/**
 * GridPanel ↔ 안쪽 AgDataGrid 연결 — 컬럼 개인화가 켜졌거나 엑셀 출력이 켜진 그리드(GridPanel 안에서는 `excelExport={false}` 가 아니면 기본 켬)가 「컬럼 설정 열기·초기화 요청·자동 설정 저장 스위치·엑셀 내려받기」
 * 명령을 GridPanel 에 올려 두면 GridPanel 머리줄의 「그리드 설정」 아이콘 메뉴(GridSettingsMenu)가 그것을 부른다.
 *
 * - GridPanel 이 등록 함수를 Provider 로 내리고, 개인화가 켜진 AgDataGrid 가 등록·해제한다. Provider 밖(GridPanel 없이 쓰는 그리드)이면 null 이다.
 * - 이 파일은 GridPanel.tsx ↔ AgDataGrid.tsx 순환을 만들지 않으려고 따로 둔다(AgDataGrid 는 이미 GridPanel 에서 GRID_TEMP_ID_FIELD 를 가져온다).
 * - tsup 여러 entry 에서 Context 가 둘로 갈리지 않게 globalThis 에 캐시한다(portal-shell/tab-page-context.ts 와 같은 방식).
 */
import { createContext, useContext, type Context } from "react";

/**
 * 개인화가 켜졌거나 엑셀 출력이 켜진 그리드가 GridPanel 에 내주는 명령. 객체는 그리드가 사는 동안(켜짐 상태가 같은 동안)
 * 같은 것이어야 한다(렌더마다 새로 만들지 않는다).
 * - 개인화 명령 5개(openSettings·requestReset·getAutoSave·setAutoSave·subscribeAutoSave)는 개인화가 켜진 그리드만 채운다. 엑셀만 켠 그리드는 비워 둔다.
 * - 엑셀 명령 2개(exportExcel·canExportExcel)는 엑셀 출력이 켜진 그리드만 채운다(GridPanel 안이면 `excelExport={false}` 가 아닌 모든 그리드).
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
  /** 엑셀 파일을 내려받는다 — `excelExport` 를 준 그리드는 아래 줄 [엑셀] 단추와 같은 로직(컬럼 순서·숨긴 열·정렬·필터 반영). */
  exportExcel?(): void;
  /** 내려받을 수 있는가 — 행이 0 이면 false. 메뉴를 열 때와 GridPanel 이 그릴 때 읽는다. */
  canExportExcel?(): boolean;
  /**
   * 필터 명령. 그리드 `filter={true}` 인 그리드와, `filter` 를 생략한 GridPanel 안 그리드(설정 메뉴가 있는 것)가 올린다. 빠른 검색어·거른 건수는 GridPanel 머리줄이 쓰고,
   * 「필터 창 보기」 는 설정 메뉴가 쓴다. 입력 줄 명령(getFilterRowOpen·setFilterRowOpen)은 설정 메뉴를 켠 그리드만 채운다(`settingsMenu={false}` 면 비운다).
   */
  setQuickFilter?(text: string): void;
  /**
   * 「필터 창 보기」 가 켜져 있는가 — `filter={true}` 그리드는 입력 줄이 펼쳐져 있는가, `filter` 생략 그리드는 걸러 보기 전체(검색 칸 + 입력 줄)가 켜져 있는가.
   */
  getFilterRowOpen?(): boolean;
  /**
   * 「필터 창 보기」 를 켜고 끈다. `filter={true}` 그리드는 입력 줄만 펴고 접으며 끄면 칸별 조건만 지운다(빠른 검색어는 그대로).
   * `filter` 생략 그리드는 검색 칸과 입력 줄이 함께 나타나고 사라지며, 끄면 칸별 조건과 검색어를 모두 지운다. 켜짐은 그리드가 기억한다.
   */
  setFilterRowOpen?(open: boolean): void;
  /**
   * 빠른 검색 칸을 지금 보일 것인가. `filter` 생략 그리드(켜기 전에는 검색 칸이 없다)만 채운다 — 비어 있으면(`filter={true}`) 늘 보인다.
   * 바뀔 때 `subscribeFilter` 로 알린다.
   */
  getQuickFilterVisible?(): boolean;
  /** 편집 칸이 있는 그리드인가 — 검색 칸 안내 글에 「새로 넣은 행도 조건에 맞지 않으면 숨습니다」 를 덧붙인다. */
  isFilterEditable?(): boolean;
  /** 거른 건수 — 걸러 보이는 행 수와 전체 행 수. 거르지 않으면 null. 값이 같으면 같은 객체를 돌려준다(`useSyncExternalStore` 의 getSnapshot). */
  getFilterCount?(): GridFilterCount | null;
  /** 입력 줄·거른 건수가 바뀔 때 알린다. 돌려주는 함수로 해제한다. */
  subscribeFilter?(listener: () => void): () => void;
}

/** 거른 동안의 건수 — GridPanel 머리줄이 「보이는 행 / 전체 행」 으로 보인다. */
export interface GridFilterCount {
  shown: number;
  total: number;
}

export interface GridPanelRegistry {
  /** 이 GridPanel 의 제목(`title`) — 엑셀 파일 이름의 기본값. 내려받을 때 읽는다. */
  getTitle(): string | undefined;
  /**
   * 명령을 등록한다. 돌려주는 함수로 해제한다. 같은 GridPanel 에 여럿이면 개인화 명령을 가진 그리드 중 먼저 등록한 것이 대상이고, 없으면 먼저 등록한 것이다.
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
