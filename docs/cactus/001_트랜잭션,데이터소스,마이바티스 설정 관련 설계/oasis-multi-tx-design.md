# Oasis Multi-Transaction-Manager 설계

> cactus-core 가 한 BPMN service 안에서 task 별로 서로 다른 Spring TransactionManager
> 를 사용할 수 있도록 확장하는 설계. oasis-core 5.1.0 의 native 메커니즘을 활용하고,
> 모듈 yml 만 추가하면 N개 DataSource + N개 TxMgr 를 자동 구성.

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-14 |
| 대상 버전 | cactus-core 1.0.21-SNAPSHOT (예정) |
| 영향 모듈 | **mcm** (즉시 마이그레이션 — yml 키 + 빈 이름 갱신 + **txIF 도입** = SERAI 인터페이스 DB 호출). **mpn/mpp/mqc** (현재 multi-tx 미사용 — SERAI 연결 시 txIF 도입). **serai** (cactus 미사용 — 자체 듀얼 DS 유지. mcm/mpp/mqc 가 SERAI 의 SERAIUSER DB 에 직접 호출하기 위해 cactus 의 txIF 가 가교 역할). **portal** (OASIS 미사용 — 영향 없음) |
| 참고 원본 | `dmes-fwk/workspace-fwk/dmes-film` 의 OasisConfig + BizDataAccessConfig |
| 관련 문서 | [usage-guide.md](./usage-guide.md), [cactus-core-data-access-migration-plan.md](./cactus-core-data-access-migration-plan.md) |
| 검증 출처 | oasis-core-5.1.0.jar / oasis-core-api-5.1.0.jar 디스어셈블 (javap), film 소스, 공식 oasis-core 테스트 BPMN. Phase 0 검증 완료 (2026-05-14) |

---

## 0. 요약 (TL;DR)

oasis-core 5.1.0 가 이미 BPMN 의 process / task 레벨에서 multi-TxMgr 를 native 지원한다
(`tx` / `commitTx` / `ds` property + `SpringServiceStarterFactory(ctx, String[])` +
`TransactionManagerWarehouse`). 단 cactus-core / oasis-core 양쪽에 4가지 결손/한계 존재:

1. `OasisAutoConfiguration` 이 `String[]` 에 1개만 넘김 → 화이트리스트가 닫혀있음 (cactus 결손)
2. 모듈이 N개 DataSource / N개 EMF / N개 JpaTxMgr 를 깨끗하게 선언할 yml 채널이 없음 (cactus 결손)
3. oasis-core 의 Tier 2 미명시 시 화이트리스트 *모든* TxMgr begin → 사용 안 하는 connection 도 잡음 (oasis 한계, R-multi-11)
4. oasis-core 의 `CachingServiceProvider.service()` 가 `cache.cache()` 호출 누락 → 캐시 사실상 미동작 (oasis 결손, R-multi-22)

본 설계는 4가지 모두 cactus 측에서 우회/해소해 film 도 완성하지 못한 패턴을 cactus-core 에서 끝까지 구현한다.

**3-tier 아키텍처**:
```
Tier 1 (Application)  cactus-core 가 모듈 yml 의 cactus.tx.managers 를
                       SpringServiceStarterFactory 의 String[] 화이트리스트로 등록
                              ↓
Tier 2 (BPMN Process) <bpmn:process> 의 <camunda:property name="tx" value="txBiz,txCmn"/>
                       이 process 가 시작 시 begin 할 TxMgr 들 (콤마 구분).
                       미명시 시 cactus 가 default 1개를 자동 inject (DefaultTxInjectingServiceProvider).
                              ↓
Tier 3 (BPMN Task)    <bpmn:scriptTask> 의 ds/tx property — Script 계열만 인식
                       이 task 가 사용할 connection. 미명시 시 DefaultDataSourceResolver.
                       JavaServiceTask 는 task 레벨 ds/tx 무시 → 호출하는
                       @Service 메서드의 @Transactional("txXxx") 로 결정.
```

> **Tier 2 미명시 시 default 1개만 begin (Phase 0 옵션 b 검증 결과 — 1.0.21 핵심 차별성)**: oasis-core 5.1.0 의 native 동작은 "Tier 2 미명시 → 화이트리스트 *모든* TxMgr begin" 이지만 (DB 커넥션 풀 압박), cactus 1.0.21 의 `DefaultTxInjectingServiceProvider` 가 BPMN load 단계에서 PropertyContainer 에 `tx=<default>` 자동 inject → oasis-core 가 분기 ④ (모두 begin) 가 아닌 분기 ③ (명시된 1개만 begin) 으로 진입. **film 도 못 한 패턴** — film 은 ctor 화이트리스트에 1개만 등록해 default 효과를 얻었지만 multi-tx 명시 자체를 막아버림. cactus 1.0.21 = "default 1개" 안전성 + multi-tx 명시 가능성 동시 달성.

> **Tier 3 (Phase 0 검증)**: ds/tx property 는 `SqlScriptTask` / `ProcedureScriptTask` 등 Script 계열에서만 인식됨. `JavaServiceTask` (Plain/NamedObject/Wow 모든 variant) 는 **acceptablePropertyNames 에 ds/tx 가 없어 완전히 무시**. JavaServiceTask 의 multi-tx 분기는 호출 대상 `@Service` 메서드의 `@Transactional` annotation 으로만 가능 (§6 매트릭스 참조).

---

## 1. 결정 사항 (확정 — 2026-05-14)

| # | 결정 | 채택 | 근거 |
|---|---|---|---|
| 1 | TxMgr 빈 이름 컨벤션 | **`txBiz`/`txCmn`/`txIF`** (dmes 표준 — biz=자체/cmn=공통/if=인터페이스) | film 호환 + BPMN 안에서 짧은 이름 가독성 + 의미 명확 |
| 2 | Default TxMgr 결정 | **`cactus.tx.default` yml 명시** | 추론(Map 순서 / primary DS 자동) 보다 안전, fail-fast |
| 3 | 2PC 지원 | **1PC 만, 2PC 는 별도 RFC** | dmes 비즈니스 패턴이 단일 DB / 멱등 호출 위주. XA 도입 ROI 낮음 |
| 4 | `@Transactional` 정책 | **Docs 가이드만** | 4-case 매트릭스 명문화, code review 책임. 정적 검증 도구는 추후 |
| 5 | 기존 `secondary.*` 처리 | **즉시 완전 제거 (alias 없음)** | 운영 중 아님 (개발 환경). 깨끗한 폐기 |
| 6 | `cactus.tx.managers` 강제 | **명시 강제, 단일 모드 키 (`transaction-manager-name`) 제거** | 모두 신규 환경, yml SoT 일관성 |
| 7 | Spring Boot `transactionManager` 자동 포함 | **자동 포함 X (명시만)** | yml 이 유일한 진실, 숨은 빈 회피 |

**일관된 메시지**: "yml 이 단일 진실 (SoT), 명시 강제, 자동 fallback 없음, deprecated 잔재 없음."

### 결정 조합의 동기 변경 영향
- `cactus-core 1.0.21-SNAPSHOT` 빌드와 `mcm/api/application*.yml` 의 키 변경은 **동일 커밋에 반드시 포함**.
- includeBuild 환경이라 cactus 만 올리고 mcm yml 안 바꾸면 부팅 실패 (fail-fast).
- 빈 이름 변경: `cactusSecondaryDataSource` → `cactusDataSource{Name}` 등 → mcm 코드가 빈 이름을 직접 참조하는지 사전 점검 (특히 `KmcSecondaryJpaConfig.java`).

---

## 2. oasis-core 5.1.0 native 메커니즘 (검증 결과)

### 2-1. 트랜잭션 라이프사이클 핵심 클래스

#### oasis-core 5.1.0 클래스

| 클래스 | 역할 |
|---|---|
| `SpringServiceStarterFactory(ApplicationContext, String[])` | 두 번째 인자 = **Tier 1 화이트리스트**. 이 배열에 등록된 TxMgr 빈 이름만 인식 |
| `SpringTransactionHandler` | `startTransaction(name)`, `commitAndRestartTransaction(name)`, `commitAll()`, `rollbackAll(String[])`, `execute(Process, String[] required, String[] alwaysCommit)` |
| `TransactionManagerWarehouse<T,Q>` | 이름 ↔ TxMgr/Status 매핑 보관소. ThreadLocal 기반 |
| `CoreServiceStarter` | `process.getProperty("tx")` 와 `process.getProperty("commitTx")` 를 추출해 `SpringTransactionHandler.execute()` 의 required/alwaysCommit 으로 전달 |
| `SqlScriptTaskExecutable` | `acceptablePropertyNames = [input, ds, tx, output]` — task 의 ds/tx property 인식 |
| `PlainJavaServiceTaskExecutable` | `acceptablePropertyNames = [input, method, output, new, inputOnly, object, dto, opt]` — **ds/tx 없음, 무시** |
| `JavaServiceTaskExecutable` | classname 의 `#` 분리로 methodName 추출 후 `Wow` 인터페이스면 `WowJavaServiceTaskExecutable`, 아니면 `PlainJavaServiceTaskExecutable` 위임 |
| `DataSourceExtractorFromTransactionManager` | TxMgr → DataSource 추출 (JpaTxMgr 의 EMF 에서 DS 꺼냄) |
| `DefaultDataSourceResolver` | task 의 ds/tx 미명시 시 사용할 default DS 인터페이스 |
| `CamundaJavaServiceTaskBuilder` | BPMN element → `JavaServiceTask` 모델. `<camunda:properties>` 의 모든 property 를 `PropertyContainer` 에 담아 전달 (executable 단계에서 무시 결정) |
| `CachingServiceProvider` + `SizeBaseCacheService` | (oasis 디폴트) BPMN 파싱 결과 캐시 시도. **단 service() 본문에 `cacheService.cache()` 호출 누락 → 사실상 캐시 미동작 (R-multi-22)**. 1.0.21 부터 cactus 가 자체 `CactusCachingServiceProvider` 로 교체 |
| `PropertyContainer` (model.PropertyContainer) | `add(Property)` mutate 가능 (Map 기반, 중복 시 IllegalStateException). `hasProperty(name)` / `get(name)` / `getValue(name)` / `exportProperties()` 노출 |
| `Property` (model.Property) | `Property(String name, String value)` public ctor |
| `PropertyNames` | 표준 property 이름 상수 — `TRANSACTION_MANAGER_NAME = "tx"`, `ALWAYS_COMMIT_TRANSACTION_MANAGER_NAME = "commitTx"`, `DATA_SOURCE = "ds"`, `INPUT_KEY = "input"`, `OUTPUT_KEY = "output"`, `INPUT_KEY_ONLY = "inputOnly"` 등 |
| `Element` (model.Element 인터페이스) | `getProperty(String)` + `properties()` 노출. `Process extends Element` 이므로 `process.properties()` 로 PropertyContainer 직접 접근 가능 |

#### cactus 1.0.21 신규 클래스

| 클래스 | 역할 |
|---|---|
| `DefaultTxInjectingServiceProvider` | ServiceProvider wrap — BPMN load 시 PropertyContainer 에 `tx=<default>` 자동 inject (Tier 2 미명시 시 default 1개만 begin 보장, R-multi-11 해소) |
| `CactusCachingServiceProvider` | oasis 의 미동작 캐시 대체. cache.getObject 후 miss 시 underlying 호출 + **명시적 cache.cache() 저장** + thread-safe 보장 (R-multi-22 해소) |

### 2-2. SpringTransactionHandler.execute() 동작 (디스어셈블 결과)

```java
public void execute(Process process, String[] required, String[] alwaysCommit) {
    boolean parallelActive = ParallelExecutionScope.isActive();

    if (parallelActive && required != null && required.length > 0)
        throw new TransactionException("Parallel execution does not allow explicit transaction handling.");

    ThreadLocalTransactionWarehouseHolder.begin();
    boolean rollbackOccurred = false;

    if (required != null && required.length > 0) {
        // ① ctor 의 transactionManagerNames 가 등록 안 됐으면 거부
        if (this.transactionManagerNames == null)
            throw new IllegalStateException("transactionManagerNames is not defined. ...");

        // ② required 가 transactionManagerNames 의 부분집합인지 검증
        if (!ArrayUtil.isLeftSubsetOfRight(required, this.transactionManagerNames))
            throw new IllegalArgumentException("You specified a transaction manager that is not in the application-level transaction manager. Check the list of transaction manager names declared in the process.");

        // ③ required 의 모든 tx 시작
        for (String name : required) startTransaction(name);

    } else if (this.transactionManagerNames != null && !parallelActive) {
        // ④ required 비어있으면 ctor 에 선언된 모든 tx 시작 (default 동작)
        for (String name : this.transactionManagerNames) startTransaction(name);
    }

    try {
        process.process();
        if (!rollbackOccurred) commitAll();   // 정상 → commitAll (LIFO 순서)
    } catch (Exception e) {
        rollbackOccurred = true;
        rollbackAll(alwaysCommit);             // 예외 → alwaysCommit 명시된 TxMgr 만 commit, 나머지 rollback
        throw e;
    } finally {
        ThreadLocalTransactionWarehouseHolder.end();
    }
}
```

핵심 규칙:
- **required 는 `transactionManagerNames` (Tier 1) 의 부분집합 강제** — 위반 시 IllegalArgumentException.
- **required 비어있으면 Tier 1 의 모든 TxMgr 일괄 begin** (= film 의 단일 모드도 이 경로로 동작). **단 cactus 1.0.21 환경에서는 `DefaultTxInjectingServiceProvider` 가 BPMN load 시 default 1개 자동 inject → required 가 항상 non-empty → 분기 ④ 도달 불가.** 분기 ④ 는 oasis-core direct 사용 / non-cactus 환경에서만 도달.
- **정상 종료 시 commitAll** (alwaysCommit 무관) — 모든 begin TxMgr 를 LIFO 순서로 commit.
- **예외 시 rollbackAll(alwaysCommit)** — alwaysCommit 명단의 TxMgr 만 commit, 나머지는 rollback.
- **`commitAll()` 의 부분 실패는 throw 안 함** — log.error 만 출력하고 정상 return → ServiceResult 가 SUCCESS 로 보고됨 (R-multi-17 참조).

