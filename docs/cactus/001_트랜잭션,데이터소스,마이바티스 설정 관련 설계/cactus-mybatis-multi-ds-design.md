# cactus-mybatis multi-DS 통합 설계 (P3: ScriptTask + ds/tx 속성)

> **DB 전제 안내 (2026-10-03)**: 이 문서의 「운영 = SQLServer 단일」(dialect 분기 불필요, mapper.xml 에 SQLServer 함수 사용 권장 등)은 dmes-ksm(MSSQL) 이관 시절 결정이다. 운영 DB 는 Oracle 또는 PostgreSQL 이고 MSSQL 은 거의 쓰지 않으므로, 새 mapper SQL 은 [`dialect-neutral-sql.md`](../../guide/Database/dialect-neutral-sql.md) 를 따르고 dialect 분기 필요 여부를 다시 판단한다. 아래 결정 표의 옛 행은 이력으로 남긴다.

> **본 문서의 책임**: cactus-core 가 BPMN ScriptTask 환경에서 multi-DS MyBatis 매퍼 호출을
> 호스트 boilerplate 0 으로 지원하는 설계 정본.
>
> **갱신 이력**
> - **2026-05-20 (v3.6)**: ι+κ+μ — 잔여 R-issue 일괄 해소 + docs/cactus 검증 완전성 확정.
>   (1) **R-cactus-audit-1 (ι)** — `OasisServiceExecutor.execute` 가 `sc.setAudit(audit)` 누락 → OASIS `CoreServiceStarter:96` 가 `AuditHolder.setAudit(serviceContext.audit() = null)` 으로 cactus 의 audit 을 null 로 덮어씀 → 모든 OASIS 경유 INSERT/UPDATE 의 `C_USR_ID/C_SVC_ID/C_PGM_ID/U_*` 컬럼 NULL. **1-line fix** (dmes-film 패턴 모방).
>   (2) **R-mybatis-13 (κ)** — multi-EMF 환경에서 `MasterCodeJpaAutoConfiguration` 의 `@Configuration` + `@EnableJpaRepositories(basePackages)` 가 timing 이슈로 Repository 빈 미등록 → `MasterCodeDecoder` 미등록 → `MasterCodeMybatisInterceptor` interceptors 목록 미attach → 디코딩 동작 안 함. **`@AutoConfiguration` + `entityManagerFactoryRef="entityManagerFactory"` + `transactionManagerRef="transactionManager"` 명시** 로 해소.
>   (3) **μ** — B-2/B-5/C-2/C-8 잔여 시나리오 검증 완료. R-cactus-doc-1 (CHANGELOG `^^` 표현 부정확) 신규 식별 + 정정.
> - **2026-05-19 (v3.5)**: ψ+Ω — JPA + MyBatis **혼용 실측 검증 완료**. 같은 process tx (txBiz) 안에서
>   ServiceTask + JPA Repository + ScriptTask + mapper 가 같은 Connection 공유 + ACID atomicity 완전 보장.
>   §13-1 (호환성) 강화 + ω default tx/ds 동작 §7-3 반영 (이전 갱신).
> - **2026-05-19 (v3.4)**: Phase 2 (π+σ) 완료 — multi-DS multi-tx mybatis 실측 검증 + 통합 BPMN.
>   (1) **R-mybatis-12 신규** — `CactusResponseConverter` 의 List<primitive> 처리 누락 → primitive 안전 wrap 으로 해소
>   (2) 통합 BPMN — film 의 `ExclusiveGateway + camunda:property name="input" value="action"` 패턴으로 단일 BPMN (run + rollback 분기) 검증 완료
>   (3) rollback 실측 — `multi-tx LIFO rollback` 으로 양쪽 DB atomicity 보장 검증 (biz INSERT 가 rollback 됨)
> - **2026-05-19 (v3.3)**: ζ+μ 단계 — cactus 구현 + mcm 부팅 실측. 3개 issue 발견·해소:
>   (1) mapperLocations 디폴트 `classpath:` → `classpath*:` (base 디렉토리 미존재 시 FileNotFoundException 회피)
>   (2) cactus-mybatis-config.xml 의 `<typeAlias alias="map">` 제거 (mybatis 기본 별칭 중복)
>   (3) **R-mybatis-11 신규** — `sqlSessionFactoryIf/Cmn` 의 `@ConditionalOnBean(name = "cactusDataSourceIf/Cmn")` BDRPP timing 이슈 → `@ConditionalOnProperty` 변경.
> - **2026-05-19 (v3.2)**: γ 단계 — 추가 source 검증 3건. R-mybatis-4 (DataSource 인스턴스 동일성) + R-mybatis-9 (SqlRunner 빈 충돌) + Q5 (호스트 의존 그래프) **모두 해소**. CactusMultiMybatisAutoConfiguration 의 `@AutoConfiguration(before = OasisAutoConfiguration.class)` 명시 추가.
> - **2026-05-19 (v3.1)**: A-0 단계 — Spring 7.0.7 source 직접 확인. R-mybatis-5 (JpaTxMgr dataSource 자동 추출) **100% 해소**. §9-0, §11, §17 갱신.
> - **2026-05-18 (v3)**: film 검증 후 P3 (ScriptTask + ds/tx) 노선으로 전면 재작성. v2 의 P2 (wrapper 빈) 폐기.
> - **2026-05-18 (v2)**: P2 (wrapper 빈) 첫 작성. 검증 결과 신규 추상화 위험 + film 에 검증 사례 없음 → 폐기.
> - **2026-05-18 (v1)**: 검증 시작.
>
> **관련 문서**
> - [`oasis-multi-tx-detailed-design.md`](./oasis-multi-tx-detailed-design.md) — multi-tx 상세 설계 (본 설계의 트랜잭션 join 전제)
> - [`oasis-multi-tx-design.md`](./oasis-multi-tx-design.md) — 상위 설계 + R-multi-* 위험 항목
> - [`oasis-sqlscript-multidatasource-design.md`](./oasis-sqlscript-multidatasource-design.md) — ScriptTask + multi-DS (본 설계 도입 시 Phase B 와 통합)
> - [`usage-guide.md`](./usage-guide.md) — 사용 가이드 (본 설계 반영 예정)

---

## 0. TL;DR

- **노선**: P3 — film 의 검증된 ScriptTask + mapper id 패턴 + cactus 측 multi-DS 분기 추가.
- **BPMN 표현**: `<scriptTask scriptFormat="sql" camunda:resource="{namespace}.{statementId}">` + `<camunda:property name="tx" value="txIF"/>` (또는 `ds="cactusDataSourceIf"`).
- **cactus 변경**: `MyBatisSqlRunner` 의 `dataSource` 파라미터 활용 (현재 무시) + multi-DS SqlSessionFactory/Template 자동 등록 + 인터셉터 직접 attach + 기존 InterceptorRegistrar 폐기.
- **호스트 변경**: 0 줄. mapper.xml 만 추가하면 됨.
- **디렉토리 컨벤션**: `src/main/resources/persistence/{serviceGroup}/{screen}.xml`.
- **dialect 분기**: 불필요 (운영 = SQLServer 단일).
- **Mapper interface**: 작성 불필요 (film 0개).
- **mapper id 형식 (film 호환)**: `{namespace}.{statementId}` (예: `security.objectManagement.insertObj`) 또는 prefix 명령 `{cmd},{namespace}.{statementId}` (예: `insert,security.objectManagement.insertObj`) — 단순 식별자는 select 로 간주.

---

## 1. 배경

### 1-1. 현재 의존 그래프 (substitute 구조)

`src/backend/settings.gradle` 가 모든 서브 모듈을 `includeBuild + dependencySubstitution` 으로 묶음.
호스트의 `api 'com.dongkuk.dmes:cactus-core:1.0.{버전}'` 선언은 **버전 무시 + 동일 cactus-core
프로젝트 코드로 substitute**. 즉 **cactus-core 한 곳을 고치면 모든 호스트가 다음 빌드부터 즉시 반영**.

| 모듈 | cactus 버전 표기 | mybatis 직접 의존 | SqlSessionFactory 빈 |
|---|---|---|---|
| mcm/lib | 1.0.20-SNAPSHOT | 없음 | 없음 |
| mpn/lib | 1.0.18-SNAPSHOT | 없음 | 없음 |
| mpp/lib | 1.0.18-SNAPSHOT | 없음 | 없음 |
| mqc/lib | 1.0.19-SNAPSHOT | 없음 | 없음 |
| serai      | (cactus 미사용) | mybatis-spring-boot-starter:3.0.5 | 자동 등록 |

### 1-2. cactus 의 MyBatis 기능 비활성 현황

cactus-core 는 MyBatis 핵심 기능 다수 보유 (`MasterCodeMybatisInterceptor`, `CactusMybatisAuditInterceptor`,
`SqlLoggingInterceptor`, `QueryController`, `LovController`, `MyBatisSqlRunner`). 모두
`@ConditionalOnClass(SqlSessionFactory.class) + @ConditionalOnBean(SqlSessionFactory.class)` 가드.

**호스트가 SqlSessionFactory 빈을 등록하지 않으면 위 기능 전부 비활성**. mcm/mpn/mpp/mqc 4개 호스트 모두 미등록 → cactus MyBatis 기능 **현재 0개 활성**.

### 1-3. 사용자 시나리오 — 화면 1본 단위 매퍼

> "매퍼가 화면 1본 단위로 만들어진다. 예: `Object-management 화면` ↔ `object-management.bpmn`
> ↔ `object-management.xml`. 따라서 매퍼별로 어느 DS (biz/cmn/if) 에 속하는지
> 미리 정의하기 어렵다."

본 설계의 해석:
- 매퍼 (xml) = 화면 1본의 모든 SQL statement 컨테이너
- 실제 DS 는 **statement 단위로 ScriptTask 의 ds/tx 속성** 으로 결정
- 매퍼 작성자는 statement 작성만, BPMN 작성자가 ds/tx 선택

### 1-4. 사용자 결정 사항

| 항목 | 결정 |
|---|---|
| **XML 위치** | `src/main/resources/persistence/{serviceGroup}/{screen}.xml` |
| **mapperLocations** | `classpath:persistence/**/*.xml` (단일 패턴) |
| **dialect 분기** | 불필요 (운영 = SQLServer 단일). MyBatis `<databaseId>` 미사용 |
| **Mapper interface** | **불필요** (film 검증된 0개 패턴) |
| **BPMN 호출 방식** | **ScriptTask + camunda:resource (mapper id)** — film 의 검증된 패턴 그대로 |

---

## 2. 핵심 발견 (film 검증 결과 반영)

### 2-1. film 의 mapper 호출 패턴 — ScriptTask + camunda:resource

film 의 모든 BPMN mapper 호출은 동일 패턴 (72개 mapper.xml + 다수 BPMN):

```xml
<bpmn:scriptTask scriptFormat="sql"
                 camunda:resource="mcm.mcm01020.findInventory">   <!-- mapper id -->
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="output" value="target"/>
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:scriptTask>
```

- `scriptFormat="sql"`
- `camunda:resource="{namespace}.{statementId}"`
- ServiceTask 가 아닌 **ScriptTask** 사용
- ServiceTask 는 도메인 객체 호출 전용 (`com.dongkuk.dmes.film.biz.mcm.mtm.Film#changeFilmPrgSts`)

→ ServiceTask = 도메인 로직, ScriptTask = SQL 호출 **책임 분리**.

### 2-2. OASIS 의 ScriptTask 처리 흐름

`oasis-core/.../executors/SqlScriptTaskExecutable.execute()` 의 분기 (line 97-107):

```java
if (sql != null) {
    // 인라인 SQL → JdbcTemplateSqlRunner 직접 new + dataSource 명시
    result = new JdbcTemplateSqlRunner().run(param, dataSource, columnConverter, sql);
} else if (sqlId != null) {
    // mapper id (camunda:resource) → SqlRunner 빈 1개 lookup
    List<TypedObject> typedObjects = executableContext.get(SqlRunner.class);
    if (typedObjects.size() != 1) {
        throw new RuntimeException("Although the SQL ID is set, the executable SqlRunner could not be found.");
    }
    result = typedObjects.get(0).getObject(SqlRunner.class).run(param, dataSource, sqlId);
}
```

**핵심**:
- 인라인 SQL → JdbcTemplateSqlRunner 매번 새로 생성 + dataSource 명시 (multi-DS 즉시 가능, Phase 7 pilot 검증됨)
- mapper id → **SqlRunner 빈 1개**만 lookup. 여러 개면 `RuntimeException`.
- 즉 **SqlRunner 빈 한 개가 dataSource 받아서 내부 분기** 해야 함.

### 2-3. OASIS 의 ds/tx 속성 처리

`SqlScriptTaskExecutable.execute():51-83`:

```java
TypedObject dataSourceNameObject = null;
TypedObject transactionManagerNameObject = null;
DataSource dataSource = null;
if (dataSourceName != null)
    dataSourceNameObject = executableContext.get(dataSourceName);
if (transactionManagerName != null)
    transactionManagerNameObject = executableContext.get(transactionManagerName);

if (dataSourceNameObject != null && transactionManagerNameObject != null)
    throw new IllegalArgumentException("Cannot retrieve the data source. Please input either [ds] or [tx] property.");

if (transactionManagerNameObject == null && dataSourceNameObject == null) {
    // default DataSource (DefaultDataSourceResolver) 사용
    List<TypedObject> defaultDataSourceResolvers = executableContext.get(DefaultDataSourceResolver.class);
    if (defaultDataSourceResolvers.size() == 1) {
        dataSource = defaultDataSourceResolvers.get(0).getObject(...).defaultDataSource();
    } else if (defaultDataSourceResolvers.size() > 1)
        throw new IllegalArgumentException("There are more than 2 default data sources.");
    else
        throw new IllegalArgumentException("Cannot retrieve the data source. ...");
}

dataSource = dataSource == null ?
        getDataSource(dataSourceNameObject, transactionManagerNameObject) :
        dataSource;
```

→ OASIS 가 자동으로:
- `tx="txIF"` → `executableContext.get("txIF")` → JpaTransactionManager.getDataSource() → DataSource 반환
- `ds="cactusDataSourceIf"` → executableContext.get("cactusDataSourceIf") → DataSource 빈 직접 반환
- 둘 다 없음 → DefaultDataSourceResolver 의 default DataSource 사용 (film 의 default = Biz 와 동일)

`DataSourceExtractorFromTransactionManager` 가 JpaTransactionManager 또는 DataSourceTransactionManager 에서 DataSource 추출.

### 2-4. SqlSessionTemplate 의 TX join 메커니즘 (mybatis-spring 3.0.5 source)

`SpringManagedTransaction.openConnection()`:

```java
private void openConnection() throws SQLException {
    this.connection = DataSourceUtils.getConnection(this.dataSource);   // ★★★
    this.autoCommit = this.connection.getAutoCommit();
    this.isConnectionTransactional = DataSourceUtils.isConnectionTransactional(this.connection, this.dataSource);
}
```

→ MyBatis SqlSession 이 Connection 획득 시 `DataSourceUtils.getConnection(dataSource)`:
1. `TransactionSynchronizationManager.getResource(dataSource)` 조회
2. ConnectionHolder 있음 → 그 Connection 재사용 (★ **TX join**)
3. 없음 → 새 Connection 발급 (autocommit, 별 TX)

→ **JpaTxMgr 가 ConnectionHolder 를 같은 dataSource 기준으로 bind 해야 join 가능**.

### 2-5. ★★★ JpaTransactionManager 의 dataSource 자동 추출 (Spring 6.x 표준)

Spring `JpaTransactionManager.afterPropertiesSet()`:

```java
@Override
public void afterPropertiesSet() {
    if (getEntityManagerFactory() == null) { ... }
    if (getEntityManagerFactory() instanceof EntityManagerFactoryInfo emfInfo) {
        DataSource dataSource = emfInfo.getDataSource();
        if (dataSource != null) {
            setDataSource(dataSource);   // ★★★ 자동 추출 + 설정
        }
    }
}
```

`LocalContainerEntityManagerFactoryBean.getObject()` = `EntityManagerFactoryInfo + EntityManagerFactory` proxy → `instanceof EntityManagerFactoryInfo` true → **dataSource 자동 추출**.

→ cactus 의 `new JpaTransactionManager(emf)` 도 Spring 빈 lifecycle (afterPropertiesSet) 통과 시 자동 setDataSource → **SqlSessionTemplate TX join 정상 동작**.

→ film 의 multi-DS 패턴이 동작하는 이유 + 본 설계의 트랜잭션 join 보장의 근거.

### 2-6. cactus 의 현재 MyBatisSqlRunner 의 핵심 한계

`cactus/.../oasis/task/MyBatisSqlRunner.java`:

```java
public class MyBatisSqlRunner implements SqlRunner {
    private final SqlSession sqlSession;   // ★ 단일 주입

    public TypedObject run(Map<String, Object> parameters, DataSource dataSource, String identifier) {
        // ★ dataSource 파라미터 받지만 무시
        // 항상 자신의 sqlSession 만 사용
        switch (cmd) {
            case "insert": result = sqlSession.insert(...);
            ...
        }
    }
}
```

→ **multi-DS 분기 불가능**. 본 설계의 핵심 수정 대상.

### 2-7. film 의 인터셉터 attach 패턴 (검증된 운영 표준)

film 의 `BizDataAccessConfig.sqlSessionFactoryBiz()`:

```java
SqlSessionFactoryBean sqlSessionFactoryBean = new SqlSessionFactoryBean();
sqlSessionFactoryBean.setDataSource(dataSource);
sqlSessionFactoryBean.setPlugins(
    new MybatisSqlLogger(),                       // ← 직접 new
    new MybatisAudit(),                           // ← 직접 new
    new MasterCodeIntercept(masterCodeDecoder)    // ← 직접 new (decoder 주입)
);
sqlSessionFactoryBean.setMapperLocations(...);
sqlSessionFactoryBean.setConfigLocation(...);   // mybatis-config.xml
```

→ 인터셉터를 `@Bean` 으로 등록하지 않고 SqlSessionFactoryBean 안에서 **직접 new**.
→ DS 별로 인터셉터 조합 자유 (Biz=3개, Frm/Mail=SqlLogger 만).

본 설계는 같은 패턴 채택:
- cactus 가 SqlSessionFactoryBean 생성 시 setPlugins() 로 직접 attach
- 기존 `AuditAutoConfiguration.MybatisAuditAutoConfiguration` / `MasterCodeMybatisAutoConfiguration.InterceptorRegistrar` 폐기 (단일 SqlSessionFactory 가정이라 multi-DS 에서 cmn/if 에 attach 안 됨)

---

## 3. 설계 결정 사항

### 3-1. 결정 매트릭스

| 결정 항목 | 선택 | 근거 |
|---|---|---|
| Mapper interface 작성 | **하지 않음** (P2/P4 와 동일) | film 의 검증된 0개 패턴. 화면 1본 단위 매퍼 작성 부담 ↓ |
| BPMN 호출 방식 | **ScriptTask + camunda:resource** | film 의 5년+ 운영 검증된 패턴 |
| multi-DS 분기 메커니즘 | **ScriptTask 의 ds/tx 속성 (OASIS 표준)** | OASIS 가 이미 지원 (PropertyNames.DATA_SOURCE/TRANSACTION_MANAGER_NAME) |
| cactus MyBatisSqlRunner 수정 | **dataSource 파라미터 활용 + SqlSessionTemplate 동적 선택** | OASIS 가 이미 DataSource 추출 완료. cactus 만 사용 |
| mapper.xml 위치 | `persistence/{serviceGroup}/{screen}.xml` | `services/{serviceGroup}/` 와 페어링 |
| mapperLocations 패턴 | `classpath:persistence/**/*.xml` 단일 | 모든 DS 가 같은 xml 로드 (운영 단일 dialect) |
| SqlSessionFactory 등록 주체 | **cactus 자동 등록** | 호스트 boilerplate 0 |
| SqlSessionFactory 개수 | 3개 (biz/cmn/if) | cactus 의 multi-DS 표준 (옵션 δ) 정합 |
| 인터셉터 attach 방식 | **setPlugins() 직접 new** | film 패턴 정합. 기존 InterceptorRegistrar 폐기 |
| mybatis-config.xml | 사용 (film 패턴) | `mapUnderscoreToCamelCase`, `cacheEnabled=false`, typeAliases 등 |
| statement id 명명 | `{serviceGroup}.{screen}.{statementName}` | film 패턴 (`mcm.mcm01020.findInventory`) 와 정합 |
| dialect 분기 | **없음** | 운영 = SQLServer 단일 |
| Phase B (oasis-sqlscript-multidatasource-design) | **본 설계와 통합** | 본 설계가 Phase B 의 본질 (MyBatisSqlRunner 의 dataSource 활용) |

### 3-2. 대안 비교 — 왜 P3 인가

| 옵션 | 매퍼 작성 부담 | type-safe | 호스트 변경 | cactus 변경 | film 검증 | BPMN 표현 |
|---|---|---|---|---|---|---|
| **P1** Mapper Interface + @MapperScan 3중 | xml + interface | ★ | Config 2~3개 | nameGenerator 3개 | film 미적용 | `bizXxxMapper#insert` |
| **P2** wrapper 빈 | xml 만 | ✗ | 0 | wrapper 빈 3개 | **film 미적용 — 신규** | `cactusMapperBiz + method=insert + input=stmt,params` |
| **P3** ★ ScriptTask + ds/tx | xml 만 | ✗ | 0 | MyBatisSqlRunner 수정 + SqlSessionFactory 자동 등록 | **★ film 5년+ 운영** | `<scriptTask scriptFormat="sql" camunda:resource="..." + tx="txIF">` |
| **P4** SqlSessionTemplate 직접 | xml 만 | ✗ | 0 | 빈만 등록 | film 부분 (REST 컨트롤러에서만) | `sqlSessionTemplateBiz + method=selectList` |

**P3 선택 이유**:
- ★ **film 의 5년+ 운영 검증** — ScriptTask + mapper id 패턴은 이미 표준
- ScriptTask 와 ServiceTask 의 책임 분리 (ScriptTask=SQL, ServiceTask=도메인 로직) 가 명확
- BPMN 표현 가장 간결 (`scriptFormat="sql" camunda:resource=...` 2~3줄)
- cactus 코드 수정 최소 (MyBatisSqlRunner 의 dataSource 활용만)
- OASIS 의 표준 ds/tx 속성 활용 (custom wrapper 추상화 없음)
- 호스트 boilerplate 0

**P2 폐기 이유**:
- film 에 검증 사례 없음 — 신규 추상화
- wrapper 빈 학습 곡선
- methodInvoker 의 stmt+params 매핑 미검증 (String JSON 가정)
- ServiceTask 안에서 SQL 호출하는 패턴이 film 컨벤션과 충돌

---

## 4. 아키텍처

### 4-1. 빈 등록 흐름 (부팅 시)

```
[Spring Boot 부팅]
    ↓
[cactus.datasource.extras.{name} yml 감지]
    ↓
CactusMultiDataSourceAutoConfiguration (BDRPP)
    → cactusDataSourceIf (extras DS 빈 등록)
    → primary dataSource (alias='biz')
    ↓
CactusMultiJpaAutoConfiguration (BDRPP)
    → cactusEntityManagerFactoryIf
    → cactusTransactionManagerIf  (JpaTransactionManager(emf))
        → Spring afterPropertiesSet() 가 EMF.getDataSource() 자동 추출 + setDataSource() 호출
        → ConnectionHolder bind 가능 상태
    ↓
CactusMultiTransactionManagerAutoConfiguration (BDRPP)
    → txBiz / txCmn / txIF alias (cactus.tx.managers 기반)
    → default-manager = txBiz @Primary
    ↓
[★ 신규] CactusMultiMybatisAutoConfiguration  ← 본 설계
    → sqlSessionFactoryBiz   (dataSource 기반, setPlugins + setMapperLocations + setConfigLocation)
    → sqlSessionFactoryCmn   (cactusDataSourceCmn 기반, 있을 시)
    → sqlSessionFactoryIf    (cactusDataSourceIf 기반)
    → sqlSessionTemplateBiz / Cmn / If
    ↓
[★ 신규] CactusMultiMyBatisSqlRunner  ← 본 설계 (MyBatisSqlRunner 의 multi-DS 분기 버전)
    → SqlRunner 빈 1개 (multi-DS 분기 내장)
    → @ConditionalOnMissingBean 으로 기존 단일 SqlRunner 와 양립
    ↓
[기존 OasisAutoConfiguration.sqlRunner @Bean — 폐기 또는 @ConditionalOnMissingBean 유지]
    ↓
OasisAutoConfiguration
    → ServiceStarter + ClassPath BPMN 로더
    → CactusCachingServiceProvider
    ↓
[부팅 완료] BPMN 호출 가능
```

### 4-2. BPMN ScriptTask 호출 흐름 (런타임)

```
[POST /oasis/{serviceId}/{action}]
    ↓
cactus OasisServiceExecutor
    → SpringApplicationContext(applicationContext) wrap
    → ServiceContext 생성
    ↓
process tx="txBiz,txIF" 명시 (cactus multi-tx 표준)
    → DataSourceTransactionManager(txBiz) begin
    → DataSourceTransactionManager(txIF)  begin
    (LIFO 큐 + TSM 에 ConnectionHolder bind by dataSource)
    ↓
[ScriptTask t1] <scriptTask scriptFormat="sql" camunda:resource="security.objectManagement.insertObj">
                  + <camunda:property name="tx" value="txBiz"/>     <!-- 또는 생략 → default -->
    → SqlScriptTaskExecutable.execute()
    → executableContext.get("txBiz") → cactus 의 txBiz alias → JpaTransactionManager
    → DataSourceExtractorFromTransactionManager.getDataSource() → biz DataSource
    → SqlRunner 빈 lookup → CactusMultiMyBatisSqlRunner (1개)
    → cactusMultiMyBatisSqlRunner.run(params, bizDataSource, "security.objectManagement.insertObj")
        → biz dataSource → sqlSessionTemplateBiz 선택 (내부 매핑)
        → sqlSessionTemplateBiz.selectList("security.objectManagement.insertObj", params)
            → SqlSessionUtils.getSqlSession(sqlSessionFactoryBiz) → SqlSession
            → SpringManagedTransaction.openConnection()
                → DataSourceUtils.getConnection(bizDataSource)
                → TSM 조회 → 활성 biz Transaction 의 ConnectionHolder 발견 → 그 Connection 재사용
            → mapper.xml 의 statement 실행 (인터셉터 적용)
    → 반환값 → ServiceContext output 변수 저장
    ↓
[ScriptTask t2] <scriptTask scriptFormat="sql" camunda:resource="security.objectManagement.insertIfSync">
                  + <camunda:property name="tx" value="txIF"/>
    → 동일 흐름 → if dataSource → sqlSessionTemplateIf → if TX 자동 join
    ↓
[process end]
    → Transaction[txIF] commit  (LIFO)
    → Transaction[txBiz] commit
    ↓
[응답] CactusResponse JSON
```

### 4-3. 트랜잭션 join 메커니즘 (단계별)

핵심 보장: **SqlSessionTemplate 이 활성 TX 의 같은 Connection 재사용** (별 트랜잭션 회피).

```
1. cactus multi-tx 가 process tx="txBiz,txIF" 파싱
2. cactusTransactionManagerBiz.doBegin() (실제 JpaTransactionManager)
   - JpaTransactionManager.afterPropertiesSet() 이 이미 setDataSource(bizDataSource) 호출 완료
   - EntityManager 생성 + bindResource(emf, em)
   - Connection 추출 + bindResource(bizDataSource, ConnectionHolder)   ← ★ 핵심
3. cactusTransactionManagerIf.doBegin() 동일
   - bindResource(cactusDataSourceIf, ConnectionHolder)
4. ScriptTask 실행 → MyBatisSqlRunner.run(params, dataSource=biz, "...")
   - dataSource 기반으로 sqlSessionTemplateBiz 선택
5. SqlSessionTemplate.selectList(...)
   - SqlSessionUtils.getSqlSession(sqlSessionFactoryBiz):
     - TSM.getResource(sqlSessionFactoryBiz) → 없으면 새 SqlSession 생성
     - SpringManagedTransaction(bizDataSource) 생성
   - SqlSession.selectList(stmt, params)
     - SpringManagedTransaction.getConnection() → openConnection()
       - DataSourceUtils.getConnection(bizDataSource)
       - TSM.getResource(bizDataSource) → step 2 에서 bind 한 ConnectionHolder 발견 ← ★
       - 그 Connection 반환 (같은 biz TX 참여)
   - statement 실행
6. ScriptTask 종료 → SqlSession 은 SqlSessionHolder 로 TSM 에 등록 (다음 호출 시 재사용)
7. process end → commit:
   - cactusTransactionManagerIf.commit() → TSM 에서 ConnectionHolder 추출 → Connection.commit()
   - cactusTransactionManagerBiz.commit() (LIFO)
   - SqlSessionHolder 도 TSM 에서 정리
```

**보장 조건**:
- JpaTransactionManager.afterPropertiesSet() 이 dataSource 자동 setDataSource (Spring 표준)
- SqlSessionTemplate 의 SqlSessionFactory 가 같은 dataSource 사용
- ScriptTask 의 ds/tx 속성으로 OASIS 가 추출한 dataSource 와 SqlSessionTemplate 의 dataSource 가 일치

---

## 5. 구현 상세 — cactus-core

### 5-1. `cactus-core/build.gradle` 변경

```gradle
dependencies {
    // ... 기존 ...

    // ── MyBatis (감사 인터셉터용) ──
-    compileOnly 'org.mybatis:mybatis:3.5.16'
+    api 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.4'  // mybatis + mybatis-spring + autoconfig
}
```

**영향**:
- 모든 cactus 사용 호스트 (mcm/mpn/mpp/mqc) 가 다음 빌드부터 mybatis 자동 포함 (~3MB transitive)
- serai 는 cactus 미사용 → 영향 0 (현재 3.0.5 그대로)
- 기존 mybatis-spring 3.0.4 와 호환

### 5-2. `CactusMybatisProperties` 신규

```java
// cactus-core/.../mybatis/CactusMybatisProperties.java
package com.dongkuk.dmes.cactus.mybatis;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "cactus.mybatis")
public class CactusMybatisProperties {

    /** mybatis 자동 활성 여부 (디폴트 true). */
    private boolean enabled = true;

    /** mapper.xml location 패턴. 디폴트 = classpath:persistence/**\/*.xml */
    private String mapperLocations = "classpath:persistence/**/*.xml";

    /** mybatis-config.xml 위치 (선택). 디폴트 = classpath:cactus-mybatis-config.xml (cactus 가 제공). */
    private String configLocation = "classpath:cactus-mybatis-config.xml";

    /** MasterCode 디코딩 활성 여부 (디폴트 true). */
    private MasterCodeDecoding masterCodeDecoding = new MasterCodeDecoding();

    public static class MasterCodeDecoding {
        private boolean enabled = true;
        // getters/setters
    }
    // getters/setters
}
```

### 5-3. `cactus-mybatis-config.xml` (cactus 가 제공하는 기본 설정)

