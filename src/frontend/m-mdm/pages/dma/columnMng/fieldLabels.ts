/**
 * columnMng(+ 같은 호출을 쓰는 termRegPop) 오류 상세의 서버 field → 화면 항목명. 오류 문구 `기본 문구 + "\n- 항목명: 메시지"` 에 쓴다.
 *
 * 서버가 주는 field: 시스템 필드 중복 매핑(`SYSTEM_FIELD_ALREADY_MAPPED`)의 `physName`. 항목명은 시스템 매핑 그리드 머리글과 같다.
 * 키는 대문자 snake — `labelsFrom` 이 camelCase field 도 찾는다.
 */
export const COLUMN_MNG_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  PHYS_NAME: "실제 필드명",
});
