# oracle-1007 마감 보고 (SUMMARY)

작성: ora-base(z1), 2026-10-07 23시 30분 무렵 기준(dev `ec40b8a37`). 이 문서는 회차 마감 보고이며, 상세는 레인 정본 메모(`memo-ora-*.md`)·성능 원본(`perf-ora-*.md`)에 있다.

- 수치는 이 PC(MacBook Air M5, 16GB, 팬 없음)에서 잰 값이다. 같은 설정에서도 편차가 크므로 **반복 측정 없이 결론 내지 않는다**. 반복 횟수는 표마다 적는다.
- 사실이 확인되지 않은 칸은 「측정 없음」·「메모에서 찾지 못함」으로 두었다. 추측은 「추측」이라 표시했다.

## 0. 한 줄 결과

로컬 앱 기동과 백엔드 자동 시험을 Oracle 26ai Free 하나로 통일했다(SQLite·H2·MSSQL·PostgreSQL·Tibero 경로 제거 또는 archive). 운영(WildFly)·caravan-hub 의 코드·설정·문서도 Oracle 기준으로 바꿨다. 격리는 레인·시험별 PDB(템플릿 복제)로 한다. 실제 운영 Oracle 서버의 버전·호스트·서비스명은 미정이라 운영 적용은 이 회차 범위 밖이다(§5). 문서 불일치가 하나 있다: `DMES-Deployment-Guide.md` 126행은 「운영 DB는 Oracle 26ai」 라고 적었고 `schema-owners.md` §3.1.1 은 운영 Oracle 이 23 미만일 수 있다고 적는다. 운영 버전은 확인되지 않았으므로 운영 반영 전 확인 항목이다(§4.3). 마감 시점 전 모듈 시험 결과는 §7.1 이다(Oracle 을 쓰는 모듈은 통과, 실패는 윈도우 로그 경로에 기대는 analog 83건뿐). E2E 는 마감에서 재실행하지 않았다.

## 1. 머지 이력

dev 에 `--no-ff` 로 들어간 순서다(레인이 dev 를 자기 브랜치로 합친 `merge: dev into …` 커밋은 뺐다). 모두 origin/dev 에 포함되어 있다(로컬 추적 ref 기준 확인). 레인은 push 하지 않고 조정자가 push 했다.

| 순서 | 시각 | 레인 | dev 머지 커밋 | 내용 | 비고 |
|---|---|---|---|---|---|
| ① | 17:28 | ora-base | 08978b6ff | Oracle 단일화 기반: 의존성(ojdbc·flyway-oracle)·PDB 도구(`pdb.mjs`)·시험 PDB 하니스·be-run·소유표·연결 규약 | 트리 d137e5b0, 17:50 push |
| ①b | 18:30 | ora-base | fb253556d | b5 적재기(`snapshot.py`)·template 명령·하니스 PC 잠금·KST 고정 | |
| ①c | 20:20 | ora-base | ce378785a | 하니스 접속 상한(Hikari 2·유휴 0·cache 2·forks 1)·무잠금 close·seal·VM 상태 로그·e2e Oracle 도우미 | VM 3GB 재기동(20:20)과 같은 시각 |
| ③ | 21:24 | ora-mcm-core | e8f5ed3d2 | mcm-core Oracle 기준선 V1 4벌·방언 전환·위젯 조회 SQL·시험 Oracle 전환 | 23커밋·115파일 |
| ③ | 21:27 | ora-mcm-app | 14b09f1af | mcm Flyway 전환(스키마별 4개)·Java DDL 제거·프로파일 정리·`''` 비교·CaravanMetaSeeder 가드 | 20커밋·69파일 |
| ③b | 21:31 | ora-mcm-core | daec256d0 | SQLite 감사 인터셉터·MSSQL DDL archive | |
| ①d | 21:37 | ora-base | 5f84f28da | 하니스 교착 수정(included build 마다 생기던 서비스·lock-hold 를 JVM 안 주인 1개로 공유, PC 잠금 → 슬롯 순서) | |
| ③c | 22:28 | ora-mcm-core | e3943844f | 위젯 조회 연결 풀 교착 수정(요청당 연결 2~3개 점유)·local 위젯 전용 풀 | ora-mdm E2E 에서 발견 |
| 조정자 스킬 | 22:38 | ora-base | 5221544fd | 병목 대기 레인에 무관한 일 먼저 배정 | main 1a7ba27ec |
| ③d | 22:45 | ora-mcm-core | 1e93e6197 | mcm 풀 설정(minimumIdle·idleTimeout·leakDetection) 읽기 보강·local 누수 감지 | |
| ② | 22:49 | ora-mdm | 9966e9812 | mdm Oracle 기준선 V1(표 39)·SQLite 제거·시험·E2E 전환 | 304파일 |
| ④ | 22:52 | ora-platform | 7b0b18e73 | caravan·cactus·oasis·mls·mpp·mqc·mpn·aps Oracle 전환 | 43커밋·128파일 |
| ④b | 22:53 | ora-platform | 05ccf13dd | 정본 메모 마무리 | |
| ⑤a | 22:58 | ora-base | ea999a602 | 전환 런북·적재기 보강·Oracle SQL 규칙·flyway 스킬·b7 일부·be-run mcm 풀 | dflow 스킬 커밋 ee8d28968 은 main 에도 cherry-pick(47ab42884) |
| ③e | 22:59 | ora-mcm-core | ef64b9bc7 | SQLite 시간 변환기 3종 archive | |
| ②b | 23:19 | ora-mdm | f35bfcfdc | 교차 리뷰 반영·LIKE ESCAPE·V1 제약 대조 시험 | |
| ⑤b | 23:22 | ora-base | fd700775c | 시험 차례(①e, 같은 빌드 모듈의 PDB 겹침 방지)·worker lease 교착 수정·`pdb.mjs` FREEPDB1 은 open·close 만·b7 나머지(README 셋업·Backend-Implementation-Guide·Mes-Guide) | |
| ③f | 23:27 | ora-mcm-core | b73b4f185 | 위젯 채팅 짧은 읽기 트랜잭션·mcm 기본 DataSource 연결 지연 획득(local 만 켬) | 설계 `design-mcm-lazy-ds.md` |
| ③h | 23:29 | ora-mcm-core | 987713ba5 | 정본 메모 마감 | |
| ⑤c | 23:30 | ora-base | ec40b8a37 | 적재기 위젯 SQL 후처리·`libs.versions.toml` 방언 alias 6개 제거·SQLite 의존 옛 도구 archive·삭제 승인 목록 | |
| z1 | - | ora-base | z1 머지 커밋(조정자 머지 때 확정) | 이 문서(마감) | 커밋·push 는 조정자 |

- ③g 는 dev 커밋이 없다. `L_MAIN` 의 쿼리 위젯 SQL 6개를 UPDATE 로 고친 데이터 보정이다(원본이 일치할 때만 변경, 홈 오류 0 을 브라우저로 확인).
- dev 외 main 반영: 조정자 스킬 1a7ba27ec, dflow 스킬 47ab42884. 그 밖의 회차 변경은 main 에 반영하지 않았다(킷 공용 변경만 반영).

## 2. 성능 전후 (SQLite·H2 대비 Oracle)

**아래는 모두 참고값이다.** mdm·mcm-core 는 양쪽 1회씩 한 번 잰 값이고, mcm 만 3회 중앙값이다. 이 PC 는 같은 설정에서도 2배까지 흔들리므로 비율로 결론을 내지 않는다. 원본은 `perf-ora-mdm.md`·`perf-ora-mcm-core.md`·`perf-ora-mcm-app.md`.

