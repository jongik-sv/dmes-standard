# 예약 작업 관리(자동 수집관리) 설계

2026-10-08 · 레인 job-sched(지시 job-sched-1) · 상태: **구현 허가(조정자, 2026-10-08) — 결정 15(MCM 중앙 판정) 반영본**

## 0. 배경과 사용자 결정

- 원문: 「자동 수집관리를 하나 만들자. 서버에 cron 을 대체하는 건데 서버가 여러 대라면 또 어떻게 처리해야 할지 모르겠네.」
- 사용자 결정(2026-10-08, 받은 순서)
  1. 여러 서버 처리 = **회차 선점**. 모든 서버가 매분 깨어나고 한 회차는 한 서버만 실행한다. 대표 서버 선출·Quartz 는 쓰지 않는다.
  2. 관리 범위 = **코드 작업 + 수집 작업**. 코드 작업은 화면에서 일정·사용 여부만 바꾸고, 그 밖의 작업은 화면에서 새로 만든다.
  3. 선점 수단 = **행 잠금**: 「select .. for update 를 써서 lock 을 잡아 버리면 되겠다.」
  4. 「기존에 widget 에서 반복적으로 실행하던 것은 없어져야겠지」: `WidgetCollector` 의 `@Scheduled` 두 개와 매분 위젯 정의 조회를 없앤다.
  5. 「DB 에 스케줄을 등록하면 그것으로 알아서 스케줄이 실행하도록 하면 좋겠다.」: 일정의 정본은 DB 다. 코드의 일정은 처음 등록할 때 쓰는 기본값일 뿐이다.
  6. 「각 모듈별로 있으면 좋겠다. mcm, mdm, mpp, mls, ... 모든 모듈에 있는 기능이면 좋겠어」: 엔진은 mcm-core 에 두고 6개 모듈 앱이 모두 쓴다.
  7. 「모양은 crontab 과 동일한 방식이면 좋겠다.」: 일정은 crontab 5칸 식(`분 시 일 월 요일`)이다.
  8. 「1분에 한 번 스케줄 DB 를 조회하지 않도록 캐시에 관리되는 것이 좋겠어. 스케줄 테이블에 MCM 스케줄을 수정하면 캐시를 클리어시키고 새롭게 조회해서 캐시에 적재하는 거지」
  9. 「각 모듈별로 자기 모듈의 스케줄을 실행하도록 하고 실행하는 것은 bpmn 서비스, 쿼리, 수집 프로그램 등의 형태를 실행할 수 있도록 하자. 생각해 보고 더 있으면 추가해 줘.」
  10. 「캐시는 각 모듈별로 캐시가 있으면 좋겠어. 키 자체가 MCM, MDM, MLS, MPP, ... 이 키에 포함되어야 한다는 거야」
  11. 「BPMN 의 경우는 변수와 Action 도 입력해 줘야 해.」 「다른 유형도 변수 받아야겠네.」
  12. 「위젯처럼 간단하게 등록할 수 있으면 좋겠다.」 「화면 시안을 먼저 만들어 봐.」 「crontab 식을 더 편하게 쓸 수 있게 하면 좋겠다.」
  13. 「위젯과 JOB 은 관계 없어. 위젯에 시간 설정한 것은 무조건 화면 시간이야.」(조정자 전달): 위젯 「자동 수집(collect)」 유형을 지운다. 수집 원천은 JOB 의 COLLECT 유형으로 옮긴다. 빈 표 `TB_MCM_WIDGET_COLLECT_RUN`·`_DATA` 는 DROP 하지 않는다.
  14. 「예약 작업 관리 테이블은 MCM 에 있지만 각 모듈에서 실행이 되어야 해」(조정자 전달): 실행은 각 모듈이 한다. 수집 작업도 작업마다 실행 모듈을 고른다.
  15. (최종, 조정자 전달) 「그냥 각 모듈의 스케줄러가 mcm 의 캐시를 읽어서 하는 게 낫지 않나?」, 「각 모듈의 스케줄러는 자기의 모듈의 리스트만 MCM 에서 가져오는 거야」, 「MCM 의 API 는 쿼리를 읽어서 캐시 처리까지 하는 거고」 → 개선안 확정: **JOB 표에는 MCM 만 닿는다. 각 모듈은 매분 MCM 의 `claim` API 만 부르고, MCM 이 모듈 키 캐시로 판정·선점해 맡을 실행을 돌려준다. 모듈은 실행하고 `result` API 로 보고한다.** 앞의 「모듈이 MCM 표 직접 조회」·`JobDataSource` 안은 폐기한다.
- Spring 스케줄러의 역할: `TaskScheduler` 는 매분 깨우는 시계로만 쓴다. 어떤 작업을 언제 돌릴지는 작업 정의 테이블이 정한다.

## 1. 지금 상태(조사 결과)

| 항목 | 위치 | 일정 | 여러 서버에서 |
|---|---|---|---|
| 위젯 정시 수집 tick | `widget/collect/WidgetCollector.scheduledTick` | 매분 | `TB_MCM_WIDGET_COLLECT_RUN` INSERT 선점으로 한 번만 |
| 위젯 수집 보관 삭제 | `WidgetCollector.scheduledPurge` | 매일 03:30 | 중복 실행(지우는 일이라 결과는 같음) |
| 화면 사용 일별 집계 | `screenusage/service/ScreenUsageRollup` | 매일 02:00 | 중복 실행(늦게 커밋한 쪽이 PK 위반 warn) |
| 폐기 토큰 정리 | `audit/service/RevokedTokenPurger` | 1시간마다(fixedDelay) | 중복 실행 |
| MDM 리비전 폴링 | cactus-core `MdmRevisionPoller` | 10초 | 서버마다 돌아야 함(캐시 갱신) |

- mcm-core 는 6개 모듈 앱(mcm·mdm·mpn·mls·mqc·mpp)의 `lib` 이 모두 `api libs.mcm.core` 로 싣는다. 그래서 위 `@Scheduled` 4개는 서버 한 대 안에서도 앱 6개에서 각각 돈다.
- 모든 앱은 자기 스키마 사용자로 접속하고 `MCMAPUSER.표` 접두로 mcm 표를 읽고 쓴다(docs/oracle-1007/schema-owners.md §2). 작업 표 하나를 6개 앱이 함께 쓸 수 있다.
- 시각은 KST 로 통일한다. 시각 칸은 `TIMESTAMP(6)`, DB 의 `SYSTIMESTAMP` 도 KST 다(같은 문서 §3.1).
- BPMN 서비스는 각 모듈의 cactus-core `OasisServiceExecutor.execute(serviceId, action, CactusRequest)` 로 화면 요청과 같은 경로로 부를 수 있다. 입력은 `CactusRequest.params`(Map)다.
- 예약 작업 로그 태그는 cactus-core `ScheduledJobLogContext` 가 넣는다(`sch.<클래스>.<메서드>`). 공개 메서드 `run(jobName, task)`·`runQuiet(jobName, task)` 를 직접 부를 수 있다.
- 로컬 mcm 앱은 `dmes.flyway.enabled=true` 라 **기동할 때 `oracle/mcmapuser` 의 새 V 파일을 L_MAIN 에 적용한다.**
- 위젯관리 화면(`csa/commWidgetMng`)은 왼쪽 목록 + 오른쪽 상세(공통 칸 + 유형별 편집기 + 미리보기)이고, [새 위젯] → 유형 고르기 → 빈 상세 흐름이다. 유형은 등록부(`WIDGET_TYPE_REGISTRY`)에서 유형마다 편집기를 불러온다.
- 공용 DB(L_MAIN)의 collect 위젯 정의는 0건, 수집 기록도 0건이다.

