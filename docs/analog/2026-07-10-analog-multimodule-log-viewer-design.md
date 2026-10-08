# Analog 멀티모듈 로그 뷰어 전환 설계

작성일: 2026-07-10
작업 디렉토리: `D:\dmes-standard\workspace-ksm\dmes-aps`

## 1. 목적

현재 analog(FE `m-analog` / BE `analog`)는 app log 조회 도구로 이식되어 있으나, 실제로는
mpn 로그만 규약에 맞게 쌓이고 있어 다른 모듈 로그를 볼 수 없다. 본 설계는 analog 를
**mcm / mpn / mpp / mqc / mls 5개 모듈의 로그를 조회하는 공용 로그 뷰어**로 전환하기 위한
변경 사항을 정의한다.

## 2. 현행 구조 분석 요약

### 2.1 데이터 흐름

```text
m-analog 화면 (log-viewer-page)
  → BFF (m-mcm) /api/analog/rest/{path}      ← be-proxy.ts, ANALOG_WAS_URL 로 라우팅
    → analog BE (port 8191)
      → 파일시스템에서 로그 파일 직접 검색     ← DB 없음
```

- analog BE 는 `analog-express.log_base_dir` 아래에서 파일명 규약으로 파일을 찾아
  시간범위(이진탐색) + 키워드 필터로 검색한다.
  - live: `dmes-{module}.log`
  - archive: `dmes-{module}.{yyyy-MM-dd}.{seq}.log`
  - 예약 작업 로그(2026-10-08): 모든 모듈의 `@Scheduled` 실행 줄은 모듈 로그가 아니라 `logs/sch/dmes-sch.{yyyy-MM-dd}.0.log` 한 파일에 쓰며(여러 JVM 이 쓰는 prudent 모드라 live 이름 `dmes-sch.log` 가 없고 날짜 파일 하나뿐), 뷰어에는 모듈 `sch` 로 나온다.
- 화면의 Module 드롭다운은 BE `/api/meta` 가 내려주는 `analog-express.modules` 설정값
  기반이다. **FE 는 모듈 추가 시 수정이 필요 없다.**

### 2.2 모듈별 로그 현황 (전환 전)

| 모듈 | 로그 설정 | 파일 | 규약 준수 |
|---|---|---|---|
| mpn | `logback-spring.xml` | `./logs/mpn/dmes-mpn.log` + `.yyyy-MM-dd.N.log.gz` | ✓ (단, gz 압축) |
| mcm / mpp / mqc / mls | `application-*.yml` 의 `logging.file.name: ./app.log` | `./app.log` (workingDir 기준 — bootRun 은 각 모듈 루트라 `src/backend/{모듈}/app.log`, 기동 방식이 다르면 `src/backend/app.log` 등 위치 유동) | ✗ — 파일명 규약 미준수 + 위치가 기동 방식에 따라 유동 (src/backend/app.log 실측 79MB 는 workingDir 가 src/backend 였던 기동의 산물) |
| analog | 콘솔 전용 | — | (자체 로그는 대상 아님) |

모듈별 프로파일 현황 (2026-07-13 확인):

- 공통: `dev`, `local`, `local-kp`, `local-ph`, `prod`, `wildfly` (+ 기본 `application.yml`)
- mpn 추가: `test`, `mssql-validate`
- `local*` 계열(`local`, `local-kp`, `local-ph`)은 로그 정책상 모두 local 과 동일하게 취급한다 (D9).

### 2.3 확인된 갭

1. **파일명 규약 미준수** — mcm/mpp/mqc/mls 가 `./app.log` 단일 파일 사용. analog 가
   모듈별로 찾을 방법이 없음.
2. **하위 디렉토리 미탐색** — `FileSearcher.findFile()` 은 `dir.listFiles()` 1단계만 본다.
   모듈별 디렉토리를 쓰려면 `log_base_dir` 의 `{MODULE}` 플레이스홀더를 사용해야 한다.
   단 `LogSearchController.resolveBaseDirectory()` 가 `module.toUpperCase()` 로 치환하므로
   Linux 에서 대소문자 불일치 (Windows 는 우연히 동작).
3. **gz 미지원** — analog core 에 GZIP 해제 코드가 없다. `.log.gz` 아카이브는 파일명
   range filter 에는 걸리지만 내용이 압축 바이너리라 검색 결과가 깨진다.
