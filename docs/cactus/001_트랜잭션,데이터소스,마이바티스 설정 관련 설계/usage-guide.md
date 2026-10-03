# cactus-core 사용 가이드 (1.0.22+)

dmes-aps 의 호스트 모듈에서 cactus-core 의 데이터 액세스 / 마스터코드 / Oasis 통합 / **multi-tx +
multi-DS + multi-DS mybatis** 기능을 사용하기 위한 yml + 코드 가이드.

> **DB 전제 안내 (2026-10-03)**: 이 문서의 「운영 = MSSQL」(`mssql-jdbc`, `SQLServerDialect`, `application-mssql.yml` 등)은 dmes-ksm(MSSQL) 이관 시절 전제다. 운영 DB 는 Oracle 또는 PostgreSQL 이고 MSSQL 은 거의 쓰지 않는다. 지금 cactus-core 의 `DialectDetector`·`OasisAutoConfiguration` 은 mssql·sqlite 만 지원하므로 Oracle·PostgreSQL 지원은 별도 작업이다. 새 SQL 은 [`dialect-neutral-sql.md`](../../guide/Database/dialect-neutral-sql.md) 를 따른다.

> **갱신 이력**:
> - **2026-05-20**: cactus 1.0.22-SNAPSHOT 의 audit/mastercode 핵심 fix 반영 (ι + κ + μ):
>   - **R-cactus-audit-1 (ι)** — `OasisServiceExecutor.sc.setAudit(audit)` 추가 → OASIS 경유 모든 INSERT/UPDATE 의 `C_USR_ID/C_SVC_ID/C_PGM_ID/U_*` 자동 채움.
>   - **R-mybatis-13 (κ)** — `MasterCodeJpaAutoConfiguration` `@AutoConfiguration` + `entityManagerFactoryRef="entityManagerFactory"` → multi-EMF 환경에서 MasterCodeMybatisInterceptor 정상 attach.
>   - **μ** — 잔여 시나리오 B-2/B-5/C-2/C-8 검증 완료. R-cactus-doc-1 (`^^` 표현) 정정.
> - **2026-05-19**: cactus 1.0.22 의 multi-DS mybatis (P3 — ScriptTask + ds/tx + camunda:resource) +
>   ExclusiveGateway action 분기 (film 패턴) + 통합 BPMN 추가. §5-3 ScriptTask + mapper id 완성 패턴.
> - **2026-05-18**: cactus 1.0.21 의 multi-tx (옵션 β + δ) + dmes 표준 DS 패턴 (biz/cmn/if) +
>   BPMN ScriptTask 사용법 추가.
> - 1.0.20 마이그레이션 의사결정: [`cactus-core-data-access-migration-plan.md`](./cactus-core-data-access-migration-plan.md)
> - multi-tx 상세 설계: [`oasis-multi-tx-detailed-design.md`](./oasis-multi-tx-detailed-design.md)
> - SqlScriptTask + multi-DS 설계: [`oasis-sqlscript-multidatasource-design.md`](./oasis-sqlscript-multidatasource-design.md)
> - **multi-DS mybatis 통합 설계 (1.0.22+)**: [`cactus-mybatis-multi-ds-design.md`](./cactus-mybatis-multi-ds-design.md) v3.6

---

## 1. 의존성

```gradle
// mcm/lib 또는 mpp/lib 등 도메인 모듈
dependencies {
    api 'com.dongkuk.dmes:cactus-core:1.0.22-SNAPSHOT'

    // ── JPA (모든 multi-tx 모듈 필수) ──
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'

    // ── MyBatis (BPMN ScriptTask mapper id 사용 시) ──
    implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:...'

    // ── JDBC driver — host 가 직접 선택 ──
    implementation 'com.microsoft.sqlserver:mssql-jdbc'   // 운영
    runtimeOnly 'org.xerial:sqlite-jdbc'                  // 로컬
}
```

cactus-core 가 transitive 로 가져오는 라이브러리:
- `oasis-core:5.1.0` (BPMN 서비스 실행)
- `spring-boot-autoconfigure:4.0.6`
- `jjwt-api:0.12.5`, `jbcrypt:0.4` (보안)
- `jackson-databind`, `jackson-datatype-jsr310`

---

## 2. Application 클래스 — 컴포넌트/엔티티 스캔

