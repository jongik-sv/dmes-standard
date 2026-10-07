# mcm 기본 DataSource 연결 지연 획득(LazyConnectionDataSourceProxy) 설계 메모

- 작성: 2026-10-07, oracle-1007 ③c 후속(브랜치 `feat/ora-mcm-lazy-ds`, dev 1e93e6197 기준)
- 상태: 2026-10-07 사용자 결정 — 「로컬만 켜고 머지」(③f). WildFly(dev·prod)는 끔, 켜는 일은 후속(§4·§8)
- 관련: ③c 연결 풀 고갈 교착(`SecWidgetService.search`), ③d 기본 풀 설정 읽기·local 누수 감지 30초

## 1. 문제

위젯 채팅(`WidgetChatService.send·reset`)은 OASIS 바깥 트랜잭션(txBiz)을 `NOT_SUPPORTED` 로 내려놓고 LLM 을 기다린다. 그 목적은 기다리는 동안 DB 트랜잭션·잠금·연결을 잡지 않는 것이었다. 실제로는 연결을 2개 쥔다(현재 dev 실측 2개, §5).

1. **바깥 txBiz 연결.** OASIS(`SpringTransactionHandler.startTransaction`)는 REQUIRED·**READ_COMMITTED** 로 트랜잭션을 연다.
   - spring-orm 7.0.7 `HibernateJpaDialect.beginTransaction` 은 격리 수준을 지정받으면 곧바로 `getPhysicalConnection()` 을 불러 풀에서 연결을 받는다. 연결에 격리 수준을 걸기 위해서다(바이트코드 line 133~136).
   - 격리 수준이 없어도 Hibernate 7.2 `LogicalConnectionManagedImpl.begin` 이 `setAutoCommit(false)` 를 하려고 연결을 받는다.
   - 내려놓아도(suspend) 이 연결은 풀로 돌아가지 않는다.
2. **NOT_SUPPORTED 범위의 EntityManager 연결.** 범위 안에서도 트랜잭션 동기화가 켜져 있다(`SYNCHRONIZATION_ALWAYS`).
   - 그래서 트랜잭션 없이 도는 파생 쿼리(대화 문맥 `findTop20…`, 도구 find_screen 의 내 메뉴 조회)가 범위에 묶인 EntityManager 를 연다(`EntityManagerFactoryUtils.doGetTransactionalEntityManager`).
   - 그 EntityManager 는 `DELAYED_ACQUISITION_AND_HOLD`(HibernateJpaVendorAdapter 기본값) 때문에 연결을 범위가 끝날 때까지, 곧 LLM 대기 내내 쥔다.

동시 채팅이 풀 크기(로컬 3)에 닿으면 다른 요청이 connectionTimeout 까지 멈춘다. LLM 대기가 30초를 넘으면 local 누수 감지(③d, 30초)도 경고를 낸다.

## 2. 핵심 쟁점 — Lazy 프록시가 첫 연결을 어떻게 미루는가

spring-jdbc 7.0.7 `LazyConnectionDataSourceProxy` 를 바이트코드로 확인했다.

- `getConnection()` 은 실제 연결 대신 JDK 프록시(`ConnectionProxy`)를 돌려준다. 다음 메서드는 실제 연결 없이 처리한다.
  - `setAutoCommit`·`setTransactionIsolation`·`setReadOnly`·`setHoldability`·`setCatalog`·`setSchema` 는 기록만 하고, 실제 연결을 받을 때 적용한다.
  - `getAutoCommit`·`getTransactionIsolation`·`isReadOnly`·`getHoldability`·`getCatalog`·`getSchema` 는 기록값이나 기본값을 돌려준다.
  - `commit`·`rollback` 은 실제 연결이 없으면 무시하고, `close` 는 실제 연결이 있을 때만 그 연결을 돌려준다. `getWarnings`·`clearWarnings`·`isClosed`·`equals`·`hashCode`·`toString` 도 연결 없이 처리한다.
  - 그 밖의 메서드(`prepareStatement`·`createStatement`·`getMetaData`·`abort`·`unwrap` 대상 등)는 그때 실제 연결을 받는다.