| 항목 | 전(SQLite·H2) | 후(Oracle 시험 PDB) | 비 | 측정 조건 |
|---|---|---|---|---|
| mdm `:lib:test` 스위트 시간 합 | 6.9초(2,061건) | 6.4초(2,071건) | 같음 | 각 1회. DB 를 거의 쓰지 않는 단위 시험. Oracle 벽시계 35초(복제·삭제 포함) |
| mdm `:api:test` 스위트 시간 합 | 153.8초(1,923건) | 267.3초(1,853건, 건너뜀 13) | 약 1.7배 | 각 1회. 건수가 달라 엄밀한 비교가 아님(SQLite 전용 시험 18개 archive). Oracle 벽시계 5분 34초 |
| mcm-core `test` 스위트 시간 합 | 44.9초(1,197건, 실패 3은 SQLite 전용) | 38.0초(1,232건, 건너뜀 2) | 0.85배 | 각 1회. 벽시계 67초 대 51초. 새 Oracle 확인 시험 포함이라 건수가 다름 |
| mcm `:lib:test`+`:api:test` 스위트 시간 합 | 39.9초(173건) | 43.9초(166건) | 약 1.1배 | 각 3회 중앙값. 공통 31개 클래스 합은 34.2초 대 39.3초(+15%) |
| mcm 벽시계 | 45초 | 78초(60/78/101) | 약 1.7배 | 3회 중앙값. 시험 전 단계(PC 잠금 대기 + 이전 PDB 삭제 + 복제)가 30초(10/30/41) |
| 시험 PDB 복제(템플릿 → T_*) 1회 | - | 4~6초 | | 복제만, 한 번씩(①d 실측 4초, 하니스 실행 확인 6초). 부하가 큰 때는 복제+열기 합 73초까지 나옴(b0 스파이크, 한 번). 템플릿 `TPL_EMPTY`·`TPL_SCHEMA`·`TPL_DATA` |
| platform 전 모듈 | 측정 없음 | 빌드 하나 36초(전 모듈 통과) | | ④ 시점 clone 하니스 1회. oasis 686건은 53초(p5, 1회). 전 기준 측정 없음 |
| 로컬 서버 기동(mdm·mcm·mls) | 측정 없음 | 측정 없음 | | 런북의 「모듈당 1~2분」은 어림이며 측정값이 아님 |
| E2E 전체 | 측정 없음 | 측정 없음 | | 통과·실패 수만 기록(아래 표) |
| mdm 백엔드 기능 성능(P1~P5) | - | 측정 없음 | | `scripts/perf/mdm-backend` 를 Oracle 로 전환했으나 실행하지 않음. EMBEDDING 이 NULL 이라 2026-10-04 SQLite 값과 조건이 달라 Oracle 값끼리만 비교해야 함 |

mdm api 가 늘어난 까닭을 perf 문서는 클래스마다 하는 공유 DB 재설정과 왕복 비용으로 본다(분해 측정은 안 했다). mcm 의 Oracle 첫 실행(18:35, 잠금 대기 약 15분 포함, VM 2GB 시절)은 비교에 쓰지 않는다. 하니스가 PC 잠금 대기와 복제 시간을 따로 찍지 않아 둘을 나누지 못했다(후속, §6).

### 이관·템플릿 소요(메인 서버 `L_MAIN` 전환, 23시, 각 1회)

| 단계 | 소요 | 비고 |
|---|---|---|
| `template-schema TPL_SCHEMA --rebuild` | 약 2분 | PC 잠금 대기 포함, 스키마 12개에 V 12개 적용 |
| `template-data TPL_DATA --rebuild` | 약 2분 | 적재 자체는 mdm 9.5초. E2E 잔여 행 413개·19표를 거르고 적재 |
| `clone TPL_SCHEMA L_MAIN` | 4초 | |
| `convert --full` 4개 | 몇 초 | |
| `import --replace --keep-e2e` | 26초 | mdm 19초 |
| `compare_counts.py` 4건 | 약 10초 | mcm·mdm·caravan-console 불일치 0 |
| 이관한 행 | mcm 1,699(55표)·mcm_source 6·mca 6·mdm 42,870(39표)·caravan 4 | mls 는 샘플 표뿐이라 0 |

heavy 슬롯 대기가 길 수 있다(이번에 4분 34초). 위 소요에서 대기는 단계별로 분리되어 있지 않다.

### 레인 머지 시점 시험·확인 결과(마감 확인 값이 아님)

| 모듈 | 결과 | 시점 |
|---|---|---|
| mdm | lib 2,071 실패 0 / api 1,856 실패 0 건너뜀 13 | ②b, dev ef64b9bc7 합친 뒤 |
| mcm-core | 1,227 실패 0 건너뜀 2(117클래스) | ③b |
| mcm | 166 실패 0 건너뜀 1(성능 시험) | a4. 잔재 정리 뒤 162 실패 0 |
| platform | caravan-core 102·console 59·hub 80·cactus-core 897·oasis 686(건너뜀 1)·aps-core 3·mls 1 전부 통과 | ④ |
| mdm E2E 화면 스펙 | 143 중 142 통과, 1건은 간헐(재실행 4/4 통과), 서버 ORA 0 | 새 PDB, ② 전 |
| mdm E2E 사용자 여정 | 217 중 2차 199 통과·5 실패·13 미실행, Oracle 원인 0. 그 뒤 데이터 전제 3건·DOM-05 를 고치고 dma 40/40, common·setup·dmc·dmd 통과. 남은 실패 4건은 화면 배치 결함(§6) | 최종 합계는 메모에 없음 |
| 메인 서버 3개 | health 200, Flyway 체크섬 정상, mcm 풀 8/2/60s 로그 확인, 위젯 관리 33건·MDM 도메인 171건·홈 오류 0 | 23:19~23:28 |

### 자원 메모

Podman VM 3GB(처음 2GB, 10-07 스래싱 3회로 상향, 사용자 결정), SGA 900M, PGA 목표 400M, `pga_aggregate_limit` 2G, cpus 2, 동시 열린 PDB 3, 무거운 작업은 PC 잠금으로 한 번에 하나. b0 실측에서 2GB 에 PDB 4개를 동시에 열자 ORA-00822 로 인스턴스가 종료됐다(16:25, `startup` 으로 복구, 데이터 정상). 복제본은 파일을 통째로 복사해 PDB 하나가 디스크를 약 0.8~0.9GB 쓴다.

## 3. 확정된 결정

결정자는 메모·이벤트 기록에 적힌 대로 썼다.

