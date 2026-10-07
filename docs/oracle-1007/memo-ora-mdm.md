# ora-mdm 정본 메모

- 레인: ora-mdm / 브랜치 `feat/ora-mdm` / 워크트리 `/Users/jji/project/dmes-wt/ora-mdm` / 조정 세션: dmes-standard-d8
- 지시: ora-mdm-1 (`/Users/jji/.coord/oracle-1007/lanes/ora-mdm/brief.md`)

## 지금 상태 (2026-10-07 밤, 두 번째 compact 뒤 정본)

- **compact 뒤 처리 끝(머지③ 알림 대기):** 임시 워크트리 mdm-sqlite-base 정리(`git worktree remove`, rc=0). 잔재 정리 1~4 커밋 a8152aaf3(샘플 SQL 머리말 → snapshot.py 안내, 파일은 README·be-run.sh·RuleCalcSeedSetTest 가 참조해 그대로 둠; gen_oracle_baseline.py·overrides.json·verify_oracle_baseline.py(gen 을 import) → `src/backend/mdm/archive/oracle-baseline/`, DECISIONS.md·LENGTH-AUDIT.md 는 tools 에 남김; build.gradle·lib/build.gradle·RuleCalcSeedSetTest·playwright.mdm-user.config.ts·dme.user.ts·support.ts 주석). 5번(*SqliteTest 이름)은 안 함. perf 하니스 전환 커밋 4caad53c3(리뷰 sonnet/high 3회 → clean: 도메인 바깥 FK 2개를 적재 동안 끄고 NOVALIDATE 복원, SESSION_USER 검사, allowReset 을 -P 로, extra-base archive 이동 포함). 실행은 아직 안 함.
- (끝남) 다음: 머지③ 알림 → dev 합치기 → mdm 재시험(lib·api 스위트 시간 합 집계) → perf-ora-mdm.md → E2E → 머지② 요청.
- **머지③ 뒤 m5(2026-10-07 밤):** dev 14b09f1af 합침(cb84b651d) → mdm 재시험 lib 2071/2071·api 1853 실패 0·skip 13(스위트 합 6.4초·267.3초) → perf 문서 f4751f034 → E2E → dev 5f84f28da(①d) 합침(32952db05), `:lib:test` MdmErrorsTest clone 확인 rc=0.
- **E2E 결과(L_ORA_MDM, mcm 18100·mdm 18096·포털 5110, 끝나고 서버·포털 내리고 PDB 삭제):**
  - mdm 화면 스펙 22개: **새 PDB(Flyway + 스펙 픽스처, 스냅샷 없음)** 에서 143건 중 142 통과, 남은 1건(dataCsvUploadPop C3 팝업 늦게 열림)은 재실행 4/4 통과(간헐). 서버 ORA 0. 이 스펙들은 SQLite 때도 「새 DB」 전제였다(TSK-05-02 §3.7) — 스냅샷을 먼저 넣으면 샘플 룰 QLTY_GRD_JDG·컬럼 SET_THK 와 픽스처가 ORA-00001 로 부딪힌다.
  - 사용자 여정(mdm-user) 217건: 스냅샷 적재 PDB 에서 1차 27 실패 → 원인 (a) 스냅샷에 옛 로컬 DB 의 E2E 잔여 413행(19표) — scratchpad 사본에서 빼고 `DMES_SNAPSHOT_DIR` 로 적재(필터 규칙은 ora-base 가 snapshot.py import 에 반영 4bee77201), (b) grid-personalize 공통 버튼 `search-settings-menu`·`grid-settings-menu` — support.ts COMMON_ALLOW. 2차: **199 통과·5 실패·13 미실행, Oracle 원인 0(서버 ORA 0)**. 남은 5건: COL-02(스냅샷 사전에 「판정」「값」이 있어 UNKNOWN 토큰이 안 나옴 — 데이터), LAY-07(스냅샷 COIL_THK 도메인 LENGTH 5·SCALE 3, 샘플은 3·1 — 데이터), dme LAY-99·VER-99(ruleEdit 「삭제」 글자 잘림 19>14·그리드 0x0 — 화면), SED-05(ruleSetEdit 새 탭 버튼 set-tab-t1 — 화면 변경). 모두 10-04(새 DB 217/217) 뒤 데이터·화면 변화라 후속으로 넘긴다.
  - mcm 은 조정자 결정 A 로 이번 E2E 동안만 `--spring.datasource.hikari.maximum-pool-size=8`. 위젯 조회(SecWidgetService.search → outsideTx → WidgetFixedTabs.deptName)가 연결 2개를 쥐어 풀 3 에서 교착 — 덤프 `~/.coord/oracle-1007/lanes/ora-mdm/mcm-threads-2139-pool3.txt`, ora-mcm-core 에 넘김.
  - Playwright 1.62.1 은 chromium_headless_shell-1234 가 필요한데 캐시에 1243 만 있었다 → `PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm exec playwright install chromium-headless-shell`.
  - 스펙이 `docs/mdm/tasks/**/screens/*.png` 를 덮어쓴다 — 실행 뒤 `git restore -- docs/mdm/tasks`, 새 파일은 scratchpad 로 옮김(커밋 안 함).
  - E2E 도구(scratchpad/m5): srv.sh·up-wait.sh·down.sh·e2e.sh, 필터 `~/.coord/oracle-1007/lanes/ora-mdm/filter_e2e_snapshot.py`.