```java
@SpringBootApplication(scanBasePackages = {
    "com.dongkuk.dmes.cactus",   // cactus 빈 (Filter / Controller / 인터셉터)
    "com.dongkuk.dmes.mymod"       // 모듈 자체 빈
})
@EnableJpaRepositories(basePackages = {
    "com.dongkuk.dmes.mymod"
    // ⚠️ cactus 의 Repository 는 자체 @EnableJpaRepositories 로 등록 — 포함 금지
})
@EntityScan(basePackages = {
    "com.dongkuk.dmes.cactus.security.auth",  // SecUser 등 cactus 엔티티
    "com.dongkuk.dmes.mymod"                    // 모듈 자체 엔티티
})
public class MyModApplication {
    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(MyModApplication.class);
        LocalSqliteDataSource.configure(application, "mymod.db");  // 로컬 SQLite
        application.run(args);
    }
}
```

> **JpaConfig 자체 정의 패턴**: 호스트가 multi-DS 환경 (cactus.datasource.extras.*) 사용 시 default
> EMF/TxMgr 는 호스트가 명시 등록 (mcm 의 `JpaConfig.java` 참고). 이는 cactus 의 `CactusMultiData
> SourceAutoConfiguration` 이 활성될 때 Spring Boot 자동 EMF 와의 catch-22 회피 위함.

---

## 3. application.yml — multi-tx 표준

### 3-1. 핵심 yml 구조 (cactus 1.0.21+)

```yaml
spring:
  application: { name: mymod }
  jpa:
    open-in-view: false
    properties:
      hibernate: { format_sql: true }

cactus:
  # ── OASIS BPMN ──
  oasis:
    service-group: mymod
    service-path: /services         # classpath root 의 services/** 매칭
    transactional: true             # multi-tx 모드 활성화 필수
    cache:
      size: 100                     # BPMN parsing cache (R-multi-22 fix)

  # ── 옵션 β — primary DataSource alias ──
  datasource:
    primary-alias: biz              # Spring Boot dataSource 빈을 'biz' alias

    # ── extras (필요 시) — N개 보조 DS ──
    extras:
      if:                           # 인터페이스 송수신 DB (SERAI 의 SERAIUSER)
        url: ${SERAIUSER_DB_URL:jdbc:sqlserver://...SERAIUSER}
        username: ${SERAIUSER_DB_USER}
        password: ${SERAIUSER_DB_PASSWORD}
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
        maximum-pool-size: 5
      # cmn: { url: ... }           # 공통 DB (대부분 모듈 미사용)

  # ── extras EMF (선택) — JPA Repository 사용 시 ──
  jpa:
    extras:
      if:
        packages-to-scan:
          - com.dongkuk.dmes.mymod.intf          # 모듈 자체 if entity
        persistence-unit-name: cactus-if
        hibernate:
          dialect: org.hibernate.dialect.SQLServerDialect
          ddl-auto: none                       # 운영. local 은 update
          # local sqlite 의 IF NOT EXISTS dialect 필요 시:
          # properties:
          #   hibernate.physical_naming_strategy: org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl

  # ── 옵션 δ — 표준 3개 TxMgr 의무 ──
  tx:
    managers:
      txBiz: { data-source: biz }   # 자체 DB
      txCmn: { data-source: biz }   # mymod 가 cmn 안 쓰면 biz alias 매핑 (의도 명시)
      txIF:  { data-source: if }    # SERAI IF 통합
    default-manager: txBiz          # ★ yml key는 `default-manager` — `default` 는 Java 예약어 binding 불가
```

### 3-2. 환경별 yml 분리

```
application.yml              # cactus.tx.managers + cactus.jpa.extras.if (공통)
application-local.yml        # SQLite override (cactus.datasource.extras.if.url = sqlite)
application-mssql.yml        # MSSQL 로컬 인스턴스
application-dev.yml          # env var 패턴 (default fallback)
application-prod.yml         # env var 의무 (default 없음)
```

### 3-3. yml 키 마이그레이션 매핑 (1.0.20 → 1.0.21)

| 1.0.20 (deprecated) | 1.0.21 |
|---|---|
| `cactus.oasis.transaction-manager-name` | `cactus.tx.default-manager` (필수) |
| `cactus.datasource.secondary.url` | `cactus.datasource.extras.{name}.url` |
| `cactus.jpa.secondary.enabled` | (자동 — packages-to-scan 있으면 활성) |
| `cactus.jpa.secondary.packages-to-scan` | `cactus.jpa.extras.{name}.packages-to-scan` |
| `cactus.jpa.secondary.persistence-unit-name` | `cactus.jpa.extras.{name}.persistence-unit-name` |
| `cactus.jpa.secondary.hibernate.*` | `cactus.jpa.extras.{name}.hibernate.*` |