- **OASIS READ_COMMITTED 경로**는 다음 순서로 실제 연결 없이 지나간다.
  1. `HibernateJpaDialect.beginTransaction` 이 `getPhysicalConnection()` 으로 받는 것은 프록시다.
  2. `DataSourceUtils.prepareConnectionForTransaction` 의 `getTransactionIsolation()` 은 기본값(READ_COMMITTED)을 돌려준다. 이미 같은 값이라 `setTransactionIsolation` 은 부르지 않는다. 값이 다르면 기록만 한다.
  3. Hibernate `begin` 의 `getAutoCommit()`·`setAutoCommit(false)` 도 기록만 한다.
  4. 첫 SQL(`prepareStatement`)에서 실제 연결을 받고, 기록한 autoCommit 끔·격리 수준을 적용한다.
- **Hibernate 의 메타데이터 접근.** `getMetaData()` 는 실제 연결을 연다. 그러나 Hibernate 는 EMF 를 만들 때(JdbcEnvironment) 한 번 읽을 뿐이고, 세션·트랜잭션마다 읽지 않는다.
  - 실측: 트랜잭션 시작 직후 Hikari active 0, 첫 SQL 뒤 1, 끝난 뒤 0(`JpaConfigLazyConnectionTest`).
- **기본값(autoCommit·격리 수준) 알려 주기.**
  - `setDefaultAutoCommit`·`setDefaultTransactionIsolation` 으로 고정하지 않는다.
  - 대신 처음 `getConnection()` 을 부를 때 `checkDefaultConnectionProperties()` 가 대상 풀의 실제 연결 하나로 한 번 감지한다. 감지한 연결은 바로 돌려준다.
  - 이 첫 호출은 기동 때 EMF 를 만들면서 일어난다. 그래서 요청 처리 중에 감지 때문에 연결을 기다리는 일은 없다.
  - WildFly 데이터소스에 `transaction-isolation` 이 걸려 있어도 그 값을 그대로 기본값으로 읽는다(DB·컨테이너 설정에 맞춰진다).
  - **감지 실패.** `checkDefaultConnectionProperties()` 는 연결을 받거나 값을 읽다 나는 `SQLException` 을 debug 로그만 남기고 삼킨다(바이트코드 확인).
    - 그래서 기동 때 DB 장애로 감지에 실패하면 기본값이 null 로 남고, 그 뒤 `getConnection` 마다 감지를 다시 한다.
    - 그동안 요청 하나가 연결을 두 번 기다린다(감지 1번, 실제 사용 1번). DB 가 계속 안 되면 connectionTimeout 이 두 배로 걸린다.
    - 기본값이 null 이면 프록시가 `getAutoCommit`·`getTransactionIsolation` 에 답하지 못해 바로 실제 연결을 받는다. 곧 지연 획득이 사실상 꺼진다.
    - DB 가 돌아와 감지에 한 번 성공하면 스스로 풀린다(재기동 필요 없음).

## 3. 영향 범위