### 2-3. CoreServiceStarter 가 BPMN 에서 추출하는 방식

```java
// CoreServiceStarter#getUserTransactionManagerNames(process):
Property prop = process.getProperty("tx");
String[] required = (prop == null) ? null
                  : Arrays.stream(prop.getValue().split(","))
                          .map(String::trim)
                          .toArray(String[]::new);

// CoreServiceStarter#getAlwaysCommitTransactionManagerNames(process):
Property cprop = process.getProperty("commitTx");
String[] alwaysCommit = (cprop == null) ? null
                      : Arrays.stream(cprop.getValue().split(","))
                              .map(String::trim)
                              .toArray(String[]::new);

transactionHandler.execute(processWrapper, required, alwaysCommit);
```

→ **BPMN process 의 `<camunda:property name="tx" value="txBiz,txCmn"/>` 가 Tier 2 declaration**.
→ `commitTx` 는 **"예외 발생 시에도 commit 할 TxMgr 명단" (always-commit list)**. 미명시(null) 시 모든 TxMgr rollback.
→ split + trim 이라 `"txBiz, txCmn"` (공백 포함) 도 OK.

### 2-4. SqlScriptTaskExecutable 의 ds/tx property

```java
acceptablePropertyNames = ["input", "ds", "tx", "output"];

// SqlScriptTaskExecutable.execute() 의 DS 결정 (디스어셈블 결과):
// (1) tx property 명시 → ApplicationContext 에서 TxMgr 빈 lookup
// (2) ds property 명시 → ApplicationContext 에서 DataSource 빈 lookup
// (3) tx 또는 ds 만 명시되어도 DataSourceExtractorFromTransactionManager.getDataSource(tx, ds)
//     가 두 인자를 받아 내부적으로 결정 (priority 는 implementation detail)
// (4) 둘 다 미명시 → DefaultDataSourceResolver.defaultDataSource() 사용
// (5) (4) 도 빈 그래프에 DefaultDataSourceResolver 없거나 default DS null 이면
//     IllegalArgumentException("Cannot retrieve the data source. Please input either [ds] or [tx] property.")
```

> **JavaServiceTask 는 ds/tx 인식 안 함**. PlainJavaServiceTaskExecutable.acceptablePropertyNames 가 `[input, method, output, new, inputOnly, object, dto, opt]` 8개로 ds/tx 미포함. `execute()` 본문도 이 6개만 `getProperty(...)` 호출 (output 은 다른 경로). NamedObject/Wow variant 도 동일. Builder 가 PropertyContainer 에 모든 property 를 담아 전달하지만 executable 단계에서 무시됨.

### 2-5. 공식 BPMN syntax (oasis-core 자체 테스트 사례)

`workspace-oasis/oasis/oasis-core/src/test/resources/task/SqlScriptTaskTest/sqlScriptTask.bpmn`:
```xml
<bpmn:scriptTask id="Activity_0xvbm4j" scriptFormat="sql">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="ds" value="dataSource2" />   <!-- Spring DataSource 빈 이름 -->
    </camunda:properties>
    ...
  </bpmn:extensionElements>
  <bpmn:script>SELECT id, firstName, lastName FROM users WHERE id = :id</bpmn:script>
</bpmn:scriptTask>
```

→ namespace `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"` 사용.

---

## 3. yml 스키마

### 3-0. dmes 표준 DS / TxMgr 컨벤션 (1.0.21+)

| DS 이름 | TxMgr alias | 용도 | yml 위치 |
|---|---|---|---|
| **biz** | `txBiz` | **해당 모듈의 자체 DB** (mcm 자체, mpn 자체 등) | `cactus.datasource.primary-alias: biz` (Spring Boot dataSource 빈에 alias) |
| **cmn** | `txCmn` | **공통 DS** — 모든 모듈이 공유하는 공통 DB | `cactus.datasource.extras.cmn.*` |
| **if** | `txIF` | **인터페이스 송수신용 DS** — SERAI 의 SERAIUSER 같은 외부 인터페이스 DB (IF_* 테이블 등) | `cactus.datasource.extras.if.*` |

### 3-0-1. 옵션 (δ) — 3개 명시 강제 + DS 매핑 자유 (1.0.21 정책)

**`cactus.oasis.transactional=true` 인 모든 모듈은 cactus.tx.managers 에 txBiz/txCmn/txIF 3개 모두 명시 의무**. 미명시 시 `CactusTxConfigValidator` 가 부팅 fail-fast.

**DS 매핑은 자유** — 모듈이 cmn 을 사용하지 않으면 `txCmn` 도 `biz` 로 매핑 가능 (alias 만 등록, 같은 빈 가리킴). yml 자체가 모듈의 의도를 명시 (cmn=biz 매핑 = "이 모듈은 cmn 안 씀, biz 와 같이 처리").

| 모듈 | 시나리오 | yml 형태 |
|---|---|---|
| **mcm** (cmn 미사용) | `txCmn` 을 `biz` 와 같이 매핑 | `txCmn: { data-source: biz }` |
| **mpn/mpp/mqc/신규** (cmn 사용) | `txCmn` 을 별도 `cmn` DS 와 매핑 | `txCmn: { data-source: cmn }` |

→ **표준 BPMN 이식성 보장** — 어느 모듈에서나 `tx="txCmn"` BPMN 이 정의되어 있어 동작 (단 mcm 에서는 biz DB 사용, 모듈 yml 에 명시되어 있음).

> **이름의 의미** (dmes 전체 공통):
> - `biz` = Business — 모듈 자체 비즈니스 데이터
> - `cmn` = Common — 공통 데이터 (코드, 마스터 등)
> - `if` = Interface — 송수신 인터페이스 데이터 (SERAI 등)
>
> 모듈별 추가 DS (예: 모듈 자체의 별도 메타 DB) 는 cactus.datasource.extras 에 다른 이름으로 자유롭게 정의 가능 (cactus.tx.managers 등록은 OASIS 사용 시만). 단 biz/cmn/if 는 dmes 전체 표준 — 다른 의미로 사용 금지.

### 3-1. 신규 키 카탈로그 (1.0.21-SNAPSHOT)

```yaml
# ═════════════════════════════════════════════════════════════════════
# DataSource 정의 — N개 가능
# ═════════════════════════════════════════════════════════════════════
spring:
  datasource:                          # primary DS — Spring Boot 표준 그대로
    url: jdbc:sqlserver://prod-mcm/...
    username: ...
    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver

cactus:                                # cactus 블록 — datasource / jpa / tx / oasis 4개 섹션
  datasource:                          # ─ cactus.datasource ─
    primary-alias: biz                 # 1.0.21 신규 — Spring Boot 의 dataSource 빈을 cactus 안에서 'biz' 로 부름
                                       # → cactus 어디에도 'primary' magic string 안 씀, 모든 DS 가 의미 있는 이름
    extras:                            # Map<name, props> — dmes 표준 DS 2개 (cmn / if)
      cmn:                             # 공통 DS — 모든 모듈이 공유하는 공통 DB (dmes 표준 패턴)
        url: jdbc:sqlserver://prod-cmn-db/...
        username: ...
        password: ...
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
        maximum-pool-size: 10
      if:                              # 인터페이스 송수신 DS — SERAI 의 SERAIUSER 같은 외부 인터페이스 DB
        url: jdbc:sqlserver://localhost:1433;databaseName=SERAIUSER;encrypt=false;trustServerCertificate=true
        username: seraiuser
        password: ...
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
        maximum-pool-size: 5
        auto-commit: false

# ═════════════════════════════════════════════════════════════════════
# JPA — 각 DataSource 별 EntityManagerFactory 정의
# ═════════════════════════════════════════════════════════════════════
  jpa:                                 # ─ cactus.jpa ─
    snake-naming:
      enabled: true                    # primary EMF 의 snake naming (기존 그대로)
    extras:                            # Map<name, props> — 각 extras DS 의 EMF (필요 시만 정의)
      if:                              # SERAI 인터페이스 DB 의 IF_* entity 매핑 (JPA 사용 시)
        packages-to-scan:
          - com.dongkuk.dmes.mcm.serai.entity   # 호출 모듈(mcm 등) 안에 IF_* entity 정의 시
        persistence-unit-name: cactus-if
        hibernate:
          dialect: org.hibernate.dialect.SQLServerDialect
          ddl-auto: none
      # 참고: SqlScriptTask 로 직접 INSERT 만 한다면 jpa.extras.if 는 생략 가능
      #       (DataSource + TxMgr 만 있어도 SqlScriptTask 동작 — JPA Repository 안 씀)

# ═════════════════════════════════════════════════════════════════════
# Transaction Manager 정의 — DataSource ↔ TxMgr 매핑
# ═════════════════════════════════════════════════════════════════════
  tx:                                  # ─ cactus.tx ─ (1.0.21 신규)
    managers:                          # Map<name, config> — Tier 1 화이트리스트
                                       # ※ 옵션 δ — 표준 3개 (txBiz/txCmn/txIF) 모두 명시 의무. 미사용 시 biz alias 로 매핑.
      txBiz:
        data-source: biz               # ← cactus.datasource.primary-alias (= Spring Boot dataSource = 모듈 자체 DB)
      txCmn:                           # 공통 DS
        data-source: cmn               # 또는 모듈이 cmn 안 쓰면 biz (mcm 같은 예외 모듈)
      txIF:                            # 인터페이스 송수신 DS
        data-source: if                # 또는 모듈이 if 안 쓰면 biz
    default: txBiz                     # 필수. DefaultDataSourceResolver 가 반환할 DS 의 TxMgr
                                       # = Tier 3 (task ds/tx) 미명시 시 사용

# ※ JPA Repository 만 사용하고 OASIS 안에서 호출 안 되는 DS 는 cactus.tx.managers 에 등록 안 함
#   (cactus.datasource.extras + cactus.jpa.extras 까지만 정의).
# ※ 'primary' / 'secondary' magic string 1.0.21 부터 cactus 어디에도 없음.
#   모든 DataSource 가 의미 있는 이름 (biz / cmn / if) 으로 명명.

# ═════════════════════════════════════════════════════════════════════
# Oasis — Tier 1 활성화 + 기타 설정
# ═════════════════════════════════════════════════════════════════════
  oasis:                               # ─ cactus.oasis ─
    service-group: mcm
    service-path: /services            # cactus 1.0.20+ 디폴트 (보통 명시 불필요)
    transactional: true                # true 면 cactus.tx.managers 가 SpringServiceStarterFactory 에 전달
    dialect: mssql                     # mssql | sqlite — ColumnConverter 빈 등록
    cache:                             # 1.0.21 신규 — CactusCachingServiceProvider 의 BPMN cache
      size: 100                        # default 100. 모듈의 BPMN 개수 기준 조절 (mcm 38개 → 100 충분)
```

### 3-2. 폐기되는 키 (1.0.21 부터 인식 안 함, 결정 5C + 6B)

| 폐기 키 | 대체 |
|---|---|
| `cactus.datasource.secondary.url` 등 | `cactus.datasource.extras.{name}.url` |
| `cactus.jpa.secondary.packages-to-scan` 등 | `cactus.jpa.extras.{name}.packages-to-scan` |
| `cactus.jpa.secondary.enabled` | (자동 활성 — `cactus.jpa.extras.{name}` 에 entry 있으면 해당 EMF 빈 자동 등록) |
| `cactus.oasis.transaction-manager-name` | `cactus.tx.managers.*` + `cactus.tx.default` |

### 3-3. 빈 이름 변경 (결정 5C + 옵션 β 의 부수 효과)

`{Name}` 은 yml extras key 의 **PascalCase** 변환 (Spring `@ConfigurationProperties` 의 Map 바인딩 표준 — yml key 가 entry name 으로 그대로 사용되고, 빈 이름 합성 시 첫 글자만 대문자 처리). 예: yml `cmn` → `cactusDataSourceCmn`. yml `if` → `cactusDataSourceIf`.

| 1.0.20 빈 이름 | 1.0.21 빈 이름 |
|---|---|
| `cactusSecondaryDataSource` | `cactusDataSource{Name}` (예: `cactusDataSourceCmn`, `cactusDataSourceIf`) + **yml key alias** (예: `cmn`, `if`) — Phase 0-D |
| `cactusSecondaryEntityManagerFactory` | `cactusEntityManagerFactory{Name}` |
| `cactusSecondaryTransactionManager` | `cactusTransactionManager{Name}` |
| (Spring Boot 의 `dataSource` 빈) | **그대로 유지** + `cactus.datasource.primary-alias` 의 값으로 alias 등록 (예: `biz` alias) |
| (Spring Boot 의 `transactionManager` 빈) | **그대로 유지** + `cactus.tx.managers` 의 alias 등록 (예: `txBiz` alias) |
| (없음 1.0.20) | TxMgr alias: `cactus.tx.managers.{name}` 의 key 를 alias 빈 이름으로 등록 (표준 3개: `txBiz`, `txCmn`, `txIF`) |

→ mcm 코드 (`KmcSecondaryJpaConfig.java` 등) 가 이 빈 이름을 `@Qualifier` 등으로 참조한다면 같이 변경 필요. **Phase 6 시작 전 grep 으로 사전 점검 필수**.

**옵션 β 의 핵심 (1.0.21 — primary-alias)**:
- Spring Boot 의 `dataSource` 빈 자체는 그대로 유지 (Spring Boot 표준 호환)
- cactus 가 `cactus.datasource.primary-alias` 값으로 alias 빈 등록 → cactus.tx.managers 안에서 'biz' 같은 의미 있는 이름으로 참조 가능
- `data-source: primary` 같은 magic string 사라짐 — 모든 DS 가 의미 있는 이름

---

## 4. cactus-core 변경 카탈로그

### 4-1. 신규 클래스

