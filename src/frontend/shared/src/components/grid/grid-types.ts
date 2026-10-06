import type React from "react";
import type { ColDef } from "ag-grid-community";
import type { AgDataGridExcelExport } from "./AgDataGridExcel";
import type { GridPersonalize } from "./grid-personalize";

export interface GridColumn {
  key: string;
  /**
   * 머리글. 비우면(undefined) MDM 공급자 안에서는 컬럼 사전 캡션(labelShort → labelMid → labelLong → columnName), 그 밖에는 `key`.
   * `""` 는 일부러 비운 머리글로 그대로 둔다. 공급자가 `captionPriority="mdm"` 이면 MDM 캡션이 적은 값을 이긴다(spec B1·B2).
   */
  header?: string;
  /**
   * MDM 컬럼 사전 연결 키. 비우면 `key` 를 물리명으로 바꿔(`codeNm` → `CODE_NM`) 찾고, 물리명 문자열을 주면 그것으로, `false` 면 연결하지 않는다
   * (spec B6). 공급자(포털 탭) 밖에서는 쓰지 않는다.
   */
  meta?: string | false;
  /** 커스텀 헤더 컴포넌트 (ag-grid ColDef.headerComponent 패스스루). */
  headerComponent?: ColDef["headerComponent"];
  /** 커스텀 헤더 컴포넌트 파라미터 (ag-grid ColDef.headerComponentParams 패스스루). */
  headerComponentParams?: ColDef["headerComponentParams"];
  width?: number | string;
  minWidth?: number;
  align?: "left" | "center" | "right";
  headerAlign?: "left" | "center" | "right";
  type?: "string" | "number" | "boolean";
  sortable?: boolean;
  /** false 면 이 칸의 마우스오버 툴팁(셀 값)을 끈다 — 값이 화면 표시용이 아닌 render 전용 칸에 쓴다. */
  tooltip?: boolean;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  /** 인라인 편집 허용 여부.
   * true → 모든 행 편집 가능, false → 모든 행 편집 불가, 함수 → 행별 동적 판단. */
  editable?: boolean | ((row: Record<string, unknown>) => boolean);
  /** 인라인 편집기 종류. 기본 "text".
   *  - "text"     → 기본 input
   *  - "number"   → 숫자만
   *  - "select"   → cellEditorParams.values 로 옵션 지정
   *  - "datetime" → datetime-local 위젯(날짜+시간). 값은 ISO 초단위 문자열로 반환 */
  cellEditor?: "text" | "number" | "select" | "datetime";
  /** select 편집기일 때 옵션. */
  cellEditorValues?: string[];
  /**
   * select 편집기 옵션을 **행별로 동적** 지정. 지정 시 `cellEditorValues`(정적)보다 우선한다.
   * (예: 창고→렉 캐스케이드처럼 같은 컬럼이라도 행마다 후보 목록이 다른 경우.)
   * 라벨은 `cellEditorValueLabels`(컬럼 단위 refData, 전체 키 상위집합) 로 표시된다.
   */
  cellEditorValuesGetter?: (row: Record<string, unknown>) => string[];
  /**
   * select 편집기 옵션을 **행별 {value,label} 목록**으로 동적 지정 — 라벨까지 행별로 정확해야 할 때 사용.
   * 지정 시 `cellEditorValuesGetter`/`cellEditorValues`/`cellEditorValueLabels`(전역 refData)보다 우선하며,
   * 전용 SelectCellEditor 가 드롭다운을 라벨로 표시하고 셀에는 키를 저장한다.
   * (예: 렉번호는 창고 내에서만 고유 — 같은 R01 이 창고마다 다른 렉명을 가지므로 전역 라벨맵이 불가.)
   * 셀 표시도 동일 라벨로 하려면 `render` 를 함께 지정한다.
   */
  cellEditorOptionsGetter?: (row: Record<string, unknown>) => { value: string; label: string }[];
  /**
   * select 편집기 옵션의 표시 라벨 맵 { 값(키): 표시문구 }. 지정 시 드롭다운은 라벨로 보이되 셀에는 키가 저장된다.
   * (예: { "KR022": "부품창고(KR022)" } → 명칭 표시·키 저장.) 셀 표시도 동일 라벨로 하려면 `render` 를 함께 지정.
   */
  cellEditorValueLabels?: Record<string, string>;
  /**
   * select 편집기를 ag-grid 내장(agSelectCellEditor)으로 강제(옵트아웃).
   * 기본(미지정)은 전용 SelectCellEditor — 단일 클릭 즉시 드롭다운 오픈·선택 즉시 commit.
   */
  selectNativeEditor?: boolean;
  /** 컬럼 숨김 (ag-grid 표준 ColDef.hide 패스스루). 화면이 숨긴 내부 컬럼은 컬럼 설정 창에 나오지 않고 엑셀에서도 빠진다. */
  hide?: boolean;
  /**
   * 컬럼 개인화에서 사용자가 이 컬럼을 숨길 수 있는가.
   * 기본: 편집 가능한 컬럼(`editable` 이 true 또는 함수)은 잠금(숨길 수 없음), 나머지는 숨길 수 있다.
   * `true` 면 편집 가능한 컬럼도 숨길 수 있고, `false` 면 편집 불가 컬럼도 잠근다.
   * 선택 체크박스·행번호·`rowKey`·행 드래그 컬럼은 이 값과 관계없이 늘 잠금이다. 잠긴 컬럼도 순서 이동은 된다.
   */
  hideable?: boolean;
  /** 틀고정(좌/우 pinned) — ag-grid ColDef.pinned 패스스루. 가로 스크롤 시 해당 컬럼 고정. */
  pinned?: "left" | "right";
  /** 셀에 상시 부여할 CSS 클래스 (문자열 또는 행 단위 동적 함수). */
  cellClass?: string | string[] | ((row: Record<string, unknown>) => string | string[] | undefined);
  /** 조건부 셀 클래스 규칙 — { 클래스명: (row) => boolean } 형태. ag-grid 의 cellClassRules 패스스루. */
  cellClassRules?: Record<string, (row: Record<string, unknown>) => boolean>;
  /**
   * 행 드래그 손잡이를 이 컬럼에 둔다(ag-grid ColDef.rowDrag, community managed row drag).
   * 그리드에 `onRowOrderChange` 가 있을 때만 의미가 있다(TSK-05-02 D6).
   */
  rowDrag?: boolean;
  /**
   * 머리 툴팁 (ag-grid ColDef/ColGroupDef.headerTooltip 패스스루). 잎 열은 비우면 MDM 메타 카드, 메타가 없으면 표시 머리글 이름이 기본이다
   * (메타 없는 빈 이름 열·headerComponent 열 제외). `""` 를 주면 끈다.
   */
  headerTooltip?: string;
  /** 머리 칸 인라인 스타일 (ag-grid ColDef/ColGroupDef.headerStyle 패스스루). 색은 의미 토큰(var(--color-*))만 쓴다. */
  headerStyle?: ColDef["headerStyle"];
  /**
   * 하위 열 — 있으면 이 항목은 열 그룹(ColGroupDef, groupId = key)이 되고 잎만 데이터 열이다. 여러 줄 머리를 만든다.
   * 그룹 항목의 `headerComponent`·`headerComponentParams` 는 그룹 머리 컴포넌트(headerGroupComponent)로 쓴다.
   */
  children?: GridColumn[];
}

