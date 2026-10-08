# 예약 작업 관리(자동 수집관리) 설계

2026-10-08 · 레인 job-sched(지시 job-sched-2) · 상태: **구현 완료(job-sched-3) — 결정 D1~D32**

## 0. 배경과 사용자 결정

- 원문: 「자동 수집관리를 하나 만들자. 서버에 cron 을 대체하는 건데 서버가 여러 대라면 또 어떻게 처리해야 할지 모르겠네.」
- 사용자 결정(2026-10-08, 받은 순서)
  1. 여러 서버 처리 = **회차 선점**. 한 회차는 한 서버만 실행한다. 대표 서버 선출·Quartz 는 쓰지 않는다.
  2. 관리 범위 = **코드 작업 + 수집 작업**. 코드 작업은 화면에서 일정·사용 여부만 바꾸고, 그 밖의 작업은 화면에서 새로 만든다.
  3. 선점 수단 = **행 잠금**: 「select .. for update 를 써서 lock 을 잡아 버리면 되겠다.」
  4. 「기존에 widget 에서 반복적으로 실행하던 것은 없어져야겠지」: `WidgetCollector` 의 `@Scheduled` 두 개와 매분 위젯 정의 조회를 없앤다.
  5. 「DB 에 스케줄을 등록하면 그것으로 알아서 스케줄이 실행하도록 하면 좋겠다.」: 일정의 정본은 DB 다. 코드의 일정은 처음 등록할 때 쓰는 기본값일 뿐이다.
  6. 「각 모듈별로 있으면 좋겠다. mcm, mdm, mpp, mls, ... 모든 모듈에 있는 기능이면 좋겠어」: 6개 모듈 앱이 모두 예약 작업을 실행할 수 있다.
  7. 「모양은 crontab 과 동일한 방식이면 좋겠다.」: 일정은 crontab 5칸 식(`분 시 일 월 요일`)이다.
  8. 「1분에 한 번 스케줄 DB 를 조회하지 않도록 캐시에 관리되는 것이 좋겠어. 스케줄 테이블에 MCM 스케줄을 수정하면 캐시를 클리어시키고 새롭게 조회해서 캐시에 적재하는 거지」 → **결정 22 로 대체**(캐시 없음, 매분 색인 조회 1회)
  9. 「각 모듈별로 자기 모듈의 스케줄을 실행하도록 하고 실행하는 것은 bpmn 서비스, 쿼리, 수집 프로그램 등의 형태를 실행할 수 있도록 하자. 생각해 보고 더 있으면 추가해 줘.」
  10. 「캐시는 각 모듈별로 캐시가 있으면 좋겠어. 키 자체가 MCM, MDM, MLS, MPP, ... 이 키에 포함되어야 한다는 거야」 → **결정 22 로 대체**
  11. 「BPMN 의 경우는 변수와 Action 도 입력해 줘야 해.」 「다른 유형도 변수 받아야겠네.」
  12. 「위젯처럼 간단하게 등록할 수 있으면 좋겠다.」 「화면 시안을 먼저 만들어 봐.」 「crontab 식을 더 편하게 쓸 수 있게 하면 좋겠다.」
  13. 「위젯과 JOB 은 관계 없어. 위젯에 시간 설정한 것은 무조건 화면 시간이야.」(조정자 전달): 위젯 「자동 수집(collect)」 유형을 지운다. 빈 표 `TB_MCM_WIDGET_COLLECT_RUN`·`_DATA` 는 DROP 하지 않는다 → 2026-10-09 삭제 승인, V4.
  14. 「예약 작업 관리 테이블은 MCM 에 있지만 각 모듈에서 실행이 되어야 해」(조정자 전달): 실행은 각 모듈이 한다. 수집 작업도 작업마다 실행 모듈을 고른다.
  15. 「그냥 각 모듈의 스케줄러가 mcm 의 캐시를 읽어서 하는 게 낫지 않나?」 「MCM 의 API 는 쿼리를 읽어서 캐시 처리까지 하는 거고」(조정자 전달): **판정·선점은 MCM 만 한다**(결과 갱신·등록은 결정 25 로 모듈이 직접). 모듈이 MCM 표를 직접 읽는 안(`JobDataSource`)은 폐기한다.
  16. **(이번 수정)** 「2번 보완안으로 설계 수정해줘. 나도 2번이 좋다고 생각한다.」(조정자 전달): **MCM 이 판정·선점하고, MCM 이 각 모듈의 서비스를 호출한다(push).** 모듈이 매분 MCM 에 묻는 claim 안은 버린다(§12).
  17. 「일반 서비스 호출이 아닌 새롭게 만든 서비스 유형을 말한거야. 거기에서 자동으로 실행 이력에 대한 업데이트를 할거거든.」: 모듈 쪽 진입은 새 서비스 유형 **「예약 실행 진입점」**(§4.4)이고, 실행 이력 갱신을 이 진입점이 자동으로 한다(결정 25 로 DB 직접 갱신). 업무 서비스는 이력을 쓰지 않는다.
  18. 「모듈쪽 서비스 실행 로그는 모듈에 있어야 한다.」: 모듈에서 실행한 서비스의 로그는 그 모듈의 업무 로그에 남는다. sch 로그 파일에는 MCM 의 판정·선점·호출 로그만 간다(§4.8).
  19. 「OASIS에서는 서비스에서 서브서비스를 호출할 수 있다는 점을 명심해」 「다른 서비스를 함수처럼 호출하는거야. 그러니 몇번을 감싸도 된다는 말이야」: 작업 정의의 실체는 **서비스 ID + 입력**이다. 유형별 동작은 내장 서비스로 두고 BPMN 에서 서브서비스로 엮을 수 있다(§5).
  20. 「이러면 모듈별 정의 버전이 필요 없지?」(조정자 답: 필요 없다) → `TB_MCM_JOB_VER` 를 없앤다(§4.6). 「같은 말인데 다르게 표현했네」 → 코드 실행과 일반 클래스 실행은 같은 유형이다(§5.2). 「최대한 수정이 적은 쪽으로 해. 기존 것이 있으면 활용하자.」 → HTTP·PURGE 를 새 유형으로 만들지 않고 기존 코드를 재사용한다(§5.1·§6.1). 「알아서 정해줘」(모듈별 호출 주소) → 기존 `<모듈>_WAS_URL` 환경 변수 관례를 재사용한다(§4.7).
  21. 「A 안으로 하고」(조정자 전달, MCM 여러 대 캐시): 저장한 MCM 이 다른 MCM 의 캐시를 즉시 비우는 안 → 22 로 대체.
  22. **(최종)** 「어차피 DB 캐시에 올라가 있어서 WAS 캐시가 없어도 빠를 것 같다」(조정자 전달): **JOB 정의 WAS 캐시를 없앤다.** 각 MCM 이 매분 한 번 색인 조회(`USE_YN='Y' AND NEXT_RUN_AT <= 지금`)를 하고, 있으면 같은 트랜잭션에서 선점한다. 결정 8·10(캐시·모듈 키 캐시)은 이것으로 대체한다(§4.6).
  23. 「스케줄을 위한 SQL 로그는 실제 모듈은 아니지만 sch에 저장되도록 해줘.」(조정자 전달) → 24 로 대체.
  24. **(최종)** 「bpmn 으로 하고 로그를 mcm에 남기자.」(조정자 전달): **판정·선점은 BPMN 시스템 서비스 `jobDispatch` 가 한다.** 그 SQL·bind 로그는 mcm 업무 로그에 남고 로그 뷰어 서비스 목록에서 찾힌다. 매분 SQL 이 mcm 로그에 남는 것은 사용자 선택이므로 억제 장치는 두지 않는다(§4.1·§4.8).
  25. 「B 안이 좋겠다」(조정자 전달): **실행 결과는 모듈이 DB 에 직접 갱신한다.** 결과 API 를 없앤다. 전제(사용자 확인): 운영에서도 모든 모듈이 MCMAPUSER 표에 닿는 같은 Oracle 을 쓴다(선례: mls 의 `Notice` 엔티티가 `MCMAPUSER.TB_MCM_NOTICE` 를 직접 매핑). 결정 15 의 「JOB 표에는 MCM 만 닿는다」는 **실행 결과 갱신·코드 작업 등록에 한해** 바뀐다(§4.5·§5.2).
- Spring 스케줄러의 역할: MCM 의 `TaskScheduler` 는 매분 깨우는 시계로만 쓴다. 어떤 작업을 언제 돌릴지는 작업 정의 테이블이 정한다.

## 1. 지금 상태(조사 결과)

| 항목 | 위치 | 일정 | 여러 서버에서 |
|---|---|---|---|
| 위젯 정시 수집 tick | `widget/collect/WidgetCollector.scheduledTick` | 매분 | `TB_MCM_WIDGET_COLLECT_RUN` INSERT 선점으로 한 번만 |
| 위젯 수집 보관 삭제 | `WidgetCollector.scheduledPurge` | 매일 03:30 | 중복 실행(지우는 일이라 결과는 같음) |
| 화면 사용 일별 집계 | `screenusage/service/ScreenUsageRollup` | 매일 02:00 | 중복 실행(늦게 커밋한 쪽이 PK 위반 warn) |
| 폐기 토큰 정리 | `audit/service/RevokedTokenPurger` | 1시간마다(fixedDelay) | 중복 실행 |
| MDM 리비전 폴링 | cactus-core `MdmRevisionPoller` | 10초 | 서버마다 돌아야 함(캐시 갱신) |

- mcm-core 는 6개 모듈 앱(mcm·mdm·mpn·mls·mqc·mpp)의 `lib` 이 모두 `api libs.mcm.core` 로 싣는다. 그래서 위 `@Scheduled` 4개는 서버 한 대 안에서도 앱 6개에서 각각 돈다.
- 시각은 KST 로 통일한다. 시각 칸은 `TIMESTAMP(6)`, DB 의 `SYSTIMESTAMP` 도 KST 다(docs/oracle-1007/schema-owners.md §3.1).
- OASIS 서비스 기동 경로(코드 확인)
  - 화면 요청: cactus-core `OasisController`(`/api/{module}/oasis/{serviceId}/{action}`) → `OasisServiceExecutor.execute` → `serviceStarter.start(serviceId, sc)`.
  - DMOM 수신: `DmomReceiveDispatcher.dispatch` 가 웹 요청 없이 `serviceStarter.start(serviceId, sc)` 를 직접 부른다. 시스템 감사 주체(`SYSTEM`)를 `AuditHolder`·`sc.setAudit` 에 넣는다. 「`OasisServiceExecutor` 와 동일 패턴(웹 진입만 다름)」.
  - `serviceStarter` 빈은 `cactus.oasis.transactional=true` 일 때 `CactusServiceStarterFactory` 가 조립한다. `CoreServiceStarter.start` 가 서비스마다 `transactionHandler.execute(…)` 로 트랜잭션을 열고(전파 `REQUIRED`) 끝에 커밋·롤백한다. 실패는 예외가 아니라 `ServiceResult.serviceResultCode() != SUCCESS` 로 돌아온다.
  - 서브서비스(`SubServiceCallTask`): 기본은 `SubServiceConnectedToParentServiceCallTaskExecutable` 로 **부모와 같은 스레드·같은 트랜잭션**에서 돈다. 속성 `createNewService=true` 이면 `SubServiceDisconnectedToParentServiceCallTaskExecutable` 로 새 스레드에서 `serviceStarter.start` 를 부른다(새 트랜잭션).
  - BPMN 은 `classpath*:` 로 읽으므로 mcm-core jar 의 `services/**` 도 6개 앱 모두에서 보인다.
- 웹 경로 권한: `CactusWebSecurityAutoConfiguration` 은 `/oasis/**` 를 `authenticated()` 로만 막는다. 서비스 ID 별 권한 검사(BE permKey 묶기)는 개발 기간 보류 중이다. 그래서 **로그인한 사용자는 어떤 serviceId 든 웹으로 부를 수 있다.** 내장 서비스 설계는 이 점을 전제로 한다(§8).
- 예약 작업 로그 태그는 cactus-core `ScheduledJobLogContext` 가 넣는다(`sch.<클래스>.<메서드>`).
- 모듈 앱 로컬 포트: mcm 8100, mdm 8096, mpp 8094, mls 8092, mqc 8093, mpn 8095. 백엔드의 MDM 호출 주소는 이미 `${MDM_WAS_URL:http://localhost:8096}` 이고, 포털 BFF 도 `<모듈>_WAS_URL` 환경 변수를 쓴다.
- 로컬 mcm 앱은 `dmes.flyway.enabled=true` 라 **기동할 때 `oracle/mcmapuser` 의 새 V 파일을 L_MAIN 에 적용한다.**
- 위젯관리 화면(`csa/commWidgetMng`)은 왼쪽 목록 + 오른쪽 상세(공통 칸 + 유형별 편집기 + 미리보기)이고, [새 위젯] → 유형 고르기 → 빈 상세 흐름이다.
- 공용 DB(L_MAIN)의 collect 위젯 정의는 0건, 수집 기록도 0건이다.

## 2. 구성 한눈에 보기

