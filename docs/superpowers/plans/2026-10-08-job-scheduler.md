# 예약 작업 관리(모듈별 JOB 스케줄러) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 각 모듈 앱(MCM·MDM·MPP·MLS·MQC·MPN)이 MCM 표에 등록된 자기 모듈의 crontab 일정 작업을 서버 여러 대 중 한 대만 실행하게 하고, MCM 공통관리 화면에서 작업을 등록·관리한다. 위젯 「자동 수집」 유형은 지운다.

**Architecture:** mcm-core 에 `com.dongkuk.dmes.mcm.job` 패키지를 둔다. 정의는 모듈 키 캐시에 두고 매분 틱은 캐시만 본다. 할 일이 있을 때만 JOB 전용 연결(`JobDataSource`)로 `FOR UPDATE SKIP LOCKED` 선점 트랜잭션을 짧게 돌리고, 실행은 트랜잭션 밖 실행 풀에서 유형별 실행기(CODE·BPMN·QUERY·COLLECT·HTTP·PURGE)가 맡는다. 화면은 mcm OASIS 서비스 `jobSchedMng` + m-mcm `csa/jobSchedMng`.

**Tech Stack:** Java 21, Spring Boot 3, Spring `CronExpression`·`JdbcTemplate`·`TransactionTemplate`·`ThreadPoolTaskScheduler`, HikariCP, Oracle 26ai(로컬 PDB), OASIS BPMN, Next.js(m-mcm)·`@dk-oasis/shared`(Mantine 9·ag-grid 33), JUnit 5·AssertJ·vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-job-scheduler-design.md` (실행자는 이 계획과 함께 반드시 읽는다). 화면 시안: `src/frontend/m-design-dummy/src/screens/JobSchedulerScreen.tsx`·`screens/job-scheduler/**`.

## Global Constraints

- 워크트리 `/Users/jji/project/dmes-wt/job-scheduler-mng` 안에서만 작업. git 은 `/usr/bin/git`. 복합 셸 명령(`&&`·`;`)은 거절될 수 있으니 하나씩.
- JDK 21: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` 뒤 Gradle. gradle `--max-workers=2` 이하. 도커 금지(Oracle 컨테이너는 pdb.mjs 경유만 예외).
- **L_MAIN(공용 DB)에 붙여 앱을 띄우거나 쓰지 않는다.** Oracle 시험은 `-Pdmes.ora.test=clone`(T_ PDB 자동 복제·삭제)으로만 돌린다. 레인 개발 PDB 가 필요하면 `node scripts/oracle/pdb.mjs clone TPL_SCHEMA L_JOBSCHED`(쓴 뒤 `drop`).
- 금지(먼저 메인 세션에 묻는다): cactus-core `scheduling`·`datasource`·`oasis` 동작 변경, `MdmRevisionPoller`, shared 기존 컴포넌트 변경(새 컴포넌트 등록은 허용), 운영 프로필 값 채우기(자리만), DB 행·브랜치 삭제.
- 시각 칸은 `TIMESTAMP(6)`(KST). `TIMESTAMP WITH (LOCAL) TIME ZONE` 쓰지 않음. 시간대 상수 `ZoneId.of("Asia/Seoul")`.
- JOB 표 SQL 은 모두 `MCMAPUSER.` 접두 + `JobDataSource` 의 JdbcTemplate. JOB 표용 JPA 엔티티 금지.
- 작업 ID 정규식 `^[A-Za-z0-9_.-]{1,60}$`, 모듈 키 `MCM|MDM|MPP|MLS|MQC|MPN`(대문자), 로그 이름 `sch.job.<JOB_ID>`, 틱 로그 이름 `sch.jobTicker.tick`(runQuiet).
- 실행 기록 `MSG` 500자, 주소·인증값·DB 원문 메시지 금지(예외는 `getClass().getSimpleName()` 만).
- 문서·주석·UI 문구 한국어. 커밋 `type(scope): 한국어 subject`, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. push 금지.
- 화면: shared 래퍼만(`@mantine/*`·`ag-grid-*` 직접 import 금지), 로컬 `.css` import 금지, `mantine-aggrid-ui` 스킬 audit 0건. 새 공통 부품은 shared 에 등록하고 같은 작업에서 스킬 컴포넌트 문서·색인 갱신(CLAUDE.md 행동강령).
- Windows 사용자도 쓰므로 스크립트에 macOS 전용 명령 금지.

## Review Focus

1. **두 서버가 같은 분에 동시에 깨어남** → 한 회차는 정확히 한 번 RUN. (Task 5 의 두 연결 경합 시험)
2. **서버가 오래 꺼졌다 켜짐**(NEXT_RUN_AT 이 몇 시간 전) → 밀린 회차를 줄줄이 돌리지 않고 SKIP 1건 + 다음 미래 시각. (Task 5)
3. **실행이 시간 초과 뒤 늦게 끝남** → 이미 TIMEOUT 인 행을 OK 로 덮어쓰지 않음. (Task 5·6)
4. **다른 모듈 앱의 기동**(mdm 등에 JOB 전용 연결 설정) → 기본 DataSource·JPA 가 그대로, DataSource 형식 빈이 늘지 않음. (Task 1·10)
5. **화면에서 일정 수정 직후** → 저장한 서버는 즉시, 다른 서버는 10초 안에 새 일정으로 판정; 할 일 없는 분에는 SQL 0회. (Task 4·6)

---

## 파일 구조

```
src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V3__job_scheduler.sql   (Task 1)
src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/job/
  JobProperties.java            dmes.job.* 설정(enabled·module·server-name·pool-size·ver-poll-sec·datasource·http·collect)   (Task 1)
  JobDataSource.java            JOB 전용 연결 포장(DataSource 형식 빈 아님) + JdbcTemplate·TransactionTemplate   (Task 1)
  JobConfig.java                @Configuration — 빈 조립(JobDataSource·캐시·엔진·유형 등록부)   (Task 1, 6 에서 확장)
  JobModule.java                모듈 키 enum MCM..MPN + 앱 모듈 판정   (Task 1)
  def/CronSpec.java             crontab 5칸 파싱·검사·다음 시각·설명·최소 간격   (Task 2)
  def/JobVar.java, def/JobVars.java   변수 모델·JSON·실행 변수 확정   (Task 3)
  def/JobDef.java               정의 레코드   (Task 4)
  def/JobDefStore.java          정의·버전 JDBC(조회·저장·버전 +1·코드 작업 INSERT IF ABSENT)   (Task 4)
  def/JobDefCache.java          Map<JobModule, ModuleDefs> 캐시 + 버전 확인   (Task 4)
  run/JobRunStore.java          실행 기록 JDBC(INSERT·finish·timeout sweep·REQ·이력)   (Task 5)
  run/JobClaimer.java           선점 트랜잭션   (Task 5)
  run/ClaimedRun.java           선점 결과 레코드   (Task 5)
  run/JobTicker.java            매분 틱(캐시 판정 → 선점 → 실행 풀 제출)   (Task 6)
  run/JobExecutor.java          실행 풀·시간 초과·로그 태그·finish   (Task 6)
  run/JobEngine.java            SmartLifecycle — 전용 TaskScheduler·버전 확인 주기·REQ 처리   (Task 6)
  kind/JobKind.java             유형 SPI(id·validate·run)   (Task 6)
  kind/JobContext.java          실행 문맥(def·schedAt·manual·vars·reqUser)   (Task 6)
  kind/JobKindRegistry.java     유형 빈 모음   (Task 6)
  kind/code/ScheduledJob.java, CodeJobKind.java, CodeJobRegistrar.java   (Task 7)
  kind/bpmn/BpmnJobKind.java   (Task 7)
  kind/query/QueryJobKind.java, DmlGuard.java   (Task 7)
  kind/purge/PurgeJobKind.java   (Task 7)
  kind/http/HttpJobKind.java, JobHttpClient.java(기존 HttpCollectSource 보안 규칙 추출)   (Task 7·8)
  kind/collect/**               (Task 8 — widget/collect 에서 원천 옮김)
  builtin/CollectPurgeJob.java, JobRunPurgeJob.java, JobRunSweepJob.java   (Task 9)
  admin/JobSchedMngService.java + dto/**   (Task 11)
src/backend/mcm/api/src/main/resources/services/csa/jobSchedMng.bpmn   (Task 11)
docs/mcm/sql/jobSchedMng-menu.sql   (Task 11)
src/frontend/shared/src/components/cron-input/**, variable-table/**   (Task 12)
src/frontend/m-mcm/page-components/csa/jobSchedMng/**   (Task 13)
삭제: mcm-core widget/collect/**(원천 제외), m-mcm widget-types/collect/**   (Task 8·14)
```

---

### Task 1: V3 마이그레이션 + JOB 전용 연결 + 설정

**Files:**
- Create: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V3__job_scheduler.sql`
- Create: `.../mcm/job/JobProperties.java`, `JobDataSource.java`, `JobModule.java`, `JobConfig.java`
- Modify: `.../mcm/config/McmCoreAutoConfiguration.java` (JobConfig import)
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/job/JobDataSourceTest.java`, `.../oracheck/JobSchemaOraTest.java`

**Interfaces:**
- Produces: `JobDataSource#jdbc(): JdbcTemplate`, `#tx(): TransactionTemplate`, `#isDedicated(): boolean`; `JobModule.of(String): JobModule`(대소문자 무시, 없으면 IllegalArgumentException), `JobModule.resolve(JobProperties, Environment): JobModule`; `JobProperties` getter 들.

- [ ] **Step 1: V3 작성**

```sql
-- ============================================================
-- V3: 예약 작업(JOB) 스케줄러 — docs/superpowers/specs/2026-10-08-job-scheduler-design.md §3
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 각 모듈 앱이 JOB 전용 연결로 MCMAPUSER. 접두를 붙여 읽고 쓴다.
-- ============================================================

create table TB_MCM_JOB_DEF (
    JOB_ID varchar2(60 char) not null,
    MODULE_CD varchar2(10 char) not null,
    JOB_NM varchar2(100 char) not null,
    JOB_KIND varchar2(10 char) not null,
    CRON_EXPR varchar2(100 char) not null,
    USE_YN char(1 char) default 'Y' not null,
    CONFIG_JSON clob,
    VARS_JSON clob,
    TIMEOUT_SEC number(6,0) not null,
    NEXT_RUN_AT timestamp(6),
    JOB_DESC varchar2(500 char),
    OWNER_TP varchar2(10 char) not null,
    CODE_SEEN_AT timestamp(6),
    OPTS_JSON clob,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_DEF primary key (JOB_ID),
    constraint CK_TB_MCM_JOB_DEF_USE check (USE_YN in ('Y','N')),
    constraint CK_TB_MCM_JOB_DEF_MOD check (MODULE_CD in ('MCM','MDM','MPP','MLS','MQC','MPN')),
    constraint CK_TB_MCM_JOB_DEF_KIND check (JOB_KIND in ('CODE','BPMN','QUERY','COLLECT','HTTP','PURGE')),
    constraint CK_TB_MCM_JOB_DEF_OWN check (OWNER_TP in ('CODE','USER'))
);
create index IX_TB_MCM_JOB_DEF_MOD on TB_MCM_JOB_DEF (MODULE_CD, USE_YN);

create table TB_MCM_JOB_RUN (
    JOB_ID varchar2(60 char) not null,
    SCHED_AT timestamp(0) not null,
    TRIGGER_TP char(1 char) not null,
    MODULE_CD varchar2(10 char) not null,
    SERVER_NM varchar2(100 char),
    STATUS varchar2(8 char) not null,
    STARTED_AT timestamp(6),
    ENDED_AT timestamp(6),
    TIMEOUT_SEC number(6,0),
    ITEM_CNT number(10,0),
    MSG varchar2(500 char),
    REQ_USR_ID varchar2(100 char),
    VARS_JSON clob,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_RUN primary key (JOB_ID, SCHED_AT, TRIGGER_TP),
    constraint CK_TB_MCM_JOB_RUN_TRG check (TRIGGER_TP in ('S','M')),
    constraint CK_TB_MCM_JOB_RUN_ST check (STATUS in ('REQ','RUN','OK','FAIL','SKIP','TIMEOUT'))
);
create index IX_TB_MCM_JOB_RUN_ST on TB_MCM_JOB_RUN (STATUS, STARTED_AT);
create index IX_TB_MCM_JOB_RUN_START on TB_MCM_JOB_RUN (STARTED_AT);
create index IX_TB_MCM_JOB_RUN_JOB on TB_MCM_JOB_RUN (JOB_ID, SCHED_AT desc);

create table TB_MCM_JOB_VER (
    MODULE_CD varchar2(10 char) not null,
    DEF_VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_VER primary key (MODULE_CD)
);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MCM', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MDM', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MPP', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MLS', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MQC', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MPN', 0);

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
```

`OPTS_JSON` 은 고급 설정(재시도 `{retry:{count,intervalMin}}`, 이어 실행 `{next:[jobId…]}`)이다(설계 D12). 실행 기록의 `TIMEOUT_SEC`·`VARS_JSON` 은 그 회차에 적용한 값이다(정의가 나중에 바뀌어도 시간 초과 정리·이력이 정확하도록).

- [ ] **Step 2: Oracle 스키마 시험 작성** — `JobSchemaOraTest`(본보기 `oracheck/MenuTreeSqlOraTest`·`OraCheckJpaConfig`·`testdb/McmCoreOraTestDb`). 시험: ① 4표 존재 + `TB_MCM_JOB_VER` 6행 ② `TB_MCM_JOB_RUN` 에 같은 (JOB_ID, SCHED_AT, TRIGGER_TP) 두 번 INSERT → `DuplicateKeyException` ③ `SCHED_AT` 에 `TIMESTAMP '2026-10-08 02:00:00.7'` 넣으면 초 단위로 반올림·절삭되는지 기록(값 확인) ④ CHECK 위반(MODULE_CD='XXX') → `DataIntegrityViolationException`. 각 시험 앞뒤 `DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN/DEF/COLLECT_DATA` (VER 표는 지우지 말고 `UPDATE … SET DEF_VER=0`).

- [ ] **Step 3: 실행해 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchemaOraTest'`
Expected: V3 가 없으므로 표 없음(ORA-00942)으로 FAIL. (V 파일을 먼저 썼다면 그대로 PASS — 그때는 Step 1 순서를 지켰는지만 확인)

- [ ] **Step 4: `JobProperties`·`JobModule`·`JobDataSource`·`JobConfig` 구현**

```java
@ConfigurationProperties(prefix = "dmes.job")
public class JobProperties {
    private boolean enabled = true;
    private String module;              // 비면 spring.application.name 대문자
    private String serverName;          // 비면 host:app:pid
    private int poolSize = 4;
    private int maxClaimPerTick = 20;
    private int verPollSec = 10;
    private final Datasource datasource = new Datasource();
    private final Http http = new Http();
    private final Collect collect = new Collect();
    public static class Datasource { private String url, username, password, jndiName; private int maximumPoolSize = 2; /* getter/setter */ }
    public static class Http { private List<String> allowedHosts = new ArrayList<>(); /* getter/setter */ }
    public static class Collect { private boolean enabled = true; /* getter/setter */ }
    // getter/setter
}
```

`JobDataSource` 는 `WidgetQueryDataSource`(`widget/query/WidgetQueryDataSource.java`) 를 본보기로 한다: `final class`, `DisposableBean`, `static JobDataSource shared(DataSource)`, `static JobDataSource dedicated(HikariDataSource)`, `static JobDataSource jndi(DataSource)`. 생성 시 `new JdbcTemplate(ds)`, `new TransactionTemplate(new DataSourceTransactionManager(ds))` 를 만들어 둔다. **`DataSource` 형식의 `@Bean` 을 새로 만들지 않는다.** Hikari 설정: `maximumPoolSize` = 설정값(기본 2), `minimumIdle 0`, `idleTimeout 10000`, `poolName "job-ds"`.

`JobConfig`(`@Configuration(proxyBeanMethods=false)`, `@EnableConfigurationProperties({JobProperties.class})`):

```java
@Bean
JobDataSource jobDataSource(JobProperties props, ObjectProvider<DataSource> appDataSource) {
    JobProperties.Datasource d = props.getDatasource();
    if (StringUtils.hasText(d.getJndiName())) return JobDataSource.jndi(new JndiDataSourceLookup().getDataSource(d.getJndiName()));
    if (StringUtils.hasText(d.getUrl())) { HikariDataSource h = new HikariDataSource(); /* url·user·pw·pool */ return JobDataSource.dedicated(h); }
    return JobDataSource.shared(appDataSource.getObject());
}
```

`McmCoreAutoConfiguration` 의 `@Import` 목록에 `JobConfig.class` 를 더한다.

- [ ] **Step 5: 단위 시험 `JobDataSourceTest`** — ① url 이 있으면 `isDedicated()==true`, 풀 이름 `job-ds`, 최대 2 ② 없으면 주어진 앱 DataSource 그대로 ③ `ApplicationContextRunner` 에 앱 DataSource 하나 + `JobConfig` 를 올렸을 때 `context.getBeansOfType(DataSource.class).size()==1` (Review Focus 4). H2 를 쓰지 않는다 — `DriverManagerDataSource` 더미(url `jdbc:oracle:thin:@//localhost:1/none`, 연결하지 않음)로 충분하다.