## 2. 구성 한눈에 보기

```
[MCM 앱] ─ JOB 표 4개(MCMAPUSER)에 닿는 유일한 앱
   ├ JobDefCache: Map<모듈 키, ModuleDefs> — 요청이 오면 그 키를 쿼리로 읽어 캐시, 이후 쿼리 없이 판정
   │     화면 저장 → 그 키 캐시 비움 + TB_MCM_JOB_VER(그 키) +1 / 다른 MCM 인스턴스는 30초마다 버전 확인 후 비움
   ├ 서버 간 API(/internal/job/*, ClientKey + system 주체만)
   │     POST claim   : 모듈 키 캐시로 「지금 할 것」 판정 → 없으면 DB 0회 빈 응답
   │                    있으면 FOR UPDATE SKIP LOCKED 선점(NEXT_RUN_AT 올림·RUN 기록·커밋) → 맡을 실행 목록
   │     POST result  : runId 기준 결과 마감(같은 보고는 한 번만 반영)
   │     POST register: 모듈 기동 때 코드 작업 등록(없을 때만)
   │     POST collect : COLLECT 결과 값 저장
   └ 관리 화면 OASIS 서비스 jobSchedMng

[각 모듈 앱(MCM 포함), 서버 N대]
   JobAgent: 매분 0초 claim(자기 모듈 키, 요청 ID) 한 번 → 받은 실행만 실행 풀에서 실행 → result 보고
             MCM 앱 자신은 같은 서비스를 HTTP 없이 직접 부른다
             작업 목록을 들고 있지 않고 일정을 판정하지 않는다
```

- 새 패키지 `com.dongkuk.dmes.mcm.job`(mcm-core, 6개 앱이 모두 싣는다).
  - `def`: crontab 식·변수·정의 레코드.
  - `server`: MCM 쪽(캐시·선점·기록·API·화면 서비스). `dmes.job.server.enabled`(MCM 앱만 true)일 때만 빈이 된다.
  - `agent`: 모든 모듈 쪽(매분 claim·실행·보고·코드 작업 등록 요청).
  - `kind`: 실행 유형.
- 새 테이블 4개(MCMAPUSER): 작업 정의 `TB_MCM_JOB_DEF`, 실행 기록 `TB_MCM_JOB_RUN`, 모듈 키별 정의 버전 `TB_MCM_JOB_VER`, 수집 값 `TB_MCM_JOB_COLLECT_DATA`.
- 관리 화면은 mcm 에 하나: 공통관리 > 시스템관리 > 「예약 작업 관리」(`csa/jobSchedMng`). 위젯관리와 같은 배치·흐름이며 모듈을 골라 보고 고친다.
- **MCM 이 꺼져 있는 동안에는 모든 모듈의 예약 작업이 멈춘다.** MCM 이 돌아오면 그 사이 회차는 따라잡지 않고 `SKIP`(「놓친 회차를 건너뜀」) 1건으로 남는다. 모듈은 claim 실패를 첫 번째만 WARN 하고 매분 다시 시도하며, 기동은 실패하지 않는다.

## 3. 테이블

스키마 MCMAPUSER, Flyway `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V3__job_scheduler.sql`. **이 표들에는 MCM 앱만 닿는다**(JdbcTemplate, SQL 에 `MCMAPUSER.` 접두). 감사 칸(`C_AT`·`C_USR_ID`·…·`VER`)은 SQL 에서 직접 채운다. 시각 칸은 모두 `TIMESTAMP(6)`(KST)이다.

### 3.1 `TB_MCM_JOB_DEF` 작업 정의

| 칸 | 형식 | 설명 |
|---|---|---|
| `JOB_ID` | varchar2(60) PK | `[A-Za-z0-9_.-]{1,60}`(로그 serviceId 규칙 `[\w.-]+`, 콜론 금지). 관례 `<모듈 소문자>.<이름>`(예: `mdm.masterSync`) |
| `MODULE_CD` | varchar2(10) | 모듈 키 `MCM`·`MDM`·`MPP`·`MLS`·`MQC`·`MPN`(대문자). 이 모듈 앱만 실행한다 |
| `JOB_NM` | varchar2(100) | 이름 |
| `JOB_KIND` | varchar2(10) | 실행 유형 `CODE`·`BPMN`·`QUERY`·`COLLECT`·`HTTP`·`PURGE`(§5) |
| `CRON_EXPR` | varchar2(100) | crontab 5칸 식(§4.0) |
| `USE_YN` | char(1) | `Y`·`N` |
| `CONFIG_JSON` | clob | 유형별 설정(§5 의 각 유형 표). 코드 작업은 null |
| `VARS_JSON` | clob | 변수 목록 `[{name, type, value, desc}]`(§5.0). 없으면 null |
| `TIMEOUT_SEC` | number(6) | 시간 초과(초). 유형별 기본값(§5) |
| `NEXT_RUN_AT` | timestamp(6) | 다음 예정 시각. 선점의 기준 |
| `JOB_DESC` | varchar2(500) | 설명 |
| `OWNER_TP` | varchar2(10) | `CODE`(코드 등록)·`USER`(화면 등록). 화면에서 지우기·유형 바꾸기 가능 여부를 가른다 |
| `CODE_SEEN_AT` | timestamp(6) | 코드 작업의 빈이 마지막으로 확인된 시각(「코드 없음」 판정) |
| `OPTS_JSON` | clob | 고급 설정: 재시도 `{retry:{count,intervalMin}}`, 이어 실행 `{next:[jobId…]}`(D12) |

- 인덱스: `(MODULE_CD, USE_YN)`.

### 3.2 `TB_MCM_JOB_RUN` 실행 기록

| 칸 | 형식 | 설명 |
|---|---|---|
| `JOB_ID` | varchar2(60) PK1 | |
| `SCHED_AT` | timestamp(0) PK2 | 예정 시각(초 단위). 일정 회차는 `NEXT_RUN_AT` 그대로, 「지금 실행」은 요청 시각 |
| `TRIGGER_TP` | char(1) PK3 | `S`(일정)·`M`(지금 한 번 실행) |
| `MODULE_CD` | varchar2(10) | |
| `SERVER_NM` | varchar2(100) | 실행한 서버(`호스트:앱이름:pid`) |
| `STATUS` | varchar2(8) | `REQ`(지금 실행 요청, 아직 안 잡힘)·`RUN`·`OK`·`FAIL`·`SKIP`·`TIMEOUT` |
| `STARTED_AT`·`ENDED_AT` | timestamp(6) | |
| `ITEM_CNT` | number(10) | 처리 건수(유형별 뜻은 §5) |
| `MSG` | varchar2(500) | 실패·건너뜀 사유. 주소·인증값·DB 원문 메시지는 넣지 않는다 |
| `REQ_USR_ID` | varchar2(100) | 지금 실행을 요청한 사용자 |
| `TIMEOUT_SEC` | number(6) | 이 회차에 적용한 시간 초과(정의가 나중에 바뀌어도 정리가 정확하도록) |
| `VARS_JSON` | clob | 「지금 실행」 때 덮어쓴 변수 값(D11) |
| `RUN_ID` | varchar2(36) UNIQUE | 실행 하나의 ID(UUID). claim 응답·result 보고의 키 |
| `CLAIM_REQ_ID` | varchar2(120) | 이 실행을 맡긴 claim 요청 ID(`서버명|yyyyMMddHHmm`). 같은 요청 ID 재요청이면 이 값으로 찾아 그대로 돌려준다(멱등) |

