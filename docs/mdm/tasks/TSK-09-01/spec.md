# mdm/TSK-09-01 영역 통합 — 평가 엔진·용어 사전·레이아웃
> stage: as · category: itest · domain: test · priority: high · model: sonnet
> prd-ref: [06 「엔진 골격 (Java, 서버)」](design/basic/06-business-rule.md) · [03 「자동 계산과 등록 검증」](design/basic/03-interface-layout.md) · PRD FR-E7 · PRD FR-A · PRD FR-B
> entry-point: -
> depends: mdm/TSK-03-02, mdm/TSK-03-03, mdm/TSK-03-04, mdm/TSK-04-02, mdm/TSK-04-03, mdm/TSK-04-04, mdm/TSK-04-05, mdm/TSK-05-02, mdm/TSK-05-03

## 요구사항
- 코퍼스 전체·샘플 룰 4종을 서버 엔진·JS 평가기에서 같은 결과로 판정
- 용어 → 도메인(상속·검증식) → 컬럼(자동 생성·매핑)이 한 흐름으로 등록·검증된다
- 헤더·레이아웃 등록 → 등록 검증 → 스냅샷 생성 → 직렬화·파싱 왕복 일치

## 수용 기준
- [ ] 시나리오 통과
- [ ] 발견 결함은 해당 기능 WP 에 defect Task 로 등록됨
