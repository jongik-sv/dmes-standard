# 사용자 화면 사용 통계 — U2 백엔드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mcm-core `com.dongkuk.dmes.mcm.screenusage` 패키지에 화면 사용 구간 기록(`screenUsage/record`, AUTH_ONLY), 일별 집계·보관 스케줄러, 통계 조회 6종(`screenUsageStat/*`)을 만들고, mcm/api 에 BPMN 2개·PERM_ALL action·MSSQL DDL 을 등록한다.

**Architecture:** 원본 `TB_SEC_SCREEN_USAGE_LOG`(1년)와 일별 집계 `TB_SEC_SCREEN_USAGE_DAY`(영구)를 JPA 엔티티로 둔다. `ScreenUsageService.record` 는 인증 사용자·기록 시점 부서로 구간을 검증·중복 사전 조회 후 저장한다. `ScreenUsageRollup`(02:00 KST)은 `최대 USAGE_DT - 2일 ~ 어제`를 일자 단위로 Java 합산 → delete → insert 하고 365일 지난 원본을 지운다. `ScreenUsageStatService` 는 집계 테이블(최대 USAGE_DT 까지) + 원본 합산(그 다음 날 ~ 조회 종료일, 오늘 포함)을 겹치지 않게 더해 6개 응답을 만든다.

**Tech Stack:** Java 21 · Spring Boot 4.0.6(Spring Framework 7, Spring Data JPA, Hibernate 7) · OASIS BPMN(cactus-core) · JUnit 5 / Mockito / AssertJ · H2(테스트 전용, `testRuntimeOnly`) · `@cothe/bpmn-tool@1.3.0`(BPMN 생성)

**Spec:**
- 설계: `docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md` (4장 백엔드, 7장 테스트)
- 총괄 계획: `docs/superpowers/plans/2026-10-02-screen-usage-stats.md` (Global Constraints, 공유 계약 C3·C4·C5, Review Focus)

## Global Constraints

총괄 계획의 Global Constraints 를 그대로 따른다. U2 에 걸리는 항목과 이번 조사로 확정한 값은 다음과 같다.

- 작업 위치: `/Users/jji/project/dmes-standard/.claude/worktrees/screen-usage-stats` (브랜치 `feat/screen-usage-stats`). 이 경로 밖은 읽거나 쓰지 않는다.
- git 은 `/usr/bin/git` 만 쓴다. 명령의 경로·옵션 자리에 셸 변수·글롭을 넣지 않는다. `git add` 는 **파일 경로를 하나씩 적는다**(`-A`·`.` 금지). U1·U3 구현자가 같은 워크트리를 쓴다.
- 도커 금지.
- 테스트 명령: `cd src/backend/mcm-core && ../gradlew :test --tests <FQCN>`. mcm-core 는 자체 `settings.gradle`(`rootProject.name = 'mcm-core'`)이 있는 독립 빌드라 `:test` 가 맞다. mcm/api 컴파일은 `cd src/backend/mcm && ../gradlew :api:compileJava` 로 한다(`src/backend/mcm/settings.gradle` 이 `lib`·`api` 를 include).
- 사용자 ID·부서는 서버가 `SecurityIdentity` 와 `SecUser.deptCd` 로 채운다. 클라이언트 값은 쓰지 않는다.
- OASIS 서비스 클래스에 `@Transactional` 을 붙이지 않는다(6-B-1). serviceTask 에 `output` 을 반드시 둔다(6-C-2). grids key 는 Java 파라미터 이름과 같아야 한다(6-E-3).
- **각 커밋 직전** `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` 를 실행해 `ERROR 0` 을 확인한다.
- 새 BPMN 은 `bpmn-skill` 규칙대로 `bpmn-tool` 로 만든다(XML 손편집 금지): `npx -y @cothe/bpmn-tool@1.3.0 create`, 검증은 `... validate`.
- 커밋 메시지: `type(scope): 한국어 subject` + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 문서·주석·문구는 한국어.
- 두 테이블은 schema 접두를 붙이지 않는다(`audit/entity/AuditLog.java` 의 `@Table(name = "TB_SEC_AUDIT_LOG")` 와 같다).
- 프런트 `src/frontend/m-mcm/proxy.ts` 는 U1 담당이다. 메뉴 시드(`seedScreenUsageMenus`)는 U4 담당이다. 이 계획에서 건드리지 않는다.

### 이 계획이 내린 해석 (공유 계약을 바꾸지 않는 범위)

| 항목 | 결정 | 근거·테스트 |
|---|---|---|
| 원본 합산 범위 | 설계는 "오늘분은 원본에서 합산"이다. 이 계획은 **집계 테이블 최대 일자의 다음 날 ~ 조회 종료일**을 원본에서 합산한다. 오늘이 포함되고, 집계 전 00:00~02:00 에 어제분이 빠지는 구멍도 막는다. 두 출처는 겹치지 않는다 | Task 6 `todayFromRaw…`, `beforeRollup…` |
| 미사용 화면 판정 | 구간 종류와 상관없이 **이용 기록(구간)이 하나라도 있으면 사용**으로 본다(OPEN 만 세지 않는다). 창은 오늘 포함 최근 `unusedDays` 일이다. 90일이면 `오늘-89일`이 창 시작이다. `lastUsedDt` 와 판정 기준이 같다. 대상은 `MENU_VIEW_YN='Y'` 이면서 `USE_TP='Y'` 인 메뉴다 | Task 6 `unusedBoundary` |
| history 31일 | C4 원문 그대로 `DAYS.between(fromDt, toDt) ≤ 31` 이면 받는다(달력으로는 최대 32일) | Task 6 `historyLimit` |
| history 건수 | 최신순 최대 10,000행으로 자른다(`HISTORY_MAX_ROWS`) | Task 6, 계약 보고 대상 |
| byUser 부서 (C4 보충 3) | 사용자당 1행이다. `deptCd`·`deptNm` 은 기간 안 **마지막 이용 구간**의 부서다. 일 단위로 먼저 가린다. 마지막 이용일에 부서가 둘 이상이면 집계 테이블에는 시각이 없으므로, 그날 원본(1년 보관)에서 같은 조건으로 가장 늦게 시작한 구간 1건을 읽어 정한다 | Task 6 `byUserLatestDept`, `byUserSameDayDeptChange` |
| 조건 일치 (C4 보충 1) | `deptCd`·`userId`·`pageId` 는 모두 완전 일치다(LIKE 없음). `deptCd="-"` 는 집계 `'-'` 와 원본 `NULL` 만 거른다 | Task 1 `history`, Task 6 `exactMatchFilters` |
| overview 미사용 수 (C4 보충 2) | `overview` 도 `unusedDays?`(기본 90)를 받아 `unusedScreenCnt` 를 미사용 탭과 같은 규칙으로 센다 | Task 6 `overviewUsesUnusedDays` |
| avgDurationMs | `durationMs / max(openCnt, 1)`. 열람 1회당 평균이다 | Task 6 |
| overview.daily | `fromDt` 부터 `min(toDt, 오늘)` 까지 이용이 없는 날도 0 으로 채운다 | Task 6 `overview` |
| 메뉴 경로 | 새 계층 SQL 을 쓰지 않는다. 기존 `SecMenuNativeRepository.searchMenuFld()`(방언 분기 CTE)로 폴더를 읽고, Java 에서 `PARENT_MENU_ID` 사슬을 이어 `"공통관리 > 시스템관리"` 를 만든다 | Task 5 |
| 오류 표현 | mcm-core 관례대로 `BusinessException(ErrorCode.INVALID_VALUE / REQUIRED_VALUE, 메시지)` 를 던진다(mcm-core 안 24곳) | Task 6 |
| CLIENT_IP | `AuditLogger` 는 IP 를 채우지 않는다. 같은 방식인 `McmAuthController:256` 을 따라 `HttpServletRequest.getRemoteAddr()` 를 쓰고, `RequestContextHolder` 로 꺼낸다 | Task 2 `RequestClientIp` |
| Clock | mcm 호스트에 `Clock` 빈이 없다. mcm-core 는 라이브러리라 빈을 새로 만들지 않는다. `@Autowired` 생성자는 `Clock.system(Asia/Seoul)` 을 쓰고, 테스트는 package-private 생성자로 고정 시계를 넣는다 | Task 2·4·6 |

### 테스트 DB 방식

- mcm-core 에는 `@DataJpaTest`·`@SpringBootTest` 선례가 없다. Boot 4 의 슬라이스 모듈 `spring-boot-data-jpa-test` 는 의존성에도, 로컬 Gradle 캐시에도 없다.
- `src/test/resources/application.yml`(H2) 은 어떤 테스트도 읽지 않는다.
- 그래서 `build.gradle` 을 고치지 않고 이미 있는 테스트 의존성만 쓴다. 쓰는 의존성은 `spring-boot-starter-test`(spring-test), `spring-boot-starter-data-jpa`(Hibernate·Spring Data), `testRuntimeOnly com.h2database:h2` 다. 최소 구성은 다음과 같다.
  - `@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)` 로 시작한다. 이 설정은 H2 메모리 DB 하나, `LocalContainerEntityManagerFactoryBean`(엔티티 패키지는 `screenusage.entity` 뿐, `create-drop`), `JpaTransactionManager`, `@EnableJpaRepositories(screenusage.repository)`, `ScreenUsageDayWriter` 빈만 등록한다.
  - H2 는 runtime 의존성이라 `org.h2.*` 를 import 하지 않는다. 드라이버는 문자열 `"org.h2.Driver"` 로만 지정한다.
  - 서비스는 빈으로 등록하지 않는다. 테스트마다 `new` 로 만들고 저장소 빈과 Mockito mock, 고정 Clock 을 넣는다. `SecMenuNativeRepository` 의 mock 을 빈으로 등록하면 `@PersistenceContext(unitName = "default")` 주입을 시도하므로 빈으로 두지 않는다.
  - 컨텍스트는 캐시돼 테스트 클래스끼리 DB 를 함께 쓴다. 모든 JPA 테스트는 `@BeforeEach` 에서 두 테이블을 `deleteAllInBatch()` 로 비운다.
- 운영 MSSQL DDL 은 H2 `MODE=MSSQLServer` 에서 실제로 실행한다. 엔티티를 그 테이블에 저장했다가 다시 읽어 컬럼·타입 일치를 확인한다(Task 8).
- 로컬 SQLite(시간 컬럼을 문자열 변환기로 저장)는 H2 로 재현되지 않는다. U4 의 브라우저 확인이 실제 검증이다.

## Review Focus

총괄 계획의 Review Focus 를 그대로 옮기고, U2 가 소유하는 항목마다 고정 테스트를 붙였다.

1. **메뉴 권한이 없는 일반 사용자의 수집** — 권한 캐시가 빈 사용자의 `/oasis/screenUsage/record`·`/mcm/oasis/screenUsage/record`·`/api/mcm/oasis/screenUsage/record` 는 403 없이 통과한다. 같은 사용자의 `screenUsageStat/*` 는 403 이다. 테스트: Task 3 `EndpointPermissionFilterAuthOnlyTest`.
2. **재전송·중복** — 같은 묶음을 두 번 보내면 두 번째는 `saved=0` 이고 원본은 한 번만 쌓인다. 고유 제약 위반을 catch 하지 않고 사전 조회로 거른다. 테스트: Task 2 `ScreenUsageRecordJpaTest.resendSameBatch`(H2, 실제 고유 제약), `ScreenUsageServiceTest.skipsDuplicates`.
3. **빠른 탭 전환·StrictMode 이중 실행** — U1 소유다. 서버는 같은 묶음 안의 중복 `clientSegId` 도 1건만 저장한다. 테스트: Task 2 `ScreenUsageServiceTest.skipsDuplicates`.
4. **자정을 걸친 구간과 늦게 도착한 구간** — 자정을 걸친 구간은 시작 일자에 귀속한다. 집계 뒤 도착한 전날 구간은 다음 집계(최대 일자-2일 재계산)에 반영된다. 재계산 창 밖의 지연분은 반영되지 않는다. 테스트: Task 4 `ScreenUsageRollupJpaTest.midnightCrossing`, `lateArrival`.
5. **메뉴에서 지워진 화면·부서 없는 사용자** — 기록은 받고, 통계에서 `"(메뉴 없음)"`·`deptCd "-"`·`"(부서 없음)"` 으로 보인다. 테스트: Task 2 `ScreenUsageRecordJpaTest.storesUnknownMenuAndNoDept`, Task 6 `ScreenUsageStatServiceJpaTest.unknownMenuAndNoDept`.


## 메인 결정 (2026-10-02, 본문보다 우선 적용)

계획 작성 뒤 메인이 내린 결정이다. 본문과 다르면 이 절을 따라 해당 Task 에서 고친다.

1. history 기간 판정은 **시작·종료일 포함 31일**(`ChronoUnit.DAYS.between(from, to) <= 30`). 본문이 `<= 31` 이면 고치고, 31일 통과·32일 거절 경계 테스트를 둔다.
2. history 10,000행 상한, 미사용 = 이용 기록 없음, 원본 합산 = 집계 최대 일자 다음 날부터, `avgDurationMs` 는 열람 1회당(`openCnt = 0` 이면 `null`), `daily` 0 채움은 계획대로 확정. `openCnt = 0` 행의 `avgDurationMs == null` 테스트를 Task 6 에 넣는다.
3. 같은 묶음 동시 재전송 시 뒤 요청이 고유 제약 위반으로 실패하는 동작은 허용한다(U1 sender 는 실패분을 다음 주기에 재전송하고 사전 조회가 거른다).

---

## 파일 구조

mcm-core 메인: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/`

| 파일 | 책임 |
|---|---|
| `entity/ScreenUsageLog.java` | 원본 구간 엔티티(`Persistable` — UUID 지정 키여도 merge SELECT 없이 INSERT) |
| `entity/ScreenUsageDay.java`, `entity/ScreenUsageDayId.java` | 일별 집계 엔티티와 `@IdClass` 복합 키 |
| `repository/ScreenUsageLogRepository.java` | 중복 사전 조회·일자 범위·최소 시각·보관 삭제·이력 |
| `repository/ScreenUsageDayRepository.java` | 최대 일자·일자 삭제·GROUP BY 합계(JPQL) |
| `repository/UsageSum.java`, `DailySum.java`, `PageLastUsed.java` | JPQL 생성자 표현식 투영 record |
| `service/ScreenUsageDates.java` | Asia/Seoul 변환·`yyyyMMdd`·`yyyy-MM-dd HH:mm:ss` 형식(패키지 전용) |
| `service/RequestClientIp.java` | 현재 요청의 `remoteAddr` |
| `service/ScreenUsageService.java` | OASIS `screenUsageService.record` |
| `service/ScreenUsageAggregator.java` | 원본 → (일자, 화면, 사용자, 부서) 합산(롤업·통계 공용) |
| `service/ScreenUsageDayWriter.java` | 일자 단위 delete + insert 트랜잭션 |
| `service/ScreenUsageRollup.java` | 02:00 스케줄러 |
| `service/ScreenMenuCatalog.java` | pageId → 메뉴명·경로·표시 여부 |
| `service/ScreenUsageStatService.java` | OASIS `screenUsageStatService` 6 action |
| `dto/ScreenUsageStatRequest.java` | 통계 공통 파라미터 DTO |
| `schema/ScreenUsageMssqlDdl.java` | MSSQL DDL 정본(DataInitializer·DBA 전달본 공용) |

mcm-core 테스트: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/`

| 파일 | 대상 |
|---|---|
| `screenusage/support/ScreenUsageJpaTestConfig.java`, `UsageFixtures.java`, `StubSecurityIdentity.java` | 테스트 기반 |
| `screenusage/repository/ScreenUsageRepositoryJpaTest.java` | 저장소 |
| `screenusage/service/ScreenUsageServiceTest.java`, `ScreenUsageRecordJpaTest.java`, `RequestClientIpTest.java` | 기록 |
| `screenusage/service/ScreenUsageAggregatorTest.java`, `ScreenUsageRollupJpaTest.java`, `ScreenUsageRollupScheduleTest.java` | 집계 |
| `screenusage/service/ScreenMenuCatalogTest.java` | 메뉴 카탈로그 |
| `screenusage/service/ScreenUsageStatServiceJpaTest.java` | 통계 |
| `screenusage/ScreenUsageOasisContractTest.java` | BPMN·Java·allActions 대조 |
| `screenusage/schema/ScreenUsageMssqlDdlTest.java` | MSSQL DDL |
| `security/endpoint/EndpointPermissionFilterAuthOnlyTest.java` | AUTH_ONLY |

mcm/api: `services/audit/screenUsage.bpmn`, `services/csa/screenUsageStat.bpmn`, `init/DataInitializer.java`.

---

### Task 1: 엔티티·저장소·JPA 테스트 기반

**Files:**
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageLog.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageDayId.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageDay.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/UsageSum.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/DailySum.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/PageLastUsed.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageLogRepository.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageDayRepository.java`
- Create: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/ScreenUsageJpaTestConfig.java`
- Create: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/UsageFixtures.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageRepositoryJpaTest.java`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `ScreenUsageLog` — 기본 생성자, getter/setter `usageId, userId, deptCd, pageId, startKind, startedAt(LocalDateTime), endedAt(LocalDateTime), durationMs(Long), clientSegId, clientIp, receivedAt(LocalDateTime)`.
  - `ScreenUsageDayId(String usageDt, String pageId, String userId, String deptCd)`.
  - `ScreenUsageDay` — `static ScreenUsageDay of(ScreenUsageDayId id)`, `void accumulate(boolean open, long durationMs)`, getter/setter `usageDt, pageId, userId, deptCd, openCnt(Integer), segCnt(Integer), durationMs(Long)`.
  - `record UsageSum(String pageId, String userId, String deptCd, Long openCnt, Long segCnt, Long durationMs, String lastUsedDt)`
  - `record DailySum(String usageDt, Long openCnt, Long userCnt, Long durationMs)`
  - `record PageLastUsed(String pageId, String lastUsedDt)`
  - `ScreenUsageLogRepository`:
    - `List<String> findExistingClientSegIds(String userId, Collection<String> clientSegIds)`
    - `List<ScreenUsageLog> findStartedBetween(LocalDateTime from, LocalDateTime to)` (from 포함, to 제외)
    - `LocalDateTime findMinStartedAt()`
    - `int deleteStartedBefore(LocalDateTime cutoff)`
    - `List<ScreenUsageLog> findHistory(LocalDateTime from, LocalDateTime to, String userId, String deptCd, String pageId, Pageable pageable)`
  - `ScreenUsageDayRepository`:
    - `String findMaxUsageDt()`
    - `int deleteByUsageDt(String usageDt)`
    - `List<UsageSum> sumByPageUserDept(String fromDt, String toDt, String deptCd, String userId, String pageId)`
    - `List<DailySum> sumByDay(String fromDt, String toDt, String deptCd, String userId, String pageId)`
    - `List<PageLastUsed> findLastUsedDtByPage()`
  - 테스트 기반:
    - `ScreenUsageJpaTestConfig`
    - `UsageFixtures.log(String userId, String deptCd, String pageId, String startKind, LocalDateTime startedAt, long durationMs)`
    - `UsageFixtures.day(String usageDt, String pageId, String userId, String deptCd, int openCnt, int segCnt, long durationMs)`

- [ ] **Step 1: 테스트 기반과 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/ScreenUsageJpaTestConfig.java`

```java
package com.dongkuk.dmes.mcm.screenusage.support;

import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.util.Properties;

/**
 * 화면 사용 통계 저장소·통합 테스트용 최소 JPA 구성 (H2 메모리).
 *
 * <p>mcm-core 에는 {@code @DataJpaTest} 선례가 없고 Boot 4 슬라이스 모듈도 의존성에 없어,
 * spring-test + 이미 있는 data-jpa·H2 테스트 의존성만으로 EMF·트랜잭션·저장소를 직접 올린다.
 * 엔티티는 {@code screenusage.entity} 만 매핑한다(MCMAPUSER schema 테이블 불필요).
 * 서비스는 빈으로 두지 않고 테스트에서 고정 Clock 과 mock 으로 직접 만든다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = ScreenUsageLogRepository.class)
public class ScreenUsageJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
        ds.setUrl("jdbc:h2:mem:screenusage;DB_CLOSE_DELAY=-1");
        ds.setUsername("sa");
        ds.setPassword("");
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan("com.dongkuk.dmes.mcm.screenusage.entity");
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        Properties props = new Properties();
        props.put("hibernate.hbm2ddl.auto", "create-drop");
        em.setJpaProperties(props);
        return em;
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }
}
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/UsageFixtures.java`