- PK `(JOB_ID, SCHED_AT, TRIGGER_TP)` 는 **이중 안전장치**다. 행 잠금으로 한 서버만 잡지만 같은 회차를 두 번 INSERT 하면 PK 위반으로 막힌다.
- 인덱스: `(STATUS, STARTED_AT)`, `(STARTED_AT)`, `(JOB_ID, SCHED_AT DESC)`, `(CLAIM_REQ_ID)`, `(MODULE_CD, STATUS)`(REQ 찾기), UNIQUE `(RUN_ID)`.

### 3.3 `TB_MCM_JOB_VER` 모듈 키별 정의 버전

| 칸 | 형식 | 설명 |
|---|---|---|
| `MODULE_CD` | varchar2(10) PK | 캐시 키와 같은 값(`MCM`·`MDM`·…) |
| `DEF_VER` | number(19) | 그 모듈의 정의가 바뀌면 +1. MCM 인스턴스들이 30초마다 읽어 캐시를 맞춘다(§4.6) |

- V3 에서 6개 모듈 행을 0 으로 넣어 둔다.

### 3.4 `TB_MCM_JOB_COLLECT_DATA` 수집 값

기존 `TB_MCM_WIDGET_COLLECT_DATA` 와 같은 모양이고 키만 `WIDGET_ID` → `JOB_ID` 로 바뀐다.
PK `(JOB_ID, SLOT varchar2(12), ITEM_KEY varchar2(100))`, `VALUE_NUM number(24,8)`, `VALUE_TXT varchar2(200)`, 인덱스 `(SLOT)`.

- 위젯 수집 표를 재사용하지 않고 새 표를 둔다. 위젯과 JOB 은 관계가 없고 키 이름(`WIDGET_ID`)과 뜻이 어긋난다.
- 기존 `TB_MCM_WIDGET_COLLECT_RUN`·`_DATA` 는 더 쓰지 않는다(행 0건). DROP 하지 않고 표 삭제는 따로 결정한다.

## 4. 일정·선점·캐시

### 4.0 crontab 식

- 5칸 `분 시 일 월 요일`, 시간대 Asia/Seoul. 리눅스 crontab 과 같게 `*`·`,`·`-`·`/`, 월·요일 영문 이름(`JAN`·`MON`), 요일 `0`·`7`=일요일, 매크로 `@hourly`·`@daily`·`@weekly`·`@monthly`·`@yearly` 를 받는다.
- 계산은 Spring `CronExpression` 에 초 칸 `0` 을 앞에 붙여 맡긴다. Spring 만 받는 문법(`?`·`L`·`W`·`#`, 6칸 식)은 저장 검사에서 거절한다.
- **crontab 과 다른 점 하나**: crontab 은 `일`·`요일` 이 둘 다 `*` 가 아니면 OR(둘 중 하나만 맞아도 실행)인데 Spring 은 AND 다. 헷갈리지 않게 둘을 함께 제한한 식은 저장 때 거절하고 하나는 `*` 로 쓰게 안내한다.
- 화면은 「쉬운 설정」(반복 종류별 칸)과 「직접 입력」(다섯 칸)으로 식을 만들고, 설명과 다음 예정 5개는 서버(`cronPreview`)가 계산한다.
- 수집 작업의 간격 하한(기존 규칙 유지): 연속한 두 실행 간격 5분 이상, 환율은 60분 이상. 앞으로 1년 동안의 실행 시각을 차례로 계산해 가장 짧은 간격을 본다. 다른 유형은 1분 간격도 쓸 수 있다.

### 4.1 모듈 쪽 매분 동작(`JobAgent`)

1. 각 앱의 전용 `ThreadPoolTaskScheduler`(스레드 1, 이름 `job-tick-`)가 매분 0초(Asia/Seoul)에 깨어난다. 공용 스케줄러를 쓰지 않으므로 cactus-core 를 바꾸지 않는다. 틱은 `ScheduledJobLogContext.runQuiet("sch.jobAgent.tick", …)` 로 감싸 시작·끝 줄을 DEBUG 로 낮춘다.
2. 실행 풀 빈 자리가 0 이면 claim 을 부르지 않는다. 있으면 `claim` 을 한 번 부른다.
   - 요청: `{ module, requestId, serverNm, freeSlots, codeJobIds[] }`.
   - `requestId` = `serverNm + "|" + 틱 분(yyyyMMddHHmm)`.
   - `codeJobIds` 는 이 앱에 있는 `ScheduledJob` 빈 ID 목록이다.
3. 응답의 실행 목록을 실행 풀(4.3)에 넣는다.
4. claim 호출이 실패(연결·5xx·시간 초과 5초)하면 같은 `requestId` 로 한 번 더 부른다. 그래도 실패하면 이번 분은 건너뛴다. 실패는 연속 첫 번째만 WARN, 복구 때 INFO 1줄.
5. 쌓인 결과 보고 재전송(4.4)을 이 틱에서 함께 처리한다.
- MCM 앱 자신은 `LocalJobCoordinator`(같은 서비스 직접 호출)를, 다른 모듈은 `HttpJobCoordinator`(서버 간 API)를 쓴다. 둘 다 `JobCoordinator` 인터페이스다.

### 4.2 MCM 쪽 판정과 선점(`JobClaimService`)

1. **캐시 판정**(DB 0회): 캐시[모듈 키]에서 다음을 모두 만족하는 작업만 후보로 둔다.
   - `USE_YN='Y'` 이고 `NEXT_RUN_AT <= DB 시계 추정 + 30초`. DB 시계 추정은 MCM 이 30초마다 버전 확인 때 함께 읽은 `DB 시각 - 서버 시각` 차이를 더해 구한다.
   - CODE 작업이면 요청의 `codeJobIds` 에 그 ID 가 있어야 한다(처리기가 없는 서버에는 맡기지 않는다).
   - COLLECT 작업이면 `dmes.job.collect.enabled` 가 true 여야 한다.
2. 그 모듈 키의 `REQ`(지금 실행 요청)가 있다는 표시(캐시 안 `pendingReq` 플래그, 화면 요청 때 켜고 버전 확인 때 DB 로 다시 맞춤)도 본다.
3. 후보도 REQ 도 없으면 **DB 를 읽지 않고 빈 응답**을 돌려준다.
4. 있으면 짧은 트랜잭션 하나에서 다음을 한다.
   - 멱등 확인: `SELECT … FROM TB_MCM_JOB_RUN WHERE CLAIM_REQ_ID = :requestId`. 있으면 그 실행들을 그대로 돌려준다(응답 유실 뒤 재요청).
   - 일정 선점(SQL 아래). 잡은 행마다 늦은 회차·겹침을 판정하고 `RUN`(또는 `SKIP`)을 INSERT 한 뒤 `NEXT_RUN_AT` 을 올린다.
   - `REQ` 선점: `SELECT … FROM TB_MCM_JOB_RUN WHERE MODULE_CD=:m AND STATUS='REQ' … FOR UPDATE SKIP LOCKED` → `RUN` 으로 바꾸고 `CLAIM_REQ_ID`·`SERVER_NM` 을 적는다. CODE 작업 REQ 는 `codeJobIds` 에 있을 때만 잡는다.
   - 합계는 `freeSlots`(최대 20)까지만 잡는다. 남은 후보는 다음 분에 잡는다.
   - 커밋한 뒤 캐시의 그 작업 `NEXT_RUN_AT` 을 새 값으로 바꾼다.
