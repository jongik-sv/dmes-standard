/**
 * 마스터코드 선택 팝업 — 타입 정의.
 *
 * 설계서 정본 — `docs/mcm/design/masterCodeSelPop/`:
 *   - 분석리포트 §3.3 Grid columns 5컬럼 / §3.4 ds_grdMain ColumnInfo
 *   - 기능설계서 §3.2 결과 그리드 / §4 반환 데이터 구조
 *   - 디자인설계서 §4 결과 그리드
 */

/**
 * 모달 입력 파라미터 — 호출 화면이 모달 oArg 로 전달.
 *
 * As-Is mui (분석리포트 §1 호출 컨텍스트):
 *   `gfn_openPopup("modal", "{title}", "cma::MasterCodeSelPop.xfdl", oArg, "", "{callback}")`
 *
 * To-Be: 호출 화면이 `<MasterCodeSelPopDialog>` 컴포넌트에 props 로 전달.
 */
export interface MasterCodeSelPopProps {
  /** 모달 열림 상태 (호출 측 useState). */
  open: boolean;

  /** 모달 닫기 핸들러 (호출 측 setState false). */
  onClose: () => void;

  /**
   * 행 선택 + 확인 시 호출되는 콜백.
   * 호출 화면은 반환된 `{ sCodeVal, sCodeValMean }` 를 자신의 화면에 반영한다.
   *
   * As-Is (분석리포트 §4 반환 데이터 — Script:185-200):
   *   ```
   *   obj.sCodeVal     = ds_grdMain.getColumn(row, "CODE_VAL");
   *   obj.sCodeValMean = ds_grdMain.getColumn(row, "CODE_VAL_MEAN");
   *   gfn_popupClose(obj);
   *   ```
   */
  onSelect: (selected: MasterCodeSelPopResult) => void;

  /**
   * 코드 그룹 ID (As-Is sCodeId — 필수). 예: "SPEC_CD".
   * Mapper `pCodeId` 파라미터로 전송된다 (As-Is Mapper:15-17).
   */
  sCodeId: string;

  /**
   * 코드명 (As-Is sCodeNm — 선택). 모달 헤더 위 표시용 (Mapper 전송 ✗).
   * As-Is xfdl Script:125-127 — edt_codeNm 에 set_value.
   */
  sCodeNm?: string;

  /**
   * 검색 초기값 (As-Is sCodeVal — 선택).
   * As-Is xfdl Script:129-131 — edt_codeVal 에 set_value 후 OnLoad 자동 조회.
   */
  sCodeVal?: string;

  /**
   * 모달 타이틀 (As-Is `gfn_openPopup` 의 title 인자 — 선택, 기본 "마스터코드 선택").
   * P-001~P-006 호출 화면별로 "규격약호 선택" / "마스터코드 조회" 등 다양.
   */
  title?: string;
}

/**
 * 행 선택 시 호출 측에 반환되는 객체.
 *
 * As-Is mui (분석리포트 §4.1):
 *   `{ sCodeVal, sCodeValMean }`
 */
export interface MasterCodeSelPopResult {
  /** CODE_VAL — As-Is `ds_grdMain.getColumn(row, "CODE_VAL")`. */
  sCodeVal: string;

  /** CODE_VAL_MEAN — As-Is `ds_grdMain.getColumn(row, "CODE_VAL_MEAN")`. */
  sCodeValMean: string;
}

/**
 * 검색 결과 그리드 1 행 — As-Is `ds_grdMain` ColumnInfo (분석리포트 §3.4).
 *
 * Mapper SELECT 4 컬럼 (분석리포트 §6 — VI_MCM_CODE_ACCESS):
 *   `CODE_VAL`, `CODE_VAL_MEAN`, `CATEGORY_ID`, `CATEGORY_NM`
 *
 * + UI 자동 산출 NO 컬럼 (`expr:currow+1`) — 본 type 에는 미포함, AgDataGrid 가 row index 로 표시.
 */
export interface MasterCodeRow {
  CODE_VAL: string;
  CODE_VAL_MEAN: string;
  CATEGORY_ID: string;
  CATEGORY_NM: string;
}

/**
 * 검색구분 enum (As-Is cbo_div innerdataset — 분석리포트 §3.2 LV-001 / §10.1).
 */
export type SearchDiv = "CODE_VAL" | "CODE_VAL_MEAN";

/**
 * 백엔드 OASIS 검색 요청 body — As-Is Mapper.xml 의 입력 파라미터 3종 1:1 보존.
 *
 * BPMN `searchTask` 의 `dto = MasterCodeSelPopSearchRequest` 에 매핑.
 */
export interface SearchRequest {
  pCodeId: string;
  pDiv: SearchDiv;
  pValue: string;
}