```
[MCM 앱] ─ JOB 표(MCMAPUSER)의 판정·선점·정의 저장을 맡는 앱
   ├ JobDispatchTrigger(@Scheduled 매분 0초, 트리거만)
   │     → BPMN 시스템 서비스 jobDispatch(serviceStarter.start 직접, SCHEDULER 감사, 자기 트랜잭션)
   │          색인 조회(USE_YN='Y' AND NEXT_RUN_AT <= 지금, 50개) → 빈 결과면 끝
   │          있으면 FOR UPDATE SKIP LOCKED 선점(RUN INSERT·NEXT_RUN_AT 올림) → 커밋 → 선점 목록 반환
   │     → BPMN 트랜잭션 밖 Java 호출 풀이 그 모듈의 POST /internal/job/run 호출(비동기 접수)
   │     정의 캐시 없음(저장은 다음 분부터 반영) / 판정·호출 로그는 mcm 업무 로그
   └ 관리 화면 OASIS 서비스 jobSchedMng(「지금 실행」도 바로 호출)

[각 모듈 앱(MCM 포함), 서버 N대]
   POST /internal/job/run (system:mcm 만) → 접수 응답 → 실행 풀
   예약 실행 진입점 JobRunDispatcher: 감사 주체·MDC·대상 serviceId 기동·시간 초과·실행 결과 DB 직접 갱신(가장 바깥 한 번)
   기동 때 코드 작업·처리기를 DB 에 직접 등록(TB_MCM_JOB_DEF·TB_MCM_JOB_HANDLER)
   내장 서비스(mcm-core services/job/*.bpmn): jobCode · jobQuery · jobCollect — BPMN 에서 서브서비스로 엮을 수 있음
   모듈은 작업 목록을 들고 있지 않고 일정을 판정하지 않는다
```

- 패키지
  - cactus-core `com.dongkuk.dmes.cactus.job`(새 패키지, 기존 클래스는 바꾸지 않음): 예약 실행 진입점 `JobRunDispatcher`, 실행 범위 `JobRunScope`, 결과 갱신 `JobRunResultWriter`(표 구조를 아는 유일한 모듈 쪽 코드). DMOM 수신 디스패처와 같은 층에 둔다(D21).
  - mcm-core `com.dongkuk.dmes.mcm.job`(6개 앱이 모두 싣는다)
    - `def`: crontab 식·변수·정의 레코드.
    - `server`: MCM 쪽(트리거·판정 서비스 몸체·호출·기록·API·화면 서비스). `dmes.job.server.enabled`(MCM 앱만 true)일 때만 빈이 된다.
    - `agent`: 모든 모듈 쪽(접수 컨트롤러·실행 풀·코드 작업 DB 등록).
    - `builtin`: 내장 서비스의 Java 몸체(코드 실행·쿼리 실행·수집).
- 새 테이블 4개(MCMAPUSER): 작업 정의 `TB_MCM_JOB_DEF`, 실행 기록 `TB_MCM_JOB_RUN`, 수집 값 `TB_MCM_JOB_COLLECT_DATA`, 코드 처리기 `TB_MCM_JOB_HANDLER`.
- 관리 화면은 mcm 에 하나: 공통관리 > 시스템관리 > 「예약 작업 관리」(`csa/jobSchedMng`).
- **MCM 이 꺼져 있는 동안에는 모든 모듈의 예약 작업이 멈춘다.** MCM 이 돌아오면 그 사이 회차는 따라잡지 않고 `SKIP`(「놓친 회차를 건너뜀」) 1건으로 남는다. 모듈은 MCM 이 꺼져 있어도 기동에 실패하지 않는다.

## 3. 테이블

스키마 MCMAPUSER, Flyway `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V3__job_scheduler.sql`. 판정·선점·정의 저장은 MCM 앱이, 실행 결과 갱신과 코드 작업 등록은 각 모듈 앱이 한다(JdbcTemplate, SQL 에 스키마 접두. 모듈 쪽 접두는 설정 `dmes.job.schema`, 기본 `MCMAPUSER`). 감사 칸(`C_AT`·`C_USR_ID`·…·`VER`)은 SQL 에서 직접 채운다. 시각 칸은 `SCHED_AT` 을 빼고 모두 `TIMESTAMP(6)`(KST)이다.

### 3.1 `TB_MCM_JOB_DEF` 작업 정의

| 칸 | 형식 | 설명 |
|---|---|---|
| `JOB_ID` | varchar2(60) PK | `[A-Za-z0-9_.-]{1,60}`(콜론 금지). 관례 `<모듈 소문자>.<이름>`(예: `mdm.masterSync`) |
| `MODULE_CD` | varchar2(10) | 실행 모듈 `MCM`·`MDM`·`MPP`·`MLS`·`MQC`·`MPN`(CHECK) |
| `JOB_NM` | varchar2(100) | 이름 |
| `JOB_KIND` | varchar2(10) | 화면 입력 양식 `CODE`·`BPMN`·`QUERY`·`COLLECT`(CHECK). 실행은 `SERVICE_ID` 로 한다 |
| `SERVICE_ID` | varchar2(200) | **실행할 OASIS 서비스 ID.** BPMN 은 사용자가 고른 ID, 나머지는 내장 서비스 ID(§5.1). 저장할 때 유형에서 정한다 |
| `ACTION` | varchar2(50) | 서비스 Action. 내장 서비스는 `run` |
| `CRON_EXPR` | varchar2(100) | crontab 5칸 식(§4.0) |
| `USE_YN` | char(1) | `Y`·`N` |
| `CONFIG_JSON` | clob | 내장 서비스 입력(쿼리 문장·수집 원천·처리기 ID). BPMN 은 null |
| `VARS_JSON` | clob | 변수 목록 `[{name, type, value, desc}]`(§5.0) |
| `TIMEOUT_SEC` | number(6) | 시간 초과(초). 유형별 기본값(§5.1) |
| `NEXT_RUN_AT` | timestamp(6) | 다음 예정 시각. 선점의 기준 |
| `JOB_DESC` | varchar2(500) | 설명 |
| `OWNER_TP` | varchar2(10) | `CODE`(코드 등록)·`USER`(화면 등록) |
| `OPTS_JSON` | clob | 고급 설정: 재시도 `{retry:{count,intervalMin}}`(D12) |

- 인덱스: `(MODULE_CD, USE_YN)`, 매분 조회용 `IX_TB_MCM_JOB_DEF_DUE (USE_YN, NEXT_RUN_AT)`.

### 3.2 `TB_MCM_JOB_RUN` 실행 기록

| 칸 | 형식 | 설명 |
|---|---|---|
| `JOB_ID` | varchar2(60) PK1 | |
| `SCHED_AT` | timestamp(0) PK2 | 예정 시각(초 단위). 일정 회차는 `NEXT_RUN_AT`, 「지금 실행」은 요청 시각. **넣기 전에 초 단위로 버린다**(`TIMESTAMP(0)` 은 소수 초를 반올림한다 — f1ed4d268 실측) |
| `TRIGGER_TP` | char(1) PK3 | `S`(일정)·`M`(지금 실행) |
| `RUN_ID` | varchar2(36) UNIQUE | 실행 하나의 ID(UUID). 호출·결과 갱신의 키 |
| `MODULE_CD` | varchar2(10) | |
| `SERVICE_ID` | varchar2(200) | 이 회차에 실행한 서비스 ID(정의가 바뀌어도 이력이 정확하도록) |
| `SERVER_NM` | varchar2(100) | 접수한 모듈 서버(`호스트:앱이름:pid`) |
| `SERVICE_TAG` | varchar2(40) | 모듈 업무 로그의 `service_tag`. 이력 화면에서 모듈 로그를 찾는 열쇠 |
| `STATUS` | varchar2(8) | `RUN`·`OK`·`FAIL`·`SKIP`·`TIMEOUT`(CHECK) |
| `STARTED_AT`·`ENDED_AT` | timestamp(6) | 시작은 MCM 이 선점한 시각, 끝은 모듈이 결과를 쓴 시각 |
| `ITEM_CNT` | number(10) | 처리 건수 |
| `MSG` | varchar2(500) | 실패·건너뜀 사유. 주소·인증값·DB 원문 메시지는 넣지 않는다 |
| `REQ_USR_ID` | varchar2(100) | 「지금 실행」을 요청한 사용자 |
| `TIMEOUT_SEC` | number(6) | 이 회차에 적용한 시간 초과 |
| `VARS_JSON` | clob | 이 회차에 넘긴 변수 확정값 |

- PK `(JOB_ID, SCHED_AT, TRIGGER_TP)` 는 **이중 안전장치**다. 행 잠금으로 한 MCM 인스턴스만 잡지만 같은 회차를 두 번 INSERT 하면 PK 위반으로 막힌다.
- 인덱스: `(STATUS, STARTED_AT)`, `(STARTED_AT)`, `(JOB_ID, SCHED_AT DESC)`, UNIQUE `(RUN_ID)`.

### 3.3 `TB_MCM_JOB_COLLECT_DATA` 수집 값

기존 `TB_MCM_WIDGET_COLLECT_DATA` 와 같은 모양이고 키만 `WIDGET_ID` → `JOB_ID` 로 바뀐다.
PK `(JOB_ID, SLOT varchar2(12), ITEM_KEY varchar2(100))`, `VALUE_NUM number(24,8)`, `VALUE_TXT varchar2(200)`, 인덱스 `(SLOT)`.

- 위젯 수집 표를 재사용하지 않고 새 표를 둔다. 위젯과 JOB 은 관계가 없고 키 이름(`WIDGET_ID`)과 뜻이 어긋난다.
- 기존 `TB_MCM_WIDGET_COLLECT_RUN`·`_DATA` 는 V4(`V4__drop_widget_collect_tables.sql`)로 지운다(사용자 삭제 승인 2026-10-09, 삭제 전 L_MAIN 0행 확인).

### 3.4 `TB_MCM_JOB_HANDLER` 코드 처리기

| 칸 | 형식 | 설명 |
|---|---|---|
| `HANDLER_ID` | varchar2(60) PK | `ScheduledJob.id()` |
| `MODULE_CD` | varchar2(10) | 처리기가 있는 모듈(CHECK) |
| `HANDLER_NM` | varchar2(100) | `ScheduledJob.name()` |
| `DEFAULT_CRON` | varchar2(100) | 기본 일정(없으면 null = 화면에서 골라 쓰는 처리기) |
| `VARS_JSON` | clob | 기본 변수 |
| `SEEN_AT` | timestamp(6) | 그 모듈 앱이 마지막으로 기동하며 등록한 시각(7일 넘으면 화면에 「코드 없음」) |

- 모듈 앱이 기동할 때 자기 `ScheduledJob` 빈을 모두 MERGE 한다(§5.2). 화면의 「코드 실행」 처리기 목록과 「코드 없음」 배지가 이 표를 읽는다.
- 이전 설계의 `TB_MCM_JOB_DEF.CODE_SEEN_AT` 은 이 표의 `SEEN_AT` 으로 옮긴다.

### 3.5 모듈 DB 사용자 권한(V3 끝의 GRANT)

- 모듈 앱(MDM·MPP·MLS·MQC·MPN)은 자기 스키마 사용자로 접속하므로 MCMAPUSER 표에 권한이 있어야 한다.
  - `TB_MCM_JOB_RUN`: `SELECT, UPDATE`(WHERE 에 칸을 쓰므로 SELECT 도 필요).
  - `TB_MCM_JOB_COLLECT_DATA`: `SELECT, INSERT, UPDATE`(MERGE).
  - `TB_MCM_JOB_DEF`: `SELECT, INSERT, UPDATE`(코드 작업 등록 MERGE).
  - `TB_MCM_JOB_HANDLER`: `SELECT, INSERT, UPDATE`(처리기 등록 MERGE).
- V3 끝에 `GRANT … ON <표> TO MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;` 로 적는다. 표 주인(MCMAPUSER)으로 실행되는 V 파일이라 줄 수 있다. 같은 방식의 선례: caravan-hub `ifuser/V1__sample_if_table.sql` 의 `GRANT SELECT, INSERT, UPDATE ON … TO EAIUSER`.
- mls 의 기존 MCMAPUSER 접근(공지 표)은 GRANT·시노님 없이 된다. 로컬 PDB 는 모든 스키마 사용자에게 `SELECT·INSERT·UPDATE·DELETE ANY TABLE` 을 주기 때문이다(docs/oracle-1007/schema-owners.md §2, 「운영의 교차 스키마 GRANT 를 간략하게 대신하는 로컬 전용 설정」). 운영의 교차 스키마 권한은 DBA 가 준다. 그래서 로컬(L_MAIN 포함, 사용자별 스키마)에서는 GRANT 가 없어도 돌지만, 운영 DBA 가 같은 V 파일로 권한을 주도록 GRANT 를 V3 에 함께 둔다. 시노님은 쓰지 않고 SQL 에 스키마 접두를 붙인다.
- 적용은 구현 때 조정자 허가 뒤다(V3 는 mcm 재기동 때 L_MAIN 에 적용된다, §10).

## 4. 일정·선점·호출

### 4.0 crontab 식

- 5칸 `분 시 일 월 요일`, 시간대 Asia/Seoul. 리눅스 crontab 과 같게 `*`·`,`·`-`·`/`, 월·요일 영문 이름(`JAN`·`MON`), 요일 `0`·`7`=일요일, 매크로 `@hourly`·`@daily`·`@weekly`·`@monthly`·`@yearly` 를 받는다.
- 계산은 Spring `CronExpression` 에 초 칸 `0` 을 앞에 붙여 맡긴다. Spring 만 받는 문법(`?`·`L`·`W`·`#`, 6칸 식)은 저장 검사에서 거절한다.
- **crontab 과 다른 점 하나**: crontab 은 `일`·`요일` 이 둘 다 `*` 가 아니면 OR 인데 Spring 은 AND 다. 둘을 함께 제한한 식은 저장 때 거절하고 하나는 `*` 로 쓰게 안내한다.
- 화면은 「쉬운 설정」(반복 종류별 칸)과 「직접 입력」(다섯 칸)으로 식을 만들고, 설명과 다음 예정 5개는 서버(`cronPreview`)가 계산한다.
- 수집 작업의 간격 하한(기존 규칙 유지): 연속한 두 실행 간격 5분 이상, 환율은 60분 이상. 다른 유형은 1분 간격도 쓸 수 있다.