- **머지② 직전 마무리(2026-10-07 22시 후반):** 여정 실패 중 데이터 전제 3건과 DOM-05 를 레인 파일에서 고쳤다(c0241eebf·DOM-05 커밋): COL-02 입력 「곰팡솜뭉」, LAY-07/08 숫자 항목 ELGN(NUMBER(3,1)), SED-05 세트 탭 단추(role=tab)만 허용, DOM-05 검색어로 좁힌 뒤 고르기. dev e3943844f(③c 위젯 풀 교착 수정) 합침(e1421da66).
  - **풀 3(덮어쓰기 없음) 로그인·홈 통과:** 새 PDB 에서 mdm-00-fixtures + codeConfirm 7/7(예전 T2 실패 건), mcm 로그 `Connection is not available` 0.
  - **여정 재실행(풀 3, 거른 스냅샷):** dma·dmb·dme 108 통과·5 실패 → DOM-05 고친 뒤 dma 40/40. 2차에서 common·setup·dmc·dmd 는 모두 통과. 남은 실패는 화면 배치 검사 4건(Oracle 무관, m-mdm 화면 결함): dme LAY-99·VER-99·SET-99(ruleEdit 「삭제」 글자 잘림 19>14·ag-root-wrapper 0x0), dmb LAY-99(layoutMng 버전 이력 ag-root-wrapper 0x0 — LAY-07 이 통과하며 새로 드러남).
  - dev(ce378785a..e3943844f)에 mdm 변경 없음 → V1 그대로. perf 하니스(4caad53c3)는 실행하지 않았다.
- **진도율 66%(조정자 기준): m1·m2·길이 검사·m3 완료, m4 코드 전환 완료(실행은 머지③ 뒤), m5 준비 중.** dev 는 머지①c `ce378785a` 까지 합쳤다(ed6e282e9).
- 커밋 흐름: 89685b58a(길이 검사) → 8605df5de(MigrationTest 18개 archive·시험 컴파일) → 9949731c1(픽스처 13개 Oracle) → 601fc9157(mayBeCalled 네이티브) → 4300176b0·18f3b20c9(시험 Oracle 전환) → 0c7802444(엔티티 백틱 칼럼) → 0f9539c67(기반 안전장치·Locale·골든) → 42c8e285f(m4 mdm-e2e.ts·mdm-00-fixtures.spec.ts) → 38d048616(메모).
- **compact 시점에 돌고 있던 것(재개 때 결과부터 확인):**
  - **SQLite 기준 측정 끝(1회, 참고값):** dev ce378785a, lib 2061건 실패 0·스위트 시간 합 6.9초, api 1923건 실패 0·합 153.8초(시험 결과 XML 의 testsuite time 합). gradle 벽시계 29분 43초는 heavy.sh·gradlew 슬롯 대기가 섞여 비교에 못 쓴다. Oracle 쪽 같은 합계는 남기지 못했다(결과 XML 이 다음 실행에 덮임) → 머지③ 뒤 재시험 때 같은 python 집계로 lib·api 스위트 시간 합을 잰다(집계: `test-results/test/*.xml` 의 `time=` 합). 알려진 Oracle 벽시계: api 4분 36초(복제 포함), lib+api 6분 31초. 건수 차이(api 1923 → 1853)는 MigrationTest 등 archive 18개와 @Disabled 때문. 임시 워크트리 정리(`git worktree remove`)는 compact 뒤.
  - (끝남) SQLite 기준 시험 시간 측정(백그라운드 셸): 임시 워크트리 `/private/tmp/claude-501/-Users-jji-project-dmes-wt-ora-mdm/3b5088a0-7068-461e-b17f-6487027d975a/scratchpad/mdm-sqlite-base`(dev ce378785a, detached). 로그 `scratchpad/m3/sqlite-compile.log`·`sqlite-test.log`, 끝 줄에 `test-rc=… elapsed=…s`(백그라운드 출력 `tasks/bojjxfjab.output`). 끝나면 값만 `docs/oracle-1007/perf-ora-mdm.md` 에 「참고값, 반복 측정 아님」으로 적고 `git worktree remove <경로>` 로 정리(--force 금지). Oracle 값: api 4분 36초(1853건, 두 번째 실행), lib 은 첫 실행에 포함(전체 6분 31초).
  - (커밋 4caad53c3) `scripts/perf/mdm-backend/**` Oracle 전환: 바뀐 것: `SourceDb.java` 가 ATTACH 대신 `db-snapshot/MDMAPUSER` CSV 4개를 측정 클래스 안에서 MDMAPUSER 로 적재(snapshot.py 규칙과 같음, 적재 뒤 TERM·DOMAIN·COLUMN IDENTITY 를 최대값 다음으로, PDB 안전 검사), P2·P4 의 백틱·LIMIT·json_array_length·일시 바인딩 수정, `run-measure.sh` 는 mkdir 잠금 제거·heavy.sh 슬롯·`-Pdmes.ora.test=clone`(또는 `MEASURE_ORA_PDB`)·macOS 전용 명령 없음, README §4.1 새 실행 순서. `src/extra-base/**` 는 `src/backend/mdm/archive/perf-mdm-backend-extra-base/` 로 git mv(스테이징됨). 판단: snapshot.py 를 측정 전에 돌리면 MdmSharedTestDb 가 행을 지워 못 쓴다 → 클래스 안 적재. EMBEDDING 은 NULL 이라 2026-10-04 SQLite 값과 같은 조건이 아니다(「Oracle 값끼리만 비교」). Oracle 전환 이전 커밋으로는 돌지 않는다. 검증: javac·`bash -n` 통과, 실행은 안 함. 첫 실행 확인: `run-measure.sh ab all --dry-run`(기준·변경 워크트리 모두 Oracle 이후 커밋). 다음: 리뷰(sonnet/high) → 커밋.
