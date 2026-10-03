# 프레임워크 레인 구조 변경 기록

레인은 프레임워크(cactus 경로, analog 포함), 브랜치는 `refactor/framework`, 기준 태그는 `refactor-2026-10-base`(b557ccbd), 분기점은 af572b93 이다.
이 문서는 README.md §6.1 형식에 따라 이 레인의 구조 변경(S)을 적는다. 성능 수치는 `perf-framework.md` 에 둔다.
커밋 메시지와 diff 를 직접 읽고 적었다. S4·S5·S7·S9 는 `refactor/framework-tx`(머지 a6a7653d), S8 은 `refactor/framework-aopcheck`(머지 64180224), S10 은 `refactor/framework-tests`(머지 cf714a21), S7 후속은 `refactor/framework-txfix`(머지 4d253151) 로 레인 브랜치에 들어왔다.

| 번호 | 제목 | 상태 |
|---|---|---|
| S1 | 로그 레벨 설정 | 구조 변경 없음 |
| S2 | analog 검색 풀 공유화·로그 패턴 인스턴스 전달 | 완료(`refactor/framework`) |
| S3 | cactus OASIS 서비스 캐시 교체 | 완료(`refactor/framework`) |
| S4 | OASIS ServiceStarter 를 cactus 에서 직접 조립 | 완료(`refactor/framework`, 머지 a6a7653d) |
| S5 | cactus 특성 테스트 | 구조 변경 없음 |
| S6 | caravanhub 연동 클라이언트 통합 | 조사만, 사용자 보류 |
| S7 | 커밋 실패 처리 핸들러(항목 3b) | 완료(`refactor/framework`, 머지 a6a7653d·4d253151), 의도한 동작 변경 |
| S8 | AOP 기동 검사(항목 4) | 완료(`refactor/framework`, 머지 64180224) |
| S9 | errors[] 보강(항목 8) | 완료(`refactor/framework`, 머지 a6a7653d), 응답 변경 |
| S10 | 결함 4건 수정(항목 5b) | 완료(`refactor/framework`, 머지 cf714a21), 의도한 동작 변경 |

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
- 커밋: 09d9b1c5 (브랜치 `refactor/framework-tx`, 레인 머지 a6a7653d)
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
- 커밋: 624e8f04 (레인 머지 cf714a21 에 포함)
- 구조 변경 없음. 트랜잭션·데이터소스·마이바티스·마스터코드·JPA 영역의 특성 테스트만 추가한다.

## S6. caravanhub 연동 클라이언트 통합
- 조사만, 사용자 보류 (dev `docs/idea.md` 「리팩토링 후속」 6d96e86b). 코드 변경 없음.