### 4.1 MCM 매분 판정(트리거 + BPMN 서비스 `jobDispatch`, MCM 앱만)

1. **트리거**: `JobDispatchTrigger` 의 `@Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")` 가 매분 0초에 깨어난다. 공용 스케줄러(cactus-core `JobLoggingTaskScheduler`)를 그대로 쓰므로 cactus-core `scheduling` 을 바꾸지 않는다. 트리거는 판정을 하지 않고 BPMN 서비스만 부른다.
2. **판정 BPMN 기동**: 진입점(§4.4)·DMOM 수신 디스패처와 같은 방식으로 `serviceStarter.start("jobDispatch", sc)` 를 직접 부른다.
   - 감사 주체 `CactusAudit("SCHEDULER", menuId="JOB_DISPATCH", serviceId)` 를 `AuditHolder`·`sc.setAudit` 에 넣는다.
   - 입력: `action=run`, `batchSize`(기본 50, `dmes.job.server.batch-size`), `collectEnabled`.
   - 판정 실행 표시 `JobDispatchScope`(ThreadLocal)를 열고 끝나면 닫는다. 판정 몸체는 이 표시가 없으면 거절한다(§8).
   - 웹 요청을 거치지 않으므로 `OasisServiceExecutor` 를 쓰지 않는다. 대신 그와 같은 `jobDispatch/run` 줄과 `Service end - service name [jobDispatch] RunTime : […]` 줄을 남긴다.
3. **BPMN 서비스 `jobDispatch`**(파일 `mcm/api/src/main/resources/services/job/jobDispatch.bpmn`, MCM 앱에만 있음): 서비스 태스크 하나(`camunda:class="jobDispatchService"`, `method="claimDue"`, `output="claimed"`)가 Java 몸체(mcm-core `server` 패키지)를 부른다. 몸체가 하는 일:
   - **색인 조회**: 아래 SQL 로 지금 할 작업 ID 를 `batchSize` 개까지 읽는다(잠금 없는 조회라 `FETCH FIRST` 를 쓸 수 있다). **빈 결과면 바로 끝낸다**(평소 매분 이 SQL 한 번이 전부다).
   - 있으면 같은 트랜잭션에서 선점한다(§4.2).
   - 출력 `claimed = { runs:[{runId, jobId, module, serviceId, action, inputs, config, timeoutSec, retry, schedAt}], more }`. `more` 는 조회 건수가 `batchSize` 와 같을 때 true.
   - 트랜잭션은 OASIS 가 서비스마다 연다(`CoreServiceStarter` → `transactionHandler`). `serviceStarter.start` 가 돌아오면 **이미 커밋되어 있다.**
4. **호출은 BPMN 트랜잭션 밖**: 트리거가 결과의 `runs` 를 호출 풀(§4.3)에 넘긴다. HTTP 를 기다리는 동안 행 잠금·DB 연결을 쥐지 않는다.
5. **50개 묶음은 BPMN 바깥(트리거)에서 되풀이한다.** `more=true` 이면 트리거가 `jobDispatch` 를 다시 부른다(한 틱 최대 10번 = 500건). 묶음마다 BPMN 한 번 = 트랜잭션 한 번 = 커밋 뒤 호출이다. 그래서 잠근 행은 늘 그 트랜잭션 안에서 다 처리되고, BPMN 하나가 오래 잠금을 쥐지 않는다.
6. **실패**: 결과가 `SUCCESS` 가 아니거나 예외면 OASIS 가 롤백했으므로 선점한 것이 없다. 트리거는 WARN 한 줄(결과 코드만)을 남기고 그 분은 건너뛴다. 다음 분에 다시 한다. 연속 실패는 첫 번째만 WARN, 복구 때 INFO 한 줄.
7. JOB 정의 캐시는 두지 않는다(사용자 결정 22). 화면 저장은 커밋되면 다음 분 틱부터 반영되고, MCM 이 몇 대든 같다.

```sql
SELECT JOB_ID
  FROM MCMAPUSER.TB_MCM_JOB_DEF
 WHERE USE_YN = 'Y'
   AND NEXT_RUN_AT <= CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP) + INTERVAL '30' SECOND
   AND (JOB_KIND <> 'COLLECT' OR :collectEnabled = 'Y')
 ORDER BY NEXT_RUN_AT
 FETCH FIRST :batchSize ROWS ONLY
```

- 색인 `IX_TB_MCM_JOB_DEF_DUE (USE_YN, NEXT_RUN_AT)` 를 탄다. 정의 표는 작고(수십~수백 행) 자주 읽혀 DB 버퍼 캐시에 머문다. 분당 MCM 대수만큼의 색인 범위 조회라 부담이 없다.
- 30초 여유는 틱이 0초보다 조금 늦거나 이르게 깨어나도 그 분의 회차를 잡게 한다. COLLECT 작업은 `dmes.job.collect.enabled` 가 true 일 때만 고른다.

### 4.2 선점(`jobDispatch` 트랜잭션 안)

```sql
SELECT JOB_ID, MODULE_CD, SERVICE_ID, ACTION, CRON_EXPR, TIMEOUT_SEC, NEXT_RUN_AT,
       CONFIG_JSON, VARS_JSON, OPTS_JSON,
       CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP) AS DB_NOW
  FROM MCMAPUSER.TB_MCM_JOB_DEF
 WHERE JOB_ID IN (:ids)
   AND USE_YN = 'Y'
   AND NEXT_RUN_AT <= CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP) + INTERVAL '30' SECOND
   FOR UPDATE SKIP LOCKED
```

- `:ids` 는 §4.1 의 조회 결과다. 호출에 쓰는 값(서비스 ID·설정·변수·시간 초과)은 이 잠근 행에서 읽는다. 조회와 잠금 사이에 다른 MCM 이 올렸거나 사용 안 함으로 바뀐 행은 WHERE 가 다시 걸러 내거나 SKIP LOCKED 로 건너뛴다.
- 잠그는 SQL 에는 행 수 제한(`FETCH FIRST`·`ROWNUM`)을 넣지 않는다(`FOR UPDATE` 와 함께 쓰면 ORA-02014 또는 잠금 전 잘림). 개수는 앞의 잠금 없는 조회가 `batchSize` 로 이미 제한했다. 잠근 행은 모두 그 트랜잭션에서 처리하므로, 잠가 놓고 처리하지 않아 다른 MCM 도 못 잡는 행이 생기지 않는다.
- 잡은 행마다:
  1. **늦은 회차**: `DB_NOW - NEXT_RUN_AT > 2분` 이면 따라잡지 않고 `SKIP`("놓친 회차를 건너뜀") 1건만 남긴다.
  2. **겹침**: 같은 작업에 `STATUS='RUN'` 이고 `STARTED_AT + TIMEOUT_SEC + 정리 여유(300초) > DB_NOW` 인 행이 있으면 `SKIP`("이전 회차 실행 중")을 남긴다.
  3. 둘 다 아니면 `RUN` 을 INSERT 한다(`SCHED_AT`=`NEXT_RUN_AT` 초 단위, `RUN_ID`=새 UUID, `SERVICE_ID`, `STARTED_AT`=`DB_NOW`, `TIMEOUT_SEC`, 확정한 `VARS_JSON`). PK 위반이면 건너뛴다.
  4. RUN·SKIP·FAIL 기록 INSERT 가 PK 중복이면 그 기록만 건너뛰고 `NEXT_RUN_AT` 은 그대로 올린다(같은 회차로 NEXT_RUN_AT 이 되돌아와도 판정 묶음 전체가 롤백되지 않게). 정의가 깨진 행(crontab 다음 시각 없음·변수 JSON 손상)은 그 행만 FAIL 로 닫고 묶음은 계속한다.
  5. `NEXT_RUN_AT` 을 `max(NEXT_RUN_AT, DB_NOW)` 보다 엄격히 뒤인 crontab 식의 첫 시각으로 올린다.
- 변수 값 확정(§5.0)은 MCM 이 이 트랜잭션에서 한다. 날짜 변수는 `SCHED_AT` 기준이다(§5.0). `:prevRunAt` 은 그 변수를 쓰는 작업만 `SELECT MAX(SCHED_AT) … WHERE JOB_ID=:id AND STATUS='OK' AND TRIGGER_TP='S'` 로 읽는다(「지금 실행」으로 지난 기간을 다시 돌려도 일정 회차의 구간이 당겨지지 않게).
- DB 시계는 늘 `CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)` 로 읽는다. 회차 키는 서버 시계가 아니라 DB 에 적힌 `NEXT_RUN_AT` 으로 만든다.

### 4.3 MCM → 모듈 호출(비동기 접수)

- 호출 풀: MCM 앱 전용 `ThreadPoolExecutor`(스레드 8, 대기열 200). 호출 풀 스레드는 트리거 스레드의 MDC 를 물려받지 않는다(logback MDC 는 스레드마다 따로). 호출 한 건을 `MDCTemplate`(새 `service_tag`)으로 감싸고 MDC `serviceId=jobDispatch`·`runId` 를 넣는다. `sch.` 태그로 감싸지 않으므로 호출 로그와 접수 응답 뒤 `UPDATE` SQL(트랜잭션 없는 JdbcTemplate 한 문장)은 **mcm 업무 로그**에 남고, 로그 뷰어에서 `jobDispatch` 서비스로 찾힌다. 판정 로그와는 `runId` 로 잇는다(§4.8).
- 요청: `POST {모듈 base-url}/internal/job/run`
  `{ runId, jobId, module, serviceId, action, inputs(변수 확정값), config(CONFIG_JSON), timeoutSec, retry, schedAt, manual, reqUserId }`
- 시간 초과: 연결 2초, 읽기 5초. 모듈은 실행을 기다리지 않고 바로 답하므로 5초면 충분하다.
- 응답과 MCM 처리

| 모듈 응답 | 뜻 | MCM 처리 |
|---|---|---|
| 202 `{accepted:true, serverNm}` | 접수 | `UPDATE … SET SERVER_NM = NVL(SERVER_NM, :srv) WHERE RUN_ID=:runId` — **STATUS 는 건드리지 않는다**(먼저 끝난 모듈의 결과 갱신과 경합하지 않게) |
| 200 `{duplicate:true}` | 같은 runId 를 이미 접수함 | 접수와 같게 처리 |
| 503 `JOB_POOL_FULL` | 실행 풀 가득 | `UPDATE … SET STATUS='SKIP', MSG='실행 풀 가득' WHERE RUN_ID=:runId AND STATUS='RUN'` |
| 409 `JOB_RUNNING` | 같은 서버에서 같은 작업 실행 중 | `SKIP` "같은 서버에서 실행 중" |
| 404 `JOB_HANDLER_NOT_FOUND` | 코드 작업 처리기 없음 | `FAIL` "처리기 없음" |
| 연결 거부·주소 없음·그 밖의 4xx | 확실히 접수 안 됨 | `FAIL` "모듈 호출 실패(종류만)" |
| **읽기 시간 초과·5xx(503 제외)** | 접수됐는지 모름 | **`RUN` 으로 둔다.** WARN 1줄. 판정은 모듈의 결과 갱신이나 정리(§4.6)에 맡긴다 |

- **MCM 은 /run 호출을 재시도하지 않는다.** 읽기 시간 초과를 FAIL 로 바꾸면, 모듈이 실제로 접수해 끝낸 OK 갱신이 `WHERE STATUS='RUN'` 에서 0행이 되어 돈 작업이 FAIL 로 남는다. 그래서 확실한 거절만 그 자리에서 닫는다.
- 모듈 서버가 여러 대이면 base-url 은 LB 주소다. LB 가 고른 서버의 풀이 가득이면 다른 서버가 비어 있어도 그 회차는 `SKIP` 이다(LB 는 라운드 로빈 권장).
- **운영 요건: LB 는 `/internal/job/run` 을 다른 서버로 재시도하지 않는다**(nginx `proxy_next_upstream off` 등). 모듈의 최근 runId 맵은 서버마다 따로라 같은 서버 안의 중복만 막는다. LB 가 실패한 POST 를 다른 서버로 다시 보내면 같은 회차가 두 서버에서 돈다.
- MCM 앱 자신의 작업은 `LocalJobRunGateway` 로 접수 서비스를 같은 프로세스에서 직접 부른다(HTTP 없음). 실행은 접수 쪽 실행 풀 스레드에서 돌므로 트리거·호출 풀의 MDC 를 물려받지 않는다.

### 4.4 모듈 쪽 접수와 예약 실행 진입점

**접수(`JobRunController`, 모든 모듈 앱, mcm-core `agent`)**

