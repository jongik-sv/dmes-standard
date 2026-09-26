# TSK-09-02 defects

design.md 「1. 접근 방식」의 결함 발견 처리 절차대로 기록한다 — 게이트는 기준선 대비 신규 실패 0이므로 결함을 드러내는
실패 테스트는 커밋하지 않고, 여기 기록만 남긴 뒤 그 단언만 빼고 나머지 체인을 검증한다. 대상 WP는 06/07 시리즈 spec
어디에도 수신 API 구현 요구가 없어 불명이다 — 오케스트레이터·사람이 정한다(design.md §4 수용 기준 매핑).

## DF-1 — EQP_CD(EXTERNAL/MES 수신) 백엔드 구현 자체가 없다

- **대상 기능 WP**: 불명(추정 06 시리즈, `TB_MDM_CODE_RECV` 관련) — 06/07 spec 어디에도 수신 API 구현 요구가 없다.
- **재현 절차**: `grep EQP_CD src/backend --include 프로덕션 소스` → 0건. `TB_MDM_CODE_RECV`는 마이그레이션 DDL·샘플
  SQL에만 있고 이를 채우는 서비스가 없다.
- **기대 결과**: 04 「샘플 데이터」의 EQP_CD 수신 로그 3건(recv 1/2/3) 예제를 등록→편집→확정 흐름과 원장 판정으로
  재현할 수 있어야 한다(spec 요구사항 1).
- **실제 결과**: 수신 API 프로덕션 서비스가 없어 재현 자체가 불가능하다. `CodeItemEditSampleDataTest.SD7`은 "조회
  전용"만 확인한다.
- **범위 처리**: B1(design.md §3 B1-6)이 이 단위에서 다루지 않기로 확정했다. B1의 STEEL_STD·PROC_CD 시험은 이 결함과
  무관하게 통과한다.

## DF-2 — CUST(EXTERNAL/ERP 수신) 백엔드 구현 자체가 없다

- **대상 기능 WP**: 불명(추정 07 시리즈, `TB_MDM_DATA_RECV`/`TB_MDM_DATA_RECV_ITEM` 관련) — 06/07 spec 어디에도 수신
  API 구현 요구가 없다.
- **재현 절차**: `TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM`은 마이그레이션 DDL과 엔티티(`MdmDataRecv`/
  `MdmDataRecvItem`)만 있고 이를 채우는 서비스가 없다.
- **기대 결과**: CUST의 정규 등록 경로(수신 API)로 거래처 데이터를 적재하고 원장 기준 판정을 확인할 수 있어야 한다
  (spec 요구사항 2).
- **실제 결과**: 수신 API 프로덕션 서비스가 없어 재현 자체가 불가능하다. `source_kind=EXTERNAL`이므로 화면·CSV
  경로는 검사 2(원천 불일치)로 거부되는 것이 정상 동작이다 — 이 음성 케이스만
  `MasterDataLedgerJudgmentSqliteTest.CUST_화면_경로는_원천_불일치로_거부한다`·
  `CUST_CSV_경로도_원천_불일치로_거부한다`(B2)로 확인했다.
- **범위 처리**: B2(design.md §3 B2-6)가 화면·CSV 거부(음성 케이스)만 확인하고 수신 API·판정은 범위 밖으로 남긴다.
