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
- **c3 위젯 조회 SQL — 완료(10-07, c1276e6aa)**. 범위(조정 승인): Oracle 갈래를 실측으로 굳힌다. 다른 방언 갈래 삭제는 c4, `adaptForLocalSqlite` 는 c2.
  - 실측(L_ORA_MCM_CORE, 풀 1개): `WidgetReadOnlyJdbc` Oracle 갈래 동작 — INSERT·UPDATE·MERGE·FOR UPDATE 가 ORA-01456, 같은 SID 로 업무 쓰기 정상. 막지 못한 것: NEXTVAL 소모, DDL(암묵 커밋), 기존 자율 트랜잭션 함수 쓰기, WITH FUNCTION(PRAGMA AUTONOMOUS_TRANSACTION), LOCK TABLE·dbms_session.sleep(첫 낱말 검사가 막음).
  - 위젯 경로로 PL/SQL 을 **만드는** 길은 없다(첫 낱말 SELECT/WITH·문장 하나·WITH FUNCTION 거절). 이미 있는 함수 **호출**만 가능 → 정책 A 유지(조정 확인).
  - SqlGuard 보강(미커밋, 작업 트리): 금지 낱말 NEXTVAL, DB 링크 `이름@링크` 거절(MSG_DB_LINK), `WITH FUNCTION/PROCEDURE` 거절(MSG_INLINE_PLSQL), 함수 목록에 Oracle 관리 스키마(CTXSYS·MDSYS·XDB·ORDSYS·OLAPSYS·LBACSYS·DVSYS·WMSYS·DBSNMP·OJVMSYS·AUDSYS·GSMADMIN_INTERNAL·APEX_n·FLOWS_n)·CTX_*. 클래스 설명에 Oracle 잔여 위험. WidgetReadOnlyJdbc 설명에 실측 결과. SqlGuardTest 사례 추가 → **277/277 통과**.
  - 위젯 정의 6개 Oracle 변환표: `docs/oracle-1007/widget-sql-oracle.md`(7개 모두 PDB 실행 성공). 조정에 보내 적재(ora-base)로 넘길 것.
  - 도움말: 원본 Widget-Authoring-Guide.md §3.3·§3.4·§3.6·§3.7·§9 를 Oracle 판으로(60976f8c6), 사본 재생성. dev(fb253556d) 머지 뒤 dev 자체 사본 어긋남도 재생성(da68e2034). sync 확인은 워크트리에 node_modules 를 깔지 않고(조정 지시) 같은 단언 3개를 node 로 돌렸다 — 실제 vitest 는 조정자가 머지 게이트에서 돌린다(머지 요청에 적을 것).
  - Oracle 값 변환(L_ORA_MCM_CORE 실측): TIMESTAMP·TIMESTAMPTZ·TIMESTAMPLTZ·DATE → ISO 글자(KST), CLOB·NCLOB → 글자, NUMBER → BigDecimal, BINARY_DOUBLE NaN → 글자, ROWID·INTERVAL → 글자, RAW → null, '' → null, BOOLEAN → true. 코드 수정 없음.
  - opus/xhigh 보안 리뷰: major 1(T@"LINK"·"T"@"LINK" 따옴표 링크가 가린 사본을 지남)·nit 1(seq."NEXTVAL") → 드러낸 사본에서도 DB 링크·점 한정 NEXTVAL 검사(6-2단계), SqlGuardTest 283/283(c1276e6aa). WidgetReadOnlyJdbc Oracle 갈래 정리·예외 경로는 이상 없음. 리뷰어 권고: 운영 Oracle 에서 전용 읽기 DataSource 가 없으면 실행 거절(B). 조정 기준(PL/SQL 을 만드는 길)은 해당 없음 → A 유지, 판단은 조정에 올림.
