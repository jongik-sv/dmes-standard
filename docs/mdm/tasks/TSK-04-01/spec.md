# mdm/TSK-04-01 용어·도메인·컬럼 공유 계약 (계약 전용)
> stage: as · category: infra · domain: database · priority: critical · model: sonnet
> prd-ref: [02 「테이블 설계 샘플」](design/basic/02-term-domain-column.md) · PRD FR-A
> entry-point: -
> depends: mdm/TSK-02-03, mdm/TSK-01-02

## 요구사항
- 02 테이블 7개 Flyway(두 방언), JPA 엔티티·리포지토리
- 유효 식·유효 코드 참조 해석 함수 인터페이스(저장·조회 공유), 영향도 조회 인터페이스
- 컬럼 사전 조회 인터페이스(03 레이아웃·06 룰 변수가 사용)

## 데이터 모델
TB_MDM_UNIT, TB_MDM_TERM, TB_MDM_DOMAIN, TB_MDM_COLUMN, TB_MDM_COLUMN_SYSTEM, TB_MDM_DICT_SEQ, TB_MDM_DICT_SYSTEM

## 수용 기준
- [ ] 실행 로직 없음 (contract-only)
- [ ] 03·06 계약이 이 인터페이스만 참조한다
