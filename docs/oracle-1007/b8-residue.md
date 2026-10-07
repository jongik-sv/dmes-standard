# b8 잔재 목록 (oracle-1007, ora-base, 2026-10-07)

저장소에 남은 SQLite·MSSQL·H2 잔재를 찾은 목록이다. **고치지 않았고 목록만 있다.** 검색은 검색 워커 3개(코드·빌드·설정 / 마이그레이션·리소스 / 스크립트·스킬·문서)가 했고, 개수와 대표 파일은 ora-base 가 직접 세어 확인했다(확인한 항목은 「확인」, 워커 보고만 있는 항목은 「보고」로 적는다).

기준은 `feat/ora-base` @ dev 최신(머지①b 뒤)이다. 각 레인 브랜치에서 이미 지운 것은 이 목록에 남아 있을 수 있으니, **b8 착수 때(ora-platform 머지 뒤) 같은 검색을 다시 돌려 이 표와 대조한다.**

처리 구분
- **archive**: `archive/` 로 `git mv`(삭제 아님, 사용자 승인 전까지). 최종 삭제는 승인 목록에 올릴 후보다.
- **수정**: 파일은 남기고 내용을 Oracle 기준으로 고친다.
- **유지**: 건드리지 않는다(이유를 적는다).
- 「레인」은 코드·설정을 가진 레인이다. 그 레인이 자기 머지에서 처리하면 b8 에서는 확인만 한다.

## 1. 빌드·카탈로그 (ora-base 소유)

| 파일 | 레인 | 내용 | 머지 뒤 처리 |
|---|---|---|---|
| `src/backend/gradle/libs.versions.toml:81` | ora-base | `sqlite-jdbc` 3.45.3.0 | 모든 모듈의 sqlite 의존이 빠진 뒤 항목 삭제(수정). 마지막에 한다 |
| `src/backend/gradle/libs.versions.toml:77-78` | ora-base | `hibernate-community-dialects`(SQLiteDialect 용) | 위와 같은 조건으로 수정 |
| `src/backend/gradle/libs.versions.toml` | ora-base | `mssql-jdbc`·`h2` 항목 | 사용처(caravan-hub·oasis-core·mcm-core 시험)가 빠진 뒤 수정 |
| `src/backend/analog/gradle/libs.versions.toml:5` | ora-base | `sqlite-jdbc` 3.47.2.0 | 확인함: analog 의 java·yml·build.gradle 어디에도 SQLite 를 여는 코드가 없고 이 카탈로그 줄만 남았다(`build.gradle:70` 의 `../data SQLite` 는 주석). analog 는 DB 를 쓰지 않는 별도 빌드라 **이번 회차 범위 밖으로 남긴다**(안 쓰는 카탈로그 줄이라 나중에 정리 가능) |
| `src/backend/*/build.gradle`(sqlite-jdbc `runtimeOnly`) | 각 모듈 레인 | 모듈 api·lib 의 sqlite 런타임 의존 | 각 레인이 자기 모듈에서 제거(확인만) |
| `src/backend/caravan-hub/build.gradle:90` | ora-platform | `providedRuntime libs.mssql.jdbc` | ora-platform 이 Oracle 로 교체(확인) |
| `src/backend/oasis/oasis-core/build.gradle` | ora-platform | H2 시험 의존 | ora-platform 이 Oracle 시험으로 전환(확인) |

## 2. 코드·설정 (모듈 코드는 레인 소관, b8 은 확인만)

