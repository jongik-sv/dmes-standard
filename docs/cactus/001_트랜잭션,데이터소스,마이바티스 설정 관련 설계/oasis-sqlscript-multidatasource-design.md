# OASIS SqlScriptTask + Multi-DataSource 통합 설계 (cactus 1.0.22+)

> 작성: 2026-05-18 / 갱신: 2026-05-19 (Phase B 통합 완료)
> 범위: cactus-core 1.0.21 의 multi-tx 메커니즘에 OASIS `SqlScriptTask` 가 cactus 의 multi-DS
> alias 인식하여 정상 동작하는지 검증 + 미진 부분 (MyBatis mapper id) 설계.
>
> ## ★★★ 2026-05-19 — Phase B 통합 완료 (cactus 1.0.22-SNAPSHOT)
>
> 본 설계의 **Phase B (MultiDsMyBatisSqlRunner)** 가 별도 통합 설계로 흡수·구현되어 **운영 가능 상태**:
> - 정본: [`cactus-mybatis-multi-ds-design.md`](./cactus-mybatis-multi-ds-design.md) (v3.4)
> - 구현: `CactusMultiMyBatisSqlRunner` (cactus 1.0.22-SNAPSHOT) — multi-DS SqlSessionFactory 자동 등록 + dataSource → SqlSessionTemplate 동적 매핑
> - 실측 검증 완료: mcm 의 `pilotMultiTx.bpmn` 통합 BPMN (ExclusiveGateway + action 분기 = run / rollback) 에서 multi-DS INSERT/SELECT + multi-tx LIFO rollback atomicity 모두 검증
> - R-mybatis-1~12 모두 해소
>
> → **본 문서의 §4 (Phase B) 는 archival 자료**. 신규 작업은 위 정본 문서 참고.
>
> **2026-05-18 결정적 발견**: OASIS 의 `SpringApplicationContext.get(name)` 이 Spring 의
> `ApplicationContext.getBean(name)` 그대로 사용 — **cactus alias 완전 인식**. Phase 7 시연 실패는
> BPMN 작성 실수 (ds + tx 둘 다 명시) 였음. 인라인 SELECT 시연으로 multi-DS 동작 검증 완료.

---

## 1. 배경

cactus 1.0.21 의 multi-tx 메커니즘 (`docs/cactus/oasis-multi-tx-detailed-design.md`) 은 **ServiceTask
+ Spring Data JPA Repository + process tx** 패턴으로 multi-DS atomic 트랜잭션 보장. 정상 + rollback
시나리오 완전 동작 (Phase 7 시연 검증).

Phase 7 의 SqlScriptTask 추가 시연 (직접 SQL INSERT 시나리오) 시도 결과 — **에러 fail**:
```
{"meta":{"success":false, "code":"S001",
 "message":"Cannot retrieve the data source. Please input either [ds] or [tx] property."}}
```

당시 추정 원인 — "OASIS executor 가 cactus alias 인식 못 함". 본 문서 작성 후 oasis-core source
직접 분석 결과 **추정 정정**:

### 1-1. 실제 시연 실패 원인 (2026-05-18 source 분석 결과)

**OASIS 의 메시지를 잘못 해석**. 정확한 의미:
- `"Please input either [ds] or [tx] property"` = **"ds 또는 tx 중 하나만 입력하라"** (둘 다 명시 시 거부)
- 본 시연 BPMN: `ds="if"` + `tx="txIF"` 둘 다 명시 → **OASIS 의 의도된 거부**

source 코드 (oasis-core 5.1.0 의 `SqlScriptTaskExecutable.execute()`):
```java
if (dataSourceNameObject != null && transactionManagerNameObject != null)
    throw new IllegalArgumentException("Cannot retrieve the data source. " +
            "Please input either [ds] or [tx] property.");
```

→ 둘 중 하나만 명시해야 함.

### 1-2. cactus alias 인식 확정 — Phase A 의 cactus 측 코드 변경 0

`oasis-core 5.1.0` 의 `SpringApplicationContext.get(name)`:
```java
@Override
public TypedObject get(String s) {
    Object bean;
    try {
        bean = ac.getBean(s);   // ★ Spring ApplicationContext.getBean(name) — alias 자동 인식
    } catch (NoSuchBeanDefinitionException e) {
        return null;
    }
    return new TypedObject(bean, ac.getType(s));
}
```

→ Spring 의 `BeanFactory.getBean(name)` 그대로 사용. **cactus 의 yml-key alias 완전 인식** (Phase 0-D
검증 메커니즘과 동일 path). 즉 BPMN `ds="if"` 또는 `tx="txIF"` (cactus alias) 가 자연스럽게 동작.

### 1-3. 본 설계의 갱신된 범위

이전 작성 시 "Phase A/B/C" 3가지 트랙 모두 cactus 측 코드 변경 가정. 사후 분석 결과:

- **Phase 0 (BPMN 사용법)** — 인라인 SELECT (조회) 시나리오는 즉시 동작. cactus 코드 변경 0. **2026-05-18 실측 검증 완료**.
- **Phase A (cactus 측 통합)** — 폐기. 불필요.
- **Phase B (MultiDsMyBatisSqlRunner)** — ✅ **2026-05-19 통합 완료**. 정본은 [`cactus-mybatis-multi-ds-design.md`](./cactus-mybatis-multi-ds-design.md). 본 설계 §4 는 archival.
- **Phase C (OASIS 본체 patch)** — 불필요. OASIS 이미 충분.

---

## 2. 문제 분석

### 2-1. OASIS `SqlScriptTaskExecutable` 의 lookup 메커니즘 (bytecode 추론)

oasis-core 5.1.0 의 `com.dongkuk.oasis.executors.SqlScriptTaskExecutable` bytecode 디스어셈블 결과:

```
49: ldc "ds" → task.getProperty("ds")                  ← BPMN ds 값 추출 (예: "if")
72: ldc "tx" → task.getProperty("tx")                  ← BPMN tx 값 추출 (예: "txIF")
...
55: throw "Cannot retrieve the data source. Please input either [ds] or [tx] property."
125: throw "Cannot retrieve the default data source."
146: throw "There are more than 2 default data sources."
156: throw "Cannot retrieve the data source. Please verify if the properties [ds] or [tx] are set correctly."
```

흐름 (추론):
1. `ds_prop = task.getProperty("ds")` — BPMN ds 값 추출
2. `tx_prop = task.getProperty("tx")` — BPMN tx 값 추출
3. **`DataSource = resolve(ds_prop, tx_prop)`** ← lookup 단계
4. `resolve()` 가 null 반환 시 → 위 4가지 에러 중 하나 throw
5. lookup 성공 시 → `SqlRunner.run(parameters, dataSource, identifier)` 호출

### 2-2. lookup 메커니즘 — 실제 동작 (2026-05-18 source 분석 확정)

`SqlScriptTaskExecutable.execute()` 의 정확한 흐름:

```java
TypedObject dataSourceNameObject = null;
TypedObject transactionManagerNameObject = null;
DataSource dataSource = null;

if (dataSourceName != null)
    dataSourceNameObject = executableContext.get(dataSourceName);     // ★ ApplicationContext.getBean(name)
if (transactionManagerName != null)
    transactionManagerNameObject = executableContext.get(transactionManagerName);

// 1. 둘 다 명시 → 의도된 거부
if (dataSourceNameObject != null && transactionManagerNameObject != null)
    throw new IllegalArgumentException("Cannot retrieve the data source. " +
            "Please input either [ds] or [tx] property.");

// 2. 둘 다 미명시 → DefaultDataSourceResolver 탐색 (없으면 다른 에러)
if (transactionManagerNameObject == null && dataSourceNameObject == null) {
    // ... defaultDataSourceResolvers lookup
}

// 3. 한 쪽만 명시 → DataSourceExtractorFromTransactionManager.getDataSource(...)
dataSource = ...;
```

