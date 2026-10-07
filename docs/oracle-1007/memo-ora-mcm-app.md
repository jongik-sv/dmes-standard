# ora-mcm-app 정본 메모

- 레인: ora-mcm-app / 브랜치 `feat/ora-mcm-app` / 워크트리 `/Users/jji/project/dmes-wt/ora-mcm-app`
- 조정 세션: dmes-standard-d8 (지시 ora-mcm-app-1, 원문 `/Users/jji/.coord/oracle-1007/lanes/ora-mcm-app/brief.md`)
- 갱신: 2026-10-07 19:00 KST

## 지금 상태

| 항목 | 상태 | 커밋·비고 |
|---|---|---|
| a1 Flyway·Java DDL 제거 | Oracle 시험 끝까지 돎(18:35~18:53, 162개 중 실패 1·건너뜀 1). 실패 1건은 시험 버그(아래)라 고쳐 단독 재실행 | dd985b781(본체), ced723336(시험 전환), efa57059c(dev 합치기, fb253556d 포함) |
| a1 리뷰(opus/high) | 지적 9건 반영·전달 끝(blocker 지문 골든 재생성·대조 완료) | 아래 「리뷰 지적」 |
| SQLite 치환 API 호출 제거 | **완료** — mcm main·시험에서 setSqlite·isSqlite·toSqliteCompatible·stripUnicodeLiteralPrefix·McmSqliteMybatisInterceptor·SqliteTemporalConverterContributor 호출 0건(grep) | 남은 것은 application.yml 의 `statement_inspector` 설정 1줄(JpaConfig 가 직접 만든 EMF 에는 적용되지 않는 옛 감사 inspector 설정, 치환 API 아님) |
| CaravanMetaSeeder 가드 | **사용자 확인 대기** | 조정자 승인(표가 없으면 ORA-00942 만 경고 뒤 건너뜀). 사용자가 명령을 거절해 되돌렸다. 패치는 세션 scratchpad `caravan-guard.patch` |
| a2 `''` 비교 | 작업 트리에 수정 2건(미커밋) | McmMenuSeeder.normalizeSecMenuCharColumns(`LTRIM(RTRIM(c)) IS NULL` — fix), NoticeRepository(`OR :p = ''` 제거 — refactor). 커밋 때 특성화 골든 4개 재생성 필요 |
| a3 프로파일 | 미착수 | local 은 a1 에서 Oracle 로 바꿈. 남은 것: local-db archive, dev·prod·wildfly 를 OracleDialect·중립 JNDI(`java:/jdbc/mcm/dsBiz` 등), wildfly 는 dmes.flyway.enabled=false 명시 |
| a4 시험·머지 요청 | 미착수 | |

Oracle: 18:24 인스턴스 스래싱으로 조정자 동결 → 이 레인 프로세스 전부 TERM. 재개 뒤 새 pdb.mjs 로 T_ORA_MCM_APP drop 완료(18:50). 남은 Oracle 작업·백그라운드 0.

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
   - 겹치는 표 57개의 행 수가 모두 같다(시드가 있는 표 15개: TB_MCA_RULE_MASTER 6, TB_MCM_DEPT_INFO 7, TB_MCM_SEC_MENU 45, TB_MCM_SEC_MENU_FLD 15, TB_MCM_SEC_OBJ 54, TB_MCM_SEC_PERM 4, TB_MCM_SEC_ROLE 3, TB_MCM_SEC_ROLEGROUP 3, TB_MCM_SEC_ROLEGROUP_MAPPING 3, TB_MCM_SEC_ROLE_MAPPING 105, TB_MCM_SEC_USER 1, TB_MCM_SEC_USER_MAPPING 1, TB_MCM_SEC_USER_PWD 1, TB_SEC_CODE_GROUP 1, TB_SEC_CODE_ITEM 6).
   - 빠진 2줄: HTE_TB_MCM_MOM_TC_SEND(Hibernate 임시 표, 0행)·SEQ_MCM_MOM_TC_SEND(시퀀스 흉내 표, 1행) — V1 이 임시 표를 빼고 실제 SEQUENCE 로 바꿨다(V1 머리 주석).
   - 해시는 모두 다르다: 값 표기(숫자·시각·NULL)가 SQLite 와 달라서다. __SCHEMA__ 는 셈 기준이 바뀌었다(SQLite 67 → Oracle ALL_OBJECTS·ALL_TAB_COLUMNS 1106).
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

## 남은 순서

1. a1 시험: `../gradlew :api:test :lib:test -Pdmes.ora.test=clone` 를 heavy.sh `--detach` 로(바뀐 시험만 먼저). 지문 골든은 `FINGERPRINT_UPDATE=true` 로 재생성 → 행 수 대조 기록. 통과하면 진행 보고.
2. CaravanMetaSeeder 가드: 사용자 답에 따라 패치 적용 또는 보류.
3. a2: 미커밋 2건 + 특성화 골든 재생성(`MSSQLSQL_UPDATE=true`) → fix·refactor 커밋 분리 → 리뷰.
4. a3: local-db archive, dev·prod·wildfly OracleDialect·중립 JNDI, wildfly Flyway 끔 → 리뷰.
5. a4: dev 최신(notice-fill2 공지 변경 포함) 합치기, mcm 시험 전체(heavy.sh), `docs/oracle-1007/perf-ora-mcm-app.md`(SQLite 대비 시간, 반복 측정), 치환 API grep 0건 첨부 → 머지 요청(머지③, ora-mcm-core 바로 뒤).

## 다음 단계

- 조정자가 compact 를 보낸 뒤 「남은 순서」 1번(a1 시험 재실행)부터 잇는다.
- 실행 수단: 시험·골든 재생성은 직접(D0), 리뷰는 opus/high agent(D2).
- 셸: git 은 `/usr/bin/git`, gradle 은 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`, 무거운 Oracle 시험은 heavy.sh `--detach` 후 `heavy.sh wait <id>`.