| 파일 | 레인 | 내용 | 머지 뒤 처리 |
|---|---|---|---|
| `src/backend/mdm/api/src/main/resources/application-local.yml` | ora-mdm | `jdbc:sqlite:../data/mdm.db`·SQLiteDialect·`MdmSqliteTemporalContributor`·flyway `db/migration/mdm/sqlite` | ora-mdm 이 Oracle 로 교체(확인) |
| `src/backend/mdm/lib/.../common/support/MdmSqliteTemporalContributor.java`, `MdmSqliteLocalDateTimeConverter.java` | ora-mdm | SQLite 일시 텍스트 변환 | archive(코드, ora-mdm) |
| `src/backend/mdm/lib/.../common/support/MdmTemporalBinder.java:25-43` | ora-mdm | `SQLITE_TEXT_PATTERN` | 수정(ora-mdm) |
| `src/backend/mdm/lib/.../common/support/DefaultMdmDialectResolver.java:27-38` | ora-mdm | "SQLite" 만 지원하고 Oracle 이면 기동 실패 | 수정(ora-mdm). 이 파일 때문에 mdm 이 Oracle 로 못 뜬다(b5 검증 때 확인) |
| `src/backend/mcm-core/.../common/persistence/SqliteTemporalConverterContributor.java` | ora-mcm-core | mls yml 이 이 클래스를 가리킨다 | **ora-platform 머지 뒤에** archive(코드). 메모의 b8 항목 |
| `src/backend/mcm-core/.../common/audit/McmSqliteMybatisInterceptor.java` | ora-mcm-core | SQLite 용 MyBatis 치환 | archive(ora-mcm-core), 사용처 확인 필요 |
| `src/backend/mcm/api/.../config/CactusSqliteIfNotExistsDialect.java` | ora-mcm-app | SQLiteDialect 확장 | archive(ora-mcm-app) |
| `src/backend/mcm/api/.../init/seed/SchemaArtifactsSqlite.java`, `SchemaArtifactsMssql.java` | ora-mcm-app | Java DDL 단계(Flyway 로 대체) | archive(ora-mcm-app). `SchemaArtifactsMssql` 의 보정 로직은 snapshot convert 로 옮겼다(`c5b8d2142`) |
| `src/backend/mcm/api/.../McmApplication.java:63,83-87` | ora-mcm-app | `LocalSqliteDataSource.configure()` 호출 | 수정(ora-mcm-app) |
| `src/backend/mcm/api/src/main/resources/application-local.yml` | ora-mcm-app | `jdbc:sqlite`·SQLiteDialect·caravan-if.db·caravan-console.db | 수정(ora-mcm-app) |
| `src/backend/mcm/api/src/main/resources/application-local-db.yml` | ora-mcm-app | `jdbc:sqlserver` 설정 | **처리됨**: ora-mcm-app a3(666812393)에서 `src/backend/mcm/archive/api/…/application-local-db.yml` 로 archive 했다(머지 뒤 이 줄은 확인만) |
| `src/backend/mcm/api/src/main/resources/application-wildfly.yml` | ora-mcm-app | JNDI 이름이 `java:/jdbc/mssql/mcm/*` | 중립 이름 `java:/jdbc/<모듈>/dsBiz` 로 수정(ora-mcm-app, README §0.1) |
| `src/backend/mcm/lib/.../security/service/SqliteBusyRetry.java` | ora-mcm-app | SQLITE_BUSY 재시도 | archive(ora-mcm-app) |
| `src/backend/cactus-core/.../local/LocalSqliteDataSource.java` | ora-platform | 로컬 SQLite 데이터소스 | archive(ora-platform) |
| `src/backend/cactus-core/.../datasource/DialectDetector.java:28-30` | ora-platform | `jdbc:sqlite` 면 dialect `sqlite` | 수정(ora-platform) |
| `src/backend/cactus-core/.../oasis/converter/SqliteColumnConverter.java` | ora-platform | SQLite 컬럼 변환 | archive(ora-platform) |
| `src/backend/{mls,mqc,mpn,mpp}/api/src/main/resources/application.yml` | ora-platform | `jdbc:sqlite`·SQLiteDialect(mls 는 `SqliteTemporalConverterContributor` 도) | 수정(ora-platform) |
| `src/backend/caravan-hub/src/main/resources/application-local*.yml`, `application.yml`, `application-wildfly.yml` | ora-platform | 듀얼 sqlite 데이터소스·`kp`·`ph`·mssql | 수정(ora-platform) |

## 3. 마이그레이션·리소스

