# 삭제 승인 목록 (b8)

상태(2026-10-07): A1~A5 는 `archive/oracle-1007/` 로 `git mv` 완료(커밋 68518854f, 삭제 아님). 아래 경로 칸의 「archive 뒤」 위치가 현재 위치다. B·C 는 각 레인·사용자 결정 대기. 이 목록은 z1 마감 보고에 그대로 싣는다.

**원칙: 이 목록의 항목은 사용자 승인 없이는 지우지 않는다. 승인 전에는 `archive/` 로 `git mv` 해서 보존만 한다(삭제 아님, 이력·되돌리기 가능).** 승인되면 그 항목만 `git rm` 한다.
기준: 2026-10-07 dev(f35bfcfdc 이후). 크기는 `git ls-files` 기준 파일 수와 디스크 사용량 근사치(KB, 블록 올림 포함)다.
되돌리기 공통: 삭제 전에는 `git mv` 를 거꾸로 하면 되고, 삭제 뒤에는 삭제 커밋 직전 커밋에서 `git checkout <커밋>^ -- <경로>` (또는 `git revert <삭제 커밋>`).

## A. ora-base 가 archive 로 옮기는 것 (archive-move.md 와 같은 항목)

| 번호 | 대상 | 크기·개수 | 보존 이유 | 되돌리는 법 |
|---|---|---|---|---|
| A1 | `db-snapshot/mdm/`·`db-snapshot/mcm/` (옛 SQL 스냅샷 → archive 뒤 `archive/oracle-1007/db-snapshot-sql/`) | 101 파일(mdm 42·mcm 59), 약 27MB(mdm 26.6MB 대부분이 표별 INSERT 텍스트) | `snapshot.py convert --from-sql` 의 원본이다. CSV 는 이미 들어갔고(`db-snapshot/MDMAPUSER`·`MCMAPUSER`) 이 SQL 은 SQLite DB 가 있어야 다시 변환할 수 있어, 전환 런북(local-cutover) 이 끝날 때까지는 재현용으로 필요하다. 승인 때 보존 여부를 함께 정한다 | 위 공통 |
| A2 | `scripts/db-snapshot/export.sh`·`import.sh` (SQLite ↔ 표별 SQL, `sqlite3` CLI 필요) | 2 파일, 약 8KB | 대체는 `snapshot.py export`·`import`(Oracle). 옛 SQL 스냅샷(A1)을 만들고 되돌리던 도구라 A1 과 같이 판단 | 위 공통 |
| A3 | `tools/oracle-free/sqlite_to_oracle.py`·`load_snapshot.py` | 2 파일, 약 40KB | SQLite → Oracle 크기 측정·이관용 일회성 도구. 가이드 §7 이 「참고」로 남김. 전환 런북이 끝나기 전에는 필요할 수 있다 | 위 공통 |
| A4 | `scripts/data/notice-mls-to-mcm.mjs`·`.test.mjs` (`node:sqlite` 로 mls.db → mcm.db) | 2 파일, 약 24KB | Oracle 은 PDB 에 mls·mcm 스키마가 함께 있어 SQL 로 옮기므로 불필요(`docs/mcm/erd/notice-tables.md:157`). 설계 이력(DEC-001·notice-to-mcm-design)이 이 경로를 인용한다 | 위 공통 |
| A5 | `scripts/perf/mcm/` (`MyMenusLatencyPerfTest`·`perf-mcm-p3.sh`·README) | 3 파일, 약 36KB | 빈 SQLite 임시 파일과 `McmAuditStatementInspector.setSqlite`·`SqliteTemporalConverterContributor` 를 쓰는데 이 심볼이 main 에서 이미 사라져 컴파일되지 않는다(`isSqlite`·`setSqlite` 는 archive 안에서만 나옴). `docs/refactor-2026-10/perf-mcm.md` 가 재현 경로로 인용하는 과거 측정 도구라 보존 | 위 공통 |

## B. 이미 archive 에 있는 것 (이 레인이 옮긴 것이 아님 — 최종 삭제만 승인 대상)

| 번호 | 대상 | 크기·개수 | 보존 이유 | 되돌리는 법 |
|---|---|---|---|---|
| B1 | `archive/oracle-1007/` (플랫폼 레인이 옮긴 SQLite 샘플 마이그레이션·`LocalSqliteDataSource`·`DialectDetector`·`SqliteColumnConverter`·MSSQL 변환기·시험) | 16 파일(java 8·sqlite SQL 8), 약 92KB | 되돌릴 때 원본 대조용 | 위 공통 |
| B2 | `src/backend/mdm/archive/` (SQLite 마이그레이션 19·SQLite 일시 변환기·`DefaultMdmDialectResolver`·마이그레이션 시험·`oracle-baseline` 생성기·perf extra-base 등) | 49 파일 | V1 기준선을 만든 원본, 마이그레이션 동치 시험 | 위 공통 |
| B3 | `src/backend/mcm-core/archive/` (SQLite 마이그레이션 16·`McmSqliteMybatisInterceptor`·`SqliteTemporalConverterContributor`·`ScreenUsageMssqlDdl(+Test)` 등) | 27 파일 | 같음 | 위 공통 |
| B4 | `src/backend/mcm/archive/` (`SchemaArtifacts{Sqlite,Mssql}`·`CactusSqliteIfNotExistsDialect`·`SqliteBusyRetry`·MSSQL 골든 4·`application-local-db.yml` 등) | 17 파일 | 같음 | 위 공통 |
| B5 | `scripts/archive/restart-all.sh`·README | 2 파일, 12KB | MSSQL 프로파일·틀린 포트(8300)의 낡은 재기동 스크립트. 대체는 `be-run.sh`·`fe-run.sh`·`local-run.sh` | 위 공통 |