## S7. 커밋 실패 처리 핸들러 (항목 3b)
- 커밋: 40971db9(fix), 2bc8acb3(재현 시험), 84d324bb(docs, 다리 클래스 javadoc), c6121f64(fix, 후속). 머지: a6a7653d(`refactor/framework-tx`), 4d253151(`refactor/framework-txfix`).
- 바뀌기 전: transactional 모드의 `OasisAutoConfiguration` 은 oasis `SpringTransactionHandler` 를 `CactusServiceStarterFactory`(S4)에 그대로 넘겼다. 이 핸들러는 (1) `commitAll()` 중 Spring `TransactionException`(`UnexpectedRollbackException` 등)을 로그만 남기고 삼켜, 롤백된 커밋도 서비스는 SUCCESS 로 끝났다. (2) 커밋 시점 flush 의 `DataAccessException` 은 `commitAll()` 밖으로 새어 나가 `execute()` finally 의 `end()` 를 건너뛰어 스레드에 트랜잭션이 남았다. (3) `execute()` 가 `begin()` 과 시작 반복문을 `try` 밖에 둬서, 두 번째 TxMgr 시작이 실패하면 먼저 시작한 트랜잭션이 스레드에 남았다.
- 바뀐 뒤:
  - `cactus-core` 의 `CactusSpringTransactionHandler` 가 oasis `SpringTransactionHandler` 를 상속해 `execute`·`commitAll` 만 덮어쓰고, `OasisAutoConfiguration` 이 이것을 `CactusServiceStarterFactory` 에 주입한다(40971db9).
  - 시작 순서의 역순으로 커밋하다 첫 실패가 나면 아직 커밋하지 않은 나머지는 롤백한다. 실패는 모아 두기만 하고 던지지 않아 부모 `execute()` finally 의 `end()` 가 항상 돈다. 부모가 정상으로 돌아온 뒤 `TransactionException` 하나로 던진다(`CoreServiceStarter` 가 SYSTEM_ERROR 로 바꾸고 응답 코드 `S001`). 롤백이 실패하면 던지는 예외의 suppressed 로 모은다. alwaysCommit TxMgr 은 부모 `rollbackAll()` 규칙 그대로 언제나 커밋하고 커밋 실패는 로그만 남긴다(c6121f64).
  - 던지는 예외 메시지는 `S001` 일반 문구(`CLIENT_MESSAGE`)뿐이다. TxMgr 별칭·일부만 반영 여부·원인 메시지는 ERROR 로그에만 남고, MDC 의 `txId`·`requestId` 를 함께 적는다(c6121f64).
  - 시작 실패 때는 process 에 들어갔는지 표시해, 들어가기 전 실패면 이번 호출이 시작한 트랜잭션만 역순으로 롤백하고 호출 전 보관소가 비어 있었으면 `end()` 한다. 처리 단계 실패는 부모가 이미 `rollbackAll` 하므로 건드리지 않는다(이중 롤백 없음)(c6121f64).
  - oasis 내부 패키지 이름을 빌린 다리 클래스 2개를 `cactus-core` 의 `com.dongkuk.oasis.transaction` 에 둔다. oasis 의 보관소 클래스가 package-private 이라 다른 패키지 하위 클래스가 볼 수 없기 때문이다.
    - `CactusTransactionWarehouseView`: 읽기 전용. 현재 스레드 보관소의 트랜잭션 목록(사본)을 시작 순서대로 돌려준다. 보관소를 바꾸는 경로가 없다.
    - `CactusTransactionWarehouseCleaner`: `end()` 하나뿐인 쓰기 다리. 읽기 전용 쪽을 읽기 전용으로 두려고 나눴다.
    - 두 클래스가 기대는 oasis 내부 메서드와 "oasis 버전을 올릴 때 확인한다" 는 문구를 javadoc 에 남겼다(84d324bb).
- 바꾼 이유: 롤백된 커밋이 성공으로 응답되고 스레드에 트랜잭션이 남는 결함을, oasis 소스를 고치지 않고 cactus 층에서 막는다. 다리 방식 대신 버린 대안 둘은 아래와 같다(조정 세션 결정).
  - 리플렉션: package-private 형(`ThreadLocalTransactionWarehouseHolder`·`TransactionManagerWarehouse`·`TransactionManagerAndStatus`)을 세 번 거쳐야 하고, oasis 가 바뀌면 컴파일이 아니라 실행 중에 깨진다. 다리 방식은 이름이 바뀌면 컴파일에서 깨진다.
  - 핸들러 전체 재구현: `rollbackAll`·alwaysCommit·병렬 실행 경로까지 복사하게 되어 oasis 와 갈라진다. 하위 클래스는 필요한 두 메서드만 덮어쓰고 나머지(처리 중 예외 때의 `rollbackAll`, 중간 커밋·롤백 후 재시작, `ParallelExecutionScope` 판정)는 부모 그대로 쓴다.
- 의도한 동작 변경(fix 라 동작 보존이 아니다):
  - 롤백된 커밋이 SUCCESS 로 나가던 것이 `S001` 비성공 응답이 된다.
  - 여러 TxMgr 중 첫 커밋 실패가 나면 아직 커밋하지 않은 나머지는 롤백한다(alwaysCommit 제외). 이미 커밋된 것은 되돌릴 수 없어 ERROR 로그에 "일부만 반영" 으로 남는다.
  - 커밋 실패 때 화면 문구가 일반 문구가 되고, 상세(TxMgr 별칭·원인·일부 반영 여부)는 ERROR 로그에서 `txId`·`requestId` 로 찾는다.
  - 시작 실패 때 먼저 시작한 트랜잭션이 정리되어 같은 스레드의 다음 요청이 묵은 트랜잭션에 합류하지 않는다.
  - 정상 경로(커밋 성공, 처리 중 예외의 롤백)는 바뀌지 않는다.