5. 후보였지만 잡히지 않은 작업(다른 MCM 인스턴스가 이미 올림)은 `SELECT JOB_ID, NEXT_RUN_AT … WHERE JOB_ID IN (…)`(잠금 없이)로 다시 읽어 캐시를 맞춘다.

```sql
SELECT JOB_ID, CRON_EXPR, TIMEOUT_SEC, NEXT_RUN_AT, VARS_JSON, CONFIG_JSON, JOB_KIND,
       CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP) AS DB_NOW
  FROM MCMAPUSER.TB_MCM_JOB_DEF
 WHERE JOB_ID IN (:ids)
   AND MODULE_CD = :module
   AND USE_YN = 'Y'
   AND NEXT_RUN_AT <= CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP) + INTERVAL '30' SECOND
   FOR UPDATE SKIP LOCKED
```

- 행 수 제한(`FETCH FIRST`·`ROWNUM`)은 SQL 에 넣지 않는다. `FOR UPDATE` 와 함께 쓰면 ORA-02014 가 나거나 ROWNUM 이 잠금 전에 잘라 적게 돌아온다. 상한은 Java 로 건다.
- 잡은 행마다(같은 트랜잭션):
  1. **늦은 회차**: `DB_NOW - NEXT_RUN_AT > 2분` 이면 따라잡지 않고 `SKIP`("놓친 회차를 건너뜀") 1건만 남긴다.
  2. **겹침**: 같은 작업에 `STATUS='RUN'` 이고 `STARTED_AT + TIMEOUT_SEC + 여유(120초) > DB_NOW` 인 행이 있으면 `SKIP`("이전 회차 실행 중")을 남긴다.
  3. 둘 다 아니면 `RUN` 을 INSERT 한다(`SCHED_AT`=`NEXT_RUN_AT`, `RUN_ID`=새 UUID, `CLAIM_REQ_ID`, `SERVER_NM`, 그 회차의 `TIMEOUT_SEC`). PK 위반이면 건너뛴다.
  4. `NEXT_RUN_AT` 을 `max(NEXT_RUN_AT, DB_NOW)` 보다 엄격히 뒤인 crontab 식의 첫 시각으로 올린다. 밀린 회차가 줄줄이 돌지 않는다.
- DB 시계는 늘 `CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)` 로 읽는다. 운영 DB 의 OS 시간대가 UTC 여도 맞다.
- 회차 키는 서버 시계가 아니라 DB 에 적힌 `NEXT_RUN_AT` 으로 만든다. 서버·MCM 인스턴스마다 시계가 달라도 같은 회차는 같은 PK 다.
- 응답 실행 하나: `{ runId, jobId, kind, schedAt, manual, timeoutSec, config(JSON), vars(확정 전 정의 + 지금 실행 덮어쓰기), reqUserId, prevOkSchedAt }`. 변수 값 확정(실행 변수 `:schedAt` 등)은 모듈이 실행 직전에 한다.

### 4.3 모듈 쪽 실행(트랜잭션 밖)

- 실행 풀: 앱마다 전용 `ThreadPoolExecutor`(스레드 `dmes.job.pool-size` 기본 4, 대기열 0). claim 때 빈 자리만큼만 받는다.
- 같은 서버 안 동시 실행 방지: 실행 중인 `jobId` 를 메모리에 두고, 같은 작업이 다시 오면 즉시 `SKIP`("같은 서버에서 실행 중") 결과를 보낸다(MCM 의 겹침 판정이 있어 드물다).
- 실행은 `ScheduledJobLogContext.run("sch.job." + jobId, …)` 로 감싼다. 실행 직전에 변수 값을 확정한다(§5.0).
- 시간 초과: `timeoutSec` 를 넘으면 `Future.cancel(true)`(인터럽트)하고 `TIMEOUT` 결과를 보낸다.
- 실행 내내 DB 잠금·연결을 쥐지 않는다. 작업 몸체는 그 모듈 앱의 기본 DataSource 로 돈다.

### 4.4 결과 보고(`result`)

- 요청: `{ runId, status(OK|FAIL|TIMEOUT|SKIP), itemCnt, msg, startedAt, endedAt, serverNm }`.
- MCM: `UPDATE … SET STATUS, ITEM_CNT, MSG, ENDED_AT WHERE RUN_ID=:runId AND STATUS='RUN'`.
  - 1행이면 반영한다.
  - 0행이면 지금 상태를 읽는다. 같은 상태면 이미 반영된 재전송이므로 성공으로 답한다(멱등). `TIMEOUT` 으로 이미 정리된 행이면 덮어쓰지 않고 「늦은 보고」로 답한다(MCM 이 warn 로그).
- 모듈: 보고가 실패하면 메모리 재전송 대기열에 넣고 5초·15초 뒤, 그 뒤로는 매 틱마다 다시 보낸다. 10분이 지나면 버리고 WARN 한다(그 행은 sweep 이 TIMEOUT 으로 정리).
- 이어 실행(§5.5)은 MCM 이 OK 결과를 반영할 때 `REQ` 를 넣는다.

### 4.5 시간 초과 정리(`mcm.jobRunSweep`, MCM 코드 작업, 5분마다)

- `RUN` 이고 `STARTED_AT + TIMEOUT_SEC + 600초 < DB_NOW` → `TIMEOUT`("결과 보고 없음"). 여유 600초는 모듈의 결과 재전송 창(10분)과 맞춘다.
- `REQ` 이고 `C_AT + 10분 < DB_NOW` → `SKIP`("실행할 서버 없음").
- `TIMEOUT` 으로 바뀐 작업은 다음 회차를 막지 않는다. 그래서 작업 몸체는 같은 회차가 겹쳐도 결과가 같게(멱등) 만든다. 옮기는 기존 작업은 모두 멱등이다.

### 4.6 MCM 캐시(모듈 키별)

- 캐시는 **모듈 키(`MCM`·`MDM`·`MLS`·`MPP`·`MQC`·`MPN`)를 키로 하는 맵**이다: `Map<JobModule, ModuleDefs(버전, 정의 목록, pendingReq)>`.
- 지연 적재: claim 이 오거나 화면이 목록을 열 때 그 키가 비어 있으면 쿼리로 읽어 넣는다. 이후 그 키는 쿼리 없이 쓴다.
- 화면에서 저장·사용 변경·삭제하면 같은 트랜잭션에서 `TB_MCM_JOB_VER.DEF_VER`(그 키)를 +1 하고, 커밋 뒤 이 인스턴스의 캐시[그 키]를 비운다.
- MCM 이 여러 대일 때: 각 MCM 인스턴스가 **30초마다** `SELECT MODULE_CD, DEF_VER, CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP) FROM MCMAPUSER.TB_MCM_JOB_VER` 한 번(6행)을 읽는다. 캐시와 다른 키만 비운다. JdbcTemplate 이라 Hibernate SQL 로그에 찍히지 않고, 실패하면 첫 번째만 WARN 한다.
  - 30초인 이유: 캐시가 어긋나도 선점 SQL 이 `USE_YN`·`NEXT_RUN_AT` 을 DB 에서 다시 보므로 잘못 실행하지 않는다. 어긋남의 영향은 「새로 만든·켠 작업이 다른 MCM 인스턴스에서 최대 30초 늦게 보임」뿐이다.
  - 같은 확인에서 `REQ` 가 있는 모듈 목록(`SELECT DISTINCT MODULE_CD … WHERE STATUS='REQ'`)도 읽어 `pendingReq` 를 맞춘다. 그래서 다른 MCM 인스턴스가 받은 「지금 실행」도 30초+1분 안에 실행된다.