#### 2-2-1. `executableContext.get(name)` — Spring alias 인식 (`SpringApplicationContext.get`)

```java
// oasis-core 5.1.0 의 SpringApplicationContext.get(name)
public TypedObject get(String s) {
    Object bean;
    try {
        bean = ac.getBean(s);    // ★ Spring 의 BeanFactory.getBean(name) — alias 인식
    } catch (NoSuchBeanDefinitionException e) {
        return null;
    }
    return new TypedObject(bean, ac.getType(s));
}
```

→ Spring 의 `ApplicationContext.getBean(name)` 그대로 사용. cactus 의 yml-key alias (`if`, `txIF`,
`biz` 등) 자연스럽게 인식. **자체 Map registry 가 아니라 Spring BeanFactory 직접 사용**.

#### 2-2-2. `DataSourceExtractorFromTransactionManager.getDataSource(...)` 동작 (`tx` 만 명시 시)

```java
// oasis-core 5.1.0 의 DataSourceExtractorFromTransactionManager
static DataSource getDataSource(TypedObject dsNameObj, TypedObject txMgrNameObj) {
    if (txMgrNameObj != null) {
        Object object = txMgrNameObj.getObject();
        if (object instanceof JpaTransactionManager) {
            return ((JpaTransactionManager) object).getDataSource();
        } else if (object instanceof DataSourceTransactionManager) {
            return ((DataSourceTransactionManager) object).getDataSource();
        } else {
            throw new IllegalArgumentException("Unsupported transaction manager.");
        }
    } else {
        return dsNameObj.getObject(DataSource.class);
    }
}
```

→ `tx="txIF"` 만 명시 시:
- alias `txIF` → `cactusTransactionManagerIf` 빈 (cactus의 alias 등록 결과)
- `JpaTransactionManager.getDataSource()` → `cactusDataSourceIf` 추출
- 자동 동작

→ `ds="if"` 만 명시 시:
- alias `if` → `cactusDataSourceIf` 빈 (cactus alias)
- 직접 사용

### 2-3. cactus 1.0.21 의 한계 (재정리)

#### 2-3-1. DataSource 등록 메커니즘 — **불필요 (OASIS 가 ApplicationContext 통해 직접 lookup)**

이전 가설 폐기. cactus 측 코드 변경 0.

#### 2-3-2. `MyBatisSqlRunner` 의 단일 SqlSession 가정 — **잔존 한계**

`cactus-core/.../oasis/task/MyBatisSqlRunner.java`:
```java
public class MyBatisSqlRunner implements SqlRunner {
    private final SqlSession sqlSession;          // ★ 단일 SqlSession

    public TypedObject run(Map<String, Object> params, DataSource dataSource, String identifier) {
        // dataSource 파라미터 받지만 무시 → 단일 sqlSession 만 사용
        sqlSession.insert(mapperId, params);
    }
}
```

→ MyBatis mapper id 사용 (`script = "insert,...PilotIfMapper.insertLog"`) 시 — cactus 가 단일
SqlSession 만 보유 → 다른 DS 의 SQL 실행 불가. multi-DS MyBatis mapper id 사용 시 **Phase B 필요**.

#### 2-3-3. 인라인 SQL 의 OASIS 제약 — `JdbcTemplateSqlRunner` 가 **SELECT 만 지원**

```java
// SqlScriptTaskExecutable.execute() (sql != null 분기)
if (sql != null) {
    result = new JdbcTemplateSqlRunner().run(param, dataSource, columnConverter, sql);
}
```

`JdbcTemplateSqlRunner` 의 SQL check — `"Only SELECT or WITH statements are allowed."`. INSERT/UPDATE/
DELETE 는 mapper id 통해야 함.

### 2-4. ServiceTask 시연 (Phase 7) 동작 이유

ServiceTask 패턴은 SQL 직접 실행 안 함 — Spring Bean (`@Service`) lookup + Repository.save() 호출.
Spring Data JPA 가 Repository Config 의 `txRef` 통해 자동 분배. DataSource lookup 단계 없음.

### 2-3. cactus 1.0.21 의 한계

#### 2-3-1. DataSource 등록 메커니즘 부재

`cactus-core/src/main/java/com/dongkuk/dmes/cactus/oasis/OasisAutoConfiguration.java#serviceStarter()`:

```java
SpringServiceStarterFactory factory = new SpringServiceStarterFactory(ctx, tmNames);
// ❌ DataSource 명시 등록 코드 없음
factory.setServiceProvider(...);
return factory.generateServiceStarter();
```

→ OASIS factory 는 ApplicationContext + TxMgr 화이트리스트만 받음. DataSource registry 비어있음.

#### 2-3-2. `MyBatisSqlRunner` 의 단일 SqlSession 가정

`cactus-core/src/main/java/com/dongkuk/dmes/cactus/oasis/task/MyBatisSqlRunner.java`:

```java
public class MyBatisSqlRunner implements SqlRunner {
    private final SqlSession sqlSession;          // ← 단일 SqlSession

    public TypedObject run(Map<String, Object> params, DataSource dataSource, String identifier) {
        // dataSource 파라미터 받지만 무시 → 단일 sqlSession 만 사용
        ...
        sqlSession.insert(mapperId, params);
    }
}
```

→ multi-DS 환경 (cactus.datasource.extras.{biz, cmn, if}) 에서 DS 별 다른 SqlSession 필요한데 cactus
구현은 단일 SqlSession 만. JavaDoc 도 "미결 #4 결정: 단일 DS 환경에서만 자동 트랜잭션 동기화 보장" 명시.

#### 2-3-3. 인라인 SQL 미지원

`MyBatisSqlRunner` 가 받는 `identifier` 는 **MyBatis mapper ID** (예: `"insert,com.foo.BarMapper.insertX"`).
OASIS test 코드의 BPMN 패턴 `<bpmn:script>SELECT id FROM users WHERE id = :id</bpmn:script>` (인라인
SQL) 은 지원 안 함. cactus 사용 시 mapper XML 작성 필수.

### 2-4. ServiceTask 시연 (Phase 7) 이 동작한 이유

ServiceTask 패턴:
1. `<camunda:class>pilotMultiTxService</camunda:class>` — Spring Bean lookup (ApplicationContext)
2. method 호출 — `JavaServiceTaskExecutable` 이 ApplicationContext.getBean() 으로 빈 얻음 + reflection 호출
3. 메서드 안에서 `Repository.save()` — Spring Data JPA 가 Repository Config 의 `txRef` 통해 cactusTransactionManagerIf 에 join

→ DataSource 직접 lookup 안 함. Spring Bean + Repository 매핑 통해 자동 분배.

ScriptTask 와 차이: ScriptTask 는 **직접 DataSource 객체 필요** (SQL 실행 위해). OASIS executor 가
ds/tx → DataSource 변환 단계에서 cactus alias 못 받음.

---

## 3. Phase A — **폐기** (불필요)

> 2026-05-18 사전 검증 결과 — OASIS 가 `ApplicationContext.getBean(name)` 통해 cactus alias 직접
> 인식 가능. cactus 측 통합 코드 불필요. 본 Phase 폐기.

### 3-0. 대체 — Phase 0 (BPMN 사용법)

cactus 측 코드 변경 0. BPMN 작성 가이드만:

#### 3-0-1. ScriptTask 의 `ds` vs `tx` 명시 — **하나만** 선택