- **c2 방언 전환 — 코드 완료(10-07, 0fc581c9b)**, Oracle 실행 확인은 c4. dev fb253556d(머지①b) 합침(35c7be3c2).
  - 조정 결정 A: SQLite 치환 API(setSqlite·isSqlite·toSqliteCompatible·stripUnicodeLiteralPrefix·McmSqliteMybatisInterceptor·SqliteTemporalConverterContributor)는 @Deprecated 로 남기고 동작 유지(setSqlite(true) 때만). mcm 호출(main 4·시험 약 15)은 조정이 ora-mcm-app a2·a3 조건으로 넘김, 삭제는 ora-base b8.
  - 감사 보강 SQL → CURRENT_TIMESTAMP·COALESCE(VER,0)+1. isSqlite 갈래 5곳을 Oracle·H2 공통형 하나로(LPAD·||·FETCH FIRST·LOCALTIMESTAMP+INTERVAL·재귀 WITH 칸 목록). INFORMATION_SCHEMA → ALL_*. RULE_NM·코드 PK 빈 값 검사. adaptForLocalSqlite 는 @Deprecated(결정 A).
  - 정책 B(조정 결정): `dmes.widget.query.require-dedicated`(기본 false) — true 면 전용 DataSource 없을 때 거절(10d9b67de). yml 은 ora-mcm-app a3.
  - H2 시험: SQLite 전용 CommUserMngServiceSearchRoleGrpSqliteTest 3건 실패(INTERVAL) → c4 에서 Oracle 로.
  - mcm 영향(ora-mcm-app 몫): 어댑터 5개는 setSqlite(true) 여도 Oracle 형을 보낸다 — mcm 의 SQLite 시험(DataInitializerMssqlSqlCharacterizationTest·DataInitializerSeedFingerprintTest·NoticePermissionFilterTest·MenuCatalogOasisSaveIntegrationTest)이 이 SQL 을 타면 깨진다.
  - **c4 Oracle 확인 목록**: ① 재귀 WITH 3개(SecMenuNativeRepository searchCmMenu·searchMenuFld, SecRoleGroupMappingNativeRepository.searchCmRoleGrpMenu — H2 시험이 타지 않음) ② searchMenuObjPop 상관 서브쿼리 FETCH FIRST ③ MomTcErrorRepository 따옴표 별칭·TO_CHAR·Instant 바인드 시간대 ④ MasterRuleColListRepository 사전 뷰(MCAAPUSER GRANT 없으면 조용히 0건) ⑤ CommSyncMngService 'FM999999990.0'·INSERT…SELECT * 칸 순서(원장·사본·백업 V1 일치) ⑥ CommUserMngQueryService LOCALTIMESTAMP·INTERVAL ⑦ masterRuleData 동적 CTE 페이징·DATE 칸에 14자 글자 바인드(NLS)·CLOB 칸 = 비교 ⑧ 화면 사용 표 색인·유일 제약·엔티티 왕복(archive 한 MSSQL DDL 시험 대체).
  - ScreenUsageMssqlDdlTest → archive/test/screenusage(4e63da218), build.gradle test 입력에서 ScreenUsageSchemaArtifacts·DataInitializer 뺌. ScreenUsageMssqlDdl 은 @Deprecated. **c4 할 일: 화면 사용 표 색인·유일 제약·엔티티 왕복을 Oracle 시험으로 대체**.
- **c4 시험 Oracle 전환 — 완료(10-07, 03e1263da)**. 최종: clone 모드 1232건 실패 0·건너뜀 2, 51초(perf-ora-mcm-core.md). 1차 레인 PDB 실행 63건 실패(ORA-01466·01873·01861·22848·NCLOB 투영·CHAR 상수·풀 부족) → 7594e556b 로 고침. 잔재 정리 4·5항(위젯 SQLite·SQL Server·PostgreSQL 갈래, SQLITE_BUSY 재시도) 448baab71·03e1263da, 1항(h2·sqlite·flyway-postgresql 시험 의존) 03e1263da.. 틀 1d612401a(McmCoreOraTestDb·EntitySchemaValidateOraTest — 레인 PDB validate 1/1·WidgetDefaultLayout 4/4). 병렬 4묶음(조정 지시, sonnet/high): A 위젯 쿼리 4·B 위젯 기타 8·C 사용자·메뉴·검색 기본값·화면 사용 5(+SearchRoleGrpSqliteTest → SearchRoleGrpOraTest)·D c2 확인 새 시험 oracheck/ 8파일 → WIP 8306615a9, 컴파일 오류 0, 남은 jdbc:h2·sqlite 0. 시험 자원 application.yml(H2, 읽는 Boot 시험 없음) → archive/test/resources.
  - 실패 나면 VM 값(available·load) 먼저 재고 VM 신호면 재실행 말고 조정에 「VM 의심」(조정 규칙 10-07).
  - D 가 짚은 main 의심(Oracle 결과로 판정): masterRuleData DATE 칸 14자 바인드·CLOB = 비교·CLOB 응답, searchCmRoleGrpMenu 정렬(MENU_SEQ 글자 정렬)·앵커(MENU_FLD.MENU_ID IN 화면 MENU_ID), MomTcError NCLOB 투영·null Instant 바인드, 재귀 순환 ORA-32044. A 의 DDL 시험은 「SqlGuard 가 DDL 거절」 로 의도 바뀜(Oracle DDL 암묵 커밋 — 정책 B 로 대응).
  - 시험은 `-Pdmes.ora.test=clone`(빌드마다 복제·삭제) 또는 `-Pdmes.ora.pdb=<PDB>`. PC 전체 Oracle 무거운 작업은 한 번에 하나(잠금).