자세한 마이그레이션은 `oasis-multi-tx-detailed-design.md` 의 §6 참고.

---

## 4. dmes 표준 DS 패턴 (biz / cmn / if)

cactus 사용 모듈은 다음 3가지 DS 명명 규약 따름 (cactus 1.0.21 옵션 δ, 명시 의무):

| Alias | 의미 | mcm 예시 |
|---|---|---|
| **biz** | 모듈 자체 DB | `mcm.db` (local) / `MCMAPUSER` (운영) |
| **cmn** | 공통 DB | (현재 dmes 에 공통 DB 부재 — 모듈이 biz alias 매핑) |
| **if** | SERAI 인터페이스 송수신 DB | `serai-if.db` (local) / `SERAIUSER` (운영) |

### 4-1. 모듈이 cmn / if 안 쓰는 경우 — biz alias 통합 명시

```yaml
cactus:
  tx:
    managers:
      txBiz: { data-source: biz }
      txCmn: { data-source: biz }   # ← cmn 안 씀 → biz 로 alias (yml 에 의도 명시)
      txIF:  { data-source: biz }   # ← if 안 씀 → biz 로 alias
    default-manager: txBiz
```

→ Validator (`CactusTxConfigValidator`) 가 같은 DS 매핑 시 warn 출력 (R-multi-25). 의도된 동작.
→ BPMN 의 commitTx 비대칭 commit/rollback 정책 사용 금지 (같은 트랜잭션 join).

### 4-2. 표준 3개 위반 시 부팅 fail

```yaml
cactus:
  tx:
    managers:
      txBiz: { data-source: biz }
      # txCmn 누락
      txIF:  { data-source: if }
    default-manager: txBiz
```

→ Validator 부팅 시 fail:
```
cactus.tx.managers 에 표준 3개 중 누락: [txCmn].
cactus 사용 모듈은 biz/cmn/if 3개 모두 명시 의무.
```

---

## 5. BPMN multi-tx 작성 패턴

### 5-0. ServiceTask + JPA Repository ↔ ScriptTask + mapper 혼용 가능 ★

같은 process tx 안에서 두 패턴을 혼용 가능. JPA EntityManager 와 MyBatis SqlSessionTemplate 가
**같은 Connection 공유** (TransactionSynchronizationManager 통해) → **ACID atomicity 자동 보장**.

운영 권장 분업:
- 비즈 로직 + 도메인 객체 CRUD → `ServiceTask + JPA Repository` (§5-1)
- 화면 SQL 호출 (조회/벌크/통계) → `ScriptTask + camunda:resource` mapper id (§5-3)

**실측 검증** (`pilotHybridTx.bpmn`, 2026-05-19): 한 process tx="txBiz" 안에서 t1 (JPA INSERT) + t2 (mapper INSERT) 모두 commit (정상) 또는 모두 rollback (t3 throw 시). 자세한 내용은 [`cactus-mybatis-multi-ds-design.md`](./cactus-mybatis-multi-ds-design.md) §13-1 참고.

### 5-1. ServiceTask + Repository Config (가장 일반적, 권장)

**적용**: Spring Bean (`@Service`) 호출 + JPA Repository 사용. mcm 의 대부분 시나리오.

#### BPMN 패턴

```xml
<bpmn:process id="myService" isExecutable="true">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txBiz,txIF"/>   <!-- 두 트랜잭션 동시 begin -->
    </camunda:properties>
  </bpmn:extensionElements>

  <bpmn:serviceTask id="t1" camunda:class="myService">
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="method" value="recordBiz"/>
        <camunda:property name="output" value="bizResult"/>
        <camunda:property name="dto" value="com.dongkuk.dmes.mymod.dto.MyRequest"/>
      </camunda:properties>
    </bpmn:extensionElements>
  </bpmn:serviceTask>
</bpmn:process>
```

#### Repository Config (if EMF 매핑)

```java
@Configuration
@ConditionalOnProperty(prefix = "cactus.datasource.extras.if", name = "url")
@EnableJpaRepositories(
    basePackages = "com.dongkuk.dmes.mymod.intf",
    entityManagerFactoryRef = "cactusEntityManagerFactoryIf",
    transactionManagerRef   = "cactusTransactionManagerIf"
)
public class MymodIfRepositoryConfig { }
```

→ Spring Data JPA 가 Repository 호출 시 자동으로 cactusTransactionManagerIf 의 활성 트랜잭션에 join.