1. 인증 주체가 `system:mcm`, 역할 `SYSTEM` 인지 확인한다(아니면 403). 컨트롤러 안에서 검사하므로 cactus-core security 설정은 바꾸지 않는다.
2. 요청의 `module` 이 이 앱의 모듈 키와 다르면 400.
3. 최근 접수 runId(메모리, 1시간)에 있으면 200 `duplicate`.
4. CODE 작업이면 처리기 빈이 이 앱에 있는지 본다. 없으면 404 `JOB_HANDLER_NOT_FOUND`.
5. 같은 jobId 가 이 서버에서 실행 중이면 409 `JOB_RUNNING`.
6. 실행 풀(앱마다 `ThreadPoolExecutor`, 스레드 `dmes.job.pool-size` 기본 4, 대기열 0)에 넣는다. 거절되면 503 `JOB_POOL_FULL`.
7. 202 `{accepted:true, serverNm}` 로 답한다. 실행은 기다리지 않는다.
8. 진입점 빈이 없는 앱(쓸 DataSource 를 정하지 못해 예약 실행을 끈 앱)은 404 `JOB_AGENT_UNAVAILABLE`.
9. 요청 값이 잘못되면(runId·jobId·serviceId 빈 값, schedAt 없음·ISO 아님) 400.

**예약 실행 진입점(`JobRunDispatcher`, cactus-core 새 클래스) — 새 서비스 유형**

`DmomReceiveDispatcher` 와 같은 패턴이다: 웹 요청 없이 `serviceStarter.start(serviceId, sc)` 를 부른다. 다른 점은 진입이 MCM 호출이라는 것, 그리고 **실행 결과를 진입점이 DB 에 자동으로 갱신한다**는 것이다.

1. **MDC**: 실행 스레드에서 `service_tag`(4자리)·`serviceId`(대상 서비스 ID)·`txId`·`runId` 를 넣는다. serviceId 는 `sch.` 로 시작하지 않으므로 이 실행의 로그는 **그 모듈의 업무 로그**로 간다.
2. **시작·끝 줄**: `OasisServiceExecutor` 와 같은 `{serviceId}/{action}` 줄과 `Service end - service name [...] RunTime : [...]` 줄을 남긴다. analog 서비스 목록이 그대로 읽는다.
3. **감사 주체**: 예약 실행은 `SCHEDULER`, 「지금 실행」은 요청한 사용자. `CactusAudit(user, menuId=JOB_ID, serviceId)` 를 `AuditHolder` 와 `sc.setAudit` 에 넣는다(DMOM 디스패처와 같음). `UserContextHolder` 도 실행 전후로 넣고 비운다(§5.3).
4. **실행 범위 열기**: `JobRunScope`(ThreadLocal)에 runId·jobId·설정(config)·건수·수집 값 버퍼를 둔다.
5. **실행**: 입력 맵(`action` + 변수 확정값)으로 `serviceStarter.start(serviceId, sc)` 를 부른다. 대상 서비스는 자기 트랜잭션에서 돈다(`CoreServiceStarter` → `transactionHandler`, 바깥 트랜잭션 없음). 진입점 자체는 `@Transactional` 이 없는 평범한 Java 라 트랜잭션 밖이다.
6. **결과 판정**: `SUCCESS` 이면 `OK`. 아니면 `FAIL` 이고 MSG 에는 결과 코드와 사용자용 메시지만 넣는다(`SYSTEM_ERROR` 는 예외 종류 이름만). 건수는 `JobRunScope` 에 쌓인 값, 없으면 서비스 출력 `jobItemCnt`, 둘 다 없으면 null.
7. **재시도**(OPTS `retry`): FAIL 이면 실행 스레드에서 잠들지 않고 `intervalMin` 분 뒤 같은 회차를 실행 풀에 **새로 넣는다**(최대 `count` 회). 넣을 때 풀이 가득이면 그때까지의 FAIL 을 기록한다. 시도마다 범위의 건수·수집 버퍼를 비운다. 결과 갱신은 마지막 시도 뒤 한 번이고 MSG 에 「재시도 n/N」을 덧붙인다.
8. **결과 자동 갱신**: `JobRunResultWriter` 가 RUN 행을 DB 에 직접 갱신한다(§4.5). MCM 앱도 같은 코드다.
9. **범위 닫기**: `finally` 에서 `JobRunScope`·`AuditHolder`·`UserContextHolder`·MDC 를 비운다.

**시간 초과**

- 회차마다 실행 스레드와 감시가 **함께 보는 상태 객체**(`AtomicReference`: `RUNNING`·`DONE`·`TIMED_OUT`)를 둔다. ThreadLocal 인 `JobRunScope` 는 감시 스레드가 볼 수 없으므로 이 판정에 쓰지 않는다.
- 감시는 **시도마다** 그 시도를 풀에 넣을 때 `timeoutSec` 으로 건다(재시도 대기 시간은 감시하지 않는다).
- 실행이 끝나면 `RUNNING→DONE`, 감시가 마감에 닿으면 `RUNNING→TIMED_OUT` 으로 `compareAndSet` 한다. **교체에 이긴 쪽만 결과를 쓴다.** 감시는 이긴 뒤에만 `cancel(true)`(인터럽트)하고 `TIMEOUT` 을 쓴다(감시 스레드도 MDC 에 대상 serviceId·runId 를 넣어 모듈 업무 로그에 남긴다). 그래서 인터럽트로 생긴 SYSTEM_ERROR 결과(FAIL)나 마감 직전의 OK 와 TIMEOUT 이 함께 나가지 않는다.
- 진입점은 `Throwable` 을 잡아 FAIL 로 쓴다(`CoreServiceStarter` 는 `Exception` 만 결과로 바꾸므로 `Error` 는 그대로 올라온다).
- 인터럽트는 실행 중인 JDBC 문장을 멈추지 못한다. 인터럽트를 무시한 문장이 TIMEOUT 기록 뒤에 끝나 대상 트랜잭션이 늦게 커밋되는 일을 줄이려고, **내장 서비스는 JDBC 문장마다 쿼리 시간 초과를 건다**(사용자 결정, 보충 6).
  - 대상: `jobQuery`(DML·프로시저)와 `jobCollect` 의 SQL 원천(읽기).
  - 값: `JobRunScope` 에 둔 이 시도의 마감 시각(`시도 시작 + timeoutSec`)까지 **남은 시간을 초 단위로 올림, 최소 1초**. `JdbcTemplate` 을 문장마다 `setQueryTimeout(남은 초)` 로 만들어 쓰거나 `PreparedStatement.setQueryTimeout` 을 직접 건다. 수집 SQL 원천은 기존 읽기 전용 실행기의 10초 상한과 남은 시간 중 작은 값을 쓴다.
  - 초과하면 Oracle 이 문장을 취소하고 `ORA-01013`(사용자 요청으로 취소)을 던진다. 내장 서비스는 예외를 그대로 올리고, `CoreServiceStarter` 가 대상 트랜잭션 A 를 롤백한 뒤 `SYSTEM_ERROR` 결과를 돌려준다. 그래서 그 시도의 DML 은 남지 않는다.
  - 진입점은 결과의 예외 원인이 쿼리 시간 초과(`SQLTimeoutException`·`QueryTimeoutException`·`ORA-01013`)이면 상태를 FAIL 이 아니라 **TIMEOUT** 으로 정한다.
  - 감시와의 순서: 쿼리 시간 초과와 Future 감시는 같은 마감 시각을 보므로 거의 동시에 일어난다. **어느 쪽이 먼저든 회차 상태 객체의 CAS 를 이긴 쪽만 TIMEOUT 을 한 번 쓴다.** 감시가 이기면 실행 스레드의 결과(롤백된 SYSTEM_ERROR)는 쓰지 않는다. 실행 스레드가 이기면 감시는 아무것도 하지 않는다.
  - 업무 BPMN·CODE 작업은 강제하지 않는다. 가이드에 「긴 SQL 은 쿼리 시간 초과를 걸 것」 한 줄을 둔다. 그런 작업은 TIMEOUT 기록 뒤에도 끝까지 돌아 커밋할 수 있고, 기록은 TIMEOUT 으로 남으며 늦은 결과는 덮어쓰지 않는다.
- **OASIS `timeoutSecond` 로는 대신할 수 없다**(코드 확인): ① 값이 `CactusServiceStarterFactory.TIMEOUT_SECONDS=50` 으로 전역 고정이다. ② `createNewService=true` 서브서비스에만 쓰인다. ③ 시간을 넘기면 `shutdownNow` 뒤 `serviceResults[0].messages()` 를 읽어 결과가 null 이면 NPE 가 난다. oasis-core 는 고치지 않는다.

**중첩: 결과 갱신은 가장 바깥 한 번만**

- 결과 갱신 코드는 **진입점 Java 클래스(와 그것이 부르는 `JobRunResultWriter`)에만** 있다. BPMN 서브서비스(`SubServiceCallTask`)는 `serviceStarter`·`ProcessStarter` 로 바로 들어가고 진입점을 다시 지나지 않는다. 그래서 서비스를 몇 겹으로 감싸도 안쪽 서비스는 결과를 쓸 길이 없다. 내장 서비스도 결과 갱신 코드를 갖지 않고, 건수·수집 값을 `JobRunScope` 에 쌓기만 한다.
- **진입점은 범위가 이미 열려 있으면 거절한다**(예외, 결과 갱신 없음). 같은 스레드 재진입을 허용해 대상만 부르면 안쪽 `serviceStarter.start` 가 바깥 트랜잭션까지 커밋하고(`CactusSpringTransactionHandler.commitAll`), `CoreServiceStarter` 의 `AuditHolder.remove()` 와 진입점 finally 가 바깥 감사 주체·범위를 지워 바깥 회차가 깨진다. 서비스 중첩은 연결 서브서비스로만 한다. 진입점의 공개 진입은 agent 접수(`JobRunController`·`LocalJobRunGateway`)뿐이다.
- MDC 로 판별하지 않는다. `MDCTemplate.mdc()` 가 `finally` 에서 `MDC.clear()` 로 전부 지우고, `createNewService` 서브서비스는 새 스레드에 `service_tag` 만 넘기기 때문이다.
- 내장 서비스는 **같은 스레드의 연결 서브서비스**(기본값)로 불릴 때만 범위를 본다. `createNewService=true`·병렬 다중 인스턴스·병렬 게이트웨이(`ParallelGatewayExecutable` 도 새 스레드)처럼 다른 스레드에서 불리면 범위가 없으므로 「예약 실행 밖 호출」로 거절한다(§8). BPMN 작성 안내에 「내장 서비스는 createNewService·병렬 게이트웨이·병렬 다중 인스턴스 안에서 부르지 말 것(범위 없음, createNewService 는 50초 상한·NPE)」을 적는다.

### 4.5 실행 결과 DB 직접 갱신(모듈, `JobRunResultWriter`)

- 위치: cactus-core `job` 패키지 한 곳. 모듈 업무 코드는 표 구조를 모른다. 스키마 접두는 `dmes.job.schema`(기본 `MCMAPUSER`).
- 연결: **그 모듈 앱의 기본 DataSource**(자기 스키마 사용자 연결, 멀티 트랜잭션 모드면 `cactus.tx.default-manager` 의 연결). 별도 연결 풀을 만들지 않는다.
- 트랜잭션: 대상 서비스 트랜잭션과 **분리된 짧은 트랜잭션**(`TransactionTemplate`, `REQUIRES_NEW`). `serviceStarter.start` 가 돌아올 때 대상 트랜잭션은 이미 커밋·롤백이 끝났으므로, 대상이 롤백돼도 FAIL 기록은 남는다.
- **실패하면 트랜잭션은 이렇게 된다**(사용자 질문 「모듈에서 처리에 실패하면 트랜잭션은 어떻게 되는거야? 실패 기록을 남겨야 하잖아」):
  - 대상 서비스가 예외로 끝나면 `CoreServiceStarter` 가 대상 트랜잭션 A 를 **롤백**하고 실패 결과를 돌려준다. 그 시도에서 A 안에 쓴 내용은 남지 않는다(연결 서브서비스로 엮은 단계도 A 안이라 함께 롤백된다).
  - 진입점은 A 와 **분리된 트랜잭션 B**(`REQUIRES_NEW`)로 RUN 행에 `FAIL`·메시지(결과 코드와 사용자용 메시지, 원문 DB 메시지 없음)를 쓰고 커밋한다. A 가 롤백돼도 실패 기록은 남는다.
  - 예외: A 밖에서 이미 커밋된 것은 남는다. `createNewService=true` 로 부른 업무 서브서비스(자기 트랜잭션으로 따로 커밋), OASIS 의 커밋 요청 이벤트(`CommitTransactionAskedEvent` → `commitAndRestartTransaction`)로 묶음마다 중간 커밋하는 작업, `alwaysCommit` 트랜잭션 관리자로 쓴 내용이 그렇다. 이런 작업은 다시 돌려도 결과가 같게(멱등) 만든다.
  - 실패 기록 자체가 실패하거나(DB 순간 오류가 5초 뒤 재시도에도 계속) 모듈 서버가 도중에 죽으면 RUN 행이 열린 채로 남는다. 이 행은 정리(§4.6)가 `STARTED_AT + TIMEOUT_SEC + 300초` 뒤 `TIMEOUT` 으로 닫는다.