```java
package com.dongkuk.dmes.mcm.screenusage.support;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

/** 화면 사용 테스트 데이터 생성기. 시각은 Asia/Seoul 벽시계 기준 LocalDateTime. */
public final class UsageFixtures {

    private UsageFixtures() {}

    public static ScreenUsageLog log(String userId, String deptCd, String pageId, String startKind,
                                     LocalDateTime startedAt, long durationMs) {
        LocalDateTime endedAt = startedAt.plus(Duration.ofMillis(durationMs));
        ScreenUsageLog l = new ScreenUsageLog();
        l.setUsageId(UUID.randomUUID().toString());
        l.setUserId(userId);
        l.setDeptCd(deptCd);
        l.setPageId(pageId);
        l.setStartKind(startKind);
        l.setStartedAt(startedAt);
        l.setEndedAt(endedAt);
        l.setDurationMs(durationMs);
        l.setClientSegId(UUID.randomUUID().toString());
        l.setReceivedAt(endedAt);
        return l;
    }

    public static ScreenUsageDay day(String usageDt, String pageId, String userId, String deptCd,
                                     int openCnt, int segCnt, long durationMs) {
        ScreenUsageDay d = ScreenUsageDay.of(new ScreenUsageDayId(usageDt, pageId, userId, deptCd));
        d.setOpenCnt(openCnt);
        d.setSegCnt(segCnt);
        d.setDurationMs(durationMs);
        return d;
    }
}
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageRepositoryJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.repository;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.LocalDateTime;
import java.util.List;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
class ScreenUsageRepositoryJpaTest {

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;

    @BeforeEach
    void clean() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
    }

    private static LocalDateTime at(int month, int day, int hour, int minute, int second) {
        return LocalDateTime.of(2026, month, day, hour, minute, second);
    }

    @Test
    @DisplayName("같은 사용자의 같은 clientSegId 는 고유 제약 (USER_ID, CLIENT_SEG_ID) 이 막는다")
    void uniqueUserSegment() {
        ScreenUsageLog first = log("userA", "D100", "csa/commUserMng", "OPEN", at(10, 2, 9, 0, 0), 60_000);
        logRepository.saveAndFlush(first);
        ScreenUsageLog dup = log("userA", "D100", "csa/commUserMng", "OPEN", at(10, 2, 9, 5, 0), 60_000);
        dup.setClientSegId(first.getClientSegId());

        assertThatThrownBy(() -> logRepository.saveAndFlush(dup))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("이미 저장된 clientSegId 조회는 그 사용자 것만 돌려준다")
    void existingSegIdsPerUser() {
        ScreenUsageLog a = logRepository.save(log("userA", "D100", "p/a", "OPEN", at(10, 2, 9, 0, 0), 1_000));
        ScreenUsageLog b = logRepository.save(log("userB", "D100", "p/a", "OPEN", at(10, 2, 9, 0, 0), 1_000));

        assertThat(logRepository.findExistingClientSegIds("userA",
                List.of(a.getClientSegId(), b.getClientSegId(), "none")))
                .containsExactly(a.getClientSegId());
    }

    @Test
    @DisplayName("시작 시각 범위는 시작 포함·끝 제외이고, 최소 시각·보관 삭제도 그 경계를 따른다")
    void startedRangeMinAndPurge() {
        logRepository.saveAll(List.of(
                log("userA", "D100", "p/a", "OPEN", at(10, 1, 23, 59, 59), 1_000),
                log("userA", "D100", "p/a", "OPEN", at(10, 2, 0, 0, 0), 1_000),
                log("userA", "D100", "p/a", "OPEN", at(10, 2, 23, 59, 59), 1_000),
                log("userA", "D100", "p/a", "OPEN", at(10, 3, 0, 0, 0), 1_000)));

        assertThat(logRepository.findStartedBetween(at(10, 2, 0, 0, 0), at(10, 3, 0, 0, 0)))
                .extracting(ScreenUsageLog::getStartedAt)
                .containsExactlyInAnyOrder(at(10, 2, 0, 0, 0), at(10, 2, 23, 59, 59));
        assertThat(logRepository.findMinStartedAt()).isEqualTo(at(10, 1, 23, 59, 59));

        assertThat(logRepository.deleteStartedBefore(at(10, 2, 0, 0, 0))).isEqualTo(1);
        assertThat(logRepository.count()).isEqualTo(3);
    }

    @Test
    @DisplayName("이력 조회는 최신순·필터·건수 제한을 지키고, 부서 '-' 는 부서 없는 행을 찾는다")
    void history() {
        logRepository.saveAll(List.of(
                log("userA", "D100", "p/a", "OPEN", at(10, 2, 9, 0, 0), 1_000),
                log("userA", null, "p/b", "OPEN", at(10, 2, 10, 0, 0), 1_000),
                log("userB", "D200", "p/a", "OPEN", at(10, 2, 11, 0, 0), 1_000)));
        LocalDateTime from = at(10, 2, 0, 0, 0);
        LocalDateTime to = at(10, 3, 0, 0, 0);

        assertThat(logRepository.findHistory(from, to, null, null, null, PageRequest.of(0, 10)))
                .extracting(ScreenUsageLog::getStartedAt)
                .containsExactly(at(10, 2, 11, 0, 0), at(10, 2, 10, 0, 0), at(10, 2, 9, 0, 0));
        assertThat(logRepository.findHistory(from, to, null, "-", null, PageRequest.of(0, 10)))
                .extracting(ScreenUsageLog::getPageId).containsExactly("p/b");
        assertThat(logRepository.findHistory(from, to, "userA", null, null, PageRequest.of(0, 10))).hasSize(2);
        assertThat(logRepository.findHistory(from, to, null, null, "p/a", PageRequest.of(0, 10))).hasSize(2);
        assertThat(logRepository.findHistory(from, to, null, null, null, PageRequest.of(0, 2))).hasSize(2);
    }

    @Test
    @DisplayName("일별 집계는 화면·사용자·부서 합계와 일자별 이용자 수를 GROUP BY 로 낸다")
    void daySums() {
        dayRepository.saveAll(List.of(
                day("20261001", "p1", "userA", "D100", 1, 2, 1_000),
                day("20261002", "p1", "userA", "D100", 2, 3, 2_000),
                day("20261002", "p1", "userB", "-", 1, 1, 500),
                day("20261002", "p2", "userA", "D100", 0, 1, 700)));

        assertThat(dayRepository.sumByPageUserDept("20261001", "20261002", null, null, null))
                .containsExactlyInAnyOrder(
                        new UsageSum("p1", "userA", "D100", 3L, 5L, 3_000L, "20261002"),
                        new UsageSum("p1", "userB", "-", 1L, 1L, 500L, "20261002"),
                        new UsageSum("p2", "userA", "D100", 0L, 1L, 700L, "20261002"));
        assertThat(dayRepository.sumByPageUserDept("20261001", "20261002", "-", null, null))
                .containsExactly(new UsageSum("p1", "userB", "-", 1L, 1L, 500L, "20261002"));
        assertThat(dayRepository.sumByPageUserDept("20261002", "20261002", null, "userA", "p1"))
                .containsExactly(new UsageSum("p1", "userA", "D100", 2L, 3L, 2_000L, "20261002"));
        assertThat(dayRepository.sumByDay("20261001", "20261002", null, null, null))
                .containsExactly(
                        new DailySum("20261001", 1L, 1L, 1_000L),
                        new DailySum("20261002", 3L, 2L, 3_200L));
        assertThat(dayRepository.findMaxUsageDt()).isEqualTo("20261002");
        assertThat(dayRepository.findLastUsedDtByPage())
                .containsExactlyInAnyOrder(new PageLastUsed("p1", "20261002"), new PageLastUsed("p2", "20261002"));

        assertThat(dayRepository.deleteByUsageDt("20261002")).isEqualTo(3);
        assertThat(dayRepository.findMaxUsageDt()).isEqualTo("20261001");
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageRepositoryJpaTest`
Expected: FAIL — `compileTestJava` 에서 `cannot find symbol: class ScreenUsageLog` 등 컴파일 오류

- [ ] **Step 3: 엔티티 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageLog.java`

```java
package com.dongkuk.dmes.mcm.screenusage.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import jakarta.persistence.UniqueConstraint;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;

/**
 * 화면 사용 구간 원본 — {@code TB_SEC_SCREEN_USAGE_LOG} (1년 보관, 설계 4.1).
 *
 * <p>감사 계열({@code TB_SEC_AUDIT_LOG})처럼 schema 접두를 두지 않는다. 운영 MSSQL DDL 정본은
 * {@code com.dongkuk.dmes.mcm.screenusage.schema.ScreenUsageMssqlDdl} 이며 제약·인덱스 이름이 이 매핑과 같다.
 * 시각은 Asia/Seoul 벽시계(LocalDateTime) — USAGE_DT 일자 귀속과 SQLite 문자열 변환기 비교를 단순하게 한다.
 *
 * <p>{@link Persistable} — 키(UUID)를 직접 넣으므로 Spring Data 가 merge(선 SELECT)로 가지 않고 바로 INSERT 하게 한다.
 */
@Entity
@Table(name = "TB_SEC_SCREEN_USAGE_LOG",
        uniqueConstraints = @UniqueConstraint(name = "UK_SEC_SCREEN_USAGE_LOG_SEG",
                columnNames = {"USER_ID", "CLIENT_SEG_ID"}),
        indexes = {
                @Index(name = "IX_SEC_SCREEN_USAGE_LOG_STARTED", columnList = "STARTED_AT"),
                @Index(name = "IX_SEC_SCREEN_USAGE_LOG_USER", columnList = "USER_ID, STARTED_AT"),
                @Index(name = "IX_SEC_SCREEN_USAGE_LOG_PAGE", columnList = "PAGE_ID, STARTED_AT")
        })
public class ScreenUsageLog implements Persistable<String> {

    @Id
    @Column(name = "USAGE_ID", length = 36, nullable = false)
    private String usageId;

    @Column(name = "USER_ID", length = 50, nullable = false)
    private String userId;

    /** 기록 시점 SecUser.deptCd 스냅숏. 없으면 null (집계에서 '-'). */
    @Column(name = "DEPT_CD", length = 10)
    private String deptCd;

    /** {@code ${PARENT_MENU_ID}/${OBJECT_ID}} — 메뉴 마스터 존재 여부는 기록 시 검사하지 않는다. */
    @Column(name = "PAGE_ID", length = 200, nullable = false)
    private String pageId;

    /** OPEN / SWITCH / RESUME */
    @Column(name = "START_KIND", length = 10, nullable = false)
    private String startKind;

    @Column(name = "STARTED_AT", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ENDED_AT", nullable = false)
    private LocalDateTime endedAt;

    /** 서버가 ENDED_AT - STARTED_AT (ms) 로 계산. */
    @Column(name = "DURATION_MS", nullable = false)
    private Long durationMs;

    @Column(name = "CLIENT_SEG_ID", length = 36, nullable = false)
    private String clientSegId;

    @Column(name = "CLIENT_IP", length = 45)
    private String clientIp;

    @Column(name = "RECEIVED_AT", nullable = false)
    private LocalDateTime receivedAt;

    @Transient
    private boolean newEntity = true;

    public ScreenUsageLog() {}

    @Override
    public String getId() { return usageId; }

    @Override
    public boolean isNew() { return newEntity; }

    @PostPersist
    @PostLoad
    void markPersisted() { this.newEntity = false; }

    public String getUsageId() { return usageId; }
    public void setUsageId(String usageId) { this.usageId = usageId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public String getStartKind() { return startKind; }
    public void setStartKind(String startKind) { this.startKind = startKind; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }
    public LocalDateTime getEndedAt() { return endedAt; }
    public void setEndedAt(LocalDateTime endedAt) { this.endedAt = endedAt; }
    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }
    public String getClientSegId() { return clientSegId; }
    public void setClientSegId(String clientSegId) { this.clientSegId = clientSegId; }
    public String getClientIp() { return clientIp; }
    public void setClientIp(String clientIp) { this.clientIp = clientIp; }
    public LocalDateTime getReceivedAt() { return receivedAt; }
    public void setReceivedAt(LocalDateTime receivedAt) { this.receivedAt = receivedAt; }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageDayId.java`

```java
package com.dongkuk.dmes.mcm.screenusage.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link ScreenUsageDay} 복합 PK — (USAGE_DT, PAGE_ID, USER_ID, DEPT_CD). */
public class ScreenUsageDayId implements Serializable {

    private String usageDt;
    private String pageId;
    private String userId;
    private String deptCd;

    public ScreenUsageDayId() {}

    public ScreenUsageDayId(String usageDt, String pageId, String userId, String deptCd) {
        this.usageDt = usageDt;
        this.pageId = pageId;
        this.userId = userId;
        this.deptCd = deptCd;
    }

    public String getUsageDt() { return usageDt; }
    public String getPageId() { return pageId; }
    public String getUserId() { return userId; }
    public String getDeptCd() { return deptCd; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ScreenUsageDayId that)) return false;
        return Objects.equals(usageDt, that.usageDt) && Objects.equals(pageId, that.pageId)
                && Objects.equals(userId, that.userId) && Objects.equals(deptCd, that.deptCd);
    }

    @Override
    public int hashCode() {
        return Objects.hash(usageDt, pageId, userId, deptCd);
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageDay.java`

```java
package com.dongkuk.dmes.mcm.screenusage.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.domain.Persistable;

/**
 * 화면 사용 일별 집계 — {@code TB_SEC_SCREEN_USAGE_DAY} (영구 보관, 설계 4.2).
 *
 * <p>키 (USAGE_DT yyyyMMdd Asia/Seoul, PAGE_ID, USER_ID, DEPT_CD — 없으면 '-'). 사용자 단위로 남겨
 * 화면별·부서별·사용자별·이용자 수 통계를 이 테이블 하나로 계산한다. schema 접두 없음.
 */
@Entity
@Table(name = "TB_SEC_SCREEN_USAGE_DAY")
@IdClass(ScreenUsageDayId.class)
public class ScreenUsageDay implements Persistable<ScreenUsageDayId> {

    @Id
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "USAGE_DT", length = 8, nullable = false)
    private String usageDt;

    @Id
    @Column(name = "PAGE_ID", length = 200, nullable = false)
    private String pageId;

    @Id
    @Column(name = "USER_ID", length = 50, nullable = false)
    private String userId;

    @Id
    @Column(name = "DEPT_CD", length = 10, nullable = false)
    private String deptCd;

    @Column(name = "OPEN_CNT", nullable = false)
    private Integer openCnt = 0;

    @Column(name = "SEG_CNT", nullable = false)
    private Integer segCnt = 0;

    @Column(name = "DURATION_MS", nullable = false)
    private Long durationMs = 0L;

    @Transient
    private boolean newEntity = true;

    public ScreenUsageDay() {}

    public static ScreenUsageDay of(ScreenUsageDayId id) {
        ScreenUsageDay d = new ScreenUsageDay();
        d.usageDt = id.getUsageDt();
        d.pageId = id.getPageId();
        d.userId = id.getUserId();
        d.deptCd = id.getDeptCd();
        return d;
    }

    /** 구간 1개를 더한다 — OPEN 이면 열람 1, 모든 구간은 구간 수 1, 길이는 합산. */
    public void accumulate(boolean open, long durationMs) {
        if (open) openCnt = openCnt + 1;
        segCnt = segCnt + 1;
        this.durationMs = this.durationMs + durationMs;
    }

    @Override
    public ScreenUsageDayId getId() { return new ScreenUsageDayId(usageDt, pageId, userId, deptCd); }

    @Override
    public boolean isNew() { return newEntity; }

    @PostPersist
    @PostLoad
    void markPersisted() { this.newEntity = false; }

    public String getUsageDt() { return usageDt; }
    public void setUsageDt(String usageDt) { this.usageDt = usageDt; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public Integer getOpenCnt() { return openCnt; }
    public void setOpenCnt(Integer openCnt) { this.openCnt = openCnt; }
    public Integer getSegCnt() { return segCnt; }
    public void setSegCnt(Integer segCnt) { this.segCnt = segCnt; }
    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }
}
```

- [ ] **Step 4: 투영 record 와 저장소 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/UsageSum.java`

```java
package com.dongkuk.dmes.mcm.screenusage.repository;

/** (화면, 사용자, 부서) 단위 합계 — 집계 테이블 JPQL GROUP BY 또는 원본 합산 결과. */
public record UsageSum(String pageId, String userId, String deptCd,
                       Long openCnt, Long segCnt, Long durationMs, String lastUsedDt) {}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/DailySum.java`

```java
package com.dongkuk.dmes.mcm.screenusage.repository;

/** 일자별 합계 — 열람 수, 이용자 수(COUNT DISTINCT), 이용 시간. */
public record DailySum(String usageDt, Long openCnt, Long userCnt, Long durationMs) {}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/PageLastUsed.java`

```java
package com.dongkuk.dmes.mcm.screenusage.repository;

/** 화면별 마지막 이용일(전체 기간). */
public record PageLastUsed(String pageId, String lastUsedDt) {}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageLogRepository.java`

```java
package com.dongkuk.dmes.mcm.screenusage.repository;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/** {@code TB_SEC_SCREEN_USAGE_LOG} 저장소. 방언 함수 없이 범위 파라미터만 쓰는 JPQL. */
public interface ScreenUsageLogRepository extends JpaRepository<ScreenUsageLog, String> {

    /** 재전송 중복 사전 조회 — 고유 제약 위반을 catch 하면 트랜잭션이 rollback-only 가 되므로 저장 전에 거른다. */
    @Query("SELECT l.clientSegId FROM ScreenUsageLog l WHERE l.userId = :userId AND l.clientSegId IN :clientSegIds")
    List<String> findExistingClientSegIds(@Param("userId") String userId,
                                          @Param("clientSegIds") Collection<String> clientSegIds);

    /** STARTED_AT ∈ [from, to). 일자 집계·원본 합산용. */
    @Query("SELECT l FROM ScreenUsageLog l WHERE l.startedAt >= :from AND l.startedAt < :to")
    List<ScreenUsageLog> findStartedBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT MIN(l.startedAt) FROM ScreenUsageLog l")
    LocalDateTime findMinStartedAt();

    /** 보관 삭제 — STARTED_AT < cutoff. */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM ScreenUsageLog l WHERE l.startedAt < :cutoff")
    int deleteStartedBefore(@Param("cutoff") LocalDateTime cutoff);

    /** 이용 이력 — 최신순. deptCd '-' 는 부서 없는(NULL) 행. 건수는 pageable 로 자른다. */
    @Query("""
            SELECT l FROM ScreenUsageLog l
             WHERE l.startedAt >= :from AND l.startedAt < :to
               AND (:userId IS NULL OR l.userId = :userId)
               AND (:pageId IS NULL OR l.pageId = :pageId)
               AND (:deptCd IS NULL OR l.deptCd = :deptCd OR (:deptCd = '-' AND l.deptCd IS NULL))
             ORDER BY l.startedAt DESC
            """)
    List<ScreenUsageLog> findHistory(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to,
                                     @Param("userId") String userId, @Param("deptCd") String deptCd,
                                     @Param("pageId") String pageId, Pageable pageable);
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageDayRepository.java`

```java
package com.dongkuk.dmes.mcm.screenusage.repository;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * {@code TB_SEC_SCREEN_USAGE_DAY} 저장소. GROUP BY·SUM·COUNT(DISTINCT)·MAX 와 범위 파라미터만 쓰는 이식 가능한 JPQL
 * (USAGE_DT 는 yyyyMMdd 문자열이라 문자열 비교가 곧 날짜 비교다).
 */
public interface ScreenUsageDayRepository extends JpaRepository<ScreenUsageDay, ScreenUsageDayId> {

    @Query("SELECT MAX(d.usageDt) FROM ScreenUsageDay d")
    String findMaxUsageDt();

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM ScreenUsageDay d WHERE d.usageDt = :usageDt")
    int deleteByUsageDt(@Param("usageDt") String usageDt);

    @Query("""
            SELECT new com.dongkuk.dmes.mcm.screenusage.repository.UsageSum(
                   d.pageId, d.userId, d.deptCd, SUM(d.openCnt), SUM(d.segCnt), SUM(d.durationMs), MAX(d.usageDt))
              FROM ScreenUsageDay d
             WHERE d.usageDt >= :fromDt AND d.usageDt <= :toDt
               AND (:deptCd IS NULL OR d.deptCd = :deptCd)
               AND (:userId IS NULL OR d.userId = :userId)
               AND (:pageId IS NULL OR d.pageId = :pageId)
             GROUP BY d.pageId, d.userId, d.deptCd
            """)
    List<UsageSum> sumByPageUserDept(@Param("fromDt") String fromDt, @Param("toDt") String toDt,
                                     @Param("deptCd") String deptCd, @Param("userId") String userId,
                                     @Param("pageId") String pageId);

    @Query("""
            SELECT new com.dongkuk.dmes.mcm.screenusage.repository.DailySum(
                   d.usageDt, SUM(d.openCnt), COUNT(DISTINCT d.userId), SUM(d.durationMs))
              FROM ScreenUsageDay d
             WHERE d.usageDt >= :fromDt AND d.usageDt <= :toDt
               AND (:deptCd IS NULL OR d.deptCd = :deptCd)
               AND (:userId IS NULL OR d.userId = :userId)
               AND (:pageId IS NULL OR d.pageId = :pageId)
             GROUP BY d.usageDt
             ORDER BY d.usageDt
            """)
    List<DailySum> sumByDay(@Param("fromDt") String fromDt, @Param("toDt") String toDt,
                            @Param("deptCd") String deptCd, @Param("userId") String userId,
                            @Param("pageId") String pageId);

    @Query("""
            SELECT new com.dongkuk.dmes.mcm.screenusage.repository.PageLastUsed(d.pageId, MAX(d.usageDt))
              FROM ScreenUsageDay d
             GROUP BY d.pageId
            """)
    List<PageLastUsed> findLastUsedDtByPage();
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageRepositoryJpaTest`
Expected: PASS (5 tests)

- [ ] **Step 6: 계약 검사와 커밋**

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`

```bash
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageLog.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageDayId.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/entity/ScreenUsageDay.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/UsageSum.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/DailySum.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/PageLastUsed.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageLogRepository.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageDayRepository.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/ScreenUsageJpaTestConfig.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/UsageFixtures.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/repository/ScreenUsageRepositoryJpaTest.java
/usr/bin/git commit -m "feat(mcm-core): 화면 사용 구간 원본·일별 집계 엔티티와 저장소를 추가한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 기록 서비스 `screenUsageService.record`

**Files:**
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageDates.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/RequestClientIp.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageService.java`
- Create: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/StubSecurityIdentity.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageServiceTest.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRecordJpaTest.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/RequestClientIpTest.java`

**Interfaces:**
- Consumes (Task 1):
  - `ScreenUsageLogRepository.findExistingClientSegIds(String, Collection<String>)`, `saveAll`
  - `ScreenUsageLog` setter
  - `ScreenUsageJpaTestConfig`
- Consumes (기존):
  - `SecUserRepository.findById(String) : Optional<SecUser>`, `SecUser.getDeptCd()`
  - `SecurityIdentity.requireUserId()` — default 메서드라 Mockito mock 대신 손으로 만든 스텁을 쓴다.