### 5-2. ScriptTask + 인라인 SELECT (조회 시나리오)

**적용**: 직접 SQL 조회. 인라인 SELECT 만 (INSERT/UPDATE/DELETE 는 OASIS 가 거부).

```xml
<bpmn:scriptTask id="t2" scriptFormat="sql">
  <bpmn:extensionElements>
    <camunda:properties>
      <!-- ⚠️ ds 또는 tx 중 하나만 명시 (둘 다 명시 시 OASIS 가 거부) -->
      <camunda:property name="tx"     value="txIF"/>            <!-- TxMgr alias → DataSource 자동 추출 -->
      <camunda:property name="input"  value="interfaceId"/>
      <camunda:property name="output" value="ifQueryResult"/>
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:script>SELECT COUNT(*) AS CNT FROM IF_INTERFACE WHERE INTERFACE_ID = :interfaceId</bpmn:script>
</bpmn:scriptTask>
```

→ OASIS 의 `JdbcTemplateSqlRunner` 가 추출된 DataSource 직접 사용. cactus 측 추가 작업 없음.

### 5-3. ScriptTask + MyBatis mapper id (INSERT/UPDATE/DELETE + SELECT 시나리오) — **1.0.22+ 완성**

**적용**: mapper.xml 의 statement id 호출. 화면 1본 단위 매퍼 + multi-DS 분기.
**자동화**: cactus 1.0.22 의 `CactusMultiMybatisAutoConfiguration` + `CactusMultiMyBatisSqlRunner` 가
SqlSessionFactory biz/cmn/if 자동 등록 + dataSource → SqlSessionTemplate 동적 매핑. 호스트 boilerplate 0.

#### 매퍼 xml 위치 컨벤션

```
src/main/resources/persistence/{serviceGroup}/{screen}.xml
```

→ cactus 의 디폴트 mapperLocations = `classpath*:persistence/**/*.xml`. 매퍼 0개여도 안전 (base 디렉토리 미존재 OK).

#### mapper.xml 예제 (film 컨벤션 정합)

```xml
<mapper namespace="security.objectManagement">
  <insert id="insertObj" parameterType="map">
    INSERT INTO TB_SEC_OBJ (OBJ_ID, OBJ_NM) VALUES (#{objId}, #{objNm})
  </insert>
  <select id="countByType" parameterType="map" resultType="long">
    SELECT COUNT(*) FROM TB_SEC_OBJ WHERE OBJ_TYPE = #{type}
  </select>
</mapper>
```

→ namespace = `{serviceGroup}.{screen}` (kebab → camelCase).
→ 시간 컬럼: `CURRENT_TIMESTAMP` (SQLServer + SQLite 호환).

#### BPMN ScriptTask 호출 패턴

```xml
<!-- INSERT/UPDATE/DELETE — {cmd},{namespace}.{statementId} 식별자 -->
<bpmn:scriptTask id="t1" scriptFormat="sql"
                 camunda:resource="insert,security.objectManagement.insertObj">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txBiz"/>          <!-- ★ TxMgr alias → DataSource 자동 추출 -->
      <camunda:property name="output" value="affectedRows"/>
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:scriptTask>

<!-- SELECT — {namespace}.{statementId} (cmd prefix 생략) -->
<bpmn:scriptTask id="t2" scriptFormat="sql"
                 camunda:resource="security.objectManagement.countByType">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="txBiz"/>
      <camunda:property name="output" value="objCount"/>
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:scriptTask>
```

#### 식별자 형식 (film 호환)

| 형식 | 동작 |
|---|---|
| `{namespace}.{statementId}` | select (단일 토큰) |
| `insert,{namespace}.{statementId}` | INSERT |
| `update,{namespace}.{statementId}` | UPDATE |
| `delete,{namespace}.{statementId}` | DELETE |

#### multi-DS 호출 (multi-tx 환경)

```xml
<bpmn:process id="myService">
  <camunda:properties>
    <camunda:property name="tx" value="txBiz,txIF"/>     <!-- 두 트랜잭션 동시 begin -->
  </camunda:properties>

  <bpmn:scriptTask id="t1" scriptFormat="sql" camunda:resource="insert,security.objectManagement.insertObj">
    <camunda:property name="tx" value="txBiz"/>          <!-- biz TX 에 join -->
  </bpmn:scriptTask>

  <bpmn:scriptTask id="t2" scriptFormat="sql" camunda:resource="insert,security.objectManagement.insertIfSync">
    <camunda:property name="tx" value="txIF"/>           <!-- if TX 에 join -->
  </bpmn:scriptTask>
</bpmn:process>
```