| 파일 | 레인 | 내용 | 머지 뒤 처리 |
|---|---|---|---|
| `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/`(확인: V 파일 19개) | ora-mdm | SQLite 마이그레이션 | archive(ora-mdm). 새 기준선은 `db/migration/oracle/mdmapuser/V1` |
| `src/backend/mcm-core/src/main/resources/db/migration/sqlite/`(확인: 16개) | ora-mcm-core | SQLite 마이그레이션 V1~V18 | ora-mcm-core 가 `archive/db-migration/sqlite/` 로 옮긴다(이미 브랜치에 있음) |
| `src/backend/mcm/api/src/main/resources/db/migration/mcm/V1__init_sample_notice.sql` | ora-mcm-app | `sample_notice` 샘플 표(SQLite `AUTOINCREMENT`) | **처리됨**: ora-mcm-app 이 `src/backend/mcm/archive/api/…/V1__init_sample_notice.sql` 로 archive 했다 |
| `src/backend/mcm-core/src/main/resources/db/migration/mcm-core/V1__init_sample_master_code.sql` | ora-mcm-core | `sample_master_code` 템플릿 자리표시 표(16줄, 방언 안내 주석 포함). 위 notice 샘플과 **내용이 다른 별개 파일**이다(중복 아님). 엔티티 `SampleMasterCode` 가 이 표를 가리킨다 | ora-mcm-core 가 Oracle 기준선(`oracle/*/V1`)에 이 표가 필요한지 정한다. 불필요하면 엔티티와 함께 archive 후보 |
| `src/backend/mdm/sample/mdm-local-sample.sql` | ora-mdm | `MdmLocalSampleLoader` 가 읽던 샘플. be-run 은 이미 인자를 뺐다 | archive(ora-mdm, 로더 제거와 함께) |
| `src/backend/mcm/sample/widget-rule-calc-defs.sql` | ora-mcm-app | 조업 계산기 위젯 정의 5건을 SQLite(`mcm.db`)에 넣는 로컬 확인용 SQL | 확인함: 같은 5건(M47C0001·0005·0006·0014·0025)이 `db-snapshot/MCMAPUSER/TB_MCM_WIDGET_DEF.csv` 에 이미 들어 있다 → **archive**. `docs/guide/FrontEnd/Widget-Authoring-Guide.md:505` 가 이 파일을 예시로 가리키므로 그 문장도 CSV 기준으로 수정(ora-mcm-core 소관) |
| `db-snapshot/{mdm,mcm}/`(확인: `_schema.sql` 있는 옛 SQL 스냅샷 폴더, 표별 SQL 약 101개) | ora-base | `convert --from-sql` 의 원본. CSV 가 이미 들어갔다 | archive(ora-base). 다시 `convert` 하려면 SQLite DB 가 필요하므로 보관 |
| `docs/mdm/erd/0{2..6}-*.sqlite.sql`(5개, 보고) | ora-mdm | ERD 용 SQLite DDL | archive 또는 `oracle` 판으로 교체(ora-mdm 판단) |
| `docs/mdm/dict-candidates/candidates.sqlite` | ora-mdm | 용어 후보 데이터 파일(커밋됨, 보고) | **유지**(참고 데이터, 앱 DB 아님) — 삭제 승인 대상 아님 |
| `poc/mdm-embedding-bench/results/raw-07-sqlite.txt` | ora-base | 벤치 결과 텍스트(보고) | 유지 |
| `.gitignore`(`src/backend/data/`·`src/backend/**/*.db`) | ora-base | 로컬 SQLite 파일 제외 규칙 | 기존 `*.db` 파일을 지우지 않으므로(README §0.2) **유지** |

## 4. 시험 코드(모듈 `src/test`, 레인 소관)

| 범위 | 레인 | 내용 | 머지 뒤 처리 |
|---|---|---|---|
| mdm 시험 중 `jdbc:sqlite` 를 쓰는 파일 47개, 이름에 Sqlite 가 든 시험 74개(확인) | ora-mdm | SQLite 임시 DB 시험 | Oracle 시험 하니스로 전환, SQLite 전용 시험은 archive(ora-mdm) |
| mcm(app·lib) 9개·`*Sqlite*` 4개(확인), mls 1개 | ora-mcm-app·ora-platform | `QueryRouteHarness`·`McmMybatisConfigWiringTest`·`JpaConfigSqliteFlagTest` 등 | Oracle 시험 전환(각 레인) |
| mcm-core 시험 `jdbc:sqlite` 2개·`*Sqlite*` 2개(확인), **H2 시험 다수**(widget·csa·searchdefaults·menu 등 `*JpaTestConfig` 계열, 확인) | ora-mcm-core | H2 인메모리 시험 | Oracle 시험 전환(ora-mcm-core c-항목). 전환 뒤 H2 의존 삭제 |
| `mcm-core/.../screenusage/schema/ScreenUsageMssqlDdlTest.java` | ora-mcm-core | MSSQL DDL 시험 | archive(ora-mcm-core) |
| cactus-core 시험(`DialectDetectorTest`, `OasisCommitFailureSqliteTest` 확인) | ora-platform | SQLite 임시 DB | 전환 또는 archive(ora-platform) |
| `oasis-core/.../SpringTransactionHandlerTest.java`(H2) | ora-platform | H2 | 전환(ora-platform) |

## 5. 스크립트·도구 (ora-base 소유)