- SQL 로 정의를 직접 고쳤다면 그 키의 `DEF_VER` 도 +1 해야 반영된다(아니면 MCM 재기동 때 반영).
- JOB 표가 없거나 DB 에 닿지 않아도 MCM 기동은 실패하지 않는다. WARN 한 번 남기고 다음 확인 때 다시 시도한다.

### 4.7 모듈과 서버 설정

- 앱의 모듈 키는 `dmes.job.module`(비어 있으면 `spring.application.name` 의 첫 `-` 앞부분을 대문자로)이다.
- `dmes.job.agent.enabled`(기본 true): false 면 그 앱은 예약 작업을 돌리지 않는다.
- `dmes.job.server.enabled`: MCM 앱의 `application.yml` 에서만 true. JOB 표·캐시·API·화면 서비스 빈은 이 값이 true 일 때만 만든다.
- 다른 모듈의 MCM 주소·키: `dmes.job.mcm.base-url`(로컬 기본 `http://localhost:8090` — 구현 때 mcm 포트 확인), `dmes.job.mcm.client-key`(비면 `cactus.security.client-key`·env `BACKEND_CLIENT_KEY`). 운영 프로필은 값 없이 자리만 둔다. 본보기 cactus-core `mdm/MdmMetaClient`·`MdmClientProperties`.
- `SERVER_NM` 은 `dmes.job.server-name`, 비어 있으면 `호스트이름:spring.application.name:pid`.

### 4.8 「지금 한 번 실행」

- 화면 요청을 받은 MCM 이 `TB_MCM_JOB_RUN` 에 `STATUS='REQ'`, `TRIGGER_TP='M'`, `SCHED_AT`=요청 시각(초), `RUN_ID` 를 넣고 그 키의 `pendingReq` 를 켠다.
- 그 모듈의 다음 claim(1분 안)이 REQ 를 잡아 실행한다. 다른 MCM 인스턴스가 받은 claim 이면 버전 확인(30초) 뒤에 잡는다.
- 같은 작업이 어느 서버에서든 `RUN`(시간 초과 전)이거나 이미 `REQ` 이면 요청을 거절한다. `NEXT_RUN_AT` 은 바꾸지 않는다.

### 4.9 서버 간 API(`JobInternalController`, MCM 앱만)

| 경로 | 요청 | 응답 |
|---|---|---|
| `POST /internal/job/claim` | `{module, requestId, serverNm, freeSlots, codeJobIds}` | `{runs:[…]}` |
| `POST /internal/job/result` | `{runId, status, itemCnt, msg, startedAt, endedAt, serverNm}` | `{applied: true｜false, reason?}` |
| `POST /internal/job/register` | `{module, jobs:[{id, name, defaultCron, timeoutSec, vars, desc}]}` | `{inserted:n}` |
| `POST /internal/job/collect` | `{runId, slot, items:[{key, num, txt}]}` | `{saved:n}` |

- 보안
  - 경로가 `/api/` 로 시작하지 않으므로 포털 BFF 의 `/api/{module}/…` 전달 경로로는 닿지 않는다.
  - 요청은 `X-Client-Key`(ClientKeyFilter)를 통과해야 한다. 그리고 인증 주체가 `system:<모듈 소문자>`, 역할이 `SYSTEM` 이어야 한다(`MdmMetaClient` 와 같은 헤더 규칙). 사용자 주체(사번 등)·사용자 토큰이면 403 이다.
  - `module` 값은 주체의 모듈과 같아야 한다. 다른 모듈의 실행을 받아 갈 수 없다.
  - 시험: 키 없음 → 401, 사용자 주체 → 403, 다른 모듈 키 요청 → 403, system 주체 → 200.
- `register`: 모듈 앱이 기동할 때(그리고 실패하면 매분 다시) 자기 `ScheduledJob` 빈 목록을 보낸다. MCM 은 없을 때만 INSERT(OWNER_TP=CODE)하고, 받은 ID 모두의 `CODE_SEEN_AT` 을 갱신한다. 새로 넣은 것이 있으면 그 키 `DEF_VER` +1·캐시 비움.
- CODE 작업 처리기가 없는 서버에는 선점하지 않는다(4.2-1). 처리기가 모든 서버에서 사라진 작업은 아무도 잡지 않으므로 `NEXT_RUN_AT` 이 과거에 머문다. 화면은 `CODE_SEEN_AT` 이 7일 넘게 갱신되지 않았으면 「코드 없음」으로 보인다. 처리기가 다시 생기면 첫 claim 에서 늦은 회차로 SKIP 1건 뒤 정상으로 돈다.

## 5. 실행 유형

유형은 위젯 유형처럼 **등록부**로 다룬다. 서버는 `JobKind` 인터페이스(유형 ID, 설정 검사, 실행) 구현 빈을 모아 두고, 화면은 유형마다 아이콘·이름·설명·편집기를 가진 등록부를 둔다. 새 유형은 서버 빈 하나와 화면 편집기 하나를 더하면 된다.

### 5.0 공통: 변수

- 모든 유형이 변수 목록을 받는다(`VARS_JSON`): `[{ "name": "baseDt", "type": "DATE", "value": ":yesterday", "desc": "기준일" }]`.
  - `name`: `[A-Za-z][A-Za-z0-9_]{0,29}`, 작업 안에서 겹치지 않음. `type`: `STRING`·`NUMBER`·`DATE`·`JSON`.
  - `value`: 고정값 또는 **실행 변수**. 실행 변수는 실행 직전에 값이 정해진다: `:schedAt`(예정 시각), `:now`, `:today`, `:yesterday`, `:monthStart`, `:prevMonthStart`, `:prevRunAt`(직전 정상 회차의 예정 시각, 없으면 null), `:jobId`, `:moduleCd`.
- 유형별로 변수가 쓰이는 곳: BPMN 은 서비스 입력 파라미터, QUERY·COLLECT(SQL)·PURGE 는 바인드 변수 `:이름`, HTTP 는 URL·본문의 `{{이름}}` 자리, CODE 는 `JobContext.vars()`.
- 코드 작업은 코드가 기본 변수를 정하고, 화면에서는 값만 바꾼다(이름·형식은 바꾸지 않음).
- 화면 「지금 실행」은 이번 한 번만 쓰는 변수 값을 받을 수 있다(예: 지난 날짜로 다시 집계). 기록에는 그 값을 남긴다(D11).

### 5.1 유형 목록