- Produces:
  - `@Service("screenUsageService") ScreenUsageService` — `public Map<String, Object> record(List<Map<String, Object>> segments)` → `{saved:Integer, skipped:Integer}` (C3)
  - 공개 생성자 `(ScreenUsageLogRepository, SecUserRepository, SecurityIdentity, RequestClientIp)`. 테스트용 package-private 생성자는 끝에 `Clock` 을 더 받는다.
  - `@Component RequestClientIp` — `public String current()`
  - `final class ScreenUsageDates` (패키지 전용):
    - `ZONE`
    - `LocalDateTime fromEpochMillis(long)`
    - `String format(LocalDate)`
    - `String usageDt(LocalDateTime)`
    - `LocalDate parseDt(String)`
    - `String timestamp(LocalDateTime)`
  - 테스트용 `StubSecurityIdentity(String userId)` — `public String userId` 필드를 바꿀 수 있다.

- [ ] **Step 1: 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/StubSecurityIdentity.java`

```java
package com.dongkuk.dmes.mcm.screenusage.support;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;

/**
 * SecurityIdentity 스텁. requireUserId() 는 인터페이스 default 메서드라 Mockito mock 으로는 실제 로직(빈 값 거절)이
 * 돌지 않는다 — 손으로 만든 구현을 써서 default 동작을 그대로 시험한다.
 */
public class StubSecurityIdentity implements SecurityIdentity {

    public String userId;

    public StubSecurityIdentity(String userId) {
        this.userId = userId;
    }

    @Override
    public String currentUserId() { return userId; }

    @Override
    public boolean hasAuthority(String authority) { return false; }
}
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageServiceTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.support.StubSecurityIdentity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** {@link ScreenUsageService#record} 검증 규칙(설계 4.3) — 저장소는 Mockito, SecurityIdentity 는 스텁. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScreenUsageServiceTest {

    /** 2026-10-02 10:00 Asia/Seoul */
    private static final Instant NOW = Instant.parse("2026-10-02T01:00:00Z");
    private static final long NOW_MS = NOW.toEpochMilli();

    @Mock ScreenUsageLogRepository logRepository;
    @Mock SecUserRepository secUserRepository;
    @Mock RequestClientIp requestClientIp;
    @Captor ArgumentCaptor<List<ScreenUsageLog>> rowsCaptor;

    private StubSecurityIdentity identity;
    private ScreenUsageService service;

    @BeforeEach
    void setUp() {
        identity = new StubSecurityIdentity("userA");
        service = new ScreenUsageService(logRepository, secUserRepository, identity, requestClientIp,
                Clock.fixed(NOW, ZoneId.of("Asia/Seoul")));
        when(logRepository.findExistingClientSegIds(anyString(), anyCollection())).thenReturn(List.of());
        when(secUserRepository.findById("userA")).thenReturn(Optional.of(user("userA", "D100")));
        when(requestClientIp.current()).thenReturn("10.0.0.7");
    }

    private static SecUser user(String userId, String deptCd) {
        SecUser u = new SecUser();
        u.setUserId(userId);
        u.setDeptCd(deptCd);
        return u;
    }

    private static Map<String, Object> seg(String id, String pageId, String kind, long startOffsetMs, long durationMs) {
        Map<String, Object> m = new HashMap<>();
        m.put("clientSegId", id);
        m.put("pageId", pageId);
        m.put("startKind", kind);
        m.put("startedAt", NOW_MS + startOffsetMs);
        m.put("endedAt", NOW_MS + startOffsetMs + durationMs);
        return m;
    }

    @Test
    @DisplayName("인증 사용자·기록 시점 부서·IP·서버 계산 길이로 저장하고 body 의 userId·deptCd 는 무시한다")
    void savesWithServerFilledFields() {
        Map<String, Object> s = seg("seg-1", "csa/commUserMng", "OPEN", -120_000, 60_000);
        s.put("userId", "intruder");
        s.put("deptCd", "HACK");

        Map<String, Object> result = service.record(List.of(s));

        assertThat(result).containsEntry("saved", 1).containsEntry("skipped", 0);
        verify(logRepository).saveAll(rowsCaptor.capture());
        ScreenUsageLog row = rowsCaptor.getValue().get(0);
        assertThat(row.getUserId()).isEqualTo("userA");
        assertThat(row.getDeptCd()).isEqualTo("D100");
        assertThat(row.getClientIp()).isEqualTo("10.0.0.7");
        assertThat(row.getClientSegId()).isEqualTo("seg-1");
        assertThat(row.getPageId()).isEqualTo("csa/commUserMng");
        assertThat(row.getStartKind()).isEqualTo("OPEN");
        assertThat(row.getDurationMs()).isEqualTo(60_000L);
        assertThat(row.getStartedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 9, 58));
        assertThat(row.getEndedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 9, 59));
        assertThat(row.getReceivedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 10, 0));
        assertThat(row.getUsageId()).hasSize(36);
    }

    @Test
    @DisplayName("검증을 통과하지 못한 구간은 버리고 건수만 센다")
    void dropsInvalidSegments() {
        Map<String, Object> ok = seg("s1", "p/a", "OPEN", -60_000, 10_000);
        Map<String, Object> noSegId = seg(null, "p/a", "OPEN", -60_000, 10_000);
        Map<String, Object> blankPage = seg("s3", "  ", "OPEN", -60_000, 10_000);
        Map<String, Object> longPage = seg("s4", "p/" + "x".repeat(199), "OPEN", -60_000, 10_000); // 201자
        Map<String, Object> badKind = seg("s5", "p/a", "CLOSE", -60_000, 10_000);
        Map<String, Object> reversed = seg("s6", "p/a", "OPEN", -60_000, -1_000);           // ENDED < STARTED
        Map<String, Object> tooShort = seg("s7", "p/a", "OPEN", -60_000, 999);              // 1초 미만
        Map<String, Object> tooLong = seg("s8", "p/a", "OPEN", -90_000_000, 86_400_001);    // 24시간 초과
        Map<String, Object> future = seg("s9", "p/a", "OPEN", 300_001, 10_000);             // 5분 넘게 미래
        Map<String, Object> textTime = seg("s10", "p/a", "OPEN", -60_000, 10_000);
        textTime.put("startedAt", String.valueOf(NOW_MS - 60_000));                          // 숫자가 아님

        Map<String, Object> result = service.record(Arrays.asList(
                ok, noSegId, blankPage, longPage, badKind, reversed, tooShort, tooLong, future, textTime, null));

        assertThat(result).containsEntry("saved", 1).containsEntry("skipped", 10);
        verify(logRepository).saveAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getValue()).extracting(ScreenUsageLog::getClientSegId).containsExactly("s1");
    }

    @Test
    @DisplayName("경계값(정확히 1초·24시간·5분 미래·pageId 200자)은 받는다")
    void acceptsBoundaries() {
        Map<String, Object> result = service.record(List.of(
                seg("b1", "p/a", "OPEN", -60_000, 1_000),
                seg("b2", "p/a", "SWITCH", -86_400_000, 86_400_000),
                seg("b3", "p/a", "RESUME", 300_000, 1_000),
                seg("b4", "p/" + "x".repeat(198), "OPEN", -60_000, 1_000)));

        assertThat(result).containsEntry("saved", 4).containsEntry("skipped", 0);
    }

    @Test
    @DisplayName("한 요청에 100건이 넘으면 앞 100건만 다루고 나머지는 건너뛴 것으로 센다")
    void capsAtHundred() {
        List<Map<String, Object>> segments = IntStream.range(0, 105)
                .mapToObj(i -> seg("s" + i, "p/a", "OPEN", -60_000, 1_000))
                .toList();

        Map<String, Object> result = service.record(segments);

        assertThat(result).containsEntry("saved", 100).containsEntry("skipped", 5);
        verify(logRepository).saveAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getValue()).hasSize(100);
        assertThat(rowsCaptor.getValue().get(99).getClientSegId()).isEqualTo("s99");
    }

    @Test
    @DisplayName("같은 묶음 안의 중복 clientSegId 와 이미 저장된 clientSegId 는 건너뛴다")
    void skipsDuplicates() {
        when(logRepository.findExistingClientSegIds(eq("userA"), anyCollection())).thenReturn(List.of("old"));

        Map<String, Object> result = service.record(List.of(
                seg("new", "p/a", "OPEN", -60_000, 1_000),
                seg("new", "p/a", "OPEN", -50_000, 1_000),
                seg("old", "p/a", "OPEN", -40_000, 1_000)));

        assertThat(result).containsEntry("saved", 1).containsEntry("skipped", 2);
        verify(logRepository).saveAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getValue()).extracting(ScreenUsageLog::getClientSegId).containsExactly("new");
    }

    @Test
    @DisplayName("모두 이미 저장된 구간이면 저장소에 쓰지 않고 saved=0 이다")
    void allDuplicates() {
        when(logRepository.findExistingClientSegIds(eq("userA"), anyCollection())).thenReturn(List.of("a", "b"));

        Map<String, Object> result = service.record(List.of(
                seg("a", "p/a", "OPEN", -60_000, 1_000),
                seg("b", "p/a", "OPEN", -50_000, 1_000)));

        assertThat(result).containsEntry("saved", 0).containsEntry("skipped", 2);
        verify(logRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("사용자 마스터에 없거나 부서가 비어 있으면 부서는 null 로 남긴다")
    void noDeptSnapshot() {
        when(secUserRepository.findById("userA")).thenReturn(Optional.empty());
        service.record(List.of(seg("n1", "p/a", "OPEN", -60_000, 1_000)));
        when(secUserRepository.findById("userA")).thenReturn(Optional.of(user("userA", "  ")));
        service.record(List.of(seg("n2", "p/a", "OPEN", -60_000, 1_000)));

        verify(logRepository, times(2)).saveAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getAllValues()).allSatisfy(rows -> assertThat(rows.get(0).getDeptCd()).isNull());
    }

    @Test
    @DisplayName("인증 사용자가 없으면 거절하고 저장소를 건드리지 않는다")
    void requiresAuthentication() {
        identity.userId = null;

        assertThatThrownBy(() -> service.record(List.of(seg("x", "p/a", "OPEN", -60_000, 1_000))))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(logRepository);
    }

    @Test
    @DisplayName("빈 목록·null 은 saved=0, skipped=0 이고 저장하지 않는다")
    void emptyBatch() {
        assertThat(service.record(List.of())).containsEntry("saved", 0).containsEntry("skipped", 0);
        assertThat(service.record(null)).containsEntry("saved", 0).containsEntry("skipped", 0);
        verify(logRepository, never()).saveAll(any());
    }
}
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRecordJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import com.dongkuk.dmes.mcm.screenusage.support.StubSecurityIdentity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** 기록 서비스 + 실제 고유 제약(H2) — Review Focus 2·5. */
@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
class ScreenUsageRecordJpaTest {

    private static final Instant NOW = Instant.parse("2026-10-02T01:00:00Z");
    private static final long NOW_MS = NOW.toEpochMilli();

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;

    private final SecUserRepository secUserRepository = mock(SecUserRepository.class); // findById → Optional.empty()
    private final RequestClientIp requestClientIp = mock(RequestClientIp.class);
    private StubSecurityIdentity identity;
    private ScreenUsageService service;

    @BeforeEach
    void setUp() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
        identity = new StubSecurityIdentity("userA");
        service = new ScreenUsageService(logRepository, secUserRepository, identity, requestClientIp,
                Clock.fixed(NOW, ZoneId.of("Asia/Seoul")));
    }

    private static Map<String, Object> seg(String id, String pageId, long startOffsetMs) {
        Map<String, Object> m = new HashMap<>();
        m.put("clientSegId", id);
        m.put("pageId", pageId);
        m.put("startKind", "OPEN");
        m.put("startedAt", NOW_MS + startOffsetMs);
        m.put("endedAt", NOW_MS + startOffsetMs + 5_000);
        return m;
    }

    @Test
    @DisplayName("같은 묶음을 두 번 보내면 두 번째는 saved=0 이고 원본은 한 번만 쌓인다 (Review Focus 2)")
    void resendSameBatch() {
        List<Map<String, Object>> batch = List.of(seg("seg-1", "csa/commUserMng", -60_000), seg("seg-2", "csa/commMenuMng", -30_000));

        assertThat(service.record(batch)).containsEntry("saved", 2).containsEntry("skipped", 0);
        assertThat(service.record(batch)).containsEntry("saved", 0).containsEntry("skipped", 2);
        assertThat(logRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("일부만 겹친 재전송은 새 구간만 저장한다")
    void partialResend() {
        service.record(List.of(seg("seg-1", "p/a", -60_000)));

        assertThat(service.record(List.of(seg("seg-1", "p/a", -60_000), seg("seg-3", "p/a", -10_000))))
                .containsEntry("saved", 1).containsEntry("skipped", 1);
        assertThat(logRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("다른 사용자의 같은 clientSegId 는 각자 저장된다 (고유 제약은 사용자 기준)")
    void sameSegIdOtherUser() {
        service.record(List.of(seg("seg-1", "p/a", -60_000)));
        identity.userId = "userB";

        assertThat(service.record(List.of(seg("seg-1", "p/a", -60_000)))).containsEntry("saved", 1);
        assertThat(logRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("메뉴에 없는 화면·부서 없는 사용자의 구간도 저장한다 (Review Focus 5)")
    void storesUnknownMenuAndNoDept() {
        assertThat(service.record(List.of(seg("seg-x", "old/removedScreen", -60_000)))).containsEntry("saved", 1);

        ScreenUsageLog saved = logRepository.findAll().get(0);
        assertThat(saved.getPageId()).isEqualTo("old/removedScreen");
        assertThat(saved.getDeptCd()).isNull();
        assertThat(saved.getUserId()).isEqualTo("userA");
    }
}
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/RequestClientIpTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.assertThat;

class RequestClientIpTest {

    @AfterEach
    void reset() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    @DisplayName("현재 요청이 있으면 remoteAddr 를 돌려준다")
    void currentRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.7");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        assertThat(new RequestClientIp().current()).isEqualTo("10.0.0.7");
    }

    @Test
    @DisplayName("요청 밖(스케줄러 등)에서는 null")
    void noRequest() {
        assertThat(new RequestClientIp().current()).isNull();
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageServiceTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageRecordJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.RequestClientIpTest`
Expected: FAIL — `cannot find symbol: class ScreenUsageService`, `class RequestClientIp`

- [ ] **Step 3: 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageDates.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/** 화면 사용 통계의 날짜 규칙 — 서버 시간대 Asia/Seoul, 일자 yyyyMMdd, 시각 yyyy-MM-dd HH:mm:ss. */
final class ScreenUsageDates {

    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private ScreenUsageDates() {}

    static LocalDateTime fromEpochMillis(long epochMs) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMs), ZONE);
    }

    static String format(LocalDate date) {
        return DT.format(date);
    }

    /** 구간의 일자 귀속 — STARTED_AT 의 일자(자정을 걸쳐도 시작 일자). */
    static String usageDt(LocalDateTime startedAt) {
        return DT.format(startedAt);
    }

    /** @throws java.time.format.DateTimeParseException 형식이 yyyyMMdd 가 아니면 */
    static LocalDate parseDt(String yyyyMMdd) {
        return LocalDate.parse(yyyyMMdd, DT);
    }

    static String timestamp(LocalDateTime time) {
        return time == null ? null : TS.format(time);
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/RequestClientIp.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 현재 HTTP 요청의 클라이언트 IP. 로그인 이력(McmAuthController — LoginLog.clientIp)과 같은 remoteAddr 기준이다
 * (X-Forwarded-For 는 보지 않는다). 요청 밖에서 호출되면 null.
 */
@Component
public class RequestClientIp {

    public String current() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes servlet) {
            return servlet.getRequest().getRemoteAddr();
        }
        return null;
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageService.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 화면 사용 구간 기록 — OASIS {@code screenUsage/record} (설계 4.3, 계약 C3).
 *
 * <p>로그인 사용자 전원이 호출하는 AUTH_ONLY 서비스다. 사용자 ID 는 인증 컨텍스트, 부서는 기록 시점
 * {@code SecUser.deptCd} 스냅숏으로 서버가 채운다(body·meta 의 값은 쓰지 않는다).
 *
 * <p>중복: 요청 묶음의 clientSegId 를 사용자 기준으로 먼저 조회해 건너뛴다. 고유 제약 위반을 catch 해서 넘기면
 * 트랜잭션이 rollback-only 가 되므로 하지 않는다. 같은 묶음이 동시에 두 번 들어와 사전 조회를 함께 통과하면
 * 뒤 요청이 제약 위반으로 실패하고, sender 가 다음 주기에 재전송할 때 사전 조회가 거른다.
 *
 * <p>{@code @Transactional} 미부착 — OASIS 진입점(6-B-1). 쓰기는 {@code saveAll} 의 저장소 트랜잭션으로 원자적이다.
 */
@Service("screenUsageService")
public class ScreenUsageService {

    private static final Logger log = LoggerFactory.getLogger(ScreenUsageService.class);

    static final int MAX_PER_REQUEST = 100;
    static final long MIN_DURATION_MS = 1_000L;
    static final long MAX_DURATION_MS = 24L * 60 * 60 * 1000;
    static final long MAX_FUTURE_MS = 5L * 60 * 1000;
    static final int MAX_PAGE_ID_LENGTH = 200;
    static final int MAX_SEG_ID_LENGTH = 36;
    static final Set<String> START_KINDS = Set.of("OPEN", "SWITCH", "RESUME");

    private final ScreenUsageLogRepository logRepository;
    private final SecUserRepository secUserRepository;
    private final SecurityIdentity securityIdentity;
    private final RequestClientIp requestClientIp;
    private final Clock clock;

    @Autowired
    public ScreenUsageService(ScreenUsageLogRepository logRepository,
                              SecUserRepository secUserRepository,
                              SecurityIdentity securityIdentity,
                              RequestClientIp requestClientIp) {
        this(logRepository, secUserRepository, securityIdentity, requestClientIp,
                Clock.system(ScreenUsageDates.ZONE));
    }

    ScreenUsageService(ScreenUsageLogRepository logRepository,
                       SecUserRepository secUserRepository,
                       SecurityIdentity securityIdentity,
                       RequestClientIp requestClientIp,
                       Clock clock) {
        this.logRepository = logRepository;
        this.secUserRepository = secUserRepository;
        this.securityIdentity = securityIdentity;
        this.requestClientIp = requestClientIp;
        this.clock = clock;
    }

    /** action=record — grids key {@code segments} = 파라미터 이름(6-E-3). 응답 {@code data.result = {saved, skipped}}. */
    public Map<String, Object> record(List<Map<String, Object>> segments) {
        String userId = securityIdentity.requireUserId();
        if (segments == null || segments.isEmpty()) {
            return result(0, 0);
        }

        long receivedMs = clock.millis();
        int limit = Math.min(segments.size(), MAX_PER_REQUEST);
        int skipped = segments.size() - limit;

        Map<String, Candidate> candidates = new LinkedHashMap<>();
        for (Map<String, Object> row : segments.subList(0, limit)) {
            Candidate c = Candidate.parse(row, receivedMs);
            if (c == null || candidates.containsKey(c.clientSegId())) {
                skipped++;
                continue;
            }
            candidates.put(c.clientSegId(), c);
        }

        if (!candidates.isEmpty()) {
            List<String> existing = logRepository.findExistingClientSegIds(userId, new ArrayList<>(candidates.keySet()));
            for (String segId : existing) {
                if (candidates.remove(segId) != null) {
                    skipped++;
                }
            }
        }
        if (candidates.isEmpty()) {
            logSkipped(userId, skipped);
            return result(0, skipped);
        }

        String deptCd = secUserRepository.findById(userId)
                .map(SecUser::getDeptCd)
                .filter(d -> !d.isBlank())
                .orElse(null);
        String clientIp = requestClientIp.current();
        LocalDateTime receivedAt = ScreenUsageDates.fromEpochMillis(receivedMs);

        List<ScreenUsageLog> rows = new ArrayList<>(candidates.size());
        for (Candidate c : candidates.values()) {
            rows.add(c.toEntity(userId, deptCd, clientIp, receivedAt));
        }
        logRepository.saveAll(rows);
        logSkipped(userId, skipped);
        return result(rows.size(), skipped);
    }

    private static Map<String, Object> result(int saved, int skipped) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("saved", saved);
        result.put("skipped", skipped);
        return result;
    }

    private static void logSkipped(String userId, int skipped) {
        if (skipped > 0) {
            log.info("[screenUsage/record] user={} skipped={}", userId, skipped);
        }
    }

    /** 검증을 통과한 구간 1건. */
    private record Candidate(String clientSegId, String pageId, String startKind, long startedAt, long endedAt) {

        /** 설계 4.3 검증 — 하나라도 어기면 null. 숫자는 ((Number) v).longValue() 로 읽는다(Integer/Long 혼재). */
        static Candidate parse(Map<String, Object> row, long receivedMs) {
            if (row == null) return null;
            String segId = trimmed(row.get("clientSegId"));
            String pageId = trimmed(row.get("pageId"));
            String kind = trimmed(row.get("startKind"));
            Long started = asLong(row.get("startedAt"));
            Long ended = asLong(row.get("endedAt"));
            if (segId == null || segId.length() > MAX_SEG_ID_LENGTH) return null;
            if (pageId == null || pageId.length() > MAX_PAGE_ID_LENGTH) return null;
            if (kind == null || !START_KINDS.contains(kind)) return null;
            if (started == null || ended == null) return null;
            long duration = ended - started;
            if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) return null; // ENDED < STARTED 포함
            if (started > receivedMs + MAX_FUTURE_MS) return null;
            return new Candidate(segId, pageId, kind, started, ended);
        }

        ScreenUsageLog toEntity(String userId, String deptCd, String clientIp, LocalDateTime receivedAt) {
            ScreenUsageLog l = new ScreenUsageLog();
            l.setUsageId(UUID.randomUUID().toString());
            l.setUserId(userId);
            l.setDeptCd(deptCd);
            l.setPageId(pageId);
            l.setStartKind(startKind);
            l.setStartedAt(ScreenUsageDates.fromEpochMillis(startedAt));
            l.setEndedAt(ScreenUsageDates.fromEpochMillis(endedAt));
            l.setDurationMs(endedAt - startedAt);
            l.setClientSegId(clientSegId);
            l.setClientIp(clientIp);
            l.setReceivedAt(receivedAt);
            return l;
        }

        private static String trimmed(Object v) {
            if (!(v instanceof String s)) return null;
            String t = s.trim();
            return t.isEmpty() ? null : t;
        }

        private static Long asLong(Object v) {
            return v instanceof Number n ? n.longValue() : null;
        }
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageServiceTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageRecordJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.RequestClientIpTest`
Expected: PASS (9 + 4 + 2 tests)

- [ ] **Step 5: 계약 검사와 커밋**

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`. BPMN 은 Task 3 에서 연결하므로 아직 진입점이 아니다.

```bash
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageDates.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/RequestClientIp.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageService.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/StubSecurityIdentity.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageServiceTest.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRecordJpaTest.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/RequestClientIpTest.java
/usr/bin/git commit -m "feat(mcm-core): 화면 사용 구간을 검증·중복 사전 조회 후 인증 사용자와 부서 스냅숏으로 기록한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 기록 BPMN 과 AUTH_ONLY 등록

**Files:**
- Create: `src/backend/mcm/api/src/main/resources/services/audit/screenUsage.bpmn` (bpmn-tool 로 생성)
- Modify: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilter.java:75-87` (`AUTH_ONLY_OBJ_ACTION_PREFIXES`)
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilterAuthOnlyTest.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/ScreenUsageOasisContractTest.java`

**Interfaces:**
- Consumes (Task 2): `ScreenUsageService.record(List<Map<String, Object>> segments)`, 빈 이름 `screenUsageService`
- Consumes (기존):
  - `EndpointPermissionFilter(UserPermCache, SecurityIdentity, String oasisServiceGroup, boolean sysadminFreepass)`
  - `UserPermCache.getPermissions(String) : Set<PermKey>`
- Produces:
  - OASIS 서비스 ID `screenUsage`, action `record`, output `result`
  - AUTH_ONLY prefix `"screenusage/record"`. 프런트 `proxy.ts` 의 `"/api/mcm/oasis/screenUsage/record"` 와 짝이며 U1 이 맞춘다.

- [ ] **Step 1: 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilterAuthOnlyTest.java`

```java
package com.dongkuk.dmes.mcm.security.endpoint;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Review Focus 1 — 메뉴 권한이 하나도 없는 일반 사용자도 화면 사용 구간 기록은 403 없이 통과한다.
 * sender 가 오류를 삼키므로 403 이면 조용히 0건이 된다. 통계 조회는 그대로 메뉴 권한 대상이다.
 */
class EndpointPermissionFilterAuthOnlyTest {

    private final UserPermCache userPermCache = mock(UserPermCache.class);
    private final SecurityIdentity securityIdentity = mock(SecurityIdentity.class);
    private final EndpointPermissionFilter filter =
            new EndpointPermissionFilter(userPermCache, securityIdentity, "mcm", false);

    @BeforeEach
    void loginWithoutAnyPermission() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("plainUser", null, List.of()));
        when(securityIdentity.currentUserId()).thenReturn("plainUser");
        when(userPermCache.getPermissions("plainUser")).thenReturn(Set.of());
    }

    @AfterEach
    void logout() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/oasis/screenUsage/record",          // BFF→BE 개발
            "/mcm/oasis/screenUsage/record",      // 운영 게이트웨이 prefix
            "/api/mcm/oasis/screenUsage/record"   // FE 컨벤션
    })
    void 메뉴_권한이_없어도_화면_사용_기록은_통과한다(String uri) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isSameAs(request);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/oasis/screenUsageStat/overview",
            "/oasis/screenUsageStat/history",
            "/oasis/screenUsage/purge"            // record 외 action 은 면제 대상이 아니다
    })
    void 통계_조회와_record_외_action_은_권한이_없으면_403(String uri) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(chain.getRequest()).isNull();
    }
}
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/ScreenUsageOasisContractTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage;