| 분류 | 클래스 | 역할 |
|---|---|---|
| properties | `CactusTxProperties` | `cactus.tx.managers` (Map) + `cactus.tx.default` 바인딩 |
| properties | `CactusDataSourceProperties` (확장) | `secondary` 필드 제거, `primaryAlias: String` 신규 (옵션 β), `extras: Map<String, DataSourceProps>` 신규 |
| properties | `CactusJpaProperties` (확장) | `secondary` 필드 제거, `extras: Map<String, JpaProps>` 신규 |
| autoconfig | `CactusMultiDataSourceAutoConfiguration` | (1) extras 의 각 entry 별 HikariDataSource 빈 등록 (`cactusDataSource{Name}`). (2) **각 빈에 yml key 그대로 alias 등록** (Phase 0-D — BPMN `ds="if"` 작성 친화). (3) primary-alias 명시 시 Spring Boot 의 dataSource 빈에 alias 등록 (옵션 β) |
| autoconfig | `CactusMultiJpaAutoConfiguration` | extras 의 각 entry 별 EMF + JpaTransactionManager 빈 등록 |
| autoconfig | `CactusMultiTransactionManagerAutoConfiguration` | `cactus.tx.managers` 의 각 entry 마다 TxMgr 빈 alias 등록. data-source 가 primary-alias 값과 일치하면 Spring Boot 의 transactionManager 에 alias, 그 외에는 cactusTransactionManager{Name} 에 alias |
| validation | `CactusTxConfigValidator` | 부팅 시 fail-fast: managers 가 transactional=true 인데 비어있으면 IllegalStateException, default 가 managers 에 없으면 IllegalStateException |
| **oasis/provider** | **`DefaultTxInjectingServiceProvider`** | (`com.dongkuk.dmes.cactus.oasis.provider`) ServiceProvider wrap — BPMN load 시 PropertyContainer 에 `tx=<default>` 자동 inject (방법 C). Tier 2 미명시 process 가 default 1개만 begin 하도록 강제 |
| **oasis/provider** | **`CactusCachingServiceProvider`** | (`com.dongkuk.dmes.cactus.oasis.provider`) oasis 의 미동작 `CachingServiceProvider` 대체 — `cache.getObject` 후 miss 시 underlying 호출 + 결과를 `cache.cache(serviceId, result)` 명시 저장. ConcurrentHashMap 또는 lock 기반 thread-safe (R-multi-22 해소). cache size 는 `cactus.oasis.cache.size` yml 로 조절 (default 100) |

### 4-2. 수정 클래스

| 클래스 | 변경 |
|---|---|
| `OasisProperties` | `transactionManagerName` 단일 필드 **제거** (결정 6B). `transactionManagerNames: List<String>` 도 도입 안 함 — `CactusTxProperties.managers.keySet()` 이 진실 |
| `OasisAutoConfiguration#serviceStarter` | (1) `cactus.tx.managers.keySet()` 을 `SpringServiceStarterFactory(ctx, String[])` 에 전달. (2) ServiceProvider 빈 그래프 와이어링: `CactusCachingServiceProvider(DefaultTxInjectingServiceProvider(SimpleServiceProvider(path,"bpmn","^^"), default), cache)` 명시 등록. (3) transactional=true 인데 managers 비어있으면 fail-fast (Validator 가 사전 차단) |
| `CactusSecondaryDataSourceAutoConfiguration` | **삭제** (결정 5C) |
| `CactusSecondaryJpaAutoConfiguration` | **삭제** (결정 5C) |

### 4-3. 삭제할 클래스

- `CactusSecondaryDataSourceAutoConfiguration`
- `CactusSecondaryJpaAutoConfiguration`
- `OasisProperties.transactionManagerName` 필드 + setter/getter

### 4-4. AutoConfiguration.imports 갱신

```diff
- com.dongkuk.dmes.cactus.datasource.CactusSecondaryDataSourceAutoConfiguration
- com.dongkuk.dmes.cactus.jpa.CactusSecondaryJpaAutoConfiguration
+ com.dongkuk.dmes.cactus.datasource.CactusMultiDataSourceAutoConfiguration
+ com.dongkuk.dmes.cactus.jpa.CactusMultiJpaAutoConfiguration
+ com.dongkuk.dmes.cactus.tx.CactusMultiTransactionManagerAutoConfiguration
```

> **참고**: `DefaultTxInjectingServiceProvider` / `CactusCachingServiceProvider` 는 별도 `@AutoConfiguration` 클래스가 아니라 `OasisAutoConfiguration#serviceStarter()` 안에서 직접 인스턴스화된다 (factory.setServiceProvider(...)). 따라서 imports 추가 없음.

---

## 5. BPMN 작성 가이드

### Task 종류별 multi-tx 표현 위치

| Task 종류 | Tier 3 (task 레벨 ds/tx) | multi-tx 분기 방법 |
|---|---|---|
| `SqlScriptTask` (`scriptFormat="sql"`) | ✅ `<camunda:property name="ds" value="..."/>` / `name="tx" value="..."` 인식 | task 단위 ds/tx 명시 |
| `ProcedureScriptTask` | ✅ Script 계열이라 동일 | task 단위 ds/tx 명시 |
| `TransactionScriptTask` | (자체 트랜잭션 제어 — commit/rollback 명령) | script 안에 `commit txCmn` 등 명령 |
| `JavaServiceTask` (`<camunda:class>` + `<camunda:method>`) | ❌ 무시 (Phase 0 검증) | 호출 대상 `@Service` 메서드의 `@Transactional("txXxx")` |

→ JavaServiceTask 만 사용하는 process 라면 BPMN 안에서 `tx`/`ds` 명시는 의미 없고, **호출 대상 Spring 빈의 `@Transactional` 명시로만** 다른 TxMgr 사용 가능.

### 5-1. 패턴 (A) — 단순 process, 단일 TxMgr 사용

가장 흔한 사례. 모든 task 가 default TxMgr (`cactus.tx.default = txBiz`) 의 connection 사용.

```xml
<bpmn:process id="myProc">
  <bpmn:serviceTask id="t1">
    <bpmn:extensionElements>
      <camunda:class>com.dongkuk.dmes.mcm.security.service.SecUserService</camunda:class>
      <camunda:method>searchUsers</camunda:method>
    </bpmn:extensionElements>
  </bpmn:serviceTask>
</bpmn:process>
```

→ Tier 2 미명시 → cactus `DefaultTxInjectingServiceProvider` 가 BPMN load 시 `tx=<default>` (예: `tx=txBiz`) 자동 inject → SpringTransactionHandler 가 **default 1개만** begin (사용 안 하는 txCmn/txIF 는 begin 안 됨, DB 커넥션 풀 절약). SecUserService.searchUsers 메서드는 `@Transactional` 미명시이므로 Spring `@Primary` TxMgr (= cactus 가 등록한 default = txBiz) 의 트랜잭션에 join.

### 5-2. 패턴 (B) — Process 가 특정 TxMgr 들만 사용 (실제 시나리오 — SERAI 인터페이스 INSERT)

mcm 의 비즈니스 로직이 자체 DB 갱신과 동시에 SERAI 인터페이스 DB (SERAIUSER 의 IF_* 테이블) 에 INSERT 하는 시나리오. 두 트랜잭션을 process 단위로 묶어 일괄 begin/commit.

```xml
<bpmn:process id="seraiInterfaceSendProc">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txBiz,txIF"/>     <!-- mcm DB + SERAI 인터페이스 DB -->
    </camunda:properties>
  </bpmn:extensionElements>

  <!-- 1) mcm 자체 DB 갱신 (예: 송신 이력 기록) -->
  <bpmn:serviceTask id="t1">
    <bpmn:extensionElements>
      <camunda:class>com.dongkuk.dmes.mcm.serai.service.SendHistoryService</camunda:class>
      <camunda:method>recordSend</camunda:method>
    </bpmn:extensionElements>
  </bpmn:serviceTask>

  <!-- 2) SERAI 인터페이스 DB 의 IF_* 테이블에 INSERT (txIF) -->
  <bpmn:scriptTask id="t2" scriptFormat="sql">
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="tx" value="txIF"/>          <!-- SERAIUSER connection -->
        <camunda:property name="input" value="interfaceId,payload"/>
      </camunda:properties>
    </bpmn:extensionElements>
    <bpmn:script>
      INSERT INTO IF_INTERFACE (INTERFACE_ID, PAYLOAD, CREATED_AT)
      VALUES (:interfaceId, :payload, GETDATE())
    </bpmn:script>
  </bpmn:scriptTask>
</bpmn:process>
```

→ process 시작 시 txBiz + txIF 둘 다 begin (다른 TxMgr 는 begin 안 됨). t1 은 mcm DB connection (txBiz), t2 는 SERAIUSER connection (txIF) 사용. 정상 종료 시 둘 다 commit. 예외 시 둘 다 rollback (commitTx 미명시).

> **핵심 효과**: mcm 자체 DB 갱신과 SERAI 인터페이스 INSERT 가 **하나의 BPMN process 안에서 묶이는 비즈니스 단위**가 됨. 단 1PC 라 부분 commit 위험은 R-multi-2/17 에 따른 운영 정책 (멱등 / 모니터링) 필요.

### 5-3. 패턴 (C) — 자유로운 task 별 명시 (Script 계열에서 가장 권장)

Tier 2 declare 없이 task 별 ds/tx 명시. SqlScriptTask 위주.

```xml
<bpmn:process id="mixedProc">                              <!-- Tier 2 미명시: 모든 TxMgr begin -->
  <bpmn:serviceTask id="t1">                                <!-- 호출 Service 의 @Transactional 따름 -->
    <bpmn:extensionElements>
      <camunda:class>com.example.BizService</camunda:class>
      <camunda:method>register</camunda:method>
    </bpmn:extensionElements>
  </bpmn:serviceTask>

  <bpmn:scriptTask id="t2" scriptFormat="sql">             <!-- txCmn -->
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="tx" value="txCmn"/>
      </camunda:properties>
    </bpmn:extensionElements>
    <bpmn:script>SELECT * FROM cmn_table WHERE id = :id</bpmn:script>
  </bpmn:scriptTask>

  <bpmn:scriptTask id="t3" scriptFormat="sql">             <!-- txIF (DS 직접 지정도 가능) -->
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="ds" value="cactusDataSourceIf"/>   <!-- 또는 tx="txIF" -->
      </camunda:properties>
    </bpmn:extensionElements>
    <bpmn:script>SELECT * FROM IF_INTERFACE WHERE STATUS='PENDING'</bpmn:script>
  </bpmn:scriptTask>
</bpmn:process>
```

> **사용성 노트 (Phase 0-D 검증으로 1.0.21 반영)**: `cactus.datasource.extras.{name}` 등록 시 cactus 가 **yml key 그대로 alias 등록** (예: yml `if` → 빈 alias `if` = `cactusDataSourceIf`). 따라서 BPMN 작성자는 다음 3가지 형식 모두 동작:
> - `<camunda:property name="ds" value="if"/>` ← **yml key 그대로** (권장 — 가독성)
> - `<camunda:property name="ds" value="cactusDataSourceIf"/>` ← 빈 이름 (PascalCase, 동작은 같음)
> - `<camunda:property name="tx" value="txIF"/>` ← TxMgr alias (DataSourceExtractor 가 자동 추출)
>
> → **`ds="if"` 또는 `tx="txIF"` 형태 권장**. PascalCase 빈 이름 외울 필요 없음.

### 5-4. 패턴 (D) — JavaServiceTask 에서 multi-tx (Service 레이어 명시)

JavaServiceTask 는 Tier 3 미지원 → 호출 대상 `@Service` 메서드에 `@Transactional("txXxx")` 명시.

**BPMN**:
```xml
<bpmn:process id="javaMixedProc">
  <bpmn:serviceTask id="t1">                              <!-- BizService.register → @Transactional("txBiz") 또는 미명시 -->
    <bpmn:extensionElements>
      <camunda:class>com.example.BizService</camunda:class>
      <camunda:method>register</camunda:method>
    </bpmn:extensionElements>
  </bpmn:serviceTask>
  <bpmn:serviceTask id="t2">                              <!-- CmnService.lookup → @Transactional("txCmn") -->
    <bpmn:extensionElements>
      <camunda:class>com.example.CmnService</camunda:class>
      <camunda:method>lookup</camunda:method>
    </bpmn:extensionElements>
  </bpmn:serviceTask>
</bpmn:process>
```

**Java**:
```java
@Service
public class BizService {
    @Transactional("txBiz")    // 또는 미명시 (default = @Primary = txBiz)
    public Result register(Input in) { ... }
}

@Service
public class CmnService {
    @Transactional("txCmn")    // 명시 필수 — 외곽이 모든 TxMgr begin 한 상태에서 txCmn join
    public Result lookup(Input in) { ... }
}
```

→ Tier 2 미명시 → 외곽이 모든 TxMgr begin. 각 Service 메서드의 `@Transactional("txXxx")` 가 외곽 트랜잭션 join → 같은 connection 사용. 모두 commit 시 일괄.

### 5-5. 비대칭 commit/rollback (드문 케이스)

특정 TxMgr 만 예외 발생해도 commit 보존. 감사 로그 용도 등.

```xml
<bpmn:process id="auditProc">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txBiz,txAudit"/>
      <camunda:property name="commitTx" value="txAudit"/>     <!-- 예외 발생해도 txAudit 는 commit -->
    </camunda:properties>
  </bpmn:extensionElements>
  ...
</bpmn:process>
```

→ 정상 종료 → 둘 다 commit. 예외 발생 → `rollbackAll([txAudit])` 호출되어 txAudit 만 commit, txBiz 는 rollback.

> **주의 (Phase 0 검증)**: `commitAll()` (정상 종료 시) 의 부분 commit 실패는 예외 throw 안 함. log.error 만 출력하고 ServiceResult 는 SUCCESS 로 반환됨. 즉 운영자가 로그 모니터링 안 하면 부분 commit 발생 자체를 모를 수 있음 (R-multi-17).

---

## 6. `@Transactional` 상호작용 매트릭스 (결정 4A, 옵션 α 반영)

JavaServiceTask 가 호출하는 `@Service` 메서드 안에서 `@Transactional` 사용 시 동작.

> **중요 (옵션 α)**: cactus 1.0.21 의 `DefaultTxInjectingServiceProvider` 가 Tier 2 미명시 process 에 `tx=<default>` 1개 inject → 외곽이 **default 1개만 begin**. 즉 multi-tx 가 필요한 process 는 **반드시 BPMN process 레벨에서 `tx="txBiz,txCmn"` 명시 필수**. 미명시 process 의 Service 메서드가 `@Transactional("txCmn")` 요구 시 외곽이 txCmn 을 begin 안 한 상태 → Spring 이 별도 트랜잭션 시작 (oasis commitAll 범위 밖).