| 유형 | 설정(`CONFIG_JSON`) | 실행 | 건수 | 기본 시간 초과 |
|---|---|---|---|---|
| `CODE` 코드 작업 | 없음(코드가 정함) | `ScheduledJob` 빈 `run(ctx)` | 작업이 돌려준 수 | 30분 |
| `BPMN` BPMN 서비스 | `serviceId`, `action` | 그 모듈 앱의 `OasisServiceExecutor.execute(serviceId, action, CactusRequest(meta{userId=실행 사용자, menuId=JOB_ID}, params=변수))`. 응답이 오류면 FAIL(응답 코드와 사용자용 메시지만 기록) | 응답의 처리 건수가 있으면 그 값 | 10분 |
| `QUERY` 쿼리 | `sql`(INSERT·UPDATE·DELETE·MERGE 한 문장 또는 `BEGIN 프로시저(…); END;`) | 그 모듈 앱의 기본 DataSource 로 트랜잭션 하나에서 실행. DDL·여러 문장·COMMIT/ROLLBACK 문 거절 | 영향받은 행 수 | 10분 |
| `COLLECT` 수집 | `source`: `{kind:"sql", sql, valueField, keyField}`·`{kind:"http", url, items}`·`{kind:"exchange", currencies}` | 기존 `Sql/Http/ExchangeCollectSource` 로 읽어 `TB_MCM_JOB_COLLECT_DATA` 에 저장(쿼리 위젯이 SQL 로 읽을 수 있음) | 저장한 항목 수 | 2분 |
| `HTTP` HTTP 호출 | `method`(GET·POST), `url`, `body`(JSON, `{{변수}}`), 성공 판정 2xx | 허용 호스트만, 리다이렉트 안 따름, 연결 3초·읽기 30초·응답 1MB(기존 `HttpCollectSource` 보안 규칙 재사용). 응답 본문은 저장하지 않음 | HTTP 상태 코드 | 2분 |
| `PURGE` 보관 삭제 | `table`, `dateColumn`, `keepDays`, `chunkRows`(기본 5000) | `DELETE … WHERE 날짜칸 < 오늘-보관일수 AND ROWNUM <= chunkRows` 를 0 이 될 때까지 덩어리로 반복(최대 2000회). 표·칸 이름은 그 모듈 스키마의 실제 표·날짜 칸인지 데이터 사전으로 검사 | 지운 행 수 | 30분 |

- 「생각해 보고 더 있으면 추가」에 대한 제안
  - 이번에 넣는 것: `HTTP` 호출(외부 시스템 트리거·웹훅), `PURGE` 보관 삭제(SQL 없이 흔한 정리 작업 등록).
  - 공통 기능으로 제안(첫 판 포함 여부는 D12): 실패 시 재시도(횟수·간격), 선행 작업 이어 실행(앞 작업이 정상으로 끝나면 바로 이어서 실행), 실패 알림(받는 사람에게 포털 알림).
  - 넣지 않는 것: 셸 명령 실행(서버 OS 명령은 보안 위험이 커서 다루지 않음), 다른 모듈 작업 직접 호출(선행 작업 이어 실행으로 대신함).

### 5.2 코드 작업

```java
public interface ScheduledJob {
    String id();                       // JOB_ID, 예: "mcm.screenUsageRollup"
    JobModule module();                // 모듈 키, 예: JobModule.MCM
    String name();
    String defaultCron();              // 처음 등록할 때 쓰는 crontab 식
    default List<JobVar> defaultVars() { return List.of(); }
    default Duration defaultTimeout() { return Duration.ofMinutes(30); }
    int run(JobContext ctx);           // 처리 건수. 실패는 예외
}
```

- 빈으로 등록하면 그 모듈 앱이 기동할 때 MCM `register` API 로 보낸다(§4.9). MCM 은 정의 표에 **없을 때만** 기본값으로 INSERT 하고 받은 ID 의 `CODE_SEEN_AT` 을 갱신한다. 화면에서 바꾼 일정·사용·변수 값은 덮어쓰지 않는다. MCM 이 꺼져 있으면 매분 다시 보낸다.
- claim 요청에 이 앱의 코드 작업 ID 목록을 실어, 처리기가 있는 서버에만 CODE 작업을 맡긴다(처리기가 없는 서버에 맡겨 FAIL 을 남기지 않는다).
- 각 모듈은 자기 `lib`·`api` 에 `ScheduledJob` 빈을 두기만 하면 된다. mcm-core 의 작업은 6개 앱이 모두 빈을 갖지만 `module()` 과 앱 모듈 키가 같을 때만 등록·실행하므로 지금처럼 중복 실행되지 않는다.
- 화면은 일정·사용·시간 초과·변수 값만 바꾼다. 지우기·유형 바꾸기는 막는다. 오래 확인되지 않은 코드 작업은 「코드 없음」으로 보인다.

처음 등록하는 코드 작업(모두 `MCM`):

| JOB_ID | 대상 | 기본 crontab | 시간 초과 |
|---|---|---|---|
| `mcm.screenUsageRollup` | `ScreenUsageRollup.rollup()` | `0 2 * * *` | 30분 |
| `mcm.revokedTokenPurge` | `RevokedTokenPurger.purge()` | `0 * * * *` | 10분 |
| `mcm.collectPurge` | 수집 값 90일 보관 삭제(기존 `WidgetCollector.purge` 를 새 표 기준으로) | `30 3 * * *` | 30분 |
| `mcm.jobRunPurge` | 실행 기록 90일 보관 삭제(D7) | `40 3 * * *` | 30분 |
| `mcm.jobRunSweep` | 멈춘 `RUN` → `TIMEOUT`, 오래된 `REQ` → `SKIP` | `*/5 * * * *` | 5분 |

### 5.3 BPMN 실행 사용자

- BPMN 서비스는 감사 칸(`C_USR_ID` 등)과 권한 검사에 사용자가 필요하다. 감사 사용자는 `UserContextHolder` 에서 읽히므로 실행 전후로 넣고 비운다. 트랜잭션은 OASIS 가 프로세스마다 연다. 예약 실행은 시스템 사용자 `SCHEDULER`(D10)로, 「지금 실행」은 요청한 사용자로 실행한다.
- 서비스 ID·Action 은 저장할 때 그 모듈에 실제 있는 BPMN 서비스·Action 인지 확인한다(mcm 서버에서 다른 모듈 BPMN 목록을 읽을 수 없으면 실행 때 판정하고 FAIL 로 기록).

### 5.4 수집 작업(위젯과 관계없음)

- 위젯과 JOB 은 관계가 없다(사용자 결정 13). 위젯 「자동 수집(collect)」 유형은 지우고, 수집은 JOB 의 COLLECT 유형만 맡는다.
- 수집 작업도 작업마다 실행 모듈을 고른다. SQL 원천은 그 모듈 DB 를 읽기 전용 실행기(SqlGuard·행 상한 50·10초)로 읽고, 값은 MCM `collect` API 로 보내 MCM 이 `TB_MCM_JOB_COLLECT_DATA` 에 쓴다(같은 runId·slot·항목은 한 번만). MCM 앱 자신은 직접 쓴다.
- HTTP 원천의 허용 호스트는 지금 `dmes.widget.collect.allowed-hosts` 다. 위젯 유형을 지우므로 `dmes.job.http.allowed-hosts` 로 옮긴다. 옛 키가 있으면 기동 로그에 「새 키로 옮기세요」 warn 을 남기고 함께 읽는다. HTTP 호출 유형도 같은 허용 목록을 쓴다.
- 환율 원천은 `widget/ext` 의 환율 제공자 빈을 그대로 주입해 쓴다(위젯 환율 유형은 남는다).
- 수집 값을 화면에 보이려면 쿼리 위젯에서 `TB_MCM_JOB_COLLECT_DATA` 를 SQL 로 읽는다. 위젯은 일정을 갖지 않고 화면을 열 때·새로 고침 주기마다 읽는다.
- 옛 `dmes.widget.collect.enabled` 는 `dmes.job.collect.enabled`(기본 true)로 바꾼다. false 면 COLLECT 작업은 선점 후보에서 빠지고 `mcm.collectPurge` 도 아무것도 하지 않는다.