→ ScriptTask 의 `tx` 가 어느 DS 의 SqlSessionTemplate 사용할지 결정. CactusMultiMyBatisSqlRunner 가 자동 매핑.

**자세한 설계 + 검증 결과**: [`cactus-mybatis-multi-ds-design.md`](./cactus-mybatis-multi-ds-design.md) §5 (구현) + §7 (BPMN 작성) + §8 (사용 예제 + 실측 검증).

### 5-4. ExclusiveGateway + action 분기 (단일 BPMN, 여러 시나리오)

film 의 `mcm01020^^원재료재고조회.bpmn` 패턴. 한 BPMN 에서 URL action 으로 분기.

```xml
<bpmn:exclusiveGateway id="gateway_action" default="flow_to_run">
  <camunda:property name="input" value="action"/>      <!-- ★ URL 의 {action} 값 매칭 -->
  <bpmn:outgoing>flow_to_run</bpmn:outgoing>
  <bpmn:outgoing>flow_to_rollback</bpmn:outgoing>
</bpmn:exclusiveGateway>

<bpmn:sequenceFlow id="flow_to_run"      name="run"      sourceRef="gateway_action" targetRef="t3"/>
<bpmn:sequenceFlow id="flow_to_rollback" name="rollback" sourceRef="gateway_action" targetRef="t3_fail"/>
```

호출:
- `POST /oasis/myService/run`      → `flow_to_run` 선택
- `POST /oasis/myService/rollback` → `flow_to_rollback` 선택
- 미매칭 action → `default="flow_to_run"` fallback

→ Phase 2 실측 검증 완료 (`pilotMultiTx.bpmn`). 통합 BPMN 패턴 표준 컨벤션.

### 5-5. process tx + script ds/tx 미명시 — cactus default 자동 동작

#### (A) process tx 미명시 → DefaultTxInjectingServiceProvider

```xml
<bpmn:process id="myService">
  <!-- process tx 미명시 -->
  <bpmn:serviceTask .../>
</bpmn:process>
```

→ `DefaultTxInjectingServiceProvider` 가 BPMN load 단계에서 `default-manager=txBiz` 자동 inject →
**txBiz 1개만 begin** (R-multi-11 회피).

#### (B) script ds/tx 미명시 → DefaultDataSourceResolver

```xml
<bpmn:scriptTask scriptFormat="sql" camunda:resource="insert,pilot.recordBizLog">
  <bpmn:extensionElements>
    <camunda:properties>
      <!-- tx, ds 둘 다 미명시 -->
      <camunda:property name="output" value="bizAffected"/>
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:scriptTask>
```

→ OASIS `SqlScriptTaskExecutable` 이 `DefaultDataSourceResolver` 빈 lookup. cactus 의 빈
(`CactusMybatisAutoConfiguration`) 이 **primary `dataSource` (biz) 반환** → `CactusMultiMyBatisSqlRunner`
가 biz `SqlSessionTemplate` 자동 매핑 → biz TX 에 join.

→ **단순 시나리오 (biz 단일 DS) 에는 ds/tx 명시 생략 가능**. 운영자 부담 ↓.

#### (C) 종합 — 모두 미명시 (단순 biz DS 시나리오)

| 미명시 영역 | 자동 동작 |
|---|---|
| process tx | `DefaultTxInjectingServiceProvider` → `cactus.tx.default-manager` (txBiz) 자동 inject |
| script ds/tx | `DefaultDataSourceResolver` → primary `dataSource` (biz) 자동 사용 |
| 결과 | **biz DS + biz TX 자동 처리** (안전) |

**실측 검증** (`pilotDefaultTx.bpmn`, 2026-05-19):
- BPMN: process tx 없음 + script tx/ds 없음
- 호출: `POST /oasis/pilotDefaultTx/run`
- 응답: `{"data":{"bizAffected":1},"meta":{"success":true,"code":"0000"}}`
- DB: TB_PILOT_BIZ_LOG 에 'default-tx-ds-test' message 1건 commit 확인

즉 mcm 의 기존 38개 BPMN (`secUser.bpmn` 등) 처럼 process tx 미명시 + script tx/ds 미명시인 경우 모두 안전.

### 5-6. 호출 — REST API

cactus 의 `OasisController` 가 자동 노출:
```
POST /oasis/{serviceId}/{action}
Content-Type: application/json
X-Client-Key: dmes-bff-local-client-key-2026
Authorization: Bearer <JWT>

{"params": {"key1": "value1", "key2": "value2"}}
```