- **m5 잔재 정리(조정자, 정본 feat/ora-base `docs/oracle-1007/b8-residue.md` §9, compact 뒤 처리, 삭제 금지 → archive/ 로 git mv, V1 머리 주석은 그대로):**
  1. `src/backend/mdm/sample/mdm-local-sample.sql` 의 sqlite3 실행 안내 3줄 → Oracle(snapshot import) 안내로 바꾸거나 파일을 archive 로.
  2. `src/backend/mdm/tools/oracle-baseline/gen_oracle_baseline.py`·`overrides.json` → archive(V1 확정). 기준선 `--check` 는 이미 rc=0(dev SQLite 마이그레이션 = archive)이라 옮긴 뒤 머지 직전 재생성 대조는 생략한다.
  3. `src/backend/mdm/build.gradle:47`, `src/backend/mdm/lib/build.gradle:14`, `RuleCalcSeedSetTest:61` 의 「SQLite 시절」 주석 정리.
  4. `src/frontend/playwright.mdm-user.config.ts:12`, `e2e/mdm-user/{dmb,dme}.user.ts`·`support.ts:81`, `e2e/fixtures/mdm-*.sql` 3개, `mdm-user/TEST-CASES.md:18` 의 SQLite·SQLITE_BUSY 주석을 Oracle 기준으로.
  5. `*SqliteTest` 72개 이름 변경은 이번 회차에 하지 않는다(후속).
- **m5 지시(조정자):** perf 기준값은 임시 워크트리에서 한 번만 잰다 → 기준선 `--check`(완료, rc=0, dev SQLite 마이그레이션 = archive) → 머지③ 알림 대기 → dev 합치기 → 바뀐 모듈 재시험 → E2E(아래 「m4 실행 결정」) → 머지 요청(머지②).
- m2: 구현(opus/high) → 리뷰(opus/high, 중간 3·낮음 5) → 지적 수정 커밋 e8181f72e. main 컴파일 rc=0. 리뷰에서 ClassCastException 위험은 clean(네이티브 숫자는 모두 `(Number)`, 일시는 `fromDb`, CLOB 은 `MdmStrings.text`).
- m3 에서 실측할 것(리뷰 인계): ① `SELECT SYS_CONTEXT('USERENV','NLS_SORT') FROM DUAL` — 앱 JVM 이 `-Duser.language=ko -Duser.country=KR` 이라 thin 드라이버가 NLS_SORT 를 KOREAN_M 로 둘 수 있다. BINARY 가 아니면 Hikari `connection-init-sql: ALTER SESSION SET NLS_SORT=BINARY`(WildFly 는 new-connection-sql)로 SQLite 와 같은 정렬을 맞춘다. ② JPQL `UPPER(v.callSetIds) LIKE :p`(@Lob, `RuleSetVersionQueries:70`) 실행. ③ CLOB 4000바이트 초과 네이티브 UPDATE 4곳. ④ validate(엔티티 ↔ V1, TINYINT·TIMESTAMP 설정). ⑤ boolean `REQUIRED` 저장·읽기 왕복. ⑥ `MetaRevisionRecorder` 의 SELECT … UNION ALL INSERT.
- **m3 실측 결과(2026-10-07 20시대, T_ORA_MDM, 13건 중 12 통과):** ① NLS_SORT=BINARY·NLS_COMP=BINARY(JVM ko_KR, NLS_LANGUAGE=KOREAN) → connection-init-sql 불필요. ② JPQL `UPPER(@Lob)` 는 Hibernate 가 거부(FunctionArgumentException) → `RuleSetVersionQueries.mayBeCalled` 를 네이티브 `UPPER(CALL_SET_IDS) LIKE` 로 고침(재확인 대기). ③ CLOB 4000바이트 초과 UPDATE 4곳 통과. ④ validate 통과. ⑤ boolean 왕복 통과. ⑥ UNION ALL INSERT 통과. 시험 명령: `DFLOW_HEAVY_WAIT=1800 heavy.sh ../gradlew -Pdmes.ora.test=clone :api:test --tests …`(EXIT 75 는 슬롯 대기 초과, 재시도 대상).
- **m3 전체 시험(2026-10-07 21시 무렵):** lib 2071/2071, api 1853 중 1852 + 남은 골든 1건 수정 뒤 통과, skip 13(RuleCalcSeedSetTest 등 Oracle 샘플 없음). api 실행 4분 36초. 실패 217건의 원인은 엔티티 백틱 칼럼(`OFFSET`·`LENGTH`·`RESULT`·`ACTION`)을 Spring 이름 전략이 소문자 따옴표("offset")로 내보낸 것이었다(validate 는 대소문자 무시라 통과) → 백틱 제거(0c7802444). 골든 도메인 ID 는 Oracle IDENTITY 가 명시 ID 를 따라가지 않아 시험에서 START WITH 로 맞춤(0f9539c67). 커밋: 4300176b0·18f3b20c9·0c7802444·0f9539c67.
- m4 에 넘길 것(리뷰 인계): `src/frontend/playwright.mdm-user.config.ts:11-12` 가 E2E 전제를 「MdmLocalSampleLoader 가 빈 DB 에 샘플을 넣는다」로 둔다. Oracle 에서는 들어오지 않으니 b5 적재기나 픽스처로 바꾼다. `be-run.sh:114-121` 의 `--mdm.sample.path` 는 받는 빈이 없는 죽은 인자이고 `README.md:96-103` 의 샘플 안내도 낡았다(둘 다 ora-base 소유, 조정자에게 알림).
- Oracle 컨테이너는 17:24 재생성(TZ Asia/Seoul).
- m1 Oracle 기준선 V1: 완료. opus/high 리뷰 지적(높음 1·중간 3·낮음 8) 중 형·생성기 지적을 고치고, 조정자 지시로 FK 자식 인덱스 28개를 더했다(3faff3bb6). 재생성된 컨테이너에서 verify 통과(heavy.sh 경유, 문장 137개, 표 39·컬럼 746·이름 214 일치, 모든 FK 에 자식 인덱스, `L_MDM_MDMAPUSER` 삭제 확인).
- 길이 검사 감사: 완료(`LENGTH-AUDIT.md`, sonnet/medium 조사 agent. 검색 워커는 agy 시간 초과·opencode 제공자 오류로 실패).
- 머지②(mdm)와 ③(mcm 묶음)은 같은 창이 필수가 아니다. 준비된 쪽부터 따로 머지한다(조정자 2026-10-07: m2 에서 MasterCodeJpaAutoConfiguration 을 빼면 mdm 이 mcm-core 표에 기대지 않는다).