```xml
<!-- 옵션 1: ds 만 명시 (DataSource alias 직접 lookup) -->
<bpmn:scriptTask id="t1" scriptFormat="sql">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="ds" value="if"/>     ← cactus alias
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:script>SELECT ...</bpmn:script>
</bpmn:scriptTask>

<!-- 옵션 2: tx 만 명시 (TxMgr → DataSource 자동 추출) -->
<bpmn:scriptTask id="t2" scriptFormat="sql">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txIF"/>   ← cactus alias (TxMgr)
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:script>SELECT ...</bpmn:script>
</bpmn:scriptTask>
```

❌ 둘 다 명시 금지 — OASIS 가 `IllegalArgumentException("Please input either [ds] or [tx]")` throw.

#### 3-0-2. 권장 — `tx` 만 명시 (multi-tx 정합성)

`tx` 만 명시 시:
- BPMN process tx 의 화이트리스트에 명시된 TxMgr 와 일관
- TxMgr → DataSource 자동 추출 (`JpaTransactionManager.getDataSource()`)
- 트랜잭션 join 자동 (PROPAGATION_REQUIRED)

`ds` 만 명시는 트랜잭션 별도 관리 시나리오 — 일반적이지 않음.

#### 3-0-3. 인라인 SQL 시연 검증 (2026-05-18 실측)

`pilotMultiTx.bpmn`:
```xml
<bpmn:scriptTask id="t2" scriptFormat="sql">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txIF"/>
      <camunda:property name="input" value="interfaceId"/>
      <camunda:property name="output" value="ifQueryResult"/>
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:script>SELECT COUNT(*) AS CNT FROM TB_PILOT_IF_LOG WHERE INTERFACE_ID = :interfaceId</bpmn:script>
</bpmn:scriptTask>
```

호출 결과 (정상):
```json
{
  "data":  {"bizResult": {"bizLogId": 4}},
  "grids": {"ifQueryResult": {"rows": [{"cnt": 0}]}},
  "meta":  {"success": true}
}
```

mcm 로그:
```
Transaction [txBiz] started.
Transaction [txIF]  started.
[PilotMultiTx] t1 (biz) — INSERT 'hello'         ← biz DS
Task [t2](if SELECT) start.
Task [t2](if SELECT) finish.(134ms)               ← if DS (cactus alias)
Transaction [txIF]  has been committed.
Transaction [txBiz] has been committed.
```

→ multi-DS lookup + 트랜잭션 join + LIFO commit 모두 동작 검증.

#### 3-0-4. 인라인 SQL 의 한계

| SQL 종류 | 동작 |
|---|---|
| `SELECT ...` | ✅ `JdbcTemplateSqlRunner` 가 실행 |
| `WITH ... SELECT ...` | ✅ CTE 지원 |
| `INSERT/UPDATE/DELETE` | ❌ `"Only SELECT or WITH statements are allowed."` |

INSERT 등 modifying SQL 은 mapper id (Phase B) 필요.

---

## ~~3. Phase A — 단기 (DataSource registry 통합)~~ — **폐기**

> 사후 분석 결과 cactus 측 코드 변경 불필요. 본 섹션 폐기. 상기 §3 Phase 0 참고.

<details>
<summary>이전 작성 내용 (참고용, 폐기)</summary>

### 3-1. 목표 (폐기)

cactus 의 `OasisAutoConfiguration` 이 multi-tx mode 진입 시 모든 cactus DataSource (primary-alias +
extras) 를 OASIS factory 의 자체 registry 에 명시 등록.

### 3-2. 사전 검증 (필수)

진행 전 `SpringServiceStarterFactory` 의 public API 확인 — `addDataSource(name, ds)` 또는 동등
메서드 존재 여부.

#### 3-2-1. 검증 방법

```bash
# 1. oasis-core sources jar 추출
mkdir /tmp/oasis-src && cd /tmp/oasis-src
unzip ~/.gradle/caches/modules-2/files-2.1/com.dongkuk/oasis-core/5.1.0/*/oasis-core-5.1.0-sources.jar

# 2. SpringServiceStarterFactory 의 public API 확인
javap /tmp/oasis-impl/com/dongkuk/oasis/factories/SpringServiceStarterFactory.class

# 3. SqlScriptTaskExecutable 의 lookup 구현 정확 확인
cat com/dongkuk/oasis/executors/SqlScriptTaskExecutable.java
```

#### 3-2-2. 가능한 결과별 분기

| API 결과 | Phase A 접근 |
|---|---|
| `factory.addDataSource(String, DataSource)` 존재 | ✅ Phase A 단순 진행 — addDataSource 호출만 |
| `ServiceStarter.addDataSource(...)` setter | ✅ generateServiceStarter() 후 setter 호출 |
| 별도 등록 메서드 없음, 자체 internal Map | ❌ Phase A 불가 → Phase B 우회 또는 Phase C 외부 patch |
| `ApplicationContext.getBean()` 기반 | △ alias 인식해야 하는데 안 됨 → bytecode 더 분석 |

### 3-3. 코드 변경 (Phase A 진행 가정)

#### 3-3-1. `OasisAutoConfiguration#serviceStarter()` 수정

```java
// cactus-core/src/main/java/com/dongkuk/dmes/cactus/oasis/OasisAutoConfiguration.java

@Bean
@ConditionalOnMissingBean
public ServiceStarter serviceStarter(OasisProperties props,
                                      CactusTxProperties txProps,
                                      CactusDataSourceProperties dsProps,      // ← 신규 주입
                                      ApplicationContext ctx) {
    String url = trimToNull(props.getServiceLoaderUrl());
    String path = props.getServicePath();
    int cacheSize = props.getCache().getSize();

    if (props.isTransactional()) {
        boolean isMultiTx = !txProps.getManagers().isEmpty();
        String[] tmNames = isMultiTx
                ? txProps.getManagers().keySet().toArray(new String[0])
                : new String[]{props.getTransactionManagerName()};
        SpringServiceStarterFactory factory = new SpringServiceStarterFactory(ctx, tmNames);

        // ━━━ 신규 (Phase A) — OASIS DataSource registry 명시 등록 ━━━
        if (isMultiTx) {
            registerDataSourcesToOasis(factory, dsProps, ctx);
        }

        ServiceProvider provider;
        if (url != null) {
            log.info("[Cactus Oasis] transactional + HTTP loader — {}", url);
            provider = new GenericServiceProvider(
                    new CamundaBpmnServiceUnmarshaller(),
                    new HttpServiceDocumentLoader(url, 10));
        } else {
            log.info("[Cactus Oasis] transactional + classpath loader — {}", path);
            provider = new SimpleServiceProvider(path, "bpmn", FILE_DESCRIPTION_DELIMITER);
        }

        if (isMultiTx) {
            provider = new DefaultTxInjectingServiceProvider(provider, txProps.getDefaultManager());
            log.info("[Cactus Oasis] multi-tx mode — managers={}, default={}",
                    Arrays.toString(tmNames), txProps.getDefaultManager());
        } else {
            log.info("[Cactus Oasis] legacy mode — single tx={}", props.getTransactionManagerName());
        }
        factory.setServiceProvider(new CactusCachingServiceProvider(provider, cacheSize));
        return factory.generateServiceStarter();
    }
    // non-transactional ... (기존)
}

/**
 * Phase A — cactus 의 모든 DataSource (primary-alias + extras) 를 OASIS factory 의
 * 자체 DataSource registry 에 명시 등록. ScriptTask 의 ds=alias 가 정상 lookup.
 *
 * <p>Spring Bean 의 alias 등록 (Phase 0-D) 만으로는 OASIS executor 가 인식 못 함 — 자체 registry
 * 필요 (R-multi-29). 본 메서드가 mitigation.
 */
private static void registerDataSourcesToOasis(
        SpringServiceStarterFactory factory,
        CactusDataSourceProperties dsProps,
        ApplicationContext ctx) {

    // primary-alias 등록 (예: "biz" → Spring Boot 의 dataSource 빈)
    String primaryAlias = dsProps.getPrimaryAlias();
    if (primaryAlias != null && !primaryAlias.isBlank()
            && ctx.containsBean("dataSource")) {
        DataSource ds = ctx.getBean("dataSource", DataSource.class);
        factory.addDataSource(primaryAlias, ds);
        log.info("[Cactus Oasis] DataSource registered to OASIS — alias='{}' → dataSource",
                primaryAlias);
    }

    // extras 등록 (예: "if" → cactusDataSourceIf)
    for (String name : dsProps.getExtras().keySet()) {
        try {
            DataSource ds = ctx.getBean(name, DataSource.class);  // alias 통해 빈 lookup
            factory.addDataSource(name, ds);
            log.info("[Cactus Oasis] DataSource registered to OASIS — alias='{}' → bean lookup OK",
                    name);
        } catch (NoSuchBeanDefinitionException e) {
            log.warn("[Cactus Oasis] DataSource registration skipped — alias='{}' (bean not found)",
                    name);
        }
    }
}
```