### 5.5 재시도·이어 실행(D12)

- 재시도: FAIL 이면 모듈이 결과를 보내기 전에 `intervalMin` 분 뒤 같은 회차를 다시 실행한다(최대 `count` 회). 결과 보고는 마지막 시도 뒤 한 번이고 MSG 에 「재시도 n/N」을 덧붙인다. MCM 은 재시도 설정이 있는 작업의 RUN 행 `TIMEOUT_SEC` 을 (timeoutSec + count × intervalMin 분)으로 기록해 정리가 대기 중인 행을 닫지 않게 한다. 그 사이 서버가 죽으면 재시도는 사라지고 정리가 행을 닫는다.
- 이어 실행: MCM 이 OK 결과를 반영할 때 `next` 의 작업마다 「지금 실행」 요청(REQ, 요청자 `SCHEDULER`)을 넣고 그 모듈의 `pendingReq` 를 켠다. 다른 모듈 작업도 이어 실행할 수 있다.
- 실패 알림은 다음 판이다.

## 6. 없애는 것 / 옮기는 것 / 그대로 두는 것

| 구분 | 대상 | 처리 |
|---|---|---|
| 없앰 | 위젯 유형 「자동 수집(collect)」 프런트 `widget-types/collect/**`, 유형 등록부 항목, 위젯 도움말의 collect 부분 | 삭제(사용자 승인) |
| 없앰 | mcm-core `widget/collect` 의 `WidgetCollector`(매분 tick·03:30 삭제 `@Scheduled`)·`WidgetCollectWriter`·`WidgetCollectReader`·`WidgetCollectConfig`·`CollectConfig`(일정 부분)·엔티티·저장소 | 삭제. 매분 위젯 정의 조회 `findBySrcTpAndTypeIdOrderByWidgetIdAsc` 도 함께 없어진다 |
| 없앰 | `widgetData/run` 의 collect 분기, `WidgetDefConfigRules` 의 collect 검사, 관련 시험 | 삭제 |
| 없앰 | 6개 앱에서 같은 `@Scheduled` 가 각각 도는 중복 | 작업마다 모듈 하나·서버 하나만 실행 |
| 옮김 | `Sql/Http/ExchangeCollectSource`·`CollectItem`·`CollectException`·원천 설정 파싱 | `job/kind/collect` 로 옮겨 COLLECT 유형이 재사용 |
| 옮김 | `WidgetCollectProperties`(허용 호스트·enabled) | `dmes.job.http.allowed-hosts`·`dmes.job.collect.enabled` (옛 키는 warn 과 함께 읽음) |
| 옮김 | 수집 값 90일 보관 삭제 | 코드 작업 `mcm.collectPurge`(새 표 기준) |
| 옮김 | `ScreenUsageRollup` 02:00 | 코드 작업 `mcm.screenUsageRollup` |
| 옮김 | `RevokedTokenPurger` 1시간 | 코드 작업 `mcm.revokedTokenPurge` |
| 그대로 | 위젯 환율·쿼리 유형, `widget/ext` 환율 제공자, `widget/query` SqlGuard·쿼리 위젯 전용 풀 | 재사용, 동작 변경 없음 |
| 그대로 | cactus-core `scheduling`·`OasisServiceExecutor`·`datasource`·`security`·`MdmRevisionPoller` | 바꾸지 않음. `MdmRevisionPoller` 는 서버마다 돌아야 하는 캐시 갱신이라 관리 대상에서 뺀다 |
| 그대로(미사용) | `TB_MCM_WIDGET_COLLECT_RUN`·`_DATA` | DROP 하지 않음. 표 삭제는 따로 결정 |

## 7. 관리 화면 「예약 작업 관리」

- 시안: `src/frontend/m-design-dummy/src/screens/JobSchedulerScreen.tsx`(디자인 검토 모듈, mock 데이터). 사용자 확인 뒤 운영 화면으로 옮긴다.
- 메뉴: 공통관리 > 시스템관리(`csa`), 객체 ID `jobSchedMng`, `componentPath` `csa/jobSchedMng`, FULL_SEQ `1020220`, SYSADMIN `PERM_ALL`. 화면 파일 `src/frontend/m-mcm/page-components/csa/jobSchedMng/`.
- 서버 호출: OASIS `POST /api/mcm/oasis/jobSchedMng/{action}`, action `list`·`get`·`save`·`setUse`·`runNow`·`history`·`cronPreview`·`delete`(USER 작업만). 목록·상세는 MCM 캐시(모듈 키별)에서 답하고, 저장·사용 변경·삭제는 그 키 캐시를 비운다.
- 배치는 위젯관리와 같다.
  - 조회 조건: 모듈(전체·6개)·유형·사용·최근 결과·이름/ID.
  - 왼쪽 「작업 목록」 그리드: 모듈·작업 ID·이름·유형·crontab 식·일정 설명·사용·다음 예정·최근 결과·최근 실행 서버, 「코드 없음」 배지. 버튼 [새 작업]·[복사]·[저장]·[사용/중지]·[지금 실행]·[삭제].
  - 오른쪽 상세: 공통 칸(모듈·ID·이름·유형·설명·사용) → 일정(crontab 입력·자주 쓰는 식·설명·다음 예정 5개) → 유형별 편집기 → 변수 표 → 고급(시간 초과·재시도·선행 작업·실패 알림). 아래에 「실행 이력」(예정 시각·구분·상태·서버·시작·끝·소요·건수·메시지).
  - [새 작업] → 유형 고르기(카드: 아이콘·이름·한 줄 설명, CODE 제외) → 빈 상세. [복사] → 같은 설정의 「… (사본)」.
- crontab 입력 칸과 변수 표는 업무에 묶이지 않는 부품이라 운영 화면으로 옮길 때 `@dk-oasis/shared` 에 새 공통 컴포넌트로 등록한다(CLAUDE.md 공통 컴포넌트 행동강령).
- 화면 규칙: RULE.md 라우팅의 화면 가이드와 mantine-aggrid-ui 스킬(shared 래퍼만 사용, audit 0건).

## 8. 권한·보안

- 화면 서버 호출은 SYSADMIN 권한(객체 `jobSchedMng`)만 연다.
- 서버 간 API(`/internal/job/*`)는 ClientKey + `system:<모듈>` 주체 + `SYSTEM` 역할 + 요청 모듈 일치일 때만 연다. 사용자 주체·사용자 토큰은 403(§4.9).
- QUERY 는 화면에서 등록한 DML·프로시저를 그 모듈 DB 에 쓰는 강한 기능이다. SYSADMIN 만 저장할 수 있고, 저장·실행 때 한 문장인지·DDL·트랜잭션 제어문이 없는지 검사한다. 저장한 사람과 SQL 은 감사 칸·이력으로 남는다(D13).
- COLLECT(SQL): 기존 읽기 전용 실행기(SqlGuard, 행 상한 50, 10초, 쿼리 위젯 전용 풀)를 그대로 쓴다.
- HTTP·COLLECT(HTTP): 허용 호스트 정확 일치, 리다이렉트 안 따름, 내부·메타데이터 주소 거절(기존 `HttpCollectSource` 규칙).
- PURGE: 그 모듈 스키마의 표·날짜 칸만 받고, 이름은 데이터 사전으로 확인한 뒤 따옴표로 감싼 식별자로 넣는다.
- 실행 기록 `MSG` 와 로그에는 주소·인증값·DB 원문 메시지를 넣지 않는다(예외는 종류 이름만).