4. **모듈 목록 mls 누락** — `analog-express.modules` 기본값이 `mpn,mpp,mqc,mcm`.
5. **BFF env 미설정** — `ANALOG_WAS_URL` 이 없으면 `BACKEND_API_URL`(mcm, 8100) +
   `/analog` prefix 로 fallback → 404.

### 2.4 OASIS 최적화 부분 (analog 코드 분석)

analog 는 레거시 OASIS4(부산 Plate) 로그 포맷에 최적화된 부가기능을 갖고 있다.

| 기능 | 의존 대상 | 현 상태 |
|---|---|---|
| Service List 패널 (`ServiceListExtraction`) | 레거시 로그 라인 포맷 `TH-스레드 [4자리 serviceTag] [service][logger]` + `"Service end - service name"` / `"RunTime : [..]"` / `"SERVICE_ACTION : "` 메시지 | {CLIENT} 표준 logback 라인은 lex_pattern 미매치 → 전 모듈 빈 값 (yml 주석에 의도 명시) |
| Tree 엔드포인트 (`/log/range/time/tree` + `analog-serializer.json`) | 레거시 OASIS 로그의 쿼리/파라미터 라인 토큰 정의 | 동작 불가 — 실로그 샘플 확보 후 정교화 예정이던 항목 |
| byThread 검색 | 레거시 스레드별 로그파일 덤프 규약 (`..-THREAD-{SEQ}.log`) | {CLIENT} 은 해당 파일을 생성하지 않음 — 사문 |
| `/log/refresh` (ftp_client), `jcm_`/`appHH`/`QAS_`/`DEV_` 변환 | 레거시 Plate 운영 규약 | 사문 |

**핵심 검색 엔진(시간범위 + 키워드 + 다운로드)은 "라인이 `yyyy-MM-dd HH:mm:ss.SSS` 로
시작"만 요구**하며 (`LoggingTimeComparator`, `new_line_inspector: "20"`), {CLIENT} 표준 logback
패턴과 호환된다. 즉 OASIS 사용 여부와 무관하게 전 모듈 원문 검색이 가능하다.

Service List 를 {CLIENT} 에서 살릴 재료는 cactus-core 에 이미 존재한다:

- `TxIdFilter` 가 MDC 에 `service_tag`(4자리) / `txId` 를 적재 중 — lex_pattern 이 기대하는
  4자리 태그와 일치.
- `OasisServiceExecutor.execute()` 가 serviceId/action 을 알고 있고 시작 로그를 찍는 중
  (`OasisServiceExecutor.java:83`).

## 3. 설계 결정 사항

| # | 결정 | 근거 |
|---|---|---|
| D1 | 아카이브 **압축하지 않음** (`.gz` 제거) | analog gz 미지원 갭의 근본 해결. gz 해제 기능 추가 개발 대비 단순. 보관기간이 짧아 디스크 부담 미미 |
| D2 | 로그 보관기간 **기본 2일**, 프로파일/시스템 프로퍼티로 조절 | dev 디스크 절약. `<springProperty>` 로 `dmes.log.max-history` 를 읽어 profile yml · `-D` 시스템 프로퍼티 · 환경변수 3경로 모두 override 가능 |
| D3 | logback 은 **cactus-core 공통 base xml + 모듈별 include** 구조 | 5개 모듈 복붙 방지. 보관정책 변경이 한 파일 수정으로 종결. (대안: 모듈별 5벌 복사 — 동작 동일, 유지보수만 열위) |
| D4 | 로그 디렉토리는 **모듈별 분리** `./logs/{module}/` | mpn 이 이미 이 구조. flat 디렉토리 대비 운영 관리 용이 |
| D5 | `resolveBaseDirectory()` 를 **소문자 치환**으로 수정 | Linux 운영 대비 근본 수정 (현행 toUpperCase 는 Windows 에서만 우연히 동작) |
| D6 | **Service List 활성화 포함** — 공통 패턴에 MDC 필드 추가 + cactus-core 종료로그 + analog lex_pattern 교체 | 재료가 이미 있어 소규모 수정으로 OASIS 4개 모듈의 서비스별 시작/종료/수행시간/에러 분석 제공 가능 |
| D7 | mpn 은 Service List **비활성 (자연 빈 값)** | mpn 은 OASIS 미사용 REST 모듈. 같은 logback 패턴을 쓰되 MDC 가 비어 `[] []` 로 찍혀 lex_pattern 에 매치되지 않음 — 별도 예외 처리 불필요. 원문 검색은 동일하게 동작 |
| D8 | Tree / byThread / ftp refresh 는 **범위 제외** | Tree 는 실로그 샘플 확보 후 후속 과제. byThread / refresh 는 레거시 사문 — 방치 무해 |
| D9 | **`local*` 계열 프로파일은 모두 local 로그 정책 적용** (`local`, `local-kp`, `local-ph`) | logback `<springProfile>` 은 와일드카드를 지원하지 않으므로 콤마 열거로 처리. 신규 `local-*` 프로파일 추가 시 base xml 의 열거에 1개 추가 (규칙 명시). 열거되지 않은 프로파일(`wildfly`, `test`, `mssql-validate` 등)은 fallback 블록이 INFO + CONSOLE/FILE 로 받아 **로그 유실을 방지**한다 |