| 대상 | 어느 DataSource 를 쓰나 | Lazy 를 켰을 때 |
|---|---|---|
| OASIS txBiz(JpaTransactionManager, READ_COMMITTED) | EMF 의 DataSource = 기본 `dataSource` 빈 | 첫 SQL 때 연결을 받는다. SQL 이 있는 서비스는 전과 같다. SQL 없이 끝나면 연결을 받지 않는다. 트랜잭션 의미는 같다. `JpaConfigLazyConnectionTest` 로 다음을 확인했다: autoCommit 끔, 롤백·커밋, 기본(READ_COMMITTED)과 다른 SERIALIZABLE 이 실제 연결에 들어가 동작하는 것(트랜잭션 시작 뒤 다른 연결이 커밋한 행이 보이지 않음), 끝난 뒤 풀의 연결이 READ_COMMITTED 로 되돌아가는 것. |
| JPA 기본 EMF(`JpaConfig.entityManagerFactory`) | `@Qualifier("dataSource")` | 위와 같다. JpaTransactionManager 는 EMF 에서 DataSource(=Lazy)를 찾아 ConnectionHolder 를 그 키로 묶는다. |
| MyBatis biz(`cactus CactusMultiMybatisAutoConfiguration.sqlSessionFactoryBiz`) | `@Qualifier("dataSource")` = Lazy | `DataSourceUtils` 로 같은 키의 ConnectionHolder 를 찾아 JPA 트랜잭션 연결에 합류한다(JdbcTemplate 로 같은 경로를 시험에서 확인). |
| MyBatis if·cmn, cactus extras(cmn·if·caravan) | 각자 풀(local 직결 Hikari·WildFly JNDI) — 기본 DS 와 공유하지 않는다 | 영향 없음(감싸지 않는다). |
| 위젯 쿼리 실행기(`WidgetQueryConfig`) | 전용 풀이 있으면 그것(local), 없으면 기본 DS(dev JNDI·공유 모드) | 전용 풀은 감싸지 않는다. 공유 모드는 Lazy 연결로 실행한다. 아래 evict 보강이 필요하다. |
| `WidgetReadOnlyJdbc.evict` | — | Hikari `evictConnection` 은 클래스 이름이 `com.zaxxer.hikari.` 로 시작하는 연결만 뺀다(Hikari 7.0.2 바이트코드). Lazy 프록시 연결은 조용히 무시된다. → `ConnectionProxy.getTargetConnection()` 으로 꺼내 빼도록 고쳤다(시험 추가). |
| 감사 inspector(`McmAuditStatementInspector`) | SQL 문자열만 다룬다 | 영향 없음. |
| Flyway(`McmFlywayConfig`) | 스키마 주인 계정으로 url 직결(기본 DS 를 쓰지 않는다) | 영향 없음. |
| 누수 감지(③d, local 30초) | Hikari 가 빌림~반납 시간을 잰다 | 빌림이 첫 SQL 로 늦춰진다. 채팅은 LLM 대기 중 빌린 연결이 없어 30초 경고가 사라진다. SQL 을 하는 트랜잭션은 전과 같다. |
| 종료 처리 | — | `LazyConnectionDataSourceProxy` 에는 `close` 가 없다. 스프링이 종료 때 Hikari 를 닫지 않게 된다. → 감싸개 `LazyPrimaryDataSource` 가 직접 만든 풀만 닫는다(JNDI 는 닫지 않음). |

## 4. WildFly JNDI 경로

- `JndiDataSourceLookup` 결과를 그대로 감싼다(`new LazyPrimaryDataSource(jndi, null)`). 컨테이너 풀을 닫지 않는다.
- 컨테이너 풀은 `getConnection` 시점만 늦춰질 뿐이다. 반납은 Lazy 프록시 `close` → 컨테이너 연결 `close` 로 전과 같다.
- 확인할 것(운영 적용 전 dev WildFly 에서):
  1. 데이터소스가 `jta=true` 이고 Spring 이 resource-local(JpaTransactionManager)로 쓰는 지금 구성이 그대로인지. Lazy 는 JTA 와 무관하지만, CCM(cached-connection-manager) debug 가 「요청 안에서 닫지 않은 연결」을 보고하는지 기동·요청 로그를 본다.
  2. 컨테이너 데이터소스의 `transaction-isolation`·`new-connection-sql` 이 감지한 기본값과 맞는지. 첫 `getConnection` 시점의 감지 로그가 debug 에만 남으므로 필요하면 잠시 debug 로 본다.
  3. dev 는 위젯 쿼리 실행기가 공유 모드다. evict 보강이 컨테이너 연결(Hikari 아님)에서는 빼지 않고 `abort` 만 하는 기존 동작과 같은지.
  4. `pool-prefill`·`min-pool-size` 로 미리 연 연결 수, 그리고 요청당 사용 시간 지표가 바뀌었는지(빌림이 첫 SQL 로 늦춰진다).
  5. 기동 때 DB 가 늦게 뜨는 경우: 기본값 감지가 실패하면 지연 획득이 꺼진 채 요청마다 연결을 두 번 기다린다(§2 감지 실패). 기동 순서상 DB 가 먼저 떠 있는지, EMF 생성 때 감지가 성공했는지 본다. 잠시 debug 로 `LazyConnectionDataSourceProxy` 로그를 켜면 실패가 보인다.
  6. 잠금 캐시: 첫 SQL 이 잠금 안에서 나는 경로(§7)를 운영 부하에서 본다.