| 결정 | 결정자·시각 | 근거 |
|---|---|---|
| 로컬 기동·백엔드 자동 시험 전부·운영 설정을 Oracle 26ai Free 하나로 단일화(mdm 임시 SQLite·mcm-core H2·caravan/oasis H2 포함) | 사용자, 회차 착수 | `README.md` §0 |
| SQLite 완전 제거(프로파일·sqlite 마이그레이션 폴더·치환기·sqlite-jdbc). 기존 `src/backend/data/*.db` 는 지우지 않음 | 사용자 | `README.md` §0 |
| 운영(WildFly)·caravan-hub 사이트 프로파일도 Oracle, MSSQL·PostgreSQL·H2 설정 제거 | 사용자 | `README.md` §0 |
| SQL 의 스키마 접두(`MCMAPUSER.` 등) 유지, 접두를 지우는 치환기를 만들지 않음 | 사용자 | `README.md` §0 |
| 격리는 레인·시험별 PDB, Flyway 방언 폴더는 Oracle 하나 | 사용자 | `README.md` §0 |
| **SQL 은 Oracle 전용**(NVL·CONNECT BY·ROWNUM 허용). 방언 중립 SQL 규칙을 폐기하고 `dialect-neutral-sql.md` 를 `oracle-sql-rules.md` 로 바꿈 | 사용자, 22:2x | 이벤트 기록, ⑤a |
| **Tibero 미사용**: `TiberoDialectResolver` archive, caravan 문서를 Oracle 기준으로 | 사용자, 22:24 | ④ (`bcde00d9f`, `8456d54ec`) |
| 위젯 실행기의 PostgreSQL·SQLite 갈래 제거(사용자 확정 3) | 사용자, 21시대 | ③ |
| **CaravanMetaSeeder 가드**: caravan 표가 없을 때 `ORA-00942` 만 경고 뒤 건너뜀 | 사용자 결정, 18:37 승인 | 레인 메모에 18:32 「거절로 원복」 뒤 18:37 승인으로 기록되어 18:37 로 적는다. 조정자 메모는 18:4x 회복 직후 결정으로 기록 |
| **Podman VM 2GB → 3GB**, SGA 900M 유지(문제 생길 때만 1200M) | 사용자, 20:1x 결정·20:20 적용 | 20:20 VM 3GB 재기동 완료(available 959MB). 조정자 메모의 「20:4x」 는 오기. 근거: 스래싱 3회·kswapd 74%·Mac 여유 51% |
| **mcm 연결 풀**: yml 기본 3 유지, 메인 로컬 서버만 기동 시 최대 8·쉬는 연결 2·유휴 60s, local 누수 감지 30s | 사용자, 22:39 | ③d, `be-run` 의 `BE_MCM_POOL_*` |
| **Lazy DS**: 연결 지연 획득은 local 만 켜고 머지, wildfly·prod 는 끔. 개발계 적용은 후속 | 사용자, 23:02 | ③f, 「로컬만 켜고 머지」 |
| 병렬 최대(동시 agent 4)·새 레인에 GLM·opencode·agy 활용·주간 사용량 무시 | 사용자 지시 | 조정자 메모(작업 방식) |
| 메인 로컬 서버 PDB 는 전용 `L_MAIN`, 전환 때 `FREEPDB1` 은 close 만(drop 안 함) | 조정자, 22:18 | `local-cutover.md` §1 |
| 시각은 **KST 통일**(처음 UTC 로 정했다가 철회): `jdbc.time_zone` 없음, Instant 감사 칸 `TIMESTAMP(6)`, 컨테이너 TZ Asia/Seoul | 조정자, 17:22 | `schema-owners.md` §3.1 |
| boolean 은 `NUMBER(1)`+CHECK, 앱 설정 `preferred_boolean_jdbc_type=TINYINT`(처음 BIT 였으나 Hibernate 7.2.12 가 23 이상에서 BIT 를 boolean 으로 매핑해 validate 실패) | 조정자 | `schema-owners.md` §3.1.1 |
| 위젯 정책 A → B: 전용 읽기 DataSource 가 없으면 Oracle 에서도 위젯 SQL 거절(`require-dedicated`, prod.yml 만 기본 true) | 조정자, 18:47 | ③ |
| 동적 표 `MCAAPUSER.TB_MCA_<RULE_ID>` 는 ANY 권한 없이 DBA 가 만들고 GRANT. `TB_SEC_CODE_GROUP·ITEM` 주인은 mcm-core. `RULE_ID` 50자 | 조정자, 17:22 | `memo-ora-mcm-core.md` |
| mdm V1: FK 자식 인덱스 28개 V1 포함, JSON 칸은 VARCHAR2 유지+앱 길이 검사, 운영 Oracle 이 23 미만일 수 있어 boolean 은 NUMBER(1) | 조정자 | `memo-ora-mdm.md` |
| **삭제하지 않고 archive** 로 `git mv`, 삭제는 사용자 승인 뒤 | 회차 규율 | `README.md` §3 |
| 이미 머지된 V1 은 고치지 않음(주석 한 줄도 체크섬이 바뀜), 변경은 V2 이상 | 조정자 | `schema-owners.md` §1 |

## 4. 결정 대기

### 4.1 삭제 승인 15항 (`b8-approval-list.md` 요약)

원칙: 승인 전에는 지우지 않고 `archive/` 로 `git mv` 해서 보존만 한다. 승인된 항목만 `git rm` 한다. 되돌리기는 `git mv` 를 거꾸로 하거나 삭제 커밋 직전에서 `git checkout <커밋>^ -- <경로>` 다.

| 번호 | 대상 | 크기 | 현재 위치·상태 |
|---|---|---|---|
| A1 | 옛 SQL 스냅샷 `db-snapshot/{mdm,mcm}` | 101파일, 약 27MB | `archive/oracle-1007/db-snapshot-sql/`. `snapshot.py convert --from-sql` 의 원본이라 승인 때 보존 여부를 함께 정함 |
| A2 | `scripts/db-snapshot/export.sh`·`import.sh`(sqlite3 필요) | 2파일, 약 8KB | archive. 대체는 `snapshot.py export·import` |
| A3 | `tools/oracle-free/sqlite_to_oracle.py`·`load_snapshot.py` | 2파일, 약 40KB | archive |
| A4 | `scripts/data/notice-mls-to-mcm.mjs`·`.test.mjs` | 2파일, 약 24KB | archive |
| A5 | `scripts/perf/mcm/`(컴파일되지 않는 과거 측정 도구) | 3파일, 약 36KB | archive |
| B1 | `archive/oracle-1007/`(플랫폼 레인이 옮긴 SQLite 샘플 마이그레이션·`LocalSqliteDataSource`·`DialectDetector` 등) | 16파일, 약 92KB | 이미 archive, 최종 삭제만 대기 |
| B2 | `src/backend/mdm/archive/`(SQLite 마이그레이션 19·일시 변환기·방언 판정·`oracle-baseline` 생성기 등) | 49파일 | 같음 |
| B3 | `src/backend/mcm-core/archive/`(SQLite 마이그레이션 16·인터셉터·변환기·`ScreenUsageMssqlDdl` 등) | 27파일 | 같음 |
| B4 | `src/backend/mcm/archive/`(`SchemaArtifacts{Sqlite,Mssql}`·`SqliteBusyRetry`·MSSQL 골든 4 등) | 17파일 | 같음 |
| B5 | `scripts/archive/restart-all.sh`·README(MSSQL 프로파일·틀린 포트의 옛 재기동 스크립트) | 2파일, 12KB | 같음 |
| C1 | `poc/camel-hub-poc/`(폐기 PoC, `sqlite-jdbc` 직접 사용) | 15파일, 약 68KB | 정리 방침부터 승인. 옮겨도 빌드 영향 없음 |
| C2 | `poc/mdm-embedding-bench/`(폐기 PoC) | 17파일, 약 100KB | `docs/mdm/term-embedding.md`·`decisions.md` 가 `results/raw-*.txt` 를 링크하므로 옮기면 링크가 깨짐. 링크를 고치거나 `results/` 만 남기는 결정이 먼저 |
| C3 | `docs/mdm/erd/0{2..6}-*.sqlite.sql` 5개 | 5파일, 약 44KB | ora-mdm 이 archive 할지 Oracle 판으로 교체할지 정함 |
| C4 | `src/backend/mdm/sample/mdm-local-sample.sql`(SQLite 문법 본문) | 1파일, 약 244KB | 같은 데이터가 `db-snapshot/MDMAPUSER` CSV 에 있는지 확인 뒤 archive. `RuleCalcSeedSetTest`·`api/build.gradle`·프런트 시험이 아직 참조 |
| C5 | `src/backend/mcm/sample/widget-rule-calc-defs.sql` | 1파일, 8KB | 위젯 정의 5건이 CSV 에 이미 있음. `Widget-Authoring-Guide.md` 의 인용 문장을 같이 고쳐야 함(ora-mcm-core 소관) |