`cactus-core/src/main/resources/cactus-mybatis-config.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE configuration PUBLIC "-//mybatis.org//DTD Config 3.0//EN" "http://mybatis.org/dtd/mybatis-3-config.dtd">
<configuration>
    <settings>
        <setting name="callSettersOnNulls" value="true"/>
        <setting name="mapUnderscoreToCamelCase" value="true"/>
        <setting name="cacheEnabled" value="false"/>
        <setting name="jdbcTypeForNull" value="NULL"/>
        <setting name="localCacheScope" value="STATEMENT"/>
    </settings>
    <typeAliases>
        <typeAlias type="java.util.HashMap" alias="map"/>
    </typeAliases>
</configuration>
```

→ film 의 mybatis-config.xml 과 동일 설정. typeAliases 는 호스트가 필요시 추가 override.

### 5-4. `CactusMultiMybatisAutoConfiguration` 신규

```java
// cactus-core/.../mybatis/CactusMultiMybatisAutoConfiguration.java
package com.dongkuk.dmes.cactus.mybatis;

import com.dongkuk.dmes.cactus.audit.CactusMybatisAuditInterceptor;
import com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor;
import com.dongkuk.dmes.cactus.datasource.CactusMultiDataSourceAutoConfiguration;
import com.dongkuk.dmes.cactus.jpa.CactusMultiJpaAutoConfiguration;
import com.dongkuk.dmes.cactus.mastercode.MasterCodeDecoder;
import com.dongkuk.dmes.cactus.mastercode.MasterCodeMybatisInterceptor;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;

@AutoConfiguration(
    after = {
        CactusMultiDataSourceAutoConfiguration.class,
        CactusMultiJpaAutoConfiguration.class
    },
    before = OasisAutoConfiguration.class    // ★ γ 검증 (R-mybatis-9): 본 설계 SqlRunner 가 기존보다 먼저 등록
)
@ConditionalOnClass({SqlSessionFactory.class, SqlSessionFactoryBean.class})
@ConditionalOnProperty(prefix = "cactus.mybatis", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(CactusMybatisProperties.class)
public class CactusMultiMybatisAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(CactusMultiMybatisAutoConfiguration.class);

    // ── biz SqlSessionFactory (primary = dataSource) ──
    @Bean("sqlSessionFactoryBiz")
    @Primary
    @ConditionalOnBean(name = "dataSource")
    public SqlSessionFactory sqlSessionFactoryBiz(
            @Qualifier("dataSource") DataSource ds,
            ObjectProvider<MasterCodeDecoder> decoderProvider,
            CactusMybatisProperties props,
            ResourceLoader rl) throws Exception {
        return build("biz", ds, decoderProvider.getIfAvailable(), props, rl);
    }

    // ── if SqlSessionFactory ──
    // R-mybatis-11 (2026-05-19, v3.3): @ConditionalOnBean(name = "cactusDataSourceIf") 는
    // BDRPP (CactusMultiDataSourceAutoConfiguration) 가 등록한 빈을 ConfigurationClass 평가 시점에
    // detect 못 함 → @ConditionalOnProperty 로 변경 (yml 기반 — timing 무관 + 의도 명확).
    @Bean("sqlSessionFactoryIf")
    @ConditionalOnProperty(prefix = "cactus.datasource.extras.if", name = "url")
    public SqlSessionFactory sqlSessionFactoryIf(
            @Qualifier("cactusDataSourceIf") DataSource ds,
            ObjectProvider<MasterCodeDecoder> decoderProvider,
            CactusMybatisProperties props,
            ResourceLoader rl) throws Exception {
        return build("if", ds, decoderProvider.getIfAvailable(), props, rl);
    }

    // ── cmn SqlSessionFactory ──
    @Bean("sqlSessionFactoryCmn")
    @ConditionalOnProperty(prefix = "cactus.datasource.extras.cmn", name = "url")
    public SqlSessionFactory sqlSessionFactoryCmn(
            @Qualifier("cactusDataSourceCmn") DataSource ds,
            ObjectProvider<MasterCodeDecoder> decoderProvider,
            CactusMybatisProperties props,
            ResourceLoader rl) throws Exception {
        return build("cmn", ds, decoderProvider.getIfAvailable(), props, rl);
    }

    // ── SqlSessionTemplate biz/cmn/if ──
    @Bean("sqlSessionTemplateBiz")
    @Primary
    public SqlSessionTemplate sqlSessionTemplateBiz(
            @Qualifier("sqlSessionFactoryBiz") SqlSessionFactory sf) {
        return new SqlSessionTemplate(sf);
    }

    @Bean("sqlSessionTemplateIf")
    @ConditionalOnBean(name = "sqlSessionFactoryIf")
    public SqlSessionTemplate sqlSessionTemplateIf(
            @Qualifier("sqlSessionFactoryIf") SqlSessionFactory sf) {
        return new SqlSessionTemplate(sf);
    }

    @Bean("sqlSessionTemplateCmn")
    @ConditionalOnBean(name = "sqlSessionFactoryCmn")
    public SqlSessionTemplate sqlSessionTemplateCmn(
            @Qualifier("sqlSessionFactoryCmn") SqlSessionFactory sf) {
        return new SqlSessionTemplate(sf);
    }

    /**
     * film 패턴 그대로 — SqlSessionFactoryBean 생성 시 인터셉터 직접 new + setPlugins().
     * 기존 cactus 의 AuditAutoConfiguration / MasterCodeMybatisAutoConfiguration 의
     * InterceptorRegistrar 는 단일 SqlSessionFactory 가정이라 multi-DS 에서 cmn/if 에 attach 안 됨.
     * 본 메서드가 attach 책임 전담.
     */
    private SqlSessionFactory build(String alias, DataSource ds, MasterCodeDecoder decoder,
                                     CactusMybatisProperties props, ResourceLoader rl) throws Exception {
        SqlSessionFactoryBean bean = new SqlSessionFactoryBean();
        bean.setDataSource(ds);
        bean.setMapperLocations(
            new PathMatchingResourcePatternResolver(rl).getResources(props.getMapperLocations())
        );
        if (props.getConfigLocation() != null) {
            bean.setConfigLocation(rl.getResource(props.getConfigLocation()));
        }

        // ── 인터셉터 직접 new + setPlugins (film 패턴) ──
        List<Interceptor> interceptors = new ArrayList<>();
        interceptors.add(new SqlLoggingInterceptor());            // 외부 (로깅)
        interceptors.add(new CactusMybatisAuditInterceptor());    // 중간 (감사)
        if (props.getMasterCodeDecoding().isEnabled() && decoder != null) {
            interceptors.add(new MasterCodeMybatisInterceptor(decoder));  // 내부 (결과 디코딩)
        }
        bean.setPlugins(interceptors.toArray(new Interceptor[0]));

        log.info("[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactory{}' ds='{}' " +
                 "mapperLocations='{}' interceptors={}",
                 capitalize(alias), describeDataSource(ds), props.getMapperLocations(),
                 interceptors.stream().map(i -> i.getClass().getSimpleName()).toList());

        return bean.getObject();
    }

    private static String capitalize(String s) {
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
    private static String describeDataSource(DataSource ds) {
        return ds.getClass().getSimpleName() + "@" + Integer.toHexString(System.identityHashCode(ds));
    }
}
```

### 5-5. `CactusMultiMyBatisSqlRunner` 신규 (multi-DS 분기)

```java
// cactus-core/.../oasis/task/CactusMultiMyBatisSqlRunner.java
package com.dongkuk.dmes.cactus.oasis.task;

import com.dongkuk.dmes.cactus.oasis.util.CaseConverter;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.executors.SqlRunner;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ResultMap;
import org.apache.ibatis.session.SqlSession;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.util.TypeUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.lang.reflect.Type;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * cactus multi-DS 환경의 MyBatisSqlRunner.
 *
 * <p>OASIS 의 SqlScriptTask 가 ds/tx 속성으로 DataSource 추출 후 본 runner 의
 * {@link #run(Map, DataSource, String)} 에 전달. 본 runner 가 dataSource 기준으로
 * SqlSessionTemplate 동적 선택 후 mapper id 호출.
 *
 * <p>film 의 MyBatisSqlRunner identifier 형식 호환 유지:
 * <ul>
 *   <li>{@code "<mapperId>"} — select 로 간주 (Map 이면 camelCase 변환)</li>
 *   <li>{@code "insert,<mapperId>"} / {@code "update,..."} / {@code "delete,..."} — 명시 명령</li>
 * </ul>
 */
public class CactusMultiMyBatisSqlRunner implements SqlRunner {

    private static final Logger log = LoggerFactory.getLogger(CactusMultiMyBatisSqlRunner.class);

    private final BeanFactory beanFactory;
    private final SqlSessionTemplate defaultTemplate;   // primary = sqlSessionTemplateBiz
    private final Map<DataSource, SqlSessionTemplate> cache = new ConcurrentHashMap<>();

    public CactusMultiMyBatisSqlRunner(BeanFactory beanFactory, SqlSessionTemplate defaultTemplate) {
        this.beanFactory = beanFactory;
        this.defaultTemplate = defaultTemplate;
    }

    @Override
    public TypedObject run(Map<String, Object> parameters, DataSource dataSource, String identifier) {
        SqlSessionTemplate session = resolveSession(dataSource);
        String[] split = identifier.split(",");
        int result;

        if (split.length == 2) {
            String cmd = split[0].toLowerCase();
            String mapperId = split[1];
            switch (cmd) {
                case "insert":
                    result = session.insert(mapperId, parameters);
                    return returnResult(session, result);
                case "update":
                    result = session.update(mapperId, parameters);
                    return returnResult(session, result);
                case "delete":
                    result = session.delete(mapperId, parameters);
                    return returnResult(session, result);
                default:
                    return returnResult(session,
                            changeKeyCaseToCamel(session.selectList(mapperId, parameters)),
                            new TypeReference<List<Map<String, Object>>>() {}.getType());
            }
        }

        // 단일 토큰 → select
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

    /**
     * dataSource → SqlSessionTemplate 매핑.
     * cactus 가 등록한 sqlSessionTemplate{Biz,Cmn,If} 빈 중에서 dataSource 가 같은 것 선택.
     */
    private SqlSessionTemplate resolveSession(DataSource dataSource) {
        if (dataSource == null) return defaultTemplate;
        return cache.computeIfAbsent(dataSource, ds -> {
            // ApplicationContext 에서 모든 SqlSessionTemplate 빈 조회
            Map<String, SqlSessionTemplate> templates =
                    ((org.springframework.beans.factory.ListableBeanFactory) beanFactory)
                    .getBeansOfType(SqlSessionTemplate.class);
            for (Map.Entry<String, SqlSessionTemplate> entry : templates.entrySet()) {
                DataSource templateDs = entry.getValue().getConfiguration()
                        .getEnvironment().getDataSource();
                if (templateDs == ds) {
                    log.debug("[Cactus Mybatis] ds={} → SqlSessionTemplate '{}'",
                            describeDs(ds), entry.getKey());
                    return entry.getValue();
                }
            }
            throw new IllegalStateException(
                    "No SqlSessionTemplate matching DataSource: " + describeDs(ds));
        });
    }

    private TypedObject returnResult(SqlSessionTemplate session, Object object) {
        session.clearCache();
        return new TypedObject(object);
    }

    private TypedObject returnResult(SqlSessionTemplate session, Object object, Type type) {
        session.clearCache();
        return new TypedObject(object, type);
    }

    private List<Map<String, Object>> changeKeyCaseToCamel(List<Map<String, Object>> objects) {
        List<Map<String, Object>> newList = new ArrayList<>(objects.size());
        for (Map<String, Object> object : objects) {
            Map<String, Object> newMap = new HashMap<>(object.size() * 2);
            for (Map.Entry<String, Object> e : object.entrySet()) {
                newMap.put(CaseConverter.toCamelCase(e.getKey()), e.getValue());
            }
            newList.add(newMap);
        }
        return newList;
    }

    private Class<?> getResultType(SqlSession session, String mapperId) {
        MappedStatement mappedStatement = session.getConfiguration().getMappedStatement(mapperId);
        List<ResultMap> resultMaps = mappedStatement.getResultMaps();
        if (resultMaps.isEmpty()) {
            throw new IllegalStateException(
                    "[" + mapperId + "] 매퍼에서 resultType 을 찾을 수 없습니다. " +
                    "select 가 아닌 문장(insert/update/delete) 을 호출했다면 식별자 앞에 명령어를 " +
                    "붙이고 ',(콤마)' 뒤에 매퍼 ID 를 작성하세요. 예: \"insert,security.objectManagement.insertObj\"");
        }
        return resultMaps.get(0).getType();
    }

    private static String describeDs(DataSource ds) {
        return ds.getClass().getSimpleName() + "@" + Integer.toHexString(System.identityHashCode(ds));
    }
}
```

### 5-6. SqlRunner 빈 등록 (CactusMultiMybatisAutoConfiguration 에 추가)

```java
// CactusMultiMybatisAutoConfiguration 내부에 추가
@Bean
@ConditionalOnMissingBean(SqlRunner.class)
@ConditionalOnBean(name = "sqlSessionTemplateBiz")
public SqlRunner cactusMultiMyBatisSqlRunner(
        BeanFactory beanFactory,
        @Qualifier("sqlSessionTemplateBiz") SqlSessionTemplate defaultTemplate) {
    log.info("[Cactus Mybatis] CactusMultiMyBatisSqlRunner registered (multi-DS aware)");
    return new CactusMultiMyBatisSqlRunner(beanFactory, defaultTemplate);
}
```

→ `@ConditionalOnMissingBean(SqlRunner.class)` — 기존 `OasisAutoConfiguration.sqlRunner` 와 양립. 기존 빈이 등록되면 본 빈 skip.
→ 본 설계 도입 시 기존 OasisAutoConfiguration 의 `sqlRunner` @Bean 제거 또는 `@ConditionalOnMissingBean` 평가 순서 명확화 필요.

### 5-7. 기존 cactus 코드 정리 (필수)

다음 파일들의 InterceptorRegistrar 폐기 — multi-DS 환경에서 cmn/if SqlSessionFactory 에 인터셉터 attach 누락 방지:

**`AuditAutoConfiguration.java`** — `MybatisAuditAutoConfiguration` + `MybatisSqlLoggingAutoConfiguration` 내부 static class **삭제** (본 설계의 `CactusMultiMybatisAutoConfiguration.build()` 가 attach 책임 전담).

**`MasterCodeMybatisAutoConfiguration.java`** — `InterceptorRegistrar` 내부 static class **삭제**.

단 `DefaultMasterCodeDecoder` 빈 등록은 유지 (본 설계가 decoder 빈 주입).

**`OasisAutoConfiguration.java:192-197`** — 기존 `sqlRunner(SqlSession sqlSession)` @Bean 제거 또는 `@ConditionalOnMissingBean(SqlRunner.class)` 가드 유지 (본 설계의 `CactusMultiMyBatisSqlRunner` 가 우선되도록).

### 5-8. AutoConfiguration imports 등록

```
# cactus-core/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
+com.dongkuk.dmes.cactus.mybatis.CactusMultiMybatisAutoConfiguration
```

### 5-9. 활성 조건 정리

| 빈 | 활성 조건 |
|---|---|
| `sqlSessionFactoryBiz` | `dataSource` 빈 존재 |
| `sqlSessionFactoryIf` | `cactusDataSourceIf` 빈 존재 (cactus.datasource.extras.if yml) |
| `sqlSessionFactoryCmn` | `cactusDataSourceCmn` 빈 존재 |
| `sqlSessionTemplate*` | 위의 SqlSessionFactory 빈 존재 |
| `CactusMultiMyBatisSqlRunner` (SqlRunner) | `sqlSessionTemplateBiz` 존재 + 기존 SqlRunner 빈 없음 |

→ 호스트의 yml 정의 (`cactus.datasource.extras.*`) 에 따라 빈 등록이 자연 분기.

---