| Case | 외곽 (Tier 2) → 실제 begin | 내부 (`@Transactional`) | 동작 | 권장 |
|---|---|---|---|---|
| 1 | 미명시 → **default 1개 (txBiz)** begin | 미명시 | Spring `@Primary` TxMgr (=default=txBiz) join. 외곽 트랜잭션 join | ✅ 안전 |
| 2 | 미명시 → **default 1개 (txBiz)** begin | `@Transactional("txBiz")` | default 와 일치 → 외곽 트랜잭션 join | ✅ 안전 (Rule 2) |
| 3 | 미명시 → **default 1개 (txBiz)** begin | `@Transactional("txCmn")` | **txCmn 이 begin 안 된 상태** → Spring 이 별도 트랜잭션 시작 → oasis commitAll 범위 밖 | ❌ **금지** — Tier 2 에 `tx="txBiz,txCmn"` 명시 필수 (Case 5 로 이동) |
| 4 | `tx="txBiz,txCmn"` 명시 → txBiz + txCmn begin | 미명시 | `@Primary` TxMgr (txBiz) join. txCmn 은 사용 안 됨 | ⚠️ 주의 — Service 의도 명확화 필요 |
| 5 | `tx="txBiz,txCmn"` 명시 → txBiz + txCmn begin | `@Transactional("txCmn")` | 외곽이 txCmn 도 begin 했으니 join. 같은 connection 공유 | ✅ 안전 (multi-tx 정합) |
| 6 | `tx="txCmn"` 명시 → txCmn 만 begin | `@Transactional("txBiz")` | 외곽이 txCmn 만 begin, Service 가 txBiz 요구 → Spring 이 별도 트랜잭션 시작 | ❌ 금지 |

### 권장 정책

**Rule 1**: JavaServiceTask 의 Service 메서드는 가급적 `@Transactional` **명시 안 함** (Case 1). 외곽 default TxMgr 의 트랜잭션을 그대로 사용 — 가장 단순.

**Rule 2**: Service 메서드가 default 외 TxMgr 가 필요하면 **세 가지를 모두 만족**해야 함:
- (a) BPMN process 레벨에 `tx="txBiz,txCmn"` 명시 (Tier 2 에서 begin)
- (b) Service 메서드에 `@Transactional("txCmn")` 명시
- (c) (a) 와 (b) 의 이름이 일치

→ Case 5 형태가 정합. Case 3 (Tier 2 미명시 + Service 가 다른 tx 명시) 은 운영 사고 위험으로 **금지**.

**Rule 3**: `@Transactional(propagation = REQUIRES_NEW)` 는 외곽 트랜잭션을 일시 중단하고 새 트랜잭션 생성 → oasis commitAll 과 별도 commit. **사실상 금지** (의도가 분명한 경우만, 예: 감사 로그).

**Rule 4**: 디폴트 `REQUIRED` propagation 이 안전 (외곽 트랜잭션 join).

**Rule 5 (옵션 α 신규)**: Tier 2 미명시 process 의 모든 Service 호출은 default TxMgr 만 사용 — Service 의 `@Transactional` 명시는 default 와 일치 (Case 2) 또는 미명시 (Case 1) 만 허용.

### 6-2. OASIS 외 일반 Spring 코드에서의 cactus 빈 사용

cactus 가 등록하는 빈들은 **모두 일반 Spring 빈** — OASIS 무관하게 `@Service`, `@Transactional`, `@EnableJpaRepositories`, `@Qualifier` 등 표준 방식으로 사용 가능.

#### 등록되는 빈 매트릭스

| 빈 이름 | 종류 | 등록 조건 | 일반 Spring 사용 |
|---|---|---|---|
| `cactusDataSource{Name}` | `HikariDataSource` | `cactus.datasource.extras.{name}` 정의 | `@Autowired @Qualifier("cactusDataSourceCmn") DataSource ds` |
| `cactusEntityManagerFactory{Name}` | `EntityManagerFactory` | `cactus.jpa.extras.{name}` 정의 | `@PersistenceContext` 또는 `@Qualifier` 주입 |
| `cactusTransactionManager{Name}` | `JpaTransactionManager` 또는 `DataSourceTransactionManager` | extras DS 정의 시 자동 (jpa.extras 정의 → JpaTxMgr, 미정의 → DataSourceTxMgr) | `@Transactional("cactusTransactionManagerCmn")` |
| `txCmn` / `txIF` (alias) | 위 TxMgr 빈의 alias | `cactus.tx.managers.{name}` 정의 시 | `@Transactional("txCmn")` ← 짧은 이름 |
| `biz` (alias) | Spring Boot dataSource 의 alias | `cactus.datasource.primary-alias: biz` | `@Qualifier("biz") DataSource ds` |

#### 사용 패턴 4가지

**(A) `@Transactional` 로 cmn TxMgr 지정**

```java
@Service
public class CmnDataService {
    @Transactional("txCmn")          // ← cactus.tx.managers.txCmn 의 alias
    public void updateCommonData(CommonDto dto) {
        // cmn DataSource 의 트랜잭션으로 실행
    }
}
```

**(B) Spring Data JPA Repository 를 cmn EMF 에 매핑**

```java
@Configuration
@EnableJpaRepositories(
    basePackages = "com.example.repository.cmn",
    entityManagerFactoryRef = "cactusEntityManagerFactoryCmn",
    transactionManagerRef   = "cactusTransactionManagerCmn"   // 또는 "txCmn"
)
public class CmnRepositoryConfig {}
```

**(C) 직접 DataSource 주입 (JdbcTemplate 등)**

```java
@Service
public class CmnQueryService {
    private final JdbcTemplate cmnJdbc;
    public CmnQueryService(@Qualifier("cactusDataSourceCmn") DataSource cmnDs) {
        this.cmnJdbc = new JdbcTemplate(cmnDs);
    }
}
```

**(D) 한 메서드에서 여러 DS 호출 (Spring 표준 패턴)**

```java
@Service
public class MixedService {
    @Transactional("txBiz")          // 외곽: 자체 DB 트랜잭션
    public void processWithCmnLookup(String id) {
        Item item = bizRepository.findById(id);
        commonLookupService.lookup(id);   // 내부 메서드가 @Transactional("txCmn") — 별도 트랜잭션
    }
}
```

**(E) primary-alias 빈 직접 주입 (옵션 β alias)**

```java
@Service
public class BizQueryService {
    private final JdbcTemplate bizJdbc;
    public BizQueryService(@Qualifier("biz") DataSource bizDs) {   // ← cactus.datasource.primary-alias 의 값
        this.bizJdbc = new JdbcTemplate(bizDs);
    }
}
```
→ `@Qualifier("dataSource")` (Spring Boot 디폴트 빈 이름) 도 같은 빈을 가리킴. `biz` alias 가 의미 명확.

#### OASIS 와 일반 Spring 의 차이

| 항목 | OASIS BPMN | 일반 Spring `@Service` |
|---|---|---|
| TxMgr 화이트리스트 | `cactus.tx.managers` 명시 필수 | 등록 무관 — 빈 그래프에 있으면 사용 가능 |
| 트랜잭션 시작 | BPMN process 시작 시 외곽이 일괄 begin | 메서드 진입 시 `@Transactional` 가 begin |
| commit / rollback | process 종료 시 commitAll / rollbackAll | 메서드 종료 시 commit / 예외 시 rollback |
| 다중 TxMgr 동시 begin | 가능 (process 단위) | 불가능 (Spring `@Transactional` 은 메서드당 1개 TxMgr) |

→ **OASIS 만 가능한 게 "한 process 안에서 여러 TxMgr 동시 begin + commitAll"**. 일반 Spring 은 메서드당 1개 TxMgr 이라 multi-tx 는 메서드 분리 (또는 `@Transactional(propagation=REQUIRES_NEW)`) 로 처리.

#### OASIS 안 쓰는 모듈도 가능

`cactus.oasis.transactional=false` (또는 OASIS 미설정) 모듈도 위 패턴 모두 사용 가능:

```yaml
cactus:
  datasource:
    primary-alias: biz
    extras:
      cmn: { url: ..., ... }
      if:  { url: ..., ... }
  jpa:
    extras:
      cmn: { packages-to-scan: [...] }
  # cactus.tx.managers 미정의 — OASIS 안 쓰는 모듈
  # cactus.oasis.transactional: false
```

→ `cactusDataSourceCmn` / `cactusEntityManagerFactoryCmn` / `cactusTransactionManagerCmn` 빈 등록됨. `@Service` 에서 그대로 사용 가능. 단 alias 빈 (`txCmn`) 은 등록 안 됨 (alias 는 `cactus.tx.managers` 가 책임).

→ alias 까지 사용하고 싶다면 OASIS 미사용 모듈도 `cactus.tx.managers.txCmn: { data-source: cmn }` 정의 가능. OASIS 화이트리스트 의미는 없지만 짧은 이름 (`@Transactional("txCmn")`) 사용 가능 + 향후 OASIS 도입 시 그대로 사용.

---

## 7. 부팅 시 fail-fast 검증

`CactusTxConfigValidator` 가 **빈 그래프 완성 후** (`ContextRefreshedEvent` listener — 권장) 에서 검증.

> **시점 비교 + 권장**:
> - `ApplicationContextInitializedEvent` ❌ — 빈 정의 로드 *전* 발생, cactus.tx.default 의 빈 존재 검증 불가
> - **`ContextRefreshedEvent` ✅ 권장** — 빈 그래프 완성 직후 + **web server start 전**. 검증 실패 시 깔끔한 startup 실패 (포트 안 잡힘)
> - `ApplicationReadyEvent` △ — web server start 후 발생. 검증 실패 시 throw 되지만 **포트는 이미 잡힌 부분 시작 상태** → 외부에서 health check 가 일시적으로 200 받을 수 있음. 운영 안전성 ↓

| 조건 | 동작 |
|---|---|
| `cactus.oasis.transactional=true` + `cactus.tx.managers` 비어있음 | `IllegalStateException("cactus.oasis.transactional=true 이면 cactus.tx.managers 에 최소 표준 3개 (txBiz, txCmn, txIF) 정의 필수")` |
| `cactus.oasis.transactional=true` + 표준 3개 (`txBiz`/`txCmn`/`txIF`) 중 하나라도 누락 (옵션 δ) | `IllegalStateException("cactus.tx.managers 에 표준 3개 중 누락: [{missing}]. cactus 사용 모듈은 biz/cmn/if 3개 모두 명시 의무. 모듈이 사용 안 하면 data-source 를 biz alias 로 매핑하여 명시.")` |
| `cactus.tx.default` 가 `cactus.tx.managers` 의 key 가 아님 | `IllegalStateException("cactus.tx.default='{name}' 이 cactus.tx.managers 에 없습니다. 사용 가능: [...]")` |
| `cactus.tx.managers.{name}.data-source` 가 `cactus.datasource.primary-alias` 값과 일치하지 않고 `cactus.datasource.extras.{name}` 에도 없음 | `IllegalStateException("TxMgr '{name}' 의 data-source='{ds}' 가 cactus.datasource.primary-alias 또는 extras 어디에도 정의 안 됨. 사용 가능: [{primaryAlias}, {extras keys}]")` |
| `cactus.datasource.primary-alias` 명시했는데 빈 그래프에 Spring Boot 의 `dataSource` 빈 부재 | `IllegalStateException("cactus.datasource.primary-alias='{alias}' 명시했지만 Spring Boot 의 dataSource 빈이 ApplicationContext 에 없음. spring.datasource.* 정의 확인.")` |
| `cactus.datasource.extras` 의 key 가 다음과 충돌 (R-multi-28): primary-alias 값 / Spring Boot 표준 빈 (`dataSource`/`transactionManager`/`entityManagerFactory`) / cactus 자체 빈 (`cactus*` prefix) | `IllegalStateException("cactus.datasource.extras.{name} 의 key '{name}' 이 다음과 충돌: [{conflict}]. 다른 이름 사용 (의미 있는 약자 권장 — biz/cmn/if 외 모듈별 이름).")` |
| `cactus.tx.managers.{name}` 의 alias 등록 시점에 ApplicationContext 에 대상 빈 부재 | `IllegalStateException("TxMgr alias '{name}' 의 대상 빈이 ApplicationContext 에 없음")` |
| `cactus.datasource.extras.{name}` 있는데 `cactus.jpa.extras.{name}` 없음 | `WARN` 로그 (DataSource 만 있고 EMF 없음 — MyBatis 전용 시 정상 가능) |

BPMN 의 `tx="..."` 가 Tier 1 화이트리스트 외 이름이면 oasis-core 가 *런타임 호출 시* throw → 사전 lint 도구로 검증 권장 (Phase 8 별도).

---

## 8. 트랜잭션 라이프사이클 상세

