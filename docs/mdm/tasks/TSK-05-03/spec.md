# mdm/TSK-05-03 직렬화기·등록 검증·버전·스냅샷 출력
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [03 「수신 처리」](design/basic/03-interface-layout.md) · [03 「단위와 표현 형식」](design/basic/03-interface-layout.md) · [03 「자동 계산과 등록 검증」](design/basic/03-interface-layout.md) · [03 「버전과 변경」](design/basic/03-interface-layout.md) · PRD FR-B5 · PRD FR-B3 · PRD FR-B4 · 시안: [03 「등록 검증과 샘플 전문」](design/basic/html/03-interface-layout.html) · 시안: [03 「버전과 영향도」](design/basic/html/03-interface-layout.html)
> entry-point: /portal → mdl/layoutMng (메뉴: MDM > 레이아웃 > 전문 레이아웃)
> depends: mdm/TSK-05-01, mdm/TSK-01-03, mdm/TSK-03-02

## 요구사항
- 인코딩 바이트 길이·패딩·암묵 소수점·AUTO(SEND_TIME·MSG_LENGTH·SEQ·LAYOUT_ID) 채움
- 단위 경계 변환(trans_unit / unit_item, TB_MDM_UNIT 계수)
- 수신 파싱 → 단위 역변환(받는 쪽 검증 없음)
- 등록 거부 조건 7종 자동 검사 표
- 예시 값 입력 → 인코딩 바이트 기준 한 줄 렌더(구역별 색)
- 버전 이력(전환 방식 순차/동시), 변경 분류 표
- 레이아웃 스냅샷 JSON·엑셀 내려받기
- 컬럼·도메인 변경 영향 전문 목록
- 저장 즉시 스냅샷 버전 생성(배포는 보류)

## API 스펙
OASIS 서비스 `layoutMng` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 3.5 mm → `0035` 등 03 예시 왕복(직렬화→파싱) 일치
- [ ] 직렬화와 파싱이 같은 스냅샷 버전으로 동작
- [ ] 거부 7종 각각 서버 테스트
- [ ] CONST 값은 도메인 유효 식으로 검증
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-layoutMng.spec.ts` 가 통과한다
- [ ] FILLER 분할 추가는 총 길이 불변·순차 전환으로 분류
