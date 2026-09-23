# mdm/TSK-03-01 엔진 공유 계약 (계약 전용)
> stage: as · category: infra · domain: backend · priority: critical · model: opus
> prd-ref: [06 「엔진 모듈: 별도 jar로 분리」](design/basic/06-business-rule.md) · [evalex-guide 「8.3 AST JSON 형식」](design/basic/evalex-guide.md) · PRD FR-E7
> entry-point: -
> depends: mdm/TSK-02-02, mdm/TSK-01-01

## 요구사항
- engine.spi 인터페이스, EvalEx 설정 팩토리 시그니처, AST JSON 스키마 타입
- MASTER/MASTER_AT/CODE_LIST 함수 시그니처, 판정 결과 타입(적중 row_id·seq, 첫 거짓 셀, 경고)
- JS 평가기와 공유할 AST·셀 구조 TypeScript 타입

## 수용 기준
- [ ] 실행 로직 없음 (contract-only)
- [ ] Java·TS 타입이 같은 JSON 스키마에서 나온다
