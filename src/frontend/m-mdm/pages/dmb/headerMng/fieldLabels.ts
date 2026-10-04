/**
 * headerMng 오류 상세의 서버 field → 화면 항목명. 오류 문구 `기본 문구 + "\n- 항목명: 메시지"` 에 쓴다.
 *
 * 서버가 주는 field: 헤더 저장 거부(`LayoutRejections`)의 `LayoutIssue.field()`. 항목명은 헤더 폼 라벨·항목 그리드 머리글과 같다.
 */
export const HEADER_MNG_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  LAYOUT_ID: "헤더 ID",
  LAYOUT_NAME: "헤더 이름",
  VER: "버전",
  EAI_CODE: "EAI 코드",
  ENCODING: "인코딩",
  FILL_KIND: "채움",
  LENGTH: "길이",
});