### ora-base b0 validate 결과 (정본: feat/ora-base 의 `docs/oracle-1007/spike.md`, 재개 때 반영)

| # | 불일치 | 처리 방침(초안) |
|---|---|---|
| a | `TB_MDM_COLUMN.REQUIRED` V1 `NUMBER(1)` ↔ 엔티티 boolean. Hibernate OracleDialect 는 Oracle 23+ 에서 네이티브 `BOOLEAN` 을 기대한다 | **확정(조정자, 2026-10-07)**: V1 은 `NUMBER(1)` 유지(운영 Oracle 이 23 미만일 수 있다). 앱은 엔티티마다 매핑을 바꾸지 않고 Hibernate 설정 한 곳에서 Oracle boolean 을 NUMBER(1) 로 쓰게 한다(OracleDialect 의 legacy boolean 설정 등, 설치된 Hibernate 버전에서 실제 이름을 확인). m2 에서 적용하고, 다른 레인도 쓰도록 공통 설정으로 ora-base 에 알린다. **설정 이름 확인(2026-10-07)**: Spring Boot 4.0.6 이 관리하는 Hibernate 는 7.2.12.Final 이고, 이 버전의 OracleDialect 에는 Oracle 전용 legacy boolean 설정이 없다(`DialectSpecificSettings` 의 oracle 키는 is_autonomous·use_binary_floats·extended_string_size·oson_format_disabled·application_continuity 뿐). 범용 `hibernate.type.preferred_boolean_jdbc_type=TINYINT` 를 쓴다(조정자 공통 규약 변경: 처음 정한 BIT 는 Hibernate 7.2.12 가 DB 23 이상에서 BOOLEAN 으로 매핑해 NUMBER(1) validate 가 실패한다는 ora-mcm-core 실측으로 바뀌었다). m3 에서 저장·읽기 왕복을 확인한다 |
| b | CLOB 칸(b0 시점 14칸, 지금 21칸)인데 엔티티 String·`@Lob` 없음 | m2 사전 조사 7번: 엔티티 필드에 `@Lob` |
| c | `TB_MDM_DATA_CATE`·`DATA_CATE_ITEM`·`DATA_ITEM`.VALID_FROM V1 TIMESTAMP ↔ 엔티티 String 으로 인식 | `MdmLocalDateTimeIdUserType` 이 문자 형으로 보고되는 탓으로 보인다. m2 사전 조사 4번(UserType 을 archive 로 옮기고 기본 LocalDateTime 매핑)으로 풀린다 |
| d | CHG_SEQ V1 `NUMBER(10)` ↔ Long | b0 는 리뷰 전 V1 을 썼다. 23bb68a51 에서 `NUMBER(19)` 로 고쳤다. 재개 때 다시 확인 |
| e | `TB_MDM_TERM.DEFINITION` 엔티티 `nullable = false` ↔ V1 NULL 허용 | m2 에서 엔티티를 nullable 로 바꾸고, 읽는 쪽 null 처리를 확인한다(m2 사전 조사 8번) |
| f | `TB_SEC_CODE_GROUP`·`TB_SEC_CODE_ITEM` 표 없음 — mcm-core 엔티티가 mdm EMF 에 들어온다 | **확인(2026-10-07)**: 표 주인은 mcm-core(MCMAPUSER). mdm 은 이 표를 쓰지 않는다. mdm 코드에 SecCode·`MasterCodeProvider`·`MasterCodeDecoder` 참조가 없고, m-mdm 화면은 `/lov/master` 를 부르지 않는다. mdm `@EntityScan` 은 이미 `com.dongkuk.dmes.mdm` 뿐이며, 엔티티(`MasterCodeGroupEntity`·`MasterCodeItemEntity`)는 cactus-core 자동 구성 `MasterCodeJpaAutoConfiguration` 으로만 들어온다. 이 표에 기대는 빈(`cactusDefaultMasterCodeProvider`·MyBatis `MasterCodeDecoder`)은 모두 `@ConditionalOnBean(MasterCodeItemRepository)` 이고, `LovController` 는 `ObjectProvider` 로 받는다. **m2 방안(기본안)**: mdm `application.yml` 의 `spring.autoconfigure.exclude` 에 `com.dongkuk.dmes.cactus.mastercode.MasterCodeJpaAutoConfiguration` 을 넣는다. MDMAPUSER 에 사본을 만들지 않는다. mdm 은 `@EnableJpaRepositories` 를 이미 직접 선언하므로 저장소 자동 구성이 물러나는 문제도 없다 |
  - 생성기 `src/backend/mdm/tools/oracle-baseline/gen_oracle_baseline.py`(표준 라이브러리만, `--check` 로 재생성 대조)
  - 보정 패치 `overrides.json`(CLOB·NULL 허용·BOOLEAN·업무 일시·JSON CHECK), 결정표 `DECISIONS.md`(자동 생성)
  - 결과 `src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle/V1__baseline.sql`(표 39·인덱스 12+FK 자식 인덱스 28·FK 52·초기 행 7)
  - 검증 `verify_oracle_baseline.py`: FREEPDB1 안 `L_MDM_MDMAPUSER` 에 적용 → SQLite 최종 스키마와 표·컬럼·NULL·제약·인덱스 이름 대조 → 부분 UNIQUE·JSON CHECK·IDENTITY·CASCADE·일시 기본값 점검 → 사용자 삭제.