```
┌────────────────────────────────────────────────────────────────┐
│ HTTP 요청 → OasisController.handle()                           │
│ → OasisServiceExecutor.execute(serviceId, request)              │
│ → ServiceStarter.start(serviceId)                               │
│      = StopWatchServiceStarter.start                            │
│        → SpringServiceStarter.start                             │
│          → CoreServiceStarter.start ← 본 문서의 핵심            │
└────────────────────────────────────────────────────────────────┘
        ↓
   1. ServiceProvider.service(serviceId)  [cactus 1.0.21 빈 그래프]
      ┌─ CactusCachingServiceProvider (cache hit → 즉시 반환, miss → fall-through)
      │     ↓
      ├─ DefaultTxInjectingServiceProvider (cactus 신규)
      │     ↓
      └─ SimpleServiceProvider → CamundaBpmnServiceUnmarshaller
            → BPMN 파싱 → Process 객체
            ↑
      DefaultTxInjectingServiceProvider 가 결과 받아서:
         if (!process.properties().hasProperty("tx"))
            process.properties().add(new Property("tx", default));
            ↑
      CactusCachingServiceProvider 가 결과 cache.cache(serviceId, svc) 명시 저장
        ↓
   2. CoreServiceStarter:
      String[] required     = parseCsv(process.getProperty("tx"));
                              // ← inject 덕분에 Tier 2 미명시여도 [default] 1개 들어옴
      String[] alwaysCommit = parseCsv(process.getProperty("commitTx"));
                              // ← "예외 시에도 commit 할 TxMgr 명단" (rollback 의 inverse)
      transactionHandler.execute(processWrapper, required, alwaysCommit);
        ↓
   3. SpringTransactionHandler.execute:
      ┌─ 부분집합 검증: required ⊆ Tier 1 화이트리스트
      ├─ 모든 required 의 트랜잭션 begin (분기 ③ 항상 진입 — inject 덕분)
      │  → 분기 ④ (Tier 1 모두 begin) 는 cactus 환경에서는 도달 불가
      │  → TransactionManagerWarehouse 에 TransactionStatus 보관
      ├─ try {
      │     processWrapper.process();
      │     ├─ ProcessStarter 가 task 들 순회
      │     ├─ 각 task 가 ds/tx property 로 어떤 connection 쓸지 선택
      │     │   - JavaServiceTask: @Service 메서드 호출 (외곽 트랜잭션 join)
      │     │   - SqlScriptTask: ds/tx 의 connection 으로 SQL 실행
      │     │   - TransactionScriptTask: 특정 TxMgr 만 중간 commit/rollback
      │     │     (commitAndRestartTransaction / rollbackAndRestartTransaction)
      │     commitAll();   // 모든 활성 TxMgr 일괄 commit (1PC, 순차)
      │  } catch (Exception e) {
      │     rollbackAll(alwaysCommit);   // alwaysCommit 외 모두 rollback,
      │                                  // alwaysCommit 명단의 TxMgr 만 commit (비대칭 정책)
      │     throw e;
      │  } finally {
      │     ThreadLocalTransactionWarehouseHolder.end();   // ThreadLocal 정리
      │  }
      └─
        ↓
   4. ServiceResult 반환
```

### 1PC 의 부분 commit 위험 (결정 3A)

```
commitAll() 순차 진행:
   ① txBiz commit → 성공
   ② txCmn commit → 실패 (네트워크 끊김)
결과: txBiz 데이터 들어감, txCmn 데이터 안 들어감 → 정합성 깨짐
```

**완화책**:
- 비즈니스 로직을 멱등(idempotent) 하게 설계 (재시도 안전)
- 또는 보상 트랜잭션 (Saga 패턴) 으로 처리
- 정합성 critical 한 경우 단일 TxMgr 로 통합 (한 DB 안 처리)
- 진짜 2PC 필요 시 별도 RFC (Atomikos / Narayana) — 본 설계 범위 밖

---

## 9. Spring Boot 4 호환성 검증

| 항목 | 결과 | 근거 |
|---|---|---|
| oasis-core 5.1.0 의 `org.springframework.transaction.PlatformTransactionManager` | Spring 6+/Boot 3+ 와 동일 패키지 | jar 검증 ✅ |
| `JpaTransactionManager` (org.springframework.orm.jpa) | Spring 6+/Boot 4 동일 클래스 | 변경 없음 ✅ |
| Multiple `EntityManagerFactory` 빈 등록 | cactus 1.0.19 의 `CactusSecondaryJpaAutoConfiguration` 이 이미 사용 중 | mcm bootRun 검증됨 ✅ |
| Multiple `HikariDataSource` 빈 + `@Primary` 처리 | 1.0.21 신규 — `@ConditionalOnSingleCandidate` 가드 + extras 빈에 `@Primary` 안 붙임 | R-multi-1 |
| Spring Boot 4 의 `JdbcTemplateAutoConfiguration` (`@ConditionalOnSingleCandidate(DataSource)`) | multi-DS 시 비활성. JdbcTemplate 빈 부재 | R-multi-5 |
| Spring Boot 4 의 `TransactionAutoConfiguration` 의 `@Primary PlatformTransactionManager` 자동 추론 | cactus 가 default TxMgr (txBiz) 에 `@Primary` 명시 등록 | R-multi-8 |
| Spring Boot 4 의 `DataSourceAutoConfiguration` 가 `@ConditionalOnMissingBean(DataSource.class)` — extras DS 가 먼저 로드되면 primary 가 안 만들어질 수 있음 | extras 가 primary 자리를 잘못 차지하는 부팅 실패 | R-multi-18 |

→ **호환 확정**. 단 R-multi-1 / R-multi-5 / R-multi-8 은 §10 위험 평가에서 완화책 명시.

---

## 10. 위험 평가

| # | 위험 | 영향 | 완화 |
|---|---|---|---|
| **R-multi-1** | Spring Boot 4 의 `DataSourceAutoConfiguration` 가 multiple HikariDataSource 빈 등록 시 `@Primary` 충돌 | 부팅 실패 가능 | extras DataSource 빈에 `@Primary` 안 붙임 + primary 만 Spring Boot 자동 등록에 위임 + `@ConditionalOnSingleCandidate` 가드 |
| **R-multi-2** | 1PC → 부분 commit 가능성 | 데이터 정합 깨질 수 있음 | docs 명문화 + 멱등/Saga 가이드. 2PC 는 별도 RFC |
| **R-multi-3** | JavaServiceTask 가 호출하는 `@Service` 메서드의 `@Transactional` 이 외곽과 다른 TxMgr 요구 | 의도 외 트랜잭션 분리 | §6 의 4-case Rule 1~4 명문화 + code review |
| **R-multi-4** | `cactus.tx.default` 에 지정한 TxMgr 가 빈 그래프에 없으면 부팅 실패 | 부팅 fail-fast | `CactusTxConfigValidator` 가 startup 에 검증, 명확한 메시지 |
| **R-multi-5** | Spring Boot 4 의 `JdbcTemplateAutoConfiguration` 이 multi-DS 환경에서 비활성 → JdbcTemplate 빈 부재 | 다른 라이브러리 영향 | primary DS 에 대해 `JdbcTemplate` 빈을 cactus 가 명시 등록 (옵션, 1.0.22 검토) |
| **R-multi-6** | TxMgr 빈 alias 충돌 (`txBiz` 가 이미 다른 빈으로 정의되어 있으면 alias 등록 실패) | 부팅 실패 | `@ConditionalOnMissingBean` 가드 + 충돌 시 명확한 메시지 |
| **R-multi-7** | `commitAll()` 의 동작 | **해소 (Phase 0)** — LIFO 순서, 부분 실패 시 throw 안 함 (log.error 만), 호출자 정상 return. 자세한 영향은 R-multi-17 참조. |
| **R-multi-8** | Spring Boot 4 의 `TransactionAutoConfiguration` 의 `@Primary` 자동 추론 — multi-TxMgr 환경 모호 | `@Transactional` 미명시 의도 외 적용 | cactus 가 `cactus.tx.default` 의 TxMgr 에 `@Primary` 명시 등록 |
| **R-multi-9** | 1.0.20 의 `cactusSecondaryDataSource` 빈 이름을 mcm 코드가 `@Qualifier` 로 직접 참조 시 1.0.21 부팅 실패 | mcm 부팅 실패 | Phase 6 첫 항목으로 mcm 코드 사전 grep (`cactusSecondary*` 패턴) + 빈 이름 갱신 |
| **R-multi-10** | Spring Boot 4 + Hibernate 7 의 `LocalContainerEntityManagerFactoryBean` 라이프사이클 | 신규 EMF 빈 시동 실패 | 기존 `CactusSecondaryJpaAutoConfiguration` 코드 패턴 재활용 (이미 검증됨) |
| **R-multi-11** | Tier 2 미명시 시 *모든* 등록 TxMgr 가 process 시작마다 begin → 사용 안 하는 TxMgr 도 매번 connection 잡음 | DB 커넥션 풀 압박 | **해소 (옵션 α — 1.0.21)** — `DefaultTxInjectingServiceProvider` 가 BPMN load 시 default 1개 자동 inject → 미명시 process 도 default 1개만 begin. 다중 begin 은 명시한 경우만. |
| **R-multi-12** | Tier 1 화이트리스트 갱신 (표준 3개 외 신규 TxMgr 추가) 시 모든 모듈 yml 정합 깨질 수 있음 | 부팅 실패 또는 BPMN 호출 실패 | yml `cactus.tx.managers` 가 SoT — yml 만 변경하면 자동 반영. 단 표준 3개 (biz/cmn/if) 외 추가는 신중. BPMN 영향 코드 review 필수 |
| **R-multi-13** | `process.getProperty("tx")` 가 `<camunda:property name="tx">` 만 인식. namespace prefix 다르면 인식 X | BPMN 작성 실수 | usage-guide 에 정확한 syntax + 검증 도구 (Phase 8) |
| **R-multi-14** | `commitTx` property 의 정확한 의미 | **해소 (Phase 0)** — "예외 시에도 commit 할 TxMgr 명단" (always-commit list). 미명시 → 모든 TxMgr rollback. §5-5 사례 정확. |
| **R-multi-15** | JavaServiceTask 가 task 레벨 ds/tx 미지원 → BPMN 안 ServiceTask 에 ds/tx 명시해도 무시됨 | 작성자가 의도와 다르게 동작 (warn 없이 default 사용) | (a) usage-guide 에 §5 의 task 종류별 표 명시 (b) JavaServiceTask 에 ds/tx 명시되어 있으면 부팅 시 WARN 로그 (Phase 8 정적 lint) (c) JavaServiceTask multi-tx 는 §5-4 패턴 (D) 처럼 `@Transactional("txXxx")` 사용 |
| **R-multi-16** | MyBatis 다중 DS 미지원 — cactus 의 `MyBatisSqlRunner` 가 primary DS 의 SqlSession 만 사용 | JavaServiceTask 가 호출하는 Service 가 MyBatis Mapper 사용 시 항상 primary DB | (a) JavaServiceTask 가 MyBatis 호출 시 multi-DB 불가능 명문화 (b) 향후 `MyBatisSqlRunner` 가 ds property 기반 동적 SqlSession 선택 (별도 RFC) (c) 임시: secondary DB 호출은 SqlScriptTask 로 |
| **R-multi-17** | `commitAll()` 의 부분 commit 실패 시 throw 안 함 — log.error 만 출력 → ServiceResult SUCCESS 로 반환됨 | 운영자가 log 모니터링 안 하면 부분 commit 발견 어려움 (1PC 모드의 핵심 운영 위험) | (a) docs §5-5 / §10 에 명문화 (b) cactus 가 commitAll 결과를 capture 해서 ServiceResult 에 partial-commit 메타 추가 (1.0.22 검토) (c) Hub 모니터링 알람 (log.error 발생 시 PagerDuty 등) |
| **R-multi-18** | Spring Boot 4 `DataSourceAutoConfiguration` 의 `@ConditionalOnMissingBean(DataSource.class)` — `CactusMultiDataSourceAutoConfiguration` 이 먼저 extras DS 빈 등록하면 primary DS 가 자동 생성 안 됨 | spring.datasource.* 설정이 무시되고 부팅 실패 또는 의도 외 동작 | `@AutoConfiguration(after = DataSourceAutoConfiguration.class)` 가드 명시 + 통합 테스트 |
| **R-multi-19** | `PropertyContainer.add()` 가 IllegalStateException throw — `hasProperty` 검사 빠뜨리면 부팅 실패 | wrapper 동작 실패 | `DefaultTxInjectingServiceProvider` 코드에 `hasProperty` 가드 명시. 단위 테스트 |
| **R-multi-20** | BPMN 의 `<camunda:property name="tx" value=""/>` (빈 문자열 명시) 시 `hasProperty` 는 true → cactus 가 inject 안 함 → SpringTransactionHandler 가 split 결과 `[""]` 로 부분집합 검사 실패 → 런타임 에러 | 작성자 실수 → 런타임 에러 | wrapper 가 `getProperty("tx")` 의 value 가 null/blank 인 경우도 inject 대상으로 처리 |
| **R-multi-21** | `DefaultTxInjectingServiceProvider` 의 race condition (두 thread 가 같은 PropertyContainer 인스턴스 mutate) | 이론상 IllegalStateException ("[tx] is a duplicate attribute") | **해소 (Phase 0 옵션 b 검증)** — 두 모드 모두 race window 0: ① oasis 디폴트 (R-multi-22 미동작) — 매 호출마다 새 Process. ② cactus 1.0.21 (`CactusCachingServiceProvider`) — cache hit 시 mutate 없음, miss 시 각자 새 인스턴스에 add. |
| **R-multi-22** | oasis-core 5.1.0 의 `CachingServiceProvider.service()` 가 `cacheService.cache()` 호출 누락 → 캐시 사실상 미동작 | 매 OASIS 호출마다 BPMN 새로 파싱 → 운영 성능 영향 | **1.0.21 동시 처리 (옵션 α)** — `CactusCachingServiceProvider` 신규로 oasis 디폴트 대체. cache.getObject 후 miss 시 underlying 호출 + 결과 명시 cache.cache() 저장 + ConcurrentHashMap 또는 lock 기반 thread-safe |
| **R-multi-23** | `DefaultTxInjectingServiceProvider` 가 mutable Process 를 inject 후 cache 한다는 사실 → 향후 oasis-core 가 `Service.process()` 의 contract 를 "immutable view" 로 바꾸면 add() 가 throw / silent ignore | oasis-core 5.x → 6.x 업그레이드 시 inject 동작 깨질 수 있음 | (a) oasis-core 의존 버전을 명시 lock (5.1.0). (b) 업그레이드 시 PropertyContainer.add() 동작 재검증 + 본 문서 §14 부록 A 의 검증 명령으로 mutate 가능성 재확인. (c) 깨질 경우 대안: ServiceProvider 가 Service 자체를 새로 wrap 한 인스턴스로 교체 (immutable copy 생성) |
| **R-multi-24** | oasis-core 의 `DataSourceExtractorFromTransactionManager` 가 `JpaTransactionManager` + `DataSourceTransactionManager` 만 지원. 다른 TxMgr (예: `JtaTransactionManager`, `HibernateTransactionManager`) 사용 시 `IllegalArgumentException("Unsupported transaction manager")` | 향후 2PC (XA/Atomikos) 도입 시 SqlScriptTask 사용 못함 | 2PC 별도 RFC 시 oasis-core 측 PR 또는 cactus 가 자체 추출 로직 wrap |
| **R-multi-25** | 옵션 δ — 같은 빈 (예: transactionManager) 에 두 alias (txBiz/txCmn) 매핑 시 BPMN 의 비대칭 commit/rollback (`commitTx`) 동작 | **검증 완료** (Phase 0-C). oasis-core 의 `startTransaction(name)` 이 `PROPAGATION_REQUIRED` 로 같은 빈 두 번째 호출을 join (status2.isNewTransaction=FALSE) → 사실상 단일 트랜잭션. **정상 commit / 일반 rollback 은 안전.** 단 `commitTx="txCmn"` 같은 비대칭 의도는 깨짐 — 같은 트랜잭션이라 한 쪽만 살릴 수 없음. **완화**: (a) docs 가이드 — "같은 빈 alias 매핑 시 BPMN 의 commitTx 명시 금지 (또는 무의미)" (b) `CactusTxConfigValidator` 가 boot 시 warn 로그 — "txBiz/txCmn 이 같은 빈에 매핑됨 → 비대칭 commit/rollback 불가" (c) Phase 8 정적 lint 로 BPMN 의 commitTx ↔ yml alias 일치 검증 |
| **R-multi-26** | 옵션 δ — 모듈 간 biz/cmn/if 명칭 의미 불일치 가능성 (한 모듈이 cmn 을 "공통" 으로 쓰고 다른 모듈이 다른 의미 사용 시) → 표준 BPMN 이식 시 wrong DS | 신규 모듈 작성자가 컨벤션 위반 시 발견 어려움 | (a) §3-0 표준 컨벤션 문서로 강제 (b) code review 점검 (c) Phase 8 정적 lint 로 BPMN ↔ yml ↔ 표준 매핑 검증 |
| **R-multi-27** | 옵션 δ — 표준 3개 명시 의무가 신규 모듈 작성자 부담 (특히 cmn/if 사용 안 하는 단순 모듈) | 부팅 fail 빈도 증가 — 작성자 친화도 ↓ | (a) 명확한 에러 메시지 ("biz alias 매핑으로 명시 가능") (b) 1.0.21 release 시 모듈 마이그레이션 가이드에 boilerplate 예시 (c) 향후 cactus 가 self-documenting yml template 제공 (Phase 별도) |
| **R-multi-28** | Phase 0-D — yml extras key 가 다음과 충돌 시 Spring `BeanDefinitionRegistry.registerAlias` 가 silent overwrite 또는 `IllegalStateException`: (a) primary-alias 의 값과 같음 (예: extras.biz + primary-alias=biz), (b) Spring Boot 표준 빈 이름과 같음 (예: extras.dataSource), (c) cactus 자체 빈 이름과 같음 (예: extras.cactusDataSourceX) | 부팅 silent overwrite 또는 fail | `CactusTxConfigValidator` 에 사전 검증 추가: extras keys ∩ {primary-alias, dataSource, transactionManager, entityManagerFactory, "cactus*"} 가 비어있지 않으면 fail-fast. 명확한 에러 메시지로 의도 안내 |