## 4. 상세 설계

### Phase 1 — 백엔드 5개 모듈 logback 표준화

#### 1-1. cactus-core 에 공통 base xml 신설

`src/backend/cactus-core/src/main/resources/dmes-logback-base.xml` (신규):

```xml
<included>
    <!-- 각 모듈 logback-spring.xml 이 MODULE_ID property 를 정의한 뒤 include 한다 -->
    <springProperty scope="context" name="LOG_MAX_HISTORY" source="dmes.log.max-history" defaultValue="2"/>
    <!-- 로그 루트 — 로컬 bootRun 은 기본값(모듈 루트 기준 ./logs), WildFly 개발계/운영계는
         standalone.conf 의 -Ddmes.log.root 로 절대경로 지정 (한 JVM 의 전 WAR 에 일괄 적용) -->
    <springProperty scope="context" name="LOG_ROOT" source="dmes.log.root" defaultValue="./logs"/>

    <property name="LOG_PATH" value="${LOG_ROOT}/${MODULE_ID}"/>
    <property name="LOG_FILE" value="dmes-${MODULE_ID}"/>
    <!-- MDC: service_tag / serviceId 는 OASIS 실행 스레드에서만 채워진다 (mpn 등 REST 는 빈 값) -->
    <property name="LOG_PATTERN"
              value="%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] [%X{service_tag}] [%X{serviceId}] %-5level %logger{36} - %msg%n"/>

    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder><pattern>${LOG_PATTERN}</pattern></encoder>
    </appender>

    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_PATH}/${LOG_FILE}.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <!-- .gz 없음 = 비압축 (D1) — analog log_file_name_format 과 정확히 일치 -->
            <fileNamePattern>${LOG_PATH}/${LOG_FILE}.%d{yyyy-MM-dd}.%i.log</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>
            <maxHistory>${LOG_MAX_HISTORY}</maxHistory>
            <totalSizeCap>1GB</totalSizeCap>
            <cleanHistoryOnStart>true</cleanHistoryOnStart>
        </rollingPolicy>
        <encoder><pattern>${LOG_PATTERN}</pattern></encoder>
    </appender>

    <!-- 프로파일별 로그 정책 — 전 모듈 동일하므로 base 에서 일괄 정의 (D9)
         springProfile 은 와일드카드 미지원 → local* 계열은 콤마 열거.
         신규 local-* 프로파일 추가 시 아래 열거에 반드시 추가한다. -->
    <springProfile name="local, local-kp, local-ph">
        <root level="DEBUG"><appender-ref ref="CONSOLE"/><appender-ref ref="FILE"/></root>
    </springProfile>

    <springProfile name="dev">
        <root level="INFO"><appender-ref ref="CONSOLE"/><appender-ref ref="FILE"/></root>
    </springProfile>

    <springProfile name="prod">
        <root level="WARN"><appender-ref ref="FILE"/></root>
    </springProfile>

    <!-- fallback: 위에 열거되지 않은 프로파일(wildfly / test / mssql-validate / 프로파일 미지정 등).
         블록 부재 시 root 에 appender 가 없어 로그가 통째로 유실되므로 반드시 유지한다. -->
    <springProfile name="!local &amp; !local-kp &amp; !local-ph &amp; !dev &amp; !prod">
        <root level="INFO"><appender-ref ref="CONSOLE"/><appender-ref ref="FILE"/></root>
    </springProfile>
</included>
```

설계 근거:

- `maxHistory` 단위는 롤링 주기(일). `2` = 아카이브 2일 + 당일 live → 검색 가능 범위 약 3일.
- `cleanHistoryOnStart=true` — logback 은 원래 롤오버 시점에만 정리하므로, 재기동이 잦은
  dev 에서 기동 시 정리를 보장해야 보관기간이 실제로 지켜진다.
- `totalSizeCap` — 비압축이므로 폭주 대비 상한 유지.
- 롤오버(=아카이브 파일 생성) 시점: 날짜 변경 후 첫 로그 이벤트, 또는 당일 100MB 도달 시.

#### 1-2. 모듈별 logback-spring.xml (5개 — mcm/mpp/mqc/mls 신규, mpn 교체)

`src/backend/{module}/api/src/main/resources/logback-spring.xml` — 프로파일 정책이 전 모듈
동일하므로 (D9, base 에서 일괄 정의) 모듈 파일은 모듈명 선언 + include 2줄로 끝난다:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration scan="true" scanPeriod="30 seconds">
    <property name="MODULE_ID" value="mcm"/>   <!-- 모듈별로 mcm/mpn/mpp/mqc/mls -->
    <include resource="dmes-logback-base.xml"/>
    <!-- 모듈 고유 logger level 이 필요하면 여기에 추가 (예: prod 에서 특정 패키지 INFO) -->
</configuration>
```

#### 1-3. application-*.yml 정리

- 5개 모듈 전체의 `application-{profile}.yml` 에서 `logging.file.name: ./app.log` 제거
  (logback-spring.xml 이 대체). 2026-07-13 확인 기준 21개 파일:
  - mcm: dev / local / local-kp / prod
  - mpn: dev / prod (logback-spring.xml 존재 시 무시되는 잔재 — 혼동 방지 위해 제거)
  - mpp / mqc / mls: dev / local / local-kp / local-ph / prod (각 5개)
- 보관기간을 profile 별로 다르게 줄 경우 yml 에 명시 (시스템 프로퍼티 `-Ddmes.log.max-history=N`
  이 항상 우선):

```yaml
# application-prod.yml 예시
dmes:
  log:
    max-history: 7
```

### Phase 2 — analog BE 설정/코드 수정

#### 2-1. `analog/api/src/main/resources/application.yml`

```yaml
analog-express:
  # dev 기본값 — 각 모듈 bootRun 의 workingDir 가 자기 모듈 루트(src/backend/{module})이므로
  # analog(workingDir=src/backend/analog) 기준 상대경로는 ../{모듈}/logs/{모듈} 이 된다.
  # {MODULE} 플레이스홀더는 복수 등장 가능 (String.replace 가 전부 치환).
  log_base_dir: "${ANALOG_LOG_BASE_DIR:../{MODULE}/logs/{MODULE}}"   # 모듈별 디렉토리 (D4)
  modules: "${ANALOG_MODULES:mcm,mpn,mpp,mqc,mls}"                    # mls 추가