→ JSON body 의 `params` 가 OASIS process input. action 은 URL path.

응답 예 (정상):
```json
{
  "data":  {"bizResult": ...},
  "grids": {"ifQueryResult": {"rows": [...]}},
  "meta":  {"success": true, "code": "0000"}
}
```

---

## 6. 자주 묻는 시나리오 + 트러블슈팅

### Q. `cactus.tx.default: txBiz` 가 binding 안 됨

→ yml 키는 `default-manager: txBiz` 사용. `default` 는 Java 예약어라 Spring Boot relaxed binding
실패. 자세한 내용은 설계 §6-7 (1).

### Q. BPMN 호출 시 `Cannot retrieve the data source. Please input either [ds] or [tx]`

→ BPMN ScriptTask 에 `ds` 와 `tx` 둘 다 명시. **하나만** 명시 (`tx="txIF"` 권장).

### Q. 화이트리스트 3개 등록 시 모든 호출에 3개 트랜잭션 begin?

→ **아니오**. `DefaultTxInjectingServiceProvider` 가 process tx 미명시 BPMN 에 default 1개 inject →
1개만 begin. process tx 명시한 BPMN 만 다중 begin.

### Q. local SQLite 환경에서 `... already exists` 에러

→ 같은 sqlite 파일을 여러 EMF (서로 다른 PhysicalNamingStrategy) 가 동시에 schema 생성 시 case 충돌.
해결:
1. cactus yml 의 `cactus.jpa.extras.{name}.hibernate.properties.hibernate.physical_naming_strategy` 를
   `PhysicalNamingStrategyStandardImpl` 로 override
2. local 운영 sequence — 외부 schema 생성자 (예: serai caravan) 가 있다면 그쪽을 **먼저** 부팅 시켜
   테이블 생성 → cactus 는 IF NOT EXISTS dialect 로 안전한 update

자세한 내용은 설계 §6-6 + §6-7 (5).

### Q. process tx="txOther" 명시 시 동작

→ OASIS 가 화이트리스트 (cactus.tx.managers) 외 tx 거부 — `IllegalArgumentException`. R-multi-11.

### Q. `JavaServiceTaskExecutable` 에서 `[tx] is an unavailable attribute`

→ ServiceTask 에 task-level `tx` property 명시 불가. process tx + Repository Config 패턴 사용
(§5-1). ScriptTask 만 task tx 지원.

### Q. MyBatis mapper id 사용 multi-DS INSERT 가 한 DS 에만 들어감

→ cactus 1.0.21 의 `MyBatisSqlRunner` 단일 SqlSession 한계. Phase B (`MultiDsMyBatisSqlRunner`)
작업 필요. 자세한 설계는 `oasis-sqlscript-multidatasource-design.md` §4.

### Q. MasterCode 디코딩 룰을 모듈별로 다르게

```java
@Bean
public MasterCodeDecoder mymodMasterCodeDecoder() {
    return new MyModMasterCodeDecoder();
}
```
cactus 의 `DefaultMasterCodeDecoder` 는 `@ConditionalOnMissingBean` 으로 보호 → 위 빈이 우선 적용.

### Q. Oracle 지원

미지원. `compileOnly 'com.oracle.database.jdbc:ojdbc11'` 추가 + `OracleColumnConverter` 신규 작성
필요. 별도 작업.

---

## 7. 활성 모드 매트릭스 (1.0.21+)

| 시나리오 | 필요 키 | 결과 |
|---|---|---|
| **legacy 모드 (1.0.20 호환)** | `cactus.oasis.transactional=true` + `cactus.tx.managers` **미정의** | `SpringServiceStarterFactory(ctx, [transactionManager])` 단일 + `[Cactus Oasis] legacy mode` warn 로그 |
| **multi-tx 모드 (1.0.21 권장)** | `cactus.oasis.transactional=true` + `cactus.tx.managers.{txBiz,txCmn,txIF}` + `default-manager` | multi-TxMgr 화이트리스트 + `DefaultTxInjectingServiceProvider` + `CactusCachingServiceProvider` |
| **multi-DS** | 위 + `cactus.datasource.extras.{name}` | extras DataSource 자동 빈 등록 + yml-key alias |
| **multi-EMF** | 위 + `cactus.jpa.extras.{name}.packages-to-scan` | extras EMF + JpaTxMgr 자동 등록 (`cactusEntityManagerFactoryX`) |
| **HTTP 원격 BPMN** | `cactus.oasis.service-loader-url=http://...{serviceId}` + `transactional=true` | `GenericServiceProvider(HttpServiceDocumentLoader)` |