## 결정

- **Oracle 오류 보고 규칙(조정자 2026-10-07, 사용자 지시):** 시험·접속 실패·시간 초과가 나면 다시 돌리기 전에 `podman machine ssh -- 'free -m; cat /proc/loadavg'` 를 한 번 재고, 보고에 오류 번호와 available MB·load 를 함께 적는다. available 150MB 미만, load 10 이상, ORA-04031·04030·00020·00018·12516·12519·12520·3136·609·12751·00800·01092·00822, JDBC 접속·읽기 시간 초과면 재실행하지 말고 「VM 의심」 으로 조정자에게 보고한다. ORA-00942·00904·00001·01400·12899·00933 같은 SQL·제약 오류는 레인이 고친다. Oracle 실행은 레인 세션 하나만 하고, agent 에게 Oracle 실행을 맡길 때는 이 규칙을 지시에 넣는다.

- 시각은 **KST 통일**(조정자 2026-10-07 저녁, 앞서 정한 UTC 결정은 철회). 감사 `C_AT`·`U_AT` 는 `TIMESTAMP(6)` 에 KST 로 저장한다. 앱 설정은 `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP` 만 둔다(m2, mdm yml). `hibernate.jdbc.time_zone` 은 넣지 않는다(JVM Asia/Seoul). Oracle 컨테이너 OS 시간대도 Asia/Seoul 이다.
- 업무 일시 TEXT(`APPLY_FROM`·`APPLY_TO`·`VALID_FROM`·`VALID_TO`·`*_AT`) → `TIMESTAMP(6)`. 열린 끝 기본값 `TIMESTAMP '9999-12-31 00:00:00'`.
- `TEXT` → `VARCHAR2(4000 BYTE)`, 4000바이트를 넘을 수 있는 21개만 `CLOB`(목록·근거는 overrides.json): JSON·요청 원문 15개 + 리뷰 지적으로 더한 COLUMN.DESCRIPTION·USAGE_NOTE(HTML, 코드 상한 20,000자), RULE.DESCRIPTION·USAGE_NOTE(길이 검사 없음), RULE_SET_VER.RULE_IDS·CALL_SET_IDS(노드 200개면 약 10KB).
- JSON CHECK 는 `IS JSON STRICT`. 실측 8사례(스칼라·작은따옴표·따옴표 없는 키·끝 쉼표)에서 SQLite `json_valid` 와 판정이 같다.
- `CHG_SEQ`·`LAST_CHG_SEQ` 는 엔티티 long 이라 `NUMBER(19)`, 그 밖 INTEGER 는 `NUMBER(10)`(IDENTITY 를 가리키는 FK 자식은 `NUMBER(19)`).
- 감수: 4000바이트 상한 검사가 없는 VARCHAR2 JSON 칸(DOMAIN.EXAMPLES, RULE_VAR.PRIO_LIST, TERM.SYNONYMS·ALIASES·SYSTEMS, COLUMN.TERM_IDS 등)은 지금 데이터가 모두 1,000바이트 미만이라 VARCHAR2 로 둔다. 넘치면 ORA-12899 로 저장이 실패한다.
- 업무 일시 초 절삭: `TIMESTAMP(6)` 이라 소수 초가 들어가면 PK(VALID_FROM)·선분 이음이 어긋난다. m2 에서 SQLite 변환기를 지울 때 엔티티 세터·`MdmTemporalBinder` 의 초 절삭은 반드시 남긴다.
- `TB_MDM_TERM.DEFINITION` NOT NULL 해제(빈 문자열 6,159행).
- AUTOINCREMENT 8개 → `NUMBER(19) GENERATED BY DEFAULT ON NULL AS IDENTITY`.
- 부분 UNIQUE 인덱스 3개 → `CASE WHEN` 함수 기반 인덱스, `IX_TB_MDM_TERM_ABBR` → 일반 인덱스. FK 가 가리키는 고유 인덱스 2개(`UX_TB_MDM_COLUMN_PHYS_NAME`·`UX_TB_MDM_LAYOUT_HEADER_HDR`) → 같은 이름 UNIQUE 제약.
- sqlite 폴더 archive 이동은 m2 컷오버 커밋에서 한다(m1 에서 옮기면 local 프로파일·MigrationTest 가 m2 전까지 깨진다). 생성기는 archive 경로(`src/backend/mdm/archive/db-migration-sqlite`)도 입력으로 찾는다.
- mdm 에는 결번 대장(`KNOWN_GAP_LEDGER`)·migration README 가 없다(git grep 근거). 결번 V5~V7·V19 는 Oracle V1 하나로 흡수되어 정리할 것이 없다.

## b5(적재기)에 넘길 것