```

로그 저장 절대경로 (로컬 bootRun 기준, `D:\dmes-standard\workspace-ksm\dmes-aps` 체크아웃):

```text
src/backend/{모듈}/logs/{모듈}/dmes-{모듈}.log
예) D:\dmes-standard\workspace-ksm\dmes-aps\src\backend\mcm\logs\mcm\dmes-mcm.log
```

운영/배포 환경에서는 `ANALOG_LOG_BASE_DIR` 에 실제 로그 루트를 절대경로로 지정한다.
IDE 실행 등 workingDir 가 다른 기동 방식은 상대경로가 어긋나므로, dev 에서도 확실히
하려면 `ANALOG_LOG_BASE_DIR` 절대경로 지정을 권장.

#### 2-3. 개발계 (WildFly) 로그 경로

개발계는 각 모듈이 WAR(`mcm.war` 등)로 `D:\Middleware\was\deploy` 에 배포되어 **한 WildFly
JVM 에서 함께 구동**된다. 확인된 전제:

- `jboss-deployment-structure.xml` 이 WildFly `logging` 서브시스템/모듈을 이미 제외 →
  WAR 에 번들된 Logback(logback-spring.xml)이 그대로 권위를 가진다. 추가 작업 불필요.
- `application.yml` 의 `spring.profiles.group` 으로 `dev` 활성 시 `wildfly` 블록이 자동
  포함된다 (wildfly 단독 활성 금지) → logback 프로파일 분기는 `dev` 블록(INFO +
  CONSOLE/FILE)이 적용된다.
- WildFly 에서 상대경로의 기준은 deploy 디렉토리가 아니라 **JVM 기동 위치**(보통
  `%JBOSS_HOME%\bin`)이므로 상대경로 기본값에 의존하면 안 된다.

개발계 로그 루트는 **기존에 로그가 떨어지고 있는 `D:\Middleware\was\logs` 를 그대로 사용**한다.
`standalone.conf.bat` 에 JVM 옵션 1개를 추가한다 (한 JVM 이므로 전 WAR 일괄 적용):

```bat
set "JAVA_OPTS=%JAVA_OPTS% -Ddmes.log.root=D:/Middleware/was/logs"
```

결과 로그 경로 (개발계):

```text
D:\Middleware\was\logs\{모듈}\dmes-{모듈}.log
예) D:\Middleware\was\logs\mcm\dmes-mcm.log
```

- 모듈 로그는 모듈별 하위 디렉토리(`{모듈}\`)로 들어가므로 같은 루트에 있는 WildFly
  자체 로그(server.log 등) 및 기존 파일과 충돌하지 않는다.
- 기존에 이 위치에 쌓이던 규약 외 로그 파일은 전환 시 수동 정리 대상 (§6).

analog 는 WAR 미배포(Spring Boot jar 단독 구동) — 개발계에서 함께 띄울 때는:

```text
ANALOG_LOG_BASE_DIR=D:/Middleware/was/logs/{MODULE}
```

(`-Ddmes.log.root` 와 `ANALOG_LOG_BASE_DIR` 두 값이 같은 루트를 보면 된다.)

#### 2-2. `LogSearchController.resolveBaseDirectory()` 1줄 수정 (D5)

```java
// before
return logBaseDir.replace("{MODULE}", module.toUpperCase());
// after
return logBaseDir.replace("{MODULE}", trimStartingQASOrDEV(module.toLowerCase()));
```

- 기존 `LogSearchControllerTest` 는 `{MODULE}` 플레이스홀더 없는 고정 fixture 디렉토리를
  사용하므로 본 수정에 영향 없음. `{MODULE}` 소문자 치환을 검증하는 테스트 1개를 추가한다.
- 참고: analog 는 이식 시점에 이미 Java 21 / Spring Boot 4.0.6 ({CLIENT} 표준과 동일) 로
  맞춰져 있어 버전 상향 불필요. 자바 소스 수정은 본 1줄 (+ 테스트) 이 전부이며,
  레거시 변환 함수(`removeEndingNumber` / `jcm_` / `appHH` / `QAS_`·`DEV_` prefix)는
  {CLIENT} 모듈명에 no-op 이라 존치한다.

### Phase 3 — Service List 활성화 (D6)

#### 3-1. cactus-core `OasisServiceExecutor` 수정

- `execute()` 진입 시 `MDC.put("serviceId", serviceId)` (finally 에서 remove).
- 실행 시간 측정 후 종료 로그 1줄 추가 — analog 기본 extraction 문구와 일치시킨다:

```java
long started = System.currentTimeMillis();
...
// finally 직전 (정상/예외 공통)
log.info("Service end - service name [{}] RunTime : [{}]", serviceId, System.currentTimeMillis() - started);
```

- ERROR 로그는 기존 `log.error(...)` 가 이미 있으므로 Service List 의 `isError` 표시는
  추가 작업 없이 동작한다 (레벨 ERROR 라인 감지 방식).

#### 3-2. analog `lex_pattern` 교체 (설정만)

Phase 1 의 새 라인 포맷에 맞춘 named-group 정규식으로 교체:

```yaml
analog-serializer:
  # %d [%thread] [%X{service_tag}] [%X{serviceId}] %-5level %logger - %msg
  lex_pattern: "(?<time>20\\d\\d-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d) \\[(?<thread>[^\\]]+)\\] \\[(?<serviceTag>\\w{4})\\] \\[(?<service>[^\\]]+)\\] (?<level>TRACE|DEBUG|INFO|WARN|ERROR)\\s+\\[?(?<logger>[\\w.$-]+)\\]?\\s*-?\\s*(?<message>.*)"