- 동작 보존·재현 근거:
  - 재현 시험은 `mcm/lib/src/test/java/com/dongkuk/dmes/mcm/oasis/OasisCommitFailureSqliteTest`(2bc8acb3, c6121f64 가 시작 실패·보조 TxMgr 사례 추가)다. SQLite 실제 트랜잭션으로 oasis 핸들러의 삼킴·스레드 누수를 고정하고 cactus 조립의 올바른 기대와 나란히 둔다. cactus-core 시험 경로에는 JDBC 드라이버가 없어 mcm 에 뒀다. 1b 가 sqlite-jdbc 를 넣으면 a8 2차에서 cactus-core 로 옮긴다.
  - 단위 시험은 cactus-core `CactusSpringTransactionHandlerTest` 다. 통과 수는 머지 요청 때 적는다.
  - 화면에 `errors[]` 가 채워지는 곳이 `BusinessException.getErrors()` 뿐임은 `CactusResponseConverterBusinessErrorsTest` 가 고정한다(c6121f64).
- 영향 범위: `cactus-core` 의 `oasis` 패키지(핸들러 신규, `OasisAutoConfiguration`·`CactusServiceStarterFactory` 호출부)와 `com.dongkuk.oasis.transaction` 다리 클래스 2개. transactional 모드(mcm·mdm·mls)만 해당하며, 비트랜잭션 모드는 이 핸들러를 쓰지 않는다. 같은 패키지 접근은 같은 클래스 로더일 때만 되며 실행 jar·WAR 모두 그렇다. oasis 버전을 올릴 때 다리 클래스가 기대는 메서드(`getWarehouse()`·`transactionManagerAndStatusList()` 의 시작 순서·사본·`end()` 의 보관소 제거와 IDLE 복귀)를 확인한다. 이름 변경은 컴파일에서, 동작 변경은 `CactusSpringTransactionHandlerTest` 에서 드러난다. 커밋 실패 응답이 `S001` 로 바뀌므로 이를 SUCCESS 로 기대하던 호출부가 있는지 확인한다.
- 성능 항목이 아니다. `perf-framework.md` 에 P 항목을 두지 않는다.
- 되돌리는 방법: c6121f64, 40971db9 순서로 revert 하고(c6121f64 가 같은 핸들러·다리 클래스를 고친다) `OasisAutoConfiguration` 의 주입을 oasis `SpringTransactionHandler` 로 되돌린다. 재현 시험(2bc8acb3)은 그대로 둔다. 되돌리면 삼킴·누수 결함이 돌아온다.

## S8. AOP 기동 검사 (항목 4)
- 커밋: 18066114(feat). 머지: 64180224(`refactor/framework-aopcheck`).
- 바뀌기 전: BPMN `camunda:class` 가 가리키는 빈에 `@Transactional`·`@Cacheable`·`@PreAuthorize`·`@Async` 같은 프록시 의존 어노테이션이 붙어 있어도 기동 때 알 방법이 없었다. 비트랜잭션 모드에서는 `CactusUnwrappingApplicationContext` 가 프록시를 벗겨 오류 없이 무시되고, 트랜잭션 모드에서는 프록시를 그대로 불러 파라미터가 있는 메서드가 `ParameterName must not be null` 로 실패한다.
- 바뀐 뒤:
  - 새 패키지 `cactus/oasis/aop`: `OasisAopAnnotationChecker`(`SmartInitializingSingleton`), `BpmnServiceClassScanner`, `ProxyDependentAnnotationDetector`, `OasisAopCheckMode`.
  - 프로퍼티 `cactus.oasis.aop-check=warn|fail|off`, 기본 `warn`. 기본을 `fail` 로 두지 않는 까닭은 아직 정리되지 않은 모듈이 먼저 기동 실패하기 때문이다.
  - classpath 로더 모드는 모든 싱글톤이 만들어진 뒤 `classpath*:{service-path}/**/*.bpmn` 을 스캔해 검사한다. `fail` 이면 위반이 있을 때 기동을 멈춘다.
  - HTTP 로더 모드는 서비스 문서를 호출 시점에 받으므로 기동 시 BPMN 목록이 없다. "검사하지 않음" 경고를 기동 시 1회 남긴다.
  - `OasisAutoConfiguration` 에 `@ConditionalOnMissingBean` 빈 하나, `OasisProperties` 에 필드 하나, `CactusUnwrappingApplicationContext` 에는 javadoc 만 더했다.
