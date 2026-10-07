# TEST - 설정 (Config)

## 대상 클래스

- `SeraiProperties`
- `DataSourceConfig` (MstDataSourceConfig, IfDataSourceConfig)
- `MstMapper` / `IfMapper`
- `SeraiApplication`

---

## TC-CFG-001: SeraiProperties yml 바인딩

### 목적
application.yml의 serai.* 설정이 SeraiProperties에 정상 바인딩되는지 확인한다.

### 사전 조건
```yaml
serai:
  inbound:
    db:
      enabled: true
      thread-pool-size: 15
      batch-size: 200
    file:
      enabled: false
      thread-pool-size: 8
  outbound:
    http:
      connect-timeout: 5000
      read-timeout: 15000
```

### 검증 항목
- [ ] `seraiProperties.getInbound().getDb().isEnabled()` = true
- [ ] `seraiProperties.getInbound().getDb().getThreadPoolSize()` = 15
- [ ] `seraiProperties.getInbound().getDb().getBatchSize()` = 200
- [ ] `seraiProperties.getInbound().getFile().isEnabled()` = false
- [ ] `seraiProperties.getInbound().getFile().getThreadPoolSize()` = 8
- [ ] `seraiProperties.getOutbound().getHttp().getConnectTimeout()` = 5000
- [ ] `seraiProperties.getOutbound().getHttp().getReadTimeout()` = 15000

---

## TC-CFG-002: SeraiProperties 기본값

### 목적
yml에 serai 설정을 명시하지 않았을 때 기본값이 적용되는지 확인한다.

### 사전 조건
- yml에 serai.* 설정 없음

### 검증 항목
- [ ] inbound.db.enabled = true
- [ ] inbound.db.threadPoolSize = 10
- [ ] inbound.db.batchSize = 100
- [ ] inbound.file.enabled = true
- [ ] inbound.file.threadPoolSize = 5
- [ ] outbound.http.connectTimeout = 10000
- [ ] outbound.http.readTimeout = 30000

---

## TC-CFG-003: MST DataSource 연결

### 목적
MST DataSource가 spring.datasource.mst 설정으로 정상 연결되는지 확인한다.

### 사전 조건
```yaml
spring:
  datasource:
    mst:
      jdbc-url: jdbc:oracle:thin:@//HOST:1521/SERVICE
      username: CARAVANUSER
      password: pass
      driver-class-name: oracle.jdbc.OracleDriver
```

### 검증 항목
- [ ] 앱 기동 시 MST DataSource 정상 생성
- [ ] CaravanHubConfigMapper 쿼리 정상 실행
- [ ] @Primary로 설정되어 Caravan 내부 MyBatis도 MST 사용

---

## TC-CFG-004: IF DataSource 연결

### 목적
IF DataSource가 spring.datasource.if 설정으로 정상 연결되는지 확인한다.

### 사전 조건
```yaml
spring:
  datasource:
    if:
      jdbc-url: jdbc:oracle:thin:@//HOST:1521/SERVICE
      username: EAIUSER
      password: ifpass
      driver-class-name: oracle.jdbc.OracleDriver
```

### 검증 항목
- [ ] 앱 기동 시 IF DataSource 정상 생성
- [ ] InterfaceMapper 쿼리 정상 실행
- [ ] MST와 독립적으로 동작

---

## TC-CFG-005: DataSource 연결 실패

### 목적
DataSource 연결 정보가 잘못되었을 때 앱 기동이 실패하는지 확인한다.

### 사전 조건
- jdbc-url을 잘못된 주소로 설정

### 예상 결과
- `Unable to obtain JDBC Connection` 에러
- 앱 기동 실패

### 검증 항목
- [ ] 에러 메시지에 연결 정보 관련 내용 포함
- [ ] 앱이 비정상 종료

---

## TC-CFG-006: Mapper ↔ DataSource 분리 검증

### 목적
@MstMapper가 붙은 Mapper는 MST DataSource를, @IfMapper가 붙은 Mapper는 IF DataSource를 사용하는지 확인한다.

### 사전 조건
- MST와 IF가 서로 다른 DB를 가리키도록 설정

### 검증 항목
- [ ] CaravanHubConfigMapper (@MstMapper) → MST DB에서 쿼리 실행 확인
- [ ] InterfaceMapper (@IfMapper) → IF DB에서 쿼리 실행 확인
- [ ] 서로 교차 접근하지 않음

---

## TC-CFG-007: MyBatis 설정 확인

### 목적
MyBatis Configuration 설정이 정상 적용되는지 확인한다.

### 검증 항목
- [ ] `mapUnderscoreToCamelCase = false` → 컬럼명 그대로 매핑 (언더스코어→카멜 변환 안 함)
- [ ] `callSettersOnNulls = true` → NULL 값도 Map에 키가 포함됨
  - 예: `SELECT NULL AS COLUMN1` → `map.get("COLUMN1")` = null (키 존재)
  - `callSettersOnNulls=false`이면 키 자체가 없음

---

## TC-CFG-008: Oracle JDBC 드라이버 존재 확인

### 목적
Oracle JDBC 드라이버(ojdbc11)가 Gradle 의존성으로 들어와 있는지 확인한다. 이전 Tibero 시절에는 libs/ 폴더의 jar 를 확인했다.

### 검증 항목
- [ ] `ojdbc11` 이 `runtimeOnly` 의존성에 포함
- [ ] 런타임 클래스패스에 ojdbc11 jar 존재
- [ ] 드라이버 클래스 `oracle.jdbc.OracleDriver` 로드 가능

---

## TC-CFG-009: DataSource AutoConfiguration exclude 검증

### 목적
SeraiApplication에서 DataSourceAutoConfiguration과 MybatisAutoConfiguration이 제외되어 수동 설정만 적용되는지 확인한다.

### 검증 항목
- [ ] 자동 설정 미적용 (단일 DataSource 자동 생성 안 됨)
- [ ] DataSourceConfig의 수동 설정만 적용
- [ ] 듀얼 DataSource 정상 동작