#### 3-3-2. CactusDataSourceProperties 주입 의존 추가

`@EnableConfigurationProperties` 에 `CactusDataSourceProperties.class` 가 이미 있음 (Phase 4 의
`CactusAutoConfiguration` 에서 등록). serviceStarter 메서드 시그니처에 파라미터 추가만.

#### 3-3-3. ServiceStarter API 가 setter 만 제공하는 경우 (대안)

만약 `factory.addDataSource()` 가 없고 `ServiceStarter.addDataSource()` setter 만 있다면:

```java
ServiceStarter serviceStarter = factory.generateServiceStarter();
if (isMultiTx) {
    registerDataSourcesToOasis(serviceStarter, dsProps, ctx);   // factory 가 아니라 serviceStarter
}
return serviceStarter;
```

### 3-4. 위험 + mitigation

| 위험 | mitigation |
|---|---|
| **R-multi-29**: OASIS API 가 addDataSource 메서드 미제공 | Phase A 진행 전 사전 검증 필수. 미제공 시 Phase B 또는 C |
| **R-multi-30**: cactus 가 OASIS 내부 클래스 직접 호출 — OASIS 버전 업그레이드 시 깨질 위험 | version pinning (oasis-core 5.1.0) + 회귀 테스트 |
| **R-multi-32 (신규)**: extras DataSource 빈 lookup 시 `NoSuchBeanDefinitionException` | try-catch + warn log (silent skip) — Phase 0-D 검증된 alias 정상 등록 시 영향 없음 |

### 3-5. 검증

#### 3-5-1. 부팅 로그 검증

mcm bootRun 시 추가 출력:
```
[Cactus Oasis] DataSource registered to OASIS — alias='biz' → dataSource
[Cactus Oasis] DataSource registered to OASIS — alias='if' → bean lookup OK
[Cactus Oasis] multi-tx mode — managers=[txBiz, txCmn, txIF], default=txBiz
```

#### 3-5-2. ScriptTask 호출 검증

BPMN `pilotMultiTx.bpmn` 의 t2 를 다시 ScriptTask 로 변경:
```xml
<bpmn:scriptTask id="t2" scriptFormat="sql">
  <camunda:properties>
    <camunda:property name="tx" value="txIF"/>
    <camunda:property name="ds" value="if"/>          ← alias
  </camunda:properties>
  <bpmn:script>insert,com.dongkuk.dmes.mcm.pilot.intf.PilotIfMapper.insertLog</bpmn:script>
</bpmn:scriptTask>
```

호출 시 정상 INSERT 응답:
```json
{"data":{"ifResult":1,"bizResult":{"bizLogId":1}}, "meta":{"success":true}}
```

mcm 로그:
```
Transaction [txBiz] started.
Transaction [txIF] started.
[PilotMultiTx] t1 (biz) — INSERT 'hello'
SqlScriptTask t2 → MyBatisSqlRunner.run(if DataSource, "insert,...PilotIfMapper.insertLog")
Transaction [txIF] has been committed.
Transaction [txBiz] has been committed.
```

#### 3-5-3. Rollback 검증

`throwAt:"if"` → 두 트랜잭션 모두 rollback (Phase 7 시연 동일).

### 3-6. 작업 양 견적

| 항목 | 시간 |
|---|---|
| 사전 검증 (oasis-core source 분석) | 30분 |
| `OasisAutoConfiguration#serviceStarter()` 코드 변경 | 30분 |
| 부팅 + 단위 호출 검증 | 30분 |
| pilotMultiTx 시연 + rollback 검증 | 30분 |
| **합계** | **2시간** |

### 3-7. Phase A 의 한계 (폐기)

이전 가설 기반 — 사후 검증으로 부정확 확인.

</details>

---

## 4. Phase B — ✅ 통합 완료 (Multi-DS MyBatisSqlRunner)

> **2026-05-19 통합 완료**: 본 §4 의 설계 의도가 `cactus-mybatis-multi-ds-design.md` v3.4 로 흡수·구현되어 운영 가능 상태.
> - 구현 클래스: `com.dongkuk.dmes.cactus.oasis.task.CactusMultiMyBatisSqlRunner`
> - 자동 등록: `CactusMultiMybatisAutoConfiguration` (cactus 1.0.22-SNAPSHOT)
> - 실측 검증: mcm pilot (run + rollback, multi-tx LIFO atomicity)
> - 본 §4 의 코드/yml 예시는 **archival** — 실제 구현은 통합 설계 §5, §7, §8 참고.
> - R-mybatis-1~12 모두 해소.

## 4-OLD. Phase B — 중기 (Multi-DS MyBatisSqlRunner) [archival]

> **여전히 유효** — MyBatis mapper id (INSERT/UPDATE/DELETE) 시나리오 한정. 인라인 SELECT 만으로
> 충분한 경우 본 Phase 불필요.

### 4-1. 목표

cactus 의 `MyBatisSqlRunner` 를 multi-DS 지원으로 재설계. 각 cactus DataSource (biz / cmn / if /
extras) 별로 SqlSessionFactory 자동 등록. OASIS executor 가 전달하는 DataSource 객체로 어느
SqlSession 사용할지 결정.

**작업 양**: 2-3시간. Phase A 의 후속 (Phase A 단독으로는 불완전).

### 4-2. 핵심 변경

#### 4-2-1. 신규 — `MultiDsMyBatisSqlRunner`

