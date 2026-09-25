# mdm/TSK-08-06 룰 세트 조회·등록·편집
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [06 「테이블 설계」](design/basic/06-business-rule.md) · [06 「룰 구성 요소」](design/basic/06-business-rule.md) · PRD FR-E5 · 시안: [06 「룰 세트 조회·등록」](design/basic/html/06-business-rule.html) · 시안: [06 「룰 세트 편집(LS_A3)」](design/basic/html/06-business-rule.html)
> entry-point: /portal → mdr/ruleSetMng (메뉴: MDM > 업무기준 > 룰 세트); /portal → mdr/ruleSetEdit (메뉴: MDM > 업무기준 > 룰 세트 편집)
> depends: mdm/TSK-08-01, mdm/TSK-01-03, mdm/TSK-03-03

## 요구사항
- 조회(세트·담은 룰·결과 변수·상태, 룰 수 등 조회 시 계산)
- 빈 세트 등록(INUSE)
- 룰 목록 순서 편집(드래그·▲▼, 뒤에 있음 표시), 세트 입출력 표
- 결과 변수 역추적 → 위상 정렬 제안 → 목록 적용, 순환 검출
- 저장 시 검사 4개, 폐기·되살리기(저장 즉시 배포는 보류)

## 제약
- 세트 값 테스트 카드는 06 본문에만 있고 시안에 없다 — 화면 설계 산출물에서 포함 여부 확정

## API 스펙
OASIS 서비스 `ruleSetMng` — `/api/mdm/oasis/{serviceId}/{action}`
OASIS 서비스 `ruleSetEdit` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 등록 후 편집 화면으로 이동
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-ruleSetMng.spec.ts` 가 통과한다
- [ ] 순환이 있으면 저장 거부
- [ ] 같은 결과 변수 중복 대입 경고
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-ruleSetEdit.spec.ts` 가 통과한다