- 초기 행 7개(TB_MDM_SYSTEM 6, TB_MDM_DICT_SEQ 1)는 V1 이 넣는다. 적재기는 이 행을 건너뛰거나 MERGE 해야 PK 충돌이 없다.
- IDENTITY 8개(TERM·DOMAIN·COLUMN·LAYOUT·META_REV·CODE_RECV·DATA_RECV·RULE_RECV): 적재 뒤 `ALTER TABLE t MODIFY (id GENERATED BY DEFAULT ON NULL AS IDENTITY (START WITH LIMIT VALUE))`.
- TIMESTAMP 로 바뀐 업무 일시: 원본은 `'YYYY-MM-DD HH24:MI:SS'` 문자열. 감사 `C_AT`·`U_AT` 는 epoch 밀리초(UTC 기준 수)와 KST 문자열이 섞여 있다. 적재 때 둘 다 KST 로 맞춘다(시각 KST 통일).
- CLOB 21개·NULL 허용으로 바꾼 1개는 DECISIONS.md 참조.

## 후속(기준선 밖)

- (해결) FK 자식 컬럼 인덱스는 조정자 지시로 V2 로 미루지 않고 V1 에 넣었다(3faff3bb6, 28개).

## m2 사전 조사 (2026-10-07, 검색 워커 + grep 확인)