| 파일 | 레인 | 내용 | 머지 뒤 처리 |
|---|---|---|---|
| `scripts/db-snapshot/export.sh`, `import.sh` | ora-base | SQLite ↔ 표별 SQL 스냅샷(`sqlite3` 필요) | archive. 대체는 `snapshot.py export`·`import` |
| `tools/oracle-free/sqlite_to_oracle.py`, `load_snapshot.py` | ora-base | SQLite → Oracle 이관(크기 측정용) | archive. 가이드 §7 은 이미 「참고」로 표시했다 |
| `scripts/data/notice-mls-to-mcm.mjs`·`.test.mjs` | ora-base | `node:sqlite` 로 mls.db → mcm.db 공지 이관 | archive 후보(Oracle 에서는 불필요). 사용 여부는 조정자 확인 |
| `be-run.sh`·`be-run.ps1`·`local-run.sh` 주석·안내 | ora-base | `src/backend/data/<모듈>.db` 위치 안내가 남은 곳 | 수정(b7 로 진행 중) |
| `scripts/perf/mdm-backend/README.md`, `scripts/perf/mcm/MyMenusLatencyPerfTest.java`, `scripts/perf/render/run-measure.sh` | ora-base | perf 하니스가 SQLite 사본으로 서버를 띄움 | `scripts/perf/render` 는 메모의 b8 항목(archive). mdm-backend·mcm 은 Oracle PDB 로 수정하거나 archive(조정자 판단) |
| `scripts/archive/` | ora-base | 옛 `restart-all.sh` 등 이미 보관된 것 | 메모의 b8 항목: 재확인 후 정리 |
| `src/frontend/playwright.config.ts`, `src/frontend/e2e/support/mdm-e2e.ts`, `e2e/fixtures/mdm-*.sql` | ora-base(playwright)·ora-mdm(e2e) | SQLITE_BUSY 회피 `workers: 1`(`playwright.config.ts:9` 의 「mcm SQLite 가 SQLITE_BUSY 로 500」 주석 포함), `SMOKE_MDM_DB`, `sqlite3` CLI 로 fixture 적재 | 메모의 b8 항목(playwright.config.ts: 주석을 Oracle 기준으로 고치고 `workers: 1` 유지 여부 판단 — Oracle 에서 동시 로그인이 괜찮으면 병렬 허용). e2e 지원 코드는 ora-mdm 의 E2E 전환과 맞춰 수정 |

## 6. 스킬·가이드 문서 (b7 문서 정비, ora-base 소유)

| 파일 | 레인 | 내용 | 머지 뒤 처리 |
|---|---|---|---|
| `.claude/skills/flyway-migration-add/SKILL.md`, `scripts/migration_tool.mjs`, `scripts/selftest.mjs`, `tests/golden.test.mjs` | ora-base | 방언별 폴더(sqlite·oracle·postgresql) 동시 생성 안내. "로컬·시험 = SQLite" 서술 | 수정(b7): Oracle 하나. 골든 시험도 같이 갱신 |
| `.claude/skills/dflow-merge/scripts/migration-check.sh`, `references/script-details.md` | ora-base | 방언 폴더를 묶어 버전 중복을 검사 | 수정(b7): Oracle 하나 |
| `.claude/skills/dflow-dev/references/dev-dialect.md`, `dflow-work/SKILL.md`, `dflow-merge/SKILL.md`(dialect_check) | ora-base | 방언 검증·`dialect_check` 안내(ADR-0004 로 이미 폐지된 항목 포함) | 수정(b7) |
| `.claude/skills/dflow-team/references/resolve-prompt.md:208` | ora-base | 마이그레이션 번호 충돌 해결(방언 폴더 언급) | 수정(b7) |
| `.claude/skills/analyze-*/**`, `_shared/vocabulary-mapping.md`, `git-commit/SKILL.md`, `coordinator/tests/office-summary.sh` | ora-base | 레거시 원천 DBMS 이름·테스트 문자열에 SQLite 가 나옴 | **유지**(우리 DB 안내가 아님) |
| `README.md`(§3 DB 절 등), `db-snapshot/README.md` | ora-base | 로컬 SQLite 기본·`mdm.db` 안내 | 수정(b7). README 의 MDM 부분은 `5b4640946` 로 이미 고쳤다 |
| `docs/guide/Database/*`, `docs/guide/BackEnd/Backend-Implementation-Guide.md`, `Mes-Guide`, `dialect-neutral-sql.md` | ora-base | 로컬·시험 DB 안내 | 수정(b7). `oracle-26ai-test-guide.md` 는 완료(`843e265be`) |
| `docs/mdm/adr/0004-drop-mssql-production-assumption.md` | ora-mdm | "MDM 로컬·테스트는 SQLite" | **유지**(결정 기록). 뒤에 Oracle 단일화 ADR 을 새로 쓰는 쪽을 조정자에게 제안 |
| `docs/cactus/001_*/mpn-multi-ds-tx-adoption-design.md`, `oasis-multi-tx-detailed-design.md`, `test-scenarios.md` | ora-platform | 설계 문서 안의 SQLite 연결 문자열·통합 절차 | 설계 이력이라 **유지**, 머리에 "로컬은 이제 Oracle" 한 줄 주석 추가(수정) |
| `docs/ai-build-log/DEC-001_noticeMgmt-on-mls.md`, `docs/e2e/` | - | 과거 기록·E2E 설계 | 유지(기록). `docs/e2e/` 는 ora-mdm 의 E2E 전환 뒤 확인 |