- c2 주의(조정 지시 10-07): `SqliteTemporalConverterContributor` 는 지우지 말고 `@Deprecated` 만 단다 — mls application.yml 이 가리킨다. 제거는 ora-platform 이 mls yml 을 고친 뒤 ora-base b8.

## 남은 순서

1. ~~c1·c3·c2·c4~~ 완료(10-07)
2. ~~머지③~~ 완료(dev e8f5ed3d2). 이하 원래 계획: 머지 요청(ora-mcm-app 과 같은 창, mcm-core → mcm 순서) — 직전에 dev 최신(①d 하니스 교착 수정 포함)을 합치고 컴파일·지목 시험 확인.
   - 머지 요청에 적을 것: 대상 SHA, 전체 시험·perf, McmSqliteMybatisInterceptor·ScreenUsageMssqlDdl @Deprecated 유지(③b 정리), 위젯 PostgreSQL 갈래 제거(사용자 확정 3),
     V1 체크섬 변경(MCMAPUSER V1 머리 주석 BIT→TINYINT, 1d612401a — 이미 적용한 PDB 는 clean 또는 repair), 위젯 도움말 sync 는 node 단언(vitest 는 조정 게이트).
3. ~~③b~~ 완료·머지(dev daec256d0, 10-07, mcm-app 머지③ dev 14b09f1af 합친 뒤): McmSqliteMybatisInterceptor·ScreenUsageMssqlDdl → `mcm-core/archive/main/{audit,screenusage}/`, McmAuditStatementInspectorSqliteTest → `archive/test/audit/`, McmAuditStatementInspector 의 setSqlite·isSqlite·toSqlite·toSqliteCompatible·stripUnicodeLiteralPrefix 제거. 호출처 0(mcm·mdm·mls grep, mdm 의 isSqlite 는 자기 private). 확인: :mcm-core·:mcm:lib compileTestJava exit 0, clone 전체 117클래스·1227건 실패 0·건너뜀 2(옮긴 SQLite 시험 5건 빠짐).
4. ③c(머지 dev e3943844f — 조정 지시 10-07 — ora-mdm E2E 실측 mcm 연결 풀 고갈 교착): 원인은 OASIS txBiz 가 시작할 때 물리 연결을 잡고(READ_COMMITTED 지정 → HibernateJpaDialect.beginTransaction), SecWidgetService.search 가 그 연결을 쥔 채 NOT_SUPPORTED 로 내려가 범위 EM·CRUD readOnly 트랜잭션으로 연결을 더 받은 것(요청당 2~3개). 수정: 읽기는 바깥에 합류, 옛 행 이전 쓰기만 NOT_SUPPORTED + 비차단 1개(못 얻으면 건너뜀). 위젯 SQL 공유 모드는 local yml 에 전용 풀(MCMAPUSER, 최대 2·유휴 0·idleTimeout 10초). 채팅은 주석만. 회귀 시험 SecWidgetPoolExhaustionJpaTest(A 조회만 5명·B 이전 2명·C 이전 풀 크기)와 공유 모드 시험. 결정 3건은 조정 답(10-07, 모두 기본안).
4-1. ③d(사용자 결정 「메인만 8 + 감지 유지」, 10-07): mcm JpaConfig.dataSource() 가 spring.datasource.hikari 의 minimum-idle·idle-timeout·leak-detection-threshold 를 읽는다(없으면 Hikari 기본 — 종전 동작). local yml 은 최대 3 그대로 + 쉬는 연결 0·유휴 30초·누수 감지 30초. 메인 로컬 서버만 기동 env SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=8(ora-base 기동 스크립트). 실측(최대 8): 기동 직후 연결 1, 3초 뒤 1(더 채우지 않음), 6개 쓰고 돌려준 뒤 55초까지 6, 60초에 0(유휴 30초 + Hikari 정리 주기 30초).
5. ~~③e~~ 완료(머지④ dev 7b0b18e73 뒤, 10-07): SqliteTemporalConverterContributor·LocalDate(Time)AttributeConverter → `mcm-core/archive/main/persistence/`. 코드·yml 호출처 0(문서 언급만), 변환기는 @Converter 가 없어 자동 적용 대상도 아니었다. 확인: mcm-core·mcm:lib·mcm:api·mdm:api·mls:api 컴파일, clone EntitySchemaValidate 1·oracheck 45(건너뜀 2)·mcm/api Notice·MenuCatalog·config 17 통과.
6. Lazy 프록시 검토(조정 지시, 브랜치 feat/ora-mcm-lazy-ds — 머지하지 않고 사용자 결정): 설계 메모 docs/oracle-1007/design-mcm-lazy-ds.md(그 브랜치)와 채팅 LLM 대기 중 연결 수 회귀 시험.

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