- [ ] **Step 6: 시험 통과 확인**

Run: `../gradlew test --max-workers=2 --tests '*JobDataSourceTest'` (PASS) 그리고 `../gradlew test --max-workers=2 -Pdmes.ora.test=clone --tests '*JobSchemaOraTest'` (PASS)

- [ ] **Step 7: 커밋** — `feat(mcm-core): 예약 작업 표 4개(V3)와 모듈 앱용 JOB 전용 연결을 더한다`

---

### Task 2: crontab 식(`CronSpec`)

**Files:**
- Create: `.../mcm/job/def/CronSpec.java`
- Test: `.../mcm/job/def/CronSpecTest.java`

**Interfaces:**
- Produces:
  - `static CronSpec parse(String expr)` — 잘못되면 `IllegalArgumentException`(메시지 한국어, 어느 칸이 왜 틀렸는지: `"요일 칸(5번째) 값 8 은 0~7 범위를 벗어났습니다"`).
  - `static Optional<String> validate(String expr)` — 오류 문구 또는 empty.
  - `LocalDateTime next(LocalDateTime after)` — `after` 보다 엄격히 뒤인 첫 시각(초 0, Asia/Seoul 벽시계). 없으면 null.
  - `List<LocalDateTime> nextN(LocalDateTime after, int n)`
  - `Duration minGap(LocalDateTime from, Duration horizon)` — horizon(기본 366일) 안 연속 실행 간격의 최솟값(실행 2회 미만이면 `Duration.ofDays(366)`).
  - `String describe()` — 「매일 02:00」, 「10분마다」, 「평일 09:00」, 「매주 일요일 04:00」, 「매월 1일 00:30」, 「매시 정각」, 「월~토 8~20시 30분마다」 등. 못 줄이면 식 그대로 + 「(직접 입력)」.
  - `String expression()` — 정규화한 5칸(매크로는 펼친 값).