## 7. 확인 필요 항목의 결과(조정자 답과 직접 확인)

1. analog `sqlite-jdbc`: 코드가 SQLite 를 열지 않는다(위 표). 범위 밖(별도 빌드)으로 남긴다.
2. `scripts/data/notice-mls-to-mcm.mjs`·perf 하니스(`scripts/perf/mdm-backend`·`mcm`)의 SQLite 경로: 사용자 삭제 승인 대기 목록에 이미 있다. 승인 전까지 archive 처리를 유지한다.
3. 샘플 SQL 2건: 내용이 서로 다르다(중복 아님). `sample_notice` 는 ora-mcm-app 이 이미 archive 했고, `sample_master_code` 는 ora-mcm-core 가 필요 여부를 정한다.
4. `application-local-db.yml`(sqlserver): ora-mcm-app 이 archive 했다.
5. `widget-rule-calc-defs.sql`: 내용이 CSV 에 이미 있어 archive 후보로 올렸다.

## 8. 삭제 승인 후보(최종 삭제는 사용자 승인 뒤, 그 전에는 archive 만)

archive 로 옮긴 뒤 승인되면 삭제할 수 있는 묶음이다.

- `db-snapshot/{mdm,mcm}`(옛 SQL 스냅샷, CSV 로 대체됨) — 단 `convert` 재현용이므로 승인 때 보존 여부를 함께 정한다.
- `scripts/db-snapshot/{export,import}.sh`, `tools/oracle-free/{sqlite_to_oracle,load_snapshot}.py`.
- SQLite 마이그레이션 폴더(mdm 19·mcm-core 16)와 SQLite 전용 시험·코드 클래스(위 §2·§4 의 archive 항목 전부).
- `scripts/perf/render`, `scripts/archive`, 필요하면 `scripts/data/notice-mls-to-mcm.*`.
- `poc/camel-hub-poc`, `poc/mdm-embedding-bench`(폐기된 PoC, §9 참고).

## 9. 머지 전 잔재 예측 (2026-10-07, 레인 4개 + base 가상 병합 기준)

방법: `dev`(ce378785a)에 `feat/ora-base`(0358664a6)·`ora-mdm`(8192ec67e)·`ora-mcm-core`(750e6d1d3)·`ora-mcm-app`(faed71612)·`ora-platform`(f00addc03)를 `git merge-tree --write-tree` 로 차례로 합친 트리(충돌 없음, 브랜치·머지는 만들지 않았다)에서 `git grep` 했다. 대상은 `archive/`(최상위·모듈 안 `archive/`)와 `pnpm-lock.yaml` 을 뺀 저장소 전체이고, 패턴은 sqlite·h2·H2Dialect·SQLServer·mssql·jdbc:sqlite·sqlite-jdbc·LocalSqliteDataSource·postgres 이다. 브랜치가 더 나아가면 결과가 달라지므로, 각 레인이 머지를 요청하기 직전에 같은 방법으로 다시 확인한다(§9.6 의 명령).

원자료는 전체 707 파일이었으나 대부분은 과거 기록이라 아래처럼 나눴다. **고쳐야 할 것**은 §9.1~9.5 의 표에 있는 것이고, 나머지는 놓아 둔다.

