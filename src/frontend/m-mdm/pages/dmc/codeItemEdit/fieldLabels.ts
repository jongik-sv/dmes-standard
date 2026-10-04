/**
 * codeItemEdit(+ cate 탭·codeConfirm) 오류 상세의 서버 field → 화면 항목명. 오류 문구 `기본 문구 + "\n- 항목명: 메시지"` 에 쓴다.
 *
 * 서버가 주는 field: 마루 코드 검사(`MasterCodeItemChecks`·`MasterCodeCateChecks`·`MasterCodeCateSaves`, 확정 검사도 같은 field)의
 * `code`·`name`·`lvl1~5`·`cateId`·`cateName`·`defKind`·`defExpr`·`defTarget`. 항목명은 코드 행 그리드·카테고리 탭 머리글과 같다.
 * `attrNN`(머리글이 코드마다 다르다)·`fromVer`(화면에 칸이 없다)는 넣지 않는다(메시지만 보인다).
 */
export const CODE_ITEM_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  CODE: "코드",
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
