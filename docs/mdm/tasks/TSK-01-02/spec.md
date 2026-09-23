# mdm/TSK-01-02 전사 공유 계약 — 공통·버전 상태 (계약 전용)
> stage: as · category: infra · domain: database · priority: critical · model: opus
> prd-ref: [02 「테이블 설계 샘플」](design/basic/02-term-domain-column.md) · [01 「2. 관리 대상별 원장과 흐름」](design/basic/01-mdm-overview.md) · [04 「버전 상태와 적용시점」](design/basic/04-master-code-deploy-full.md) · [06 「테이블 설계」](design/basic/06-business-rule.md) · PRD FR-A6, FR-F1 · PRD §2 규칙 7
> entry-point: -
> depends: mdm/TSK-02-01

## 요구사항
- `TB_MDM_SYSTEM` DDL(두 방언) + 초기 적재 시드(ERP/MES/APS/DKMS/L2 + MDM 자기 행)
- 공통 관리 속성(등록·수정자·일시) 칼럼 규약과 적용 방식(TB 명명 결정 반영)
- 역할 상수(표준 관리자·담당자)·권한 액션 코드, 공통 오류 코드·응답 DTO
- OASIS 서비스 ID·화면 그룹 코드(mdt/mdl/mdc/mdd/mdr/mda) 규칙
- 04·05 공유 모델: 카테고리(REGEX/TABLE, BASE 예약, def_target) 타입과 마루 코드·마루 데이터 ID 이름 공간 검사 인터페이스
- 버전 상태 5종(DRAFT/REQUESTED/APPROVED/RELEASED/CANCELLED) 상수와 전이 표 인터페이스. 이번 범위의 전이는 담당자 확정(DRAFT→RELEASED)·DRAFT 삭제뿐
- DRAFT 소유권(선점·해제·넘기기) 서비스 인터페이스, `row_version` 낙관적 잠금 규약
- 확정 시 apply_from 순서 검사 인터페이스(직전 RELEASED apply_from 보다 뒤, 최초 버전 면제)
- 대상별 확정 검사 SPI(04 마루 코드·06 룰이 구현: diff 조회·확정 검사 호출)

## 데이터 모델
TB_MDM_SYSTEM(system_code PK, system_name, self_yn)

## 수용 기준
- [ ] 실행 로직 없음 (contract-only)
- [ ] 두 방언 마이그레이션이 SQLite·MSSQL 에서 적용된다
- [ ] 공통 DTO·상수가 mdm lib 에 컴파일된다
- [ ] 04·06 이 같은 인터페이스를 구현할 수 있음을 스텁 컴파일로 확인