- [ ] **Step 1: 실패하는 시험** — 아래를 표 시험(`@ParameterizedTest @CsvSource`)으로:

```java
// 받는 식 → next(2026-10-08T21:23) 기대값
"'* * * * *',            2026-10-08T21:24"
"'*/10 * * * *',         2026-10-08T21:30"
"'0 2 * * *',            2026-10-09T02:00"
"'0 9 * * 1-5',          2026-10-09T09:00"   // 2026-10-08 은 목요일, 10-09 금
"'0 4 * * 0',            2026-10-11T04:00"   // 일요일
"'0 4 * * 7',            2026-10-11T04:00"   // 7 도 일요일
"'0 4 * * SUN',          2026-10-11T04:00"
"'30 0 1 * *',           2026-11-01T00:30"
"'0 9,15 * * MON-FRI',   2026-10-09T09:00"
"'*/30 8-20 * * 1-6',    2026-10-08T21:23 → 2026-10-09T08:00"
"'@daily',               2026-10-09T00:00"
"'@hourly',              2026-10-08T22:00"
"'0 0 31 * *',           2026-10-31T00:00"
```

거절(validate 가 문구를 돌려줌): `"0 9 1 * 1"`(일·요일 동시 제한 → 「일과 요일 중 하나는 * 로 두세요」), `"0 0 0 * * *"`(6칸), `"0 0 L * *"`, `"0 0 ? * *"`, `"0 0 1W * *"`, `"0 0 * * 1#2"`, `"60 * * * *"`, `"* 24 * * *"`, `"* * 0 * *"`, `"* * * 13 *"`, `""`, `"   "`, `null`.
minGap: `"*/5 * * * *"` → 5분, `"0 9,15 * * *"` → 6시간, `"0,5 * * * *"` → 5분, `"0 0 1 * *"` → 28일(2월 포함 horizon).
describe: 위 받는 식들 각각의 기대 문구.

- [ ] **Step 2: 실패 확인** — `../gradlew test --max-workers=2 --tests '*CronSpecTest'` → 컴파일 실패.

- [ ] **Step 3: 구현** — 검사(정규식으로 Spring 전용 문법 `[?LW#]` 거절, 칸 수 정확히 5, 매크로 표 `@yearly|@annually→0 0 1 1 *`, `@monthly→0 0 1 * *`, `@weekly→0 0 * * 0`, `@daily|@midnight→0 0 * * *`, `@hourly→0 * * * *`), 칸별 범위 검사(쉼표·범위·`/` 를 직접 풀어 숫자 범위 확인, 월·요일 영문 이름 허용), 일·요일 동시 제한 거절(둘 다 `*` 가 아니면). 계산은 `CronExpression.parse("0 " + expr)` 에 위임하고 `next` 는 `ZonedDateTime`(Asia/Seoul)로 감싸 부른다. 요일 `7` 은 Spring 이 받으므로 그대로 둔다.

- [ ] **Step 4: 통과 확인**

- [ ] **Step 5: 커밋** — `feat(mcm-core): 예약 작업 crontab 식 검사·다음 시각·설명 계산을 더한다`

---

### Task 3: 변수(`JobVar`·`JobVars`)

**Files:**
- Create: `.../mcm/job/def/JobVar.java`, `JobVars.java`
- Test: `.../mcm/job/def/JobVarsTest.java`

**Interfaces:**
- Produces:
  - `record JobVar(String name, Type type, String value, String desc)`, `enum Type { STRING, NUMBER, DATE, JSON }`.
  - `static List<JobVar> JobVars.parse(String json)` (null/빈 글자 → 빈 목록), `static String JobVars.toJson(List<JobVar>)`, `static List<String> JobVars.validate(List<JobVar>)`(오류 문구 목록: 이름 규칙 `^[A-Za-z][A-Za-z0-9_]{0,29}$`, 중복, 30개 상한, value 1000자 상한, 형식 불일치 고정값 — NUMBER 인데 숫자 아님, DATE 인데 `yyyy-MM-dd`·`yyyy-MM-dd HH:mm[:ss]` 아님, JSON 인데 파싱 불가).
  - `static Map<String,Object> JobVars.resolve(List<JobVar> vars, RunFacts facts)` — 실행 변수 확정.
  - `record RunFacts(LocalDateTime schedAt, LocalDateTime now, LocalDateTime prevRunAt, String jobId, String moduleCd)`.
  - 실행 변수 표: `:schedAt`→schedAt, `:now`→now, `:today`→schedAt.toLocalDate(), `:yesterday`→-1일, `:monthStart`→그 달 1일, `:prevMonthStart`→전달 1일, `:prevRunAt`→prevRunAt(없으면 null), `:jobId`, `:moduleCd`. 날짜는 `LocalDate`/`LocalDateTime` 로, NUMBER 고정값은 `BigDecimal`, JSON 은 Jackson `JsonNode`→`Map/List`, STRING 은 그대로. 알 수 없는 `:이름` 은 validate 에서 오류.

- [ ] **Step 1: 실패하는 시험** — ① `:yesterday` 를 schedAt 2026-10-01T01:00 으로 → 2026-09-30 ② `:monthStart`·`:prevMonthStart` 를 2026-01-15 로 → 2026-01-01·2025-12-01 ③ `:prevRunAt` null 허용 ④ NUMBER `"12.5"` → BigDecimal 12.5 ⑤ JSON `{"a":[1,2]}` → Map ⑥ validate: 이름 `1abc`·중복·`:unknown`·NUMBER `"abc"` 각 문구 ⑦ parse(toJson(x)) 왕복.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — Jackson `ObjectMapper` 는 정적 1개(앱 빈을 받지 않음).
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** — `feat(mcm-core): 예약 작업 변수 모델과 실행 변수 확정을 더한다`

---

### Task 4: 정의 저장소·모듈 키 캐시

**Files:**
- Create: `.../mcm/job/def/JobDef.java`, `JobDefStore.java`, `JobDefCache.java`
- Test: `.../mcm/job/def/JobDefCacheTest.java`(가짜 저장소), `.../oracheck/JobDefStoreOraTest.java`

