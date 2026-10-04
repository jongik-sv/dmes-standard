/**
 * domainMng 오류 상세의 서버 field → 화면 항목명. 오류 문구 `기본 문구 + "\n- 항목명: 메시지"` 에 쓴다.
 *
 * 서버가 주는 field: 도메인 저장 거부(`DomainRejections`)의 `DomainIssue.field()`. 항목명은 기본 속성 폼·검증식·테스트 케이스
 * 칸의 라벨과 같다. `DOMAIN_ID` 처럼 화면에 칸이 없는 field 는 넣지 않는다(메시지만 보인다).
 */
export const DOMAIN_MNG_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  DOMAIN_NAME: "도메인명",
  STD_NAME: "표준명",
  PARENT_DOMAIN_ID: "부모 도메인",
  DOMAIN_KIND: "종류",
  DATA_TYPE: "데이터 타입",
  LENGTH: "길이",
  SCALE: "소수 자리",
  UNIT_CODE: "단위",
  MARU_CODE_ID: "마루 코드",
  CATE_ID: "카테고리",
  STD_RULE: "표준 검증식",
  BIZ_RULE: "비즈니스 검증식",
  TEST_CASES: "테스트 케이스",
});