## 5. 대안 비교(실측)

- 측정: mcm-core `WidgetChatPoolHoldRawJpaTest`(지연 획득 끔)·`WidgetChatPoolHoldLazyJpaTest`(켬).
  - 시험 구성: clone PDB, 풀 3·쉬는 연결 0·connectionTimeout 4초, OASIS 흉내 바깥 트랜잭션 REQUIRED·READ_COMMITTED.
  - 네 경우 모두 같은 시험 코드(같은 풀·같은 동시 N=3)로 잰다.
  - 「현재 dev」·「(나)만」은 **일회 측정**이다. `WidgetChatService` 를 dev 1e93e6197 판으로 잠시 바꿔 돌렸고, 끝난 뒤 되돌렸다. 커밋된 시험만으로는 재현되지 않는다.
    - 측정 시각: 2026-10-07 23:08, 시험 코드 1d9c49532 판 기반.
  - 「(가)만」·「(가)+(나)」는 이 브랜치 판(1cac488f1, dev 병합 19d056ddd 뒤)으로 돌렸다(23:07). 커밋된 `WidgetChatPoolHoldRawJpaTest`·`WidgetChatPoolHoldLazyJpaTest` 가 그대로 재현한다.
  - 2026-10-07 23:07~23:08 에 mcm-core 모듈만 따로 실행했다(ORA 오류 없음).
  - 23:02 경 병합 전 판으로 한 번 더 잰 값도 같은 모양이다. 표의 괄호 안이 그 값이다.
- 「LLM 대기 중 연결」: 가짜 LLM 이 불릴 때 Hikari activeConnections 를 잰다. 첫 호출은 문맥 읽기 뒤, 둘째 호출은 도구 실행 뒤다.
- 「동시 3」 시험 절차:
  1. 채팅 3개를 동시에 보내고, LLM 대기에 모두 들어가기를 8초(connectionTimeout 의 두 배)까지 기다린다.
  2. 다른 요청 하나(바깥 트랜잭션 안 채팅 기록 조회)를 보낸다.
  3. LLM 을 풀어 주고 채팅 결과를 모은다.
- 다른 요청 결과를 읽을 때 주의할 점: 채팅이 LLM 대기에 들어가지 못하고 실패하면, 그 채팅의 연결이 이미 풀에 돌아간 뒤에 다른 요청이 들어간다. 그래서 「다른 요청 성공」이 곧 「채팅과 다른 요청이 함께 도는 데 성공」을 뜻하지는 않는다.

| 경우 | LLM 대기 중 쥔 연결(1차, 2차) | 동시 3: 대기 진입 | 동시 3: 대기 중 쥔 연결 | 동시 3: 다른 요청 | 동시 3: 채팅 실패 | 동시 3 소요 |
|---|---|---|---|---|---|---|
| 현재 dev | **2, 2** | 못 들어감 | 3 | 성공 23ms(47ms)(채팅이 먼저 실패해 연결이 빈 뒤) | 2/3 (연결 시간 초과·문맥 읽기 실패) | 8.04초 |
| (가)만 | **1, 1** | 못 들어감 | 2 | 성공 3ms(4ms)(같은 이유) | 1/3 (연결 시간 초과) | 8.03초 |
| (나)만 | **1, 1** | 들어감 | 3 | **실패**(4.02초(4.01초) 뒤 연결 시간 초과) | 2/3 (연결 시간 초과) | 8.83초 |
| **(가)+(나)** | **0, 0** | 들어감 | **0** | **성공 12ms(4ms)** | **0/3** | 1.01초 |

