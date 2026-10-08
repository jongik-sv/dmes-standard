# 예약 작업 관리(push 구조) 구현 계획 — 레인 나누기 색인

> 상세 계획(코드·시험 포함, 정본): `docs/superpowers/plans/2026-10-09-job-scheduler-push.md`. 이 파일은 조정자가 레인을 나눌 때 보는 요약(담당 후보·소유 파일·의존·검증 명령)이다. 둘이 다르면 상세 계획과 설계를 따른다. 상세 계획에서는 위젯 collect 백엔드 삭제가 Task 6 에 들어 있다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCM 이 매분 예약 작업을 판정·선점하고 각 모듈의 `/internal/job/run` 을 호출하며, 모듈의 예약 실행 진입점이 대상 OASIS 서비스를 실행하고 결과를 DB 에 직접 갱신한다.

**Architecture:** 설계 §2 그대로. MCM(`mcm-core` `job/server`, `dmes.job.server.enabled`)이 BPMN 시스템 서비스 `jobDispatch` 로 색인 조회 → `FOR UPDATE SKIP LOCKED` 선점 → 커밋 뒤 호출 풀로 모듈 호출. 모듈(`mcm-core` `job/agent` + cactus-core 새 패키지 `job`)이 접수 → 실행 풀 → `JobRunDispatcher` 가 `serviceStarter.start` → `JobRunResultWriter` 가 REQUIRES_NEW 로 RUN 행 갱신. 유형은 서비스 ID + 입력(내장 서비스 `jobCode`·`jobQuery`·`jobCollect`).