import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * mcm/api BPMN ↔ mcm-core 서비스 계약 대조 (6-C-2 output, 6-E-3 grids key = 파라미터 이름, 6-B-1 @Transactional 금지).
 * 테스트 작업 디렉터리는 mcm-core 모듈 루트다(mdm MdmOasisActionVocabularyTest 와 같은 상대 경로 방식).
 */
class ScreenUsageOasisContractTest {

    static final Path SERVICES = Path.of("../mcm/api/src/main/resources/services");
    static final Path DATA_INITIALIZER =
            Path.of("../mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java");

    @Test
    @DisplayName("screenUsage.bpmn 은 record 하나를 screenUsageService.record 로 보내고 output 은 result 다")
    void recordBpmn() throws Exception {
        Document doc = parse(SERVICES.resolve("audit/screenUsage.bpmn"));
        assertThat(processId(doc)).isEqualTo("screenUsage");

        Map<String, Element> tasks = tasksByAction(doc);
        assertThat(tasks.keySet()).containsExactly("record");
        Element task = tasks.get("record");
        assertThat(task.getAttribute("camunda:class")).isEqualTo("screenUsageService");
        assertThat(property(task, "method")).isEqualTo("record");
        assertThat(property(task, "output")).isEqualTo("result");
        assertThat(property(task, "grid")).isNull();

        Method record = ScreenUsageService.class.getMethod("record", List.class);
        assertThat(record.getParameters()[0].getName()).isEqualTo("segments"); // grids.segments
        assertThat(ScreenUsageService.class.getAnnotation(Service.class).value()).isEqualTo("screenUsageService");
        assertThat(ScreenUsageService.class.isAnnotationPresent(Transactional.class)).isFalse();
    }

    static Document parse(Path path) throws Exception {
        return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(path.toFile());
    }

    static String processId(Document doc) {
        return ((Element) doc.getElementsByTagName("bpmn:process").item(0)).getAttribute("id");
    }

    /** actionGateway 에서 나가는 sequenceFlow name(action) → 대상 serviceTask. */
    static Map<String, Element> tasksByAction(Document doc) {
        Map<String, Element> tasksById = new HashMap<>();
        NodeList serviceTasks = doc.getElementsByTagName("bpmn:serviceTask");
        for (int i = 0; i < serviceTasks.getLength(); i++) {
            Element t = (Element) serviceTasks.item(i);
            tasksById.put(t.getAttribute("id"), t);
        }
        Map<String, Element> byAction = new LinkedHashMap<>();
        NodeList flows = doc.getElementsByTagName("bpmn:sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element f = (Element) flows.item(i);
            if ("actionGateway".equals(f.getAttribute("sourceRef"))) {
                byAction.put(f.getAttribute("name"), tasksById.get(f.getAttribute("targetRef")));
            }
        }
        return byAction;
    }

