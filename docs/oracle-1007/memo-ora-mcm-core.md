# ora-mcm-core 정본 메모

- 레인: ora-mcm-core / 브랜치 `feat/ora-mcm-core` / 워크트리 `/Users/jji/project/dmes-wt/ora-mcm-core`
- 조정 세션: dmes-standard-d8 (지시 ora-mcm-core-1)
- 갱신: 2026-10-07

## 지금 상태

- **c1 Oracle 기준선 V1 — 진행 중(검증 단계)**
  - V1 4벌을 만들었다: `src/backend/mcm-core/src/main/resources/db/migration/oracle/{mcmapuser,mcm_source,mcm_backup,mcaapuser}/V1__baseline.sql`
  - 엔티티 쪽 수정: `AuditLog`·`KeyStore` 의 `columnDefinition="TEXT"` → `LONG32VARCHAR`(c3b4fc02d)
  - archive: `db/migration/sqlite`(V1~V18)·`db/migration/mcm-core`(샘플 V1)·`db/seed/oasis` → `src/backend/mcm-core/archive/`
  - 1차 검증(리뷰 반영 전 V1): Flyway 4벌 적용 성공 · 기본 영속성 단위 validate 오류 0 · 음성 시험(칸 삭제·형식 변경)으로 validate 가 실패함을 확인. cmn·if 단위는 엔티티 0, caravan 단위는 ora-platform 기준선 뒤.
  - opus/high 리뷰 지적 13건(blocker 0·major 5·minor 8) 중 c1 몫 반영: SEQ_MCM_MOM_TC_ERROR 추가, 사본·백업 표 PK 제거(MSSQL 동작 보존), 머리 주석(Oracle 23 이상·주인 접속·시퀀스 재설정), README(주인 접속·locations·채번). 나머지는 아래 「넘길 조건·후속」.
  - **일시 정지(10-07 저녁, 조정 지시)**: 리뷰 반영본 재검증(Flyway·validate) 전에 멈췄다. 정지 직전 `L_MCC_MCMAPUSER`·`L_MCC_MCAAPUSER`·`L_MCC_MCM_SOURCE`·`L_MCC_MCM_BACKUP` 를 FREEPDB1 에 빈 상태로 만들어 두었다(재검증 스크립트의 첫 시도는 사용자 생성이 0건이라 ORA-01017 로 실패 — 단독 재실행은 성공, 원인 미확인).
  - 공지 표 TB_MCM_NOTICE·TB_MCM_NOTICE_TARGET(+인덱스 2)·TB_MCM_SEC_USER_SRCH_DFLT 는 MCMAPUSER V1 에 들어 있다.
  - 재개 순서: L_MCC_ 사용자 상태 확인(있으면 그대로 사용, 꼬였으면 drop 후 재생성) → heavy.sh 로 Flyway 4벌·validate → 사용자 삭제 → c1 진행 보고(ora-mcm-app 대기).
- c2·c3·c4: 대기(c2·c4 는 ora-base 머지① 뒤)

## 남은 순서

1. c1 검증·리뷰·진행 보고(ora-mcm-app 이 기다린다)
2. c3 위젯 조회 SQL(SqlGuard·WidgetReadOnlyJdbc Oracle 읽기 전용) — 의존 없음
3. c2 방언 전환(ora-base 머지① 뒤)
4. c4 시험 789개 H2 → Oracle(ora-base b4 하니스 뒤)
5. 머지 요청(ora-mcm-app 과 같은 창, mcm-core → mcm 순서)
   - 직전에 dev 최신을 합치고 notice-fill2 회차가 넣은 공지 엔티티(mcm/lib notice/entity)·마이그레이션 변경을 MCMAPUSER V1 에 반영한 뒤 내보내기·대조·validate 를 다시 돌린다.
   - 공지 표 TB_MCM_NOTICE·TB_MCM_NOTICE_TARGET(+인덱스 2)·TB_MCM_SEC_USER_SRCH_DFLT 는 MCMAPUSER V1 에 들어 있다(10-07 확인).

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

## c1 리뷰(opus/high) 뒤 넘길 조건·후속

ora-mcm-app 에 넘길 조건:
- 기본 영속성 단위는 `JpaConfig` 가 props 를 직접 만들어 yml 의 `spring.jpa.properties` 가 먹지 않는다. `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP`·`hibernate.jdbc.time_zone=UTC` 는 `JpaConfig` 의 `props.put` 에 넣어야 한다. 확인은 validate 가 아니라 값을 넣고 읽는 왕복으로(검사기는 형식 이름 앞부분 일치라 `timestamp(6) with time zone` 도 통과시킬 수 있음 — 리뷰어 추정).
- 스키마별 Flyway 는 그 스키마 주인으로 접속(`${app_user}`=MCMAPUSER 로 돌면 GRANT 가 ORA-01749). `locations` 는 `classpath:db/migration/oracle/<스키마>` 하나로 좁힌다. `mcm/api` 의 `db/migration/mcm/V1__init_sample_notice.sql`(SQLite 문법)은 같은 이력에 넣지 않는다.
- `mcm/api/src/main/resources/application.yml:33-34` 주석이 옛 `db/migration/sqlite` 경로를 가리킨다.