- 확인된 사실: oasis `SpringServiceStarter.start`(29~33행)가 `ServiceContext` 의 `CactusUnwrappingApplicationContext` 를 `SpringApplicationContext` 로 덮어써, transactional 모드(mcm·mdm·mls)에서는 언랩이 무효다. S4 의 특성 시험이 이 동작을 고정했고, 3a(S4)는 이 동작을 그대로 유지한다. 언랩을 켜는 수정은 하지 않는다(조정 세션 결정). 검사기의 경고 문구가 모드별로 결과를 다르게 설명하는 까닭이 이것이다.
- 바꾼 이유: 조용히 무시되거나 호출 시점에야 실패하는 어노테이션을 기동 때 드러낸다.
- 동작 보존 근거: 요청 처리 경로를 바꾸지 않고 기동 시 로그(또는 `fail` 일 때 기동 중단)만 더한다. 기본 `warn` 은 기동을 막지 않는다. 시험은 `OasisAopAnnotationCheckerTest`, `ProxyDependentAnnotationDetectorTest` 와 BPMN 샘플 2개(`aopcheck-services/`)다.
- 영향 범위: `cactus-core` 의 `oasis` 패키지. 호스트 설정 변경은 필요 없다. 기존 호스트는 위반이 있으면 기동 때 경고가 새로 보인다. `aop-check=fail` 로 올리는 호스트는 위반을 먼저 정리해야 한다.
- 성능 항목이 아니다(기동 시 1회, 요청 경로 영향 없음).
- 되돌리는 방법: 18066114 를 revert 한다. 다른 커밋이 이 패키지를 참조하지 않는다.

## S9. errors[] 보강 (항목 8)
- 커밋: d3366172(feat). 머지: a6a7653d(`refactor/framework-tx`).
- 바뀌기 전: BPMN serviceTask 안에서 던진 예외는 `CoreServiceStarter` 가 SYSTEM_ERROR + message 로 바꿔 `CactusResponseConverter.convertError` 에는 `meta` 만 실리고 `errors[]` 는 비었다. `BusinessException` 이 담은 필드별 오류가 화면에 닿지 않았다.
- 바뀐 뒤: `CactusResponseConverter` 가 `ServiceResult.exception()`(원래 예외가 남아 있다)의 원인 사슬(깊이 16, 순환 방지)에서 `errors` 가 비지 않은 가장 바깥 `BusinessException` 의 `getErrors()` 를 응답 `errors[]` 로 더한다. `meta` 는 바뀌지 않는다. `errors` 가 없으면 JSON 이 예전과 같다(NON_NULL). 원인 사슬의 `DataAccessException` 메시지는 싣지 않는다(c6121f64 가 `CactusResponseConverterBusinessErrorsTest` 로 고정). oasis 는 고치지 않는다.
- 바꾼 이유: 화면이 필드별 오류를 받게 한다.
- 동작 보존 근거: `errors` 가 없는 응답은 그대로다. `CactusResponseConverterJsonTest` 가 JSON 모양을 고정하고, `CactusResponseConverterBusinessErrorsTest` 와 BPMN `charBusinessErrors.bpmn`(`OasisServiceStarterCharacterizationTest` 갱신)이 새 동작을 고정한다. 통과 수는 머지 요청 때 적는다.
- 영향 범위: `cactus-core` 의 `CactusResponseConverter` 하나. 응답에 `errors[]` 가 새로 실리는 경우가 생기므로 이를 읽는 프런트가 영향을 받는다.
  - `src/frontend/m-mdm/src/dme/oasis-call.ts` 의 `unwrap` 은 이미 `env.errors` 를 읽어 `base` 와 같지 않은 줄을 메시지에 덧붙인다. 서버가 `errors[]` 를 채우면 `meta.message` 와 다른 줄이 추가로 보이고, 같은 문장은 `m !== base` 로 걸러진다. 중복 줄은 서버 메시지가 `meta.message` 와 다르게 같은 내용을 담을 때 생길 수 있다.
  - 낡은 문서: `docs/mdm/tasks/TSK-04-04/design.md` F12 는 "`errors[]` 를 비운다" 고 적혀 있어 이 변경으로 틀려졌다. 이 커밋은 문서를 고치지 않았다. 문서 갱신은 따로 한다.