## 운영 안내 (ora-base b7 이 운영 배포 문서로 모은다)

- 쿼리 위젯: 운영(prod·wildfly)은 `dmes.widget.query.require-dedicated: true` 로 둔다 — 전용 DataSource 가 없으면 시험·저장·실행을 거절한다(정책 B, 10d9b67de).
- 쿼리 위젯 전용 풀: 로컬(local 프로파일)은 전용 풀이 기본이다(같은 URL·MCMAPUSER, 최대 2·유휴 0·idleTimeout 10초, ③c). 공유 모드(전용 DataSource 없음)는 OASIS 바깥 트랜잭션 연결을 쥔 채 같은 풀에서 연결을 하나 더 받아, 동시 실행이 풀 크기에 닿으면 connectionTimeout 까지 멈춘다. 개발계(dev, WildFly JNDI)는 앱 기본 JNDI 와 다른 위젯 전용 JNDI 풀(가능하면 읽기 전용 계정)을 WildFly 에 만들어 `WIDGET_QUERY_DS_JNDI` 로 붙인다(같은 JNDI 를 가리키면 같은 풀이라 효과가 없다. dsCmn 은 쓰기 계정이고 용도가 섞여 쓰지 않는다 — 조정 10-07).
- 쿼리 위젯 실행기(`dmes.widget.query.datasource.*`)에는 **읽기 권한만 가진 DB 계정**의 전용 DataSource 를 붙이고, 그 계정에는 자율 트랜잭션(`PRAGMA AUTONOMOUS_TRANSACTION`) 함수·프로시저의 EXECUTE 권한과 DB 링크를 주지 않는다 — Oracle 읽기 전용 트랜잭션은 자율 트랜잭션 함수의 쓰기를 막지 못한다(2026-10-07 Oracle 26ai 실측).
- 쿼리 위젯·자동 수집은 읽기 전용 트랜잭션으로 읽으므로, 표를 만들거나 바꾼(DDL) 직후 몇 초 동안 그 표 조회가 ORA-01466 으로 실패할 수 있다(2026-10-07 실측, 잠시 뒤 다시 하면 된다).
- 업무기준 동적 표 `MCAAPUSER.TB_MCA_<RULE_ID>` 는 DBA 가 만들고, 만들 때 MCMAPUSER 에 `SELECT, INSERT, UPDATE, DELETE` 를 GRANT 한다(앱은 DDL 을 보내지 않는다).
- 원장 → 사본 동기화(MCM_SOURCE → MCMAPUSER·MCM_BACKUP)는 동기화 관리 화면이 유일한 경로다(트리거·배치 없음).
- 시퀀스 `SEQ_MCM_MOM_TC_SEND`·`SEQ_MCM_MOM_TC_ERROR` 는 데이터를 옮긴 뒤 MAX(키)+1 로 다시 맞춘다.

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
- `ScreenUsageMssqlDdlTest.dataInitializerUsesDdl`(mcm/api 의 DataInitializer·ScreenUsageSchemaArtifacts 문자열을 읽음) — ora-mcm-app 이 그 DDL 단계를 archive 하므로 c2 에서 archive 하거나 Oracle 기준선 검증으로 바꾼다(삭제 금지, 조정 요청 10-07).
- `SqliteTemporalConverterContributor` 는 지우지 않고 `@Deprecated` 만(mls yml 이 가리킴).