export interface AgDataGridProps {
  columns?: GridColumn[];
  data?: Record<string, unknown>[];
  rowKey?: string;
  /**
   * 그리드 높이. 기본 "100%"(부모 높이를 채우고 행은 안에서 스크롤).
   * `"auto"` 는 행 수만큼 높이가 늘어난다(ag domLayout="autoHeight") — 카드·패널 안의 몇 행짜리 작은 목록용.
   * 행이 많아질 수 있는 목록에는 쓰지 않는다(가상 스크롤이 꺼져 모든 행을 그린다).
   */
  height?: string | number;
  selectable?: boolean;
  multiSelect?: boolean;
  /** 편집이 완료된 행을 자동 선택한다. 일괄 처리 대상의 인라인 입력 화면에서 사용한다. */
  checkRowOnEdit?: boolean;
  isRowSelectable?: (row: Record<string, unknown>) => boolean;
  /**
   * ★제어형 선택(2026-07-28 구현): 제공 시 그리드 체크 상태를 이 키 목록과 동기화한다.
   * 페이지가 선택을 프로그램으로 교체(예: 헤더 전체선택 → 필요수량 맞춤 자동선택)할 수 있게 하는 옵션.
   * undefined = 비제어(기존 동작). (기존에 선언만 있고 미구현이던 prop 을 실제 배선.)
   */
  selectedRows?: (string | number)[];
  onRowSelect?: (
    selectedIds: (string | number)[],
    selectedData: Record<string, unknown> | Record<string, unknown>[]
  ) => void;
  onRowClick?: (row: Record<string, unknown>, event: Event) => void;
  onRowDoubleClick?: (row: Record<string, unknown>, event: Event) => void;
  /**
   * 칸 포커스가 옮겨 간 행(편집 그리드에서 ↑/↓·Tab·클릭으로 포커스 칸이 바뀔 때). 편집 컬럼이 있으면 ag-grid 가 화살표를
   * 먼저 처리해 컨테이너 ↑/↓(onRowClick) 가 돌지 않으므로, 커서 행을 따라가야 하는 화면이 이것으로 받는다. 같은 행이어도 부를 수 있다.
   */
  onFocusedRowChange?: (row: Record<string, unknown>) => void;
  /**
   * 글자 입력 칸을 편집하는 중 ↑/↓ 로 같은 열의 이전·다음 행으로 옮겨 편집을 이어 연다(엑셀식). 옮기기 전 칸은 편집을 마쳐 값을 반영한다.
   * 선택 목록 편집기처럼 ↑/↓ 를 스스로 쓰는 편집기는 건드리지 않는다. 기본 false.
   */
  editArrowNavigation?: boolean;
  sortable?: boolean;
  emptyMessage?: string;
  /** 데이터 없음 안내 문구에 붙일 data-testid(화면·E2E 가 빈 상태를 확인할 때). */
  emptyTestId?: string;
  className?: string;
  /**
   * 맨 앞에 행번호(No) 열을 둔다 — 목록에서 "이게 몇 번째 행인지" 를 바로 읽게 한다(ERP 목록 표준).
   *
   * <p>`true` 면 머리는 "No", 폭 56px. `{ header, width }` 로 바꿀 수 있다. 정렬하면 값이 다시 매겨진다
   * (저장 값이 아니라 ag-grid 의 표시 순서다).
   */
  rowNumber?: boolean | { header?: string; width?: number };
  /**
   * ★행 커서(`.ag-row-highlighted`) 위치 — **값을 넘기면 controlled**, 안 넘기면 그리드가 자체 관리한다.
   *
   * - controlled: 화면이 커서를 소유한다. `null` 로 주면 커서를 지운다(옛 계약 그대로).
   * - 자체 관리(기본값): 클릭한 행에 커서가 붙고 ↑/↓ 로 이전·다음 행으로 옮겨 간다(2026-09-30 기본 기능).
   *   목록이 있으면 어느 화면이든 "지금 어느 행이지" 가 보인다 — 화면마다 `onRowClick` + `highlightedRowKey` 를
   *   붙여야 했던 반복을 없앤다.
   * - 값을 넘기다가 `undefined` 로 바꾸면(`selectedId ?? undefined` 처럼) 커서를 지우고 자체 관리로 돌아간다.
   */
  highlightedRowKey?: string | number | null;
  scrollToRow?: string | number | null;
  loading?: boolean;
  loadingMessage?: string;
  autoSizeColumns?: boolean;
  /** @deprecated columnSizing="fit" 또는 명시 컬럼 폭을 사용한다. 이 prop 단독으로는 컨텐츠 기반 자동 폭을 켜지 않는다. */
  sizeToFit?: boolean;
  /**
   * 컬럼 합계가 화면보다 넓은 업무 그리드에서 가로 스크롤 영역을 항상 표시한다.
   * AG Grid `alwaysShowHorizontalScroll` 패스스루.
   */
  alwaysShowHorizontalScroll?: boolean;
  /**
   * columnSizing="auto" 일 때 데이터 변경마다 컨텐츠 기반 열폭을 다시 계산할지 여부.
   * 기본 true: 재조회 시 기존 셀보다 큰 데이터가 들어오면 컬럼을 자동 확장한다.
   * (50ms 디바운스 + userResizedRef 가드로 반복 측정/수동 폭은 보호됨)
   */
  autoSizeOnDataUpdate?: boolean;
  ariaLabel?: string;
  /**
   * 행 단위 높이 산출 (ag-grid getRowHeight 패스스루). 미지정/undefined 반환 시 기본 26px.
   * 한 셀에 여러 줄(개행)이 들어가는 그리드에서 사용한다 —
   * 예: SampleErp ManagedGrid 의 `row.Height = CountRow * 20` 재현.
   */
  getRowHeight?: (row: Record<string, unknown>) => number | undefined;
  /** 로우 클릭 시 선택 토글 (enableClickSelection 대신 직접 제어) */
  enableRowClickSelect?: boolean;
  /** 클릭 시 선택을 하지 않을 컬럼 key 목록 */
  selectExcludeColumns?: string[];
  /**
   * 선택 행(없으면 포커스 행)의 colDef field 값을 화면 문맥(`@dk-oasis/shared/screen-context`)으로 자동 게시한다.
   * 업무 화면 위 도구 창(도크)의 위젯이 이 값을 받아 입력 칸을 채운다. 화면 모양·기존 이벤트 동작은 바뀌지 않는다.
   * 선택 행이 여럿이면 마지막으로 고른 행, 화면에 그리드가 여럿이면 마지막으로 행을 고른 그리드가 이긴다. 대화 상자 안 그리드는 게시하지 않는다.
   * 기본 true. `false` 로 끈다.
   */
  publishScreenContext?: boolean;
  /**
   * 행 아무 곳이나 클릭 시 그 행의 체크박스를 토글한다(기본 false). `selectable` 과 함께 사용.
   * 단 클릭 대상이 입력요소(input/select/textarea/button/a·contentEditable)·편집 중 셀·행 선택 체크박스면
   * 토글하지 않는다(이벤트 타깃 검사). `selectExcludeColumns` 도 함께 적용된다.
   * ★편집 가능 컬럼이 있는 그리드에는 사용하지 말 것 — 대신 `checkRowOnEdit` 을 쓴다.
   */
  rowClickCheck?: boolean;
  /** 셀 편집(인라인) 값 변경 콜백 — 컬럼의 editable 이 true 일 때만 발화. */
  onCellValueChanged?: (params: {
    rowKey: string | number;
    field: string;
    newValue: unknown;
    oldValue: unknown;
    row: Record<string, unknown>;
  }) => void;
  /** 한 번 클릭으로 편집 시작 (기본 false — 더블클릭으로 진입). */
  singleClickEdit?: boolean;
  /**
   * 셀이 포커스를 잃을 때 편집 모드를 자동 종료할지 (기본 true).
   * `false` 설정 시 행추가 직후 React re-render 로 cell 이 잠시 unmount/focus 이동되어도 편집 유지.
   * cma 4 화면 (Master Code 관리 등) 처럼 행추가 후 즉시 입력 시작이 필요한 경우 사용.
   */
  stopEditingWhenCellsLoseFocus?: boolean;
  /**
   * 컬럼 폭 모드 (기본 "fixed").
   *  - "auto" : autoSizeColumns 옵션 기반. 컨텐츠 폭을 DOM 측정하므로 필요한 화면에서만 명시 사용.
   *  - "fixed": col.width 픽셀 그대로. 합계가 그리드 폭 초과 시 좌우 스크롤. 데이터 변경에도 폭 유지.
   *  - "fit"  : col.width 를 비율(flex 가중치) 로 환산해 그리드 폭 100% 꽉 차게. 좌우 스크롤 없음.
   *
   * 예) col.width=[100, 200, 300] + columnSizing="fit" → 16.7% / 33.3% / 50% 분배.
   *     col.width 미지정 컬럼은 flex=1 로 동등 분배.
   */
  columnSizing?: "auto" | "fixed" | "fit";
  /** 행 단위 추가 클래스 (예: row 상태에 따른 색상 시각화). 내부 ag-row-* 와 병합됨. */
  getRowClassExtra?: (row: Record<string, unknown>) => string | string[] | undefined;
  /**
   * 동적인 `getRowClassExtra` 조건이 바뀌었음을 알리는 토큰.
   * 값이 바뀌면 AG Grid 행을 다시 그려 이전 행에 남은 클래스를 제거한다.
   * 드래그 오버처럼 rowData 자체는 그대로이고 행 분류만 빠르게 바뀌는 화면에서 사용한다.
   */
  rowClassRefreshToken?: unknown;
  /**
   * 트리(계층) 그리드에서 ←/→ 키로 현재 포커스(highlightedRowKey) 행을 펼침/접힘 할 때 호출.
   * expand=true(→ 펼침), false(← 접힘). 이 콜백이 있을 때만 ←/→ 를 가로채며, 없으면 ag-grid 기본 동작을 유지한다.
   * 트리 평탄화·펼침 상태 자체는 호출자가 관리한다(이 컴포넌트는 트리 구조를 모른다).
   */
  onRowExpandCollapse?: (rowKey: string | number, expand: boolean) => void;
  /**
   * 헤더 텍스트가 컬럼 폭보다 길면 줄바꿈(여러 줄) 표시. 좁은 고정폭 컬럼에서 헤더가 잘리는 것을 방지.
   * autoHeaderHeight 와 함께 쓰면 줄바꿈된 헤더 높이에 맞춰 헤더 행이 자동으로 커진다.
   */
  wrapHeaderText?: boolean;
  /** 헤더 높이를 헤더 내용(줄바꿈 포함)에 맞춰 자동 계산. wrapHeaderText 와 함께 사용. */
  autoHeaderHeight?: boolean;
  /**
   * 머리글·셀 툴팁이 뜨기까지의 지연(ms, ag-grid tooltipShowDelay). 비우면 `GRID_TOOLTIP_SHOW_DELAY_MS`(500).
   * HTML 설명 머리글 카드(MdmHeaderLabel)는 머리글을 그릴 때의 이 값을 쓴다(실행 중에 바꾸면 이미 그린 카드는 예전 값). ag-grid 는 200 아래로 내리지 않는다.
   */
  tooltipShowDelay?: number;
  /**
   * 행 드래그 손잡이를 둘 열의 key — `GridColumn.rowDrag` 대신 그리드에서 지정한다. 지정하면 정렬(sortable)을 끈다
   * (ag-grid managed row drag 는 정렬 중 동작하지 않는다). `onRowOrderChange` 와 함께 쓴다.
   */
  rowDragField?: string;
  /** 행마다 드래그 가능 여부(rowDragField 와 함께). */
  isRowDraggable?: (row: Record<string, unknown>) => boolean;
  /**
   * 행을 끌어 순서를 바꾸면 끝난 뒤 새 순서의 행 키(rowKey 값, 임시 ID 칸이 있으면 그 값) 목록으로 호출한다(TSK-05-02 D6).
   * 이 prop 이 있을 때만 ag-grid managed row drag(rowDragManaged·onRowDragEnd)를 켜고 정렬을 끈다
   * (managed drag 는 정렬 중 동작하지 않는다). 손잡이는 `GridColumn.rowDrag` 또는 `rowDragField` 로 둔다. 없으면 기존 동작 그대로다.
   * 순서 상태의 주인은 호출자다 — 콜백에서 data 를 새 순서로 바꿔 넘긴다.
   */
  onRowOrderChange?: (orderedKeys: (string | number)[]) => void;
  /**
   * MDM 화면 값 검증(spec C2) — 켜면 편집 가능하고 MDM 컬럼 사전에 연결된 칸(포털 탭 공급자 안에서만)의 값이 바뀔 때 그 칸을 검사해
   * 오류 칸에 `cell-mdm-invalid` 클래스와 셀 툴팁(문구)을 단다. 기본 꺼짐. 저장 전 전체 검사는 화면이 `useMdmValidation().validateRows` 로 한다.
   */
  mdmValidate?: boolean;
  /**
   * 서버 오류 칸 표시(spec C9) — `toFieldErrors(error, grid)` 결과를 넘긴다. 공급자 밖에서도 동작한다.
   * 행은 `rowKey`(그리드 `rowKey` 칸·행의 `rowKey` 값·임시 ID)로 먼저 찾고, 없으면 `rowIndex` 를 `data` 의 자리로 본다 — 바뀐 행만 보낸 화면은
   * 서버 rowIndex 를 data 자리로 바꿔 넘긴다. `field` 는 열 key 와 같거나 물리명(`codeNm` ↔ `CODE_NM`)이 같은 잎 열에 붙는다.
   * 같은 칸에 화면 검사 오류가 있어도 서버 문구를 보인다. 사용자가 그 칸을 다시 고치면 서버 표시는 내리고 화면 검사로 돌아간다
   * (새 fieldErrors 를 받으면 다시 처음부터).
   */
  fieldErrors?: Array<{ rowKey?: string; rowIndex?: number; field: string; message: string }>;
  /**
   * 표 아래에 「N행」과 [엑셀] 단추 줄(GridExcelFoot)을 붙이고, 누르면 그리드의 컬럼·행을 엑셀로 내려받는다. 주지 않으면 줄도 단추도 없다.
   * 주면 바깥을 세로 flex 상자로 감싸 표가 남은 높이를 채우고 아래 줄이 바닥에 붙는다(`height` 는 이 바깥 상자의 높이).
   * 컬럼은 모든 데이터 열을 사용자 순서(왼쪽 고정 → 가운데 → 오른쪽 고정)·제목으로 내보내고, 사용자가 숨긴 열은 엑셀에도 숨긴 열로 넣는다.
   * 화면 정의에서 `hide: true` 인 내부 열·행 번호·체크박스는 뺀다(`excludeKeys` 로 render 전용 열도 뺄 수 있다). 행은 정렬·필터 순서, 값은 `render` 가 아니라 행의 원래 값이다.
   * 객체를 렌더마다 새로 만들면 memo 가 깨지니 상수나 `useMemo` 로 둔다.
   *
   * GridPanel 안의 그리드는 이 속성을 주지 않아도 「그리드 설정」 메뉴에 [엑셀 출력] 이 기본으로 나온다(아래 줄·「N행」 없이 메뉴 항목만).
   * 파일 이름은 GridPanel `title` → 「목록」, 내용 규칙은 위와 같다. 메뉴 항목까지 끄려면 `excelExport={false}`.
   * GridPanel 밖의 그리드도 같다: 이 속성을 주지 않아도 그리드 머리글 줄 오른쪽 끝의 「그리드 설정」 아이콘 메뉴에 [엑셀 출력] 이 기본으로 나온다.
   * 객체를 주면 아래 줄은 「N행」 안내만 남고 [엑셀] 단추는 메뉴로 옮겨 간다(`settingsMenu={false}` 로 메뉴를 끄면 단추가 그대로 남는다).
   */
  excelExport?: AgDataGridExcelExport | false;
  /**
   * 「그리드 설정」 메뉴(컬럼 설정…·자동 설정 저장·설정 초기화…·엑셀 출력)를 이 그리드에 두는가. 기본 켬 — GridPanel 안이면 GridPanel 머리줄 맨 오른쪽,
   * GridPanel 밖이면 그리드 머리글 줄 오른쪽 끝에 작은 아이콘으로 나온다(대화 상자 안의 그리드는 엑셀 출력 항목만 둔다). 항목이 하나도 없으면(개인화·엑셀 모두 끔) 아이콘도 없다.
   * `false` 면 이 그리드의 메뉴를 통째로 끈다(읽기 전용 작은 표 등). 아래 줄 [엑셀] 단추는 `excelExport` 객체를 준 경우 그대로 남는다.
   */
  settingsMenu?: boolean;
  /**
   * 한 화면(탭)에 그리드가 여럿일 때 개인화 저장을 나누는 이름. 비우면 `"main"`. 화면 안에서 그리드마다 다르게, 렌더마다 바뀌지 않는 고정 문자열로 준다.
   * 저장 키는 `dmes:grid:v1:{사용자ID}:{화면}:{gridId}` 다. 같은 키의 그리드가 이미 떠 있으면 나중 그리드는 개인화를 끈다.
   */
  gridId?: string;
  /**
   * 사용자별 컬럼 개인화(순서·너비·표시 여부·좌우 고정·정렬을 브라우저에 저장하고 다시 열 때 복원). 기본 켬.
   * `false` 면 끈다. `{ sort: false }` 면 정렬은 저장·복원하지 않는다(서버 페이징 그리드 — 정렬이 서버 조회 조건이라서).
   * 너비는 사용자가 머리글 경계를 끌어 바꾼 컬럼만 저장되고, 그 컬럼만 자동 너비 맞춤에서 빠진다(나머지는 예전처럼 자동).
   */
  personalize?: GridPersonalize;
}

/** 칸 검증 표시 한 건 — `AgDataGridProps.fieldErrors` 의 항목. */
export type AgDataGridFieldError = NonNullable<AgDataGridProps["fieldErrors"]>[number];