**Interfaces:**
- Consumes: `JobDataSource`(Task 1), `CronSpec`(Task 2), `JobVar`(Task 3), `JobModule`.
- Produces:
  - `record JobDef(String jobId, JobModule module, String jobNm, String kind, String cronExpr, boolean use, String configJson, List<JobVar> vars, int timeoutSec, LocalDateTime nextRunAt, String desc, String ownerTp, LocalDateTime codeSeenAt, String optsJson, long ver)`.
  - `JobDefStore`: `List<JobDef> findByModule(JobModule)`, `Optional<JobDef> find(String jobId)`, `List<JobDef> findAll()`, `long version(JobModule)`, `void bumpVersion(JobModule)`(`UPDATE … SET DEF_VER = DEF_VER + 1`), `void insert(JobDef, String userId)`, `void update(JobDef, String userId, long expectVer)`(VER 낙관적 잠금, 0행이면 `OptimisticLockingFailureException`), `void setUse(String jobId, boolean, String userId)`, `void delete(String jobId)`(정의·RUN·COLLECT_DATA 한 트랜잭션), `boolean insertIfAbsent(JobDef)`(코드 작업 등록: `INSERT … SELECT … FROM DUAL WHERE NOT EXISTS`, 동시 PK 위반은 false), `void touchCodeSeen(Collection<String> jobIds, LocalDateTime at)`. 모든 쓰기 메서드는 호출자가 `JobDataSource.tx()` 로 묶는다(저장 + `bumpVersion` 을 한 트랜잭션에).
  - 저장 시 `NEXT_RUN_AT` = `CronSpec.parse(cron).next(지금)` (일정이 바뀌거나 사용으로 바뀔 때만 다시 계산).
  - `JobDefCache`: `ModuleDefs get(JobModule)`(없으면 적재), `void invalidate(JobModule)`, `boolean refreshIfChanged(JobModule)`(버전 한 칸 읽어 다르면 비우고 다시 적재, 바뀌었으면 true), `void updateNextRunAt(String jobId, LocalDateTime)`. `record ModuleDefs(long version, List<JobDef> defs)`. 내부 `ConcurrentHashMap<JobModule, ModuleDefs>`.

- [ ] **Step 1: 캐시 단위 시험(가짜 `JobDefStore` — 인터페이스로 뽑거나 Mockito)** — ① 처음 `get(MDM)` 은 저장소 1회 ② 두 번째 `get(MDM)` 은 저장소 0회 ③ `refreshIfChanged(MDM)` 버전 같으면 `version()` 1회만, `findByModule` 0회 ④ 버전 바뀌면 `findByModule` 1회·true ⑤ `get(MCM)` 과 `get(MDM)` 은 서로 다른 키(키에 모듈 포함)로 따로 적재 ⑥ `invalidate(MDM)` 뒤 `get(MDM)` 은 다시 적재.
- [ ] **Step 2: Oracle 시험 `JobDefStoreOraTest`** — insert→find, update 낙관 잠금 실패, insertIfAbsent 두 번(두 번째 false), delete 가 RUN·COLLECT_DATA 도 지움, bumpVersion 이 그 모듈만 +1, CLOB(CONFIG_JSON 4000자 초과) 왕복.
- [ ] **Step 3: 실패 확인 → 구현 → 통과 확인** (Oracle 시험은 `-Pdmes.ora.test=clone`)
- [ ] **Step 4: 커밋** — `feat(mcm-core): 예약 작업 정의 저장소와 모듈 키 캐시를 더한다`

---

### Task 5: 선점·실행 기록(`JobClaimer`·`JobRunStore`)

**Files:**
- Create: `.../mcm/job/run/JobClaimer.java`, `JobRunStore.java`, `ClaimedRun.java`
- Test: `.../oracheck/JobClaimOraTest.java`

**Interfaces:**
- Consumes: `JobDataSource`, `CronSpec`, `JobDef`.
- Produces:
  - `record ClaimedRun(String jobId, LocalDateTime schedAt, char triggerTp, int timeoutSec, Map<String,Object> varsOverride, String reqUserId)`.
  - `record ClaimResult(List<ClaimedRun> runs, Map<String, LocalDateTime> nextRunAt)` — nextRunAt 은 잡은(또는 SKIP 한) 작업의 새 예정 시각.
  - `JobClaimer#claim(Collection<String> jobIds, String serverNm): ClaimResult`
  - `JobClaimer#claimRequests(JobModule module, String serverNm, int limit): List<ClaimedRun>` — `STATUS='REQ'` 를 `FOR UPDATE SKIP LOCKED` 로 잡아 RUN 으로.
  - `JobRunStore#finish(ClaimedRun, String status, int itemCnt, String msg, LocalDateTime endedAt): boolean` — `WHERE … AND STATUS='RUN'`, 0행이면 false.
  - `JobRunStore#markTimeout(ClaimedRun, String msg): boolean` (`STATUS='RUN'` 일 때만).
  - `JobRunStore#sweep(LocalDateTime now): int` — ① `RUN` 이고 `STARTED_AT + (TIMEOUT_SEC+60)초 < now` → TIMEOUT「서버 응답 없음」 ② `REQ` 이고 `C_AT + 5분 < now` → SKIP「실행할 서버 없음」.
  - `JobRunStore#requestManual(String jobId, JobModule module, String userId, Map<String,Object> vars): boolean` — 이미 RUN(시간 초과 전)이 있으면 false, 아니면 REQ INSERT.
  - `JobRunStore#history(String jobId, int limit)`, `#lastRuns(Collection<String> jobIds)`(작업별 최근 1건), `#prevOkSchedAt(String jobId)`.
  - `JobRunStore#purgeBefore(LocalDateTime cutoff, int chunkRows): int`.

- [ ] **Step 1: 선점 SQL(그대로 쓴다)**

```sql
SELECT JOB_ID, CRON_EXPR, TIMEOUT_SEC, NEXT_RUN_AT, MODULE_CD, VARS_JSON,
       CAST(SYSTIMESTAMP AS TIMESTAMP) AS DB_NOW
  FROM MCMAPUSER.TB_MCM_JOB_DEF
 WHERE JOB_ID IN (:ids)
   AND USE_YN = 'Y'
   AND NEXT_RUN_AT <= CAST(SYSTIMESTAMP AS TIMESTAMP) + INTERVAL '30' SECOND
   FOR UPDATE SKIP LOCKED
```

`NamedParameterJdbcTemplate` 로 `:ids` 를 펼친다(최대 20개라 IN 목록 1000 제한과 무관). `FETCH FIRST`/`ROWNUM` 금지. 트랜잭션은 `JobDataSource.tx()`.

잡은 행마다(같은 트랜잭션):

```java
LocalDateTime sched = rs.nextRunAt().truncatedTo(SECONDS);
if (Duration.between(sched, dbNow).compareTo(LATE_LIMIT /*2분*/) > 0) {
    insertRun(jobId, sched, 'S', "SKIP", "놓친 회차를 건너뜀", serverNm, timeoutSec);
} else if (runStore.hasLiveRun(jobId, dbNow)) {     // STATUS='RUN' AND STARTED_AT + TIMEOUT_SEC초 > dbNow
    insertRun(jobId, sched, 'S', "SKIP", "이전 회차 실행 중", serverNm, timeoutSec);
} else if (insertRun(jobId, sched, 'S', "RUN", null, serverNm, timeoutSec)) {   // PK 위반이면 false
    claimed.add(new ClaimedRun(jobId, sched, 'S', timeoutSec, Map.of(), null));
}
LocalDateTime base = sched.isAfter(dbNow) ? sched : dbNow;
LocalDateTime next = CronSpec.parse(cron).next(base);   // base 보다 엄격히 뒤
update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET NEXT_RUN_AT = ? WHERE JOB_ID = ?", next, jobId);
```

`insertRun` 의 SKIP INSERT 가 PK 위반이면(같은 회차 SKIP 이 이미 있음) 무시한다. `STARTED_AT` 은 RUN·SKIP 모두 dbNow, SKIP 은 `ENDED_AT` 도 dbNow.

- [ ] **Step 2: Oracle 시험 `JobClaimOraTest`** (모두 실제 Oracle, 서로 다른 연결 2개는 `McmCoreOraTestDb` 로 Hikari 풀 2개를 만들어 `JobDataSource.dedicated` 두 개로):
  1. **경합**: 정의 1건 NEXT_RUN_AT=지금-5초. `CountDownLatch` 로 두 스레드가 동시에 `claim` → RUN 행 정확히 1개, 두 결과의 runs 합 1. 20회 반복.
  2. **잠금 중 건너뜀**: 연결 A 가 `SELECT … FOR UPDATE` 로 그 행을 쥔 채, B 의 `claim` 은 기다리지 않고(1초 안) 0건.
  3. **늦은 회차**: NEXT_RUN_AT=지금-3시간, cron `*/10 * * * *` → RUN 0, SKIP 1(「놓친 회차를 건너뜀」), 새 NEXT_RUN_AT > 지금, 그 사이 회차 행 없음.
  4. **겹침**: 같은 작업의 RUN 행(STARTED_AT=지금-10초, TIMEOUT 600) 이 있을 때 → SKIP「이전 회차 실행 중」.
  5. **finish 가 TIMEOUT 을 덮어쓰지 않음**: claim → markTimeout → finish(OK) 는 false, 행은 TIMEOUT.
  6. **sweep**: RUN(STARTED_AT=지금-2시간, TIMEOUT_SEC=60) → TIMEOUT; REQ(C_AT=지금-10분) → SKIP; 최근 RUN 은 그대로.
  7. **REQ 경합**: requestManual 1건 뒤 두 연결이 동시에 `claimRequests(MDM)` → 1개만 RUN. 다른 모듈(MPP) 의 claimRequests 는 0.
  8. **사용 중지**: USE_YN='N' 이면 0건.