## boolean 칸 (10-07 실측)

- 공통 규약(schema-owners.md §3.1.1)의 `preferred_boolean_jdbc_type=BIT` 는 Hibernate 7.2.12 + Oracle 26ai 에서 NUMBER(1) 칸 validate 를 **통과하지 못한다**(BIT 도 boolean 으로 기대). TINYINT·SMALLINT·INTEGER·NUMERIC 은 통과. **조정 결정: 공통값 TINYINT**(전 레인·ora-base 에 전달됨), 왕복은 c4 에서 확인. scratch SchemaTool 도 TINYINT.
- MCMAPUSER V1 의 boolean 칸은 `sample_notice.active` 하나 → `number(1,0)` + check (0,1)(7e9ceee0d).

## 원장 → 사본 동기화 (운영 단서)

- `csa/commSyncMng/service/CommSyncMngService`(동기화 관리 화면, BPMN `csa/commSyncMng.bpmn` `reg`)가 MASTER 처리유형에서
  `MCM_SOURCE` → 대상 스키마(`MCMAPUSER`·`MCM_BACKUP`)로 `DELETE` 후 `INSERT INTO 대상 SELECT * FROM MCM_SOURCE.표 WHERE MASTER_CODE=?` 를 한다.
  대상이 `MCM_BACKUP` 이면 `TB_MCM_CODE_DETAIL` 은 건너뛴다. 원장 `CODE_VER` 도 올린다.
- 트리거·배치는 코드에 없다. 사람이 화면에서 돌리는 동기화가 유일한 경로다.
- `SELECT *` 복사이므로 사본·백업 표의 열 순서가 원장과 같아야 한다 → V1 에서 원장 정의를 그대로 옮겼다.
- 로컬 적재기(ora-base b5)는 MCM_SOURCE 와 MCMAPUSER 사본 양쪽에 같은 행을 넣어야 코드 선택 팝업이 지금처럼 보인다(SQLite 에서는 한 표였다).

## 후속

- LazyConnectionDataSourceProxy 앱 전역 도입 검토(③c 조정 결정 3): 위젯 채팅 send·reset 은 LLM 응답을 기다리는 동안 OASIS 바깥 txBiz 연결과 NOT_SUPPORTED 범위 EM 연결, 최대 3개를 쥔다. 바깥 연결은 DataSource 층 지연 획득으로만 없앨 수 있다(Hibernate 설정으로는 불가 — OASIS 가 READ_COMMITTED 를 지정). 도입하면 Hikari·JNDI 경로를 모두 감싸고, WidgetReadOnlyJdbc.evict(Hikari 연결 클래스만 내보냄)와 종료 close 위임을 함께 고쳐야 한다.

- mdm·mls 쉬는 연결(③d 조정 지시로 사실만 기록): 두 모듈은 기본 DataSource 를 직접 만들지 않아(HikariDataSource 생성 코드 없음) spring.datasource.hikari.* 가 그대로 먹는다. 다만 local yml 에 minimum-idle 이 없어 Hikari 기본(쉬는 연결 = 최대치)대로 연결을 늘 열어 둔다.

- 시험 하니스 함정(③e 실측): `:mcm-core:test` 와 `:mcm:api:test` 를 한 gradle 실행에 묶으면 두 모듈이 같은 시험 PDB 를 함께 쓰면서 번갈아 돈다. mcm 시험 틀(McmOraTestDb)이 Flyway clean 을 하므로 mcm-core 시험이 ORA-00942 로 깨진다. 모듈마다 따로 돌린다(조정에 보고).

## 다음 단계

- 머지 요청 → 허가 → 메인에서 --no-ff 머지 → 완료 보고 → 워크트리 정리(-d·force 금지) → 정리 보고. 그 뒤 ③b.
- 기준선을 다시 만들 일이 생기면: 엔티티 validate 는 이제 `EntitySchemaValidateOraTest`(clone 하니스)로 본다. 내보내기는 scratch SchemaTool 방식(mcm/api runtimeClasspath + ojdbc11·flyway-database-oracle, OracleDialect, preferred_instant TIMESTAMP·boolean TINYINT) — scratch 가 사라졌으면 다시 만든다.
- 머지②·③ 은 같은 창(mcm-core 엔티티가 mdm 런타임 EMF 에도 들어온다 — 조정 10-07).
