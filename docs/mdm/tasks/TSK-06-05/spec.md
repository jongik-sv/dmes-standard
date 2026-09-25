# mdm/TSK-06-05 마루 코드 버전 확정 — 검사 8항·적용시점·diff
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [04 「상신 시 검사」](design/basic/04-master-code-deploy-full.md) · [04 「버전 상태와 적용시점」](design/basic/04-master-code-deploy-full.md) · PRD §2 규칙 7 · PRD FR-C5 · 시안: [04 「탭7 상신」](design/basic/html/04-master-code.html)
> entry-point: /portal → mdc/codeConfirm (메뉴: MDM > 마스터코드 > 버전 확정)
> depends: mdm/TSK-06-01, mdm/TSK-01-03

## 요구사항
- 확정 폼(희망 apply_from), 검사 8항 결과 표(통과·경고·거부). 3항은 "직전 RELEASED apply_from 보다 뒤" 로 검사(PRD §2 규칙 7)
- 직전 RELEASED 대비 diff(테이블·키, 바뀐 카테고리 요약)
- 확정 = DRAFT → RELEASED, 직전 버전 apply_to 닫기를 한 트랜잭션으로(공통 버전 상태 서비스 사용)
- CREATED→INUSE 자동 전이(첫 RELEASED 의 apply_from 경과)

## 제약
- 상신 화면 시안(탭7)은 배치 참고용이다. 긴급·사유·결재 영역은 만들지 않는다

## API 스펙
OASIS 서비스 `codeConfirm` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 거부 1건이라도 있으면 확정 불가
- [ ] 최초 버전은 3항 면제
- [ ] 담당자가 아닌 사용자는 확정할 수 없다
- [ ] 04 「샘플 데이터」 버전 이력(v1.000 → v1.001)을 확정 경로로 재현
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-codeConfirm.spec.ts` 가 통과한다