경로 약어 `L/` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/`, `R/` = `src/backend/mdm/api/src/main/resources/`.

| # | 대상 | 지금 | 바꿀 설계 |
|---|---|---|---|
| 1 | 방언 이음매 `L/contract/common/MdmDialect`·`MdmDialectResolver`·`L/common/support/DefaultMdmDialectResolver` | `SQLITE` 하나, 그 밖 DB 는 기동 예외(`:36`) | Oracle 하나라 이음매 자체를 걷는다. 세 파일은 `src/backend/mdm/archive/` 로 git mv, 쓰는 두 곳(아래 2·3)은 분기 없이 Oracle 문장만 |
| 2 | `L/common/support/MdmTemporalBinder`(14개 클래스·45곳에서 `toDb`/`fromDb`) | LocalDateTime ↔ `'yyyy-MM-dd HH:mm:ss'` 문자 | 공개 API 는 그대로 두고 구현만: `toDb` = 초 절삭한 `LocalDateTime`(TIMESTAMP 바인딩), `fromDb` = `Timestamp`/`LocalDateTime` 을 읽는다. 초 절삭은 반드시 유지(PK VALID_FROM). `SQLITE_TEXT_PATTERN` 을 화면 형식으로 쓰는 `DataCsvUploadPopService:38`·`DataItemRows:16` 은 이름만 중립으로(`TEXT_PATTERN`) |
| 3 | `L/common/rule/DefaultMdmRuleIdIssuer:65` | `UPDATE … RETURNING`(SQLite 3.35+) | 같은 트랜잭션에서 `UPDATE … SET c = c + 1` 뒤 `SELECT c`(갱신한 행은 잠겨 있어 동시성 같음) |
| 4 | `L/common/support/MdmSqliteLocalDateTimeConverter`·`MdmSqliteTemporalContributor`, `L/persistence/MdmLocalDateTimeIdUserType`(DataCate·DataItem·DataCateItem 의 `@Id` VALID_FROM) | SQLite 문자 일시 변환 | archive 로 옮기고 Hibernate 기본 LocalDateTime 매핑을 쓴다. 엔티티 세터의 초 절삭은 남긴다 |
| 5 | `L/dme/ruleSetEdit/service/RuleSetTestCaseService:148` | 오류 문구 `SQLITE_CONSTRAINT_PRIMARYKEY` 로 PK 충돌 판정 | `ORA-00001` + 제약 이름 `PK_TB_MDM_RULE_SET_TEST_CASE` 로 판정 |
| 6 | 대소문자 LIKE: `L/dmd/dataMng/service/DataMngService:85`, `L/dmd/dataItemMng/service/DataItemListQuery:118`, `L/common/mastercode/MasterCodeRemoval:80`(`LIKE '%MASTER%'`) | SQLite LIKE 는 ASCII 대소문자 무시 | 동작 보존: 양쪽 `UPPER(…)`. 나머지 LIKE 는 이미 `UPPER`·`lower` |
| 7 | CLOB 21칸 | TEXT | 엔티티 필드에 `@Lob`(또는 `@JdbcTypeCode(SqlTypes.CLOB)`). 네이티브로 CLOB 을 읽어 `(String)` 으로 바꾸는 곳은 `Clob` 이 돌아와 깨질 수 있다: `L/dme/ruleConfirm/service/RuleConfirmService:366`(CELLS 값 맵), `L/common/mastercode/MasterCodeRemoval:38-42`(STD_AST·BIZ_AST·VAR_AST·GRP_COND_AST·CELLS 동적 SQL) 부터 확인. JPQL `callSetIds LIKE`(`RuleSetVersionQueries:69`)는 CLOB 에서도 동작 |
| 8 | `TB_MDM_TERM.DEFINITION` NULL 허용 | `''` 6,159행 | 읽는 쪽이 null 을 `""` 와 같게 다루는지 확인(`getDefinition()` 사용처) |
| 9 | `R/application-local.yml` | sqlite URL·`org.sqlite.JDBC`·`foreign_keys`·SQLiteDialect·Contributor·`db/migration/mdm/sqlite` | Oracle 접속값은 ora-base b3 연결 규약(env)·Hikari 3, 방언 자동 판정, Flyway `db/migration/mdm/oracle`, `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP`(`hibernate.jdbc.time_zone` 은 두지 않는다, KST 통일), `spring.autoconfigure.exclude` 에 `MasterCodeJpaAutoConfiguration`(표 f) |
| 10 | `R/application-wildfly.yml` | JNDI `${JNDI_DS_BIZ:java:/jdbc/mdm/dsBiz}`(이미 중립), Flyway 끔 | `preferred_instant_jdbc_type=TIMESTAMP` 와 `MasterCodeJpaAutoConfiguration` 제외만 더한다(공통 application.yml 에 두면 한 번으로 된다) |
| 11 | `R/db/migration/mdm/sqlite/` 19파일 | Flyway 원천 | `src/backend/mdm/archive/db-migration-sqlite/` 로 git mv(생성기는 이 경로도 찾는다) |
| 12 | 엔티티 백틱 컬럼(`MdmDataRecv` RESULT, `MdmDataRecvItem` ACTION, `MdmLayoutItem` OFFSET·LENGTH) | Hibernate 따옴표 | Oracle 예약어 아님. 대문자라 그대로 둔다 |
| 13 | `@Query(nativeQuery=true)` | 없음(JPQL 4건). 네이티브는 `createNativeQuery` 19파일 39건, SQLite 전용 문법은 3번 한 곳 | `CAST(x AS VARCHAR(40))`(`MasterCodeLedgerQueries:219`) 등은 Oracle 에서도 된다. 실제 실행은 m3 시험으로 확인 |
| 14 | 의존성 `sqlite-jdbc`·`hibernate-community-dialects` | mdm `lib/build.gradle` | ora-base 머지① 뒤 이 레인이 뺀다(그 전에는 ora-base 소유) |

길이 검사(ORA-12899) 대상 목록은 검색 워커 결과를 받아 이 절에 더한다(조정자 ①: 앱이 4000바이트·n자를 넘는 값을 받을 수 있는 칸은 m2 에서 저장 전 사용자 오류 메시지로 막는다).

## ora-base 에서 받은 것 (2026-10-07)

- 공통 Hibernate 기본값의 정본은 feat/ora-base `docs/oracle-1007/schema-owners.md` §3.1.1 이다(머지① 뒤 dev). 값은 `hibernate.type.preferred_boolean_jdbc_type=TINYINT`(처음 BIT 였다가 바뀜), `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP` 이고 `hibernate.jdbc.time_zone` 은 넣지 않는다. 각 앱이 자기 yml 에 같은 값을 둔다.
- 컨테이너 TZ 는 Asia/Seoul 이다. DBTIMEZONE 은 +00:00 이지만 TIMESTAMP WITH LOCAL TIME ZONE 을 쓰지 않으므로 영향이 없다.
- 시험 PDB 하니스는 `-Pdmes.ora.test=clone` 으로 동작이 확인되었다. 머지① 뒤 m3 에서 쓴다.
- m2 의 validate 결과는 조정자와 ora-base 둘 다에 알린다.

## m2 결과 (2026-10-07, main 컴파일 통과)

- 커밋: ed9c28be2(컷오버) · 28b450555(PK 충돌 ORA-00001) · caa76b256(LIKE UPPER) · 4bd19647c(CLOB @Lob·Clob 읽기) · 36e4b757a(TERM.DEFINITION NULL) · 454edcb7a(메타 기록 INSERT 문법) · 72c7ea71d(주석).
- archive 로 옮긴 main 클래스(`src/backend/mdm/archive/java/…`): `MdmDialect`·`MdmDialectResolver`·`DefaultMdmDialectResolver`·`MdmSqliteLocalDateTimeConverter`·`MdmSqliteTemporalContributor`·`MdmLocalDateTimeIdUserType`·`MdmLocalSampleLoader`(샘플 SQL 이 SQLite 문법 `INSERT OR IGNORE` 라 Oracle 에서 기동을 깨뜨린다. 로컬 데이터는 b5 적재기 몫). SQLite 마이그레이션 → `archive/db-migration-sqlite`(`gen_oracle_baseline.py --check` rc=0).
- `MdmTemporalBinder` 는 생성자 인자가 없어졌다(`new MdmTemporalBinder()`). 상수 `SQLITE_TEXT_PATTERN` → `TEXT_PATTERN`.
- 엔티티 업무 일시는 생성자·세터·`@IdClass` 생성자에서 초 절삭(`entity/MdmEntityTimes`).
- 추가로 고친 것: `MetaRevisionRecorder` 의 여러 행 `VALUES (…),(…)`(Oracle 23+ 전용) → `INSERT … SELECT … FROM DUAL UNION ALL`. `RuleSetVersionQueries.mayBeCalled` 의 CLOB LIKE 에도 UPPER.
- m3 에 넘길 것(시험 컴파일 깨짐): lib `MdmSqliteLocalDateTimeConverterTest`·`MdmTemporalBinderTest`·`VersionRowStoreNameGuardTest`(생성자)·`CommonContractTest:152`(MdmDialect), api `MdmBusinessRuleEntityJpaRoundtripTest:9,441`·`VersionStateServiceSqliteTest`·`MdmLocalSampleLoaderTest`·`MdmLocalSampleStrictTest`·`CodeDataRuleLedgerChainTest:70`(SQLITE_TEXT_PATTERN). 루트 `mdm/build.gradle` 의 시험 Hikari 2 주석도 SQLite 기준이다. 컴파일은 되지만 문자열로 SQLite 를 가리키는 시험이 49개 파일이다(`jdbc:sqlite`·`org.sqlite`·`db/migration/mdm/sqlite`·옮긴 클래스 이름, 공용 `common/testdb/MdmSharedTestDb` 포함). lib 의존성에서 sqlite-jdbc 를 뺐으므로 이 시험들은 실행 단계에서 모두 실패한다.
- m3 에서 큰 값으로 확인할 것: 네이티브 UPDATE 가 4000바이트를 넘는 문자열을 CLOB 칸에 바인딩하는 곳(`LayoutVersionStore:91` SNAPSHOT_JSON 실측 5,896바이트, `RuleSetWrites:37`, `RuleTestCaseWrites:40`, `RuleSetTestCaseWrites:40`). validate(엔티티 ↔ V1)도 m3 에서 돈다.
- 확인 못 한 위험(실행은 m3): Oracle 은 `''` 를 NULL 로 저장하므로 NOT NULL VARCHAR2 칸에 빈 문자열을 쓰는 경로가 있으면 ORA-01400 이 난다. 길이 검사(ORA-12899)는 다음 커밋.
- 리뷰 지적 수정(e8181f72e): LIKE 이스케이프에서 `[` 제거(Oracle ORA-01424, `DataItemListQuery`·`MasterCodeLedgerQueries`), 물리명 IN 목록 묶음 나누기(ORA-01795, `LayoutDictionary.byPhysNames·views`·`DomainImpactQueries.columnNamesByPhysName`), 마스터 코드 참조 거부 문구의 VER 키를 끝 0 없이(`MasterCodeRemoval`), `VersionRowStore` CAST 주석. boolean 설정은 공통 규약 변경대로 TINYINT(3cf8c3882).

## 남은 순서

1. (완료) dev `fb253556d` 합침(e279b4323, mdm 변경 없음) → 길이 검사 89685b58a(구현 sonnet/high ×2 → 리뷰 opus/high 8건 → 수정 → 재리뷰 clean, main 컴파일 rc=0). 남긴 것: 확정 보고서 1행 화면 제목 `src/frontend/m-mdm/pages/dmc/codeConfirm/checks.ts:22`("코드값에 콤마·공백이 없다")이 길이 이슈를 포함하지 않는다(레인 소유 밖, 조정자에 알림). 룰 서비스·HeaderMng·ColumnMng 길이 시험은 m3(통합 시험 하니스) 뒤에 더한다.
2. (완료, 위 「m3 전체 시험」) m3 시험 하니스 전환: 깨진 시험 컴파일 9파일·SQLite 문자열 49파일을 `-Pdmes.ora.test=clone` 하니스로. `*MigrationTest` 약 15개는 Oracle 기준선 검증 하나로 대체(파일은 archive, 삭제는 사용자 승인 대기). 위 「m3 에서 실측할 것」 6가지.
3. m4 사전 조사(2026-10-07, haiku 조사 + 바로잡음): `mdm-e2e.ts:40-59` 가 env `SMOKE_MDM_DB` 파일에 `sqlite3` CLI(`.timeout`·`BEGIN IMMEDIATE`)로 픽스처를 넣는다. 픽스처 13개(989줄)의 SQLite 문법: `INSERT OR IGNORE`(columnMng-dict·dataItem·dataMng·layout-m201·rbac-users), `WITH RECURSIVE`(codeCateEdit, Oracle 은 RECURSIVE 키워드 없이 재귀 WITH 또는 CONNECT BY), `CREATE TEMP TABLE`(ruleEdit-data·ruleSet-data), `CURRENT_TIMESTAMP`·`IFNULL`, CLI 메타명령 `.mode`·`.separator`(rbac-seed-check). `||` 는 Oracle 도 된다. rbac-users·ruleEdit-users·rbac-seed-check 는 MCM 표 대상(MCMAPUSER 접속). `playwright.mdm-user.config.ts` 는 `workers: 1`(SQLITE_BUSY) 과 샘플 로더 전제(dme 여정 RO-01 의 `WID_CHK` 룰, dmb 의 샘플 컬럼·EAI GLUE)를 둔다. `scripts/perf/mdm-backend/run-measure.sh`·`SourceDb.java` 는 SQLite 사본 ATTACH. node `oracledb` 는 src/frontend 에 없다 → 조정자 질문(기본안: ora-base 가 devDependency·env 규약을 정함).
   **m4 실행 결정(조정자 2026-10-07):** 샘플은 SQL 재작성 없이 스냅샷 직접 적재. 순서: 시험 PDB 복제(TPL_EMPTY) → mcm·mdm 서버를 그 PDB 로 대체 포트(18100·18096·5110)에 띄워 Flyway 로 각 스키마 V1 → `scripts/db-snapshot/snapshot.py import` 로 MDMAPUSER·MCMAPUSER CSV 적재 → 여정 픽스처(`mdm-rbac-users.sql`·`mdm-ruleEdit-users.sql` 은 넣는 스펙이 없어 `e2e/mdm-00-fixtures.spec.ts` 같은 한 줄 스펙 제안) → E2E. TPL_DATA 가 생기면 복제로 바꾼다. Oracle 로 뜨는 mcm 은 머지③ 뒤라 실제 E2E 실행은 머지③ → dev 합친 뒤. mdm-e2e.ts 는 oracle.ts 로 바꿨다(guardTarget: T_* 또는 `DMES_E2E_ALLOW_PDB` 로 허용한 L_* 만). `@types/oracledb` 없음·PDB 이름 검사 공용화는 ora-base 에 전달됨.
4. m4 E2E 지원 전환(`e2e/support/mdm-e2e.ts`·`fixtures/mdm-*.sql`·`e2e/mdm-user/**`·`scripts/perf/mdm-backend/**` 를 node-oracledb thin 으로, 샘플 적재 전제 교체).
5. m5 mdm 전체 시험(heavy.sh, 약 2,734개)·mdm E2E 통과, 시험 시간 비교 `docs/oracle-1007/perf-ora-mdm.md`(반복 측정), 머지 직전 dev 최신 합치고 `gen_oracle_baseline.py` 재생성·`--check` 대조(notice-fill2 의 새 SQLite 마이그레이션 반영) → 머지 요청(머지②, b5 뒤. 머지③ 과 같은 창 필수 아님).