- 한 트랜잭션에서:
  1. `UPDATE <schema>.TB_MCM_JOB_RUN SET STATUS, ITEM_CNT, MSG, ENDED_AT=DB 시각, SERVER_NM=NVL(SERVER_NM,:srv), SERVICE_TAG=:tag WHERE RUN_ID=:runId AND STATUS='RUN'`.
  2. 1행이고 `OK` 이며 수집 값이 있으면 같은 트랜잭션에서 `TB_MCM_JOB_COLLECT_DATA` 에 MERGE 한다. 수집 값은 상태가 바뀌는 그 한 번만 저장된다.
  3. 0행이면 이미 `TIMEOUT`(정리)·`SKIP`(MCM 이 거절로 닫음)으로 닫힌 행이다. 덮어쓰지 않고 「늦은 결과」 WARN 한 줄을 남긴다.
- 갱신이 실패하면(DB 순간 오류) 5초 뒤 한 번 더 한다. 그래도 실패하면 WARN 하고 버린다. 그 행은 정리가 `TIMEOUT` 으로 닫는다. 재전송 대기열은 두지 않는다.
- 이 SQL 은 실행 스레드의 MDC(대상 serviceId) 아래에서 돌아 **모듈 업무 로그**에 남는다.
- 모듈이 RUN 행을 직접 쓰므로, MCM 의 접수 기록 UPDATE(`SERVER_NM` 만)와 모듈의 결과 UPDATE(`WHERE STATUS='RUN'`)가 순서 없이 와도 최종 상태는 모듈 결과다(§4.3).

### 4.6 정의 캐시 없음과 정리

- **JOB 정의 WAS 캐시는 쓰지 않는다**(사용자 결정 22). 근거: 매분 MCM 한 대당 색인 조회 한 번이면 되고(§4.1), 정의 표는 DB 버퍼 캐시에 머문다. 캐시를 두면 MCM 여러 대 사이의 무효화(버전 표·evict 알림·적재 세대 번호·주기 재적재)가 필요한데, 캐시를 없애면 그 문제가 모두 사라진다.
- 저장·사용 변경·삭제는 커밋되면 **다음 분 틱부터** 모든 MCM 에 반영된다. SQL 로 정의를 직접 고쳐도 같다. 「지금 실행」은 틱을 거치지 않는다(§4.9).
- 화면 목록·상세도 DB 에서 읽는다(SYSADMIN 화면이라 호출이 드물다).
- JOB 표가 없거나 DB 에 닿지 않아도 MCM 기동은 실패하지 않는다. 틱이 실패하면 연속 첫 번째만 WARN 하고 다음 분에 다시 시도한다.
- 후속(이 레인 범위 밖): 마스터코드·룰 등 다른 캐시를 여러 서버에서 맞추는 공통 방식(변경 기록 표 + 틱 확인)은 따로 다룬다.
- **정리**(`mcm.jobRunSweep`, MCM 코드 작업, 5분마다): `RUN` 이고 `STARTED_AT + TIMEOUT_SEC + 300초 < DB_NOW` → `TIMEOUT`("결과 없음 — 모듈 서버가 도중에 죽었을 수 있음"). 여유 300초 = 호출 풀 대기 상한(대기열 200 ÷ 스레드 8 × 호출 최대 7초 ≈ 175초) + 감시·DB 갱신 지연 여유. `STARTED_AT` 은 선점 시각이라 실제 시작보다 이르다. 결과 재전송 창이 없어졌으므로 이전의 900초에서 줄인다. 재시도 설정이 있는 회차는 MCM 이 INSERT 할 때 `TIMEOUT_SEC` 을 (timeoutSec + count × (timeoutSec + intervalMin 분))으로 기록한다.
- `TIMEOUT` 으로 닫힌 작업은 다음 회차를 막지 않는다. 그래서 작업 몸체는 같은 회차가 겹쳐도 결과가 같게(멱등) 만든다. 옮기는 기존 작업은 모두 멱등이다.

### 4.7 모듈과 서버 설정(호출 주소)

- 앱의 모듈 키는 `dmes.job.module`(비어 있으면 `spring.application.name` 의 첫 `-` 앞부분을 대문자로)이다.
- `dmes.job.agent.enabled`(기본 true): false 면 그 앱은 `/internal/job/run` 을 404 로 답한다.
- `dmes.job.server.enabled`: MCM 앱의 `application.yml` 에서만 true. JOB 표·스케줄러·API·화면 서비스 빈은 이 값이 true 일 때만 만든다.
- **MCM → 모듈 호출 주소**(사용자 「알아서 정해줘」 → 조정자 결정): 백엔드에는 모듈 간 호출 주소를 모아 둔 설정이 없다. 있는 것은 `cactus.mdm.base-url: ${MDM_WAS_URL:http://localhost:8096}`(MDM 하나)와 포털 BFF 의 `<모듈>_WAS_URL` 환경 변수 관례다. BFF 는 사용자 세션을 거쳐 `/api/…` 로만 전달하므로 서버 간 호출에 쓸 수 없다. 그래서 MCM `application.yml` 에 새 자리를 두되 **환경 변수 이름은 기존 관례를 재사용한다.**

```yaml
dmes:
  job:
    modules:
      mcm: { base-url: "${MCM_WAS_URL:http://localhost:8100}" }   # MCM 자신은 LocalJobRunGateway 로 직접 부르므로 쓰지 않음
      mdm: { base-url: "${MDM_WAS_URL:http://localhost:8096}" }
      mpp: { base-url: "${MPP_WAS_URL:http://localhost:8094}" }
      mls: { base-url: "${MLS_WAS_URL:http://localhost:8092}" }
      mqc: { base-url: "${MQC_WAS_URL:http://localhost:8093}" }
      mpn: { base-url: "${MPN_WAS_URL:http://localhost:8095}" }
```

  - 운영 프로필은 값 없이 자리만 둔다(환경 변수로 LB 주소). 워크트리 서버는 다른 포트를 쓰므로 환경 변수로 덮어쓴다.
  - 같은 이름의 환경 변수가 BFF 에서는 BFF 가 보는 주소를 뜻한다. 운영에서 BFF 와 MCM 이 같은 내부망 주소를 쓰면 그대로 맞고, 다르면 MCM 쪽만 `dmes.job.modules.<모듈>.base-url` 로 따로 준다.
- 모듈 → MCM HTTP 호출은 없다(결과·등록 모두 DB 직접). 그래서 모듈에는 MCM 주소·키 설정이 필요 없다. 모듈 쪽 설정은 `dmes.job.schema`(기본 `MCMAPUSER`) 하나다.
- MCM → 모듈 호출은 ClientKey 와 `system:mcm` 주체 헤더를 쓴다(본보기 cactus-core `mdm/MdmMetaClient`·`MdmClientProperties` 의 헤더 규칙). 키는 `cactus.security.client-key`·env `BACKEND_CLIENT_KEY`.
- `SERVER_NM` 은 `dmes.job.server-name`, 비어 있으면 `호스트이름:spring.application.name:pid`.

### 4.8 로그 위치

| 로그 | 어디서 | 파일 |
|---|---|---|
| 트리거 경계 두 줄(`sch.mcm.jobDispatchTrigger.tick/run`·`Service end`) | 공용 스케줄러 래퍼(`JobLoggingTaskScheduler`) | sch(그대로 둔다) |
| 판정·선점과 그 **SQL·bind 줄**, `jobDispatch/run`·`Service end` 줄 | BPMN `jobDispatch`(MDC serviceId=`jobDispatch`) | **mcm 업무 로그** |
| 모듈 호출·접수 결과·호출 실패와 접수 뒤 `UPDATE` SQL | MCM 호출 풀(MDC serviceId=`jobDispatch`, `runId`) | **mcm 업무 로그** |
| 「지금 실행」의 RUN INSERT | MCM 화면 요청 스레드(serviceId `jobSchedMng`) | MCM 업무 로그(화면 요청이므로). 이어지는 호출도 호출 풀이라 MCM 업무 로그 |
| 정리(`mcm.jobRunSweep`) | MCM 코드 작업(진입점 경유) | MCM 업무 로그 |
| **모듈에서 실행한 서비스 전체**(진입점 시작·끝 줄, 대상·서브서비스 로그)와 **결과 갱신 SQL**·늦은 결과 WARN | 각 모듈 `JobRunDispatcher`·`JobRunResultWriter` | **그 모듈 업무 로그** |
| 코드 작업·처리기 등록 MERGE | 각 모듈 기동(agent) | 그 모듈 업무 로그 |

- 이력 행의 `SERVER_NM`·`SERVICE_TAG` 로 모듈 로그를 찾아간다(analog 에서 서버·태그로 검색).
- **판정 로그는 mcm 업무 로그로**(사용자 결정 24): dev 의 sch 분리(`dmes-logback-base.xml`, `ScheduledJobLogFilter`)는 MDC `serviceId` 가 `sch.` 로 시작하는 줄만 sch 파일로 보낸다.
  - `@Scheduled` 트리거는 공용 스케줄러 래퍼가 `serviceId=sch.mcm.jobDispatchTrigger.tick` 과 `service_tag` 를 넣은 채로 실행된다. 트리거는 `jobDispatch` 를 부르기 전에 MDC 의 `serviceId`·`txId` 를 저장하고 `serviceId=jobDispatch`·새 `txId` 를 넣는다. 돌아오면 저장한 값으로 되돌린다. `MDCTemplate` 은 끝에 `MDC.clear()` 로 래퍼의 MDC 까지 지우므로 여기서는 쓰지 않는다.
  - 그래서 BPMN 안의 SQL·bind 줄(로컬 `JdbcTemplate` DEBUG·`StatementCreatorUtils` TRACE)은 serviceId `jobDispatch` 로 mcm 업무 로그에 남는다.
  - 트리거 경계 두 줄은 sch 로 간다. **그대로 둔다**: 「매분 트리거가 깨어났다」는 기록이라 sch 에 있어도 되고, 막으려면 공용 스케줄러 래퍼를 바꾸거나 전용 스케줄러를 둬야 한다. 판정 줄과 같은 `service_tag` 를 쓰므로 둘을 이을 수 있다.
  - 매분 SQL 이 mcm 로그에 남는 것은 사용자 선택이므로 로그 억제 장치는 두지 않는다. 빈 분에는 조회 SQL 한 줄과 서비스 경계 줄이 남는다.
- logback 설정은 바꾸지 않는다(sch 분리는 dev 에 이미 들어온 다른 레인 작업이다).

### 4.9 「지금 한 번 실행」

- 화면 요청(`jobSchedMng/runNow`)은 OASIS 서비스 트랜잭션 안에서 돈다. 그래서 RUN 행은 **별도 트랜잭션**(`TransactionTemplate`, `REQUIRES_NEW`)에서 만든다: 정의 행을 `FOR UPDATE`(대기 5초)로 잠그고, 같은 작업이 `RUN`(정리 여유 안)이면 거절한다. 아니면 `RUN` 을 INSERT 한다(`TRIGGER_TP='M'`, `SCHED_AT`=요청 시각(초), `REQ_USR_ID`, 화면에서 덮어쓴 변수). 그 트랜잭션을 커밋한 뒤 호출 풀에 넘긴다(§4.3). 바깥 서비스 트랜잭션에 합류하면 잠금을 쥔 채 호출하고, 서비스가 롤백되면 RUN 행 없이 모듈만 실행된다.
- 화면에는 접수 결과(접수·거절 사유)를 바로 돌려준다. 이전 설계의 `REQ` 상태·`pendingReq`·정리의 REQ→SKIP 은 없어진다.
- `NEXT_RUN_AT` 은 바꾸지 않는다.
- 정의 행 잠금을 5초 안에 얻지 못하면(ORA-30006) 거절 사유 「다른 요청이 이 작업을 처리하는 중입니다. 잠시 뒤 다시 시도하세요」를 돌려준다.

### 4.10 서버 간 API(하나)

| 경로 | 받는 앱 | 호출자 | 요청 | 응답 |
|---|---|---|---|---|
| `POST /internal/job/run` | 6개 모듈 앱 | MCM(`system:mcm`) | §4.3 | 202·200·404·409·503 |

- 보안
  - 경로가 `/api/` 로 시작하지 않으므로 포털 BFF 의 `/api/{module}/…` 전달 경로로는 닿지 않는다.
  - 요청은 `X-Client-Key`(ClientKeyFilter)를 통과해야 한다. 컨트롤러가 인증 주체와 역할 `SYSTEM` 을 확인한다. 사용자 주체·사용자 토큰은 403 이다.
  - 요청의 `module` 은 받는 앱의 모듈 키와 같아야 한다.
  - cactus 보안 필터가 이 헤더로 `system:mcm` 주체를 만드는지는 구현 첫 작업에서 시험으로 확인한다. 보안 설정을 바꿔야 하면 먼저 묻는다.

## 5. 실행 유형 = 서비스 ID + 입력

작업 정의의 실체는 **서비스 ID + 입력**이다. 진입점은 정의의 `SERVICE_ID` 를 부를 뿐이고 유형을 모른다. 화면의 「유형」은 입력 양식을 고르는 편의다: 유형을 고르면 서비스 ID 가 정해지고 그 서비스의 입력 칸이 나온다.

### 5.0 공통: 변수

- 모든 유형이 변수 목록을 받는다(`VARS_JSON`): `[{ "name": "baseDt", "type": "DATE", "value": ":yesterday", "desc": "기준일" }]`.
  - `name`: `[A-Za-z][A-Za-z0-9_]{0,29}`, 작업 안에서 겹치지 않음. `type`: `STRING`·`NUMBER`·`DATE`·`JSON`.
  - `value`: 고정값 또는 **실행 변수**: `:schedAt`, `:now`, `:today`, `:yesterday`, `:monthStart`, `:prevMonthStart`, `:prevRunAt`(직전 정상 일정 회차의 예정 시각, 없으면 null), `:jobId`, `:moduleCd`.
  - 날짜 변수(`:today`·`:yesterday`·`:monthStart`·`:prevMonthStart`)는 **`SCHED_AT` 기준**이다. `DB_NOW` 는 `:now` 에만 쓴다. 선점은 30초 일찍 할 수 있어서, 자정 작업이 23:59:59 에 선점되어도 날짜가 하루 어긋나지 않게 한다.
