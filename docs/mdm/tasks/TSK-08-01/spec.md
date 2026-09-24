# mdm/TSK-08-01 업무기준 공유 계약 (계약 전용)
> stage: as · category: infra · domain: database · priority: critical · model: opus
> prd-ref: [06 「테이블 설계」](design/basic/06-business-rule.md) · PRD FR-E
> entry-point: -
> depends: mdm/TSK-02-03, mdm/TSK-01-02, mdm/TSK-03-01, mdm/TSK-04-01

## 요구사항
- 06 테이블 8개 Flyway 두 방언(JSON 칼럼), 엔티티
- 식별자 발급(last_var_id 등) 인터페이스, 엔진 DefinitionLookup 구현 대상 선언
- 확정 검사 SPI(row_id diff·확정 검사) 구현 대상 선언

## 데이터 모델
TB_MDM_RULE, TB_MDM_RULE_SYSTEM, TB_MDM_RULE_VER, TB_MDM_RULE_VAR, TB_MDM_RULE_ROW, TB_MDM_RULE_TEST_CASE, TB_MDM_RULE_SET, TB_MDM_RULE_RECV

## 수용 기준
- [ ] 실행 로직 없음 (contract-only)