- 놓아 두는 것: 「As-Is MSSQL 변환」·「예전 MSSQL 은 …」 같은 이력 주석(mcm-core 의 repository·service 약 40곳), 프런트 `m-mcm` 의 As-Is 변환 주석, 오류 문구 필터 정규식의 `sqlite_`(`noticeMgmt/api.ts`, `shared/tests/unit/http-oasis-call.unit.test.ts`, 방어용), 위젯 가이드 본문(`widget-guide-content.ts`, 가이드 §3 은 건드리지 않는다).
- **머지된 V1(`db/migration/**/V1__*.sql`)의 머리 주석에 든 SQLite·MSSQL 언급은 고치지 않는다**(한 줄도 체크섬을 바꾼다). 대상: mls·mpp·caravanuser·ifuser·mcm-core(mcmapuser·mcm_backup)·mcm V1. 필요하면 V2 이상에서 다룬다.
- docs 이력: `docs/mdm/tasks`(77)·`docs/mcm/design`(52)·`docs/superpowers/{specs,plans}`(36)·`docs/cactus/**`·`docs/mdm/{erd,adr,dict-*}` 는 과거 설계·결정 기록이라 고치지 않는다. 현행 가이드(`docs/guide/**`, `README.md`)와 스킬(`.claude/skills/**`)만 b7 소관이다.
- `poc/camel-hub-poc`·`poc/mdm-embedding-bench`: 폐기된 PoC 폴더(11곳). 범위 밖이며 정리는 사용자 결정이다(§8 에 추가).

### 9.1 ora-mdm

| 위치 | 잔재 | 조치 |
|---|---|---|
| `src/backend/mdm/api/src/test/**/*SqliteTest.java` 72개 | 클래스 이름에 `Sqlite`. 내용은 이미 `AbstractMdmSharedDbTest`(Oracle)이고 본문 언급은 45개가 1곳(주석) | 이름·주석만 남은 것이다. 이름 바꾸기는 선택(바꾸면 `-Pdmes.ora.test` 등 시험 선택 패턴·문서 참조를 함께 갱신) |
| `src/backend/mdm/sample/mdm-local-sample.sql` | `sqlite3 src/backend/data/mdm.db < …` 실행 안내 3줄·`.bail`/`.timeout` | Oracle 판(`snapshot.py import`)으로 안내를 바꾸거나 archive |
| `src/backend/mdm/tools/oracle-baseline/gen_oracle_baseline.py`·`overrides.json` | `import sqlite3`(SQLite 최종 스키마에서 V1 을 만든 도구) | V1 을 이미 만들었으니 archive 후보 |
| `src/backend/mdm/{build.gradle:47, lib/build.gradle:14}`, `…/RuleCalcSeedSetTest.java:61` | 「SQLite 시절」 주석 | 주석 정리 |
| `src/frontend/playwright.mdm-user.config.ts:12`, `e2e/mdm-user/{dmb,dme}.user.ts`·`support.ts:81`, `e2e/fixtures/mdm-*.sql`(3), `mdm-user/TEST-CASES.md:18` | SQLite 샘플 로더·SQLITE_BUSY 회피 주석 | 주석을 Oracle 기준으로 고친다 |

### 9.2 ora-mcm-core

| 위치 | 잔재 | 조치 |
|---|---|---|
| `mcm-core/build.gradle:76-81` | `testRuntimeOnly libs.h2`·`libs.sqlite.jdbc`·`libs.flyway.database.postgresql` | 쓰는 시험이 없으면 제거(그 뒤 base 가 `libs.versions.toml` 항목을 걷는다) |
| `common/audit/McmSqliteMybatisInterceptor.java`(15)·`McmAuditStatementInspector.java`(27, SQLite 판별·MSSQL 토큰 치환) | SQLite 전용 SQL 변환 | 인터셉터는 archive, Inspector 는 SQLite 분기 제거 |
| `common/audit/…McmAuditStatementInspectorSqliteTest.java`(test) | SQLite 시험 | archive |
| `common/persistence/{SqliteTemporalConverterContributor, LocalDateAttributeConverter, LocalDateTimeAttributeConverter}.java` | SQLite 날짜 우회 | **ora-platform 머지 뒤**에 제거(기존 결정), 미리 archive 하면 안 된다 |
| `screenusage/schema/ScreenUsageMssqlDdl.java`(main) | 시험은 archive 했는데 클래스는 main 에 남음 | archive(`build.gradle:35` 주석과 맞춤) |
| `widget/query/{SqlGuard(33), WidgetReadOnlyJdbc(21), WidgetQueryExecutor(14), WidgetQueryProperties, WidgetQueryRunner}` | SQL Server·PostgreSQL·SQLite `query_only` 분기·문구 | 운영은 Oracle 전용 읽기 계정이므로 SQLite 분기는 제거, SQL Server 분기(`WAITFOR` 등 차단 낱말)는 레인 판단(방어 규칙은 유지해도 무해) |
| `widget/{chat/service/WidgetChatService, chat/WidgetChatWriter, collect/WidgetCollectWriter, service/SecWidgetTabWriter}`, `repository/SecMenuNativeRepository:335` | SQLITE_BUSY 재시도·「로컬 SQLite 는 …」 주석 | 재시도 상수가 SQLite 락 전용이면 정리, 아니면 주석만 |