- [ ] **Step 3: 실패 확인 → 구현 → 통과 확인**
- [ ] **Step 4: 커밋** — `feat(mcm-core): 예약 작업 회차 선점(FOR UPDATE SKIP LOCKED)과 실행 기록을 더한다`

---

### Task 6: 유형 SPI·틱·실행 풀·엔진

**Files:**
- Create: `.../mcm/job/kind/JobKind.java`, `JobContext.java`, `JobKindRegistry.java`, `JobFailure.java`
- Create: `.../mcm/job/run/JobTicker.java`, `JobExecutor.java`, `JobEngine.java`
- Modify: `.../mcm/job/JobConfig.java`(빈 조립)
- Test: `.../mcm/job/run/JobTickerTest.java`, `JobExecutorTest.java`, `JobEngineTest.java`

**Interfaces:**
- Consumes: Task 1~5 전부.
- Produces:

```java
public interface JobKind {
    String id();                                     // "BPMN" 등
    List<String> validate(JobDef def);               // 저장 검사(빈 목록이면 통과). 실행 때도 다시 부른다
    default boolean canRunIn(JobModule appModule, JobDef def) { return true; }  // CODE 는 빈 존재 여부
    JobOutcome run(JobContext ctx) throws Exception; // 실패는 JobFailure(사용자용 메시지) 또는 다른 예외(종류만 기록)
}
public record JobOutcome(int itemCnt, String msg) {}
public final class JobFailure extends RuntimeException { public JobFailure(String userMessage) {...} }
public record JobContext(JobDef def, LocalDateTime schedAt, boolean manual, Map<String,Object> vars, String reqUserId, String serverNm) {}
```

  - `JobTicker#tick(LocalDateTime now): int` — 캐시 판정(Task 4 `get(appModule)`), 후보 = use && kind 실행 가능 && `nextRunAt != null && !nextRunAt.isAfter(now.plusSeconds(30))` && 실행 중 아님 && (COLLECT 이면 `collect.enabled`). 빈 자리 `executor.freeSlots()` 와 `maxClaimPerTick` 중 작은 수만큼. 후보 0 이면 **DB 호출 0회**. claim 결과의 nextRunAt 을 캐시에 반영, 0건으로 끝난 후보는 `CronSpec.next(now)` 로 캐시만 앞으로 민다.
  - `JobExecutor#submit(ClaimedRun, JobDef): boolean`, `#freeSlots(): int`, `#isRunning(String jobId): boolean`, `#shutdown()`. 실행: `ScheduledJobLogContext.run("sch.job." + jobId, () -> …)`. 변수 확정 `JobVars.resolve(def.vars(), facts)` + `varsOverride` 덮어쓰기. 결과 → `finish(OK/FAIL)`. 시간 초과: 감시용 `ScheduledExecutorService`(데몬 1) 에서 `timeoutSec` 뒤 `future.cancel(true)` + `markTimeout`. `finish` 가 false 면 warn「이미 시간 초과로 정리된 회차가 늦게 끝났습니다 jobId={}」.
  - FAIL 메시지 규칙: `JobFailure` → 그 메시지(500자 자름), 그 밖 → `"실행 중 오류가 발생했습니다: " + e.getClass().getSimpleName()`.
  - 고급 설정(OPTS_JSON): 재시도 — FAIL 이면 `retry.count` 회까지 `retry.intervalMin` 분 뒤 같은 회차를 `TRIGGER_TP='M'`·REQ 로 넣지 말고, 같은 서버에서 지연 재실행하고 각 시도는 같은 RUN 행의 MSG 에 「재시도 n/N」 덧붙임(행은 하나). 이어 실행 — OK 면 `opts.next` 의 작업마다 `requestManual(nextJobId, 그 작업 모듈, "SCHEDULER", Map.of())`.
  - `JobEngine implements SmartLifecycle`: `start()` 에서 `enabled` 가 false 면 아무것도 안 함. 전용 `ThreadPoolTaskScheduler`(풀 1, 이름 `job-tick-`, 데몬) — `CronTrigger("0 * * * * *", Asia/Seoul)` 로 `ScheduledJobLogContext.runQuiet("sch.jobTicker.tick", ticker::tickNow)`; 그리고 `verPollSec` 고정 지연으로 `cache.refreshIfChanged(appModule)` → true 면 `claimRequests` 처리(REQ 는 버전이 올라갈 때만 생기므로). 버전 확인은 로그 태그 없이 돌고 실패는 첫 번째만 WARN, 복구 때 INFO 1줄. 기동 시 캐시 적재 + CODE 작업 등록(Task 7 의 registrar 호출) + `touchCodeSeen`. `stop()` 은 스케줄러·실행 풀 종료(실행 중 작업은 30초 기다린 뒤 인터럽트).
  - 서버 이름: `props.serverName` 또는 `InetAddress.getLocalHost().getHostName() + ":" + appName + ":" + ProcessHandle.current().pid()`, 100자 자름.
- [ ] **Step 1: `JobTickerTest`** — 가짜 캐시·가짜 claimer(호출 횟수 기록)·고정 시계: ① 후보 없음 → claimer 0회(Review Focus 5) ② 사용 중지·다른 모듈·미래 일정은 후보 아님 ③ 실행 중인 jobId 제외 ④ freeSlots=2 면 앞 2개만 ⑤ claim 결과 nextRunAt 이 캐시에 반영 ⑥ `collect.enabled=false` 면 COLLECT 제외.
- [ ] **Step 2: `JobExecutorTest`** — 가짜 JobKind: ① OK → finish(OK, itemCnt) ② JobFailure("값 없음") → FAIL 메시지 그대로 ③ RuntimeException("jdbc:oracle://secret") → 메시지에 "secret" 이 없음 ④ timeoutSec=1, 3초 걸리는 작업 → markTimeout 호출, 늦은 finish 는 false 처리·warn ⑤ 같은 jobId 두 번 submit → 두 번째 false ⑥ MDC `serviceId` 가 `sch.job.<id>` 인지(작업 안에서 `MDC.get` 기록).
- [ ] **Step 3: `JobEngineTest`** — `enabled=false` 면 스케줄러를 만들지 않음; 버전 확인이 true 를 돌려주면 claimRequests 호출.
- [ ] **Step 4: 실패 확인 → 구현 → 통과 확인**
- [ ] **Step 5: 커밋** — `feat(mcm-core): 예약 작업 틱·실행 풀·시간 초과·엔진 수명 주기를 더한다`

---

### Task 7: 실행 유형 CODE·BPMN·QUERY·PURGE·HTTP

**Files:**
- Create: `.../mcm/job/kind/code/ScheduledJob.java`, `CodeJobKind.java`, `CodeJobRegistrar.java`
- Create: `.../mcm/job/kind/bpmn/BpmnJobKind.java`
- Create: `.../mcm/job/kind/query/QueryJobKind.java`, `DmlGuard.java`
- Create: `.../mcm/job/kind/purge/PurgeJobKind.java`
- Create: `.../mcm/job/kind/http/HttpJobKind.java`, `JobHttpClient.java`
- Test: 각 유형 `*Test.java`, `.../oracheck/QueryPurgeJobOraTest.java`

**Interfaces:**
- Consumes: `JobKind`·`JobContext`·`JobOutcome`·`JobFailure`(Task 6), `JobDefStore#insertIfAbsent`(Task 4).
- Produces:

```java
public interface ScheduledJob {
    String id();                    // "mcm.screenUsageRollup"
    JobModule module();             // JobModule.MCM
    String name();
    String defaultCron();
    default List<JobVar> defaultVars() { return List.of(); }
    default Duration defaultTimeout() { return Duration.ofMinutes(30); }
    default String description() { return null; }
    int run(JobContext ctx) throws Exception;
}
```

  - `CodeJobRegistrar#register(JobModule appModule)`: 이 앱의 `ScheduledJob` 빈 중 `module()==appModule` 인 것만 `insertIfAbsent`(OWNER_TP=CODE, JOB_KIND=CODE, NEXT_RUN_AT=CronSpec.next(now)) 뒤 `touchCodeSeen`. id 정규식·cron 검사 실패는 기동 실패가 아니라 ERROR 로그 + 건너뜀. 하나라도 등록되면 `bumpVersion(appModule)`.
  - `CodeJobKind`: `canRunIn` = 그 id 의 빈이 이 앱에 있음. `run` → `bean.run(ctx)` 를 `JobOutcome(n, null)`.
  - `BpmnJobKind`: CONFIG_JSON `{"serviceId":"…","action":"…"}`. validate: 둘 다 필수, `^[A-Za-z][A-Za-z0-9_]{0,99}$`. run: `CactusRequest req = new CactusRequest(new RequestMeta(userId, jobId, …), vars, Map.of())`(RequestMeta 생성 방식은 `cactus-core/.../oasis/CactusRequest`·`RequestMeta` 를 읽고 맞춘다), `userId` = 수동이면 reqUserId, 아니면 `"SCHEDULER"`. `OasisServiceExecutor` 는 `ObjectProvider` 로 받아 없으면 JobFailure「이 앱에서 BPMN 서비스를 실행할 수 없습니다」. 응답 `meta` 가 오류면 JobFailure(응답 코드 + 응답 메시지 200자). itemCnt: 응답 데이터에 `processedCount`/`count` 숫자가 있으면 그 값, 아니면 0.
  - `DmlGuard#check(String sql): Optional<String>` — 주석·문자열 리터럴을 지운 뒤 판정: 세미콜론으로 나뉜 문장이 둘 이상이면 거절(단 `BEGIN … END;` 블록 하나는 허용), 첫 단어 `INSERT|UPDATE|DELETE|MERGE|BEGIN` 만 허용, 금지어 단어 경계로 `CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|ROLLBACK|SAVEPOINT|EXECUTE\s+IMMEDIATE|DBMS_SQL` 거절, `BEGIN` 블록 안은 `프로시저(인자);` 호출 한 개만 허용(`^BEGIN\s+[\w.$#]+\s*(\(.*\))?\s*;\s*END;?$`, 대소문자 무시, DOTALL).
  - `QueryJobKind`: CONFIG_JSON `{"sql":"…"}`. 앱 기본 DataSource 의 `NamedParameterJdbcTemplate` + 그 앱 트랜잭션 관리자(`ObjectProvider<PlatformTransactionManager>`, 없으면 `DataSourceTransactionManager`)로 한 트랜잭션. 바인드 변수 = 변수 맵(SQL 의 `:이름` 이 변수에 없으면 validate 오류). DML 은 `update` 결과 행 수, `BEGIN` 은 0. 쿼리 시간 제한 = 작업 timeoutSec(`setQueryTimeout`).
  - `PurgeJobKind`: CONFIG_JSON `{"table":"TB_X","dateColumn":"C_AT","keepDays":90,"chunkRows":5000}`. validate: table·column `^[A-Z][A-Z0-9_$#]{0,127}$`, keepDays 1~3650, chunkRows 100~50000, 그리고 실행 앱 기본 연결의 `USER_TAB_COLUMNS` 에 그 표·칸이 있고 칸 DATA_TYPE 이 `DATE` 또는 `TIMESTAMP%` 인지(저장 시점 검사는 mcm 서버가 다른 모듈 스키마를 볼 수 없으므로 **실행 때** 검사, 저장 때는 형식만). 실행: `DELETE FROM "TB_X" WHERE "C_AT" < ? AND ROWNUM <= ?` 를 0 이 될 때까지(최대 2000회), 덩어리마다 커밋. 기준 = `schedAt.toLocalDate().minusDays(keepDays).atStartOfDay()`. itemCnt=지운 합.
  - `JobHttpClient`: 기존 `widget/collect/HttpCollectSource` 의 보안 규칙(허용 호스트 정확 일치, 리다이렉트 안 따름, 사용자 정보 금지, 링크 로컬·멀티캐스트·와일드카드·메타데이터·IPv6 매립 IPv4 거절, 이름 풀이 3초, 연결 3초, 프록시 안 씀, 응답 1MB) 를 그대로 옮긴 공용 클라이언트. `get(URI, Duration readTimeout)`, `post(URI, String jsonBody, Duration readTimeout)` → `HttpResult(int status, byte[] body)`. 허용 호스트는 `JobProperties.http.allowedHosts` + 옛 키 `dmes.widget.collect.allowed-hosts`(있으면 기동 시 WARN「dmes.job.http.allowed-hosts 로 옮기세요」).
  - `HttpJobKind`: CONFIG_JSON `{"method":"GET|POST","url":"…","body":"{…}"}`. URL·본문의 `{{이름}}` 을 변수 값으로 바꾼다(URL 은 `URLEncoder` 로 인코딩, 본문은 JSON 문자열 이스케이프). 성공 = 2xx. itemCnt = 상태 코드. 실패 메시지에 URL 을 넣지 않는다(「HTTP 503 응답」).
- [ ] **Step 1: 단위 시험** — `DmlGuardTest`(허용: `UPDATE T SET A=1 WHERE B=:b`, `MERGE INTO …`, `BEGIN PKG.P(:schedAt); END;`, 주석 속 `DROP` 은 통과; 거절: `SELECT 1 FROM DUAL`, `UPDATE A SET X=1; DELETE B`, `DROP TABLE X`, `BEGIN EXECUTE IMMEDIATE 'x'; END;`, `BEGIN P1; P2; END;`, `COMMIT`, `TRUNCATE TABLE X`), `CodeJobRegistrarTest`(다른 모듈 빈은 등록 안 함, 잘못된 cron 은 건너뜀, 등록 시 bumpVersion 1회), `BpmnJobKindTest`(가짜 executor: 변수→params, 예약 실행 userId SCHEDULER, 오류 응답→JobFailure), `HttpJobKindTest`(허용 안 된 호스트 거절 메시지에 호스트 없음, `{{baseDt}}` 치환, 500 응답→FAIL「HTTP 500 응답」 — 로컬 `com.sun.net.httpserver.HttpServer` 를 127.0.0.1 에 띄우되 시험에서만 루프백 허용 플래그를 켠다: 기존 HttpCollectSource 시험이 쓰는 방식을 그대로 따른다).
- [ ] **Step 2: Oracle 시험 `QueryPurgeJobOraTest`** — QUERY: 시험 표(`MCMAPUSER.TB_MCM_JOB_COLLECT_DATA` 를 대상으로 써도 됨)에 UPDATE `:v` 바인드 → 행 수; PURGE: 1만 행 넣고 keepDays=1, chunkRows=3000 → 4회 덩어리, 합 1만; 없는 칸 → JobFailure.
- [ ] **Step 3: 실패 확인 → 구현 → 통과 확인**
- [ ] **Step 4: 커밋** — `feat(mcm-core): 예약 작업 실행 유형 CODE·BPMN·QUERY·PURGE·HTTP 를 더한다`

---

### Task 8: COLLECT 유형 + 위젯 collect 백엔드 삭제

**Files:**
- Move(→ `.../mcm/job/kind/collect/`): `SqlCollectSource`, `HttpCollectSource`(→ `JobHttpClient` 사용으로 정리), `ExchangeCollectSource`, `CollectItem`, `CollectException`, `CollectSource`, `CollectConfigs`(원천 파싱만 남김), `CollectConfig`(Source 계열만 남김; `Schedule`·`showDays`·`showUnit`·`TYPE_ID` 삭제)
- Create: `.../mcm/job/kind/collect/CollectJobKind.java`, `JobCollectWriter.java`
- Delete: `widget/collect/WidgetCollector.java`, `WidgetCollectWriter.java`, `WidgetCollectReader.java`, `WidgetCollectConfig.java`, `WidgetCollectProperties.java`, `entity/**`, `repository/**`, 이들 시험
- Modify: `widget/data/WidgetDataService.java`(collect 분기 제거), `widget/admin/service/WidgetDefConfigRules.java`(collect 검사 제거 — `TYPE_ID=collect` 저장 시 「지원하지 않는 위젯 유형입니다」), `widget/admin/service/CommWidgetMngService.java`(collect 참조 제거), `widget/query/WidgetQueryRunner`(수집용 실행 메서드는 남겨 COLLECT 가 씀)
- Test: 옮긴 원천 시험(패키지만 바꿈), `CollectJobKindTest.java`, `.../oracheck/CollectJobOraTest.java`

**Interfaces:**
- Consumes: `JobHttpClient`(Task 7), `JobDataSource`, `JobKind`.
- Produces: `CollectJobKind`(id `COLLECT`): CONFIG_JSON `{"source":{…기존 source 모양 그대로…}}`. validate: 기존 `CollectConfigs` 원천 검사 + 간격 하한(`CronSpec.minGap` ≥ 5분, exchange 는 ≥ 60분). run: 원천으로 `List<CollectItem>` → 비면 JobFailure(「수집된 값이 없습니다.」) → `JobCollectWriter.write(jobId, slot(yyyyMMddHHmm of schedAt), items)`(PK 위반 무시, 50개 상한) → itemCnt. `JobCollectWriter#purgeBefore(String cutoffSlot, int chunkRows): int`.
- [ ] **Step 1: 옮기기 전 기준 시험 실행** — `../gradlew test --max-workers=2 --tests '*Collect*'` 결과(통과 수)를 기록.
- [ ] **Step 2: `git mv` 로 원천·시험 옮기기, 패키지 선언 고치기, 삭제 대상 지우기**(삭제는 사용자 승인 범위: 위젯 collect 유형). `TB_MCM_WIDGET_COLLECT_*` 표는 그대로.
- [ ] **Step 3: `CollectJobKindTest`** — 가짜 원천: 값 3개 → itemCnt 3; 빈 값 → FAIL「수집된 값이 없습니다.」; 간격 4분 → validate 오류; exchange + `*/30` → 오류.
- [ ] **Step 4: `CollectJobOraTest`** — write 두 번(같은 slot) → 두 번째 PK 위반 무시; purgeBefore 덩어리 삭제.
- [ ] **Step 5: mcm-core 전체 컴파일·관련 시험 통과** — `../gradlew compileJava compileTestJava --max-workers=2` 그리고 `../gradlew test --max-workers=2 --tests '*Collect*' --tests '*WidgetData*' --tests '*WidgetDefConfigRules*'`.
- [ ] **Step 6: 커밋** — `refactor(mcm-core): 위젯 자동 수집 유형을 지우고 수집 원천을 예약 작업 COLLECT 유형으로 옮긴다`