삭제 대상이 아닌 것: `docs/mdm/dict-candidates/candidates.sqlite`, `poc/mdm-embedding-bench/results/raw-07-sqlite.txt`, `.gitignore` 의 SQLite 항목(로컬 `.db` 가 남은 PC 용, z1 에서 판단), `snapshot.py`·`compare_counts.py`(런북이 쓰는 도구), 머지된 V1 의 머리 주석, 과거 기록 폴더.

### 4.2 그 밖의 결정 대기

| 항목 | 사실 | 결정할 것 |
|---|---|---|
| 남긴 브랜치 `backup/ora-mcm-app-pre-split` | 팁 aa22c98b2(10-07 19:16), dev 에 없는 커밋 4개. `git cherry` 로 3개는 dev 에 같은 패치가 있고 1개(d104c6e46, 지문 골든·Instant 왕복 시험)는 없다. 메모는 조정자·사용자 결정으로 이 브랜치를 그대로 두고 마감 보고에 넘기기로 했다고만 적는다(이름의 뜻은 설명이 없음, 추측: 레인이 커밋을 나누기 전 원본 보관). 같은 때 레인이 정리한 임시 워크트리 `sqlite-base` 는 21:28 에 제거됨 | 보존 또는 삭제. d104c6e46 이 dev 에 없는 이유는 확인하지 않음(추측: 머지 뒤 골든을 다시 만든 것으로 대체) |
| mdm 스냅샷의 E2E 잔여 413행 | `db-snapshot/MDMAPUSER` CSV 에 옛 로컬 DB 의 E2E 시험 잔여 413행(19표, `E2E_USR_*` 등)이 있다. 리포 스냅샷에서는 지우지 않고, 적재기(`snapshot.py import`)가 적재 때 거른다(로그에 「E2E 행 N 거름」, `TPL_DATA` 적재에서 실제 확인). 메인 서버 이관은 `--keep-e2e` 로 사용자 데이터를 그대로 옮겼으므로 `L_MAIN` 의 mdm 에는 이 행이 들어 있다 | 리포 스냅샷에서 영구 삭제할지, `L_MAIN` 에서 지울지 |
| 개발계 WildFly 에서 `dmes.datasource.lazy-connection` 켜기 | 지금은 local 만 true, wildfly·prod 는 false(롤백은 env `DMES_DATASOURCE_LAZY_CONNECTION=false`). 켜기 전에 볼 것(설계 §4): jta 데이터소스를 resource-local 로 쓸 때 CCM 「닫지 않은 연결」 경고, 컨테이너 `transaction-isolation`·`new-connection-sql` 과 감지한 기본값 일치, 위젯 공유 모드 evict, `min-pool-size`·prefill 과 사용 시간 지표, 기동 때 DB 장애로 기본값 감지 실패, 잠금 캐시(UserPermCache 등) 안 첫 SQL | 위 확인 뒤 사용자가 정함 |
| Tibero 옛 비밀번호의 git 이력 | caravan-hub 문서의 설정 예시에 옛 Tibero 접속 정보(`jdbc:tibero:thin:@localhost:8629:tibero` 형 URL 과 `password:` 값 2줄)가 있었다. 이를 문서에서 지운 커밋은 `8456d54ec`(docs, 「Tibero·PostgreSQL·MySQL·H2 설명을 Oracle 기준으로」)이고, `TiberoDialectResolver` 를 archive 한 것은 `bcde00d9f`(refactor, 코드만, 비밀번호 변경 없음)다. 두 커밋은 역할이 다르며 조정자 메모의 「bcde00d9f 무렵」 은 이 둘을 묶어 부른 것이다. 값은 최초 스냅샷 `caa3e5d46`(2026-09-02)부터 git 이력에 남아 있다. 이 값이 실제로 쓰이던 계정인지는 확인되지 않았다 | 실제 계정이면 비밀번호 교체 권고. 이력 정리(rewrite)는 별도 결정. 운영 확인 목록(§4.3)에도 올림 |
| `FREEPDB1` 처분 | 조정자의 옛 데이터(MDM·MCM·MLS·MPN·MPP·MQC·CARAVAN_CONSOLE·dmes_user 사용자)가 들어 있어 drop 하지 않고 close 만 했다. 다시 열 때는 다른 PDB 하나를 먼저 닫는다 | 계속 보존할지 |
| 위젯 `SqlGuard`·실행기의 SQL Server 제거 범위 | 확정됨: `448baab71`(mcm-core)이 위젯 쿼리·쓰기에서 SQLite·SQL Server 갈래와 `SQLITE_BUSY` 재시도를 걷었고, `03e1263da` 가 PostgreSQL 갈래를 걷었다. `SqlGuard` 의 SQL Server 전용 분기(`SET`·`IF` 를 SQL Server 일 때만 막기)는 없어졌고, 4단계 금지 낱말(`WAITFOR`·`KILL`·`SHUTDOWN`·`USE`·`DECLARE`·`WHILE`·`BEGIN` 등)은 **실행 DB 와 관계없이 늘 적용하는 방어로 남겼다**(어느 DB 의 SELECT 문법에도 쓰이지 않아 Oracle 조회를 막지 않고, 겹쳐도 해롭지 않음). `SET`·`IF` 는 Oracle 함수와 겹쳐 막지 않는다 | 차단 낱말을 더 줄일지(현재 유지) |
| `src/frontend/playwright.config.ts` `workers: 1` | 이유 주석이 SQLITE_BUSY 라 옛 것이다(b8 §9.5) | Oracle 동시 로그인 확인 뒤 병렬 허용 여부 |
| `*SqliteTest` 72개 클래스 이름(mdm) | 내용은 이미 Oracle 이고 이름에만 `Sqlite` 가 남음. 조정자가 이번 회차에 하지 않기로 함 | 이름 변경 여부(바꾸면 시험 선택 패턴·문서 참조도 갱신) |
| mdm 분석 도구 Oracle 판 | `docs/mdm/dict-std/embed_terms.py` 등 SQLite 사본을 읽는 도구에 「Oracle 판은 후속」 한 줄만 달았다(`TB_MDM_TERM.EMBEDDING` 일괄 재계산 포함) | Oracle 판 작성 여부 |
| mcm `admin123` 강제 재설정 | `CoreRbacSeeder` 가 매 부팅 때 admin 비밀번호를 `admin123` 으로 재설정한다(2026-06-05 결정, `db-snapshot/README.md` 에 「운영 프로파일 차단은 후속 검토」) | 운영 프로파일 차단 시점 |
| 10-08 오전 Oracle 쿼리 작성 양식 | 사용자 지시로 10-08 08~09시에 양식(들여쓰기 등)을 사용자에게 먼저 요청하고, 받으면 `oracle-sql-rules.md` 에 반영한다(알림 cron 예약) | 사용자 답 |

### 4.3 운영 반영 전 DBA·사용자 확인 필요

이 회차에서 정해지지 않았고 조정자도 모르는 항목이다. 운영 반영 전에 DBA·사용자가 확인한다.