### 9.3 ora-mcm-app

| 위치 | 잔재 | 조치 |
|---|---|---|
| `mcm/lib/build.gradle:31` | `api libs.sqlite.jdbc`(api 노출) | 제거(다른 모듈이 이 transitive 에 기대는지 `:mcm:lib` 소비 모듈 컴파일로 확인) |
| `mcm/api/src/test/**/init/DataInitializerMssqlSqlCharacterizationTest.java`(29)와 골든 `src/test/resources/init/data-initializer-mssql-sql.*.golden.txt` 4개 | `DataInitializer` 의 MSSQL SQL 기록. 본문에 Java DDL 단계를 걷어냈다고 적혀 있어 대상이 없어진 시험 | archive(시험·골든 함께) |
| `mcm/api/src/test/**/queryroute/{MasterCodeSelPopQueryRoutePerfTest, McmMybatisConfigWiringTest, QueryMapperLintTest, QueryRouteHarness}`, `init/DataInitializerSeedFingerprintTest` | 「SQLite 파일 DB」 설명·주석 | 주석 정리 |
| `mcm/api/src/main/java/**/init/{DataInitializer, seed/McmMenuSeeder, MenuFinalizer, RuleMasterSampleSeeder, SeedSupport, WidgetCategoryCodeSeeder}` | 「개발 MSSQL·동료 SQLite」 백필 주석, `WidgetCategoryCodeSeeder` 의 SQLite V18 언급 | 주석 정리(동작 변경 없음) |
| `mcm/sample/widget-rule-calc-defs.sql:13` | `sqlite3 … < …` 실행 안내 | Oracle 안내로 교체 |
| `mcm/lib/…/notice/{entity/Notice, repository/NoticeRepository}`, `domain/security/controller/McmAuthController`, `db/McmSchemaMigrator` | 옛 SQLite 설명 주석 | 주석 정리 |
| `mcm/gradle.properties:8` | 「../data SQLite」 주석 | 주석 정리 |

### 9.4 ora-platform

| 위치 | 잔재 | 조치 |
|---|---|---|
| `cactus-core/src/main/java/**/cactus/local/LocalSqliteDataSource.java` | `jdbc:sqlite:` 로 접속을 만드는 클래스. mcm-app 은 이미 쓰지 않는다(`McmApplication.java:59`) | 다른 모듈이 안 쓰면 archive(소비처는 `git grep LocalSqliteDataSource` 로 확인) |
| `cactus-core/…/datasource/CactusDataSourceProperties.java`(javadoc), `jpa/CactusJpaProperties.java:26` | 설정 예시가 `jdbc:sqlserver://`·`SQLServerDialect` | Oracle 예시로 교체 |
| `cactus-core/…/persistence/dmom/DmomMapper.xml:5`(「MSSQL」 매퍼) | MSSQL 문법일 수 있는 전문 송신 SQL | Oracle 문법 확인, 아니면 변환 |
| `cactus-core/…/test/**/CactusMultiJpaAutoConfigurationTest.java`(H2Dialect 4곳), `oasis-core/src/test/resources/META-INF/persistence.xml:27`(`jdbc:h2:tcp`) | 방언 이름 문자열·H2 URL | 이름 문자열은 Oracle 로 바꾼다. 영속성 설정 H2 URL 은 쓰는 시험이 없으면 정리 |
| `cactus-core/…/security/auth/AuthService.java:55`, `dmes-logback-base.xml:79` | SQLite·mssql-validate 프로파일 주석 | 주석 정리 |
| `aps-core/build.gradle:61` | `testRuntimeOnly libs.sqlite.jdbc` | 제거 |
| `caravan-console/…/AppHostEntity.java:27`, `caravan-core/…/{TiberoDialectResolver, TopicInfoJpaRepository}`, `caravan-hub/{build.gradle:47, HubFlywayConfig}` | SQLite·MSSQL 설명 주석 | 주석 정리. **caravanuser·ifuser V1 의 머리 주석은 고치지 않는다** |
| `{localKafka, maru-mdm-engine, mls, mpn, mpp, mqc, cactus-core}/gradle.properties:8`, `data-migration/sample-migration/index.cjs:14` | 「../data SQLite」·mssql 예시 주석 | 주석 정리(8행은 모듈마다 같은 문구라 한 번에) |