- 원인 풀이:
  - 현재 dev: 채팅마다 바깥 연결과 범위 EntityManager 연결을 쥐어 2개를 쓴다.
  - (가)만: 바깥 연결 1개가 남는다. 채팅 3개가 풀 3을 다 가져가 Writer(`REQUIRES_NEW`)가 연결을 받지 못한다.
  - (나)만: 바깥 연결은 없어지지만 범위 EntityManager 가 LLM 대기 내내 1개를 쥐어, 3개가 풀을 다 가져간다.
  - 둘을 함께 써야 LLM 대기 중 연결이 0 이 된다.

| 안 | 바꾸는 main 파일 | 위험 |
|---|---|---|
| (가) 채팅 안 읽기를 짧은 REQUIRED(읽기 전용, 늘 롤백)로 묶기 | 1(`WidgetChatService`) | 낮음. 채팅에만 영향이 있다. 도구 실행이 「트랜잭션 없음」에서 「짧은 읽기 전용 트랜잭션」으로 바뀐다(기존 시험 단언 수정). |
| (나) Lazy 프록시 앱 전역 | 2(`JpaConfig`·`LazyPrimaryDataSource`) + yml 2 + evict 보강 1(`WidgetReadOnlyJdbc`) | 중간. 앱 전역에서 연결을 받는 시점이 바뀐다(§3·§4). |
| (가)+(나) | 위 둘의 합 | (나)와 같다. 스위치를 끄면 (가)만 남는다. |

권고는 **(가)+(나)** 다.
- (가)는 스위치와 무관하게 늘 켠다. 혼자서도 LLM 대기 중 연결을 2개에서 1개로 줄이고 위험이 낮다.
- (나)는 `dmes.datasource.lazy-connection` 스위치로 둔다.
  - local 은 기본으로 켠다.
  - application.yml(운영·dev 공통)은 기본으로 끈다. 운영 적용은 dev WildFly 에서 §4 를 확인한 뒤 사용자 결정으로 켠다.
- 스위치를 끈 동안((가)만 상태)은 동시 채팅 수가 풀 크기에 닿으면 채팅이 실패한다. 운영 풀은 크므로 바로 문제가 되지는 않지만, 남는 한계다.
- 권장안이 아닌 쪽((가)만·(나)만)은 따로 커밋할 코드가 없다. 두 경우 모두 스위치와 시험 구성으로 재현한다.
  - (가)만 = 스위치 끔.
  - (나)만 = dev 판 `WidgetChatService` 에 스위치 켬. 이 경우는 측정 때 잠시 바꿨다가 되돌렸다.

## 6. 시제품 구현

- `mcm/api config/LazyPrimaryDataSource`: `LazyConnectionDataSourceProxy` 를 상속하고 `AutoCloseable` 을 구현한다. 직접 만든 풀만 닫는다.
- `mcm/api config/JpaConfig.dataSource`: 스위치가 켜져 있으면 Hikari·JNDI 모두 감싼다(JNDI 는 닫지 않음).
- yml 스위치:
  - `application.yml`: `dmes.datasource.lazy-connection: ${DMES_DATASOURCE_LAZY_CONNECTION:false}`
  - `application-local.yml`: 같은 키에 기본값 `true`
- `mcm-core WidgetChatService`: 대화 문맥(`context`)과 도구 실행(`toolBox.run`)을 짧은 읽기 전용 트랜잭션(`readTx`)으로 묶는다.
  - 늘 롤백한다. 안쪽 실패가 rollback-only 를 걸어도 `UnexpectedRollbackException` 이 나지 않는다.
  - 읽기 전용 정의라, 지연 획득을 끈 구성에서는 `HibernateJpaDialect` 가 시작하자마자 연결을 잡는다.
  - 트랜잭션 시작·롤백 실패는 도구 실행이면 도구 오류 결과로 바꿔 대화를 이어 간다(`runTool`). 대화 문맥 읽기면 「답을 받지 못했습니다」로 끝난다.
