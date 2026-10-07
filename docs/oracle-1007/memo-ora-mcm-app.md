# ora-mcm-app 정본 메모

- 레인: ora-mcm-app / 브랜치 `feat/ora-mcm-app` / 워크트리 `/Users/jji/project/dmes-wt/ora-mcm-app`
- 조정 세션: dmes-standard-d8 (지시 ora-mcm-app-1, 원문 `/Users/jji/.coord/oracle-1007/lanes/ora-mcm-app/brief.md`)
- 갱신: 2026-10-07 21:15 KST

## 지금 상태

| 항목 | 상태 | 커밋·비고 |
|---|---|---|
| a1 Flyway·Java DDL 제거 | 완료. Oracle 전체 시험 1회(18:35~18:53, 162개 중 실패 1·건너뜀 1), 실패 1건은 시험 버그라 고쳐 단독 재실행 통과 | dd985b781·ced723336·efa57059c·2bfd299fd |
| a1 리뷰(opus/high) | 9건 반영·전달 끝(blocker 지문 골든 재생성·대조 완료) | 아래 「리뷰 지적」 |
| SQLite 치환 API·LocalSqliteDataSource 호출 | 0건(HEAD 와 feat/ora-mcm-core 합친 트리 모두). McmAuthController:80·McmApplication:58-59 에 「걷어냈다」 주석만 | grep, archive 제외 |
| a2 `''` 비교 | 완료 | 0663dfc9d(fix: SEC_MENU LTRIM(RTRIM(c)) IS NULL + 특성화 골든 4), 52c7eed20(refactor: NoticeRepository `:p = ''` 제거) |
| CaravanMetaSeeder 가드 | 완료(조정 세션 경유 사용자 승인) | 10ca56676(fix: ORA-00942 만 경고 뒤 건너뜀 + 시험 2) |
| a2·가드 리뷰(opus/high) | minor 4·nit 4 반영 → 확인 리뷰(sonnet) 남은 문구 반영 | 887915185(McmMenuSeederNormalizeTest·빈 조회조건 시험·표 이름), a92a00b4d |
| a3 프로파일 | 완료 | 666812393(wildfly OracleDialect·java:/jdbc/mcm/*·Flyway 끔, prod require-dedicated, local-db archive), d998d2150(리뷰 반영) |
| a3 리뷰(opus/high) | blocker 0, 범위 밖 major 1(caravan-hub JNDI)·문서 3 은 조정에 전달, 범위 안은 반영 | |
| 시험 풀 | 상한 2·minimumIdle 0·idleTimeout 10초·@AfterAll 로 닫기(조정 ㉠ 승인) | a92a00b4d |
| feat/ora-mcm-core·dev 합치기 | ora-mcm-core 1d612401a(충돌 0)·dev ce378785a 합침. V1 sample_notice.active NUMBER(1) 로 지문 골든 __SCHEMA__ 한 줄 갱신 | 7141a7de8·bb2aebcdc·8373c105e |
| a4 시험 | **통과**: Oracle(VM 3GB) 3회 모두 166개 중 실패 0·건너뜀 1(성능 시험). 지목된 4개·새 시험 모두 포함 | 1b4d14fde(perf 문서: 벽시계 45 대 78초, 공통 클래스 합 34.2 대 39.3초) |
| b8 잔재 정리(§9.3) | 완료: sqlite-jdbc 제거, 특성화 시험·골든 4 archive, 주석·샘플 SQL Oracle 판. mcm 시험 162개 실패 0·건너뜀 1(Oracle 1회) | 4d0d11a59·05770d32f |
| a4 머지 요청 | ora-mcm-core c4 머지 요청 SHA 대기 → 다시 합쳐 4개 시험·V1 체크섬 재확인 뒤 요청 | |

Oracle: 20:20 VM 3GB 재기동 뒤 T_ORA_MCM_APP drop 완료, 측정 뒤 하니스가 시험 PDB 를 지움. 남은 PDB·백그라운드 0. (이전: 19:25 두 번째 동결(시험 JVM 등 TERM). 재개 뒤 T_ORA_MCM_APP drop 은 잠금 시간 초과(rc 1), close 는 성공(20:2x). VM available 81MB·load 19 로 「VM 의심」 보고. T_ORA_MCM_APP 은 닫힌 채 남아 있었다.)

## a1 에서 한 것

- `McmSchemaMigrator`(mcm/lib `com.dongkuk.dmes.mcm.db`): MCMAPUSER·MCM_SOURCE·MCM_BACKUP·MCAAPUSER 를 각 주인으로 접속해 Flyway(locations `classpath:db/migration/oracle/<스키마 소문자>` 하나, placeholder `app_user`=MCMAPUSER).
- `McmFlywayConfig`(mcm/api): `dmes.flyway.enabled`(기본 false, local true)·`dmes.flyway.url/password/app-user`. 기본 EMF 는 `@DependsOn("mcmSchemaMigration")`. `spring.flyway.enabled=false` 유지(조정자 승인).
- `JpaConfig`: ddl-auto 기본 none, `preferred_instant_jdbc_type=TIMESTAMP`·`preferred_boolean_jdbc_type=TINYINT`(조정자 공통 규약 변경), jdbc.time_zone 없음, Hikari 상한 `spring.datasource.hikari.maximum-pool-size`(기본 3), SQLite 분기 제거.
- DataInitializer·SeedSupport: 방언 판정·DDL 단계 제거, 시드 SQL Oracle 문법(`SYSTIMESTAMP`, `TIMESTAMP '9999-12-31 23:59:59'`).
- local 프로파일: 같은 PDB 에 biz·cmn=MCMAPUSER, if=EAIUSER, caravan=CARAVANUSER(ddl none). 기본 PDB `L_ORA_MCM_APP`, 속성 `dmes.ora.url·user·password·host·port·pdb`(env DMES_ORA_* 도 됨).
- archive(`src/backend/mcm/archive/`, git mv): SchemaArtifactsMssql·SchemaArtifactsSqlite·ScreenUsageSchemaArtifacts·CactusSqliteIfNotExistsDialect·SqliteBusyRetry(+시험 3)·JpaConfigSqliteFlagTest·McmMybatisConfig·옛 SQLite 샘플 마이그레이션 `db/migration/mcm/V1__init_sample_notice.sql`.
- 시험: lib testFixtures `McmOraTestDb`(resetSchemas = 네 스키마 Flyway clean→migrate). DB 시험 10개 전환, `NoticeInstantRoundTripTest` 추가(넘김 조건 1 왕복 확인). api test `mustRunAfter(':lib:test')`.
- 특성화 골든(`data-initializer-mssql-sql.*`) 재생성: 새 호출열 = 옛 호출열에서 두 치환만 한 부분열, 빠진 것은 DDL·카탈로그 조회·옛 MSSQL 데이터 보정뿐(scratchpad golden_diff.py 로 확인).

## 리뷰 지적(a1, opus/high, 9건)

1. blocker — 지문 골든을 Oracle 에서 다시 만들어야 함 — **반영**. 시험 PDB 에서 `FINGERPRINT_UPDATE=true` 로 재생성했다. 옛 SQLite 골든과 대조:
   - 겹치는 표 56개의 행 수가 모두 같다(옛 골든은 표 58개 + __SCHEMA__ 1줄. 시드가 있는 표 15개: TB_MCA_RULE_MASTER 6, TB_MCM_DEPT_INFO 7, TB_MCM_SEC_MENU 45, TB_MCM_SEC_MENU_FLD 15, TB_MCM_SEC_OBJ 54, TB_MCM_SEC_PERM 4, TB_MCM_SEC_ROLE 3, TB_MCM_SEC_ROLEGROUP 3, TB_MCM_SEC_ROLEGROUP_MAPPING 3, TB_MCM_SEC_ROLE_MAPPING 105, TB_MCM_SEC_USER 1, TB_MCM_SEC_USER_MAPPING 1, TB_MCM_SEC_USER_PWD 1, TB_SEC_CODE_GROUP 1, TB_SEC_CODE_ITEM 6).
   - 빠진 2줄: HTE_TB_MCM_MOM_TC_SEND(Hibernate 임시 표, 0행)·SEQ_MCM_MOM_TC_SEND(시퀀스 흉내 표, 1행) — V1 이 임시 표를 빼고 실제 SEQUENCE 로 바꿨다(V1 머리 주석).
   - 새로 생긴 5줄: MCM_BACKUP 표 2개·MCM_SOURCE 표 3개(모두 0행) — 옛 SQLite 골든에는 스키마 구분이 없어 이 사본 표들이 따로 잡히지 않았다.
   - 해시는 모두 다르다. 행이 0인 표도 다르므로 값 표기만이 아니라 해시에 넣는 열 목록·직렬화가 DB 마다 다르다. 그래서 **대조로 확인한 것은 행 수뿐이고, 시드가 든 15개 표의 내용 동일성은 직접 확인하지 않았다.** 간접 근거: 특성화 골든에서 새 호출열이 옛 호출열의 부분열이고 차이는 SQL 치환 두 가지(SYSTIMESTAMP·TIMESTAMP 리터럴)뿐이라, 넣는 값은 같다.
   - __SCHEMA__ 는 셈 기준이 바뀌었다(SQLite 67 → Oracle ALL_OBJECTS·ALL_TAB_COLUMNS 1106).
2. CaravanMetaSeeder 가 caravan 표 없으면 기동 실패 → 가드(사용자 확인 대기)
3. local 기본 PDB FREEPDB1 → L_ORA_MCM_APP, dmes.ora.* 속성 — 반영
4. Instant 왕복 시험 — 반영(NoticeInstantRoundTripTest). 첫 실행 실패는 시험 버그: id 를 직접 넣는 엔티티라 save 가 merge 로 가서 @PrePersist 는 반환된 사본에 C_AT 를 채운다 → 반환값을 쓰게 고침. JVM TZ 고정은 ora-base 몫 → fb253556d 에서 고정됨
5. McmMenuSeeder `= ''` — a2 로 수정(미커밋)
6. sample_notice.active boolean — ora-mcm-core 에 전달(조정 승인)
7. 옛 MSSQL 데이터 보정 소실 — 적재기(ora-base) 확인 항목으로 전달
8. --parallel 시 lib·api 시험 겹침 — mustRunAfter 반영
9. mcm-core/build.gradle:36 inputs.files 가 archive 된 파일 가리킴 — ora-mcm-core 전달, masterCodeSelPop.xml·application.yml 옛 주석 — 반영

## 결정

| 날짜 | 결정 | 근거 |
|---|---|---|
| 10-07 | spring.flyway 끄고 dmes.flyway.* 로 스키마별 Flyway 4개(주인 접속), EMF 는 그 뒤, wildfly 끔 | 조정 승인 |
| 10-07 | ScreenUsageMssqlDdlTest(mcm-core)는 ora-mcm-core 가 c2 에서 정리. 이 레인 DDL archive 는 그 정리가 dev 에 들어간 뒤 dev 합쳐 시험으로 확인 | 조정 답1 |
| 10-07 | sample_notice.active → NUMBER(1) 은 ora-mcm-core | 조정 답2 |
| 10-07 | boolean 은 TINYINT(BIT 아님) | 조정 공통 규약 변경 |
| 10-07 | caravan 표 없이 기동 → CaravanMetaSeeder 에 ORA-00942 만 건너뛰는 가드(조정 승인 ㉡) | 사용자 확인 대기 |
| 10-07 | SQLite 치환 API 호출은 이 레인이 a2·a3 안에서 0건으로. a4 머지 요청에 grep 결과 첨부 | 조정 전달(ora-mcm-core c2 발) |
| 10-07 | Oracle 무거운 작업은 PC 전체 한 번에 하나(새 하니스 PC 잠금). 상태 확인 sqlplus·pdb list 반복 금지 | 조정 재개 규칙 |
| 10-07 | 시험 풀은 상한 2·minimumIdle 0·idleTimeout 10초·@AfterAll 로 닫기 | 조정 ㉠ 승인 |
| 10-07 | dmes.widget.query.require-dedicated 는 prod 에만 ${WIDGET_QUERY_REQUIRE_DEDICATED:true}(wildfly 에 두면 dev 도 켜짐) | 조정 ㉠ 승인 |
| 10-07 | backup/ora-mcm-app-pre-split 브랜치는 그대로 두고 마감 보고 「남긴 브랜치」 로 사용자 결정에 넘긴다. SQLite 기준 측정용 임시 워크트리(scratchpad sqlite-base, detached fb253556d)도 함께 적는다 | 조정 ㉠ |

## 남은 순서

1. ora-mcm-core 가 c4 머지 요청을 내면 그 SHA 를 합쳐 Fingerprint·NoticePermissionFilter·MenuCatalogOasisSave 3개(Characterization 은 b8 잔재 정리로 archive)와 Flyway V1 적용(체크섬)만 Oracle 에서 재확인한다.
2. 머지 요청(머지③, mcm-core 바로 뒤): 치환 API·LocalSqliteDataSource grep 0건, caravan-hub JNDI 의존(ora-platform 이 java:/jdbc/mcm/dsCaravan·dsIF 로 맞춰야 함), require-dedicated 는 mcm-core 10d9b67de 뒤 효력, 윈도우 영향 없음(Java·yml·문서만).
3. 「머지 허가」 뒤 메인 저장소에서 --no-ff 머지 → 머지 완료 → 워크트리 정리(-d·force 금지) → 정리 완료. backup/ora-mcm-app-pre-split 브랜치 처리는 조정자에게 묻는다.

## 다음 단계

- 「Oracle 재개」 를 기다린다. 받으면 「남은 순서」 1번부터.
- 실행 수단: 시험은 직접(heavy.sh), 리뷰는 opus/high agent, 문서·점검은 sonnet agent. 동시 agent 상한 4.
- 셸: git 은 `/usr/bin/git`, gradle 은 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`, 무거운 Oracle 시험은 heavy.sh `--detach` 후 결과 파일을 직접 읽는다. 잠금 없는 close 는 feat/ora-base 판 pdb.mjs(bd7075d51)를 scratchpad 에서 실행.
