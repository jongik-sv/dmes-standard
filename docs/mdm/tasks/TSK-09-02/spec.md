# mdm/TSK-09-02 영역 통합 — 마스터코드·마스터데이터·업무기준
> stage: as · category: itest · domain: test · priority: high · model: sonnet
> prd-ref: [04 「샘플 데이터」](design/basic/04-master-code-deploy-full.md) · [05 「예」](design/basic/05-master-data.md) · [06 「저장 시 검사」](design/basic/06-business-rule.md) · PRD FR-C · PRD FR-D · PRD FR-E
> entry-point: -
> depends: mdm/TSK-06-02, mdm/TSK-06-03, mdm/TSK-06-04, mdm/TSK-06-05, mdm/TSK-07-02, mdm/TSK-07-03, mdm/TSK-07-04, mdm/TSK-08-02, mdm/TSK-08-03, mdm/TSK-08-04, mdm/TSK-08-05, mdm/TSK-08-06

## 요구사항
- PROC_CD·STEEL_STD·EQP_CD 샘플로 등록→편집→확정 흐름, 원장 기준 MASTER_AT 판정이 판정 표와 일치
- PORT·ORG·CUST 샘플로 화면·CSV 경로가 같은 선분 규칙을 지키고 원장 기준 판정 7케이스 일치
- 룰 4종·세트 LS_A3 가 편집부터 확정까지 통과, 서버 판정이 샘플 기대값과 일치

## 수용 기준
- [ ] 시나리오 통과
- [ ] 발견 결함은 해당 기능 WP 에 defect Task 로 등록됨