---

## 11. 단계별 작업 (Phase)

### Phase 0 — 추가 oasis-core 검증 (**완료 — 2026-05-14**)

#### Phase 0-A — 초기 디스어셈블 (트랜잭션 라이프사이클 + Task executable)

- [x] `SpringTransactionHandler.commitAll()` 본문 디스어셈블 — LIFO 순서, 부분 실패 시 throw 안 함 (log.error 만), R-multi-7 해소 + R-multi-17 신설
- [x] `SpringTransactionHandler.rollbackAll()` 본문 디스어셈블 — `shouldCommit(name, alwaysCommit)` 로 commit 여부 결정, 미명시 시 모든 rollback
- [x] `CoreServiceStarter.getUserTransactionManagerNames()` / `getAlwaysCommitTransactionManagerNames()` 본문 디스어셈블 — `String.split(",") + String::trim` (공백 허용), R-multi-14 해소
- [x] `PlainJavaServiceTaskExecutable` / `NamedObjectJavaServiceTaskExecutable` / `WowJavaServiceTaskExecutable` 의 `acceptablePropertyNames` + `execute()` 본문 — JavaServiceTask 모든 variant 가 ds/tx 무시 확정, R-multi-15 신설
- [x] `JavaServiceTaskExecutable` 본문 — classname `#` 분리 후 PlainJavaServiceTaskExecutable 위임 패턴 확인
- [x] `CamundaJavaServiceTaskBuilder.buildTask()` 본문 — properties 를 PropertyContainer 에 담아 전달 (executable 단계에서 무시)
- [x] 공식 oasis-core 테스트 BPMN (`workspace-oasis/oasis/oasis-core/src/test/resources/task/SqlScriptTaskTest/sqlScriptTask.bpmn`) syntax 확인 — `<camunda:property name="ds" value="dataSource2"/>` 형식 확정

#### Phase 0-B — 옵션 b 추가 검증 (PropertyContainer mutability + Caching 동작 + film 패턴)

- [x] `PropertyContainer.add(Property)` mutate 가능 (Map 기반, 중복 시 IllegalStateException). `Property(String, String)` public ctor. `Element.properties()` + `Process extends Element` 로 PropertyContainer 직접 접근 가능. `PropertyNames.TRANSACTION_MANAGER_NAME = "tx"` 등 표준 상수 노출. → **방법 C (DefaultTxInjectingServiceProvider) 100% 구현 가능**
- [x] **CachingServiceProvider 미동작 발견** — `CachingServiceProvider.service()` 본문에 `cacheService.cache(serviceId, result)` 호출이 없음. miss 시 underlying 호출 후 그대로 return → 캐시 영원히 비어있음. R-multi-22 신설 + 1.0.21 동시 처리 (옵션 α). 부수 효과로 R-multi-21 race condition 자동 해소 (매 호출마다 새 Process 인스턴스)
- [x] film/dmes-ref/ksm 의 OasisConfig 모두 비교 — 셋 다 `String[]{"txBiz"}` 1개 또는 NonTransactional. dmes 생태계에서 OASIS 의 multi-tx 활용 사례 0건. film 의 `txFrm`/`txMail` 빈은 `@EnableJpaRepositories(transactionManagerRef)` 설정용으로만 정의됨

#### Phase 0-C — 옵션 δ 후속 검증 (같은 빈 두 alias 동작, R-multi-25)

- [x] `SpringTransactionHandler.startTransaction(name)` 본문 디스어셈블 — `PROPAGATION_REQUIRED + READ_COMMITTED` + warehouse 이름 단위 분리 + 같은 이름 진행 중 시 skip 확인
- [x] R-multi-25 시나리오 분석:
  - **정상 commit**: status2 (isNewTransaction=FALSE, join) → status1 (isNewTransaction=TRUE, 실제 commit) → 데이터 정합 ✅
  - **일반 rollback**: 같은 패턴, rollback-only 마킹 → 실제 rollback ✅
  - **비대칭 commit/rollback (`commitTx="txCmn"`)**: 같은 트랜잭션이라 한 쪽만 살리기 불가능 → **의도 깨짐 ❌**
- [x] 결론: 일반 commit/rollback 은 안전. 비대칭 (commitTx) 만 위험 → R-multi-25 갱신, Validator warn 로그 + docs 가이드로 완화

#### Phase 0-D — 사용성 검증 (BPMN ds property 빈 lookup)

- [x] `SpringApplicationContext.get(String name)` 본문 디스어셈블 — 결과: Spring 의 `ApplicationContext.getBean(name)` 직접 위임. **Spring alias 인식 가능 확정**
- [x] `SqlScriptTaskExecutable.execute()` 가 `ExecutableContext.get(name)` (= SpringApplicationContext) 으로 ds/tx 빈 lookup. 즉 BPMN 의 `ds="..."` value 가 정확한 빈 이름 또는 alias 여야 함
- [x] 현재 설계 문제 발견: yml extras key (`if`) 와 빈 이름 (`cactusDataSourceIf`) 불일치 → BPMN 작성자가 PascalCase 빈 이름 외워야 함
- [x] **해결**: `CactusMultiDataSourceAutoConfiguration` 의 빈 등록 시 yml key 그대로 alias 추가 (`registry.registerAlias(beanName, name)`). BPMN `ds="if"` 동작 보장

### Phase 1 — Properties 신규 (cactus-core) ✅ 완료

- [x] `CactusTxProperties` 신규 (`cactus.tx.managers`, `cactus.tx.default`)
- [x] `CactusDataSourceProperties` 의 `secondary` 필드 제거 + `extras: Map<String, DataSourceProps>` 신규
- [x] `CactusJpaProperties` 의 `secondary` 필드 제거 + `extras: Map<String, JpaProps>` 신규
- [x] 컴파일 검증

### Phase 2 — DataSource 다중화 (cactus-core) ✅ 완료 (단 Secondary 는 deprecated 유지)

- [ ] `CactusSecondaryDataSourceAutoConfiguration` 삭제 ← deprecated 유지 (1.0.22 호환 모드, 1.0.23 삭제 예정)
- [x] `CactusMultiDataSourceAutoConfiguration` 신규 — extras 의 각 entry 마다 `cactusDataSource{Name}` 빈 등록
- [x] `@ConditionalOnSingleCandidate` 가드로 Spring Boot `DataSourceAutoConfiguration` 와 충돌 회피
- [x] AutoConfiguration.imports 갱신

### Phase 3 — JPA 다중화 (cactus-core) ✅ 완료 (단 Secondary 는 deprecated 유지)

- [ ] `CactusSecondaryJpaAutoConfiguration` 삭제 ← deprecated 유지 (1.0.22 호환 모드, 1.0.23 삭제 예정)
- [x] `CactusMultiJpaAutoConfiguration` 신규 — extras 의 각 entry 마다 EMF + JpaTxMgr 빈 등록 (`cactusEntityManagerFactory{Name}`, `cactusTransactionManager{Name}`)
- [x] snake-naming 자동 적용 (옵션 그대로)
- [x] AutoConfiguration.imports 갱신

### Phase 4 — TxMgr alias + Validator + ServiceProvider Wrapper (cactus-core) ✅ 완료

- [x] `CactusMultiTransactionManagerAutoConfiguration` 신규 — `cactus.tx.managers` 의 각 entry 마다 alias 빈 등록 (`txBiz` = primary EMF 의 JpaTxMgr alias 등)
- [x] `cactus.tx.default` 의 TxMgr 에 `@Primary` 명시 등록 (R-multi-8)
- [x] `CactusTxConfigValidator` 신규 — fail-fast 검증 (§7 의 4가지 조건)
- [x] **`DefaultTxInjectingServiceProvider` 신규** (oasis 패키지) — BPMN load 시 `tx=<default>` 자동 inject (방법 C, R-multi-11 해소)
- [x] **`CactusCachingServiceProvider` 신규** (oasis 패키지) — oasis 디폴트 캐시 미동작 대체 (R-multi-22 해소). cache.cache() 명시 호출 + thread-safe (ConcurrentHashMap 또는 synchronized)
- [x] AutoConfiguration.imports 갱신

### Phase 5 — Oasis Wiring (cactus-core) ✅ 완료

- [x] `OasisProperties.transactionManagerName` 필드 + setter/getter 삭제 (결정 6B)
- [x] `OasisAutoConfiguration#serviceStarter` 수정:
  - `cactus.tx.managers.keySet()` 을 `SpringServiceStarterFactory(ctx, String[])` 에 전달
  - ServiceProvider 빈 그래프: `CactusCachingServiceProvider(DefaultTxInjectingServiceProvider(SimpleServiceProvider(path, "bpmn", "^^"), default), cache)` 명시 등록
  - transactional=true 인데 managers 비어있으면 fail-fast (또는 Validator 가 사전에 차단)
- [x] 부팅 로그 메시지 갱신 (`[Cactus Oasis] managers: [txBiz, txCmn, txIF], default=txBiz, cache=CactusCachingServiceProvider, inject=DefaultTxInjectingServiceProvider`)

### Phase 6 — mcm 마이그레이션 ✅ 대부분 완료 (일부 운영 검증 항목 보류)

- [x] **사전: mcm 코드의 cactusSecondary* 빈 이름 참조 grep** — 사용처 식별 (R-multi-9)
- [x] `mcm/api/application.yml`:
  - `cactus.oasis.transaction-manager-name` 삭제
  - **`cactus.datasource.primary-alias: biz` 추가** (옵션 β — Spring Boot dataSource 빈에 'biz' alias)
  - **표준 3개 cactus.tx.managers 모두 명시 (옵션 δ)**:
    - `txBiz: { data-source: biz }`
    - `txCmn: { data-source: biz }` ← mcm 은 cmn 안 씀, biz alias 매핑 (yml 에 의도 명시)
    - `txIF:  { data-source: if }`
  - `cactus.tx.default: txBiz` 추가
  - 기존 `cactus.jpa.secondary.*` → mcm 자체 결정 (cmn 으로 통합 또는 모듈 자체 extras key 로 rename)
- [x] `mcm/api/application-local.yml` / `application-mssql.yml` 등 환경별:
  - **`cactus.datasource.extras.if.*` 추가** (각 환경의 인터페이스 DB)
  - `cactus.datasource.secondary.*` 삭제 + 모듈 자체 결정으로 적절한 extras key 로 이전