| 항목 | 확인할 것 |
|---|---|
| 운영 Oracle 버전 | 로컬은 26ai Free(23.26). 23 미만이면 IDENTITY·BOOLEAN 등 확인 필요. mdm V1 의 30자 초과 식별자(12.2 이상)·`IS JSON STRICT`(12.1.0.2 이상), mcm-core V1 이 Hibernate OracleDialect(23)로 내보낸 스크립트라는 점. 문서 불일치: Deployment-Guide 는 「Oracle 26ai」, schema-owners 는 23 미만 가능 |
| 위젯 전용 읽기 계정의 SELECT 대상 | 스키마·표 목록(§5 의 1번) |
| 운영 비밀번호 정책·교차 스키마 GRANT | 길이·만료·교체 주기, 운영의 GRANT 목록(§5 의 5번) |
| Tibero 옛 접속 정보가 실제 계정이었는지 | §4.2 의 Tibero 행 |
| 운영 WAS JVM 의 `-Duser.timezone=Asia/Seoul` | §5 의 6번 |

## 5. 운영 안내 (DBA·운영 담당 전달)

| 번호 | 항목 | 내용 |
|---|---|---|
| 1 | 위젯 전용 읽기 계정 | 쿼리 위젯 실행은 읽기 전용 DataSource(`dmes.widget.query.datasource.*`)로 한다. Oracle 의 읽기 전용 트랜잭션은 INSERT·UPDATE·MERGE·FOR UPDATE 를 ORA-01456 으로 막지만 이미 있는 자율 트랜잭션 함수(`PRAGMA AUTONOMOUS_TRANSACTION`)의 쓰기·DB 링크 너머 실행·NEXTVAL 소모·DDL(암묵 커밋)은 막지 못한다(26ai 실측). 그래서 SELECT 권한만 가진 전용 계정이 근본 방어선이다. 이 계정에 자율 트랜잭션 함수·프로시저의 EXECUTE 와 DB 링크 권한을 주지 않고, 쓰기 계정(`MCMAPUSER` 등)을 재사용하지 않는다. 개발계·운영계 WildFly 에는 위젯 전용 JNDI 데이터소스(작은 풀)를 따로 만들고 `WIDGET_QUERY_DS_JNDI` 에 넣는다. 앱 기본 데이터소스(`dsBiz`·`dsCmn`)를 가리키면 같은 풀이라 교착한다. 계정명·JNDI 이름 예시(`READ_WIDGET`·`dsWidgetRead`)는 임의 값이다. **SELECT 를 줄 대상 스키마·표 목록은 아직 정해지지 않았다(운영 반영 전 DBA·사용자 확인 필요, §4.3)** |
| 2 | `WIDGET_QUERY_REQUIRE_DEDICATED` | 키 `dmes.widget.query.require-dedicated`. 코드 기본값 false, `application-prod.yml` 에서만 `${WIDGET_QUERY_REQUIRE_DEDICATED:true}`(`wildfly` 프로파일에 두면 개발계 그룹까지 켜지므로 prod 에만 둠). 켜면 전용 DataSource 가 없을 때 위젯 시험·저장·실행을 모두 거절한다. 운영은 prod 프로파일로 기동해 켜 두고, 급히 풀 때만 env 로 false 를 준다(문서 기본값). 개발계에서 켤지는 메모에서 찾지 못함 |
| 3 | JNDI `java:/jdbc/mcm/*` | DB 종류를 이름에 넣지 않는 규약이다(옛 `java:/jdbc/mssql/mcm/*` 에서 변경). `application-wildfly.yml` 은 mcm·mdm·caravan-hub 세 곳에만 있다(확인). mcm: `dsBiz`(MCMAPUSER, env `JNDI_DS_BIZ`)·`dsCmn`(MCMAPUSER, `JNDI_DS_CMN`)·`dsIF`(EAIUSER, `JNDI_DS_IF`)·`dsCaravan`(CARAVANUSER, `JNDI_DS_CARAVAN`). caravan-hub: mst 는 `JNDI_DS_MST`, 없으면 `JNDI_DS_CARAVAN`, 기본 `java:/jdbc/mcm/dsCaravan` / if 는 `JNDI_DS_IF`, 기본 `java:/jdbc/mcm/dsIF`(mcm 과 같은 이름 재사용). mdm: `java:/jdbc/mdm/dsBiz`(`JNDI_DS_BIZ`). mls·mpp·mqc·mpn·aps-core 는 wildfly 프로파일 파일이 없다. 데이터소스는 모두 `jta="false"`, `connection-url` 은 `jdbc:oracle:thin:@//호스트:1521/서비스`. 상세 `docs/guide/Operations/DMES-Deployment-Guide.md` §2.5 |
| 4 | DBA 가 V 파일 적용, WildFly 에서 Flyway 꺼짐 | 운영·개발계(WildFly)는 `spring.flyway.enabled=false`, mcm 은 `dmes.flyway.enabled=false`(기본 false, local 만 true)로 앱이 기동 때 DDL 을 돌리지 않는다. DBA 가 `V` 파일을 **스키마 주인 계정으로** 적용한다. 스키마 사이에는 순서 의존이 없다. 현재 V 파일은 12개이고 모두 V1 이다(스키마 12개): `src/backend/mcm-core/src/main/resources/db/migration/oracle/{mcmapuser,mcaapuser,mcm_source,mcm_backup}/V1__baseline.sql`, `src/backend/caravan-hub/src/main/resources/db/migration/caravanuser/V1__baseline.sql`·`ifuser/V1__sample_if_table.sql`, `src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle/V1__baseline.sql`, `src/backend/{mls,mpn,mpp,mqc}/api/src/main/resources/db/migration/<모듈>/V1__baseline.sql`, `src/backend/aps-core/src/main/resources/db/migration/aps-core/V1__baseline.sql`. 스키마마다 Flyway 주인 앱은 하나이므로 겹쳐 적용하지 않는다. **머지된 V1 은 불변**(머리 주석 한 줄도 체크섬이 바뀜), 변경은 V2 이상. mcm-core V 파일의 다른 스키마 표에 대한 GRANT 는 Flyway 자리표시자 `${app_user}`(로컬·운영 모두 MCMAPUSER)를 쓴다. Flyway 밖에서 sqlplus 로 적용하면 직접 치환해야 하고, 모든 스키마를 MCMAPUSER 로 돌리면 GRANT 가 ORA-01749 로 실패한다(주인 계정으로 접속). `EAIUSER` 는 표가 없는 접속 사용자이며 `IFUSER` 표 GRANT 는 caravan-hub 마이그레이션이 부여한다 |
| 5 | 스키마 사용자 13명·비밀번호 | `MCMAPUSER`·`MCAAPUSER`·`MCM_SOURCE`·`MCM_BACKUP`(mcm-core), `CARAVANUSER`·`IFUSER`(caravan-hub), `EAIUSER`(표 없음), `MDMAPUSER`, `MLSAPUSER`·`MPPAPUSER`·`MQCAPUSER`·`MPNAPUSER`·`APSAPUSER`. 로컬 비밀번호는 전원 `dmes_password_123` 이고 **로컬 전용**이며 운영 비밀번호는 저장소에 두지 않는다(WildFly vault·credential store 또는 `${env.<변수명>}`). 로컬에서는 `EAIUSER` 를 뺀 사용자에게 `SELECT·INSERT·UPDATE·DELETE ANY TABLE` 을 주지만 이는 운영 교차 스키마 GRANT 를 대신하는 로컬 전용 설정이다. **운영 비밀번호 정책(길이·만료·교체 주기)과 운영의 교차 스키마 GRANT 목록은 아직 정해지지 않았다(운영 반영 전 DBA·사용자 확인 필요, §4.3)**(`EAIUSER` 의 IF 표 권한은 `memo-ora-platform.md` 에 있음: INBOUND 표 SELECT·UPDATE, OUTBOUND 표 INSERT, DELETE 없음, IF 표를 추가할 때마다 GRANT 필요) |
| 6 | KST | 모든 시각을 KST 로 통일한다. JVM `-Duser.timezone=Asia/Seoul` 이 전제이고 Hibernate `time_zone` 은 지정하지 않는다. 로컬은 build-logic 과 `be-run` 이 넣는다. WildFly 는 `standalone.conf` 의 `JAVA_OPTS`(Windows 는 `standalone.conf.bat`)에 추가해야 한다. 운영 JVM 옵션은 확인되지 않았고, 아니면 JPA 감사 칸이 어긋날 수 있다(mdm 후속 2). Oracle 컨테이너 TZ 는 Asia/Seoul, `DBTIMEZONE` 은 +00:00 이며 `TIMESTAMP WITH LOCAL TIME ZONE` 을 쓰지 않아 영향 없음 |
| 7 | Oracle 특성 주의 | (가이드 `oracle-26ai-test-guide.md` §8) `''` 는 NULL(NOT NULL 칸에 빈 문자열이면 ORA-01400, 코드의 `= ''` 비교는 NULL 을 함께 봐야 함). CLOB 칸에 JPQL `UPPER`·`LOWER`·`LIKE` 를 쓰면 `FunctionArgumentException`(네이티브 SQL 로). 엔티티 백틱 칼럼은 소문자 따옴표로 나가 ORA-00904 이고 validate 로 못 잡음. `IDENTITY BY DEFAULT ON NULL` 은 명시 ID 를 따라가지 않음(명시·자동 ID 혼용 시 번호 어긋남·ORA-00001). VARCHAR2 4000바이트 초과는 ORA-12899. IN 목록 1000개 초과 ORA-01795, LIKE 이스케이프의 `[` 는 ORA-01424. 여러 행 `VALUES (…),(…)` 는 23 이상 전용(`INSERT … SELECT … FROM DUAL UNION ALL` 로 바꿈). 읽기 전용 트랜잭션에서 방금 만든·바꾼 표를 읽으면 몇 초간 ORA-01466(잠시 뒤 재시도). 세션 `NLS_SORT`·`NLS_COMP` 는 BINARY 로 확인됨 |
| 8 | 운영 Oracle 23 미만 가능성 | 로컬은 26ai Free(23.26.3)다. 로컬 26ai Free(23.26), 운영 버전 미확인이며 23 미만이면 IDENTITY·BOOLEAN 등 확인이 필요하다(§0 의 문서 불일치, §4.3). mdm V1 의 30자 초과 식별자(12.2 이상)와 `IS JSON STRICT`(12.1.0.2 이상)는 23 미만에서 스모크 확인이 필요하다(mdm 후속 6). boolean 칸은 이 때문에 `NUMBER(1)` 로 둠. mcm-core V1 머리 주석은 Hibernate OracleDialect(23) 로 내보낸 스크립트라고 적혀 있어, 23 미만에서 V1 전체가 적용되는지는 확인된 바 없음(추측: 대부분 표준 DDL, 실측 필요) |
| 9 | 윈도우에서 한 번 확인 | `be-run.ps1` 의 mcm 큰 풀 분기(커밋 e6ba8cfb1 은 `be-run.sh`·`be-run.ps1` 만 바꿈): `DMES_ORA_PDB=L_MAIN`(또는 `BE_MCM_BIG_POOL=1`)일 때 mcm 프로세스에만 `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=8`·`MINIMUM_IDLE=2`·`IDLE_TIMEOUT=60000` 이 전달되고 로그에 `be-mcm 연결 풀: max=8 minIdle=2 idleTimeout=60000ms` 가 찍히는지. 이 PC 는 pwsh 가 없어 실행해 보지 못했다. `be-run.ps1`·`be-run.cmd` 는 `bootRun` 을 쓰므로 `user.timezone` 이 build-logic 으로 적용되는지(문서상 그렇다, 윈도우 실측 없음)도 함께 본다 |
| 10 | 데이터 이관 | 로컬은 `db-snapshot/**.csv` 와 `snapshot.py import`(Python `oracledb` thin, `sqlite3` 불필요)로 적재한다. 운영 데이터 이관 계획은 이 회차 범위 밖이다. 이관 후 `SEQ_MCM_MOM_TC_SEND`·`SEQ_MCM_MOM_TC_ERROR` 는 `MAX(키)+1` 로 다시 맞추고 IDENTITY 는 `START WITH LIMIT VALUE` 로 맞춘다(적재기가 처리). MSSQL 원본의 `TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID=''` 행은 옮기지 않는다 |
| 11 | 업무기준 동적 표 | `MCAAPUSER.TB_MCA_<RULE_ID>` 는 앱이 만들지 않는다. DBA 가 만들고 `MCMAPUSER` 에 `SELECT, INSERT, UPDATE, DELETE` 를 GRANT 한다. 원장 → 사본 동기화(`MCM_SOURCE` → `MCMAPUSER`·`MCM_BACKUP`)는 동기화 관리 화면이 유일한 경로다(트리거·배치 없음) |
| 12 | 연결 풀·지연 획득 | 레인·시험은 Hikari 최대 3 이하(인스턴스 공유). 메인 로컬 mcm 만 8/2/60s. 연결 지연 획득은 local 만 true(기동 로그 `[mcmDataSource] … 연결 지연 획득=true|false` 로 확인). 개발계 WildFly 는 §4.2 |
| 13 | 문서의 자리표시자 | 아직 확정되지 않은 값: `ojdbc11` 실제 버전, WildFly 40 의 `javax.api` 모듈 유무와 datasources 스키마 버전, 포항·김포·운영 Oracle 호스트·서비스명·풀 크기 |
| 14 | 개발 PC | 로컬 Oracle 은 Podman 컨테이너 하나(`oracle-26ai-free`, 도커 금지의 예외). 이 PC 는 VM 3GB·SGA 900M. 다른 PC 는 조정자 결정으로 4GB·기본 SGA 이며 2GB 자동화는 하지 않는다. 16GB 이하 PC 에서 VM 3GB 를 기본값으로 쓸 때의 동시 PDB 권장 수는 메모에서 찾지 못함(기본 상한 3, `DMES_ORA_MAX_OPEN` 로 변경) |