- 값은 **MCM 이 선점할 때 확정**해 호출 입력(`inputs`)으로 넘기고 실행 기록 `VARS_JSON` 에 남긴다. 모듈은 받은 값을 서비스 입력으로 그대로 넣는다.
- 쓰이는 곳: BPMN 은 서비스 입력 파라미터, 쿼리·수집(SQL)은 바인드 변수 `:이름`, 수집(HTTP)은 URL 의 `{{이름}}` 자리, 코드는 `JobContext.vars()`.
- 코드 작업은 코드가 기본 변수를 정하고, 화면에서는 값만 바꾼다.
- 화면 「지금 실행」은 이번 한 번만 쓰는 변수 값을 받을 수 있다(D11).

### 5.1 유형과 내장 서비스

| 화면 유형 | 서비스 ID | 입력(`CONFIG_JSON`) | 하는 일 | 건수 | 기본 시간 초과 |
|---|---|---|---|---|---|
| `CODE` 코드 실행 | 내장 `jobCode` | `handlerId`(등록된 `ScheduledJob` 빈 ID) | 그 빈의 `run(ctx)` | 빈이 돌려준 수 | 30분 |
| `BPMN` 서비스 실행 | 사용자가 고른 서비스 ID, `ACTION` | 없음(변수가 입력) | 그 BPMN 서비스 | 출력 `jobItemCnt` 또는 범위에 쌓인 수 | 10분 |
| `QUERY` 쿼리 실행 | 내장 `jobQuery` | `sql`(INSERT·UPDATE·DELETE·MERGE 한 문장 또는 `BEGIN 프로시저(…); END;`) | 그 모듈 기본 DataSource, 서비스 트랜잭션 안에서 실행. 쿼리 시간 초과 = 남은 시간(최소 1초, §4.4) | 영향받은 행 수 | 10분 |
| `COLLECT` 수집 | 내장 `jobCollect` | `source`: `{kind:"sql", sql, valueField, keyField}`·`{kind:"http", url, items?}`·`{kind:"exchange", currencies}`, `save`(기본 true) | 기존 `Sql/Http/ExchangeCollectSource` 로 읽어 값을 범위에 담음 → 진입점이 결과 갱신 때 저장. `save:false` 면 읽기만(외부 트리거용) | 읽은 항목 수 | 2분 |

- 내장 서비스는 mcm-core `src/main/resources/services/job/{jobCode,jobQuery,jobCollect}.bpmn` 이다. 각 BPMN 은 서비스 태스크 하나(`camunda:class` = mcm-core 빈, `method` = `run`)로 Java 몸체를 부른다. 6개 앱이 모두 싣는다.
- 내장 서비스는 `JobRunScope` 가 열려 있을 때만 실행한다(§8). 입력은 서비스 입력 파라미터가 있으면 그 값을, 없으면 범위의 정의 설정(`config`)을 쓴다. 그래서 사용자 BPMN 이 내장 서비스를 여러 번 엮으면서 호출마다 다른 문장·원천을 줄 수 있다.
- **사용자가 BPMN 으로 엮는 예**: `mdm.dailyClose` 작업 = 사용자 BPMN `dma^^dailyClose` 가 ① `jobQuery`(마감 표시 UPDATE) → ② 업무 서비스 `dma^^termMng`(action `rebuild`) → ③ `jobCollect`(건수 읽기, save) 를 연결 서브서비스로 차례로 부른다. 세 단계는 한 트랜잭션이고(연결 서브서비스는 부모 트랜잭션), 이력 보고는 진입점이 한 번 한다.
- **HTTP·PURGE 를 새 유형으로 만들지 않는다**(사용자 「최대한 수정이 적은 쪽」).
  - HTTP 호출은 `jobCollect` 의 http 원천 + `save:false` 로 대신한다. 기존 `HttpCollectSource` 가 GET·JSON 응답만 다루므로 첫 판의 외부 트리거도 GET 이다. POST 웹훅이 필요하면 다음 판에 원천에 `method` 를 더한다.
  - 보관 삭제는 기존 정리 코드(위젯 수집 값 보관 삭제·`RevokedTokenPurger`·실행 기록 보관)를 코드 작업으로 옮겨 대신한다(§5.2). 화면에서 임의 표를 지우는 기능은 두지 않는다.
- 넣지 않는 것: 셸 명령 실행(보안), 화면에서 임의 클래스·메서드 이름을 받는 실행(보안·리팩토링 때 깨짐).

### 5.2 코드 실행(= 일반 클래스 실행)

사용자 결정 20 에 따라 「코드 실행」과 「일반 클래스 실행」은 같은 유형 `CODE` 다. 실행할 수 있는 것은 **코드에 등록된 `ScheduledJob` 빈뿐**이다.

```java
public interface ScheduledJob {
    String id();                       // 처리기 ID, 예: "mcm.screenUsageRollup"
    JobModule module();                // 모듈 키, 예: JobModule.MCM
    String name();
    default String defaultCron() { return null; }   // 있으면 기동 때 같은 ID 의 작업으로 자동 등록
    default List<JobVar> defaultVars() { return List.of(); }
    default Duration defaultTimeout() { return Duration.ofMinutes(30); }
    int run(JobContext ctx);           // 처리 건수. 실패는 예외
}
```

- **등록은 DB 직접**(D30): 모듈 앱이 기동할 때(`ApplicationReadyEvent`, 실패하면 WARN 한 번 남기고 1분 뒤 한 번 더) 자기 모듈의 `ScheduledJob` 빈 전부를 `TB_MCM_JOB_HANDLER` 에 MERGE(`SEEN_AT` 갱신)한다. `defaultCron()` 이 있는 빈은 `TB_MCM_JOB_DEF` 에 **없을 때만** 같은 ID 의 작업(OWNER_TP=CODE, SERVICE_ID=`jobCode`, `NEXT_RUN_AT` 계산)을 INSERT 한다(MERGE … WHEN NOT MATCHED). 등록 SQL 은 mcm-core `agent` 한 곳에 있다.
- `defaultCron()` 이 있으면 이렇게 같은 ID 의 작업이 만들어진다. 화면은 일정·사용·시간 초과·변수 값만 바꾸고 지우기·유형 바꾸기는 막는다.
- `defaultCron()` 이 없으면 작업을 만들지 않는다. 화면에서 [새 작업] → 「코드 실행」을 고르고 처리기 목록에서 골라 일정·변수를 정한다(OWNER_TP=USER). 같은 처리기를 변수만 달리해 여러 작업으로 쓸 수 있다.
- 처리기 목록은 화면이 `TB_MCM_JOB_HANDLER` 에서 읽는다. MCM 이 여러 대여도 같은 목록이 보인다(이전 설계처럼 MCM 메모리에 두면 LB 가 등록을 받은 MCM 한 대만 목록을 안다).
- 각 모듈은 자기 `lib`·`api` 에 `ScheduledJob` 빈을 두기만 하면 된다. mcm-core 의 작업은 6개 앱이 모두 빈을 갖지만 `module()` 과 앱 모듈 키가 같을 때만 등록·실행하므로 지금처럼 중복 실행되지 않는다.
- 처리기의 `SEEN_AT` 이 7일 넘게 갱신되지 않은 코드 작업은 화면에 「코드 없음」으로 보인다. 처리기가 없는 서버가 호출을 받으면 접수에서 404 → `FAIL` "처리기 없음"이 남는다.

처음 등록하는 코드 작업(모두 `MCM`):

| JOB_ID | 대상(기존 코드) | 기본 crontab | 시간 초과 |
|---|---|---|---|
| `mcm.screenUsageRollup` | `ScreenUsageRollup.rollup()` | `0 2 * * *` | 30분 |
| `mcm.revokedTokenPurge` | `RevokedTokenPurger.purge()` | `0 * * * *` | 10분 |
| `mcm.collectPurge` | 수집 값 90일 보관 삭제(기존 `WidgetCollector.purge` 를 새 표 기준으로) | `30 3 * * *` | 30분 |
| `mcm.jobRunPurge` | 실행 기록 90일 보관 삭제(D7) | `40 3 * * *` | 30분 |
| `mcm.jobRunSweep` | 멈춘 `RUN` → `TIMEOUT` | `*/5 * * * *` | 5분 |

### 5.3 실행 사용자

- BPMN 서비스는 감사 칸과 권한 검사에 사용자가 필요하다. 진입점이 실행 전후로 `AuditHolder`·`UserContextHolder` 를 넣고 비운다. 예약 실행은 시스템 사용자 `SCHEDULER`(D10), 「지금 실행」은 요청한 사용자다.
- 서비스 ID·Action 은 저장할 때 형식만 검사한다. MCM 은 다른 모듈의 BPMN 목록을 읽을 수 없으므로, 없는 서비스면 실행 때 `FAIL`(결과 코드)로 남는다.

### 5.4 수집 작업(위젯과 관계없음)

- 위젯 「자동 수집(collect)」 유형은 지우고, 수집은 `jobCollect` 만 맡는다.
- SQL 원천은 그 모듈 DB 를 기존 읽기 전용 실행기(SqlGuard·행 상한 50·10초·쿼리 위젯 전용 풀)로 읽는다. 쿼리 시간 초과는 10초와 작업의 남은 시간 중 작은 값이다(§4.4). 값은 진입점이 결과 갱신과 같은 트랜잭션에서 `TB_MCM_JOB_COLLECT_DATA` 에 MERGE 한다(§4.5). 이전 설계의 `collect` 전용 API 는 없어진다.
- HTTP 원천의 허용 호스트는 지금 `dmes.widget.collect.allowed-hosts` 다. `dmes.job.http.allowed-hosts` 로 옮기고, 옛 키가 있으면 기동 로그에 「새 키로 옮기세요」 warn 을 남기고 함께 읽는다.
- 환율 원천은 `widget/ext` 의 환율 제공자 빈을 그대로 주입해 쓴다.
- 수집 값을 화면에 보이려면 쿼리 위젯에서 `TB_MCM_JOB_COLLECT_DATA` 를 SQL 로 읽는다.
- 옛 `dmes.widget.collect.enabled` 는 `dmes.job.collect.enabled`(기본 true)로 바꾼다. false 면 COLLECT 작업은 선점 후보에서 빠지고 `mcm.collectPurge` 도 아무것도 하지 않는다.

### 5.5 재시도·이어 실행(D12)

- 재시도: 진입점이 한다(§4.4-7).
- **이어 실행은 첫 판에서 뺀다.** 같은 모듈 안의 「앞 작업 끝나면 다음 작업」은 BPMN 하나에서 서브서비스로 차례로 부르면 된다(사용자 결정 19). 다른 모듈 작업을 잇는 것만 남는데, 필요하면 다음 판에 결과 반영 때 MCM 이 「지금 실행」과 같은 경로로 바로 호출하게 더한다(D24).
- 실패 알림은 다음 판이다.

## 6. 없애는 것 / 옮기는 것 / 그대로 두는 것

| 구분 | 대상 | 처리 |
|---|---|---|
| 없앰 | 위젯 유형 「자동 수집(collect)」 프런트 `widget-types/collect/**`, 유형 등록부 항목, 위젯 도움말의 collect 부분 | 삭제(사용자 승인) |
| 없앰 | mcm-core `widget/collect` 의 `WidgetCollector`(매분 tick·03:30 삭제 `@Scheduled`)·`WidgetCollectWriter`·`WidgetCollectReader`·`WidgetCollectConfig`·엔티티·저장소 | 삭제. 매분 위젯 정의 조회도 함께 없어진다 |
| 없앰 | `widgetData/run` 의 collect 분기, `WidgetDefConfigRules` 의 collect 검사, 관련 시험 | 삭제 |
| 없앰 | `ScreenUsageRollup`·`RevokedTokenPurger` 의 `@Scheduled` | 코드 작업으로 옮김(공개 메서드는 그대로) |
| 옮김 | `Sql/Http/ExchangeCollectSource`·`CollectItem`·`CollectException`·`CollectConfig`·`CollectConfigs`(원천 파싱·검사) | `job/builtin/collect` 로 옮겨 `jobCollect` 가 재사용 |
| 옮김 | `WidgetCollectProperties`(허용 호스트·enabled) | `dmes.job.http.allowed-hosts`·`dmes.job.collect.enabled`(옛 키는 warn 과 함께 읽음) |
| 그대로 | 위젯 환율·쿼리 유형, `widget/ext` 환율 제공자, `widget/query` SqlGuard·쿼리 위젯 전용 풀 | 재사용, 동작 변경 없음 |
| 그대로 | cactus-core `scheduling`·`OasisServiceExecutor`·`DmomReceiveDispatcher`·`datasource`·`security`·`MdmRevisionPoller`, oasis-core 전체 | 바꾸지 않음. cactus-core 에는 새 패키지 `job` 만 더한다 |
| 없앰 | `TB_MCM_WIDGET_COLLECT_RUN`·`_DATA` | V4 로 DROP(PURGE 없음) |

### 6.1 재사용하는 기존 코드