- [x] mcm 코드의 `cactusSecondary*` 빈 이름 참조 갱신 (모듈 결정한 새 이름으로)
- [x] mcm bootRun 검증:
  - [x] `[Cactus Oasis] managers: [txBiz, txCmn, txIF], default=txBiz, cache=CactusCachingServiceProvider, inject=DefaultTxInjectingServiceProvider` 로그 확인 (3개 모두)
  - [x] secUser/secFavorite 호출 정상 응답 확인 (Tier 2 미명시 process — txBiz 1개만 begin)
  - [ ] **캐시 효과 검증** (R-multi-22): 같은 BPMN 호출 2회 시 두 번째가 BPMN 파싱 skip 확인 (DEBUG 로그 또는 응답 시간) ← 운영 검증 항목, 보류
  - [x] **inject 효과 검증** (R-multi-11): 부팅 직후 connection pool 모니터링 — secUser 호출 시 default(txBiz) connection 만 잡히고 if(SERAIUSER) connection 은 안 잡힘 확인 (Phase 2 + pilotDefaultTx 검증)
  - [ ] **txCmn = biz alias 검증 (옵션 δ, R-multi-25)**: mcm 의 BPMN 에 `tx="txCmn"` 명시한 호출이 정상 동작 (biz DB 사용) — yml 의 cmn=biz 매핑이 의도대로 적용되는지 ← 운영 검증 항목, 보류
  - [x] **txIF 동작 검증**: SERAI 인터페이스 호출 시나리오 BPMN (또는 시연 BPMN) 작성 → `tx="txBiz,txIF"` 명시 process 호출 → 두 connection 모두 begin/commit 로그 확인 + IF_* 테이블에 데이터 INSERT 확인 (Phase 7 pilot + Phase 2 mapper 검증 완료)
  - [ ] **R-multi-25 검증**: 같은 빈 두 alias (txBiz/txCmn 둘 다 transactionManager) 에 BPMN `tx="txBiz,txCmn"` 명시 시 oasis-core 동작 확인 — 동일 트랜잭션으로 join? 또는 별개 두 begin? ← 운영 검증 항목, 보류
  - [ ] **부분 commit 모니터링 setup** (R-multi-17): `org.springframework.transaction` 또는 `com.dongkuk.oasis.transaction` 의 ERROR 레벨 알람 셋업 ← 운영 항목, 보류

### Phase 7 — multi-tx 시나리오 파일럿 (cmn 별도 DS 도입 시)

- [ ] **mpn/mpp/mqc 또는 신규 모듈** — cmn 을 별도 DS 로 분리한 환경 구성
  - mcm 처럼 `txCmn: { data-source: biz }` 가 아니라 `txCmn: { data-source: cmn }` 으로 명시
  - cactus.datasource.extras.cmn 에 별도 url
- [ ] 표준 BPMN 작성 (예: 공통 코드 조회) — `tx="txCmn"` 명시 + SqlScriptTask 가 cmn DB 호출
- [ ] mcm (cmn=biz alias) 과 다른 모듈 (cmn=cmn 별도 DS) 양쪽에서 같은 BPMN 호출 검증 — 표준 BPMN 이식성 확인
- [ ] R-multi-25 검증: 같은 빈 두 alias 매핑 환경에서 BPMN `tx="txBiz,txCmn"` 동작 (mcm 기준)
- [ ] R-multi-26 검증: 모듈 간 cmn 의 의미 일관성 (모두 같은 DB schema 가정)

### Phase 8 — 정적 검증 도구 (별도, ROI 낮으면 보류)

- [ ] BPMN parser + Tier 1 화이트리스트 대조 도구 (Gradle task)
- [ ] `@Transactional` ↔ BPMN tx 매칭 검사

### Phase 9 — 릴리스 ✅ 완료 (1.0.22-SNAPSHOT 까지 진행)

- [x] `cactus-core/build.gradle` version `1.0.20-SNAPSHOT` → `1.0.21-SNAPSHOT` → 현재 `1.0.22-SNAPSHOT`
- [ ] CHANGELOG 1.0.21-SNAPSHOT 항목 신설 (변경/근거/마이그레이션 가이드) ← CHANGELOG.md 갱신 보류 (1.0.22 항목 같이 추가 필요)
- [x] `docs/cactus/usage-guide.md` 갱신 — 다음 섹션 모두:
  - [x] 헤더 "1.0.20+" → "1.0.21+" → 현재 "1.0.22+"
  - [x] §1 의존성 — cactus-core 버전 1.0.21-SNAPSHOT → 현재 1.0.22 transitive
  - [x] §3-2 cactus.* 키 — `cactus.tx.managers` + `cactus.tx.default` + `cactus.datasource.extras` + `cactus.jpa.extras` + `cactus.oasis.cache.size` 추가, `cactus.oasis.transaction-manager-name` 제거 (결정 6B)
  - [x] §4 활성 모드 매트릭스 — multi-tx 시나리오 추가
  - [x] §5 자주 묻는 시나리오 — multi-tx 추가, JavaServiceTask multi-tx 의 @Transactional 패턴 + 1.0.22 의 P3 mapper 패턴 추가
  - [x] §6 SQLite 로컬 환경 — multi-tx 시 영향 (영향 없음 명시)
  - [x] §8 마이그레이션 절차 — `secondary.*` 키 → `extras.*` 변환 가이드
- [ ] nexus snapshots 배포 — 영향 받는 환경: ← 운영 단계, 보류
  - **현 환경 (개발자 로컬)**: includeBuild 라 항상 로컬 cactus-core 우선 → nexus 배포와 무관하게 동작. 단 **nexus 와 로컬이 같은 1.0.21-SNAPSHOT 인데 내용이 다른 시점이 생기지 않도록** 가급적 코드 안정 후 배포.
  - **협업 개발자**: nexus 에서 1.0.21-SNAPSHOT pull → 본 변경사항 자동 반영. mcm yml 도 동시 업데이트 (Phase 6 참고) 필요.
  - **CI 빌드**: 사내 nexus 의존이라 nexus 배포 후 CI 도 자동 1.0.21 사용. CI 가 mcm yml 미갱신 상태면 부팅 실패 → 동시 commit 강제.
  - **운영 배포 환경**: 운영 jar 가 어느 cactus-core 버전 lock 하는지 확인 후 별도 운영 마이그레이션 plan (본 작업 범위 외).

---

## 12. 마이그레이션 체크리스트 (mcm 1개 모듈)

cactus-core 1.0.20 → 1.0.21 도입 시:

```
[ ] mcm/api/build.gradle: cactus-core 1.0.20-SNAPSHOT → 1.0.21-SNAPSHOT
[ ] mcm/api/src/main/resources/application.yml:
    [ ] cactus.oasis.transaction-manager-name 삭제
    [ ] cactus.datasource.primary-alias: biz 추가  ← 옵션 β: Spring Boot dataSource 빈에 'biz' alias
    [ ] cactus.tx.managers.txBiz: { data-source: biz } 추가
    [ ] cactus.tx.managers.txCmn: { data-source: biz } 추가  ← 옵션 δ: mcm 은 cmn 안 씀, biz alias 매핑
    [ ] cactus.tx.managers.txIF:  { data-source: if } 추가   ← SERAI 인터페이스 DB 호출용
    [ ] cactus.tx.default: txBiz 추가
    [ ] (모듈 자체 결정) 기존 cactus.jpa.secondary.* 키를 적절한 extras key 로 이전
[ ] mcm/api/src/main/resources/application-local.yml / application-mssql.yml:
    [ ] cactus.datasource.extras.if.* 추가 (인터페이스 DB)
    [ ] cactus.datasource.secondary.* 폐기 + 모듈 자체 결정 새 extras key 로 이전
[ ] grep "cactusSecondary*" 으로 빈 이름 참조 식별 + 새 빈 이름으로 갱신
[ ] mcm bootRun
    [ ] [Cactus Oasis] managers: [txBiz, txCmn, txIF] 로그 확인 (옵션 δ — 표준 3개 모두)
    [ ] secUser 호출 → 정상 응답 (Tier 2 미명시 process — txBiz 1개만 begin)
    [ ] secFavorite 호출 → 정상 응답
[ ] (필수) txIF 시나리오 검증 — 본 작업의 핵심 multi-tx 사용처:
    [ ] mcm 의 SERAI 인터페이스 송신 BPMN 1개 작성 (예: seraiInterfaceSend)
        - process 에 tx="txBiz,txIF" 명시
        - JavaServiceTask 1개 (mcm DB 송신 이력 기록)
        - SqlScriptTask 1개 (tx="txIF", IF_INTERFACE 테이블 INSERT)
    [ ] process 시작 시 txBiz + txIF 만 begin (txCmn 은 Tier 2 명시 외라 begin 안 됨)
    [ ] "Transaction [txBiz] started" + "Transaction [txIF] started" 둘 다 출력 확인
    [ ] 정상 종료 시 두 commit 모두 출력 (LIFO: txIF → txBiz)
    [ ] mcm DB 의 송신 이력 + SERAIUSER DB 의 IF_INTERFACE 양쪽 INSERT 확인
    [ ] 예외 발생 시 두 rollback 모두 확인 (commitTx 미명시 시)
[ ] (옵션) cmn 시나리오 시연 (mcm 은 cmn=biz alias 매핑 채택):
    [ ] application.yml 에 cactus.tx.managers.txCmn: { data-source: biz } 추가
        ※ mcm 은 별도 cmn DS 안 씀 — biz 와 같이 매핑 (옵션 δ 의 자유 매핑)
    [ ] 표준 BPMN 1개 작성 (예: 공통 코드 조회) — process 에 tx="txCmn" 명시
    [ ] 호출 시 정상 동작 확인 (biz DB 의 동일 테이블에서 조회됨 — yml 의 cmn=biz 매핑이 의도)
    [ ] 향후 mcm 이 별도 cmn DS 도입 시 yml 한 줄만 변경 (cactus.datasource.extras.cmn.* 추가 + data-source: cmn 으로 override)
```

---

## 13. 향후 확장 여지

- **Read replica 라우팅** — 같은 DB 의 master/replica 분리 시 `cactus.tx.routes` 키로 read-only TxMgr 별도 정의
- **2PC 도입** — `cactus.tx.atomikos.enabled=true` 같은 키로 XA DataSource swap-in (별도 RFC)
- **BPMN propagation 지원** — task 단위 `propagation=REQUIRES_NEW` 같은 속성 (oasis-core `commitAndRestartTransaction` 활용)
- **정적 검증 도구** — Phase 8 의 BPMN ↔ Service `@Transactional` 매칭 도구
- **MyBatis 다중 DS** — `MyBatisSqlRunner` 가 ds property 기반으로 SqlSession 동적 선택 (자세한 내용 R-multi-16 참조)

---

## 14. 부록 A — oasis-core 5.1.0 디스어셈블 검증 출처

| 검증 항목 | 클래스 / 메서드 | 결과 |
|---|---|---|
| TxMgr 화이트리스트 강제 | `SpringTransactionHandler.execute` 의 `ArrayUtil.isLeftSubsetOfRight` 호출 | 사실 ✅ |
| 미명시 시 모든 TxMgr begin | `SpringTransactionHandler.execute` 의 `else if (transactionManagerNames != null && !parallelActive)` 분기 | 사실 ✅ |
| Tier 2 BPMN tx 추출 | `CoreServiceStarter.getUserTransactionManagerNames(process)` = `process.getProperty("tx")` + `String.split(",") + String::trim` | 사실 ✅ |
| Tier 2 commitTx 추출 | `CoreServiceStarter.getAlwaysCommitTransactionManagerNames(process)` = `process.getProperty("commitTx")` + `String.split(",") + String::trim`. **미명시 → null** | 사실 ✅ (Phase 0 검증 완료) |
| commitTx 의미 | `SpringTransactionHandler.rollbackAll(alwaysCommitNames)` 가 `shouldCommit(name, alwaysCommitNames)` 로 분기 — true 면 commit, false 면 rollback | 사실 ✅ (Phase 0 검증 완료) |
| commitAll 동작 | `SpringTransactionHandler.commitAll()` — `Collections.reverse()` (LIFO), 부분 실패 시 `Map<String,Throwable> failures` 에 누적 후 log.error 만, throw 안 함 | 사실 ✅ (Phase 0 검증 완료) |
| Tier 3 ds/tx 인식 (Script) | `SqlScriptTaskExecutable.acceptablePropertyNames = [input, ds, tx, output]` | 사실 ✅ |
| Tier 3 ds/tx 무시 (Java) | `PlainJavaServiceTaskExecutable.acceptablePropertyNames = [input, method, output, new, inputOnly, object, dto, opt]` — ds/tx 없음. `execute()` 본문도 ds/tx `getProperty` 호출 없음 | 사실 ✅ (Phase 0 검증 완료) |
| Java variant 위임 | `JavaServiceTaskExecutable` ctor — classname `#` 분리 후 Wow 인터페이스면 WowJavaServiceTaskExecutable, 아니면 PlainJavaServiceTaskExecutable 위임 | 사실 ✅ (Phase 0 검증 완료) |
| Tier 3 default DS | `SqlScriptTaskExecutable` 의 `DefaultDataSourceResolver.defaultDataSource()` 호출 | 사실 ✅ |
| TxMgr → DS 자동 추출 | `DataSourceExtractorFromTransactionManager.getDataSource(tx, ds)` | 사실 ✅ |
| 공식 BPMN syntax | `oasis-core/src/test/resources/.../sqlScriptTask.bpmn` 의 `<camunda:property name="ds" value="dataSource2"/>` | 사실 ✅ |
| **PropertyContainer mutability** | `PropertyContainer.add(Property)` 본문 = `properties` (Map) 에 `containsKey` 검사 후 put. 중복 시 `IllegalStateException("[%s] is a duplicate attribute")` | mutable ✅ (Phase 0 옵션 b) |
| **Property public ctor** | `public Property(String name, String value)` 노출 | 사실 ✅ (Phase 0 옵션 b) |
| **Process.properties() 접근** | `Element` 인터페이스가 `properties()` 노출 + `Process extends Element` + `DefaultProcess.properties()` 명시 | 사실 ✅ (Phase 0 옵션 b) |
| **PropertyNames 표준 상수** | `TRANSACTION_MANAGER_NAME = "tx"`, `ALWAYS_COMMIT_TRANSACTION_MANAGER_NAME = "commitTx"`, `DATA_SOURCE = "ds"`, `INPUT_KEY`, `OUTPUT_KEY`, `INPUT_KEY_ONLY` 등 | 사실 ✅ (Phase 0 옵션 b) |
| **CachingServiceProvider 미동작** | `service()` 본문 (bytecode L0~L30) 에 `cacheService.cache(...)` 호출 0회. miss 시 `serviceProvider.service(serviceId)` → `areturn` 만 | **버그/누락 ✅** (Phase 0 옵션 b) — R-multi-22 |
| **SizeBaseCacheService thread-safety** | `getObject(K)`: `lock` synchronized block 으로 LRU list 갱신 후 `data.get(key)` (lock 밖). `cache(K,V)` / `evict()`: `synchronized` 메서드 | thread-safe ✅ (단 cache.cache 호출 안 되니 의미 없음) |
| **dmes-fwk 의 OASIS multi-tx 활용도** | film/dmes-ref/ksm 모든 OasisConfig 가 `String[]{"txBiz"}` 또는 NonTransactional. film 의 `@Transactional` production 사용 0건 (test 만 15건, 모두 `@Transactional("txBiz")` 단일) | dmes 생태계 multi-tx OASIS 활용 0건 ✅ (Phase 0 옵션 b) |

