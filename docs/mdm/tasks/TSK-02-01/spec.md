# mdm/TSK-02-01 전사 아키텍처·버전 확정 규칙 설계
> stage: as · category: design · domain: infra · priority: critical · model: opus
> prd-ref: [01 「MDM 전체 아키텍처」](design/basic/01-mdm-overview.md) · [02 「ERD」](design/basic/02-term-domain-column.md) · [04 「상신 시 검사」](design/basic/04-master-code-deploy-full.md) · [06 「DRAFT와 시험 사본」](design/basic/06-business-rule.md) · PRD §2 규칙 2·7 · PRD TRD §1·§4·§5·§8 · PRD FR-F1
> entry-point: -
> depends: mdm/TSK-01-01

## 요구사항
- 테이블 명명 `TB_MDM_*` 확정(사용자 결정 2026-09-23) 반영: 식별자 사전 정규식에 mdm 추가, 감사 칼럼 자동 주입(`McmAuditStatementInspector`) 적용 범위 결정, ADR
- 방언 매핑 확정(RETURNING/OUTPUT, JSON 칼럼, 스냅샷 격리, 재귀 CTE)
- 화면 그룹 코드·screenId 목록, 화면 설계 산출물 위치(`docs/mdm/design` 은 외부 링크 → `docs/mdm/screens/` 안)
- 기존 mcm `cma`/`cmb` 와의 병존 원칙, 공통 관리 속성 정의
- 04·06 공통 버전 상태·DRAFT 정책과 담당자 확정 규칙 확정(PRD §2 규칙 7. 07·08 은 적용하지 않는다)
- 확정 때 쓰는 결재 칸(approved_by·approved_at 등)을 확정자·확정 일시로 채울지 비울지 결정
- 권한 역할(표준 관리자·담당자) 배치
- 배포 대상·배포 순번·수신 로그 테이블을 DDL 만 두고 코드는 쓰지 않는 원칙을 ADR 에 기록

## 수용 기준
- [ ] ADR 발행(adr-write) 및 TRD §9 가정 T1·T2 확정
- [ ] 모든 후속 DB 설계 Task 가 참조할 명명·방언 규칙표 존재
- [ ] 권한 역할 배치에 결론 또는 협의 이슈(issue-brief) 발행
- [ ] decisions.md 에 결정 기록