B2~B4 는 각 레인 소유라 삭제 승인도 레인 단위로 받는다. 우리 쪽 보고서에는 모아서 한 번에 묻는다.

## C. 사용자 결정이 필요한 폐기 후보 (정리 방침부터 승인)

| 번호 | 대상 | 크기·개수 | 보존 이유·조건 | 되돌리는 법 |
|---|---|---|---|---|
| C1 | `poc/camel-hub-poc/` | 15 파일, 약 68KB | 폐기된 PoC. 직접 `org.xerial:sqlite-jdbc` 좌표 사용(build.gradle:23). 다른 문서가 인용하지 않음(확인). archive 로 옮겨도 빌드 영향 없음(composite 밖) | 위 공통 |
| C2 | `poc/mdm-embedding-bench/` | 17 파일, 약 100KB | 폐기된 PoC. 그러나 `docs/mdm/term-embedding.md`·`decisions.md` 가 `poc/mdm-embedding-bench/results/raw-*.txt` 를 링크로 인용하므로 **옮기면 링크가 깨진다**. 링크를 같이 고치거나 `results/` 만 남기는 결정이 먼저. `raw-07-sqlite.txt` 는 residue 표에서 유지로 분류됨 | 위 공통 |
| C3 | `docs/mdm/erd/0{2..6}-*.sqlite.sql` 5개 | 5 파일, 약 44KB | ERD 용 SQLite DDL. ora-mdm 이 archive 할지 Oracle 판으로 교체할지 정한다(b8 §3). 이 레인 몫 아님 | 위 공통 |
| C4 | `src/backend/mdm/sample/mdm-local-sample.sql` | 1 파일, 약 244KB | `MdmLocalSampleLoader`(archive 됨)가 읽던 샘플. 같은 데이터가 `db-snapshot/MDMAPUSER` CSV 에 들어갔는지 ora-mdm 이 확인(b8 §3·§9.1) 뒤 archive. 이 레인 몫 아님 | 위 공통 |
| C5 | `src/backend/mcm/sample/widget-rule-calc-defs.sql` | 1 파일, 8KB | 위젯 정의 5건(`def.rcalc001~005`)이 `db-snapshot/MCMAPUSER/TB_MCM_WIDGET_DEF.csv` 에 이미 있다(이번에 대조 확인). `Widget-Authoring-Guide.md:513` 의 인용 문장을 같이 고쳐야 한다(ora-mcm-core 소관). 이 레인 몫 아님 | 위 공통 |

## D. 삭제 대상이 아닌 것 (승인 항목에 올리지 않음)

- `docs/mdm/dict-candidates/candidates.sqlite`: 참고 데이터, 앱 DB 아님. **유지**.
- `poc/mdm-embedding-bench/results/raw-07-sqlite.txt`: 벤치 결과 텍스트. 유지.
- `.gitignore` 의 `src/backend/data/`·`src/backend/**/*.db`·`/data/`: 개발자 PC 에 남은 `.db` 를 지우지 않으므로 z1 까지 유지.
- `scripts/db-snapshot/snapshot.py`(`convert` 가 `sqlite3` 모듈 사용)·`compare_counts.py`(`sqlite3` 사용): 전환 런북(`docs/oracle-1007/local-cutover.md:77-80,107`)이 쓰는 살아 있는 도구. 전환이 끝나기 전에는 옮기지 않는다(archive-move.md §1 「옮기지 않기로 판단한 것」).
- 머지된 V1 `db/migration/**/V1__*.sql` 의 머리 주석: 한 줄도 체크섬을 바꾸므로 고치지 않는다.
- 과거 기록 폴더(`docs/mdm/tasks`·`docs/mcm/design`·`docs/superpowers`·`docs/cactus`·`docs/ai-build-log`)는 기록이라 삭제·이동하지 않는다.

## 요약

승인 항목: A 5(A1~A5) + B 5(B1~B5) + C 5(C1~C5) = **15개**. 이 중 이 레인이 직접 archive 하는 것은 A1~A5(뒤따르는 `git rm` 은 승인 뒤).

## 승인 뒤 삭제 명령 틀

```bash
# 예) A4 승인 시 (archive 위치는 archive-move.sh 와 같다)
git rm -r archive/oracle-1007/scripts/data
git commit -m "chore(b8): 승인된 SQLite 잔재 삭제 — A4"
```