---

### Task 9: 기존 `@Scheduled` 이관 + 기본 코드 작업

**Files:**
- Modify: `.../screenusage/service/ScreenUsageRollup.java`(`@Scheduled` 제거, `implements ScheduledJob`: id `mcm.screenUsageRollup`, cron `0 2 * * *`, 30분, `run` → `rollup()` 의 일자 수)
- Modify: `.../audit/service/RevokedTokenPurger.java`(`@Scheduled` 제거, `implements ScheduledJob`: `mcm.revokedTokenPurge`, `0 * * * *`, 10분, `run` → 지운 수)
- Create: `.../mcm/job/builtin/CollectPurgeJob.java`(`mcm.collectPurge`, `30 3 * * *`, 90일, `JobCollectWriter.purgeBefore`, `collect.enabled=false` 면 0), `JobRunPurgeJob.java`(`mcm.jobRunPurge`, `40 3 * * *`, 90일), `JobRunSweepJob.java`(`mcm.jobRunSweep`, `*/5 * * * *`, 5분)
- Modify: `.../config/McmCoreAutoConfiguration.java` — 남은 `@Scheduled` 가 mcm-core 에 없으면 `@EnableScheduling` 을 남길지 확인(cactus-core `ScheduledJobLogAutoConfiguration` 이 쓰므로 **지우지 않는다**).
- Test: `ScreenUsageRollupTest`·RevokedTokenPurger 시험 유지 + `BuiltinJobsTest`(id·모듈·cron 이 CronSpec 검사 통과).

- [ ] **Step 1: `BuiltinJobsTest` 작성 → 실패 확인**
- [ ] **Step 2: 구현 → `grep -rn "@Scheduled" src/backend/mcm-core/src/main` 결과 0 확인**
- [ ] **Step 3: 시험 통과 확인** — `../gradlew test --max-workers=2 --tests '*ScreenUsageRollup*' --tests '*RevokedToken*' --tests '*BuiltinJobs*'`
- [ ] **Step 4: 커밋** — `refactor(mcm-core): 화면 사용 집계·폐기 토큰 정리를 예약 작업 코드 작업으로 옮긴다`

---

### Task 10: 모듈 앱 설정 + 다른 모듈 기동 확인

**Files:**
- Modify: `src/backend/{mdm,mpp,mls,mqc,mpn}/api/src/main/resources/application-local.yml` — 각 파일 끝에:

```yaml
# ── 예약 작업(JOB) 전용 연결 — MCMAPUSER 의 JOB 표(docs/superpowers/specs/2026-10-08-job-scheduler-design.md §4.6a) ──
dmes:
  job:
    datasource:
      url: ${DMES_JOB_DS_URL:jdbc:oracle:thin:@//localhost:1521/L_MAIN}
      username: ${DMES_JOB_DS_USER:MCMAPUSER}
      password: ${DMES_JOB_DS_PASSWORD:dmes_password_123}
```

  이미 `dmes:` 최상위 키가 있으면 그 아래 `job:` 으로 합친다(키 중복 금지 — 파일을 먼저 읽는다). 모듈 키는 `spring.application.name` 으로 정해지므로 각 파일의 `spring.application.name` 을 확인하고, 값이 모듈 이름과 다르면 `dmes.job.module: MDM` 처럼 명시한다.
- Modify: 같은 모듈들의 운영 프로필 yml(`application-wildfly.yml` 등 존재하는 것만) — 값 없이 자리만:

```yaml
dmes:
  job:
    datasource:
      jndi-name: ${DMES_JOB_DS_JNDI:}
```

- Modify: `src/backend/mcm/api/src/main/resources/application.yml` — `dmes.job` 자리 주석만(연결 설정 없음, mcm 은 기본 연결).
- Test: `src/backend/mdm/api/src/test/java/.../JobEngineWiringOraTest.java`(mdm 앱 컨텍스트를 `-Pdmes.ora.test=clone` PDB 로 띄워: `JobDataSource#isDedicated()` true, DataSource 형식 빈 1개, `EntityManagerFactory` 존재, `JobDefCache.get(MDM)` 빈 목록 정상) — mdm 시험 하니스가 PDB 에 MCMAPUSER 스키마(V3)를 갖고 있는지 먼저 확인(TPL_SCHEMA 는 dev 의 모든 모듈 V 파일을 적용한 템플릿이지만 V3 는 이 브랜치에만 있다 → 시험에서 `McmCoreOraTestDb` 같은 방식으로 V3 를 적용하거나, 레인 PDB `L_JOBSCHED` 를 `pdb.mjs clone TPL_SCHEMA` 로 만들고 V3 를 sqlplus 로 적용한 뒤 `-Pdmes.ora.pdb=L_JOBSCHED` 로 돌린다. 시험 env 로 `DMES_JOB_DS_URL` 을 같은 PDB 로 준다).
- [ ] **Step 1: yml 수정(각 파일 먼저 읽기)**
- [ ] **Step 2: mdm 기동 시험 작성·실행** — 실패하면 원인(풀 이름 충돌·프로필)을 고친다.
- [ ] **Step 3: 커밋** — `chore(config): 모듈 앱 로컬 설정에 예약 작업 전용 연결 자리를 더한다`

---

### Task 11: 관리 서비스 `jobSchedMng` + 메뉴 SQL

**Files:**
- Create: `.../mcm/job/admin/JobSchedMngService.java`(빈 이름 `jobSchedMngService`), `admin/dto/*.java`
- Create: `src/backend/mcm/api/src/main/resources/services/csa/jobSchedMng.bpmn`(본보기 `services/csa/screenUsageStat.bpmn` — action 분기 구조 그대로)
- Modify: RBAC 버튼 action 목록(`src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` 의 `allActions` — 없는 action 만 추가: `list,get,save,setUse,runNow,history,cronPreview,delete` 중 기존에 없는 것)
- Create: `docs/mcm/sql/jobSchedMng-menu.sql`
- Test: `.../mcm/job/admin/JobSchedMngServiceTest.java`, `.../oracheck/JobSchedMngOraTest.java`, mcm OASIS 시험(본보기 `MenuCatalogOasisSaveIntegrationTest` 처럼 BPMN 경로 하나 호출)

**Interfaces:**
- Consumes: `JobDefStore`·`JobDefCache`·`JobRunStore`·`JobKindRegistry`·`CronSpec`·`JobVars`.
- Produces(action → 메서드, 응답 필드):
  - `list(filter{moduleCd,kind,useYn,lastStatus,keyword})` → 행: `jobId,moduleCd,jobNm,kind,cronExpr,cronDesc,useYn,nextRunAt,lastStatus,lastServerNm,lastEndedAt,ownerTp,codeMissing`(CODE 이고 `CODE_SEEN_AT` 이 없거나 7일 지남)
  - `get(jobId)` → 정의 전체 + `vars` + `config`(JSON 객체) + `opts`
  - `save(form, isNew)` → 검사(공통: id 정규식·이름 1~100·모듈·cron·timeout 10~86400·vars; 유형별 `JobKind.validate`; CODE 는 일정·사용·timeout·변수 **값**만 바뀌었는지 — 이름·형식·유형 변경 거절) → `tx` 안에서 insert/update + `bumpVersion(module)` → 저장한 서버의 `cache.invalidate(module)` → 다시 읽은 행
  - `setUse(jobId, useYn)` → 같은 방식(사용으로 바꾸면 NEXT_RUN_AT 다시 계산)
  - `runNow(jobId, vars?)` → `requestManual` + `bumpVersion(module)`; 이미 실행 중이면 「이미 실행 중인 작업입니다」
  - `history(jobId, limit≤100)`
  - `cronPreview(expr, kind)` → `{valid, error?, desc, next:[5개 ISO], minGapMin}`
  - `delete(jobId)` → OWNER_TP=CODE 면 「코드 작업은 삭제할 수 없습니다」; 아니면 정의·이력·수집 값 삭제 + bumpVersion
  - 모든 오류는 `BusinessException(ErrorCode.BUSINESS_ERROR, 한국어 문구)`.