    static String property(Element task, String name) {
        NodeList props = task.getElementsByTagName("camunda:property");
        for (int i = 0; i < props.getLength(); i++) {
            Element p = (Element) props.item(i);
            if (name.equals(p.getAttribute("name"))) {
                return p.getAttribute("value");
            }
        }
        return null;
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.security.endpoint.EndpointPermissionFilterAuthOnlyTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: FAIL
- 통과 케이스 3건은 `expected: 200 but was: 403` 으로 실패한다.
- `recordBpmn` 은 `java.io.FileNotFoundException ... services/audit/screenUsage.bpmn` 으로 실패한다.

- [ ] **Step 3: AUTH_ONLY prefix 추가**

`EndpointPermissionFilter.java` 의 목록 마지막 원소를 아래처럼 바꾼다.

old:
```java
            "noticeboard/search"        // 포털 홈 공지 목록(mls) — 서비스가 현재 사용자 역할로 게시 대상을 거른다 (2026-10-02)
    );
```
new:
```java
            "noticeboard/search",       // 포털 홈 공지 목록(mls) — 서비스가 현재 사용자 역할로 게시 대상을 거른다 (2026-10-02)
            "screenusage/record"        // 포털 화면 사용 구간 기록 — 로그인 사용자 전원, 사용자·부서는 서버가 인증 정보로 채운다 (2026-10-02)
    );
```

- [ ] **Step 4: BPMN 생성 (bpmn-tool)**

워크트리 루트에서 실행한다.

```bash
npx -y @cothe/bpmn-tool@1.3.0 create > src/backend/mcm/api/src/main/resources/services/audit/screenUsage.bpmn <<'EOF'
{
  "definitions": { "id": "Definitions_screenUsage", "targetNamespace": "http://bpmn.io/schema/bpmn" },
  "process": { "id": "screenUsage", "name": "화면 사용 기록 서비스", "isExecutable": true },
  "nodes": [
    { "id": "start", "type": "bpmn:StartEvent", "x": 152, "y": 192 },
    { "id": "actionGateway", "type": "bpmn:ExclusiveGateway", "x": 245, "y": 185,
      "camunda": { "properties": [{ "name": "input", "value": "action" }] } },
    { "id": "recordTask", "type": "bpmn:ServiceTask", "name": "화면 사용 구간 기록", "x": 370, "y": 170,
      "camunda": { "class": "screenUsageService",
                   "properties": [{ "name": "method", "value": "record" }, { "name": "output", "value": "result" }] } },
    { "id": "endRecord", "type": "bpmn:EndEvent", "x": 542, "y": 192 }
  ],
  "flows": [
    { "id": "flow_to_gw", "source": "start", "target": "actionGateway" },
    { "id": "flow_record", "name": "record", "source": "actionGateway", "target": "recordTask" },
    { "id": "flow_record_end", "source": "recordTask", "target": "endRecord" }
  ]
}
EOF
npx -y @cothe/bpmn-tool@1.3.0 validate src/backend/mcm/api/src/main/resources/services/audit/screenUsage.bpmn
```
Expected: `"유효": true`, `"오류": 0`. 이 스펙은 계획 작성 중 같은 도구로 생성·검증해 오류 0 을 확인했다.

- [ ] **Step 5: 통과 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.security.endpoint.EndpointPermissionFilterAuthOnlyTest --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest --tests com.dongkuk.dmes.mcm.security.endpoint.PermKeyTest`
Expected: PASS (6 + 1 + 기존 PermKeyTest)

- [ ] **Step 6: 계약 검사와 커밋**

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`. 진입점 bean 이 하나 늘어 `screenUsageService` 가 해석된다. Map 반환은 기존처럼 INFO 6-D-2 로만 집계된다(C3 가 `data.result` 를 계약으로 둔다).

```bash
/usr/bin/git add src/backend/mcm/api/src/main/resources/services/audit/screenUsage.bpmn src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilter.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilterAuthOnlyTest.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/ScreenUsageOasisContractTest.java
/usr/bin/git commit -m "feat(mcm): 화면 사용 기록 BPMN 을 추가하고 로그인 사용자 전원이 호출하도록 AUTH_ONLY 로 연다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 일별 집계·보관 스케줄러

**Files:**
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageAggregator.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageDayWriter.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollup.java`
- Modify: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/ScreenUsageJpaTestConfig.java` (`ScreenUsageDayWriter` 빈 추가)
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageAggregatorTest.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollupJpaTest.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollupScheduleTest.java`

**Interfaces:**
- Consumes (Task 1): `findStartedBetween`, `findMinStartedAt`, `deleteStartedBefore`, `findMaxUsageDt`, `deleteByUsageDt`, `ScreenUsageDay.of/accumulate`
- Consumes (Task 2): `ScreenUsageDates.ZONE/format/usageDt/parseDt`
- Produces:
  - `final class ScreenUsageAggregator` (패키지 전용):
    - `static final String NO_DEPT = "-"`
    - `static List<ScreenUsageDay> sumByDayKey(List<ScreenUsageLog> logs)`
    - `static String normalizeDept(String deptCd)`
  - `@Component ScreenUsageDayWriter` — `@Transactional public void replaceDay(String usageDt, List<ScreenUsageDay> rows)`
  - `@Component ScreenUsageRollup`:
    - `public Result rollup()`
    - `@Scheduled(cron = "0 0 2 * * *", zone = "Asia/Seoul") public void scheduledRollup()`
    - `public record Result(int days, int purged)`
    - package-private 생성자 `(ScreenUsageLogRepository, ScreenUsageDayRepository, ScreenUsageDayWriter, Clock)`

- [ ] **Step 1: 실패 테스트 작성**

`ScreenUsageJpaTestConfig.java` 에 빈을 추가한다. import 에 `com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository`, `com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageDayWriter` 를 더한다.

```java
    /** 일자 단위 delete+insert 트랜잭션 — @Transactional 프록시가 걸리도록 빈으로 등록한다. */
    @Bean
    public ScreenUsageDayWriter screenUsageDayWriter(ScreenUsageDayRepository dayRepository) {
        return new ScreenUsageDayWriter(dayRepository);
    }
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageAggregatorTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class ScreenUsageAggregatorTest {

    @Test
    @DisplayName("STARTED_AT 일자·화면·사용자·부서로 묶고, OPEN 만 열람으로 세고, 부서 없음은 '-' 다")
    void sumsByDayKey() {
        List<ScreenUsageDay> days = ScreenUsageAggregator.sumByDayKey(List.of(
                log("userA", "D100", "p/a", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000),
                log("userA", "D100", "p/a", "SWITCH", LocalDateTime.of(2026, 10, 2, 10, 0), 2_000),
                log("userA", "D100", "p/a", "RESUME", LocalDateTime.of(2026, 10, 2, 10, 15), 3_000),
                log("userA", null, "p/a", "OPEN", LocalDateTime.of(2026, 10, 2, 11, 0), 4_000),
                log("userA", "D100", "p/a", "OPEN", LocalDateTime.of(2026, 10, 1, 23, 50), 1_200_000)));

        assertThat(days)
                .extracting(ScreenUsageDay::getUsageDt, ScreenUsageDay::getDeptCd,
                        ScreenUsageDay::getOpenCnt, ScreenUsageDay::getSegCnt, ScreenUsageDay::getDurationMs)
                .containsExactlyInAnyOrder(
                        tuple("20261002", "D100", 1, 3, 6_000L),
                        tuple("20261002", "-", 1, 1, 4_000L),
                        tuple("20261001", "D100", 1, 1, 1_200_000L));
    }
}
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollupJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;

/** 집계 멱등성·자정 걸침·늦게 도착한 구간·보관 삭제 경계 (Review Focus 4). */
@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
class ScreenUsageRollupJpaTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String PAGE = "csa/commUserMng";

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;
    @Autowired ScreenUsageDayWriter dayWriter;

    @BeforeEach
    void clean() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
    }

    private ScreenUsageRollup rollupAt(LocalDateTime seoulTime) {
        return new ScreenUsageRollup(logRepository, dayRepository, dayWriter,
                Clock.fixed(seoulTime.atZone(SEOUL).toInstant(), SEOUL));
    }

    private ScreenUsageDay dayRow(String usageDt, String userId, String deptCd) {
        return dayRepository.findById(new ScreenUsageDayId(usageDt, PAGE, userId, deptCd)).orElse(null);
    }

    private List<String> snapshot() {
        return dayRepository.findAll().stream()
                .map(d -> String.join("|", d.getUsageDt(), d.getPageId(), d.getUserId(), d.getDeptCd(),
                        String.valueOf(d.getOpenCnt()), String.valueOf(d.getSegCnt()), String.valueOf(d.getDurationMs())))
                .sorted()
                .toList();
    }

    @Test
    @DisplayName("같은 시각에 두 번 돌려도 집계 결과가 같다 (일자 단위 delete+insert 멱등)")
    void idempotent() {
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 1, 10, 0), 60_000),
                log("userA", "D100", PAGE, "SWITCH", LocalDateTime.of(2026, 10, 2, 10, 0), 30_000),
                log("userB", "D200", PAGE, "OPEN", LocalDateTime.of(2026, 10, 2, 11, 0), 10_000)));
        ScreenUsageRollup rollup = rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0));

        ScreenUsageRollup.Result first = rollup.rollup();
        List<String> afterFirst = snapshot();
        rollup.rollup();

        assertThat(first.days()).isEqualTo(2); // 원본 최소 일자(10-01) ~ 어제(10-02)
        assertThat(afterFirst).hasSize(3);
        assertThat(snapshot()).isEqualTo(afterFirst);
    }

    @Test
    @DisplayName("자정을 걸친 구간은 시작 일자에 전부 귀속하고, 오늘 구간은 집계하지 않는다")
    void midnightCrossing() {
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 1, 23, 50), 1_200_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 3, 1, 0), 5_000)));

        rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();

        ScreenUsageDay oct1 = dayRow("20261001", "userA", "D100");
        assertThat(oct1.getDurationMs()).isEqualTo(1_200_000L);
        assertThat(oct1.getOpenCnt()).isEqualTo(1);
        assertThat(dayRow("20261002", "userA", "D100")).isNull();
        assertThat(dayRow("20261003", "userA", "D100")).isNull();
    }

    @Test
    @DisplayName("집계 뒤 도착한 전날 구간은 다음 집계(최대 일자-2일 재계산)에 반영되고, 창 밖 지연분은 반영되지 않는다")
    void lateArrival() {
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 1, 10, 0), 1_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 2, 10, 0), 1_000)));
        rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();
        assertThat(dayRepository.findMaxUsageDt()).isEqualTo("20261002");
        assertThat(dayRow("20261001", "userA", "D100").getOpenCnt()).isEqualTo(1);

        // 큐 재전송으로 10-03 낮에 늦게 도착: 10-01 구간(창 안), 09-29 구간(창 밖)
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 1, 11, 0), 2_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 9, 29, 11, 0), 2_000)));
        rollupAt(LocalDateTime.of(2026, 10, 4, 2, 0)).rollup(); // 재계산 09-30 ~ 10-03

        ScreenUsageDay oct1 = dayRow("20261001", "userA", "D100");
        assertThat(oct1.getOpenCnt()).isEqualTo(2);
        assertThat(oct1.getDurationMs()).isEqualTo(3_000L);
        assertThat(dayRow("20260929", "userA", "D100")).isNull();
    }

    @Test
    @DisplayName("365일 지난 원본만 지우고(오늘-365일 0시 미만), 지운 일자는 먼저 집계돼 있다")
    void retentionBoundary() {
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2025, 10, 2, 23, 59, 59), 1_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2025, 10, 3, 0, 0, 0), 1_000)));

        ScreenUsageRollup.Result result = rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();

        assertThat(result.purged()).isEqualTo(1);
        assertThat(logRepository.findAll()).extracting(l -> l.getStartedAt())
                .containsExactly(LocalDateTime.of(2025, 10, 3, 0, 0, 0));
        assertThat(dayRow("20251002", "userA", "D100").getOpenCnt()).isEqualTo(1);
        assertThat(dayRow("20251003", "userA", "D100").getOpenCnt()).isEqualTo(1);
    }

    @Test
    @DisplayName("원본도 집계도 없으면 아무것도 하지 않는다")
    void empty() {
        ScreenUsageRollup.Result result = rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();

        assertThat(result.days()).isZero();
        assertThat(result.purged()).isZero();
    }
}
```

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollupScheduleTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ScreenUsageRollupScheduleTest {

    @Test
    @DisplayName("매일 02:00 Asia/Seoul 에 돈다")
    void cron() throws Exception {
        Scheduled scheduled = ScreenUsageRollup.class.getMethod("scheduledRollup").getAnnotation(Scheduled.class);

        assertThat(scheduled.cron()).isEqualTo("0 0 2 * * *");
        assertThat(scheduled.zone()).isEqualTo("Asia/Seoul");
    }

    @Test
    @DisplayName("예외는 RevokedTokenPurger 처럼 잡아서 로그만 남긴다")
    void swallowsFailure() {
        ScreenUsageDayRepository dayRepository = mock(ScreenUsageDayRepository.class);
        when(dayRepository.findMaxUsageDt()).thenThrow(new IllegalStateException("db down"));
        ScreenUsageRollup rollup = new ScreenUsageRollup(mock(ScreenUsageLogRepository.class), dayRepository,
                mock(ScreenUsageDayWriter.class), Clock.fixed(Instant.parse("2026-10-02T17:00:00Z"), ZoneId.of("Asia/Seoul")));

        assertThatCode(rollup::scheduledRollup).doesNotThrowAnyException();
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageAggregatorTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageRollupJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageRollupScheduleTest`
Expected: FAIL — `cannot find symbol: class ScreenUsageDayWriter`, `ScreenUsageAggregator`, `ScreenUsageRollup`

- [ ] **Step 3: 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageAggregator.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 원본 구간 → 일별 집계 키 (USAGE_DT, PAGE_ID, USER_ID, DEPT_CD) 합산. 롤업(일자 확정)과 통계(미집계 일자 원본 합산)가
 * 같은 규칙을 쓰도록 한 곳에 둔다. 자정을 걸친 구간은 STARTED_AT 일자에 귀속, 부서 없음은 '-'.
 */
final class ScreenUsageAggregator {

    static final String NO_DEPT = "-";

    private ScreenUsageAggregator() {}

    static List<ScreenUsageDay> sumByDayKey(List<ScreenUsageLog> logs) {
        Map<ScreenUsageDayId, ScreenUsageDay> acc = new LinkedHashMap<>();
        for (ScreenUsageLog l : logs) {
            ScreenUsageDayId key = new ScreenUsageDayId(
                    ScreenUsageDates.usageDt(l.getStartedAt()), l.getPageId(), l.getUserId(), normalizeDept(l.getDeptCd()));
            acc.computeIfAbsent(key, ScreenUsageDay::of)
                    .accumulate("OPEN".equals(l.getStartKind()), l.getDurationMs());
        }
        return new ArrayList<>(acc.values());
    }

    static String normalizeDept(String deptCd) {
        return deptCd == null || deptCd.isBlank() ? NO_DEPT : deptCd;
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageDayWriter.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 일자 단위 집계 교체 — 그 일자 행 삭제 후 삽입을 한 트랜잭션으로 묶는다. OASIS 진입점이 아니라 @Transactional 을
 * 써도 된다(6-B-1 은 camunda:class 빈만 대상). 롤업이 자기 호출이 아닌 이 빈을 거쳐야 프록시가 걸린다.
 */
@Component
public class ScreenUsageDayWriter {

    private final ScreenUsageDayRepository dayRepository;

    public ScreenUsageDayWriter(ScreenUsageDayRepository dayRepository) {
        this.dayRepository = dayRepository;
    }

    @Transactional
    public void replaceDay(String usageDt, List<ScreenUsageDay> rows) {
        dayRepository.deleteByUsageDt(usageDt);
        dayRepository.saveAll(rows);
    }
}
```

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollup.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 화면 사용 일별 집계·보관 스케줄러 (설계 4.4). 매일 02:00 Asia/Seoul.
 *
 * <ol>
 *   <li>범위: 집계 테이블 최대 USAGE_DT 의 2일 전 ~ 어제 (집계가 비면 원본 최소 일자부터). 늦게 도착한 구간 반영용.</li>
 *   <li>일자마다 원본을 읽어 Java 에서 키별 합산 → 그 일자 삭제 → 삽입 ({@link ScreenUsageDayWriter}). 일자 단위 멱등이라
 *       서버 여러 대가 돌아도 결과가 같다(ShedLock 없음).</li>
 *   <li>집계가 끝난 뒤 STARTED_AT &lt; 오늘-365일 0시 원본 삭제. 위 루프가 어제까지 모두 집계했으므로 삭제 대상 일자는
 *       전부 집계된 일자다. 루프가 실패하면 예외로 빠져 삭제하지 않는다.</li>
 * </ol>
 * 날짜 계산은 Java 에서 하고 SQL 에는 범위 파라미터만 넘긴다.
 */
@Component
public class ScreenUsageRollup {

    private static final Logger log = LoggerFactory.getLogger(ScreenUsageRollup.class);

    static final int RECALC_DAYS = 2;
    static final int RETENTION_DAYS = 365;

    private final ScreenUsageLogRepository logRepository;
    private final ScreenUsageDayRepository dayRepository;
    private final ScreenUsageDayWriter dayWriter;
    private final Clock clock;

    @Autowired
    public ScreenUsageRollup(ScreenUsageLogRepository logRepository,
                             ScreenUsageDayRepository dayRepository,
                             ScreenUsageDayWriter dayWriter) {
        this(logRepository, dayRepository, dayWriter, Clock.system(ScreenUsageDates.ZONE));
    }

    ScreenUsageRollup(ScreenUsageLogRepository logRepository,
                      ScreenUsageDayRepository dayRepository,
                      ScreenUsageDayWriter dayWriter,
                      Clock clock) {
        this.logRepository = logRepository;
        this.dayRepository = dayRepository;
        this.dayWriter = dayWriter;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 2 * * *", zone = "Asia/Seoul")
    public void scheduledRollup() {
        try {
            Result result = rollup();
            log.info("ScreenUsageRollup: {} 일 집계, 원본 {} 건 보관 삭제", result.days(), result.purged());
        } catch (Exception e) {
            log.warn("ScreenUsageRollup 실패 (swallow): {}", e.getMessage());
        }
    }

    public Result rollup() {
        LocalDate today = LocalDate.now(clock);
        LocalDate yesterday = today.minusDays(1);
        LocalDate from = startDate();
        if (from == null) {
            return new Result(0, 0);
        }

        int days = 0;
        for (LocalDate d = from; !d.isAfter(yesterday); d = d.plusDays(1)) {
            List<ScreenUsageLog> logs = logRepository.findStartedBetween(d.atStartOfDay(), d.plusDays(1).atStartOfDay());
            dayWriter.replaceDay(ScreenUsageDates.format(d), ScreenUsageAggregator.sumByDayKey(logs));
            days++;
        }

        // 집계 완료 구간 = 어제까지. 보관 기준(오늘-365일)은 늘 그보다 앞이므로 집계된 일자만 지운다.
        LocalDate purgeBefore = today.minusDays(RETENTION_DAYS);
        if (purgeBefore.isAfter(yesterday.plusDays(1))) {
            purgeBefore = yesterday.plusDays(1);
        }
        int purged = logRepository.deleteStartedBefore(purgeBefore.atStartOfDay());
        return new Result(days, purged);
    }

    private LocalDate startDate() {
        String maxDt = dayRepository.findMaxUsageDt();
        if (maxDt != null) {
            return ScreenUsageDates.parseDt(maxDt).minusDays(RECALC_DAYS);
        }
        LocalDateTime min = logRepository.findMinStartedAt();
        return min == null ? null : min.toLocalDate();
    }

    public record Result(int days, int purged) {}
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageAggregatorTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageRollupJpaTest --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageRollupScheduleTest`
Expected: PASS (1 + 5 + 2). `retentionBoundary` 는 약 366일을 돌지만 H2 메모리라 수 초 안에 끝난다.

- [ ] **Step 5: 계약 검사와 커밋**

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`

```bash
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageAggregator.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageDayWriter.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollup.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/support/ScreenUsageJpaTestConfig.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageAggregatorTest.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollupJpaTest.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageRollupScheduleTest.java
/usr/bin/git commit -m "feat(mcm-core): 화면 사용 구간을 매일 02시 일별 집계하고 1년 지난 원본을 지운다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 메뉴 카탈로그 (pageId → 메뉴명·경로)

**Files:**
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenMenuCatalog.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenMenuCatalogTest.java`

**Interfaces:**
- Consumes (기존):
  - `SecMenuRepository.findAll() : List<SecMenu>` (`getParentMenuId/getObjectId/getMenuNm/getMenuViewYn/getUseTp`)
  - `SecMenuNativeRepository.searchMenuFld() : List<Map<String,Object>>` (키 `MENU_ID`, `MENU_NM`, `PARENT_MENU_ID`)
- Produces: `@Component ScreenMenuCatalog`
  - `public Map<String, MenuInfo> load()`
  - `public record MenuInfo(String pageId, String menuNm, String menuPath, boolean viewable)`
  - `static String folderPath(String folderId, Map<String, String[]> folders)`

- [ ] **Step 1: 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenMenuCatalogTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ScreenMenuCatalogTest {

    @Mock SecMenuRepository secMenuRepository;
    @Mock SecMenuNativeRepository secMenuNativeRepository;
    @InjectMocks ScreenMenuCatalog catalog;

    private static SecMenu menu(String menuId, String parent, String objectId, String nm, String viewYn, String useTp) {
        SecMenu m = new SecMenu();
        m.setMenuId(menuId);
        m.setParentMenuId(parent);
        m.setObjectId(objectId);
        m.setMenuNm(nm);
        m.setMenuViewYn(viewYn);
        m.setUseTp(useTp);
        return m;
    }

    private static Map<String, Object> folder(String id, String nm, String parent) {
        Map<String, Object> m = new HashMap<>();
        m.put("MENU_ID", id);
        m.put("MENU_NM", nm);
        m.put("PARENT_MENU_ID", parent);
        return m;
    }

    @Test
    @DisplayName("pageId = PARENT_MENU_ID/OBJECT_ID, 경로는 폴더 이름 사슬, 표시 여부는 MENU_VIEW_YN·USE_TP 가 모두 Y")
    void buildsCatalog() {
        when(secMenuNativeRepository.searchMenuFld()).thenReturn(List.of(
                folder("mcm", "공통관리", null), folder("csa", "시스템관리", "mcm")));
        when(secMenuRepository.findAll()).thenReturn(List.of(
                menu("commUserMng", "csa", "commUserMng", "사용자 관리", "Y", "Y"),
                menu("hidden", "csa", "hiddenScreen", "숨김 화면", "N", "Y"),
                menu("stopped", "csa", "stoppedScreen", "중지 화면", "Y", "N"),
                menu("noObj", "csa", null, "객체 없음", "Y", "Y")));

        Map<String, MenuInfo> menus = catalog.load();

        assertThat(menus).containsOnlyKeys("csa/commUserMng", "csa/hiddenScreen", "csa/stoppedScreen");
        assertThat(menus.get("csa/commUserMng"))
                .isEqualTo(new MenuInfo("csa/commUserMng", "사용자 관리", "공통관리 > 시스템관리", true));
        assertThat(menus.get("csa/hiddenScreen").viewable()).isFalse();
        assertThat(menus.get("csa/stoppedScreen").viewable()).isFalse();
    }

    @Test
    @DisplayName("같은 pageId 가 둘이면 표시되는 메뉴를 고른다")
    void prefersViewableDuplicate() {
        when(secMenuNativeRepository.searchMenuFld()).thenReturn(List.of(folder("csa", "시스템관리", null)));
        when(secMenuRepository.findAll()).thenReturn(List.of(
                menu("old", "csa", "commUserMng", "옛 메뉴", "N", "Y"),
                menu("new", "csa", "commUserMng", "사용자 관리", "Y", "Y")));

        assertThat(catalog.load().get("csa/commUserMng").menuNm()).isEqualTo("사용자 관리");
    }

    @Test
    @DisplayName("폴더가 순환해도 멈추고, 알 수 없는 폴더면 경로는 null")
    void folderPathGuards() {
        Map<String, String[]> folders = new HashMap<>();
        folders.put("a", new String[]{"폴더A", "b"});
        folders.put("b", new String[]{"폴더B", "a"});

        assertThat(ScreenMenuCatalog.folderPath("a", folders)).isEqualTo("폴더B > 폴더A");
        assertThat(ScreenMenuCatalog.folderPath("zzz", folders)).isNull();
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalogTest`
Expected: FAIL — `cannot find symbol: class ScreenMenuCatalog`

- [ ] **Step 3: 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenMenuCatalog.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 통계용 메뉴 카탈로그 — pageId({@code PARENT_MENU_ID/OBJECT_ID}) → 메뉴명·메뉴 경로·표시 여부.
 *
 * <p>메뉴 경로는 새 계층 SQL 을 쓰지 않고 기존 {@link SecMenuNativeRepository#searchMenuFld()}(SQLite/MSSQL 방언 분기 CTE)
 * 결과의 PARENT_MENU_ID 사슬을 Java 에서 잇는다. 미사용 판정 대상(viewable)은 MENU_VIEW_YN='Y' 이고 USE_TP='Y' 인 화면.
 */
@Component
public class ScreenMenuCatalog {

    public record MenuInfo(String pageId, String menuNm, String menuPath, boolean viewable) {}

    private final SecMenuRepository secMenuRepository;
    private final SecMenuNativeRepository secMenuNativeRepository;

    public ScreenMenuCatalog(SecMenuRepository secMenuRepository, SecMenuNativeRepository secMenuNativeRepository) {
        this.secMenuRepository = secMenuRepository;
        this.secMenuNativeRepository = secMenuNativeRepository;
    }

    public Map<String, MenuInfo> load() {
        Map<String, String[]> folders = new HashMap<>(); // MENU_ID → {MENU_NM, PARENT_MENU_ID}
        for (Map<String, Object> f : secMenuNativeRepository.searchMenuFld()) {
            String id = str(f.get("MENU_ID"));
            if (id != null) {
                folders.put(id, new String[]{str(f.get("MENU_NM")), str(f.get("PARENT_MENU_ID"))});
            }
        }
        Map<String, MenuInfo> out = new LinkedHashMap<>();
        for (SecMenu m : secMenuRepository.findAll()) {
            if (isBlank(m.getParentMenuId()) || isBlank(m.getObjectId())) {
                continue;
            }
            String pageId = m.getParentMenuId() + "/" + m.getObjectId();
            boolean viewable = "Y".equals(m.getMenuViewYn()) && "Y".equals(m.getUseTp());
            MenuInfo info = new MenuInfo(pageId, m.getMenuNm(), folderPath(m.getParentMenuId(), folders), viewable);
            out.merge(pageId, info, (a, b) -> a.viewable() ? a : b);
        }
        return out;
    }

    /** 폴더 ID 에서 루트까지 이름을 이어 "루트 > … > 폴더". 순환은 끊고, 알 수 없는 폴더면 null. */
    static String folderPath(String folderId, Map<String, String[]> folders) {
        Deque<String> names = new ArrayDeque<>();
        Set<String> seen = new HashSet<>();
        String cur = folderId;
        while (cur != null && seen.add(cur)) {
            String[] f = folders.get(cur);
            if (f == null) {
                break;
            }
            names.addFirst(f[0] == null ? cur : f[0]);
            cur = f[1];
        }
        return names.isEmpty() ? null : String.join(" > ", names);
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalogTest`
Expected: PASS (3 tests)

- [ ] **Step 5: 계약 검사와 커밋**

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenMenuCatalog.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenMenuCatalogTest.java
/usr/bin/git commit -m "feat(mcm-core): 화면 사용 통계용 메뉴명·메뉴 경로 카탈로그를 추가한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Expected: 계약 검사 `ERROR 0`

---

### Task 6: 통계 조회 서비스 `screenUsageStatService` (action 6개)

**Files:**
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/dto/ScreenUsageStatRequest.java`
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatService.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatServiceJpaTest.java`

**Interfaces:**
- Consumes (Task 1):
  - `sumByPageUserDept`, `sumByDay`, `findMaxUsageDt`, `findLastUsedDtByPage`, `findStartedBetween`, `findMinStartedAt`, `findHistory`
  - `UsageSum`, `DailySum`, `PageLastUsed`
- Consumes (Task 2·4·5):
  - `ScreenUsageDates`
  - `ScreenUsageAggregator.sumByDayKey/normalizeDept/NO_DEPT`
  - `ScreenUsageRollup`(테스트 데이터 집계용)
  - `ScreenMenuCatalog.load()`, `MenuInfo`
- Consumes (기존):
  - `SecUserRepository.findAllById`, `DeptInfoRepository.findAllById`
  - `BusinessException(ErrorCode, String)`
- Produces (C4):
  - `ScreenUsageStatRequest` — getter/setter `fromDt, toDt, deptCd, userId, pageId : String`, `unusedDays : Integer`
  - `@Service("screenUsageStatService") ScreenUsageStatService`:
    - `Map<String,Object> overview(ScreenUsageStatRequest request)`
    - `List<Map<String,Object>> byScreen(ScreenUsageStatRequest request)`
    - `List<Map<String,Object>> byDept(ScreenUsageStatRequest request)`
    - `List<Map<String,Object>> byUser(ScreenUsageStatRequest request)`
    - `List<Map<String,Object>> unused(ScreenUsageStatRequest request)`
    - `List<Map<String,Object>> history(ScreenUsageStatRequest request)`
  - 응답 필드·형식은 C4 표 그대로다. 건수·시간은 `Long`, 일자는 `yyyyMMdd`, 시각은 `yyyy-MM-dd HH:mm:ss` 다.

- [ ] **Step 1: 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatServiceJpaTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.tuple;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 통계 6종 — 오늘분 원본 합산, 미사용 판정, 메뉴 없음·부서 없음 표시(Review Focus 5), history 31일. */
@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
class ScreenUsageStatServiceJpaTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    /** 오늘 = 2026-10-03, 지금 10:00 */
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 10, 0);
    private static final String USER = "csa/commUserMng";
    private static final String MENU = "csa/commMenuMng";
    private static final String ROLE = "csa/commRoleMng";
    private static final String PERM = "csa/commPermMng";
    private static final String HIDDEN = "csa/hiddenScreen";

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;
    @Autowired ScreenUsageDayWriter dayWriter;

    private final ScreenMenuCatalog menuCatalog = mock(ScreenMenuCatalog.class);
    private final SecUserRepository secUserRepository = mock(SecUserRepository.class);
    private final DeptInfoRepository deptInfoRepository = mock(DeptInfoRepository.class);
    private ScreenUsageStatService service;

    @BeforeEach
    void setUp() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
        Map<String, MenuInfo> menus = new LinkedHashMap<>();
        menus.put(USER, new MenuInfo(USER, "사용자 관리", "공통관리 > 시스템관리", true));
        menus.put(MENU, new MenuInfo(MENU, "메뉴 관리", "공통관리 > 시스템관리", true));
        menus.put(ROLE, new MenuInfo(ROLE, "역할 관리", "공통관리 > 시스템관리", true));
        menus.put(HIDDEN, new MenuInfo(HIDDEN, "숨김 화면", "공통관리 > 시스템관리", false));
        when(menuCatalog.load()).thenReturn(menus);
        when(secUserRepository.findAllById(any())).thenReturn(List.of(user("userA", "김철수"), user("userB", "이영희")));
        when(deptInfoRepository.findAllById(any())).thenReturn(List.of(dept("D100", "생산관리팀")));
        service = new ScreenUsageStatService(dayRepository, logRepository, menuCatalog, secUserRepository,
                deptInfoRepository, Clock.fixed(NOW.atZone(SEOUL).toInstant(), SEOUL));
    }

    private static SecUser user(String id, String nm) {
        SecUser u = new SecUser();
        u.setUserId(id);
        u.setUserNm(nm);
        return u;
    }

    private static DeptInfo dept(String cd, String nm) {
        DeptInfo d = new DeptInfo();
        d.setDeptCd(cd);
        d.setDeptNm(nm);
        return d;
    }

    private static ScreenUsageStatRequest req(String fromDt, String toDt) {
        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        r.setFromDt(fromDt);
        r.setToDt(toDt);
        return r;
    }

    private ScreenUsageLog save(String userId, String deptCd, String pageId, String kind, LocalDateTime at, long ms) {
        return logRepository.save(log(userId, deptCd, pageId, kind, at, ms));
    }

    /** 2026-10-03 02:00 집계 → 10-02 까지 확정. */
    private void rollupAtTwoAm() {
        new ScreenUsageRollup(logRepository, dayRepository, dayWriter,
                Clock.fixed(LocalDateTime.of(2026, 10, 3, 2, 0).atZone(SEOUL).toInstant(), SEOUL)).rollup();
    }

    @Test
    @DisplayName("오늘분은 원본에서 합산해 집계분에 더하고, 집계된 날은 이중으로 세지 않는다")
    void todayFromRawPlusAggregated() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 10, 0), 120_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", USER, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);

        List<Map<String, Object>> both = service.byScreen(req("20261002", "20261003"));
        assertThat(both).singleElement().satisfies(row -> {
            assertThat(row).containsEntry("pageId", USER)
                    .containsEntry("menuNm", "사용자 관리")
                    .containsEntry("menuPath", "공통관리 > 시스템관리")
                    .containsEntry("openCnt", 3L)
                    .containsEntry("userCnt", 2L)
                    .containsEntry("durationMs", 240_000L)
                    .containsEntry("avgDurationMs", 80_000L)
                    .containsEntry("lastUsedDt", "20261003");
        });
        assertThat(service.byScreen(req("20261002", "20261002")).get(0))
                .containsEntry("openCnt", 2L).containsEntry("durationMs", 180_000L);
        assertThat(service.byScreen(req("20261003", "20261003")).get(0))
                .containsEntry("openCnt", 1L).containsEntry("durationMs", 60_000L);
    }

    @Test
    @DisplayName("02시 집계 전에도 집계되지 않은 어제분은 원본에서 더해져 빠지지 않는다")
    void beforeRollupYesterdayStillCounted() {
        dayRepository.save(day("20261001", USER, "userA", "D100", 1, 1, 10_000)); // 10-01 까지만 집계됨
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 15, 0), 20_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 0, 30), 5_000);

        assertThat(service.byScreen(req("20261001", "20261003")).get(0))
                .containsEntry("openCnt", 3L)
                .containsEntry("durationMs", 35_000L)
                .containsEntry("userCnt", 2L)
                .containsEntry("lastUsedDt", "20261003");
    }

    @Test
    @DisplayName("개요 — 합계·이용자 수(집계·원본 중복 제거)·일별 추이(0 채움)·상위 화면·미사용 수")
    void overview() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", MENU, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 30_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 10_000);

        Map<String, Object> result = service.overview(req("20261001", "20261003"));

