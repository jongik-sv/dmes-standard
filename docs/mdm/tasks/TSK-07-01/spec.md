# mdm/TSK-07-01 마스터데이터 공유 계약 (계약 전용)
> stage: as · category: infra · domain: database · priority: critical · model: sonnet
> prd-ref: [05 「테이블 설계」](design/basic/05-master-data.md) · PRD FR-D
> entry-point: -
> depends: mdm/TSK-02-03, mdm/TSK-01-02

## 요구사항
- 05 테이블 7개 Flyway 두 방언, 엔티티
- 일시 선분 저장 코어 인터페이스, 카테고리·ID 이름 공간은 전사 계약 재사용

## 데이터 모델
TB_MDM_DATA, TB_MDM_DATA_SYSTEM, TB_MDM_DATA_ITEM, TB_MDM_DATA_CATE, TB_MDM_DATA_CATE_ITEM, TB_MDM_DATA_RECV, TB_MDM_DATA_RECV_ITEM

## 수용 기준
- [ ] 실행 로직 없음 (contract-only)