| 기존 코드 | 위치 | 이번에 쓰는 곳 |
|---|---|---|
| DMOM 수신 디스패처 패턴 | cactus-core `dmom/receiver/DmomReceiveDispatcher` | 예약 실행 진입점의 뼈대(웹 없이 `serviceStarter.start`, 시스템 감사 주체, 결과 코드 판정) |
| 화면 서비스 실행기의 로그 두 줄·MDC | cactus-core `oasis/OasisServiceExecutor` | 진입점의 `serviceId/action`·`Service end` 줄, `txId`·`serviceId` MDC |
| OASIS 서비스 기동기 | `ServiceStarter` 빈(`CactusServiceStarterFactory` 조립, 서비스마다 트랜잭션) | 대상 서비스 실행. 진입점은 새 트랜잭션 코드를 두지 않는다 |
| OASIS BPMN 서비스 + 서비스 태스크(`camunda:class`·`method`) | 기존 업무 BPMN 관례(예: `mcm/api` `services/audit/screenUsage.bpmn`) | 판정 서비스 `jobDispatch`·내장 서비스 BPMN |
| OASIS 연결 서브서비스 | oasis-core `SubServiceConnectedToParentServiceCallTaskExecutable` | 사용자 BPMN 이 내장·업무 서비스를 함수처럼 엮기(같은 스레드·같은 트랜잭션) |
| 공용 스케줄러·예약 작업 로그 태그 | cactus-core `scheduling/JobLoggingTaskScheduler`·`ScheduledJobLogContext` | 매분 트리거 `@Scheduled`(경계 두 줄은 sch) |
| 서버 간 호출 클라이언트 | cactus-core `mdm/MdmMetaClient`·`MdmClientProperties` | MCM→모듈 호출의 ClientKey·system 주체 헤더·설정 모양 |
| 수집 원천 | mcm-core `widget/collect/*CollectSource`·`CollectConfigs` | `jobCollect`(HTTP 트리거 포함) |
| 읽기 전용 SQL 실행기 | mcm-core `widget/query/SqlGuard`·`WidgetReadOnlyJdbc` | 수집 SQL 원천 |
| 환율 제공자 | mcm-core `widget/ext` | 수집 환율 원천 |
| 기존 정리·집계 메서드 | `ScreenUsageRollup.rollup()`·`RevokedTokenPurger.purge()`·`WidgetCollector.purge` | 코드 작업(PURGE 유형 대신) |
| 교차 스키마 표 접근(스키마 접두 + GRANT) | mls `Notice` 엔티티(`MCMAPUSER.TB_MCM_NOTICE`), caravan-hub `ifuser/V1` 의 GRANT | 모듈의 결과 갱신·등록 |
| 모듈 주소 환경 변수 관례 | `MDM_WAS_URL` 등 `<모듈>_WAS_URL` | MCM→모듈 base-url 기본값 |
| crontab 입력·시안 | 시안 `m-design-dummy/screens/job-scheduler/**` | 운영 화면(공통 컴포넌트로 등록) |

- 쓰지 않는 것: `NonTransactionalServiceStarterFactory` 는 `cactus.oasis.transactional=false` 일 때만 쓰는 빈 경로라 해당이 없다. 진입점이 트랜잭션 밖인 것은 진입점이 `@Transactional` 없는 Java 이기 때문이다. `createNewService` 서브서비스(50초 상한·결과 null NPE)는 내장 서비스 호출에 쓰지 않는다.

## 7. 관리 화면 「예약 작업 관리」

- 시안: `src/frontend/m-design-dummy/src/screens/JobSchedulerScreen.tsx`(mock 데이터). 사용자 확인 뒤 운영 화면으로 옮긴다.
- 메뉴: 공통관리 > 시스템관리(`csa`), 객체 ID `jobSchedMng`, `componentPath` `csa/jobSchedMng`, FULL_SEQ `1020220`, SYSADMIN `PERM_ALL`. 화면 파일 `src/frontend/m-mcm/page-components/csa/jobSchedMng/`.
- 서버 호출: OASIS `POST /api/mcm/oasis/jobSchedMng/{action}`, action `list`·`get`·`save`·`setUse`·`runNow`·`history`·`cronPreview`·`handlers`·`delete`(USER 작업만). 목록·상세 모두 DB 에서 읽는다.
- 배치는 위젯관리와 같다.
  - 조회 조건: 모듈(전체·6개)·유형·사용·최근 결과·이름/ID.
  - 왼쪽 「작업 목록」 그리드: 모듈·작업 ID·이름·유형·crontab 식·일정 설명·사용·다음 예정·최근 결과·최근 실행 서버, 「코드 없음」 배지.
  - 오른쪽 상세: 공통 칸(모듈·ID·이름·유형·설명·사용) → 일정 → 유형별 입력(CODE 처리기 고르기 / BPMN 서비스 ID·Action / QUERY 문장 / COLLECT 원천·저장 여부) → 변수 표 → 고급(시간 초과·재시도). 아래에 「실행 이력」(예정 시각·구분·상태·서버·서비스 태그·시작·끝·소요·건수·메시지).
  - [새 작업] → 유형 고르기(카드 4개: 코드 실행·서비스 실행·쿼리 실행·수집) → 빈 상세.
- 시안 수정(다음 단계, 필수 아님): 유형 카드를 6개에서 4개로 줄이고(HTTP·PURGE 빼기), CODE 를 처리기 고르기로, COLLECT 에 「저장 안 함」 칸, 이력에 서비스 태그 칸, 고급에서 「이어 실행」 빼기.
- crontab 입력 칸과 변수 표는 운영 화면으로 옮길 때 `@dk-oasis/shared` 에 새 공통 컴포넌트로 등록한다.

## 8. 권한·보안

- 화면 서버 호출은 SYSADMIN 권한(객체 `jobSchedMng`)만 연다.
- 서버 간 API 는 §4.10 규칙을 따른다. 모듈 → MCM 방향의 인바운드 API 는 없다.
- 모듈 DB 사용자는 JOB 표 4개에 §3.5 의 권한만 받는다(DELETE 없음). 모듈 앱이 다른 모듈의 RUN 행도 DB 로는 고칠 수 있지만, 같은 조직의 앱끼리라 받아들인다. 쓰는 코드는 cactus-core·mcm-core 한 곳뿐이다. 특히 **6개 모듈 앱 모두에 새 인바운드 `/internal/job/run` 이 생긴다.** `system:mcm` 주체만 받는다.
- **내장 서비스를 웹으로 부르는 경로를 막는다.** BE 의 서비스 ID 별 권한 검사가 보류 중이라, 로그인한 사용자는 `/api/{module}/oasis/jobQuery/run` 처럼 내장 서비스를 웹으로 부를 수 있다. 내장 서비스의 **Java 몸체 메서드**(BPMN 이 아니라 그 빈)가 첫 줄에서 `JobRunScope` 가 열려 있는지 확인하고, 없으면 「예약 실행 밖 호출」로 거절한다. 범위는 진입점만 열고, 진입점은 `system:mcm` 이 부른 `/internal/job/run` 으로만 열린다. 그래서 웹 요청은 SQL·주소를 넣어도 실행되지 않는다. 검사를 Java 몸체에 두는 이유는 사용자 BPMN 이 `camunda:class` 로 그 빈을 직접 부를 수도 있기 때문이다. 웹 진입 `OasisController`·`ServiceController`(`/service`·`/query/service`·`/lov/service`)는 모두 웹 스레드에서 `OasisServiceExecutor` 를 거치므로 범위가 없다(D23).
- **판정 서비스 `jobDispatch` 를 웹으로 부르는 경로를 막는다.** 이 BPMN 도 OASIS 서비스라 `/api/mcm/oasis/jobDispatch/run` 으로 불릴 수 있다. 판정 몸체(`jobDispatchService.claimDue`)는 첫 줄에서 `JobDispatchScope` 가 열려 있는지 확인하고, 없으면 거절한다. 이 표시는 트리거만 연다(D23 과 같은 방식).
- **BPMN 은 코드와 함께 배포되는 파일이라 실행 중 수정 경로가 없다.** 모든 BPMN 은 각 모듈 api 의 클래스패스 파일(`src/backend/<모듈>/api/src/main/resources/services/**/*.bpmn`, 파일 경로가 serviceId)이고, 바꾸려면 코드 커밋·배포뿐이다. 그래서 판정 BPMN 에 따로 수정 권한 장치를 두지 않는다. (외부 주소에서 BPMN 을 읽는 `cactus.oasis.service-loader-url` 은 코드에만 있고 어느 앱도 설정하지 않는다.)
- QUERY 는 화면에서 등록한 DML·프로시저를 그 모듈 DB 에 쓰는 강한 기능이다. SYSADMIN 만 저장할 수 있고, 저장·실행 때 한 문장인지·DDL·트랜잭션 제어문이 없는지 검사한다(D13).
- COLLECT(SQL): 기존 읽기 전용 실행기를 그대로 쓴다. COLLECT(HTTP): 허용 호스트 정확 일치, 리다이렉트 안 따름, 내부·메타데이터 주소 거절(기존 `HttpCollectSource` 규칙).
- 실행 기록 `MSG` 와 로그에는 주소·인증값·DB 원문 메시지를 넣지 않는다(예외는 종류 이름만).

## 9. 시험

- 단위: crontab 식 검사·다음 예정 계산·간격 하한, 변수 확정(자정 23:59:59 선점에도 `:today` 가 SCHED_AT 날짜), 유형별 입력 검사(QUERY 문장 검사), 늦은 회차 판정, 빈 틱은 조회 SQL 1회·커밋 없음, 실행 기록 상태 전이, 코드 작업 등록(없을 때만, 모듈 키가 다르면 등록 안 함).
- 통합(레인 전용 PDB, `pdb.mjs clone`)
  - **MCM 인스턴스 둘(서로 다른 연결)이 같은 분에 선점 경합** → 한 회차는 한 번만 RUN. SKIP LOCKED 는 모의 객체로 재현할 수 없어 실제 Oracle 로 한다.
  - 저장 반영: 인스턴스 A 가 사용 안 함으로 저장한 뒤 B 의 다음 틱은 잡지 않음. A 가 설정을 바꾼 뒤 B 가 잡은 회차는 새 설정으로 호출. 조회와 잠금 사이에 바뀐 행은 건너뜀.
  - 로그: 판정·호출의 SQL·bind 줄이 mcm 업무 로그에 serviceId `jobDispatch` 로 남음, 트리거 경계 두 줄만 sch, 트리거가 되돌린 뒤 sch 경계 끝 줄이 sch 로 감.
  - 판정 서비스: 결과 실패(시험용으로 몸체 예외) → 선점 0·RUN 행 없음·WARN 1줄·다음 분 정상. `more=true` 면 같은 틱에서 다시 부름(120건 → 50·50·20). 호출은 `serviceStarter.start` 가 돌아온 뒤(커밋 뒤)에만 나감. 웹 경로로 `jobDispatch` 를 부르면 거절.
  - 호출 응답별 처리(가짜 모듈 HTTP): 202 → SERVER_NM 만, 503 → SKIP, 404 → FAIL, 연결 거부 → FAIL, **읽기 시간 초과 → RUN 유지**, 재시도 없음.
  - 결과 갱신 경합: MCM 의 접수 기록보다 모듈 결과가 먼저 써져도 최종 STATUS 는 모듈 결과. 정리가 TIMEOUT 으로 닫은 뒤 온 결과는 덮어쓰지 않고 WARN. 수집 값은 OK 일 때 한 번만 저장. 대상 서비스가 롤백돼도 FAIL 기록은 남음(분리 트랜잭션).
  - 권한: 모듈 사용자로 접속해 RUN UPDATE·COLLECT MERGE·DEF/HANDLER MERGE 가 되고(로컬은 ANY TABLE, GRANT 문은 V3 에 있음), DELETE 는 안 됨.
  - 등록: 같은 앱 두 대가 동시에 기동해도 DEF 행은 하나(MERGE), 화면 값은 덮어쓰지 않음, 처리기 목록이 MCM 대수와 무관하게 같음.
  - 정리(여유 300초), 늦은 회차 SKIP, 한 틱 후보 120건(50개씩 되풀이·SKIP 없음), FAIL 결과의 수집 값 저장 안 함, 겹침 SKIP, 「지금 실행」이 일정 회차와 겹치면 거절.
  - 보안: `/internal/job/run` 키 없음 401, 사용자 주체 403, `system:mcm` 아닌 주체 403.
