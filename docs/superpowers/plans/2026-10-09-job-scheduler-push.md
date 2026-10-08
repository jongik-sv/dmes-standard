# 예약 작업 관리(push 구조) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCM 이 매분 한 번 색인 조회로 실행할 작업을 판정·선점(BPMN 서비스 `jobDispatch`)하고, 6개 모듈 앱(MCM·MDM·MPP·MLS·MQC·MPN)의 `POST /internal/job/run` 으로 푸시하면, 각 모듈의 「예약 실행 진입점」이 대상 서비스를 실행하고 결과를 DB 에 직접 갱신하게 한다. MCM 공통관리 화면(`csa/jobSchedMng`)에서 작업을 등록·관리하고, 위젯 「자동 수집(collect)」 유형은 지운다.

**Architecture:** cactus-core 의 새 패키지 `job` 이 모듈 쪽 공통 코드(실행 범위·진입점·결과 갱신)를 맡고, mcm-core 의 `com.dongkuk.dmes.mcm.job` 이 crontab 식·변수(`def`)·접수와 코드 작업 등록(`agent`)·내장 서비스(`builtin`)·MCM 전용 판정·호출·관리(`server`)를 맡는다. 판정은 `@Scheduled` 트리거 → BPMN `jobDispatch`(자기 트랜잭션에서 조회·선점·커밋) → 트랜잭션 밖 호출 풀 순이다. 정의 캐시·모듈 claim·결과 HTTP 보고는 없다.

**Tech Stack:** Java 21, Spring Boot 4(Spring 7) `CronExpression`·`JdbcTemplate`·`TransactionTemplate`·`RestClient`, OASIS(BPMN) `ServiceStarter`, Oracle(레인 PDB, `FOR UPDATE SKIP LOCKED`), Flyway, ArchUnit, JUnit 5·AssertJ·Mockito, Next.js(m-mcm)·`@dk-oasis/shared`(Mantine 9·ag-grid 33), vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-job-scheduler-design.md` (설계 커밋 1c6782c11). 실행자는 이 계획과 함께 반드시 읽는다. 모든 Task 는 설계의 절 번호(§)를 인용한다. 설계와 다르게 하는 곳은 아래 「설계와 다름」 표와 각 Task 의 「설계와 다름」 줄에 적었다.
화면 시안: `src/frontend/m-design-dummy/src/screens/JobSchedulerScreen.tsx`, `src/frontend/m-design-dummy/src/screens/job-scheduler/**`.
옛 계획(`docs/superpowers/plans/2026-10-08-job-scheduler.md`, 결정 15 이전 claim 구조)은 고치지 않는다. 그 Task 2·3·12·13·14 의 코드를 가져와 설계 §5.0(날짜 변수 SCHED_AT 기준, `prevRunAt` 은 `TRIGGER_TP='S'`)에 맞춰 고쳤다.

## Global Constraints

아래는 모든 Task 의 요구에 암묵적으로 들어간다.

- 워크트리 `/Users/jji/project/dmes-wt/job-scheduler-mng`(브랜치 `feat/job-scheduler-mng`) 안에서만 작업한다. git 은 `/usr/bin/git`. 복합 셸 명령(`&&`·`;`)은 거절될 수 있으니 하나씩 실행한다. **push 하지 않는다.**
- 삭제는 Task 에 적은 경로에 `git rm` 만 쓴다. `rm -rf`·`branch -D`·DB 행 삭제 금지.
- **공용 DB L_MAIN 에 쓰지 않는다.** 워크트리에서 mcm 을 L_MAIN 에 붙여 띄우지 않는다(기동하면 V3 가 L_MAIN 에 자동 적용된다). Oracle 시험은 `-Pdmes.ora.test=clone`(빌드마다 `TPL_EMPTY` 에서 `T_<레인>` PDB 를 새로 복제하고 끝나면 지운다) 또는 레인 PDB(`-Pdmes.ora.pdb=<PDB>`)로만 돌린다. 그래서 V3 를 제자리에서 고쳐도 된다.
- JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`(이 PC 에서 `java_home -v 21` 은 jdk-26 을 돌려준다 — 2026-10-09 실측) 뒤 Gradle. `--max-workers=2` 이하. 도커 금지(`scripts/oracle/pdb.mjs` 경유 Oracle 만 예외).
- **cactus-core 의 기존 클래스(`scheduling`·OASIS 실행기 `oasis/**`·`datasource`·`security`·`MdmRevisionPoller`)와 oasis-core 는 바꾸지 않는다.** cactus-core 에는 새 패키지 `job` 과 자동 설정 등록 한 줄(`AutoConfiguration.imports`)만 더한다. 바꿔야 하면 멈추고 조정자에게 묻는다.
- shared 기존 컴포넌트의 props·동작·모습은 바꾸지 않는다. 새 컴포넌트는 같은 Task 에서 `mantine-aggrid-ui` 스킬의 컴포넌트 문서·색인까지 갱신한다.
- 운영 프로필(`application-prod.yml` 등)에는 값 없이 자리만 둔다.
- 실행 기록 `MSG`(500자)와 로그에 주소·인증값·DB 원문 메시지를 넣지 않는다(예외는 예외 종류 이름 `getClass().getSimpleName()` 만).
- logback·sch 로그 분리 설정은 바꾸지 않는다.
- `pnpm install` 전에 워크트리 `node_modules` 가 메인 저장소로 가는 심볼릭 링크인지 확인한다(`ls -ld src/frontend/node_modules src/frontend/m-mcm/node_modules src/frontend/shared/node_modules`; 심링크면 install 하지 않는다). shared 빌드가 dev watch 때문에 exit 144 로 끝나면 실패가 아니다(`dist` 를 확인한다).
- 스크립트에 macOS 전용 명령을 쓰지 않는다(윈도우 사용자도 쓴다).
- 전체 시험은 머지 요청 직전 1회(Task 14). Task 마다는 그 Task 의 시험만 돌린다.
- 커밋은 Task 마다 Conventional Commits(`type(scope): 한국어 subject`), 메시지 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- SQL 서식은 `docs/guide/Database/oracle-sql-rules.md` 4장: 키워드 맨 앞 열, 본문 7번째 열(`SELECT·`, `FROM···`, `WHERE··`, `AND····`), 다음 줄 항목은 앞 쉼표(공백 5칸 + `, `), 표 별칭 대문자 한 글자(`AS` 없음), 쉼표 조인과 `(+)`, WITH·서브쿼리는 괄호를 혼자 한 줄에 두고 4칸 들여쓰기. 앱이 실행하는 SQL 에는 끝 `;` 를 붙이지 않는다. 시각 칸은 `TIMESTAMP(6)`(KST), DB 시계는 늘 `CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)` 로 읽는다.
- 빈 등록(mcm-core `com.dongkuk.dmes.mcm.job..`): **`@Component`·`@Service`·`@RestController` 같은 스테레오타입을 쓰지 않고 모든 빈을 `@Bean` 으로 선언한다**(`MdmAutoConfiguration` 규칙). mdm·mls·mpp·mqc·mpn 앱은 `com.dongkuk.dmes.mcm` 을 스캔하지 않고 `McmCoreAutoConfiguration` 이 `@Import` 하는 것만 얻기 때문이다. BPMN `camunda:class` 의 빈 이름과 `@Bean` 메서드 이름을 같게 한다. BPMN 이 부르는 빈에는 `@Transactional`·`@Async`·`@Cacheable` 같은 프록시를 만드는 어노테이션을 붙이지 않는다(프록시면 `ParameterName must not be null`).
- `ServiceStarter` 를 직접 부르는 코드(진입점·판정 트리거)는 `OasisServiceExecutor`·`DmomReceiveDispatcher` 와 같은 순서로 `AuditHolder.setAudit`·`DefaultServiceContext.setAudit` 를 하고 끝에 `AuditHolder.remove()` 한다.
- Oracle 시험 클래스 이름은 `*OraTest`(mcm-core)·`*Oracle*Test`(cactus-core) 관례를 따르고, 실행은 `-Pdmes.ora.test=clone` 으로 적는다. 접속값이 없으면 cactus-core 시험은 `assumeTrue` 로 건너뛰고 mcm-core 는 실패한다(`McmCoreOraTestDb.url()`).

## 설계와 다름 · 조정자 확인 필요

설계를 구속력 있는 정본으로 따르되, 코드를 읽어 보니 설계대로는 컴파일·조립되지 않거나 모호해서 정한 곳이다. **D1 은 가드 시험을 바꾸므로 구현 착수 전에 조정자 확인을 받는다.**

| # | 설계 | 계획에서 정한 것 | 이유 |
|---|---|---|---|
| D1 | §2: 접수·내장 서비스·판정 트리거를 mcm-core 에 둔다 | mcm-core 가 cactus-core·oasis-core 를 **`com.dongkuk.dmes.mcm.job..` 패키지에 한해** 쓸 수 있게 한다(`mcm-core/build.gradle` 에 `compileOnly`·`testImplementation libs.cactus.core.v1020`, `mcm-core/settings.gradle` 에 `../cactus-core`·`../maru-mdm-engine` includeBuild, `McmCoreArchitectureTest` 의 cactus·oasis 규칙에 `resideOutsideOfPackage("com.dongkuk.dmes.mcm.job..")` 예외). 다른 mcm 패키지는 그대로 금지 | `McmCoreArchitectureTest` 가 mcm-core 의 cactus·oasis 의존을 금지한다. 내장 서비스 몸체는 mcm-core 의 수집 원천·`SqlGuard` 와 cactus-core 의 `JobRunScope` 를 함께 써야 해서 어느 한쪽으로 옮길 수 없다. 6개 앱이 모두 cactus-core 를 싣는다 |
| D2 | §6·outline: 위젯 collect 백엔드 삭제는 Task 9 | **Task 6 의 같은 커밋**에서 `WidgetCollector`·`Writer`·`Reader`·`WidgetCollectConfig`·`WidgetCollectProperties`·엔티티·저장소 삭제, `WidgetDataService` collect 분기·`WidgetDefConfigRules` collect 검사·`CommWidgetMngService` 의 허용 호스트 인자 삭제 | 원천을 `job.builtin.collect` 로 옮기면 `job → widget`(원천이 `widget.query`·`widget.ext` 를 씀)이고 남은 위젯 코드가 `widget → job` 이라 `mcm_core_내부_패키지_사이클_없음` 이 Task 6 부터 Task 9 까지 깨진다 |
| D3 | §2: `@Scheduled` 4개 → 코드 작업 | `JobDispatchTrigger` 의 `@Scheduled` 한 개는 남는다 | 매분 깨우는 시계이다(설계 §4.1). Task 9 의 `grep @Scheduled` 확인은 「트리거 1개만」이다 |
| D4 | §4.3: 요청 본문 `inputs` | `varTypes`(변수 이름 → STRING·NUMBER·DATE·JSON) 필드를 더한다 | `jobQuery`·`jobCollect(sql)` 가 DATE 변수를 `java.sql.Date`/`Timestamp` 로 바인드하려면 형을 알아야 한다(문자열 바인드는 NLS 설정에 기댄다) |
| D5 | §4.4 접수 1~7 | 컨트롤러가 1(주체)·2(모듈)·4(처리기)를 하고 `JobRunDispatcher.submit` 이 3(중복 runId)·5(실행 중 jobId)·6(풀)을 한다. 4 가 3 앞에 온다 | 중복 runId 는 이미 접수된 회차라 처리기가 있다는 뜻이므로 결과가 같다. 메모리 상태(최근 runId·실행 중 jobId·풀)를 진입점 한 곳에 모아 재시도 재투입과 같은 풀을 쓴다 |
| D6 | §4.4 시간 초과: 감시가 `cancel(true)` | `Thread.interrupt()` 로 한다 | 같은 효과이고 `Future` 참조가 제출 뒤에야 생기는 경합을 피한다 |
| D7 | §5.4: SQL 원천을 기존 읽기 전용 실행기로 | `WidgetQueryExecutor` 는 MCM 에만 있고(`dataSrc=mcm` 만, `require-dedicated`, 10초 고정) 다른 5개 앱에 없다. 그래서 `job.builtin.collect.JobCollectSql` 이 `SqlGuard`·`WidgetReadOnlyJdbc` 를 **그 모듈의 기본 DataSource** 에 대해 쓴다(`widget.query` 는 고치지 않는다). HTTP 원천은 모든 모듈에서, **환율(exchange) 원천은 `MODULE_CD=MCM` 작업에서만**(저장 검사 + 실행 때 빈 없으면 거절) | 환율 제공자 빈은 `WidgetExtConfig`(MCM 스캔)에만 있다 |
| D8 | §8 메뉴: SQL 파일만 | `docs/mcm/sql/jobSchedMng-menu.sql`(L_MAIN 적용은 조정자) + `CoreRbacSeeder.allActions` 에 `list`·`get`·`setUse`·`runNow`·`cronPreview`·`handlers` 6개 추가(`save`·`delete`·`history` 는 있음) | PERM_ALL action 에 없는 토큰은 SYSADMIN 도 403 이다. `String.join` 모양을 유지한다(두 계약 시험이 문자열로 읽는다). 골든 지문이 바뀌므로 Task 14 에서 다시 만든다 |
| D9 | §5.2: 코드 작업 5개 | `mcm.*` 5개는 `ScheduledJob` 어댑터 빈으로 `JobServerConfig`(MCM 전용)에 둔다. `ScreenUsageRollup`·`RevokedTokenPurger` 는 `@Scheduled` 만 빼고 공개 메서드를 유지한다 | 두 클래스는 MCM 스캔 빈이라 다른 앱에서 만들 수 없다 |

## Review Focus

설계가 암시하지만 Task 시험이 일부러 겨냥하지 않으면 놓치기 쉬운 것이다. 각 줄은 소유 Task 에 시험이 있다.

1. **깨진 정의 한 건**(`CONFIG_JSON` 이 손상됐거나 `CRON_EXPR` 를 못 읽음)이 같은 묶음의 다른 작업 선점을 막지 않는다 — 그 행만 `FAIL`("정의 오류")로 남기고 `NEXT_RUN_AT` 을 미루며 나머지는 선점한다. (Task 7)
2. **서버가 오래 꺼졌다 켜져도** 밀린 회차를 줄줄이 돌리지 않는다 — `SKIP` 1건 + 다음 미래 시각. 화면에서 일정을 바꾸거나 「사용 중지 → 사용」으로 되돌릴 때 옛 `NEXT_RUN_AT` 이 그대로 남아 폭주하지 않는다(저장이 다시 계산). (Task 7, 10)
3. **호출 도중 MCM 이 죽거나 모듈이 재기동**해서 `RUN` 행이 열린 채 남는다 — 정리(`mcm.jobRunSweep`)가 `STARTED_AT + TIMEOUT_SEC + 300초` 뒤 `TIMEOUT` 으로 닫고, 이미 닫힌 행에 늦게 온 결과는 덮어쓰지 않는다. 연결 거부는 즉시 `FAIL`, 읽기 시간 초과는 `RUN` 유지. (Task 3, 8)
4. **모듈 앱 기동**이 JOB 표 부재·권한 부족·MCM 꺼짐 때문에 실패하지 않는다 — 코드 작업 등록은 WARN 한 번 + 1분 뒤 한 번 더. (Task 5, 9)
5. **로그·MSG 에 비밀이 새지 않는다** — 예외 메시지(`jdbc:oracle://…`)·URL·키가 실행 기록과 로그에 없다. 내장 서비스를 웹(`/api/{module}/oasis/jobQuery/run`)으로 부르면 SQL 이 실행되지 않는다. (Task 4, 6)

---

## 파일 구조

```
src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/job/              (새 패키지 — Task 3·4)
  CollectedValue.java            수집 값 한 건 record (Task 3)
  JobRunRequest.java             /internal/job/run 요청 record + Retry (Task 3)
  JobRunScope.java               ThreadLocal 실행 범위 (Task 3)
  JobScopeRequiredException.java 「예약 실행 밖 호출」 예외 (Task 3)
  JobRunReport.java, JobRunReporter.java   결과 보고 record·인터페이스 (Task 3)
  JobRunResultWriter.java        RUN 행 UPDATE + COLLECT MERGE, REQUIRES_NEW, 5초 뒤 1회 재시도 (Task 3)
  JobRunExecutor.java            실행 풀(대기열 0) + 감시·재시도용 스케줄러 (Task 4)
  JobServiceInvoker.java         serviceStarter.start 직접 호출 도우미 (Task 4)
  JobServerName.java             SERVER_NM 기본값 (Task 4)
  JobRunDispatcher.java          예약 실행 진입점 (Task 4)
  JobAutoConfiguration.java      빈 등록 (Task 4)
src/backend/cactus-core/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports   한 줄 추가 (Task 4)
src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V3__job_scheduler.sql   (Task 1 에서 고침)
src/backend/mcm-core/src/main/resources/services/job/{jobCode,jobQuery,jobCollect}.bpmn   내장 서비스 (Task 6)
src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/
  JobModule.java, JobProperties.java, JobConfig.java        (Task 1 에서 고침; JobDataSource.java 삭제)
  def/CronSpec.java, JobVar.java, JobVars.java              (Task 2)
  agent/ScheduledJob.java, JobContext.java, SimpleScheduledJob.java, JobHandlerRegistry.java,
        JobHandlerRegistrar.java, JobRunAcceptor.java, AcceptResult.java, JobRunController.java,
        LocalJobRunGateway.java, JobAgentConfig.java        (Task 5)
  builtin/JobCodeService.java, JobQueryService.java, JobCollectService.java, QueryStatementGuard.java,
          JobBuiltinConfig.java                              (Task 6)
  builtin/collect/**    widget/collect 에서 git mv 한 원천 + JobCollectSql.java (Task 6)
  server/JobDispatchScope.java, JobDispatchService.java, ClaimedBatch.java, JobDispatchTrigger.java,
         JobCaller.java, JobRunStore.java, JobServerConfig.java    (Task 7·8)
  server/JobDefStore.java, JobSchedMngService.java, dto/JobSchedMngRequest.java                (Task 10)
src/backend/mcm/api/src/main/resources/services/job/jobDispatch.bpmn     (Task 7)
src/backend/mcm/api/src/main/resources/services/csa/jobSchedMng.bpmn  (Task 10)
docs/mcm/sql/jobSchedMng-menu.sql                                      (Task 10)
src/frontend/shared/src/components/cron-input/**, variable-table/**   (Task 11)
src/frontend/m-mcm/page-components/csa/jobSchedMng/**                 (Task 12)
삭제: mcm-core widget/collect/**(원천 이동분 제외), m-mcm widget-types/collect/**         (Task 6·13)
```

---

### Task 1: V3 수정 + JobDataSource 제거 + 설정 + 의존 방향

**담당 후보:** GLM 또는 opencode  
**Model:** sonnet/high

설계 §3·§3.5·§11 머리(「설계 확정 전 구현분 `f1ed4d268` 을 고칠 것」)·§4.7·D1(위 표).

**Files:**
- Modify: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V3__job_scheduler.sql` (전체 다시 씀)
- Delete(`git rm`): `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/JobDataSource.java`, `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/job/JobDataSourceTest.java`
- Modify: `.../mcm/job/JobProperties.java`, `.../mcm/job/JobConfig.java`
- Modify(시험): `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/testdb/McmCoreOraTestDb.java`(JOB_VER 제외를 되돌린다), `.../oracheck/JobSchemaOraTest.java`(다시 씀)
- Create(시험): `.../mcm/job/JobPropertiesTest.java`, `.../mcm/job/JobModuleTest.java`
- Modify(의존): `src/backend/mcm-core/build.gradle`, `src/backend/mcm-core/settings.gradle`, `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/arch/McmCoreArchitectureTest.java`

**Interfaces:**
- Produces:
  - `JobProperties`(prefix `dmes.job`): `getModule()`, `getSchema()`(기본 `MCMAPUSER`), `getPoolSize()`(4), `getServerName()`, `getAgent().isEnabled()`(true), `getServer().isEnabled()`(false)·`getServer().getBatchSize()`(50), `getModules(): Map<String, ModuleTarget>`(`ModuleTarget.getBaseUrl()`; 키는 소문자 모듈), `getHttp().getAllowedHosts(): List<String>`, `getCollect().isEnabled()`(true).
  - `JobModule`(변경 없음): `of(String)`, `resolve(JobProperties, Environment)`, `tryResolve(...)`.
  - V3 표 4개: `TB_MCM_JOB_DEF`·`TB_MCM_JOB_RUN`·`TB_MCM_JOB_COLLECT_DATA`·`TB_MCM_JOB_HANDLER`(설계 §3.1~3.4 칸 그대로), 끝에 GRANT(§3.5).

- [ ] **Step 1: 실패하는 Oracle 스키마 시험으로 다시 쓴다**

`JobSchemaOraTest` 전체를 아래로 바꾼다(기존 `@SpringJUnitConfig(OraCheckJpaConfig.class)` 구성 그대로 쓴다. 접속 사용자는 MCMAPUSER 이다).

```java
package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/**
 * V3(예약 작업 표 4개, 설계 §3) 확인 — 표·색인·제약·모듈 사용자 GRANT. 행은 각 시험 앞뒤에서 지운다.
 * GRANT 는 로컬 PDB 의 ANY TABLE 권한에 가려 실제 동작으로는 확인되지 않으므로 USER_TAB_PRIVS_MADE 로 읽는다.
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobSchemaOraTest {

    private static final List<String> MODULE_USERS = List.of("MDMAPUSER", "MLSAPUSER", "MPNAPUSER", "MPPAPUSER", "MQCAPUSER");

    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_HANDLER");
    }

    private void insertRun(String jobId, Timestamp schedAt, String trigger, String runId, String status) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES (?, ?, ?, ?, 'MCM', 'jobCode', ?)", jobId, schedAt, trigger, runId, status);
    }

    private void insertDef(String jobId, String module, String kind) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES (?, ?, 'n', ?, 'jobCode', 'run', '0 0 * * *', 60, 'USER')", jobId, module, kind);
    }

    @Test
    @DisplayName("표 4개가 있고 JOB_VER 는 없다")
    void tables() {
        List<String> tables = jdbc.queryForList(
                "SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = 'MCMAPUSER' AND TABLE_NAME LIKE 'TB_MCM_JOB%' ORDER BY TABLE_NAME", String.class);
        assertThat(tables).containsExactly("TB_MCM_JOB_COLLECT_DATA", "TB_MCM_JOB_DEF", "TB_MCM_JOB_HANDLER", "TB_MCM_JOB_RUN");
    }

    @Test
    @DisplayName("매분 조회용 색인 IX_TB_MCM_JOB_DEF_DUE (USE_YN, NEXT_RUN_AT) 와 RUN_ID 유일 제약이 있다")
    void indexes() {
        List<String> dueCols = jdbc.queryForList(
                "SELECT COLUMN_NAME FROM ALL_IND_COLUMNS WHERE INDEX_OWNER = 'MCMAPUSER' AND INDEX_NAME = 'IX_TB_MCM_JOB_DEF_DUE' ORDER BY COLUMN_POSITION",
                String.class);
        assertThat(dueCols).containsExactly("USE_YN", "NEXT_RUN_AT");

        insertRun("J1", Timestamp.valueOf("2026-10-09 02:00:00"), "S", "run-1", "RUN");
        assertThatThrownBy(() -> insertRun("J2", Timestamp.valueOf("2026-10-09 02:00:00"), "S", "run-1", "RUN"))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    @DisplayName("같은 (JOB_ID, SCHED_AT, TRIGGER_TP) 는 한 번만 — 회차 선점의 이중 안전장치")
    void duplicateRunKey() {
        Timestamp at = Timestamp.valueOf("2026-10-09 02:00:00");
        insertRun("J1", at, "S", "run-a", "RUN");
        assertThatThrownBy(() -> insertRun("J1", at, "S", "run-b", "RUN")).isInstanceOf(DuplicateKeyException.class);
        insertRun("J1", at, "M", "run-c", "RUN");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'J1'", Integer.class)).isEqualTo(2);
    }

    @Test
    @DisplayName("SCHED_AT(TIMESTAMP(0))은 소수 초를 반올림한다 — 넣기 전에 초 단위로 버려야 하는 근거")
    void schedAtRoundsToSecond() {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('J2', TIMESTAMP '2026-10-09 02:00:00.7', 'S', 'run-r', 'MCM', 'jobCode', 'RUN')");
        Timestamp stored = jdbc.queryForObject("SELECT SCHED_AT FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'J2'", Timestamp.class);
        assertThat(stored).isEqualTo(Timestamp.valueOf("2026-10-09 02:00:01"));
    }

    @Test
    @DisplayName("CHECK — 유형은 CODE·BPMN·QUERY·COLLECT 만, 상태에 REQ 는 없다, 처리기 모듈은 6개만")
    void checkConstraints() {
        assertThatThrownBy(() -> insertDef("D1", "XXX", "CODE")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertDef("D1", "MCM", "HTTP")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertDef("D1", "MCM", "PURGE")).isInstanceOf(DataIntegrityViolationException.class);
        insertDef("D2", "MPN", "COLLECT");
        assertThat(jdbc.queryForObject("SELECT USE_YN || VER FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'D2'", String.class)).isEqualTo("Y0");

        Timestamp at = Timestamp.valueOf("2026-10-09 02:00:00");
        assertThatThrownBy(() -> insertRun("J3", at, "S", "run-q", "REQ")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertRun("J3", at, "Z", "run-z", "RUN")).isInstanceOf(DataIntegrityViolationException.class);
        List<String> statuses = List.of("RUN", "OK", "FAIL", "SKIP", "TIMEOUT");
        for (int i = 0; i < statuses.size(); i++) {
            insertRun("J4", Timestamp.valueOf(java.time.LocalDateTime.of(2026, 10, 9, 2, i, 0)), "S", "run-" + statuses.get(i), statuses.get(i));
        }
        assertThatThrownBy(() -> jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_HANDLER (HANDLER_ID, MODULE_CD, HANDLER_NM) VALUES ('h', 'XXX', 'n')"))
                .isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_HANDLER (HANDLER_ID, MODULE_CD, HANDLER_NM) VALUES ('mdm.h', 'MDM', 'n')");
    }

    @Test
    @DisplayName("모듈 사용자 5명에게 표별 최소 권한만 GRANT — RUN: SELECT·UPDATE, COLLECT_DATA·DEF·HANDLER: SELECT·INSERT·UPDATE, DELETE 없음")
    void grantsToModuleUsers() {
        Map<String, Set<String>> expected = Map.of(
                "TB_MCM_JOB_RUN", Set.of("SELECT", "UPDATE"),
                "TB_MCM_JOB_COLLECT_DATA", Set.of("SELECT", "INSERT", "UPDATE"),
                "TB_MCM_JOB_DEF", Set.of("SELECT", "INSERT", "UPDATE"),
                "TB_MCM_JOB_HANDLER", Set.of("SELECT", "INSERT", "UPDATE"));
        for (String user : MODULE_USERS) {
            Map<String, Set<String>> actual = jdbc.queryForList(
                            "SELECT TABLE_NAME, PRIVILEGE FROM USER_TAB_PRIVS_MADE WHERE GRANTEE = ? AND TABLE_NAME LIKE 'TB_MCM_JOB%'", user)
                    .stream().collect(Collectors.groupingBy(r -> (String) r.get("TABLE_NAME"),
                            Collectors.mapping(r -> (String) r.get("PRIVILEGE"), Collectors.toSet())));
            assertThat(actual).as(user).isEqualTo(expected);
        }
    }
}
```

- [ ] **Step 2: 실패를 확인한다** (구현 전이므로 `TB_MCM_JOB_HANDLER` 없음·`JOB_VER` 있음으로 실패)

Run: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchemaOraTest'`
Expected: FAIL (ORA-00942 또는 단언 불일치).

- [ ] **Step 3: V3 를 다시 쓴다** (`f1ed4d268` 의 파일을 설계 §11 머리 목록대로 고친다: `TB_MCM_JOB_VER` 표·시드 6행 삭제, `IX_TB_MCM_JOB_DEF_DUE` 추가, `TB_MCM_JOB_HANDLER` 추가·DEF 의 `CODE_SEEN_AT` 삭제, GRANT 추가, DEF 에 `SERVICE_ID`·`ACTION` 추가·`JOB_KIND` CHECK 4종, RUN 에 `RUN_ID`(UNIQUE)·`SERVICE_ID`·`SERVICE_TAG` 추가·STATUS 에서 `REQ` 삭제, 머리 주석의 「JOB 전용 연결」 설명 교체)

```sql
-- ============================================================
-- V3: 예약 작업(JOB) 스케줄러 표 4개
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-08-job-scheduler-design.md §3):
--   MCM 앱이 매분 색인 조회로 실행할 작업을 판정·선점하고(JOB_DEF·JOB_RUN), 각 모듈 앱의 진입점이 자기 모듈 사용자
--   (MDMAPUSER 등)로 접속해 MCMAPUSER. 접두를 붙여 실행 결과(JOB_RUN)·수집 값(JOB_COLLECT_DATA)·코드 작업 등록
--   (JOB_DEF·JOB_HANDLER)을 직접 쓴다. 그래서 끝에 모듈 사용자 5명에게 최소 권한(DELETE 없음)을 GRANT 한다.
--   - TB_MCM_JOB_DEF: 작업 정의. SERVICE_ID 가 실제 실행할 OASIS 서비스 ID 이고 JOB_KIND 는 화면 입력 양식이다.
--   - TB_MCM_JOB_RUN: 실행 기록. PK (JOB_ID, SCHED_AT, TRIGGER_TP) INSERT 가 회차 선점의 이중 안전장치이고 RUN_ID 는 호출·결과의 키다.
--   - TB_MCM_JOB_COLLECT_DATA: 수집(COLLECT) 작업이 쌓는 값.
--   - TB_MCM_JOB_HANDLER: 코드 작업 처리기 목록(모듈 앱이 기동할 때 등록).
--   SCHED_AT 만 TIMESTAMP(0) 이다(소수 초를 반올림하므로 넣기 전에 초 단위로 버린다). 나머지 시각 칸은 TIMESTAMP(6) KST.

create table TB_MCM_JOB_DEF (
    JOB_ID varchar2(60 char) not null,
    MODULE_CD varchar2(10 char) not null,
    JOB_NM varchar2(100 char) not null,
    JOB_KIND varchar2(10 char) not null,
    SERVICE_ID varchar2(200 char) not null,
    ACTION varchar2(50 char) not null,
    CRON_EXPR varchar2(100 char) not null,
    USE_YN char(1 char) default 'Y' not null,
    CONFIG_JSON clob,
    VARS_JSON clob,
    TIMEOUT_SEC number(6,0) not null,
    NEXT_RUN_AT timestamp(6),
    JOB_DESC varchar2(500 char),
    OWNER_TP varchar2(10 char) not null,
    OPTS_JSON clob,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_DEF primary key (JOB_ID),
    constraint CK_TB_MCM_JOB_DEF_USE check (USE_YN in ('Y','N')),
    constraint CK_TB_MCM_JOB_DEF_MOD check (MODULE_CD in ('MCM','MDM','MPP','MLS','MQC','MPN')),
    constraint CK_TB_MCM_JOB_DEF_KIND check (JOB_KIND in ('CODE','BPMN','QUERY','COLLECT')),
    constraint CK_TB_MCM_JOB_DEF_OWN check (OWNER_TP in ('CODE','USER'))
);
create index IX_TB_MCM_JOB_DEF_MOD on TB_MCM_JOB_DEF (MODULE_CD, USE_YN);
create index IX_TB_MCM_JOB_DEF_DUE on TB_MCM_JOB_DEF (USE_YN, NEXT_RUN_AT);

create table TB_MCM_JOB_RUN (
    JOB_ID varchar2(60 char) not null,
    SCHED_AT timestamp(0) not null,
    TRIGGER_TP char(1 char) not null,
    RUN_ID varchar2(36 char) not null,
    MODULE_CD varchar2(10 char) not null,
    SERVICE_ID varchar2(200 char) not null,
    SERVER_NM varchar2(100 char),
    SERVICE_TAG varchar2(40 char),
    STATUS varchar2(8 char) not null,
    STARTED_AT timestamp(6),
    ENDED_AT timestamp(6),
    ITEM_CNT number(10,0),
    MSG varchar2(500 char),
    REQ_USR_ID varchar2(100 char),
    TIMEOUT_SEC number(6,0),
    VARS_JSON clob,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_RUN primary key (JOB_ID, SCHED_AT, TRIGGER_TP),
    constraint UQ_TB_MCM_JOB_RUN_RUNID unique (RUN_ID),
    constraint CK_TB_MCM_JOB_RUN_TRG check (TRIGGER_TP in ('S','M')),
    constraint CK_TB_MCM_JOB_RUN_ST check (STATUS in ('RUN','OK','FAIL','SKIP','TIMEOUT'))
);
create index IX_TB_MCM_JOB_RUN_ST on TB_MCM_JOB_RUN (STATUS, STARTED_AT);
create index IX_TB_MCM_JOB_RUN_START on TB_MCM_JOB_RUN (STARTED_AT);
create index IX_TB_MCM_JOB_RUN_JOB on TB_MCM_JOB_RUN (JOB_ID, SCHED_AT desc);

create table TB_MCM_JOB_COLLECT_DATA (
    JOB_ID varchar2(60 char) not null,
    SLOT varchar2(12 char) not null,
    ITEM_KEY varchar2(100 char) not null,
    VALUE_NUM number(24,8),
    VALUE_TXT varchar2(200 char),
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_COLLECT_DATA primary key (JOB_ID, SLOT, ITEM_KEY)
);
create index IX_TB_MCM_JOB_CDATA_SLOT on TB_MCM_JOB_COLLECT_DATA (SLOT);

create table TB_MCM_JOB_HANDLER (
    HANDLER_ID varchar2(60 char) not null,
    MODULE_CD varchar2(10 char) not null,
    HANDLER_NM varchar2(100 char) not null,
    DEFAULT_CRON varchar2(100 char),
    VARS_JSON clob,
    SEEN_AT timestamp(6),
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_HANDLER primary key (HANDLER_ID),
    constraint CK_TB_MCM_JOB_HANDLER_MOD check (MODULE_CD in ('MCM','MDM','MPP','MLS','MQC','MPN'))
);

-- 모듈 앱(MDM·MPP·MLS·MQC·MPN)은 자기 스키마 사용자로 접속한다 — 표 주인(MCMAPUSER)으로 실행되는 이 파일이 최소 권한을 준다(DELETE 없음).
grant select, update on TB_MCM_JOB_RUN to MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;
grant select, insert, update on TB_MCM_JOB_COLLECT_DATA to MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;
grant select, insert, update on TB_MCM_JOB_DEF to MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;
grant select, insert, update on TB_MCM_JOB_HANDLER to MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;
```

주의: 이 5개 사용자는 모든 레인 PDB 템플릿에 있다(`scripts/oracle/pdb.mjs` 의 `SCHEMA_USERS`). 없는 DB(예: 사용자를 만들지 않은 개발·운영)에서는 `ORA-01917` 로 V3 가 실패하므로 DBA 가 사용자를 먼저 만든다 — 머지 요청 메시지에 이 한 줄을 넣는다(Task 14).

- [ ] **Step 4: `McmCoreOraTestDb` 되돌리기** — `JOB_VER_TABLE` 상수와 `resetData` 의 `NOT IN (…, JOB_VER_TABLE)` 제외를 `f1ed4d268` 이전 모양으로 되돌린다:

```java
// 상수 JOB_VER_TABLE 삭제, javadoc 의 「기준 데이터 표 TB_MCM_JOB_VER 제외」 문구 삭제
try (ResultSet rs = st.executeQuery("SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME <> '" + HISTORY_TABLE + "'")) {
```

- [ ] **Step 5: `JobDataSource`·`JobDataSourceTest` 를 지우고 설정을 정리한다**

```bash
/usr/bin/git rm src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/JobDataSource.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/job/JobDataSourceTest.java
```

`JobProperties.java` 를 아래로 바꾼다(키는 설계 §4.7·outline 의 `dmes.job.*` 목록).

```java
package com.dongkuk.dmes.mcm.job;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 예약 작업 설정 — yml prefix {@code dmes.job}(설계 §4.7).
 *
 * <pre>{@code
 * dmes:
 *   job:
 *     module: ""                 # 비우면 spring.application.name 의 첫 '-' 앞부분(대문자)
 *     schema: MCMAPUSER          # 모듈 쪽 SQL 의 JOB 표 스키마 접두
 *     pool-size: 4               # 모듈 앱의 작업 실행 스레드 수(대기열 0)
 *     server-name: ""            # 비우면 호스트:앱이름:pid
 *     agent:
 *       enabled: true            # false 면 이 앱은 /internal/job/run 을 받지 않는다(404)
 *     server:
 *       enabled: false           # MCM 앱 application.yml 에서만 true — 판정·선점·호출·관리 빈
 *       batch-size: 50           # 한 번에 선점하는 최대 작업 수
 *     modules:                   # MCM 이 모듈을 부를 주소(기본값은 기존 <모듈>_WAS_URL 환경 변수)
 *       mdm: { base-url: "${MDM_WAS_URL:http://localhost:8096}" }
 *     http:
 *       allowed-hosts: []        # COLLECT(http) 원천이 부를 수 있는 호스트(정확 일치)
 *     collect:
 *       enabled: true            # false 면 COLLECT 작업은 선점 후보에서 빠지고 mcm.collectPurge 는 아무것도 하지 않는다
 * }</pre>
 */
@ConfigurationProperties(prefix = "dmes.job")
public class JobProperties {

    private String module;
    private String schema = "MCMAPUSER";
    private int poolSize = 4;
    private String serverName;
    private final Agent agent = new Agent();
    private final Server server = new Server();
    private final Map<String, ModuleTarget> modules = new LinkedHashMap<>();
    private final Http http = new Http();
    private final Collect collect = new Collect();

    public String getModule() { return module; }
    public void setModule(String module) { this.module = module; }
    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }
    public int getPoolSize() { return poolSize; }
    public void setPoolSize(int poolSize) { this.poolSize = poolSize; }
    public String getServerName() { return serverName; }
    public void setServerName(String serverName) { this.serverName = serverName; }
    public Agent getAgent() { return agent; }
    public Server getServer() { return server; }
    public Map<String, ModuleTarget> getModules() { return modules; }
    public Http getHttp() { return http; }
    public Collect getCollect() { return collect; }

    public static class Agent {
        private boolean enabled = true;
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }

    public static class Server {
        private boolean enabled = false;
        private int batchSize = 50;
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public int getBatchSize() { return batchSize; }
        public void setBatchSize(int batchSize) { this.batchSize = batchSize; }
    }

    public static class ModuleTarget {
        private String baseUrl;
        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    }

    public static class Http {
        private List<String> allowedHosts = new ArrayList<>();
        public List<String> getAllowedHosts() { return allowedHosts; }
        public void setAllowedHosts(List<String> allowedHosts) { this.allowedHosts = allowedHosts == null ? new ArrayList<>() : allowedHosts; }
    }

    public static class Collect {
        private boolean enabled = true;
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }
}
```

`JobConfig.java` 를 아래로 줄인다(Task 5·7 이 `@Import` 를 더한다).

```java
package com.dongkuk.dmes.mcm.job;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** 예약 작업 설정 바인딩. {@code McmCoreAutoConfiguration} 이 올린다(다른 앱은 이것만 얻는다). 빈 조립은 Task 5·6·7 이 {@code @Import} 로 더한다. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(JobProperties.class)
public class JobConfig {
}
```

- [ ] **Step 6: 단위 시험 두 개** — `JobPropertiesTest`(`ApplicationContextRunner` 로 기본값과 키 바인딩), `JobModuleTest`(옛 `JobDataSourceTest` 의 `moduleOf`·`moduleResolve` 를 그대로 옮긴다)

```java
package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class JobPropertiesTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(JobConfig.class);

    @Test
    @DisplayName("기본값 — agent 켜짐, server 꺼짐(배치 50), 스키마 MCMAPUSER, 풀 4, collect 켜짐, 허용 호스트 없음")
    void defaults() {
        runner.run(ctx -> {
            JobProperties p = ctx.getBean(JobProperties.class);
            assertThat(p.getAgent().isEnabled()).isTrue();
            assertThat(p.getServer().isEnabled()).isFalse();
            assertThat(p.getServer().getBatchSize()).isEqualTo(50);
            assertThat(p.getSchema()).isEqualTo("MCMAPUSER");
            assertThat(p.getPoolSize()).isEqualTo(4);
            assertThat(p.getCollect().isEnabled()).isTrue();
            assertThat(p.getHttp().getAllowedHosts()).isEmpty();
            assertThat(p.getModules()).isEmpty();
            assertThat(p.getModule()).isNull();
        });
    }

    @Test
    @DisplayName("yml 키 바인딩 — module·server.enabled·modules.<모듈>.base-url·http.allowed-hosts·collect.enabled")
    void binding() {
        runner.withPropertyValues(
                "dmes.job.module=mdm", "dmes.job.server.enabled=true", "dmes.job.server.batch-size=20",
                "dmes.job.modules.mdm.base-url=http://localhost:18096", "dmes.job.http.allowed-hosts[0]=api.example.com",
                "dmes.job.collect.enabled=false", "dmes.job.schema=MCMAPUSER2", "dmes.job.pool-size=2", "dmes.job.server-name=n1")
                .run(ctx -> {
                    JobProperties p = ctx.getBean(JobProperties.class);
                    assertThat(p.getModule()).isEqualTo("mdm");
                    assertThat(p.getServer().isEnabled()).isTrue();
                    assertThat(p.getServer().getBatchSize()).isEqualTo(20);
                    assertThat(p.getModules().get("mdm").getBaseUrl()).isEqualTo("http://localhost:18096");
                    assertThat(p.getHttp().getAllowedHosts()).containsExactly("api.example.com");
                    assertThat(p.getCollect().isEnabled()).isFalse();
                    assertThat(p.getSchema()).isEqualTo("MCMAPUSER2");
                    assertThat(p.getPoolSize()).isEqualTo(2);
                    assertThat(p.getServerName()).isEqualTo("n1");
                });
    }
}
```

```java
package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class JobModuleTest {

    @Test
    @DisplayName("JobModule.of — 대소문자 무시, 모르는 값은 IllegalArgumentException")
    void moduleOf() {
        assertThat(JobModule.of("mdm")).isEqualTo(JobModule.MDM);
        assertThat(JobModule.of(" MPN ")).isEqualTo(JobModule.MPN);
        assertThatThrownBy(() -> JobModule.of("xyz")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> JobModule.of(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("JobModule.resolve — 설정값 우선, 없으면 spring.application.name 첫 '-' 앞부분")
    void moduleResolve() {
        JobProperties props = new JobProperties();
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mdm"))).isEqualTo(JobModule.MDM);
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mcm-api"))).isEqualTo(JobModule.MCM);
        props.setModule("mqc");
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mdm"))).isEqualTo(JobModule.MQC);

        JobProperties none = new JobProperties();
        assertThat(JobModule.tryResolve(none, new MockEnvironment().withProperty("spring.application.name", "analog"))).isEqualTo(Optional.empty());
        assertThat(JobModule.tryResolve(none, new MockEnvironment())).isEmpty();
        assertThatThrownBy(() -> JobModule.resolve(none, new MockEnvironment().withProperty("spring.application.name", "analog")))
                .isInstanceOf(IllegalStateException.class);
    }
}
```

- [ ] **Step 7: mcm-core 가 `..mcm.job..` 에서만 cactus-core·oasis 를 쓰게 한다 (D1 — 조정자 확인 뒤)**

`src/backend/mcm-core/settings.gradle` 끝에 더한다(`mdm/settings.gradle` 과 같은 헬퍼):

```groovy
// 예약 작업(com.dongkuk.dmes.mcm.job..)이 cactus-core 의 job 패키지·oasis 를 쓴다(D1). 중첩 includeBuild 전달에 기대지 않고
// mdm/settings.gradle 과 같이 maru-mdm-engine 도 명시한다(cactus-core 가 api 로 문다).
apply from: '../gradle/include-builds.settings.gradle'

dmesIncludeBuild('../cactus-core', 'com.dongkuk.dmes:cactus-core')
dmesIncludeBuild('../maru-mdm-engine', 'kr.dongkuk.maru.mdm:maru-mdm-engine')
```

`src/backend/mcm-core/build.gradle` 의 `dependencies { … }` 에 더한다:

```groovy
    // 예약 작업(com.dongkuk.dmes.mcm.job..)만 cactus-core(job 패키지·OASIS)를 쓴다 — McmCoreArchitectureTest 가 다른 패키지의 사용을 막는다.
    // 6개 업무 앱이 모두 cactus-core 를 싣는다(런타임은 호스트 앱이 제공 — compileOnly).
    compileOnly libs.cactus.core.v1020
    testImplementation libs.cactus.core.v1020
```

`McmCoreArchitectureTest` 의 두 규칙에 예외를 건다:

```java
    @Test
    void mcm_core_는_cactus_패키지를_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage("com.dongkuk.dmes.mcm..")
                .and().resideOutsideOfPackage("com.dongkuk.dmes.mcm.job..")
                .should().dependOnClassesThat().resideInAPackage("com.dongkuk.dmes.cactus..")
                .as("mcm-core 는 cactus-core 를 의존하지 않아야 한다 (04 §0 정책) — 예약 작업 mcm.job.. 만 예외(2026-10-09, 예약 작업 설계 D1)");
        rule.check(MCM_CORE);
    }

    @Test
    void mcm_core_는_oasis_패키지를_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage("com.dongkuk.dmes.mcm..")
                .and().resideOutsideOfPackage("com.dongkuk.dmes.mcm.job..")
                .should().dependOnClassesThat().resideInAPackage("com.dongkuk.oasis..")
                .as("mcm-core 는 oasis-core 를 의존하지 않아야 한다 — 예약 작업 mcm.job.. 만 예외");
        rule.check(MCM_CORE);
    }
```

클래스 설명의 「강제 사항」 첫 줄도 「mcm-core 는 cactus / oasis / aps / 호스트 런처 패키지를 import 하지 않는다(예약 작업 `mcm.job..` 제외)」로 고친다. 세 번째 규칙(aps)과 런처 패키지 규칙, 사이클 규칙은 그대로 둔다.

- [ ] **Step 8: 시험 실행**

Run(각각, `src/backend/mcm-core` 에서):
- `../gradlew test --max-workers=2 --tests '*JobPropertiesTest' --tests '*JobModuleTest' --tests '*McmCoreArchitectureTest'` → PASS
- `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchemaOraTest'` → PASS
- 컴파일이 되는지: `../gradlew compileJava compileTestJava --max-workers=2` → 성공(Step 7 의 의존이 풀리는지 이때 확인한다. 실패하면 `settings.gradle` 의 includeBuild 경로를 `mdm/settings.gradle` 과 비교한다.)

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V3__job_scheduler.sql src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm src/backend/mcm-core/build.gradle src/backend/mcm-core/settings.gradle
/usr/bin/git commit -m "$(printf 'refactor(mcm-core): 예약 작업 표를 push 구조(V3)로 고치고 JOB 전용 연결을 없애며 job 패키지의 cactus 의존을 허용한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 2: crontab 식·변수 (`def` 패키지)

**담당 후보:** GLM 또는 opencode  
**Model:** sonnet/high

설계 §4.0(crontab 식)·§5.0(변수, 날짜 변수는 `SCHED_AT` 기준). 옛 계획 Task 2·3 의 코드를 가져온다.

**Files:**
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/def/CronSpec.java`, `JobVar.java`, `JobVars.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/job/def/CronSpecTest.java`, `JobVarsTest.java`

**Interfaces:**
- Produces(`CronSpec`): `static CronSpec parse(String)`(틀리면 한국어 메시지의 `IllegalArgumentException`), `static Optional<String> validate(String)`, `LocalDateTime next(LocalDateTime after)`(엄격히 뒤, 초 0, Asia/Seoul, 없으면 null), `List<LocalDateTime> nextN(LocalDateTime, int)`, `Duration minGap(LocalDateTime from, Duration horizon)`, `Duration minGap()`(지금부터 366일), `String describe()`, `String expression()`(정규화한 5칸, 매크로는 펼침), `static final ZoneId ZONE`.
- Produces(`JobVar`): `record JobVar(String name, Type type, String value, String desc)`, `enum Type { STRING, NUMBER, DATE, JSON }`.
- Produces(`JobVars`): `static List<JobVar> parse(String json)`(null·빈 글자 → 빈 목록), `static String toJson(List<JobVar>)`, `static List<String> validate(List<JobVar>)`, `static Map<String,Object> resolve(List<JobVar>, RunFacts)`, `static Map<String,String> typesOf(List<JobVar>)`, `static boolean usesPrevRunAt(List<JobVar>)`, `record RunFacts(LocalDateTime schedAt, LocalDateTime now, LocalDateTime prevRunAt, String jobId, String moduleCd)`.
  - 확정 값 형식(HTTP 본문·`VARS_JSON` 으로 그대로 나간다): 시각 `yyyy-MM-dd'T'HH:mm:ss` 글자, 날짜 `yyyy-MM-dd` 글자, NUMBER 고정값 `BigDecimal`, JSON 고정값 `Map`/`List`, STRING 그대로, `:prevRunAt` 없으면 `null`.

- [ ] **Step 1: `CronSpecTest` 를 쓴다**

```java
package com.dongkuk.dmes.mcm.job.def;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class CronSpecTest {

    private static final LocalDateTime BASE = LocalDateTime.parse("2026-10-08T21:23:00");   // 목요일

    @ParameterizedTest(name = "[{index}] {0} → {1}")
    @CsvSource(delimiter = '|', value = {
            "* * * * *|2026-10-08T21:24:00",
            "*/10 * * * *|2026-10-08T21:30:00",
            "0 2 * * *|2026-10-09T02:00:00",
            "0 9 * * 1-5|2026-10-09T09:00:00",
            "0 4 * * 0|2026-10-11T04:00:00",
            "0 4 * * 7|2026-10-11T04:00:00",
            "0 4 * * sun|2026-10-11T04:00:00",
            "30 0 1 * *|2026-11-01T00:30:00",
            "0 9,15 * * MON-FRI|2026-10-09T09:00:00",
            "*/30 8-20 * * 1-6|2026-10-09T08:00:00",
            "@daily|2026-10-09T00:00:00",
            "@hourly|2026-10-08T22:00:00",
            "0 0 31 * *|2026-10-31T00:00:00",
    })
    @DisplayName("다음 시각 — 기준 2026-10-08T21:23 (Asia/Seoul 벽시계)")
    void next(String expr, String expected) {
        assertThat(CronSpec.parse(expr).next(BASE)).isEqualTo(LocalDateTime.parse(expected));
    }

    @Test
    @DisplayName("next 는 엄격히 뒤이다 — 정각 입력은 그 시각을 돌려주지 않는다")
    void nextIsStrictlyAfter() {
        CronSpec spec = CronSpec.parse("0 2 * * *");
        assertThat(spec.next(LocalDateTime.parse("2026-10-09T02:00:00"))).isEqualTo(LocalDateTime.parse("2026-10-10T02:00:00"));
        assertThat(spec.nextN(BASE, 3)).containsExactly(
                LocalDateTime.parse("2026-10-09T02:00:00"), LocalDateTime.parse("2026-10-10T02:00:00"), LocalDateTime.parse("2026-10-11T02:00:00"));
    }

    @ParameterizedTest(name = "[{index}] 거절: {0}")
    @ValueSource(strings = {"0 9 1 * 1", "0 0 0 * * *", "0 0 L * *", "0 0 ? * *", "0 0 1W * *", "0 0 * * 1#2", "60 * * * *",
            "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "5-1 * * * *", "*/0 * * * *", "@never", "a b c d e", "0 0 */2 * 1"})
    void rejects(String expr) {
        assertThat(CronSpec.validate(expr)).isPresent();
        assertThatThrownBy(() -> CronSpec.parse(expr)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void rejectsBlank(String expr) {
        assertThat(CronSpec.validate(expr)).isPresent();
    }

    @Test
    @DisplayName("오류 문구는 어느 칸이 왜 틀렸는지 한국어로 알린다")
    void messages() {
        assertThat(CronSpec.validate("* * * * 8")).contains("요일 칸(5번째) 값 8 은 0~7 범위를 벗어났습니다");
        assertThat(CronSpec.validate("0 9 1 * 1").orElseThrow()).contains("일과 요일 중 하나는 * 로 두세요");
        assertThat(CronSpec.validate("0 0 0 * * *").orElseThrow()).contains("5칸");
        assertThat(CronSpec.validate("0 0 L * *").orElseThrow()).contains("지원하지 않는");
    }

    @Test
    @DisplayName("유효한 식은 validate 가 empty 이다")
    void validatePasses() {
        assertThat(CronSpec.validate("*/5 * * * *")).isEqualTo(Optional.empty());
    }

    @ParameterizedTest(name = "[{index}] {0} → 최소 간격 {1}분")
    @CsvSource(delimiter = '|', value = {"*/5 * * * *|5", "0 9,15 * * *|360", "0,5 * * * *|5", "0 0 1 * *|40320"})
    @DisplayName("minGap — 2026-01-01 부터 366일 안 연속 실행 간격의 최솟값(월 1일 실행은 2월 28일 = 40320분)")
    void minGap(String expr, long minutes) {
        assertThat(CronSpec.parse(expr).minGap(LocalDateTime.parse("2026-01-01T00:00:00"), Duration.ofDays(366)))
                .isEqualTo(Duration.ofMinutes(minutes));
    }

    @Test
    @DisplayName("minGap — 366일 안에 실행이 2회 미만이면 366일")
    void minGapSparse() {
        assertThat(CronSpec.parse("0 0 1 1 *").minGap(LocalDateTime.parse("2026-01-02T00:00:00"), Duration.ofDays(300)))
                .isEqualTo(Duration.ofDays(366));
    }

    @ParameterizedTest(name = "[{index}] {0} → {1}")
    @CsvSource(delimiter = '|', value = {
            "* * * * *|매분",
            "*/10 * * * *|10분마다",
            "0 * * * *|매시 정각",
            "15 * * * *|매시 15분",
            "0 2 * * *|매일 02:00",
            "0 9 * * 1-5|평일 09:00",
            "0 4 * * 0|매주 일요일 04:00",
            "0 4 * * 7|매주 일요일 04:00",
            "0 4 * * SUN|매주 일요일 04:00",
            "30 0 1 * *|매월 1일 00:30",
            "@hourly|매시 정각",
            "@daily|매일 00:00",
            "*/30 8-20 * * 1-6|월~토 8~20시 30분마다",
            "0 9,15 * * MON-FRI|0 9,15 * * MON-FRI (직접 입력)",
    })
    void describe(String expr, String expected) {
        assertThat(CronSpec.parse(expr).describe()).isEqualTo(expected);
    }

    @Test
    @DisplayName("expression() 은 공백을 하나로 맞추고 매크로를 펼친다")
    void expressionIsNormalized() {
        assertThat(CronSpec.parse("  0   2 * *   *").expression()).isEqualTo("0 2 * * *");
        assertThat(CronSpec.parse("@weekly").expression()).isEqualTo("0 0 * * 0");
        assertThat(List.of(CronSpec.parse("0 4 * * sun").expression())).containsExactly("0 4 * * SUN");
    }
}
```

- [ ] **Step 2: 실패를 확인한다** — `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 --tests '*CronSpecTest'` → 컴파일 실패(`CronSpec` 없음).

- [ ] **Step 3: `CronSpec` 구현**

```java
package com.dongkuk.dmes.mcm.job.def;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.scheduling.support.CronExpression;

/**
 * crontab 5칸 식(분 시 일 월 요일, Asia/Seoul) 검사·다음 시각·설명 — 설계 §4.0.
 * 계산은 Spring {@link CronExpression} 에 초 칸 {@code 0} 을 앞에 붙여 맡긴다. Spring 만 받는 문법({@code ? L W #}, 6칸)과
 * crontab 과 뜻이 다른 「일·요일 함께 제한」은 거절한다(crontab 은 OR, Spring 은 AND).
 */
public final class CronSpec {

    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private static final Map<String, String> MACROS = Map.of(
            "@yearly", "0 0 1 1 *", "@annually", "0 0 1 1 *", "@monthly", "0 0 1 * *", "@weekly", "0 0 * * 0",
            "@daily", "0 0 * * *", "@midnight", "0 0 * * *", "@hourly", "0 * * * *");
    private static final String[] FIELD_NAMES = {"분", "시", "일", "월", "요일"};
    private static final int[] MIN = {0, 0, 1, 1, 0};
    private static final int[] MAX = {59, 23, 31, 12, 7};
    private static final List<String> MONTH_NAMES = List.of("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC");
    private static final List<String> DOW_NAMES = List.of("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT");
    private static final String[] DOW_KO = {"일", "월", "화", "수", "목", "금", "토"};
    private static final int GAP_SCAN_LIMIT = 600_000;

    private final String[] fields;
    private final CronExpression spring;

    private CronSpec(String[] fields, CronExpression spring) {
        this.fields = fields;
        this.spring = spring;
    }

    /** 식을 읽는다. 틀리면 어느 칸이 왜 틀렸는지 한국어로 알리는 {@link IllegalArgumentException}. */
    public static CronSpec parse(String expr) {
        if (expr == null || expr.isBlank()) throw bad("crontab 식이 비어 있습니다");
        String t = expr.trim().replaceAll("\\s+", " ");
        if (t.startsWith("@")) {
            String macro = MACROS.get(t.toLowerCase(Locale.ROOT));
            if (macro == null) throw bad("지원하지 않는 매크로입니다: " + t + " (@hourly @daily @weekly @monthly @yearly)");
            t = macro;
        }
        String[] f = t.toUpperCase(Locale.ROOT).split(" ");
        if (f.length != 5) {
            throw bad(f.length > 5
                    ? "5칸 crontab 식만 쓸 수 있습니다(초 칸·연도 칸 없음): 분 시 일 월 요일"
                    : "5칸이어야 합니다(분 시 일 월 요일): 지금 " + f.length + "칸");
        }
        for (int i = 0; i < 5; i++) checkField(i, f[i]);
        if (!f[2].equals("*") && !f[4].equals("*")) {
            throw bad("일과 요일 중 하나는 * 로 두세요 (crontab 은 둘이 OR, 이 화면은 AND 라 뜻이 달라집니다)");
        }
        CronExpression spring;
        try {
            spring = CronExpression.parse("0 " + String.join(" ", f));
        } catch (IllegalArgumentException e) {
            throw bad("crontab 식을 해석하지 못했습니다: " + t);
        }
        return new CronSpec(f, spring);
    }

    public static Optional<String> validate(String expr) {
        try {
            parse(expr);
            return Optional.empty();
        } catch (IllegalArgumentException e) {
            return Optional.of(e.getMessage());
        }
    }

    /** 정규화한 5칸 식(대문자, 매크로 펼침). */
    public String expression() {
        return String.join(" ", fields);
    }

    /** after 보다 엄격히 뒤인 첫 시각(초 0). 없으면 null. */
    public LocalDateTime next(LocalDateTime after) {
        ZonedDateTime n = spring.next(after.atZone(ZONE));
        return n == null ? null : n.toLocalDateTime();
    }

    public List<LocalDateTime> nextN(LocalDateTime after, int n) {
        List<LocalDateTime> out = new ArrayList<>();
        LocalDateTime cur = after;
        for (int i = 0; i < n; i++) {
            cur = next(cur);
            if (cur == null) break;
            out.add(cur);
        }
        return out;
    }

    /** from 부터 horizon 안의 연속한 두 실행 사이 간격의 최솟값. 실행이 2회 미만이면 366일. */
    public Duration minGap(LocalDateTime from, Duration horizon) {
        LocalDateTime end = from.plus(horizon);
        LocalDateTime prev = next(from);
        Duration min = null;
        for (int i = 0; prev != null && i < GAP_SCAN_LIMIT; i++) {
            LocalDateTime n = next(prev);
            if (n == null || n.isAfter(end)) break;
            Duration d = Duration.between(prev, n);
            if (min == null || d.compareTo(min) < 0) min = d;
            if (min.compareTo(Duration.ofMinutes(1)) <= 0) break;
            prev = n;
        }
        return min == null ? Duration.ofDays(366) : min;
    }

    public Duration minGap() {
        return minGap(LocalDateTime.now(ZONE), Duration.ofDays(366));
    }

    /** 사람이 읽는 설명. 줄일 수 없으면 식 그대로 + 「(직접 입력)」. */
    public String describe() {
        String min = fields[0], hour = fields[1], dom = fields[2], mon = fields[3], dow = fields[4];
        boolean monthAll = mon.equals("*");
        if (min.equals("*") && hour.equals("*") && dom.equals("*") && monthAll && dow.equals("*")) return "매분";
        Integer m = intOrNull(min);
        Integer h = intOrNull(hour);
        String step = stepOf(min);
        if (hour.equals("*") && dom.equals("*") && monthAll && dow.equals("*")) {
            if (step != null) return step + "분마다";
            if (m != null) return m == 0 ? "매시 정각" : "매시 " + m + "분";
        }
        String dowNum = normalizeDow(dow);
        if (m != null && h != null && monthAll) {
            String at = String.format("%02d:%02d", h, m);
            if (dom.equals("*") && dow.equals("*")) return "매일 " + at;
            if (dom.equals("*") && "1-5".equals(dowNum)) return "평일 " + at;
            if (dom.equals("*") && intOrNull(dowNum) != null) return "매주 " + DOW_KO[intOrNull(dowNum)] + "요일 " + at;
            Integer d = intOrNull(dom);
            if (dow.equals("*") && d != null) return "매월 " + d + "일 " + at;
        }
        if (step != null && hour.matches("\\d+-\\d+") && dom.equals("*") && monthAll) {
            String hours = hour.replace("-", "~") + "시 " + step + "분마다";
            if (dow.equals("*")) return hours;
            if (dowNum != null && dowNum.matches("\\d-\\d")) {
                String[] r = dowNum.split("-");
                return DOW_KO[Integer.parseInt(r[0])] + "~" + DOW_KO[Integer.parseInt(r[1])] + " " + hours;
            }
        }
        return expression() + " (직접 입력)";
    }

    // ── 검사 ─────────────────────────────────────────────────────────

    private static void checkField(int i, String text) {
        for (String token : text.split(",", -1)) {
            if (token.isEmpty()) throw bad(label(i) + " 에 빈 항목이 있습니다");
            if (token.matches(".*[?#].*") || (i == 2 && token.matches(".*[LW].*")) || (i == 4 && token.matches(".*L.*"))) {
                throw bad(label(i) + " 에 지원하지 않는 문법이 있습니다: " + token + " (? L W # 는 쓸 수 없습니다)");
            }
            String base = token;
            int step = 1;
            int slash = token.indexOf('/');
            if (slash >= 0) {
                base = token.substring(0, slash);
                String s = token.substring(slash + 1);
                if (!s.matches("\\d+") || Integer.parseInt(s) < 1) throw bad(label(i) + " 의 간격(/) 은 1 이상의 숫자여야 합니다: " + token);
                step = Integer.parseInt(s);
            }
            if (base.equals("*")) continue;
            int dash = base.indexOf('-');
            if (dash >= 0) {
                int a = value(i, base.substring(0, dash));
                int b = value(i, base.substring(dash + 1));
                if (a > b) throw bad(label(i) + " 의 범위 시작이 끝보다 큽니다: " + token);
            } else {
                value(i, base);
            }
            if (step < 1) throw bad(label(i) + " 의 간격이 올바르지 않습니다: " + token);
        }
    }

    private static int value(int i, String s) {
        Integer v = null;
        if (s.matches("\\d+")) v = Integer.parseInt(s);
        else if (i == 3 && MONTH_NAMES.contains(s)) v = MONTH_NAMES.indexOf(s) + 1;
        else if (i == 4 && DOW_NAMES.contains(s)) v = DOW_NAMES.indexOf(s);
        if (v == null) throw bad(label(i) + " 값을 읽을 수 없습니다: " + s);
        if (v < MIN[i] || v > MAX[i]) throw bad(label(i) + " 값 " + v + " 은 " + MIN[i] + "~" + MAX[i] + " 범위를 벗어났습니다");
        return v;
    }

    private static String label(int i) {
        return FIELD_NAMES[i] + " 칸(" + (i + 1) + "번째)";
    }

    private static IllegalArgumentException bad(String message) {
        return new IllegalArgumentException(message);
    }

    // ── 설명 도우미 ──────────────────────────────────────────────────

    private static Integer intOrNull(String s) {
        return s != null && s.matches("\\d+") ? Integer.valueOf(s) : null;
    }

    private static String stepOf(String s) {
        return s.matches("\\*/\\d+") ? s.substring(2) : null;
    }

    /** 요일 칸의 이름·7 을 숫자로(SUN=0). 해석하지 못하면 null. */
    private static String normalizeDow(String dow) {
        String out = dow;
        for (int i = 0; i < DOW_NAMES.size(); i++) out = out.replace(DOW_NAMES.get(i), String.valueOf(i));
        if (out.equals("7")) out = "0";
        return out.matches("\\d(-\\d)?") ? out : null;
    }
}
```

주의: `describe()` 의 「월~토」 표는 요일 범위 `1-6` 만 뜻한다. Spring 이 `1-6` 을 받는 것은 `CronSpecTest.next` 의 `*/30 8-20 * * 1-6` 이 확인한다. Spring 이 요일 `0`·`7` 을 모두 일요일로 받는지는 `0 4 * * 0`·`0 4 * * 7`·`sun` 케이스가 확인한다 — 하나라도 실패하면 `parse` 안에서 Spring 식을 만들 때 요일 칸의 `7` 을 `0` 으로 바꾸고(`DOW` 이름은 그대로) 시험을 다시 돌린다.

- [ ] **Step 4: 통과를 확인한다** — `../gradlew test --max-workers=2 --tests '*CronSpecTest'` → PASS

- [ ] **Step 5: `JobVarsTest` 를 쓴다**

```java
package com.dongkuk.dmes.mcm.job.def;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.def.JobVar.Type;
import com.dongkuk.dmes.mcm.job.def.JobVars.RunFacts;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobVarsTest {

    private static RunFacts facts(String schedAt, String now, String prev) {
        return new RunFacts(LocalDateTime.parse(schedAt), LocalDateTime.parse(now), prev == null ? null : LocalDateTime.parse(prev), "mdm.sync", "MDM");
    }

    private static JobVar v(String name, Type type, String value) {
        return new JobVar(name, type, value, "");
    }

    @Test
    @DisplayName("날짜 변수는 SCHED_AT 기준 — 자정 작업이 23:59:30 에 선점돼도 :today 는 예정 날짜, :now 만 선점 시각이다")
    void datesFollowSchedAt() {
        Map<String, Object> r = JobVars.resolve(List.of(
                v("today", Type.DATE, ":today"), v("yesterday", Type.DATE, ":yesterday"), v("now", Type.DATE, ":now"),
                v("sched", Type.DATE, ":schedAt")),
                facts("2026-10-09T00:00:00", "2026-10-08T23:59:30", null));
        assertThat(r.get("today")).isEqualTo("2026-10-09");
        assertThat(r.get("yesterday")).isEqualTo("2026-10-08");
        assertThat(r.get("now")).isEqualTo("2026-10-08T23:59:30");
        assertThat(r.get("sched")).isEqualTo("2026-10-09T00:00:00");
    }

    @Test
    @DisplayName(":monthStart·:prevMonthStart 는 예정 날짜의 달 기준")
    void monthStarts() {
        Map<String, Object> r = JobVars.resolve(List.of(v("a", Type.DATE, ":monthStart"), v("b", Type.DATE, ":prevMonthStart")),
                facts("2026-01-15T01:00:00", "2026-01-15T01:00:05", null));
        assertThat(r.get("a")).isEqualTo("2026-01-01");
        assertThat(r.get("b")).isEqualTo("2025-12-01");
    }

    @Test
    @DisplayName(":prevRunAt 은 없으면 null, 있으면 시각 글자. :jobId·:moduleCd 는 사실값")
    void prevRunAtAndIds() {
        List<JobVar> vars = List.of(v("p", Type.DATE, ":prevRunAt"), v("j", Type.STRING, ":jobId"), v("m", Type.STRING, ":moduleCd"));
        assertThat(JobVars.resolve(vars, facts("2026-10-09T02:00:00", "2026-10-09T02:00:00", null)).get("p")).isNull();
        Map<String, Object> r = JobVars.resolve(vars, facts("2026-10-09T02:00:00", "2026-10-09T02:00:00", "2026-10-08T02:00:00"));
        assertThat(r.get("p")).isEqualTo("2026-10-08T02:00:00");
        assertThat(r.get("j")).isEqualTo("mdm.sync");
        assertThat(r.get("m")).isEqualTo("MDM");
        assertThat(JobVars.usesPrevRunAt(vars)).isTrue();
        assertThat(JobVars.usesPrevRunAt(List.of(v("x", Type.STRING, "고정")))).isFalse();
    }

    @Test
    @DisplayName("고정값 — NUMBER 는 BigDecimal, JSON 은 Map/List, STRING 은 그대로")
    void fixedValues() {
        Map<String, Object> r = JobVars.resolve(List.of(v("n", Type.NUMBER, "12.5"), v("j", Type.JSON, "{\"a\":[1,2]}"), v("s", Type.STRING, "abc"),
                v("d", Type.DATE, "2026-10-01")), facts("2026-10-09T02:00:00", "2026-10-09T02:00:00", null));
        assertThat(r.get("n")).isEqualTo(new BigDecimal("12.5"));
        assertThat((Map<?, ?>) r.get("j")).containsKey("a");
        assertThat(r.get("s")).isEqualTo("abc");
        assertThat(r.get("d")).isEqualTo("2026-10-01");
    }

    @Test
    @DisplayName("validate — 이름 규칙·중복·30개 상한·알 수 없는 :변수·형식 불일치")
    void validate() {
        assertThat(JobVars.validate(List.of(v("1abc", Type.STRING, "x")))).anyMatch(s -> s.contains("이름"));
        assertThat(JobVars.validate(List.of(v("a", Type.STRING, "x"), v("a", Type.STRING, "y")))).anyMatch(s -> s.contains("겹"));
        assertThat(JobVars.validate(List.of(v("sql", Type.STRING, "x")))).anyMatch(s -> s.contains("예약어"));
        assertThat(JobVars.validate(List.of(v("action", Type.STRING, "x")))).anyMatch(s -> s.contains("예약어"));
        assertThat(JobVars.validate(List.of(v("a", Type.DATE, ":unknown")))).anyMatch(s -> s.contains(":unknown"));
        assertThat(JobVars.validate(List.of(v("n", Type.NUMBER, "abc")))).anyMatch(s -> s.contains("숫자"));
        assertThat(JobVars.validate(List.of(v("d", Type.DATE, "2026/10/01")))).anyMatch(s -> s.contains("날짜"));
        assertThat(JobVars.validate(List.of(v("j", Type.JSON, "{bad")))).anyMatch(s -> s.contains("JSON"));
        assertThat(JobVars.validate(java.util.stream.IntStream.range(0, 31).mapToObj(i -> v("v" + i, Type.STRING, "x")).toList()))
                .anyMatch(s -> s.contains("30"));
        assertThat(JobVars.validate(List.of(v("ok", Type.DATE, ":today"), v("n", Type.NUMBER, "1")))).isEmpty();
    }

    @Test
    @DisplayName("parse(toJson(x)) 왕복, null·빈 글자는 빈 목록, typesOf")
    void roundTrip() {
        List<JobVar> vars = List.of(new JobVar("baseDt", Type.DATE, ":yesterday", "기준일"), v("n", Type.NUMBER, "3"));
        assertThat(JobVars.parse(JobVars.toJson(vars))).isEqualTo(vars);
        assertThat(JobVars.parse(null)).isEmpty();
        assertThat(JobVars.parse("  ")).isEmpty();
        assertThat(JobVars.typesOf(vars)).containsEntry("baseDt", "DATE").containsEntry("n", "NUMBER");
    }
}
```

- [ ] **Step 6: 실패를 확인한다** — `../gradlew test --max-workers=2 --tests '*JobVarsTest'` → 컴파일 실패.

- [ ] **Step 7: `JobVar`·`JobVars` 구현**

```java
package com.dongkuk.dmes.mcm.job.def;

/** 작업 변수 한 개(설계 §5.0). value 는 고정값이거나 실행 변수({@code :today} 등). */
public record JobVar(String name, Type type, String value, String desc) {

    public enum Type { STRING, NUMBER, DATE, JSON }
}
```

```java
package com.dongkuk.dmes.mcm.job.def;

import com.dongkuk.dmes.mcm.job.def.JobVar.Type;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 작업 변수 목록 — JSON 왕복·검사·실행 변수 확정(설계 §5.0).
 * 날짜 변수({@code :today :yesterday :monthStart :prevMonthStart})는 <b>SCHED_AT 기준</b>이다. DB_NOW 는 {@code :now} 에만 쓴다 —
 * 선점은 30초 일찍 할 수 있어서 자정 작업이 23:59:30 에 잡혀도 날짜가 하루 어긋나지 않게 한다.
 * 확정 값은 HTTP 본문·RUN.VARS_JSON 으로 그대로 나가므로 시각·날짜는 ISO 글자로 돌려준다.
 */
public final class JobVars {

    public static final int MAX_VARS = 30;
    public static final int MAX_VALUE_LENGTH = 1000;

    static final Pattern NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,29}$");
    /** 변수는 서비스 입력으로 그대로 넘어간다 — 내장 서비스의 입력 이름(sql·handlerId·source·save)과 예약 키 action 을 덮어쓰지 못하게 막는다. */
    static final Set<String> RESERVED = Set.of("action", "sql", "handlerId", "source", "save");
    private static final Set<String> RUNTIME = Set.of(":schedAt", ":now", ":today", ":yesterday", ":monthStart", ":prevMonthStart",
            ":prevRunAt", ":jobId", ":moduleCd");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();

    private JobVars() {}

    /** 확정에 쓰는 사실값. prevRunAt 은 직전 정상 일정 회차(TRIGGER_TP='S')의 예정 시각이며 없으면 null. */
    public record RunFacts(LocalDateTime schedAt, LocalDateTime now, LocalDateTime prevRunAt, String jobId, String moduleCd) {}

    public static List<JobVar> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<Map<String, Object>> rows = JSON.readValue(json, new TypeReference<>() {});
            List<JobVar> out = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                out.add(new JobVar(str(r.get("name")), Type.valueOf(str(r.get("type")) == null ? "STRING" : str(r.get("type"))),
                        str(r.get("value")) == null ? "" : str(r.get("value")), str(r.get("desc")) == null ? "" : str(r.get("desc"))));
            }
            return List.copyOf(out);
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw new IllegalArgumentException("변수 목록(JSON)을 읽을 수 없습니다");
        }
    }

    public static String toJson(List<JobVar> vars) {
        try {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (JobVar v : vars) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("name", v.name());
                m.put("type", v.type().name());
                m.put("value", v.value());
                m.put("desc", v.desc());
                rows.add(m);
            }
            return JSON.writeValueAsString(rows);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 오류 문구 목록(빈 목록이면 통과). */
    public static List<String> validate(List<JobVar> vars) {
        List<String> errors = new ArrayList<>();
        if (vars.size() > MAX_VARS) errors.add("변수는 " + MAX_VARS + "개까지 쓸 수 있습니다");
        Set<String> seen = new HashSet<>();
        for (JobVar v : vars) {
            String n = v.name();
            if (n == null || !NAME.matcher(n).matches()) {
                errors.add("변수 이름은 영문자로 시작하는 영문·숫자·_ 30자 이하여야 합니다: " + n);
                continue;
            }
            if (RESERVED.contains(n)) errors.add("변수 이름 " + n + " 은(는) 예약어입니다(action sql handlerId source save)");
            if (!seen.add(n)) errors.add("변수 이름이 겹칩니다: " + n);
            String value = v.value() == null ? "" : v.value();
            if (value.length() > MAX_VALUE_LENGTH) errors.add("변수 " + n + " 의 값은 " + MAX_VALUE_LENGTH + "자까지입니다");
            if (value.startsWith(":")) {
                if (!RUNTIME.contains(value)) errors.add("알 수 없는 실행 변수입니다: " + value + " (" + String.join(" ", new java.util.TreeSet<>(RUNTIME)) + ")");
                continue;
            }
            switch (v.type()) {
                case NUMBER -> {
                    if (!value.isBlank() && !isNumber(value)) errors.add("변수 " + n + " 은(는) 숫자여야 합니다: " + value);
                }
                case DATE -> {
                    if (!value.isBlank() && !isDate(value)) errors.add("변수 " + n + " 은(는) 날짜(yyyy-MM-dd 또는 yyyy-MM-dd HH:mm[:ss])여야 합니다: " + value);
                }
                case JSON -> {
                    if (!value.isBlank() && !isJson(value)) errors.add("변수 " + n + " 은(는) 올바른 JSON 이어야 합니다");
                }
                default -> { }
            }
        }
        return errors;
    }

    /** 변수 이름 → 형 이름(요청 본문의 varTypes). */
    public static Map<String, String> typesOf(List<JobVar> vars) {
        Map<String, String> out = new LinkedHashMap<>();
        for (JobVar v : vars) out.put(v.name(), v.type().name());
        return out;
    }

    /** 변수 중 {@code :prevRunAt} 를 쓰는 것이 있는가 — 있을 때만 직전 정상 회차를 읽는다. */
    public static boolean usesPrevRunAt(List<JobVar> vars) {
        return vars.stream().anyMatch(v -> ":prevRunAt".equals(v.value()));
    }

    /** 실행 변수를 확정한 이름 → 값 맵(입력 순서 유지). */
    public static Map<String, Object> resolve(List<JobVar> vars, RunFacts f) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (JobVar v : vars) out.put(v.name(), resolveOne(v, f));
        return out;
    }

    private static Object resolveOne(JobVar v, RunFacts f) {
        String value = v.value() == null ? "" : v.value();
        LocalDate sched = f.schedAt().toLocalDate();
        switch (value) {
            case ":schedAt": return DATE_TIME.format(f.schedAt());
            case ":now": return DATE_TIME.format(f.now());
            case ":today": return sched.toString();
            case ":yesterday": return sched.minusDays(1).toString();
            case ":monthStart": return sched.withDayOfMonth(1).toString();
            case ":prevMonthStart": return sched.withDayOfMonth(1).minusMonths(1).toString();
            case ":prevRunAt": return f.prevRunAt() == null ? null : DATE_TIME.format(f.prevRunAt());
            case ":jobId": return f.jobId();
            case ":moduleCd": return f.moduleCd();
            default: break;
        }
        return switch (v.type()) {
            case NUMBER -> value.isBlank() ? null : new BigDecimal(value.trim());
            case JSON -> value.isBlank() ? null : readJson(value);
            case DATE -> value.isBlank() ? null : normalizeDate(value);
            default -> value;
        };
    }

    private static Object readJson(String value) {
        try {
            return JSON.readValue(value, Object.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON 변수를 읽을 수 없습니다");
        }
    }

    private static String normalizeDate(String value) {
        String s = value.trim();
        if (s.length() == 10) return LocalDate.parse(s).toString();
        String iso = s.replace(' ', 'T');
        if (iso.length() == 16) iso += ":00";
        return DATE_TIME.format(LocalDateTime.parse(iso));
    }

    private static boolean isNumber(String s) {
        try {
            new BigDecimal(s.trim());
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private static boolean isDate(String s) {
        try {
            normalizeDate(s);
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private static boolean isJson(String s) {
        try {
            JSON.readTree(s);
            return true;
        } catch (JsonProcessingException e) {
            return false;
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
```

- [ ] **Step 8: 통과를 확인한다** — `../gradlew test --max-workers=2 --tests '*CronSpecTest' --tests '*JobVarsTest'` → PASS

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/def src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/job/def
/usr/bin/git commit -m "$(printf 'feat(mcm-core): 예약 작업 crontab 식 검사·다음 시각·설명과 변수 확정(SCHED_AT 기준)을 더한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 3: cactus-core `job` — 요청·범위·결과 갱신

**담당 후보:** Claude opus/high  
**Model:** opus/high

설계 §4.4(실행 범위 `JobRunScope`·중첩 규칙)·§4.5(결과 DB 직접 갱신 `JobRunResultWriter`)·§3.5(권한)·D29.

**Files:**
- Create(모두 `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/job/`): `CollectedValue.java`, `JobRunRequest.java`, `JobRunScope.java`, `JobScopeRequiredException.java`, `JobRunReport.java`, `JobRunReporter.java`, `JobRunResultWriter.java`
- Test(`src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/job/`): `JobRunScopeTest.java`, `JobRunRequestTest.java`, `JobRunResultWriterOracleTest.java`

cactus-core 기존 클래스는 바꾸지 않는다. 자동 설정 등록은 Task 4 에서 한다.

**Interfaces:**
- Produces:
  - `record CollectedValue(String key, BigDecimal num, String txt)`
  - `record JobRunRequest(String runId, String jobId, String module, String serviceId, String action, Map<String,Object> inputs, Map<String,String> varTypes, Map<String,Object> config, int timeoutSec, Retry retry, String schedAt, boolean manual, String reqUserId)` + `record Retry(int count, int intervalMin)`; 메서드 `String userId()`(수동이고 `reqUserId` 가 있으면 그 사용자, 아니면 `"SCHEDULER"`), `LocalDateTime schedAtTime()`, `String slot()`(`yyyyMMddHHmm`). `schedAt` 은 ISO 글자(`2026-10-09T02:00:00`) — JSON 날짜 변환기 차이에 기대지 않는다.
  - `final class JobRunScope`: 생성자 `(String runId, String jobId, Map<String,Object> config, Map<String,Object> vars, Map<String,String> varTypes, LocalDateTime schedAt, boolean manual, Instant deadline, Clock clock)`; 정적 `JobRunScope open(JobRunScope)`(이미 열려 있으면 `IllegalStateException`), `Optional<JobRunScope> current()`, `JobRunScope require()`(없으면 `JobScopeRequiredException`), `void close()`; 접근자 `runId() jobId() config() vars() varTypes() schedAt() manual() deadline()`, `int queryTimeoutSeconds()`(마감까지 남은 초를 올림, 최소 1), `void addItems(long)`, `Integer itemCount()`(보고된 적 없으면 null), `void collect(CollectedValue)`, `List<CollectedValue> collected()`.
  - `class JobScopeRequiredException extends IllegalStateException` — 메시지 고정 「예약 실행 밖에서는 호출할 수 없습니다.」
  - `record JobRunReport(String runId, String jobId, String status, Integer itemCnt, String msg, String serverNm, String serviceTag, String userId, String slot, List<CollectedValue> collected)`
  - `interface JobRunReporter { JobRunResultWriter.WriteResult write(JobRunReport report); }`
  - `class JobRunResultWriter implements JobRunReporter`: 생성자 `(DataSource dataSource, String schema, Duration retryDelay)`; `enum WriteResult { WRITTEN, LATE, FAILED }`; `WriteResult write(JobRunReport)`.
- Consumes: 없음(Task 4 가 쓴다).

- [ ] **Step 1: 범위·요청 시험을 쓴다**

```java
package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobRunScopeTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-09T00:00:00Z"), ZoneOffset.UTC);

    @AfterEach
    void closeScope() {
        JobRunScope.close();
    }

    private static JobRunScope scope(Instant deadline) {
        return new JobRunScope("r1", "mdm.sync", Map.of("k", "v"), Map.of("baseDt", "2026-10-09"), Map.of("baseDt", "DATE"),
                LocalDateTime.parse("2026-10-09T02:00:00"), true, deadline, CLOCK);
    }

    @Test
    @DisplayName("열기 전에는 current 가 비어 있고 require 는 「예약 실행 밖」 예외를 던진다")
    void notOpen() {
        assertThat(JobRunScope.current()).isEmpty();
        assertThatThrownBy(JobRunScope::require).isInstanceOf(JobScopeRequiredException.class).hasMessage("예약 실행 밖에서는 호출할 수 없습니다.");
    }

    @Test
    @DisplayName("열면 같은 스레드에서 보이고, 재진입(이미 열림)은 거절하며, 닫으면 사라진다")
    void openCloseReentry() {
        JobRunScope s = JobRunScope.open(scope(CLOCK.instant().plusSeconds(60)));
        assertThat(JobRunScope.require()).isSameAs(s);
        assertThatThrownBy(() -> JobRunScope.open(scope(CLOCK.instant().plusSeconds(60)))).isInstanceOf(IllegalStateException.class);
        assertThat(JobRunScope.require()).isSameAs(s);   // 바깥 범위는 그대로
        JobRunScope.close();
        assertThat(JobRunScope.current()).isEmpty();
    }

    @Test
    @DisplayName("다른 스레드에서는 범위가 보이지 않는다 — createNewService·병렬 게이트웨이를 거절하는 근거")
    void otherThreadSeesNothing() throws Exception {
        JobRunScope.open(scope(CLOCK.instant().plusSeconds(60)));
        AtomicReference<Boolean> present = new AtomicReference<>();
        Thread t = new Thread(() -> present.set(JobRunScope.current().isPresent()));
        t.start();
        t.join();
        assertThat(present.get()).isFalse();
    }

    @Test
    @DisplayName("쿼리 시간 초과 초 = 마감까지 남은 시간을 올림, 최소 1초")
    void queryTimeoutSeconds() {
        assertThat(scope(CLOCK.instant().plusMillis(30_001)).queryTimeoutSeconds()).isEqualTo(31);
        assertThat(scope(CLOCK.instant().plusMillis(30_000)).queryTimeoutSeconds()).isEqualTo(30);
        assertThat(scope(CLOCK.instant().plusMillis(200)).queryTimeoutSeconds()).isEqualTo(1);
        assertThat(scope(CLOCK.instant().minusSeconds(5)).queryTimeoutSeconds()).isEqualTo(1);
    }

    @Test
    @DisplayName("건수는 보고된 적이 없으면 null, 쌓으면 합계. 수집 값은 보고 순서대로")
    void itemsAndCollected() {
        JobRunScope s = scope(CLOCK.instant().plusSeconds(60));
        assertThat(s.itemCount()).isNull();
        s.addItems(3);
        s.addItems(2);
        assertThat(s.itemCount()).isEqualTo(5);
        s.collect(new CollectedValue("USD", new BigDecimal("1380.5"), null));
        s.collect(new CollectedValue("NOTE", null, "ok"));
        assertThat(s.collected()).extracting(CollectedValue::key).containsExactly("USD", "NOTE");
        assertThat(s.runId()).isEqualTo("r1");
        assertThat(s.jobId()).isEqualTo("mdm.sync");
        assertThat(s.config()).containsEntry("k", "v");
        assertThat(s.vars()).containsEntry("baseDt", "2026-10-09");
        assertThat(s.varTypes()).containsEntry("baseDt", "DATE");
        assertThat(s.schedAt()).isEqualTo(LocalDateTime.parse("2026-10-09T02:00:00"));
        assertThat(s.manual()).isTrue();
    }
}
```

```java
package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobRunRequestTest {

    private static JobRunRequest req(boolean manual, String reqUserId) {
        return new JobRunRequest("r1", "mdm.sync", "MDM", "jobCode", "run", null, null, null, 60, null, "2026-10-09T02:00:00", manual, reqUserId);
    }

    @Test
    @DisplayName("실행 사용자 — 예약은 SCHEDULER, 「지금 실행」은 요청자(없으면 SCHEDULER)")
    void userId() {
        assertThat(req(false, "admin").userId()).isEqualTo("SCHEDULER");
        assertThat(req(true, "admin").userId()).isEqualTo("admin");
        assertThat(req(true, null).userId()).isEqualTo("SCHEDULER");
    }

    @Test
    @DisplayName("null 맵은 빈 맵으로, 슬롯은 예정 시각의 yyyyMMddHHmm")
    void defaultsAndSlot() {
        JobRunRequest r = req(false, null);
        assertThat(r.inputs()).isEqualTo(Map.of());
        assertThat(r.varTypes()).isEqualTo(Map.of());
        assertThat(r.config()).isEqualTo(Map.of());
        assertThat(r.slot()).isEqualTo("202610090200");
        assertThat(r.schedAtTime().toString()).isEqualTo("2026-10-09T02:00");
    }
}
```

- [ ] **Step 2: 실패를 확인한다** — `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/cactus-core` 다음 `../gradlew test --max-workers=2 --tests '*JobRunScopeTest' --tests '*JobRunRequestTest'` → 컴파일 실패.

- [ ] **Step 3: 값 클래스를 구현한다**

```java
package com.dongkuk.dmes.cactus.job;

import java.math.BigDecimal;

/** 수집(COLLECT) 값 한 건 — 숫자는 num(소수 8자리까지), 그 밖은 txt(200자까지). 둘 중 하나만 값이 있다. */
public record CollectedValue(String key, BigDecimal num, String txt) {
}
```

```java
package com.dongkuk.dmes.cactus.job;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * MCM 이 모듈에 보내는 실행 요청 — {@code POST /internal/job/run} 본문(설계 §4.3).
 * {@code inputs} 는 MCM 이 선점 때 확정한 변수 값, {@code varTypes} 는 변수 이름 → STRING·NUMBER·DATE·JSON(계획 D4 — DATE 바인드용),
 * {@code config} 는 정의의 CONFIG_JSON 을 푼 맵이다. {@code schedAt} 은 ISO 글자라 JSON 날짜 변환기에 기대지 않는다.
 */
public record JobRunRequest(
        String runId,
        String jobId,
        String module,
        String serviceId,
        String action,
        Map<String, Object> inputs,
        Map<String, String> varTypes,
        Map<String, Object> config,
        int timeoutSec,
        Retry retry,
        String schedAt,
        boolean manual,
        String reqUserId) {

    public static final String SCHEDULER = "SCHEDULER";
    private static final DateTimeFormatter SLOT = DateTimeFormatter.ofPattern("yyyyMMddHHmm");

    public record Retry(int count, int intervalMin) {
    }

    public JobRunRequest {
        inputs = inputs == null ? Map.of() : inputs;
        varTypes = varTypes == null ? Map.of() : varTypes;
        config = config == null ? Map.of() : config;
    }

    /** 감사 주체 — 예약은 SCHEDULER, 「지금 실행」은 요청한 사용자. */
    public String userId() {
        return manual && reqUserId != null && !reqUserId.isBlank() ? reqUserId : SCHEDULER;
    }

    public LocalDateTime schedAtTime() {
        return LocalDateTime.parse(schedAt);
    }

    /** 수집 값 저장 슬롯 {@code yyyyMMddHHmm}. */
    public String slot() {
        return SLOT.format(schedAtTime());
    }
}
```

```java
package com.dongkuk.dmes.cactus.job;

/** 내장 서비스가 예약 실행 범위 없이 불렸다 — 웹 경로·{@code createNewService}·병렬 게이트웨이 같은 다른 스레드의 호출이다(설계 §4.4 중첩, §8). */
public class JobScopeRequiredException extends IllegalStateException {

    public JobScopeRequiredException() {
        super("예약 실행 밖에서는 호출할 수 없습니다.");
    }
}
```

```java
package com.dongkuk.dmes.cactus.job;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 예약 실행 한 시도의 범위 — 진입점({@link JobRunDispatcher})만 연다(ThreadLocal). 내장 서비스는 이 범위가 열려 있을 때만 실행한다(설계 §8).
 * 범위는 <b>시도마다 새로</b> 만든다(재시도가 건수·수집 값을 비운다). 같은 스레드의 연결 서브서비스에서만 보이고, 다른 스레드
 * ({@code createNewService}·병렬 게이트웨이)에서는 {@link #current()} 가 비어 있다. 감시 스레드가 볼 상태는 별도 객체(AtomicReference)이며
 * 이 범위를 쓰지 않는다.
 */
public final class JobRunScope {

    private static final ThreadLocal<JobRunScope> CURRENT = new ThreadLocal<>();

    private final String runId;
    private final String jobId;
    private final Map<String, Object> config;
    private final Map<String, Object> vars;
    private final Map<String, String> varTypes;
    private final LocalDateTime schedAt;
    private final boolean manual;
    private final Instant deadline;
    private final Clock clock;
    private final AtomicLong items = new AtomicLong();
    private final AtomicBoolean itemsReported = new AtomicBoolean();
    private final List<CollectedValue> collected = new CopyOnWriteArrayList<>();

    public JobRunScope(String runId, String jobId, Map<String, Object> config, Map<String, Object> vars,
                       Map<String, String> varTypes, LocalDateTime schedAt, boolean manual, Instant deadline, Clock clock) {
        this.runId = runId;
        this.jobId = jobId;
        this.config = config == null ? Map.of() : config;
        this.vars = vars == null ? Map.of() : vars;
        this.varTypes = varTypes == null ? Map.of() : varTypes;
        this.schedAt = schedAt;
        this.manual = manual;
        this.deadline = deadline;
        this.clock = clock;
    }

    /** 범위를 연다. 이미 열려 있으면 거절한다 — 같은 스레드 재진입은 안쪽 start 가 바깥 트랜잭션·감사 주체를 깨기 때문이다. */
    public static JobRunScope open(JobRunScope scope) {
        if (CURRENT.get() != null) throw new IllegalStateException("예약 실행 범위가 이미 열려 있습니다(재진입 금지)");
        CURRENT.set(scope);
        return scope;
    }

    public static Optional<JobRunScope> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    /** 열려 있는 범위. 없으면 {@link JobScopeRequiredException}. 내장 서비스의 Java 몸체가 첫 줄에서 부른다. */
    public static JobRunScope require() {
        JobRunScope s = CURRENT.get();
        if (s == null) throw new JobScopeRequiredException();
        return s;
    }

    public static void close() {
        CURRENT.remove();
    }

    public String runId() { return runId; }
    public String jobId() { return jobId; }
    public Map<String, Object> config() { return config; }
    public Map<String, Object> vars() { return vars; }
    public Map<String, String> varTypes() { return varTypes; }
    /** 예정 시각(SCHED_AT) — 코드 작업 문맥과 수집 슬롯의 기준 날짜. */
    public LocalDateTime schedAt() { return schedAt; }
    public boolean manual() { return manual; }
    public Instant deadline() { return deadline; }

    /** JDBC 문장마다 걸 쿼리 시간 초과(초) — 마감까지 남은 시간을 올림, 최소 1초(설계 §4.4). */
    public int queryTimeoutSeconds() {
        long millis = Duration.between(clock.instant(), deadline).toMillis();
        long seconds = (millis + 999) / 1000;
        return (int) Math.max(1, seconds);
    }

    public void addItems(long n) {
        items.addAndGet(n);
        itemsReported.set(true);
    }

    /** 쌓인 건수. 보고된 적이 없으면 null. */
    public Integer itemCount() {
        return itemsReported.get() ? (int) Math.min(Integer.MAX_VALUE, items.get()) : null;
    }

    public void collect(CollectedValue value) {
        collected.add(value);
    }

    public List<CollectedValue> collected() {
        return List.copyOf(collected);
    }
}
```

- [ ] **Step 4: 통과를 확인한다** — 같은 명령 → PASS

- [ ] **Step 5: 결과 갱신기 Oracle 시험을 쓴다** (cactus-core 하니스에는 V3 가 없으므로, 시험이 접속 사용자(기본 `APSAPUSER`) 스키마에 필요한 표를 직접 만들고 `schema` 를 그 사용자로 준다 — 같은 SQL 이 `MCMAPUSER.` 접두 대신 시험 사용자 접두로 돈다. 접속값이 없으면 건너뛴다)

```java
package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.dongkuk.dmes.cactus.job.JobRunResultWriter.WriteResult;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link JobRunResultWriter} 를 실제 Oracle 에서 확인한다(설계 §4.5·§9). 접속값은 하니스(-Pdmes.ora.test=clone)가 넘기는
 * dmes.ora.url·dmes.ora.password(사용자는 dmes.ora.user, 기본 APSAPUSER)이고, 없으면 건너뛴다.
 * V3 는 mcm-core 소유라 이 시험은 접속 사용자 스키마에 V3 와 같은 칸의 표 둘을 만들고 {@code schema} 를 그 사용자로 준다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class JobRunResultWriterOracleTest {

    private static final String URL = System.getProperty("dmes.ora.url");
    private static final String USER = System.getProperty("dmes.ora.user", "APSAPUSER");
    private static final String PASSWORD = System.getProperty("dmes.ora.password", "dmes_password_123");

    private static final String RUN_DDL = "CREATE TABLE TB_MCM_JOB_RUN (JOB_ID VARCHAR2(60 CHAR) NOT NULL, SCHED_AT TIMESTAMP(0) NOT NULL, "
            + "TRIGGER_TP CHAR(1 CHAR) NOT NULL, RUN_ID VARCHAR2(36 CHAR) NOT NULL, MODULE_CD VARCHAR2(10 CHAR), SERVICE_ID VARCHAR2(200 CHAR), "
            + "SERVER_NM VARCHAR2(100 CHAR), SERVICE_TAG VARCHAR2(40 CHAR), STATUS VARCHAR2(8 CHAR) NOT NULL, STARTED_AT TIMESTAMP(6), "
            + "ENDED_AT TIMESTAMP(6), ITEM_CNT NUMBER(10,0), MSG VARCHAR2(500 CHAR), REQ_USR_ID VARCHAR2(100 CHAR), TIMEOUT_SEC NUMBER(6,0), "
            + "VARS_JSON CLOB, C_AT TIMESTAMP(6), C_USR_ID VARCHAR2(100 CHAR), C_PGM_ID VARCHAR2(100 CHAR), C_SVC_ID VARCHAR2(100 CHAR), "
            + "U_AT TIMESTAMP(6), U_USR_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR), U_SVC_ID VARCHAR2(100 CHAR), "
            + "VER NUMBER(19,0) DEFAULT 0 NOT NULL, CONSTRAINT PK_TEST_JOB_RUN PRIMARY KEY (JOB_ID, SCHED_AT, TRIGGER_TP), CONSTRAINT UQ_TEST_JOB_RUN UNIQUE (RUN_ID))";
    private static final String DATA_DDL = "CREATE TABLE TB_MCM_JOB_COLLECT_DATA (JOB_ID VARCHAR2(60 CHAR) NOT NULL, SLOT VARCHAR2(12 CHAR) NOT NULL, "
            + "ITEM_KEY VARCHAR2(100 CHAR) NOT NULL, VALUE_NUM NUMBER(24,8), VALUE_TXT VARCHAR2(200 CHAR), C_AT TIMESTAMP(6), C_USR_ID VARCHAR2(100 CHAR), "
            + "C_PGM_ID VARCHAR2(100 CHAR), C_SVC_ID VARCHAR2(100 CHAR), U_AT TIMESTAMP(6), U_USR_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR), "
            + "U_SVC_ID VARCHAR2(100 CHAR), VER NUMBER(19,0) DEFAULT 0 NOT NULL, CONSTRAINT PK_TEST_JOB_CDATA PRIMARY KEY (JOB_ID, SLOT, ITEM_KEY))";

    private static HikariDataSource ds;
    private static JdbcTemplate jdbc;
    private JobRunResultWriter writer;

    @BeforeAll
    static void createTables() throws Exception {
        assumeTrue(URL != null && !URL.isBlank(), "시험 PDB 접속값(dmes.ora.url)이 없어 건너뜀");
        for (String t : List.of("TB_MCM_JOB_RUN", "TB_MCM_JOB_COLLECT_DATA")) drop(t);
        exec(RUN_DDL);
        exec(DATA_DDL);
        ds = new HikariDataSource();
        ds.setJdbcUrl(URL);
        ds.setUsername(USER);
        ds.setPassword(PASSWORD);
        ds.setMaximumPoolSize(3);
        ds.setMinimumIdle(0);
        ds.setPoolName("job-writer-test");
        jdbc = new JdbcTemplate(ds);
    }

    @AfterAll
    static void dropTables() throws Exception {
        if (ds != null) ds.close();
        if (URL == null || URL.isBlank()) return;
        for (String t : List.of("TB_MCM_JOB_RUN", "TB_MCM_JOB_COLLECT_DATA")) drop(t);
    }

    @BeforeEach
    void rows() {
        jdbc.update("DELETE FROM TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("DELETE FROM TB_MCM_JOB_RUN");
        jdbc.update("INSERT INTO TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT) "
                + "VALUES ('j1', TIMESTAMP '2026-10-09 02:00:00', 'S', 'run-1', 'MDM', 'jobCode', 'RUN', SYSTIMESTAMP)");
        writer = new JobRunResultWriter(ds, USER, Duration.ZERO);
    }

    private JobRunReport report(String status, List<CollectedValue> collected) {
        return new JobRunReport("run-1", "j1", status, 3, "메시지", "host:mdm:1", "ab12", "SCHEDULER", "202610090200", collected);
    }

    private Map<String, Object> run() {
        return jdbc.queryForMap("SELECT STATUS, ITEM_CNT, MSG, SERVER_NM, SERVICE_TAG, VER, ENDED_AT, U_USR_ID FROM TB_MCM_JOB_RUN WHERE RUN_ID = 'run-1'");
    }

    private int dataCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MCM_JOB_COLLECT_DATA", Integer.class);
    }

    @Test
    @DisplayName("OK — RUN 행을 닫고(상태·건수·메시지·끝 시각·서버·태그·VER+1) 수집 값을 MERGE 한다")
    void okWritesRunAndCollectedValues() {
        List<CollectedValue> values = List.of(new CollectedValue("USD", new BigDecimal("1380.5"), null), new CollectedValue("NOTE", null, "정상"));
        assertThat(writer.write(report("OK", values))).isEqualTo(WriteResult.WRITTEN);

        Map<String, Object> r = run();
        assertThat(r.get("STATUS")).isEqualTo("OK");
        assertThat(((Number) r.get("ITEM_CNT")).intValue()).isEqualTo(3);
        assertThat(r.get("MSG")).isEqualTo("메시지");
        assertThat(r.get("SERVER_NM")).isEqualTo("host:mdm:1");
        assertThat(r.get("SERVICE_TAG")).isEqualTo("ab12");
        assertThat(r.get("ENDED_AT")).isNotNull();
        assertThat(((Number) r.get("VER")).longValue()).isEqualTo(1);
        assertThat(r.get("U_USR_ID")).isEqualTo("SCHEDULER");
        assertThat(dataCount()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT VALUE_NUM FROM TB_MCM_JOB_COLLECT_DATA WHERE ITEM_KEY = 'USD'", BigDecimal.class))
                .isEqualByComparingTo("1380.5");
    }

    @Test
    @DisplayName("SERVER_NM 은 MCM 이 접수 기록으로 이미 썼으면 덮어쓰지 않는다(NVL)")
    void serverNmKeptWhenPresent() {
        jdbc.update("UPDATE TB_MCM_JOB_RUN SET SERVER_NM = 'mcm-recorded' WHERE RUN_ID = 'run-1'");
        writer.write(report("OK", List.of()));
        assertThat(run().get("SERVER_NM")).isEqualTo("mcm-recorded");
    }

    @Test
    @DisplayName("FAIL·TIMEOUT 은 수집 값을 저장하지 않는다")
    void failDoesNotStoreCollected() {
        assertThat(writer.write(report("FAIL", List.of(new CollectedValue("USD", BigDecimal.ONE, null))))).isEqualTo(WriteResult.WRITTEN);
        assertThat(run().get("STATUS")).isEqualTo("FAIL");
        assertThat(dataCount()).isZero();
    }

    @Test
    @DisplayName("이미 TIMEOUT(정리)·SKIP 으로 닫힌 행은 덮어쓰지 않고 LATE — 수집 값도 저장하지 않는다")
    void lateResultDoesNotOverwrite() {
        jdbc.update("UPDATE TB_MCM_JOB_RUN SET STATUS = 'TIMEOUT', MSG = '결과 없음' WHERE RUN_ID = 'run-1'");
        assertThat(writer.write(report("OK", List.of(new CollectedValue("USD", BigDecimal.ONE, null))))).isEqualTo(WriteResult.LATE);
        assertThat(run().get("STATUS")).isEqualTo("TIMEOUT");
        assertThat(run().get("MSG")).isEqualTo("결과 없음");
        assertThat(dataCount()).isZero();
    }

    @Test
    @DisplayName("같은 결과를 두 번 쓰면 두 번째는 LATE — 수집 값은 상태가 바뀌는 그 한 번만 저장된다")
    void secondWriteIsLate() {
        List<CollectedValue> values = List.of(new CollectedValue("USD", BigDecimal.ONE, null));
        assertThat(writer.write(report("OK", values))).isEqualTo(WriteResult.WRITTEN);
        assertThat(writer.write(report("OK", values))).isEqualTo(WriteResult.LATE);
        assertThat(dataCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("대상 서비스가 롤백돼도(바깥 트랜잭션 롤백) 결과 기록은 별도 트랜잭션(REQUIRES_NEW)이라 남는다")
    void writeSurvivesOuterRollback() {
        TransactionTemplate outer = new TransactionTemplate(new DataSourceTransactionManager(ds));
        outer.executeWithoutResult(status -> {
            // 바깥 트랜잭션이 스레드에 묶은 연결과 별개의 새 연결로 커밋한다
            assertThat(writer.write(report("FAIL", List.of()))).isEqualTo(WriteResult.WRITTEN);
            status.setRollbackOnly();
        });
        assertThat(run().get("STATUS")).isEqualTo("FAIL");
    }

    @Test
    @DisplayName("갱신이 DB 순간 오류로 실패하면 지연 뒤 한 번 더 한다 — 두 번째에 성공하면 WRITTEN")
    void retriesOnce() {
        AtomicInteger calls = new AtomicInteger();
        DataSource flaky = new AbstractDataSource() {
            @Override
            public Connection getConnection() throws SQLException {
                if (calls.getAndIncrement() == 0) throw new SQLException("순간 오류");
                return ds.getConnection();
            }

            @Override
            public Connection getConnection(String u, String p) throws SQLException {
                return getConnection();
            }
        };
        JobRunResultWriter w = new JobRunResultWriter(flaky, USER, Duration.ZERO);
        assertThat(w.write(report("OK", List.of()))).isEqualTo(WriteResult.WRITTEN);
        assertThat(calls.get()).isGreaterThanOrEqualTo(2);
        assertThat(run().get("STATUS")).isEqualTo("OK");
    }

    @Test
    @DisplayName("두 번 모두 실패하면 예외를 던지지 않고 FAILED — 그 행은 정리가 TIMEOUT 으로 닫는다")
    void failsQuietlyAfterRetry() {
        DataSource broken = new AbstractDataSource() {
            @Override
            public Connection getConnection() throws SQLException {
                throw new SQLException("jdbc:oracle://secret-host/db password=hunter2");
            }

            @Override
            public Connection getConnection(String u, String p) throws SQLException {
                return getConnection();
            }
        };
        assertThat(new JobRunResultWriter(broken, USER, Duration.ZERO).write(report("OK", List.of()))).isEqualTo(WriteResult.FAILED);
        assertThat(run().get("STATUS")).isEqualTo("RUN");
    }

    @Test
    @DisplayName("스키마 이름은 식별자 모양만 받는다(SQL 접두에 그대로 들어가므로)")
    void rejectsBadSchema() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new JobRunResultWriter(ds, "X; DROP TABLE T", Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static void exec(String sql) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD); Statement st = c.createStatement()) {
            st.execute(sql);
        }
    }

    private static void drop(String table) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD); Statement st = c.createStatement()) {
            st.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + table + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
        }
    }
}
```

- [ ] **Step 6: 실패를 확인한다** — `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobRunResultWriterOracleTest'` → 컴파일 실패(`JobRunResultWriter`·`JobRunReport` 없음).

- [ ] **Step 7: 보고 record·인터페이스·갱신기를 구현한다**

```java
package com.dongkuk.dmes.cactus.job;

import java.util.List;

/** 진입점이 한 회차의 마지막에 쓰는 결과 — status 는 OK·FAIL·TIMEOUT. slot 은 수집 값 슬롯(yyyyMMddHHmm). */
public record JobRunReport(
        String runId,
        String jobId,
        String status,
        Integer itemCnt,
        String msg,
        String serverNm,
        String serviceTag,
        String userId,
        String slot,
        List<CollectedValue> collected) {

    public JobRunReport {
        collected = collected == null ? List.of() : List.copyOf(collected);
    }
}
```

```java
package com.dongkuk.dmes.cactus.job;

/** 결과를 쓰는 쪽 — 운영은 {@link JobRunResultWriter}, 시험은 기록용 가짜. */
public interface JobRunReporter {

    JobRunResultWriter.WriteResult write(JobRunReport report);
}
```

```java
package com.dongkuk.dmes.cactus.job;

import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 실행 결과를 RUN 행에 직접 쓴다(설계 §4.5) — JOB 표 구조를 아는 모듈 쪽의 유일한 코드이다.
 * <ul>
 *   <li>연결: 그 모듈 앱의 기본 DataSource(자기 스키마 사용자). 스키마 접두는 {@code dmes.job.schema}(기본 MCMAPUSER).</li>
 *   <li>트랜잭션: 대상 서비스 트랜잭션과 분리된 짧은 트랜잭션({@code REQUIRES_NEW}). 대상이 롤백돼도 FAIL 기록은 남는다.</li>
 *   <li>{@code UPDATE … WHERE RUN_ID AND STATUS='RUN'} — 0행이면 이미 TIMEOUT(정리)·SKIP(MCM 거절)으로 닫힌 행이라 덮어쓰지 않고 「늦은 결과」 WARN.</li>
 *   <li>OK 이고 수집 값이 있으면 같은 트랜잭션에서 COLLECT_DATA 에 MERGE — 상태가 바뀐 그 한 번만 저장된다.</li>
 *   <li>실패하면 {@code retryDelay}(운영 5초) 뒤 한 번 더. 그래도 실패하면 WARN 하고 버린다(재전송 대기열 없음 — 정리가 TIMEOUT 으로 닫는다).</li>
 * </ul>
 * 로그에는 예외 종류만 남긴다(DB 원문 메시지·주소 금지). 이 SQL 은 실행 스레드의 MDC(대상 serviceId) 아래에서 돌아 모듈 업무 로그에 남는다.
 */
public class JobRunResultWriter implements JobRunReporter {

    public enum WriteResult { WRITTEN, LATE, FAILED }

    private static final Logger log = LoggerFactory.getLogger(JobRunResultWriter.class);
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    private static final int MSG_MAX = 500;

    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;
    private final Duration retryDelay;
    private final String updateRunSql;
    private final String mergeDataSql;

    public JobRunResultWriter(DataSource dataSource, String schema, Duration retryDelay) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) {
            throw new IllegalArgumentException("dmes.job.schema 는 영문자로 시작하는 식별자여야 합니다");
        }
        this.jdbc = new JdbcTemplate(dataSource);
        this.tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.retryDelay = retryDelay;
        this.updateRunSql = """
                UPDATE %1$s.TB_MCM_JOB_RUN
                SET    STATUS = ?
                     , ITEM_CNT = ?
                     , MSG = ?
                     , ENDED_AT = %2$s
                     , SERVER_NM = NVL(SERVER_NM, ?)
                     , SERVICE_TAG = ?
                     , U_AT = %2$s
                     , U_USR_ID = ?
                     , U_PGM_ID = 'JobRunResultWriter'
                     , VER = VER + 1
                WHERE  RUN_ID = ?
                AND    STATUS = 'RUN'
                """.formatted(schema, NOW);
        this.mergeDataSql = """
                MERGE INTO %1$s.TB_MCM_JOB_COLLECT_DATA T
                USING (SELECT ? JOB_ID, ? SLOT, ? ITEM_KEY, ? VALUE_NUM, ? VALUE_TXT FROM DUAL) S
                ON    (T.JOB_ID = S.JOB_ID AND T.SLOT = S.SLOT AND T.ITEM_KEY = S.ITEM_KEY)
                WHEN MATCHED THEN UPDATE
                SET   T.VALUE_NUM = S.VALUE_NUM
                    , T.VALUE_TXT = S.VALUE_TXT
                    , T.U_AT = %2$s
                    , T.U_USR_ID = ?
                    , T.U_PGM_ID = 'JobRunResultWriter'
                    , T.VER = T.VER + 1
                WHEN NOT MATCHED THEN INSERT
                      (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, VALUE_TXT, C_AT, C_USR_ID, C_PGM_ID, U_AT, U_USR_ID, U_PGM_ID, VER)
                VALUES (S.JOB_ID, S.SLOT, S.ITEM_KEY, S.VALUE_NUM, S.VALUE_TXT, %2$s, ?, 'JobRunResultWriter', %2$s, ?, 'JobRunResultWriter', 0)
                """.formatted(schema, NOW);
    }

    @Override
    public WriteResult write(JobRunReport r) {
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                Boolean updated = tx.execute(status -> doWrite(r));
                if (Boolean.FALSE.equals(updated)) {
                    log.warn("늦은 결과를 버립니다 — 이미 닫힌 회차 runId={} jobId={} 상태={}", r.runId(), r.jobId(), r.status());
                    return WriteResult.LATE;
                }
                return WriteResult.WRITTEN;
            } catch (RuntimeException e) {
                log.warn("예약 작업 결과 갱신 실패({}/2) runId={} 원인={}", attempt, r.runId(), e.getClass().getSimpleName());
                if (attempt == 1) pause();
            }
        }
        return WriteResult.FAILED;
    }

    private boolean doWrite(JobRunReport r) {
        String msg = r.msg() == null ? null : r.msg().length() > MSG_MAX ? r.msg().substring(0, MSG_MAX) : r.msg();
        int updated = jdbc.update(updateRunSql, r.status(), r.itemCnt(), msg, r.serverNm(), r.serviceTag(), r.userId(), r.runId());
        if (updated == 0) return false;
        if ("OK".equals(r.status())) {
            List<CollectedValue> values = r.collected();
            for (CollectedValue v : values) {
                jdbc.update(mergeDataSql, r.jobId(), r.slot(), v.key(), v.num(), v.txt(), r.userId(), r.userId(), r.userId());
            }
        }
        return true;
    }

    private void pause() {
        if (retryDelay.isZero() || retryDelay.isNegative()) return;
        try {
            Thread.sleep(retryDelay.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

주의: `mergeDataSql` 의 `?` 순서는 USING 5개(JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, VALUE_TXT) → MATCHED 의 `U_USR_ID` 1개 → NOT MATCHED 의 `C_USR_ID`·`U_USR_ID` 2개로 모두 8개이고, `doWrite` 가 넘기는 인자(`jobId, slot, key, num, txt, userId, userId, userId`)와 일치한다. Oracle 의 `MERGE … WHEN MATCHED THEN UPDATE SET` 에서 ON 절에 쓰인 칼럼을 갱신하지 않는 것도 지켰다.

- [ ] **Step 8: 통과를 확인한다**
  - `../gradlew test --max-workers=2 --tests '*JobRunScopeTest' --tests '*JobRunRequestTest'` → PASS
  - `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobRunResultWriterOracleTest'` → PASS (`TPL_EMPTY` 에 `APSAPUSER` 가 있다. 접속 사용자를 바꾸려면 `-Ddmes.ora.user` 는 Gradle 이 넘기지 않으므로 기본 `APSAPUSER` 를 쓴다)

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/job src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/job
/usr/bin/git commit -m "$(printf 'feat(cactus-core): 예약 실행 범위와 실행 결과 DB 직접 갱신기를 더한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 4: cactus-core `job` — 예약 실행 진입점 `JobRunDispatcher`

**담당 후보:** Claude opus/high  
**Model:** opus/high

설계 §4.4(접수 뒤 진입점 1~9·시간 초과·중첩)·§4.8(로그 위치)·§5.3(실행 사용자)·D16·D27·D31. 본보기: `dmom/receiver/DmomReceiveDispatcher`(웹 없이 `serviceStarter.start`, 시스템 감사 주체), `oasis/OasisServiceExecutor`(시작·끝 로그 두 줄·MDC).

**Files:**
- Create(`src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/job/`): `JobRunExecutor.java`, `JobServiceInvoker.java`, `JobServerName.java`, `JobRunDispatcher.java`, `JobAutoConfiguration.java`
- Modify: `src/backend/cactus-core/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` (한 줄 추가)
- Test(`src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/job/`): `JobRunDispatcherTest.java`, `JobRunTestTask.java`, `JobAutoConfigurationTest.java`
- Test 자원(`src/backend/cactus-core/src/test/resources/job-run/`): BPMN 11개(Step 2 의 생성 스크립트 + 손으로 쓰는 3개)

**Interfaces:**
- Consumes(Task 3): `JobRunRequest`, `JobRunScope`, `JobRunReport`, `JobRunReporter`, `JobRunResultWriter`, `CollectedValue`.
- Produces:
  - `final class JobRunExecutor implements AutoCloseable`: `JobRunExecutor(int poolSize)`; `Future<?> submit(Runnable)`(풀이 가득이면 `RejectedExecutionException` — 스레드 `poolSize` 개, 대기열 0), `ScheduledFuture<?> schedule(Runnable, long delay, TimeUnit)`(감시·재시도 대기용 데몬 스케줄러), `int poolSize()`, `close()`.
  - `final class JobServiceInvoker`: `static ServiceResult start(ServiceStarter, org.springframework.context.ApplicationContext, String serviceId, Map<String,Object> inputs, CactusAudit audit)`(`AuditHolder`·`DefaultServiceContext.setAudit`·끝에 `remove`), `static Map<String,TypedObject> typed(Map<String,Object>)`(null·Map·List 에 명시 타입을 붙인다).
  - `final class JobServerName`: `static String resolve(String configured, String appName)`(없으면 `호스트:앱이름:pid`, 100자).
  - `class JobRunDispatcher`: 생성자 `(ServiceStarter, ApplicationContext, JobRunReporter, JobRunExecutor, String serverName, Clock)`; `enum SubmitResult { ACCEPTED, DUPLICATE, JOB_RUNNING, POOL_FULL }`; `SubmitResult submit(JobRunRequest)`(범위가 이미 열린 스레드에서 부르면 `IllegalStateException`); `String serverName()`.
  - `class JobAutoConfiguration` — 빈 `jobRunResultWriter`·`jobRunExecutor`·`jobRunDispatcher`, `dmes.job.agent.enabled`(기본 true) 일 때, `ServiceStarter` 빈이 있을 때.

- [ ] **Step 1: 시험용 작업 클래스를 쓴다** — BPMN 의 `camunda:class` 가 전체 이름으로 새 인스턴스를 만든다(`ServiceStarterCharTask` 와 같은 방식).

```java
package com.dongkuk.dmes.cactus.job;

import com.dongkuk.oasis.exceptions.UserException;
import java.math.BigDecimal;
import java.sql.SQLTimeoutException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.MDC;

/** {@link JobRunDispatcherTest} 의 BPMN(job-run/*.bpmn) 이 부르는 작업. 상태는 정적이라 시험이 {@link #reset()} 한다. */
public class JobRunTestTask {

    static final List<String> LOG = Collections.synchronizedList(new ArrayList<>());
    static final AtomicInteger FLAKY = new AtomicInteger();
    static volatile CountDownLatch started = new CountDownLatch(1);
    static volatile long sleepMillis = 10_000;
    static volatile JobRunDispatcher dispatcher;

    static void reset() {
        LOG.clear();
        FLAKY.set(0);
        started = new CountDownLatch(1);
        sleepMillis = 10_000;
    }

    /** 정상 — 건수 7 을 범위에 쌓고, MDC 를 기록한다. */
    public String ok() {
        JobRunScope.require().addItems(7);
        LOG.add("ok:serviceId=" + MDC.get("serviceId") + ":tag=" + MDC.get("service_tag") + ":run=" + MDC.get("runId"));
        return "done";
    }

    public void userError() {
        throw new UserException("업무 예외");
    }

    public void systemError() {
        throw new IllegalStateException("jdbc:oracle://secret-host/db password=hunter2");
    }

    /** Error 는 CoreServiceStarter 가 결과로 바꾸지 않는다(Exception 만 잡는다). */
    public void fatal() {
        throw new AssertionError("fatal secret");
    }

    /** 인터럽트되면 SYSTEM_ERROR 로 끝난다(감시가 TIMEOUT 을 먼저 썼는지 확인하는 시험용). */
    public void slow() {
        started.countDown();
        try {
            Thread.sleep(sleepMillis);
            LOG.add("slow-finished");
        } catch (InterruptedException e) {
            LOG.add("interrupted");
            throw new IllegalStateException("interrupted");
        }
    }

    /** 첫 시도는 실패, 둘째 시도부터 성공 — 건수 5. */
    public String flaky() {
        if (FLAKY.incrementAndGet() == 1) throw new IllegalStateException("첫 시도 실패");
        JobRunScope.require().addItems(5);
        return "ok";
    }

    public void queryTimeout() {
        throw new RuntimeException("쿼리 실패", new SQLTimeoutException("ORA-01013: user requested cancel of current operation"));
    }

    /** 범위 안에서 진입점을 다시 부른다 — 거절돼야 하고 바깥 회차는 그대로 OK. */
    public String reenter() {
        try {
            dispatcher.submit(new JobRunRequest("inner-run", "inner-job", "MDM", "jobRunOk", "run", null, null, null, 30, null,
                    "2026-10-09T02:00:00", false, null));
            LOG.add("reenter-accepted");
        } catch (IllegalStateException e) {
            LOG.add("reenter-rejected");
        }
        return "outer-ok";
    }

    /** 서브서비스 맨 안쪽·가운데에서 불린다 — 같은 스레드라 범위가 보인다. */
    public String leaf() {
        LOG.add("leaf:" + JobRunScope.current().map(JobRunScope::runId).orElse("none"));
        return "leaf";
    }

    /** 다른 스레드에서는 범위가 보이지 않는다(createNewService·병렬 게이트웨이와 같다). */
    public String otherThread() throws InterruptedException {
        boolean[] seen = new boolean[1];
        Thread t = new Thread(() -> seen[0] = JobRunScope.current().isPresent());
        t.start();
        t.join();
        LOG.add("otherThreadSeesScope=" + seen[0]);
        return "ok";
    }

    public String collect() {
        JobRunScope s = JobRunScope.require();
        s.collect(new CollectedValue("K", BigDecimal.ONE, null));
        s.addItems(1);
        return "c";
    }
}
```

- [ ] **Step 2: BPMN 을 만든다** — 서비스 태스크 하나짜리 8개는 아래 스크립트로 만든다(저장소 관례의 `JobRunTestTask` 전체 이름을 `camunda:class` 에 쓴다). 서브서비스 3겹 3개는 손으로 쓴다.

```bash
cd src/backend/cactus-core/src/test/resources
mkdir -p job-run
gen() {
cat > "job-run/$1.bpmn" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_$1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_$1" name="$3" isExecutable="true">
    <bpmn:startEvent id="s1" name="s1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="s1" targetRef="task" />
    <bpmn:serviceTask id="task" name="$3" camunda:class="com.dongkuk.dmes.cactus.job.JobRunTestTask">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="$2" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="task" targetRef="e1" />
    <bpmn:endEvent id="e1" name="e1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>
EOF
}
gen jobRunOk ok "정상"
gen jobRunUserError userError "업무 예외"
gen jobRunSystemError systemError "시스템 예외"
gen jobRunFatal fatal "치명 오류"
gen jobRunSlow slow "느린 작업"
gen jobRunFlaky flaky "첫 시도 실패"
gen jobRunQueryTimeout queryTimeout "쿼리 시간 초과"
gen jobRunReenter reenter "진입점 재진입"
gen jobRunOtherThread otherThread "다른 스레드 범위"
gen jobRunCollect collect "수집 값"
```

서브서비스 3겹(바깥 → 가운데 → 안쪽, 연결 서브서비스 = 같은 스레드·같은 트랜잭션): 각 파일의 `calledElement` 는 서비스 ID 이다.

`job-run/jobRunNestedOuter.bpmn`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_jobRunNestedOuter" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_jobRunNestedOuter" name="3겹 서브서비스 - 바깥" isExecutable="true">
    <bpmn:startEvent id="s1" name="s1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="s1" targetRef="callMid" />
    <bpmn:callActivity id="callMid" name="가운데 호출" calledElement="jobRunNestedMid">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="callMid" targetRef="e1" />
    <bpmn:endEvent id="e1" name="e1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>
```

`job-run/jobRunNestedMid.bpmn`: 위와 같되 id 를 `jobRunNestedMid`·이름 「3겹 서브서비스 - 가운데」로, `callMid` 를 `callInner`(`calledElement="jobRunNestedInner"`)로 바꾸고, 호출 앞에 `leaf` 태스크 하나를 둔다:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_jobRunNestedMid" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_jobRunNestedMid" name="3겹 서브서비스 - 가운데" isExecutable="true">
    <bpmn:startEvent id="s1" name="s1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="s1" targetRef="midLeaf" />
    <bpmn:serviceTask id="midLeaf" name="가운데 leaf" camunda:class="com.dongkuk.dmes.cactus.job.JobRunTestTask">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="leaf" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="midLeaf" targetRef="callInner" />
    <bpmn:callActivity id="callInner" name="안쪽 호출" calledElement="jobRunNestedInner">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="callInner" targetRef="e1" />
    <bpmn:endEvent id="e1" name="e1">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>
```

`job-run/jobRunNestedInner.bpmn`: `gen jobRunNestedInner leaf "3겹 서브서비스 - 안쪽"` 와 같다(서비스 태스크 하나, `leaf`).

- [ ] **Step 3: 진입점 시험을 쓴다**

```java
package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher.SubmitResult;
import com.dongkuk.dmes.cactus.job.JobRunResultWriter.WriteResult;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.oasis.service.ServiceStarter;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

/**
 * 예약 실행 진입점(설계 §4.4·§9 「모듈 쪽: 진입점」). 실제 OASIS {@code ServiceStarter}(transactional + multi-tx) 위에서 BPMN(job-run/*.bpmn)을
 * 돌린다. 트랜잭션 매니저는 begin·commit·rollback 만 기록하는 가짜고, 결과 보고는 기록용 가짜다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class JobRunDispatcherTest {

    private GenericApplicationContext ctx;
    private RecordingTxManager biz;
    private RecordingReporter reporter;
    private JobRunExecutor executor;
    private JobRunDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        JobRunTestTask.reset();
        biz = new RecordingTxManager();
        reporter = new RecordingReporter(biz);
        ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> biz);
        ctx.refresh();
        executor = new JobRunExecutor(2);
        dispatcher = newDispatcher(executor);
    }

    @AfterEach
    void tearDown() {
        executor.close();
        ctx.close();
        JobRunScope.close();
    }

    private static JobRunRequest req(String runId, String jobId, String serviceId, int timeoutSec, JobRunRequest.Retry retry) {
        return new JobRunRequest(runId, jobId, "MDM", serviceId, "run", Map.of("baseDt", "2026-10-09"), Map.of("baseDt", "DATE"),
                Map.of("k", "v"), timeoutSec, retry, "2026-10-09T02:00:00", false, null);
    }

    @Test
    @DisplayName("대상 SUCCESS → OK 갱신 1회 — 건수는 범위에 쌓인 값, 서버·태그·감사 사용자·슬롯이 실린다")
    void successWritesOkOnce() throws Exception {
        assertThat(dispatcher.submit(req("r1", "j1", "jobRunOk", 30, null))).isEqualTo(SubmitResult.ACCEPTED);
        JobRunReport r = reporter.next();

        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(7);
        assertThat(r.runId()).isEqualTo("r1");
        assertThat(r.serverNm()).isEqualTo("srv1");
        assertThat(r.userId()).isEqualTo("SCHEDULER");
        assertThat(r.slot()).isEqualTo("202610090200");
        assertThat(r.serviceTag()).isNotBlank();
        assertThat(biz.events).containsExactly("begin", "commit");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("실행 스레드의 MDC serviceId 는 대상 서비스 ID(sch. 로 시작하지 않음 → 모듈 업무 로그), service_tag 는 보고의 태그와 같다")
    void mdcIsTheTargetService() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunOk", 30, null));
        JobRunReport r = reporter.next();
        String line = JobRunTestTask.LOG.get(0);
        assertThat(line).contains("serviceId=jobRunOk").doesNotContain("serviceId=sch.").contains("run=r1").contains("tag=" + r.serviceTag());
    }

    @Test
    @DisplayName("USER_ERROR → FAIL — 결과 코드와 사용자용 메시지만")
    void userErrorFails() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunUserError", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).isEqualTo("USER_ERROR: 업무 예외");
        assertThat(biz.events).containsExactly("begin", "rollback");
    }

    @Test
    @DisplayName("SYSTEM_ERROR → FAIL — 예외 종류 이름만, 원문 메시지(주소·비밀번호)는 없다. 대상 롤백이 끝난 뒤에 보고한다")
    void systemErrorFailsWithoutRawMessage() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunSystemError", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).isEqualTo("SYSTEM_ERROR: IllegalStateException");
        assertThat(r.msg()).doesNotContain("secret").doesNotContain("hunter2").doesNotContain("jdbc");
        assertThat(reporter.eventsAtWrite.get(0)).containsExactly("begin", "rollback");   // 대상 롤백 뒤 별도로 FAIL 기록
    }

    @Test
    @DisplayName("Error 도 FAIL 로 쓰고 풀 스레드가 죽지 않아 다음 회차가 돈다")
    void errorFailsAndPoolSurvives() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunFatal", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).doesNotContain("fatal secret");
        dispatcher.submit(req("r2", "j2", "jobRunOk", 30, null));
        assertThat(reporter.next().status()).isEqualTo("OK");
    }

    @Test
    @DisplayName("시간 초과 → 감시가 TIMEOUT 을 1회 쓰고 인터럽트한다 — 인터럽트로 생긴 SYSTEM_ERROR(FAIL)는 갱신하지 않는다")
    void timeoutWritesOnceAndLateFailIsDropped() throws Exception {
        assertThat(dispatcher.submit(req("r1", "j1", "jobRunSlow", 1, null))).isEqualTo(SubmitResult.ACCEPTED);
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("TIMEOUT");
        assertThat(r.msg()).contains("시간 초과");
        Thread.sleep(700);   // 인터럽트된 실행 스레드가 FAIL 로 끝난 뒤에도
        assertThat(JobRunTestTask.LOG).contains("interrupted");
        reporter.assertNoMore();
        assertThat(dispatcher.submit(req("r2", "j1", "jobRunOk", 30, null))).as("TIMEOUT 으로 닫힌 작업은 다음 회차를 막지 않는다").isEqualTo(SubmitResult.ACCEPTED);
    }

    @Test
    @DisplayName("마감 직전 완료와 감시가 경합해도 회차마다 갱신은 정확히 1회(OK 또는 TIMEOUT)")
    void raceAtDeadlineWritesExactlyOnce() throws Exception {
        executor.close();
        executor = new JobRunExecutor(12);
        dispatcher = newDispatcher(executor);
        JobRunTestTask.sleepMillis = 980;   // timeoutSec=1 의 마감(1000ms) 직전
        for (int i = 0; i < 12; i++) {
            assertThat(dispatcher.submit(req("race-" + i, "race-job-" + i, "jobRunSlow", 1, null))).isEqualTo(SubmitResult.ACCEPTED);
        }
        List<JobRunReport> reports = reporter.drain(12, 20_000);
        Thread.sleep(500);
        reports.addAll(reporter.drainNow());
        assertThat(reports).hasSize(12);
        assertThat(reports).extracting(JobRunReport::runId).doesNotHaveDuplicates();
        assertThat(reports).extracting(JobRunReport::status).allMatch(s -> s.equals("OK") || s.equals("TIMEOUT"));
    }

    @Test
    @DisplayName("쿼리 시간 초과(SQLTimeoutException·ORA-01013)는 FAIL 이 아니라 TIMEOUT 1회, 대상은 롤백")
    void queryTimeoutIsTimeout() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunQueryTimeout", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("TIMEOUT");
        assertThat(r.msg()).contains("쿼리 시간 초과");
        assertThat(biz.events).containsExactly("begin", "rollback");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("재시도 — 1회차 FAIL → 대기 → 2회차 OK. 대기 시간이 timeoutSec 보다 길어도 TIMEOUT 되지 않고, 건수는 쌓이지 않고, 갱신은 마지막에 한 번, MSG 에 「재시도 1/1」")
    void retryThenOk() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunFlaky", 1, new JobRunRequest.Retry(1, 1500)));   // retryUnit=ms 라 1500ms 대기
        JobRunReport r = reporter.next(10_000);
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(5);
        assertThat(r.msg()).contains("재시도 1/1");
        assertThat(JobRunTestTask.FLAKY.get()).isEqualTo(2);
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("재시도를 다 써도 FAIL 이면 마지막 시도 뒤 한 번 FAIL 을 쓴다")
    void retryExhausted() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunSystemError", 30, new JobRunRequest.Retry(1, 10)));
        JobRunReport r = reporter.next(10_000);
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).contains("재시도 1/1");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("재시도 재투입 때 풀이 가득이면 그때까지의 FAIL 을 기록한다")
    void retryPoolFullWritesFail() throws Exception {
        executor.close();
        executor = new JobRunExecutor(1);
        dispatcher = newDispatcher(executor);
        dispatcher.submit(req("r1", "j1", "jobRunSystemError", 30, new JobRunRequest.Retry(1, 300)));
        Thread.sleep(100);   // 1회차가 FAIL 로 끝나 재시도 대기에 들어간 뒤 풀을 다른 작업으로 채운다
        JobRunTestTask.sleepMillis = 3_000;
        assertThat(dispatcher.submit(req("r2", "j2", "jobRunSlow", 30, null))).isEqualTo(SubmitResult.ACCEPTED);
        JobRunReport r = reporter.next(10_000);
        assertThat(r.runId()).isEqualTo("r1");
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).contains("풀 가득");
    }

    @Test
    @DisplayName("범위 안에서 진입점을 다시 부르면 거절 — 바깥 회차는 그대로 OK 이고 갱신은 1회")
    void reentryIsRejected() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunReenter", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("OK");
        assertThat(JobRunTestTask.LOG).containsExactly("reenter-rejected");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("서브서비스 3겹(바깥 → 가운데 → 안쪽)에서도 결과 갱신은 1회 — 안쪽은 같은 범위를 보되 보고할 길이 없다")
    void threeLevelSubServicesReportOnce() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunNestedOuter", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("OK");
        assertThat(JobRunTestTask.LOG).containsExactly("leaf:r1", "leaf:r1");
        assertThat(biz.events).as("연결 서브서비스는 부모 트랜잭션 하나").containsExactly("begin", "commit");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("다른 스레드에서는 범위가 보이지 않는다")
    void otherThreadHasNoScope() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunOtherThread", 30, null));
        reporter.next();
        assertThat(JobRunTestTask.LOG).containsExactly("otherThreadSeesScope=false");
    }

    @Test
    @DisplayName("수집 값은 범위에 쌓여 OK 보고에 실린다")
    void collectedValuesTravelWithOk() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunCollect", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.collected()).extracting(CollectedValue::key).containsExactly("K");
        assertThat(r.itemCnt()).isEqualTo(1);
    }

    @Test
    @DisplayName("접수 상태 — 같은 runId 는 DUPLICATE, 같은 jobId 가 실행 중이면 JOB_RUNNING, 풀이 가득이면 POOL_FULL(그 회차는 등록되지 않는다)")
    void submitStates() throws Exception {
        executor.close();
        executor = new JobRunExecutor(1);
        dispatcher = newDispatcher(executor);
        JobRunTestTask.sleepMillis = 3_000;
        assertThat(dispatcher.submit(req("r1", "j1", "jobRunSlow", 30, null))).isEqualTo(SubmitResult.ACCEPTED);
        JobRunTestTask.started.await(5, TimeUnit.SECONDS);
        assertThat(dispatcher.submit(req("r1", "j9", "jobRunOk", 30, null))).isEqualTo(SubmitResult.DUPLICATE);
        assertThat(dispatcher.submit(req("r2", "j1", "jobRunOk", 30, null))).isEqualTo(SubmitResult.JOB_RUNNING);
        assertThat(dispatcher.submit(req("r3", "j3", "jobRunOk", 30, null))).isEqualTo(SubmitResult.POOL_FULL);
        reporter.next(10_000);   // r1 종료 — 보고 직후에는 풀 스레드가 아직 돌아가는 중일 수 있어 잠깐 기다리며 다시 시도한다
        SubmitResult again = SubmitResult.POOL_FULL;
        for (int i = 0; i < 50 && again == SubmitResult.POOL_FULL; i++) {
            again = dispatcher.submit(req("r3", "j3", "jobRunOk", 30, null));
            if (again == SubmitResult.POOL_FULL) Thread.sleep(40);
        }
        assertThat(again).as("풀 가득으로 거절된 runId 는 기억하지 않아 다시 접수된다").isEqualTo(SubmitResult.ACCEPTED);
    }

    @Test
    @DisplayName("진입점 밖 스레드에는 범위가 남지 않는다(finally 정리)")
    void noLeakedScope() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunOk", 30, null));
        reporter.next();
        executor.submit(() -> JobRunTestTask.LOG.add("after:" + JobRunScope.current().isPresent())).get();
        assertThat(JobRunTestTask.LOG).contains("after:false");
        assertThatThrownBy(() -> JobRunScope.require()).isInstanceOf(JobScopeRequiredException.class);
    }

    /** 풀 크기만 다른 진입점을 다시 만든다(실제 OASIS 조립 — transactional + multi-tx, 서비스 경로 /job-run). */
    private JobRunDispatcher newDispatcher(JobRunExecutor pool) {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/job-run");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props, tx, ctx);
        JobRunDispatcher d = new JobRunDispatcher(starter, ctx, reporter, pool, "srv1", Clock.systemDefaultZone(), TimeUnit.MILLISECONDS);
        JobRunTestTask.dispatcher = d;
        return d;
    }

    /** 결과 보고를 모으고, 보고되는 순간의 트랜잭션 기록을 함께 남긴다. */
    static final class RecordingReporter implements JobRunReporter {
        private final BlockingQueue<JobRunReport> queue = new LinkedBlockingQueue<>();
        final List<List<String>> eventsAtWrite = new ArrayList<>();
        private final RecordingTxManager tx;

        RecordingReporter(RecordingTxManager tx) {
            this.tx = tx;
        }

        @Override
        public WriteResult write(JobRunReport report) {
            synchronized (eventsAtWrite) {
                eventsAtWrite.add(new ArrayList<>(tx.events));
            }
            queue.add(report);
            return WriteResult.WRITTEN;
        }

        JobRunReport next() throws InterruptedException {
            return next(5_000);
        }

        JobRunReport next(long millis) throws InterruptedException {
            JobRunReport r = queue.poll(millis, TimeUnit.MILLISECONDS);
            assertThat(r).as("결과 보고가 오지 않았다").isNotNull();
            return r;
        }

        List<JobRunReport> drain(int n, long millis) throws InterruptedException {
            List<JobRunReport> out = new ArrayList<>();
            long deadline = System.currentTimeMillis() + millis;
            while (out.size() < n && System.currentTimeMillis() < deadline) {
                JobRunReport r = queue.poll(200, TimeUnit.MILLISECONDS);
                if (r != null) out.add(r);
            }
            return out;
        }

        List<JobRunReport> drainNow() {
            List<JobRunReport> out = new ArrayList<>();
            queue.drainTo(out);
            return out;
        }

        void assertNoMore() throws InterruptedException {
            assertThat(queue.poll(400, TimeUnit.MILLISECONDS)).as("결과 갱신은 회차마다 1회여야 한다").isNull();
        }
    }

    /** begin·commit·rollback 순서만 기록한다(스레드마다 따로 기록하지 않고 시험이 한 번에 한 서비스만 돌린다). */
    static final class RecordingTxManager extends AbstractPlatformTransactionManager {
        final List<String> events = java.util.Collections.synchronizedList(new ArrayList<>());

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            events.add("begin");
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            events.add("commit");
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            events.add("rollback");
        }
    }
}
```

주의: `biz.events` 는 시험마다 새 매니저라 누적되지 않는다. 한 시험에서 서비스를 여러 번 돌리는 시험(`errorFailsAndPoolSurvives`·`submitStates`·`raceAtDeadlineWritesExactlyOnce`)은 `biz.events` 를 단언하지 않는다.

- [ ] **Step 4: 실패를 확인한다** — `cd src/backend/cactus-core` 다음 `../gradlew test --max-workers=2 --tests '*JobRunDispatcherTest'` → 컴파일 실패(`JobRunDispatcher` 없음).

- [ ] **Step 5: 풀·도우미를 구현한다**

```java
package com.dongkuk.dmes.cactus.job;

import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 예약 실행 풀 — 스레드 {@code poolSize} 개, <b>대기열 0</b>(설계 §4.4 접수 6). 가득이면 {@link #submit} 이
 * {@link RejectedExecutionException} 을 던지고 접수가 503 {@code JOB_POOL_FULL} 로 답한다. 감시(시간 초과)·재시도 대기는 별도 데몬 스케줄러가 한다.
 */
public final class JobRunExecutor implements AutoCloseable {

    private final ThreadPoolExecutor pool;
    private final ScheduledThreadPoolExecutor timer;
    private final int poolSize;

    public JobRunExecutor(int poolSize) {
        this.poolSize = Math.max(1, poolSize);
        this.pool = new ThreadPoolExecutor(this.poolSize, this.poolSize, 60, TimeUnit.SECONDS, new SynchronousQueue<>(),
                daemons("job-run-"), new ThreadPoolExecutor.AbortPolicy());
        this.timer = new ScheduledThreadPoolExecutor(2, daemons("job-timer-"));
        this.timer.setRemoveOnCancelPolicy(true);
    }

    public Future<?> submit(Runnable task) {
        return pool.submit(task);
    }

    public ScheduledFuture<?> schedule(Runnable task, long delay, TimeUnit unit) {
        return timer.schedule(task, delay, unit);
    }

    public int poolSize() {
        return poolSize;
    }

    @Override
    public void close() {
        timer.shutdownNow();
        pool.shutdown();
        try {
            if (!pool.awaitTermination(30, TimeUnit.SECONDS)) pool.shutdownNow();
        } catch (InterruptedException e) {
            pool.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private static ThreadFactory daemons(String prefix) {
        AtomicInteger n = new AtomicInteger();
        return r -> {
            Thread t = new Thread(r, prefix + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
    }
}
```

```java
package com.dongkuk.dmes.cactus.job;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.oasis.CactusUnwrappingApplicationContext;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.audit.AuditHolder;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.ApplicationContext;

/**
 * 웹 요청 없이 OASIS 서비스를 직접 기동하는 도우미 — {@code DmomReceiveDispatcher}·{@code OasisServiceExecutor} 와 같은 순서이다
 * (감사 주체를 {@code AuditHolder} 와 {@code DefaultServiceContext.setAudit} 에 모두 넣고, 끝에 {@code AuditHolder.remove()}).
 * 진입점과 MCM 판정 트리거가 함께 쓴다.
 */
public final class JobServiceInvoker {

    private JobServiceInvoker() {}

    public static ServiceResult start(ServiceStarter starter, ApplicationContext spring, String serviceId,
                                      Map<String, Object> inputs, CactusAudit audit) {
        AuditHolder.setAudit(audit);
        try {
            com.dongkuk.oasis.context.ApplicationContext oasisCtx = new CactusUnwrappingApplicationContext(spring);
            DefaultServiceContext sc = new DefaultServiceContext(oasisCtx, typed(inputs));
            sc.setAudit(audit);
            return starter.start(serviceId, sc);
        } finally {
            AuditHolder.remove();
        }
    }

    /** 제네릭 값(Map·List)은 {@link TypedObject} 가 형을 명시해야 하고, null 은 형을 따로 줘야 한다. */
    public static Map<String, TypedObject> typed(Map<String, Object> inputs) {
        Map<String, TypedObject> out = new HashMap<>();
        inputs.forEach((k, v) -> out.put(k, typedValue(v)));
        return out;
    }

    static TypedObject typedValue(Object v) {
        if (v == null) return new TypedObject(null, String.class);
        if (v instanceof Map) return new TypedObject(v, new TypeReference<Map<String, Object>>() {});
        if (v instanceof List) return new TypedObject(v, new TypeReference<List<Object>>() {});
        return new TypedObject(v);
    }
}
```

```java
package com.dongkuk.dmes.cactus.job;

import java.net.InetAddress;

/** 실행 기록 SERVER_NM — 설정값이 없으면 {@code 호스트이름:앱이름:pid}(100자까지). */
public final class JobServerName {

    private JobServerName() {}

    public static String resolve(String configured, String appName) {
        String name;
        if (configured != null && !configured.isBlank()) {
            name = configured.trim();
        } else {
            String host;
            try {
                host = InetAddress.getLocalHost().getHostName();
            } catch (Exception e) {
                host = "unknown";
            }
            name = host + ":" + (appName == null || appName.isBlank() ? "app" : appName) + ":" + ProcessHandle.current().pid();
        }
        return name.length() > 100 ? name.substring(0, 100) : name;
    }
}
```

- [ ] **Step 6: 진입점 `JobRunDispatcher` 를 구현한다**

```java
package com.dongkuk.dmes.cactus.job;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.cactus.util.TxIdGenerator;
import com.dongkuk.oasis.TraceConstants;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.logger.MDCTemplate;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.ApplicationContext;
import org.springframework.dao.QueryTimeoutException;

/**
 * 예약 실행 진입점 — 새 서비스 유형(설계 §4.4). {@code DmomReceiveDispatcher} 처럼 웹 요청 없이 {@code serviceStarter.start} 를 직접 부르되,
 * <b>실행 결과를 진입점이 DB 에 자동으로 갱신</b>한다({@link JobRunReporter}). 업무 서비스는 이력을 쓰지 않는다.
 *
 * <p>한 시도의 순서: MDC(대상 serviceId — {@code sch.} 로 시작하지 않아 모듈 업무 로그로 간다)·시작 줄 → 감시 예약(시도마다) →
 * 범위·사용자·감사 주체 → {@code serviceStarter.start}(대상은 자기 트랜잭션, 이 클래스는 {@code @Transactional} 이 없다) → 결과 판정 →
 * finally 정리 → <b>회차 상태 객체 CAS</b>(RUNNING→DONE 에 이긴 쪽만 결과를 쓴다) → 재시도 또는 최종 보고.
 *
 * <p>중첩: 결과 갱신 코드는 이 클래스(와 {@link JobRunResultWriter})에만 있고, 서브서비스는 {@code serviceStarter} 로 바로 들어가 진입점을 다시
 * 지나지 않는다. 범위가 열린 스레드에서 {@link #submit} 을 부르면 거절한다.
 */
public class JobRunDispatcher {

    public enum SubmitResult { ACCEPTED, DUPLICATE, JOB_RUNNING, POOL_FULL }

    private enum State { RUNNING, DONE, TIMED_OUT }

    private static final Logger log = LoggerFactory.getLogger(JobRunDispatcher.class);
    private static final long RECENT_MILLIS = TimeUnit.HOURS.toMillis(1);
    private static final int MSG_MAX = 500;

    private final ServiceStarter serviceStarter;
    private final ApplicationContext spring;
    private final JobRunReporter reporter;
    private final JobRunExecutor executor;
    private final String serverName;
    private final Clock clock;
    private final TimeUnit retryUnit;
    private final Map<String, Instant> recentRunIds = new ConcurrentHashMap<>();
    private final Map<String, String> runningJobs = new ConcurrentHashMap<>();

    public JobRunDispatcher(ServiceStarter serviceStarter, ApplicationContext spring, JobRunReporter reporter,
                            JobRunExecutor executor, String serverName, Clock clock) {
        this(serviceStarter, spring, reporter, executor, serverName, clock, TimeUnit.MINUTES);
    }

    /** 시험이 재시도 대기 단위를 줄이려고 쓴다(운영은 {@code intervalMin} 이 분). */
    JobRunDispatcher(ServiceStarter serviceStarter, ApplicationContext spring, JobRunReporter reporter,
                     JobRunExecutor executor, String serverName, Clock clock, TimeUnit retryUnit) {
        this.serviceStarter = serviceStarter;
        this.spring = spring;
        this.reporter = reporter;
        this.executor = executor;
        this.serverName = serverName;
        this.clock = clock;
        this.retryUnit = retryUnit;
    }

    public String serverName() {
        return serverName;
    }

    /** 한 시도의 감시용 상태 — 실행 스레드와 감시가 함께 본다(ThreadLocal 범위는 감시 스레드가 못 본다). */
    private static final class Attempt {
        final AtomicReference<State> state = new AtomicReference<>(State.RUNNING);
        volatile Thread thread;
    }

    /** 회차 하나(재시도를 가로질러 유지). */
    private static final class Run {
        final JobRunRequest req;
        final String txId;
        final int maxAttempts;
        volatile int attemptNo = 1;
        volatile String serviceTag;
        volatile Outcome lastFail;

        Run(JobRunRequest req) {
            this.req = req;
            this.txId = TxIdGenerator.generate(req.userId(), req.jobId());
            this.maxAttempts = 1 + (req.retry() == null ? 0 : Math.max(0, req.retry().count()));
        }
    }

    private record Outcome(String status, Integer itemCnt, String msg, List<CollectedValue> collected) {
        boolean fail() { return "FAIL".equals(status); }
    }

    /**
     * 접수 뒤 실행 풀에 넣는다(비동기). 같은 runId 는 DUPLICATE(1시간 기억), 이 서버에서 같은 jobId 가 실행 중이면 JOB_RUNNING, 풀이 가득이면 POOL_FULL.
     * 범위가 이미 열린 스레드(= 실행 중인 서비스 안)에서 부르면 거절한다 — 안쪽 start 가 바깥 트랜잭션·감사 주체를 깨기 때문이다.
     */
    public SubmitResult submit(JobRunRequest req) {
        if (JobRunScope.current().isPresent()) {
            throw new IllegalStateException("예약 실행 범위 안에서는 진입점을 다시 부를 수 없습니다(서비스 중첩은 연결 서브서비스로)");
        }
        Instant now = clock.instant();
        recentRunIds.values().removeIf(t -> now.toEpochMilli() - t.toEpochMilli() > RECENT_MILLIS);
        if (recentRunIds.putIfAbsent(req.runId(), now) != null) return SubmitResult.DUPLICATE;
        if (runningJobs.putIfAbsent(req.jobId(), req.runId()) != null) {
            recentRunIds.remove(req.runId());
            return SubmitResult.JOB_RUNNING;
        }
        Run run = new Run(req);
        try {
            executor.submit(() -> attempt(run));
        } catch (RejectedExecutionException e) {
            recentRunIds.remove(req.runId());
            runningJobs.remove(req.jobId(), req.runId());
            return SubmitResult.POOL_FULL;
        }
        return SubmitResult.ACCEPTED;
    }

    // ── 한 시도 ──────────────────────────────────────────────────────

    private void attempt(Run run) {
        Attempt attempt = new Attempt();
        try {
            new MDCTemplate() {
                @Override
                public void process() {
                    execute(run, attempt);
                }
            }.mdc(null);
        } catch (Throwable t) {
            log.error("예약 실행 진입점 오류 runId={} 원인={}", run.req.runId(), t.getClass().getSimpleName());
            if (attempt.state.compareAndSet(State.RUNNING, State.DONE)) {
                finish(run, new Outcome("FAIL", null, "SYSTEM_ERROR: " + kindOf(t), List.of()));
            }
        }
    }

    private void execute(Run run, Attempt attempt) {
        JobRunRequest req = run.req;
        run.serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        attempt.thread = Thread.currentThread();
        putMdc(run);
        long startedAt = System.currentTimeMillis();
        log.info("{}/{}", req.serviceId(), req.action());   // analog 서비스 목록이 읽는 줄(OasisServiceExecutor 와 같은 문구)

        ScheduledFuture<?> watch = executor.schedule(() -> onTimeout(run, attempt), Math.max(1, req.timeoutSec()), TimeUnit.SECONDS);
        JobRunScope scope = new JobRunScope(req.runId(), req.jobId(), req.config(), req.inputs(), req.varTypes(),
                req.schedAtTime(), req.manual(), clock.instant().plusSeconds(Math.max(1, req.timeoutSec())), clock);
        boolean opened = false;
        Outcome outcome;
        try {
            JobRunScope.open(scope);
            opened = true;
            UserContextHolder.set(new UserInfo(req.userId(), req.userId(), null, List.of()));
            Map<String, Object> inputs = new LinkedHashMap<>(req.inputs());
            inputs.put("action", req.action());   // 예약 키 — 변수가 덮어쓰지 못하게 마지막에 넣는다
            ServiceResult result = JobServiceInvoker.start(serviceStarter, spring, req.serviceId(), inputs,
                    new CactusAudit(req.userId(), req.jobId(), req.serviceId()));
            outcome = judge(result, scope);
        } catch (Throwable t) {   // CoreServiceStarter 는 Exception 만 결과로 바꾼다 — Error 는 여기서 FAIL 로 쓴다
            outcome = new Outcome("FAIL", null, "SYSTEM_ERROR: " + kindOf(t), List.of());
        } finally {
            watch.cancel(false);
            if (opened) JobRunScope.close();
            UserContextHolder.clear();
            com.dongkuk.oasis.audit.AuditHolder.remove();
            log.info("Service end - service name [{}] RunTime : [{}]", req.serviceId(), System.currentTimeMillis() - startedAt);
        }

        // 교체에 이긴 쪽만 결과를 쓴다 — 감시가 먼저 TIMED_OUT 으로 바꿨으면 감시가 TIMEOUT 을 썼으니 이 결과는 버린다.
        if (!attempt.state.compareAndSet(State.RUNNING, State.DONE)) return;
        if (outcome.fail() && run.attemptNo < run.maxAttempts) {
            scheduleRetry(run, outcome);
            return;
        }
        finish(run, outcome);
    }

    private Outcome judge(ServiceResult result, JobRunScope scope) {
        if (result == null) return new Outcome("FAIL", null, "SYSTEM_ERROR: 결과 없음", List.of());
        if (result.serviceResultCode() == ServiceResultCode.SUCCESS) {
            Integer cnt = scope.itemCount();
            if (cnt == null) cnt = itemCntOutput(result);
            return new Outcome("OK", cnt, null, scope.collected());
        }
        Throwable ex = result.exception();
        if (isQueryTimeout(ex)) return new Outcome("TIMEOUT", null, "쿼리 시간 초과", List.of());
        String msg = result.serviceResultCode() == ServiceResultCode.USER_ERROR
                ? "USER_ERROR: " + cut(result.serviceResultMessage(), 200)
                : "SYSTEM_ERROR: " + kindOf(ex);
        return new Outcome("FAIL", null, msg, List.of());
    }

    private static Integer itemCntOutput(ServiceResult result) {
        TypedObject t = result.result("jobItemCnt");
        return t != null && t.getObject() instanceof Number n ? n.intValue() : null;
    }

    // ── 시간 초과·재시도·최종 보고 ───────────────────────────────────

    private void onTimeout(Run run, Attempt attempt) {
        if (!attempt.state.compareAndSet(State.RUNNING, State.TIMED_OUT)) return;
        try {
            if (run.serviceTag != null) MDC.put(TraceConstants.SERVICE_TAG, run.serviceTag);
            putMdc(run);
            log.warn("예약 작업 시간 초과 — 실행 스레드를 인터럽트합니다 jobId={} runId={} timeoutSec={}", run.req.jobId(), run.req.runId(), run.req.timeoutSec());
            Thread t = attempt.thread;
            if (t != null) t.interrupt();
            finish(run, new Outcome("TIMEOUT", null, "시간 초과(" + run.req.timeoutSec() + "초)", List.of()));
        } finally {
            MDC.clear();
        }
    }

    private void scheduleRetry(Run run, Outcome fail) {
        run.lastFail = fail;
        JobRunRequest.Retry retry = run.req.retry();
        log.info("실패 — {} 뒤 재시도합니다 jobId={} 시도 {}/{}", retry.intervalMin(), run.req.jobId(), run.attemptNo, run.maxAttempts);
        executor.schedule(() -> resubmit(run), retry.intervalMin(), retryUnit);
    }

    private void resubmit(Run run) {
        run.attemptNo++;
        try {
            executor.submit(() -> attempt(run));
        } catch (RejectedExecutionException e) {
            try {
                if (run.serviceTag != null) MDC.put(TraceConstants.SERVICE_TAG, run.serviceTag);
                putMdc(run);
                Outcome last = run.lastFail;
                run.attemptNo--;   // 이 재시도는 시작하지 못했다
                finish(run, new Outcome("FAIL", null, (last == null ? "" : last.msg()) + " — 재시도 풀 가득", List.of()));
            } finally {
                MDC.clear();
            }
        }
    }

    private void finish(Run run, Outcome o) {
        try {
            JobRunRequest req = run.req;
            String msg = o.msg();
            if (run.attemptNo > 1 && req.retry() != null) {
                msg = (msg == null ? "" : msg) + " (재시도 " + (run.attemptNo - 1) + "/" + req.retry().count() + ")";
            }
            reporter.write(new JobRunReport(req.runId(), req.jobId(), o.status(), o.itemCnt(), cut(msg, MSG_MAX), serverName,
                    run.serviceTag, req.userId(), req.slot(), "OK".equals(o.status()) ? o.collected() : List.of()));
        } catch (RuntimeException e) {
            log.warn("예약 작업 결과 보고 실패 runId={} 원인={}", run.req.runId(), e.getClass().getSimpleName());
        } finally {
            runningJobs.remove(run.req.jobId(), run.req.runId());
        }
    }

    // ── 도우미 ───────────────────────────────────────────────────────

    private static void putMdc(Run run) {
        MDC.put("serviceId", run.req.serviceId());   // sch. 로 시작하지 않는다 → 모듈 업무 로그
        MDC.put("txId", run.txId);
        MDC.put("runId", run.req.runId());
    }

    /** 쿼리 시간 초과: SQLTimeoutException·QueryTimeoutException·ORA-01013 이 원인 사슬에 있다. */
    static boolean isQueryTimeout(Throwable t) {
        for (int i = 0; t != null && i < 20; i++, t = t.getCause()) {
            if (t instanceof SQLTimeoutException || t instanceof QueryTimeoutException) return true;
            if (t instanceof SQLException se && se.getErrorCode() == 1013) return true;
            if (t.getCause() == t) break;
        }
        return false;
    }

    /** 예외 종류 이름(가장 깊은 원인의 클래스 단순 이름) — 메시지는 쓰지 않는다. */
    static String kindOf(Throwable t) {
        if (t == null) return "UnknownError";
        Throwable root = t;
        for (int i = 0; root.getCause() != null && root.getCause() != root && i < 20; i++) root = root.getCause();
        return root.getClass().getSimpleName();
    }

    private static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
```

- [ ] **Step 7: 자동 설정을 만든다**

```java
package com.dongkuk.dmes.cactus.job;

import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.oasis.service.ServiceStarter;
import java.time.Clock;
import java.time.Duration;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

/**
 * 예약 실행 진입점 빈(설계 §2). {@code dmes.job.agent.enabled=false} 면 만들지 않는다. 결과 갱신은 그 앱의 기본 DataSource 로 하고
 * 스키마 접두는 {@code dmes.job.schema}(기본 MCMAPUSER)이다. MCM 앱 자신도 같은 빈을 쓴다.
 */
@AutoConfiguration(after = OasisAutoConfiguration.class)
@ConditionalOnBean(ServiceStarter.class)
@ConditionalOnProperty(prefix = "dmes.job.agent", name = "enabled", havingValue = "true", matchIfMissing = true)
public class JobAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public JobRunResultWriter jobRunResultWriter(ObjectProvider<DataSource> dataSource,
                                                 @Value("${dmes.job.schema:MCMAPUSER}") String schema) {
        return new JobRunResultWriter(dataSource.getObject(), schema, Duration.ofSeconds(5));
    }

    @Bean(destroyMethod = "close")
    @ConditionalOnMissingBean
    public JobRunExecutor jobRunExecutor(@Value("${dmes.job.pool-size:4}") int poolSize) {
        return new JobRunExecutor(poolSize);
    }

    @Bean
    @ConditionalOnMissingBean
    public JobRunDispatcher jobRunDispatcher(ServiceStarter serviceStarter, ApplicationContext ctx, JobRunResultWriter writer,
                                             JobRunExecutor executor, Environment env) {
        String name = JobServerName.resolve(env.getProperty("dmes.job.server-name"), env.getProperty("spring.application.name"));
        return new JobRunDispatcher(serviceStarter, ctx, writer, executor, name, Clock.systemDefaultZone());
    }
}
```

`META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 끝에 한 줄을 더한다:

```
com.dongkuk.dmes.cactus.job.JobAutoConfiguration
```

- [ ] **Step 8: 자동 설정 시험을 쓰고 돌린다**

```java
package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dongkuk.oasis.service.ServiceStarter;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class JobAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(JobAutoConfiguration.class))
            .withBean(ServiceStarter.class, () -> mock(ServiceStarter.class))
            .withBean(DataSource.class, () -> new DriverManagerDataSource("jdbc:oracle:thin:@//localhost:1/none", "u", "p"));

    @Test
    @DisplayName("기본 — 결과 갱신기·실행 풀(기본 4)·진입점이 빈으로 올라온다")
    void defaults() {
        runner.run(ctx -> {
            assertThat(ctx).hasSingleBean(JobRunResultWriter.class).hasSingleBean(JobRunExecutor.class).hasSingleBean(JobRunDispatcher.class);
            assertThat(ctx.getBean(JobRunExecutor.class).poolSize()).isEqualTo(4);
            assertThat(ctx.getBean(JobRunDispatcher.class).serverName()).isNotBlank();
        });
    }

    @Test
    @DisplayName("dmes.job.agent.enabled=false 이면 만들지 않는다 / pool-size·server-name 은 설정을 따른다")
    void properties() {
        runner.withPropertyValues("dmes.job.agent.enabled=false").run(ctx -> assertThat(ctx).doesNotHaveBean(JobRunDispatcher.class));
        runner.withPropertyValues("dmes.job.pool-size=2", "dmes.job.server-name=node-a").run(ctx -> {
            assertThat(ctx.getBean(JobRunExecutor.class).poolSize()).isEqualTo(2);
            assertThat(ctx.getBean(JobRunDispatcher.class).serverName()).isEqualTo("node-a");
        });
    }

    @Test
    @DisplayName("ServiceStarter 가 없으면 만들지 않는다")
    void withoutServiceStarter() {
        new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(JobAutoConfiguration.class))
                .run(ctx -> assertThat(ctx).doesNotHaveBean(JobRunDispatcher.class));
    }

    @Test
    @DisplayName("AutoConfiguration.imports 에 등록돼 있다")
    void registeredInImports() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports")) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).contains("com.dongkuk.dmes.cactus.job.JobAutoConfiguration");
        }
    }
}
```

Run(`src/backend/cactus-core`): `../gradlew test --max-workers=2 --tests '*JobRunDispatcherTest' --tests '*JobAutoConfigurationTest' --tests '*JobRunScopeTest' --tests '*JobRunRequestTest'` → PASS.
실패하면 먼저 `재시도` 시험의 시간(1500ms 대기 vs 10초 제한)과 `raceAtDeadlineWritesExactlyOnce` 의 20초 제한을 확인한다. 기존 cactus-core 시험 전체가 그대로인지 한 번 돌린다: `../gradlew test --max-workers=2` (cactus-core 는 시험이 적다).

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/cactus-core/src/main src/backend/cactus-core/src/test
/usr/bin/git commit -m "$(printf 'feat(cactus-core): 예약 실행 진입점(JobRunDispatcher)과 실행 풀·자동 설정을 더한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 5: mcm-core `agent` — 접수·코드 작업 등록

**담당 후보:** GLM 또는 opencode  
**Model:** sonnet/high

설계 §4.4(접수 1~7)·§4.10(서버 간 API)·§5.2(코드 실행 SPI·기동 등록)·§8(보안)·D5·D19·D21·D30·계획 D5(접수 순서). 모든 빈은 `@Bean` 으로 선언한다(Global Constraints).

**Files:**
- Create(`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/agent/`): `ScheduledJob.java`, `JobContext.java`, `SimpleScheduledJob.java`, `JobHandlerRegistry.java`, `JobHandlerRegistrar.java`, `AcceptResult.java`, `JobRunAcceptor.java`, `JobRunController.java`, `LocalJobRunGateway.java`, `JobAppInfo.java`, `JobAgentConfig.java`
- Modify: `.../mcm/job/JobConfig.java` (`@Import(JobAgentConfig.class)`)
- Test(`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/job/agent/`): `JobRunAcceptorTest.java`, `JobRunControllerTest.java`, `JobHandlerRegistryTest.java`; `.../oracheck/JobHandlerRegistrarOraTest.java`
- Test(mdm): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/job/JobRunHttpSecurityTest.java`

**Interfaces:**
- Consumes: `JobRunDispatcher#submit(JobRunRequest): SubmitResult`·`#serverName()`, `JobRunRequest`(Task 3·4); `JobProperties`·`JobModule`(Task 1); `CronSpec`·`JobVar`·`JobVars`(Task 2).
- Produces:
  - `interface ScheduledJob { String id(); JobModule module(); String name(); default String defaultCron(){return null;} default List<JobVar> defaultVars(){return List.of();} default Duration defaultTimeout(){return Duration.ofMinutes(30);} int run(JobContext ctx); }`
  - `record JobContext(String jobId, String runId, Map<String,Object> vars, LocalDateTime schedAt, boolean manual)`
  - `final class SimpleScheduledJob implements ScheduledJob` — 생성자 `(String id, JobModule module, String name, String defaultCron, Duration timeout, ToIntFunction<JobContext> body)`
  - `record JobAppInfo(JobModule module)` — 이 앱의 모듈 키 빈.
  - `class JobHandlerRegistry`: `JobHandlerRegistry(JobModule appModule, List<ScheduledJob> jobs)`(모듈이 다른 빈은 무시, 같은 id 가 둘이면 `IllegalStateException`), `Optional<ScheduledJob> find(String id)`, `List<ScheduledJob> all()`.
  - `record AcceptResult(int status, Map<String,Object> body)`
  - `class JobRunAcceptor`: `JobRunAcceptor(JobModule appModule, JobRunDispatcher dispatcher, JobHandlerRegistry handlers)`, `AcceptResult accept(JobRunRequest)`. 응답: 202 `{accepted:true, serverNm}`·200 `{duplicate:true}`·400 `{code:"JOB_BAD_REQUEST"|"JOB_MODULE_MISMATCH"}`·404 `{code:"JOB_HANDLER_NOT_FOUND"}`·409 `{code:"JOB_RUNNING"}`·503 `{code:"JOB_POOL_FULL"}`.
  - `class JobRunController`: `POST /internal/job/run`. 인증 주체 이름 `system:mcm` 과 권한 `ROLE_SYSTEM` 이 아니면 403 `{code:"JOB_FORBIDDEN"}`.
  - `class LocalJobRunGateway`: `AcceptResult call(JobRunRequest)` — MCM 앱 자신의 작업을 HTTP 없이 접수 쪽으로 넘긴다(Task 8 이 쓴다).
  - `class JobHandlerRegistrar`: `JobHandlerRegistrar(DataSource, String schema, JobHandlerRegistry, Duration retryDelay)`, `int register()`(HANDLER MERGE + 기본 일정 있는 빈만 DEF 에 없을 때 INSERT, 등록한 처리기 수), `void registerWithRetry()`(실패하면 WARN 한 번, `retryDelay` 뒤 한 번 더).

- [ ] **Step 1: 접수 시험을 쓴다**

```java
package com.dongkuk.dmes.mcm.job.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.job.JobRunDispatcher.SubmitResult;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobRunAcceptorTest {

    private JobRunDispatcher dispatcher;
    private JobRunAcceptor acceptor;

    @BeforeEach
    void setUp() {
        dispatcher = mock(JobRunDispatcher.class);
        when(dispatcher.serverName()).thenReturn("host:mdm:1");
        JobHandlerRegistry handlers = new JobHandlerRegistry(JobModule.MDM,
                List.of(new SimpleScheduledJob("mdm.sync", JobModule.MDM, "동기화", null, java.time.Duration.ofMinutes(5), c -> 1)));
        acceptor = new JobRunAcceptor(JobModule.MDM, dispatcher, handlers);
    }

    private static JobRunRequest req(String module, String serviceId, Map<String, Object> config) {
        return new JobRunRequest("r1", "mdm.sync", module, serviceId, "run", null, null, config, 60, null, "2026-10-09T02:00:00", false, null);
    }

    @Test
    @DisplayName("접수 — 202 {accepted:true, serverNm}")
    void accepted() {
        when(dispatcher.submit(any())).thenReturn(SubmitResult.ACCEPTED);
        AcceptResult r = acceptor.accept(req("MDM", "mdm^^dailyClose", null));
        assertThat(r.status()).isEqualTo(202);
        assertThat(r.body()).containsEntry("accepted", true).containsEntry("serverNm", "host:mdm:1");
    }

    @Test
    @DisplayName("같은 runId 를 이미 접수했으면 200 {duplicate:true}")
    void duplicate() {
        when(dispatcher.submit(any())).thenReturn(SubmitResult.DUPLICATE);
        AcceptResult r = acceptor.accept(req("MDM", "mdm^^dailyClose", null));
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body()).containsEntry("duplicate", true);
    }

    @Test
    @DisplayName("같은 서버에서 같은 작업이 실행 중이면 409 JOB_RUNNING, 풀이 가득이면 503 JOB_POOL_FULL")
    void runningAndPoolFull() {
        when(dispatcher.submit(any())).thenReturn(SubmitResult.JOB_RUNNING);
        assertThat(acceptor.accept(req("MDM", "mdm^^dailyClose", null)).status()).isEqualTo(409);
        when(dispatcher.submit(any())).thenReturn(SubmitResult.POOL_FULL);
        AcceptResult r = acceptor.accept(req("MDM", "mdm^^dailyClose", null));
        assertThat(r.status()).isEqualTo(503);
        assertThat(r.body()).containsEntry("code", "JOB_POOL_FULL");
    }

    @Test
    @DisplayName("요청의 module 이 이 앱의 모듈과 다르면 400 JOB_MODULE_MISMATCH — 실행 풀에 넣지 않는다")
    void moduleMismatch() {
        AcceptResult r = acceptor.accept(req("MCM", "mdm^^dailyClose", null));
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.body()).containsEntry("code", "JOB_MODULE_MISMATCH");
        verify(dispatcher, never()).submit(any());
    }

    @Test
    @DisplayName("CODE 작업(jobCode)의 처리기가 이 앱에 없으면 404 JOB_HANDLER_NOT_FOUND")
    void handlerNotFound() {
        AcceptResult r = acceptor.accept(req("MDM", "jobCode", Map.of("handlerId", "mdm.other")));
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.body()).containsEntry("code", "JOB_HANDLER_NOT_FOUND");
        verify(dispatcher, never()).submit(any());

        when(dispatcher.submit(any())).thenReturn(SubmitResult.ACCEPTED);
        assertThat(acceptor.accept(req("MDM", "jobCode", Map.of("handlerId", "mdm.sync"))).status()).isEqualTo(202);
    }

    @Test
    @DisplayName("본문이 비었거나 필수 칸·예정 시각 형식이 틀리면 400 JOB_BAD_REQUEST")
    void badRequest() {
        assertThat(acceptor.accept(null).status()).isEqualTo(400);
        assertThat(acceptor.accept(new JobRunRequest("", "j", "MDM", "s", "run", null, null, null, 60, null, "2026-10-09T02:00:00", false, null)).status()).isEqualTo(400);
        assertThat(acceptor.accept(new JobRunRequest("r", "j", "MDM", "s", "run", null, null, null, 60, null, "내일", false, null)).status()).isEqualTo(400);
        assertThat(acceptor.accept(new JobRunRequest("r", "j", "MDM", "s", "run", null, null, null, 0, null, "2026-10-09T02:00:00", false, null)).status()).isEqualTo(400);
        verify(dispatcher, never()).submit(any());
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mcm.job.JobModule;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobHandlerRegistryTest {

    private static ScheduledJob job(String id, JobModule module) {
        return new SimpleScheduledJob(id, module, id, "0 2 * * *", Duration.ofMinutes(1), c -> 0);
    }

    @Test
    @DisplayName("이 앱 모듈의 처리기만 담는다 — mcm-core 의 MCM 작업이 다른 앱에 있어도 등록·실행하지 않는다")
    void onlyOwnModule() {
        JobHandlerRegistry r = new JobHandlerRegistry(JobModule.MDM, List.of(job("mdm.a", JobModule.MDM), job("mcm.b", JobModule.MCM)));
        assertThat(r.all()).extracting(ScheduledJob::id).containsExactly("mdm.a");
        assertThat(r.find("mdm.a")).isPresent();
        assertThat(r.find("mcm.b")).isEmpty();
        assertThat(r.find(null)).isEmpty();
    }

    @Test
    @DisplayName("같은 처리기 id 가 둘이면 기동 때 알 수 있게 예외")
    void duplicateId() {
        assertThatThrownBy(() -> new JobHandlerRegistry(JobModule.MDM, List.of(job("mdm.a", JobModule.MDM), job("mdm.a", JobModule.MDM))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("mdm.a");
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.job.JobRunDispatcher.SubmitResult;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.Principal;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class JobRunControllerTest {

    private final ObjectMapper json = new ObjectMapper();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        JobRunDispatcher dispatcher = mock(JobRunDispatcher.class);
        when(dispatcher.serverName()).thenReturn("host:mdm:1");
        when(dispatcher.submit(any())).thenReturn(SubmitResult.ACCEPTED);
        JobHandlerRegistry handlers = new JobHandlerRegistry(JobModule.MDM,
                List.of(new SimpleScheduledJob("mdm.sync", JobModule.MDM, "동기화", null, Duration.ofMinutes(5), c -> 1)));
        mvc = MockMvcBuilders.standaloneSetup(new JobRunController(new JobRunAcceptor(JobModule.MDM, dispatcher, handlers))).build();
    }

    private static Principal principal(String name, String... roles) {
        return new UsernamePasswordAuthenticationToken(name, null, java.util.Arrays.stream(roles).map(SimpleGrantedAuthority::new).toList());
    }

    private String body(String module) throws Exception {
        return json.writeValueAsString(new JobRunRequest("r1", "mdm.sync", module, "jobCode", "run", Map.of("a", 1), Map.of(),
                Map.of("handlerId", "mdm.sync"), 60, null, "2026-10-09T02:00:00", false, null));
    }

    @Test
    @DisplayName("system:mcm 주체 + ROLE_SYSTEM → 202")
    void mcmSystemIsAccepted() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("system:mcm", "ROLE_SYSTEM"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(true))
                .andExpect(jsonPath("$.serverNm").value("host:mdm:1"));
    }

    @Test
    @DisplayName("사용자 주체(역할 USER)는 403 — 사용자 토큰으로는 실행시킬 수 없다")
    void userPrincipalIsForbidden() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("admin", "ROLE_USER", "ROLE_SYSADMIN"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("JOB_FORBIDDEN"));
    }

    @Test
    @DisplayName("SYSTEM 역할이어도 system:mcm 이 아닌 주체(system:mls 등)는 403")
    void otherSystemPrincipalIsForbidden() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("system:mls", "ROLE_SYSTEM"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("system:mcm 이어도 ROLE_SYSTEM 이 없으면 403, 주체가 없어도 403")
    void missingRoleOrPrincipalIsForbidden() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("system:mcm", "ROLE_USER"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/internal/job/run").contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("module 이 이 앱과 다르면 400")
    void moduleMismatch() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("system:mcm", "ROLE_SYSTEM"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MCM")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("JOB_MODULE_MISMATCH"));
    }
}
```

- [ ] **Step 2: 실패를 확인한다** — `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 --tests '*JobRunAcceptorTest' --tests '*JobRunControllerTest' --tests '*JobHandlerRegistryTest'` → 컴파일 실패.

- [ ] **Step 3: SPI·레지스트리·접수를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import java.time.Duration;
import java.util.List;

/**
 * 코드로 등록하는 예약 작업 처리기(설계 §5.2). 실행할 수 있는 「코드 실행」 작업은 이 빈뿐이다 — 화면에서 임의 클래스·메서드를 받지 않는다.
 * {@code defaultCron()} 이 있으면 모듈 앱이 기동할 때 같은 id 의 작업이 DB 에 없을 때만 자동 등록된다(일정의 정본은 DB).
 * 같은 처리기를 변수만 달리해 여러 작업으로 쓸 수 있다. 실패는 예외로 알린다.
 */
public interface ScheduledJob {

    /** 처리기 id, 예: {@code mcm.screenUsageRollup}. {@code [A-Za-z0-9_.-]{1,60}}. */
    String id();

    /** 이 처리기가 있는 모듈. 앱의 모듈 키와 같을 때만 등록·실행한다. */
    JobModule module();

    String name();

    default String defaultCron() { return null; }

    default List<JobVar> defaultVars() { return List.of(); }

    default Duration defaultTimeout() { return Duration.ofMinutes(30); }

    /** @return 처리한 건수. 실패는 예외로. */
    int run(JobContext ctx);
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import java.time.LocalDateTime;
import java.util.Map;

/** {@link ScheduledJob#run} 에 넘기는 문맥 — 변수는 MCM 이 선점 때 확정한 값이다. */
public record JobContext(String jobId, String runId, Map<String, Object> vars, LocalDateTime schedAt, boolean manual) {
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import java.time.Duration;
import java.util.List;
import java.util.function.ToIntFunction;

/** 람다로 만드는 {@link ScheduledJob} — 기존 서비스의 공개 메서드를 코드 작업으로 노출할 때 쓴다. */
public final class SimpleScheduledJob implements ScheduledJob {

    private final String id;
    private final JobModule module;
    private final String name;
    private final String defaultCron;
    private final Duration timeout;
    private final List<JobVar> vars;
    private final ToIntFunction<JobContext> body;

    public SimpleScheduledJob(String id, JobModule module, String name, String defaultCron, Duration timeout, ToIntFunction<JobContext> body) {
        this(id, module, name, defaultCron, timeout, List.of(), body);
    }

    public SimpleScheduledJob(String id, JobModule module, String name, String defaultCron, Duration timeout, List<JobVar> vars,
                              ToIntFunction<JobContext> body) {
        this.id = id;
        this.module = module;
        this.name = name;
        this.defaultCron = defaultCron;
        this.timeout = timeout;
        this.vars = vars;
        this.body = body;
    }

    @Override public String id() { return id; }
    @Override public JobModule module() { return module; }
    @Override public String name() { return name; }
    @Override public String defaultCron() { return defaultCron; }
    @Override public Duration defaultTimeout() { return timeout; }
    @Override public List<JobVar> defaultVars() { return vars; }
    @Override public int run(JobContext ctx) { return body.applyAsInt(ctx); }
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.JobModule;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 이 앱의 코드 작업 처리기 모음 — 앱 모듈 키와 같은 {@code module()} 의 {@link ScheduledJob} 만 담는다. */
public class JobHandlerRegistry {

    private final Map<String, ScheduledJob> byId = new LinkedHashMap<>();

    public JobHandlerRegistry(JobModule appModule, List<ScheduledJob> jobs) {
        for (ScheduledJob job : jobs) {
            if (job.module() != appModule) continue;
            if (byId.putIfAbsent(job.id(), job) != null) {
                throw new IllegalStateException("예약 작업 처리기 id 가 겹칩니다: " + job.id());
            }
        }
    }

    public Optional<ScheduledJob> find(String id) {
        return id == null ? Optional.empty() : Optional.ofNullable(byId.get(id));
    }

    public List<ScheduledJob> all() {
        return List.copyOf(byId.values());
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import java.util.Map;

/** 접수 응답 — HTTP 상태와 본문. */
public record AcceptResult(int status, Map<String, Object> body) {

    static AcceptResult of(int status, String code) {
        return new AcceptResult(status, Map.of("code", code));
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 접수(설계 §4.4 접수 2~7) — 컨트롤러의 주체 검사(1) 뒤에 부른다. 순서는 모듈 일치(2) → CODE 처리기 존재(4) → 진입점 접수(3·5·6) → 202(7).
 * 4 가 3 앞에 오는 것은 계획 D5 — 이미 접수된 회차는 처리기가 있다는 뜻이라 결과가 같다.
 * 실행은 기다리지 않는다. MCM 앱 자신의 작업은 {@link LocalJobRunGateway} 로 이 객체를 HTTP 없이 부른다.
 */
public class JobRunAcceptor {

    static final String CODE_SERVICE_ID = "jobCode";

    private final JobModule appModule;
    private final JobRunDispatcher dispatcher;
    private final JobHandlerRegistry handlers;

    public JobRunAcceptor(JobModule appModule, JobRunDispatcher dispatcher, JobHandlerRegistry handlers) {
        this.appModule = appModule;
        this.dispatcher = dispatcher;
        this.handlers = handlers;
    }

    public AcceptResult accept(JobRunRequest req) {
        if (!wellFormed(req)) return AcceptResult.of(400, "JOB_BAD_REQUEST");
        if (!appModule.name().equalsIgnoreCase(req.module())) return AcceptResult.of(400, "JOB_MODULE_MISMATCH");
        if (CODE_SERVICE_ID.equals(req.serviceId())) {
            Object handlerId = req.config().get("handlerId");
            if (handlerId == null || handlers.find(String.valueOf(handlerId)).isEmpty()) return AcceptResult.of(404, "JOB_HANDLER_NOT_FOUND");
        }
        return switch (dispatcher.submit(req)) {
            case ACCEPTED -> {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("accepted", true);
                body.put("serverNm", dispatcher.serverName());
                yield new AcceptResult(202, body);
            }
            case DUPLICATE -> new AcceptResult(200, Map.of("duplicate", true));
            case JOB_RUNNING -> AcceptResult.of(409, "JOB_RUNNING");
            case POOL_FULL -> AcceptResult.of(503, "JOB_POOL_FULL");
        };
    }

    private static boolean wellFormed(JobRunRequest r) {
        if (r == null || blank(r.runId()) || blank(r.jobId()) || blank(r.module()) || blank(r.serviceId()) || blank(r.action()) || r.timeoutSec() < 1) {
            return false;
        }
        try {
            r.schedAtTime();
            return true;
        } catch (DateTimeParseException | NullPointerException e) {
            return false;
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * {@code POST /internal/job/run} — MCM 이 모듈 앱에 실행을 푸시한다(설계 §4.10). {@code /api/} 로 시작하지 않아 포털 BFF 의 전달 경로로는 닿지 않는다.
 * 요청은 {@code X-Client-Key}(ClientKeyFilter)를 통과해야 하고, ClientKeyFilter 가 {@code X-Authenticated-User}·{@code X-Authenticated-Role} 헤더로 세운
 * 주체가 {@code system:mcm} + {@code ROLE_SYSTEM} 이어야 한다(아니면 403) — cactus-core 보안 설정은 바꾸지 않는다.
 * 스테레오타입 없이 클래스 수준 {@code @RequestMapping} 으로 핸들러가 되고 {@link JobAgentConfig} 가 {@code @Bean} 으로 올린다.
 */
@RequestMapping("/internal/job")
public class JobRunController {

    static final String MCM_PRINCIPAL = "system:mcm";
    static final String SYSTEM_AUTHORITY = "ROLE_SYSTEM";

    private final JobRunAcceptor acceptor;

    public JobRunController(JobRunAcceptor acceptor) {
        this.acceptor = acceptor;
    }

    @PostMapping("/run")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> run(@RequestBody JobRunRequest body, Authentication auth) {
        if (!isMcmSystem(auth)) return ResponseEntity.status(403).body(Map.of("code", "JOB_FORBIDDEN"));
        AcceptResult r = acceptor.accept(body);
        return ResponseEntity.status(r.status()).body(r.body());
    }

    static boolean isMcmSystem(Authentication auth) {
        return auth != null && auth.isAuthenticated() && MCM_PRINCIPAL.equals(auth.getName())
                && auth.getAuthorities().stream().anyMatch(a -> SYSTEM_AUTHORITY.equals(a.getAuthority()));
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.cactus.job.JobRunRequest;

/** MCM 앱 자신의 작업을 HTTP 없이 접수 쪽으로 넘긴다(설계 §4.3). 실행은 접수 쪽 실행 풀 스레드에서 돌아 호출 스레드의 MDC 를 물려받지 않는다. */
public class LocalJobRunGateway {

    private final JobRunAcceptor acceptor;

    public LocalJobRunGateway(JobRunAcceptor acceptor) {
        this.acceptor = acceptor;
    }

    public AcceptResult call(JobRunRequest request) {
        return acceptor.accept(request);
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.JobModule;

/** 이 앱의 모듈 키 — {@code dmes.job.module} 또는 {@code spring.application.name} 첫 '-' 앞부분. */
public record JobAppInfo(JobModule module) {
}
```

- [ ] **Step 4: 통과를 확인한다** — Step 2 의 명령 → PASS

- [ ] **Step 5: 코드 작업 등록 Oracle 시험을 쓴다** (`OraCheckJpaConfig` = MCMAPUSER 연결, 표는 V3 가 만든다)

```java
package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistrar;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.job.agent.SimpleScheduledJob;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Timestamp;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobHandlerRegistrarOraTest {

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_HANDLER");
    }

    private static ScheduledJob job(String id, JobModule module, String cron) {
        return new SimpleScheduledJob(id, module, id + " 이름", cron, Duration.ofMinutes(10), c -> 0);
    }

    private JobHandlerRegistrar registrar(DataSource ds, JobModule app, ScheduledJob... jobs) {
        return new JobHandlerRegistrar(ds, "MCMAPUSER", new JobHandlerRegistry(app, List.of(jobs)), Duration.ofMillis(50));
    }

    @Test
    @DisplayName("처리기는 HANDLER 에 MERGE, 기본 일정이 있는 처리기만 DEF 에 CODE 작업으로 INSERT — 다른 모듈의 빈은 등록하지 않는다")
    void registersHandlersAndDefaultJobs() {
        int n = registrar(dataSource, JobModule.MCM,
                job("mcm.rollup", JobModule.MCM, "0 2 * * *"), job("mcm.manual", JobModule.MCM, null), job("mdm.other", JobModule.MDM, "0 1 * * *")).register();

        assertThat(n).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT HANDLER_ID FROM MCMAPUSER.TB_MCM_JOB_HANDLER ORDER BY HANDLER_ID", String.class))
                .containsExactly("mcm.manual", "mcm.rollup");
        Map<String, Object> def = jdbc.queryForMap("SELECT * FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.rollup'");
        assertThat(def.get("MODULE_CD")).isEqualTo("MCM");
        assertThat(def.get("JOB_KIND")).isEqualTo("CODE");
        assertThat(def.get("SERVICE_ID")).isEqualTo("jobCode");
        assertThat(def.get("ACTION")).isEqualTo("run");
        assertThat(def.get("OWNER_TP")).isEqualTo("CODE");
        assertThat(def.get("USE_YN")).isEqualTo("Y");
        assertThat(def.get("CRON_EXPR")).isEqualTo("0 2 * * *");
        assertThat(((Number) def.get("TIMEOUT_SEC")).intValue()).isEqualTo(600);
        assertThat(String.valueOf(def.get("CONFIG_JSON"))).contains("\"handlerId\"").contains("mcm.rollup");
        assertThat((Timestamp) def.get("NEXT_RUN_AT")).isAfter(new Timestamp(System.currentTimeMillis() - 60_000));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.manual'", Integer.class)).isZero();
    }

    @Test
    @DisplayName("다시 기동해도 화면에서 바꾼 일정·사용 여부는 덮어쓰지 않는다 — HANDLER 의 SEEN_AT 만 갱신")
    void doesNotOverwriteScreenValues() {
        JobHandlerRegistrar r = registrar(dataSource, JobModule.MCM, job("mcm.rollup", JobModule.MCM, "0 2 * * *"));
        r.register();
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET CRON_EXPR = '0 5 * * *', USE_YN = 'N' WHERE JOB_ID = 'mcm.rollup'");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_HANDLER SET SEEN_AT = TIMESTAMP '2020-01-01 00:00:00' WHERE HANDLER_ID = 'mcm.rollup'");

        r.register();

        Map<String, Object> def = jdbc.queryForMap("SELECT CRON_EXPR, USE_YN FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.rollup'");
        assertThat(def.get("CRON_EXPR")).isEqualTo("0 5 * * *");
        assertThat(def.get("USE_YN")).isEqualTo("N");
        assertThat(jdbc.queryForObject("SELECT SEEN_AT FROM MCMAPUSER.TB_MCM_JOB_HANDLER WHERE HANDLER_ID = 'mcm.rollup'", Timestamp.class))
                .isAfter(Timestamp.valueOf("2026-01-01 00:00:00"));
    }

    @Test
    @DisplayName("기본 변수는 HANDLER·DEF 의 VARS_JSON 에 JSON 으로 들어간다")
    void defaultVarsAreStored() {
        ScheduledJob withVars = new SimpleScheduledJob("mcm.v", JobModule.MCM, "v", "0 3 * * *", Duration.ofMinutes(1),
                List.of(new JobVar("baseDt", JobVar.Type.DATE, ":yesterday", "기준일")), c -> 0);
        registrar(dataSource, JobModule.MCM, withVars).register();
        assertThat(jdbc.queryForObject("SELECT VARS_JSON FROM MCMAPUSER.TB_MCM_JOB_HANDLER WHERE HANDLER_ID = 'mcm.v'", String.class)).contains("baseDt").contains(":yesterday");
        assertThat(jdbc.queryForObject("SELECT VARS_JSON FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.v'", String.class)).contains("baseDt");
    }

    @Test
    @DisplayName("id 형식이 틀리거나 기본 일정을 읽을 수 없는 처리기는 건너뛴다 — 기동을 막지 않고 나머지는 등록한다")
    void skipsBadHandlers() {
        int n = registrar(dataSource, JobModule.MCM,
                job("bad id!", JobModule.MCM, "0 2 * * *"), job("mcm.badcron", JobModule.MCM, "0 9 1 * 1"), job("mcm.ok", JobModule.MCM, "0 4 * * *")).register();
        assertThat(n).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT HANDLER_ID FROM MCMAPUSER.TB_MCM_JOB_HANDLER", String.class)).containsExactly("mcm.ok");
    }

    @Test
    @DisplayName("같은 앱 두 대가 동시에 기동해도 DEF·HANDLER 행은 하나 — 동시 INSERT 로 한쪽이 실패해도 registerWithRetry 가 한 번 더 해서 끝난다")
    void concurrentStartupInsertsOneDefRow() throws Exception {
        JobHandlerRegistrar a = registrar(dataSource, JobModule.MCM, job("mcm.rollup", JobModule.MCM, "0 2 * * *"));
        JobHandlerRegistrar b = registrar(dataSource, JobModule.MCM, job("mcm.rollup", JobModule.MCM, "0 2 * * *"));
        CountDownLatch go = new CountDownLatch(1);
        Thread t1 = new Thread(() -> startWhenReleased(go, a));
        Thread t2 = new Thread(() -> startWhenReleased(go, b));
        t1.start();
        t2.start();
        go.countDown();
        t1.join();
        t2.join();
        Thread.sleep(500);   // 재시도(지연 50ms) 끝날 시간
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.rollup'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_HANDLER", Integer.class)).isEqualTo(1);
    }

    private static void startWhenReleased(CountDownLatch go, JobHandlerRegistrar r) {
        try {
            go.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return;
        }
        r.registerWithRetry();
    }

    @Test
    @DisplayName("모듈 사용자(MDMAPUSER)로 접속해도 등록된다 — V3 의 GRANT(로컬은 ANY TABLE)")
    void worksAsModuleUser() {
        try (HikariDataSource mdm = McmCoreOraTestDb.dataSource("MDMAPUSER", "job-registrar-mdm")) {
            assertThat(registrar(mdm, JobModule.MDM, job("mdm.sync", JobModule.MDM, "0 1 * * *")).register()).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("SELECT MODULE_CD FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mdm.sync'", String.class)).isEqualTo("MDM");
    }

    @Test
    @DisplayName("JOB 표가 없거나 닿지 못해도 registerWithRetry 는 예외를 던지지 않고, 지연 뒤 딱 한 번 더 시도한다")
    void registerWithRetryNeverThrowsAndRetriesOnce() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        JobHandlerRegistrar failing = new JobHandlerRegistrar(dataSource, "MCMAPUSER", new JobHandlerRegistry(JobModule.MCM, List.of(job("mcm.a", JobModule.MCM, "0 2 * * *"))),
                Duration.ofMillis(50)) {
            @Override
            public int register() {
                attempts.incrementAndGet();
                throw new IllegalStateException("jdbc:oracle://secret-host/db password=hunter2");
            }
        };
        failing.registerWithRetry();
        Thread.sleep(400);
        assertThat(attempts.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("처리기가 하나도 없는 앱은 DB 에 닿지 않는다")
    void noHandlersNoDbAccess() {
        DataSource boom = new org.springframework.jdbc.datasource.AbstractDataSource() {
            @Override
            public java.sql.Connection getConnection() {
                throw new AssertionError("DB 에 닿으면 안 된다");
            }

            @Override
            public java.sql.Connection getConnection(String u, String p) {
                return getConnection();
            }
        };
        assertThat(registrar(boom, JobModule.MDM).register()).isZero();
    }
}
```

- [ ] **Step 6: 실패를 확인한다** — `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobHandlerRegistrarOraTest'` → 컴파일 실패.

- [ ] **Step 7: 등록기를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 모듈 앱이 기동할 때 자기 모듈의 {@link ScheduledJob} 빈을 DB 에 직접 등록한다(설계 §5.2·D30) — 등록 SQL 은 이 클래스 한 곳이다.
 * <ul>
 *   <li>HANDLER 에 MERGE(처리기 목록·{@code SEEN_AT} 갱신 — 화면의 「코드 실행」 처리기 목록과 「코드 없음」 배지가 읽는다).</li>
 *   <li>{@code defaultCron()} 이 있는 처리기만 DEF 에 같은 id 의 CODE 작업을 <b>없을 때만</b> INSERT(MERGE … WHEN NOT MATCHED).
 *       화면에서 바꾼 일정·사용 여부는 덮어쓰지 않는다. 동시에 두 대가 떠도 행은 하나.</li>
 *   <li>id 형식이나 기본 일정이 틀린 처리기는 ERROR 로그로 건너뛴다(기동 실패 아님).</li>
 *   <li>실패(표 없음·권한·DB 순간 오류)는 {@link #registerWithRetry()} 가 WARN 한 번 남기고 지연(운영 1분) 뒤 한 번 더 한다. 앱 기동은 실패하지 않는다.</li>
 * </ul>
 * 스키마 접두는 {@code dmes.job.schema}, 연결은 그 앱의 기본 DataSource(자기 스키마 사용자)이다. 로그에는 예외 종류만 남긴다.
 */
public class JobHandlerRegistrar {

    private static final Logger log = LoggerFactory.getLogger(JobHandlerRegistrar.class);
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_.-]{1,60}$");
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    private final JdbcTemplate jdbc;
    private final JobHandlerRegistry registry;
    private final Duration retryDelay;
    private final String mergeHandlerSql;
    private final String mergeDefSql;

    public JobHandlerRegistrar(DataSource dataSource, String schema, JobHandlerRegistry registry, Duration retryDelay) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = new JdbcTemplate(dataSource);
        this.registry = registry;
        this.retryDelay = retryDelay;
        this.mergeHandlerSql = """
                MERGE INTO %1$s.TB_MCM_JOB_HANDLER T
                USING (SELECT ? HANDLER_ID FROM DUAL) S
                ON    (T.HANDLER_ID = S.HANDLER_ID)
                WHEN MATCHED THEN UPDATE
                SET   T.MODULE_CD = ?
                    , T.HANDLER_NM = ?
                    , T.DEFAULT_CRON = ?
                    , T.VARS_JSON = ?
                    , T.SEEN_AT = %2$s
                    , T.U_AT = %2$s
                    , T.U_USR_ID = 'SYSTEM'
                    , T.U_PGM_ID = 'JobHandlerRegistrar'
                    , T.VER = T.VER + 1
                WHEN NOT MATCHED THEN INSERT
                      (HANDLER_ID, MODULE_CD, HANDLER_NM, DEFAULT_CRON, VARS_JSON, SEEN_AT, C_AT, C_USR_ID, C_PGM_ID, U_AT, U_USR_ID, U_PGM_ID, VER)
                VALUES (S.HANDLER_ID, ?, ?, ?, ?, %2$s, %2$s, 'SYSTEM', 'JobHandlerRegistrar', %2$s, 'SYSTEM', 'JobHandlerRegistrar', 0)
                """.formatted(schema, NOW);
        this.mergeDefSql = """
                MERGE INTO %1$s.TB_MCM_JOB_DEF T
                USING (SELECT ? JOB_ID FROM DUAL) S
                ON    (T.JOB_ID = S.JOB_ID)
                WHEN NOT MATCHED THEN INSERT
                      (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, TIMEOUT_SEC, NEXT_RUN_AT,
                       OWNER_TP, C_AT, C_USR_ID, C_PGM_ID, U_AT, U_USR_ID, U_PGM_ID, VER)
                VALUES (S.JOB_ID, ?, ?, 'CODE', 'jobCode', 'run', ?, 'Y', ?, ?, ?, ?,
                        'CODE', %2$s, 'SYSTEM', 'JobHandlerRegistrar', %2$s, 'SYSTEM', 'JobHandlerRegistrar', 0)
                """.formatted(schema, NOW);
    }

    /** @return 등록한 처리기 수(건너뛴 것 제외). 처리기가 없으면 DB 에 닿지 않는다. */
    public int register() {
        if (registry.all().isEmpty()) return 0;
        Timestamp now = jdbc.queryForObject("SELECT " + NOW + " FROM DUAL", Timestamp.class);
        int count = 0;
        for (ScheduledJob job : registry.all()) {
            if (!ID.matcher(job.id()).matches()) {
                log.error("예약 작업 처리기 id 형식이 올바르지 않아 건너뜁니다: {}", job.id());
                continue;
            }
            CronSpec cron = null;
            if (job.defaultCron() != null) {
                try {
                    cron = CronSpec.parse(job.defaultCron());
                } catch (IllegalArgumentException e) {
                    log.error("예약 작업 처리기 {} 의 기본 일정을 읽을 수 없어 건너뜁니다: {}", job.id(), e.getMessage());
                    continue;
                }
            }
            String vars = JobVars.toJson(job.defaultVars());
            String cronText = cron == null ? null : cron.expression();
            jdbc.update(mergeHandlerSql, job.id(), job.module().name(), job.name(), cronText, vars, job.module().name(), job.name(), cronText, vars);
            if (cron != null) {
                LocalDateTime next = cron.next(now.toLocalDateTime());
                jdbc.update(mergeDefSql, job.id(), job.module().name(), job.name(), cronText, "{\"handlerId\":\"" + job.id() + "\"}", vars,
                        (int) job.defaultTimeout().toSeconds(), next == null ? null : Timestamp.valueOf(next));
            }
            count++;
        }
        log.info("[job] 코드 작업 처리기 {}개를 등록했습니다(모듈 {})", count, registry.all().get(0).module());
        return count;
    }

    /** 앱 기동 뒤 부른다. 실패하면 WARN 한 번 남기고 {@code retryDelay} 뒤 한 번 더 한다 — 예외를 던지지 않는다. */
    public void registerWithRetry() {
        if (attempt("처음")) return;
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "job-register-retry");
            t.setDaemon(true);
            return t;
        });
        timer.schedule(() -> {
            try {
                attempt("재시도");
            } finally {
                timer.shutdown();
            }
        }, retryDelay.toMillis(), TimeUnit.MILLISECONDS);
    }

    private boolean attempt(String label) {
        try {
            register();
            return true;
        } catch (RuntimeException e) {
            log.warn("[job] 코드 작업 처리기 등록 실패({}) 원인={}", label, e.getClass().getSimpleName());
            return false;
        }
    }
}
```

- [ ] **Step 8: 빈 조립 `JobAgentConfig` 와 `JobConfig` import**

```java
package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.JobProperties;
import java.time.Duration;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * 모든 모듈 앱의 예약 작업 접수 쪽 빈(설계 §2 「각 모듈 앱」). mdm·mls·mpp·mqc·mpn 은 mcm-core 를 스캔하지 않고 {@code McmCoreAutoConfiguration}
 * 이 {@code @Import} 하는 것만 얻으므로 스테레오타입 없이 {@code @Bean} 으로 선언한다. {@code dmes.job.agent.enabled=false} 면 만들지 않아
 * {@code /internal/job/run} 은 404 이다.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "dmes.job.agent", name = "enabled", havingValue = "true", matchIfMissing = true)
public class JobAgentConfig {

    @Bean
    public JobAppInfo jobAppInfo(JobProperties props, Environment env) {
        return new JobAppInfo(JobModule.resolve(props, env));
    }

    @Bean
    public JobHandlerRegistry jobHandlerRegistry(JobAppInfo app, ObjectProvider<ScheduledJob> jobs) {
        return new JobHandlerRegistry(app.module(), jobs.orderedStream().toList());
    }

    @Bean
    public JobRunAcceptor jobRunAcceptor(JobAppInfo app, JobRunDispatcher dispatcher, JobHandlerRegistry handlers) {
        return new JobRunAcceptor(app.module(), dispatcher, handlers);
    }

    @Bean
    public JobRunController jobRunController(JobRunAcceptor acceptor) {
        return new JobRunController(acceptor);
    }

    @Bean
    public LocalJobRunGateway localJobRunGateway(JobRunAcceptor acceptor) {
        return new LocalJobRunGateway(acceptor);
    }

    @Bean
    public JobHandlerRegistrar jobHandlerRegistrar(ObjectProvider<DataSource> dataSource, JobProperties props, JobHandlerRegistry registry) {
        return new JobHandlerRegistrar(dataSource.getObject(), props.getSchema(), registry, Duration.ofMinutes(1));
    }

    /** 앱이 다 뜬 뒤 코드 작업 처리기를 등록한다 — 실패해도 기동은 실패하지 않는다. */
    @Bean
    public ApplicationListener<ApplicationReadyEvent> jobHandlerRegistration(JobHandlerRegistrar registrar) {
        return event -> registrar.registerWithRetry();
    }
}
```

`JobConfig` 에 `@Import(com.dongkuk.dmes.mcm.job.agent.JobAgentConfig.class)` 를 더한다(클래스 선언 위).

주의: MCM 앱은 `com.dongkuk.dmes.mcm` 을 스캔하므로 `JobAgentConfig`·`JobConfig` 도 스캔에 잡힌다. 같은 클래스가 `@Import` 와 스캔으로 두 번 정의돼도 Spring 은 설정 클래스를 클래스 이름으로 한 번만 처리하므로 빈은 한 벌이다(`WidgetExtConfig` 와 같은 기존 방식). 컨트롤러는 스테레오타입이 없어 스캔되지 않고 `@Bean` 한 벌만 있다.

- [ ] **Step 9: mdm 앱 보안 시험을 쓴다** — 6개 앱이 `/internal/**` 를 같은 방식으로 받는지 mdm 하나로 확인한다(설계 §4.10 마지막 항목 「구현 첫 작업에서 시험으로 확인」). `AbstractMdmSharedDbTest`·`DmaOasisHttpTest` 와 같은 HTTP 방식이다.

```java
package com.dongkuk.dmes.mdm.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/**
 * 예약 작업 접수 {@code POST /internal/job/run} 의 보안(설계 §4.10) — mdm 앱을 실제로 띄워 ClientKeyFilter → 컨트롤러 주체 검사를 확인한다.
 * 보안 설정은 바꾸지 않는다: /internal/** 는 anyRequest().authenticated() 이고, ClientKeyFilter 가 X-Authenticated-* 헤더로 주체를 세운다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = "cactus.security.client-key=" + JobRunHttpSecurityTest.KEY)
@ActiveProfiles("local")
class JobRunHttpSecurityTest extends AbstractMdmSharedDbTest {

    static final String KEY = "mdm-job-test-client-key";

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newHttpClient();

    private static final String BODY_OTHER_MODULE = """
            {"runId":"r1","jobId":"mcm.x","module":"MCM","serviceId":"jobCode","action":"run","inputs":{},"varTypes":{},"config":{"handlerId":"x"},
             "timeoutSec":60,"schedAt":"2026-10-09T02:00:00","manual":false}
            """;
    private static final String BODY_NO_HANDLER = """
            {"runId":"r1","jobId":"mdm.x","module":"MDM","serviceId":"jobCode","action":"run","inputs":{},"varTypes":{},"config":{"handlerId":"no.such"},
             "timeoutSec":60,"schedAt":"2026-10-09T02:00:00","manual":false}
            """;

    private HttpResponse<String> post(String body, String key, String user, String role) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder().uri(URI.create("http://127.0.0.1:" + port + "/internal/job/run"))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        if (key != null) b.header("X-Client-Key", key);
        if (user != null) b.header("X-Authenticated-User", user);
        if (role != null) b.header("X-Authenticated-Role", role);
        return client.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void 키가_없으면_401() throws Exception {
        assertEquals(401, post(BODY_NO_HANDLER, null, "system:mcm", "SYSTEM").statusCode());
        assertEquals(401, post(BODY_NO_HANDLER, "wrong", "system:mcm", "SYSTEM").statusCode());
    }

    @Test
    void 키는_맞아도_주체_헤더가_없으면_거절된다() throws Exception {
        int status = post(BODY_NO_HANDLER, KEY, null, null).statusCode();
        assertTrue(status == 401 || status == 403, "상태 " + status);
    }

    @Test
    void 사용자_주체는_403() throws Exception {
        assertEquals(403, post(BODY_NO_HANDLER, KEY, "admin", "SYSADMIN").statusCode());
    }

    @Test
    void SYSTEM_이어도_system_mcm_이_아니면_403() throws Exception {
        assertEquals(403, post(BODY_NO_HANDLER, KEY, "system:mls", "SYSTEM").statusCode());
    }

    @Test
    void system_mcm_인데_module_이_이_앱과_다르면_400() throws Exception {
        HttpResponse<String> r = post(BODY_OTHER_MODULE, KEY, "system:mcm", "SYSTEM");
        assertEquals(400, r.statusCode());
        assertTrue(r.body().contains("JOB_MODULE_MISMATCH"), r.body());
    }

    @Test
    void system_mcm_이면_컨트롤러까지_닿아_처리기가_없으면_404() throws Exception {
        HttpResponse<String> r = post(BODY_NO_HANDLER, KEY, "system:mcm", "SYSTEM");
        assertEquals(404, r.statusCode());
        assertTrue(r.body().contains("JOB_HANDLER_NOT_FOUND"), r.body());
    }
}
```

- [ ] **Step 10: 실행한다**
  - `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 --tests '*JobRunAcceptorTest' --tests '*JobRunControllerTest' --tests '*JobHandlerRegistryTest'` → PASS
  - `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobHandlerRegistrarOraTest' --tests '*McmCoreArchitectureTest'` → PASS(아키텍처 시험이 `mcm.job..` 밖의 cactus 의존이 없음을 계속 확인한다)
  - `cd ../mdm` 다음 `../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobRunHttpSecurityTest'` → PASS. 키 없음이 401 이 아니거나 `system:mcm` 시험이 403 이면 **보안 설정을 고치지 말고 멈춰 조정자에게 묻는다**(`ClientKeyFilter` 가 `X-Authenticated-User` 로 주체를 세우는 방식은 `MdmMetaClient` 가 이미 쓰는 길이다).

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/backend/mcm-core/src src/backend/mdm/api/src/test
/usr/bin/git commit -m "$(printf 'feat(mcm-core): 예약 작업 접수 컨트롤러와 코드 작업 처리기 기동 등록을 더한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 6: mcm-core `builtin` — 내장 서비스 + 수집 원천 이동 + 위젯 collect 백엔드 삭제

**담당 후보:** GLM 또는 opencode  
**Model:** sonnet/high

설계 §5.1(내장 서비스)·§5.4(수집)·§6(없애는 것/옮기는 것)·§4.4(쿼리 시간 초과 D31)·§8(웹 호출 차단 D23)·D13·D22. **계획 D2 로 위젯 collect 백엔드 삭제를 이 Task 에서 한다**(원천을 옮기는 순간 `job → widget` 이 생기므로 `widget → job` 을 같은 커밋에서 없앤다). D7(모듈마다 `JobCollectSql`).

**Files:**
- Create: `src/backend/mcm-core/src/main/resources/services/job/jobCode.bpmn`, `jobQuery.bpmn`, `jobCollect.bpmn`
- Create(`.../mcm/job/builtin/`): `JobBind.java`, `QueryStatementGuard.java`, `JobCodeService.java`, `JobQueryService.java`, `JobCollectService.java`, `JobBuiltinConfig.java`; (`.../builtin/collect/`) `JobCollectSql.java`, `JobCollectHosts.java`
- Move(`git mv`, `widget/collect` → `job/builtin/collect`): `CollectConfig.java`, `CollectConfigs.java`, `CollectException.java`, `CollectItem.java`, `CollectSource.java`, `SqlCollectSource.java`, `HttpCollectSource.java`, `ExchangeCollectSource.java`; 시험 `CollectConfigsTest.java`, `CollectSourcesTest.java`
- Delete(`git rm`): `widget/collect/WidgetCollector.java`, `WidgetCollectWriter.java`, `WidgetCollectReader.java`, `WidgetCollectConfig.java`, `WidgetCollectProperties.java`, `widget/collect/entity/*`, `widget/collect/repository/*`; 시험 `widget/collect/WidgetCollectorJpaTest.java`, `widget/admin/service/WidgetDefConfigRulesCollectTest.java`
- Modify: `widget/data/WidgetDataService.java`, `widget/admin/service/WidgetDefConfigRules.java`, `widget/admin/service/CommWidgetMngService.java`, 그 시험(`WidgetDataServiceTest`, `CommWidgetMngServiceTest`), `.../mcm/job/JobConfig.java`(`@Import(JobBuiltinConfig.class)`)
- Test: `.../mcm/job/builtin/QueryStatementGuardTest.java`, `JobBuiltinBeansTest.java`, `.../oracheck/JobBuiltinServicesOraTest.java`, 지원 `.../mcm/job/support/JobOasisTestKit.java`

**Interfaces:**
- Consumes: `JobRunScope.require()/queryTimeoutSeconds()/addItems/collect/config()/vars()/varTypes()/schedAt()/manual()`, `CollectedValue`, `JobRunDispatcher`, `JobRunReporter`(Task 3·4); `JobHandlerRegistry`·`ScheduledJob`·`JobContext`(Task 5).
- Produces:
  - 서비스 ID `jobCode`·`jobQuery`·`jobCollect`(BPMN `camunda:class` = 빈 `jobCodeService`·`jobQueryService`·`jobCollectService`, `method=run`, `output=result`).
  - `JobCodeService.run(@OptionalParam String handlerId): Map<String,Object>`, `JobQueryService.run(@OptionalParam String sql)`, `JobCollectService.run(@OptionalParam Map<String,Object> source, @OptionalParam Boolean save)` — 모두 **첫 줄에서 `JobRunScope.require()`** (없으면 `JobScopeRequiredException`). 반환 `{itemCnt: n}`.
  - `JobBind.of(Object value, String type): Bound(Object value, int sqlType)`.
  - `QueryStatementGuard.check(String): Checked(String sql, boolean procedure, List<String> variables)` — 어기면 `IllegalArgumentException`(문장 원문을 메시지에 넣지 않는다).
  - `JobCollectSql(DataSource)`: `void validate(String sql, Set<String> declaredVars)`(`CollectException`), `WidgetQueryResult run(String sql, Map<String,Object> vars, Map<String,String> varTypes, int timeoutSec, int maxRows, LocalDate today)`, 상수 `MAX_TIMEOUT_SEC=10`, `MSG_LOAD_FAILED`.
  - `CollectConfig(Source source, boolean save)`, `CollectConfigs.parse(String|JsonNode)`, `parseSource(JsonNode)`(public), `check(JsonNode config, String moduleCd, Consumer<String> validateSql, Predicate<String> hostAllowed)`.
  - `SqlCollectSource(JobCollectSql)`·`HttpCollectSource(Predicate<String> hostAllowed)`·`ExchangeCollectSource(WidgetExtProperties, FrankfurterProvider, KoreaEximProvider)` — 모두 public, 스테레오타입 없음.

- [ ] **Step 1: 쿼리 문장 검사 시험을 쓴다 (D13)**

```java
package com.dongkuk.dmes.mcm.job.builtin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class QueryStatementGuardTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "UPDATE T SET A = 1 WHERE B = :b",
            "update t set a = 1 where b = :b;",
            "INSERT INTO T (A) VALUES (:a)",
            "DELETE FROM T WHERE D < :cutoff",
            "MERGE INTO T X USING (SELECT 1 A FROM DUAL) S ON (X.A = S.A) WHEN MATCHED THEN UPDATE SET X.B = 1",
            "UPDATE T SET A = 'DROP TABLE X; COMMIT' /* ROLLBACK */ -- DROP\n WHERE B = 1",
            "BEGIN PKG.P(:schedAt); END;",
            "begin pkg.p(:a, 'x;y', 3); end",
            "BEGIN SCHEMA1.PKG.P; END;",
    })
    @DisplayName("허용 — DML 한 문장(끝 ; 는 떼어 낸다)이나 프로시저 호출 하나. 주석·문자열 안의 금지어는 본다")
    void allowed(String sql) {
        QueryStatementGuard.Checked c = QueryStatementGuard.check(sql);
        assertThat(c.sql()).isNotBlank();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "SELECT 1 FROM DUAL",
            "UPDATE A SET X = 1; DELETE FROM B",
            "DROP TABLE X",
            "TRUNCATE TABLE X",
            "COMMIT",
            "ROLLBACK",
            "UPDATE T SET A = 1; COMMIT",
            "BEGIN EXECUTE IMMEDIATE 'x'; END;",
            "BEGIN P1; P2; END;",
            "BEGIN P1(:a); COMMIT; END;",
            "UPDATE T SET A = 1 WHERE B IN (SELECT B FROM T2@DBLINK)",
            "UPDATE T SET A = q'[x]' WHERE 1 = 1",
            "UPDATE T SET A = 1 WHERE B = :1",
            "UPDATE T SET A = &x",
            "UPDATE T SET A = 'abc",
            "",
            "   ",
    })
    @DisplayName("거절 — SELECT·DDL·트랜잭션 제어·여러 문장·EXECUTE IMMEDIATE·DB 링크·대체 따옴표·위치 바인드·닫히지 않은 따옴표·빈 문장")
    void rejected(String sql) {
        assertThatThrownBy(() -> QueryStatementGuard.check(sql)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("거절 메시지에 문장 원문을 넣지 않는다")
    void messageHasNoSql() {
        assertThatThrownBy(() -> QueryStatementGuard.check("DROP TABLE SECRET_TABLE_NAME"))
                .isInstanceOf(IllegalArgumentException.class).satisfies(e -> assertThat(e.getMessage()).doesNotContain("SECRET_TABLE_NAME"));
    }

    @Test
    @DisplayName("바인드 변수 이름을 처음 나온 순서로 모은다(주석·문자열 속 :이름 제외) — 프로시저 여부 표시")
    void variablesAndProcedureFlag() {
        QueryStatementGuard.Checked dml = QueryStatementGuard.check("UPDATE T SET A = :a, B = ':notvar' WHERE C = :c AND D = :a -- :ignored");
        assertThat(dml.variables()).containsExactly("a", "c");
        assertThat(dml.procedure()).isFalse();
        assertThat(dml.sql()).doesNotEndWith(";");
        QueryStatementGuard.Checked proc = QueryStatementGuard.check("BEGIN PKG.P(:x); END;");
        assertThat(proc.procedure()).isTrue();
        assertThat(proc.sql()).isEqualTo("BEGIN PKG.P(:x); END;");
    }
}
```

- [ ] **Step 2: 실패를 확인한다** — `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 --tests '*QueryStatementGuardTest'` → 컴파일 실패.

- [ ] **Step 3: `QueryStatementGuard`·`JobBind` 를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.builtin;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 「쿼리 실행」 작업의 문장 검사(설계 §8·D13) — DML 한 문장({@code INSERT·UPDATE·DELETE·MERGE}) 또는 프로시저 호출 하나({@code BEGIN 프로시저(…); END;}).
 * 주석·문자열·따옴표 식별자를 가린 사본으로 판단하고(실행은 원문), 끝 {@code ;} 는 DML 에서만 떼어 낸다. DDL·트랜잭션 제어문·
 * EXECUTE IMMEDIATE·DB 링크·대체 따옴표 {@code q'…'}·위치 바인드({@code :1})·치환 변수({@code &x}) 는 거절한다.
 * 거절 메시지에는 문장 원문을 넣지 않는다(실행 기록 MSG 로 가므로).
 */
public final class QueryStatementGuard {

    public static final int MAX_LENGTH = 20_000;

    public record Checked(String sql, boolean procedure, List<String> variables) {}

    private static final Pattern FIRST_DML = Pattern.compile("^(INSERT|UPDATE|DELETE|MERGE)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PROC_BLOCK = Pattern.compile(
            "^BEGIN\\s+[A-Z][A-Z0-9_$#]*(\\.[A-Z][A-Z0-9_$#]*){0,2}\\s*(\\([^;]*\\))?\\s*;\\s*END\\s*;?$", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern FORBIDDEN = Pattern.compile(
            "\\b(COMMIT|ROLLBACK|SAVEPOINT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|EXECUTE|DBMS_SQL|DBMS_SCHEDULER|DBMS_JOB|UTL_FILE|UTL_HTTP|UTL_TCP|UTL_SMTP|UTL_MAIL)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DB_LINK = Pattern.compile("[A-Za-z0-9_$#]\\s*@\\s*[A-Za-z]");
    private static final Pattern ALT_QUOTE = Pattern.compile("(?<![A-Za-z0-9_$#])[qQ]\\s*'");
    private static final Pattern POSITIONAL = Pattern.compile("(?<![:\\w]):\\d");
    private static final Pattern SUBSTITUTION = Pattern.compile("&\\s*[A-Za-z0-9_]");
    private static final Pattern VARIABLE = Pattern.compile("(?<![:\\w]):([A-Za-z][A-Za-z0-9_]*)");

    private QueryStatementGuard() {}

    public static Checked check(String sql) {
        if (sql == null || sql.isBlank()) throw bad("쿼리 문장이 비어 있습니다");
        if (sql.length() > MAX_LENGTH) throw bad("쿼리 문장은 " + MAX_LENGTH + "자까지입니다");
        if (ALT_QUOTE.matcher(sql).find()) throw bad("대체 따옴표 q'…' 는 쓸 수 없습니다");
        String masked = mask(sql);
        int semi = trailingSemicolon(masked);
        boolean procedure = masked.stripLeading().regionMatches(true, 0, "BEGIN", 0, 5);
        String executable;
        if (procedure) {
            if (!PROC_BLOCK.matcher(masked.strip()).matches()) throw bad("프로시저 호출 하나(BEGIN 프로시저(…); END;)만 쓸 수 있습니다");
            executable = sql.strip();
        } else {
            String body = semi >= 0 ? masked.substring(0, semi) + " " + masked.substring(semi + 1) : masked;
            if (body.indexOf(';') >= 0) throw bad("한 문장만 쓸 수 있습니다");
            if (!FIRST_DML.matcher(body.strip()).find()) throw bad("INSERT·UPDATE·DELETE·MERGE 한 문장이나 프로시저 호출만 쓸 수 있습니다");
            executable = (semi >= 0 ? sql.substring(0, semi) + sql.substring(semi + 1) : sql).strip();
        }
        Matcher forbidden = FORBIDDEN.matcher(masked);
        if (forbidden.find()) throw bad("쓸 수 없는 낱말이 있습니다: " + forbidden.group(1).toUpperCase(java.util.Locale.ROOT));
        if (DB_LINK.matcher(masked).find()) throw bad("DB 링크는 쓸 수 없습니다");
        if (POSITIONAL.matcher(masked).find()) throw bad("위치 바인드(:1)는 쓸 수 없습니다 — :이름 으로 쓰세요");
        if (SUBSTITUTION.matcher(masked).find()) throw bad("치환 변수(&이름)는 쓸 수 없습니다");
        Set<String> names = new LinkedHashSet<>();
        Matcher v = VARIABLE.matcher(masked);
        while (v.find()) names.add(v.group(1));
        return new Checked(executable, procedure, new ArrayList<>(names));
    }

    /** 가린 사본에서 「뒤에 공백뿐인 마지막 ;」 의 위치. 없으면 -1. */
    private static int trailingSemicolon(String masked) {
        int i = masked.lastIndexOf(';');
        return i >= 0 && masked.substring(i + 1).isBlank() ? i : -1;
    }

    /** 주석·문자열 리터럴·따옴표 식별자를 같은 길이의 공백으로 바꾼 사본(글자 위치가 원문과 같다). */
    static String mask(String sql) {
        StringBuilder out = new StringBuilder(sql.length());
        int i = 0;
        int n = sql.length();
        while (i < n) {
            char c = sql.charAt(i);
            if (c == '\'' || c == '"') {
                i = skipQuoted(sql, i, c, out);
            } else if (c == '-' && i + 1 < n && sql.charAt(i + 1) == '-') {
                while (i < n && sql.charAt(i) != '\n') {
                    out.append(' ');
                    i++;
                }
            } else if (c == '/' && i + 1 < n && sql.charAt(i + 1) == '*') {
                int close = sql.indexOf("*/", i + 2);
                if (close < 0) throw bad("닫히지 않은 주석이 있습니다");
                for (int k = i; k < close + 2; k++) out.append(sql.charAt(k) == '\n' ? '\n' : ' ');
                i = close + 2;
            } else {
                out.append(c);
                i++;
            }
        }
        return out.toString();
    }

    private static int skipQuoted(String sql, int start, char quote, StringBuilder out) {
        int n = sql.length();
        int i = start + 1;
        while (i < n) {
            if (sql.charAt(i) == quote) {
                if (i + 1 < n && sql.charAt(i + 1) == quote) {   // '' 는 따옴표 문자
                    i += 2;
                    continue;
                }
                for (int k = start; k <= i; k++) out.append(' ');
                return i + 1;
            }
            i++;
        }
        throw bad("닫히지 않은 따옴표가 있습니다");
    }

    private static IllegalArgumentException bad(String message) {
        return new IllegalArgumentException(message);
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.builtin;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.sql.Types;

/** 작업 변수 값을 JDBC 바인드 값으로 — 형(NUMBER·DATE·JSON·STRING)을 따른다. 날짜 글자는 {@code java.sql.Date}/{@code Timestamp} 로 바꿔 NLS 설정에 기대지 않는다. */
public final class JobBind {

    private static final ObjectMapper JSON = new ObjectMapper();

    public record Bound(Object value, int sqlType) {}

    private JobBind() {}

    public static Bound of(Object value, String type) {
        String t = type == null ? "STRING" : type;
        if (value == null) return new Bound(null, "DATE".equals(t) ? Types.TIMESTAMP : "NUMBER".equals(t) ? Types.NUMERIC : Types.VARCHAR);
        switch (t) {
            case "NUMBER":
                return new Bound(value instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(value)), Types.NUMERIC);
            case "DATE": {
                String s = String.valueOf(value);
                return s.length() <= 10 ? new Bound(java.sql.Date.valueOf(s), Types.DATE) : new Bound(Timestamp.valueOf(s.replace('T', ' ')), Types.TIMESTAMP);
            }
            case "JSON":
                try {
                    return new Bound(value instanceof String s ? s : JSON.writeValueAsString(value), Types.VARCHAR);
                } catch (JsonProcessingException e) {
                    throw new IllegalArgumentException("JSON 변수를 글자로 바꿀 수 없습니다");
                }
            default:
                return new Bound(String.valueOf(value), Types.VARCHAR);
        }
    }
}
```

- [ ] **Step 4: 통과를 확인한다** — Step 2 명령 → PASS

- [ ] **Step 5: 수집 원천을 옮기고 위젯 collect 를 지운다 (계획 D2 — 한 커밋 안에서 끝낸다)**

옮기기 전 기준을 기록한다: `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*Collect*' --tests '*WidgetData*' --tests '*CommWidgetMng*'` 의 통과 수를 적어 둔다.

```bash
cd src/backend/mcm-core/src
W=main/java/com/dongkuk/dmes/mcm/widget/collect
J=main/java/com/dongkuk/dmes/mcm/job/builtin/collect
mkdir -p $J test/java/com/dongkuk/dmes/mcm/job/builtin/collect
for f in CollectConfig CollectConfigs CollectException CollectItem CollectSource SqlCollectSource HttpCollectSource ExchangeCollectSource; do /usr/bin/git mv $W/$f.java $J/$f.java; done
/usr/bin/git mv test/java/com/dongkuk/dmes/mcm/widget/collect/CollectConfigsTest.java test/java/com/dongkuk/dmes/mcm/job/builtin/collect/CollectConfigsTest.java
/usr/bin/git mv test/java/com/dongkuk/dmes/mcm/widget/collect/CollectSourcesTest.java test/java/com/dongkuk/dmes/mcm/job/builtin/collect/CollectSourcesTest.java
/usr/bin/git rm $W/WidgetCollector.java $W/WidgetCollectWriter.java $W/WidgetCollectReader.java $W/WidgetCollectConfig.java $W/WidgetCollectProperties.java
/usr/bin/git rm -r $W/entity $W/repository
/usr/bin/git rm test/java/com/dongkuk/dmes/mcm/widget/collect/WidgetCollectorJpaTest.java test/java/com/dongkuk/dmes/mcm/widget/admin/service/WidgetDefConfigRulesCollectTest.java
```

TB_MCM_WIDGET_COLLECT_RUN·_DATA 표는 그대로 둔다(V1 에 있다, DROP 하지 않음).

**옮긴 8개 파일 편집** (패키지 선언을 모두 `com.dongkuk.dmes.mcm.job.builtin.collect` 로):

1. `CollectConfig.java` — 전체를 아래로 바꾼다(일정·표시 설정 삭제).

```java
package com.dongkuk.dmes.mcm.job.builtin.collect;

import java.net.URI;
import java.util.List;

/**
 * COLLECT 작업의 CONFIG_JSON — {@code {source:{…}, save:true}}(설계 §5.1). 원천 3종: sql·http·exchange. {@code save=false} 면 읽기만 한다(외부 트리거용).
 * 파싱·검사는 {@link CollectConfigs#parse}.
 */
public record CollectConfig(Source source, boolean save) {

    public sealed interface Source permits SqlSource, HttpSource, ExchangeSource {}

    /** SQL 원천 — keyField 가 없으면 첫 행의 valueField 값 하나(키 VALUE). */
    public record SqlSource(String sql, String valueField, String keyField) implements Source {}

    /** HTTP JSON 원천 — items 마다 응답 JSON 안 위치(path)의 값을 항목 key 로 저장. */
    public record HttpSource(URI url, List<HttpItem> items) implements Source {}

    /** path 는 {@code data.items[0].price} 를 풀어 낸 조각(글자=키, 정수=배열 첨자), pathText 는 원문. */
    public record HttpItem(String key, String pathText, List<Object> path) {}

    /** 환율 원천 — 기준 통화 KRW 에 대한 각 통화의 오늘 값. MCM 모듈 작업에서만 쓴다(계획 D7). */
    public record ExchangeSource(List<String> currencies) implements Source {}
}
```

2. `CollectConfigs.java` — 상수(`EVERY_MIN_ALLOWED`·`AT_MAX`·`EXCHANGE_EVERY_MIN_MIN`·`DAYS_DEFAULT`·`DAYS_MAX`·`UNIT_MAX`)·`AT` 패턴·`parseSchedule` 과 일정 관련 import(`Mode`·`Schedule`·`LocalTime`)를 지우고, `parse(String)`·`parse(JsonNode)`·`check` 를 아래로 바꾼다. `parseSource` 는 `public static` 으로 올린다. 나머지(`parseSql`·`parseHttp`·`parseUrl`·`parsePath`·`parseExchange`·도우미·`KEY_MAX` 등 상수)는 그대로다.

```java
    /** 저장된 CONFIG_JSON 글자를 읽어 검사한다. */
    public static CollectConfig parse(String configJson) {
        if (configJson == null || configJson.isBlank()) throw invalid("수집 설정이 없습니다.");
        try {
            return parse(JSON.readTree(configJson));
        } catch (JsonProcessingException e) {
            throw invalid("수집 설정(CONFIG_JSON)이 올바른 JSON 이 아닙니다.");
        }
    }

    public static CollectConfig parse(JsonNode config) {
        if (config == null || !config.isObject()) throw invalid("수집 설정은 JSON 객체여야 합니다.");
        Source source = parseSource(config.get("source"));
        JsonNode save = config.get("save");
        if (save != null && !save.isNull() && !save.isBoolean()) throw invalid("저장 여부(save)는 true 또는 false 여야 합니다.");
        return new CollectConfig(source, save == null || save.isNull() || save.asBoolean());
    }

    /**
     * 저장 검사 — {@link #parse(JsonNode)} + SQL 원천은 {@code validateSql}(사용자 변수 거절 포함), HTTP 원천은 호스트 허용 여부,
     * 환율 원천은 MCM 모듈 작업에서만(계획 D7). hostAllowed 가 null 이면 호스트 허용 목록은 저장 때 보지 않는다(실행 때마다 거절한다).
     */
    public static CollectConfig check(JsonNode config, String moduleCd, Consumer<String> validateSql, Predicate<String> hostAllowed) {
        CollectConfig parsed = parse(config);
        if (parsed.source() instanceof SqlSource sql) {
            validateSql.accept(sql.sql());
        } else if (parsed.source() instanceof HttpSource http && hostAllowed != null && !hostAllowed.test(http.url().getHost())) {
            throw invalid("이 호스트는 수집 허용 목록(dmes.job.http.allowed-hosts)에 없습니다: " + http.url().getHost());
        } else if (parsed.source() instanceof ExchangeSource && !"MCM".equalsIgnoreCase(moduleCd)) {
            throw invalid("환율 수집은 MCM 모듈 작업에서만 쓸 수 있습니다.");
        }
        return parsed;
    }
```
   `parseSource` 선언을 `public static Source parseSource(JsonNode node)` 로 바꾼다. 클래스 설명(javadoc)의 「정시 수집」 문구를 「COLLECT 작업 설정」으로 고친다.

3. `CollectSource.java` — `public interface CollectSource<S extends CollectConfig.Source>`.
4. `SqlCollectSource.java` — 전체를 아래로 바꾼다(실행기 대신 모듈마다 `JobCollectSql`, 계획 D7).

```java
package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * SQL 원천 — 그 모듈의 기본 DataSource 를 읽기 전용으로 읽는다({@link JobCollectSql}, 행 상한 50, 쿼리 시간 초과 = min(10초, 남은 시간)).
 * keyField 가 있으면 행마다 항목 하나(키=그 열 값), 없으면 첫 행의 valueField 값 하나를 키 {@code VALUE} 로 저장한다.
 */
public class SqlCollectSource implements CollectSource<CollectConfig.SqlSource> {

    static final int MAX_ITEMS = 50;
    static final String SINGLE_KEY = "VALUE";

    private final JobCollectSql sql;

    public SqlCollectSource(JobCollectSql sql) {
        this.sql = sql;
    }

    @Override
    public List<CollectItem> collect(CollectConfig.SqlSource source, LocalDate today) {
        return collect(source, today, Map.of(), Map.of(), JobCollectSql.MAX_TIMEOUT_SEC);
    }

    /** 작업 변수(바인드 값)와 쿼리 시간 초과(초)를 받는 실행 경로 — {@code jobCollect} 가 쓴다. */
    public List<CollectItem> collect(CollectConfig.SqlSource source, LocalDate today, Map<String, Object> vars, Map<String, String> varTypes,
                                     int timeoutSec) {
        WidgetQueryResult result = sql.run(source.sql(), vars, varTypes, timeoutSec, MAX_ITEMS, today);
        String valueColumn = column(result.columns(), source.valueField());
        if (valueColumn == null) throw new CollectException("쿼리 결과에 값 열이 없습니다: " + shorten(source.valueField()));
        List<CollectItem> items = new ArrayList<>();
        if (source.keyField() == null) {
            if (result.rows().isEmpty()) return items;
            CollectItem item = CollectItem.of(SINGLE_KEY, result.rows().get(0).get(valueColumn));
            if (item != null) items.add(item);
            return items;
        }
        String keyColumn = column(result.columns(), source.keyField());
        if (keyColumn == null) throw new CollectException("쿼리 결과에 항목 열이 없습니다: " + shorten(source.keyField()));
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> row : result.rows()) {
            if (items.size() >= MAX_ITEMS) break;
            Object key = row.get(keyColumn);
            if (key == null || key.toString().isBlank()) continue;
            String k = key.toString().strip();
            if (k.length() > CollectConfigs.KEY_MAX) k = k.substring(0, CollectConfigs.KEY_MAX);
            if (!seen.add(k)) continue; // 같은 키가 둘이면 앞의 것
            CollectItem item = CollectItem.of(k, row.get(valueColumn));
            if (item != null) items.add(item);
        }
        return items;
    }

    /** 결과 열 이름 찾기 — 정확히 같은 것 먼저, 없으면 대소문자 무시(Oracle 은 열 이름이 대문자로 온다). */
    private static String column(List<String> columns, String wanted) {
        for (String c : columns) if (c.equals(wanted)) return c;
        for (String c : columns) if (c.equalsIgnoreCase(wanted)) return c;
        return null;
    }

    private static String shorten(String s) {
        return s.length() <= 30 ? s : s.substring(0, 30) + "…";
    }
}
```

5. `HttpCollectSource.java` — `@Component`·`@Autowired` import 와 어노테이션을 지우고 클래스를 `public class` 로, 필드 `WidgetCollectProperties properties` 를 `Predicate<String> hostAllowed` 로 바꾼다. 생성자 3개와 호스트 검사 한 줄:

```java
    private final Predicate<String> hostAllowed;
    // … (RestClient http, resolver, dnsTimeout 필드는 그대로)

    public HttpCollectSource(Predicate<String> hostAllowed) {
        this(hostAllowed, builder(), HttpCollectSource::resolve, DNS_TIMEOUT);
    }

    /** 시험은 {@code MockRestServiceServer.bindTo(builder)} 로 묶은 빌더와 가짜 이름 풀이를 넘긴다(실제 네트워크 금지). */
    HttpCollectSource(Predicate<String> hostAllowed, RestClient.Builder builder, Function<String, InetAddress[]> resolver) {
        this(hostAllowed, builder, resolver, DNS_TIMEOUT);
    }

    HttpCollectSource(Predicate<String> hostAllowed, RestClient.Builder builder, Function<String, InetAddress[]> resolver, Duration dnsTimeout) {
        this.hostAllowed = hostAllowed;
        this.http = builder.build();
        this.resolver = resolver;
        this.dnsTimeout = dnsTimeout;
    }
```
   `collect` 안의 `if (!properties.isAllowedHost(host)) throw …` 를 `if (host == null || !hostAllowed.test(host)) throw new CollectException("허용 목록에 없는 호스트라 수집하지 않습니다.");` 로 바꾼다. 클래스 설명의 `dmes.widget.collect.allowed-hosts` 를 `dmes.job.http.allowed-hosts` 로 고친다. `import java.util.function.Predicate;` 추가, `WidgetCollectProperties`·`Autowired`·`Component` import 삭제.
6. `ExchangeCollectSource.java` — `@Component`·`@Autowired` 와 import 삭제, `public class`, 첫 생성자를 `public ExchangeCollectSource(WidgetExtProperties, FrankfurterProvider, KoreaEximProvider)` 로(내용은 `this(properties, (ExchangeRateProvider) frankfurter, (ExchangeRateProvider) koreaExim, Clock.system(ZONE))`), 나머지 두 생성자도 `public`, `Clock.system(WidgetCollector.ZONE)` → `Clock.system(ZONE)` 와 상수 `static final java.time.ZoneId ZONE = java.time.ZoneId.of("Asia/Seoul");` 추가. 상수 `MSG_BACKOFF` 는 package-private 그대로(시험이 같은 패키지에서 읽는다).
7. `CollectItem.java`·`CollectException.java` — 패키지 선언만 바꾼다. 저장 위치 설명(`RUN 행(MSG 200자)`)은 「실행 기록 MSG」로 고친다.

**새 클래스 `JobCollectSql` (D7)**

```java
package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.job.builtin.JobBind;
import com.dongkuk.dmes.mcm.widget.query.SqlGuard;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetReadOnlyJdbc;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.support.JdbcUtils;

/**
 * 수집(SQL) 원천의 읽기 전용 실행 — 그 모듈의 기본 DataSource 를 {@link WidgetReadOnlyJdbc}(연결 readOnly·늘 롤백·Oracle {@code SET TRANSACTION READ ONLY})로
 * 읽고 SQL 은 {@link SqlGuard}(한 문장 SELECT·WITH, 금지 낱말·DB 링크 거절)로 검사한다. 위젯 쿼리 실행기({@code WidgetQueryExecutor})는 MCM 에만 있어
 * 쓰지 않는다(계획 D7). 행 상한은 호출자가 정하고(수집 50), 쿼리 시간 초과는 호출자가 min(10초, 남은 시간)으로 준다.
 * 변수: 작업 변수는 {@code :이름} 으로 바인드한다. 위젯 시스템 변수 {@code :today :yesterday :monthStart :now} 는 같은 이름의 작업 변수가 없을 때
 * 예정 날짜 기준으로 채운다. {@code :userId·:deptCd} 는 수집에 사용자가 없어 거절한다. 실패 문구에는 DB 메시지를 넣지 않는다.
 */
public class JobCollectSql {

    public static final int MAX_TIMEOUT_SEC = 10;
    public static final String MSG_LOAD_FAILED = "수집 데이터를 불러오지 못했습니다";
    static final String MSG_USER_VARIABLE = "수집 SQL 에는 사용자 변수(:userId·:deptCd)를 쓸 수 없습니다. 수집에는 사용자가 없습니다";

    private static final Logger log = LoggerFactory.getLogger(JobCollectSql.class);
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final int FETCH_SIZE = 100;

    private final WidgetReadOnlyJdbc readOnlyJdbc;
    private final Prepared prepared;

    public JobCollectSql(DataSource dataSource) {
        this.readOnlyJdbc = new WidgetReadOnlyJdbc(dataSource);
        this.prepared = new Prepared(dataSource);
    }

    /** 저장 검사 — 한 문장 SELECT·WITH, 선언한 작업 변수만, 사용자 변수 거절. 어기면 {@link CollectException}. */
    public void validate(String sql, Set<String> declaredVars) {
        SqlGuard.Validated v;
        try {
            v = SqlGuard.checkDeclared(sql, declaredVars);
        } catch (BusinessException e) {
            throw new CollectException(e.getMessage());
        }
        requireNoUserVariables(v);
    }

    public WidgetQueryResult run(String sql, Map<String, Object> vars, Map<String, String> varTypes, int timeoutSec, int maxRows, LocalDate today) {
        SqlGuard.Validated v;
        try {
            v = SqlGuard.checkDeclared(sql, vars.keySet());
        } catch (BusinessException e) {
            throw new CollectException(e.getMessage());   // 검사 문구 — DB 메시지가 아니다
        }
        requireNoUserVariables(v);
        MapSqlParameterSource params = new MapSqlParameterSource();
        for (String name : v.userVariables()) bind(params, name, vars.get(name), varTypes.get(name));
        for (String name : v.variables()) {
            if (vars.containsKey(name)) bind(params, name, vars.get(name), varTypes.get(name));
            else params.addValue(name, systemValue(name, today), "now".equals(name) ? java.sql.Types.TIMESTAMP : java.sql.Types.VARCHAR);
        }
        int timeout = Math.max(1, Math.min(MAX_TIMEOUT_SEC, timeoutSec));
        try {
            return readOnlyJdbc.execute(con -> {
                PreparedStatementCreator creator = prepared.creator(v.sql(), params);
                try (PreparedStatement ps = creator.createPreparedStatement(con)) {
                    ps.setMaxRows(maxRows + 1);
                    ps.setQueryTimeout(timeout);
                    ps.setFetchSize(Math.min(FETCH_SIZE, maxRows + 1));
                    try (ResultSet rs = ps.executeQuery()) {
                        return extract(rs, maxRows);
                    }
                }
            });
        } catch (SQLException | RuntimeException e) {
            log.warn("수집 쿼리 실행 실패 원인={}", e.getClass().getSimpleName());   // DB 메시지는 남기지 않는다
            if (e instanceof java.sql.SQLTimeoutException || e instanceof org.springframework.dao.QueryTimeoutException
                    || (e instanceof SQLException se && se.getErrorCode() == 1013)) {
                // FAIL 이 아니라 TIMEOUT 으로 기록되도록 쿼리 시간 초과 예외를 원인과 함께 올린다(진입점이 원인 사슬로 판정한다)
                throw new org.springframework.dao.QueryTimeoutException("수집 쿼리가 제한 시간을 넘었습니다", e);
            }
            throw new CollectException(MSG_LOAD_FAILED);
        }
    }

    private static void requireNoUserVariables(SqlGuard.Validated v) {
        for (String name : v.variables()) {
            if ("userId".equals(name) || "deptCd".equals(name)) throw new CollectException(MSG_USER_VARIABLE);
        }
    }

    private static void bind(MapSqlParameterSource params, String name, Object value, String type) {
        JobBind.Bound b = JobBind.of(value, type);
        params.addValue(name, b.value(), b.sqlType());
    }

    private static Object systemValue(String name, LocalDate today) {
        return switch (name) {
            case "today" -> YMD.format(today);
            case "yesterday" -> YMD.format(today.minusDays(1));
            case "monthStart" -> YMD.format(today.withDayOfMonth(1));
            case "now" -> Timestamp.valueOf(LocalDateTime.now(ZONE));
            default -> throw new CollectException("알 수 없는 변수입니다: :" + name);
        };
    }

    private static WidgetQueryResult extract(ResultSet rs, int maxRows) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int count = md.getColumnCount();
        List<String> columns = new ArrayList<>(count);
        Set<String> seen = new HashSet<>();
        for (int i = 1; i <= count; i++) {
            String label = JdbcUtils.lookupColumnName(md, i);
            if (label == null || label.isBlank()) label = "COL" + i;
            String unique = label;
            for (int k = 2; !seen.add(unique); k++) unique = label + "_" + k;
            columns.add(unique);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        boolean truncated = false;
        while (rs.next()) {
            if (rows.size() >= maxRows) {
                truncated = true;
                break;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= count; i++) row.put(columns.get(i - 1), value(rs, i));
            rows.add(Collections.unmodifiableMap(row));
        }
        return new WidgetQueryResult(List.copyOf(columns), List.copyOf(rows), truncated);
    }

    private static Object value(ResultSet rs, int index) throws SQLException {
        Object v = JdbcUtils.getResultSetValue(rs, index);   // CLOB 은 글자로
        if (v instanceof Timestamp ts) return ts.toLocalDateTime().toString();
        if (v instanceof byte[]) return null;
        return v;
    }

    /** NamedParameterJdbcTemplate 의 이름 붙은 변수 처리를 빌려 문장을 만든다(연결은 읽기 전용 범위가 준 것을 쓴다). */
    private static final class Prepared extends NamedParameterJdbcTemplate {
        Prepared(DataSource dataSource) {
            super(dataSource);
        }

        PreparedStatementCreator creator(String sql, SqlParameterSource params) {
            return getPreparedStatementCreator(sql, params);
        }
    }
}
```

`WidgetQueryResult` 는 `(List<String> columns, List<Map<String,Object>> rows, boolean truncated)` record(기존)이다. `SqlGuard` 가 참조하는 `BusinessException` 은 `com.dongkuk.dmes.mcm.common.exception.BusinessException` 이다.

**새 클래스 `JobCollectHosts`**

```java
package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.dongkuk.dmes.mcm.job.JobProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

/** COLLECT(http) 원천의 허용 호스트 — 새 키 {@code dmes.job.http.allowed-hosts} 와 옛 키 {@code dmes.widget.collect.allowed-hosts}(있으면 warn 과 함께 함께 읽는다). */
public final class JobCollectHosts {

    private static final Logger log = LoggerFactory.getLogger(JobCollectHosts.class);
    static final String LEGACY_KEY = "dmes.widget.collect.allowed-hosts";

    private JobCollectHosts() {}

    public static List<String> resolve(JobProperties props, Environment env) {
        List<String> all = new ArrayList<>(props.getHttp().getAllowedHosts());
        List<String> legacy = Binder.get(env).bind(LEGACY_KEY, Bindable.listOf(String.class)).orElse(List.of());
        if (!legacy.isEmpty()) {
            log.warn("{} 는 dmes.job.http.allowed-hosts 로 옮기세요 — 지금은 두 키를 함께 읽습니다", LEGACY_KEY);
            all.addAll(legacy);
        }
        return List.copyOf(all);
    }

    /** 정확 일치(대소문자 무시, 포트 제외한 호스트). 목록이 비면 모두 거절. */
    public static Predicate<String> matcher(List<String> allowed) {
        return host -> {
            if (host == null || host.isBlank()) return false;
            String h = host.strip().toLowerCase(Locale.ROOT);
            for (String a : allowed) {
                if (a != null && a.strip().toLowerCase(Locale.ROOT).equals(h)) return true;
            }
            return false;
        };
    }
}
```

**위젯 쪽 정리 (같은 커밋)**
- `WidgetDataService`: 필드·생성자 인자 `WidgetCollectReader collectReader` 와 `readIfCollect` 분기(주석 포함 3줄), 클래스 설명의 collect 문장을 지운다. 생성자는 `public WidgetDataService(WidgetQueryRunner queryRunner)`.
- `WidgetDefConfigRules`: `import …collect.CollectConfig/CollectConfigs`, `case CollectConfig.TYPE_ID -> …` 두 줄, 그리고 호스트 허용 판정 인자가 있는 5인자 `check(…, Predicate<String> hostAllowed)` 오버로드를 지운다(4인자만 남는다). 지원하지 않는 유형(`collect` 포함)은 기존 `default` 분기가 「지원하지 않는 위젯 유형입니다」로 거절하는지 코드로 확인하고(`switch` 끝의 `default -> {` 안), 거절하지 않으면 거절을 더한다.
- `CommWidgetMngService`: 필드·생성자 인자 `WidgetCollectProperties collectProperties` 와 `import` 를 지우고 `WidgetDefConfigRules.check(typeId, request.getDataSrc(), configJson, queryRunner)` 로 바꾼다.
- 시험: `WidgetDataServiceTest`·`CommWidgetMngServiceTest` 의 생성자 호출과 collect 를 다루는 시험 메서드를 지운다. `grep -n -i "collect" src/test/java/com/dongkuk/dmes/mcm/widget/data/WidgetDataServiceTest.java src/test/java/com/dongkuk/dmes/mcm/widget/admin/CommWidgetMngServiceTest.java` 로 찾는다. 남는 시험은 collect 가 없어도 같은 단언이어야 한다.
- `widget/query/WidgetQueryRunner.runCollect`·`validateCollectSql` 는 호출자가 없어졌지만 이 레인에서는 **그대로 둔다**(`widget/query` 는 동작 변경 없음 — 후속 정리 대상으로 최종 보고에 적는다).

**옮긴 시험 편집**
- `CollectConfigsTest` — 전체를 아래 새 시험으로 바꾼다(일정·표시 설정 시험은 사라졌다).

```java
package com.dongkuk.dmes.mcm.job.builtin.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.ExchangeSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.HttpSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.SqlSource;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** COLLECT 작업 설정 파싱·검사(설계 §5.1·§5.4) — 원천 3종·저장 여부·경로 문법. */
class CollectConfigsTest {

    private static final ObjectMapper OM = new ObjectMapper();
    private static final String SQL_SOURCE = "\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1 AS V FROM T\",\"valueField\":\"V\"}";
    private static final String HTTP_SOURCE = "\"source\":{\"kind\":\"http\",\"url\":\"https://api.example.com/q?s=1\",\"items\":[{\"key\":\"price\",\"path\":\"data.items[0].price\"}]}";
    private static final String EXCHANGE_SOURCE = "\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\",\"JPY\"]}";

    private static CollectConfig parse(String json) {
        return CollectConfigs.parse(json);
    }

    private static void assertRejected(String json, String messagePart) {
        assertThatThrownBy(() -> parse(json)).isInstanceOf(BusinessException.class).hasMessageContaining(messagePart);
    }

    @Test
    @DisplayName("세 원천의 정상 설정 — save 기본 true, 알 수 없는 키는 무시")
    void validConfigs() {
        CollectConfig sql = parse("{" + SQL_SOURCE.replace("\"valueField\":\"V\"", "\"valueField\":\"V\",\"keyField\":\"K\"") + ",\"extra\":1}");
        assertThat(sql.save()).isTrue();
        assertThat(sql.source()).isEqualTo(new SqlSource("SELECT 1 AS V FROM T", "V", "K"));

        CollectConfig http = parse("{" + HTTP_SOURCE + ",\"save\":false}");
        assertThat(http.save()).isFalse();
        HttpSource h = (HttpSource) http.source();
        assertThat(h.url().getHost()).isEqualTo("api.example.com");
        assertThat(h.items().get(0).path()).containsExactly("data", "items", 0, "price");

        assertThat(parse("{" + EXCHANGE_SOURCE + "}").source()).isEqualTo(new ExchangeSource(List.of("USD", "JPY")));
    }

    @Test
    @DisplayName("설정 전체·원천 모양 위반")
    void shapeRejected() {
        assertRejected("[]", "JSON 객체");
        assertRejected("not json", "올바른 JSON");
        assertRejected(" ", "수집 설정이 없습니다");
        assertRejected("{}", "수집 원천");
        assertRejected("{\"source\":{\"kind\":\"ftp\"}}", "sql·http·exchange");
        assertRejected("{" + SQL_SOURCE + ",\"save\":\"yes\"}", "save");
        assertRejected("{\"source\":{\"kind\":\"sql\",\"sql\":\"\",\"valueField\":\"V\"}}", "수집 SQL");
        assertRejected("{\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1 FROM T\"}}", "값 열");
        assertRejected("{\"source\":{\"kind\":\"exchange\",\"currencies\":[]}}", "통화");
        assertRejected("{\"source\":{\"kind\":\"exchange\",\"currencies\":[\"usd\"]}}", "영문 대문자 3자리");
        assertRejected("{\"source\":{\"kind\":\"exchange\",\"currencies\":[\"KRW\"]}}", "KRW");
        assertRejected("{\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\",\"USD\"]}}", "겹칩니다");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ftp://x/y", "https://user:pw@api.example.com/x", "/relative", "https:///nohost"})
    @DisplayName("http 주소: 절대 http(s)·호스트 있음·사용자 정보 없음")
    void badUrls(String url) {
        assertRejected("{\"source\":{\"kind\":\"http\",\"url\":\"" + url + "\",\"items\":[{\"key\":\"k\",\"path\":\"a\"}]}}", "수집 주소");
    }

    @Test
    @DisplayName("응답 경로 문법 — 점·대괄호만, 최대 20 조각")
    void paths() {
        assertThat(CollectConfigs.parsePath("k", "a.b[0].c")).containsExactly("a", "b", 0, "c");
        for (String bad : List.of("", "a..b", ".a", "a.", "a[b]", "a[0]b", "a[]", "a[10000]", "a b")) {
            assertThatThrownBy(() -> CollectConfigs.parsePath("k", bad)).as(bad).isInstanceOf(BusinessException.class);
        }
        List<String> deep = new ArrayList<>();
        for (int i = 0; i < 21; i++) deep.add("p" + i);
        assertThatThrownBy(() -> CollectConfigs.parsePath("k", String.join(".", deep))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("저장 검사 — sql 은 검사기를 부르고, http 는 허용 호스트, exchange 는 MCM 모듈만")
    void check() throws Exception {
        List<String> seen = new ArrayList<>();
        CollectConfigs.check(OM.readTree("{" + SQL_SOURCE + "}"), "MDM", seen::add, null);
        assertThat(seen).containsExactly("SELECT 1 AS V FROM T");

        var http = OM.readTree("{" + HTTP_SOURCE + "}");
        CollectConfigs.check(http, "MDM", s -> { throw new AssertionError("sql 검사는 http 에서 부르지 않는다"); }, null);
        CollectConfigs.check(http, "MDM", s -> { }, host -> host.equalsIgnoreCase("api.example.com"));
        assertThatThrownBy(() -> CollectConfigs.check(http, "MDM", s -> { }, host -> false)).isInstanceOf(BusinessException.class).hasMessageContaining("허용 목록");

        var exchange = OM.readTree("{" + EXCHANGE_SOURCE + "}");
        CollectConfigs.check(exchange, "MCM", s -> { throw new AssertionError(); }, host -> false);
        assertThatThrownBy(() -> CollectConfigs.check(exchange, "MDM", s -> { }, null)).isInstanceOf(BusinessException.class).hasMessageContaining("MCM");
    }
}
```

- `CollectSourcesTest` — 패키지 선언을 새 패키지로 바꾸고 아래만 고친다(나머지 HTTP·환율 시험은 그대로 통과해야 한다).
  1. import: `WidgetQueryDataSource`·`WidgetQueryExecutor`·`WidgetDefRepository`·`WidgetUserContextResolver`·`BusinessException`·`mock` 삭제, `java.util.Set` 추가.
  2. `Sql` 중첩: 필드 `WidgetQueryExecutor executor` 를 `JobCollectSql sqlGuard` 로, `setUp` 끝 두 줄을 `sqlGuard = new JobCollectSql(dataSource); source = new SqlCollectSource(sqlGuard);` 로 바꾼다.
  3. `columnsAndVariables`: `executor.validateCollectSql(…)` 두 줄을 `assertThatThrownBy(() -> sqlGuard.validate("SELECT CNT FROM T_C4_MACHINE WHERE LINE = :userId", Set.of())).isInstanceOf(CollectException.class);` 와 `sqlGuard.validate("SELECT CNT FROM T_C4_MACHINE WHERE D = TO_DATE(:today, 'YYYYMMDD') AND :now IS NOT NULL", Set.of());` 로 바꾼다.
  4. `guardAndDbErrors`: `.hasMessage("위젯 데이터를 불러오지 못했습니다")` → `.hasMessage(JobCollectSql.MSG_LOAD_FAILED)`.
  5. `Http` 중첩: `private final WidgetCollectProperties props …` 를 `private final List<String> allowedHosts = new ArrayList<>();` 로, `props.setAllowedHosts(List.of("api.example.com", "Quote.Example.com"));` 를 `allowedHosts.addAll(List.of("api.example.com", "Quote.Example.com"));` 로, `new HttpCollectSource(props, builder, …)` 두 곳(86행·299행 근처)을 `new HttpCollectSource(JobCollectHosts.matcher(allowedHosts), builder, …)` 로, `props.setAllowedHosts(List.of());` 를 `allowedHosts.clear();` 로 바꾼다(matcher 는 목록을 참조로 읽도록 `JobCollectHosts.matcher` 가 받은 리스트를 복사하지 않는다 — 위 구현은 그대로 참조한다).
  6. 클래스 설명의 「정시 수집」 → 「COLLECT 작업」.

- [ ] **Step 6: 내장 서비스 몸체를 구현한다** (모두 `@Transactional` 등 프록시 어노테이션 없음, 첫 줄 `JobRunScope.require()` — D23)

```java
package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.cactus.job.JobRunScope;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.oasis.exceptions.UserException;
import com.dongkuk.oasis.methodinvoker.annotations.OptionalParam;
import java.util.LinkedHashMap;
import java.util.Map;

/** 내장 서비스 {@code jobCode}(설계 §5.1) — 등록된 {@link ScheduledJob} 빈 하나를 실행한다. 예약 실행 범위가 없으면(웹 호출 등) 거절한다. */
public class JobCodeService {

    private final JobHandlerRegistry registry;

    public JobCodeService(JobHandlerRegistry registry) {
        this.registry = registry;
    }

    public Map<String, Object> run(@OptionalParam String handlerId) {
        JobRunScope scope = JobRunScope.require();
        String id = handlerId != null && !handlerId.isBlank() ? handlerId : String.valueOf(scope.config().get("handlerId"));
        ScheduledJob job = registry.find(id).orElseThrow(() -> new UserException("처리기를 찾을 수 없습니다: " + id));
        int n = job.run(new JobContext(scope.jobId(), scope.runId(), scope.vars(), scope.schedAt(), scope.manual()));
        scope.addItems(n);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("itemCnt", n);
        return out;
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.cactus.job.JobRunScope;
import com.dongkuk.oasis.exceptions.UserException;
import com.dongkuk.oasis.methodinvoker.annotations.OptionalParam;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * 내장 서비스 {@code jobQuery}(설계 §5.1·§4.4 D31) — 그 모듈 기본 DataSource 에서 DML 한 문장 또는 프로시저 호출 하나를 서비스 트랜잭션 안에서 실행한다.
 * <b>JDBC 문장마다 쿼리 시간 초과</b>: 이 시도의 마감까지 남은 초를 올림, 최소 1초({@link JobRunScope#queryTimeoutSeconds()}). 초과하면 Oracle 이 ORA-01013 을 던지고
 * 예외를 그대로 올려 서비스 트랜잭션이 롤백되며, 진입점이 TIMEOUT 으로 기록한다. 문장은 실행 때 다시 검사한다({@link QueryStatementGuard}).
 */
public class JobQueryService {

    private final DataSource dataSource;

    public JobQueryService(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public Map<String, Object> run(@OptionalParam String sql) {
        JobRunScope scope = JobRunScope.require();
        String text = sql != null && !sql.isBlank() ? sql : (scope.config().get("sql") == null ? null : String.valueOf(scope.config().get("sql")));
        QueryStatementGuard.Checked checked;
        try {
            checked = QueryStatementGuard.check(text);
        } catch (IllegalArgumentException e) {
            throw new UserException(e.getMessage());
        }
        MapSqlParameterSource params = new MapSqlParameterSource();
        for (String name : checked.variables()) {
            if (!scope.vars().containsKey(name)) throw new UserException("변수 :" + name + " 의 값이 없습니다");
            JobBind.Bound b = JobBind.of(scope.vars().get(name), scope.varTypes().get(name));
            params.addValue(name, b.value(), b.sqlType());
        }
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(scope.queryTimeoutSeconds());
        int updated = new NamedParameterJdbcTemplate(jdbc).update(checked.sql(), params);
        int items = checked.procedure() ? 0 : updated;
        scope.addItems(items);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("itemCnt", items);
        return out;
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.cactus.job.CollectedValue;
import com.dongkuk.dmes.cactus.job.JobRunScope;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfigs;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectException;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectItem;
import com.dongkuk.dmes.mcm.job.builtin.collect.ExchangeCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.oasis.exceptions.UserException;
import com.dongkuk.oasis.methodinvoker.annotations.OptionalParam;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 내장 서비스 {@code jobCollect}(설계 §5.1·§5.4) — 원천(sql·http·exchange)에서 값을 읽어 {@link JobRunScope} 에 담는다. 저장은 진입점이 결과 갱신과
 * 같은 트랜잭션에서 한다({@code save:false} 면 읽기만 — 외부 트리거용). 수집 실패 문구는 주소·DB 메시지를 담지 않게 만들어져 있어 {@link UserException}
 * 으로 바꿔 실행 기록 MSG 에 남긴다. SQL 쿼리 시간 초과 = min(10초, 남은 시간). 환율은 MCM 모듈 작업만(그 빈이 있는 앱).
 */
public class JobCollectService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SqlCollectSource sqlSource;
    private final HttpCollectSource httpSource;
    private final Supplier<ExchangeCollectSource> exchangeSource;

    public JobCollectService(SqlCollectSource sqlSource, HttpCollectSource httpSource, Supplier<ExchangeCollectSource> exchangeSource) {
        this.sqlSource = sqlSource;
        this.httpSource = httpSource;
        this.exchangeSource = exchangeSource;
    }

    public Map<String, Object> run(@OptionalParam Map<String, Object> source, @OptionalParam Boolean save) {
        JobRunScope scope = JobRunScope.require();
        Object rawSource = source != null ? source : scope.config().get("source");
        boolean doSave = save != null ? save : !Boolean.FALSE.equals(scope.config().get("save"));
        List<CollectItem> items;
        try {
            CollectConfig.Source parsed = CollectConfigs.parseSource(JSON.<JsonNode>valueToTree(rawSource));   // 실행 때 다시 검사
            LocalDate today = scope.schedAt().toLocalDate();
            items = switch (parsed) {
                case CollectConfig.SqlSource s -> sqlSource.collect(s, today, scope.vars(), scope.varTypes(), scope.queryTimeoutSeconds());
                case CollectConfig.HttpSource h -> httpSource.collect(h, today);
                case CollectConfig.ExchangeSource e -> {
                    ExchangeCollectSource ex = exchangeSource.get();
                    if (ex == null) throw new CollectException("이 모듈에서는 환율 수집을 쓸 수 없습니다(MCM 모듈 전용).");
                    yield ex.collect(e, today);
                }
            };
            if (items.isEmpty()) throw new CollectException("수집된 값이 없습니다.");
        } catch (CollectException | com.dongkuk.dmes.mcm.common.exception.BusinessException e) {
            throw new UserException(e.getMessage());
        }
        scope.addItems(items.size());
        if (doSave) {
            for (CollectItem item : items) scope.collect(new CollectedValue(item.key(), item.num(), item.txt()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("itemCnt", items.size());
        return out;
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.builtin.collect.ExchangeCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectHosts;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider;
import com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * 내장 서비스 빈(설계 §2 builtin) — 6개 앱이 모두 싣는다. BPMN {@code camunda:class} 의 이름({@code jobCodeService} 등)과 메서드 이름이 같다.
 * 환율 원천은 제공자 빈이 있는 앱(MCM)에서만 만들어진다.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "dmes.job.agent", name = "enabled", havingValue = "true", matchIfMissing = true)
public class JobBuiltinConfig {

    @Bean
    public JobCodeService jobCodeService(JobHandlerRegistry registry) {
        return new JobCodeService(registry);
    }

    @Bean
    public JobQueryService jobQueryService(ObjectProvider<DataSource> dataSource) {
        return new JobQueryService(dataSource.getObject());
    }

    @Bean
    public JobCollectSql jobCollectSql(ObjectProvider<DataSource> dataSource) {
        return new JobCollectSql(dataSource.getObject());
    }

    @Bean
    public SqlCollectSource sqlCollectSource(JobCollectSql sql) {
        return new SqlCollectSource(sql);
    }

    @Bean
    public HttpCollectSource httpCollectSource(JobProperties props, Environment env) {
        return new HttpCollectSource(JobCollectHosts.matcher(JobCollectHosts.resolve(props, env)));
    }

    @Bean
    public JobCollectService jobCollectService(SqlCollectSource sql, HttpCollectSource http, ObjectProvider<WidgetExtProperties> ext,
                                               ObjectProvider<FrankfurterProvider> frankfurter, ObjectProvider<KoreaEximProvider> koreaExim) {
        Supplier<ExchangeCollectSource> exchange = new Supplier<>() {
            private volatile ExchangeCollectSource cached;

            @Override
            public ExchangeCollectSource get() {
                ExchangeCollectSource c = cached;
                if (c == null) {
                    WidgetExtProperties p = ext.getIfAvailable();
                    FrankfurterProvider f = frankfurter.getIfAvailable();
                    KoreaEximProvider k = koreaExim.getIfAvailable();
                    if (p == null || f == null || k == null) return null;
                    c = cached = new ExchangeCollectSource(p, f, k);
                }
                return c;
            }
        };
        return new JobCollectService(sql, http, exchange);
    }
}
```

`JobConfig` 의 `@Import` 에 `JobBuiltinConfig.class` 를 더한다. `ObjectProvider<WidgetExtProperties>` 등은 클래스 로딩 때문에 ArchUnit 사이클 시험(`widget.ext` ← `job`)에 영향이 없다(방향이 `job → widget` 한쪽이다).

- [ ] **Step 7: 내장 BPMN 3개를 쓴다** — 서비스 태스크 하나(`camunda:class` = 빈 이름, `method=run`, `output=result`). 파일 이름이 서비스 ID(`jobCode` ↔ `services/job/jobCode.bpmn`)이다.

`src/backend/mcm-core/src/main/resources/services/job/jobQuery.bpmn`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_jobQuery" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="jobQuery" name="예약 작업 내장 서비스 - 쿼리 실행" isExecutable="true">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>flow_start</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="runTask" name="쿼리 실행" camunda:class="jobQueryService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="run" />
          <camunda:property name="output" value="result" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_start</bpmn:incoming>
      <bpmn:outgoing>flow_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="end">
      <bpmn:incoming>flow_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="flow_start" sourceRef="start" targetRef="runTask" />
    <bpmn:sequenceFlow id="flow_end" sourceRef="runTask" targetRef="end" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="jobQuery">
      <bpmndi:BPMNShape id="start_di" bpmnElement="start"><dc:Bounds x="152" y="102" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="runTask_di" bpmnElement="runTask"><dc:Bounds x="250" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="end_di" bpmnElement="end"><dc:Bounds x="412" y="102" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="flow_start_di" bpmnElement="flow_start"><di:waypoint x="188" y="120" /><di:waypoint x="250" y="120" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_end_di" bpmnElement="flow_end"><di:waypoint x="350" y="120" /><di:waypoint x="412" y="120" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```
`jobCode.bpmn` 은 위와 같되 `Definitions_jobCode`·process id `jobCode`·이름 「예약 작업 내장 서비스 - 코드 실행」·태스크 이름 「코드 실행」·`camunda:class="jobCodeService"`·`bpmnElement="jobCode"`, `jobCollect.bpmn` 은 `Definitions_jobCollect`·`jobCollect`·「수집」·`jobCollectService` 로 바꾼 파일이다. 세 파일을 모두 위 모양으로 쓴다(복사한 뒤 이 다섯 값만 바꾼다). 끝나면 `node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .` 가 ERROR 0 이어야 한다.

- [ ] **Step 8: 지원 도구와 통합 시험을 쓴다**

`src/test/java/com/dongkuk/dmes/mcm/job/support/JobOasisTestKit.java` — 실제 `ServiceStarter`(transactional + multi-tx, 서비스 경로 `/services`, 트랜잭션 매니저 `txBiz` = `DataSourceTransactionManager`)와 진입점을 한 번에 만든다.

```java
package com.dongkuk.dmes.mcm.job.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.job.JobRunExecutor;
import com.dongkuk.dmes.cactus.job.JobRunReport;
import com.dongkuk.dmes.cactus.job.JobRunReporter;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.cactus.job.JobRunResultWriter.WriteResult;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.oasis.service.ServiceStarter;
import java.time.Clock;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import javax.sql.DataSource;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

/** 내장 서비스·판정 시험용 조립 — 운영과 같은 OASIS 서비스 기동기 + 예약 실행 진입점 + 보고 기록용 가짜. */
public final class JobOasisTestKit implements AutoCloseable {

    public final GenericApplicationContext ctx = new GenericApplicationContext();
    public final BlockingQueue<JobRunReport> reports = new LinkedBlockingQueue<>();
    public final ServiceStarter starter;
    public final JobRunDispatcher dispatcher;
    private final JobRunExecutor executor;

    public JobOasisTestKit(DataSource dataSource, int poolSize, Consumer<GenericApplicationContext> beans) {
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> new DataSourceTransactionManager(dataSource));
        beans.accept(ctx);
        ctx.refresh();
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        starter = new OasisAutoConfiguration().serviceStarter(props, tx, ctx);
        executor = new JobRunExecutor(poolSize);
        JobRunReporter reporter = r -> {
            reports.add(r);
            return WriteResult.WRITTEN;
        };
        dispatcher = new JobRunDispatcher(starter, ctx, reporter, executor, "test-srv", Clock.systemDefaultZone());
    }

    public static JobRunRequest request(String runId, String jobId, String serviceId, int timeoutSec, Map<String, Object> config,
                                        Map<String, Object> inputs, Map<String, String> varTypes) {
        return new JobRunRequest(runId, jobId, "MCM", serviceId, "run", inputs, varTypes, config, timeoutSec, null, "2026-10-09T02:00:00", false, null);
    }

    /** 접수 → 결과 보고까지 기다린다. */
    public JobRunReport run(JobRunRequest request) throws InterruptedException {
        assertThat(dispatcher.submit(request)).isEqualTo(JobRunDispatcher.SubmitResult.ACCEPTED);
        JobRunReport r = reports.poll(20, TimeUnit.SECONDS);
        assertThat(r).as("결과 보고가 오지 않았다").isNotNull();
        return r;
    }

    public void assertNoMoreReports() throws InterruptedException {
        assertThat(reports.poll(500, TimeUnit.MILLISECONDS)).as("회차마다 결과 갱신은 1회").isNull();
    }

    @Override
    public void close() {
        executor.close();
        ctx.close();
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.builtin;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.annotation.Transactional;

/** 내장 서비스 빈이 OASIS 에서 부르는 빈이라 프록시를 만드는 어노테이션이 없어야 한다(ParameterName must not be null) + BPMN 3개가 클래스패스에 있다. */
class JobBuiltinBeansTest {

    @Test
    @DisplayName("내장 서비스 클래스에 @Transactional·@Async·@Cacheable 이 없다")
    void noProxyAnnotations() {
        for (Class<?> c : List.of(JobCodeService.class, JobQueryService.class, JobCollectService.class)) {
            assertThat(c.isAnnotationPresent(Transactional.class)).as(c.getSimpleName()).isFalse();
            for (Method m : c.getDeclaredMethods()) {
                assertThat(m.isAnnotationPresent(Transactional.class) || m.isAnnotationPresent(Async.class) || m.isAnnotationPresent(Cacheable.class))
                        .as(c.getSimpleName() + "." + m.getName()).isFalse();
            }
        }
    }

    @Test
    @DisplayName("jobCode·jobQuery·jobCollect BPMN 을 서비스 제공자가 찾는다(mcm-core jar 의 services/job/*)")
    void bpmnFilesAreFound() {
        SimpleServiceProvider provider = new SimpleServiceProvider("/services", "bpmn", "^^");
        for (String id : List.of("jobCode", "jobQuery", "jobCollect")) {
            assertThat(provider.service(id)).as(id).isNotNull();
        }
    }
}
```

`JobBuiltinServicesOraTest` — 내장 서비스 몸체 전체를 실제 Oracle 위에서 진입점을 거쳐 시험한다(설계 §9). 시험 표 `T_JOB_Q`·프로시저 `P_JOB_Q_SLOW` 를 MCMAPUSER 에 만들고 끝에서 지운다.

```java
package com.dongkuk.dmes.mcm.oracheck;

import static com.dongkuk.dmes.mcm.job.support.JobOasisTestKit.request;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.job.JobRunReport;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.agent.SimpleScheduledJob;
import com.dongkuk.dmes.mcm.job.builtin.JobCodeService;
import com.dongkuk.dmes.mcm.job.builtin.JobCollectService;
import com.dongkuk.dmes.mcm.job.builtin.JobQueryService;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.dmes.mcm.job.support.JobOasisTestKit;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class JobBuiltinServicesOraTest {

    private static HikariDataSource ds;
    private static JdbcTemplate jdbc;
    private JobOasisTestKit kit;
    private final AtomicReference<com.dongkuk.dmes.mcm.job.agent.JobContext> seenContext = new AtomicReference<>();

    @BeforeAll
    static void tables() {
        McmCoreOraTestDb.ensureMigrated();
        ds = McmCoreOraTestDb.dataSource(McmCoreOraTestDb.APP_USER, "job-builtin");
        jdbc = new JdbcTemplate(ds);
        drop("TABLE T_JOB_Q");
        jdbc.execute("CREATE TABLE T_JOB_Q (ID NUMBER(10), DT DATE, V VARCHAR2(30))");
        jdbc.execute("CREATE OR REPLACE PROCEDURE P_JOB_Q_SLOW(P_ID NUMBER, P_SEC NUMBER) AS BEGIN "
                + "INSERT INTO T_JOB_Q (ID, DT, V) VALUES (P_ID, SYSDATE, 'slow'); DBMS_SESSION.SLEEP(P_SEC); END;");
    }

    @AfterAll
    static void dropTables() {
        try {
            drop("PROCEDURE P_JOB_Q_SLOW");
            drop("TABLE T_JOB_Q");
        } finally {
            ds.close();
        }
    }

    private static void drop(String what) {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP " + what + (what.startsWith("TABLE") ? " PURGE" : "") + "'; EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-942, -4043) THEN RAISE; END IF; END;");
    }

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM T_JOB_Q");
        jdbc.update("INSERT INTO T_JOB_Q VALUES (1, DATE '2026-10-08', 'a')");
        jdbc.update("INSERT INTO T_JOB_Q VALUES (2, DATE '2026-10-09', 'b')");
        jdbc.update("INSERT INTO T_JOB_Q VALUES (3, DATE '2026-10-10', 'c')");
        JobCollectSql collectSql = new JobCollectSql(ds);
        kit = new JobOasisTestKit(ds, 2, ctx -> {
            JobHandlerRegistry registry = new JobHandlerRegistry(JobModule.MCM, List.of(
                    new SimpleScheduledJob("mcm.test", JobModule.MCM, "시험", null, Duration.ofMinutes(1), c -> {
                        seenContext.set(c);
                        return 4;
                    })));
            ctx.registerBean("jobCodeService", JobCodeService.class, () -> new JobCodeService(registry));
            ctx.registerBean("jobQueryService", JobQueryService.class, () -> new JobQueryService(ds));
            ctx.registerBean("jobCollectService", JobCollectService.class,
                    () -> new JobCollectService(new SqlCollectSource(collectSql), new HttpCollectSource(host -> false), () -> null));
        });
    }

    @AfterEach
    void tearDown() {
        kit.close();
    }

    private int count(String where) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM T_JOB_Q WHERE " + where, Integer.class);
    }

    @Test
    @DisplayName("jobQuery — DML 을 실행하고 DATE 변수는 날짜로 바인드된다. 영향 행 수가 건수 (@OptionalParam 이 비면 null 로 들어와 config 를 쓴다)")
    void queryUpdatesWithTypedBinds() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobQuery", 30, Map.of("sql", "UPDATE T_JOB_Q SET V = :tag WHERE DT >= :fromDt"),
                Map.of("tag", "x", "fromDt", "2026-10-09"), Map.of("fromDt", "DATE")));
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(2);
        assertThat(count("V = 'x'")).isEqualTo(2);
    }

    @Test
    @DisplayName("jobQuery — 서비스 입력 sql 이 있으면 config 보다 우선한다(사용자 BPMN 이 내장 서비스를 여러 번 엮는 경우)")
    void queryInputOverridesConfig() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobQuery", 30, Map.of("sql", "UPDATE T_JOB_Q SET V = 'cfg'"),
                Map.of("sql", "UPDATE T_JOB_Q SET V = 'in' WHERE ID = 1"), Map.of()));
        assertThat(r.status()).isEqualTo("OK");
        assertThat(count("V = 'in'")).isEqualTo(1);
        assertThat(count("V = 'cfg'")).isZero();
    }

    @Test
    @DisplayName("jobQuery — 허용되지 않는 문장(DDL)·값 없는 변수는 USER_ERROR 로 실패하고 아무것도 바뀌지 않는다. 메시지에 문장 원문이 없다")
    void queryRejectsBadStatements() throws Exception {
        JobRunReport ddl = kit.run(request("r1", "j1", "jobQuery", 30, Map.of("sql", "DROP TABLE T_JOB_Q"), Map.of(), Map.of()));
        assertThat(ddl.status()).isEqualTo("FAIL");
        assertThat(ddl.msg()).startsWith("USER_ERROR").doesNotContain("T_JOB_Q");
        JobRunReport noVar = kit.run(request("r2", "j2", "jobQuery", 30, Map.of("sql", "UPDATE T_JOB_Q SET V = :missing"), Map.of(), Map.of()));
        assertThat(noVar.status()).isEqualTo("FAIL");
        assertThat(noVar.msg()).contains(":missing");
        assertThat(count("1 = 1")).isEqualTo(3);
    }

    @Test
    @DisplayName("jobQuery — 쿼리 시간 초과(남은 시간 1초, 프로시저가 5초 잔다): ORA-01013 → 서비스 트랜잭션 롤백 → TIMEOUT 정확히 1회(감시와 경합해도)")
    void queryTimeoutRollsBackAndReportsOnce() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobQuery", 1, Map.of("sql", "BEGIN P_JOB_Q_SLOW(:id, :sec); END;"),
                Map.of("id", 99, "sec", 5), Map.of("id", "NUMBER", "sec", "NUMBER")));
        assertThat(r.status()).isEqualTo("TIMEOUT");
        assertThat(count("ID = 99")).as("시간 초과한 시도의 DML 은 남지 않는다").isZero();
        kit.assertNoMoreReports();
    }

    @Test
    @DisplayName("웹 경로처럼 예약 실행 범위 없이 내장 서비스를 부르면 거절 — 서비스 입력으로 SQL 을 줘도 실행되지 않는다")
    void withoutScopeIsRejected() {
        for (String id : List.of("jobQuery", "jobCode", "jobCollect")) {
            DefaultServiceContext sc = new DefaultServiceContext(new com.dongkuk.dmes.cactus.oasis.CactusUnwrappingApplicationContext(kit.ctx),
                    com.dongkuk.dmes.cactus.job.JobServiceInvoker.typed(Map.of("action", "run", "sql", "UPDATE T_JOB_Q SET V = 'hack'",
                            "handlerId", "mcm.test", "source", Map.of("kind", "sql"))));
            ServiceResult result = kit.starter.start(id, sc);
            assertThat(result.serviceResultCode()).as(id).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
            assertThat(result.exception()).as(id).isInstanceOf(com.dongkuk.dmes.cactus.job.JobScopeRequiredException.class);
        }
        assertThat(count("V = 'hack'")).isZero();
    }

    @Test
    @DisplayName("jobCode — 처리기를 실행하고 반환 건수가 이력 건수, 문맥에 변수·예정 시각이 실린다. 없는 처리기는 USER_ERROR")
    void codeRunsHandler() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobCode", 30, Map.of("handlerId", "mcm.test"), Map.of("baseDt", "2026-10-09"), Map.of()));
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(4);
        assertThat(seenContext.get().vars()).containsEntry("baseDt", "2026-10-09");
        assertThat(seenContext.get().jobId()).isEqualTo("j1");
        assertThat(seenContext.get().schedAt().toString()).isEqualTo("2026-10-09T02:00");
        JobRunReport missing = kit.run(request("r2", "j2", "jobCode", 30, Map.of("handlerId", "no.such"), Map.of(), Map.of()));
        assertThat(missing.status()).isEqualTo("FAIL");
        assertThat(missing.msg()).contains("처리기를 찾을 수 없습니다");
    }

    @Test
    @DisplayName("jobCollect(sql) — 값이 범위에 담겨 OK 보고에 실리고, save:false 면 읽기만(건수는 남고 값은 안 실림)")
    void collectSqlSavesOrNot() throws Exception {
        Map<String, Object> source = Map.of("kind", "sql", "sql", "SELECT V, ID FROM T_JOB_Q WHERE DT >= :fromDt ORDER BY ID", "valueField", "ID", "keyField", "V");
        JobRunReport saved = kit.run(request("r1", "j1", "jobCollect", 30, Map.of("source", source), Map.of("fromDt", "2026-10-09"), Map.of("fromDt", "DATE")));
        assertThat(saved.status()).isEqualTo("OK");
        assertThat(saved.itemCnt()).isEqualTo(2);
        assertThat(saved.collected()).extracting(v -> v.key()).containsExactly("b", "c");
        JobRunReport readOnly = kit.run(request("r2", "j2", "jobCollect", 30, Map.of("source", source, "save", false), Map.of("fromDt", "2026-10-09"),
                Map.of("fromDt", "DATE")));
        assertThat(readOnly.status()).isEqualTo("OK");
        assertThat(readOnly.itemCnt()).isEqualTo(2);
        assertThat(readOnly.collected()).isEmpty();
    }

    @Test
    @DisplayName("jobCollect — 허용 안 된 호스트·이 모듈에 없는 환율 원천·빈 결과는 USER_ERROR 문구(주소 없음)로 실패")
    void collectFailuresHaveSafeMessages() throws Exception {
        JobRunReport http = kit.run(request("r1", "j1", "jobCollect", 30, Map.of("source", Map.of("kind", "http", "url", "https://secret-host.example.com/x?key=abc",
                "items", List.of(Map.of("key", "k", "path", "a")))), Map.of(), Map.of()));
        assertThat(http.status()).isEqualTo("FAIL");
        assertThat(http.msg()).contains("허용 목록에 없는 호스트").doesNotContain("secret-host").doesNotContain("abc");
        JobRunReport ex = kit.run(request("r2", "j2", "jobCollect", 30, Map.of("source", Map.of("kind", "exchange", "currencies", List.of("USD"))), Map.of(), Map.of()));
        assertThat(ex.msg()).contains("MCM 모듈 전용");
        JobRunReport empty = kit.run(request("r3", "j3", "jobCollect", 30, Map.of("source",
                Map.of("kind", "sql", "sql", "SELECT V, ID FROM T_JOB_Q WHERE 1 = 0", "valueField", "ID", "keyField", "V")), Map.of(), Map.of()));
        assertThat(empty.msg()).contains("수집된 값이 없습니다");
    }
}
```

- [ ] **Step 9: 실행한다**
  - `cd src/backend/mcm-core` 다음 `../gradlew compileJava compileTestJava --max-workers=2` → 성공(옮긴 코드의 패키지·import 가 맞는지)
  - `../gradlew test --max-workers=2 --tests '*QueryStatementGuardTest' --tests '*JobBuiltinBeansTest' --tests '*CollectConfigsTest' --tests '*McmCoreArchitectureTest'` → PASS (사이클 시험이 `job ↔ widget` 사이클 없음을 확인한다)
  - `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*CollectSourcesTest' --tests '*JobBuiltinServicesOraTest' --tests '*WidgetDataServiceTest' --tests '*CommWidgetMngServiceTest' --tests '*WidgetDefConfigRules*'` → PASS. 이동 전 기준 통과 수에서 collect 시험이 빠진 만큼만 줄었는지 확인한다.
  - `@OptionalParam` 이 비었을 때 `null` 이 들어오지 않아 `queryUpdatesWithTypedBinds` 가 「ParameterName…」·바인딩 오류로 실패하면: 세 서비스의 `run` 을 매개변수 없는 메서드로 바꾸고(입력 override 는 포기) `queryInputOverridesConfig` 시험을 지우며, 이 변경을 「설계와 다름」(§5.1 마지막 문단)으로 최종 보고에 적는다.
  - `node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .` → ERROR 0

- [ ] **Step 10: 커밋**

```bash
/usr/bin/git add -A src/backend/mcm-core
/usr/bin/git commit -m "$(printf 'feat(mcm-core): 예약 작업 내장 서비스(code·query·collect)를 더하고 위젯 자동 수집을 수집 작업 원천으로 옮긴다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 7: mcm-core `server` — 판정·선점 (`jobDispatch`)

**담당 후보:** Claude opus/high  
**Model:** opus/high

설계 §4.1(트리거 + BPMN 서비스)·§4.2(선점)·§4.8(로그 위치)·§5.0(변수 확정)·§8(웹 호출 차단 D23)·D17·D28. MCM 앱에서만 켜진다(`dmes.job.server.enabled`).

**Files:**
- Create(`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/server/`): `JobDispatchScope.java`, `ClaimedBatch.java`, `JobDispatchService.java`, `JobCallSink.java`, `JobDispatchTrigger.java`, `JobServerConfig.java`
- Modify: `.../mcm/job/JobConfig.java`(`@Import(JobServerConfig.class)`)
- Create: `src/backend/mcm/api/src/main/resources/services/job/jobDispatch.bpmn`
- Test(mcm-core): `.../mcm/job/server/JobDispatchScopeTest.java`, `.../oracheck/JobDispatchServiceOraTest.java`(+ 같은 폴더 `CountingDataSource.java`)
- Test(mcm/api): `src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/job/JobDispatchBpmnIntegrationTest.java`, `JobDispatchTriggerLogTest.java`

**Interfaces:**
- Consumes: `CronSpec`, `JobVars`·`JobVar`·`RunFacts`(Task 2), `JobRunRequest`(Task 3), `JobServiceInvoker`·`JobRunRequest.Retry`(Task 3·4), `JobProperties.getServer()`·`getSchema()`·`getCollect()`(Task 1).
- Produces:
  - `final class JobDispatchScope` — `static void open()`, `static void close()`, `static boolean isOpen()`, `static void require()`(없으면 `IllegalStateException`). 트리거만 연다.
  - `record ClaimedBatch(List<JobRunRequest> runs, boolean more)`.
  - `class JobDispatchService` — `JobDispatchService(DataSource, String schema)`, `ClaimedBatch claimDue(Integer batchSize, String collectEnabled)`(`collectEnabled` = `"Y"`/`"N"`). BPMN `jobDispatch` 의 서비스 태스크 몸체이며 **첫 줄에서 `JobDispatchScope.require()`**.
  - `interface JobCallSink { void submit(JobRunRequest request); }` — Task 8 의 `JobCaller` 가 구현한다.
  - `class JobDispatchTrigger` — `JobDispatchTrigger(ServiceStarter, ApplicationContext, JobCallSink, int batchSize, boolean collectEnabled)`, `@Scheduled(cron="0 * * * * *", zone="Asia/Seoul") public void tick()`.
  - 서비스 ID `jobDispatch`(파일 `services/job/jobDispatch.bpmn`, 빈 `jobDispatchService`, 메서드 `claimDue`, 출력 `claimed`).

- [ ] **Step 1: 판정 표시 시험을 쓴다**

```java
package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobDispatchScopeTest {

    @AfterEach
    void close() {
        JobDispatchScope.close();
    }

    @Test
    @DisplayName("열기 전에는 require 가 거절하고, 열면 통과하고, 닫으면 다시 거절한다")
    void openClose() {
        assertThat(JobDispatchScope.isOpen()).isFalse();
        assertThatThrownBy(JobDispatchScope::require).isInstanceOf(IllegalStateException.class).hasMessageContaining("판정");
        JobDispatchScope.open();
        JobDispatchScope.require();
        JobDispatchScope.close();
        assertThat(JobDispatchScope.isOpen()).isFalse();
    }

    @Test
    @DisplayName("다른 스레드에서는 열려 있지 않다 — 웹 요청 스레드는 표시를 가질 수 없다")
    void threadLocal() throws Exception {
        JobDispatchScope.open();
        AtomicBoolean other = new AtomicBoolean(true);
        Thread t = new Thread(() -> other.set(JobDispatchScope.isOpen()));
        t.start();
        t.join();
        assertThat(other.get()).isFalse();
    }
}
```

- [ ] **Step 2: 판정 서비스 Oracle 시험을 쓴다** (`OraCheckJpaConfig` = MCMAPUSER 연결 + `PlatformTransactionManager`·`TransactionTemplate` 빈. 실제 `FOR UPDATE SKIP LOCKED` 는 모의 객체로 재현할 수 없어 실제 Oracle 로 한다)

```java
package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.server.ClaimedBatch;
import com.dongkuk.dmes.mcm.job.server.JobDispatchScope;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobDispatchServiceOraTest {

    private static final String NOW_SQL = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    private JobDispatchService service;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        clean();
        service = new JobDispatchService(dataSource, "MCMAPUSER");
        tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        JobDispatchScope.open();
    }

    @AfterEach
    void clean() {
        JobDispatchScope.close();
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
    }

    private LocalDateTime dbNow() {
        return jdbc.queryForObject("SELECT " + NOW_SQL + " FROM DUAL", Timestamp.class).toLocalDateTime();
    }

    /** NEXT_RUN_AT = DB 지금 + offsetSec 초. */
    private void def(String jobId, String kind, String cron, String varsJson, String configJson, String optsJson, long offsetSec) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, "
                + "TIMEOUT_SEC, NEXT_RUN_AT, OWNER_TP, OPTS_JSON) VALUES (?, 'MDM', 'n', ?, 'jobCode', 'run', ?, 'Y', ?, ?, 600, "
                + NOW_SQL + " + NUMTODSINTERVAL(?, 'SECOND'), 'USER', ?)", jobId, kind, cron, configJson, varsJson, offsetSec, optsJson);
    }

    private ClaimedBatch claim(int batchSize, String collectEnabled) {
        return tx.execute(s -> service.claimDue(batchSize, collectEnabled));
    }

    private Map<String, Object> run(String jobId) {
        return jdbc.queryForMap("SELECT * FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = ?", jobId);
    }

    @Test
    @DisplayName("판정 서비스는 트리거가 연 표시가 없으면 거절한다 — 웹 경로로 jobDispatch 를 불러도 선점하지 않는다")
    void rejectsWithoutScope() {
        def("j1", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        JobDispatchScope.close();
        assertThatThrownBy(() -> claim(50, "Y")).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN", Integer.class)).isZero();
    }

    @Test
    @DisplayName("할 일이 있으면 RUN 을 INSERT 하고 NEXT_RUN_AT 을 올린다 — 호출에 쓸 값(서비스·설정·변수·시간 초과)은 잠근 행에서 읽는다")
    void claimsDueJob() {
        def("j1", "CODE", "*/10 * * * *", "[{\"name\":\"baseDt\",\"type\":\"DATE\",\"value\":\":today\",\"desc\":\"\"},{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"3\",\"desc\":\"\"}]",
                "{\"handlerId\":\"mdm.sync\"}", null, -5);
        LocalDateTime before = dbNow();

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.more()).isFalse();
        assertThat(batch.runs()).hasSize(1);
        JobRunRequest r = batch.runs().get(0);
        assertThat(r.jobId()).isEqualTo("j1");
        assertThat(r.module()).isEqualTo("MDM");
        assertThat(r.serviceId()).isEqualTo("jobCode");
        assertThat(r.action()).isEqualTo("run");
        assertThat(r.config()).containsEntry("handlerId", "mdm.sync");
        assertThat(r.timeoutSec()).isEqualTo(600);
        assertThat(r.manual()).isFalse();
        assertThat(r.inputs().get("baseDt")).isEqualTo(r.schedAtTime().toLocalDate().toString());   // SCHED_AT 기준
        assertThat(r.inputs().get("n")).hasToString("3");
        assertThat(r.varTypes()).containsEntry("baseDt", "DATE").containsEntry("n", "NUMBER");
        assertThat(r.retry()).isNull();

        Map<String, Object> row = run("j1");
        assertThat(row.get("STATUS")).isEqualTo("RUN");
        assertThat(row.get("RUN_ID")).isEqualTo(r.runId());
        assertThat(row.get("TRIGGER_TP")).isEqualTo("S");
        assertThat(row.get("SERVICE_ID")).isEqualTo("jobCode");
        assertThat(((Number) row.get("TIMEOUT_SEC")).intValue()).isEqualTo(600);
        assertThat(String.valueOf(row.get("VARS_JSON"))).contains("baseDt");
        assertThat(((Timestamp) row.get("SCHED_AT")).toLocalDateTime()).isEqualTo(r.schedAtTime());
        assertThat(r.schedAtTime().getNano()).isZero();
        LocalDateTime next = jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'j1'", Timestamp.class).toLocalDateTime();
        assertThat(next).isAfter(before).isAfter(r.schedAtTime());
        assertThat(next.getMinute() % 10).isZero();
    }

    @Test
    @DisplayName("할 일이 없는 틱은 SQL 한 문장(색인 조회)뿐이다 — 잠금 조회·INSERT 없음")
    void emptyTickRunsOneStatement() {
        def("future", "CODE", "0 2 * * *", null, "{\"handlerId\":\"h\"}", null, 3600);
        CountingDataSource counting = new CountingDataSource(dataSource);
        JobDispatchService s = new JobDispatchService(counting, "MCMAPUSER");
        ClaimedBatch batch = new TransactionTemplate(new DataSourceTransactionManager(counting)).execute(st -> s.claimDue(50, "Y"));
        assertThat(batch.runs()).isEmpty();
        assertThat(batch.more()).isFalse();
        assertThat(counting.statements()).isEqualTo(1);
    }

    @Test
    @DisplayName("MCM 두 대(서로 다른 연결)가 같은 분에 동시에 선점해도 한 회차는 정확히 한 번 — 20회 반복")
    void twoInstancesRaceForOneRun() throws Exception {
        try (HikariDataSource other = McmCoreOraTestDb.dataSource(McmCoreOraTestDb.APP_USER, "job-claim-b")) {
            JobDispatchService a = service;
            JobDispatchService b = new JobDispatchService(other, "MCMAPUSER");
            TransactionTemplate txA = tx;
            TransactionTemplate txB = new TransactionTemplate(new DataSourceTransactionManager(other));
            for (int i = 0; i < 20; i++) {
                jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
                jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
                def("race", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -2);
                CyclicBarrier go = new CyclicBarrier(2);
                CompletableFuture<ClaimedBatch> fa = CompletableFuture.supplyAsync(() -> race(go, txA, a));
                CompletableFuture<ClaimedBatch> fb = CompletableFuture.supplyAsync(() -> race(go, txB, b));
                int claimed = fa.get().runs().size() + fb.get().runs().size();
                assertThat(claimed).as("반복 %d: 두 인스턴스가 받은 실행 수", i).isEqualTo(1);
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'race'", Integer.class)).isEqualTo(1);
            }
        }
    }

    private static ClaimedBatch race(CyclicBarrier go, TransactionTemplate tx, JobDispatchService s) {
        try {
            go.await();
            JobDispatchScope.open();
            return tx.execute(st -> s.claimDue(50, "Y"));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        } finally {
            JobDispatchScope.close();
        }
    }

    @Test
    @DisplayName("오래 꺼졌다 켜진 뒤(2분 넘게 늦은 회차)는 따라잡지 않는다 — SKIP 1건 + 다음 미래 시각, 사이 회차 행 없음")
    void lateRunIsSkipped() {
        def("late", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -3 * 3600);
        ClaimedBatch batch = claim(50, "Y");
        assertThat(batch.runs()).isEmpty();
        Map<String, Object> row = run("late");
        assertThat(row.get("STATUS")).isEqualTo("SKIP");
        assertThat(row.get("MSG")).isEqualTo("놓친 회차를 건너뜀");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'late'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'late'", Timestamp.class).toLocalDateTime()).isAfter(dbNow());
    }

    @Test
    @DisplayName("같은 작업의 이전 회차가 RUN(시간 초과 + 정리 여유 안)이면 SKIP 「이전 회차 실행 중」")
    void overlapIsSkipped() {
        def("busy", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES ('busy', TIMESTAMP '2020-01-01 00:00:00', 'S', 'old-run', 'MDM', 'jobCode', 'RUN', " + NOW_SQL + " - INTERVAL '10' SECOND, 600)");
        ClaimedBatch batch = claim(50, "Y");
        assertThat(batch.runs()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT MSG FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'busy' AND STATUS = 'SKIP'", String.class)).isEqualTo("이전 회차 실행 중");
    }

    @Test
    @DisplayName("사용 중지는 후보가 아니고, collectEnabled=N 이면 COLLECT 작업도 후보가 아니다")
    void filters() {
        def("on", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        def("off", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET USE_YN = 'N' WHERE JOB_ID = 'off'");
        def("col", "COLLECT", "*/10 * * * *", null, "{\"source\":{}}", null, -5);
        assertThat(claim(50, "N").runs()).extracting(JobRunRequest::jobId).containsExactly("on");
        assertThat(claim(50, "Y").runs()).extracting(JobRunRequest::jobId).containsExactly("col");
    }

    @Test
    @DisplayName("깨진 정의 한 건(CONFIG_JSON 손상·읽을 수 없는 crontab·변수 오류)은 그 행만 FAIL 「정의 오류」로 남기고 다른 작업의 선점을 막지 않는다")
    void brokenDefinitionDoesNotBlockOthers() {
        def("badjson", "CODE", "*/10 * * * *", null, "{bad", null, -5);
        def("badcron", "CODE", "0 9 1 * 1", null, "{\"handlerId\":\"h\"}", null, -5);
        def("badvar", "CODE", "*/10 * * * *", "[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"abc\",\"desc\":\"\"}]", "{\"handlerId\":\"h\"}", null, -5);
        def("good", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.runs()).extracting(JobRunRequest::jobId).containsExactly("good");
        for (String bad : List.of("badjson", "badcron", "badvar")) {
            Map<String, Object> row = run(bad);
            assertThat(row.get("STATUS")).as(bad).isEqualTo("FAIL");
            assertThat(String.valueOf(row.get("MSG"))).as(bad).startsWith("정의 오류");
            assertThat(jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = ?", Timestamp.class, bad).toLocalDateTime())
                    .as(bad + " 다음 시각을 미룬다").isAfter(dbNow());
        }
    }

    @Test
    @DisplayName(":prevRunAt 은 직전 정상 「일정」 회차(TRIGGER_TP='S')의 예정 시각만 쓴다 — 「지금 실행」(M)은 구간을 당기지 않는다")
    void prevRunAtIgnoresManualRuns() {
        def("pv", "CODE", "*/10 * * * *", "[{\"name\":\"p\",\"type\":\"DATE\",\"value\":\":prevRunAt\",\"desc\":\"\"}]", "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 09:00:00', 'S', 'r-s', 'MDM', 'jobCode', 'OK')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 10:00:00', 'M', 'r-m', 'MDM', 'jobCode', 'OK')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 11:00:00', 'S', 'r-f', 'MDM', 'jobCode', 'FAIL')");
        JobRunRequest r = claim(50, "Y").runs().get(0);
        assertThat(r.inputs().get("p")).isEqualTo("2026-10-08T09:00:00");
    }

    @Test
    @DisplayName("재시도 설정이 있으면 RUN 의 TIMEOUT_SEC 에 재시도 시간까지 더하고, 요청은 시도 하나의 시간 초과와 재시도를 싣는다")
    void retryExtendsRecordedTimeout() {
        def("rt", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", "{\"retry\":{\"count\":2,\"intervalMin\":5}}", -5);
        JobRunRequest r = claim(50, "Y").runs().get(0);
        assertThat(r.timeoutSec()).isEqualTo(600);
        assertThat(r.retry()).isEqualTo(new JobRunRequest.Retry(2, 5));
        assertThat(((Number) run("rt").get("TIMEOUT_SEC")).intValue()).isEqualTo(600 + 2 * (600 + 5 * 60));
    }

    @Test
    @DisplayName("한 틱 후보 120건은 50·50·20 으로 나눠 되풀이한다(more) — 묶음마다 자기 트랜잭션, SKIP 없음")
    void batchesOf50() {
        for (int i = 0; i < 120; i++) def("b" + i, "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        List<Integer> sizes = new ArrayList<>();
        List<Boolean> more = new ArrayList<>();
        for (int round = 0; round < 5; round++) {
            ClaimedBatch b = claim(50, "Y");
            sizes.add(b.runs().size());
            more.add(b.more());
            if (!b.more()) break;
        }
        assertThat(sizes).containsExactly(50, 50, 20);
        assertThat(more).containsExactly(true, true, false);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE STATUS = 'RUN'", Integer.class)).isEqualTo(120);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE STATUS = 'SKIP'", Integer.class)).isZero();
    }

    @Test
    @DisplayName("DB 시계는 KST 로 읽는다 — SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' 이 서울 벽시계와 1분 안")
    void dbClockIsKst() {
        assertThat(Duration.between(dbNow(), LocalDateTime.now(ZoneId.of("Asia/Seoul"))).abs()).isLessThan(Duration.ofMinutes(1));
    }
}
```

`CountingDataSource` (같은 폴더): 연결의 `prepareStatement` 호출 수를 세는 JDK 프록시.

```java
package com.dongkuk.dmes.mcm.oracheck;

import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.AbstractDataSource;

/** 연결에서 준비한 SQL 문장 수를 세는 시험용 DataSource. */
final class CountingDataSource extends AbstractDataSource {

    private final DataSource delegate;
    private final AtomicInteger statements = new AtomicInteger();

    CountingDataSource(DataSource delegate) {
        this.delegate = delegate;
    }

    int statements() {
        return statements.get();
    }

    @Override
    public Connection getConnection() throws java.sql.SQLException {
        Connection target = delegate.getConnection();
        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class}, (proxy, method, args) -> {
            if (method.getName().equals("prepareStatement") || method.getName().equals("prepareCall")) statements.incrementAndGet();
            try {
                return method.invoke(target, args);
            } catch (java.lang.reflect.InvocationTargetException e) {
                throw e.getCause();
            }
        });
    }

    @Override
    public Connection getConnection(String username, String password) throws java.sql.SQLException {
        return getConnection();
    }
}
```

- [ ] **Step 3: 실패를 확인한다** — `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 --tests '*JobDispatchScopeTest' -Pdmes.ora.test=clone --tests '*JobDispatchServiceOraTest'` → 컴파일 실패.

- [ ] **Step 4: 표시·결과 record·호출 인터페이스를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.server;

/** 판정 서비스 실행 표시(ThreadLocal) — 트리거만 연다. 판정 몸체가 첫 줄에서 확인해 웹 경로로 부른 호출을 거절한다(설계 §8, D23 와 같은 방식). */
public final class JobDispatchScope {

    private static final ThreadLocal<Boolean> OPEN = new ThreadLocal<>();

    private JobDispatchScope() {}

    public static void open() { OPEN.set(Boolean.TRUE); }

    public static void close() { OPEN.remove(); }

    public static boolean isOpen() { return Boolean.TRUE.equals(OPEN.get()); }

    public static void require() {
        if (!isOpen()) throw new IllegalStateException("예약 작업 판정 서비스는 트리거만 부를 수 있습니다");
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import java.util.List;

/** {@code jobDispatch} 의 출력 {@code claimed} — 이번 묶음에서 선점한 실행들과 이어 부를 묶음이 더 있는지(조회 건수 == batchSize). */
public record ClaimedBatch(List<JobRunRequest> runs, boolean more) {
}
```

```java
package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;

/** 선점한 실행을 모듈에 보내는 쪽 — 트랜잭션 밖 호출 풀({@code JobCaller})이 구현한다. 호출은 비동기이고 이 메서드는 빨리 돌아온다. */
public interface JobCallSink {

    void submit(JobRunRequest request);
}
```

- [ ] **Step 5: 판정 서비스 몸체를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * BPMN {@code jobDispatch} 의 서비스 태스크 몸체 — 색인 조회로 지금 할 작업을 읽고(설계 §4.1) 같은 트랜잭션에서 선점한다(§4.2). 트랜잭션은 OASIS 가
 * 서비스마다 연다(이 클래스에 {@code @Transactional} 없음). {@code serviceStarter.start} 가 돌아오면 이미 커밋돼 있다.
 * <ul>
 *   <li>빈 결과면 바로 끝낸다 — 평소 매분 SQL 한 문장이 전부이다.</li>
 *   <li>잠그는 SQL 에는 행 수 제한이 없다(ORA-02014). 개수는 앞의 조회가 {@code batchSize} 로 이미 제한했고, 잠근 행은 모두 이 트랜잭션에서 처리한다.</li>
 *   <li>늦은 회차(DB_NOW - NEXT_RUN_AT &gt; 2분)는 따라잡지 않고 SKIP 1건, 겹침은 SKIP, 그 밖은 RUN INSERT(PK 위반이면 건너뜀) 뒤 NEXT_RUN_AT 을 올린다.</li>
 *   <li>변수 확정은 여기서 한다(날짜 변수는 SCHED_AT 기준, {@code :prevRunAt} 은 그 변수를 쓰는 작업만 TRIGGER_TP='S' 직전 정상 회차).</li>
 *   <li>정의 한 건이 깨져 있으면(CONFIG_JSON·VARS_JSON·OPTS_JSON·crontab) 그 행만 FAIL 「정의 오류」로 남기고 NEXT_RUN_AT 을 미룬다 — 다른 작업을 막지 않는다.</li>
 * </ul>
 */
public class JobDispatchService {

    static final Duration LATE_LIMIT = Duration.ofMinutes(2);
    static final int CLEANUP_MARGIN_SEC = 300;
    static final int DEFAULT_BATCH = 50;
    static final int MAX_BATCH = 200;
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final String dueSql;
    private final String lockSql;
    private final String insertRunSql;
    private final String liveRunSql;
    private final String prevOkSql;
    private final String nextRunSql;

    public JobDispatchService(DataSource dataSource, String schema) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = new JdbcTemplate(dataSource);
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.dueSql = """
                SELECT A.JOB_ID
                FROM   %1$s.TB_MCM_JOB_DEF A
                WHERE  A.USE_YN = 'Y'
                AND    A.NEXT_RUN_AT <= %2$s + INTERVAL '30' SECOND
                AND    (A.JOB_KIND <> 'COLLECT' OR ? = 'Y')
                ORDER BY A.NEXT_RUN_AT
                FETCH FIRST ? ROWS ONLY
                """.formatted(schema, NOW);
        this.lockSql = """
                SELECT A.JOB_ID, A.MODULE_CD, A.SERVICE_ID, A.ACTION, A.CRON_EXPR, A.TIMEOUT_SEC, A.NEXT_RUN_AT
                     , A.CONFIG_JSON, A.VARS_JSON, A.OPTS_JSON
                     , %2$s DB_NOW
                FROM   %1$s.TB_MCM_JOB_DEF A
                WHERE  A.JOB_ID IN (:ids)
                AND    A.USE_YN = 'Y'
                AND    A.NEXT_RUN_AT <= %2$s + INTERVAL '30' SECOND
                FOR UPDATE SKIP LOCKED
                """.formatted(schema, NOW);
        this.insertRunSql = """
                INSERT INTO %1$s.TB_MCM_JOB_RUN
                       (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, ENDED_AT, TIMEOUT_SEC, MSG, VARS_JSON,
                        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
                VALUES (?, ?, 'S', ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        %2$s, 'SCHEDULER', 'JobDispatchService', 'jobDispatch', %2$s, 'SCHEDULER', 'JobDispatchService', 'jobDispatch', 0)
                """.formatted(schema, NOW);
        this.liveRunSql = """
                SELECT COUNT(*)
                FROM   %1$s.TB_MCM_JOB_RUN A
                WHERE  A.JOB_ID = ?
                AND    A.STATUS = 'RUN'
                AND    A.STARTED_AT + NUMTODSINTERVAL(A.TIMEOUT_SEC + %2$d, 'SECOND') > ?
                """.formatted(schema, CLEANUP_MARGIN_SEC);
        this.prevOkSql = """
                SELECT MAX(A.SCHED_AT)
                FROM   %1$s.TB_MCM_JOB_RUN A
                WHERE  A.JOB_ID = ?
                AND    A.STATUS = 'OK'
                AND    A.TRIGGER_TP = 'S'
                """.formatted(schema);
        this.nextRunSql = """
                UPDATE %1$s.TB_MCM_JOB_DEF
                SET    NEXT_RUN_AT = ?
                     , U_AT = %2$s
                     , U_USR_ID = 'SCHEDULER'
                     , U_PGM_ID = 'JobDispatchService'
                     , VER = VER + 1
                WHERE  JOB_ID = ?
                """.formatted(schema, NOW);
    }

    /** 정의 한 건이 읽을 수 없는 상태 — 이 행만 FAIL 로 남긴다. 메시지에는 어느 칸인지만 쓴다(원문 없음). */
    private static final class BrokenDefinition extends RuntimeException {
        BrokenDefinition(String message) {
            super(message);
        }
    }

    private record Row(String jobId, String module, String serviceId, String action, String cron, int timeoutSec, LocalDateTime nextRunAt,
                       String configJson, String varsJson, String optsJson, LocalDateTime dbNow) {}

    public ClaimedBatch claimDue(Integer batchSize, String collectEnabled) {
        JobDispatchScope.require();
        int limit = batchSize == null || batchSize < 1 ? DEFAULT_BATCH : Math.min(batchSize, MAX_BATCH);
        List<String> ids = jdbc.queryForList(dueSql, String.class, "N".equalsIgnoreCase(collectEnabled) ? "N" : "Y", limit);
        if (ids.isEmpty()) return new ClaimedBatch(List.of(), false);

        List<Row> rows = named.query(lockSql, new MapSqlParameterSource("ids", ids), (rs, i) -> new Row(
                rs.getString("JOB_ID"), rs.getString("MODULE_CD"), rs.getString("SERVICE_ID"), rs.getString("ACTION"), rs.getString("CRON_EXPR"),
                rs.getInt("TIMEOUT_SEC"), rs.getTimestamp("NEXT_RUN_AT").toLocalDateTime(), rs.getString("CONFIG_JSON"),
                rs.getString("VARS_JSON"), rs.getString("OPTS_JSON"), rs.getTimestamp("DB_NOW").toLocalDateTime()));

        List<JobRunRequest> runs = new ArrayList<>();
        for (Row row : rows) {
            try {
                JobRunRequest request = process(row);
                if (request != null) runs.add(request);
            } catch (BrokenDefinition e) {
                broken(row, e.getMessage());
            }
        }
        return new ClaimedBatch(List.copyOf(runs), ids.size() == limit);
    }

    private JobRunRequest process(Row r) {
        LocalDateTime sched = r.nextRunAt().truncatedTo(ChronoUnit.SECONDS);   // TIMESTAMP(0) 은 소수 초를 반올림한다
        CronSpec cron = parseCron(r.cron());
        JobRunRequest request = null;
        if (Duration.between(sched, r.dbNow()).compareTo(LATE_LIMIT) > 0) {
            insertRun(r, sched, "SKIP", "놓친 회차를 건너뜀", null, r.timeoutSec());
        } else if (jdbc.queryForObject(liveRunSql, Integer.class, r.jobId(), Timestamp.valueOf(r.dbNow())) > 0) {
            insertRun(r, sched, "SKIP", "이전 회차 실행 중", null, r.timeoutSec());
        } else {
            request = buildRequest(r, sched);
            try {
                insertRun(r, sched, "RUN", null, request, recordedTimeout(r.timeoutSec(), request.retry()));
            } catch (DuplicateKeyException e) {
                request = null;   // 같은 회차 PK — 이미 다른 인스턴스·이전 시도가 잡았다
            }
        }
        LocalDateTime base = sched.isAfter(r.dbNow()) ? sched : r.dbNow();
        jdbc.update(nextRunSql, Timestamp.valueOf(cron.next(base)), r.jobId());
        return request;
    }

    private JobRunRequest buildRequest(Row r, LocalDateTime sched) {
        List<JobVar> vars;
        try {
            vars = JobVars.parse(r.varsJson());
        } catch (IllegalArgumentException e) {
            throw new BrokenDefinition("정의 오류: 변수 목록(VARS_JSON)을 읽을 수 없습니다");
        }
        LocalDateTime prev = null;
        if (JobVars.usesPrevRunAt(vars)) {
            Timestamp p = jdbc.queryForObject(prevOkSql, Timestamp.class, r.jobId());
            prev = p == null ? null : p.toLocalDateTime();
        }
        Map<String, Object> inputs;
        try {
            inputs = JobVars.resolve(vars, new JobVars.RunFacts(sched, r.dbNow(), prev, r.jobId(), r.module()));
        } catch (RuntimeException e) {
            throw new BrokenDefinition("정의 오류: 변수 값을 확정할 수 없습니다");
        }
        Map<String, Object> config = new LinkedHashMap<>();
        if (r.configJson() != null && !r.configJson().isBlank()) {
            try {
                config = JSON.readValue(r.configJson(), new TypeReference<LinkedHashMap<String, Object>>() {});
            } catch (JsonProcessingException e) {
                throw new BrokenDefinition("정의 오류: 설정(CONFIG_JSON)을 읽을 수 없습니다");
            }
        }
        return new JobRunRequest(UUID.randomUUID().toString(), r.jobId(), r.module(), r.serviceId(), r.action(), inputs, JobVars.typesOf(vars), config,
                r.timeoutSec(), retryOf(r.optsJson()), sched.format(ISO), false, null);
    }

    private static JobRunRequest.Retry retryOf(String optsJson) {
        if (optsJson == null || optsJson.isBlank()) return null;
        try {
            JsonNode retry = JSON.readTree(optsJson).path("retry");
            int count = retry.path("count").asInt(0);
            int interval = retry.path("intervalMin").asInt(0);
            return count > 0 && interval > 0 ? new JobRunRequest.Retry(count, interval) : null;
        } catch (JsonProcessingException e) {
            throw new BrokenDefinition("정의 오류: 고급 설정(OPTS_JSON)을 읽을 수 없습니다");
        }
    }

    /** 재시도가 있는 회차는 정리가 너무 일찍 닫지 않도록 {@code timeoutSec + count × (timeoutSec + intervalMin 분)} 을 기록한다(설계 §4.6). */
    private static int recordedTimeout(int timeoutSec, JobRunRequest.Retry retry) {
        return retry == null ? timeoutSec : timeoutSec + retry.count() * (timeoutSec + retry.intervalMin() * 60);
    }

    private static CronSpec parseCron(String expr) {
        try {
            return CronSpec.parse(expr);
        } catch (IllegalArgumentException e) {
            throw new BrokenDefinition("정의 오류: crontab 식을 읽을 수 없습니다");
        }
    }

    private void insertRun(Row r, LocalDateTime sched, String status, String msg, JobRunRequest request, int recordedTimeout) {
        boolean running = "RUN".equals(status);
        Timestamp now = Timestamp.valueOf(r.dbNow());
        String varsJson = request == null ? null : writeJson(request.inputs());
        jdbc.update(insertRunSql, r.jobId(), Timestamp.valueOf(sched), running ? request.runId() : UUID.randomUUID().toString(), r.module(), r.serviceId(),
                status, now, running ? null : now, recordedTimeout, msg, varsJson);
    }

    /** 깨진 정의: 이 행만 FAIL 로 닫고 NEXT_RUN_AT 을 한 시간 뒤로 미룬다(식을 읽을 수 없으니 계산할 수 없다). */
    private void broken(Row r, String message) {
        LocalDateTime sched = r.nextRunAt().truncatedTo(ChronoUnit.SECONDS);
        try {
            insertRun(r, sched, "FAIL", message, null, r.timeoutSec());
        } catch (DuplicateKeyException ignored) {
            // 같은 회차의 기록이 이미 있다
        }
        LocalDateTime next;
        try {
            LocalDateTime base = sched.isAfter(r.dbNow()) ? sched : r.dbNow();
            next = CronSpec.parse(r.cron()).next(base);
        } catch (IllegalArgumentException e) {
            next = r.dbNow().plusHours(1);
        }
        jdbc.update(nextRunSql, Timestamp.valueOf(next), r.jobId());
    }

    private static String writeJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
```

- [ ] **Step 6: 트리거를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.job.JobServiceInvoker;
import com.dongkuk.dmes.cactus.util.TxIdGenerator;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 매분 0초에 깨어나 BPMN 서비스 {@code jobDispatch} 를 부르는 시계(설계 §4.1). 판정은 하지 않는다. 공용 스케줄러 래퍼(cactus-core
 * {@code JobLoggingTaskScheduler})가 {@code serviceId=sch.mcm.jobDispatchTrigger.tick} 와 service_tag 를 넣고 경계 두 줄을 sch 로그에 남기며, 이 클래스는
 * {@code jobDispatch} 를 부르는 동안만 MDC {@code serviceId}·{@code txId} 를 바꿔 SQL·bind 줄이 <b>mcm 업무 로그</b>로 가게 하고(설계 §4.8), 돌아오면 되돌린다.
 * (래퍼가 MDC 를 {@code MDCTemplate} 으로 지우므로 여기서는 쓰지 않는다.) 한 틱에 {@code more} 이면 최대 {@value #MAX_ROUNDS} 번 되풀이한다.
 * 호출은 {@code serviceStarter.start} 가 돌아온 뒤(= 커밋 뒤)에만 넘긴다. 실패(결과 비성공·예외)는 선점한 것이 없으므로 연속 첫 번째만 WARN, 복구 때 INFO.
 */
public class JobDispatchTrigger {

    static final String SERVICE_ID = "jobDispatch";
    static final int MAX_ROUNDS = 10;

    private static final Logger log = LoggerFactory.getLogger(JobDispatchTrigger.class);

    private final ServiceStarter serviceStarter;
    private final ApplicationContext spring;
    private final JobCallSink sink;
    private final int batchSize;
    private final boolean collectEnabled;
    private final AtomicBoolean failing = new AtomicBoolean();

    public JobDispatchTrigger(ServiceStarter serviceStarter, ApplicationContext spring, JobCallSink sink, int batchSize, boolean collectEnabled) {
        this.serviceStarter = serviceStarter;
        this.spring = spring;
        this.sink = sink;
        this.batchSize = batchSize;
        this.collectEnabled = collectEnabled;
    }

    @Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")
    public void tick() {
        String savedServiceId = MDC.get("serviceId");
        String savedTxId = MDC.get("txId");
        try {
            for (int round = 0; round < MAX_ROUNDS; round++) {
                MDC.put("serviceId", SERVICE_ID);
                MDC.put("txId", TxIdGenerator.generate("SCHEDULER", "JOB_DISPATCH"));
                ClaimedBatch batch = claim();
                if (batch == null) break;
                batch.runs().forEach(sink::submit);
                if (!batch.more()) break;
            }
        } finally {
            restore("serviceId", savedServiceId);
            restore("txId", savedTxId);
        }
    }

    private ClaimedBatch claim() {
        long startedAt = System.currentTimeMillis();
        log.info("{}/run", SERVICE_ID);   // OasisServiceExecutor 가 남기는 줄과 같은 문구 — analog 서비스 목록이 읽는다
        try {
            JobDispatchScope.open();
            Map<String, Object> inputs = new LinkedHashMap<>();
            inputs.put("action", "run");
            inputs.put("batchSize", batchSize);
            inputs.put("collectEnabled", collectEnabled ? "Y" : "N");
            ServiceResult result = JobServiceInvoker.start(serviceStarter, spring, SERVICE_ID, inputs, new CactusAudit("SCHEDULER", "JOB_DISPATCH", SERVICE_ID));
            if (result == null || result.serviceResultCode() != ServiceResultCode.SUCCESS) {
                failed(result == null ? "null" : String.valueOf(result.serviceResultCode()));
                return null;
            }
            ClaimedBatch batch = (ClaimedBatch) result.result("claimed").getObject();
            recovered();
            return batch;
        } catch (RuntimeException e) {
            failed(e.getClass().getSimpleName());
            return null;
        } finally {
            JobDispatchScope.close();
            log.info("Service end - service name [{}] RunTime : [{}]", SERVICE_ID, System.currentTimeMillis() - startedAt);
        }
    }

    private void failed(String reason) {
        if (failing.compareAndSet(false, true)) log.warn("예약 작업 판정 실패 — 이 분은 건너뛰고 다음 분에 다시 합니다 결과={}", reason);
    }

    private void recovered() {
        if (failing.compareAndSet(true, false)) log.info("예약 작업 판정이 복구되었습니다");
    }

    private static void restore(String key, String value) {
        if (value == null) MDC.remove(key);
        else MDC.put(key, value);
    }
}
```

`JobServerConfig` — MCM 앱(`dmes.job.server.enabled=true`)에서만. Task 8 이 호출 풀·정리 작업 빈을 더한다.

```java
package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.oasis.service.ServiceStarter;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** MCM 앱 전용 빈(판정·호출·기록·관리) — {@code dmes.job.server.enabled=true} 일 때만. 스테레오타입 없이 {@code @Bean} 으로 올린다. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "dmes.job.server", name = "enabled", havingValue = "true")
public class JobServerConfig {

    /** BPMN {@code jobDispatch} 의 {@code camunda:class="jobDispatchService"}. */
    @Bean
    public JobDispatchService jobDispatchService(ObjectProvider<DataSource> dataSource, JobProperties props) {
        return new JobDispatchService(dataSource.getObject(), props.getSchema());
    }

    @Bean
    public JobDispatchTrigger jobDispatchTrigger(ServiceStarter serviceStarter, ApplicationContext ctx, JobCallSink sink, JobProperties props) {
        return new JobDispatchTrigger(serviceStarter, ctx, sink, props.getServer().getBatchSize(), props.getCollect().isEnabled());
    }
}
```

`JobConfig` 의 `@Import` 에 `JobServerConfig.class` 를 더한다.

`src/backend/mcm/api/src/main/resources/services/job/jobDispatch.bpmn`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_jobDispatch" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="jobDispatch" name="예약 작업 판정·선점" isExecutable="true">
    <bpmn:startEvent id="start">
      <bpmn:outgoing>flow_start</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="claimTask" name="색인 조회와 선점" camunda:class="jobDispatchService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="claimDue" />
          <camunda:property name="output" value="claimed" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_start</bpmn:incoming>
      <bpmn:outgoing>flow_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="end">
      <bpmn:incoming>flow_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="flow_start" sourceRef="start" targetRef="claimTask" />
    <bpmn:sequenceFlow id="flow_end" sourceRef="claimTask" targetRef="end" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="jobDispatch">
      <bpmndi:BPMNShape id="start_di" bpmnElement="start"><dc:Bounds x="152" y="102" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="claimTask_di" bpmnElement="claimTask"><dc:Bounds x="250" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="end_di" bpmnElement="end"><dc:Bounds x="412" y="102" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="flow_start_di" bpmnElement="flow_start"><di:waypoint x="188" y="120" /><di:waypoint x="250" y="120" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow_end_di" bpmnElement="flow_end"><di:waypoint x="350" y="120" /><di:waypoint x="412" y="120" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

- [ ] **Step 7: mcm-core 시험을 통과시킨다** — `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobDispatchScopeTest' --tests '*JobDispatchServiceOraTest' --tests '*McmCoreArchitectureTest'` → PASS. 선점 경합 시험이 흔들리면(20회 중 1회 이상 실패) 잠금 SQL 이 `SKIP LOCKED` 인지, 조회가 `FETCH FIRST` 로 제한되는지 먼저 본다.

- [ ] **Step 8: BPMN·트리거 통합 시험을 쓴다** (mcm/api — 운영과 같은 `OasisAutoConfiguration#serviceStarter`; `MenuCatalogOasisSaveIntegrationTest` 와 같은 조립, `McmOraTestDb` 로 스키마를 준비한다)

```java
package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.job.JobServiceInvoker;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.mcm.job.server.ClaimedBatch;
import com.dongkuk.dmes.mcm.job.server.JobDispatchScope;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.zaxxer.hikari.HikariDataSource;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

/** 실제 {@code services/job/jobDispatch.bpmn} 을 OASIS 트랜잭션으로 돌려 본다 — 커밋 뒤에야 호출이 나간다·실패는 선점 0·웹 경로 거절(설계 §9). */
class JobDispatchBpmnIntegrationTest {

    private static final String NOW_SQL = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    private static HikariDataSource ds;
    private static JdbcTemplate jdbc;
    private static GenericApplicationContext ctx;
    private static ServiceStarter starter;
    private static volatile boolean explode;

    @BeforeAll
    static void start() {
        McmOraTestDb.resetSchemas();
        ds = McmOraTestDb.dataSource(McmOraTestDb.APP_USER, "job-dispatch-bpmn");
        jdbc = new JdbcTemplate(ds);
        ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> new DataSourceTransactionManager(ds));
        ctx.registerBean("jobDispatchService", JobDispatchService.class, () -> new JobDispatchService(ds, "MCMAPUSER") {
            @Override
            public ClaimedBatch claimDue(Integer batchSize, String collectEnabled) {
                ClaimedBatch batch = super.claimDue(batchSize, collectEnabled);
                if (explode) throw new IllegalStateException("시험용 실패(선점 뒤)");
                return batch;
            }
        });
        ctx.refresh();
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        starter = new OasisAutoConfiguration().serviceStarter(props, tx, ctx);
    }

    @AfterAll
    static void stop() {
        ctx.close();
        ds.close();
    }

    @BeforeEach
    void seed() {
        explode = false;
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, NEXT_RUN_AT, OWNER_TP) "
                + "VALUES ('j1', 'MDM', 'n', 'CODE', 'jobCode', 'run', '*/10 * * * *', 'Y', '{\"handlerId\":\"h\"}', 60, " + NOW_SQL + " - INTERVAL '5' SECOND, 'USER')");
    }

    private ServiceResult start(boolean withScope) {
        if (withScope) JobDispatchScope.open();
        try {
            return JobServiceInvoker.start(starter, ctx, "jobDispatch",
                    Map.of("action", "run", "batchSize", 50, "collectEnabled", "Y"), new CactusAudit("SCHEDULER", "JOB_DISPATCH", "jobDispatch"));
        } finally {
            JobDispatchScope.close();
        }
    }

    @Test
    @DisplayName("서비스가 돌아온 시점에 RUN 행은 이미 커밋돼 있다(다른 연결에서 보인다) — 호출은 이 뒤에만 나간다")
    void claimedRowsAreCommittedWhenStartReturns() {
        ServiceResult result = start(true);
        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        ClaimedBatch batch = (ClaimedBatch) result.result("claimed").getObject();
        assertThat(batch.runs()).hasSize(1);
        try (HikariDataSource other = McmOraTestDb.dataSource(McmOraTestDb.APP_USER, "job-dispatch-other")) {
            assertThat(new JdbcTemplate(other).queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE STATUS = 'RUN'", Integer.class)).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("몸체가 선점한 뒤 실패하면 OASIS 가 롤백해 선점한 것이 없다 — RUN 행 없음·NEXT_RUN_AT 그대로")
    void failureRollsEverythingBack() {
        explode = true;
        ServiceResult result = start(true);
        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE NEXT_RUN_AT <= " + NOW_SQL, Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("웹 경로(표시 없음)로 jobDispatch 를 부르면 거절되고 선점하지 않는다")
    void webPathIsRejected() {
        ServiceResult result = start(false);
        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
        assertThat(result.exception()).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN", Integer.class)).isZero();
    }
}
```

```java
package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.cactus.scheduling.ScheduledJobLogContext;
import com.dongkuk.dmes.mcm.job.server.ClaimedBatch;
import com.dongkuk.dmes.mcm.job.server.JobCallSink;
import com.dongkuk.dmes.mcm.job.server.JobDispatchTrigger;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.support.GenericApplicationContext;

/** 트리거의 로그 위치(설계 §4.8)·반복(more)·연속 실패 WARN 한 번을 확인한다 — ServiceStarter 는 가짜. */
class JobDispatchTriggerLogTest {

    private final Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    private ListAppender<ILoggingEvent> appender;
    private ServiceStarter starter;
    private final List<JobRunRequest> submitted = new ArrayList<>();
    private final JobCallSink sink = submitted::add;

    @BeforeEach
    void setUp() {
        appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        root.setLevel(Level.INFO);
        starter = mock(ServiceStarter.class);
    }

    @AfterEach
    void tearDown() {
        root.detachAppender(appender);
        MDC.clear();
    }

    private static JobRunRequest req(String id) {
        return new JobRunRequest(id, "j-" + id, "MDM", "jobCode", "run", null, null, null, 60, null, "2026-10-09T02:00:00", false, null);
    }

    private static ServiceResult ok(ClaimedBatch batch) {
        ServiceResult r = mock(ServiceResult.class);
        when(r.serviceResultCode()).thenReturn(ServiceResultCode.SUCCESS);
        when(r.result("claimed")).thenReturn(new TypedObject(batch));
        return r;
    }

    private static ServiceResult failed() {
        ServiceResult r = mock(ServiceResult.class);
        when(r.serviceResultCode()).thenReturn(ServiceResultCode.SYSTEM_ERROR);
        return r;
    }

    private JobDispatchTrigger trigger() {
        return new JobDispatchTrigger(starter, new GenericApplicationContext(), sink, 50, true);
    }

    @Test
    @DisplayName("판정 구간의 줄은 serviceId=jobDispatch(mcm 업무 로그), 래퍼가 남기는 경계 줄은 sch.…, 돌아온 뒤 MDC 는 래퍼의 값으로 복원된다")
    void logsGoToTheBusinessLogAndMdcIsRestored() {
        when(starter.start(eq("jobDispatch"), any())).thenAnswer(inv -> {
            org.slf4j.LoggerFactory.getLogger("test.sql").info("select ... from TB_MCM_JOB_DEF");   // BPMN 안 SQL 줄 대용
            return ok(new ClaimedBatch(List.of(req("a")), false));
        });
        ScheduledJobLogContext.run("sch.mcm.jobDispatchTrigger.tick", () -> {
            String wrapperTag = MDC.get("service_tag");
            String wrapperTx = MDC.get("txId");
            trigger().tick();
            assertThat(MDC.get("serviceId")).isEqualTo("sch.mcm.jobDispatchTrigger.tick");
            assertThat(MDC.get("service_tag")).isEqualTo(wrapperTag);
            assertThat(MDC.get("txId")).isEqualTo(wrapperTx);
        });

        List<ILoggingEvent> events = appender.list;
        assertThat(events).filteredOn(e -> e.getFormattedMessage().equals("jobDispatch/run"))
                .allSatisfy(e -> assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "jobDispatch"));
        assertThat(events).filteredOn(e -> e.getFormattedMessage().startsWith("Service end - service name [jobDispatch]"))
                .allSatisfy(e -> assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "jobDispatch"));
        assertThat(events).filteredOn(e -> e.getLoggerName().equals("test.sql"))
                .allSatisfy(e -> assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "jobDispatch"));
        assertThat(events).filteredOn(e -> e.getFormattedMessage().equals("sch.mcm.jobDispatchTrigger.tick/run"))
                .allSatisfy(e -> assertThat(e.getMDCPropertyMap().get("serviceId")).startsWith("sch."));
        assertThat(events).filteredOn(e -> e.getFormattedMessage().startsWith("Service end - service name [sch.mcm.jobDispatchTrigger.tick]"))
                .allSatisfy(e -> assertThat(e.getMDCPropertyMap().get("serviceId")).startsWith("sch."));
        assertThat(submitted).extracting(JobRunRequest::runId).containsExactly("a");
    }

    @Test
    @DisplayName("more=true 이면 같은 틱에서 다시 부른다 — 최대 10번, 묶음마다 호출을 넘긴다")
    void repeatsWhileMoreUpToTen() {
        AtomicInteger calls = new AtomicInteger();
        when(starter.start(eq("jobDispatch"), any())).thenAnswer(inv -> ok(new ClaimedBatch(List.of(req("r" + calls.incrementAndGet())), true)));
        trigger().tick();
        assertThat(calls.get()).isEqualTo(10);
        assertThat(submitted).hasSize(10);

        submitted.clear();
        calls.set(0);
        when(starter.start(eq("jobDispatch"), any())).thenAnswer(inv -> {
            int n = calls.incrementAndGet();
            return ok(new ClaimedBatch(List.of(req("s" + n)), n < 3));
        });
        trigger().tick();
        assertThat(calls.get()).isEqualTo(3);
    }

    @Test
    @DisplayName("연속 실패는 첫 번째만 WARN, 복구 때 INFO 한 줄 — 실패한 분에는 호출이 나가지 않는다")
    void failureWarnsOnceAndRecoveryInfoOnce() {
        when(starter.start(eq("jobDispatch"), any())).thenReturn(failed(), failed(), ok(new ClaimedBatch(List.of(req("x")), false)));
        JobDispatchTrigger t = trigger();
        t.tick();
        t.tick();
        t.tick();
        assertThat(appender.list).filteredOn(e -> e.getLevel() == Level.WARN).hasSize(1);
        assertThat(appender.list).filteredOn(e -> e.getFormattedMessage().contains("복구")).hasSize(1);
        assertThat(submitted).extracting(JobRunRequest::runId).containsExactly("x");
    }
}
```

- [ ] **Step 9: mcm/api 시험을 돌린다** — `cd src/backend/mcm` 다음 `../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobDispatchBpmnIntegrationTest' --tests '*JobDispatchTriggerLogTest'` → PASS. 트리거 로그 시험의 첫 케이스가 래퍼 경계 줄(`sch.mcm…/run`)의 MDC 단언에서 실패하면 `ScheduledJobLogContext.run` 의 줄 모양(`{jobName}/run`)과 `jobName` 이 같은지 본다 — 시험이 직접 `ScheduledJobLogContext.run("sch.mcm.jobDispatchTrigger.tick", …)` 로 이름을 주므로 모양은 `sch.mcm.jobDispatchTrigger.tick/run` 이다. `oasis-contract-check` 도 돌린다(Task 6 Step 9 와 같은 명령, ERROR 0).

- [ ] **Step 10: 커밋**

```bash
/usr/bin/git add src/backend/mcm-core/src src/backend/mcm/api/src
/usr/bin/git commit -m "$(printf 'feat(mcm-core): 예약 작업 판정·선점 서비스(jobDispatch)와 매분 트리거를 더한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 8: mcm-core `server` — 호출·정리

**담당 후보:** GLM 또는 opencode  
**Model:** sonnet/high

설계 §4.3(MCM → 모듈 호출, 응답별 처리 표)·§4.6(정리 `mcm.jobRunSweep`)·§5.2(코드 작업 5개 중 정리·삭제 3개)·D18·D19. 호출은 **트랜잭션 밖 Java 호출 풀**이다. 재시도는 없다.

**Files:**
- Create(`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/server/`): `JobRunStore.java`, `JobCaller.java`
- Modify: `.../server/JobServerConfig.java`(빈 더하기)
- Test: `.../mcm/job/server/JobServerConfigWiringTest.java`, `.../mcm/job/server/McmCodeJobsTest.java`, `.../oracheck/JobRunStoreOraTest.java`, `.../oracheck/JobCallerOraTest.java`

**Interfaces:**
- Consumes: `JobCallSink`(Task 7), `LocalJobRunGateway`·`AcceptResult`·`JobAppInfo`·`SimpleScheduledJob`·`ScheduledJob`(Task 5), `JobRunRequest`(Task 3), `JobProperties.getModules()`·`getCollect()`·`getSchema()`(Task 1).
- Produces:
  - `class JobRunStore`(MCM 쪽 RUN 표 SQL) — `JobRunStore(DataSource, String schema)`; `int markAccepted(String runId, String serverNm)`(`SERVER_NM = NVL(SERVER_NM, :srv)` 만, **STATUS 는 건드리지 않는다**); `int closeIfRunning(String runId, String status, String msg)`(`WHERE RUN_ID AND STATUS='RUN'`); `int sweep()`(`RUN` 이고 `STARTED_AT + (TIMEOUT_SEC+300)초 < DB_NOW` → `TIMEOUT`); `int purgeRunsBefore(int days, int chunkRows)`; `int purgeCollectBefore(String cutoffSlot, int chunkRows)`.
  - `class JobCaller implements JobCallSink, AutoCloseable` — 생성자 `(Map<String,String> baseUrls, JobModule localModule, LocalJobRunGateway local, JobRunStore store, String clientKey, int threads, int queue, Duration connectTimeout, Duration readTimeout)`; `void submit(JobRunRequest)`.
  - 빈 `jobRunStore`·`jobCaller`(`JobCallSink`)와 코드 작업 3개: `mcm.jobRunSweep`(`*/5 * * * *`, 5분)·`mcm.jobRunPurge`(`40 3 * * *`, 30분, 90일)·`mcm.collectPurge`(`30 3 * * *`, 30분, 90일, `dmes.job.collect.enabled=false` 면 아무것도 안 함).

- [ ] **Step 1: 실행 기록 저장소 시험을 쓴다**

```java
package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.server.JobRunStore;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobRunStoreOraTest {

    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    private JobRunStore store;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        store = new JobRunStore(dataSource, "MCMAPUSER");
    }

    /** startedAgoSec 초 전에 시작한 RUN 행. */
    private void run(String runId, String status, long startedAgoSec, int timeoutSec) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES (?, TIMESTAMP '2026-10-09 02:00:00' + NUMTODSINTERVAL(?, 'SECOND'), 'S', ?, 'MDM', 'jobCode', ?, "
                + NOW + " - NUMTODSINTERVAL(?, 'SECOND'), ?)", "job-" + runId, Math.abs(runId.hashCode() % 86000), runId, status, startedAgoSec, timeoutSec);
    }

    private Map<String, Object> row(String runId) {
        return jdbc.queryForMap("SELECT STATUS, MSG, SERVER_NM, ENDED_AT, VER FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = ?", runId);
    }

    @Test
    @DisplayName("접수 기록은 SERVER_NM 만 쓴다(이미 있으면 유지) — STATUS 는 건드리지 않아 먼저 끝난 모듈의 결과와 경합하지 않는다")
    void markAcceptedWritesServerOnly() {
        run("a", "RUN", 5, 60);
        assertThat(store.markAccepted("a", "srv1")).isEqualTo(1);
        assertThat(row("a").get("SERVER_NM")).isEqualTo("srv1");
        assertThat(row("a").get("STATUS")).isEqualTo("RUN");
        assertThat(store.markAccepted("a", "srv2")).isEqualTo(1);
        assertThat(row("a").get("SERVER_NM")).as("NVL 이라 처음 값을 유지").isEqualTo("srv1");

        run("done", "OK", 5, 60);
        store.markAccepted("done", "srv9");
        assertThat(row("done").get("STATUS")).as("모듈이 먼저 OK 로 끝냈어도 그대로").isEqualTo("OK");
    }

    @Test
    @DisplayName("거절로 닫기 — RUN 일 때만 SKIP·FAIL 로 바꾼다. 이미 OK 인 행은 덮어쓰지 않는다")
    void closeIfRunningOnlyWhenRunning() {
        run("a", "RUN", 5, 60);
        run("b", "OK", 5, 60);
        assertThat(store.closeIfRunning("a", "SKIP", "실행 풀 가득")).isEqualTo(1);
        assertThat(store.closeIfRunning("b", "FAIL", "모듈 호출 실패(ConnectException)")).isZero();
        assertThat(row("a").get("STATUS")).isEqualTo("SKIP");
        assertThat(row("a").get("MSG")).isEqualTo("실행 풀 가득");
        assertThat(row("a").get("ENDED_AT")).isNotNull();
        assertThat(row("b").get("STATUS")).isEqualTo("OK");
    }

    @Test
    @DisplayName("정리 — RUN 이고 STARTED_AT + (TIMEOUT_SEC + 300초) 가 지났으면 TIMEOUT. 여유 안의 RUN·이미 닫힌 행은 그대로")
    void sweepClosesStaleRunsOnly() {
        run("stale", "RUN", 2 * 3600, 60);
        run("withinMargin", "RUN", 100, 60);        // 100초 < 60 + 300
        run("justPast", "RUN", 400, 60);            // 400초 > 360초
        run("closed", "OK", 2 * 3600, 60);
        assertThat(store.sweep()).isEqualTo(2);
        assertThat(row("stale").get("STATUS")).isEqualTo("TIMEOUT");
        assertThat(String.valueOf(row("stale").get("MSG"))).contains("결과 없음");
        assertThat(row("justPast").get("STATUS")).isEqualTo("TIMEOUT");
        assertThat(row("withinMargin").get("STATUS")).isEqualTo("RUN");
        assertThat(row("closed").get("STATUS")).isEqualTo("OK");
        assertThat(store.sweep()).isZero();
    }

    @Test
    @DisplayName("실행 기록 보관 삭제 — 90일 지난 행만 덩어리로 지운다")
    void purgeRunsKeepsRecent() {
        run("old1", "OK", 91L * 86400, 60);
        run("old2", "FAIL", 100L * 86400, 60);
        run("recent", "OK", 89L * 86400, 60);
        assertThat(store.purgeRunsBefore(90, 1)).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT RUN_ID FROM MCMAPUSER.TB_MCM_JOB_RUN", String.class)).containsExactly("recent");
    }

    @Test
    @DisplayName("수집 값 보관 삭제 — 슬롯이 기준보다 작은 값만")
    void purgeCollectBySlot() {
        for (String slot : new String[] {"202601010000", "202607010000", "202610010000"}) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM) VALUES ('j', ?, 'K', 1)", slot);
        }
        assertThat(store.purgeCollectBefore("202607010000", 1000)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT SLOT FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA ORDER BY SLOT", String.class))
                .containsExactly("202607010000", "202610010000");
    }
}
```

- [ ] **Step 2: 호출 시험을 쓴다** (가짜 모듈 = JDK `HttpServer` 127.0.0.1, 실제 Oracle RUN 행)

```java
package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.AcceptResult;
import com.dongkuk.dmes.mcm.job.agent.JobRunAcceptor;
import com.dongkuk.dmes.mcm.job.agent.LocalJobRunGateway;
import com.dongkuk.dmes.mcm.job.server.JobCaller;
import com.dongkuk.dmes.mcm.job.server.JobRunStore;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/** MCM → 모듈 호출(설계 §4.3)의 응답별 처리 — 가짜 모듈 HTTP 서버와 실제 Oracle RUN 행. 재시도는 없다. */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobCallerOraTest {

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;

    private HttpServer server;
    private final Map<String, Object[]> scripted = new ConcurrentHashMap<>();   // runId → {status, body, delayMs}
    private final List<String> seenHeaders = new CopyOnWriteArrayList<>();
    private final AtomicInteger requests = new AtomicInteger();
    private JobCaller caller;
    private LocalJobRunGateway local;
    private ListAppender<ILoggingEvent> appender;
    private final Logger callerLog = (Logger) LoggerFactory.getLogger(JobCaller.class);

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/job/run", ex -> {
            requests.incrementAndGet();
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String runId = body.replaceAll("(?s).*\"runId\":\"([^\"]+)\".*", "$1");
            seenHeaders.add(ex.getRequestHeaders().getFirst("X-Client-Key") + "|" + ex.getRequestHeaders().getFirst("X-Authenticated-User") + "|"
                    + ex.getRequestHeaders().getFirst("X-Authenticated-Role") + "|" + (ex.getRequestHeaders().getFirst("X-Tx-Id") != null)
                    + "|" + ex.getRequestHeaders().getFirst("Content-Type"));
            Object[] script = scripted.getOrDefault(runId, new Object[] {202, "{\"accepted\":true,\"serverNm\":\"srv1\"}", 0});
            try {
                Thread.sleep((int) script[2]);
                byte[] out = ((String) script[1]).getBytes(StandardCharsets.UTF_8);
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders((int) script[0], out.length);
                ex.getResponseBody().write(out);
            } catch (Exception ignored) {
                // 클라이언트가 읽기 시간 초과로 끊었다
            } finally {
                ex.close();
            }
        });
        server.start();
        local = new LocalJobRunGateway(mock(JobRunAcceptor.class));
        caller = newCaller(Map.of("MDM", "http://127.0.0.1:" + server.getAddress().getPort()), 2, 10, Duration.ofSeconds(5));
        appender = new ListAppender<>();
        appender.start();
        callerLog.addAppender(appender);
    }

    private JobCaller newCaller(Map<String, String> urls, int threads, int queue, Duration read) {
        return new JobCaller(urls, JobModule.MCM, local, new JobRunStore(dataSource, "MCMAPUSER"), "test-key", threads, queue, Duration.ofSeconds(2), read);
    }

    @AfterEach
    void tearDown() {
        callerLog.detachAppender(appender);
        caller.close();
        try {
            server.stop(0);   // 연결 거부 시험은 이미 멈춰 있다
        } catch (RuntimeException ignored) {
            // 두 번 멈춰도 상관없다
        }
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
    }

    private JobRunRequest insertAndRequest(String runId, String module) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES (?, TIMESTAMP '2026-10-09 02:00:00', 'S', ?, ?, 'jobCode', 'RUN', SYSTIMESTAMP, 600)", "job-" + runId, runId, module);
        return new JobRunRequest(runId, "job-" + runId, module, "jobCode", "run", Map.of("a", 1), Map.of(), Map.of("handlerId", "h"), 600, null,
                "2026-10-09T02:00:00", false, null);
    }

    private Map<String, Object> awaitRow(String runId, String expectedStatus) throws Exception {
        for (int i = 0; i < 100; i++) {
            Map<String, Object> r = jdbc.queryForMap("SELECT STATUS, MSG, SERVER_NM FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = ?", runId);
            if (expectedStatus.equals(r.get("STATUS")) && (!"RUN".equals(expectedStatus) || r.get("SERVER_NM") != null)) return r;
            Thread.sleep(50);
        }
        return jdbc.queryForMap("SELECT STATUS, MSG, SERVER_NM FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = ?", runId);
    }

    private void script(String runId, int status, String body, int delayMs) {
        scripted.put(runId, new Object[] {status, body, delayMs});
    }

    @Test
    @DisplayName("202 접수 → SERVER_NM 만 기록하고 STATUS 는 RUN 그대로. 헤더는 키·system:mcm·SYSTEM·X-Tx-Id·JSON")
    void accepted() throws Exception {
        caller.submit(insertAndRequest("r1", "MDM"));
        Map<String, Object> row = awaitRow("r1", "RUN");
        assertThat(row.get("SERVER_NM")).isEqualTo("srv1");
        assertThat(row.get("STATUS")).isEqualTo("RUN");
        assertThat(seenHeaders).hasSize(1);
        assertThat(seenHeaders.get(0)).isEqualTo("test-key|system:mcm|SYSTEM|true|application/json");
    }

    @Test
    @DisplayName("200 {duplicate:true} 는 접수와 같게 처리한다")
    void duplicateIsAccepted() throws Exception {
        script("r1", 200, "{\"duplicate\":true}", 0);
        caller.submit(insertAndRequest("r1", "MDM"));
        Thread.sleep(500);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = 'r1'", String.class)).isEqualTo("RUN");
    }

    @Test
    @DisplayName("503 JOB_POOL_FULL → SKIP, 409 JOB_RUNNING → SKIP, 404 JOB_HANDLER_NOT_FOUND → FAIL")
    void definiteRejections() throws Exception {
        script("pool", 503, "{\"code\":\"JOB_POOL_FULL\"}", 0);
        script("busy", 409, "{\"code\":\"JOB_RUNNING\"}", 0);
        script("nohandler", 404, "{\"code\":\"JOB_HANDLER_NOT_FOUND\"}", 0);
        for (String id : List.of("pool", "busy", "nohandler")) caller.submit(insertAndRequest(id, "MDM"));
        assertThat(awaitRow("pool", "SKIP").get("MSG")).isEqualTo("실행 풀 가득");
        assertThat(awaitRow("busy", "SKIP").get("MSG")).isEqualTo("같은 서버에서 실행 중");
        assertThat(awaitRow("nohandler", "FAIL").get("MSG")).isEqualTo("처리기 없음");
    }

    @Test
    @DisplayName("그 밖의 4xx(400·401·403)는 확실히 접수 안 됨 → FAIL 「모듈 호출 실패」")
    void other4xxFails() throws Exception {
        for (int status : new int[] {400, 401, 403}) {
            String id = "r" + status;
            script(id, status, "{\"code\":\"X\"}", 0);
            caller.submit(insertAndRequest(id, "MDM"));
            assertThat(String.valueOf(awaitRow(id, "FAIL").get("MSG"))).startsWith("모듈 호출 실패");
        }
    }

    @Test
    @DisplayName("접수됐는지 모르는 경우(5xx 일반·우리 코드가 없는 503)는 RUN 으로 둔다 — FAIL 로 바꾸면 모듈의 OK 갱신이 0행이 된다")
    void uncertainStaysRunning() throws Exception {
        script("e500", 500, "oops", 0);
        script("lb503", 503, "<html>upstream down</html>", 0);
        caller.submit(insertAndRequest("e500", "MDM"));
        caller.submit(insertAndRequest("lb503", "MDM"));
        Thread.sleep(700);
        assertThat(jdbc.queryForList("SELECT STATUS FROM MCMAPUSER.TB_MCM_JOB_RUN ORDER BY RUN_ID", String.class)).containsExactly("RUN", "RUN");
        assertThat(appender.list).filteredOn(e -> e.getLevel().toString().equals("WARN")).hasSize(2);
    }

    @Test
    @DisplayName("읽기 시간 초과는 RUN 유지 + 같은 요청을 다시 보내지 않는다(재시도 없음)")
    void readTimeoutKeepsRunAndDoesNotRetry() throws Exception {
        caller.close();
        caller = newCaller(Map.of("MDM", "http://127.0.0.1:" + server.getAddress().getPort()), 2, 10, Duration.ofMillis(300));
        script("slow", 202, "{\"accepted\":true}", 1500);
        caller.submit(insertAndRequest("slow", "MDM"));
        Thread.sleep(2200);
        assertThat(requests.get()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = 'slow'", String.class)).isEqualTo("RUN");
    }

    @Test
    @DisplayName("연결 거부·주소 설정 없음은 즉시 FAIL — 메시지에 주소가 없다")
    void connectionRefusedAndMissingUrl() throws Exception {
        int deadPort = server.getAddress().getPort();
        server.stop(0);
        caller.submit(insertAndRequest("refused", "MDM"));
        String msg = String.valueOf(awaitRow("refused", "FAIL").get("MSG"));
        assertThat(msg).startsWith("모듈 호출 실패").doesNotContain("127.0.0.1").doesNotContain(String.valueOf(deadPort)).doesNotContain("http");
        caller.submit(insertAndRequest("nourl", "MPP"));
        assertThat(String.valueOf(awaitRow("nourl", "FAIL").get("MSG"))).contains("주소");
    }

    @Test
    @DisplayName("모듈의 OK 갱신이 접수 기록보다 먼저 와도 최종 상태는 모듈 결과다(접수 기록은 SERVER_NM 만)")
    void moduleResultWinsOverAcceptBookkeeping() throws Exception {
        script("race", 202, "{\"accepted\":true,\"serverNm\":\"mcm-view\"}", 400);
        caller.submit(insertAndRequest("race", "MDM"));
        Thread.sleep(100);
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_RUN SET STATUS = 'OK', SERVER_NM = NVL(SERVER_NM, 'module-view') WHERE RUN_ID = 'race' AND STATUS = 'RUN'");
        Thread.sleep(800);
        Map<String, Object> row = jdbc.queryForMap("SELECT STATUS, SERVER_NM FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = 'race'");
        assertThat(row.get("STATUS")).isEqualTo("OK");
        assertThat(row.get("SERVER_NM")).isEqualTo("module-view");
    }

    @Test
    @DisplayName("MCM 자신의 작업은 HTTP 없이 접수 쪽을 직접 부른다")
    void mcmCallsLocalWithoutHttp() throws Exception {
        JobRunAcceptor acceptor = mock(JobRunAcceptor.class);
        when(acceptor.accept(any())).thenReturn(new AcceptResult(202, Map.of("accepted", true, "serverNm", "local-srv")));
        local = new LocalJobRunGateway(acceptor);
        caller.close();
        caller = newCaller(Map.of("MCM", "http://127.0.0.1:1"), 2, 10, Duration.ofSeconds(5));
        caller.submit(insertAndRequest("loc", "MCM"));
        assertThat(awaitRow("loc", "RUN").get("SERVER_NM")).isEqualTo("local-srv");
        assertThat(requests.get()).isZero();
        verify(acceptor).accept(any());
    }

    @Test
    @DisplayName("호출 대기열(200)이 가득이면 그 회차를 SKIP 「호출 대기열 가득」으로 닫는다")
    void queueFull() throws Exception {
        caller.close();
        caller = newCaller(Map.of("MDM", "http://127.0.0.1:" + server.getAddress().getPort()), 1, 1, Duration.ofSeconds(5));
        for (String id : List.of("q1", "q2", "q3")) script(id, 202, "{\"accepted\":true}", 800);
        for (String id : List.of("q1", "q2", "q3")) caller.submit(insertAndRequest(id, "MDM"));
        assertThat(awaitRow("q3", "SKIP").get("MSG")).isEqualTo("호출 대기열 가득");
    }

    @Test
    @DisplayName("호출 로그는 mcm 업무 로그의 jobDispatch 서비스(MDC serviceId·runId)로 남고 주소·키는 없다")
    void callLogCarriesDispatchServiceMdc() throws Exception {
        caller.submit(insertAndRequest("logrun", "MDM"));
        awaitRow("logrun", "RUN");
        assertThat(appender.list).isNotEmpty().allSatisfy(e -> {
            assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "jobDispatch").containsEntry("runId", "logrun");
            assertThat(e.getFormattedMessage()).doesNotContain("127.0.0.1").doesNotContain("test-key");
        });
    }
}
```

- [ ] **Step 3: 실패를 확인한다** — `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobRunStoreOraTest' --tests '*JobCallerOraTest'` → 컴파일 실패.

- [ ] **Step 4: `JobRunStore` 를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.server;

import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * MCM 쪽 RUN·COLLECT_DATA SQL(설계 §4.3·§4.6). 호출 풀의 UPDATE 는 트랜잭션 없는 JdbcTemplate 한 문장이다(자동 커밋).
 * 접수 기록은 SERVER_NM 만 쓰고 STATUS 를 건드리지 않아 먼저 끝난 모듈의 결과 갱신과 경합하지 않는다.
 */
public class JobRunStore {

    static final int CLEANUP_MARGIN_SEC = 300;
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    private static final int MAX_CHUNKS = 2000;

    private final JdbcTemplate jdbc;
    private final String acceptedSql;
    private final String closeSql;
    private final String sweepSql;
    private final String purgeRunsSql;
    private final String purgeCollectSql;

    public JobRunStore(DataSource dataSource, String schema) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = new JdbcTemplate(dataSource);
        this.acceptedSql = """
                UPDATE %1$s.TB_MCM_JOB_RUN
                SET    SERVER_NM = NVL(SERVER_NM, ?)
                     , U_AT = %2$s
                     , U_USR_ID = 'SCHEDULER'
                     , U_PGM_ID = 'JobCaller'
                WHERE  RUN_ID = ?
                """.formatted(schema, NOW);
        this.closeSql = """
                UPDATE %1$s.TB_MCM_JOB_RUN
                SET    STATUS = ?
                     , MSG = ?
                     , ENDED_AT = %2$s
                     , U_AT = %2$s
                     , U_USR_ID = 'SCHEDULER'
                     , U_PGM_ID = 'JobCaller'
                     , VER = VER + 1
                WHERE  RUN_ID = ?
                AND    STATUS = 'RUN'
                """.formatted(schema, NOW);
        this.sweepSql = """
                UPDATE %1$s.TB_MCM_JOB_RUN
                SET    STATUS = 'TIMEOUT'
                     , MSG = '결과 없음 — 모듈 서버가 도중에 죽었을 수 있음'
                     , ENDED_AT = %2$s
                     , U_AT = %2$s
                     , U_USR_ID = 'SCHEDULER'
                     , U_PGM_ID = 'JobRunSweep'
                     , VER = VER + 1
                WHERE  STATUS = 'RUN'
                AND    STARTED_AT + NUMTODSINTERVAL(TIMEOUT_SEC + %3$d, 'SECOND') < %2$s
                """.formatted(schema, NOW, CLEANUP_MARGIN_SEC);
        this.purgeRunsSql = """
                DELETE FROM %1$s.TB_MCM_JOB_RUN
                WHERE  STARTED_AT < %2$s - NUMTODSINTERVAL(?, 'DAY')
                AND    ROWNUM <= ?
                """.formatted(schema, NOW);
        this.purgeCollectSql = """
                DELETE FROM %1$s.TB_MCM_JOB_COLLECT_DATA
                WHERE  SLOT < ?
                AND    ROWNUM <= ?
                """.formatted(schema);
    }

    public int markAccepted(String runId, String serverNm) {
        return jdbc.update(acceptedSql, serverNm, runId);
    }

    public int closeIfRunning(String runId, String status, String msg) {
        return jdbc.update(closeSql, status, msg, runId);
    }

    public int sweep() {
        return jdbc.update(sweepSql);
    }

    /** 보관 기간(일)이 지난 실행 기록을 덩어리로 지운다. 한 번의 작업 트랜잭션 안에서 0 이 될 때까지(최대 2000덩어리). */
    public int purgeRunsBefore(int days, int chunkRows) {
        return loop(() -> jdbc.update(purgeRunsSql, days, chunkRows));
    }

    public int purgeCollectBefore(String cutoffSlot, int chunkRows) {
        return loop(() -> jdbc.update(purgeCollectSql, cutoffSlot, chunkRows));
    }

    private static int loop(java.util.function.IntSupplier chunk) {
        int total = 0;
        for (int i = 0; i < MAX_CHUNKS; i++) {
            int n = chunk.getAsInt();
            if (n == 0) break;
            total += n;
        }
        return total;
    }
}
```

- [ ] **Step 5: `JobCaller` 를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.AcceptResult;
import com.dongkuk.dmes.mcm.job.agent.LocalJobRunGateway;
import com.dongkuk.oasis.logger.MDCTemplate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

/**
 * MCM → 모듈 호출(설계 §4.3) — BPMN 트랜잭션 밖의 전용 풀(스레드 8, 대기열 200)에서 {@code POST {base-url}/internal/job/run} 을 보낸다.
 * HTTP 를 기다리는 동안 행 잠금·DB 연결을 쥐지 않는다. 호출 한 건은 새 {@code service_tag} 와 MDC {@code serviceId=jobDispatch}·{@code runId} 로 감싸
 * (호출 풀 스레드는 트리거의 MDC 를 물려받지 않는다) <b>mcm 업무 로그</b>에 남긴다. 주소·인증값은 로그와 기록에 넣지 않는다.
 *
 * <p>응답별 처리: 202·200(duplicate) → SERVER_NM 만 기록(STATUS 는 건드리지 않음) / 503 JOB_POOL_FULL → SKIP / 409 JOB_RUNNING → SKIP /
 * 404 JOB_HANDLER_NOT_FOUND → FAIL / 연결 거부·주소 없음·연결 시간 초과·그 밖의 4xx → FAIL(종류만) / <b>읽기 시간 초과·일반 5xx·우리 코드가 없는 503·읽는 중 끊김 →
 * RUN 유지</b>(접수됐는지 모른다 — 모듈의 결과 갱신이나 정리에 맡긴다). 재시도는 없다. MCM 자신의 모듈은 {@link LocalJobRunGateway} 로 직접 접수한다.
 */
public class JobCaller implements JobCallSink, AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(JobCaller.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    static final String SERVICE_ID = "jobDispatch";

    private final Map<String, String> baseUrls;
    private final JobModule localModule;
    private final LocalJobRunGateway local;
    private final JobRunStore store;
    private final String clientKey;
    private final Duration readTimeout;
    private final HttpClient http;
    private final ThreadPoolExecutor pool;

    public JobCaller(Map<String, String> baseUrls, JobModule localModule, LocalJobRunGateway local, JobRunStore store, String clientKey,
                     int threads, int queue, Duration connectTimeout, Duration readTimeout) {
        this.baseUrls = baseUrls;
        this.localModule = localModule;
        this.local = local;
        this.store = store;
        this.clientKey = clientKey;
        this.readTimeout = readTimeout;
        this.http = HttpClient.newBuilder().connectTimeout(connectTimeout).followRedirects(HttpClient.Redirect.NEVER).build();
        int n = Math.max(1, threads);
        this.pool = new ThreadPoolExecutor(n, n, 60, TimeUnit.SECONDS, new ArrayBlockingQueue<>(Math.max(1, queue)), r -> {
            Thread t = new Thread(r, "job-call");
            t.setDaemon(true);
            return t;
        }, new ThreadPoolExecutor.AbortPolicy());
    }

    @Override
    public void submit(JobRunRequest request) {
        try {
            pool.execute(() -> new MDCTemplate() {
                @Override
                public void process() {
                    MDC.put("serviceId", SERVICE_ID);
                    MDC.put("runId", request.runId());
                    call(request);
                }
            }.mdc(null));
        } catch (RejectedExecutionException e) {
            MDC.put("runId", request.runId());
            try {
                log.warn("호출 대기열이 가득이라 이 회차를 건너뜁니다 jobId={} runId={}", request.jobId(), request.runId());
            } finally {
                MDC.remove("runId");
            }
            store.closeIfRunning(request.runId(), "SKIP", "호출 대기열 가득");
        }
    }

    private void call(JobRunRequest req) {
        try {
            AcceptResult result = localModule.name().equalsIgnoreCase(req.module()) ? local.call(req) : post(req);
            handle(req, result);
        } catch (CallFailure f) {
            log.warn("모듈 호출 실패 jobId={} runId={} module={} 종류={}", req.jobId(), req.runId(), req.module(), f.kind);
            store.closeIfRunning(req.runId(), "FAIL", f.message);
        } catch (Uncertain u) {
            log.warn("모듈 호출 결과를 알 수 없어 RUN 으로 둡니다 jobId={} runId={} module={} 종류={}", req.jobId(), req.runId(), req.module(), u.kind);
        } catch (RuntimeException e) {
            log.warn("모듈 호출 처리 오류 jobId={} runId={} 종류={}", req.jobId(), req.runId(), e.getClass().getSimpleName());
        }
    }

    private void handle(JobRunRequest req, AcceptResult r) {
        String code = r.body().get("code") == null ? "" : String.valueOf(r.body().get("code"));
        switch (r.status()) {
            case 202, 200 -> {
                store.markAccepted(req.runId(), r.body().get("serverNm") == null ? null : String.valueOf(r.body().get("serverNm")));
                log.info("예약 작업 호출 접수 jobId={} runId={} module={}", req.jobId(), req.runId(), req.module());
            }
            case 503 -> {
                if ("JOB_POOL_FULL".equals(code)) {
                    store.closeIfRunning(req.runId(), "SKIP", "실행 풀 가득");
                    log.info("예약 작업 호출 건너뜀(실행 풀 가득) jobId={} runId={} module={}", req.jobId(), req.runId(), req.module());
                } else {
                    throw new Uncertain("503");
                }
            }
            case 409 -> {
                store.closeIfRunning(req.runId(), "SKIP", "같은 서버에서 실행 중");
                log.info("예약 작업 호출 건너뜀(같은 서버에서 실행 중) jobId={} runId={} module={}", req.jobId(), req.runId(), req.module());
            }
            case 404 -> {
                if ("JOB_HANDLER_NOT_FOUND".equals(code)) throw new CallFailure("처리기 없음", "JOB_HANDLER_NOT_FOUND");
                throw new CallFailure("모듈 호출 실패(HTTP 404)", "HTTP404");
            }
            default -> {
                if (r.status() >= 400 && r.status() < 500) throw new CallFailure("모듈 호출 실패(HTTP " + r.status() + ")", "HTTP" + r.status());
                throw new Uncertain("HTTP" + r.status());
            }
        }
    }

    private AcceptResult post(JobRunRequest req) {
        String base = baseUrls.get(req.module().toLowerCase(Locale.ROOT));
        if (base == null) base = baseUrls.get(req.module().toUpperCase(Locale.ROOT));
        if (base == null || base.isBlank()) throw new CallFailure("모듈 호출 실패(주소 설정 없음)", "NoBaseUrl");
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(base.replaceAll("/+$", "") + "/internal/job/run"))
                    .timeout(readTimeout)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("X-Client-Key", clientKey)
                    .header("X-Authenticated-User", "system:mcm")
                    .header("X-Authenticated-Role", "SYSTEM")
                    .header("X-Tx-Id", UUID.randomUUID().toString())
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(req)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            return new AcceptResult(response.statusCode(), parse(response.body()));
        } catch (HttpConnectTimeoutException | ConnectException e) {
            throw new CallFailure("모듈 호출 실패(" + e.getClass().getSimpleName() + ")", e.getClass().getSimpleName());
        } catch (IOException e) {
            throw new Uncertain(e.getClass().getSimpleName());   // 읽기 시간 초과·읽는 중 끊김 — 접수됐는지 모른다
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Uncertain("Interrupted");
        } catch (IllegalArgumentException e) {
            throw new CallFailure("모듈 호출 실패(주소 형식)", "BadUrl");
        }
    }

    private static Map<String, Object> parse(String body) {
        try {
            JsonNode n = JSON.readTree(body == null ? "" : body);
            return n != null && n.isObject() ? JSON.convertValue(n, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}) : Map.of();
        } catch (IOException e) {
            return Map.of();
        }
    }

    @Override
    public void close() {
        pool.shutdownNow();
    }

    /** 확실히 접수 안 됨 → FAIL. message 는 실행 기록 MSG 로 가므로 주소·원문을 담지 않는다. */
    private static final class CallFailure extends RuntimeException {
        final String message;
        final String kind;

        CallFailure(String message, String kind) {
            super(null, null, false, false);
            this.message = message;
            this.kind = kind;
        }
    }

    /** 접수 여부를 모른다 → RUN 유지. */
    private static final class Uncertain extends RuntimeException {
        final String kind;

        Uncertain(String kind) {
            super(null, null, false, false);
            this.kind = kind;
        }
    }
}
```

`handle` 의 `case 202, 200` 은 **200 일 때 본문에 `duplicate:true`** 이므로 같은 처리이다(`duplicate` 키는 보지 않는다).

- [ ] **Step 6: 코드 작업 3개와 빈 조립 — `JobServerConfig` 에 더한다**

```java
    @Bean
    public JobRunStore jobRunStore(ObjectProvider<DataSource> dataSource, JobProperties props) {
        return new JobRunStore(dataSource.getObject(), props.getSchema());
    }

    /** MCM → 모듈 호출 풀(스레드 8, 대기열 200, 연결 2초·읽기 5초). 키는 ClientKeyFilter 와 같은 우선순위(환경 변수 BACKEND_CLIENT_KEY > cactus.security.client-key). */
    @Bean(destroyMethod = "close")
    public JobCaller jobCaller(JobProperties props, JobAppInfo app, LocalJobRunGateway local, JobRunStore store,
                               @Value("${cactus.security.client-key:}") String configuredKey) {
        Map<String, String> urls = new LinkedHashMap<>();
        props.getModules().forEach((module, target) -> urls.put(module.toLowerCase(Locale.ROOT), target.getBaseUrl()));
        String env = System.getenv("BACKEND_CLIENT_KEY");
        String key = env != null && !env.isBlank() ? env : configuredKey;
        return new JobCaller(urls, app.module(), local, store, key, 8, 200, Duration.ofSeconds(2), Duration.ofSeconds(5));
    }

    /** 정리: 멈춘 RUN → TIMEOUT. 5분마다. */
    @Bean
    public ScheduledJob mcmJobRunSweep(JobRunStore store) {
        return new SimpleScheduledJob("mcm.jobRunSweep", JobModule.MCM, "멈춘 실행 정리", "*/5 * * * *", Duration.ofMinutes(5), ctx -> store.sweep());
    }

    /** 실행 기록 90일 보관 삭제(D7). */
    @Bean
    public ScheduledJob mcmJobRunPurge(JobRunStore store) {
        return new SimpleScheduledJob("mcm.jobRunPurge", JobModule.MCM, "실행 기록 보관 삭제", "40 3 * * *", Duration.ofMinutes(30),
                ctx -> store.purgeRunsBefore(90, 5000));
    }

    /** 수집 값 90일 보관 삭제. {@code dmes.job.collect.enabled=false} 면 아무것도 하지 않는다. */
    @Bean
    public ScheduledJob mcmCollectPurge(JobRunStore store, JobProperties props) {
        return new SimpleScheduledJob("mcm.collectPurge", JobModule.MCM, "수집 값 보관 삭제", "30 3 * * *", Duration.ofMinutes(30), ctx -> {
            if (!props.getCollect().isEnabled()) return 0;
            String cutoff = DateTimeFormatter.ofPattern("yyyyMMddHHmm").format(LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(90).atStartOfDay());
            return store.purgeCollectBefore(cutoff, 5000);
        });
    }
```
필요한 import(`Value`·`LinkedHashMap`·`Locale`·`Map`·`Duration`·`LocalDate`·`ZoneId`·`DateTimeFormatter`·`JobAppInfo`·`LocalJobRunGateway`·`JobModule`·`ScheduledJob`·`SimpleScheduledJob`)를 더한다. `JobAppInfo`·`LocalJobRunGateway` 는 Task 5 의 `JobAgentConfig`(agent 기본 켜짐)가 올린다.

- [ ] **Step 7: 조립·코드 작업 시험을 쓴다**

```java
package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class McmCodeJobsTest {

    private final JobServerConfig config = new JobServerConfig();
    private final JobRunStore store = mock(JobRunStore.class);

    @Test
    @DisplayName("정리·삭제 코드 작업의 id·모듈·기본 일정·시간 초과 — id 규칙과 crontab 식 검사를 통과한다")
    void definitions() {
        JobProperties props = new JobProperties();
        for (ScheduledJob job : new ScheduledJob[] {config.mcmJobRunSweep(store), config.mcmJobRunPurge(store), config.mcmCollectPurge(store, props)}) {
            assertThat(Pattern.matches("^[A-Za-z0-9_.-]{1,60}$", job.id())).as(job.id()).isTrue();
            assertThat(job.module()).isEqualTo(JobModule.MCM);
            assertThat(CronSpec.validate(job.defaultCron())).as(job.id()).isEmpty();
        }
        assertThat(config.mcmJobRunSweep(store).defaultCron()).isEqualTo("*/5 * * * *");
        assertThat(config.mcmJobRunPurge(store).defaultCron()).isEqualTo("40 3 * * *");
        assertThat(config.mcmCollectPurge(store, props).defaultCron()).isEqualTo("30 3 * * *");
        assertThat(config.mcmJobRunSweep(store).defaultTimeout().toMinutes()).isEqualTo(5);
    }

    private static JobContext ctx() {
        return new JobContext("j", "r", Map.of(), LocalDateTime.of(2026, 10, 9, 3, 30), false);
    }

    @Test
    @DisplayName("collect.enabled=false 면 mcm.collectPurge 는 아무것도 지우지 않는다")
    void collectPurgeDoesNothingWhenDisabled() {
        JobProperties props = new JobProperties();
        props.getCollect().setEnabled(false);
        assertThat(config.mcmCollectPurge(store, props).run(ctx())).isZero();
        verify(store, never()).purgeCollectBefore(anyString(), anyInt());
    }

    @Test
    @DisplayName("켜져 있으면 90일 전 0시 슬롯(yyyyMMddHHmm) 이전 값을 지운다 / 실행 기록은 90일, 정리는 sweep")
    void purgeAndSweepCallStore() {
        org.mockito.Mockito.when(store.purgeCollectBefore(anyString(), anyInt())).thenReturn(7);
        org.mockito.Mockito.when(store.purgeRunsBefore(anyInt(), anyInt())).thenReturn(3);
        org.mockito.Mockito.when(store.sweep()).thenReturn(2);
        assertThat(config.mcmCollectPurge(store, new JobProperties()).run(ctx())).isEqualTo(7);
        verify(store).purgeCollectBefore(org.mockito.ArgumentMatchers.matches("\\d{12}"), anyInt());
        assertThat(config.mcmJobRunPurge(store).run(ctx())).isEqualTo(3);
        verify(store).purgeRunsBefore(90, 5000);
        assertThat(config.mcmJobRunSweep(store).run(ctx())).isEqualTo(2);
    }
}
```

```java
package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.mcm.job.JobConfig;
import com.dongkuk.oasis.service.ServiceStarter;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** 서버 쪽 빈은 dmes.job.server.enabled=true 일 때만 — 앱 한 대(MCM)만 판정·호출을 한다. 연결은 맺지 않는다(더미 주소). */
class JobServerConfigWiringTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(JobConfig.class)
            .withBean(DataSource.class, () -> new DriverManagerDataSource("jdbc:oracle:thin:@//localhost:1/none", "u", "p"))
            .withBean(ServiceStarter.class, () -> mock(ServiceStarter.class))
            .withBean(JobRunDispatcher.class, () -> mock(JobRunDispatcher.class))
            .withPropertyValues("spring.application.name=mcm");

    @Test
    @DisplayName("server.enabled 기본(false) — 판정·호출 빈이 없다(모듈 앱은 접수 쪽만)")
    void disabledByDefault() {
        runner.run(ctx -> {
            assertThat(ctx).doesNotHaveBean(JobDispatchService.class).doesNotHaveBean(JobCaller.class).doesNotHaveBean(JobDispatchTrigger.class);
            assertThat(ctx).hasBean("jobRunController").hasBean("jobCodeService").hasBean("jobQueryService").hasBean("jobCollectService");
        });
    }

    @Test
    @DisplayName("server.enabled=true — 판정 서비스·트리거·호출 풀·저장소·정리 코드 작업이 올라온다. BPMN 이 쓰는 빈 이름은 jobDispatchService")
    void enabled() {
        runner.withPropertyValues("dmes.job.server.enabled=true", "dmes.job.modules.mdm.base-url=http://localhost:8096").run(ctx -> {
            assertThat(ctx).hasBean("jobDispatchService").hasSingleBean(JobDispatchTrigger.class).hasSingleBean(JobCaller.class).hasSingleBean(JobRunStore.class);
            assertThat(ctx).hasBean("mcmJobRunSweep").hasBean("mcmJobRunPurge").hasBean("mcmCollectPurge");
            assertThat(ctx.getBean(JobCallSink.class)).isSameAs(ctx.getBean(JobCaller.class));
        });
    }
}
```

- [ ] **Step 8: 실행한다**
  - `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 --tests '*McmCodeJobsTest' --tests '*JobServerConfigWiringTest'` → PASS
  - `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobRunStoreOraTest' --tests '*JobCallerOraTest'` → PASS (호출 시험은 Task 8 의 읽기 시간 초과 시험이 2초 넘게 걸린다)
  - `JobServerConfigWiringTest` 에서 `JobAppInfo`·`LocalJobRunGateway` 빈이 없다는 오류가 나면(스캔·`@Import` 순서) `JobConfig` 의 `@Import` 가 `JobAgentConfig` 를 포함하는지 먼저 본다.

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/mcm-core/src
/usr/bin/git commit -m "$(printf 'feat(mcm-core): 예약 작업 모듈 호출 풀과 멈춘 실행 정리·보관 삭제 코드 작업을 더한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 9: 기존 `@Scheduled` 이관 + 모듈 yml + 모듈 앱 기동 확인

**담당 후보:** GLM 또는 opencode  
**Model:** sonnet/high

설계 §5.2(코드 작업 5개)·§6(`@Scheduled` 이관)·§4.7(설정 키)·§9(「다른 모듈 앱 기동 시험」). **위젯 collect 백엔드 삭제는 Task 6 에서 이미 했다**(계획 D2). 코드 작업 5개 중 정리·삭제 3개는 Task 8 에서 이미 올렸고, 이 Task 는 나머지 2개(`mcm.screenUsageRollup`·`mcm.revokedTokenPurge`)와 기존 클래스의 `@Scheduled` 제거를 맡는다.

**Files:**
- Modify: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollup.java`, `.../audit/service/RevokedTokenPurger.java`, `.../mcm/job/server/JobServerConfig.java`
- Delete(`git rm`): `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollupScheduleTest.java`
- Modify(yml, 각 파일을 먼저 읽는다): `src/backend/{mcm,mdm,mpp,mls,mqc,mpn}/api/src/main/resources/application.yml`, `src/backend/mcm/api/src/main/resources/application-prod.yml`
- Test: `.../mcm/job/server/McmLegacyJobsTest.java`, `.../mcm/job/NoStraySchedulingTest.java`, `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/job/JobAgentWiringTest.java`

**Interfaces:**
- Consumes: `SimpleScheduledJob`·`ScheduledJob`(Task 5), `JobServerConfig`(Task 7·8).
- Produces: 빈 `mcmScreenUsageRollup`(`mcm.screenUsageRollup`, `0 2 * * *`, 30분)·`mcmRevokedTokenPurge`(`mcm.revokedTokenPurge`, `0 * * * *`, 10분); `RevokedTokenPurger#purgeExpired(): int`(예외를 던진다 — 코드 작업이 FAIL 로 기록한다), `purge()` 는 공개 메서드로 유지(예외를 삼키는 옛 동작).

- [ ] **Step 1: 시험을 쓴다**

```java
package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.audit.service.RevokedTokenPurger;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageRollup;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

class McmLegacyJobsTest {

    private final JobServerConfig config = new JobServerConfig();
    private static final JobContext CTX = new JobContext("j", "r", Map.of(), LocalDateTime.of(2026, 10, 9, 2, 0), false);

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> provider(T bean) {
        ObjectProvider<T> p = mock(ObjectProvider.class);
        when(p.getObject()).thenReturn(bean);
        return p;
    }

    @Test
    @DisplayName("mcm.screenUsageRollup — 매일 02:00, 30분, 기존 rollup() 을 그대로 부르고 집계한 일수가 건수")
    void screenUsageRollup() {
        ScreenUsageRollup rollup = mock(ScreenUsageRollup.class);
        when(rollup.rollup()).thenReturn(new ScreenUsageRollup.Result(3, 5));
        ScheduledJob job = config.mcmScreenUsageRollup(provider(rollup));
        assertThat(job.id()).isEqualTo("mcm.screenUsageRollup");
        assertThat(job.module()).isEqualTo(JobModule.MCM);
        assertThat(job.defaultCron()).isEqualTo("0 2 * * *");
        assertThat(CronSpec.validate(job.defaultCron())).isEmpty();
        assertThat(job.defaultTimeout().toMinutes()).isEqualTo(30);
        assertThat(job.run(CTX)).isEqualTo(3);
        verify(rollup).rollup();
    }

    @Test
    @DisplayName("mcm.revokedTokenPurge — 매시 정각, 10분, 지운 수가 건수. 실패는 삼키지 않고 올려서 FAIL 로 기록된다")
    void revokedTokenPurge() {
        RevokedTokenPurger purger = mock(RevokedTokenPurger.class);
        when(purger.purgeExpired()).thenReturn(4).thenThrow(new IllegalStateException("db down"));
        ScheduledJob job = config.mcmRevokedTokenPurge(provider(purger));
        assertThat(job.id()).isEqualTo("mcm.revokedTokenPurge");
        assertThat(job.defaultCron()).isEqualTo("0 * * * *");
        assertThat(job.defaultTimeout().toMinutes()).isEqualTo(10);
        assertThat(job.run(CTX)).isEqualTo(4);
        assertThatThrownBy(() -> job.run(CTX)).isInstanceOf(IllegalStateException.class);
    }
}
```

```java
package com.dongkuk.dmes.mcm.job;

import com.dongkuk.dmes.mcm.job.server.JobDispatchTrigger;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;

/** 예약 작업은 DB 정의로 돌린다(설계 §6) — mcm-core 의 {@code @Scheduled} 는 매분 깨우는 판정 트리거 하나뿐이다. */
class NoStraySchedulingTest {

    @Test
    @DisplayName("mcm-core 에서 @Scheduled 가 붙은 메서드는 JobDispatchTrigger 에만 있다")
    void onlyTheDispatchTriggerIsScheduled() {
        ArchRule rule = methods().that().areAnnotatedWith(Scheduled.class).should().beDeclaredIn(JobDispatchTrigger.class);
        rule.check(new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("com.dongkuk.dmes.mcm"));
    }
}
```

- [ ] **Step 2: 실패를 확인한다** — `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 --tests '*McmLegacyJobsTest' --tests '*NoStraySchedulingTest'` → 컴파일/단언 실패.

- [ ] **Step 3: 기존 클래스에서 `@Scheduled` 를 뺀다** (공개 메서드는 유지한다)

`ScreenUsageRollup`: `@Scheduled(cron = "0 0 2 * * *", zone = "Asia/Seoul")` 어노테이션과 `scheduledRollup()` 메서드 전체, `import org.springframework.scheduling.annotation.Scheduled;` 를 지운다. `rollup()`·`Result` 는 그대로다. 클래스 설명의 「매일 02:00 Asia/Seoul」 문장 끝에 「(2026-10-09 부터 일정은 예약 작업 `mcm.screenUsageRollup` 이 DB 정의로 정한다)」를 덧붙인다.

`RevokedTokenPurger`: `@Scheduled(fixedDelay = 3_600_000L, initialDelay = 60_000L)` 와 import 를 지우고 아래로 바꾼다.

```java
    /** 만료된 회수 토큰을 지운다. 실패는 예외로 올린다 — 예약 작업 {@code mcm.revokedTokenPurge} 가 FAIL 로 기록한다. */
    public int purgeExpired() {
        int deleted = revokedTokenRepository.purgeExpired(Instant.now());
        if (deleted > 0) {
            log.info("RevokedTokenPurger: {} 개 만료 토큰 정리", deleted);
        }
        return deleted;
    }

    /** 옛 동작 유지(공개 메서드) — 실패를 삼키고 로그만 남긴다. 일정은 더 이상 이 클래스가 정하지 않는다. */
    public void purge() {
        try {
            purgeExpired();
        } catch (Exception e) {
            log.warn("RevokedTokenPurger 실패 (swallow): {}", e.getMessage());
        }
    }
```
클래스 설명의 「매 시간」 문장도 「(일정은 예약 작업 `mcm.revokedTokenPurge`)」로 고친다.

`ScreenUsageRollupScheduleTest` 는 `git rm` 한다(cron 어노테이션과 삼킴 동작을 단언하던 시험 — 클래스에서 사라졌다). `ScreenUsageRollupJpaTest` 는 `rollup()` 을 부르므로 그대로 통과해야 한다.

`JobServerConfig` 에 코드 작업 2개를 더한다:

```java
    /** 화면 사용 일별 집계 — 기존 {@code ScreenUsageRollup#rollup()} 을 그대로 부른다. 건수는 집계한 일수. */
    @Bean
    public ScheduledJob mcmScreenUsageRollup(ObjectProvider<ScreenUsageRollup> rollup) {
        return new SimpleScheduledJob("mcm.screenUsageRollup", JobModule.MCM, "화면 사용 일별 집계", "0 2 * * *", Duration.ofMinutes(30),
                ctx -> rollup.getObject().rollup().days());
    }

    /** 만료된 회수 토큰 정리 — 매시. 건수는 지운 수. */
    @Bean
    public ScheduledJob mcmRevokedTokenPurge(ObjectProvider<RevokedTokenPurger> purger) {
        return new SimpleScheduledJob("mcm.revokedTokenPurge", JobModule.MCM, "만료 토큰 정리", "0 * * * *", Duration.ofMinutes(10),
                ctx -> purger.getObject().purgeExpired());
    }
```
(`ScreenUsageRollup`·`RevokedTokenPurger` import 추가. 두 클래스는 MCM 앱이 스캔하는 빈이라 `ObjectProvider` 로 늦게 받는다.)

- [ ] **Step 4: mcm-core 시험을 통과시킨다** — `../gradlew test --max-workers=2 --tests '*McmLegacyJobsTest' --tests '*NoStraySchedulingTest' --tests '*McmCodeJobsTest' --tests '*McmCoreArchitectureTest'` → PASS. 이어서 `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*ScreenUsageRollup*'` → PASS(`rollup()` 동작 불변).

- [ ] **Step 5: 모듈 yml 을 고친다** — **각 파일을 먼저 읽는다.** 최상위 키 `dmes:` 가 이미 있으면 그 아래에 `job:` 만 합치고(같은 최상위 키가 둘이면 기동이 실패한다), 없으면 파일 끝에 `dmes:` 를 새로 둔다. 확인: `grep -n '^dmes:' src/backend/{mcm,mdm,mpp,mls,mqc,mpn}/api/src/main/resources/application.yml` — mcm 에만 있다.

`mcm/api/.../application.yml` 의 기존 `dmes:` 블록(`datasource`·`client-ip`·`widget` 다음)에 더한다:

```yaml
  # ── 예약 작업(docs/superpowers/specs/2026-10-08-job-scheduler-design.md §4.7) ──
  # MCM 앱만 server.enabled=true — 매분 판정·선점·모듈 호출·관리 화면. 모듈 앱(mdm 등)은 접수(/internal/job/run)만 한다.
  # modules.<모듈>.base-url 은 MCM 이 모듈을 부르는 주소이다. 기본값은 기존 <모듈>_WAS_URL 환경 변수 관례와 로컬 포트(워크트리 서버는 환경 변수로 덮어쓴다).
  # 모듈이 여러 대면 LB 주소를 준다(LB 는 /internal/job/run 을 다른 서버로 재시도하지 않게 설정 — nginx proxy_next_upstream off).
  job:
    module: mcm
    server:
      enabled: true
      batch-size: 50
    modules:
      mcm: { base-url: "${MCM_WAS_URL:http://localhost:8100}" }   # MCM 자신은 LocalJobRunGateway 로 직접 부르므로 쓰지 않는다
      mdm: { base-url: "${MDM_WAS_URL:http://localhost:8096}" }
      mpp: { base-url: "${MPP_WAS_URL:http://localhost:8094}" }
      mls: { base-url: "${MLS_WAS_URL:http://localhost:8092}" }
      mqc: { base-url: "${MQC_WAS_URL:http://localhost:8093}" }
      mpn: { base-url: "${MPN_WAS_URL:http://localhost:8095}" }
    http:
      allowed-hosts: []          # COLLECT(http) 원천이 부를 수 있는 호스트(정확 일치). 옛 키 dmes.widget.collect.allowed-hosts 도 함께 읽는다(warn)
    collect:
      enabled: true              # false 면 COLLECT 작업은 선점 후보에서 빠지고 mcm.collectPurge 는 아무것도 하지 않는다
```

`mdm`·`mpp`·`mls`·`mqc`·`mpn` 의 `application.yml` 끝에 각각(모듈 이름만 다르다 — `mdm` 이면 `mdm`):

```yaml

# ── 예약 작업(docs/superpowers/specs/2026-10-08-job-scheduler-design.md §4.7) ──
# 이 앱은 MCM 이 푸시하는 실행을 접수(POST /internal/job/run)하고 결과를 DB 에 직접 쓴다. 판정·호출 설정(server·modules)은 MCM 만 둔다.
# schema(기본 MCMAPUSER)·pool-size(기본 4)·agent.enabled(기본 true) 는 기본값을 쓴다.
dmes:
  job:
    module: mdm
```
각 모듈 값: `mdm`·`mpp`·`mls`·`mqc`·`mpn`. 각 파일의 `spring.application.name` 이 같은 값인지 확인한다(위 수집에서 이미 `mdm`·`mpp`·`mls`·`mqc`·`mpn` 이다).

`mcm/api/.../application-prod.yml` 의 `dmes:` 블록에는 **값 없이 자리만** 둔다(주석):

```yaml
  # 예약 작업 모듈 호출 주소 — 운영은 환경 변수로 LB 주소를 준다(MDM_WAS_URL 등 기존 관례). 이 파일에는 값을 두지 않는다.
  #   job.modules.<모듈>.base-url 을 따로 줘야 하면(BFF 가 보는 주소와 MCM 이 보는 주소가 다를 때) 그때 여기에 환경 변수로 쓴다.
```

- [ ] **Step 6: mdm 앱 기동 시험을 쓴다** (설계 §9 「다른 모듈 앱 기동 시험」 — MCM 을 띄우지 않은 채 mdm 앱 하나가 뜨고, 접수 쪽 빈이 있고, 판정·호출 빈은 없고, JOB 표 때문에 기동이 실패하지 않는다)

```java
package com.dongkuk.dmes.mdm.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobAppInfo;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistrar;
import com.dongkuk.dmes.mcm.job.agent.JobRunController;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

/** mdm 앱을 실제로 띄워 예약 작업 접수 쪽 조립을 확인한다 — 판정·호출은 MCM 전용이다. MCM 은 띄우지 않았고 JOB 표가 없어도(코드 작업 처리기가 없어) DB 에 닿지 않는다. */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class JobAgentWiringTest extends AbstractMdmSharedDbTest {

    @Autowired
    ApplicationContext ctx;

    @Test
    void 접수_쪽_빈은_있고_판정_호출_빈은_없다() {
        assertEquals(JobModule.MDM, ctx.getBean(JobAppInfo.class).module());
        assertNotNull(ctx.getBean(JobRunController.class));
        assertNotNull(ctx.getBean(JobRunDispatcher.class));
        assertNotNull(ctx.getBean(JobHandlerRegistrar.class));
        assertTrue(ctx.containsBean("jobCodeService") && ctx.containsBean("jobQueryService") && ctx.containsBean("jobCollectService"));
        assertFalse(ctx.containsBean("jobDispatchService"), "판정 서비스는 MCM 전용");
        assertFalse(ctx.containsBean("jobCaller"), "모듈 호출 풀은 MCM 전용");
        assertFalse(ctx.containsBean("jobDispatchTrigger"), "매분 트리거는 MCM 전용");
    }

    @Test
    void 내장_서비스_BPMN_3개를_이_앱의_서비스_제공자가_찾는다() {
        SimpleServiceProvider provider = new SimpleServiceProvider("/services", "bpmn", "^^");
        for (String id : new String[] {"jobCode", "jobQuery", "jobCollect"}) {
            assertNotNull(provider.service(id), id);
        }
    }
}
```

- [ ] **Step 7: 실행한다**
  - `cd src/backend/mdm` 다음 `../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobAgentWiringTest' --tests '*JobRunHttpSecurityTest' --tests '*MdmApplicationHealthTest'` → PASS
  - 나머지 모듈(mls·mpp·mqc·mpn)은 같은 `McmCoreAutoConfiguration` 을 쓰므로 컴파일·기동 조립은 mdm 으로 대표한다. 각 모듈의 단위 시험 전체는 Task 14 에서 돈다.
  - `grep -rn "@Scheduled" src/backend/mcm-core/src/main` 은 `JobDispatchTrigger.java` 한 곳(`NoStraySchedulingTest` 가 보장)이어야 한다.

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add -A src/backend/mcm-core/src src/backend/mcm/api/src/main/resources src/backend/mdm/api src/backend/mpp/api src/backend/mls/api src/backend/mqc/api src/backend/mpn/api
/usr/bin/git commit -m "$(printf 'refactor(mcm-core): 화면 사용 집계·폐기 토큰 정리를 예약 작업으로 옮기고 모듈 앱 설정에 dmes.job 을 더한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 10: 관리 서비스 `jobSchedMng` + 메뉴 SQL

**담당 후보:** GLM 또는 opencode  
**Model:** sonnet/high

설계 §7(화면 서버 호출 action 9개)·§4.9(「지금 실행」)·§4.0(저장 검사)·§5.1~5.4(유형별 입력)·D8(삭제는 USER 작업만)·D9·D11·D13. 화면 서버 호출은 OASIS `POST /api/mcm/oasis/jobSchedMng/{action}`, SYSADMIN 만(메뉴 RBAC).

**Files:**
- Create(`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/server/`): `JobDefStore.java`, `JobSchedMngService.java`, `dto/JobSchedMngRequest.java`
- Modify: `.../server/JobDispatchService.java`(`claimManual` 추가), `.../server/JobServerConfig.java`(빈 `jobSchedMngService`), `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/CoreRbacSeeder.java`(`allActions` 6개)
- Create: `src/backend/mcm/api/src/main/resources/services/csa/jobSchedMng.bpmn`, `docs/mcm/sql/jobSchedMng-menu.sql`
- Test: `.../oracheck/JobSchedMngServiceOraTest.java`(mcm-core), `src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/job/JobSchedMngBpmnTest.java`

**Interfaces:**
- Consumes: `CronSpec`·`JobVars`(Task 2), `QueryStatementGuard`·`JobCollectSql`·`CollectConfigs.check`(Task 6), `JobDispatchService`·`JobCallSink`·`JobCaller`(Task 7·8), `JobRunStore`(Task 8), `JobRunRequest`(Task 3).
- Produces:
  - `JobDispatchService#claimManual(String jobId, String reqUserId, Map<String,String> varOverrides): ManualClaim` — `record ManualClaim(JobRunRequest request, String rejectReason)`(둘 중 하나만 값이 있다). 별도 트랜잭션(`REQUIRES_NEW`)에서 정의 행을 `FOR UPDATE WAIT 5` 로 잠그고, 같은 작업이 RUN(시간 초과 + 정리 여유 안)이면 거절, 아니면 `TRIGGER_TP='M'` RUN 을 INSERT 하고 커밋한다. `NEXT_RUN_AT` 은 바꾸지 않는다.
  - `JobDefStore` — 정의·이력·처리기 SQL(화면 서비스 전용).
  - `JobSchedMngService` — 빈 이름 `jobSchedMngService`. action → 메서드와 응답(`data.result` 로 풀린다):
    | action | 메서드 | 응답 키 |
    |---|---|---|
    | `list` | `list(req)` | `jobs`: `[{jobId, moduleCd, jobNm, jobKind, cronExpr, cronDesc, useYn, nextRunAt, lastStatus, lastServerNm, lastEndedAt, ownerTp, codeMissing}]` (CLOB 칸은 싣지 않는다) |
    | `get` | `get(req)` | `def`: 전체 칸 + `configJson`·`varsJson`·`optsJson`(글자)·`cronDesc`·`ver` |
    | `save` | `save(req)` | `def` |
    | `setUse` | `setUse(req)` | `def` |
    | `runNow` | `runNow(req)` | `accepted`(bool)·`message`·`runId` |
    | `history` | `history(req)` | `runs`: `[{schedAt, triggerTp, status, serverNm, serviceTag, startedAt, endedAt, itemCnt, msg, reqUsrId}]` (최대 100) |
    | `cronPreview` | `cronPreview(req)` | `valid`·`error`·`desc`·`next`(ISO 5개)·`minGapMin` |
    | `handlers` | `handlers(req)` | `handlers`: `[{handlerId, moduleCd, handlerNm, defaultCron, varsJson, seenAt, missing}]` |
    | `delete` | `delete(req)` | `deleted` |
  - `JobSchedMngRequest` DTO(setter 방식): `jobId, moduleCd, jobNm, jobKind, serviceId, svcAction, cronExpr, useYn, configJson, varsJson, optsJson, jobDesc, timeoutSec, ver, newJob, limit, keyword, lastStatus, expr, varOverridesJson`. (BPMN 의 `action` 은 예약 키라 BPMN 서비스 Action 은 `svcAction` 으로 받는다.)

- [ ] **Step 1: 서비스 Oracle 시험을 쓴다**

```java
package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.server.JobCallSink;
import com.dongkuk.dmes.mcm.job.server.JobDefStore;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.job.server.JobSchedMngService;
import com.dongkuk.dmes.mcm.job.server.dto.JobSchedMngRequest;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobSchedMngServiceOraTest {

    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    private JobSchedMngService service;
    private final List<JobRunRequest> submitted = new ArrayList<>();
    private final JobCallSink sink = submitted::add;

    @BeforeEach
    void setUp() {
        clean();
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_HANDLER (HANDLER_ID, MODULE_CD, HANDLER_NM, SEEN_AT) VALUES ('mdm.sync', 'MDM', '동기화', " + NOW + ")");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_HANDLER (HANDLER_ID, MODULE_CD, HANDLER_NM, SEEN_AT) VALUES ('mdm.old', 'MDM', '옛 처리기', " + NOW + " - INTERVAL '10' DAY)");
        JobDefStore store = new JobDefStore(dataSource, "MCMAPUSER");
        service = new JobSchedMngService(store, new JobDispatchService(dataSource, "MCMAPUSER"), sink, new JobCollectSql(dataSource), Duration.ofMillis(300), null);
        submitted.clear();
    }

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_HANDLER");
    }

    private static JobSchedMngRequest req(String jobId, String module, String kind, String cron) {
        JobSchedMngRequest r = new JobSchedMngRequest();
        r.setJobId(jobId);
        r.setModuleCd(module);
        r.setJobNm("이름 " + jobId);
        r.setJobKind(kind);
        r.setCronExpr(cron);
        r.setUseYn("Y");
        r.setTimeoutSec(600);
        return r;
    }

    private static JobSchedMngRequest queryReq(String jobId) {
        JobSchedMngRequest r = req(jobId, "MDM", "QUERY", "*/10 * * * *");
        r.setConfigJson("{\"sql\":\"UPDATE T_X SET V = :v WHERE D = :d\"}");
        r.setVarsJson("[{\"name\":\"v\",\"type\":\"STRING\",\"value\":\"x\",\"desc\":\"\"},{\"name\":\"d\",\"type\":\"DATE\",\"value\":\":today\",\"desc\":\"\"}]");
        return r;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> def(Map<String, Object> result) {
        return (Map<String, Object>) result.get("def");
    }

    private Map<String, Object> row(String jobId) {
        return jdbc.queryForMap("SELECT * FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = ?", jobId);
    }

    @Test
    @DisplayName("QUERY 저장 — 서비스 ID 는 jobQuery·Action run 으로 정하고, NEXT_RUN_AT 은 다음 미래 시각, 출처는 USER")
    void saveQueryJob() {
        Map<String, Object> saved = def(service.save(queryReq("mdm.q1")));
        Map<String, Object> r = row("mdm.q1");
        assertThat(r.get("SERVICE_ID")).isEqualTo("jobQuery");
        assertThat(r.get("ACTION")).isEqualTo("run");
        assertThat(r.get("OWNER_TP")).isEqualTo("USER");
        assertThat(((Timestamp) r.get("NEXT_RUN_AT")).toLocalDateTime()).isAfter(LocalDateTime.now().minusMinutes(1));
        assertThat(saved.get("cronDesc")).isEqualTo("10분마다");
        assertThat(((Number) saved.get("ver")).longValue()).isZero();
    }

    @Test
    @DisplayName("저장 검사 — id 형식·중복·모듈·유형·crontab(일+요일 동시)·시간 초과 범위·QUERY 문장(DDL)·선언 안 한 변수·예약 변수 이름")
    void saveValidation() {
        service.save(queryReq("mdm.q1"));
        JobSchedMngRequest dup = queryReq("mdm.q1");
        dup.setNewJob(true);   // 화면의 [새 작업] 은 newJob=true 로 보낸다 — 같은 ID 가 있으면 거절
        assertThatThrownBy(() -> service.save(dup)).isInstanceOf(BusinessException.class).hasMessageContaining("이미");
        assertThatThrownBy(() -> service.save(queryReq("bad id!"))).isInstanceOf(BusinessException.class).hasMessageContaining("작업 ID");
        JobSchedMngRequest r = queryReq("mdm.q2");
        r.setModuleCd("XXX");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("모듈");
        r.setModuleCd("MDM");
        r.setJobKind("HTTP");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("유형");
        r.setJobKind("QUERY");
        r.setCronExpr("0 9 1 * 1");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("일과 요일");
        r.setCronExpr("*/10 * * * *");
        r.setTimeoutSec(5);
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("시간 초과");
        r.setTimeoutSec(600);
        r.setConfigJson("{\"sql\":\"DROP TABLE T_X\"}");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("INSERT");
        r.setConfigJson("{\"sql\":\"UPDATE T_X SET V = :undeclared\"}");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining(":undeclared");
        r.setConfigJson("{\"sql\":\"UPDATE T_X SET V = 1\"}");
        r.setVarsJson("[{\"name\":\"sql\",\"type\":\"STRING\",\"value\":\"x\",\"desc\":\"\"}]");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("예약어");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("유형별 입력 — BPMN 은 서비스 ID·Action 필수(내장 jobCode·jobQuery·jobCollect 금지), CODE 는 등록된 처리기, COLLECT 는 원천·간격 하한(5분, 환율 60분)·환율은 MCM 만")
    void kindSpecificValidation() {
        JobSchedMngRequest b = req("mdm.b1", "MDM", "BPMN", "0 3 * * *");
        assertThatThrownBy(() -> service.save(b)).isInstanceOf(BusinessException.class).hasMessageContaining("서비스 ID");
        b.setServiceId("jobQuery");
        b.setSvcAction("run");
        assertThatThrownBy(() -> service.save(b)).isInstanceOf(BusinessException.class).hasMessageContaining("내장");
        b.setServiceId("dma^^dailyClose");
        service.save(b);
        assertThat(row("mdm.b1").get("SERVICE_ID")).isEqualTo("dma^^dailyClose");

        JobSchedMngRequest c = req("mdm.c1", "MDM", "CODE", "0 4 * * *");
        c.setConfigJson("{\"handlerId\":\"no.such\"}");
        assertThatThrownBy(() -> service.save(c)).isInstanceOf(BusinessException.class).hasMessageContaining("처리기");
        c.setConfigJson("{\"handlerId\":\"mdm.sync\"}");
        service.save(c);
        assertThat(row("mdm.c1").get("SERVICE_ID")).isEqualTo("jobCode");

        JobSchedMngRequest col = req("mdm.col", "MDM", "COLLECT", "*/4 * * * *");
        col.setConfigJson("{\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1 V FROM DUAL\",\"valueField\":\"V\"}}");
        assertThatThrownBy(() -> service.save(col)).isInstanceOf(BusinessException.class).hasMessageContaining("5분");
        col.setCronExpr("*/5 * * * *");
        service.save(col);
        JobSchedMngRequest ex = req("mdm.ex", "MDM", "COLLECT", "*/30 * * * *");
        ex.setConfigJson("{\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}}");
        assertThatThrownBy(() -> service.save(ex)).isInstanceOf(BusinessException.class).hasMessageContaining("MCM");
        ex.setModuleCd("MCM");
        assertThatThrownBy(() -> service.save(ex)).isInstanceOf(BusinessException.class).hasMessageContaining("60분");
        ex.setCronExpr("0 * * * *");
        service.save(ex);
    }

    @Test
    @DisplayName("일정을 바꾸거나 사용 중지 → 사용으로 되돌리면 NEXT_RUN_AT 을 지금 기준으로 다시 계산한다 — 옛 시각이 남아 밀린 회차가 쏟아지지 않는다")
    void nextRunAtIsRecomputedOnScheduleChangeAndResume() {
        service.save(queryReq("mdm.q1"));
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET NEXT_RUN_AT = " + NOW + " - INTERVAL '5' DAY WHERE JOB_ID = 'mdm.q1'");
        long ver = ((Number) row("mdm.q1").get("VER")).longValue();

        JobSchedMngRequest changed = queryReq("mdm.q1");
        changed.setCronExpr("0 2 * * *");
        changed.setVer(ver);
        service.save(changed);
        LocalDateTime next = ((Timestamp) row("mdm.q1").get("NEXT_RUN_AT")).toLocalDateTime();
        assertThat(next).isAfter(LocalDateTime.now().minusMinutes(1));
        assertThat(next.getHour()).isEqualTo(2);

        JobSchedMngRequest stop = new JobSchedMngRequest();
        stop.setJobId("mdm.q1");
        stop.setUseYn("N");
        service.setUse(stop);
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET NEXT_RUN_AT = " + NOW + " - INTERVAL '3' DAY WHERE JOB_ID = 'mdm.q1'");
        stop.setUseYn("Y");
        service.setUse(stop);
        assertThat(((Timestamp) row("mdm.q1").get("NEXT_RUN_AT")).toLocalDateTime()).isAfter(LocalDateTime.now().minusMinutes(1));
        assertThat(row("mdm.q1").get("USE_YN")).isEqualTo("Y");
    }

    @Test
    @DisplayName("낙관적 잠금 — 읽은 뒤 다른 사용자가 먼저 고쳤으면(VER 가 다르면) 저장을 거절한다")
    void optimisticLock() {
        service.save(queryReq("mdm.q1"));
        JobSchedMngRequest stale = queryReq("mdm.q1");
        stale.setVer(99L);
        assertThatThrownBy(() -> service.save(stale)).isInstanceOf(BusinessException.class).hasMessageContaining("먼저");
    }

    @Test
    @DisplayName("CODE 작업(출처 CODE)은 일정·사용·시간 초과·변수 값만 바꾼다 — 이름·유형·처리기 변경과 삭제는 거절")
    void codeJobsAreLimited() {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, TIMEOUT_SEC, NEXT_RUN_AT, OWNER_TP) "
                + "VALUES ('mdm.sync', 'MDM', '동기화', 'CODE', 'jobCode', 'run', '0 1 * * *', 'Y', '{\"handlerId\":\"mdm.sync\"}', "
                + "'[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"3\",\"desc\":\"\"}]', 1800, " + NOW + " + INTERVAL '1' HOUR, 'CODE')");
        JobSchedMngRequest ok = req("mdm.sync", "MDM", "CODE", "30 1 * * *");
        ok.setJobNm("동기화");
        ok.setConfigJson("{\"handlerId\":\"mdm.sync\"}");
        ok.setVarsJson("[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"9\",\"desc\":\"\"}]");
        ok.setTimeoutSec(900);
        service.save(ok);
        assertThat(row("mdm.sync").get("CRON_EXPR")).isEqualTo("30 1 * * *");
        assertThat(String.valueOf(row("mdm.sync").get("VARS_JSON"))).contains("\"9\"");

        JobSchedMngRequest renamed = req("mdm.sync", "MDM", "CODE", "30 1 * * *");
        renamed.setJobNm("다른 이름");
        renamed.setConfigJson("{\"handlerId\":\"mdm.sync\"}");
        renamed.setVarsJson("[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"9\",\"desc\":\"\"}]");
        assertThatThrownBy(() -> service.save(renamed)).isInstanceOf(BusinessException.class).hasMessageContaining("코드 작업");
        JobSchedMngRequest newVar = new JobSchedMngRequest();
        newVar.setJobId("mdm.sync");
        assertThatThrownBy(() -> service.delete(newVar)).isInstanceOf(BusinessException.class).hasMessageContaining("삭제할 수 없습니다");
    }

    @Test
    @DisplayName("삭제 — USER 작업만, 정의·이력·수집 값을 함께 지운다. 실행 중이면 거절")
    void deleteUserJobs() {
        service.save(queryReq("mdm.q1"));
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES ('mdm.q1', TIMESTAMP '2026-10-08 02:00:00', 'S', 'rr', 'MDM', 'jobQuery', 'RUN', " + NOW + ", 600)");
        JobSchedMngRequest d = new JobSchedMngRequest();
        d.setJobId("mdm.q1");
        assertThatThrownBy(() -> service.delete(d)).isInstanceOf(BusinessException.class).hasMessageContaining("실행 중");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_RUN SET STATUS = 'OK'");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM) VALUES ('mdm.q1', '202610080200', 'K', 1)");
        assertThat(service.delete(d)).containsEntry("deleted", "mdm.q1");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA", Integer.class)).isZero();
    }

    @Test
    @DisplayName("목록 — CLOB 칸 없이 필요한 칸만, 최근 결과 1건, 코드 없음 배지(처리기가 없거나 7일 넘게 안 보임), 필터")
    void listWithFiltersAndCodeMissing() {
        service.save(queryReq("mdm.q1"));
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('mdm.old', 'MDM', '옛', 'CODE', 'jobCode', 'run', '0 1 * * *', 'Y', '{\"handlerId\":\"mdm.old\"}', 60, 'CODE')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('mdm.gone', 'MDM', '없음', 'CODE', 'jobCode', 'run', '0 1 * * *', 'Y', '{\"handlerId\":\"mdm.gone\"}', 60, 'CODE')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, SERVER_NM, STARTED_AT, ENDED_AT) "
                + "VALUES ('mdm.q1', TIMESTAMP '2026-10-08 02:00:00', 'S', 'a', 'MDM', 'jobQuery', 'FAIL', 'old-srv', " + NOW + ", " + NOW + ")");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, SERVER_NM, STARTED_AT, ENDED_AT) "
                + "VALUES ('mdm.q1', TIMESTAMP '2026-10-09 02:00:00', 'S', 'b', 'MDM', 'jobQuery', 'OK', 'new-srv', " + NOW + ", " + NOW + ")");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> jobs = (List<Map<String, Object>>) service.list(new JobSchedMngRequest()).get("jobs");
        assertThat(jobs).extracting(j -> j.get("jobId")).containsExactlyInAnyOrder("mdm.q1", "mdm.old", "mdm.gone");
        Map<String, Object> q1 = jobs.stream().filter(j -> j.get("jobId").equals("mdm.q1")).findFirst().orElseThrow();
        assertThat(q1.get("lastStatus")).isEqualTo("OK");
        assertThat(q1.get("lastServerNm")).isEqualTo("new-srv");
        assertThat(q1).doesNotContainKeys("configJson", "varsJson");
        assertThat(jobs.stream().filter(j -> j.get("jobId").equals("mdm.old")).findFirst().orElseThrow().get("codeMissing")).isEqualTo(true);
        assertThat(jobs.stream().filter(j -> j.get("jobId").equals("mdm.gone")).findFirst().orElseThrow().get("codeMissing")).isEqualTo(true);
        assertThat(q1.get("codeMissing")).isEqualTo(false);

        JobSchedMngRequest f = new JobSchedMngRequest();
        f.setLastStatus("OK");
        assertThat((List<?>) service.list(f).get("jobs")).hasSize(1);
        f = new JobSchedMngRequest();
        f.setKeyword("옛");
        assertThat((List<?>) service.list(f).get("jobs")).hasSize(1);
    }

    @Test
    @DisplayName("지금 실행 — 별도 트랜잭션에서 TRIGGER_TP='M' RUN 을 만들고 커밋한 뒤 호출 풀에 넘긴다. NEXT_RUN_AT 은 그대로, 같은 작업이 실행 중이면 거절")
    void runNow() {
        service.save(queryReq("mdm.q1"));
        LocalDateTime nextBefore = ((Timestamp) row("mdm.q1").get("NEXT_RUN_AT")).toLocalDateTime();
        JobSchedMngRequest r = new JobSchedMngRequest();
        r.setJobId("mdm.q1");
        r.setVarOverridesJson("{\"v\":\"manual\"}");
        Map<String, Object> out = service.runNow(r, "admin");

        assertThat(submitted).hasSize(1);
        JobRunRequest sent = submitted.get(0);
        assertThat(sent.manual()).isTrue();
        assertThat(sent.reqUserId()).isEqualTo("admin");
        assertThat(sent.inputs()).containsEntry("v", "manual");
        Map<String, Object> run = jdbc.queryForMap("SELECT TRIGGER_TP, STATUS, REQ_USR_ID, RUN_ID FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'mdm.q1'");
        assertThat(run.get("TRIGGER_TP")).isEqualTo("M");
        assertThat(run.get("STATUS")).isEqualTo("RUN");
        assertThat(run.get("REQ_USR_ID")).isEqualTo("admin");
        assertThat(((Timestamp) row("mdm.q1").get("NEXT_RUN_AT")).toLocalDateTime()).isEqualTo(nextBefore);
        assertThat(out).containsKey("runId");

        Map<String, Object> second = service.runNow(r, "admin");
        assertThat(second).containsEntry("accepted", false);
        assertThat(String.valueOf(second.get("message"))).contains("실행 중");
        assertThat(submitted).hasSize(1);
    }

    @Test
    @DisplayName("cronPreview — 유효하면 설명·다음 5개·최소 간격, 틀리면 오류 문구")
    void cronPreview() {
        JobSchedMngRequest r = new JobSchedMngRequest();
        r.setExpr("0 9 * * 1-5");
        Map<String, Object> ok = service.cronPreview(r);
        assertThat(ok).containsEntry("valid", true).containsEntry("desc", "평일 09:00");
        assertThat((List<?>) ok.get("next")).hasSize(5);
        r.setExpr("0 9 1 * 1");
        Map<String, Object> bad = service.cronPreview(r);
        assertThat(bad).containsEntry("valid", false);
        assertThat(String.valueOf(bad.get("error"))).contains("일과 요일");
    }

    @Test
    @DisplayName("handlers — 등록된 처리기 목록, 7일 넘게 안 보이면 missing")
    void handlers() {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> hs = (List<Map<String, Object>>) service.handlers(new JobSchedMngRequest()).get("handlers");
        assertThat(hs).extracting(h -> h.get("handlerId")).containsExactly("mdm.old", "mdm.sync");
        assertThat(hs.get(0).get("missing")).isEqualTo(true);
        assertThat(hs.get(1).get("missing")).isEqualTo(false);
    }
}
```

서비스 생성자는 `(JobDefStore, JobDispatchService, JobCallSink, JobCollectSql, Duration decisionWait, SecurityIdentity identity)` 이다. `identity` 가 `null` 이면 사용자 ID 는 `admin`(시험용)이고, `decisionWait` 는 「지금 실행」이 접수 결과를 기다리는 최대 시간(운영 8초, 시험 300ms — 시험의 가짜 호출 풀은 RUN 행을 바꾸지 않으므로 끝까지 기다린다)이다.

- [ ] **Step 2: 실패를 확인한다** — `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 다음 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchedMngServiceOraTest'` → 컴파일 실패.

- [ ] **Step 3: DTO 를 쓴다**

```java
package com.dongkuk.dmes.mcm.job.server.dto;

/**
 * jobSchedMng 요청 params(설계 §7). 칸은 액션마다 일부만 쓴다. {@code configJson}·{@code varsJson}·{@code optsJson} 은 JSON 글자이다(위젯관리 save 와 같은 방식).
 * BPMN 서비스의 Action 은 {@code svcAction} — {@code action} 은 OASIS 가 경로로만 정하는 예약 키라 본문에 쓸 수 없다.
 */
public class JobSchedMngRequest {

    private String jobId;
    private String moduleCd;
    private String jobNm;
    private String jobKind;
    private String serviceId;
    private String svcAction;
    private String cronExpr;
    private String useYn;
    private String configJson;
    private String varsJson;
    private String optsJson;
    private String jobDesc;
    private Integer timeoutSec;
    private Long ver;
    private Boolean newJob;
    private Integer limit;
    private String keyword;
    private String lastStatus;
    private String expr;
    private String varOverridesJson;

    public JobSchedMngRequest() {}

    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }
    public String getModuleCd() { return moduleCd; }
    public void setModuleCd(String moduleCd) { this.moduleCd = moduleCd; }
    public String getJobNm() { return jobNm; }
    public void setJobNm(String jobNm) { this.jobNm = jobNm; }
    public String getJobKind() { return jobKind; }
    public void setJobKind(String jobKind) { this.jobKind = jobKind; }
    public String getServiceId() { return serviceId; }
    public void setServiceId(String serviceId) { this.serviceId = serviceId; }
    public String getSvcAction() { return svcAction; }
    public void setSvcAction(String svcAction) { this.svcAction = svcAction; }
    public String getCronExpr() { return cronExpr; }
    public void setCronExpr(String cronExpr) { this.cronExpr = cronExpr; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
    public String getVarsJson() { return varsJson; }
    public void setVarsJson(String varsJson) { this.varsJson = varsJson; }
    public String getOptsJson() { return optsJson; }
    public void setOptsJson(String optsJson) { this.optsJson = optsJson; }
    public String getJobDesc() { return jobDesc; }
    public void setJobDesc(String jobDesc) { this.jobDesc = jobDesc; }
    public Integer getTimeoutSec() { return timeoutSec; }
    public void setTimeoutSec(Integer timeoutSec) { this.timeoutSec = timeoutSec; }
    public Long getVer() { return ver; }
    public void setVer(Long ver) { this.ver = ver; }
    public Boolean getNewJob() { return newJob; }
    public void setNewJob(Boolean newJob) { this.newJob = newJob; }
    public Integer getLimit() { return limit; }
    public void setLimit(Integer limit) { this.limit = limit; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
    public String getLastStatus() { return lastStatus; }
    public void setLastStatus(String lastStatus) { this.lastStatus = lastStatus; }
    public String getExpr() { return expr; }
    public void setExpr(String expr) { this.expr = expr; }
    public String getVarOverridesJson() { return varOverridesJson; }
    public void setVarOverridesJson(String varOverridesJson) { this.varOverridesJson = varOverridesJson; }
}
```

- [ ] **Step 4: `JobDispatchService.claimManual` 을 더한다** (Task 7 파일 수정 — 별도 트랜잭션에서 잠그고 RUN 을 만든다)

```java
    /** {@link #claimManual} 의 결과 — 둘 중 하나만 값이 있다. */
    public record ManualClaim(JobRunRequest request, String rejectReason) {}

    /**
     * 「지금 한 번 실행」(설계 §4.9). 화면 요청은 OASIS 서비스 트랜잭션 안이라 RUN 행은 <b>별도 트랜잭션</b>(REQUIRES_NEW)에서 만든다: 정의 행을
     * {@code FOR UPDATE WAIT 5} 로 잠그고, 같은 작업이 RUN(시간 초과 + 정리 여유 안)이면 거절한다. 아니면 {@code TRIGGER_TP='M'} RUN 을 INSERT 하고
     * 커밋한다(바깥 서비스 트랜잭션에 합류하면 잠금을 쥔 채 호출하고, 서비스가 롤백되면 RUN 행 없이 모듈만 실행된다). NEXT_RUN_AT 은 바꾸지 않는다.
     * {@code varOverrides} 는 이번 한 번만 쓰는 변수 값(이력의 VARS_JSON 에 남는다 — D11).
     */
    public ManualClaim claimManual(String jobId, String reqUserId, Map<String, String> varOverrides) {
        return manualTx.execute(status -> {
            List<Row> rows = jdbc.query(manualLockSql, (rs, i) -> new Row(rs.getString("JOB_ID"), rs.getString("MODULE_CD"), rs.getString("SERVICE_ID"),
                    rs.getString("ACTION"), rs.getString("CRON_EXPR"), rs.getInt("TIMEOUT_SEC"), rs.getTimestamp("NEXT_RUN_AT") == null
                    ? rs.getTimestamp("DB_NOW").toLocalDateTime() : rs.getTimestamp("NEXT_RUN_AT").toLocalDateTime(), rs.getString("CONFIG_JSON"),
                    rs.getString("VARS_JSON"), rs.getString("OPTS_JSON"), rs.getTimestamp("DB_NOW").toLocalDateTime()), jobId);
            if (rows.isEmpty()) return new ManualClaim(null, "작업을 찾을 수 없습니다");
            Row r = rows.get(0);
            if (jdbc.queryForObject(liveRunSql, Integer.class, r.jobId(), Timestamp.valueOf(r.dbNow())) > 0) {
                return new ManualClaim(null, "이미 실행 중인 작업입니다");
            }
            LocalDateTime sched = r.dbNow().truncatedTo(ChronoUnit.SECONDS);
            JobRunRequest base;
            try {
                base = buildRequest(withOverrides(r, varOverrides), sched);
            } catch (BrokenDefinition e) {
                return new ManualClaim(null, e.getMessage());
            }
            JobRunRequest request = new JobRunRequest(base.runId(), base.jobId(), base.module(), base.serviceId(), base.action(), base.inputs(), base.varTypes(),
                    base.config(), base.timeoutSec(), base.retry(), base.schedAt(), true, reqUserId);
            try {
                jdbc.update(insertManualSql, r.jobId(), Timestamp.valueOf(sched), request.runId(), r.module(), r.serviceId(), Timestamp.valueOf(r.dbNow()),
                        recordedTimeout(r.timeoutSec(), request.retry()), writeJson(request.inputs()), reqUserId, reqUserId);
            } catch (DuplicateKeyException e) {
                return new ManualClaim(null, "같은 초에 이미 요청한 실행이 있습니다");
            }
            return new ManualClaim(request, null);
        });
    }

    /** 화면에서 덮어쓴 변수 값(이름 → 글자)으로 VARS_JSON 의 value 를 바꾼다. 선언 안 된 이름은 무시한다. */
    private Row withOverrides(Row r, Map<String, String> overrides) {
        if (overrides == null || overrides.isEmpty()) return r;
        List<JobVar> vars;
        try {
            vars = JobVars.parse(r.varsJson());
        } catch (IllegalArgumentException e) {
            throw new BrokenDefinition("정의 오류: 변수 목록(VARS_JSON)을 읽을 수 없습니다");
        }
        List<JobVar> merged = new ArrayList<>();
        for (JobVar v : vars) {
            merged.add(overrides.containsKey(v.name()) ? new JobVar(v.name(), v.type(), overrides.get(v.name()), v.desc()) : v);
        }
        List<String> errors = JobVars.validate(merged);
        if (!errors.isEmpty()) throw new BrokenDefinition(errors.get(0));
        return new Row(r.jobId(), r.module(), r.serviceId(), r.action(), r.cron(), r.timeoutSec(), r.nextRunAt(), r.configJson(), JobVars.toJson(merged), r.optsJson(), r.dbNow());
    }
```
필드·생성자에 아래를 더한다: `private final TransactionTemplate manualTx;`, `private final String manualLockSql;`, `private final String insertManualSql;` — 생성자 끝에서

```java
        this.manualTx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        this.manualTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.manualLockSql = """
                SELECT A.JOB_ID, A.MODULE_CD, A.SERVICE_ID, A.ACTION, A.CRON_EXPR, A.TIMEOUT_SEC, A.NEXT_RUN_AT, A.CONFIG_JSON, A.VARS_JSON, A.OPTS_JSON
                     , %2$s DB_NOW
                FROM   %1$s.TB_MCM_JOB_DEF A
                WHERE  A.JOB_ID = ?
                FOR UPDATE WAIT 5
                """.formatted(schema, NOW);
        this.insertManualSql = """
                INSERT INTO %1$s.TB_MCM_JOB_RUN
                       (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC, VARS_JSON, REQ_USR_ID,
                        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
                VALUES (?, ?, 'M', ?, ?, ?, 'RUN', ?, ?, ?, ?,
                        %2$s, ?, 'JobDispatchService', 'jobSchedMng', %2$s, 'SCHEDULER', 'JobDispatchService', 'jobSchedMng', 0)
                """.formatted(schema, NOW);
```
(`insertManualSql` 의 `?` 는 JOB_ID, SCHED_AT, RUN_ID, MODULE_CD, SERVICE_ID, STARTED_AT, TIMEOUT_SEC, VARS_JSON, REQ_USR_ID, C_USR_ID 10개이고 `update` 호출이 같은 순서로 `reqUserId` 를 두 번 넘긴다.) import: `TransactionTemplate`·`TransactionDefinition`·`DataSourceTransactionManager`, `java.util.ArrayList`.

- [ ] **Step 5: 정의·이력 저장소를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.server;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** 관리 화면 서비스(jobSchedMng)의 JOB 표 SQL — 목록은 CLOB 칸을 싣지 않고(행마다 최대 수 KB), 상세에서만 읽는다. */
public class JobDefStore {

    public record Filter(String moduleCd, String jobKind, String useYn, String lastStatus, String keyword) {}

    public record DefRow(String jobId, String moduleCd, String jobNm, String jobKind, String serviceId, String svcAction, String cronExpr, String useYn,
                         String configJson, String varsJson, String optsJson, int timeoutSec, String jobDesc, String ownerTp, LocalDateTime nextRunAt) {}

    static final int LIST_MAX = 500;
    static final int HANDLER_STALE_DAYS = 7;
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final String schema;

    public JobDefStore(DataSource dataSource, String schema) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = new JdbcTemplate(dataSource);
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.schema = schema;
    }

    public LocalDateTime dbNow() {
        return jdbc.queryForObject("SELECT " + NOW + " FROM DUAL", Timestamp.class).toLocalDateTime();
    }

    public List<Map<String, Object>> list(Filter f) {
        StringBuilder sql = new StringBuilder("""
                SELECT A.JOB_ID, A.MODULE_CD, A.JOB_NM, A.JOB_KIND, A.CRON_EXPR, A.USE_YN, A.NEXT_RUN_AT, A.OWNER_TP
                     , B.STATUS LAST_STATUS, B.SERVER_NM LAST_SERVER_NM, B.ENDED_AT LAST_ENDED_AT
                     , C.SEEN_AT HANDLER_SEEN_AT
                FROM   %1$s.TB_MCM_JOB_DEF A
                     , (SELECT R.JOB_ID, R.STATUS, R.SERVER_NM, R.ENDED_AT
                             , ROW_NUMBER() OVER (PARTITION BY R.JOB_ID ORDER BY R.SCHED_AT DESC, R.STARTED_AT DESC) RN
                        FROM   %1$s.TB_MCM_JOB_RUN R) B
                     , %1$s.TB_MCM_JOB_HANDLER C
                WHERE  B.JOB_ID(+) = A.JOB_ID
                AND    B.RN(+) = 1
                AND    C.HANDLER_ID(+) = JSON_VALUE(A.CONFIG_JSON, '$.handlerId')
                """.formatted(schema));
        MapSqlParameterSource p = new MapSqlParameterSource();
        if (notBlank(f.moduleCd())) { sql.append("AND    A.MODULE_CD = :moduleCd\n"); p.addValue("moduleCd", f.moduleCd()); }
        if (notBlank(f.jobKind())) { sql.append("AND    A.JOB_KIND = :jobKind\n"); p.addValue("jobKind", f.jobKind()); }
        if (notBlank(f.useYn())) { sql.append("AND    A.USE_YN = :useYn\n"); p.addValue("useYn", f.useYn()); }
        if (notBlank(f.lastStatus())) { sql.append("AND    B.STATUS = :lastStatus\n"); p.addValue("lastStatus", f.lastStatus()); }
        if (notBlank(f.keyword())) {
            sql.append("AND    (UPPER(A.JOB_ID) LIKE :kw OR UPPER(A.JOB_NM) LIKE :kw)\n");
            p.addValue("kw", "%" + f.keyword().strip().toUpperCase(java.util.Locale.ROOT).replace("%", "").replace("_", "") + "%");
        }
        sql.append("ORDER BY A.MODULE_CD, A.JOB_ID\nFETCH FIRST ").append(LIST_MAX).append(" ROWS ONLY");
        return named.queryForList(sql.toString(), p);
    }

    public Optional<Map<String, Object>> find(String jobId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT A.JOB_ID, A.MODULE_CD, A.JOB_NM, A.JOB_KIND, A.SERVICE_ID, A.ACTION, A.CRON_EXPR, A.USE_YN, A.CONFIG_JSON, A.VARS_JSON, A.OPTS_JSON
                     , A.TIMEOUT_SEC, A.NEXT_RUN_AT, A.JOB_DESC, A.OWNER_TP, A.VER
                FROM   %s.TB_MCM_JOB_DEF A
                WHERE  A.JOB_ID = ?
                """.formatted(schema), jobId);
        return rows.stream().findFirst();
    }

    public void insert(DefRow r, String userId) {
        jdbc.update("""
                INSERT INTO %1$s.TB_MCM_JOB_DEF
                       (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, OPTS_JSON, TIMEOUT_SEC, NEXT_RUN_AT,
                        JOB_DESC, OWNER_TP, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, %2$s, ?, 'jobSchedMng', 'jobSchedMng', %2$s, ?, 'jobSchedMng', 'jobSchedMng', 0)
                """.formatted(schema, NOW), r.jobId(), r.moduleCd(), r.jobNm(), r.jobKind(), r.serviceId(), r.svcAction(), r.cronExpr(), r.useYn(), r.configJson(),
                r.varsJson(), r.optsJson(), r.timeoutSec(), ts(r.nextRunAt()), r.jobDesc(), r.ownerTp(), userId, userId);
    }

    /** VER 가 맞을 때만 고친다. nextRunAt 이 null 이면 NEXT_RUN_AT 은 그대로 둔다. 바뀐 행 수(0 이면 VER 불일치). */
    public int update(DefRow r, String userId, long expectVer) {
        return jdbc.update("""
                UPDATE %1$s.TB_MCM_JOB_DEF
                SET    MODULE_CD = ?, JOB_NM = ?, JOB_KIND = ?, SERVICE_ID = ?, ACTION = ?, CRON_EXPR = ?, USE_YN = ?, CONFIG_JSON = ?, VARS_JSON = ?, OPTS_JSON = ?
                     , TIMEOUT_SEC = ?, JOB_DESC = ?
                     , NEXT_RUN_AT = NVL(?, NEXT_RUN_AT)
                     , U_AT = %2$s, U_USR_ID = ?, U_PGM_ID = 'jobSchedMng', U_SVC_ID = 'jobSchedMng', VER = VER + 1
                WHERE  JOB_ID = ?
                AND    VER = ?
                """.formatted(schema, NOW), r.moduleCd(), r.jobNm(), r.jobKind(), r.serviceId(), r.svcAction(), r.cronExpr(), r.useYn(), r.configJson(),
                r.varsJson(), r.optsJson(), r.timeoutSec(), r.jobDesc(), ts(r.nextRunAt()), userId, r.jobId(), expectVer);
    }

    public int setUse(String jobId, String useYn, LocalDateTime nextRunAt, String userId) {
        return jdbc.update("""
                UPDATE %1$s.TB_MCM_JOB_DEF
                SET    USE_YN = ?, NEXT_RUN_AT = NVL(?, NEXT_RUN_AT), U_AT = %2$s, U_USR_ID = ?, U_PGM_ID = 'jobSchedMng', VER = VER + 1
                WHERE  JOB_ID = ?
                """.formatted(schema, NOW), useYn, ts(nextRunAt), userId, jobId);
    }

    public boolean hasLiveRun(String jobId) {
        return jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM   %s.TB_MCM_JOB_RUN A
                WHERE  A.JOB_ID = ?
                AND    A.STATUS = 'RUN'
                AND    A.STARTED_AT + NUMTODSINTERVAL(A.TIMEOUT_SEC + 300, 'SECOND') > %s
                """.formatted(schema, NOW), Integer.class, jobId) > 0;
    }

    /** 정의·이력·수집 값을 함께 지운다(D8). */
    public void delete(String jobId) {
        jdbc.update("DELETE FROM " + schema + ".TB_MCM_JOB_COLLECT_DATA WHERE JOB_ID = ?", jobId);
        jdbc.update("DELETE FROM " + schema + ".TB_MCM_JOB_RUN WHERE JOB_ID = ?", jobId);
        jdbc.update("DELETE FROM " + schema + ".TB_MCM_JOB_DEF WHERE JOB_ID = ?", jobId);
    }

    public List<Map<String, Object>> history(String jobId, int limit) {
        return jdbc.queryForList("""
                SELECT A.SCHED_AT, A.TRIGGER_TP, A.STATUS, A.SERVER_NM, A.SERVICE_TAG, A.STARTED_AT, A.ENDED_AT, A.ITEM_CNT, A.MSG, A.REQ_USR_ID
                FROM   %s.TB_MCM_JOB_RUN A
                WHERE  A.JOB_ID = ?
                ORDER BY A.SCHED_AT DESC, A.STARTED_AT DESC
                FETCH FIRST ? ROWS ONLY
                """.formatted(schema), jobId, limit);
    }

    public List<Map<String, Object>> handlers() {
        return jdbc.queryForList("""
                SELECT A.HANDLER_ID, A.MODULE_CD, A.HANDLER_NM, A.DEFAULT_CRON, A.VARS_JSON, A.SEEN_AT
                     , CASE WHEN A.SEEN_AT IS NULL OR A.SEEN_AT < %2$s - NUMTODSINTERVAL(%3$d, 'DAY') THEN 'Y' ELSE 'N' END MISSING
                FROM   %1$s.TB_MCM_JOB_HANDLER A
                ORDER BY A.MODULE_CD, A.HANDLER_ID
                """.formatted(schema, NOW, HANDLER_STALE_DAYS));
    }

    public boolean handlerExists(String handlerId, String moduleCd) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + schema + ".TB_MCM_JOB_HANDLER WHERE HANDLER_ID = ? AND MODULE_CD = ?", Integer.class, handlerId, moduleCd) > 0;
    }

    /** 호출 결과를 최대 wait 만큼 기다려 화면에 돌려줄 문구를 만든다: 닫혔으면 사유(MSG), SERVER_NM 이 생겼으면 접수, 아니면 null. */
    public String awaitDecision(String runId, Duration wait) {
        long deadline = System.nanoTime() + wait.toNanos();
        while (true) {
            List<Map<String, Object>> rows = jdbc.queryForList("SELECT STATUS, MSG, SERVER_NM FROM " + schema + ".TB_MCM_JOB_RUN WHERE RUN_ID = ?", runId);
            if (!rows.isEmpty()) {
                Map<String, Object> r = rows.get(0);
                if (!"RUN".equals(r.get("STATUS"))) return "ACCEPTED_AND_CLOSED:" + r.get("STATUS") + ":" + (r.get("MSG") == null ? "" : r.get("MSG"));
                if (r.get("SERVER_NM") != null) return "ACCEPTED:" + r.get("SERVER_NM");
            }
            if (System.nanoTime() >= deadline) return null;
            try {
                Thread.sleep(150);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
        }
    }

    private static Timestamp ts(LocalDateTime t) {
        return t == null ? null : Timestamp.valueOf(t);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
```

`awaitDecision` 의 반환 문구는 서비스가 사람이 읽는 말로 바꾼다(Step 6). 목록의 `codeMissing` 은 서비스가 계산한다 — CODE 작업인데 처리기 행이 없거나 `HANDLER_SEEN_AT` 이 7일 넘었을 때.

- [ ] **Step 6: 서비스를 구현한다**

```java
package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.job.builtin.QueryStatementGuard;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfigs;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectException;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import com.dongkuk.dmes.mcm.job.server.dto.JobSchedMngRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 예약 작업 관리 OASIS 서비스 {@code jobSchedMng}(설계 §7). {@code @Transactional} 없음(OASIS 가 서비스마다 트랜잭션을 연다). SYSADMIN 만 호출한다(메뉴 RBAC).
 * 저장은 검사를 모두 통과해야 하고 서비스 ID·Action 은 유형이 정한다(BPMN 만 사용자가 고른다). 저장은 커밋되면 다음 분 틱부터 모든 MCM 에 반영된다(캐시 없음).
 * CODE 작업(출처 CODE)은 일정·사용·시간 초과·변수 값·설명·고급 설정만 바꾼다. 실행 기록 MSG 와 로그에는 SQL 원문·주소·인증값을 넣지 않는다.
 */
public class JobSchedMngService {

    private static final Pattern JOB_ID = Pattern.compile("^[A-Za-z0-9_.-]{1,60}$");
    private static final Pattern SERVICE_ID = Pattern.compile("^[A-Za-z][A-Za-z0-9_^.-]{0,199}$");
    private static final Pattern ACTION = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,49}$");
    private static final Set<String> MODULES = Set.of("MCM", "MDM", "MPP", "MLS", "MQC", "MPN");
    private static final Set<String> KINDS = Set.of("CODE", "BPMN", "QUERY", "COLLECT");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final JobDefStore store;
    private final JobDispatchService dispatch;
    private final JobCallSink sink;
    private final JobCollectSql collectSql;
    private final Duration decisionWait;
    private final SecurityIdentity identity;

    /** @param identity 인증된 사용자 ID 를 읽는다. null 이면 {@code admin}(시험용). */
    public JobSchedMngService(JobDefStore store, JobDispatchService dispatch, JobCallSink sink, JobCollectSql collectSql, Duration decisionWait,
                              SecurityIdentity identity) {
        this.store = store;
        this.dispatch = dispatch;
        this.sink = sink;
        this.collectSql = collectSql;
        this.decisionWait = decisionWait;
        this.identity = identity;
    }

    private String currentUser() {
        return identity == null ? "admin" : identity.requireUserId();
    }

    // ── 조회 ─────────────────────────────────────────────────────────

    public Map<String, Object> list(JobSchedMngRequest req) {
        List<Map<String, Object>> rows = store.list(new JobDefStore.Filter(req.getModuleCd(), req.getJobKind(), req.getUseYn(), req.getLastStatus(), req.getKeyword()));
        List<Map<String, Object>> out = new ArrayList<>();
        LocalDateTime now = store.dbNow();
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("jobId", r.get("JOB_ID"));
            m.put("moduleCd", r.get("MODULE_CD"));
            m.put("jobNm", r.get("JOB_NM"));
            m.put("jobKind", r.get("JOB_KIND"));
            m.put("cronExpr", r.get("CRON_EXPR"));
            m.put("cronDesc", describe((String) r.get("CRON_EXPR")));
            m.put("useYn", r.get("USE_YN"));
            m.put("nextRunAt", iso(r.get("NEXT_RUN_AT")));
            m.put("lastStatus", r.get("LAST_STATUS"));
            m.put("lastServerNm", r.get("LAST_SERVER_NM"));
            m.put("lastEndedAt", iso(r.get("LAST_ENDED_AT")));
            m.put("ownerTp", r.get("OWNER_TP"));
            m.put("codeMissing", "CODE".equals(r.get("JOB_KIND")) && stale(r.get("HANDLER_SEEN_AT"), now));
            out.add(m);
        }
        return Map.of("jobs", out);
    }

    public Map<String, Object> get(JobSchedMngRequest req) {
        return Map.of("def", defView(requireExisting(req.getJobId())));
    }

    public Map<String, Object> history(JobSchedMngRequest req) {
        int limit = req.getLimit() == null ? 50 : Math.max(1, Math.min(100, req.getLimit()));
        List<Map<String, Object>> runs = new ArrayList<>();
        for (Map<String, Object> r : store.history(req.getJobId(), limit)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("schedAt", iso(r.get("SCHED_AT")));
            m.put("triggerTp", r.get("TRIGGER_TP"));
            m.put("status", r.get("STATUS"));
            m.put("serverNm", r.get("SERVER_NM"));
            m.put("serviceTag", r.get("SERVICE_TAG"));
            m.put("startedAt", iso(r.get("STARTED_AT")));
            m.put("endedAt", iso(r.get("ENDED_AT")));
            m.put("itemCnt", r.get("ITEM_CNT"));
            m.put("msg", r.get("MSG"));
            m.put("reqUsrId", r.get("REQ_USR_ID"));
            runs.add(m);
        }
        return Map.of("runs", runs);
    }

    public Map<String, Object> cronPreview(JobSchedMngRequest req) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            CronSpec spec = CronSpec.parse(req.getExpr());
            out.put("valid", true);
            out.put("desc", spec.describe());
            out.put("next", spec.nextN(store.dbNow(), 5).stream().map(t -> t.format(ISO)).toList());
            out.put("minGapMin", spec.minGap().toMinutes());
        } catch (IllegalArgumentException e) {
            out.put("valid", false);
            out.put("error", e.getMessage());
        }
        return out;
    }

    public Map<String, Object> handlers(JobSchedMngRequest req) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : store.handlers()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("handlerId", r.get("HANDLER_ID"));
            m.put("moduleCd", r.get("MODULE_CD"));
            m.put("handlerNm", r.get("HANDLER_NM"));
            m.put("defaultCron", r.get("DEFAULT_CRON"));
            m.put("varsJson", r.get("VARS_JSON"));
            m.put("seenAt", iso(r.get("SEEN_AT")));
            m.put("missing", "Y".equals(r.get("MISSING")));
            out.add(m);
        }
        return Map.of("handlers", out);
    }

    // ── 저장 ─────────────────────────────────────────────────────────

    public Map<String, Object> save(JobSchedMngRequest req) {
        return save(req, currentUser());
    }

    /** 사용자 ID 는 인증 정보에서 읽은 값이다 — 요청 본문의 값은 쓰지 않는다. */
    public Map<String, Object> save(JobSchedMngRequest req, String userId) {
        String jobId = req.getJobId() == null ? "" : req.getJobId().strip();
        if (!JOB_ID.matcher(jobId).matches()) throw invalid("작업 ID 는 영문·숫자·_ . - 1~60자여야 합니다");
        Map<String, Object> existing = store.find(jobId).orElse(null);
        boolean isNew = existing == null;
        if (isNew && Boolean.FALSE.equals(req.getNewJob())) throw invalid("작업을 찾을 수 없습니다: " + jobId);
        if (!isNew && Boolean.TRUE.equals(req.getNewJob())) throw invalid("이미 있는 작업 ID 입니다: " + jobId);
        boolean codeOwned = !isNew && "CODE".equals(existing.get("OWNER_TP"));

        String moduleCd = upper(req.getModuleCd());
        String kind = upper(req.getJobKind());
        if (!MODULES.contains(moduleCd)) throw invalid("모듈은 MCM·MDM·MPP·MLS·MQC·MPN 중 하나여야 합니다");
        if (!KINDS.contains(kind)) throw invalid("유형은 CODE·BPMN·QUERY·COLLECT 중 하나여야 합니다");
        String name = req.getJobNm() == null ? "" : req.getJobNm().strip();
        if (name.isEmpty() || name.length() > 100) throw invalid("작업 이름은 1~100자여야 합니다");
        int timeout = req.getTimeoutSec() == null ? 0 : req.getTimeoutSec();
        if (timeout < 10 || timeout > 86400) throw invalid("시간 초과는 10~86400초여야 합니다");
        String desc = req.getJobDesc() == null ? null : req.getJobDesc().strip();
        if (desc != null && desc.length() > 500) throw invalid("설명은 500자까지입니다");
        String useYn = "N".equals(req.getUseYn()) ? "N" : "Y";

        CronSpec cron;
        try {
            cron = CronSpec.parse(req.getCronExpr());
        } catch (IllegalArgumentException e) {
            throw invalid(e.getMessage());
        }
        List<JobVar> vars;
        try {
            vars = JobVars.parse(req.getVarsJson());
        } catch (IllegalArgumentException e) {
            throw invalid(e.getMessage());
        }
        List<String> varErrors = JobVars.validate(vars);
        if (!varErrors.isEmpty()) throw invalid(varErrors.get(0));
        String opts = checkOpts(req.getOptsJson());
        Set<String> varNames = vars.stream().map(JobVar::name).collect(Collectors.toSet());

        String serviceId;
        String svcAction = "run";
        String configJson = blankToNull(req.getConfigJson());
        switch (kind) {
            case "CODE" -> {
                serviceId = "jobCode";
                JsonNode cfg = readObject(configJson, "처리기 설정(configJson)");
                String handlerId = cfg.path("handlerId").asText("");
                if (handlerId.isBlank() || !store.handlerExists(handlerId, moduleCd)) throw invalid("등록된 처리기가 아닙니다: " + handlerId + " (그 모듈 앱이 기동할 때 등록됩니다)");
            }
            case "BPMN" -> {
                serviceId = req.getServiceId() == null ? "" : req.getServiceId().strip();
                svcAction = req.getSvcAction() == null ? "" : req.getSvcAction().strip();
                if (!SERVICE_ID.matcher(serviceId).matches()) throw invalid("서비스 ID 를 형식에 맞게 입력해 주세요");
                if (Set.of("jobCode", "jobQuery", "jobCollect").contains(serviceId)) throw invalid("내장 서비스(jobCode·jobQuery·jobCollect)는 쿼리 실행·수집 유형으로 등록하세요");
                if (!ACTION.matcher(svcAction).matches()) throw invalid("Action 을 형식에 맞게 입력해 주세요");
                configJson = null;
            }
            case "QUERY" -> {
                serviceId = "jobQuery";
                JsonNode cfg = readObject(configJson, "쿼리 설정(configJson)");
                QueryStatementGuard.Checked checked;
                try {
                    checked = QueryStatementGuard.check(cfg.path("sql").asText(""));
                } catch (IllegalArgumentException e) {
                    throw invalid(e.getMessage());
                }
                for (String v : checked.variables()) if (!varNames.contains(v)) throw invalid("변수 :" + v + " 를 변수 표에 선언해 주세요");
            }
            default -> {
                serviceId = "jobCollect";
                JsonNode cfg = readObject(configJson, "수집 설정(configJson)");
                CollectConfig parsed;
                try {
                    parsed = CollectConfigs.check(cfg, moduleCd, sql -> collectSql.validate(sql, varNames), null);
                } catch (CollectException | BusinessException e) {
                    throw invalid(e.getMessage());
                }
                long minGap = cron.minGap().toMinutes();
                int floor = parsed.source() instanceof CollectConfig.ExchangeSource ? 60 : 5;
                if (minGap < floor) throw invalid("수집 간격은 " + floor + "분 이상이어야 합니다(지금 최소 " + minGap + "분)");
            }
        }

        LocalDateTime now = store.dbNow();
        if (isNew) {
            store.insert(new JobDefStore.DefRow(jobId, moduleCd, name, kind, serviceId, svcAction, cron.expression(), useYn, configJson, JobVars.toJson(vars), opts,
                    timeout, desc, "USER", cron.next(now)), userId);
        } else {
            if (codeOwned) checkCodeOwnedEdit(existing, name, kind, moduleCd, configJson, vars);
            if (req.getVer() != null && req.getVer() != ((Number) existing.get("VER")).longValue()) {
                throw invalid("다른 사용자가 먼저 고쳤습니다. 다시 불러온 뒤 저장해 주세요");
            }
            boolean scheduleChanged = !cron.expression().equals(existing.get("CRON_EXPR"));
            boolean resumed = "N".equals(existing.get("USE_YN")) && "Y".equals(useYn);
            LocalDateTime next = scheduleChanged || resumed ? cron.next(now) : null;   // 옛 NEXT_RUN_AT 이 남아 밀린 회차가 쏟아지지 않게
            int changed = store.update(new JobDefStore.DefRow(jobId, moduleCd, name, kind, serviceId, svcAction, cron.expression(), useYn, configJson,
                    JobVars.toJson(vars), opts, timeout, desc, (String) existing.get("OWNER_TP"), next), userId, ((Number) existing.get("VER")).longValue());
            if (changed == 0) throw invalid("다른 사용자가 먼저 고쳤습니다. 다시 불러온 뒤 저장해 주세요");
        }
        return Map.of("def", defView(requireExisting(jobId)));
    }

    public Map<String, Object> setUse(JobSchedMngRequest req) {
        Map<String, Object> def = requireExisting(req.getJobId());
        String useYn = "N".equals(req.getUseYn()) ? "N" : "Y";
        LocalDateTime next = null;
        if ("Y".equals(useYn) && "N".equals(def.get("USE_YN"))) {
            next = CronSpec.parse((String) def.get("CRON_EXPR")).next(store.dbNow());   // 사용으로 되돌릴 때 지금 기준으로 다시 계산
        }
        store.setUse(req.getJobId(), useYn, next, currentUser());
        return Map.of("def", defView(requireExisting(req.getJobId())));
    }

    public Map<String, Object> delete(JobSchedMngRequest req) {
        Map<String, Object> def = requireExisting(req.getJobId());
        if (!"USER".equals(def.get("OWNER_TP"))) throw invalid("코드 작업은 삭제할 수 없습니다 — 사용 안 함으로 바꾸세요");
        if (store.hasLiveRun(req.getJobId())) throw invalid("실행 중인 작업은 삭제할 수 없습니다");
        store.delete(req.getJobId());
        return Map.of("deleted", req.getJobId());
    }

    // ── 지금 실행 ────────────────────────────────────────────────────

    public Map<String, Object> runNow(JobSchedMngRequest req) {
        return runNow(req, currentUser());
    }

    public Map<String, Object> runNow(JobSchedMngRequest req, String userId) {
        requireExisting(req.getJobId());
        Map<String, String> overrides = readOverrides(req.getVarOverridesJson());
        JobDispatchService.ManualClaim claim = dispatch.claimManual(req.getJobId(), userId, overrides);
        Map<String, Object> out = new LinkedHashMap<>();
        if (claim.request() == null) {
            out.put("accepted", false);
            out.put("message", claim.rejectReason());
            return out;
        }
        sink.submit(claim.request());   // 커밋 뒤 호출 풀에 넘긴다
        out.put("runId", claim.request().runId());
        String decision = store.awaitDecision(claim.request().runId(), decisionWait);
        if (decision == null) {
            out.put("accepted", true);
            out.put("message", "호출을 보냈습니다. 접수 여부를 아직 모릅니다 — 실행 이력을 확인하세요");
        } else if (decision.startsWith("ACCEPTED:")) {
            out.put("accepted", true);
            out.put("message", "접수되었습니다(" + decision.substring("ACCEPTED:".length()) + ")");
        } else {
            String[] parts = decision.split(":", 3);
            boolean ok = "OK".equals(parts[1]);
            out.put("accepted", ok);
            out.put("message", ok ? "이미 끝났습니다" : "실행되지 않았습니다 — " + (parts.length > 2 && !parts[2].isBlank() ? parts[2] : parts[1]));
        }
        return out;
    }

    // ── 도우미 ───────────────────────────────────────────────────────

    private void checkCodeOwnedEdit(Map<String, Object> existing, String name, String kind, String moduleCd, String configJson, List<JobVar> vars) {
        if (!name.equals(existing.get("JOB_NM"))) throw invalid("코드 작업은 이름을 바꿀 수 없습니다");
        if (!kind.equals(existing.get("JOB_KIND")) || !moduleCd.equals(existing.get("MODULE_CD"))) throw invalid("코드 작업은 유형·모듈을 바꿀 수 없습니다");
        if (!String.valueOf(existing.get("CONFIG_JSON")).replaceAll("\\s", "").equals(String.valueOf(configJson).replaceAll("\\s", ""))) {
            throw invalid("코드 작업은 처리기를 바꿀 수 없습니다");
        }
        List<JobVar> old = JobVars.parse((String) existing.get("VARS_JSON"));
        List<String> oldKeys = old.stream().map(v -> v.name() + ":" + v.type()).toList();
        List<String> newKeys = vars.stream().map(v -> v.name() + ":" + v.type()).toList();
        if (!oldKeys.equals(newKeys)) throw invalid("코드 작업의 변수는 값만 바꿀 수 있습니다(이름·형식은 코드가 정합니다)");
    }

    private Map<String, Object> requireExisting(String jobId) {
        return store.find(jobId).orElseThrow(() -> invalid("작업을 찾을 수 없습니다: " + jobId));
    }

    private Map<String, Object> defView(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("jobId", r.get("JOB_ID"));
        m.put("moduleCd", r.get("MODULE_CD"));
        m.put("jobNm", r.get("JOB_NM"));
        m.put("jobKind", r.get("JOB_KIND"));
        m.put("serviceId", r.get("SERVICE_ID"));
        m.put("svcAction", r.get("ACTION"));
        m.put("cronExpr", r.get("CRON_EXPR"));
        m.put("cronDesc", describe((String) r.get("CRON_EXPR")));
        m.put("useYn", r.get("USE_YN"));
        m.put("configJson", r.get("CONFIG_JSON"));
        m.put("varsJson", r.get("VARS_JSON"));
        m.put("optsJson", r.get("OPTS_JSON"));
        m.put("timeoutSec", r.get("TIMEOUT_SEC"));
        m.put("nextRunAt", iso(r.get("NEXT_RUN_AT")));
        m.put("jobDesc", r.get("JOB_DESC"));
        m.put("ownerTp", r.get("OWNER_TP"));
        m.put("ver", r.get("VER"));
        return m;
    }

    private static String describe(String expr) {
        try {
            return CronSpec.parse(expr).describe();
        } catch (IllegalArgumentException e) {
            return "-";
        }
    }

    private static boolean stale(Object seenAt, LocalDateTime now) {
        if (!(seenAt instanceof Timestamp t)) return true;
        return t.toLocalDateTime().isBefore(now.minusDays(JobDefStore.HANDLER_STALE_DAYS));
    }

    private static String iso(Object ts) {
        return ts instanceof Timestamp t ? t.toLocalDateTime().format(ISO) : null;
    }

    private static String upper(String s) {
        return s == null ? "" : s.strip().toUpperCase(java.util.Locale.ROOT);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static JsonNode readObject(String json, String label) {
        try {
            JsonNode n = json == null ? null : JSON.readTree(json);
            if (n == null || !n.isObject()) throw invalid(label + " 은(는) JSON 객체여야 합니다");
            return n;
        } catch (JsonProcessingException e) {
            throw invalid(label + " 이(가) 올바른 JSON 이 아닙니다");
        }
    }

    /** 고급 설정 {@code {retry:{count,intervalMin}}} 검사(D12 — 첫 판은 재시도만). 비어 있으면 null. */
    private static String checkOpts(String optsJson) {
        if (optsJson == null || optsJson.isBlank()) return null;
        JsonNode n = readObject(optsJson, "고급 설정(optsJson)");
        JsonNode retry = n.get("retry");
        if (retry != null && !retry.isNull()) {
            int count = retry.path("count").asInt(-1);
            int interval = retry.path("intervalMin").asInt(-1);
            if (count < 0 || count > 5) throw invalid("재시도 횟수는 0~5 여야 합니다");
            if (count > 0 && (interval < 1 || interval > 120)) throw invalid("재시도 간격은 1~120분이어야 합니다");
        }
        return n.size() == 0 ? null : optsJson;
    }

    private static Map<String, String> readOverrides(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Object> raw = JSON.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
            Map<String, String> out = new LinkedHashMap<>();
            raw.forEach((k, v) -> out.put(k, v == null ? "" : String.valueOf(v)));
            return out;
        } catch (JsonProcessingException e) {
            throw invalid("변수 덮어쓰기 값(varOverridesJson)이 올바른 JSON 이 아닙니다");
        }
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
```

- [ ] **Step 7: 빈 조립** — `JobServerConfig` 에 더한다. 사용자 ID 는 기존 `ScreenUsageService` 가 쓰는 mcm-core 추상 `SecurityIdentity`(`requireUserId()`)에서 읽는다.

```java
    /** BPMN {@code jobSchedMng} 의 {@code camunda:class="jobSchedMngService"}. */
    @Bean
    public JobSchedMngService jobSchedMngService(ObjectProvider<DataSource> dataSource, JobProperties props, JobDispatchService dispatch, JobCallSink sink,
                                                 JobCollectSql collectSql, SecurityIdentity identity) {
        return new JobSchedMngService(new JobDefStore(dataSource.getObject(), props.getSchema()), dispatch, sink, collectSql, Duration.ofSeconds(8), identity);
    }
```
(`import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;` 와 `JobCollectSql`·`JobSchedMngService` import.) Task 8 의 `JobServerConfigWiringTest` 에 `.withBean(SecurityIdentity.class, () -> mock(SecurityIdentity.class))` 를 더하고 `enabled()` 시험에 `.hasBean("jobSchedMngService")` 를 더한다.

- [ ] **Step 8: BPMN 을 만든다** — `src/backend/mcm/api/src/main/resources/services/csa/jobSchedMng.bpmn`. 구조는 `commWidgetMng.bpmn` 과 같다: `startEvent` → `exclusiveGateway`(속성 `input=action`) → action 마다 `serviceTask`(`camunda:class="jobSchedMngService"`, 속성 `method`·`output=result`·`dto`) → `endEvent`. DTO 는 모든 action 이 `com.dongkuk.dmes.mcm.job.server.dto.JobSchedMngRequest` 이다. 먼저 `bpmn-skill` 의 `bpmn-tool` 로 만들거나(권장), 아래 표대로 손으로 쓴다.

| action(게이트웨이 flow 이름) | serviceTask id | method |
|---|---|---|
| `list` | `listTask` | `list` |
| `get` | `getTask` | `get` |
| `save` | `saveTask` | `save` |
| `setUse` | `setUseTask` | `setUse` |
| `runNow` | `runNowTask` | `runNow` |
| `history` | `historyTask` | `history` |
| `cronPreview` | `cronPreviewTask` | `cronPreview` |
| `handlers` | `handlersTask` | `handlers` |
| `delete` | `deleteTask` | `delete` |

한 action 의 블록(모든 action 이 같은 모양, `listTask`/`list` 부분만 바뀐다):
```xml
    <bpmn:serviceTask id="listTask" name="작업 목록" camunda:class="jobSchedMngService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="list" />
          <camunda:property name="output" value="result" />
          <camunda:property name="dto" value="com.dongkuk.dmes.mcm.job.server.dto.JobSchedMngRequest" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_list</bpmn:incoming>
      <bpmn:outgoing>flow_list_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="endList"><bpmn:incoming>flow_list_end</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="flow_list" name="list" sourceRef="actionGateway" targetRef="listTask" />
    <bpmn:sequenceFlow id="flow_list_end" sourceRef="listTask" targetRef="endList" />
```
게이트웨이의 `outgoing` 에 `flow_list`·`flow_get`·… 9개를 모두 적는다(`screenUsageStat.bpmn` 참조). 프로세스 id 는 `jobSchedMng`. 다이어그램(DI) 좌표는 `bpmn-tool` 이 만들게 한다. 끝나면 `node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .` 가 ERROR 0 이어야 한다.

- [ ] **Step 9: BPMN·OASIS 시험을 쓴다** (mcm/api — `JobDispatchBpmnIntegrationTest` 와 같은 조립에 `OasisServiceExecutor` 를 더한다)

```java
package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.server.JobDefStore;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.job.server.JobSchedMngService;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

/** 실제 services/csa/jobSchedMng.bpmn 을 OASIS 실행기로 돌려 action 분기·DTO 바인딩·응답 data.result 를 확인한다. */
class JobSchedMngBpmnTest {

    private static HikariDataSource ds;
    private static GenericApplicationContext ctx;
    private static OasisServiceExecutor executor;

    @BeforeAll
    static void start() {
        McmOraTestDb.resetSchemas();
        ds = McmOraTestDb.dataSource(McmOraTestDb.APP_USER, "job-mng-bpmn");
        SecurityIdentity identity = Mockito.mock(SecurityIdentity.class);
        Mockito.when(identity.requireUserId()).thenReturn("admin");
        ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> new DataSourceTransactionManager(ds));
        ctx.registerBean("jobSchedMngService", JobSchedMngService.class, () -> new JobSchedMngService(new JobDefStore(ds, "MCMAPUSER"),
                new JobDispatchService(ds, "MCMAPUSER"), request -> { }, new JobCollectSql(ds), Duration.ofMillis(200), identity));
        ctx.refresh();
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        executor = new OasisServiceExecutor(new OasisAutoConfiguration().serviceStarter(props, tx, ctx), ctx, new CactusRequestConverter(), new CactusResponseConverter());
    }

    @AfterAll
    static void stop() {
        ctx.close();
        ds.close();
    }

    private static CactusRequest request(Map<String, Object> params) {
        return new CactusRequest(new RequestMeta("admin", "jobSchedMng"), new HashMap<>(params), Map.of());
    }

    @Test
    @DisplayName("cronPreview → data.result.valid/desc/next, save → data.result.def, list → data.result.jobs, delete — 9개 action 중 대표 흐름")
    @SuppressWarnings("unchecked")
    void actionsThroughOasis() {
        new JdbcTemplate(ds).update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        new JdbcTemplate(ds).update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");

        CactusResponse preview = executor.execute("jobSchedMng", "cronPreview", request(Map.of("expr", "0 2 * * *")));
        assertThat(preview.getMeta().success()).as(preview.getMeta().message()).isTrue();
        Map<String, Object> pv = (Map<String, Object>) preview.getData().get("result");
        assertThat(pv).containsEntry("valid", true).containsEntry("desc", "매일 02:00");

        Map<String, Object> save = new HashMap<>();
        save.put("jobId", "mcm.q1");
        save.put("moduleCd", "MCM");
        save.put("jobNm", "시험 쿼리");
        save.put("jobKind", "QUERY");
        save.put("cronExpr", "*/10 * * * *");
        save.put("useYn", "Y");
        save.put("timeoutSec", 600);
        save.put("configJson", "{\"sql\":\"UPDATE T_X SET V = 1\"}");
        CactusResponse saved = executor.execute("jobSchedMng", "save", request(save));
        assertThat(saved.getMeta().success()).as(saved.getMeta().message()).isTrue();
        Map<String, Object> def = (Map<String, Object>) ((Map<String, Object>) saved.getData().get("result")).get("def");
        assertThat(def).containsEntry("jobId", "mcm.q1").containsEntry("serviceId", "jobQuery");

        CactusResponse list = executor.execute("jobSchedMng", "list", request(Map.of()));
        List<Map<String, Object>> jobs = (List<Map<String, Object>>) ((Map<String, Object>) list.getData().get("result")).get("jobs");
        assertThat(jobs).extracting(j -> j.get("jobId")).containsExactly("mcm.q1");

        CactusResponse bad = executor.execute("jobSchedMng", "save", request(Map.of("jobId", "x y")));
        assertThat(bad.getMeta().success()).isFalse();
        assertThat(bad.getMeta().message()).contains("작업 ID");

        CactusResponse deleted = executor.execute("jobSchedMng", "delete", request(Map.of("jobId", "mcm.q1")));
        assertThat(deleted.getMeta().success()).as(deleted.getMeta().message()).isTrue();
    }
}
```

- [ ] **Step 10: 메뉴 등록 SQL 과 PERM_ALL action**

`CoreRbacSeeder.allActions` 의 `String.join(",", …)` 에서 마지막 토큰 `"query"` 뒤에 쉼표를 붙이고 아래를 **`"query"` 와 같은 인자 열**에 이어 쓴다(주석 블록 앞, `String.join` 모양 유지 — 두 계약 시험이 이 선언을 문자열로 읽는다):

```java
                "query",
                // 2026-10-09 — 예약 작업 관리(services/csa/jobSchedMng.bpmn) action. save·delete·history 는 위에 있다.
                //   이미 시드된 DB 는 ensurePermAllActions 가 덧붙인다.
                "list", "get", "setUse", "runNow", "cronPreview", "handlers"
```
(마지막 줄 뒤에는 쉼표를 두지 않는다.) 그 뒤 `ScreenUsageOasisContractTest`(mcm-core)·`MdmOasisActionVocabularyTest`(mdm)가 이 파일을 읽으므로 `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 --tests '*ScreenUsageOasisContractTest'`, `cd ../mdm` 다음 `../gradlew :lib:test --max-workers=2 --tests '*MdmOasisActionVocabularyTest'` 가 통과해야 한다.

`docs/mcm/sql/jobSchedMng-menu.sql` (Oracle, 멱등):

```sql
-- ============================================================
-- 예약 작업 관리(csa/jobSchedMng) 메뉴·권한 등록 — 멱등(여러 번 실행해도 같다)
-- ============================================================
-- 대상: MCMAPUSER 스키마(TB_MCM_SEC_OBJ·TB_MCM_SEC_MENU·TB_MCM_SEC_ROLE_MAPPING·TB_MCM_SEC_PERM).
-- 적용은 조정자가 한다(L_MAIN 에는 이 레인이 쓰지 않는다 — docs/superpowers/specs/2026-10-08-job-scheduler-design.md §10).
-- 같은 내용을 CoreRbacSeeder.allActions 가 새 DB 의 PERM_ALL 에 넣는다. 이미 시드된 DB 는 아래 6개 UPDATE 가 덧붙인다.

MERGE INTO MCMAPUSER.TB_MCM_SEC_OBJ T
USING (SELECT 'jobSchedMng' OBJECT_ID FROM DUAL) S
ON    (T.OBJECT_ID = S.OBJECT_ID)
WHEN NOT MATCHED THEN INSERT
      (OBJECT_ID, OBJECT_NM, OBJECT_TYPE, SYSTEM_CODE, ACCESS_TP, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE,
       C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
VALUES (S.OBJECT_ID, '예약 작업 관리', 'web', 'mcm', '내부', 'Y', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59',
        SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', 0);

MERGE INTO MCMAPUSER.TB_MCM_SEC_MENU T
USING (SELECT 'jobSchedMng' MENU_ID FROM DUAL) S
ON    (T.MENU_ID = S.MENU_ID)
WHEN NOT MATCHED THEN INSERT
      (MENU_ID, MENU_NM, MENU_SEQ, FULL_SEQ, MENU_TP, MENU_VIEW_YN, OBJECT_ID, PARENT_MENU_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE,
       C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
VALUES (S.MENU_ID, '예약 작업 관리', '00000001', '1020220', 'WEB', 'Y', 'jobSchedMng', 'csa', 'Y', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59',
        SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', 0);

MERGE INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING T
USING (SELECT 'SYSADMIN' ROLE_ID, 'jobSchedMng' OBJECT_ID, 'PERM_ALL' PERMISSION_ID FROM DUAL) S
ON    (T.ROLE_ID = S.ROLE_ID AND T.OBJECT_ID = S.OBJECT_ID AND T.PERMISSION_ID = S.PERMISSION_ID)
WHEN NOT MATCHED THEN INSERT
      (ROLE_ID, OBJECT_ID, PERMISSION_ID, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
VALUES (S.ROLE_ID, S.OBJECT_ID, S.PERMISSION_ID, SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', 0);

-- PERM_ALL 의 action 목록에 없는 토큰은 SYSADMIN 도 403 이다 — 없는 것만 덧붙인다.
UPDATE MCMAPUSER.TB_MCM_SEC_PERM SET PERMISSION_ACTION = PERMISSION_ACTION || ',list' WHERE PERMISSION_ID = 'PERM_ALL' AND INSTR(',' || PERMISSION_ACTION || ',', ',list,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM SET PERMISSION_ACTION = PERMISSION_ACTION || ',get' WHERE PERMISSION_ID = 'PERM_ALL' AND INSTR(',' || PERMISSION_ACTION || ',', ',get,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM SET PERMISSION_ACTION = PERMISSION_ACTION || ',setUse' WHERE PERMISSION_ID = 'PERM_ALL' AND INSTR(',' || PERMISSION_ACTION || ',', ',setUse,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM SET PERMISSION_ACTION = PERMISSION_ACTION || ',runNow' WHERE PERMISSION_ID = 'PERM_ALL' AND INSTR(',' || PERMISSION_ACTION || ',', ',runNow,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM SET PERMISSION_ACTION = PERMISSION_ACTION || ',cronPreview' WHERE PERMISSION_ID = 'PERM_ALL' AND INSTR(',' || PERMISSION_ACTION || ',', ',cronPreview,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM SET PERMISSION_ACTION = PERMISSION_ACTION || ',handlers' WHERE PERMISSION_ID = 'PERM_ALL' AND INSTR(',' || PERMISSION_ACTION || ',', ',handlers,') = 0;
COMMIT;
```
이 SQL 이 문법상 맞는지 레인 PDB 에서 확인한다: `node scripts/oracle/pdb.mjs clone TPL_SCHEMA L_JOBSCHED` 로 만든 레인 PDB 에서 두 번 실행해 두 번째가 0 행 변경인지 본다(`scripts/oracle/README.md` 의 sqlplus 실행 방법). **L_MAIN 에는 실행하지 않는다.** 칸 목록이 `TB_MCM_SEC_*` 실제 표와 맞지 않으면(ORA-00904) `archive/oracle-1007/db-snapshot-sql/mcm/TB_MCM_SEC_OBJ.sql` 등의 INSERT 칸과 대조해 고친다.

- [ ] **Step 11: 실행한다**
  - `cd src/backend/mcm-core` 다음 `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchedMngServiceOraTest' --tests '*JobDispatchServiceOraTest' --tests '*McmCoreArchitectureTest'` → PASS (`claimManual` 추가가 Task 7 시험을 깨지 않는지 함께)
  - `cd ../mcm` 다음 `../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchedMngBpmnTest'` → PASS
  - `node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .` → ERROR 0

- [ ] **Step 12: 커밋**

```bash
/usr/bin/git add src/backend/mcm-core/src src/backend/mcm/api/src docs/mcm/sql/jobSchedMng-menu.sql
/usr/bin/git commit -m "$(printf 'feat(mcm): 예약 작업 관리 OASIS 서비스(jobSchedMng)와 메뉴 등록 SQL 을 더한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 11: shared 공통 컴포넌트 `CronInput`·`VariableTable`

**담당 후보:** Claude sonnet/high  
**Model:** sonnet/high

설계 §7 마지막 줄(crontab 입력 칸과 변수 표는 `@dk-oasis/shared` 새 공통 컴포넌트로 등록)·CLAUDE.md 「공통 컴포넌트 행동강령」·`docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` §18. 업무 도메인에 묶이지 않는 입력 칸·표라 shared 에 등록한다(승인 불필요). **기존 shared 컴포넌트는 바꾸지 않는다.** 시안 `src/frontend/m-design-dummy/src/screens/job-scheduler/` 의 `cron.ts`·`CronInput.tsx`·`CronEasyEditor.tsx`·`CronDirectEditor.tsx`·`VariableTable.tsx` 를 옮겨 다듬는다.

**Files:**
- Create(`src/frontend/shared/src/components/cron-input/`): `cron.ts`(시안 `cron.ts` 이동), `CronEasyEditor.tsx`, `CronDirectEditor.tsx`, `CronInput.tsx`, `index.ts`
- Create(`src/frontend/shared/src/components/variable-table/`): `variables.ts`, `VariableTable.tsx`, `index.ts`
- Modify: `src/frontend/shared/tsup.config.ts`(entry 2줄), `src/frontend/shared/package.json`(exports 2개), `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md`(§1 허용 목록 표 2줄)
- Modify(스킬 문서·색인): `.claude/skills/mantine-aggrid-ui/SKILL.md`, `references/components/cron-input.md`(새), `references/components/variable-table.md`(새), `references/components/llms.txt`·`llms-full.txt`(생성), `references/mantine-catalog.md`, `scripts/ui_docs.mjs`(분류·EXPORT_FILES)
- Test: `src/frontend/shared/tests/unit/cron-input.unit.test.ts`, `variable-table.unit.test.ts`

**Interfaces:**
- Produces:
  - `@dk-oasis/shared/cron-input`: `CronInput`, `CronInputProps`, `CronPreview`, 그리고 순수 함수 `parseCron`·`validateCron`·`describeCron`·`runTimes`·`buildCron`·`toEasy`·`DEFAULT_EASY`·`CRON_PRESETS`·`formatWithDow`(시안 `cron.ts` 의 export 그대로).
    ```ts
    export interface CronPreview { valid: boolean; error?: string; desc?: string; next?: string[]; minGapMin?: number }
    export interface CronInputProps {
      value: string;                         // crontab 5칸 식. 쉬운 설정이 만들 수 없는 상태면 빈 글자를 올려 저장을 막는다
      onChange: (value: string) => void;
      disabled?: boolean;
      minGapMin?: number;                    // 실행 간격 하한(분). 더 짧은 식은 오류
      preview?: CronPreview | null;          // 서버(cronPreview)가 계산한 설명·다음 예정·오류. 없으면 브라우저 계산
      onRequestPreview?: (expr: string) => void;   // 올바른 식이 400ms 멈추면 부른다 — 화면이 서버 cronPreview 를 부르고 preview 로 돌려준다
      previewCount?: number;                 // 보일 다음 예정 개수, 기본 5
    }
    ```
  - `@dk-oasis/shared/variable-table`: `VariableTable`, `VariableTableProps`, `JobVarRow`, `VariableType`, `RUNTIME_VARIABLES`, `VARIABLE_TYPE_LABEL`, `newVariableRow`, `normalizeVariableCell`.
    ```ts
    export interface JobVarRow { name: string; type: VariableType; value: string; desc?: string }
    export interface VariableTableProps {
      value: JobVarRow[];
      onChange: (rows: JobVarRow[]) => void;
      mode?: "full" | "valueOnly";      // full: 행 추가·삭제·이름·형식 편집, valueOnly: 값만(코드 작업 — 이름·형식은 코드가 정한다)
      disabled?: boolean;
      hint?: ReactNode;                 // 표 아래 안내(유형마다 다른 쓰임)
      runtimeVariables?: { name: string; desc: string }[];   // 값 칸에 쓸 수 있는 실행 변수 안내. 기본 RUNTIME_VARIABLES
      title?: string;                   // 기본 「변수」
      idPrefix?: string;                // 기본 「job-variable」
    }
    ```

- [ ] **Step 1: 순수 함수 시험을 먼저 쓴다** (시안에는 시험이 없다 — 옮기는 동작을 고정한다)

```ts
// src/frontend/shared/tests/unit/cron-input.unit.test.ts
import { describe, expect, it } from "vitest";

import {
  buildCron,
  CRON_PRESETS,
  DEFAULT_EASY,
  describeCron,
  parseCron,
  runTimes,
  toEasy,
  validateCron,
  validateFieldText,
} from "../../src/components/cron-input/cron";

describe("parseCron", () => {
  it("5칸 식과 매크로를 읽는다", () => {
    expect(parseCron("0 2 * * *").ok).toBe(true);
    expect(parseCron("@daily").ok).toBe(true);
    expect(parseCron("0 4 * * 7").ok).toBe(true);
    expect(parseCron("0 9 * * MON-FRI").ok).toBe(true);
  });

  it("빈 글자·6칸·Spring 문법·범위 밖·일+요일 동시 제한을 거절한다", () => {
    expect(parseCron("  ")).toEqual({ ok: false, error: "crontab 식을 입력하세요." });
    expect(parseCron("0 0 0 * * *")).toMatchObject({ ok: false, error: expect.stringContaining("5칸") });
    expect(parseCron("0 0 L * *")).toMatchObject({ ok: false, error: expect.stringContaining("? L W #") });
    expect(parseCron("60 * * * *").ok).toBe(false);
    expect(parseCron("* 24 * * *").ok).toBe(false);
    expect(parseCron("0 9 1 * 1")).toEqual({ ok: false, error: "일과 요일 중 하나는 * 로 두세요." });
  });
});

describe("validateCron / validateFieldText", () => {
  it("간격 하한을 주면 더 짧은 식을 거절한다", () => {
    expect(validateCron("*/5 * * * *", 5)).toBeNull();
    expect(validateCron("*/2 * * * *", 5)).toContain("5분");
    expect(validateCron("0 2 * * *", 60)).toBeNull();
  });

  it("칸 하나의 오류를 칸 이름 없이 돌려준다", () => {
    expect(validateFieldText(0, "*/5")).toBeNull();
    expect(validateFieldText(0, "")).toBe("값을 입력하세요.");
    expect(validateFieldText(1, "25")).not.toBeNull();
  });
});

describe("describeCron", () => {
  it.each([
    ["* * * * *", "매분"],
    ["*/10 * * * *", "10분마다"],
    ["0 * * * *", "매시 정각"],
    ["0 2 * * *", "매일 02:00"],
    ["0 9 * * 1-5", "평일 09:00"],
    ["0 4 * * 0", "매주 일요일 04:00"],
    ["30 0 1 * *", "매월 1일 00:30"],
  ])("%s → %s", (expr, text) => {
    expect(describeCron(expr)).toBe(text);
  });

  it("올바르지 않은 식은 빈 글자", () => {
    expect(describeCron("nope")).toBe("");
  });
});

describe("runTimes", () => {
  it("from 다음 분부터 앞으로 count 개의 실행 시각을 돌려준다", () => {
    const parsed = parseCron("0 2 * * *");
    if (!parsed.ok) throw new Error("parse");
    const times = runTimes(parsed.cron, new Date(2026, 9, 8, 21, 23), 3);
    expect(times.map((d) => [d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
      [10, 9, 2, 0],
      [10, 10, 2, 0],
      [10, 11, 2, 0],
    ]);
  });
});

describe("쉬운 설정 왕복", () => {
  it.each(CRON_PRESETS.map((p) => p.value))("자주 쓰는 식 %s 는 쉬운 설정으로 나타내고 같은 식을 다시 만든다", (expr) => {
    const easy = toEasy(expr);
    expect(easy).not.toBeNull();
    const built = buildCron(easy!);
    expect(built).toEqual({ ok: true, cron: expr });
  });

  it("쉬운 설정으로 나타낼 수 없는 식은 null", () => {
    expect(toEasy("0 0 1 1 *")).toBeNull();
    expect(toEasy("0 9 1 * 1")).toBeNull();
  });

  it("만들 수 없는 설정은 사유를 돌려준다", () => {
    expect(buildCron({ ...DEFAULT_EASY, kind: "weekly", weekdays: [] })).toEqual({ ok: false, error: "요일을 하나 이상 고르세요." });
    expect(buildCron({ ...DEFAULT_EASY, kind: "daily", times: ["02:00", "03:30"] })).toMatchObject({ ok: false });
    expect(buildCron({ ...DEFAULT_EASY, kind: "everyNMinutes", interval: 5, limitHours: true, hourFrom: 20, hourTo: 8 })).toMatchObject({ ok: false });
  });
});
```

```ts
// src/frontend/shared/tests/unit/variable-table.unit.test.ts
import { describe, expect, it } from "vitest";

import { newVariableRow, normalizeVariableCell, RUNTIME_VARIABLES, VARIABLE_TYPE_LABEL } from "../../src/components/variable-table/variables";

describe("variable-table 순수 부분", () => {
  it("새 행은 빈 문자 변수", () => {
    expect(newVariableRow()).toEqual({ name: "", type: "STRING", value: "", desc: "" });
  });

  it("셀 정규화 — 이름은 앞뒤 공백을 지우고 나머지는 글자 그대로", () => {
    expect(normalizeVariableCell("name", "  baseDt ")).toBe("baseDt");
    expect(normalizeVariableCell("value", "  :today ")).toBe("  :today ");
    expect(normalizeVariableCell("value", null)).toBe("");
  });

  it("실행 변수 안내는 서버가 확정하는 이름과 같다(설계 §5.0)", () => {
    expect(RUNTIME_VARIABLES.map((r) => r.name)).toEqual([
      ":schedAt", ":now", ":today", ":yesterday", ":monthStart", ":prevMonthStart", ":prevRunAt", ":jobId", ":moduleCd",
    ]);
    expect(Object.keys(VARIABLE_TYPE_LABEL)).toEqual(["STRING", "NUMBER", "DATE", "JSON"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다** — `cd src/frontend` 다음 `pnpm --filter @dk-oasis/shared exec vitest run tests/unit/cron-input.unit.test.ts tests/unit/variable-table.unit.test.ts` → 모듈 없음으로 FAIL. (`ls -ld src/frontend/node_modules src/frontend/shared/node_modules` 로 심볼릭 링크인지 먼저 확인하고, 심링크가 아니면 이미 설치돼 있다 — `pnpm install` 은 하지 않는다.)

- [ ] **Step 3: 순수 부분을 옮긴다**

```bash
cd src/frontend
mkdir -p shared/src/components/cron-input shared/src/components/variable-table
/usr/bin/git mv m-design-dummy/src/screens/job-scheduler/cron.ts shared/src/components/cron-input/cron.ts
/usr/bin/git mv m-design-dummy/src/screens/job-scheduler/CronEasyEditor.tsx shared/src/components/cron-input/CronEasyEditor.tsx
/usr/bin/git mv m-design-dummy/src/screens/job-scheduler/CronDirectEditor.tsx shared/src/components/cron-input/CronDirectEditor.tsx
/usr/bin/git mv m-design-dummy/src/screens/job-scheduler/CronInput.tsx shared/src/components/cron-input/CronInput.tsx
/usr/bin/git mv m-design-dummy/src/screens/job-scheduler/VariableTable.tsx shared/src/components/variable-table/VariableTable.tsx
```
(시안은 `m-design-dummy` 의 다른 파일이 `./cron`·`./CronInput`·`./VariableTable` 을 import 한다 — 시안 화면은 Task 12 가 운영 화면을 만든 뒤에도 남겨 두므로, 시안의 import 를 `@dk-oasis/shared/cron-input`·`@dk-oasis/shared/variable-table` 로 바꾸는 일은 **하지 않는다**. 시안은 `git mv` 대신 **복사**로 둔다: 위 `git mv` 를 `cp` 로 바꿔 실행하고(`cp` 후 `git add`), 시안 폴더는 그대로 둔다.) 옮긴 `cron.ts` 편집: 파일 머리 설명에서 「시안 전용 계산기」·「시안에서는 브라우저가 같은 규칙으로 흉내 낸다」를 「입력 중 즉시 오류를 보이는 브라우저 계산기 — 설명·다음 예정·최종 검사는 서버(`cronPreview`)가 정본이다」로 고치고, 시간대 줄을 「브라우저 시간대를 쓴다(서버 미리보기가 Asia/Seoul 정본)」로 고친다. 로직은 바꾸지 않는다(시험이 고정한다).

`CronEasyEditor.tsx`·`CronDirectEditor.tsx`: import 만 바꾼다 — `@dk-oasis/shared/form` → `../form`(`Button`·`Checkbox`·`Input`·`Select` 는 `../form` index 에서 나온다).

`variables.ts` (새):

```ts
export type VariableType = "STRING" | "NUMBER" | "DATE" | "JSON";

export const VARIABLE_TYPE_LABEL: Record<VariableType, string> = {
  STRING: "문자",
  NUMBER: "숫자",
  DATE: "날짜",
  JSON: "JSON",
};

/** 변수 한 행. 값은 고정값이거나 실행 변수(:today 등)이다. */
export interface JobVarRow {
  name: string;
  type: VariableType;
  value: string;
  desc?: string;
}

/** 값 칸에 쓸 수 있는 실행 변수 — 서버가 선점 때 확정한다(예약 작업 설계 §5.0). 날짜 변수는 예정 시각 기준이다. */
export const RUNTIME_VARIABLES: { name: string; desc: string }[] = [
  { name: ":schedAt", desc: "예정 시각" },
  { name: ":now", desc: "선점 시각" },
  { name: ":today", desc: "예정 날짜" },
  { name: ":yesterday", desc: "예정 전날" },
  { name: ":monthStart", desc: "예정 달 1일" },
  { name: ":prevMonthStart", desc: "예정 전달 1일" },
  { name: ":prevRunAt", desc: "직전 성공 일정 회차의 예정 시각" },
  { name: ":jobId", desc: "작업 ID" },
  { name: ":moduleCd", desc: "실행 모듈" },
];

export const newVariableRow = (): JobVarRow => ({ name: "", type: "STRING", value: "", desc: "" });

/** 이름은 앞뒤 공백을 지우고, 나머지 칸은 글자 그대로 둔다. */
export const normalizeVariableCell = (field: string, value: unknown): string =>
  field === "name" ? String(value ?? "").trim() : String(value ?? "");
```

`VariableTable.tsx` (시안을 `kind`·mock 의존 없이 다시 쓴다):

```tsx
"use client";

/**
 * 변수 표 — 이름·형식·값·설명. 값에는 고정값이나 실행 변수(:today 등)를 쓴다. 업무 도메인을 모른다.
 * mode="valueOnly" 는 행 추가·삭제·이름·형식 편집을 막고 값만 고친다(코드로 정한 변수 목록용).
 * 표는 공용 AgDataGrid(valueOnly)·EditableRowList(full)로 그린다.
 */
import { useMemo, type ReactNode } from "react";

import { AgDataGrid, EditableRowList, GridPanel, type GridColumn } from "../grid";
import {
  newVariableRow,
  normalizeVariableCell,
  RUNTIME_VARIABLES,
  VARIABLE_TYPE_LABEL,
  type JobVarRow,
  type VariableType,
} from "./variables";

const TYPE_KEYS = Object.keys(VARIABLE_TYPE_LABEL) as VariableType[];
const typeLabel = (v: unknown) => VARIABLE_TYPE_LABEL[v as VariableType] ?? String(v ?? "");
const ROW_KEY = "__rowKey";

const EDIT_COLUMNS: GridColumn[] = [
  { key: "name", header: "이름", width: 3, minWidth: 90, align: "left", editable: true },
  {
    key: "type",
    header: "형식",
    width: 2,
    minWidth: 76,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: TYPE_KEYS,
    cellEditorValueLabels: VARIABLE_TYPE_LABEL,
    render: typeLabel,
  },
  { key: "value", header: "값", width: 4, minWidth: 110, align: "left", editable: true },
  { key: "desc", header: "설명", width: 4, minWidth: 100, align: "left", editable: true },
];

const VALUE_ONLY_COLUMNS: GridColumn[] = EDIT_COLUMNS.map((c) => (c.key === "value" ? c : { ...c, editable: false }));

export interface VariableTableProps {
  value: JobVarRow[];
  onChange: (rows: JobVarRow[]) => void;
  mode?: "full" | "valueOnly";
  disabled?: boolean;
  hint?: ReactNode;
  runtimeVariables?: { name: string; desc: string }[];
  title?: string;
  idPrefix?: string;
}

export function VariableTable({
  value,
  onChange,
  mode = "full",
  disabled = false,
  hint,
  runtimeVariables = RUNTIME_VARIABLES,
  title = "변수",
  idPrefix = "job-variable",
}: VariableTableProps) {
  const valueOnlyRows = useMemo(() => value.map((v, i) => ({ ...v, [ROW_KEY]: String(i) })), [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      {mode === "valueOnly" ? (
        <div style={{ height: Math.max(120, 64 + value.length * 28) }}>
          <GridPanel title={title} count={value.length}>
            <AgDataGrid
              gridId={`${idPrefix}-value-only`}
              personalize={false}
              rowKey={ROW_KEY}
              columns={VALUE_ONLY_COLUMNS}
              data={valueOnlyRows}
              columnSizing="fit"
              singleClickEdit
              emptyMessage="변수가 없습니다."
              onCellValueChanged={({ rowKey, field, newValue }) => {
                if (disabled) return;
                const idx = Number(rowKey);
                onChange(value.map((v, i) => (i === idx ? { ...v, [field]: String(newValue ?? "") } : v)));
              }}
            />
          </GridPanel>
        </div>
      ) : (
        <EditableRowList<JobVarRow>
          title={title}
          items={value}
          columns={EDIT_COLUMNS}
          onChange={onChange}
          newItem={newVariableRow}
          addLabel="행 추가"
          emptyMessage="변수가 없습니다. [행 추가]로 더합니다."
          normalize={normalizeVariableCell}
          height={220}
          idPrefix={idPrefix}
        />
      )}
      {hint ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{hint}</div> : null}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        값에는 고정값이나 실행 변수를 씁니다: {runtimeVariables.map((r) => `${r.name}(${r.desc})`).join(" · ")}
      </div>
    </div>
  );
}
```

`index.ts` 두 개:
```ts
// cron-input/index.ts
export { CronInput } from "./CronInput";
export type { CronInputProps, CronPreview } from "./CronInput";
export {
  buildCron, CRON_PRESETS, DEFAULT_EASY, describeCron, formatWithDow, parseCron, runTimes, toEasy, validateCron, validateFieldText,
} from "./cron";
export type { BuildResult, CronResult, EasyConfig, ParsedCron } from "./cron";
```
```ts
// variable-table/index.ts
export { VariableTable } from "./VariableTable";
export type { VariableTableProps } from "./VariableTable";
export { newVariableRow, normalizeVariableCell, RUNTIME_VARIABLES, VARIABLE_TYPE_LABEL } from "./variables";
export type { JobVarRow, VariableType } from "./variables";
```

`CronInput.tsx` 편집(시안에서 옮긴 파일):
1. 머리 설명에서 「나중에 공통 컴포넌트로 옮길 후보」 문장을 지운다. import 를 `import { Button, Input, SegmentedControl } from "../form";`·`import { CopyTextButton } from "../copy-text-button";`·`import { useEffect, useMemo, useState } from "react";` 로 바꾼다(`CopyTextButton` 은 시안에서 `form` 에서 나왔으나 shared 내부에서는 `../copy-text-button` 이다).
2. props 와 미리보기 부분을 아래로 바꾼다(`previewCount` 기본 5는 그대로).

```tsx
export interface CronPreview {
  valid: boolean;
  error?: string;
  desc?: string;
  next?: string[];
  minGapMin?: number;
}

export interface CronInputProps {
  /** crontab 5칸 식. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** 실행 간격 하한(분). 주면 더 짧은 식은 오류로 보인다. */
  minGapMin?: number;
  /** 서버(cronPreview)가 계산한 설명·다음 예정·오류. 없으면 브라우저 계산을 보인다. */
  preview?: CronPreview | null;
  /** 올바른 식이 400ms 멈추면 부른다 — 화면이 서버 미리보기를 불러 {@link CronInputProps.preview} 로 돌려준다. */
  onRequestPreview?: (expr: string) => void;
  /** 보여 줄 다음 예정 개수. 기본 5. */
  previewCount?: number;
}
```
   본문에서: 함수 매개변수에 `preview, onRequestPreview` 를 더하고, `description`·`next` 계산(`useMemo` 두 개)을 아래로 바꾼다.

```tsx
  const serverOk = preview?.valid === true;
  const description = serverOk && preview?.desc ? preview.desc : value ? describeCron(value) : "";
  const localNext = useMemo(() => {
    const parsed = parseCron(value);
    return parsed.ok && !error ? runTimes(parsed.cron, new Date(), previewCount).map(formatWithDow) : [];
  }, [value, error, previewCount]);
  const next = serverOk && preview?.next ? preview.next.slice(0, previewCount) : localNext;
  const serverError = preview && preview.valid === false ? (preview.error ?? null) : null;

  useEffect(() => {
    if (!onRequestPreview || !value || error) return undefined;
    const timer = setTimeout(() => onRequestPreview(value), 400);
    return () => clearTimeout(timer);
  }, [value, error, onRequestPreview]);
```
   `shownError` 계산 뒤에 서버 오류를 더한다: `const finalError = shownError ?? serverError;` 하고 JSX 의 `shownError` 를 `finalError` 로 바꾼다. `invalid` 에 `|| serverError !== null` 를 더한다. 다음 예정 목록 렌더링은 `next` 가 이제 글자 배열이므로 `next.map((t) => <li key={t}>{t}</li>)` 로 바꾼다. 맨 아래 「시안에서는 브라우저가 계산한 값입니다…」 `div` 를 지운다.
3. `data-testid` 는 시안 그대로 둔다(`cron-mode`·`cron-expression`·`cron-error`·`cron-mode-notice`).

- [ ] **Step 4: 노출한다** (`docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` §18-3 4번)

`shared/tsup.config.ts` 의 `entry` 에 `"json-view"` 줄 다음에 추가:
```ts
    "cron-input": "src/components/cron-input/index.ts",
    "variable-table": "src/components/variable-table/index.ts",
```
`shared/package.json` 의 `exports` 에 `"./json-view"` 블록 다음에 추가:
```json
    "./cron-input": {
      "types": "./dist/types/components/cron-input/index.d.ts",
      "import": "./dist/cron-input.js"
    },
    "./variable-table": {
      "types": "./dist/types/components/variable-table/index.d.ts",
      "import": "./dist/variable-table.js"
    },
```
`part-b-shared-policy.md` §1 표에서 `@dk-oasis/shared/json-view` 줄 다음에 추가:
```
| `@dk-oasis/shared/cron-input`                 | SHOULD                 | crontab 5칸 식 입력(쉬운 설정·직접 입력·미리보기) | §18              |
| `@dk-oasis/shared/variable-table`             | SHOULD                 | 이름·형식·값 변수 표(실행 변수 안내)  | §18              |
```

- [ ] **Step 5: 시험·빌드를 돌린다**
  - `pnpm --filter @dk-oasis/shared exec vitest run tests/unit/cron-input.unit.test.ts tests/unit/variable-table.unit.test.ts` → PASS. 「자주 쓰는 식 왕복」이 특정 식에서 실패하면 시안의 `buildCron`/`toEasy` 동작을 고치지 말고(시안 동작이 정본) 그 식을 `CRON_PRESETS` 시험 대상에서 빼는 대신 이유를 기록한다.
  - `pnpm --filter @dk-oasis/shared exec tsc --noEmit -p tsconfig.json` → 오류 없음.
  - `pnpm --filter @dk-oasis/shared build` → dist 에 `cron-input.js`·`variable-table.js` 와 `dist/types/components/cron-input/index.d.ts` 가 생긴다. dev watch 가 떠 있어 exit 144 로 끝나면 실패가 아니다 — `ls src/frontend/shared/dist/cron-input.js src/frontend/shared/dist/variable-table.js` 로 확인한다.
  - `node .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.mjs audit src/frontend/shared/src/components/cron-input src/frontend/shared/src/components/variable-table` 와 `node .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit …(같은 두 경로)` → 0건. 의심 건이 오탐이면 이유를 최종 보고에 적는다.

- [ ] **Step 6: 스킬 문서·색인을 갱신한다** (§18-3 6번, 같은 Task 안에서)

`.claude/skills/mantine-aggrid-ui/references/components/cron-input.md` 와 `variable-table.md` 를 [json-view.md](references/components/json-view.md) 와 같은 형식(머리 한 줄 요약 → import → 소스 → 내부 구현 → Part B 허용 목록 → `## 언제 쓰나` → `## 표준 사용` → `## Props` → `## 흔한 실수`)으로 쓴다. 꼭 들어갈 내용:
- `cron-input.md`: import `import { CronInput, type CronPreview, describeCron, validateCron } from "@dk-oasis/shared/cron-input";`. 언제 쓰나 — 반복 일정을 crontab 5칸 식으로 입력받을 때(쉬운 설정/직접 입력 전환). 날짜·기간 하나를 고르는 입력은 [date-picker](date-picker.md). 설명·다음 예정은 서버가 계산하는 것이 정본이고 브라우저 계산은 입력 중 오류 표시용이라는 점, `preview`/`onRequestPreview` 연결 예(화면이 `cronPreview` 를 부르고 결과를 `preview` 에 넣는다), `minGapMin`(수집 작업 5분·환율 60분), 쉬운 설정이 식을 만들 수 없으면 빈 글자를 올려 저장 버튼이 막힌다는 점. 흔한 실수 — Spring 6칸 식(`0 0 2 * * *`)을 넣는 것, 일·요일을 함께 제한하는 식(crontab 은 OR, 이 입력은 거절), 서버 미리보기를 받지 않고 브라우저 계산만 믿는 것.
- `variable-table.md`: import `import { VariableTable, type JobVarRow, RUNTIME_VARIABLES } from "@dk-oasis/shared/variable-table";`. 언제 쓰나 — 이름·형식·값·설명 네 칸의 변수 목록을 편집할 때. 일반 목록 편집은 [editable-row-list](editable-row-list.md), 읽기 전용 표는 [ag-data-grid](ag-data-grid.md). `mode="valueOnly"` 는 코드로 정한 목록(값만), `runtimeVariables` 는 안내문 교체.

`SKILL.md` 의 json-view 행 아래에 두 행을 더한다:
```
| crontab 5칸 식 입력(쉬운 설정·직접 입력·설명·다음 예정) | `cron-input`: `CronInput`(`preview`·`onRequestPreview` 로 서버 cronPreview 결과를 보인다), 순수 함수 `describeCron`·`validateCron`·`buildCron`·`toEasy` |
| 이름·형식·값 변수 표(실행 변수 안내 포함) | `variable-table`: `VariableTable`(`mode="valueOnly"` 는 값만 편집) |
```
`references/mantine-catalog.md` 표에는 행을 더하지 않는다(대응하는 Mantine 컴포넌트가 없다). `scripts/ui_docs.mjs` 의 `GROUPS` 「탭·트리·룩업·기타」 목록에서 `"json-view"` 뒤에 `"cron-input", "variable-table"` 을, `EXPORT_FILES` 에서 `"components/json-view/index.ts"` 뒤에 `"components/cron-input/index.ts", "components/variable-table/index.ts"` 를 더한다. 그다음:

```bash
node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs index --write
node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs full --write
node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs coverage
node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs check-examples
```
`coverage` 가 새 export 누락을 알리면 `cron-input.md`·`variable-table.md` 에 그 이름을 적는다. `check-examples` 가 오류 없이 끝나야 한다.

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/frontend/shared .claude/skills/mantine-aggrid-ui docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md
/usr/bin/git commit -m "$(printf 'feat(shared): crontab 입력 칸과 변수 표를 공통 컴포넌트로 등록한다\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 12: m-mcm 화면 `csa/jobSchedMng` (예약 작업 관리)

**담당 후보:** Claude sonnet/high · **Model:** sonnet/high · **의존:** Task 10(서비스 응답 형식), Task 11(shared `CronInput`·`VariableTable`)

설계 §7. 시안(`src/frontend/m-design-dummy/src/screens/JobSchedulerScreen.tsx` 와 `job-scheduler/`)을 운영 화면으로 옮기고 §7 「시안 수정」을 반영한다. 본보기는 `csa/commWidgetMng/`(`page.tsx`·`api.ts`·`api.test.ts`·`form-model.ts`)이다. 코드 세부는 구현 레인이 본보기를 읽고 정한다 — 아래는 이름·형식·시험 목록이다.

**Files:**
- Create(`src/frontend/m-mcm/page-components/csa/jobSchedMng/`): `page.tsx`, `api.ts`, `api.test.ts`, `types.ts`, `form-model.ts`, `form-model.test.ts`, `KindEditors.tsx`, `KindPickerModal.tsx`, `JobDetailForm.tsx`, `JobBadges.tsx`, `job-kinds.tsx`, `HistoryPanel.tsx`(필요하면)
- Modify: `src/frontend/m-mcm/lib/generated/page-registry.ts` — 손으로 고치지 않고 `pnpm --filter @dk-oasis/mcm generate:page-registry` 로 재생성(없으면 `pnpm --filter @dk-oasis/mcm exec node scripts/generate-page-registry.mjs`).
- 시안 폴더(`m-design-dummy`)는 그대로 둔다(삭제 금지).

**Interfaces:**
- Consumes(Task 10): `POST /api/mcm/oasis/jobSchedMng/{action}`, action `list`·`get`·`save`·`setUse`·`runNow`·`history`·`cronPreview`·`handlers`·`delete`. 응답 키는 Task 10 의 표(`jobs`·`def`·`accepted/message/runId`·`runs`·`valid/error/desc/next/minGapMin`·`handlers`·`deleted`). 요청 필드 `jobId, moduleCd, jobNm, jobKind, serviceId, svcAction, cronExpr, useYn, configJson, varsJson, optsJson, jobDesc, timeoutSec, ver, newJob, limit, keyword, lastStatus, expr, varOverridesJson`. `jobKind` 는 `CODE`·`BPMN`·`QUERY`·`COLLECT`.
- Consumes(Task 11): `CronInput`(`preview`·`onRequestPreview` ← `cronPreview` 호출), `VariableTable`(`mode="valueOnly"` 는 CODE 일 때, 그 밖에는 `full`).
- Produces: `api.ts` 의 `jobSchedApi = { list, get, save, setUse, runNow, history, cronPreview, handlers, remove }`(각각 `createJsonApiClient` + `unwrapPayload` + `dropNullParams`, 본보기 `commWidgetMng/api.ts` 와 같은 틀). `form-model.ts` 의 `emptyForm(kind, moduleCd)`, `toForm(def)`, `toSaveRequest(form)`, `validateForm(form): string | null`.

**화면 규칙(§7):**
- 배치는 위젯관리와 같다 — 조회 조건(모듈·유형·사용·최근 결과·이름/ID) / 왼쪽 「작업 목록」 그리드 / 오른쪽 상세(공통 칸 → 일정 → 유형별 입력 → 변수 표 → 고급) / 아래 「실행 이력」.
- 유형 카드 4개(코드 실행·서비스 실행·쿼리 실행·수집). CODE 는 `handlers` 응답에서 처리기 고르기(자유 입력 없음), 「코드 없음」 배지(`codeMissing`). COLLECT 는 원천(SQL/HTTP/환율)과 「저장 안 함」 칸(`save`)을 갖고, 환율은 모듈이 MCM 일 때만 고를 수 있다. 이력 열에 서비스 태그. 「이어 실행」 칸 없음. 최소 간격 하한은 COLLECT 5분(환율 60분)을 `CronInput.minGapMin` 으로 넘긴다.
- 버튼은 `canDoButton` 으로 action 권한을 건다(`save`·`setUse`·`runNow`·`delete`). 저장 때 `ver` 를 같이 보내 낙관적 잠금 실패를 사용자 문구로 보인다. 「지금 실행」 결과는 `accepted=false` 면 `message` 를 그대로 보인다.
- 새로 만든 shared 컴포넌트가 아닌 화면 전용 부품은 이 폴더에 둔다. 업무 도메인에 묶이지 않는 부품이 더 생기면 shared 에 등록하고 스킬 문서까지 같은 Task 에서 갱신한다.
- 성능: `docs/guide/FrontEnd/` 의 화면 성능 가이드 §7 점검표(리렌더 범위·그리드 컬럼 정의 고정·콜백 안정화)를 지킨다.

**꼭 있어야 할 시험:**

| 파일 | 시험 이름 | 기대 |
|---|---|---|
| `api.test.ts` | `list 는 모듈·유형 조건을 보내고 null 은 떨군다` | fetch 스텁이 `/api/mcm/oasis/jobSchedMng/list` 로 조건만 받는다 |
| `api.test.ts` | `save 는 ver 와 newJob 을 그대로 보낸다` | 본문에 `ver`·`newJob` 이 있다 |
| `api.test.ts` | `응답 data.result 를 풀어 jobs 를 돌려준다` | `unwrapPayload` 결과 |
| `form-model.test.ts` | `CODE 는 처리기를 고르지 않으면 검증 실패` | `validateForm` 이 문구 반환 |
| `form-model.test.ts` | `COLLECT 환율은 MCM 이 아니면 검증 실패` | 문구 반환 |
| `form-model.test.ts` | `변수 JSON 왕복` | `toSaveRequest(toForm(def)).varsJson` 이 정규화되어 같다 |
| `form-model.test.ts` | `유형이 바뀌면 이전 유형의 configJson 을 버린다` | `emptyForm`/전환 함수 |
| `form-model.test.ts` | `BPMN 은 svcAction 을 action 으로 쓰지 않는다` | 요청 키가 `svcAction` |

**검증 명령** (`src/frontend` 에서, `pnpm install` 은 하지 않는다 — 먼저 `ls -ld node_modules m-mcm/node_modules` 로 심링크 확인):
- `pnpm --filter @dk-oasis/mcm exec vitest run page-components/csa/jobSchedMng` → PASS
- `pnpm --filter @dk-oasis/mcm exec tsc --noEmit` → 오류 없음
- `node .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.mjs audit src/frontend/m-mcm/page-components/csa/jobSchedMng` 와 `aggrid_docs.mjs audit …` → 0건(오탐은 이유를 보고)
- 브라우저 확인은 **레인 PDB 에 붙인 서버**로만 한다(L_MAIN 금지). ego-browser 로 목록→상세→저장→지금 실행→이력까지 보고, 끝나면 작업 공간을 닫는다. 서버를 띄울 수 없으면 확인하지 못했다고 보고하고 단위 시험까지만 주장한다.

**커밋:** `feat(mcm-ui): 예약 작업 관리 화면을 추가한다`

---

### Task 13: 위젯 collect 프런트 삭제

**담당 후보:** Claude sonnet/high · **Model:** sonnet/high · **의존:** Task 6(백엔드 collect 위젯 삭제와 같은 흐름), 독립으로 진행 가능

설계 §6(없애는 것). 위젯의 collect 유형은 예약 작업의 COLLECT 로 대체된다. 다른 위젯 유형의 동작은 바꾸지 않는다.

**Files:**
- Delete(`git rm -r`): `src/frontend/m-mcm/widget-types/collect/`(경로 목록: `useCollectData.ts`·`renderer.tsx`·`editor.tsx`·`format.ts`·`styles.ts`·`type.meta.ts` 와 각 `*.test.ts`)
- Modify: `src/frontend/m-mcm/lib/generated/widget-type-registry.ts`(재생성: `pnpm --filter @dk-oasis/mcm generate:widget-registry`), `widget-types/_query/SqlEditor.tsx`(variant `"collect"` 제거)·`widget-types/_query/sql-editor.test.ts`·`widget-types/_query/api.ts`(collect 주석), `page-components/csa/commWidgetMng/form-model.ts`(collect 분기)·`form-model.test.ts`, `help/widget-guide-content.ts`(collect 절 제거)·`widget-guide-sync.test.ts`
- Modify(문서): `docs/widget-2026-10/spec-widget-data.md` 머리에 「폐기: collect 위젯은 예약 작업(docs/superpowers/specs/2026-10-08-job-scheduler-design.md) 으로 대체」 한 줄, `docs/guide/FrontEnd/Widget-Authoring-Guide.md` 의 collect 설명 정리

**Interfaces:** Consumes — 없음. Produces — 위젯 유형 목록에서 `collect` 가 빠진다. `widget-type-registry.ts` 를 손으로 고치지 않는다.

**꼭 있어야 할 시험(기존 시험 수정 포함):**

| 파일 | 시험 | 기대 |
|---|---|---|
| `lib/generated` 대조(`widget-registry-lib.test.mjs`) | 기존 | `collect` 없이 통과 |
| `commWidgetMng/form-model.test.ts` | `collect 유형이 목록에 없다` | 유형 선택지에 `collect` 없음 |
| `widget-guide-sync.test.ts` | 기존 | 가이드와 유형 목록이 같다 |
| `_query/sql-editor.test.ts` | `variant 는 query 만` | collect 전용 단언 제거 |

**검증 명령:** `pnpm --filter @dk-oasis/mcm exec vitest run` (m-mcm 전체 — 이 Task 가 가장 넓게 건드린다) → PASS, `pnpm --filter @dk-oasis/mcm exec tsc --noEmit` → 오류 없음, `grep -rn "widget-types/collect\|'collect'\|\"collect\"" src/frontend/m-mcm --include=*.ts --include=*.tsx --include=*.mjs --exclude-dir=node_modules --exclude-dir=.next` → 예약 작업의 `COLLECT`(대문자)만 남는다.

**커밋:** `refactor(mcm-ui): 위젯 collect 유형 프런트를 삭제한다`

---

### Task 14: 마무리 — 가이드·골든·템플릿 재생성·전체 시험

**담당 후보:** GLM 또는 opencode(확인은 Claude) · **Model:** sonnet/high · **의존:** Task 1~13

설계 §9(시험)·§10(DB 적용과 메뉴 등록). 전체 시험은 머지 직전 이 Task 에서 한 번만 돌린다.

**Files:**
- Modify: `docs/guide/BackEnd/Backend-Implementation-Guide.md` — 「긴 SQL 은 쿼리 시간 초과를 건다」와 「내장 서비스(`jobCode`·`jobQuery`·`jobCollect`)는 `createNewService`·병렬 안에서 부르지 않는다(범위 `ThreadLocal` 이 넘어가지 않는다)」 각 한 줄.
- Modify: `src/backend/mcm/api/src/test/resources/init/data-initializer-fingerprint.golden.txt` — `CoreRbacSeeder.allActions` 에 Task 10 이 더한 6개 action 때문에 재생성.
- Regenerate: `TPL_SCHEMA`(Oracle 템플릿) — V3 를 고쳤으므로 레인 PDB 에서 `scripts/oracle/pdb.mjs` 의 `template-schema` 절차(없으면 `scripts/oracle/README` 의 TPL_SCHEMA 재생성 절)로 다시 만든다. 레인 PDB 가 없으면 만들지 말고 「재생성 필요」로 보고한다. 공용 L_MAIN 은 건드리지 않는다.

**순서와 명령** (JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`, gradle `--max-workers=2`):
1. 가이드 두 줄 추가.
2. `cd src/backend/mcm && FINGERPRINT_UPDATE=true ../gradlew :api:test --tests '*DataInitializerSeedFingerprintTest' --max-workers=2` → 골든이 바뀐다. `git diff` 에 추가한 6개 action 만 있는지 본다(다른 변화가 있으면 멈추고 보고).
3. 전체 시험 1회 — 각각 `-Pdmes.ora.test=clone` 으로: `src/backend/cactus-core`(`../gradlew test`), `src/backend/mcm-core`, `src/backend/mcm`(`:api:test` 와 하위 모듈), `src/backend/mdm`·mpp·mls·mqc·mpn 중 `JobAgentWiringTest`·`JobRunHttpSecurityTest` 가 있는 모듈은 반드시. 프런트 `pnpm --filter @dk-oasis/shared test`, `pnpm --filter @dk-oasis/mcm test`, `tsc --noEmit`, 스킬 audit.
4. `oasis-contract-check`(스킬/스크립트)로 OASIS 계약 점검 → 이상 없음.
5. `grep -rn "@Scheduled" src/backend --include=*.java | grep -v "/test/"` → `JobDispatchTrigger` 한 곳(D3).
6. 알려진 기존 실패 `MomTcErrorSearchOraTest` 는 범위 밖 — 실패해도 이 작업의 결과가 아니라고 보고하고 고치지 않는다.
7. 커밋: 가이드·골든을 따로 또는 한 번에 `docs(guide): 예약 작업 구현 지침을 더하고 시드 골든을 재생성한다`.

**머지 요청 때 조정자에게 쓸 한 줄:** 「V3 GRANT 대상 5개 사용자(MDMAPUSER·MPPAPUSER·MLSAPUSER·MQCAPUSER·MPNAPUSER)가 개발·운영 DB 에 있어야 한다. 운영 프로필 호출 주소(`dmes.job.mcm-url` 등)는 값 없이 자리만 있다. 윈도우 영향: 없음(스크립트 변경 없음).」

**보고에 넣을 후속(고치지 않는다):** `WidgetQueryRunner.runCollect`·`validateCollectSql` 는 호출자가 없어졌으나 그대로 둔다(정리는 후속). 옛 `TB_MCM_WIDGET_COLLECT_*` 표는 삭제하지 않는다(DB 삭제는 사용자 결정). 공용 DB(L_MAIN)에는 V3 가 아직 적용되지 않았다(워크트리 서버를 L_MAIN 에 붙이지 않았다).

---

## Self-Review

**1. 설계 절 → 담당 Task**

| 설계 절 | Task |
|---|---|
| §0 배경·결정 | 헤더(Goal·Architecture) |
| §1 지금 상태 | 파일 구조, Task 9(기존 @Scheduled 이관) |
| §2 구성 | 헤더 Architecture, Task 4·5·7 |
| §3.1~3.4 표 | Task 1(V3), Task 3(결과 갱신), Task 10(DefStore) |
| §3.5 GRANT | Task 1, Task 14(머지 요청 문구) |
| §4.0 crontab | Task 2 |
| §4.1~4.2 판정·선점 | Task 7 |
| §4.3 MCM→모듈 호출 | Task 8 |
| §4.4 모듈 접수·진입점 | Task 4, Task 5 |
| §4.5 결과 DB 직접 갱신 | Task 3 |
| §4.6 캐시 없음·정리 | Task 7(색인 조회), Task 8(정리) |
| §4.7 모듈 설정 | Task 1(JobProperties), Task 9(yml) |
| §4.8 로그 | Task 7(트리거 MDC·sch 로그 시험) |
| §4.9 지금 한 번 실행 | Task 10(`claimManual`·`runNow`) |
| §4.10 서버 간 API | Task 5(컨트롤러·보안 시험) |
| §5.0 변수 | Task 2, Task 11(변수 표) |
| §5.1 유형·내장 서비스 | Task 6 |
| §5.2 코드 실행 | Task 5, Task 9(어댑터) |
| §5.3 실행 사용자 | Task 3(`userId`), Task 10 |
| §5.4 수집 | Task 6 |
| §5.5 재시도 | Task 4 |
| §6 없앰·옮김·재사용 | Task 1(JobDataSource), Task 6(이동·삭제), Task 9, Task 13 |
| §7 화면 | Task 11, 12, 13 |
| §8 권한·보안 | Task 4·5·6·7·10(Review Focus 5), Task 10(메뉴 SQL) |
| §9 시험 | 각 Task 의 시험, Task 14(전체 1회) |
| §10 DB 적용·메뉴 | Task 10, Task 14 |
| §11 결정 항목 | 해당 Task 의 설계 절 인용 |
| §12 폐기안 | 구현하지 않음 |

**2. 자리표시자 검사.** Task 1~11 은 코드와 명령을 모두 적었다. Task 12~14 는 조정자 지시(토큰 절약)로 코드 블록 대신 이름·형식·시험 목록·명령만 적었다 — 구현 레인이 본보기(`commWidgetMng`, JsonView 등록 선례 d6c0a1b5d)를 읽고 채운다. 「TBD」「Task N 과 비슷」 표현은 쓰지 않았다.

**3. 이름 일관성** (여러 Task 가 같은 이름을 쓴다)
- `JobRunDispatcher.SubmitResult`(ACCEPTED·DUPLICATE·JOB_RUNNING·POOL_FULL) — Task 4 정의, Task 5(`JobRunAcceptor`)가 사용.
- `JobRunReporter` 인터페이스 / `JobRunResultWriter.WriteResult`(WRITTEN·LATE·FAILED) — Task 3 정의, Task 4 사용.
- `JobDispatchService.ClaimedBatch` / `ManualClaim` — Task 7·10. `JobCallSink`(Task 7 인터페이스) ↔ `JobCaller`(Task 8 구현).
- `JobSchedMngService` 6인자 생성자 `(JobDefStore, JobDispatchService, JobCallSink, JobCollectSql, Duration, SecurityIdentity)` — Task 10 정의와 시험이 같다.
- BPMN 서비스 Action 요청 필드는 `svcAction`(예약 키 `action` 과 충돌 회피) — Task 10 서비스·Task 12 화면.
- `jobKind` 값 `CODE`·`BPMN`·`QUERY`·`COLLECT` — Task 1 CHECK, Task 6, Task 10, Task 12.

**4. Review Focus ↔ 시험.** 1→Task 7, 2→Task 7·10, 3→Task 3·8, 4→Task 5·9, 5→Task 4·6. 각 줄의 시험은 해당 Task 안에 있다.

**5. 실행 전 조정자 확인 필요:** 헤더 「설계와 다름」 D1(mcm-core 의 cactus-core 의존 허용과 `McmCoreArchitectureTest` 예외). 이것이 거절되면 Task 1·3~8 의 경계가 달라진다.
