# ora-mcm-core 정본 메모

- 레인: ora-mcm-core / 브랜치 `feat/ora-mcm-core` / 워크트리 `/Users/jji/project/dmes-wt/ora-mcm-core`
- 조정 세션: dmes-standard-d8 (지시 ora-mcm-core-1)
- 갱신: 2026-10-07

## 지금 상태

- **c1 Oracle 기준선 V1 — 진행 중(검증 단계)**
  - V1 4벌을 만들었다: `src/backend/mcm-core/src/main/resources/db/migration/oracle/{mcmapuser,mcm_source,mcm_backup,mcaapuser}/V1__baseline.sql`
  - 엔티티 쪽 수정: `AuditLog`·`KeyStore` 의 `columnDefinition="TEXT"` → `LONG32VARCHAR`(c3b4fc02d)
  - archive: `db/migration/sqlite`(V1~V18)·`db/migration/mcm-core`(샘플 V1)·`db/seed/oasis` → `src/backend/mcm-core/archive/`
  - 남은 것: L_MCC_ 사용자에 Flyway 적용 → PU별 validate → opus/high 리뷰 → 진행 보고
- c2·c3·c4: 대기(c2·c4 는 ora-base 머지① 뒤)

## 남은 순서

1. c1 검증·리뷰·진행 보고(ora-mcm-app 이 기다린다)
2. c3 위젯 조회 SQL(SqlGuard·WidgetReadOnlyJdbc Oracle 읽기 전용) — 의존 없음
3. c2 방언 전환(ora-base 머지① 뒤)
4. c4 시험 789개 H2 → Oracle(ora-base b4 하니스 뒤)
5. 머지 요청(ora-mcm-app 과 같은 창, mcm-core → mcm 순서)

## 결정

| 날짜 | 결정 | 근거 |
|---|---|---|
| 10-07 | V1 DDL 은 스키마 접두 없이 쓰고, 스키마 폴더마다 Flyway 하나(defaultSchema=그 스키마). 런타임 SQL 접두는 유지 | 조정 승인 |
| 10-07 | mcm-core 가 주인인 스키마: MCMAPUSER·MCM_SOURCE·MCAAPUSER·MCM_BACKUP(MCM_BACKUP 은 조정 승인 — 적재기는 비워 둔다). CARAVANUSER·EAIUSER·IFUSER 는 ora-platform(caravan-hub) | 조정 답1 |
| 10-07 | MCM_SOURCE 는 별도 사용자. MCMAPUSER 에 사본 3표 + `VI_MCM_CODE_ACCESS`(사본 조인) | 조정 답2 |
| 10-07 | 모든 일시 칸 `timestamp(6)`, 앱 설정 `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP`·`hibernate.jdbc.time_zone=UTC` | 조정 레인 공통 결정 |
| 10-07 | 다른 스키마 표의 권한 대상은 Flyway 자리표시자 `${app_user}`(로컬·운영 = MCMAPUSER) — ora-mcm-app 이 Flyway 설정에 넣어야 한다 | 레인 판단 |

## 기준선 근거

- 내보내기: `JpaConfig` 와 같은 packagesToScan·Hibernate 기본 이름 전략으로 EMF 를 띄우고 OracleDialect(23) 스크립트 생성(연결 없음).
- 대조: 로컬 `mcm.db` `.backup` 사본과 표·열·NOT NULL 차이 0. SQLite 에만 있던 것: `HTE_TB_MCM_MOM_TC_SEND`(Hibernate 임시 표, 뺌), `SEQ_MCM_MOM_TC_SEND`(시퀀스 흉내 표 → SEQUENCE, increment 1 = allocationSize 1), `TB_MCM_SEC_MENU_FLD`(엔티티 없음, Java DDL 마지막 상태로 넣음).
- 부분 인덱스: mcm.db·`ScreenUsageMssqlDdl` 모두 없음. `UK_SEC_SCREEN_USAGE_LOG_SEG(USER_ID, CLIENT_SEG_ID)` 는 두 열 모두 NOT NULL 이라 Oracle 복합 unique 의미 차이 없음.
- `''` 정책 근거: mcm.db 에서 `''` 값이 있는 칸은 모두 NULL 허용 칸이다(NOT NULL 칸의 `''` 행 0). 코드 쪽 `= ''` 비교는 c2.

## 원장 → 사본 동기화 (운영 단서)

- `csa/commSyncMng/service/CommSyncMngService`(동기화 관리 화면, BPMN `csa/commSyncMng.bpmn` `reg`)가 MASTER 처리유형에서
  `MCM_SOURCE` → 대상 스키마(`MCMAPUSER`·`MCM_BACKUP`)로 `DELETE` 후 `INSERT INTO 대상 SELECT * FROM MCM_SOURCE.표 WHERE MASTER_CODE=?` 를 한다.
  대상이 `MCM_BACKUP` 이면 `TB_MCM_CODE_DETAIL` 은 건너뛴다. 원장 `CODE_VER` 도 올린다.
- 트리거·배치는 코드에 없다. 사람이 화면에서 돌리는 동기화가 유일한 경로다.
- `SELECT *` 복사이므로 사본·백업 표의 열 순서가 원장과 같아야 한다 → V1 에서 원장 정의를 그대로 옮겼다.
- 로컬 적재기(ora-base b5)는 MCM_SOURCE 와 MCMAPUSER 사본 양쪽에 같은 행을 넣어야 코드 선택 팝업이 지금처럼 보인다(SQLite 에서는 한 표였다).

## 다음 단계

- Flyway 적용 결과 확인 → `SchemaTool validate default`(L_MCC_MCMAPUSER 로 접속, 스키마 이름에 L_MCC_ 접두) → opus 리뷰 → 진행 보고.
- 검증 사용자 `L_MCC_MCMAPUSER`·`L_MCC_MCM_SOURCE`·`L_MCC_MCM_BACKUP`·`L_MCC_MCAAPUSER` 는 검증 뒤 지운다.