### 9.5 ora-base (내 몫, 머지 뒤 처리)

| 위치 | 잔재 | 조치 |
|---|---|---|
| `src/backend/gradle/libs.versions.toml:77-85` | `sqlite-jdbc`·`mssql-jdbc`·`h2`·`hibernate-community-dialects-*`·`flyway-database-postgresql` | 레인이 위 `build.gradle` 사용을 걷은 뒤 **마지막에** 제거(먼저 지우면 레인이 깨진다). `git grep 'libs\.\(sqlite\|h2\|mssql\)'` 가 0 이고 `hibernate-community-dialects` 소비처가 없을 때 |
| `analog/gradle/libs.versions.toml:5` | `sqlite-jdbc = "3.47.2.0"` | analog 는 범위 밖(조정자 결정). 기록만 |
| `be-run.sh:528-529`·`be-run.ps1:310` | 「local 프로파일 SQLite 파일 위치」 `../data` 디렉터리 준비 | 모듈이 모두 Oracle 로 넘어가면 제거. 머지③ 뒤 확인 |
| `.gitignore:38,47` | SQLite DB·런타임 아티팩트 항목 | 로컬 `.db` 가 남은 PC 를 위해 당분간 유지, z1 에서 제거 |
| `src/backend/build-logic/…/dmes.test-conventions.gradle:112`, 각 `gradle.properties:8` | 「../data SQLite」 캐시 제외 사유 문구 | 문구만 Oracle 로 고친다(캐시 제외 자체는 유지) |
| `scripts/db-snapshot/{export,import}.sh`, `db-snapshot/mdm/sqlite_sequence.sql` 등 옛 SQL 스냅샷, `tools/oracle-free/{sqlite_to_oracle,load_snapshot}.py`, `scripts/data/notice-mls-to-mcm.*`, `scripts/archive`, `scripts/perf/{render,mcm,mdm-backend}` | SQLite 도구·하니스 | §1·§5 대로 archive(삭제는 승인 뒤) |
| `src/frontend/playwright.config.ts:8-9` | 「mcm SQLite 가 SQLITE_BUSY 로 500」 주석 + `workers: 1` | 주석 수정, 병렬 허용 여부는 Oracle 동시 로그인 확인 뒤 판단 |
| `.claude/skills/{flyway-migration-add, dflow-merge, dflow-dev, dflow-work, dflow-team, dflow-wbs, coordinator, analyze-*}` | `dialect`·`sqlite` 낱말(스크립트 `migration_tool.mjs`·`selftest.mjs`·`golden.test.mjs`·`dialect-check.sh` 등 약 40곳) | b7 후속(초안 A·B, 머지④ 뒤) |
| `docs/guide/Database/oracle-to-mssql-*.md` 2개 | 옛 Oracle→MSSQL 변환 가이드 | 이력 문서. 폐기 표시를 머리에 붙일지 b7 에서 판단 |

### 9.6 다시 확인하는 명령(읽기 전용)

```bash
# 1) dev 에 레인을 차례로 합친 가상 커밋을 만든다(브랜치·워킹트리는 건드리지 않는다)
cur=$(git rev-parse dev)
for b in feat/ora-base feat/ora-mdm feat/ora-mcm-core feat/ora-mcm-app feat/ora-platform; do
  tree=$(git merge-tree --write-tree --no-messages $cur $b | head -1)
  cur=$(git commit-tree $tree -p $cur -p $(git rev-parse $b) -m "virtual $b")
done
# 2) 강한 신호만 찾는다
git -c core.quotepath=false grep -I -n -E 'jdbc:sqlite|sqlite-jdbc|org\.sqlite|LocalSqliteDataSource|SQLiteDialect|H2Dialect|jdbc:h2|mssql-jdbc|jdbc:sqlserver|SQLServerDialect|sqlite3' $cur -- . ':(exclude)**/archive/**' ':(exclude)docs' ':(exclude)*.md' ':(exclude)poc'
```

강한 신호(드라이버·방언·URL·식별자)가 레인 소관은 0 이 되는 것이 머지 전 기준이다(남은 것은 §9.5 의 base 몫과 이름만 남은 시험). 약한 신호(주석·이름)는 위 표에 적은 만큼만 정리한다. 이번 예측의 강한 신호는 74줄이었다.
