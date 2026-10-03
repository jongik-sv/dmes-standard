# 프레임워크 레인 구조 변경 기록

레인은 프레임워크(cactus 경로, analog 포함), 브랜치는 `refactor/framework`, 기준 태그는 `refactor-2026-10-base`(b557ccbd), 분기점은 af572b93 이다.
이 문서는 README.md §6.1 형식에 따라 이 레인의 구조 변경(S)을 적는다. 성능 수치는 `perf-framework.md` 에 둔다.
커밋 메시지와 diff 를 직접 읽고 적었다. `refactor/framework-tx`·`refactor/framework-tests` 항목은 해당 브랜치가 `refactor/framework` 에 들어온 뒤 해시를 확정한다.

| 번호 | 제목 | 상태 |
|---|---|---|
| S1 | 로그 레벨 설정 | 구조 변경 없음 |
| S2 | analog 검색 풀 공유화·로그 패턴 인스턴스 전달 | 완료(`refactor/framework`) |
| S3 | cactus OASIS 서비스 캐시 교체 | 완료(`refactor/framework`) |
| S4 | OASIS ServiceStarter 를 cactus 에서 직접 조립 | `refactor/framework-tx` 에 있음(머지 전) |
| S5 | cactus 특성 테스트 | 구조 변경 없음 |
| S6 | caravanhub 연동 클라이언트 통합 | 조사만, 사용자 보류 |
| S7 | 커밋 실패 처리 핸들러(항목 3b) | 예정 |
| S8 | AOP 기동 검사(항목 4) | 예정 |
| S9 | errors[] 보강(항목 8) | 예정 |
| S10 | 결함 4건 수정(항목 5b) | 예정 |

## S1. 로그 레벨 설정
- 커밋: bf7df033, de19688e(주석 정정)
- 구조 변경 없음. mcm·mdm·mls api 의 `application.yml` 에서 `com.dongkuk.oasis.methodinvoker` 로거를 WARN 으로 두는 설정 변경이다(요청마다 남던 Try binding·Strategy INFO 를 끈다). 로그량 효과는 `perf-framework.md` P3 에서 본다.
- 되돌리는 방법: 두 커밋을 revert 하거나 yml 의 해당 로거 줄을 지운다.

## S2. analog 검색 풀 공유화·로그 패턴 인스턴스 전달
- 커밋: 54aed6ab(특성 시험), 7388cfa7(패턴), 24317974(풀), 62acaede(풀 거짓 거절 수정)
- 바뀌기 전:
  - `/log/range/time` 의 `search()` 가 요청마다 `Executors.newFixedThreadPool(threads_per_request)` 를 만들고 10ms sleep 으로 종료를 기다렸다. `MultiThreadRangeSearcherRunner` 도 실행마다 범위 수만큼의 풀을 만들고 sleep 으로 기다렸다.
  - `/tree` 는 요청마다 `Thread` 를 새로 띄워 `LogProcessor` 를 돌리고, `LogPattern.loadPattern(File)` 이 전역 static `instance` 를 갈아 끼웠다. `LogToken` 은 처음 읽힌 `LogPattern.getInstance()` 를 static 필드로 붙잡았다.
- 바뀐 뒤:
  - `analog/api` 에 `AnalogSearchExecutors` 빈이 풀 세 개를 갖는다. 파일 검색 풀(`file_search_pool_size`, 미설정이면 `threads_per_request`), 범위 검색 풀(`range_search_pool_size`, 기본 16), 트리 파싱(`tree_parse_pool_size`, 기본 8). 파일 풀과 범위 풀은 바깥 작업이 안쪽 작업을 기다리므로 교착을 막으려고 나눴다.
  - 트리 파싱은 `Semaphore` 로 동시 수를 세어 상한을 넘는 요청을 503 으로 거절한다(`submitTreeParse`). 62acaede 가 초기 구현(SynchronousQueue + AbortPolicy)이 상한 미만에서도 거절하던 결함을 고쳤다.
  - 종료 시 파일·트리 풀을 먼저 닫고 범위 풀은 그 뒤에 닫는다(30초 예산, 남으면 강제 종료).
  - `LogPattern`: `getInstance()`·`loadPattern(File)` 을 없애고 `LogPattern.load(File)`·`load(InputStream)` 이 다 채운 새 인스턴스를 돌려준다. `LogProcessor` 생성자가 `LogPattern` 을 받고 `LogToken.parse(LogData, LogPattern)` 도 패턴을 인자로 받는다. `LogSearchController` 는 `@PostConstruct` 에서 한 번만 읽는다(`classpath:` 는 스트림으로 읽어 bootJar 안에서도 열린다).
  - `analog/core`: `MultiThreadRangeSearcherRunner` 에 `Executor rangeExecutor` 를 더한 생성자, `SearchStrategy(File, String, Executor)` 생성자를 추가했다. 기존 생성자는 `null`(실행마다 임시 풀)로 위임해 남아 있다.