---

## 8. 부팅 로그 패턴 (정상 시)

```
[Cactus] extras DataSource — bean='cactusDataSourceIf' alias='if' url=...
[Cactus] primary DataSource alias — dataSource → 'biz' (옵션 β)
[Cactus] extras EMF + TxMgr — name='if' emf='cactusEntityManagerFactoryIf' tx='cactusTransactionManagerIf' packages=[...]
[Cactus Tx] alias — 'txBiz' → 'transactionManager'
[Cactus Tx] default TxMgr @Primary — 'transactionManager' (alias 'txBiz')
[Cactus Tx] alias — 'txCmn' → 'transactionManager'
[Cactus Tx] alias — 'txIF' → 'cactusTransactionManagerIf'
[Cactus Oasis] transactional + classpath loader — /services
[Cactus Oasis] multi-tx mode — managers=[txBiz, txCmn, txIF], default=txBiz
[Cactus] AutoConfiguration loaded
[Cactus Tx] 같은 DS 'biz' 에 여러 alias 매핑: [txBiz, txCmn]  ← R-multi-25 warn (의도된 동작)
[Cactus Tx] config validated — managers=[txBiz, txCmn, txIF], default=txBiz, primary-alias=biz
Started MymodApplication in N.NN seconds
```

부팅 후 BPMN 호출 시 transaction 로그:
```
Transaction [txBiz] started.
Transaction [txIF]  started.    ← process tx="txBiz,txIF" 명시 시
... (Service / Script 실행)
Transaction [txIF]  has been committed.   ← LIFO commit
Transaction [txBiz] has been committed.
```

---

## 9. 회귀 디버깅

```yaml
logging:
  level:
    com.dongkuk.dmes.cactus: DEBUG
    com.dongkuk.oasis:       INFO
    org.springframework.transaction: DEBUG    # 트랜잭션 begin/commit 상세
    org.hibernate.SQL:       DEBUG            # 실행 SQL
    org.springframework.boot.autoconfigure: DEBUG  # 부팅 시 conditional 평가
```

핵심 부팅 분기 로그:
- `[Cactus Oasis] multi-tx mode — managers=[...]` 안 보이면 — `cactus.tx.managers` yml 정의 확인
- `[Cactus Tx] config validated` 안 보이면 — `CactusTxConfigValidator` 의 fail-fast 발생 (yml 키 누락 등)

---

## 10. SQLite 로컬 환경의 알려진 제약

- 시간 컬럼이 `TEXT` 로 선언된 경우 `getColumnType()` = `Types.VARCHAR` → `SqliteColumnConverter` 가
  String 그대로 반환. 운영(MSSQL) 의 `Timestamp → Instant` 변환과 동작 차이.
- `ddl-auto=update` 시 SQLite 가 "table already exists" 경고를 출력 — Hibernate warn 만, 부팅에 영향 없음.
- `CactusSqliteIfNotExistsDialect` 가 IF NOT EXISTS 부착 — 외부 schema 생성자와의 협조 위해 (§6 참고).

---

## 11. 마이그레이션 절차

### 11-1. 1.0.20 → 1.0.21 (multi-tx + multi-DS)

설계문서 `oasis-multi-tx-detailed-design.md` 의 **§6 yml 키 마이그레이션 매핑** 정본. 요약:

1. **`cactus.oasis.transaction-manager-name` 제거** → `cactus.tx.default-manager: txBiz` 추가
2. **`cactus.datasource.secondary.*`, `cactus.jpa.secondary.*` 제거** → `cactus.datasource.extras.{name}.*`,
   `cactus.jpa.extras.{name}.*` 로 이전
3. **`cactus.datasource.primary-alias: biz` 추가** (옵션 β)
4. **`cactus.tx.managers` 표준 3개 (txBiz/txCmn/txIF) 명시** (옵션 δ)
5. **`cactus.oasis.cache.size: 100` 추가** (R-multi-22 fix)
6. **호스트 Config 의 `@EnableJpaRepositories` 의 `entityManagerFactoryRef` 빈 이름 변경**:
   - `cactusSecondaryEntityManagerFactory` → `cactusEntityManagerFactoryX` (X = extras key capitalize)
7. **호스트 Application 의 PropertySource override 키 변경**:
   - `cactus.datasource.secondary.url` → `cactus.datasource.extras.{name}.url`