- 모듈 쪽: 진입점 — 대상 서비스 SUCCESS → OK 갱신 1회, 실패 → FAIL(원문 메시지 없음), 시간 초과 → TIMEOUT 갱신 1회·늦은 완료·인터럽트 FAIL 은 갱신 안 함, `jobQuery` 가 쿼리 시간 초과(시험용 `DBMS_SESSION.SLEEP`)로 ORA-01013 → DML 롤백·TIMEOUT 1회(감시와 경합해도 1회), 대상 롤백 뒤 FAIL 기록이 B 트랜잭션으로 남음, 마감 직전 완료와 감시 경합에서 갱신 1회, 재시도(1회차 FAIL → 대기 → 2회차 OK)가 TIMEOUT 되지 않고 건수가 쌓이지 않음, `Error` → FAIL, **서브서비스 3겹(사용자 BPMN → 내장 → 업무)에서도 갱신 1회**, 진입점 재진입은 거절(바깥 회차는 그대로 OK), 내장 서비스를 웹 경로(`OasisController`)로 부르면 거절, `createNewService` 로 부르면 거절. 접수 — 중복 runId 200, 풀 가득 503, 처리기 없음 404. 결과 갱신 실패 시 5초 뒤 한 번 더 하고 그다음은 WARN·정리에 맡김. 진입점 실행 로그가 sch 가 아닌 업무 로그 태그(serviceId 가 `sch.` 아님)로 남는지.
- 다른 모듈 앱 기동 시험: mdm 앱 하나를 MCM 이 꺼진 상태로 띄워 기동이 실패하지 않고 WARN 1회만 남기는지 확인한다.
- 기존 시험: 위젯 collect 시험은 유형과 함께 지운다. 원천 시험은 새 패키지로 옮긴다. `ScreenUsageRollupTest` 등은 공개 메서드 그대로라 유지한다.
- 프런트: m-mcm tsc·audit·화면 단위 시험, shared 새 컴포넌트 시험.
- 머지 직전: 전체 시험 1회, `DataInitializerSeedFingerprintTest` 골든 다시 만들기, V3 번호 충돌 재확인.

## 10. DB 적용과 메뉴 등록

- V3 는 머지 뒤 mcm 앱 재기동 때 L_MAIN 에 자동 적용된다. **조정자 허가 전에는 L_MAIN 에 적용하지 않는다.**
- 메뉴·객체·RBAC 등록: Oracle 용 멱등 SQL `docs/mcm/sql/jobSchedMng-menu.sql`(`MERGE`).
- 개발·운영 DB DDL 은 V3 파일을 DBA 가 적용한다.

## 11. 결정 항목

- 구현 계획(`docs/superpowers/plans/2026-10-08-job-scheduler.md`)은 결정 15 이전 구조다. **계획은 설계 확정 뒤 다시 쓴다.**
- 설계 확정 전 구현분 `f1ed4d268` 을 고칠 것(계획을 다시 쓸 때):
  - V3: `TB_MCM_JOB_VER` 표와 6행 시드를 뺀다. 색인 `IX_TB_MCM_JOB_DEF_DUE (USE_YN, NEXT_RUN_AT)` 를 더한다. `TB_MCM_JOB_HANDLER` 표를 더하고 DEF 의 `CODE_SEEN_AT` 을 뺀다. 끝에 모듈 사용자 5명에게 GRANT(§3.5)를 더한다. DEF 에 `SERVICE_ID`·`ACTION` 을 더하고 `JOB_KIND` CHECK 를 `CODE·BPMN·QUERY·COLLECT` 로 줄인다. RUN 에 `RUN_ID`(UNIQUE)·`SERVICE_ID`·`SERVICE_TAG` 를 더하고 STATUS CHECK 에서 `REQ` 를 뺀다. 머리 주석의 「JOB 전용 연결」 설명을 고친다.
  - `JobDataSource`·`JobProperties` 의 연결 부분·`JobConfig` 의 데이터소스 빈을 지운다.
  - `McmCoreOraTestDb.resetData` 의 `TB_MCM_JOB_VER` 제외를 되돌린다(표가 없어짐).

| # | 항목 | 결정 |
|---|---|---|
| D1 | 위젯 수집과의 관계 | **폐기**(사용자 결정 13). 위젯 collect 유형 삭제 |
| D2 | 수집 작업의 모듈 | **변경**(사용자 결정 14): 작업마다 실행 모듈. 값 저장은 진입점이 결과 갱신과 같은 트랜잭션에서 DB 직접(D29) |
| D3 | crontab 과 다른 점 | 일·요일 함께 제한한 식, `?`·`L`·`W`·`#`·6칸 식 거절 |
| D4 | 수정 알리기 | **D17 로 대체** |
| D5 | 실행 범위 | 6개 모듈 앱 모두 접수·진입점을 켜고 자기 모듈 키 작업만 받음 |
| D6 | 놓친 회차·겹침 | 따라잡지 않고 `SKIP` 행 1건 |
| D7 | 실행 기록 보관 | 90일 |
| D8 | 화면에서 작업 삭제 | USER 작업만, 정의·이력·수집 값 함께 삭제 |
| D9 | 메뉴 등록 방법 | 멱등 SQL 파일만 두고 조정자가 L_MAIN 에 적용 |
| D10 | 예약 실행 사용자 | 시스템 사용자 `SCHEDULER`(사용자 표에 등록 필요 여부 확인) |
| D11 | 「지금 실행」 변수 덮어쓰기 | 허용(이번 한 번만, 이력에 값 기록) |
| D12 | 재시도·이어 실행·실패 알림 | **변경**: 첫 판은 재시도만. 이어 실행은 D24, 실패 알림은 다음 판 |
| D13 | QUERY 허용 범위 | DML 한 문장·프로시저 호출만, SYSADMIN 만 저장 |
| D14 | MCM 표에 닿는 길 | **폐기**(결정 15). JOB 표에는 MCM 만 닿음 |
| D15 | 모듈 claim 방식 | **폐기**(사용자 결정 16). §12 |
| D16 | 실행 방식 | **사용자 확정**(결정 16): MCM 이 판정·선점 → 모듈 `/internal/job/run` 비동기 접수 → 진입점이 실행·결과 DB 갱신 |
| D17 | MCM 여러 대 정의 맞추기 | **변경(사용자 결정 22)**: 캐시 없음. 각 MCM 이 매분 색인 조회 1회 → 있으면 같은 트랜잭션에서 선점. 저장은 다음 분부터 반영. 버전 표·evict 알림·세대 번호·5분 재적재·`mcm-peers` 모두 없음 |
| D18 | 호출 실패 처리 | 확실한 거절만 즉시 FAIL/SKIP, 읽기 시간 초과·5xx 는 RUN 유지, MCM 재시도 없음 / 정리 여유 **300초**(결과 재전송이 없어져 900초에서 줄임) / 결과 갱신 실패는 5초 뒤 한 번 더, 그다음 정리에 맡김 / LB 는 /run 을 다른 서버로 재시도하지 않음(운영 요건) |
| D19 | 서버 간 API 경로·인증 | **`/internal/job/run` 하나**(MCM→모듈, BFF 미경유) + ClientKey + `system:mcm` 주체·SYSTEM 역할 + 모듈 일치. 모듈→MCM API(result·register·collect)는 없음 |
| D20 | 「지금 실행」 | 받은 MCM 이 바로 RUN INSERT·호출(몇 초). `REQ` 상태 없음 |
| D21 | 진입점 위치 | cactus-core 새 패키지 `job`(DMOM 수신과 같은 층, 기존 클래스 변경 없음): 진입점·실행 범위·결과 갱신. 접수·등록·내장 서비스는 mcm-core |
| D22 | 실행 유형 | 서비스 ID + 입력. 화면 유형 4개(CODE·BPMN·QUERY·COLLECT). 코드 실행 = 일반 클래스 실행(등록된 빈만). HTTP 는 수집 `save:false`, PURGE 는 코드 작업으로 |
| D23 | 내장 서비스 웹 호출 차단 | 내장 서비스는 `JobRunScope` 없으면 거절(진입점만 범위를 엶) |
| D24 | 이어 실행 | 첫 판 제외. 같은 모듈은 BPMN 서브서비스로, 다른 모듈 잇기는 다음 판 |
| D25 | 호출 주소 | 새 자리 `dmes.job.modules.<모듈>.base-url`, 기본값은 기존 `<모듈>_WAS_URL` 환경 변수와 로컬 포트 |
| D26 | 코드 작업 목록 | **변경 → D30** |
| D27 | 시간 초과·결과 1회 | 회차 상태 객체 CAS 로 이긴 쪽만 결과를 씀, 감시는 시도마다, 재시도는 풀에 새로 넣음, 진입점 재진입 거절 |
| D28 | 판정 방식과 로그 | **변경(사용자 결정 24)**: `@Scheduled` 트리거 → BPMN 시스템 서비스 `jobDispatch`(serviceStarter.start 직접, SCHEDULER 감사, 자기 트랜잭션에서 조회·선점·커밋) → 트랜잭션 밖 Java 호출 풀. 50개 묶음은 트리거가 `more` 로 되풀이. 판정·호출 로그는 mcm 업무 로그(serviceId `jobDispatch`), 트리거 경계 두 줄만 sch. 억제 장치 없음. 웹 호출은 `JobDispatchScope` 로 거절. BPMN 은 코드와 함께 배포되는 파일이라 실행 중 수정 경로 없음(권한 장치 불필요) |
| D29 | 실행 결과 기록 | **사용자 결정 25(B 안)**: 모듈 진입점이 RUN 행을 DB 에 직접 UPDATE(`WHERE RUN_ID AND STATUS='RUN'`, 0행이면 늦은 결과 WARN), 수집 값은 같은 트랜잭션에서 MERGE. SQL 은 cactus-core `JobRunResultWriter` 한 곳, 접두는 `dmes.job.schema`, 모듈 기본 DataSource, 대상과 분리된 짧은 트랜잭션. 모듈 사용자에 GRANT(§3.5) |
| D30 | 코드 작업 등록 | **사용자 확정(보충 6, 「둘 다 권장안대로 반영해줘」) — DB 직접**: 모듈 기동 때 `TB_MCM_JOB_HANDLER` MERGE + 기본 일정 있는 빈만 `TB_MCM_JOB_DEF` 에 없을 때 INSERT. 이유: 결과 API 를 없애면 등록만을 위해 모듈→MCM HTTP 클라이언트·MCM 인바운드 API·MCM 꺼짐 재시도·MCM 주소·키 설정을 남겨야 하고, 처리기 목록을 MCM 메모리에 두면 MCM 여러 대에서 한 대만 안다. DB 직접은 표 하나와 GRANT 로 끝난다 |
| D31 | 내장 서비스 쿼리 시간 초과 | **사용자 확정(보충 6)**: `jobQuery`·`jobCollect`(SQL) 문장마다 남은 시간(최소 1초) 쿼리 시간 초과. `ORA-01013` 은 대상 트랜잭션 롤백 + 진입점이 TIMEOUT 으로 정함, 감시와는 CAS 로 한 번만. 업무 BPMN·CODE 는 가이드 권장만 |
| D32 | 서비스 ID 이름 | **변경(구현 중 발견, 조정자 승인 2026-10-09)**: OASIS 는 서비스를 파일 이름으로만 찾고(폴더 무시) 파일 이름의 `^^` 뒤를 설명으로 자른다(AbstractFileServiceLoader). analog 서비스 목록 정규식 `[\w.-]+/\w+` 도 `^` 를 받지 않는다. 그래서 `job^^…` 대신 저장소 관례(ID = 파일 이름)인 `jobDispatch`·`jobCode`·`jobQuery`·`jobCollect` 를 쓴다 |

## 12. 검토 후 폐기한 안

- **모듈 claim 방식(9808abdd0, 결정 15 의 첫 구현안)**: 각 모듈이 매분 MCM 의 `claim` API 를 부르고, MCM 이 모듈 키 캐시로 판정·선점해 맡을 실행을 돌려주는 안이었다. 폐기 근거: 모듈마다 매분 스케줄러·claim 멱등(`CLAIM_REQ_ID`·`requestId`)·빈 자리 수(`freeSlots`)·처리기 목록(`codeJobIds`) 전달·`REQ` 상태와 `pendingReq` 맞추기·수집 값 전용 API 가 필요해 움직이는 부품이 많았다. push 방식은 판정·선점·호출을 MCM 한 곳에 모으고, 모듈은 접수와 보고만 한다. 「지금 실행」도 다음 claim 을 기다리지 않고 바로 나간다. 잃는 것은 「모듈이 자기 빈 자리를 보고 받는다」는 점인데, 접수에서 풀 가득이면 503 → `SKIP` 으로 대신한다.
- **모듈이 MCM 표를 직접 읽는 안(`JobDataSource`)**: 결정 15 로 폐기했다.
- **쓰지 않기로 한 것: 결과 API**(`POST /internal/job/result`, 모듈 HTTP 보고 클라이언트, 메모리 재전송 대기열 5초·15초·1분·10분, `register`·`collect` API). 근거(사용자 결정 25): 운영에서도 모든 모듈이 MCMAPUSER 표에 닿는 같은 Oracle 을 쓰므로 모듈이 RUN 행을 직접 갱신하면 된다. HTTP 보고는 MCM 이 꺼져 있거나 응답이 늦을 때를 위해 재전송 대기열·멱등 판정·긴 정리 여유(900초)가 필요했는데, DB 직접 갱신은 대상 서비스가 쓰는 DB 와 같은 DB 라 그런 장치가 필요 없다. 정리 여유도 300초로 줄었다. 잃는 것은 「JOB 표에는 MCM 만 닿는다」는 경계이고, 쓰는 코드를 cactus-core·mcm-core 한 곳에 모으고 GRANT 를 표 4개·DELETE 없음으로 좁혀 대신한다.
- **쓰지 않기로 한 것: JOB 정의 WAS 캐시**(모듈 키 캐시·지연 적재, 버전 표 `TB_MCM_JOB_VER`, 저장 뒤 `/internal/job/cache/evict` 알림·`dmes.job.mcm-peers`·적재 세대 번호·5분 재적재). 근거: 분당 1회 색인 조회로 충분하고(정의 표는 DB 버퍼 캐시에 머문다), 캐시를 없애면 MCM 여러 대 사이의 무효화 문제가 사라진다(사용자 결정 22).