```java
// cactus-core/src/main/java/com/dongkuk/dmes/cactus/oasis/task/MultiDsMyBatisSqlRunner.java

/**
 * Multi-DS MyBatisSqlRunner (cactus 1.0.22 신규).
 *
 * <p>기존 {@link MyBatisSqlRunner} 의 단일 SqlSession 한계 해결 — cactus 의 각 DataSource 별
 * SqlSessionFactory 를 보유, OASIS executor 가 전달하는 DataSource 로 어느 SqlSession 사용할지 결정.
 *
 * <p>구현 핵심:
 * <ul>
 *   <li>{@code Map<DataSource, SqlSessionFactory>} — 부팅 시 cactus 의 모든 extras DS 별 등록</li>
 *   <li>각 SQL 호출마다 {@code factory.openSession(connection)} — Spring 의
 *       {@link DataSourceUtils#getConnection(DataSource)} 통해 활성 트랜잭션 connection 자동 join</li>
 *   <li>identifier parsing 은 기존 {@link MyBatisSqlRunner} 와 동일</li>
 * </ul>
 *
 * <p>트랜잭션 join 메커니즘 — Spring 의 {@code DataSourceUtils.getConnection(dataSource)} 가
 * 현재 thread 의 활성 트랜잭션 (TransactionSynchronizationManager 안의 ConnectionHolder) 의 connection
 * 반환. cactus 의 cactusTransactionManagerIf (JpaTxMgr) 가 txIF begin 시 ConnectionHolder 등록.
 * 동일 thread 에서 SqlScriptTask 가 같은 DataSource 의 connection 받음 → 같은 트랜잭션 자동 join.
 */
public class MultiDsMyBatisSqlRunner implements SqlRunner {

    private final Map<DataSource, SqlSessionFactory> sqlSessionFactoriesByDs;

    public MultiDsMyBatisSqlRunner(Map<DataSource, SqlSessionFactory> sqlSessionFactoriesByDs) {
        if (sqlSessionFactoriesByDs == null || sqlSessionFactoriesByDs.isEmpty()) {
            throw new IllegalStateException("SqlSessionFactory map empty — cactus.mybatis.extras 정의 필요");
        }
        this.sqlSessionFactoriesByDs = Map.copyOf(sqlSessionFactoriesByDs);
    }

    @Override
    public TypedObject run(Map<String, Object> parameters, DataSource dataSource, String identifier) {
        SqlSessionFactory factory = sqlSessionFactoriesByDs.get(dataSource);
        if (factory == null) {
            throw new IllegalStateException(
                "DataSource 에 매핑된 SqlSessionFactory 없음. cactus.mybatis.extras 에 해당 DS 등록 확인. "
                + "registered DS: " + sqlSessionFactoriesByDs.keySet());
        }

        // ★ 핵심 — DataSourceUtils.getConnection(ds) 가 활성 트랜잭션 connection 반환 → tx join
        Connection conn = DataSourceUtils.getConnection(dataSource);
        try (SqlSession session = factory.openSession(conn)) {
            return executeIdentifier(session, identifier, parameters);
        } finally {
            DataSourceUtils.releaseConnection(conn, dataSource);
        }
    }

    private TypedObject executeIdentifier(SqlSession session, String identifier,
                                           Map<String, Object> parameters) {
        // 기존 MyBatisSqlRunner.run 의 identifier parsing 로직 그대로
        String[] split = identifier.split(",");
        int result;
        if (split.length == 2) {
            switch (split[0].toLowerCase()) {
                case "insert": result = session.insert(split[1], parameters); return returnResult(session, result);
                case "update": result = session.update(split[1], parameters); return returnResult(session, result);
                case "delete": result = session.delete(split[1], parameters); return returnResult(session, result);
                default:
                    return returnResult(session,
                        changeKeyCaseToCamel(session.selectList(split[1], parameters)),
                        new TypeReference<List<Map<String, Object>>>() {}.getType());
            }
        }
        List<?> objects = session.selectList(identifier, parameters);
        Class<?> type = getResultType(session, identifier);
        if (TypeUtils.isAssignable(Map.class, type)) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) objects;
            return returnResult(session, changeKeyCaseToCamel(rows),
                    new TypeReference<List<Map<String, Object>>>() {}.getType());
        }
        return returnResult(session, objects, new TypeReference<List<Object>>() {}.getType());
    }

    // ... (returnResult, changeKeyCaseToCamel, getResultType — 기존과 동일)
}
```

#### 4-2-2. 신규 — `CactusMybatisProperties`

```java
// cactus-core/src/main/java/com/dongkuk/dmes/cactus/mybatis/CactusMybatisProperties.java

/**
 * cactus MyBatis 자동 설정 프로퍼티 (1.0.22 신규).
 *
 * <pre>
 * cactus:
 *   mybatis:
 *     extras:                          # cactus.datasource.extras 와 1:1 매핑 (yml key 일치)
 *       if:
 *         mapper-locations: classpath:mapper/if/*.xml
 *         configuration:
 *           map-underscore-to-camel-case: false
 *       biz:                          # primary-alias 도 지원
 *         mapper-locations: classpath:mapper/biz/*.xml
 * </pre>
 */
@ConfigurationProperties(prefix = "cactus.mybatis")
public class CactusMybatisProperties {
    private Map<String, ExtrasMybatis> extras = new LinkedHashMap<>();

    public static class ExtrasMybatis {
        private String mapperLocations;
        private MyBatisConfig configuration = new MyBatisConfig();
        // getters/setters
    }

    public static class MyBatisConfig {
        private boolean mapUnderscoreToCamelCase = false;
        private boolean callSettersOnNulls = true;
        // getters/setters
    }
}
```

#### 4-2-3. 신규 — `CactusMultiSqlSessionAutoConfiguration`

```java
// cactus-core/src/main/java/com/dongkuk/dmes/cactus/mybatis/CactusMultiSqlSessionAutoConfiguration.java

/**
 * cactus.mybatis.extras 의 각 entry 별 SqlSessionFactory 자동 등록 + MultiDsMyBatisSqlRunner
 * 빈 등록 (cactus 1.0.22 신규).
 *
 * <p>각 entry 의 DataSource 는 cactus 의 yml-key alias 통해 lookup (Phase 2 의 CactusMulti
 * DataSourceAutoConfiguration 의 alias 등록 결과).
 *
 * <p>등록 빈:
 * <ul>
 *   <li>{@code cactusSqlSessionFactory{Name}} — 각 entry 별</li>
 *   <li>{@code cactusMultiDsMyBatisSqlRunner} — {@link MultiDsMyBatisSqlRunner}, OASIS executor 가 사용</li>
 * </ul>
 *
 * <p>활성 조건: {@code SqlSessionFactoryBean} classpath + {@code cactus.mybatis.extras} 가 비어있지 않음.
 */
@AutoConfiguration(after = {
    CactusMultiDataSourceAutoConfiguration.class,
    OasisAutoConfiguration.class
})
@ConditionalOnClass(SqlSessionFactoryBean.class)
public class CactusMultiSqlSessionAutoConfiguration
        implements BeanDefinitionRegistryPostProcessor, EnvironmentAware, BeanFactoryAware {

    private CactusMybatisProperties props;
    private BeanFactory beanFactory;

    @Override
    public void setEnvironment(Environment environment) {
        this.props = Binder.get(environment)
                .bind("cactus.mybatis", CactusMybatisProperties.class)
                .orElseGet(CactusMybatisProperties::new);
    }

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        if (props == null || props.getExtras().isEmpty()) return;

        for (Map.Entry<String, ExtrasMybatis> entry : props.getExtras().entrySet()) {
            String name = entry.getKey();                          // 예: "if"
            ExtrasMybatis cfg = entry.getValue();
            String factoryBeanName = "cactusSqlSessionFactory" + capitalize(name);

            GenericBeanDefinition bd = new GenericBeanDefinition();
            bd.setBeanClass(SqlSessionFactory.class);
            bd.setInstanceSupplier(() -> buildSqlSessionFactory(name, cfg));
            registry.registerBeanDefinition(factoryBeanName, bd);
        }

        // MultiDsMyBatisSqlRunner 빈 등록 — SqlRunner 빈 자리에 등록 (cactus 기존 MyBatisSqlRunner 대체)
        GenericBeanDefinition runnerBd = new GenericBeanDefinition();
        runnerBd.setBeanClass(MultiDsMyBatisSqlRunner.class);
        runnerBd.setInstanceSupplier(() -> {
            Map<DataSource, SqlSessionFactory> map = new HashMap<>();
            for (String name : props.getExtras().keySet()) {
                DataSource ds = beanFactory.getBean(name, DataSource.class);  // alias lookup
                SqlSessionFactory factory = beanFactory.getBean(
                        "cactusSqlSessionFactory" + capitalize(name), SqlSessionFactory.class);
                map.put(ds, factory);
            }
            return new MultiDsMyBatisSqlRunner(map);
        });
        runnerBd.setPrimary(true);
        registry.registerBeanDefinition("cactusMultiDsMyBatisSqlRunner", runnerBd);
    }

    private SqlSessionFactory buildSqlSessionFactory(String name, ExtrasMybatis cfg) {
        DataSource ds = beanFactory.getBean(name, DataSource.class);
        SqlSessionFactoryBean fb = new SqlSessionFactoryBean();
        fb.setDataSource(ds);
        if (cfg.getMapperLocations() != null) {
            fb.setMapperLocations(new PathMatchingResourcePatternResolver()
                    .getResources(cfg.getMapperLocations()));
        }
        Configuration config = new Configuration();
        config.setMapUnderscoreToCamelCase(cfg.getConfiguration().isMapUnderscoreToCamelCase());
        config.setCallSettersOnNulls(cfg.getConfiguration().isCallSettersOnNulls());
        fb.setConfiguration(config);
        return fb.getObject();
    }
}
```