- 바꾼 이유: 요청마다 스레드 풀·스레드를 만들고 버리는 비용을 줄이고, 요청마다 static 인스턴스를 교체하면서 생기던 경합(반쯤 초기화된 패턴을 다른 요청이 볼 수 있음)을 없앤다(7388cfa7 메시지).
- 동작 보존 근거: 54aed6ab 가 변경 전 코드에서 파싱·구간 검색·컨트롤러 응답의 기준 출력을 고정했다(`LogParsingCharacterizationTest`, `RangeSearchCharacterizationTest`, `LogSearchControllerCharacterizationTest`, 응답 JSON 2개, `LogPatternIsolationTest`, `LogSearchControllerTreeLifecycleTest`). 풀 쪽은 `AnalogSearchExecutorsTest`·`LogSearchControllerTreeLimitTest` 가 더해졌다. 통과 수는 머지 요청 때 적는다.
- 동작이 달라지는 점(결함 수정 성격, 7388cfa7 은 `fix` 커밋): `/tree` 가 요청마다 설정을 다시 읽지 않고 기동 시 한 번만 읽는다(전에도 `LogToken` 이 첫 인스턴스를 붙잡아 사실상 첫 것만 쓰였다). 트리 파싱 동시 수가 상한을 넘으면 503 이 나온다. 파일·범위 풀은 대기열이 있어 요청이 몰리면 작업이 대기열에서 차례를 기다린다.
- 영향 범위: `src/backend/analog/core`, `src/backend/analog/api`. `LogPattern.getInstance`·`loadPattern` 의 호출부는 `LogToken`·컨트롤러뿐이다. analog 를 라이브러리로 쓰는 외부 코드가 있으면 공개 API 가 바뀐 것이다. 설정 키 `file_search_pool_size`·`range_search_pool_size`·`tree_parse_pool_size` 가 새로 생겼다(`analog/api` application.yml).
- 되돌리는 방법: 62acaede, 24317974, 7388cfa7 순서로 revert 한다. 7388cfa7 만 되돌리면 24317974 의 컨트롤러가 `LogPattern.load` 를 쓰므로 컴파일이 깨진다. 특성 시험(54aed6ab)은 그대로 둔다.

## S3. cactus OASIS 서비스 캐시 교체
- 커밋: 4a066bc4(특성 시험), 8a488e0d(구현), 622b4f11(CHANGELOG·javadoc)
- 바뀌기 전: `CactusCachingServiceProvider` 가 oasis-core-api `SizeBaseCacheService` 를 썼다. 적중 때도 전역 락 아래 O(n) 작업을 해 OASIS 호출마다 스레드가 한 줄로 섰고, 미스마다 키가 순서 목록에 두 번 들어가 상한이 사실상 지켜지지 않았다. 같은 serviceId 동시 미스는 각자 로드하고 마지막 put 이 이겼다.
- 바뀐 뒤:
  - 새 클래스 `CactusConcurrentCacheService`: 적중은 `ConcurrentHashMap.get` 한 번(락 없음), 쓰기만 한 락 아래에서 값 맵과 넣은 순서 큐를 바꾼다. 상한을 넘으면 가장 먼저 넣은 키부터 내보낸다(FIFO).
  - `CactusCachingServiceProvider` 가 키별 진행 중 로드(`inFlight`)로 같은 키 동시 미스를 한 번만 로드한다. 로드 실패는 묶지 않는다.
  - `OasisAutoConfiguration` 의 transactional 모드 `serviceStarter` 가 `CactusConcurrentCacheService` 를 넣는다. `DefaultTxInjectingServiceProvider` 는 캐시 안쪽에 두는 순서를 그대로 유지했고 javadoc 만 고쳤다.
- 바꾼 이유: OASIS 서비스 호출마다 거치는 캐시 적중 경로의 직렬화를 없앤다. 효과는 `perf-framework.md` P1 에서 잰다.
- 동작 보존 근거: 4a066bc4 가 변경 전 동작을 고정했다(`CactusCachingServiceProviderCharacterizationTest`, `DefaultTxInjectingServiceProviderCharacterizationTest`, 옛 구현의 결함을 기록한 `SizeBaseCacheServiceQuirksTest`). 새 구현은 `CactusConcurrentCacheServiceTest`, `CactusCachingServiceProviderConcurrencyTest` 로 시험한다. 통과 수는 머지 요청 때 적는다.
- 동작이 달라지는 점(CHANGELOG 「동작 변경」 참조): (1) `cactus.oasis.cache.size` 가 1 보다 작으면 `transactional=true` 일 때 기동이 `IllegalArgumentException` 으로 실패한다(전에는 0 도 기동). (2) 상한을 실제로 지켜 넘치면 FIFO 로 내보낸다. 운영 BPMN 수(mcm 35·mdm 52)가 기본 100 보다 작아 보통 일어나지 않는다. (3) 같은 키 동시 미스는 한 번만 로드한다.
- 영향 범위: `cactus-core` 의 `oasis/provider`·`OasisAutoConfiguration`·`OasisProperties`(javadoc). `cactus.oasis.cache.size` 를 0 이하로 둔 호스트가 있으면 기동이 실패한다. 호스트 설정 확인이 필요하다.
- 되돌리는 방법: 8a488e0d 를 revert 한다. 특성 시험(4a066bc4)은 그대로 통과해야 한다. `CacheHitThroughputManualTest` 가 옛 구현을 직접 참조하므로 같이 되돌려도 된다.