8. **호스트의 `JpaConfig.java` 의 ⚠️ 코멘트 갱신** (cactus secondary → cactus 의 if EMF)

부팅 후 `[Cactus Oasis] multi-tx mode` + `[Cactus Tx] config validated` 로그 확인.

### 11-2. 1.0.21 → 1.0.22 (multi-DS mybatis + audit/mastercode fix)

상세는 [`cactus-mybatis-multi-ds-design.md`](./cactus-mybatis-multi-ds-design.md) v3.6.

1. **mybatis-spring-boot-starter 명시 불요** — cactus 가 `api` 로 transitive 노출 (`build.gradle`).
2. **매퍼 xml 위치 컨벤션 (선택)**: `src/main/resources/persistence/{serviceGroup}/{screen}.xml`. base 디렉토리 0건이어도 안전.
3. **BPMN ScriptTask 패턴**: `camunda:resource="insert,namespace.statementId"` (cmd prefix 옵션 — insert/update/delete) 또는 `camunda:resource="namespace.statementId"` (단순 식별자는 select).
4. **호스트 측 `@EnableJpaRepositories.basePackages` 에 `com.dongkuk.dmes.cactus.mastercode` 추가 불요** (1.0.22 의 `MasterCodeJpaAutoConfiguration` 가 `entityManagerFactoryRef` 명시).
5. **audit 컬럼 자동 채움 동작 인지**: 1.0.22 부터 OASIS 경유 INSERT/UPDATE 의 audit 컬럼 (`C_USR_ID/C_SVC_ID/C_PGM_ID/C_AT/U_*`) 가 자동 채워짐. 이전 (1.0.21) 까지 수동 채우던 호스트 코드 있다면 중복 채움 (덮어쓰기) 점검.

부팅 후 다음 로그 확인:
```
[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryBiz' ... interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor, MasterCodeMybatisInterceptor]
[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryIf'  ... interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor, MasterCodeMybatisInterceptor]
[Cactus Mybatis] CactusMultiMyBatisSqlRunner registered (multi-DS aware)
```

→ 3-interceptor chain (SqlLogging outer / Audit mid / MasterCode inner) 확인 시 정상.

---

## 12. 호환성 정책

| 항목 | 1.0.21 | 1.0.22 |
|---|---|---|
| `cactus.oasis.transaction-manager-name` | `@Deprecated` 유지, legacy 모드 | 유지 (필드 미제거) |
| `cactus.datasource.secondary.*` | `@Deprecated`, `CactusSecondaryDataSourceAutoConfiguration` 동작 | 유지 (자동설정 미제거, 1.0.21 호환) |
| `cactus.jpa.secondary.*` | `@Deprecated` | 유지 |
| `CactusTxConfigValidator` — managers 비어있음 | warn 로그만 | warn (1.0.22 도 호환) |
| OASIS audit 컬럼 채움 | 미동작 (R-cactus-audit-1) | ✅ 자동 (sc.setAudit fix) |
| multi-EMF MasterCode 디코딩 | 미동작 (R-mybatis-13) | ✅ 정상 (@AutoConfiguration + entityManagerFactoryRef) |
| multi-DS mybatis (ScriptTask + mapper id) | `MyBatisSqlRunner` (단일 SqlSession) | ✅ `CactusMultiMyBatisSqlRunner` (multi-DS 동적 분기) |

1.0.21 은 1.0.20 호환 + multi-tx 모드 공존. 1.0.22 도 두 모드 모두 지원 + multi-DS mybatis + audit/mastercode fix.

---

## 부록 — 참고 문서

| 문서 | 용도 |
|---|---|
| [`oasis-multi-tx-detailed-design.md`](./oasis-multi-tx-detailed-design.md) | multi-tx + multi-DS 상세 설계 + Phase 1~9 단계 |
| [`oasis-multi-tx-design.md`](./oasis-multi-tx-design.md) | 상위 설계 + R-multi-1 ~ R-multi-35 위험 항목 |
| [`oasis-sqlscript-multidatasource-design.md`](./oasis-sqlscript-multidatasource-design.md) | BPMN ScriptTask 의 multi-DS 사용 (Phase 0 / Phase B) |
| [`cactus-core-data-access-migration-plan.md`](./cactus-core-data-access-migration-plan.md) | 1.0.20 의 BPMN 로더 fix 등 이전 마이그레이션 결정 |
| `src/backend/cactus-core/CHANGELOG.md` | cactus 버전별 변경 사항 |
