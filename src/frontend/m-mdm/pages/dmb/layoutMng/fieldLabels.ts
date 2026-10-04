/**
 * layoutMng 오류 상세의 서버 field → 화면 항목명. 오류 문구 `기본 문구 + "\n- 항목명: 메시지"` 에 쓴다.
 *
 * 서버가 주는 field: 전문 저장 거부(`LayoutRejections`)의 `LayoutIssue.field()`, 확정 영향(`LayoutHeaderImpact`)의 상수·헤더 칸.
 * 항목명은 기본 폼 라벨·헤더 구성·상수 재정의·본문 항목 그리드 머리글과 같다. layoutConfirm 도 이 맵을 쓴다.
 */
export const LAYOUT_MNG_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  LAYOUT_ID: "레이아웃 ID",
  LAYOUT_NAME: "전문 이름",
  VER: "버전",
  EAI_CODE: "EAI",
  SND_SYSTEM: "송신 시스템",
  RCV_SYSTEM: "수신 시스템",
  HEADER_LAYOUT_ID: "헤더",
  HEADER_SEQ: "순서",
  HEADER_COLUMN_PHYS: "항목",
  CONST_VALUE: "이 전문의 값",
  FILL_KIND: "채움",
  LENGTH: "길이",
});