## 6. 후속

레인 정본 메모와 `closing.md` 에서 모았다. 우선순위는 매기지 않았다.

### ora-base

- **analog 시험 픽스처 미커밋(결정 필요)**: `analog/core/src/test/resources/logs/tiny*.log` 등이 저장소에 한 번도 커밋되지 않아(`.gitignore` 예외 줄만 있고 파일이 없음, 2026-07-17 기록 「82건 FileNotFound」) analog core 79건·api 4건이 실패한다(마감 시험 §7.1). 결정: 원본 파일을 받아 커밋하거나 시험을 생성형으로 바꾼다. 같은 회차에 시험이 읽는 운영 로그 샘플 경로 18곳은 `C:/Users/USER/Desktop/...` 에서 `user.home` 기준으로 바꿨다(`b5f1db28e`, 사용자 지시).
- b8 남은 것(`b8-residue.md` §9.5, §10 에 처리 기록이 없어 나열했고 현재 코드와 대조하지는 않았다): `be-run.sh`·`be-run.ps1` 의 `../data` 디렉터리 준비 제거, `.gitignore` 의 SQLite 항목(로컬 `.db` 가 남은 PC 가 있어 z1 에서 판단), `playwright.config.ts:8-9` 주석, `build-logic` `dmes.test-conventions` 의 「../data SQLite」 문구, `pdb.mjs` 의 옛 SQLite 체인 폴더 건너뛰기 분기(해당 폴더가 모두 archive 로 가면 죽은 코드), `DBMS-용어-비교.md`, `scripts/perf/mdm-backend` 이름·주석, `e2e/fixtures/mdm-*.sql` 3개의 SQLite 문법 여부, `docs/guide/Database/oracle-to-mssql-*.md` 폐기 표시.
- 하니스: 잠금 대기와 PDB 복제·삭제 시간을 따로 찍기(mcm 시험 시간 분해용). `pdb.mjs clone` 이 한 번 `SQL 실패(exit 1)` 로 끝났는데 오류 본문을 보지 못했다(L_SPIKE1, 원인 미확인, 다시 나면 sqlplus 출력 전문을 남긴다). 삭제된 PDB 폴더가 빈 채 남는다(해롭지 않음).
- dflow 스킬의 `dialect_check` 장치는 킷 공용이라 남겼다.
- 승인된 삭제의 실행(§4.1)과 §7.2 PDB 정리(승인 뒤 drop).