## 9. 시험

- 단위: crontab 식 검사·다음 예정 계산·간격 하한, 변수 확정(실행 변수·형식 변환), 유형별 설정 검사(QUERY 문장 검사, PURGE 이름 검사), 늦은 회차 판정, 모듈 키 캐시(틱 SQL 0회, 버전 변화 시 그 키만 다시 적재), 실행 기록 상태 전이, 코드 작업 등록(없을 때만, 모듈 키가 다르면 등록 안 함).
- 통합(레인 전용 PDB, `pdb.mjs clone`)
  - **MCM 인스턴스 둘(서로 다른 연결·각자 캐시)로 같은 분에 같은 모듈 claim 경합** → 한 회차는 한 번만 RUN. SKIP LOCKED 는 모의 객체로 재현할 수 없어 실제 Oracle 로 한다.
  - 멱등: 같은 requestId 로 claim 두 번 → 같은 runId 목록. 같은 result 두 번 → 한 번만 반영, 두 번째도 성공 응답.
  - 시간 초과 정리(여유 600초), 늦은 회차 SKIP, 겹침 SKIP, 늦은 result 가 TIMEOUT 을 덮어쓰지 않음, REQ 를 두 claim 중 한쪽만 잡음, 다른 모듈 키 claim 은 잡지 않음, codeJobIds 에 없는 CODE 작업은 잡지 않음.
  - 캐시: 후보 없는 분의 claim 은 DB 0회. 다른 MCM 인스턴스의 저장은 30초 버전 확인 뒤 반영.
  - 보안: `/internal/job/*` 키 없음 401, 사용자 주체 403, 다른 모듈 403, system 주체 200.
  - 유형별 실행: BPMN(시험용 서비스), QUERY(UPDATE 건수), PURGE(덩어리 삭제), COLLECT(SQL 원천).
- 기존 시험: 위젯 collect 시험(`WidgetCollectorTest`·Reader·Writer·collect 편집기 등)은 유형과 함께 지운다. 원천 시험(Sql·Http·Exchange·CollectItem)은 새 패키지로 옮긴다. `ScreenUsageRollupTest` 등은 공개 메서드 그대로라 유지한다.
- 모듈 에이전트: 가짜 MCM(로컬 HTTP)으로 claim 실패 시 같은 requestId 재시도·기동 실패 없음·result 재전송 대기열(5초·15초·매 틱, 10분 뒤 버림)·시간 초과 시 TIMEOUT 보고.
- 다른 모듈 앱 기동 시험: mdm 앱 하나를 MCM 이 꺼진 상태로 띄워 기동이 실패하지 않고 WARN 1회만 남기는지 확인한다.
- 프런트: m-mcm tsc·audit·화면 단위 시험, shared 새 컴포넌트 시험.
- 머지 직전: 전체 시험 1회, `DataInitializerSeedFingerprintTest` 골든 다시 만들기, V3 번호 충돌 재확인.

## 10. DB 적용과 메뉴 등록

- V3 는 머지 뒤 mcm 앱 재기동 때 L_MAIN 에 자동 적용된다. **조정자 허가 전에는 L_MAIN 에 적용하지 않는다.**
- 메뉴·객체·RBAC 등록: Oracle 용 멱등 SQL `docs/mcm/sql/jobSchedMng-menu.sql`(`MERGE`).
- 개발·운영 DB DDL 은 V3 파일을 DBA 가 적용한다.

## 11. 결정 항목(조정자 2026-10-08: D3~D13 권장안대로, D1·D14 폐기, D2 변경, D15 사용자 확정, D16~D20 이번 설계)

- 구현 계획(`docs/superpowers/plans/2026-10-08-job-scheduler.md`)은 결정 15 이전 구조다. **계획은 설계 확정 뒤 다시 쓴다.**
- 설계 확정 전 구현분: `f1ed4d268`(V3 표 4개와 `JobDataSource`). `JobDataSource` 는 결정 15 로 쓰지 않으므로 계획을 다시 쓸 때 지우거나 바꾼다. V3 에는 `RUN_ID`·`CLAIM_REQ_ID` 를 더해야 한다.

| # | 항목 | 권장 |
|---|---|---|
| D1 | 위젯 수집과의 관계 | **폐기**(사용자 결정 13). 위젯 collect 유형 삭제, 위젯과 JOB 은 관계없음 |
| D2 | 수집 작업의 모듈 | **변경**(사용자 결정 14): 작업마다 실행 모듈을 고른다. 값 저장은 MCM `collect` API |
| D14 | MCM 표에 닿는 길 | **폐기**(결정 15). JOB 표에는 MCM 만 닿고 다른 모듈은 서버 간 API 를 쓴다 |
| D15 | 모듈과 MCM 의 역할 | **사용자 확정**(결정 15): 모듈은 매분 claim 만, MCM 이 모듈 키 캐시로 판정·선점, result 로 보고 |
| D16 | MCM 캐시 버전 확인 간격 | 30초(선점 SQL 이 DB 를 다시 보므로 어긋나도 잘못 실행하지 않음. 새 작업이 다른 MCM 인스턴스에서 최대 30초 늦게 보임) |
| D17 | 결과 재전송·정리 여유 | 모듈은 5초·15초 뒤, 이후 매 틱, 10분 뒤 버림 / sweep 여유 600초 |
| D18 | 처리기 없는 CODE 작업 | 선점하지 않음(claim 의 codeJobIds 로 판정). 화면은 CODE_SEEN_AT 7일로 「코드 없음」 |
| D19 | 서버 간 API 경로·인증 | `/internal/job/*`(BFF 미경유) + ClientKey + system 주체·SYSTEM 역할 + 모듈 일치 |
| D20 | 「지금 실행」 지연 | 같은 MCM 인스턴스면 다음 claim(1분 안), 다른 인스턴스면 30초 + 1분 안 |
| D3 | crontab 과 다른 점 | 일·요일 함께 제한한 식, `?`·`L`·`W`·`#`·6칸 식 거절 |
| D4 | 수정 알리기 | **D16 으로 대체**: 모듈은 목록을 들고 있지 않으므로 알릴 대상은 MCM 인스턴스뿐 |
| D5 | 실행 범위 | 6개 모듈 앱 모두 에이전트를 켜고 자기 모듈 키 작업만 받아 실행 |
| D6 | 놓친 회차·겹침 | 따라잡지 않고 `SKIP` 행 1건 |
| D7 | 실행 기록 보관 | 90일 |
| D8 | 화면에서 작업 삭제 | USER 작업만, 정의·이력·수집 값 함께 삭제 |
| D9 | 메뉴 등록 방법 | 멱등 SQL 파일만 두고 조정자가 L_MAIN 에 적용 |
| D10 | BPMN 예약 실행 사용자 | 시스템 사용자 `SCHEDULER`(사용자 표에 등록 필요 여부 확인) |
| D11 | 「지금 실행」 변수 덮어쓰기 | 허용(이번 한 번만, 이력에 값 기록) |
| D12 | 재시도·선행 작업·실패 알림 | 첫 판은 재시도·선행 작업까지, 실패 알림은 알림 수단 확인 뒤 다음 판 |
| D13 | QUERY 유형 허용 범위 | DML 한 문장·프로시저 호출만, SYSADMIN 만 저장 |
