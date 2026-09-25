# mdm/TSK-08-04 룰 저장 시 검사·값 테스트
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [06 「저장 시 검사」](design/basic/06-business-rule.md) · [06 「엔진 모듈: 별도 jar로 분리」](design/basic/06-business-rule.md) · PRD FR-E3 · PRD FR-E4 · 시안: [06 「룰 화면 카드 ④⑤⑥」](design/basic/html/06-business-rule.html)
> entry-point: /portal → mdr/ruleEdit (메뉴: MDM > 업무기준 > 룰 화면)
> depends: mdm/TSK-08-01, mdm/TSK-03-03, mdm/TSK-03-04, mdm/TSK-01-03

## 요구사항
- 저장 시 검사 20여 종(타입·변수·세트 순서·계약 변경·그룹·산출 순서·op·범위·패턴·도메인 범위·코드 참조·MASTER 인자·겹침·빈틈·축 완전성·생성해 보기 등)
- Expression 파싱·AST 저장, 담긴 세트마다 순서 재검사
- 대상: 편집본(미완성 표 포함)/저장 버전, 키 보냄 체크로 NULL 구분
- 결과·적중 행·첫 거짓 셀 표시, 다른 버전 비교
- TB_MDM_RULE_TEST_CASE 저장·일괄 실행

## API 스펙
OASIS 서비스 `ruleEdit` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 06 「저장 시 검사」 항목별 거부/경고 테스트
- [ ] UNIQUE 겹침은 오류
- [ ] 원장에 쓰지 않는다
- [ ] 요청 크기 상한 초과 거부
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-ruleEdit.spec.ts` 가 통과한다
