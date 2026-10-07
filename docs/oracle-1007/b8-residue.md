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
| `src/backend/analog/gradle/libs.versions.toml:5` | ora-base | `sqlite-jdbc` 3.47.2.0 | **확인 필요**: analog 가 DB 를 쓰지 않으면 제외(조정자 지시), 쓰면 수정 |
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
| `src/backend/mcm/api/src/main/resources/application-local-db.yml` | ora-mcm-app | `jdbc:sqlserver` 설정 | 파일 용도 확인 후 archive 또는 Oracle 로 수정(조정자 판단) |
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
| `src/backend/mcm-core/src/main/resources/db/migration/mcm-core/V1__init_sample_master_code.sql`, `src/backend/mcm/api/src/main/resources/db/migration/mcm/V1__init_sample_notice.sql` | ora-mcm-core·ora-mcm-app | 샘플 시드 SQL(방언 중립 여부 보고만) | **확인 필요**: Oracle 기준선과 겹치면 archive |
| `src/backend/mdm/sample/mdm-local-sample.sql` | ora-mdm | `MdmLocalSampleLoader` 가 읽던 샘플. be-run 은 이미 인자를 뺐다 | archive(ora-mdm, 로더 제거와 함께) |
| `src/backend/mcm/sample/widget-rule-calc-defs.sql` | ora-mcm-app | 위젯 룰 계산기 정의 SQL | 확인 필요: Oracle 문법인지, CSV 에 이미 들어갔는지 |
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
| `src/frontend/playwright.config.ts`, `src/frontend/e2e/support/mdm-e2e.ts`, `e2e/fixtures/mdm-*.sql` | ora-base(playwright)·ora-mdm(e2e) | SQLITE_BUSY 회피 `workers: 1`, `SMOKE_MDM_DB`, `sqlite3` CLI 로 fixture 적재 | 메모의 b8 항목(playwright.config.ts). e2e 지원 코드는 ora-mdm 의 E2E 전환과 맞춰 수정 |

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

## 7. 알려 둔 「확인 필요」 항목(조정자 판단)

1. analog 의 `sqlite-jdbc`(analog 가 DB 를 쓰는지).
2. `scripts/data/notice-mls-to-mcm.mjs` 를 더 쓰는지(공지 이관은 끝난 일회성 도구로 보인다).
3. perf 하니스(`scripts/perf/mdm-backend`·`mcm`)를 Oracle 로 고칠지 보관할지.
4. 샘플 SQL 2건(`mcm-core/.../mcm-core/V1__init_sample_master_code.sql`, `mcm/api/.../mcm/V1__init_sample_notice.sql`)이 새 기준선과 겹치는지.
5. `application-local-db.yml`(sqlserver)의 용도.

## 8. 삭제 승인 후보(최종 삭제는 사용자 승인 뒤, 그 전에는 archive 만)

archive 로 옮긴 뒤 승인되면 삭제할 수 있는 묶음이다.

- `db-snapshot/{mdm,mcm}`(옛 SQL 스냅샷, CSV 로 대체됨) — 단 `convert` 재현용이므로 승인 때 보존 여부를 함께 정한다.
- `scripts/db-snapshot/{export,import}.sh`, `tools/oracle-free/{sqlite_to_oracle,load_snapshot}.py`.
- SQLite 마이그레이션 폴더(mdm 19·mcm-core 16)와 SQLite 전용 시험·코드 클래스(위 §2·§4 의 archive 항목 전부).
- `scripts/perf/render`, `scripts/archive`, 필요하면 `scripts/data/notice-mls-to-mcm.*`.