- 성능 항목이 아니다.
- 되돌리는 방법: d3366172 를 revert 한다. c6121f64 의 시험 28줄(`CactusResponseConverterBusinessErrorsTest`)이 이 동작을 전제하므로 같이 되돌린다.

## S10. 결함 4건 수정 (항목 5b)
브랜치 `refactor/framework-tests`(머지 cf714a21). 5b 특성 시험(624e8f04)이 "현재 동작(결함 후보)" 으로 고정해 둔 것을 `fix` 로 바로잡았고, 해당 특성 시험은 새 기대로 바꿨다. 결함 수정은 리팩토링 커밋과 섞지 않았다.

### S10-1. 마스터 코드 이름 컬럼 디코딩 (305f081e)
- 바뀌기 전: `MasterCodeMybatisInterceptor` 가 `_CD_NM`·`_STS_NM` 으로 끝나는 컬럼의 그룹 키를 `key.indexOf("_NM")`(첫 위치)에서 잘라, 이름 중간에 `_NM` 이 있으면(`ORDER_NMBR_CD_NM`) 의도한 `ORDER_NMBR_CD` 가 아니라 `ORDER` 를 코드 컬럼으로 봤다.
- 바뀐 뒤: 끝의 `_NM` 접미사만 떼어(`key.length() - NM_SUFFIX.length()`) 그룹 키로 쓴다(`ORDER_NMBR_CD_NM` → `ORDER_NMBR_CD`).
- 영향 조사: `src/backend` 의 xml·sql·java 에서 `_NM_` 을 이름 중간에 가진 식별자를 찾았다. 서비스 코드에는 `DEPT_NM_EN`·`ORIG_NM_MAX`·`TAB_NM_MAX`·`CUST_NM_OWN` 이 있으나 `_CD_NM`·`_STS_NM` 으로 끝나지 않아 인터셉터 대상이 아니다. 대상이면서 앞쪽에 `_NM` 이 있는 것은 시험의 `PROC_NM_STS_NM` 뿐이다. 즉 현재 소스에서 바뀌는 결과 컬럼을 찾지 못했다(문자열 검색 한계: 동적으로 만드는 별칭은 못 본다).
- 시험: 특성 시험 2건을 새 기대로 바꾸고 재현 시험을 더했다(`MasterCodeMybatisInterceptorTest`).

### S10-2. 기본 트랜잭션 매니저가 alias 일 때 @Primary (5f3fcf79)
- 바뀌기 전: `CactusMultiTransactionManagerAutoConfiguration` 에서 `cactus.tx.default-manager` 의 대상 이름이 alias 이면 존재 검사는 통과하는데 `registry.getBeanDefinition(alias)` 가 `NoSuchBeanDefinitionException` 을 던져 부팅이 실패했다.
- 바뀐 뒤: alias 를 실제 빈 이름으로 풀어(`canonicalName`, `SimpleAliasRegistry` 가 아니면 별칭 목록을 훑는다) 그 빈 정의에 `@Primary` 를 붙인다. 로그에 target 과 canonical 이름이 함께 나온다.
- 영향 조사: 전에는 부팅 실패였으므로 이 변경으로 새로 깨질 설정은 없고, 실패하던 설정이 기동한다. `default-manager` 를 지정한 yml 은 mcm api 하나(`txBiz`)이고 지금까지 부팅이 되던 설정이므로, alias 가 아닌 대상 이름은 `canonicalName` 이 그대로 돌려줘 결과가 같다. 호스트가 TxMgr 를 alias 로 노출하고 default 로 지정하던 경우만 기동 실패에서 기동 성공으로 바뀐다.
- 시험: 부팅 실패를 고정하던 특성 시험을 "기동 성공과 alias 사슬 유지" 로 바꾸고, `@Primary` 가 canonical 빈에 붙는지 보는 시험을 더했다.

