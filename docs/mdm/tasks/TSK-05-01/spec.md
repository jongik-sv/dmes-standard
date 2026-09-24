# mdm/TSK-05-01 인터페이스 레이아웃 공유 계약 (계약 전용)
> stage: as · category: infra · domain: database · priority: critical · model: sonnet
> prd-ref: [03 「구조: 전문 = EAI 헤더 + 업무 본문」](design/basic/03-interface-layout.md) · [03 「항목 채움 방식(fill_kind)과 기본값」](design/basic/03-interface-layout.md) · PRD FR-B
> entry-point: -
> depends: mdm/TSK-02-03, mdm/TSK-01-02, mdm/TSK-04-01

## 요구사항
- 03 테이블(적층 모델 확정분 포함) Flyway 두 방언, 엔티티
- 레이아웃 스냅샷 JSON 스키마, 직렬화기·파서 인터페이스

## 데이터 모델
TB_MDM_EAI, TB_MDM_LAYOUT, TB_MDM_LAYOUT_ITEM (+ 적층·재정의 테이블)

## 수용 기준
- [ ] 실행 로직 없음 (contract-only)