#### 4-2-4. `OasisAutoConfiguration` 의 기존 sqlRunner 빈 자동 비활성

기존 `OasisAutoConfiguration#sqlRunner(SqlSession)`:
```java
@Bean
@ConditionalOnBean(SqlSession.class)
@ConditionalOnMissingBean(SqlRunner.class)         // ★
public SqlRunner sqlRunner(SqlSession sqlSession) {
    return new MyBatisSqlRunner(sqlSession);
}
```

`@ConditionalOnMissingBean(SqlRunner.class)` — `cactusMultiDsMyBatisSqlRunner` (`MultiDsMyBatisSqlRunner`
= `SqlRunner`) 가 이미 등록되면 본 빈 자동 비활성. 호환성 유지.

### 4-3. 호스트 측 yml 변경 (mcm 예)

```yaml
# mcm/api/src/main/resources/application.yml
cactus:
  mybatis:
    extras:
      biz:                                          # primary-alias 도 지원
        mapper-locations: classpath:mapper/biz/*.xml
      if:
        mapper-locations: classpath:mapper/if/*.xml
```

#### 4-3-1. 호스트 측 매퍼 위치 컨벤션

| DS alias | mapper 위치 | 예 |
|---|---|---|
| `biz` (primary) | `classpath:mapper/biz/*.xml` | `mapper/biz/SecUserMapper.xml` |
| `cmn` | `classpath:mapper/cmn/*.xml` | `mapper/cmn/CommonCodeMapper.xml` |
| `if` | `classpath:mapper/if/*.xml` | `mapper/if/IfInterfaceMapper.xml` |

### 4-4. 트랜잭션 join 메커니즘 (R-multi-31 핵심)

#### 4-4-1. Spring 의 `DataSourceUtils.getConnection(DataSource)` 동작

```
1. TransactionSynchronizationManager.getResource(dataSource) — thread-local lookup
2. 활성 트랜잭션의 ConnectionHolder 발견 시 → 그 connection 반환 (auto-join)
3. 없으면 → dataSource.getConnection() 새 connection
```

cactus 의 `cactusTransactionManagerIf` (JpaTransactionManager) 가 `txIF.begin()` 시:
- `EntityManagerFactory.createEntityManager()` 호출 → JPA EntityManager 의 connection 획득
- `TransactionSynchronizationManager.bindResource(cactusDataSourceIf, ConnectionHolder)`
- 동일 thread 의 후속 `DataSourceUtils.getConnection(cactusDataSourceIf)` → 같은 connection 반환

#### 4-4-2. SqlScriptTask 의 트랜잭션 join 정합성

```
1. OASIS process tx="txBiz,txIF" → SpringTransactionHandler:
   - txBiz.begin()  → transactionManager (JpaTxMgr) → dataSource ConnectionHolder bind
   - txIF.begin()   → cactusTransactionManagerIf (JpaTxMgr) → cactusDataSourceIf ConnectionHolder bind

2. t1 ServiceTask (JPA Repository.save) — 기존 동작 그대로

3. t2 SqlScriptTask (ds="if") → OASIS executor:
   - resolveDataSource("if") → cactusDataSourceIf (Phase A 의 registry)
   - SqlRunner.run(parameters, cactusDataSourceIf, "insert,...")
   - MultiDsMyBatisSqlRunner:
     a. sqlSessionFactoriesByDs.get(cactusDataSourceIf) → cactusSqlSessionFactoryIf
     b. DataSourceUtils.getConnection(cactusDataSourceIf) → ★ txIF 의 ConnectionHolder connection 반환
     c. factory.openSession(connection) → 트랜잭션 join (PROPAGATION_REQUIRED 효과)
     d. session.insert(mapperId, params) → INSERT 실행 (같은 트랜잭션)

4. process 종료 시:
   - cactusTransactionManagerIf.commit() — LIFO 첫 → t2 의 INSERT commit
   - transactionManager.commit() — LIFO 두 번째 → t1 의 save commit
```

→ 같은 트랜잭션 안에서 INSERT 실행. rollback 시 두 DS 모두 자동 rollback.

#### 4-4-3. 비대칭 시나리오 — R-multi-25 (같은 DS 두 alias)

cactus.tx.managers 의 `txBiz` 와 `txCmn` 이 같은 DS (biz) 매핑된 경우 (mcm 의 옵션 δ):
- `txBiz.begin()` + `txCmn.begin()` 모두 같은 transactionManager 빈 → PROPAGATION_REQUIRED 로 join
- 하나의 트랜잭션
- ScriptTask `ds="biz"` + `tx="txBiz"` 또는 `tx="txCmn"` 둘 다 같은 connection
- 비대칭 commit 불가 (이미 R-multi-25 검증)

### 4-5. 위험 + mitigation

| 위험 | mitigation |
|---|---|
| **R-multi-31**: `DataSourceUtils.getConnection()` 이 활성 tx connection 못 가져옴 | Spring 의 표준 메커니즘 (PlatformTransactionManager + TransactionSynchronizationManager). cactus 의 JpaTxMgr 가 정상 bind 하면 자동 동작. 단위 테스트 필수 |
| **R-multi-33 (신규)**: extras DS 등록 안 했는데 ScriptTask 가 그 alias 사용 시도 | `MultiDsMyBatisSqlRunner.run()` 의 null factory check + `IllegalStateException` (registered DS 목록 포함 명확 에러) |
| **R-multi-34 (신규)**: mapper XML 위치 컨벤션 오타 (예: `mapper/iff/*.xml`) | 부팅 시 SqlSessionFactoryBean.afterPropertiesSet() 에서 mapper resolution. 0건이면 사용 시점에 fail. 부팅 시 warn 로그 권장 |
| **R-multi-35 (신규)**: cactus + 기존 mybatis-spring-boot-starter 충돌 | 호스트가 mybatis-spring-boot-starter 사용 시 자체 SqlSessionFactory 등록 — cactus 의 SqlSessionFactory 와 alias 충돌 가능. `@ConditionalOnMissingBean` 또는 cactus 가 자체 SqlSession 빈 별도 이름 사용 |

### 4-6. 작업 양 견적

| 항목 | 시간 |
|---|---|
| `CactusMybatisProperties` 신규 | 30분 |
| `CactusMultiSqlSessionAutoConfiguration` 신규 (BDRPP 패턴 — Phase 2-3 코드 재활용) | 60분 |
| `MultiDsMyBatisSqlRunner` 신규 + `DataSourceUtils.getConnection` 통합 | 60분 |
| 단위 테스트 — 트랜잭션 join 검증 | 30분 |
| mcm 통합 + ScriptTask 시연 (정상 + rollback) | 30분 |
| **합계** | **약 3.5시간** |

