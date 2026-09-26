# mdm/TSK-08-05 룰 버전 확정 — 확정 검사·적용시점·diff
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [06 「저장 시 검사」](design/basic/06-business-rule.md) · [06 「테이블 설계」](design/basic/06-business-rule.md) · PRD §2 규칙 7 · PRD FR-E4 · 시안: [06 「상신」](design/basic/html/06-business-rule.html)
> entry-point: /portal → mdr/ruleConfirm (메뉴: MDM > 업무기준 > 버전 확정)
> depends: mdm/TSK-08-01, mdm/TSK-01-03, mdm/TSK-03-03, mdm/TSK-08-04

## 요구사항
- 확정 검사: 저장 시 검사 전부 + 변수·행 1개 이상 + 기대값 있는 테스트 케이스 전부 통과
- 앞 룰 RELEASED 확인, apply_from 이 직전 RELEASED apply_from 보다 뒤, 계약 변경 확인란
- 직전 RELEASED 대비 row_id diff(ADDED/REMOVED/CHANGED/SAME)
- 확정 = DRAFT → RELEASED, 직전 버전 apply_to 닫기(공통 버전 상태 서비스 사용), CREATED→INUSE 자동 전이

## 제약
- 상신 화면 시안은 배치 참고용이다. 결재 영역은 만들지 않는다

## API 스펙
OASIS 서비스 `ruleConfirm` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 검사 하나라도 실패하면 확정 거부
- [ ] 담당자가 아닌 사용자는 확정할 수 없다
- [ ] 룰 참조 검사(배포 대상 시스템 기준)는 하지 않는다
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-ruleConfirm.spec.ts` 가 통과한다
