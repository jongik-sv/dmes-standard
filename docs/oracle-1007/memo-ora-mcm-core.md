# ora-mcm-core 정본 메모

- 레인: ora-mcm-core / 브랜치 `feat/ora-mcm-core` / 워크트리 `/Users/jji/project/dmes-wt/ora-mcm-core`
- 조정 세션: dmes-standard-d8 (지시 ora-mcm-core-1)
- 갱신: 2026-10-07

## 지금 상태

- **c1 Oracle 기준선 V1 — 완료(10-07 17:25 재검증)**
  - 리뷰 반영본 재검증(컨테이너 재생성 뒤, TZ Asia/Seoul): Flyway 4벌 성공 · 기본 영속성 단위 validate 오류 0 · 검증 사용자 4개 삭제(남은 L_MCC_ 0).
  - RULE_ID 50자 확장(c4f775911, 조정 결정 ④).
  - V1 4벌을 만들었다: `src/backend/mcm-core/src/main/resources/db/migration/oracle/{mcmapuser,mcm_source,mcm_backup,mcaapuser}/V1__baseline.sql`
  - 엔티티 쪽 수정: `AuditLog`·`KeyStore` 의 `columnDefinition="TEXT"` → `LONG32VARCHAR`(c3b4fc02d)
  - archive: `db/migration/sqlite`(V1~V18)·`db/migration/mcm-core`(샘플 V1)·`db/seed/oasis` → `src/backend/mcm-core/archive/`
  - 1차 검증(리뷰 반영 전 V1): Flyway 4벌 적용 성공 · 기본 영속성 단위 validate 오류 0 · 음성 시험(칸 삭제·형식 변경)으로 validate 가 실패함을 확인. cmn·if 단위는 엔티티 0, caravan 단위는 ora-platform 기준선 뒤.
  - opus/high 리뷰 지적 13건(blocker 0·major 5·minor 8) 중 c1 몫 반영: SEQ_MCM_MOM_TC_ERROR 추가, 사본·백업 표 PK 제거(MSSQL 동작 보존), 머리 주석(Oracle 23 이상·주인 접속·시퀀스 재설정), README(주인 접속·locations·채번). 나머지는 아래 「넘길 조건·후속」.
  - 공지 표 TB_MCM_NOTICE·TB_MCM_NOTICE_TARGET(+인덱스 2)·TB_MCM_SEC_USER_SRCH_DFLT 는 MCMAPUSER V1 에 들어 있다.
- c3: 다음 착수. c2·c4: 대기(ora-base 머지① 뒤)
- c2 주의(조정 지시 10-07): `SqliteTemporalConverterContributor` 는 지우지 말고 `@Deprecated` 만 단다 — mls application.yml 이 가리킨다. 제거는 ora-platform 이 mls yml 을 고친 뒤 ora-base b8.

## 남은 순서

1. ~~c1 검증·리뷰·진행 보고~~ 완료(10-07)
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
| 10-07 | 모든 일시 칸 `timestamp(6)`, 앱 설정 `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP`. 시간대는 **KST 통일**: `hibernate.jdbc.time_zone` 은 넣지 않고(JVM Asia/Seoul), Oracle 컨테이너 OS TZ Asia/Seoul, native SQL 의 SYSDATE·SYSTIMESTAMP 는 그대로 | 조정 결정 ①(처음 UTC 안을 리뷰 지적 뒤 KST 로 바꿈) |
| 10-07 | 동적 표 `MCAAPUSER.TB_MCA_<RULE_ID>` 에 ANY 권한을 주지 않는다. 앱 코드는 이 표에 DDL 을 보내지 않는다(아래) | 조정 결정 ② |
| 10-07 | `TB_SEC_CODE_GROUP`·`TB_SEC_CODE_ITEM` 주인은 mcm-core(MCMAPUSER). MDMAPUSER 에 사본을 만들지 않는다(mdm 사용 여부는 ora-mdm 확인) | 조정 결정 ③ |
| 10-07 | `TB_MCA_RULE_COL_LIST.RULE_ID` 를 50자로 넓혀 마스터와 맞춘다(엔티티 포함) | 조정 결정 ④ |
| 10-07 | 다른 스키마 표의 권한 대상은 Flyway 자리표시자 `${app_user}`(로컬·운영 = MCMAPUSER) — ora-mcm-app 이 Flyway 설정에 넣어야 한다 | 레인 판단 |

## 기준선 근거