- 기동 로그: `JpaConfig` 가 지연 획득 여부와 풀 값을 INFO 한 줄로 남긴다(주소·계정·비밀번호는 남기지 않음).
  - 직결: `[mcmDataSource] 기본 풀 mcm-host-primary 최대=3 쉬는연결=0 유휴=30000ms 누수감지=30000ms 연결 지연 획득=true`
  - JNDI: `[mcmDataSource] 기본 DataSource JNDI java:/jdbc/mcm/dsBiz 연결 지연 획득=false`
- `mcm-core WidgetReadOnlyJdbc.evict`: `ConnectionProxy` 면 실제 연결을 꺼내 Hikari 에서 뺀다.

## 7. 위험과 롤백

- **롤백**: `dmes.datasource.lazy-connection=false`(또는 env `DMES_DATASOURCE_LAZY_CONNECTION=false`)로 두고 재기동하면 전과 같다. (가)는 스위치와 무관하게 남지만 단독으로도 안전하다(현재 dev 대비 연결 1개 감소).
- **남는 위험**:
  - 트랜잭션 시작 때 연결을 받아야 하는 코드: 예컨대 트랜잭션 시작 직후 `DataSourceUtils.getConnection` 의 실제 연결에 세션 상태를 거는 코드다. 지금 mcm·mcm-core·cactus 에서 찾지 못했다. 그런 코드도 첫 메서드 호출에서 실제 연결을 받으므로 동작은 같고, 받는 시점만 늦다.
  - 연결 획득 실패가 트랜잭션 시작이 아니라 첫 SQL 에서 난다. 오류의 스택·메시지 위치가 바뀐다(예: `CannotCreateTransactionException` 대신 SQL 실행 시점의 `JDBCConnectionException`). 오류 코드를 매핑하는 곳이 시작 단계 예외에 기대고 있는지 운영 로그로 확인한다.
  - 처음 `getConnection` 때의 기본값 감지 연결 1회.
  - SQL 이 하나도 없는 트랜잭션의 `commit`·`rollback` 은 DB 에 가지 않는다(의도한 동작이다).
  - **잠금·동기화 구간 안의 첫 SQL.** 트랜잭션은 잠금 밖에서 시작했어도, 물리 연결은 첫 SQL 때 받는다. 그래서 첫 SQL 이 잠금(`synchronized`·`ReentrantLock`·`computeIfAbsent`) 안에 있으면, 연결을 기다리는 시간이 잠금 안으로 들어온다. 풀이 바닥났을 때는 잠금을 쥔 채 connectionTimeout 까지 기다리고, 다른 스레드는 그 잠금을 기다린다.
    - `MenuCatalog.snapshot` 은 `tryLock` 에 대기 상한이 있어, 상한을 넘으면 직접 읽는다. 그래서 결함은 아니다.
    - 운영에서 켜기 전에 같은 모양의 잠금 캐시를 점검한다: `UserPermCache`, `WidgetDefaultTabs`, `ExchangeService`, `ScreenUsage*`, `NoticeMgmtService`, cactus `MdmValidator` 등. 무제한 대기 잠금 안에서 처음 SQL 을 내는지가 점검 대상이다.
  - **기본값 감지 실패**(§2): 기동 때 DB 장애면 지연 획득이 꺼진 채 요청마다 연결을 두 번 기다린다. DB 가 돌아오면 스스로 풀린다.
  - Hikari 지표(active·usage)의 의미가 「트랜잭션 수」에서 「SQL 이 있는 트랜잭션 수」로 바뀐다.

## 8. 사용자 결정(2026-10-07)

- (가)+(나)를 「로컬만 켜고 머지」 한다(머지 ③f).
  - (가)는 늘 켠다. 도구 실행이 짧은 읽기 전용 트랜잭션 안에서 도는 동작 변경을 받아들였다.
  - (나)는 기본 false, application-local.yml 만 true 다. wildfly·prod 는 끈다.
- 개발계 WildFly 에서 켜는 일은 후속이다. §4 확인 목록(JTA 데이터소스·CCM·격리 수준·기본값 감지·잠금 캐시)을 본 뒤 사용자가 정한다.