```

> 주의: service 그룹은 1자 이상([^\]]+) — 빈 값 허용 시 일반 HTTP 요청의 service_tag 라인이
> 노이즈로 잡히는 것을 E2E 검증(2026-07-14)에서 확인하여 조정했다. 최종 정규식은 실로그 검증 완료
> (특히 logger 위치 — 패턴상 `%logger` 는 대괄호 없이 출력되므로 위 안은 초안).
> `ServiceListExtraction` 은 serviceTag 가 빈 라인을 skip 하므로 mpn 라인(`[] []`)은
> 자연히 제외된다 (D7).

- `service_finish.start_with_match: "Service end - service name "` /
  `run_time_pattern: "RunTime : \\[(?<runTime>\\d+)\\]\\s*$"` 는 3-1 로그 문구와 이미
  일치하므로 유지.
- `service_action` extraction 은 {CLIENT} 에 해당 문구가 없으므로 현행 유지 (action 컬럼 빈 값 허용).
  필요 시 3-1 에 `SERVICE_ACTION : {action}` 로그 1줄을 추가하는 것으로 후속 확장 가능.

### Phase 4 — BFF env

`src/frontend/m-mcm/.env` 에 추가:

```env
ANALOG_WAS_URL="http://localhost:8191"
```

(운영: env 미설정 + Nginx 게이트웨이에 `/analog/` 라우팅 추가.)

### FE (m-analog) — 수정 없음

Module 드롭다운이 `/api/meta` 기반이므로 Phase 2-1 만으로 5개 모듈이 표시된다.
새 화면 추가 시에만 `m-mcm/app/portal/module-config.ts` 의 `ANALOG_STATIC_PAGES` 에
1줄 등록하는 기존 패턴을 따른다.

## 5. 범위 제외 (후속 과제)

| 항목 | 사유 | 후속 조건 |
|---|---|---|
| Tree 엔드포인트 정교화 | `analog-serializer.json` 토큰 정의를 {CLIENT} 실로그로 재작성 필요 | Phase 1~3 적용 후 실로그 샘플 확보 시 |
| Service List action 컬럼 | {CLIENT} 에 `SERVICE_ACTION` 로그 문구 없음 | 필요 시 OasisServiceExecutor 로그 1줄 추가 |
| byThread 검색 / `/log/refresh` | 레거시 Plate 전용 사문 — 화면에서 미사용 시 무해 | 정리(삭제)는 별도 판단 |
| 분산 배포 시 로그 수집 | analog 는 로컬 파일시스템만 읽음. 모듈 WAS 가 서버 분리되면 공유 볼륨/수집기 필요 | 운영 배치 확정 시 |

## 6. 마이그레이션 / 운영 노트

- **mpn 기존 `.log.gz` 아카이브 1회 수동 삭제** — 파일명 패턴 변경 후 logback cleaner 가
  옛 패턴 파일을 대상에서 놓치므로 `src/backend/mpn/logs/mpn/*.log.gz` 와
  `src/backend/logs/mpn/*.log.gz` (과거 workingDir 상이 기동 산물) 모두 수동 정리.
- **기존 `app.log` 수동 삭제** — `src/backend/app.log`(79MB) 및
  `src/backend/{mcm,mpp,mqc,mls}/app.log`. 규약 외 로그라 보존 가치 없음.
- **개발계 `D:\Middleware\was\logs` 정리** — 전환 시점에 기존 규약 외 로그 파일
  (app.log 등)을 수동 정리. WildFly 자체 로그(server.log 등)는 보존.
- cactus-core 수정(3-1)은 전 모듈 공용 코드 영향 — MDC put 2줄 + 로그 1줄로 위험도 낮음,
  단 배포 시 전 모듈 재빌드 필요.

## 7. 검증 계획

1. 5개 모듈 기동 → 각각 `logs/{module}/dmes-{module}.log` 생성 확인, `app.log` 미생성 확인.
2. analog 기동 → `/api/meta` 에 5개 모듈 표시 확인.
3. 포털 로그인 → analog 화면에서 모듈별 검색/다운로드 확인 (mpn 포함).
4. OASIS 모듈에서 아무 서비스 실행 → Service List 패널에 서비스명/시작/종료/RunTime 표시,
   에러 서비스 빨간 행 표시 확인.
5. mpn 검색 시 Service List 빈 값(정상), 원문 검색 정상 확인.
6. 날짜 롤오버(또는 시계 조작) 후 아카이브 `dmes-{module}.yyyy-MM-dd.0.log` 가 비압축
   생성되고 analog 에서 과거일자 검색이 되는지 확인.
7. `-Ddmes.log.max-history=1` 기동 → 재기동 시 이전 아카이브 정리(cleanHistoryOnStart) 확인.