## 6. 디렉토리 구조 + 명명 컨벤션

### 6-1. resources 디렉토리 구조 (확정)

```
src/main/resources/
├── persistence/
│   ├── security/
│   │   ├── object-management.xml
│   │   ├── user-management.xml
│   │   ├── role-management.xml
│   │   └── menu-management.xml
│   ├── master/
│   │   ├── code-category.xml
│   │   └── master-codes.xml
│   └── pilot/
│       └── pilot-multi-tx.xml
└── services/
    ├── security/
    │   └── userMgmtSave.bpmn
    ├── master/
    │   └── codeCategoryUpsert.bpmn
    └── pilot/
        └── pilotMultiTx.bpmn
```

→ `services/{serviceGroup}/{serviceId}.bpmn` 과 `persistence/{serviceGroup}/{screen}.xml` 가 같은 serviceGroup 폴더 안에서 페어링.

### 6-2. mapper.xml namespace 규칙

```xml
<!-- persistence/security/object-management.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="security.objectManagement">

  <insert id="insertObj" parameterType="map">
    INSERT INTO TB_SEC_OBJ (OBJ_ID, OBJ_NM, OBJ_TYPE, SYS_CD, USE_YN)
    VALUES (#{objId}, #{objNm}, 'SCREEN', #{sysCd}, 'Y')
  </insert>

  <select id="selectAll" resultType="map">
    SELECT OBJ_ID, OBJ_NM, OBJ_TYPE, SYS_CD, USE_YN FROM TB_SEC_OBJ
  </select>

  <insert id="insertIfSync" parameterType="map">
    INSERT INTO IF_OBJECT_SYNC (INTERFACE_ID, PAYLOAD, CREATED_AT)
    VALUES (#{interfaceId}, #{payload}, GETDATE())
  </insert>

</mapper>
```

→ namespace = `{serviceGroup}.{screen}` (kebab-case → camelCase). statement id = `{name}`.

### 6-3. statement id 명명 (film 패턴)

호출 시 full id = `{namespace}.{statementId}`:
- `security.objectManagement.insertObj`
- `security.objectManagement.selectAll`
- `security.objectManagement.insertIfSync`
- `pilot.pilotMultiTx.recordBizLog`

film 의 실제 사용 예 (검증):
- `mcm.mcm01020.findInventory`
- `mls.topic.fmlsdspp0001.g3select`
- `mpn.sch.scheduledMtlIds`

BPMN 의 `camunda:resource` 에 그대로 명시.

### 6-4. BPMN 디렉토리 (services/) 와의 정합성

```
persistence/security/object-management.xml    ← XML 5 statement
services/security/objectSearch.bpmn           ← 조회 BPMN (security.objectManagement.selectAll 호출)
services/security/objectSave.bpmn             ← 저장 BPMN (security.objectManagement.insertObj 호출)
services/security/objectDelete.bpmn           ← 삭제 BPMN
```

화면 1본 = mapper xml 1본 + BPMN N본 (action 별).

---

## 7. BPMN 작성 패턴

### 7-1. ScriptTask 표준 (film 패턴 그대로)

```xml
<bpmn:scriptTask id="t1"
                 name="오브젝트 저장"
                 scriptFormat="sql"
                 camunda:resource="insert,security.objectManagement.insertObj">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txBiz"/>     <!-- 또는 ds, 또는 생략 (default) -->
      <camunda:property name="output" value="affectedRows"/>
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:scriptTask>
```

### 7-2. camunda:resource 의 식별자 형식

| 식별자 형식 | 동작 | 예시 |
|---|---|---|
| `{namespace}.{statementId}` | select (단일 토큰) | `security.objectManagement.selectAll` |
| `insert,{namespace}.{statementId}` | INSERT | `insert,security.objectManagement.insertObj` |
| `update,{namespace}.{statementId}` | UPDATE | `update,security.objectManagement.updateStatus` |
| `delete,{namespace}.{statementId}` | DELETE | `delete,security.objectManagement.deleteById` |

→ select 는 prefix 불필요 (cactus MyBatisSqlRunner 의 기존 분기 로직 유지).
→ INSERT/UPDATE/DELETE 는 `{cmd},` prefix 명시 (film 패턴 그대로).

### 7-3. ds vs tx 속성 선택

| 속성 | 사용 시점 | 예시 | OASIS 동작 |
|---|---|---|---|
| `tx="txIF"` | multi-tx 환경 (`process tx="txBiz,txIF"` 명시) — TxMgr alias 활용 | `<property name="tx" value="txIF"/>` | TxMgr → JpaTransactionManager.getDataSource() 추출 |
| `ds="cactusDataSourceIf"` | DataSource 직접 명시 (트랜잭션 의미 없음) | `<property name="ds" value="cactusDataSourceIf"/>` | DataSource 빈 직접 반환 |
| 둘 다 명시 | ★ 금지 — OASIS 가 `IllegalArgumentException` throw | — | "Please input either [ds] or [tx]" |
| **둘 다 생략** | **단순 biz DS 시나리오** — cactus default 자동 | (속성 없음) | **`DefaultDataSourceResolver` → primary `dataSource` (biz)** 자동 사용 |

→ **multi-tx + multi-DS mybatis 시나리오는 `tx` 권장** (트랜잭션 매핑 + DS 추출 동시).
→ **단순 biz DS only 시나리오는 둘 다 생략 권장** (cactus default 자동 — 운영자 부담 ↓).

#### default 동작 메커니즘 (실측 검증, v3.4)

OASIS `SqlScriptTaskExecutable.execute():65-79` — ds/tx 둘 다 미명시 시:
```java
if (transactionManagerNameObject == null && dataSourceNameObject == null) {
    List<TypedObject> defaultDataSourceResolvers = executableContext.get(DefaultDataSourceResolver.class);
    if (defaultDataSourceResolvers.size() == 1) {
        dataSource = defaultDataSourceResolvers.get(0)
            .getObject(DefaultDataSourceResolver.class).defaultDataSource();
    } // ... 0개 또는 2개 이상 시 throw
}
```

cactus 의 `DefaultDataSourceResolver` 빈 (`CactusMybatisAutoConfiguration:42`):
```java
@Bean @ConditionalOnBean(DataSource.class) @ConditionalOnMissingBean(DefaultDataSourceResolver.class)
public DefaultDataSourceResolver cactusDefaultDataSourceResolver(DataSource dataSource) {
    return () -> dataSource;   // primary dataSource (biz) 반환
}
```

→ `CactusMultiMyBatisSqlRunner.resolveSession()` 이 biz DataSource → `sqlSessionTemplateBiz` 매핑 → biz TX 에 자동 join.

**실측 검증** (`pilotDefaultTx.bpmn`, 2026-05-19):
- BPMN: process tx 없음 + script tx/ds 없음 + `camunda:resource="insert,pilot.pilotMultiTx.recordBizLog"`
- 호출: `POST /oasis/pilotDefaultTx/run`
- 응답: `{"data":{"bizAffected":1},"meta":{"success":true,"code":"0000"}}`
- DB: TB_PILOT_BIZ_LOG +1 commit 확인 (biz DS 자동 사용 검증)

### 7-4. process tx 명시 (multi-tx 활성)

```xml
<bpmn:process id="myService" isExecutable="true">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txBiz,txIF"/>   <!-- 두 트랜잭션 동시 begin -->
    </camunda:properties>
  </bpmn:extensionElements>

  <bpmn:scriptTask id="t1" scriptFormat="sql"
                   camunda:resource="insert,security.objectManagement.insertObj">
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="tx" value="txBiz"/>       <!-- biz TX 에 join -->
        <camunda:property name="output" value="bizResult"/>
      </camunda:properties>
    </bpmn:extensionElements>
  </bpmn:scriptTask>

  <bpmn:scriptTask id="t2" scriptFormat="sql"
                   camunda:resource="insert,security.objectManagement.insertIfSync">
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="tx" value="txIF"/>        <!-- if TX 에 join -->
        <camunda:property name="output" value="ifResult"/>
      </camunda:properties>
    </bpmn:extensionElements>
  </bpmn:scriptTask>
</bpmn:process>
```

→ ScriptTask 의 task-level `tx` 가 어느 트랜잭션 (cactus multi-tx 가 begin 한 것) 에 join 할지 결정.

### 7-5. ExclusiveGateway + action 분기 (film 패턴, v3.4 추가)

단일 BPMN 에서 여러 action (run / rollback / 별도 처리) 지원. film 의 `mcm01020^^원재료재고조회.bpmn` 패턴 정합.

```xml
<bpmn:exclusiveGateway id="gateway_action" name="action 분기" default="flow_to_t3_run">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="action"/>     <!-- ★ URL 의 {action} 값 매칭 -->
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:incoming>flow_to_gateway</bpmn:incoming>
  <bpmn:outgoing>flow_to_t3_run</bpmn:outgoing>
  <bpmn:outgoing>flow_to_t3_rollback</bpmn:outgoing>
</bpmn:exclusiveGateway>

<bpmn:sequenceFlow id="flow_to_t3_run"      name="run"      sourceRef="gateway_action" targetRef="t3"/>
<bpmn:sequenceFlow id="flow_to_t3_rollback" name="rollback" sourceRef="gateway_action" targetRef="t3_fail"/>
```

→ 호출:
- `POST /oasis/pilotMultiTx/run` → `flow_to_t3_run` 선택 → t3 (정상 mapper 호출)
- `POST /oasis/pilotMultiTx/rollback` → `flow_to_t3_rollback` 선택 → t3_fail (의도 SQL 에러 → multi-tx rollback)
- 매칭 안 되는 action → `default="flow_to_t3_run"` 선택 (fallback)

**검증된 사용 사례** (§8 pilot):
- 단일 endpoint + action 으로 정상/에러 시나리오 모두 처리
- BPMN 작성자가 ExclusiveGateway 의 `input=action` + sequenceFlow `name` 으로 분기 결정

### 7-6. input 매핑 (process input 자동 전달)

```xml
<bpmn:scriptTask scriptFormat="sql" camunda:resource="security.objectManagement.selectAll">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="objId,sysCd"/>   <!-- 명시 시 -->
      <camunda:property name="output" value="rows"/>
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:scriptTask>
```

→ `input` 속성 명시 시 process variable 중 명시된 key 만 mapper 의 parameter map 으로 전달.
→ 생략 시 cactus 의 `InputsAndContextFlatter` 가 전체 process context 를 flat map 으로 전달.

mapper.xml 의 SQL 에서 `#{objId}`, `#{sysCd}` 처럼 참조.

---

## 8. 사용 예제 — pilot 검증 시나리오 (Phase 2 실측 검증 완료, v3.4)

### 8-0. 통합 BPMN 구조 (run + rollback action 분기)

```
start → t1 (biz INSERT mapper) → t2 (if SELECT mapper) → gateway_action
                                                          → "run"      → t3 (recordIfLog)         → end
                                                          → "rollback" → t3_fail (recordIfLogFail) → end
```

- 단일 endpoint `/oasis/pilotMultiTx/{action}` 으로 정상 / rollback 시나리오 모두 처리
- ExclusiveGateway 의 `<camunda:property name="input" value="action"/>` 로 URL action 매칭

### 8-1. mapper.xml 작성

```xml
<!-- src/main/resources/persistence/pilot/pilot-multi-tx.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="pilot.pilotMultiTx">

  <insert id="recordBizLog" parameterType="map">
    INSERT INTO PILOT_BIZ_LOG (MESSAGE, CREATED_AT)
    VALUES (#{message}, CURRENT_TIMESTAMP)
  </insert>

  <select id="countIfSync" resultType="long">
    SELECT COUNT(*) FROM IF_INTERFACE WHERE INTERFACE_ID = #{interfaceId}
  </select>

  <insert id="recordIfLog" parameterType="map">
    INSERT INTO TB_PILOT_IF_LOG (INTERFACE_ID, PAYLOAD, CREATED_AT)
    VALUES (#{interfaceId}, #{payload}, CURRENT_TIMESTAMP)
  </insert>

  <!-- ★ rollback 검증용 — 존재하지 않는 컬럼 INSERT → SQLException → multi-tx 양쪽 rollback -->
  <insert id="recordIfLogFail" parameterType="map">
    INSERT INTO TB_PILOT_IF_LOG (INTERFACE_ID, PAYLOAD, CREATED_AT, NONEXISTENT_COL)
    VALUES (#{interfaceId}, #{payload}, CURRENT_TIMESTAMP, 'rollback-test')
  </insert>

</mapper>
```

→ 실측 검증 (`mcm.db` + `serai-if.db` SQLite 양쪽): `CURRENT_TIMESTAMP` 정상 동작 (SQLServer + SQLite 호환).

### 8-2. BPMN 작성 (pilotMultiTx 변형)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <bpmn:process id="pilotMultiTx" isExecutable="true">
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="tx" value="txBiz,txIF"/>
      </camunda:properties>
    </bpmn:extensionElements>

    <bpmn:startEvent id="start"/>

    <!-- t1: biz DB INSERT (mapper) -->
    <bpmn:scriptTask id="t1"
                     scriptFormat="sql"
                     camunda:resource="insert,pilot.pilotMultiTx.recordBizLog">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="tx" value="txBiz"/>
          <camunda:property name="output" value="bizAffected"/>
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:scriptTask>

    <!-- t2: if DB SELECT (mapper) -->
    <bpmn:scriptTask id="t2"
                     scriptFormat="sql"
                     camunda:resource="pilot.pilotMultiTx.countIfSync">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="tx" value="txIF"/>
          <camunda:property name="output" value="ifCount"/>
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:scriptTask>

    <!-- t3: if DB INSERT (mapper) -->
    <bpmn:scriptTask id="t3"
                     scriptFormat="sql"
                     camunda:resource="insert,pilot.pilotMultiTx.recordIfLog">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="tx" value="txIF"/>
          <camunda:property name="output" value="ifAffected"/>
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:scriptTask>

    <bpmn:endEvent id="end"/>

    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="t1"/>
    <bpmn:sequenceFlow id="f2" sourceRef="t1" targetRef="t2"/>
    <bpmn:sequenceFlow id="f3" sourceRef="t2" targetRef="t3"/>
    <bpmn:sequenceFlow id="f4" sourceRef="t3" targetRef="end"/>
  </bpmn:process>
</bpmn:definitions>
```

### 8-3. 호출 + 응답 예시 (Phase 2 실측, v3.4)

#### A) 정상 (action=run)
```http
POST /api/mcm/oasis/pilotMultiTx/run
Content-Type: application/json
X-Client-Key: dmes-bff-local-client-key-2026
Authorization: Bearer {JWT}