- `docs/mcm/sql/jobSchedMng-menu.sql`(Oracle, 멱등 MERGE 4개: `TB_MCM_SEC_OBJ`(OBJECT_ID `jobSchedMng`, OBJECT_NM 「예약 작업 관리」, SYSTEM_CODE `mcm`, OBJECT_TYPE `web`, FORM_URL `csa/jobSchedMng`, ACCESS_TP 「내부」, USE_TP `Y`), `TB_MCM_SEC_MENU`(MENU_ID `jobSchedMng`, PARENT `csa`, MENU_SEQ `00000001`, FULL_SEQ `1020220`, MENU_TP `WEB`, VIEW `Y`, USE `Y`), `TB_MCM_SEC_ROLE_MAPPING`(SYSADMIN·PERM_ALL)) — 칸 목록은 `archive/oracle-1007/db-snapshot-sql/mcm/TB_MCM_SEC_MENU.sql` 의 INSERT 칸과 같게, 감사 칸 `C_AT=SYSTIMESTAMP, C_USR_ID='admin'`. 파일 머리에 「L_MAIN 적용은 조정자가 한다」.
- [ ] **Step 1: 서비스 단위 시험(가짜 저장소)** — 저장 시 bumpVersion·invalidate 각 1회, CODE 작업 이름 변경 거절, 삭제 거절, runNow 중복 거절, cronPreview 일·요일 동시 제한 오류.
- [ ] **Step 2: Oracle 시험** — save→list→setUse→runNow→history 왕복, 버전 +1 확인.
- [ ] **Step 3: BPMN·OASIS 시험** — mcm 쪽 시험 하니스로 `jobSchedMng/list` 호출 1건(본보기 `src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/menu/MenuCatalogOasisSaveIntegrationTest.java`). `oasis-contract-check` 스킬로 계약 검사.
- [ ] **Step 4: 실패 확인 → 구현 → 통과 확인**
- [ ] **Step 5: 커밋** — `feat(mcm): 예약 작업 관리 OASIS 서비스와 메뉴 등록 SQL 을 더한다`

---

### Task 12: shared 공통 컴포넌트 `CronInput`·`VariableTable`

**Files:**
- Create: `src/frontend/shared/src/components/cron-input/**`(시안 `m-design-dummy/src/screens/job-scheduler/CronInput.tsx`·`cron.ts` 를 옮겨 다듬기 — 쉬운 설정/직접 입력, 다섯 칸, 칩 프리셋), `src/frontend/shared/src/components/variable-table/**`(시안 `VariableTable.tsx`)
- Modify: shared 의 export 진입점(기존 컴포넌트가 export 되는 방식 그대로 — 예: `package.json` exports·`src/index.ts`. 먼저 다른 컴포넌트 하나가 어떻게 노출되는지 읽는다)
- Modify: `mantine-aggrid-ui` 스킬의 컴포넌트 문서·색인(Part B §18 절차: `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md#18-새-공통-컴포넌트-등록`)
- Test: shared 의 시험 러너(있는 것)로 `cron` 계산·`buildCron/toEasy` 왕복 시험

**Interfaces:**
- Produces: `CronInput` props `{ value: string; onChange(v: string): void; disabled?: boolean; minGapMin?: number; preview?: { desc: string; next: string[]; error?: string } | null; onRequestPreview?(expr: string): void }` — **실제 화면에서는 다음 예정·설명을 서버 `cronPreview` 결과(preview prop)로 보이고**, 브라우저 계산은 입력 중 즉시 오류 표시(칸 범위 검사)에만 쓴다. `VariableTable` props `{ value: JobVarRow[]; onChange(rows): void; mode: "full" | "valueOnly"; hint?: ReactNode }`, `JobVarRow = { name: string; type: "STRING"|"NUMBER"|"DATE"|"JSON"; value: string; desc?: string }`.
- [ ] **Step 1: 시험 작성(왕복·범위 오류) → 실패 확인**
- [ ] **Step 2: 구현 → shared 빌드**(`pnpm --filter @dk-oasis/shared build`; dev watch 로 exit 144 면 dist 확인) **→ 시험·audit 통과**
- [ ] **Step 3: 스킬 문서·색인 갱신**
- [ ] **Step 4: 커밋** — `feat(shared): crontab 입력 칸과 변수 표 공통 컴포넌트를 등록한다`

---

### Task 13: m-mcm 화면 `csa/jobSchedMng`

**Files:**
- Create: `src/frontend/m-mcm/page-components/csa/jobSchedMng/page.tsx`, `api.ts`, `types.ts`, `form-model.ts`, `KindEditors.tsx`, `KindPickerModal.tsx`, `JobBadges.tsx`, `form-model.test.ts`, `api.test.ts`
- 본보기: 시안 `m-design-dummy/src/screens/JobSchedulerScreen.tsx`·`screens/job-scheduler/**`(배치·흐름·문구), 운영 화면 `m-mcm/page-components/csa/commWidgetMng/**`(api·권한 `canDoButton`·`useMessage`·dirty 확인), `csa/screenUsageStat/api.ts`(OASIS envelope·`meta: { menuId }`)

**Interfaces:**
- Consumes: Task 11 action·필드, Task 12 컴포넌트.
- [ ] **Step 1: `form-model.test.ts`·`api.test.ts`(vitest)** — 서버 행↔폼 변환, 저장 파라미터(화면 전용 키 제거), 검사(필수 칸·유형별), CODE 작업 편집 제한, 결과 상태 → 배지 색 매핑.
- [ ] **Step 2: 구현** — 시안 동작 그대로 + 실제 API. `cronPreview` 는 입력 멈춘 뒤 400ms 디바운스로 부른다. SQL 칸은 `widget-types/_query/SqlEditor` 재사용([쿼리 시험] 버튼은 숨김 — 다른 모듈 DB 이므로).
- [ ] **Step 3: tsc·vitest·audit** — `pnpm --filter m-mcm exec tsc --noEmit`, `pnpm --filter m-mcm test -- jobSchedMng`, 스킬 audit 2개 0건.
- [ ] **Step 4: 커밋** — `feat(m-mcm): 예약 작업 관리 화면을 더한다`

---

### Task 14: 위젯 collect 프런트 삭제

**Files:**
- Delete: `src/frontend/m-mcm/widget-types/collect/**`
- Modify: `src/frontend/m-mcm/lib/generated/widget-type-registry.ts`(생성물이면 생성 스크립트로 다시 만든다 — `package.json` 스크립트 확인), `widget-types/_query/SqlEditor.tsx`·`sql-editor.test.ts`(collect 전용 분기 제거), `page-components/csa/commWidgetMng/form-model.ts`·`form-model.test.ts`(collect 분기 제거), `commWidgetMng/help/widget-guide-content.ts`(collect 설명 제거 → `widget-guide-sync.test.ts` 통과)
- Modify: `docs/widget-2026-10/spec-widget-data.md` 머리에 「2026-10-08 폐기: 자동 수집 유형은 예약 작업 COLLECT 로 대체(docs/superpowers/specs/2026-10-08-job-scheduler-design.md)」 한 줄, `docs/guide/FrontEnd/Widget-Authoring-Guide.md` 의 collect 언급 정리
- [ ] **Step 1: `grep -rn "collect" src/frontend/m-mcm --include=*.ts --include=*.tsx` 로 참조 목록 확보(node_modules 제외)**
- [ ] **Step 2: 삭제·수정 → tsc·vitest(commWidgetMng·_query)·audit 통과**
- [ ] **Step 3: 커밋** — `refactor(m-mcm): 위젯 자동 수집 유형을 지운다`

---

### Task 15: 마무리 — 문서·전체 시험

- [ ] **Step 1:** `docs/guide/` 백엔드 가이드에 「예약 작업은 `@Scheduled` 대신 `ScheduledJob` 빈으로 등록한다(모듈 키·기본 cron)」 한 절 추가(가이드 위치는 RULE.md 라우팅으로 찾는다).
- [ ] **Step 2:** `DataInitializerSeedFingerprintTest` 골든 다시 만들기(메인 세션이 머지 직전에).
- [ ] **Step 3:** 전체 시험 1회 — mcm-core `../gradlew test --max-workers=2 -Pdmes.ora.test=clone`, mcm `cd src/backend/mcm && ../gradlew test --max-workers=2 -Pdmes.ora.test=clone`, m-mcm·shared tsc·vitest, audit.
- [ ] **Step 4:** `grep -rn "@Scheduled" src/backend --include=*.java | grep -v /test/ | grep -v archive | grep -v cactus-core` 결과 0.
- [ ] **Step 5:** 커밋 — `docs(guide): 예약 작업 등록 방법을 백엔드 가이드에 더한다`
