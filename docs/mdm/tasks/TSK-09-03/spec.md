# mdm/TSK-09-03 모듈 관통·권한 교차·성능
> stage: as · category: itest · domain: test · priority: high · model: sonnet
> prd-ref: [01 「MDM 전체 아키텍처」](design/basic/01-mdm-overview.md) · PRD AC-1~AC-4, AC-6 · PRD NFR-1, NFR-5
> entry-point: -
> depends: mdm/TSK-04-03, mdm/TSK-06-05, mdm/TSK-07-04, mdm/TSK-08-05, mdm/TSK-01-03, mdm/TSK-08-04, mdm/TSK-07-03

## 요구사항
- CODE 도메인이 마루 코드를 참조 → 코드 확정 → 데이터 등록 → 룰이 MASTER 로 코드·데이터를 참조해 확정 → 원장 기준 판정 일치
- 역할 2종 × 화면·액션 권한 매트릭스, DRAFT 소유권 교차(비소유자 저장 거부)
- NFR-1 성능(AST 1만 행, 룰 판정)

## 수용 기준
- [ ] 시나리오 통과
- [ ] 발견 결함은 해당 기능 WP 에 defect Task 로 등록됨
- [ ] 권한 매트릭스 전 항목 통과
- [ ] 성능 기준 충족