### ora-mdm (②b, `lanes/ora-mdm/closing.md`)

- `LayoutOasisFlowTest` 11건이 전체 실행에서만 1회 실패(응답 본문이 빔, ORA 없음, 단독 11/11 통과, 재실행 통과). 원인 미확인. 추측: RANDOM_PORT 컨텍스트가 캐시 상한 4 에서 밀려나는 순간과 겹침. 다시 나면 HTTP 상태 코드를 단언 메시지에 남겨 좁힌다.
- 화면 결함 4건(Oracle 무관): `dme` LAY-99·VER-99·SET-99(ruleEdit 「삭제」 버튼 글자 잘림 19>14·`ag-root-wrapper` 0x0), `dmb` LAY-99(layoutMng 버전 이력 그리드 0x0). `m-mdm` `codeConfirm/checks.ts:22` 제목이 길이 검사를 포함하지 않음.
- `mdm-local-sample.sql` 본문(SQLite 문법)과 `RuleCalcSeedSetTest` `@Disabled`(건너뜀 13건의 일부) 재활성: Oracle 샘플이 생길 때 같이 정리.
- 운영 WAS JVM 이 Asia/Seoul 이 아니면 JPA 감사 시각과 `MdmTemporalBinder`(KST 고정)가 어긋날 수 있음. 운영 Oracle 23 미만이면 30자 초과 식별자·`IS JSON STRICT` 스모크.
- `MasterCodeJpaAutoConfiguration` exclude(mdm 은 `TB_SEC_CODE_*` 를 쓰지 않음)가 운영(WildFly)에서도 맞는지 mcm-core 쪽 확인.
- 길이 검사 감수: 4000바이트 상한 검사가 없는 VARCHAR2 JSON 칸(DOMAIN.EXAMPLES·RULE_VAR.PRIO_LIST·TERM.SYNONYMS 등)은 넘치면 ORA-12899. `MetaRevisionRecorder` UNION ALL 의 행별 `REV_SEQ` 순서는 보장되지 않음(소비자가 범위만 쓰면 무해).
- perf 하니스(`scripts/perf/mdm-backend`) 실측, E2E 가 `docs/mdm/tasks/**/screens/*.png` 를 덮어쓰는 문제(실행 뒤 `git restore`).
- 환경 메모: Playwright 1.62.1 은 `chromium_headless_shell-1234` 가 필요한데 캐시에 1243 만 있어 `PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm exec playwright install chromium-headless-shell` 로 추가 설치했다.

### ora-mcm-core (③ 후속, 정본 메모 「후속」)

- WildFly 에서 지연 획득 켜기 전 확인 6항(§4.2).
- mdm·mls 의 local yml 에 `minimum-idle` 이 없어 Hikari 기본(쉬는 연결 = 최대치)대로 연결을 늘 열어 둔다. 사실만 기록, 변경은 안 함.
- 시험 하니스 함정: `:mcm-core:test` 와 `:mcm:api:test` 를 한 gradle 실행에 묶으면 같은 PDB 에서 `clean` 이 서로 표를 지워 ORA-00942. ①e·⑤b 로 직렬 차례를 갖췄으나 모듈마다 따로 돌리는 편이 안전.
- `Widget-Authoring-Guide.md:505` 의 `widget-rule-calc-defs.sql` 예시 문장(C5 처리 때 같이).
- 홈 쿼리 위젯 SQL 6개는 `L_MAIN` 에는 UPDATE 로, 리포 CSV·적재기 후처리(`15233edc7`)로 다음 적재부터 자동 반영된다. 알려진 문안이 아닌 SQLite 문법 위젯은 적재기가 경고만 남기므로 `widget-sql-oracle.md` 규칙대로 고쳐야 한다.

### ora-mcm-app

- 지문 골든(`DataInitializerSeedFingerprintTest`)은 Oracle 에서 다시 만들었고, 옛 골든과 **행 수만 대조**했다(겹치는 56표 일치). 시드가 든 15표의 내용 동일성은 직접 확인하지 않았다(해시 직렬화가 DB 마다 달라 대조 불가). 간접 근거는 호출열이 옛 호출열의 부분열이라는 점뿐이다.
- 시험 시간 분해 못 한 것: 다른 레인이 Oracle 을 쓰지 않는 시간대 측정(run3 이 겹침 의심).

### ora-platform (④ 후속)

- `caravan-hub` `selectPendingMessages` 가 전건 조회라 큐가 쌓이면 부하 위험(javadoc 은 `FETCH FIRST` 라고 적혀 불일치, `DbInboundHandler` 가 자바에서 batchSize 로 끊음).
- `TopicInfoJpaRepository` 의 row-value IN 우회 finder(MSSQL 거부 대응), `KafkaJpaConfig` 의 `caravan.hibernate.dialect` 명시 분기는 값을 지정한 환경이 있으면 우선하므로 지우지 않음(동작 변경 위험).
- `local` persistence-unit 의 `jdbc:h2:` 속성은 삭제 금지 규칙 때문에 남음(승인 뒤 정리).
- `OracleTestDatabase` 가 `dmes.ora.url` 이 없으면 예외로 실패하는 것은 조용한 건너뜀을 막으려는 의도다.
- IF 표를 추가하는 절차에 `EAIUSER` GRANT 단계를 넣는 것이 안전하다.
- 배포 문서의 자리표시자(§5 의 13번).

### 조정자

- 위 각 결정 대기 항목(§4)과 §7.2 PDB 정리 승인.

## 7. 마감 확인

실행: ora-base(z1), 2026-10-07 23:31~23:37, dev `ec40b8a37` 과 같은 트리(feat/ora-base 에 dev 를 합친 상태). 메인 서버 3개가 `L_MAIN` 으로 도는 중이라 Oracle 시험은 서브에이전트로 쪼개지 않고 **빌드 하나**(①e 차례, `-Pdmes.ora.test=clone`, `--continue`)로 한 번만 돌렸다. 시험 PDB 는 `T_ORA_BASE` 하나를 모든 모듈이 차례로 썼고 끝나면 하니스가 지웠다.

### 7.1 전 모듈 시험 결과