### 검증 재현 명령

```bash
JAR_PATH="$HOME/.gradle/caches/modules-2/files-2.1/com.dongkuk/oasis-core/5.1.0/*/oasis-core-5.1.0.jar"
API_JAR="$HOME/.gradle/caches/modules-2/files-2.1/com.dongkuk/oasis-core-api/5.1.0/*/oasis-core-api-5.1.0.jar"

# 클래스 추출 + javap 디스어셈블 예시
mkdir -p /tmp/oasis-extract && cd /tmp/oasis-extract
"$JAVA_HOME/bin/jar.exe" xf $JAR_PATH com/dongkuk/oasis/transaction/SpringTransactionHandler.class
"$JAVA_HOME/bin/javap.exe" -p -c com/dongkuk/oasis/transaction/SpringTransactionHandler.class
```

## 15. 부록 B — film 패턴 비교

| 항목 | film | cactus 1.0.21 (본 설계) |
|---|---|---|
| TxMgr 빈 정의 | 3개 (`txBiz`/`txFrm`/`txMail`) — 코드로 직접 | N개 — yml 선언적 |
| OasisConfig Tier 1 등록 | `new String[]{"txBiz"}` 1개만 | `cactus.tx.managers.keySet()` 모두 |
| Tier 2 미명시 process 동작 | ctor 에 1개만 등록해 자동 default 1개 begin (분기 ④의 부수 효과) | `DefaultTxInjectingServiceProvider` 가 default 1개 inject → 분기 ③ 진입 |
| Tier 2 명시 시 multi-tx 사용 | ❌ 거부 (화이트리스트 1개라 부분집합 검사 실패) | ✅ 명시한 TxMgr 들만 begin |
| BPMN 안 multi-tx 사용 사례 | 0건 (검증됨) — 구조적으로 불가능 | 활용 가능 |
| DataSource ↔ TxMgr 매핑 | 코드 (`BizDataAccessConfig.txBiz`) | yml (`cactus.tx.managers.txBiz.data-source: biz` — primary-alias 의 값) |
| 신규 TxMgr 추가 비용 | 새 `@Configuration` 클래스 + 빈 4종 정의 | yml 3-4줄 |
| BPMN 파싱 캐시 효과 | 0 (oasis CachingServiceProvider 미동작) | ✅ `CactusCachingServiceProvider` 가 cache.cache() 명시 호출로 정상 |
| `@Transactional` production 사용 | 0건 (test 코드 15건만, 모두 `txBiz` 단일) | 패턴 (D) 로 multi-tx 활용 가능 |

→ film 의 *의도된* multi-tx 설계가 oasis-core 5.1.0 의 분기 ④ 한계 (Tier 2 미명시 = 모두 begin) 때문에 단일 모드로 갇혔던 것을, cactus 1.0.21 이 `DefaultTxInjectingServiceProvider` 로 우회 → film 의 default 1개 안전성 + multi-tx 명시 가능성 동시 달성. 추가로 oasis 의 캐시 미동작 (R-multi-22) 도 `CactusCachingServiceProvider` 로 해소.

---

## 16. 결정 변경 이력

| 일자 | 변경 | 근거 |
|---|---|---|
| 2026-05-14 | 결정 1~7 확정 | 사용자 검토 |
| 2026-05-14 | Phase 0 검증 완료 + 문서 정정 | jar 디스어셈블 결과: R-multi-7/14 해소, R-multi-15(JavaServiceTask Tier 3 미지원)/16(MyBatis 다중 DS 미지원)/17(commitAll 부분 실패 silent)/18(SBoot4 DataSourceAutoConfig 충돌) 신설. §5 BPMN 패턴 (B)/(C) → SqlScriptTask 위주로 재작성 + 패턴 (D) JavaServiceTask multi-tx (`@Transactional` 명시) 신설. §7 fail-fast 시점 `ApplicationReadyEvent` 로 정정. 부록 A 검증 출처 + 재현 명령 추가. |
| 2026-05-14 | **Phase 0-B 추가 검증 (옵션 b)** | 사용자 검토 후 추가 검증 요청 (race condition + Caching 동작). 결과: `PropertyContainer.add(Property)` mutate 가능 + `Property` public ctor + `PropertyNames` 표준 상수 노출 → 방법 C 구현 가능 확정. `CachingServiceProvider.service()` 가 `cache.cache()` 호출 누락 발견 (R-multi-22 신설). dmes-fwk 전체 OasisConfig (film/ref/ksm) 스캔 결과 multi-tx OASIS 활용 0건 확인. 부수 효과로 R-multi-21 (race) 자동 해소. |
| 2026-05-14 | **Tier 2 미명시 시 default 1개만 begin** 정책 채택 (옵션 α) | 사용자 요구 — film 도 못 끝낸 패턴. `DefaultTxInjectingServiceProvider` (방법 C) 로 BPMN load 시 default 자동 inject. R-multi-11 (커넥션 풀 압박) 해소. 추가로 oasis 의 `CachingServiceProvider` 미동작 발견 → `CactusCachingServiceProvider` 신규로 동시 처리 (R-multi-22). Phase 4 에 두 wrapper 추가, Phase 5 에 빈 그래프 와이어링 명시. dmes-fwk 전체 OasisConfig 비교 결과 dmes 생태계에서 multi-tx 활용 0건 — cactus 1.0.21 이 처음으로 구현. |
| 2026-05-14 | **옵션 (iii) 검증 후 Critical 4 + Major 7 + Minor 8 + 누락 5 일괄 정정** | ultrathink 검증 결과 — §6 매트릭스 옵션 α 반영 (Case 추가/금지 명확화), §8 변수명 alwaysCommit 정정, R-multi-9 Phase 위치 정정, yml 가독성 개선, §4-2 ServiceProvider 빈 그래프 와이어링 추가, R-multi-23 신설 (Process immutable view 위험), §3-1 cache size yml 키 추가, wrapper sub-package 명시 (`oasis/provider/`), Phase 0 → 0-A/0-B 분리 등 24건. |
| 2026-05-14 | **txExt → txIF rename + SERAI 인터페이스 매핑 결정** | 사용자 결정 — serai 모듈은 cactus 미사용 유지 (자체 듀얼 DS `mst`+`if`). mcm/mpp/mqc 등이 OASIS BPMN 안에서 SERAI 의 SERAIUSER DB (IF_* 테이블) 에 INSERT 하기 위해 `cactus.tx.managers.txIF` 도입. yml extras key 는 `if` (serai 의 spring.datasource.if 와 일관). Phase 6 mcm 마이그레이션 필수 항목으로 txIF 도입 + sendInterface BPMN 시연. 부수: jpa.extras 미정의 케이스 → DataSourceTransactionManager fallback (상세설계 §2-3). |
| 2026-05-14 | **옵션 (β) primary-alias 도입 — primary/secondary magic string cactus 에서 완전 제거** | 사용자 결정 — Spring Boot 의 `dataSource` 빈은 그대로 유지하되 cactus.datasource.primary-alias 로 의미 있는 이름 부여 (예: `biz`). cactus.tx.managers 의 모든 data-source 가 의미 있는 이름으로 통일. magic string `primary` 사라짐. 검증: oasis-core 의 `DataSourceExtractorFromTransactionManager` 가 JpaTxMgr + DataSourceTxMgr 둘 다 지원 확정 (Phase 0-B 후속 디스어셈블). 단 다른 TxMgr (Jta/Hibernate) 는 미지원 → R-multi-24 후보. |
| 2026-05-14 | **dmes 표준 DS 패턴 (biz/cmn/if) 명문화** | 사용자 결정 — biz=모듈 자체 DS, cmn=공통 DS, if=인터페이스 송수신 DS. 모든 cactus 사용 모듈은 본 3개 패턴 채택. §3-0 신규로 표준 컨벤션 박스 추가. caravan/kmc 등 기존 모듈 특수 사정은 본 설계 문서에서 다루지 않음 (모듈 자체 결정). Phase 6 마이그레이션 / §12 체크리스트 / 부팅 로그 모두 단순화. |
| 2026-05-14 | **§6-2 일반 Spring 코드 사용 가이드 신규** | 사용자 요청 — OASIS 외 일반 @Service / @Transactional / @EnableJpaRepositories / @Qualifier 에서 cactus 의 cmn/if 빈 사용하는 4가지 패턴 + OASIS 와의 차이 표 + OASIS 안 쓰는 모듈도 사용 가능 명시. cactus 빈은 모두 일반 Spring 빈이라 표준 방식으로 접근 가능. alias 까지 쓰려면 OASIS 미사용 모듈도 cactus.tx.managers 등록 가능 (의미는 없지만 형식적). |
| 2026-05-14 | **옵션 (δ) 채택 — yml 강제 + DS 매핑 자유** | 사용자 결정 — cactus 사용 모듈은 cactus.tx.managers 에 표준 3개 (txBiz/txCmn/txIF) 명시 의무. 미명시 시 CactusTxConfigValidator fail-fast. 단 DS 매핑은 자유 — 모듈이 cmn 사용 안 하면 `txCmn: { data-source: biz }` 로 alias 매핑 (yml 자체에 의도 명시). mcm 만 cmn 미사용 (cmn=biz alias), mpn/mpp/mqc/신규 모듈은 cmn 별도 DS 사용 예정. 효과: ① 신규 모듈 작성자에게 yml 자체가 self-documenting 표준 ② 표준 BPMN 이식성 (어느 모듈에서나 tx="txCmn" 동작) ③ silent wrong 0 (yml 에 매핑 의도 명시). 신규 위험 R-multi-25 (같은 빈 두 alias 의 oasis-core 동작) / R-multi-26 (모듈 간 명칭 의미 불일치) / R-multi-27 (3개 명시 의무로 작성자 부담 — 명확한 에러 메시지로 완화). §3-0-1 신규 박스, §7 fail-fast 신규 검증, §11 Phase 6 mcm 마이그레이션에 txCmn 명시 추가, §10 R-multi-25/26/27 신설. |
| 2026-05-14 | **정합성 검증 (iii) 24건 일괄 정리** | ultrathink 검증 결과 잔존 표현 정리 — Critical 10 (txExt → txIF, txKmc 제거, kmc 예시 정리, KMC 디테일 일반화), Major 5 (Phase 6 부팅 로그 통일 [txBiz, txCmn, txIF], 양 문서 동기화), Minor 3 (§6-2 사용 예시에 biz alias 패턴 (E) 추가), 누락 4 (R-multi-24/25/26/27 신설, Phase 6 cmn 활용 검증, Phase 7 cmn 시연 시나리오). |
| 2026-05-14 | **R-multi-25 사전 검증 완료 (Phase 0-C)** | oasis-core 의 `SpringTransactionHandler.startTransaction()` 디스어셈블 — `PROPAGATION_REQUIRED + READ_COMMITTED` 사용 확인. **같은 빈 두 alias 매핑 시나리오**: 정상 commit / 일반 rollback 은 안전 (status2 가 status1 의 트랜잭션에 join, 실제 commit/rollback 은 status1 만 실행 → 사실상 단일 트랜잭션). 단 **비대칭 commit/rollback (`commitTx`) 은 의도 깨짐** — 같은 트랜잭션이라 한 쪽만 commit 불가. 완화: (a) docs 가이드 (b) Validator warn 로그 (c) Phase 8 정적 lint. R-multi-25 위험 등급 "미검증" → "**부분 확정 (비대칭만 위험)**" 으로 갱신. |
| 2026-05-14 | **Phase 0-D 사용성 검증 — BPMN `ds` property 빈 alias 등록** | `SpringApplicationContext.get(name)` 디스어셈블 결과: Spring 의 `ApplicationContext.getBean(name)` 위임 → Spring alias 인식 가능. **사용성 문제 발견**: 현재 설계는 BPMN 의 `ds` value 에 PascalCase 빈 이름 (`cactusDataSourceIf`) 만 동작 — yml key (`if`) 와 불일치로 작성자 부담. **해결**: `CactusMultiDataSourceAutoConfiguration` 가 extras 등록 시 yml key 그대로 alias 추가 (`registry.registerAlias("cactusDataSourceIf", "if")`). BPMN 의 `ds="if"` 동작 보장. 1줄 변경으로 작성자 친화성 큰 향상. §5-3 사용성 노트 갱신. |
| 2026-05-14 | **R-multi-28 신설 — alias 충돌 위험** | Phase 0-D alias 등록의 부수 위험 — yml extras key 가 (a) primary-alias 값 (b) Spring Boot 표준 빈 이름 (`dataSource`/`transactionManager`/`entityManagerFactory`) (c) cactus 자체 빈 prefix (`cactus*`) 와 충돌 시 `BeanDefinitionRegistry.registerAlias` 의 silent overwrite 또는 `IllegalStateException` 가능. 완화: `CactusTxConfigValidator` 의 검증 1-quater 신규 — 위 3개 조건 사전 차단 + 명확한 에러 메시지. §7 fail-fast 표 + 상세 §2-4 코드 갱신. |
| 2026-05-14 | **양 문서 정합성 cross-check 마무리** | 잔존 정정 — 상세 §8-2 부팅 로그 `[txBiz, txIF]` → `[txBiz, txCmn, txIF]` (옵션 δ 일관). §3-3 빈 이름 표 예시 `cactusDataSourceKmc` → `cactusDataSourceCmn` (사용자 "kmc 빼라" 일관) + yml key alias 명시. §4-1 카탈로그의 CactusMultiDataSourceAutoConfiguration 책임에 alias 등록 추가. |
