/**
 * dataItemMng(+ cate 탭·dataCsvUploadPop) 오류 상세의 서버 field → 화면 항목명. 오류 문구 `기본 문구 + "\n- 항목명: 메시지"` 에 쓴다.
 *
 * 서버가 주는 field: 마루 데이터 검사(`DataItemChecks`·`DataCateEditService`·`DataCategorySegmentCore`)의 `code`·`name`·`lvl1~5`·
 * `cateId`·`defKind`·`defExpr`·`defTarget`·`key`. 항목명은 항목 그리드·카테고리 탭 머리글과 같다. `attrNN`(머리글이 데이터마다
 * 다르다)·`lvl`(계층 전체)은 넣지 않는다(메시지만 보인다).
 */
export const DATA_ITEM_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  CODE: "키",
  KEY: "키",
  NAME: "이름",
  LVL1: "1차",
  LVL2: "2차",
  LVL3: "3차",
  LVL4: "4차",
  LVL5: "5차",
  CATE_ID: "ID",
  CATE_NAME: "이름",
  DEF_KIND: "종류",
  DEF_EXPR: "정규식",
  DEF_TARGET: "대상 칸",
});