조정 결정이 필요한 것:
- `hibernate.jdbc.time_zone=UTC` 는 Instant 만이 아니라 `LocalDateTime` 칸도 UTC 로 바꿔 저장한다(Hibernate 7.2.12 `TimestampJdbcType` 이 `setTimestamp(ts, Calendar(UTC))`). START/END_ACTIVE_DATE·SecUserPwd 2칸·ScreenUsageLog 시각 3칸이 KST 보다 9시간 앞당겨 저장되고, DB 시계를 쓰는 native SQL(`McmAuditStatementInspector`·`MasterRuleDataService`·`CommSyncMngService` 의 C_AT/U_AT, `CommUserMngQueryService` 의 기간 비교)·적재기 값과 섞인다. 선택지: time_zone 을 빼고 KST 통일 / native 감사 시각을 `SYS_EXTRACT_UTC(SYSTIMESTAMP)` 로 맞추고 LocalDateTime 기준 시간대를 명시.
- 업무기준 동적 표 `MCAAPUSER.TB_MCA_<RULE_ID>`(MasterRuleData*): 누가 만들고 MCMAPUSER 에 어떤 권한(DML·ALL_TAB_COLUMNS)을 주는지 정해진 곳이 없다. V1 은 미리 나열할 수 없다.
- RULE_ID 길이: `TB_MCA_RULE_COL_LIST.RULE_ID` 10자, `TB_MCA_RULE_MASTER.RULE_ID` 50자(엔티티 그대로). Oracle 은 길이를 강제하므로 11~50자 RULE_ID 는 구조 저장 때 ORA-12899. 지금 데이터 최대 7자.

다른 레인·문서:
- 적재기(ora-base b5)·DBA: 데이터를 옮긴 뒤 `SEQ_MCM_MOM_TC_SEND`·`SEQ_MCM_MOM_TC_ERROR` 를 MAX(키)+1 로 다시 맞춘다. MSSQL 원본의 `TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID=''` 행은 옮기지 않는다.
- cactus `DmomMapper.xml:65,70` 의 `NEXT VALUE FOR MCMAPUSER.SEQ_MCM_MOM_TC_ERROR` → `.NEXTVAL`(ora-platform).
- 옛 경로를 가리키는 문서: `docs/guide/BackEnd/Mcm-Core-Onboarding.md:155,159`, `docs/mcm/erd/csa-sec-erd.md:256`, `docs/widget-2026-10/erd-widget-meta.md:31`(ora-base 문서 정리 b7).

c2 로 넘길 것(이 레인):
- `MasterRuleListService` 의 RULE_NM 빈 값 검사(Oracle 은 `''`→NULL → ORA-01400), `MasterCodeMngService`·`MasterCodeUploadFilePopupService` 의 PK 칸 빈 값 검사.
- `TB_SEC_CODE_ITEM.EXTRA_VAL1` 을 `= ''` 로 비교하는 코드(시더가 `''` 를 넣음 → NULL).
- `InterfaceFormatLayoutRepository.backupToMcmBackup`(MCM_BACKUP.TB_MCM_MOM_FORMAT_LAYOUT) 는 부르는 곳 없는 죽은 코드 — 표를 만들지 않고 c2 에서 정리.
- 사본·백업 표는 PK 없이 둠(MSSQL 동작 보존). 동기화 DELETE 를 CODE_ID 기준까지 넓힐지는 c2 에서 판단.

## 원장 → 사본 동기화 (운영 단서)

- `csa/commSyncMng/service/CommSyncMngService`(동기화 관리 화면, BPMN `csa/commSyncMng.bpmn` `reg`)가 MASTER 처리유형에서
  `MCM_SOURCE` → 대상 스키마(`MCMAPUSER`·`MCM_BACKUP`)로 `DELETE` 후 `INSERT INTO 대상 SELECT * FROM MCM_SOURCE.표 WHERE MASTER_CODE=?` 를 한다.
  대상이 `MCM_BACKUP` 이면 `TB_MCM_CODE_DETAIL` 은 건너뛴다. 원장 `CODE_VER` 도 올린다.
- 트리거·배치는 코드에 없다. 사람이 화면에서 돌리는 동기화가 유일한 경로다.
- `SELECT *` 복사이므로 사본·백업 표의 열 순서가 원장과 같아야 한다 → V1 에서 원장 정의를 그대로 옮겼다.
- 로컬 적재기(ora-base b5)는 MCM_SOURCE 와 MCMAPUSER 사본 양쪽에 같은 행을 넣어야 코드 선택 팝업이 지금처럼 보인다(SQLite 에서는 한 표였다).

## 다음 단계

- 재개 때 리뷰 반영본 재검증 → c1 진행 보고. 재검증은 scratch 도구로 했다(커밋하지 않음): mcm/api runtimeClasspath + ojdbc11 23.9 + flyway-database-oracle 11.14.1 로
  ① `SchemaTool export`(JpaConfig 와 같은 packagesToScan, OracleDialect 23, preferred_instant TIMESTAMP·time_zone UTC, 연결 없음) ② `FlywayRun`(스키마 주인으로 접속, placeholder app_user) ③ `SchemaTool validate`(L_MCC_MCMAPUSER 로 접속, PhysicalNamingStrategy 가 스키마 이름에만 L_MCC_ 접두).
  scratch 가 사라졌으면 같은 방식으로 다시 만든다.
- 검증 사용자 `L_MCC_MCMAPUSER`·`L_MCC_MCM_SOURCE`·`L_MCC_MCM_BACKUP`·`L_MCC_MCAAPUSER` 는 검증 뒤 지운다.
- 재개 때 조정이 정할 것: TB_SEC_CODE_GROUP·TB_SEC_CODE_ITEM 이 mdm 런타임 EMF 에도 들어와 MDMAPUSER 에도 필요하다(ora-base 스파이크). 이 표들의 주인 결정 뒤 V1 배치를 맞춘다. 머지②·③ 은 같은 창.