{
  "params": {
    "message":     "integrated-run-commit",
    "interfaceId": "PILOT_INTEGRATED_01",
    "payload":     "run payload"
  }
}
```

응답:
```json
{
  "data":  {"ifAffected": 1, "bizAffected": 1},
  "grids": {"ifCount": {"rows": [{"value": 0}]}},
  "meta":  {"success": true, "code": "0000", "txId": "..."}
}
```

→ R-mybatis-12 fix 후 응답 정상화. `ifCount` (List<Long>) 는 `{"value": N}` 으로 wrap.

#### B) rollback (action=rollback)
```http
POST /api/mcm/oasis/pilotMultiTx/rollback
{... 같은 body, message="integrated-rollback-MUST-NOT-PERSIST"}
```

응답:
```json
{
  "meta": {
    "success": false,
    "code":    "S001",
    "message": "### Error updating database.  Cause: SQLiteException [SQLITE_ERROR] (table TB_PILOT_IF_LOG has no column named NONEXISTENT_COL) ### pilot.pilotMultiTx.recordIfLogFail"
  }
}
```

→ multi-tx LIFO rollback 동작. DB 의 `'integrated-rollback-MUST-NOT-PERSIST'` message **0건** (biz INSERT 가 rollback 됨).

부팅 후 로그:
```
[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryBiz' ds='HikariDataSource@...' mapperLocations='classpath:persistence/**/*.xml' interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor, MasterCodeMybatisInterceptor]
[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryIf' ds='HikariDataSource@...' mapperLocations='classpath:persistence/**/*.xml' interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor, MasterCodeMybatisInterceptor]
[Cactus Mybatis] CactusMultiMyBatisSqlRunner registered (multi-DS aware)

# 호출 시
Transaction [txBiz] started.
Transaction [txIF]  started.
[Cactus Mybatis] ds=HikariDataSource@aaa → SqlSessionTemplate 'sqlSessionTemplateBiz'
==>  Preparing: INSERT INTO PILOT_BIZ_LOG (MESSAGE, CREATED_AT) VALUES (?, CURRENT_TIMESTAMP)
==> Parameters: P3 pattern test(String)
<==    Updates: 1
[Cactus Mybatis] ds=HikariDataSource@bbb → SqlSessionTemplate 'sqlSessionTemplateIf'
==>  Preparing: SELECT COUNT(*) FROM IF_INTERFACE WHERE INTERFACE_ID = ?
<==      Total: 1
==>  Preparing: INSERT INTO IF_PILOT_LOG (INTERFACE_ID, PAYLOAD, CREATED_AT) VALUES (?, ?, GETDATE())
<==    Updates: 1
Transaction [txIF]  has been committed.   ← LIFO
Transaction [txBiz] has been committed.
```

### 8-4. rollback 검증 시나리오 (Phase 2 실측 결과, v3.4)

action=rollback 호출 → t3_fail (`recordIfLogFail`) 의 `NONEXISTENT_COL` 컬럼 INSERT 시도 → SQLite `SQLITE_ERROR` → cactus multi-tx LIFO rollback:
- `cactusTransactionManagerIf.rollback()` (먼저)
- `cactusTransactionManagerBiz.rollback()` (LIFO)

**실측 DB 검증** (호출 전후 비교):

| 시점 | biz count | if count | PILOT_INTEGRATED_01 |
|---|---|---|---|
| 호출 전 | 8 | 7 | 0 |
| /run 후 | 9 (+1 commit) | 8 (+1 commit) | 1 |
| /rollback 후 | **9 (변화 없음)** | **8 (변화 없음)** | **1 (변화 없음)** |

**결정적 message 검증**:
- `'integrated-run-commit'`             → DB 1건 (commit OK)
- `'integrated-rollback-MUST-NOT-PERSIST'` → DB **0건** (biz INSERT 도 rollback 됨)

→ **multi-DS multi-tx mybatis 의 ACID atomicity 완전 보장 검증 완료**.

---

## 9. 트랜잭션 join 메커니즘 (상세)

### 9-0. ★★★ JpaTransactionManager 의 dataSource 자동 추출 (A-0 검증 완료, 2026-05-19)

**Spring 7.0.7 source 직접 확인으로 본 설계 가정 100% 확정**. R-mybatis-5 완전 해소.

**증거 1 — 생성자가 즉시 afterPropertiesSet 호출** (`spring-orm 7.0.7 / JpaTransactionManager.java:154-157`):

```java
public JpaTransactionManager(EntityManagerFactory emf) {
    this.entityManagerFactory = emf;
    afterPropertiesSet();   // ★★★ 생성자에서 즉시 호출 — Spring 빈 lifecycle 무관
}
```

→ `new JpaTransactionManager(emf)` 반환 시점에 이미 setDataSource 완료. cactus 의 `setInstanceSupplier` 패턴 + Spring AbstractAutowireCapableBeanFactory 의 lifecycle 통과 여부 무관.

**증거 2 — afterPropertiesSet 이 dataSource 자동 추출** (`JpaTransactionManager.java:334-348`):

```java
@Override
public void afterPropertiesSet() {
    if (getEntityManagerFactory() == null) {
        throw new IllegalArgumentException("'entityManagerFactory' or 'persistenceUnitName' is required");
    }
    if (getEntityManagerFactory() instanceof EntityManagerFactoryInfo emfInfo) {
        DataSource dataSource = emfInfo.getDataSource();
        if (dataSource != null) {
            setDataSource(dataSource);   // ★★★ 자동
        }
        JpaDialect jpaDialect = emfInfo.getJpaDialect();
        if (jpaDialect != null) {
            setJpaDialect(jpaDialect);   // 보너스 — JpaDialect 도 자동 추출
        }
    }
}
```

**증거 3 — AbstractEntityManagerFactoryBean implements EntityManagerFactoryInfo** (`AbstractEntityManagerFactoryBean.java:98-101`):

```java
public abstract class AbstractEntityManagerFactoryBean implements
        FactoryBean<EntityManagerFactory>, BeanClassLoaderAware, BeanFactoryAware, BeanNameAware,
        InitializingBean, DisposableBean,
        EntityManagerFactoryInfo, PersistenceExceptionTranslator, Serializable {
```

추가 (line 488 + 509-513): EMF proxy 가 `EntityManagerFactoryInfo` interface 도 구현 (Spring proxy 내부 mixin) → `instanceof EntityManagerFactoryInfo` true.

**증거 4 — cactus 의 흐름 완전 정합**:

```java
// CactusMultiJpaAutoConfiguration.buildEmf(...)
LocalContainerEntityManagerFactoryBean emfBean = new LocalContainerEntityManagerFactoryBean();
emfBean.setDataSource(ds);          // ← ds 명시
emfBean.afterPropertiesSet();
return emfBean.getObject();         // ← EntityManagerFactoryInfo proxy 반환

// CactusMultiJpaAutoConfiguration 의 setInstanceSupplier
txBd.setInstanceSupplier(() -> {
    EntityManagerFactory emf = beanFactory.getBean(emfBeanName, EntityManagerFactory.class);
    return new JpaTransactionManager(emf);
    //   ↓ 생성자 안에서 자동:
    //     1. this.entityManagerFactory = emf
    //     2. afterPropertiesSet() 즉시 호출
    //        - emf instanceof EntityManagerFactoryInfo → true (★ 증거 3)
    //        - emfInfo.getDataSource() → ds (cactus 가 setDataSource(ds) 한 것)
    //        - setDataSource(ds) 자동 호출 ✓
    //   ← 반환 시점에 이미 dataSource 필드 = ds (non-null)
});
```

→ **cactus 측 코드 수정 0**. 호스트의 `transactionManager` (예: mcm `JpaConfig.java:97-99` 의 `new JpaTransactionManager(emf)`) 도 동일 패턴 → 자동 추출 보장.

→ **본 설계의 트랜잭션 join 메커니즘 (§9-1 ~ §9-3) 의 모든 전제 검증 완료**.

### 9-1. SqlSessionTemplate 의 SqlSession 획득 흐름

`org.mybatis.spring.SqlSessionUtils.getSqlSession(sqlSessionFactory, ...)`:

```java
var holder = (SqlSessionHolder) TransactionSynchronizationManager.getResource(sessionFactory);
var session = sessionHolder(executorType, holder);
if (session != null) {
    return session;   // 같은 TX 의 SqlSession 재사용
}
session = sessionFactory.openSession(executorType);   // 새 SqlSession
registerSessionHolder(sessionFactory, ..., session);  // TSM 에 bind
return session;
```

→ TSM 에 SqlSessionHolder (sessionFactory key) 가 있으면 재사용. 없으면 새로 생성.

### 9-2. SpringManagedTransaction 의 Connection 획득 흐름

`org.mybatis.spring.transaction.SpringManagedTransaction.openConnection()`:

```java
this.connection = DataSourceUtils.getConnection(this.dataSource);   // ★
this.autoCommit = this.connection.getAutoCommit();
this.isConnectionTransactional = DataSourceUtils.isConnectionTransactional(this.connection, this.dataSource);
```

`org.springframework.jdbc.datasource.DataSourceUtils.getConnection(dataSource)`:
1. `TransactionSynchronizationManager.getResource(dataSource)` 조회
2. ConnectionHolder 있음 → 그 Connection 반환 (★ **TX join**)
3. 없음 → `dataSource.getConnection()` 새 Connection 발급 (별 TX)

### 9-3. cactus multi-tx 와의 정합

```
1. cactus 가 process tx="txBiz,txIF" 파싱 → DefaultTxInjectingServiceProvider 가 default 미주입
2. ServiceStarter.start() → 각 TxMgr.getTransaction() 호출 (LIFO 스택 push)
   - cactusTransactionManagerBiz (JpaTxMgr, dataSource=bizDataSource).doBegin()
     - EM 생성 + bindResource(emfBiz, em)
     - Connection 추출 + bindResource(bizDataSource, ConnectionHolder)   ← ★
   - cactusTransactionManagerIf (JpaTxMgr, dataSource=cactusDataSourceIf).doBegin()
     - bindResource(cactusDataSourceIf, ConnectionHolder)
3. ScriptTask t1 실행 (tx="txBiz", camunda:resource="insert,...")
   - SqlScriptTaskExecutable → executableContext.get("txBiz") → JpaTxMgr biz → DataSource 추출
   - CactusMultiMyBatisSqlRunner.run(params, bizDataSource, "insert,...")
   - cache.get(bizDataSource) → sqlSessionTemplateBiz
   - sqlSessionTemplateBiz.insert(mapperId, params)
     - SqlSessionUtils.getSqlSession(sqlSessionFactoryBiz) → 새 SqlSession (첫 호출)
     - SpringManagedTransaction(bizDataSource).getConnection()
       - DataSourceUtils.getConnection(bizDataSource)
       - TSM.getResource(bizDataSource) → step 2 의 ConnectionHolder 발견   ← ★ join
       - 그 Connection 반환
     - INSERT 실행
   - SqlSessionHolder TSM 에 bind (이후 같은 sessionFactory 호출 시 재사용)
4. ScriptTask t2 (tx="txIF") → 동일 흐름 → if TX join
5. process end → commit:
   - cactusTransactionManagerIf.commit() → SqlSessionHolder 도 cleanup
   - cactusTransactionManagerBiz.commit() (LIFO)
```

### 9-4. 같은 DS 의 여러 alias 시 동작 (R-multi-25)

```yaml
cactus:
  tx:
    managers:
      txBiz: { data-source: biz }
      txCmn: { data-source: biz }   # ← 같은 biz 매핑
      txIF:  { data-source: if }
```

→ `txBiz` 와 `txCmn` 이 같은 DS 의 같은 트랜잭션에 join. ScriptTask 의 tx 속성에 어느 것을 명시해도 동일 결과.
→ wrapper 빈 prefix (cactusMapperBiz/Cmn) 가 없는 P3 패턴에서는 영향 없음.

---

## 10. 인터셉터 attach (film 패턴 그대로)

### 10-1. cactus 의 3개 인터셉터

| 인터셉터 | 역할 | film 의 동등 |
|---|---|---|
| `MasterCodeMybatisInterceptor` | SELECT 결과의 `_CD_NM` 컬럼 자동 디코딩 | `MasterCodeIntercept` |
| `CactusMybatisAuditInterceptor` | INSERT/UPDATE 시 감사 컬럼 (C_AT/U_AT/C_BY/U_BY) 자동 채움 | `MybatisAudit` |
| `SqlLoggingInterceptor` | SQL + 파라미터 + 실행시간 로깅 | `MybatisSqlLogger` |

### 10-2. SqlSessionFactoryBean.setPlugins() 직접 attach (film 패턴)

`CactusMultiMybatisAutoConfiguration.build()` 내부:

```java
List<Interceptor> interceptors = new ArrayList<>();
interceptors.add(new SqlLoggingInterceptor());            // 외부 (로깅)
interceptors.add(new CactusMybatisAuditInterceptor());    // 중간 (감사)
if (decoder != null) {
    interceptors.add(new MasterCodeMybatisInterceptor(decoder));  // 내부 (결과 디코딩)
}
bean.setPlugins(interceptors.toArray(new Interceptor[0]));
```

→ 3개 SqlSessionFactory 모두 동일 인터셉터 인스턴스 attach.
→ MyBatis 의 인터셉터 chain 실행 순서: addInterceptor 호출 역순으로 wrap 됨:
- 실행: SqlLoggingInterceptor (outer) → CactusMybatisAuditInterceptor (mid) → MasterCodeMybatisInterceptor (inner) → SQL 실행

### 10-3. 기존 cactus 코드 정리 — InterceptorRegistrar 폐기 필수

`AuditAutoConfiguration.MybatisAuditAutoConfiguration` 의 `addInterceptor(new CactusMybatisAuditInterceptor())` 호출:
- 단일 SqlSessionFactory 빈 가정 → @Primary 인 sqlSessionFactoryBiz 에만 attach
- cmn/if SqlSessionFactory 에는 인터셉터 attach 안 됨 → MasterCode 디코딩 + Audit 컬럼 + SQL 로깅 비활성

→ **본 설계 도입 시 반드시 폐기**:
- `AuditAutoConfiguration.MybatisAuditAutoConfiguration` static class 삭제
- `AuditAutoConfiguration.MybatisSqlLoggingAutoConfiguration` static class 삭제
- `MasterCodeMybatisAutoConfiguration.InterceptorRegistrar` static class 삭제

`MasterCodeMybatisAutoConfiguration.defaultMasterCodeDecoder` @Bean 은 유지 (본 설계가 decoder 빈 주입).

### 10-4. thread-safety

- `SqlLoggingInterceptor` — stateless
- `CactusMybatisAuditInterceptor` — `AuditHolder` (ThreadLocal) 사용. thread-safe
- `MasterCodeMybatisInterceptor` — stateless (decoder 빈 주입, decoder 가 cache 보유)

→ 3개 SqlSessionFactory 가 동시 호출되어도 안전.

---

## 11. 리스크 분석

### R-mybatis-1: statement id 오타
- **현상**: BPMN `camunda:resource` 의 오타 → 호출 시 `MyBatisSystemException: Statement not found`
- **완화**:
  - 부팅 시 cactus 가 등록된 statement id 목록 로깅 (`[Cactus Mybatis] Loaded statements: N`)
  - 향후 BPMN 파싱 시점에 statement 존재 검증 (cactus 확장)
- **수준**: ★ (fail-fast 안전)

### R-mybatis-2: SqlSessionFactory ×3 메모리 / 부팅 시간
- **현상**: 매퍼 100개 ×3 SqlSessionFactory = 300번 mapper.xml 파싱. 메모리 +수십 MB. 부팅 +1~3초.
- **완화**: 수용 가능 수준. film 도 multi-DS 운영. 모니터링 후 필요 시 mapperLocations 패턴 분할.
- **수준**: ★ (사소함)

### R-mybatis-3: 같은 xml 3중 register 시 statement 충돌
- **현상**: 같은 namespace.statementId 가 3개 Configuration 에 register → 충돌?
- **결과**: 각 Configuration 객체가 독립 namespace registry → **충돌 없음**. 안전.
- **수준**: ✅ 해소 (가짜 리스크)

### R-mybatis-4: ~~ScriptTask 의 tx 속성 ↔ SqlSessionTemplate 의 SqlSessionFactory 매핑 불일치~~ ✅ 해소

- **γ 검증 결과 (2026-05-19)**: mybatis-spring 3.0.5 source 직접 확인으로 정합 확정.
  - `SqlSessionFactoryBean.setDataSource(ds)` (line 405-413): 일반 DataSource 는 unwrap 없이 그대로 저장. `TransactionAwareDataSourceProxy` 만 unwrap (HikariCP 등 일반 DS 는 영향 없음).
  - `buildSqlSessionFactory()` (line 678-680): `new Environment(this.environment, transactionFactory, this.dataSource)` — 같은 인스턴스 그대로 전달.
  - → `sqlSessionFactory.getConfiguration().getEnvironment().getDataSource() == ds` (참조 비교 성공).
- **결론**: cactus 가 같은 `@Qualifier("cactusDataSourceIf")` 빈을 SqlSessionFactoryBean + JpaTransactionManager 양쪽에 주입 → 둘 다 같은 인스턴스. `CactusMultiMyBatisSqlRunner.resolveSession()` 의 `templateDs == ds` 비교 정상 동작.
- **수준**: ✅ 해소

### R-mybatis-5: ~~JpaTransactionManager 의 dataSource 자동 추출이 안 되는 경우~~ ✅ 해소

- **A-0 검증 결과 (2026-05-19)**: Spring 7.0.7 source 직접 확인으로 100% 확정.
  - `JpaTransactionManager(emf)` 생성자가 즉시 `afterPropertiesSet()` 호출 (Spring 빈 lifecycle 무관)
  - `afterPropertiesSet()` 가 `EntityManagerFactoryInfo` 통해 dataSource 자동 추출
  - cactus 의 `setInstanceSupplier(() -> new JpaTransactionManager(emf))` 가 이 흐름과 완전 호환
- **결론**: cactus 측 코드 수정 0. 본 설계의 트랜잭션 join 100% 보장.
- **수준**: ✅ 해소 (가짜 리스크)
- 자세한 증거는 §9-0 참고

### R-mybatis-6: 같은 DataSource 빈을 여러 곳에서 다른 인스턴스로 등록
- **현상**: cactus 가 `dataSource` 와 `bizDataSource` 가 다른 인스턴스면 `templateDs == ds` 비교 실패
- **완화**:
  - cactus 의 CactusMultiDataSourceAutoConfiguration 이 primary-alias=biz 로 alias 등록 (같은 빈 인스턴스 공유)
  - SqlSessionFactory 생성 시 같은 빈 명 사용
- **수준**: ★ (cactus 자동 alias 패턴 정합)

### R-mybatis-7: ~~mybatis-spring-boot-autoconfigure 의 자동 SqlSessionFactory 생성 시도~~ ✅ 강화 해소

- **γ 검증 결과 (2026-05-19)**: mybatis-spring-boot-autoconfigure 3.0.5 source 직접 확인.
  - `MybatisAutoConfiguration:84-88` — `@ConditionalOnSingleCandidate(DataSource.class)`. multi-DS 환경에서 @Primary 1개면 활성.
  - `sqlSessionFactory @Bean` (line 136-138) — `@ConditionalOnMissingBean` 으로 본 설계의 @Primary `sqlSessionFactoryBiz` 있으면 skip.
  - `sqlSessionTemplate @Bean` (line 217-219) — 동일 패턴.
- **결론**: 충돌 없음 확정. 본 설계의 @Primary 빈이 mybatis-autoconfigure 보다 항상 우선.
- **수준**: ✅ 해소 (source 검증 완료)

### R-mybatis-8: mapper.xml SQL 의 DS 별 dialect 호환성
- **현상**: 운영 = SQLServer 단일이므로 dialect 문제 없음. 단 local SQLite 에서 SQLServer 함수 (`GETDATE()` 등) 사용 시 fail
- **완화**: 매퍼 작성 가이드 — local 테스트 시 표준 SQL 또는 SQLite-호환 함수 사용
- **수준**: ★ (사용자 결정: 운영 단일 dialect 이므로 무시)

### R-mybatis-9: ~~기존 OasisAutoConfiguration.sqlRunner @Bean 과 충돌~~ ✅ 해소

- **γ 검증 결과 (2026-05-19)**: cactus `OasisAutoConfiguration:188-197` source 확인.
  - 기존 `sqlRunner(SqlSession sqlSession)` @Bean = `@ConditionalOnBean(SqlSession.class) + @ConditionalOnMissingBean(SqlRunner.class)` 가드.
  - 본 설계의 `CactusMultiMybatisAutoConfiguration` 에 `@AutoConfiguration(before = OasisAutoConfiguration.class)` 명시 → 본 설계 빈 먼저 등록 → 기존 sqlRunner 의 `@ConditionalOnMissingBean(SqlRunner.class)` 통과 못해 skip.
- **결론**: 본 설계의 §5-4 코드에 `before = OasisAutoConfiguration.class` 명시 반영 완료. 충돌 회피 확정.
- **수준**: ✅ 해소 (어노테이션 명시 적용)

### R-mybatis-10: 인터셉터 ↔ JPA Audit 의 중복
- **현상**: cactus 의 `CactusAuditEntity` (`@EntityListeners(CactusAuditListener.class)`) 가 JPA 측 audit. mybatis 인터셉터 (`CactusMybatisAuditInterceptor`) 가 같은 컬럼 채움. 한 트랜잭션에 둘 다 호출 시 동작?
- **완화**:
  - JPA 와 MyBatis 가 같은 row 를 동시 INSERT 안 함 (다른 테이블)
  - 만약 같은 테이블이면 한쪽만 audit 처리 (수동 결정)
- **수준**: ★ (실제 충돌 가능성 낮음)

### R-mybatis-12: ~~`CactusResponseConverter` 의 List<primitive> 처리 누락~~ ✅ 해소 (v3.4, 2026-05-19)

- **현상 (v3.3 까지)**: mapper 의 `resultType="long" / "int" / "string"` 등 primitive 결과를 `selectList()` 가
  `List<Long>` / `List<Integer>` / `List<String>` 으로 반환. `CactusResponseConverter.convertSuccess()` 가
  `instanceof List` 분기에서 `MAPPER.convertValue(item, Map.class)` 시도 → `MismatchedInputException`
  (`Cannot deserialize value of type LinkedHashMap from Integer value`).
- **근본 원인**: 기존 converter 가 List 안 element 를 무조건 Map 으로 변환 가정. primitive 처리 누락.
- **해결**: `CactusResponseConverter.convertSuccess()` 의 List 분기에 primitive 안전 처리 추가.
  - null → skip
  - Number / String / Boolean / Character → `{"value": item}` 으로 wrap (기존 List<Map> 패턴과 일관)
  - 그 외 → 기존 `MAPPER.convertValue(item, Map.class)` 유지
- **검증**: Phase 2 호출 시 `ifCount: {rows: [{"value": 2}]}` 형식 정상 반환.
- **수준**: ✅ 해소 (cactus 1.0.22-SNAPSHOT)

### R-mybatis-11: ~~BDRPP 등록 빈에 대한 @ConditionalOnBean timing 이슈~~ ✅ 해소 (v3.3, 2026-05-19)

- **현상 (v3.2 까지)**: 본 설계의 `sqlSessionFactoryIf @ConditionalOnBean(name = "cactusDataSourceIf")` 가
  cactus 의 `CactusMultiDataSourceAutoConfiguration` (BDRPP) 가 등록한 빈을 ConfigurationClass 평가 시점에 detect 못 함 → skip → mcm 부팅 시 `sqlSessionFactoryIf` 등록 안 됨.
- **근본 원인**: Spring Boot 4.x 의 ConfigurationClassPostProcessor 가 @Conditional 평가 시 BDRPP 처리 전이라 BeanDefinitionRegistry 에 BDRPP 등록 빈 미존재.
- **해결**: `@ConditionalOnBean(name = "cactusDataSourceIf")` → `@ConditionalOnProperty(prefix = "cactus.datasource.extras.if", name = "url")` 변경.
  - timing 무관 (Environment binding 시점)
  - 의도 명확 (yml 기반)
  - cactus 의 다른 자동설정 컨벤션과 정합 (BDRPP 의존 시 yml 체크)
- **검증**: mcm 부팅 시 `sqlSessionFactoryIf` 등록 로그 확인 (μ-3 단계).
- **수준**: ✅ 해소 (실측 검증 완료)

### R-cactus-audit-1: ~~`OasisServiceExecutor.sc.setAudit` 누락 → OASIS 가 null 로 덮어씀~~ ✅ 해소 (v3.6 ι, 2026-05-20)

- **현상**: 모든 OASIS 경유 INSERT/UPDATE 의 audit 컬럼 (`C_USR_ID/C_SVC_ID/C_PGM_ID/U_*`) 이 NULL. `C_AT/U_AT` 만 채움.
- **원인 추적 (ultrathink)**:
  1. cactus `OasisServiceExecutor:81` — `AuditHolder.setAudit(new CactusAudit(...))` 호출 ✅
  2. cactus 가 `ServiceContext sc = new DefaultServiceContext(...)` 생성, **`sc.setAudit()` 호출 누락** ← BUG
  3. OASIS `CoreServiceStarter:96` — `AuditHolder.setAudit(serviceContext.audit())` 호출
     - `serviceContext.audit()` = null (DefaultServiceContext.audit() = field, sc.setAudit 안 했으므로)
     - **→ AuditHolder 가 null 로 overwrite**
  4. ScriptTask → mybatis interceptor → `AuditHolder.getAudit() = null` → DB NULL
- **dmes-film 패턴 비교**: `ServiceController:153` 가 `serviceContext.setAudit(filmAudit)` 호출. dmes-film 은 `AuditHolder.setAudit()` 호출 **안 함**. OASIS contract = client 가 `serviceContext.setAudit` → engine 이 `AuditHolder` 로 자동 propagate.
- **해결**: cactus `OasisServiceExecutor.execute` 에 1-line 추가:
  ```java
  CactusAudit audit = new CactusAudit(auditUserId, menuId, serviceId);
  AuditHolder.setAudit(audit);  // 유지 (방어적, OASIS 이외 경로 보호)
  ...
  DefaultServiceContext sc = new DefaultServiceContext(oasisAppCtx, inputs);
  sc.setAudit(audit);  // ★ 추가 — OASIS contract
  ```
- **검증** (κ 단계):
  | 컬럼 | Fix 전 | Fix 후 (meta 포함) |
  |---|---|---|
  | C_USR_ID / U_USR_ID | NULL | `admin` |
  | C_SVC_ID / U_SVC_ID | NULL | `pilotAuditTest` |
  | C_PGM_ID / U_PGM_ID | NULL | `MENU_AUDIT_TEST` |
  | txId | `anon-NONE-...` | `admin-MENU_AUDIT_TEST-...` |
- **부산물**: CactusAuditListener (JPA `@PrePersist/@PreUpdate`) 도 같은 AuditHolder mechanism 사용 → 자동 fix. OASIS 경유 모든 audit 컬럼 일괄 정상화.
- **수준**: ✅ 해소 (cactus 1.0.22-SNAPSHOT)

### R-mybatis-13: ~~multi-EMF 환경 `MasterCodeJpaAutoConfiguration` Repository 등록 실패~~ ✅ 해소 (v3.6 κ, 2026-05-20)

- **현상**: multi-DS 환경 (mcm 의 biz + if EMF) 에서 cactus 의 MasterCode 디코딩 미동작.
  - 부팅 로그: `interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor]` (MasterCodeMybatisInterceptor 누락)
  - 응답: `testStsNm: null` (디코딩 안 됨)
- **원인 추적 (2단계 디버깅)**:
  - **시도 1** (δ): `@EnableJpaRepositories(... entityManagerFactoryRef="entityManagerFactory")` 명시. → 여전히 미동작.
  - **시도 2** (κ): `CactusAuthAutoConfiguration` 의 동일 패턴 (자체 `@EnableJpaRepositories`) 과 비교. 차이 발견 — CactusAuthAutoConfiguration 은 **`@AutoConfiguration`**, MasterCodeJpaAutoConfiguration 만 **`@Configuration`**. Spring Boot 의 `AutoConfiguration.imports` 에 등록되어 있어도 `@Configuration` 만 있으면 ApplicationContext refresh 일반 timing 으로 처리되어 multi-EMF 환경에서 `@EnableJpaRepositories` 의 EMF resolution 이 불안정.
- **해결**: 3가지 변경:
  ```java
  @AutoConfiguration  // ★ @Configuration → @AutoConfiguration
  @ConditionalOnClass({EntityManagerFactory.class})
  // @ConditionalOnMissingBean(MasterCodeJpaAutoConfiguration.class) ← 제거 (의미 모호한 조건)
  @EntityScan(basePackages = "com.dongkuk.dmes.cactus.mastercode")
  @EnableJpaRepositories(
      basePackages = "com.dongkuk.dmes.cactus.mastercode",
      entityManagerFactoryRef = "entityManagerFactory",     // ★ 추가
      transactionManagerRef = "transactionManager")         // ★ 추가
  public class MasterCodeJpaAutoConfiguration {}
  ```
- **검증**:
  - 부팅 로그: `interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor, MasterCodeMybatisInterceptor]` ✅ 양쪽 SqlSessionFactory (biz/if) 모두 attach
  - 호출: `testSts:"A"` → `testStsNm:"Active"` ✅ (TEST_STS 그룹의 ITEM_CD='A' lookup)
  - X_STS 그룹 미존재 시 `xStsNm:null` fallback 정상
- **수준**: ✅ 해소 (cactus 1.0.22-SNAPSHOT)

---

## 12. 마이그레이션 절차 (v3.4 — Phase 0~2 실측 검증 완료)

### Phase 0 (사전): 기존 cactus 코드 정리 ✅ 완료 (2026-05-19)
- [x] 0-1. `AuditAutoConfiguration.MybatisAuditAutoConfiguration` 폐기
- [x] 0-2. `AuditAutoConfiguration.MybatisSqlLoggingAutoConfiguration` 폐기
- [x] 0-3. `MasterCodeMybatisAutoConfiguration.InterceptorRegistrar` 폐기
- [x] 0-4. `OasisAutoConfiguration.sqlRunner` @Bean 에 `@ConditionalOnMissingBean(SqlRunner.class)` 유지

### Phase 1: cactus-core 변경 ✅ 완료 (2026-05-19)
- [x] 1-1. `build.gradle` — `compileOnly mybatis:3.5.16` → `api mybatis-spring-boot-starter:3.0.4` + version 1.0.22-SNAPSHOT
- [x] 1-2. `CactusMybatisProperties` 신규 + 갱신
- [x] 1-3. `cactus-mybatis-config.xml` 신규 (resources)
- [x] 1-4. `CactusMultiMybatisAutoConfiguration` 신규 — SqlSessionFactory/Template biz/cmn/if 자동 등록 + 인터셉터 직접 attach + `@AutoConfiguration(before = OasisAutoConfiguration.class)` 명시
- [x] 1-5. `CactusMultiMyBatisSqlRunner` 신규 (multi-DS 분기)
- [x] 1-6. `META-INF/spring/...AutoConfiguration.imports` 등록
- [x] 1-7. cactus 부팅 확인 — sqlSessionFactoryBiz/If 등록 + CactusMultiMyBatisSqlRunner 등록 로그 확인
- [x] 1-8. **(추가, μ)** R-mybatis-11 해소 — sqlSessionFactoryIf/Cmn 의 `@ConditionalOnBean` → `@ConditionalOnProperty`
- [x] 1-9. **(추가, π+σ)** R-mybatis-12 해소 — `CactusResponseConverter` 의 primitive 안전 처리

### Phase 2: pilot 검증 (mcm) ✅ 완료 (2026-05-19)
- [x] 2-1. `persistence/pilot/pilot-multi-tx.xml` 신규 작성 (recordBizLog + countIfSync + recordIfLog + recordIfLogFail)
- [x] 2-2. `pilotMultiTx.bpmn` 변형 — t1/t2/t3 모두 ScriptTask + camunda:resource 로 + ExclusiveGateway action 분기 (run / rollback) — **통합 BPMN**
- [x] 2-3. 정상 시나리오 검증 — biz INSERT + if SELECT + if INSERT 모두 성공, TX commit LIFO, DB 직접 확인
- [x] 2-4. rollback 시나리오 검증 — t3_fail 의 SQLException → multi-tx LIFO rollback → biz INSERT 도 rollback 확인 (DB message 0건)
- [ ] 2-5. UI 테스트 화면 (`pilot-multi-tx-test`) 에 통합 BPMN endpoint (run/rollback) 추가 — 선택

### Phase 3: 검증 항목 (R-mybatis-* 실측) ✅ 완료
- [x] 3-1. R-mybatis-5: JpaTransactionManager 자동 setDataSource — Spring 7.0.7 source 검증 (A-0, v3.1)
- [x] 3-2. R-mybatis-7: mybatis-spring-boot-autoconfigure 충돌 — 부팅 정상 (γ, v3.2)
- [x] 3-3. R-mybatis-4: ScriptTask tx="txIF" → if SqlSessionTemplate 매핑 — 부팅 로그 확인 (γ, v3.2)
- [x] 3-4. R-mybatis-9: SqlRunner 빈 등록 우선순위 — `@AutoConfiguration(before)` 적용 (γ, v3.2)
- [x] 3-5. R-mybatis-11: BDRPP timing — `@ConditionalOnProperty` 적용 + 실측 (μ, v3.3)
- [x] 3-6. R-mybatis-12: ResponseConverter primitive — fix + 실측 (π+σ, v3.4)
- [x] 3-7. multi-tx atomicity (rollback) — 실측 DB message 검증 (π, v3.4)

### Phase 4: 문서화 ✅ 완료 (2026-05-19)
- [x] 4-1. `cactus-mybatis-multi-ds-design.md` v3.5 갱신 (본 문서)
- [x] 4-2. `usage-guide.md` 갱신 — §5 BPMN 패턴에 P3 (ScriptTask + ds/tx + camunda:resource + action 분기) + §5-0 혼용 가능 + §5-5 default 동작 추가 (φ+ω+Ω)
- [x] 4-3. `oasis-sqlscript-multidatasource-design.md` 갱신 — Phase B 가 본 설계로 통합됨을 명시 (χ, §4 → §4-OLD archival)

### Phase 5: 표준 컨벤션 확산
- [ ] 5-1. mpn/mpp/mqc 의 신규 화면 작업 시 본 패턴 사용
- [ ] 5-2. 기존 mcm 의 cactus QueryController/LovController 가 본 패턴과 충돌 없는지 확인 (정합 예상)
- [ ] 5-3. 매퍼 작성 가이드 (namespace 컨벤션, statement id 명명, params Map 컨벤션, ExclusiveGateway+action 분기)

---

## 13. 호환성 / 영향 분석

### 13-1. 기존 ServiceTask + JPA Repository 패턴 ✅ 혼용 실측 검증 완료 (ψ, v3.5)

영향 없음. JPA Repository 는 EntityManager 기반, MyBatis 와 별 트랙. **같은 BPMN 안에서 ServiceTask + JPA 와 ScriptTask + mapper 혼용 가능**. 같은 트랜잭션 (txBiz) 에 둘 다 join + ACID atomicity 완전 보장.

#### 메커니즘 (실측 검증)

```
process tx="txBiz" → JpaTransactionManager.afterPropertiesSet() (§9-0 검증)
  → setDataSource(bizDataSource) 자동
  → TSM.bindResource(bizDataSource, ConnectionHolder)   ← ★ 공유 자원

t1 (ServiceTask + JPA Repository):
  → JpaTransactionManager 가 활성 TX → EntityManager 가 ConnectionHolder 의 Connection 사용
  → biz INSERT (PilotBizLogRepository.save)

t2 (ScriptTask + camunda:resource):
  → CactusMultiMyBatisSqlRunner → sqlSessionTemplateBiz
  → SpringManagedTransaction.openConnection() → DataSourceUtils.getConnection(bizDataSource)
  → TSM.getResource(bizDataSource) → ★ 같은 ConnectionHolder 발견 → 같은 Connection 재사용
  → mapper INSERT — 같은 TX 안에서 실행

throw (rollback action):
  → cactusTransactionManagerBiz.rollback() → ConnectionHolder.rollback()
  → ★ JPA INSERT + mapper INSERT 둘 다 같은 Connection 통해 실행됐으므로 rollback
```

#### 검증 시나리오 (`pilotHybridTx.bpmn`, 2026-05-19)

BPMN 구조:
- `process tx="txBiz"` 단일 biz TX
- t1: ServiceTask + JPA (`pilotMultiTxService.recordBizLog`)
- t2: ScriptTask + mapper (`insert,pilot.pilotMultiTx.recordBizLog`)
- ExclusiveGateway action 분기 — run / rollback (t3_fail → SQLException)

실측 결과:

| 시나리오 | 응답 | DB |
|---|---|---|
| `/run` (action=run) | `{"data":{"serviceResult":{"bizLogId":11},"mapperAffected":1},"meta":{"success":true}}` | `'hybrid-run'` message **2건** (JPA +1, mapper +1) |
| `/rollback` (action=rollback) | `{"meta":{"success":false,"code":"S001","message":"SQLITE_ERROR..."}}` | `'hybrid-rollback-MUST-NOT-PERSIST'` message **0건** (JPA + mapper 둘 다 rollback) |

→ **JPA + MyBatis 가 같은 Connection 공유** + **ACID atomicity 완전 보장** 확정.

#### 운영 권장

- 한 화면의 비즈 로직 = ServiceTask + JPA Repository (도메인 객체 + Repository CRUD)
- 한 화면의 SQL 호출 (조회/벌크/통계) = ScriptTask + mapper
- 같은 process tx 안에서 혼용 시 atomicity 자동 보장 — 별도 분산 트랜잭션 코디네이션 불필요

### 13-2. 기존 ScriptTask + 인라인 SELECT (Phase 0)
영향 없음. `<scriptTask scriptFormat="sql">` 의 인라인 SELECT 는 `JdbcTemplateSqlRunner` 가 직접 new + dataSource 명시 (cactus 코드 변경 없음). ScriptTask + camunda:resource (mapper id) 패턴은 별 분기.

### 13-3. ScriptTask + mapper id (Phase B — 본 설계로 통합)
`oasis-sqlscript-multidatasource-design.md` 의 Phase B 작업 = MyBatisSqlRunner 의 multi-DS 분기. 본 설계가 이를 `CactusMultiMyBatisSqlRunner` 로 구현 → **Phase B 가 본 설계로 통합**. 별도 Phase B 작업 불필요.

### 13-4. serai 모듈 (cactus 미사용)
영향 없음. serai 는 cactus 의존 없음 + 자체 `mybatis-spring-boot-starter:3.0.5` 사용. cactus 의 mybatis transitive 추가는 serai 와 무관.

### 13-5. mpn/mpp/mqc 호스트
substitute 구조 덕에 다음 빌드부터 즉시 반영:
- cactus 의 mybatis transitive 자동 포함 (~3MB)
- `CactusMultiMybatisAutoConfiguration` 활성 (DS 빈 있으면)
- `CactusMultiMyBatisSqlRunner` 자동 등록

기존 mpn/mpp/mqc 가 매퍼 사용 안 하면 단순 빈 등록만 (사용 시 동일 P3 패턴 적용).

### 13-6. cactus-core 버전 표기
본 설계 도입 시 cactus 1.0.21 → 1.0.22 (multi-mybatis 추가). substitute 구조라 버전 표기는 cosmetic.

### 13-7. 기존 QueryController / LovController 와의 관계
cactus 의 `QueryController` (`/query/{queryId}`) 와 `LovController` (`/lov/query/{queryId}`) 는 mybatis 의 SqlSession 기반 (`private final SqlSession sqlSession;` 단일 주입).
- 본 설계 도입 시 SqlSessionTemplate 3개 등록 → @Primary sqlSessionTemplateBiz 가 자동 주입 → biz DS 전용
- 향후 cmn/if DS query 도 지원하려면 컨트롤러 측 분기 패턴 (film 의 `sqlSessionBiz vs sqlSessionFrm` 패턴) 도입 검토

### 13-8. film 의 패턴과의 정합
| 항목 | film | 본 설계 |
|---|---|---|
| ScriptTask + camunda:resource | ✅ | ✅ (동일) |
| insert/update/delete prefix | ✅ | ✅ (동일) |
| mapperLocations 단일 패턴 | ✅ `classpath*:/mappers/**/*.xml` | ✅ `classpath:persistence/**/*.xml` |
| 인터셉터 setPlugins 직접 new | ✅ | ✅ (동일) |
| Mapper interface | ❌ 0개 | ❌ 0개 (동일) |
| multi-tx 시나리오 | ❌ 없음 | **★ 신규 (검증 필요)** |
| ds/tx 속성 | ❌ 미사용 | **★ 신규 (OASIS 표준 활용)** |
| 자동 등록 (cactus) | 수동 등록 (3개 Config) | **★ cactus 자동 등록** |

→ 본 설계는 **film 의 검증된 표준 패턴 + multi-tx + multi-DS 자동화** 의 확장.

---

## 14. 부팅 로그 패턴 (정상 시)

```
[Cactus] extras DataSource — bean='cactusDataSourceIf' alias='if' url=...
[Cactus] primary DataSource alias — dataSource → 'biz' (옵션 β)
[Cactus] extras EMF + TxMgr — name='if' emf='cactusEntityManagerFactoryIf' tx='cactusTransactionManagerIf' packages=[...]
[Cactus Tx] alias — 'txBiz' → 'transactionManager'
[Cactus Tx] default TxMgr @Primary — 'transactionManager' (alias 'txBiz')
[Cactus Tx] alias — 'txCmn' → 'transactionManager'
[Cactus Tx] alias — 'txIF' → 'cactusTransactionManagerIf'

# ★ 본 설계 신규 로그
[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryBiz' ds='HikariDataSource@aaa' mapperLocations='classpath:persistence/**/*.xml' interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor, MasterCodeMybatisInterceptor]
[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryIf' ds='HikariDataSource@bbb' mapperLocations='classpath:persistence/**/*.xml' interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor, MasterCodeMybatisInterceptor]
[Cactus Mybatis] CactusMultiMyBatisSqlRunner registered (multi-DS aware)

[Cactus Oasis] transactional + classpath loader — /services
[Cactus Oasis] multi-tx mode — managers=[txBiz, txCmn, txIF], default=txBiz
[Cactus] AutoConfiguration loaded
[Cactus Tx] config validated — managers=[txBiz, txCmn, txIF], default=txBiz, primary-alias=biz
Started McmApplication in N.NN seconds
```

호출 시 transaction + mapper 로그:
```
Transaction [txBiz] started.
Transaction [txIF]  started.
[Cactus Mybatis] ds=HikariDataSource@aaa → SqlSessionTemplate 'sqlSessionTemplateBiz'
==>  Preparing: INSERT INTO PILOT_BIZ_LOG (MESSAGE, CREATED_AT) VALUES (?, CURRENT_TIMESTAMP)
==> Parameters: P3 pattern test(String)
<==    Updates: 1
[Cactus Mybatis] ds=HikariDataSource@bbb → SqlSessionTemplate 'sqlSessionTemplateIf'
==>  Preparing: SELECT COUNT(*) FROM IF_INTERFACE WHERE INTERFACE_ID = ?
==>  Preparing: INSERT INTO IF_PILOT_LOG (INTERFACE_ID, PAYLOAD, CREATED_AT) VALUES (?, ?, GETDATE())
Transaction [txIF]  has been committed.   ← LIFO
Transaction [txBiz] has been committed.
```

---

## 15. 트러블슈팅 Q&A

### Q. `MyBatisSystemException: Statement not found: security.objectManagement.insertObj`
→ mapper.xml 의 namespace + id 가 BPMN `camunda:resource` 와 정확히 일치하는지 확인.
→ 부팅 로그 `[Cactus Mybatis] Loaded statements: N` 가 예상값과 일치하는지 확인.
→ `mapperLocations` 패턴이 mapper.xml 경로를 매칭하는지 확인 (`classpath:persistence/**/*.xml`).

### Q. ScriptTask 호출 시 `IllegalStateException: No SqlSessionTemplate matching DataSource`
→ ScriptTask 의 tx 속성에 명시한 TxMgr 의 DataSource 가 cactus 가 등록한 SqlSessionFactory 의 DataSource 와 동일 인스턴스가 아님.
→ cactus 가 등록한 dataSource alias 와 SqlSessionFactory 가 같은 빈 인스턴스 사용하는지 확인.
→ `cactus.datasource.primary-alias` 와 `cactus.datasource.extras.*` 정의 확인.

### Q. `Although the SQL ID is set, the executable SqlRunner could not be found.`
→ SqlRunner 빈이 0개 또는 2개 이상.
→ 기존 cactus `OasisAutoConfiguration.sqlRunner` @Bean 과 본 설계 `CactusMultiMyBatisSqlRunner` 동시 등록 시 발생.
→ `@ConditionalOnMissingBean(SqlRunner.class)` 가드 또는 AutoConfiguration order 확인.

### Q. `Cannot retrieve the data source. Please input either [ds] or [tx] property.`
→ ScriptTask 에 `ds` 와 `tx` 둘 다 명시함. **하나만** 명시.

### Q. multi-tx 안에서 mybatis insert 가 별 트랜잭션으로 실행됨
→ JpaTransactionManager 의 dataSource 가 null. afterPropertiesSet 자동 추출 실패.
→ 부팅 시 `cactusTransactionManagerIf.getDataSource()` 디버그 확인.
→ 실패 시 cactus 의 `CactusMultiJpaAutoConfiguration` 에서 `tm.setDataSource(ds)` 명시적 호출 추가.

### Q. ScriptTask 호출 시 audit 컬럼이 채워지지 않음
→ `CactusMybatisAuditInterceptor` 가 해당 SqlSessionFactory 에 attach 되지 않음.
→ 부팅 로그의 `interceptors=[...]` 가 3개 인터셉터를 포함하는지 확인.
→ 기존 cactus `AuditAutoConfiguration.MybatisAuditAutoConfiguration` 폐기 안 했으면 단일 SqlSessionFactory 에만 attach.

### Q. mapper.xml SQL 이 local SQLite 에서 동작 안 함 (운영 SQLServer 에서는 OK)
→ dialect 차이. 운영 = SQLServer 단일이므로 매퍼 작성 시 SQLServer 함수 사용 권장.
→ local 테스트 시 SQLServer Docker 사용 또는 표준 SQL 만 사용.

### Q. 같은 mapper.xml 의 다른 statement 가 biz/if 다른 DS 에 INSERT 시 어떻게?
→ BPMN 의 ScriptTask 별로 tx 속성 분기. `tx="txBiz"` 와 `tx="txIF"` 명시.
→ 같은 mapper namespace 의 다른 statement id 호출. 매퍼 작성자는 statement 의 의미만, BPMN 작성자가 DS 선택.

### Q. BPMN ServiceTask 에서 mapper 호출 가능?
→ 가능하지만 권장 안 함. ServiceTask 는 도메인 객체 / Service 호출 전용 (film 컨벤션).
→ 부득이한 경우 cactus 가 wrapper 빈 (sqlSessionTemplateBiz) 노출하므로 `camunda:class="sqlSessionTemplateBiz" method="selectList"` 사용. 단 BPMN 컨벤션 위반.

---

## 16. yml 키 참조

```yaml
cactus:
  # 기본 multi-tx 환경 (oasis-multi-tx-detailed-design.md 참고)
  datasource:
    primary-alias: biz
    extras:
      if:
        url: ${SERAIUSER_DB_URL}
        # ...

  tx:
    managers:
      txBiz: { data-source: biz }
      txCmn: { data-source: biz }
      txIF:  { data-source: if }
    default-manager: txBiz

  oasis:
    transactional: true
    service-path: /services
    cache:
      size: 100

  # ★ 본 설계 신규 키
  mybatis:
    enabled: true                                          # 디폴트 true
    mapper-locations: classpath:persistence/**/*.xml      # 디폴트 (필요 시 override)
    config-location: classpath:cactus-mybatis-config.xml  # 디폴트 (cactus 가 제공)
    master-code-decoding:
      enabled: true                                       # 디폴트 true
```

---

## 17. 결정 이력

| # | 일자 | 결정 | 근거 |
|---|---|---|---|
| 1 | 2026-05-18 | cactus-core 에 `mybatis-spring-boot-starter` transitive 추가 | substitute 구조라 1줄 변경으로 모든 호스트 적용 |
| 2 | 2026-05-18 | mapper.xml 위치 = `persistence/{serviceGroup}/{screen}.xml` | services/ 와 페어링 |
| 3 | 2026-05-18 | dialect 분기 미사용 | 운영 = SQLServer 단일 |
| 4 | 2026-05-18 | Mapper interface 작성 불필요 | film 검증된 0개 패턴. 화면 1본 단위 작성 부담 ↓ |
| 5 | 2026-05-18 | **P3 (ScriptTask + ds/tx + camunda:resource)** 채택 (P2 wrapper 빈 폐기) | film 5년+ 운영 검증된 패턴. 호스트 boilerplate 0. BPMN 표현 가장 간결 |
| 6 | 2026-05-18 | statement id 명명 = `{serviceGroup}.{screen}.{statementName}` | film 패턴 정합 (`mcm.mcm01020.findInventory`) |
| 7 | 2026-05-18 | 인터셉터 attach 방식 = `setPlugins(new XxxInterceptor())` 직접 new | film 패턴 검증. ObjectProvider 패턴 폐기 |
| 8 | 2026-05-18 | 기존 cactus `AuditAutoConfiguration.MybatisAuditAutoConfiguration` 등 InterceptorRegistrar 폐기 | 단일 SqlSessionFactory 가정. multi-DS 에서 cmn/if 에 attach 누락 |
| 9 | 2026-05-18 | mapperLocations 단일 패턴 (`classpath:persistence/**/*.xml`) | 매퍼-DS binding 미결정 시나리오 정합 |
| 10 | 2026-05-18 | mybatis-config.xml 사용 (`cactus-mybatis-config.xml`) | film 의 표준 설정 (`mapUnderscoreToCamelCase` 등) 동일 적용 |
| 11 | 2026-05-18 | JpaTransactionManager 의 dataSource 자동 추출 = Spring 표준 동작 의존 | `afterPropertiesSet()` 의 `EntityManagerFactoryInfo` 자동 추출 활용. cactus 측 별도 수정 불필요 (검증 단계에서 실측 확인) |
| 12 | 2026-05-18 | `oasis-sqlscript-multidatasource-design.md` Phase B 통합 | 본 설계의 `CactusMultiMyBatisSqlRunner` 가 Phase B 의 본질 |
| 13 | **2026-05-19 (A-0)** | **R-mybatis-5 100% 해소** — Spring 7.0.7 source 직접 확인 | `JpaTransactionManager(emf)` 생성자가 line 154-157 에서 즉시 `afterPropertiesSet()` 호출. line 334-348 에서 `EntityManagerFactoryInfo` 통해 dataSource 자동 추출. Spring 빈 lifecycle 통과 여부 무관. cactus 측 코드 수정 0 |
| 14 | **2026-05-19 (γ)** | **R-mybatis-4 해소** — mybatis-spring 3.0.5 SqlSessionFactoryBean source 확인 | `setDataSource` (line 405-413) + `new Environment(..., this.dataSource)` (line 678-680) — 일반 DataSource 는 unwrap 없이 같은 인스턴스 그대로. `templateDs == ds` 비교 정상 동작 |
| 15 | **2026-05-19 (γ)** | **R-mybatis-9 해소** — `@AutoConfiguration(before = OasisAutoConfiguration.class)` 명시 | 기존 `OasisAutoConfiguration.sqlRunner` @Bean 의 `@ConditionalOnMissingBean(SqlRunner.class)` 가 본 설계 빈 등록 후 통과 못해 skip |
| 16 | **2026-05-19 (γ)** | **Q5 해소** — mybatis-spring-boot-autoconfigure 3.0.5 source 확인 + 호스트 의존 그래프 검증 | `MybatisAutoConfiguration` 의 `@ConditionalOnSingleCandidate(DataSource.class)` + `@ConditionalOnMissingBean` 가드. 호스트 (mcm/mpn/mpp/mqc) 모두 mybatis 직접 명시 없음 → cactus transitive 만 → 버전 충돌 위험 0 |
| 17 | **2026-05-19 (ζ)** | mapperLocations 디폴트 = `classpath*:persistence/**\/*.xml` | `classpath:` 사용 시 base 디렉토리 (persistence/) 미존재 환경에서 `PathMatchingResourcePatternResolver` 가 `FileNotFoundException` throw. film 의 `classpath*:` 패턴 정합 |
| 18 | **2026-05-19 (ζ)** | `cactus-mybatis-config.xml` 에서 `<typeAlias alias="map">` 제거 | mybatis 기본 별칭 'map' (java.util.Map) 와 중복 → `TypeException` |
| 19 | **2026-05-19 (μ)** | **R-mybatis-11 해소** — `sqlSessionFactoryIf/Cmn` 의 `@ConditionalOnBean` → `@ConditionalOnProperty` | BDRPP 가 등록한 `cactusDataSourceIf` 를 ConfigurationClass 평가 시점에 detect 못 함. yml 기반 조건으로 변경하여 timing 무관 + cactus 컨벤션 정합 |
| 20 | **2026-05-19 (Phase 2)** | mapper.xml 의 시간 컬럼 = `CURRENT_TIMESTAMP` (`GETDATE()` 대신) | SQLServer + SQLite 양쪽 호환. local 테스트 환경에서도 정상 INSERT 검증 |
| 21 | **2026-05-19 (Phase 2)** | mapper.xml 에 rollback 검증용 `recordIfLogFail` statement 추가 | 의도적 SQL 에러 (NONEXISTENT_COL) 로 SQLException 유발 → multi-tx LIFO rollback 검증 |
| 22 | **2026-05-19 (π+σ)** | **R-mybatis-12 해소** — `CactusResponseConverter` 의 List<primitive> 처리 | mapper 의 `resultType="long"` 등 단일 값 결과를 `{"value": item}` 으로 wrap. Number/String/Boolean/Character 안전 처리 + null skip |
| 23 | **2026-05-19 (π+σ)** | **통합 BPMN** — `pilotMultiTxMapper.bpmn` 폐기 + `pilotMultiTx.bpmn` 에 ExclusiveGateway action 분기 (run/rollback) | film 의 `mcm01020` 패턴 정합. 단일 BPMN + URL action 으로 정상/rollback 모두 처리 |
| 24 | **2026-05-19 (π)** | **multi-tx atomicity 실측 검증** — `'integrated-rollback-MUST-NOT-PERSIST'` message DB 0건 | t3_fail SQLException → cactus multi-tx LIFO rollback → t1 의 biz INSERT 도 rollback. ACID atomicity 완전 보장 |
| 25 | **2026-05-19 (ω)** | **default tx/ds 자동 동작 검증** — `pilotDefaultTx.bpmn` script tx/ds 미명시 → biz 자동 commit | `DefaultDataSourceResolver` 빈 (cactus 제공) 의 primary `dataSource` (biz) 자동 추출. 단순 시나리오에 ds/tx 생략 권장 |
| 26 | **2026-05-19 (ψ+Ω)** | **JPA + MyBatis 혼용 atomicity 실측 검증** — `pilotHybridTx.bpmn` 의 t1 ServiceTask+JPA + t2 ScriptTask+mapper | 같은 process tx="txBiz" 안에서 JPA EntityManager 와 SqlSessionTemplate 가 같은 Connection 공유 (TSM 통해). t3_fail SQLException 시 양쪽 INSERT 모두 rollback ('hybrid-rollback-MUST-NOT-PERSIST' DB 0건). §13-1 호환성 가정 확정 |

---

## 18. 부록 — OASIS 소스 분석 (검증 자료)

### 18-1. `SqlScriptTaskExecutable.execute()` — ds/tx 처리 + SqlRunner 호출

`oasis-core/.../executors/SqlScriptTaskExecutable.java:51-110`:

```java
public ExecutionResult execute(ExecutableContext executableContext) {
    TypedObject dataSourceNameObject = null;
    TypedObject transactionManagerNameObject = null;
    DataSource dataSource = null;
    if (dataSourceName != null)
        dataSourceNameObject = executableContext.get(dataSourceName);
    if (transactionManagerName != null)
        transactionManagerNameObject = executableContext.get(transactionManagerName);

    if (dataSourceNameObject != null && transactionManagerNameObject != null)
        throw new IllegalArgumentException("Cannot retrieve the data source. Please input either [ds] or [tx] property.");

    if (transactionManagerNameObject == null && dataSourceNameObject == null) {
        List<TypedObject> defaultDataSourceResolvers = executableContext.get(DefaultDataSourceResolver.class);
        if (defaultDataSourceResolvers.size() == 1) {
            dataSource = defaultDataSourceResolvers.get(0).getObject(DefaultDataSourceResolver.class).defaultDataSource();
        } else if (defaultDataSourceResolvers.size() > 1)
            throw new IllegalArgumentException("There are more than 2 default data sources.");
        else
            throw new IllegalArgumentException("Cannot retrieve the data source. ...");
    }

    dataSource = dataSource == null ?
            getDataSource(dataSourceNameObject, transactionManagerNameObject) :
            dataSource;

    // ... 인라인 SQL vs mapper id 분기
    if (sql != null) {
        result = new JdbcTemplateSqlRunner().run(param, dataSource, columnConverter, sql);
    } else if (sqlId != null) {
        List<TypedObject> typedObjects = executableContext.get(SqlRunner.class);
        if (typedObjects.size() != 1) {
            throw new RuntimeException("Although the SQL ID is set, the executable SqlRunner could not be found.");
        }
        result = typedObjects.get(0).getObject(SqlRunner.class).run(param, dataSource, sqlId);
    }
}
```

### 18-2. `DataSourceExtractorFromTransactionManager.getDataSource()`

`oasis-core/.../executors/DataSourceExtractorFromTransactionManager.java`:

```java
static DataSource getDataSource(TypedObject dataSourceNameObject, TypedObject transactionManagerNameObject) {
    DataSource dataSource;
    if (transactionManagerNameObject != null) {
        Object object = transactionManagerNameObject.getObject();
        if (object instanceof JpaTransactionManager) {
            dataSource = ((JpaTransactionManager) object).getDataSource();
        } else if (object instanceof DataSourceTransactionManager) {
            dataSource = ((DataSourceTransactionManager) object).getDataSource();
        } else {
            throw new IllegalArgumentException("Unsupported transaction manager. " +
                    "Input the data source directly into the [ds] property.");
        }
    } else {
        dataSource = dataSourceNameObject.getObject(DataSource.class);
    }
    return dataSource;
}
```

→ `tx="txIF"` → `JpaTransactionManager.getDataSource()` 호출 → `afterPropertiesSet()` 가 자동 추출한 dataSource 반환.

### 18-3. `PropertyNames` — ds / tx 상수

`oasis-core-api/.../model/PropertyNames.java`:

```java
String DATA_SOURCE = "ds";
String TRANSACTION_MANAGER_NAME = "tx";
String ALWAYS_COMMIT_TRANSACTION_MANAGER_NAME = "commitTx";
```

### 18-4. `CamundaScriptTaskBuilder` — scriptFormat 별 처리

`oasis-core/.../unmarshal/camunda/CamundaScriptTaskBuilder.java:33-48`:

```java
switch (scriptFormat) {
    case "sql": {
        String sql = CamundaElementUtil.extractScript(taskElement);
        if (resource == null || resource.length() == 0) {
            if (sql == null || sql.length() == 0)
                throw new IllegalStateException("SQL is empty.");
        }
        return createSqlScriptTask(sql, resource, elementAttrProp);
    }
    // proc, transaction 분기 ...
}
```

→ `camunda:resource` 가 있으면 `sqlId` 로 설정, 없으면 인라인 SQL.

### 18-5. `SpringManagedTransaction.openConnection()` (mybatis-spring 3.0.5)

```java
private void openConnection() throws SQLException {
    this.connection = DataSourceUtils.getConnection(this.dataSource);
    this.autoCommit = this.connection.getAutoCommit();
    this.isConnectionTransactional = DataSourceUtils.isConnectionTransactional(this.connection, this.dataSource);
}
```

→ `DataSourceUtils.getConnection(dataSource)` 호출. TSM 에서 ConnectionHolder 조회 → 활성 TX 의 Connection 재사용 또는 새 발급.

### 18-6. `SqlSessionUtils.getSqlSession()` 와 `registerSessionHolder()`

```java
var holder = (SqlSessionHolder) TransactionSynchronizationManager.getResource(sessionFactory);
var session = sessionHolder(executorType, holder);
if (session != null) return session;

session = sessionFactory.openSession(executorType);
registerSessionHolder(sessionFactory, executorType, exceptionTranslator, session);
```

`registerSessionHolder()` 가 TSM 에 SqlSessionHolder bind (sessionFactory key) → 같은 TX 안의 다음 호출 시 재사용.

### 18-7. `JpaTransactionManager.afterPropertiesSet()` (Spring 6.x)

```java
@Override
public void afterPropertiesSet() {
    if (getEntityManagerFactory() == null) {
        throw new IllegalArgumentException("'entityManagerFactory' or 'persistenceUnitName' is required");
    }
    if (getEntityManagerFactory() instanceof EntityManagerFactoryInfo emfInfo) {
        DataSource dataSource = emfInfo.getDataSource();
        if (dataSource != null) {
            setDataSource(dataSource);
        }
    }
}
```

→ `LocalContainerEntityManagerFactoryBean.getObject()` = `EntityManagerFactoryInfo` proxy → 자동 dataSource 추출.

---

## 19. 참고 문서

| 문서 | 용도 |
|---|---|
| [`oasis-multi-tx-detailed-design.md`](./oasis-multi-tx-detailed-design.md) | multi-tx + multi-DS 상세 설계 (본 설계의 트랜잭션 전제) |
| [`oasis-multi-tx-design.md`](./oasis-multi-tx-design.md) | 상위 설계 + R-multi-* 위험 항목 |
| [`oasis-sqlscript-multidatasource-design.md`](./oasis-sqlscript-multidatasource-design.md) | ScriptTask + multi-DS (본 설계로 통합) |
| [`cactus-core-data-access-migration-plan.md`](./cactus-core-data-access-migration-plan.md) | 1.0.20 마이그레이션 결정 |
| [`usage-guide.md`](./usage-guide.md) | 사용 가이드 (본 설계 반영 후 §5 추가 예정) |
| `src/backend/cactus-core/CHANGELOG.md` | cactus 버전별 변경 사항 |
| `D:\dmes-fwk\workspace-fwk\dmes-film\dmes-film-biz` | film 의 검증된 multi-DS mybatis 운영 사례 (참고 표준) |
| `src/backend/oasis/oasis-core/src/main/java/com/dongkuk/oasis/executors/SqlScriptTaskExecutable.java` | ScriptTask 실행 메커니즘 소스 (ds/tx 처리 + SqlRunner 호출) |
| `src/backend/oasis/oasis-core/src/main/java/com/dongkuk/oasis/executors/DataSourceExtractorFromTransactionManager.java` | TxMgr → DataSource 추출 소스 |
| `src/backend/oasis/oasis-core-api/src/main/java/com/dongkuk/oasis/model/PropertyNames.java` | ds/tx 상수 정의 |
| `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/oasis/task/MyBatisSqlRunner.java` | 기존 MyBatisSqlRunner (단일 SqlSession 제약) — 본 설계가 `CactusMultiMyBatisSqlRunner` 로 대체 |