## S4. OASIS ServiceStarter 를 cactus 에서 직접 조립
- 커밋: 09d9b1c5 (브랜치 `refactor/framework-tx`, 머지 전. 머지 뒤 머지 커밋 해시를 적는다)
- 바뀌기 전: `OasisAutoConfiguration.serviceStarter` 의 transactional 분기가 oasis 모듈의 `SpringServiceStarterFactory(ctx, tmNames)` 에 provider 를 세팅하고 `generateServiceStarter()` 로 조립했다.
- 바뀐 뒤: cactus 의 `CactusServiceStarterFactory(ctx, provider, transactionHandler)` 가 같은 그래프를 공개 생성자로 만든다.
  ```
  StopWatchServiceStarter
    └ SpringServiceStarter(ctx)
        └ CoreServiceStarter(provider, processStarter, transactionHandler)
  ```
  프로세스 실행기 기본값(`NonModifyClassNameResolver`, 최대 스레드 10, 타임아웃 50초)은 oasis 팩토리와 같다. 달라진 점은 트랜잭션 핸들러를 안에서 만들지 않고 주입받는 것 하나이며, 지금은 호출부가 oasis `SpringTransactionHandler` 를 그대로 넘긴다. Spring 빈으로 등록하지 않는다.
- 바꾼 이유: oasis 소스(`src/backend/oasis`)는 고치지 않는다는 규칙 아래, 이후 트랜잭션 핸들러 교체(항목 3b)를 cactus 층에서 할 수 있게 조립 지점을 cactus 로 옮긴다(커밋 메시지).
- 동작 보존 근거: `OasisServiceStarterCharacterizationTest`(6건)가 변경 전 코드로도 통과하도록 빈 메서드만 거쳐 검증한다. 래퍼 순서(StopWatch → Spring → Core), provider·트랜잭션 매니저 이름 전달, 기본값, 성공 커밋, 업무 예외(USER_ERROR)·일반 예외(SYSTEM_ERROR) 롤백, legacy 모드의 단일 tm 을 고정한다. BPMN 3개(`cactus-starter-char/`)와 가짜 트랜잭션 매니저를 쓴다.
  - **언랩 덮어쓰기를 그대로 유지한다.** `OasisServiceExecutor` 는 CGLIB 프록시를 벗기는 `CactusUnwrappingApplicationContext` 로 `ServiceContext` 를 만들지만, 실행 때 `SpringServiceStarter` 가 `ServiceContext` 의 애플리케이션 컨텍스트를 일반 `SpringApplicationContext` 로 다시 바꿔 넣는다. 새 팩토리도 같은 `SpringServiceStarter` 를 쓰므로 이 덮어쓰기가 그대로 남고, 특성 시험이 이를 "현재 동작" 으로 고정한다(`getField(appCtx, "ac")` 가 Spring ctx 와 같음).
- 영향 범위: `cactus-core` 의 `oasis` 패키지(신규 클래스 1개, `OasisAutoConfiguration` 분기 수정, `OasisProperties` javadoc). 호스트·설정 변경 없음. oasis 모듈은 건드리지 않았다.
- 되돌리는 방법: 09d9b1c5 를 revert 한다. S3 와 같은 메서드를 고치므로 S3 뒤에 합치면 `OasisAutoConfiguration` 에서 충돌할 수 있다. 충돌 때는 S3 의 `CactusConcurrentCacheService` 줄을 살린다.

## S5. cactus 특성 테스트
- 커밋: 624e8f04 (브랜치 `refactor/framework-tests`, 머지 전)
- 구조 변경 없음. 트랜잭션·데이터소스·마이바티스·마스터코드·JPA 영역의 특성 테스트만 추가한다.

## S6. caravanhub 연동 클라이언트 통합
- 조사만, 사용자 보류 (dev `docs/idea.md` 「리팩토링 후속」 6d96e86b). 코드 변경 없음.

## S7. 커밋 실패 처리 핸들러 (항목 3b) — 예정
## S8. AOP 기동 검사 (항목 4) — 예정
## S9. errors[] 보강 (항목 8) — 예정
## S10. 결함 4건 수정 (항목 5b) — 예정
- 위 네 항목은 커밋이 생기면 README §6.1 형식으로 채운다. 결함 수정은 리팩토링 커밋과 섞지 않고 `fix(...)` 로 둔다.
