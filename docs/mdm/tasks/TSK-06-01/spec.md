# mdm/TSK-06-01 마스터코드 공유 계약 (계약 전용)
> stage: as · category: infra · domain: database · priority: critical · model: opus
> prd-ref: [04 「테이블 설계」](design/basic/04-master-code-deploy-full.md) · [04 「구조: 마루 코드 → 버전 · 코드 · 카테고리」](design/basic/04-master-code-deploy-full.md) · PRD FR-C
> entry-point: -
> depends: mdm/TSK-02-03, mdm/TSK-01-02

## 요구사항
- 04 테이블 7개 Flyway 두 방언, 엔티티
- 선분 조작 서비스 인터페이스(카테고리 모델·ID 이름 공간은 전사 계약 재사용)
- 확정 검사 SPI(diff·검사 8항) 구현 대상 선언

## 데이터 모델
TB_MDM_CODE, TB_MDM_CODE_SYSTEM, TB_MDM_CODE_VER, TB_MDM_CODE_ITEM, TB_MDM_CODE_CATE, TB_MDM_CODE_CATE_ITEM, TB_MDM_CODE_RECV

## 수용 기준
- [ ] 실행 로직 없음 (contract-only)