### S10-3. 물리 이름의 Entity 접미사 (1f6f4f05)
- 바뀌기 전: `SnakePhysicalNamingStrategy` 가 `String.replace("Entity", "")` 로 이름 중간의 `Entity` 까지 지웠다(`parentEntityId` → `parent_id`).
- 바뀐 뒤: 점을 밑줄로 바꾼 뒤 끝의 `Entity` 만 한 번 지운다(`parentEntityId` → `parent_entity_id`, `EntityTypeEntity` → `entity_type`).
- 영향 조사: 커밋 메시지대로 영향받는 기존 매핑은 없음을 확인했다. 엔티티 110개를 조사해 이름 중간에 `Entity` 가 든 물리 이름(테이블·컬럼)이 있는 매핑이 없었다(조정 세션 확인). 대문자 명시 이름(`TB_SEC_USER` 등)은 소문자로 바뀔 뿐 원래 접미사 제거 대상이 아니다.
- 시험: `NamingStrategyTest` 의 현재 동작 고정 2건을 새 기대로 바꾸고 중간 `Entity` 보존 시험을 더했다.

### S10-4. MyBatis 자동설정 순서 (a192aaee)
- 바뀌기 전: `CactusMybatisAutoConfiguration` 은 `@ConditionalOnBean(SqlSessionFactory.class)` 를 쓰면서 순서를 선언하지 않았다. 생산 자동설정(`CactusMultiMybatisAutoConfiguration`, mybatis-spring-boot `MybatisAutoConfiguration`)보다 뒤에 처리되는 것은 이름순 정렬(`com.*` < `org.*`)의 우연이었다.
- 바뀐 뒤: `@AutoConfiguration(after = CactusMultiMybatisAutoConfiguration.class, afterName = "org.mybatis.spring.boot.autoconfigure.MybatisAutoConfiguration")` 로 순서를 명시한다.
- 영향 조사: 지금 정렬 결과와 같은 순서를 선언한 것이라 기존 호스트의 처리 순서는 바뀌지 않는다. 순서에 기대던 조건이 이름 변경·패키지 이동에 깨지지 않게 된다. 호스트 설정 변경은 필요 없다.
- 시험: `CactusMybatisAutoConfigurationTest` 에 입력 순서를 뒤집어도 생산 자동설정보다 뒤에 정렬되는지 보는 시험을 더했고 `CactusMultiMybatisAutoConfigurationTest` 의 주석을 고쳤다.

- 영향 범위(공통): 모두 `cactus-core` 한 모듈 안이다(`mastercode`·`tx`·`jpa`·`mybatis` 패키지). S10-2 와 S10-4 는 호스트 설정 변경이 필요 없다.
- 성능 항목이 아니다.
- 되돌리는 방법: 네 커밋은 서로 독립이라 각각 revert 할 수 있다. 되돌리면 해당 결함 특성 시험이 새 기대로 바뀐 상태라 같이 되돌려야 통과한다.

## 머지 단위
1차 머지(`refactor/framework` → dev)에는 S1~S10 이 모두 들어간다.
- S1(로그 레벨), S2(analog 풀·패턴), S3(캐시 교체), S4(ServiceStarter 직접 조립), S5(특성 시험), S7(커밋 실패 처리), S8(AOP 기동 검사), S9(errors[]), S10(결함 4건).
- S6(caravanhub 연동 클라이언트 통합)은 조사만이라 코드 변경이 없다. 번호만 기록하고 머지 대상 코드는 없다.
- 구조 변경(S2·S3·S4·S8)과 의도한 동작 변경(S7·S9·S10)은 위 절에서 구분했다. 동작 변경 항목은 머지 요청 때 통과 수와 함께 알린다.
- 다음 레인 작업으로 넘기는 일: S7 재현 시험의 cactus-core 이관(a8 2차), TSK-04-04 design.md F12 문구 갱신.