- 내보내기: `JpaConfig` 와 같은 packagesToScan·Hibernate 기본 이름 전략으로 EMF 를 띄우고 OracleDialect(23) 스크립트 생성(연결 없음).
- 대조: 로컬 `mcm.db` `.backup` 사본과 표·열·NOT NULL 차이 0. SQLite 에만 있던 것: `HTE_TB_MCM_MOM_TC_SEND`(Hibernate 임시 표, 뺌), `SEQ_MCM_MOM_TC_SEND`(시퀀스 흉내 표 → SEQUENCE, increment 1 = allocationSize 1), `TB_MCM_SEC_MENU_FLD`(엔티티 없음, Java DDL 마지막 상태로 넣음).
- 부분 인덱스: mcm.db·`ScreenUsageMssqlDdl` 모두 없음. `UK_SEC_SCREEN_USAGE_LOG_SEG(USER_ID, CLIENT_SEG_ID)` 는 두 열 모두 NOT NULL 이라 Oracle 복합 unique 의미 차이 없음.
- `''` 정책 근거: mcm.db 에서 `''` 값이 있는 칸은 모두 NULL 허용 칸이다(NOT NULL 칸의 `''` 행 0). 코드 쪽 `= ''` 비교는 c2.

## c1 리뷰(opus/high) 뒤 넘길 조건·후속

ora-mcm-app 에 넘길 조건:
- 기본 영속성 단위는 `JpaConfig` 가 props 를 직접 만들어 yml 의 `spring.jpa.properties` 가 먹지 않는다. `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP` 는 `JpaConfig` 의 `props.put` 에 넣어야 한다. `hibernate.jdbc.time_zone` 은 넣지 않는다(KST 통일, JVM `-Duser.timezone=Asia/Seoul` 전제). 확인은 validate 가 아니라 값을 넣고 읽는 왕복으로(검사기는 형식 이름 앞부분 일치라 `timestamp(6) with time zone` 도 통과시킬 수 있음 — 리뷰어 추정).
- 스키마별 Flyway 는 그 스키마 주인으로 접속(`${app_user}`=MCMAPUSER 로 돌면 GRANT 가 ORA-01749). `locations` 는 `classpath:db/migration/oracle/<스키마>` 하나로 좁힌다. `mcm/api` 의 `db/migration/mcm/V1__init_sample_notice.sql`(SQLite 문법)은 같은 이력에 넣지 않는다.
- `mcm/api/src/main/resources/application.yml:33-34` 주석이 옛 `db/migration/sqlite` 경로를 가리킨다.

조정 결정으로 정리된 것(위 결정 표 ①~④):
- 시각: 처음 UTC 안은 `LocalDateTime` 칸까지 UTC 로 바꿔 저장해 DB 시계 native 감사 시각과 섞인다는 리뷰 지적이 있어 KST 통일로 바꿨다.
- 동적 표 `MCAAPUSER.TB_MCA_<RULE_ID>`: 코드 확인 결과 앱은 이 표를 **만들거나 지우지 않는다**. `MasterRuleDataService`·`MasterRuleDataListService`·`MasterRuleDataUploadFilePopupService` 는 SELECT·INSERT·UPDATE·DELETE 만, `MasterRuleFrameColListPopupService`/`MasterRuleColListRepository` 는 칸 메타 조회(지금 `INFORMATION_SCHEMA.COLUMNS`·`KEY_COLUMN_USAGE` — c2 에서 `ALL_TAB_COLUMNS`·`ALL_CONSTRAINTS` 로)만 한다. 표 생성은 As-Is 처럼 앱 밖(DBA)이다 → 표를 만들 때 MCMAPUSER 에 `SELECT, INSERT, UPDATE, DELETE` 를 GRANT 하면 된다(ALL_* 메타는 권한 받은 표만 보이므로 그대로 된다). 별도 데이터소스는 필요 없다. 로컬은 적재기가 표를 옮길 때 같은 GRANT 를 붙인다.
- RULE_ID: 50자로 통일(c4f775911).

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

- c3 착수. 기준선을 다시 만들 일(머지 직전 dev 합치기 등)이 생기면 아래 scratch 도구로 다시 한다(커밋하지 않음): mcm/api runtimeClasspath + ojdbc11 23.9 + flyway-database-oracle 11.14.1 로
  ① `SchemaTool export`(JpaConfig 와 같은 packagesToScan, OracleDialect 23, preferred_instant TIMESTAMP, 연결 없음) ② `FlywayRun`(스키마 주인으로 접속, placeholder app_user) ③ `SchemaTool validate`(L_MCC_MCMAPUSER 로 접속, PhysicalNamingStrategy 가 스키마 이름에만 L_MCC_ 접두).
  scratch 가 사라졌으면 같은 방식으로 다시 만든다.
- 검증 사용자 `L_MCC_MCMAPUSER`·`L_MCC_MCM_SOURCE`·`L_MCC_MCM_BACKUP`·`L_MCC_MCAAPUSER` 는 검증 뒤 지운다.
- 머지②·③ 은 같은 창(mcm-core 엔티티가 mdm 런타임 EMF 에도 들어온다 — 조정 10-07).
