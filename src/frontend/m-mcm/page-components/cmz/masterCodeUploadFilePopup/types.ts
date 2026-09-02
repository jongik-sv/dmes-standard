/*
 * 작성자: Agent
 * 작성일: 2026-05-28
 * 내용: masterCodeUploadFilePopup 타입 정의 — As-Is ds_grdUpload / ds_grdDownload 6 컬럼 1:1 + 모달 props.
 *       (분석 §3.3 / §3.5 / 디자인 §4.1 인용)
 */

/** Excel preview 행 = As-Is ds_grdUpload (분석 §3.5) — 6 컬럼 모두 STRING(256). */
export interface MasterCodeUploadRow {
  /** As-Is MASTER_CODE / G-001 / Excel col A */
  MASTER_CODE: string;
  /** As-Is CATEGORY_ID / G-002 / Excel col B */
  CATEGORY_ID: string;
  /** As-Is CODE_VAL / G-003 / Excel col C */
  CODE_VAL: string;
  /** As-Is CODE_VAL_MEAN / G-004 / Excel col D */
  CODE_VAL_MEAN: string;
  /** As-Is CODE_VAL_DESC / G-005 / Excel col E */
  CODE_VAL_DESC: string;
  /** As-Is SORT_SEQ / G-006 / Excel col F (STRING — As-Is dataset 타입 보존) */
  SORT_SEQ: string;
}

/** search 응답 — As-Is ds_GetCodeUploadList 7 컬럼 (CODE_VER 포함 — Excel export 시 제외) */
export interface MasterCodeUploadResponseRow {
  masterCode: string;
  categoryId: string;
  codeVal: string;
  codeValMean: string;
  codeValDesc: string;
  codeVer: string;
  sortSeq: string;
}

/** Modal Dialog props — 호출원 (masterCodeMng) 이 전달 (분석 §5 P-001) */
export interface MasterCodeUploadFilePopupDialogProps {
  /** 모달 표시 여부 */
  open: boolean;
  /** As-Is xfdl:159 sMasterCode (호출자 row.MASTER_CODE) — read-only 표시 */
  sMasterCode: string;
  /** As-Is xfdl:160 sCodeNm (호출자 row.CODE_NM) — read-only 표시 */
  sCodeNm: string;
  /**
   * 모달 닫기 콜백. saved=true 이면 호출원 그리드 재조회 트리거 권고.
   * As-Is xfdl 콜백 fn_returnMasterCodeUploadFilePopupCallBack 은 return value 미사용 (rtVal null).
   */
  onClose: (saved: boolean) => void;
}