Phase A + B 합계: **약 5-6시간** (작업 큼).

---

## 5. Phase C — 장기 (OASIS 본체 patch)

### 5-1. 목표

OASIS 자체가 multi-DataSource alias 인식하도록 패치. cactus 의 wrapping 작업 폐기 (Phase A/B 코드 제거).

**작업 양**: OASIS 팀과 협의 (외부 의존). 본 문서 범위 외.

### 5-2. OASIS 변경 사항 (제안)

#### 5-2-1. `SpringServiceStarterFactory` 의 alias 자동 수집

```java
// oasis-core/src/main/java/com/dongkuk/oasis/factories/SpringServiceStarterFactory.java (제안)

public ServiceStarter generateServiceStarter() {
    // ... 기존 동작
    // ★ 신규 — Spring ApplicationContext 의 모든 DataSource 빈 + alias 자동 수집
    Map<String, DataSource> dataSources = collectDataSourcesWithAliases(applicationContext);
    serviceStarter.setDataSourceRegistry(dataSources);
    return serviceStarter;
}

private Map<String, DataSource> collectDataSourcesWithAliases(ApplicationContext ctx) {
    Map<String, DataSource> result = new HashMap<>();
    Map<String, DataSource> byBean = ctx.getBeansOfType(DataSource.class);
    for (Map.Entry<String, DataSource> e : byBean.entrySet()) {
        result.put(e.getKey(), e.getValue());
        // alias 도 등록
        for (String alias : ((ConfigurableApplicationContext) ctx)
                .getBeanFactory().getAliases(e.getKey())) {
            result.put(alias, e.getValue());
        }
    }
    return result;
}
```

#### 5-2-2. cactus 측 변화

Phase A 의 `registerDataSourcesToOasis()` 메서드 폐기. OASIS 가 자동 수집.

### 5-3. 외부 contribute 절차

1. OASIS 팀과 협의 (이슈 등록)
2. patch PR
3. OASIS 다음 버전 (5.2.0 등) 에 포함
4. cactus 가 oasis-core 5.2.0 으로 업그레이드
5. cactus 의 Phase A 코드 제거

### 5-4. 한계

- 외부 의존 → 일정 미정
- 단기적으로 Phase A 또는 Phase B 가 현실적

---

## 6. R-multi 신규 위험 항목

본 설계로 추가되는 R-multi 위험 (기존 R-multi-1 ~ R-multi-28 의 후속):

| ID | 위험 | mitigation |
|---|---|---|
| **R-multi-29** | OASIS `SqlScriptTaskExecutable` 이 cactus alias 인식 못 함 (현 상태) | Phase A — cactus 가 OASIS factory 에 DataSource 명시 등록 |
| **R-multi-30** | cactus 가 OASIS 내부 클래스 (`SpringServiceStarterFactory`) 직접 호출 — 버전 업그레이드 호환성 위험 | oasis-core version pinning + cactus 회귀 테스트 |
| **R-multi-31** | multi-DS MyBatisSqlRunner 의 트랜잭션 join — Spring DataSourceUtils 의존 | 단위 테스트로 검증. Spring 표준 메커니즘이라 안전 |
| **R-multi-32** | extras DataSource 빈 lookup 실패 (alias 미등록) | try-catch + warn log |
| **R-multi-33** | ScriptTask 가 정의 안 된 ds alias 사용 시도 | `MultiDsMyBatisSqlRunner` 의 null check + 명확한 에러 메시지 |
| **R-multi-34** | mapper XML 위치 오타 | 부팅 시 warn 로그 (mapper 0건 시) |
| **R-multi-35** | cactus + mybatis-spring-boot-starter 충돌 | `@ConditionalOnMissingBean` + 빈 이름 격리 |

---

## 7. 검증 시나리오

### 7-0. Phase 0 (인라인 SELECT) — **2026-05-18 실측 완료** ✅

cactus 측 코드 변경 0. mcm bootRun 만으로 동작.

#### 7-0-1. 부팅 로그 (1.0.21 그대로)

```
[Cactus] extras DataSource — bean='cactusDataSourceIf' alias='if' url=jdbc:sqlite:...
[Cactus] primary DataSource alias — dataSource → 'biz'
[Cactus Oasis] multi-tx mode — managers=[txBiz, txCmn, txIF], default=txBiz
```

#### 7-0-2. BPMN (`pilotMultiTx.bpmn`)

```xml
<bpmn:scriptTask id="t2" scriptFormat="sql">
  <camunda:properties>
    <camunda:property name="tx" value="txIF"/>           ← cactus TxMgr alias
    <camunda:property name="input" value="interfaceId"/>
    <camunda:property name="output" value="ifQueryResult"/>
  </camunda:properties>
  <bpmn:script>SELECT COUNT(*) AS CNT FROM TB_PILOT_IF_LOG WHERE INTERFACE_ID = :interfaceId</bpmn:script>
</bpmn:scriptTask>
```

#### 7-0-3. 호출 결과

```json
{
  "data":  {"bizResult": {"bizLogId": 4}},
  "grids": {"ifQueryResult": {"rows": [{"cnt": 0}]}},
  "meta":  {"success": true, "code": "0000"}
}
```

#### 7-0-4. mcm 로그 (multi-tx + multi-DS 정상 동작)

```
Transaction [txBiz] started.
Transaction [txIF]  started.
[PilotMultiTx] t1 (biz) — INSERT 'hello'    ← biz DS (Repository.save)
Task [t2](if SELECT) start.
Task [t2](if SELECT) finish.(134ms)         ← if DS (JdbcTemplate, cactus alias)
Transaction [txIF]  has been committed.
Transaction [txBiz] has been committed.
```

### 7-1. Phase B 검증 (MyBatis mapper id, Phase B 작업 완료 가정)

#### 7-1-1. 부팅 로그

### 7-2. ScriptTask 호출 시나리오

#### 7-2-1. 정상

```bash
POST /oasis/pilotMultiTx/run
{"params":{"message":"hello","interfaceId":"PILOT_01","payload":"data"}}
```

응답:
```json
{
  "data": {"bizResult":{"bizLogId":1}, "ifResult": 1},
  "meta": {"success": true, "code": "0000"}
}
```

로그:
```
Transaction [txBiz] started.
Transaction [txIF] started.
[PilotMultiTx] t1 (biz) — INSERT 'hello'
SqlScriptTask t2 — ds='if' resolved → cactusDataSourceIf
                 → MultiDsMyBatisSqlRunner.run(if DS, "insert,...PilotIfMapper.insertLog")
                 → DataSourceUtils.getConnection(if DS) → txIF 의 connection join
                 → INSERT INTO TB_PILOT_IF_LOG (...) [affected: 1]
Transaction [txIF] has been committed.
Transaction [txBiz] has been committed.
```

#### 7-2-2. Rollback (t1 throw)

```bash
{"params":{"message":"x","throwAt":"biz"}}
```

응답: `success: false`. 로그:
```
Transaction [txBiz] started.
Transaction [txIF] started.
t1 throw → RuntimeException
Transaction [txIF] has been rolled back.    ← t2 도달 안 함
Transaction [txBiz] has been rolled back.
```

#### 7-2-3. Rollback (t2 SQL 실패)

```bash
{"params":{"message":"x","interfaceId":null,"payload":"data"}}   ← interfaceId NULL → NOT NULL 제약 위반
```

응답: `success: false`. 로그:
```
Transaction [txBiz] started.
Transaction [txIF] started.
t1 INSERT 성공
t2 INSERT → SQLException (interface_id cannot be null)
Transaction [txIF] has been rolled back.
Transaction [txBiz] has been rolled back.     ← t1 도 rollback (atomic)
```

#### 7-2-4. tx 화이트리스트 외