        assertThat(result).containsEntry("totalOpenCnt", 4L)
                .containsEntry("userCnt", 2L)
                .containsEntry("totalDurationMs", 130_000L)
                .containsEntry("unusedScreenCnt", 1L); // ROLE (HIDDEN 은 표시 안 함)
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> daily = (List<Map<String, Object>>) result.get("daily");
        assertThat(daily).extracting(r -> r.get("usageDt"), r -> r.get("openCnt"), r -> r.get("userCnt"), r -> r.get("durationMs"))
                .containsExactly(
                        tuple("20261001", 0L, 0L, 0L),
                        tuple("20261002", 2L, 2L, 90_000L),
                        tuple("20261003", 2L, 1L, 40_000L));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> top = (List<Map<String, Object>>) result.get("topScreens");
        assertThat(top).extracting(r -> r.get("pageId"), r -> r.get("menuNm"), r -> r.get("openCnt"), r -> r.get("durationMs"))
                .containsExactly(tuple(USER, "사용자 관리", 2L, 90_000L), tuple(MENU, "메뉴 관리", 2L, 40_000L));
    }

    @Test
    @DisplayName("부서별 — 부서명·이용자 수·최다 이용 화면, 부서 없음은 '-'/(부서 없음)")
    void byDept() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 60_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 10_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 20), 10_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 25), 10_000);
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);
        save("userC", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 40), 5_000);

        List<Map<String, Object>> rows = service.byDept(req("20261003", "20261003"));

        assertThat(rows).extracting(r -> r.get("deptCd"), r -> r.get("deptNm"), r -> r.get("userCnt"),
                        r -> r.get("openCnt"), r -> r.get("durationMs"), r -> r.get("topPageId"), r -> r.get("topMenuNm"))
                .containsExactly(
                        tuple("D100", "생산관리팀", 2L, 5L, 120_000L, MENU, "메뉴 관리"),
                        tuple("-", "(부서 없음)", 1L, 1L, 5_000L, USER, "사용자 관리"));
    }

    @Test
    @DisplayName("사용자별 — 이름·부서·열람·시간·마지막 이용일, 이름 모르는 사용자는 userNm null")
    void byUser() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 60_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 30_000);
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);
        save("userC", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 40), 5_000);

        List<Map<String, Object>> rows = service.byUser(req("20261003", "20261003"));

        assertThat(rows).extracting(r -> r.get("userId"), r -> r.get("userNm"), r -> r.get("deptCd"), r -> r.get("deptNm"),
                        r -> r.get("openCnt"), r -> r.get("durationMs"), r -> r.get("lastUsedDt"))
                .containsExactly(
                        tuple("userA", "김철수", "D100", "생산관리팀", 2L, 90_000L, "20261003"),
                        tuple("userB", "이영희", "D100", "생산관리팀", 1L, 30_000L, "20261003"),
                        tuple("userC", null, "-", "(부서 없음)", 1L, 5_000L, "20261003"));
    }

    @Test
    @DisplayName("사용자별 부서는 가장 최근 이용일의 부서다")
    void byUserLatestDept() {
        dayRepository.save(day("20261001", USER, "userA", "D100", 1, 1, 1_000));
        save("userA", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(service.byUser(req("20261001", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D200").containsEntry("openCnt", 2L));
    }

    @Test
    @DisplayName("사용자별 — 마지막 이용일에 부서가 둘이면 그날 가장 늦게 시작한 구간의 부서 (집계분·원본분 모두)")
    void byUserSameDayDeptChange() {
        // 집계분: 10-02 에 D100·D200 두 행 → 시각이 없으므로 그날 원본에서 가장 늦은 구간(15:00, D200)으로 정한다
        dayRepository.save(day("20261002", USER, "userA", "D100", 1, 1, 1_000));
        dayRepository.save(day("20261002", USER, "userA", "D200", 1, 1, 1_000));
        save("userA", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 15, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        assertThat(service.byUser(req("20261002", "20261002"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D200").containsEntry("openCnt", 2L));

        // 원본분(오늘): 저장 순서와 무관하게 시작 시각이 늦은 11:00(D100) 구간의 부서
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 11, 0), 1_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        assertThat(service.byUser(req("20261003", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("userId", "userB")
                        .containsEntry("deptCd", "D100").containsEntry("deptNm", "생산관리팀"));
    }

    @Test
    @DisplayName("조건은 완전 일치 — userId·pageId 앞부분 일치는 걸리지 않고, deptCd '-' 는 집계 '-'·원본 NULL 만 거른다")
    void exactMatchFilters() {
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userAB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();                                                                 // 집계 deptCd '-'
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);   // 원본 NULL
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 1_000);

        ScreenUsageStatRequest noDept = req("20261002", "20261003");
        noDept.setDeptCd("-");
        assertThat(service.byScreen(noDept).get(0)).containsEntry("openCnt", 2L).containsEntry("userCnt", 1L);
        assertThat(service.history(noDept)).hasSize(2)
                .allSatisfy(row -> assertThat(row).containsEntry("deptCd", "-"));

        ScreenUsageStatRequest userPrefix = req("20261002", "20261003");
        userPrefix.setUserId("user");
        assertThat(service.byScreen(userPrefix)).isEmpty();
        assertThat(service.history(userPrefix)).isEmpty();

        ScreenUsageStatRequest pagePrefix = req("20261002", "20261003");
        pagePrefix.setPageId("csa/commUser");
        assertThat(service.byScreen(pagePrefix)).isEmpty();
        assertThat(service.history(pagePrefix)).isEmpty();

        ScreenUsageStatRequest userA = req("20261002", "20261003");
        userA.setUserId("userA");
        assertThat(service.byScreen(userA).get(0)).containsEntry("openCnt", 3L).containsEntry("userCnt", 1L);
    }

    @Test
    @DisplayName("개요의 미사용 화면 수는 unusedDays(기본 90)를 미사용 탭과 같은 규칙으로 쓴다")
    void overviewUsesUnusedDays() {
        dayRepository.save(day("20260706", ROLE, "userA", "D100", 1, 1, 1_000)); // 90일 창 시작일(07-06) 이용
        ScreenUsageStatRequest r = req("20261003", "20261003");

        assertThat(service.overview(r)).containsEntry("unusedScreenCnt", 2L); // USER, MENU (ROLE 은 사용)
        r.setUnusedDays(89);                                                    // 창 시작 07-07 → ROLE 도 미사용
        assertThat(service.overview(r)).containsEntry("unusedScreenCnt", 3L);
        ScreenUsageStatRequest unusedTab = new ScreenUsageStatRequest();
        unusedTab.setUnusedDays(89);
        assertThat(service.unused(unusedTab)).hasSize(3);
    }

    @Test
    @DisplayName("미사용 — 오늘 포함 최근 N일 이용 기록이 없는 표시 메뉴, 창 시작일 당일 이용은 사용, 원본 이용도 반영")
    void unusedBoundary() {
        Map<String, MenuInfo> menus = new LinkedHashMap<>(menuCatalog.load());
        menus.put(PERM, new MenuInfo(PERM, "권한 관리", "공통관리 > 시스템관리", true));
        when(menuCatalog.load()).thenReturn(menus);
        // 오늘 10-03, 90일 창 시작 = 10-03 - 89일 = 2026-07-06
        dayRepository.save(day("20260706", USER, "userA", "D100", 1, 1, 1_000)); // 창 시작일 → 사용
        dayRepository.save(day("20260705", MENU, "userA", "D100", 1, 1, 1_000)); // 창 밖 → 미사용
        save("userA", "D100", PERM, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000); // 원본·SWITCH 도 이용

        ScreenUsageStatRequest r90 = new ScreenUsageStatRequest();
        r90.setUnusedDays(90);
        assertThat(service.unused(r90))
                .extracting(r -> r.get("pageId"), r -> r.get("menuNm"), r -> r.get("menuPath"), r -> r.get("lastUsedDt"))
                .containsExactly(
                        tuple(MENU, "메뉴 관리", "공통관리 > 시스템관리", "20260705"),
                        tuple(ROLE, "역할 관리", "공통관리 > 시스템관리", null));

        assertThat(service.unused(new ScreenUsageStatRequest())).hasSize(2); // 기본 90일, 기간 파라미터 불필요

        ScreenUsageStatRequest r89 = new ScreenUsageStatRequest();
        r89.setUnusedDays(89); // 창 시작 07-07 → USER 도 미사용
        assertThat(service.unused(r89)).extracting(r -> r.get("pageId")).containsExactly(MENU, ROLE, USER);
    }

    @Test
    @DisplayName("메뉴에서 지워진 화면·부서 없는 사용자 — 통계에 (메뉴 없음)·'-'·(부서 없음) 으로 보인다 (Review Focus 5)")
    void unknownMenuAndNoDept() {
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(dayRepository.findAll()).extracting(d -> d.getDeptCd()).containsExactly("-");
        assertThat(service.byScreen(req("20261002", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("menuNm", "(메뉴 없음)").containsEntry("menuPath", null)
                        .containsEntry("openCnt", 2L));
        assertThat(service.byDept(req("20261002", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("deptCd", "-").containsEntry("deptNm", "(부서 없음)")
                        .containsEntry("topMenuNm", "(메뉴 없음)"));
        assertThat(service.history(req("20261002", "20261003"))).hasSize(2).allSatisfy(row ->
                assertThat(row).containsEntry("deptCd", "-").containsEntry("deptNm", "(부서 없음)")
                        .containsEntry("menuNm", "(메뉴 없음)"));
    }

    @Test
    @DisplayName("이용 이력 — 원본 그대로 최신순, 시각 문자열, 최대 31일(toDt-fromDt)")
    void historyLimit() {
        ScreenUsageLog first = log("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0, 5), 61_000);
        first.setClientIp("10.0.0.7");
        logRepository.save(first);
        save("userB", null, MENU, "RESUME", LocalDateTime.of(2026, 10, 3, 8, 0), 1_000);

        List<Map<String, Object>> rows = service.history(req("20261002", "20261003"));

        assertThat(rows).extracting(r -> r.get("userId")).containsExactly("userB", "userA");
        assertThat(rows.get(1)).containsEntry("usageId", first.getUsageId())
                .containsEntry("userNm", "김철수")
                .containsEntry("deptCd", "D100")
                .containsEntry("deptNm", "생산관리팀")
                .containsEntry("pageId", USER)
                .containsEntry("menuNm", "사용자 관리")
                .containsEntry("startKind", "OPEN")
                .containsEntry("startedAt", "2026-10-02 09:00:05")
                .containsEntry("endedAt", "2026-10-02 09:01:06")
                .containsEntry("durationMs", 61_000L)
                .containsEntry("clientIp", "10.0.0.7");

        assertThatCode(() -> service.history(req("20260902", "20261003"))).doesNotThrowAnyException(); // 31
        BusinessException e = assertThrows(BusinessException.class, () -> service.history(req("20260901", "20261003"))); // 32
        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
    }

    @Test
    @DisplayName("부서 조건은 집계분과 원본분 모두에 적용된다")
    void deptFilter() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        ScreenUsageStatRequest r = req("20261002", "20261003");
        r.setDeptCd("D100");

        assertThat(service.byScreen(r).get(0)).containsEntry("openCnt", 2L).containsEntry("userCnt", 1L);
    }

    @Test
    @DisplayName("기간 파라미터 검증 — 누락은 REQUIRED_VALUE, 역전·형식 오류는 INVALID_VALUE")
    void validatesRange() {
        assertThat(assertThrows(BusinessException.class, () -> service.byScreen(req(null, "20261003"))).getErrorCode())
                .isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertThat(assertThrows(BusinessException.class, () -> service.byScreen(req("20261003", "20261002"))).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(assertThrows(BusinessException.class, () -> service.byScreen(req("2026-10-01", "20261003"))).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_VALUE);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceJpaTest`
Expected: FAIL — `cannot find symbol: class ScreenUsageStatRequest`, `class ScreenUsageStatService`

- [ ] **Step 3: DTO 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/dto/ScreenUsageStatRequest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.dto;

/**
 * 화면 사용 통계 공통 파라미터 (계약 C4). OASIS params → DTO 바인딩(기존 *Request 처럼 기본 생성자 + setter).
 * meta.userId 는 cactus 가 params 에 넣지 않으므로 {@code userId} 는 관리자가 고른 조회 조건이다.
 */
public class ScreenUsageStatRequest {

    /** yyyyMMdd (unused 제외 필수) */
    private String fromDt;
    /** yyyyMMdd (unused 제외 필수) */
    private String toDt;
    /** 부서 조건 — '-' 는 부서 없음 */
    private String deptCd;
    private String userId;
    private String pageId;
    /** unused 전용, 기본 90 */
    private Integer unusedDays;

    public ScreenUsageStatRequest() {}

    public String getFromDt() { return fromDt; }
    public void setFromDt(String fromDt) { this.fromDt = fromDt; }
    public String getToDt() { return toDt; }
    public void setToDt(String toDt) { this.toDt = toDt; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public Integer getUnusedDays() { return unusedDays; }
    public void setUnusedDays(Integer unusedDays) { this.unusedDays = unusedDays; }
}
```

- [ ] **Step 4: 서비스 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatService.java`

```java
package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.DailySum;
import com.dongkuk.dmes.mcm.screenusage.repository.PageLastUsed;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * 화면 사용 통계 조회 — OASIS {@code screenUsageStat} (설계 4.5, 계약 C4).
 *
 * <p>출처 분할: 집계 테이블 최대 일자(MAX USAGE_DT)까지는 {@code TB_SEC_SCREEN_USAGE_DAY} 를 JPQL GROUP BY 로,
 * 그 다음 날부터 조회 종료일까지(오늘 포함)는 원본을 같은 키로 Java 합산해 더한다. 두 구간은 겹치지 않아 이중 집계가 없고,
 * 02:00 집계 전(00:00~02:00)에도 어제분이 빠지지 않는다. 이용자 수는 두 출처를 합쳐야 하므로 Set 으로 센다.
 *
 * <p>메뉴에 없는 pageId 는 "(메뉴 없음)", 부서 없음은 deptCd "-" / deptNm "(부서 없음)".
 * {@code @Transactional} 미부착 — OASIS 진입점(6-B-1). 오류는 mcm-core 관례대로 {@link BusinessException}.
 */
@Service("screenUsageStatService")
public class ScreenUsageStatService {

    static final int DEFAULT_UNUSED_DAYS = 90;
    static final int HISTORY_MAX_DAYS = 31;
    static final int HISTORY_MAX_ROWS = 10_000;
    static final int TOP_SCREENS = 10;
    static final String NO_MENU_NM = "(메뉴 없음)";
    static final String NO_DEPT_NM = "(부서 없음)";

    private final ScreenUsageDayRepository dayRepository;
    private final ScreenUsageLogRepository logRepository;
    private final ScreenMenuCatalog menuCatalog;
    private final SecUserRepository secUserRepository;
    private final DeptInfoRepository deptInfoRepository;
    private final Clock clock;

    @Autowired
    public ScreenUsageStatService(ScreenUsageDayRepository dayRepository,
                                  ScreenUsageLogRepository logRepository,
                                  ScreenMenuCatalog menuCatalog,
                                  SecUserRepository secUserRepository,
                                  DeptInfoRepository deptInfoRepository) {
        this(dayRepository, logRepository, menuCatalog, secUserRepository, deptInfoRepository,
                Clock.system(ScreenUsageDates.ZONE));
    }

    ScreenUsageStatService(ScreenUsageDayRepository dayRepository,
                           ScreenUsageLogRepository logRepository,
                           ScreenMenuCatalog menuCatalog,
                           SecUserRepository secUserRepository,
                           DeptInfoRepository deptInfoRepository,
                           Clock clock) {
        this.dayRepository = dayRepository;
        this.logRepository = logRepository;
        this.menuCatalog = menuCatalog;
        this.secUserRepository = secUserRepository;
        this.deptInfoRepository = deptInfoRepository;
        this.clock = clock;
    }

    // ───────────────────────────────────────────── actions

    /** action=overview → data.result */
    public Map<String, Object> overview(ScreenUsageStatRequest request) {
        Range range = Range.of(request);
        Filter filter = Filter.of(request);
        List<UsageSum> sums = sums(range, filter);
        Map<String, MenuInfo> menus = menuCatalog.load();

        long openCnt = 0;
        long durationMs = 0;
        Set<String> users = new HashSet<>();
        for (UsageSum s : sums) {
            openCnt += s.openCnt();
            durationMs += s.durationMs();
            users.add(s.userId());
        }

        List<Map<String, Object>> topScreens = new ArrayList<>();
        for (Map<String, Object> screen : screenRows(sums, menus)) {
            if (topScreens.size() >= TOP_SCREENS) {
                break;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", screen.get("pageId"));
            row.put("menuNm", screen.get("menuNm"));
            row.put("openCnt", screen.get("openCnt"));
            row.put("durationMs", screen.get("durationMs"));
            topScreens.add(row);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalOpenCnt", openCnt);
        result.put("userCnt", (long) users.size());
        result.put("totalDurationMs", durationMs);
        result.put("unusedScreenCnt", (long) unusedRows(menus, unusedDays(request)).size());
        result.put("daily", daily(range, filter));
        result.put("topScreens", topScreens);
        return result;
    }

    /** action=byScreen → grids.screens */
    public List<Map<String, Object>> byScreen(ScreenUsageStatRequest request) {
        return screenRows(sums(Range.of(request), Filter.of(request)), menuCatalog.load());
    }

    /** action=byDept → grids.depts */
    public List<Map<String, Object>> byDept(ScreenUsageStatRequest request) {
        List<UsageSum> sums = sums(Range.of(request), Filter.of(request));
        Map<String, MenuInfo> menus = menuCatalog.load();
        Map<String, DeptAcc> byDept = new LinkedHashMap<>();
        for (UsageSum s : sums) {
            byDept.computeIfAbsent(s.deptCd(), k -> new DeptAcc()).add(s);
        }
        Map<String, String> deptNames = deptNames(byDept.keySet());

        List<Map<String, Object>> rows = new ArrayList<>(byDept.size());
        byDept.forEach((deptCd, acc) -> {
            String topPageId = acc.topPageId();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("deptCd", deptCd);
            row.put("deptNm", deptName(deptCd, deptNames));
            row.put("userCnt", (long) acc.users.size());
            row.put("openCnt", acc.openCnt);
            row.put("durationMs", acc.durationMs);
            row.put("topPageId", topPageId);
            row.put("topMenuNm", topPageId == null ? null : menuNm(topPageId, menus));
            rows.add(row);
        });
        rows.sort(longDesc("openCnt").thenComparing(longDesc("durationMs")).thenComparing(text("deptCd")));
        return rows;
    }

    /** action=byUser → grids.users. 사용자당 1행, 부서는 기간 안 마지막 이용 구간의 부서(C4). */
    public List<Map<String, Object>> byUser(ScreenUsageStatRequest request) {
        Filter filter = Filter.of(request);
        List<UsageSum> sums = sums(Range.of(request), filter);
        Map<String, UserAcc> byUser = new LinkedHashMap<>();
        for (UsageSum s : sums) {
            byUser.computeIfAbsent(s.userId(), k -> new UserAcc()).add(s);
        }
        Map<String, String> deptByUser = new HashMap<>();
        byUser.forEach((userId, acc) -> deptByUser.put(userId, lastSegmentDept(userId, acc, filter)));
        Map<String, String> userNames = userNames(byUser.keySet());
        Map<String, String> deptNames = deptNames(new HashSet<>(deptByUser.values()));

        List<Map<String, Object>> rows = new ArrayList<>(byUser.size());
        byUser.forEach((userId, acc) -> {
            String deptCd = deptByUser.get(userId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("userId", userId);
            row.put("userNm", userNames.get(userId));
            row.put("deptCd", deptCd);
            row.put("deptNm", deptName(deptCd, deptNames));
            row.put("openCnt", acc.openCnt);
            row.put("durationMs", acc.durationMs);
            row.put("lastUsedDt", acc.lastUsedDt);
            rows.add(row);
        });
        rows.sort(longDesc("openCnt").thenComparing(longDesc("durationMs")).thenComparing(text("userId")));
        return rows;
    }

    /** action=unused → grids.unused (기간 파라미터 무시) */
    public List<Map<String, Object>> unused(ScreenUsageStatRequest request) {
        return unusedRows(menuCatalog.load(), unusedDays(request));
    }

    /** action=history → grids.history (원본 그대로, 최대 31일, 최신순 최대 10,000행) */
    public List<Map<String, Object>> history(ScreenUsageStatRequest request) {
        Range range = Range.of(request);
        if (ChronoUnit.DAYS.between(range.from(), range.to()) > HISTORY_MAX_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "이용 이력은 한 번에 최대 " + HISTORY_MAX_DAYS + "일까지 조회할 수 있습니다.");
        }
        Filter filter = Filter.of(request);
        List<ScreenUsageLog> logs = logRepository.findHistory(
                range.from().atStartOfDay(), range.to().plusDays(1).atStartOfDay(),
                filter.userId(), filter.deptCd(), filter.pageId(), PageRequest.of(0, HISTORY_MAX_ROWS));
        Map<String, MenuInfo> menus = menuCatalog.load();
        Map<String, String> userNames = userNames(
                logs.stream().map(ScreenUsageLog::getUserId).collect(Collectors.toSet()));
        Map<String, String> deptNames = deptNames(
                logs.stream().map(l -> ScreenUsageAggregator.normalizeDept(l.getDeptCd())).collect(Collectors.toSet()));

        List<Map<String, Object>> rows = new ArrayList<>(logs.size());
        for (ScreenUsageLog l : logs) {
            String deptCd = ScreenUsageAggregator.normalizeDept(l.getDeptCd());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("usageId", l.getUsageId());
            row.put("userId", l.getUserId());
            row.put("userNm", userNames.get(l.getUserId()));
            row.put("deptCd", deptCd);
            row.put("deptNm", deptName(deptCd, deptNames));
            row.put("pageId", l.getPageId());
            row.put("menuNm", menuNm(l.getPageId(), menus));
            row.put("startKind", l.getStartKind());
            row.put("startedAt", ScreenUsageDates.timestamp(l.getStartedAt()));
            row.put("endedAt", ScreenUsageDates.timestamp(l.getEndedAt()));
            row.put("durationMs", l.getDurationMs());
            row.put("clientIp", l.getClientIp());
            rows.add(row);
        }
        return rows;
    }

    // ───────────────────────────────────────────── 합산

    /** (화면, 사용자, 부서) 합계 — 집계분 + 미집계 원본분. 같은 키가 양쪽에 있어도 상위 그룹 합산에서 더해진다. */
    private List<UsageSum> sums(Range range, Filter filter) {
        Split split = split(range);
        List<UsageSum> out = new ArrayList<>();
        if (split.hasDay()) {
            out.addAll(dayRepository.sumByPageUserDept(
                    ScreenUsageDates.format(split.dayFrom()), ScreenUsageDates.format(split.dayTo()),
                    filter.deptCd(), filter.userId(), filter.pageId()));
        }
        if (split.hasRaw()) {
            for (ScreenUsageDay d : rawDays(split.rawFrom(), split.rawTo(), filter)) {
                out.add(new UsageSum(d.getPageId(), d.getUserId(), d.getDeptCd(),
                        d.getOpenCnt().longValue(), d.getSegCnt().longValue(), d.getDurationMs(), d.getUsageDt()));
            }
        }
        return out;
    }

    private List<Map<String, Object>> daily(Range range, Filter filter) {
        Split split = split(range);
        TreeMap<String, long[]> byDt = new TreeMap<>(); // usageDt → {openCnt, userCnt, durationMs}
        if (split.hasDay()) {
            for (DailySum d : dayRepository.sumByDay(
                    ScreenUsageDates.format(split.dayFrom()), ScreenUsageDates.format(split.dayTo()),
                    filter.deptCd(), filter.userId(), filter.pageId())) {
                byDt.put(d.usageDt(), new long[]{d.openCnt(), d.userCnt(), d.durationMs()});
            }
        }
        if (split.hasRaw()) {
            Map<String, Set<String>> usersByDt = new HashMap<>();
            for (ScreenUsageDay d : rawDays(split.rawFrom(), split.rawTo(), filter)) {
                long[] v = byDt.computeIfAbsent(d.getUsageDt(), k -> new long[3]);
                v[0] += d.getOpenCnt();
                v[2] += d.getDurationMs();
                usersByDt.computeIfAbsent(d.getUsageDt(), k -> new HashSet<>()).add(d.getUserId());
            }
            usersByDt.forEach((dt, users) -> byDt.get(dt)[1] = users.size());
        }
        LocalDate today = LocalDate.now(clock);
        LocalDate last = range.to().isAfter(today) ? today : range.to();
        for (LocalDate d = range.from(); !d.isAfter(last); d = d.plusDays(1)) {
            byDt.putIfAbsent(ScreenUsageDates.format(d), new long[3]);
        }

        List<Map<String, Object>> rows = new ArrayList<>(byDt.size());
        byDt.forEach((dt, v) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("usageDt", dt);
            row.put("openCnt", v[0]);
            row.put("userCnt", v[1]);
            row.put("durationMs", v[2]);
            rows.add(row);
        });
        return rows;
    }

    private List<Map<String, Object>> screenRows(List<UsageSum> sums, Map<String, MenuInfo> menus) {
        Map<String, Acc> byPage = new LinkedHashMap<>();
        for (UsageSum s : sums) {
            byPage.computeIfAbsent(s.pageId(), k -> new Acc()).add(s);
        }
        List<Map<String, Object>> rows = new ArrayList<>(byPage.size());
        byPage.forEach((pageId, acc) -> {
            MenuInfo menu = menus.get(pageId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", pageId);
            row.put("menuNm", menuNm(pageId, menus));
            row.put("menuPath", menu != null ? menu.menuPath() : null);
            row.put("openCnt", acc.openCnt);
            row.put("userCnt", (long) acc.users.size());
            row.put("durationMs", acc.durationMs);
            row.put("avgDurationMs", acc.durationMs / Math.max(acc.openCnt, 1L)); // 열람 1회당
            row.put("lastUsedDt", acc.lastUsedDt);
            rows.add(row);
        });
        rows.sort(longDesc("openCnt").thenComparing(longDesc("durationMs")).thenComparing(text("pageId")));
        return rows;
    }

    private List<Map<String, Object>> unusedRows(Map<String, MenuInfo> menus, int unusedDays) {
        LocalDate today = LocalDate.now(clock);
        String windowStart = ScreenUsageDates.format(today.minusDays(unusedDays - 1L)); // 오늘 포함 최근 N일
        Map<String, String> lastUsed = lastUsedByPage(today);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MenuInfo menu : menus.values()) {
            if (!menu.viewable()) {
                continue;
            }
            String last = lastUsed.get(menu.pageId());
            if (last != null && last.compareTo(windowStart) >= 0) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", menu.pageId());
            row.put("menuNm", menu.menuNm());
            row.put("menuPath", menu.menuPath());
            row.put("lastUsedDt", last);
            rows.add(row);
        }
        rows.sort(text("menuPath").thenComparing(text("pageId")));
        return rows;
    }

    /** 화면별 마지막 이용일(전체 기간) — 집계분 MAX + 미집계 원본의 시작 일자. 구간 종류와 무관. */
    private Map<String, String> lastUsedByPage(LocalDate today) {
        Map<String, String> last = new HashMap<>();
        for (PageLastUsed p : dayRepository.findLastUsedDtByPage()) {
            last.put(p.pageId(), p.lastUsedDt());
        }
        String maxDt = dayRepository.findMaxUsageDt();
        LocalDate rawFrom;
        if (maxDt != null) {
            rawFrom = ScreenUsageDates.parseDt(maxDt).plusDays(1);
        } else {
            LocalDateTime min = logRepository.findMinStartedAt();
            rawFrom = min == null ? null : min.toLocalDate();
        }
        if (rawFrom != null && !rawFrom.isAfter(today)) {
            for (ScreenUsageLog l : logRepository.findStartedBetween(rawFrom.atStartOfDay(), today.plusDays(1).atStartOfDay())) {
                last.merge(l.getPageId(), ScreenUsageDates.usageDt(l.getStartedAt()),
                        (a, b) -> a.compareTo(b) >= 0 ? a : b);
            }
        }
        return last;
    }

    /**
     * 기간 안 마지막 이용 구간의 부서. 마지막 이용일의 부서가 하나면 그대로 쓴다. 둘 이상이면(그날 부서 변경)
     * 집계 테이블에는 시각이 없으므로, 그날 원본에서 같은 조건으로 가장 늦게 시작한 구간 1건을 읽어 정한다.
     */
    private String lastSegmentDept(String userId, UserAcc acc, Filter filter) {
        String first = acc.latestDepts.iterator().next();
        if (acc.latestDepts.size() == 1) {
            return first;
        }
        LocalDate day = ScreenUsageDates.parseDt(acc.lastUsedDt);
        List<ScreenUsageLog> last = logRepository.findHistory(day.atStartOfDay(), day.plusDays(1).atStartOfDay(),
                userId, filter.deptCd(), filter.pageId(), PageRequest.of(0, 1));
        return last.isEmpty() ? first : ScreenUsageAggregator.normalizeDept(last.get(0).getDeptCd());
    }

    private List<ScreenUsageDay> rawDays(LocalDate from, LocalDate to, Filter filter) {
        List<ScreenUsageLog> logs = logRepository.findStartedBetween(from.atStartOfDay(), to.plusDays(1).atStartOfDay());
        return ScreenUsageAggregator.sumByDayKey(logs).stream().filter(filter::matches).toList();
    }

    /** 조회 기간을 [집계 테이블 구간] + [원본 구간] 으로 겹치지 않게 나눈다. */
    private Split split(Range range) {
        String maxDt = dayRepository.findMaxUsageDt();
        if (maxDt == null) {
            return new Split(null, null, range.from(), range.to());
        }
        LocalDate aggregatedTo = ScreenUsageDates.parseDt(maxDt);
        LocalDate dayTo = range.to().isBefore(aggregatedTo) ? range.to() : aggregatedTo;
        LocalDate rawFrom = range.from().isAfter(aggregatedTo) ? range.from() : aggregatedTo.plusDays(1);
        boolean hasDay = !dayTo.isBefore(range.from());
        boolean hasRaw = !rawFrom.isAfter(range.to());
        return new Split(hasDay ? range.from() : null, hasDay ? dayTo : null,
                hasRaw ? rawFrom : null, hasRaw ? range.to() : null);
    }

    // ───────────────────────────────────────────── 이름

    private Map<String, String> userNames(Set<String> userIds) {
        Map<String, String> out = new HashMap<>();
        if (userIds.isEmpty()) {
            return out;
        }
        for (SecUser u : secUserRepository.findAllById(userIds)) {
            out.put(u.getUserId(), u.getUserNm());
        }
        return out;
    }

    private Map<String, String> deptNames(Set<String> deptCds) {
        Set<String> codes = deptCds.stream()
                .filter(c -> c != null && !ScreenUsageAggregator.NO_DEPT.equals(c))
                .collect(Collectors.toSet());
        Map<String, String> out = new HashMap<>();
        if (codes.isEmpty()) {
            return out;
        }
        for (DeptInfo d : deptInfoRepository.findAllById(codes)) {
            out.put(d.getDeptCd(), d.getDeptNm());
        }
        return out;
    }

    private static String deptName(String deptCd, Map<String, String> names) {
        return ScreenUsageAggregator.NO_DEPT.equals(deptCd) ? NO_DEPT_NM : names.get(deptCd);
    }

    private static String menuNm(String pageId, Map<String, MenuInfo> menus) {
        MenuInfo m = menus.get(pageId);
        return m != null ? m.menuNm() : NO_MENU_NM;
    }

    private static int unusedDays(ScreenUsageStatRequest request) {
        Integer v = request.getUnusedDays();
        return v == null || v <= 0 ? DEFAULT_UNUSED_DAYS : v;
    }

    private static Comparator<Map<String, Object>> longDesc(String key) {
        return Comparator.comparing((Map<String, Object> r) -> (Long) r.get(key)).reversed();
    }

    private static Comparator<Map<String, Object>> text(String key) {
        return Comparator.comparing((Map<String, Object> r) -> (String) r.get(key),
                Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    // ───────────────────────────────────────────── 값 객체

    private record Range(LocalDate from, LocalDate to) {
        static Range of(ScreenUsageStatRequest r) {
            LocalDate from = parse(r.getFromDt(), "fromDt");
            LocalDate to = parse(r.getToDt(), "toDt");
            if (from.isAfter(to)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "조회 시작일(fromDt)이 종료일(toDt)보다 늦습니다.");
            }
            return new Range(from, to);
        }

        private static LocalDate parse(String value, String name) {
            if (value == null || value.isBlank()) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, name + " 는 필수입니다.");
            }
            try {
                return ScreenUsageDates.parseDt(value.trim());
            } catch (DateTimeParseException e) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, name + " 는 yyyyMMdd 형식이어야 합니다: " + value);
            }
        }
    }

    private record Filter(String deptCd, String userId, String pageId) {
        static Filter of(ScreenUsageStatRequest r) {
            return new Filter(blankToNull(r.getDeptCd()), blankToNull(r.getUserId()), blankToNull(r.getPageId()));
        }

        boolean matches(ScreenUsageDay d) {
            return (deptCd == null || deptCd.equals(d.getDeptCd()))
                    && (userId == null || userId.equals(d.getUserId()))
                    && (pageId == null || pageId.equals(d.getPageId()));
        }
    }

    private record Split(LocalDate dayFrom, LocalDate dayTo, LocalDate rawFrom, LocalDate rawTo) {
        boolean hasDay() { return dayFrom != null; }
        boolean hasRaw() { return rawFrom != null; }
    }

    /** 화면·부서·사용자 공통 합산기. */
    private static class Acc {
        long openCnt;
        long durationMs;
        String lastUsedDt;
        final Set<String> users = new HashSet<>();

        void add(UsageSum s) {
            openCnt += s.openCnt();
            durationMs += s.durationMs();
            users.add(s.userId());
            if (lastUsedDt == null || s.lastUsedDt().compareTo(lastUsedDt) > 0) {
                lastUsedDt = s.lastUsedDt();
            }
        }
    }

    /** 부서 합산 + 화면별 열람·시간 — 최다 이용 화면(열람 → 시간 → pageId 순). */
    private static final class DeptAcc extends Acc {
        final Map<String, long[]> pages = new TreeMap<>();

        @Override
        void add(UsageSum s) {
            super.add(s);
            long[] p = pages.computeIfAbsent(s.pageId(), k -> new long[2]);
            p[0] += s.openCnt();
            p[1] += s.durationMs();
        }

        String topPageId() {
            String top = null;
            long[] best = null;
            for (Map.Entry<String, long[]> e : pages.entrySet()) {
                long[] v = e.getValue();
                if (best == null || v[0] > best[0] || (v[0] == best[0] && v[1] > best[1])) {
                    top = e.getKey();
                    best = v;
                }
            }
            return top;
        }
    }

    /** 사용자 합산 + 마지막 이용일에 쓰인 부서들(하나면 확정, 둘 이상이면 원본으로 가린다). */
    private static final class UserAcc extends Acc {
        final Set<String> latestDepts = new TreeSet<>();

        @Override
        void add(UsageSum s) {
            String before = lastUsedDt;
            super.add(s);
            if (before == null || s.lastUsedDt().compareTo(before) > 0) {
                latestDepts.clear();
                latestDepts.add(s.deptCd());
            } else if (s.lastUsedDt().equals(before)) {
                latestDepts.add(s.deptCd());
            }
        }
    }
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatServiceJpaTest`
Expected: PASS (14 tests)

- [ ] **Step 6: 계약 검사와 커밋**

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/dto/ScreenUsageStatRequest.java src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatService.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/service/ScreenUsageStatServiceJpaTest.java
/usr/bin/git commit -m "feat(mcm-core): 화면 사용 통계 6종을 집계분과 미집계 원본을 겹치지 않게 합산해 낸다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Expected: 계약 검사 `ERROR 0`

---

### Task 7: 통계 BPMN 과 PERM_ALL action

**Files:**
- Create: `src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn` (bpmn-tool 로 생성)
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java:298-332` (`allActions`, `"changeStatus"` 는 325행)
- Modify: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/ScreenUsageOasisContractTest.java`

**Interfaces:**
- Consumes (Task 6): `ScreenUsageStatService` 6 메서드, `ScreenUsageStatRequest`
- Produces:
  - OASIS 서비스 ID `screenUsageStat`. action → output 은 `overview→result`, `byScreen→screens`, `byDept→depts`, `byUser→users`, `unused→unused`, `history→history` (C4).
  - PERM_ALL `allActions` 에 `overview, byScreen, byDept, byUser, unused, history` 를 더한다. U4 메뉴 시드가 SYSADMIN 매핑에 쓴다.

- [ ] **Step 1: 실패 테스트 추가**

`ScreenUsageOasisContractTest.java` 에 import `com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest`, `com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatService`, `java.nio.file.Files`, `java.util.LinkedHashSet`, `java.util.Set`, `java.util.regex.Matcher`, `java.util.regex.Pattern` 를 더하고, 아래 두 테스트를 추가한다.

```java
    @Test
    @DisplayName("screenUsageStat.bpmn 은 6개 action 을 C4 output 과 ScreenUsageStatRequest dto 로 보낸다")
    void statBpmn() throws Exception {
        Document doc = parse(SERVICES.resolve("csa/screenUsageStat.bpmn"));
        assertThat(processId(doc)).isEqualTo("screenUsageStat");

        Map<String, String> expectedOutput = new LinkedHashMap<>();
        expectedOutput.put("overview", "result");
        expectedOutput.put("byScreen", "screens");
        expectedOutput.put("byDept", "depts");
        expectedOutput.put("byUser", "users");
        expectedOutput.put("unused", "unused");
        expectedOutput.put("history", "history");

        Map<String, Element> tasks = tasksByAction(doc);
        assertThat(tasks.keySet()).containsExactlyInAnyOrderElementsOf(expectedOutput.keySet());
        for (Map.Entry<String, String> e : expectedOutput.entrySet()) {
            Element task = tasks.get(e.getKey());
            assertThat(task.getAttribute("camunda:class")).as(e.getKey()).isEqualTo("screenUsageStatService");
            assertThat(property(task, "method")).as(e.getKey()).isEqualTo(e.getKey());
            assertThat(property(task, "output")).as(e.getKey()).isEqualTo(e.getValue());
            assertThat(property(task, "dto")).as(e.getKey()).isEqualTo(ScreenUsageStatRequest.class.getName());
            assertThat(property(task, "grid")).as(e.getKey()).isNull();
            ScreenUsageStatService.class.getMethod(e.getKey(), ScreenUsageStatRequest.class);
        }
        assertThat(ScreenUsageStatService.class.getAnnotation(Service.class).value()).isEqualTo("screenUsageStatService");
        assertThat(ScreenUsageStatService.class.isAnnotationPresent(Transactional.class)).isFalse();
    }

    @Test
    @DisplayName("PERM_ALL allActions 에 통계 6개 action 이 있다 (없으면 SYSADMIN 도 403)")
    void permAllContainsStatActions() throws Exception {
        String source = Files.readString(DATA_INITIALIZER);
        int from = source.indexOf("String allActions = String.join(\",\",");
        assertThat(from).as("allActions 선언").isNotNegative();
        String block = source.substring(from, source.indexOf(");", from));
        Set<String> actions = new LinkedHashSet<>();
        Matcher m = Pattern.compile("\"([^\"]+)\"").matcher(block);
        while (m.find()) {
            actions.add(m.group(1));
        }

        assertThat(actions).contains("overview", "byScreen", "byDept", "byUser", "unused", "history");
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: FAIL
- `statBpmn` 은 `FileNotFoundException ... csa/screenUsageStat.bpmn` 으로 실패한다.
- `permAllContainsStatActions` 는 `Expecting ... to contain ... "overview"` 로 실패한다.

- [ ] **Step 3: allActions 추가**

`DataInitializer.java` 325행을 바꾼다.

old:
```java
                "changeStatus"

                // ── 업무 모듈을 붙일 때 여기에 해당 모듈의 OASIS action 을 추가한다 ──────────────
```
new:
```java
                "changeStatus",
                // 2026-10-02 — mcm 화면 사용 통계(services/csa/screenUsageStat.bpmn) 6개 action. 이미 시드된 DB 는
                //   아래 ensurePermAllActions 가 덧붙인다. screenUsage/record 는 AUTH_ONLY 라 여기 넣지 않는다.
                "overview", "byScreen", "byDept", "byUser", "unused", "history"

                // ── 업무 모듈을 붙일 때 여기에 해당 모듈의 OASIS action 을 추가한다 ──────────────
```
주석 안에 큰따옴표를 쓰지 않는다. mdm `MdmOasisActionVocabularyTest` 가 이 블록의 따옴표 문자열을 모두 action 으로 읽는다.

- [ ] **Step 4: BPMN 생성 (bpmn-tool)**

```bash
npx -y @cothe/bpmn-tool@1.3.0 create > src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn <<'EOF'
{
  "definitions": { "id": "Definitions_screenUsageStat", "targetNamespace": "http://bpmn.io/schema/bpmn" },
  "process": { "id": "screenUsageStat", "name": "화면 사용 통계 서비스", "isExecutable": true },
  "nodes": [
    { "id": "start", "type": "bpmn:StartEvent", "x": 152, "y": 482 },
    { "id": "actionGateway", "type": "bpmn:ExclusiveGateway", "x": 245, "y": 475,
      "camunda": { "properties": [{ "name": "input", "value": "action" }] } },
    { "id": "overviewTask", "type": "bpmn:ServiceTask", "name": "개요", "x": 370, "y": 60,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "overview" }, { "name": "output", "value": "result" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endOverview", "type": "bpmn:EndEvent", "x": 542, "y": 82 },
    { "id": "byScreenTask", "type": "bpmn:ServiceTask", "name": "화면별", "x": 370, "y": 220,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "byScreen" }, { "name": "output", "value": "screens" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endByScreen", "type": "bpmn:EndEvent", "x": 542, "y": 242 },
    { "id": "byDeptTask", "type": "bpmn:ServiceTask", "name": "부서별", "x": 370, "y": 380,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "byDept" }, { "name": "output", "value": "depts" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endByDept", "type": "bpmn:EndEvent", "x": 542, "y": 402 },
    { "id": "byUserTask", "type": "bpmn:ServiceTask", "name": "사용자별", "x": 370, "y": 540,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "byUser" }, { "name": "output", "value": "users" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endByUser", "type": "bpmn:EndEvent", "x": 542, "y": 562 },
    { "id": "unusedTask", "type": "bpmn:ServiceTask", "name": "미사용 화면", "x": 370, "y": 700,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "unused" }, { "name": "output", "value": "unused" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endUnused", "type": "bpmn:EndEvent", "x": 542, "y": 722 },
    { "id": "historyTask", "type": "bpmn:ServiceTask", "name": "이용 이력", "x": 370, "y": 860,
      "camunda": { "class": "screenUsageStatService", "properties": [
        { "name": "method", "value": "history" }, { "name": "output", "value": "history" },
        { "name": "dto", "value": "com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest" } ] } },
    { "id": "endHistory", "type": "bpmn:EndEvent", "x": 542, "y": 882 }
  ],
  "flows": [
    { "id": "flow_to_gw", "source": "start", "target": "actionGateway" },
    { "id": "flow_overview", "name": "overview", "source": "actionGateway", "target": "overviewTask" },
    { "id": "flow_overview_end", "source": "overviewTask", "target": "endOverview" },
    { "id": "flow_byScreen", "name": "byScreen", "source": "actionGateway", "target": "byScreenTask" },
    { "id": "flow_byScreen_end", "source": "byScreenTask", "target": "endByScreen" },
    { "id": "flow_byDept", "name": "byDept", "source": "actionGateway", "target": "byDeptTask" },
    { "id": "flow_byDept_end", "source": "byDeptTask", "target": "endByDept" },
    { "id": "flow_byUser", "name": "byUser", "source": "actionGateway", "target": "byUserTask" },
    { "id": "flow_byUser_end", "source": "byUserTask", "target": "endByUser" },
    { "id": "flow_unused", "name": "unused", "source": "actionGateway", "target": "unusedTask" },
    { "id": "flow_unused_end", "source": "unusedTask", "target": "endUnused" },
    { "id": "flow_history", "name": "history", "source": "actionGateway", "target": "historyTask" },
    { "id": "flow_history_end", "source": "historyTask", "target": "endHistory" }
  ]
}
EOF
npx -y @cothe/bpmn-tool@1.3.0 validate src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn
```
Expected: `"유효": true`, `"오류": 0`. 경고 1건(default flow 미설정)은 기존 `secFavorite.bpmn` 과 같은 구조라 그대로 둔다. 계획 작성 중 같은 스펙으로 확인했다.

- [ ] **Step 5: 통과 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.ScreenUsageOasisContractTest`
Expected: PASS (3 tests)

Run: `cd src/backend/mcm && ../gradlew :api:compileJava`
Expected: BUILD SUCCESSFUL

Run: `cd src/backend/mdm && ../gradlew :api:test --tests com.dongkuk.dmes.mdm.MdmOasisActionVocabularyTest`
Expected: PASS. 이 테스트는 같은 `allActions` 블록을 정규식으로 읽는다. 블록 안에 큰따옴표가 든 주석이 없어야 한다.

- [ ] **Step 6: 계약 검사와 커밋**

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```
Expected: `ERROR 0`. overview 의 Map 반환은 INFO 6-D-2 로 집계된다. 계약 C4 가 `data.result` 를 정하고 있고 U3 가 그 짝이다.

```bash
/usr/bin/git add src/backend/mcm/api/src/main/resources/services/csa/screenUsageStat.bpmn src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/ScreenUsageOasisContractTest.java
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 BPMN 을 추가하고 6개 action 을 PERM_ALL 에 넣는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: MSSQL DDL 정본과 DataInitializer 멱등 생성

**Files:**
- Create: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/schema/ScreenUsageMssqlDdl.java`
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java`
  - import(11행 뒤)
  - `run()` 의 `initMcmCsaCommUserRoleCopyArtifacts();`(190행) 뒤
  - `tableExists(String, String)`(2573~2581행) 뒤에 헬퍼 추가
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/schema/ScreenUsageMssqlDdlTest.java`

**Interfaces:**
- Consumes (Task 1): 엔티티 `ScreenUsageLog`, `ScreenUsageDay`, `ScreenUsageDayId`. 제약·인덱스 이름이 DDL 과 같다.
- Produces: `ScreenUsageMssqlDdl`
  - `LOG_TABLE`, `DAY_TABLE`, `CREATE_LOG_TABLE`, `CREATE_DAY_TABLE`
  - `List<IndexDdl> LOG_INDEXES`
  - `record IndexDdl(String name, String sql)`
  - `static List<String> allStatements()` — DBA 전달 순서

- [ ] **Step 1: 실패 테스트 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/schema/ScreenUsageMssqlDdlTest.java`

```java
package com.dongkuk.dmes.mcm.screenusage.schema;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 운영 MSSQL DDL 정본을 H2 MSSQLServer 모드에서 실제로 실행하고, 엔티티가 그 테이블에 그대로 저장·조회되는지 본다
 * (ddl-auto 가 아니라 DDL 로 만든 테이블 — 컬럼명·타입 불일치를 잡는다).
 */
class ScreenUsageMssqlDdlTest {

    private static final String URL = "jdbc:h2:mem:screenusage_mssql;MODE=MSSQLServer;DB_CLOSE_DELAY=-1";

    @BeforeAll
    static void createSchema() throws Exception {
        Class.forName("org.h2.Driver"); // testRuntimeOnly — 문자열로만 로드
        try (Connection c = DriverManager.getConnection(URL, "sa", ""); Statement s = c.createStatement()) {
            for (String sql : ScreenUsageMssqlDdl.allStatements()) {
                s.execute(sql);
            }
        }
    }

    private static long count(String sql, String param) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, "sa", "");
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, param);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }

    @Test
    @DisplayName("인덱스 3개와 (USER_ID, CLIENT_SEG_ID) 고유 제약이 정해진 이름으로 만들어진다")
    void indexesAndUniqueConstraint() throws Exception {
        for (ScreenUsageMssqlDdl.IndexDdl index : ScreenUsageMssqlDdl.LOG_INDEXES) {
            assertThat(count("SELECT COUNT(*) FROM INFORMATION_SCHEMA.INDEXES WHERE INDEX_NAME = ?", index.name()))
                    .as(index.name()).isEqualTo(1);
        }
        assertThat(count("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
                + "WHERE CONSTRAINT_TYPE = 'UNIQUE' AND CONSTRAINT_NAME = ?", "UK_SEC_SCREEN_USAGE_LOG_SEG"))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("같은 사용자·같은 clientSegId 두 번째 INSERT 는 DDL 고유 제약이 막는다")
    void uniqueRejectsDuplicate() throws Exception {
        String insert = "INSERT INTO TB_SEC_SCREEN_USAGE_LOG (USAGE_ID, USER_ID, PAGE_ID, START_KIND, STARTED_AT, "
                + "ENDED_AT, DURATION_MS, CLIENT_SEG_ID, RECEIVED_AT) VALUES (?, 'dupUser', 'p/a', 'OPEN', "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1000, 'dup-seg', CURRENT_TIMESTAMP)";
        try (Connection c = DriverManager.getConnection(URL, "sa", "")) {
            try (PreparedStatement ps = c.prepareStatement(insert)) {
                ps.setString(1, "u-1");
                ps.executeUpdate();
            }
            assertThatThrownBy(() -> {
                try (PreparedStatement ps = c.prepareStatement(insert)) {
                    ps.setString(1, "u-2");
                    ps.executeUpdate();
                }
            }).isInstanceOf(SQLException.class);
        }
    }

    @Test
    @DisplayName("엔티티가 DDL 로 만든 테이블에 저장되고 그대로 읽힌다 (ddl-auto 없음)")
    void entitiesRoundTrip() {
        DriverManagerDataSource ds = new DriverManagerDataSource(URL, "sa", "");
        ds.setDriverClassName("org.h2.Driver");
        LocalContainerEntityManagerFactoryBean factory = new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(ds);
        factory.setPackagesToScan("com.dongkuk.dmes.mcm.screenusage.entity");
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        Properties props = new Properties();
        props.put("hibernate.hbm2ddl.auto", "none");
        factory.setJpaProperties(props);
        factory.afterPropertiesSet();
        EntityManagerFactory emf = factory.getObject();

        ScreenUsageLog log = new ScreenUsageLog();
        log.setUsageId("rt-1");
        log.setUserId("userA");
        log.setDeptCd("D100");
        log.setPageId("csa/commUserMng");
        log.setStartKind("RESUME");
        log.setStartedAt(LocalDateTime.of(2026, 10, 2, 9, 0, 0));
        log.setEndedAt(LocalDateTime.of(2026, 10, 2, 9, 15, 0));
        log.setDurationMs(900_000L);
        log.setClientSegId("rt-seg");
        log.setClientIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
        log.setReceivedAt(LocalDateTime.of(2026, 10, 2, 9, 16, 0));
        ScreenUsageDay day = ScreenUsageDay.of(new ScreenUsageDayId("20261002", "csa/commUserMng", "userA", "-"));
        day.accumulate(true, 900_000L);

        EntityManager em = emf.createEntityManager();
        try {
            em.getTransaction().begin();
            em.persist(log);
            em.persist(day);
            em.getTransaction().commit();
            em.clear();

            ScreenUsageLog foundLog = em.find(ScreenUsageLog.class, "rt-1");
            assertThat(foundLog.getStartedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 9, 0, 0));
            assertThat(foundLog.getDurationMs()).isEqualTo(900_000L);
            assertThat(foundLog.getClientIp()).hasSize(39);
            ScreenUsageDay foundDay = em.find(ScreenUsageDay.class,
                    new ScreenUsageDayId("20261002", "csa/commUserMng", "userA", "-"));
            assertThat(foundDay.getOpenCnt()).isEqualTo(1);
            assertThat(foundDay.getDurationMs()).isEqualTo(900_000L);
        } finally {
            em.close();
            factory.destroy();
        }
    }

    @Test
    @DisplayName("DataInitializer 가 MSSQL 분기에서 이 DDL 로 두 테이블과 인덱스를 멱등 생성한다")
    void dataInitializerUsesDdl() throws Exception {
        String source = Files.readString(
                Path.of("../mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java"));

        assertThat(source).contains("initScreenUsageArtifacts();")
                .contains("ScreenUsageMssqlDdl.CREATE_LOG_TABLE")
                .contains("ScreenUsageMssqlDdl.CREATE_DAY_TABLE")
                .contains("ScreenUsageMssqlDdl.LOG_INDEXES");
        int call = source.indexOf("initScreenUsageArtifacts();");
        int sqliteElse = source.indexOf("createSecMenuFldForSqlite();");
        assertThat(call).isLessThan(sqliteElse); // if (!sqliteDialect) 블록 안
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.schema.ScreenUsageMssqlDdlTest`
Expected: FAIL — `cannot find symbol: class ScreenUsageMssqlDdl`

- [ ] **Step 3: DDL 정본 구현**

`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/schema/ScreenUsageMssqlDdl.java`

```java
package com.dongkuk.dmes.mcm.screenusage.schema;

import java.util.ArrayList;
import java.util.List;

/**
 * 화면 사용 통계 테이블 MSSQL DDL 정본 (설계 4.6). mcm/api DataInitializer(local-db 등 MSSQL 계열 멱등 생성)와
 * 운영 DBA 전달본이 같은 문장을 쓴다. 감사 계열처럼 schema 접두가 없다 — 접속 계정의 기본 스키마에 만든다.
 * 컬럼·제약·인덱스 이름은 엔티티 {@code ScreenUsageLog}/{@code ScreenUsageDay} 매핑과 같다(ScreenUsageMssqlDdlTest).
 */
public final class ScreenUsageMssqlDdl {

    public static final String LOG_TABLE = "TB_SEC_SCREEN_USAGE_LOG";
    public static final String DAY_TABLE = "TB_SEC_SCREEN_USAGE_DAY";

    public static final String CREATE_LOG_TABLE = """
            CREATE TABLE TB_SEC_SCREEN_USAGE_LOG (
                USAGE_ID      VARCHAR(36)  NOT NULL,
                USER_ID       VARCHAR(50)  NOT NULL,
                DEPT_CD       VARCHAR(10)  NULL,
                PAGE_ID       VARCHAR(200) NOT NULL,
                START_KIND    VARCHAR(10)  NOT NULL,
                STARTED_AT    DATETIME2    NOT NULL,
                ENDED_AT      DATETIME2    NOT NULL,
                DURATION_MS   BIGINT       NOT NULL,
                CLIENT_SEG_ID VARCHAR(36)  NOT NULL,
                CLIENT_IP     VARCHAR(45)  NULL,
                RECEIVED_AT   DATETIME2    NOT NULL,
                CONSTRAINT PK_SEC_SCREEN_USAGE_LOG PRIMARY KEY (USAGE_ID),
                CONSTRAINT UK_SEC_SCREEN_USAGE_LOG_SEG UNIQUE (USER_ID, CLIENT_SEG_ID)
            )""";

    public static final List<IndexDdl> LOG_INDEXES = List.of(
            new IndexDdl("IX_SEC_SCREEN_USAGE_LOG_STARTED",
                    "CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_STARTED ON TB_SEC_SCREEN_USAGE_LOG (STARTED_AT)"),
            new IndexDdl("IX_SEC_SCREEN_USAGE_LOG_USER",
                    "CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_USER ON TB_SEC_SCREEN_USAGE_LOG (USER_ID, STARTED_AT)"),
            new IndexDdl("IX_SEC_SCREEN_USAGE_LOG_PAGE",
                    "CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_PAGE ON TB_SEC_SCREEN_USAGE_LOG (PAGE_ID, STARTED_AT)"));

    public static final String CREATE_DAY_TABLE = """
            CREATE TABLE TB_SEC_SCREEN_USAGE_DAY (
                USAGE_DT    CHAR(8)      NOT NULL,
                PAGE_ID     VARCHAR(200) NOT NULL,
                USER_ID     VARCHAR(50)  NOT NULL,
                DEPT_CD     VARCHAR(10)  NOT NULL,
                OPEN_CNT    INT          NOT NULL,
                SEG_CNT     INT          NOT NULL,
                DURATION_MS BIGINT       NOT NULL,
                CONSTRAINT PK_SEC_SCREEN_USAGE_DAY PRIMARY KEY (USAGE_DT, PAGE_ID, USER_ID, DEPT_CD)
            )""";

    public record IndexDdl(String name, String sql) {}

    private ScreenUsageMssqlDdl() {}

    /** DBA 전달·테스트 실행 순서: 원본 테이블 → 원본 인덱스 3개 → 일별 집계 테이블. */
    public static List<String> allStatements() {
        List<String> out = new ArrayList<>();
        out.add(CREATE_LOG_TABLE);
        for (IndexDdl index : LOG_INDEXES) {
            out.add(index.sql());
        }
        out.add(CREATE_DAY_TABLE);
        return List.copyOf(out);
    }
}
```

- [ ] **Step 4: DataInitializer 연결**

1) import 를 추가한다. 11행 `import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;` 바로 뒤에 넣는다.

```java
import com.dongkuk.dmes.mcm.screenusage.schema.ScreenUsageMssqlDdl;
```

2) `run()` 을 바꾼다.

old:
```java
        initMcmCsaCommUserRoleCopyArtifacts();
        } else {
```
new:
```java
        initMcmCsaCommUserRoleCopyArtifacts();

        // 화면 사용 통계(2026-10-02) — TB_SEC_SCREEN_USAGE_LOG / _DAY + 인덱스 멱등 생성.
        // 감사 계열(TB_SEC_AUDIT_LOG)처럼 schema 접두 없이 접속 계정 기본 스키마에 둔다. SQLite 는 ddl-auto 가 만든다.
        initScreenUsageArtifacts();
        } else {
```

3) `tableExists(String schema, String table)` 메서드 끝(`return cnt != null && cnt.intValue() > 0;` 다음 `}`) 뒤에 추가한다.

```java

    /**
     * 화면 사용 통계 원본·일별 집계 테이블 멱등 생성 (MSSQL 계열, 2026-10-02).
     * <p>DDL 정본은 mcm-core {@link ScreenUsageMssqlDdl} — 운영 DBA 전달본과 같은 문장이다. 두 테이블은 schema 접두가 없어
     * {@link #tableExists(String, String)}(schema 필수) 대신 기본 스키마로 해석하는 {@code OBJECT_ID(테이블)} 로 확인한다.
     * local-db 는 ddl-auto=update 가 먼저 만들 수 있으므로 인덱스도 이름으로 하나씩 확인한다.
     */
    private void initScreenUsageArtifacts() {
        if (!tableExistsInDefaultSchema(ScreenUsageMssqlDdl.LOG_TABLE)) {
            nq(ScreenUsageMssqlDdl.CREATE_LOG_TABLE).executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: {}", ScreenUsageMssqlDdl.LOG_TABLE);
        }
        for (ScreenUsageMssqlDdl.IndexDdl index : ScreenUsageMssqlDdl.LOG_INDEXES) {
            if (!indexExistsInDefaultSchema(ScreenUsageMssqlDdl.LOG_TABLE, index.name())) {
                nq(index.sql()).executeUpdate();
                log.info("[DataInitializer] CREATE INDEX: {}", index.name());
            }
        }
        if (!tableExistsInDefaultSchema(ScreenUsageMssqlDdl.DAY_TABLE)) {
            nq(ScreenUsageMssqlDdl.CREATE_DAY_TABLE).executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: {}", ScreenUsageMssqlDdl.DAY_TABLE);
        }
    }

    /** schema 접두 없는 테이블 존재 여부 — 접속 계정 기본 스키마로 해석 (MSSQL). */
    private boolean tableExistsInDefaultSchema(String table) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects WHERE object_id = OBJECT_ID(:name) AND type = 'U'")
                .setParameter("name", table)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }

    /** schema 접두 없는 테이블의 인덱스 존재 여부 (MSSQL). */
    private boolean indexExistsInDefaultSchema(String table, String indexName) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID(:name) AND name = :idx")
                .setParameter("name", table)
                .setParameter("idx", indexName)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }
```

- [ ] **Step 5: 통과 확인**

Run: `cd src/backend/mcm-core && ../gradlew :test --tests com.dongkuk.dmes.mcm.screenusage.schema.ScreenUsageMssqlDdlTest`
Expected: PASS (4 tests)

Run: `cd src/backend/mcm && ../gradlew :api:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: 계약 검사와 커밋**

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/screenusage/schema/ScreenUsageMssqlDdl.java src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/screenusage/schema/ScreenUsageMssqlDdlTest.java src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java
/usr/bin/git commit -m "feat(mcm): 화면 사용 통계 테이블 MSSQL DDL 정본을 두고 DataInitializer 가 멱등 생성한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Expected: 계약 검사 `ERROR 0`

---

### Task 9: README 와 전체 검증

**Files:**
- Modify: `src/backend/mcm-core/README.md` ("이들을 떠받치는 공통 계층" 표, "스키마 관리" 절)

**Interfaces:**
- Consumes: Task 1~8 전체
- Produces: 없음(문서·검증)

- [ ] **Step 1: 전체 테스트를 먼저 돌려 기준을 본다**

Run: `cd src/backend/mcm-core && ../gradlew :test`
Expected: PASS. `McmCoreArchitectureTest` 5건이 포함된다. 새 패키지 `screenusage` 는 `repository`·`entity`·`common` 만 의존하고, 역방향 의존이 없어 사이클이 없다. 실패하면 이 Task 에서 고친 뒤 진행한다.

- [ ] **Step 2: README 갱신**

`src/backend/mcm-core/README.md` 의 공통 계층 표에서 `| favorite | 포털 즐겨찾기 |` 행 바로 뒤에 추가한다.

```markdown
| `screenusage` | 포털 화면 사용 구간 기록(`screenUsage/record`, AUTH_ONLY) · 02:00 일별 집계·1년 보관(`ScreenUsageRollup`) · 통계 6종(`screenUsageStat`) |
```

"스키마 관리" 절 마지막 문단 뒤에 추가한다.

```markdown
화면 사용 통계 테이블(`TB_SEC_SCREEN_USAGE_LOG`·`TB_SEC_SCREEN_USAGE_DAY`)은 감사 계열처럼 schema 접두가 없다.
MSSQL DDL 정본은 `screenusage/schema/ScreenUsageMssqlDdl` 이며 `DataInitializer` 와 운영 DBA 전달본이 같은 문장을 쓴다.
```

- [ ] **Step 3: 최종 검증**

Run: `cd src/backend/mcm-core && ../gradlew :test`
Expected: PASS

Run: `cd src/backend/mcm && ../gradlew :api:compileJava`
Expected: BUILD SUCCESSFUL

Run: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`
Expected: `ERROR 0`. 진입점 bean 이 2개 늘고 미해석은 0 이다.

- [ ] **Step 4: 커밋**

```bash
/usr/bin/git add src/backend/mcm-core/README.md
/usr/bin/git commit -m "docs(mcm-core): 화면 사용 통계 패키지와 테이블 DDL 정본 위치를 README 에 적는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## 부록 A. 운영 DBA 전달용 MSSQL DDL

- 대상 DB 는 mcm 업무 DB(`dsBiz`)다. 앱 접속 계정의 **기본 스키마**에 만든다. `MCMAPUSER.` 접두를 붙이지 않는다. 엔티티에 schema 가 없어 Hibernate 가 기본 스키마로 접근한다.
- 문장 본문은 `ScreenUsageMssqlDdl` 상수와 같다. 끝에 `;` 만 붙였다.
- dev/prod 는 `DataInitializer`·`ddl-auto` 가 꺼져 있으므로 이 DDL 을 사전에 실행해야 한다.

```sql
CREATE TABLE TB_SEC_SCREEN_USAGE_LOG (
    USAGE_ID      VARCHAR(36)  NOT NULL,
    USER_ID       VARCHAR(50)  NOT NULL,
    DEPT_CD       VARCHAR(10)  NULL,
    PAGE_ID       VARCHAR(200) NOT NULL,
    START_KIND    VARCHAR(10)  NOT NULL,
    STARTED_AT    DATETIME2    NOT NULL,
    ENDED_AT      DATETIME2    NOT NULL,
    DURATION_MS   BIGINT       NOT NULL,
    CLIENT_SEG_ID VARCHAR(36)  NOT NULL,
    CLIENT_IP     VARCHAR(45)  NULL,
    RECEIVED_AT   DATETIME2    NOT NULL,
    CONSTRAINT PK_SEC_SCREEN_USAGE_LOG PRIMARY KEY (USAGE_ID),
    CONSTRAINT UK_SEC_SCREEN_USAGE_LOG_SEG UNIQUE (USER_ID, CLIENT_SEG_ID)
);
CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_STARTED ON TB_SEC_SCREEN_USAGE_LOG (STARTED_AT);
CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_USER ON TB_SEC_SCREEN_USAGE_LOG (USER_ID, STARTED_AT);
CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_PAGE ON TB_SEC_SCREEN_USAGE_LOG (PAGE_ID, STARTED_AT);
CREATE TABLE TB_SEC_SCREEN_USAGE_DAY (
    USAGE_DT    CHAR(8)      NOT NULL,
    PAGE_ID     VARCHAR(200) NOT NULL,
    USER_ID     VARCHAR(50)  NOT NULL,
    DEPT_CD     VARCHAR(10)  NOT NULL,
    OPEN_CNT    INT          NOT NULL,
    SEG_CNT     INT          NOT NULL,
    DURATION_MS BIGINT       NOT NULL,
    CONSTRAINT PK_SEC_SCREEN_USAGE_DAY PRIMARY KEY (USAGE_DT, PAGE_ID, USER_ID, DEPT_CD)
);
```

운영 참고 사항:
- 원본 보관량: 사용자 500명이 하루 100구간을 남기면 하루 약 5만 행, 1년이면 약 1,800만 행이다. 매일 02:00 에 365일 지난 행을 삭제한다.
- 앱 계정에 필요한 권한은 두 테이블의 SELECT·INSERT·DELETE 다. UPDATE 는 쓰지 않는다.

## Self-Review

1. **Spec coverage**
   - 4.1 원본 컬럼·고유 제약·인덱스 3개·schema 없음 → Task 1, 8
   - 4.2 집계 키·`'-'`·CHAR(8) → Task 1, 4
   - 4.3 검증 7종·100건·중복·`{saved, skipped}`·AUTH_ONLY·BPMN → Task 2, 3
   - 4.4 cron·범위·일자 멱등·자정 귀속·보관 삭제·Java 날짜 계산 → Task 4
   - 4.5 6 action·오늘 원본 합산·(메뉴 없음)·JPQL 우선·메뉴 경로 방언 재사용·allActions → Task 5, 6, 7
   - 4.6 SQLite 는 ddl-auto, MSSQL 은 DataInitializer, Flyway 미추가 → Task 8
   - 7장 기록 서비스 JUnit, 집계·통계 저장소 테스트, 계약 검사, ArchUnit → Task 2, 4, 6, 9
   - 범위 밖: 메뉴 시드(U4), proxy.ts(U1), 화면(U3)
2. **Placeholder scan** — TBD·TODO·"적절히"·"Task N 과 같음" 없음. 모든 코드 Step 에 실제 코드가 있다.
3. **Type consistency**
   - `UsageSum(…Long…)`·`DailySum`·`PageLastUsed` 는 Task 1 정의와 Task 6 사용이 같다.
   - `ScreenUsageRollup(ScreenUsageLogRepository, ScreenUsageDayRepository, ScreenUsageDayWriter, Clock)` 은 Task 4·6 테스트에서 같다.
   - `ScreenUsageStatService(dayRepository, logRepository, menuCatalog, secUserRepository, deptInfoRepository, clock)` 순서는 테스트와 구현이 같다.
   - `ScreenMenuCatalog.MenuInfo(pageId, menuNm, menuPath, viewable)` 는 Task 5·6 이 같다.
   - `ScreenUsageAggregator.NO_DEPT/normalizeDept/sumByDayKey` 는 Task 4·6 이 같다.
4. **C4 보충(2026-10-02 메인 전달)** — 완전 일치·`'-'` 조건(`exactMatchFilters`), overview `unusedDays`(`overviewUsesUnusedDays`), byUser 사용자당 1행·마지막 이용 구간 부서(`byUserLatestDept`, `byUserSameDayDeptChange`)를 Task 6 에 반영했다.
5. **Review Focus** — 1·2·4·5 는 위 Review Focus 절의 테스트가 고정한다. 3 은 U1 소유이고, 서버 쪽 같은 묶음 중복은 Task 2 가 고정한다.