**Tech Stack:** Java 21, Spring Boot, OASIS(BPMN), JdbcTemplate, Oracle 23ai(레인 PDB), Flyway, Next.js(m-mcm), `@dk-oasis/shared`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-job-scheduler-design.md`(1c6782c11). 계획은 설계 절 번호로 요구를 가리킨다. 설계가 정본이고, 이 계획과 다르면 설계를 따른다.

**이 계획의 형식(조정자 지시 job-sched-3 보충):** Task 마다 목표·설계 절·담당 후보·소유 파일·의존·Interfaces·필수 시험·검증 명령·커밋 메시지만 적는다. 코드 블록·세부 코드 조사는 각 구현 레인이 한다(위치 조사는 agy `.claude/skills/coordinator/scripts/search.sh "<질의>"` 먼저).

## Global Constraints

- git 은 `/usr/bin/git`. 삭제는 Task 에 적은 경로에 `git rm`·`git mv` 만. `rm -rf`·`branch -D`·DB 행 삭제 금지. push 금지.
- 공용 DB L_MAIN 에 쓰지 않는다. 워크트리에서 mcm 앱을 L_MAIN 에 붙여 띄우지 않는다(기동하면 V3 가 L_MAIN 에 자동 적용된다). Oracle 시험은 `-Pdmes.ora.test=clone`(빌드마다 TPL_EMPTY 에서 T_<레인> 복제, 끝나면 삭제) 또는 레인 PDB 만.
- JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`(이 PC 에서 `java_home -v 21` 은 jdk-26 을 돌려준다 — 2026-10-09 실측). gradle 은 `--max-workers=2` 이하. 도커 금지(pdb.mjs 경유 Oracle 만 예외).
- cactus-core 기존 클래스(`scheduling`·`oasis/OasisServiceExecutor`·`datasource`·`security`·`MdmRevisionPoller`·`dmom`)와 oasis-core 는 바꾸지 않는다. cactus-core 에는 새 패키지 `com.dongkuk.dmes.cactus.job` 만 더한다. 바꿔야 하면 멈추고 조정자에게 묻는다.
- 보안 설정 변경 없음(확인됨): `/internal/**` 는 `anyRequest().authenticated()`, `ClientKeyFilter` 가 `X-Client-Key` + `X-Authenticated-User: system:mcm` + `X-Authenticated-Role: SYSTEM` 을 `ROLE_SYSTEM` 사전 인증으로 만든다(6개 모듈 yml 모두 client-key 있음). 컨트롤러가 주체 이름·권한을 검사한다.
- 로그: dev `ScheduledJobLogFilter` 는 줄마다 MDC `serviceId` 가 `sch.` 로 시작하는지 본다. logback·sch 분리 설정은 바꾸지 않는다.
- 감사 주체 `SCHEDULER` 는 사용자 표 등록 없이 쓴다(DMOM 의 `SYSTEM` 과 같음, D10).
- `SCHED_AT TIMESTAMP(0)` 은 소수 초를 반올림한다 → 넣기 전 `truncatedTo(ChronoUnit.SECONDS)`.
- shared 기존 컴포넌트의 props·동작·모습은 바꾸지 않는다. 새 공통 컴포넌트는 같은 Task 에서 mantine-aggrid-ui 스킬 컴포넌트 문서·색인까지 갱신한다.
- 운영 프로필(`application-prod.yml`)은 값 없이 자리만 둔다.
- 실행 기록 MSG 와 로그에 주소·인증값·DB 원문 메시지를 넣지 않는다(예외는 종류 이름만).
- `pnpm install` 전에 워크트리 `node_modules` 가 메인 저장소 심볼릭 링크인지 확인한다(심링크면 install 하지 않는다). shared 빌드가 dev watch 때문에 exit 144 로 끝나면 실패가 아니다(dist 확인).
- 스크립트에 macOS 전용 명령을 쓰지 않는다. SQL 서식은 저장소 `oracle-sql-rules.md` 4장(키워드 맨 앞·앞 쉼표·쉼표 조인).
- 시험은 Task 마다 그 Task 의 시험만. 전체 시험은 Task 14 에서 머지 요청 직전 1회.
- 커밋은 Task 마다 Conventional Commits, 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`(작성 모델에 맞게).
- 이미 실패하는 기존 시험 `MomTcErrorSearchOraTest` 는 범위 밖이다.

## Review Focus

1. 같은 회차 이중 실행: MCM 두 대가 같은 분에 선점 → RUN 1행(Task 7 경합 시험).
2. 결과 1회: 시간 초과 감시·쿼리 시간 초과(ORA-01013)·마감 직전 완료가 겹쳐도 RUN 행 갱신은 한 번(Task 4).
3. 대상 서비스 롤백 뒤에도 FAIL 기록이 남음(REQUIRES_NEW, Task 3·4).
4. 웹에서 내장 서비스·`jobDispatch` 를 불러도 실행 거절(Task 6·7).
5. 읽기 시간 초과·5xx 응답을 FAIL 로 바꾸지 않음(RUN 유지, Task 8).

## 파일 구조

- cactus-core `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/job/`: `JobRunScope`·`JobRunState`·`JobRunResultWriter`·`JobRunDispatcher`·`JobRunRequest`·`JobRunOutcome`·자동 설정 `JobRunAutoConfiguration`(+ `AutoConfiguration.imports` 한 줄).
- mcm-core `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/`
  - 루트: `JobConfig`·`JobProperties`·`JobModule`(f1ed4d268, 고침), `JobDataSource`(git rm).
  - `def/`: `CronSpec`·`JobVar`·`JobVars`·`JobDef`(레코드).
  - `agent/`: `JobRunController`·`JobRunAcceptor`·`LocalJobRunGateway`·`ScheduledJob`·`JobContext`·`JobRegistrar`.
  - `builtin/`: `CodeJobService`·`QueryJobService`·`CollectJobService`, `builtin/collect/`(옮겨 온 원천).
  - `server/`: `JobDispatchScope`·`JobDispatchService`·`JobDispatchTrigger`·`JobRunStore`·`JobCallClient`·`JobCallPool`·`JobRunSweepJob`·`JobRunPurgeJob`·`CollectPurgeJob`·`JobSchedMngService`.
- mcm-core 리소스: `db/migration/oracle/mcmapuser/V3__job_scheduler.sql`, `services/job/{jobCode,jobQuery,jobCollect}.bpmn`.
- mcm/api 리소스: `services/job/jobDispatch.bpmn`, `services/csa/jobSchedMng.bpmn`, `application.yml`.
- 프런트: `src/frontend/shared/src/components/…/CronInput`·`VariableTable`(위치는 shared 관례), `src/frontend/m-mcm/page-components/csa/jobSchedMng/**`, 삭제 `src/frontend/m-mcm/widget-types/collect/**`.
- 문서: `docs/mcm/sql/jobSchedMng-menu.sql`, 가이드 한 줄씩.

## 의존 그래프와 레인 묶음

```
T1 ─┬─ T2 ─┬─ T5 ─┬─ T6 ─┐
    │      │      └─ T8 ─┼─ T9 ─ T10 ─ T12 ─ T14
    │      └─ T7 ────────┘            ↑
    └─ T3 ─ T4 ─ (T5·T6·T8 이 진입점 사용)   T11 ─┘   T13(독립, T9 뒤 권장)
```

- 묶음 A(Claude opus/high): T3 → T4 → T7.
- 묶음 B(GLM 또는 opencode): T1 → T2 → T5 → T6 → T8 → T9 → T10.
- 묶음 C(Claude sonnet/high, 프런트): T11 → T12, T13.
- 마무리 T14 는 통합 세션(job-sched).
- 인터페이스 선행: T5·T6·T8 은 T4 의 `JobRunDispatcher`·`JobRunScope` 공개 API 에 기대므로, 묶음 A 는 T3·T4 의 공개 시그니처를 먼저 커밋(본문 미완이어도 컴파일되는 상태)해 묶음 B 를 막지 않는다.

---

### Task 1: V3 수정 + JobDataSource 제거 + 설정

- **담당 후보:** GLM 또는 opencode · **의존:** 없음 · **설계:** §3·§3.5·§4.7·§11 머리
- **목표:** f1ed4d268 의 V3 를 설계 표 4개로 맞추고, MCM 표 직접 연결(`JobDataSource`)을 없애며, `dmes.job.*` 설정을 설계대로 정리한다.
- **소유 파일**
  - Modify: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V3__job_scheduler.sql`
    - 뺄 것: `TB_MCM_JOB_VER` 와 시드, DEF `CODE_SEEN_AT`, `JOB_KIND` CHECK 의 HTTP·PURGE, STATUS CHECK 의 REQ, 머리 주석의 「JOB 전용 연결」.
    - 더할 것: DEF `SERVICE_ID varchar2(200)`·`ACTION varchar2(50)`, 색인 `IX_TB_MCM_JOB_DEF_DUE (USE_YN, NEXT_RUN_AT)`, RUN `RUN_ID varchar2(36)` UNIQUE·`SERVICE_ID`·`SERVICE_TAG varchar2(40)`, 표 `TB_MCM_JOB_HANDLER`(§3.4), 끝에 GRANT(§3.5: RUN `SELECT, UPDATE` / COLLECT·DEF·HANDLER `SELECT, INSERT, UPDATE` → MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER).
  - Modify: `.../mcm/job/JobProperties.java`(연결 설정 삭제, §4.7 키: `module`·`agent.enabled`·`server.enabled`·`server.batch-size`(50)·`schema`(MCMAPUSER)·`pool-size`(4)·`server-name`·`modules.<m>.base-url`·`http.allowed-hosts`·`collect.enabled`(true)), `.../mcm/job/JobConfig.java`(데이터소스 빈 삭제), `.../mcm/config/McmCoreAutoConfiguration.java`(필요 시)
  - git rm: `.../mcm/job/JobDataSource.java`, `src/test/.../mcm/job/JobDataSourceTest.java`
  - Modify: `src/test/.../mcm/testdb/McmCoreOraTestDb.java`(f1ed4d268 의 `TB_MCM_JOB_VER` 제외 되돌림, 새 표 4개를 resetData 대상에 맞춤)
  - Modify: `src/test/.../mcm/oracheck/JobSchemaOraTest.java`
- **Interfaces(Produces):** `JobProperties` getter 들(이름은 키와 같은 camelCase), `JobModule` enum(MCM·MDM·MPP·MLS·MQC·MPN, 앱 모듈 키 해석 §4.7).
- **필수 시험(`JobSchemaOraTest`):** 표 4개 존재, DUE 색인 칸 순서, RUN_ID UNIQUE, STATUS CHECK 가 REQ 거절, JOB_KIND CHECK 가 HTTP 거절, HANDLER PK, `dba_tab_privs`(또는 `all_tab_privs`)로 MDMAPUSER 의 RUN SELECT·UPDATE 있음·DELETE 없음. `JobPropertiesTest`: 기본값·모듈 키 해석.
- **검증:** `cd src/backend/mcm-core && ../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchemaOraTest' --tests '*JobPropertiesTest'`
- **커밋:** `feat(mcm-core): 예약 작업 V3 를 push 설계 표 4개와 모듈 GRANT 로 고치고 JOB 전용 연결을 없앤다`

### Task 2: crontab 식·변수

- **담당 후보:** GLM 또는 opencode · **의존:** T1 · **설계:** §4.0·§5.0
- **목표:** crontab 5칸 식 검사·다음 시각 계산과 변수 확정. 옛 계획(`docs/superpowers/plans/2026-10-08-job-scheduler.md`) Task 2·3 의 코드·시험을 가져오고 아래 변경을 반영한다.
- **소유 파일:** Create `.../mcm/job/def/CronSpec.java`·`JobVar.java`·`JobVars.java`·`JobDef.java`, 시험 `src/test/.../mcm/job/def/CronSpecTest.java`·`JobVarsTest.java`
- **Interfaces(Produces)**
  - `CronSpec.parse(String expr) → CronSpec`(잘못이면 `IllegalArgumentException`, 한국어 메시지), `next(LocalDateTime after) → LocalDateTime`(엄격히 뒤), `describe() → String`, `nextN(LocalDateTime, int) → List<LocalDateTime>`, `minIntervalMinutes() → long`(간격 하한 검사용).
  - `JobVar(String name, String type, String value, String desc)`, `JobVars.parse(String json) → List<JobVar>`, `JobVars.validate(List<JobVar>)`, `JobVars.resolve(List<JobVar>, ResolveCtx) → Map<String,Object>`; `ResolveCtx(LocalDateTime schedAt, LocalDateTime dbNow, LocalDateTime prevRunAt, String jobId, String moduleCd)`.
  - `JobDef` 레코드: DEF 표 칸 전부(§3.1).
- **필수 시험:** §4.0 문법(`*`·`,`·`-`·`/`·이름·`0`/`7` 일요일·매크로), 거절(`?`·`L`·`W`·`#`·6칸·일과 요일 동시 제한), 날짜 변수가 SCHED_AT 기준(`schedAt=00:00`, `dbNow=전날 23:59:59` → `:today`=schedAt 날짜), `:prevRunAt` null 허용, 이름 규칙·중복 거절.
- **검증:** `cd src/backend/mcm-core && ../gradlew test --max-workers=2 --tests '*CronSpecTest' --tests '*JobVarsTest'`
- **커밋:** `feat(mcm-core): 예약 작업 crontab 식 검사와 변수 확정을 더한다`

### Task 3: cactus-core `job` — 범위·상태·결과 갱신

- **담당 후보:** Claude opus/high · **의존:** 없음(T1 과 병행 가능) · **설계:** §4.4(범위·시간 초과 상태)·§4.5·D27·D29
- **목표:** 진입점이 쓰는 실행 범위, 회차 상태 CAS, RUN 행 결과 갱신.
- **소유 파일:** Create `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/job/JobRunScope.java`·`JobRunState.java`·`JobRunResultWriter.java`·`JobRunOutcome.java`·`JobRunAutoConfiguration.java`, `src/backend/cactus-core/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`(한 줄 추가), 시험 `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/job/**`
- **Interfaces(Produces)**
  - `JobRunScope`: `static JobRunScope open(String runId, String jobId, Map<String,Object> config, Instant deadline)`(이미 열려 있으면 `IllegalStateException`), `static Optional<JobRunScope> current()`, `static JobRunScope require()`(없으면 「예약 실행 밖 호출」 예외), `addItems(int)`, `itemCount() → Integer`, `addCollected(String key, BigDecimal num, String txt, String slot)`, `collected() → List<…>`, `remainingSeconds() → int`(올림·최소 1), `resetForAttempt(Instant deadline)`, `close()`.
  - `JobRunState`: `RUNNING`·`DONE`·`TIMED_OUT` + `AtomicReference` 래퍼 `tryFinish()`·`tryTimeout()` → boolean.
  - `JobRunOutcome(String status, Integer itemCnt, String msg, List<CollectedValue> collected)`; status ∈ OK·FAIL·TIMEOUT.
  - `JobRunResultWriter.write(String runId, JobRunOutcome, String serverNm, String serviceTag) → boolean`(갱신 1행이면 true, 0행이면 「늦은 결과」 WARN 후 false). 기본 DataSource, `TransactionTemplate`(REQUIRES_NEW), 접두 `dmes.job.schema`, 실패 시 5초 뒤 1회 재시도 후 WARN.
- **필수 시험:** 범위 재진입 거절, `remainingSeconds` 올림·최소 1, CAS 한쪽만 이김(두 스레드), 결과 갱신 OK·0행 WARN·수집 값 OK 일 때만 MERGE·FAIL 이면 수집 저장 안 함·바깥 트랜잭션 롤백 뒤에도 갱신 남음·5초 재시도(시계 주입). Oracle 시험은 cactus-core 의 Oracle 시험 관례를 따르고 없으면 mcm-core `JobRunResultWriterOraTest` 로 둔다.
- **검증:** `cd src/backend/cactus-core && ../gradlew test --max-workers=2 --tests '*cactus.job*'` (+ Oracle 시험이면 `-Pdmes.ora.test=clone`)
- **커밋:** `feat(cactus-core): 예약 실행 범위·회차 상태와 실행 결과 DB 직접 갱신을 더한다`

### Task 4: cactus-core `job` — 예약 실행 진입점 `JobRunDispatcher`

- **담당 후보:** Claude opus/high · **의존:** T3 · **설계:** §4.4 전부·§5.3·D27·D31, 본보기 `dmom/receiver/DmomReceiveDispatcher`·`oasis/OasisServiceExecutor`
- **목표:** 웹 없이 대상 서비스를 실행하고 결과를 한 번만 갱신하는 새 서비스 유형.
- **소유 파일:** Create `.../cactus/job/JobRunDispatcher.java`·`JobRunRequest.java`, 자동 설정 갱신(`JobRunAutoConfiguration`), 시험 `.../cactus/job/JobRunDispatcherTest.java`(+ 서비스 3겹 시험용 시험 BPMN 리소스)
- **Interfaces(Produces)**
  - `JobRunRequest(String runId, String jobId, String module, String serviceId, String action, Map<String,Object> inputs, Map<String,Object> config, int timeoutSec, Retry retry, LocalDateTime schedAt, boolean manual, String reqUserId)`; `Retry(int count, int intervalMin)`.
  - `JobRunDispatcher.submit(JobRunRequest, ExecutorService pool, ScheduledExecutorService watchdog)` — 풀에 시도 1을 넣는다. 거절이면 `RejectedExecutionException` 을 그대로 던진다(접수가 503 으로 바꿈).
  - 내부: MDC(`service_tag`·`serviceId`=대상·`txId`·`runId`), 시작·끝 줄, `CactusAudit`(SCHEDULER 또는 reqUserId, menuId=jobId) → `AuditHolder`·`sc.setAudit`, `UserContextHolder` 넣고 비우기, `JobRunScope.open`, `serviceStarter.start(serviceId, sc)`, 결과 판정(SUCCESS→OK, 그 밖 FAIL, 원인이 `SQLTimeoutException`·`QueryTimeoutException`·ORA-01013 → TIMEOUT), `Throwable`→FAIL, 시도마다 감시(`timeoutSec`, CAS 이긴 쪽만 결과, 감시가 이기면 `cancel(true)` + TIMEOUT), 재시도는 `intervalMin` 뒤 풀에 새로 넣기(가득이면 그때까지 FAIL 기록), MSG 「재시도 n/N」, finally 정리.
- **필수 시험:** SUCCESS→OK 1회, 실패→FAIL(원문 메시지 없음), 감시 TIMEOUT 1회·늦은 완료 갱신 안 함, 쿼리 시간 초과(`DBMS_SESSION.SLEEP`, Oracle)→DML 롤백·TIMEOUT 1회, 대상 롤백 뒤 FAIL 기록 남음, 마감 직전 완료와 감시 경합 갱신 1회, 재시도 1회차 FAIL→2회차 OK(건수 안 쌓임), `Error`→FAIL, 서브서비스 3겹 갱신 1회, 재진입 거절(바깥 회차 OK 유지), 실행 로그 MDC serviceId 가 `sch.` 아님.
- **검증:** `cd src/backend/cactus-core && ../gradlew test --max-workers=2 --tests '*JobRunDispatcher*'`(Oracle 항목은 mcm-core `*OraTest` 로 두고 `-Pdmes.ora.test=clone`)
- **커밋:** `feat(cactus-core): 예약 실행 진입점이 대상 서비스를 실행하고 시간 초과·재시도·결과 갱신을 한 번만 한다`

### Task 5: mcm-core `agent` — 접수·코드 작업 등록

- **담당 후보:** GLM 또는 opencode · **의존:** T2, T4(공개 시그니처) · **설계:** §4.4 접수 1~7·§4.3 마지막 줄·§5.2·§4.10
- **목표:** 모든 모듈 앱의 `/internal/job/run` 접수와 기동 때 코드 작업 등록.
- **소유 파일:** Create `.../mcm/job/agent/JobRunController.java`·`JobRunAcceptor.java`·`LocalJobRunGateway.java`·`ScheduledJob.java`·`JobContext.java`·`JobRegistrar.java`, 시험 `src/test/.../mcm/job/agent/**`
- **Interfaces(Produces)**
  - `ScheduledJob`(§5.2 시그니처 그대로), `JobContext`(`jobId()`·`runId()`·`schedAt()`·`vars() → Map<String,Object>`).
  - `JobRunAcceptor.accept(JobRunRequest) → AcceptResult`; `AcceptResult` = ACCEPTED·DUPLICATE·HANDLER_NOT_FOUND·RUNNING·POOL_FULL·WRONG_MODULE + `serverNm`. 실행 풀(`pool-size`, 대기열 0), 최근 runId 1시간, 실행 중 jobId 집합.
  - `JobRunController`: `POST /internal/job/run` → 주체 `system:mcm`·`ROLE_SYSTEM` 아니면 403, `AcceptResult` → 202·200·404·409·503·400. `dmes.job.agent.enabled=false` 면 404.
  - `LocalJobRunGateway.call(JobRunRequest) → AcceptResult`(MCM 앱 자신, HTTP 없음).
  - `JobRegistrar`: `ApplicationReadyEvent` 에 자기 모듈 `ScheduledJob` 빈 → HANDLER MERGE(`SEEN_AT`), `defaultCron` 있는 빈만 DEF `WHEN NOT MATCHED` INSERT(SERVICE_ID `jobCode`, ACTION `run`, OWNER_TP CODE, CONFIG `{handlerId}`, NEXT_RUN_AT 계산). 실패 WARN 1회·1분 뒤 1회.
- **필수 시험:** 접수 결과별 HTTP 코드(MockMvc, 사용자 주체 403·키 없음 401), 중복 runId 200, 풀 가득 503, 처리기 없음 404, 같은 jobId 실행 중 409, 등록이 화면 값을 덮어쓰지 않음, 모듈 키가 다른 빈은 등록 안 함, 두 앱 동시 등록에도 DEF 1행(Oracle).
- **검증:** `cd src/backend/mcm-core && ../gradlew test --max-workers=2 --tests '*job.agent*'`(+ `-Pdmes.ora.test=clone --tests '*JobRegistrarOraTest'`)
- **커밋:** `feat(mcm-core): 모든 모듈 앱에 예약 실행 접수와 코드 작업 기동 등록을 더한다`

### Task 6: mcm-core `builtin` — 내장 서비스

- **담당 후보:** GLM 또는 opencode · **의존:** T4, T5 · **설계:** §5.1·§5.4·§8·D13·D23·D31
- **목표:** `jobCode`·`jobQuery`·`jobCollect` 내장 서비스와 수집 원천 이전.
- **소유 파일**
  - Create: `src/backend/mcm-core/src/main/resources/services/job/jobCode.bpmn`·`jobQuery.bpmn`·`jobCollect.bpmn`(서비스 태스크 하나, `camunda:class`=빈, `method=run`, 본보기 `src/backend/mcm/api/src/main/resources/services/audit/screenUsage.bpmn`), `.../mcm/job/builtin/CodeJobService.java`·`QueryJobService.java`·`CollectJobService.java`·`QueryStatementGuard.java`
  - git mv: `.../mcm/widget/collect/{CollectConfig,CollectConfigs,CollectException,CollectItem,CollectSource,SqlCollectSource,HttpCollectSource,ExchangeCollectSource}.java` → `.../mcm/job/builtin/collect/`, 시험 `CollectConfigsTest`·`CollectSourcesTest` 도 같이 옮김
  - Modify: `WidgetCollectProperties` 대체 — `dmes.job.http.allowed-hosts`(옛 `dmes.widget.collect.allowed-hosts` 있으면 warn 후 함께 읽음)
- **Interfaces(Produces):** 각 서비스 `run(Map<String,Object> in) → Map<String,Object>`(첫 줄 `JobRunScope.require()`), 건수는 `JobRunScope.addItems`, 수집 값은 `addCollected`. 입력 파라미터가 있으면 그 값, 없으면 `JobRunScope` 의 config.
- **필수 시험:** 범위 없이 부르면 거절(웹 경로 시뮬레이션), QUERY 한 문장·DDL/COMMIT/ROLLBACK 거절·프로시저 허용, 쿼리 시간 초과 값이 남은 초(올림·최소 1)·collect SQL 은 min(10, 남은 초), collect `save:false` 면 수집 값 버퍼 비어 있음, HTTP 허용 호스트·옛 키 warn, CODE 처리기 없음 → 실패 결과.
- **검증:** `cd src/backend/mcm-core && ../gradlew test --max-workers=2 --tests '*job.builtin*'`
- **커밋:** `feat(mcm-core): 예약 작업 내장 서비스 code·query·collect 를 더하고 수집 원천을 job 패키지로 옮긴다`

### Task 7: mcm-core `server` — 판정·선점

- **담당 후보:** Claude opus/high · **의존:** T1, T2 · **설계:** §4.1·§4.2·§4.8·§8·D17·D28
- **목표:** 매분 트리거 → `jobDispatch` BPMN → 색인 조회·`FOR UPDATE SKIP LOCKED` 선점.
- **소유 파일:** Create `.../mcm/job/server/JobDispatchScope.java`·`JobDispatchService.java`·`JobDispatchTrigger.java`·`JobRunStore.java`(RUN INSERT·접수 UPDATE·SKIP/FAIL 닫기 SQL), `src/backend/mcm/api/src/main/resources/services/job/jobDispatch.bpmn`, 시험 `src/test/.../mcm/job/server/JobDispatchServiceOraTest.java`·`JobDispatchTriggerTest.java`
- **Interfaces(Produces)**
  - `JobDispatchService.claimDue(Map<String,Object> in) → Map<String,Object>`; 출력 `claimed = {runs: List<JobRunRequest>, more: boolean}`. 첫 줄 `JobDispatchScope` 검사.
  - `JobRunStore`: `insertRun(...)`, `markAccepted(runId, serverNm)`(SERVER_NM 만), `closeIfRunning(runId, status, msg)`(`WHERE STATUS='RUN'`).
  - `JobDispatchTrigger.tick()`(`@Scheduled(cron="0 * * * * *", zone="Asia/Seoul")`, `dmes.job.server.enabled` 일 때만) → MDC serviceId·txId 저장·교체·복원, `serviceStarter.start("jobDispatch", sc)`(SCHEDULER, menuId JOB_DISPATCH), `more` 면 최대 10번, runs 를 `JobCallPool`(T8)에 넘김. T8 전에는 `Consumer<List<JobRunRequest>>` 로 주입받아 시험.
- **필수 시험(Oracle, `-Pdmes.ora.test=clone`):** 두 판정 인스턴스(서로 다른 연결) 경합 → 회차당 RUN 1행, 120건 → 50·50·20 묶음, 빈 틱은 조회 SQL 1회·커밋 없음, 늦은 회차(2분 초과) SKIP 1건, 겹침 SKIP, 조회와 잠금 사이 사용 안 함 → 건너뜀, NEXT_RUN_AT 이 crontab 다음 시각, SCHED_AT 초 단위, `:prevRunAt` 은 S 회차만, 몸체 예외 → 선점 0·WARN 1줄·다음 분 정상, 웹 경로 거절, 판정 SQL 줄 MDC serviceId=`jobDispatch`.
- **검증:** `cd src/backend/mcm-core && ../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobDispatch*'`
- **커밋:** `feat(mcm-core): MCM 이 매분 jobDispatch 로 예약 작업을 색인 조회하고 SKIP LOCKED 로 선점한다`

### Task 8: mcm-core `server` — 호출·정리

- **담당 후보:** GLM 또는 opencode · **의존:** T5, T7 · **설계:** §4.3·§4.6(정리)·§4.7·§5.2 표(정리 3개)
- **목표:** 호출 풀이 모듈을 부르고 응답별로 RUN 행을 닫으며, 정리 코드 작업 3개를 둔다.
- **소유 파일:** Create `.../mcm/job/server/JobCallPool.java`·`JobCallClient.java`·`JobRunSweepJob.java`·`JobRunPurgeJob.java`·`CollectPurgeJob.java`, 시험 `src/test/.../mcm/job/server/JobCallClientTest.java`(가짜 모듈 HTTP)·`JobRunSweepOraTest.java`
- **Interfaces(Produces):** `JobCallPool.submit(List<JobRunRequest>)`(스레드 8·대기열 200, 호출마다 `MDCTemplate` + MDC serviceId `jobDispatch`·runId), `JobCallClient.call(JobRunRequest) → CallResult`(연결 2초·읽기 5초, 헤더는 `MdmMetaClient` 규칙, MCM 모듈이면 `LocalJobRunGateway`).
- **필수 시험:** 202→SERVER_NM 만, 200 duplicate→같음, 503→SKIP, 409→SKIP, 404→FAIL, 연결 거부→FAIL, 읽기 시간 초과→RUN 유지·WARN, 5xx→RUN 유지, 재시도 없음, MSG 에 주소 없음. 정리: 300초 여유 뒤 TIMEOUT, 보관 삭제 90일, collect.enabled=false 면 수집 정리 0.
- **검증:** `cd src/backend/mcm-core && ../gradlew test --max-workers=2 --tests '*JobCallClientTest'` 그리고 `-Pdmes.ora.test=clone --tests '*JobRunSweepOraTest'`
- **커밋:** `feat(mcm-core): MCM 호출 풀이 모듈 /internal/job/run 을 부르고 응답별로 회차를 닫으며 정리 작업을 더한다`

### Task 9: 기존 `@Scheduled` 이관 + 위젯 collect 백엔드 삭제 + 모듈 설정

- **담당 후보:** GLM 또는 opencode · **의존:** T5, T6, T8 · **설계:** §1 표·§5.2 표·§6·§4.7
- **목표:** 중복 실행되던 예약 작업을 코드 작업으로 옮기고 위젯 collect 백엔드를 없앤다.
- **소유 파일**
  - Modify: `.../mcm/screenusage/service/ScreenUsageRollup.java`(`@Scheduled` 제거, `ScheduledJob` 구현 `mcm.screenUsageRollup`·`0 2 * * *`·30분), `.../mcm/audit/service/RevokedTokenPurger.java`(`mcm.revokedTokenPurge`·`0 * * * *`·10분). 공개 메서드는 그대로.
  - git rm: `.../mcm/widget/collect/{WidgetCollector,WidgetCollectWriter,WidgetCollectReader,WidgetCollectConfig,WidgetCollectProperties}.java`, `widget/collect/entity/**`·`widget/collect/repository/**`(collect 전용인 것만, 확인 후), 시험 `WidgetCollectorJpaTest.java`
  - Modify: `widgetData/run` 의 collect 분기(위치 agy 검색), `.../mcm/widget/admin/service/WidgetDefConfigRules.java` collect 검사, 관련 시험
  - Modify: 6개 모듈 `src/backend/<m>/api/src/main/resources/application.yml` 에 `dmes.job`(MCM 만 `server.enabled: true` + `modules` base-url 블록 §4.7), 각 `application-prod.yml` 은 자리만
- **필수 시험:** `ScreenUsageRollupTest` 등 기존 시험 통과, 두 처리기가 MCM 앱에서만 등록, mcm-core 컴파일·위젯 시험 통과, 앱 컨텍스트 기동 시험(있는 것) 통과.
- **검증:** `cd src/backend/mcm-core && ../gradlew compileJava compileTestJava test --max-workers=2 --tests '*ScreenUsage*' --tests '*RevokedToken*' --tests '*Widget*'`
- **커밋:** `refactor(mcm-core): 기존 예약 작업을 코드 작업으로 옮기고 위젯 자동 수집 백엔드를 없앤다`

### Task 10: 관리 서비스 `jobSchedMng` + 메뉴 SQL

- **담당 후보:** GLM 또는 opencode · **의존:** T2, T7, T8 · **설계:** §7(서버 호출)·§4.9·§8·D8·D11·D13
- **목표:** 화면이 쓰는 OASIS 서비스 9개 action 과 메뉴 등록 SQL.
- **소유 파일:** Create `src/backend/mcm/api/src/main/resources/services/csa/jobSchedMng.bpmn`, `.../mcm/job/server/JobSchedMngService.java`, `docs/mcm/sql/jobSchedMng-menu.sql`(MERGE 멱등, 객체 `jobSchedMng`, componentPath `csa/jobSchedMng`, FULL_SEQ `1020220`, SYSADMIN `PERM_ALL`), 시험 `src/test/.../mcm/job/server/JobSchedMngServiceOraTest.java`. DataInitializer 를 고쳐야 하면 이 Task 에서(겹칠 수 있는 파일로 보고).
- **Interfaces(Produces):** action `list`·`get`·`save`·`setUse`·`runNow`·`history`·`cronPreview`·`handlers`·`delete` 의 입력·출력 JSON(화면 Task 12 가 그대로 씀) — 각 action 의 필드 목록을 서비스 Javadoc 과 시험에 고정한다.
- **필수 시험:** 저장 검사(crontab·간격 하한·QUERY 문장·유형별 SERVICE_ID 결정), CODE 작업 삭제·유형 변경 거절, USER 삭제 시 정의·이력·수집 값 함께, 「지금 실행」 REQUIRES_NEW·FOR UPDATE 대기 5초·RUN 중 거절·NEXT_RUN_AT 불변, `handlers` 의 7일 「코드 없음」.
- **검증:** `cd src/backend/mcm-core && ../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchedMng*'`
- **커밋:** `feat(mcm): 예약 작업 관리 서비스 jobSchedMng 와 메뉴 등록 SQL 을 더한다`

### Task 11: shared 공통 컴포넌트 `CronInput`·`VariableTable`

- **담당 후보:** Claude sonnet/high · **의존:** 없음 · **설계:** §4.0(화면)·§7 마지막 줄, CLAUDE.md 공통 컴포넌트 행동강령
- **목표:** 시안 `src/frontend/m-design-dummy/src/screens/job-scheduler/{CronInput,CronEasyEditor,CronDirectEditor,VariableTable}.tsx`·`cron.ts` 를 `@dk-oasis/shared` 새 컴포넌트로 등록. 미리보기(설명·다음 5개)는 props 콜백으로 서버 값을 받게 한다.
- **소유 파일:** shared 의 새 컴포넌트 폴더(관례 위치), shared export 색인, 시험 `src/frontend/shared/tests/unit/…`, mantine-aggrid-ui 스킬 컴포넌트 문서·색인.
- **필수 시험:** 쉬운 설정 ↔ 식 변환(옛 계획 Task 12 시험), 직접 입력 오류 표시, 변수 표 추가·삭제·이름 검사.
- **검증:** `pnpm --filter @dk-oasis/shared test:unit -- Cron Variable` 그리고 `pnpm --filter @dk-oasis/shared build`(exit 144 면 dist 확인), 스킬 audit 0건.
- **커밋:** `feat(shared): crontab 입력 CronInput 과 변수 표 VariableTable 공통 컴포넌트를 등록한다`

### Task 12: m-mcm 화면 `csa/jobSchedMng`

- **담당 후보:** Claude sonnet/high · **의존:** T10(action 계약), T11 · **설계:** §7, RULE.md 라우팅·mantine-aggrid-ui 스킬
- **목표:** 시안을 운영 화면으로 옮긴다(유형 카드 4개, CODE 처리기 고르기, COLLECT 「저장 안 함」, 이력에 서비스 태그, 이어 실행 없음, 「코드 없음」 배지).
- **소유 파일:** Create `src/frontend/m-mcm/page-components/csa/jobSchedMng/**`(배치는 `csa/commWidgetMng` 와 같은 골격), 화면 단위 시험.
- **필수 시험:** 목록 조회·필터, 새 작업 유형 4개, 저장 검증 오류 표시, 「지금 실행」 결과 표시, CODE 작업은 삭제·유형 변경 불가.
- **검증:** `pnpm --filter m-mcm exec tsc --noEmit`, `pnpm --filter m-mcm test -- jobSchedMng`, 스킬 audit 0건.
- **커밋:** `feat(m-mcm): 공통관리 시스템관리에 예약 작업 관리 화면을 더한다`

### Task 13: 위젯 collect 프런트 삭제

- **담당 후보:** Claude sonnet/high · **의존:** 없음(T9 와 같은 시기 권장) · **설계:** §6 「없앰」 프런트·사용자 결정 13
- **목표:** 위젯 「자동 수집」 유형만 지우고 다른 위젯 유형 동작은 그대로 둔다.
- **소유 파일:** git rm `src/frontend/m-mcm/widget-types/collect/**`, Modify 위젯 유형 등록부·위젯 도움말의 collect 부분(위치 agy 검색).
- **필수 시험:** 위젯 관련 기존 단위 시험 통과, 유형 목록에 collect 없음.
- **검증:** `pnpm --filter m-mcm exec tsc --noEmit`, `pnpm --filter m-mcm test -- widget`
- **커밋:** `refactor(m-mcm): 위젯 자동 수집 유형을 없앤다`

### Task 14: 마무리 — 가이드·골든·전체 시험

- **담당 후보:** 통합 세션(job-sched, Claude) — 실행은 agy · **의존:** T1~T13 · **설계:** §4.4(가이드 권장)·§9 마지막 줄·§10
- **목표:** 가이드 두 줄, 골든·TPL_SCHEMA 절차, 전체 시험 1회, 머지 요청 준비.
- **소유 파일:** 백엔드 가이드(`docs/guide/BackEnd/Backend-Implementation-Guide.md`)에 「긴 SQL 은 쿼리 시간 초과」·「내장 서비스는 createNewService·병렬 게이트웨이·병렬 다중 인스턴스 안에서 부르지 말 것」, `DataInitializerSeedFingerprintTest` 골든 다시 만들기(바뀐 경우), V3 번호 충돌 재확인(dev).
- **검증:** mcm-core·cactus-core 전체 시험(`-Pdmes.ora.test=clone`), m-mcm·shared tsc·test·audit. 결과는 agy 로 요약.
- **커밋:** `docs(guide): 예약 작업 내장 서비스 사용 주의를 백엔드 가이드에 적는다`(+ 골든이 바뀌면 `test: …`)

## Self-Review

| 설계 절 | Task |
|---|---|
| §3·§3.5 표·GRANT | 1 |
| §4.0·§5.0 | 2 |
| §4.1·§4.2·§4.8 판정·선점·로그 | 7 |
| §4.3 호출 | 8 |
| §4.4 접수 | 5 |
| §4.4 진입점·시간 초과·중첩 | 3·4 |
| §4.5 결과 갱신 | 3 |
| §4.6 정리 | 8 |
| §4.7 설정 | 1·9 |
| §4.9 지금 실행 | 10 |
| §4.10·§8 보안 | 5·6·7 |
| §5.1·§5.4 내장 서비스 | 6 |
| §5.2 코드 작업·등록 | 5·9 |
| §6 없앰·옮김 | 6·9·13 |
| §7 화면 | 10·11·12 |
| §9 시험 | 각 Task 필수 시험 + 14 |
| §10 DB 적용·메뉴 | 10·14(L_MAIN 적용은 머지 뒤 조정자) |

- 자리표시자: Task 마다 파일·인터페이스·시험·명령·커밋이 있다. 코드 본문은 형식상(조정자 지시) 구현 레인 몫이다.
- 이름 일관성: `JobRunRequest`(T4) ← T5·T7·T8, `JobRunScope`(T3) ← T4·T6, `ScheduledJob`(T5) ← T8·T9, `JobRunStore`(T7) ← T8·T10.