BPMN process tx="txOther" 명시:
- 부팅 시점 — Validator 가 fail-fast (R-multi-1)
- 또는 호출 시점 — OASIS 가 `IllegalArgumentException("tx [txOther] not in whitelist")` throw

### 7-3. 단위 테스트 명세

```java
@Test
void multiDsMyBatisSqlRunner_routesToCorrectSqlSession() {
    DataSource bizDs = mock(DataSource.class);
    DataSource ifDs = mock(DataSource.class);
    SqlSessionFactory bizFactory = mock(SqlSessionFactory.class);
    SqlSessionFactory ifFactory = mock(SqlSessionFactory.class);
    
    MultiDsMyBatisSqlRunner runner = new MultiDsMyBatisSqlRunner(Map.of(
        bizDs, bizFactory, ifDs, ifFactory));
    
    runner.run(params, ifDs, "insert,...");
    verify(ifFactory).openSession(any(Connection.class));
    verify(bizFactory, never()).openSession(any());
}

@Test
void multiDsMyBatisSqlRunner_joinsActiveTransactionConnection() {
    // TransactionSynchronizationManager 에 ConnectionHolder bind
    // → DataSourceUtils.getConnection() 이 같은 connection 반환 검증
}

@Test
void multiDsMyBatisSqlRunner_throwsForUnknownDataSource() {
    MultiDsMyBatisSqlRunner runner = new MultiDsMyBatisSqlRunner(Map.of(bizDs, factory));
    assertThatThrownBy(() -> runner.run(params, ifDs, "select,..."))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("SqlSessionFactory 없음");
}
```

---

## 8. 호스트 모듈 적용 가이드 (mcm 예시)

### 8-1. yml 추가

```yaml
cactus:
  mybatis:
    extras:
      if:
        mapper-locations: classpath:mapper/if/*.xml
        # biz 도 사용 시:
      # biz:
      #   mapper-locations: classpath:mapper/biz/*.xml
```

### 8-2. mapper XML 작성

```xml
<!-- mcm/api/src/main/resources/mapper/if/PilotIfMapper.xml -->
<mapper namespace="com.dongkuk.dmes.mcm.pilot.intf.PilotIfMapper">
    <insert id="insertLog" parameterType="map">
        INSERT INTO TB_PILOT_IF_LOG (INTERFACE_ID, PAYLOAD, CREATED_AT)
        VALUES (#{interfaceId}, #{payload}, CURRENT_TIMESTAMP)
    </insert>
</mapper>
```

### 8-3. Mapper interface (선택)

cactus 는 mapper id 기반이라 Mapper interface 불필요. 단 type-safe 호출 위해 정의 가능:

```java
@Mapper
public interface PilotIfMapper {
    int insertLog(Map<String, Object> params);
}
```

@Mapper 사용 시 mybatis-spring 의 @MapperScan 충돌 주의 — cactus 는 자체 SqlSession 사용, 호스트가
별도 SqlSessionFactory 등록 안 함.

### 8-4. BPMN 작성

```xml
<bpmn:scriptTask id="t2" scriptFormat="sql">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txIF"/>
      <camunda:property name="ds" value="if"/>             ← cactus alias
      <camunda:property name="input" value="interfaceId,payload"/>
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:script>insert,com.dongkuk.dmes.mcm.pilot.intf.PilotIfMapper.insertLog</bpmn:script>
</bpmn:scriptTask>
```

### 8-5. 호스트 측 의존성 추가

```gradle
// mcm/lib/build.gradle
dependencies {
    // ...
    api 'org.mybatis:mybatis:3.5.16'
    api 'org.mybatis:mybatis-spring:3.0.4'
}
```

cactus 가 mybatis 를 compileOnly 로만 의존 — 호스트가 runtime 제공 의무.

---

## 9. 마이그레이션 영향 (cactus 1.0.21 → 1.0.22)

### 9-1. 호환성

- **Phase A 만**: 기존 mcm 의 ServiceTask 시연 동작 — 영향 0. ScriptTask 시연 추가 가능.
- **Phase B 추가**: cactus.mybatis.extras 정의 안 한 호스트 — 기존 단일 SqlSession `MyBatisSqlRunner`
  자동 사용 (호환). 정의한 호스트만 multi-DS 활성.

### 9-2. 호스트 측 작업

| 호스트 | 작업 |
|---|---|
| **mcm** | 단일 DS ScriptTask 사용 안 함. Phase 6 (현 multi-tx ServiceTask 패턴) 만으로 충분. cactus.mybatis 미정의 — Phase B 영향 없음 |
| **mpp/mqc 등 향후 cactus + SERAI IF SQL 호출** | `cactus.mybatis.extras.if` 정의 + mapper XML 작성 |

### 9-3. 운영 적용 sequence

1. cactus-core 1.0.22-SNAPSHOT 빌드 + nexus 배포
2. 적용 호스트 (mpp 등) 가 cactus-core 1.0.22 업그레이드
3. yml + mapper XML 추가
4. BPMN ScriptTask 작성
5. 검증 시나리오 실행

---

## 10. 결정 이력

| 일자 | 변경 | 근거 |
|---|---|---|
| 2026-05-18 | **본 설계 신규 작성** | Phase 7 multi-tx 시연 (pilotMultiTx) 의 SqlScriptTask 시도 결과 `Cannot retrieve the data source` 발견. OASIS executor 의 cactus alias 비인식 (추정) — multi-DS SqlScriptTask 사용 위해 cactus 측 통합 작업 필요. 3가지 트랙 (A 단기 / B 중기 / C 장기) 상세 설계. |
| 2026-05-18 | **Phase A 사전 검증 → 추정 폐기 + 대대적 갱신** | oasis-core 5.1.0 source 직접 분석 결과 — `SpringApplicationContext.get(name)` 이 Spring 의 `ApplicationContext.getBean(name)` 그대로 사용 → cactus alias 완전 인식. **시연 실패 원인 정정**: BPMN 에 `ds` + `tx` 둘 다 명시한 작성 실수 (OASIS 가 의도적으로 `"Please input either [ds] or [tx]"` 거부). **Phase A 폐기** + **Phase 0 신규** (cactus 측 코드 변경 0, BPMN 작성 가이드만). 인라인 SELECT 시나리오 실측 검증 완료 — `tx="txIF"` 만 명시 시 cactus alias → `cactusTransactionManagerIf` → `getDataSource()` 자동 추출 → `JdbcTemplateSqlRunner` 정상 동작. multi-DS lookup + 트랜잭션 join + LIFO commit 모두 검증. **Phase B 는 여전히 유효** (MyBatis mapper id INSERT/UPDATE/DELETE 시나리오 한정). **§1 배경 + §2 분석 + §3 Phase A 폐기 + §3 Phase 0 신규 + §7 인라인 SELECT 검증 결과 + §10 본 row 모두 갱신**. |

---

## 부록 — 참고 링크

- 본 설계의 모태: [oasis-multi-tx-detailed-design.md](./oasis-multi-tx-detailed-design.md)
- 상위 설계: [oasis-multi-tx-design.md](./oasis-multi-tx-design.md)
- Phase 7 시연 결과: 본 세션 conversation 참고 (pilotMultiTx.bpmn ServiceTask 검증 통과 / ScriptTask 실패)
- OASIS test 코드 (multiSource): `oasis/oasis-core/src/test/resources/usecase/multiSource/`
- cactus 의 `MyBatisSqlRunner`: `cactus-core/src/main/java/com/dongkuk/dmes/cactus/oasis/task/MyBatisSqlRunner.java`
- cactus 의 `OasisAutoConfiguration`: `cactus-core/src/main/java/com/dongkuk/dmes/cactus/oasis/OasisAutoConfiguration.java`