명령: `src/backend` 루트에서 `./gradlew :{mpn,mpp,mqc,mls,mcm,mdm}:{lib,api}:test :aps-core:test :cactus-core:oasis-core:test :mcm-core:test :localKafka:api:test :caravan-core:test :caravan-hub:test :caravan-console:test :analog:core:test :analog:api:test :maru-mdm-engine:test -Pdmes.ora.test=clone --continue`. 벽시계 **5분 16초**(PC 잠금 대기·복제·삭제 포함, 이 빌드의 한 번 측정값).

| 모듈 | 시험 수 | 실패 | 건너뜀 | 비고 |
|---|---|---|---|---|
| mdm lib | 2,071 | 0 | 0 | |
| mdm api | 1,856 | 3 | 13 | 3건은 `SampleRuleLifecycleOasisFlowTest` 의 OASIS 연결 핸드셰이크 10초 초과(`Did not receive connection preamble within 10s`). 같은 클래스를 한 번 다시 돌리니 통과(`--rerun`, 16초). 일시적 지연으로 보이며 원인은 확인하지 못함(ORA 오류 아님, VM 정상) |
| mcm-core | 1,239 | 0 | 3 | |
| mcm lib | 16 | 0 | 0 | |
| mcm api | 156 | 0 | 1 | |
| cactus-core(oasis-core) | 686 | 0 | 1 | |
| maru-mdm-engine | 1,686 | 0 | 1 | |
| caravan-core | 102 | 0 | 0 | |
| caravan-console | 59 | 0 | 0 | |
| caravan-hub | 80 | 0 | 0 | |
| aps-core | 3 | 0 | 0 | |
| mls lib·api / mpn lib / mpp lib / mqc lib | 2·1 / 2 / 2 / 2 | 0 | 0 | mls api 1건뿐은 하니스와 무관한 기존 상태. mqc·mpn·mpp 의 api 는 시험 없음 |
| localKafka api | 시험 없음 | - | - | |
| analog core | 158 | **79** | 0 | 모두 `FileNotFoundException`: 시험이 `C:/Users/USER/Desktop/dmes_prd_log/…` 같은 **윈도우 개인 PC 경로의 로그 파일**을 읽는다(이 PC 에 없음). Oracle 과 무관하고 이번 회차 변경과도 무관한 기존 환경 의존 |
| analog api | 30 | **4** | 0 | `LogSearchControllerTest` 등 같은 로그 파일 의존으로 보임(추측: 같은 원인, 개별 확인은 하지 않음) |
| 합계 | 약 8,150 | 86(analog 83 + mdm 3, mdm 3건은 재실행 통과라 실질 83) | 19 | Oracle 을 쓰는 모듈의 실패는 mdm 3건뿐이며 재실행에서 통과 |

보조 확인(Oracle 불필요):

| 항목 | 결과 |
|---|---|
| build-logic 회귀(`tests/run.sh`, 차례 직렬·Test 태스크 배선) | OK(⑤b 머지 뒤 dev 와 같은 트리) |
| 적재기 단위 시험(`python3 scripts/db-snapshot/test_snapshot.py`) | 8/8 통과 |
| 전 모듈 `compileTestJava`(루트 composite) | rc=0(⑤c 머지 뒤) |
| `snapshot.py convert` 두 번 결과 동일, `pdb.mjs migrations` 12개 | OK |
| e2e 도우미 단위(`oracle.unit.spec.ts`) | 19/19 |
| E2E 화면 스펙·사용자 여정, 프런트 단위 | **마감에서 재실행하지 않았다**(서버가 `L_MAIN` 을 쓰는 중). §2 의 ora-mdm 최종 값 인용 |

VM(`podman machine ssh -- free -m`, `/proc/loadavg`):

| 시점 | available | load1 |
|---|---|---|
| 시험 전(23:31) | 749MB | 0.18 |
| 시험 중(1분 간격 샘플 최저·최고) | 700MB | 0.65 |
| 시험 후(23:37) | 771MB | 0.46 |

150MB 경고선 아래로 내려간 적이 없다. 메인 서버·`L_MAIN` 은 건드리지 않았다.

### 7.2 PDB 정리 목록 (drop 하지 않았다, 제안만)

마감 시각(23:40) `pdb.mjs list` 기준이다. 동시 열린 PDB 는 1개(`L_MAIN`)다.

| PDB | 종류 | 상태 | 제안 | 근거·비고 |
|---|---|---|---|---|
| `L_MAIN` | 메인 서버 전용 | 열림 | 유지 | 서버 3개가 사용 중. 롤백은 drop → `clone TPL_SCHEMA` → 재이관 |
| `TPL_EMPTY` | 템플릿(빈 PDB, 사용자 13명) | 닫힘 | 유지 | 시험 하니스의 기본 복제 원본 |
| `TPL_SCHEMA` | 템플릿(V 12개, 데이터 없음) | 닫힘 | 유지 | `L_MAIN` 복제 원본, V 파일이 바뀌면 `--rebuild` |
| `TPL_DATA` | 템플릿(+ CSV 적재, E2E 413행 거름) | 닫힘 | 유지 | 개발자 레인 PDB 복제 원본 |
| `L_ORA_BASE` | ora-base 레인 개발용 | 닫힘 | drop 제안 | 레인 종료. 옛 mcm V1 만 적용된 상태라 쓸모 없음 |
| `L_ORA_MCM_CORE` | ora-mcm-core 레인 개발용 | 닫힘 | drop 제안 | 레인 종료 |
| `FREEPDB1` | 조정자의 옛 PDB | 닫힘 | **drop 하지 않음** | 옛 조정자 데이터(MDM·MCM·MLS·MPN·MPP·MQC·CARAVAN_CONSOLE·dmes_user)가 있다. 처분은 §4.2 |
| `T_*` 시험 PDB | 일회용 | 없음 | - | 마감 시점 잔여 없음(하니스가 삭제). 시험 중 `T_ORA_BASE` 가 있었다가 지워졌다 |

drop 은 사용자 승인 뒤 `node scripts/oracle/pdb.mjs drop <PDB>` 로 한다(`TPL_`·`L_`·`T_` 접두만 받는다).

## 8. 도구·문서 위치

| 대상 | 위치 |
|---|---|
| PDB 도구·PC 잠금·하니스·오류 판별 | `scripts/oracle/README.md`(`pdb.mjs`) |
| 로컬 Oracle 가이드 | `docs/guide/Database/oracle-26ai-test-guide.md` |
| Oracle SQL 규칙·Flyway 스킬 | `docs/guide/Database/oracle-sql-rules.md`, `.claude/skills/flyway-migration-add` |
| 스키마 소유표·연결 규약 | `docs/oracle-1007/schema-owners.md` |
| 메인 서버 전환 런북 | `docs/oracle-1007/local-cutover.md` |
| 적재기·스냅샷 | `scripts/db-snapshot/snapshot.py`, `db-snapshot/README.md`(CSV 기준) |
| 회차 규칙·스파이크 | `docs/oracle-1007/README.md`, `spike.md` |
| 잔재·삭제 승인 | `docs/oracle-1007/b8-residue.md`, `b8-approval-list.md` |
| 레인 정본 메모·시험 시간 | `docs/oracle-1007/memo-ora-{base,mdm,mcm-core,mcm-app,platform}.md`, `perf-ora-{mdm,mcm-core,mcm-app}.md` |
| 설계·변환표 | `design-mcm-lazy-ds.md`, `widget-sql-oracle.md` |
| 운영 배포 | `docs/guide/Operations/DMES-Deployment-Guide.md` §2.5 |
| 조정자 원본(리포 밖, 개인 PC) | 조정자 메모·이벤트 기록·레인 `closing.md` 는 조정자 PC 의 `.coord/oracle-1007/` 에 있다 |
