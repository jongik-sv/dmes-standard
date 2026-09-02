# 02. 설정 (Config)

## 관련 파일

```
config/
├── SeraiProperties.java       # application.yml의 serai.* 설정 바인딩
├── DataSourceConfig.java     # 듀얼 DataSource (MST + IF) 설정
├── MstMapper.java            # MST DataSource 마커 어노테이션
└── IfMapper.java             # IF DataSource 마커 어노테이션
```

---

## SeraiProperties.java

`application.yml`의 `serai.*` 설정을 자바 객체로 바인딩한다.

### yml 매핑 구조

```yaml
serai:
  inbound:
    db:
      enabled: true             # → seraiProperties.getInbound().getDb().isEnabled()
      thread-pool-size: 10      # → seraiProperties.getInbound().getDb().getThreadPoolSize()
      batch-size: 100           # → seraiProperties.getInbound().getDb().getBatchSize()
    file:
      enabled: true             # → seraiProperties.getInbound().getFile().isEnabled()
      thread-pool-size: 5       # → seraiProperties.getInbound().getFile().getThreadPoolSize()
  outbound:
    http:
      connect-timeout: 10000    # → seraiProperties.getOutbound().getHttp().getConnectTimeout()
      read-timeout: 30000       # → seraiProperties.getOutbound().getHttp().getReadTimeout()
```

### 사용처

| 설정 | 사용하는 클래스 | 용도 |
|------|-----------------|------|
| `inbound.db.enabled` | DbPollingScheduler | DB 폴링 활성화 여부 |
| `inbound.db.threadPoolSize` | DbPollingScheduler | ScheduledExecutorService 스레드 수 |
| `inbound.db.batchSize` | DbPollingService | 1회 조회 건수 (FETCH FIRST N ROWS) |
| `inbound.file.enabled` | FilePollingScheduler | FILE 폴링 활성화 여부 |
| `inbound.file.threadPoolSize` | FilePollingScheduler | ScheduledExecutorService 스레드 수 |
| `outbound.http.connectTimeout` | HttpOutboundHandler | HTTP 연결 타임아웃 (ms) |
| `outbound.http.readTimeout` | HttpOutboundHandler | HTTP 읽기 타임아웃 (ms) |

### 수정이 필요한 경우

- 폴링 스레드 수를 늘리고 싶다 → `thread-pool-size` 변경
- DB 폴링을 끄고 싶다 → `serai.inbound.db.enabled: false`
- 신규 설정을 추가하고 싶다 → `SeraiProperties` 내부 클래스에 필드 추가 + yml에 값 추가

---

## DataSourceConfig.java

MST와 IF, 두 개의 DataSource를 분리 관리한다.

### 왜 두 개인가?

| DataSource | 용도 | Mapper | XML 위치 |
|------------|------|--------|----------|
| **MST** (@Primary) | 설정 테이블 조회 (`TB_MCM_MOM_KAFKA_SERAI_CONFIG`, `TB_MCM_MOM_KAFKA_TOPICS`) | CaravanHubConfigMapper | `mapper/mst/*.xml` |
| **IF** | 인터페이스 테이블 CRUD (`IF_*` 테이블) | InterfaceMapper | `mapper/if/*.xml` |

현재는 같은 DB를 가리키고 있지만, 운영 환경에서 설정 DB와 인터페이스 DB가 분리될 수 있어서 구조적으로 나눠놨다.

### Mapper ↔ DataSource 연결 구조

```
@MstMapper (마커 어노테이션)
  → DataSourceConfig.MstDataSourceConfig의 @MapperScan이 스캔
  → mstSqlSessionFactory 사용
  → mapper/mst/*.xml 로드

@IfMapper (마커 어노테이션)
  → DataSourceConfig.IfDataSourceConfig의 @MapperScan이 스캔
  → ifSqlSessionFactory 사용
  → mapper/if/*.xml 로드
```

### 새 Mapper를 추가할 때

1. MST 테이블 접근이면 → 인터페이스에 `@MstMapper` 붙이고, XML은 `resources/mapper/mst/`에 생성
2. IF 테이블 접근이면 → 인터페이스에 `@IfMapper` 붙이고, XML은 `resources/mapper/if/`에 생성

### 주의사항

- `SeraiApplication.java`에서 `DataSourceAutoConfiguration`과 `MybatisAutoConfiguration`을 **exclude** 하고 있다. 자동 설정을 쓰면 DataSource가 하나만 잡히기 때문이다.
- MST가 `@Primary`이므로 Caravan 라이브러리 내부의 MyBatis도 MST DataSource를 사용한다.

---

## MstMapper.java / IfMapper.java

각각 1줄짜리 마커 어노테이션이다. `@MapperScan`의 `annotationClass` 속성에 지정해서 "이 어노테이션이 붙은 Mapper만 이 DataSource로 스캔해라"고 지정하는 역할이다.

```java
// CaravanHubConfigMapper.java → MST DB 사용
@MstMapper
public interface CaravanHubConfigMapper { ... }

// InterfaceMapper.java → IF DB 사용
@IfMapper
public interface InterfaceMapper { ... }
```
