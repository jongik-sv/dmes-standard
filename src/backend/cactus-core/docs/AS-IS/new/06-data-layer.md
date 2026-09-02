# 06. 데이터 레이어 (향후 구현)

> **상태**: 설계 단계. 현재 cactus-core에는 데이터 레이어가 포함되어 있지 않다.
> 필요에 따라 점진적으로 추가한다.
>
> **APS Core Migration 반영**: 패키지 `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*` (`type-handlers-package` 등 패키지 경로 동일하게 적용).

## 1. 핵심 원칙: DataSource는 업무 모듈 소유

cactus-core는 **라이브러리**이므로 DataSource를 직접 생성/설정하지 않는다.
업무 모듈이 설정한 DataSource 빈을 주입받아 사용한다.

```
업무 모듈 (DataSource 설정 주체)
├── application.yml → spring.datasource.* 설정
├── DataSource 빈 생성 (Spring Boot 자동 설정 또는 직접 @Bean)
│
└── cactus-core (주입받아 사용)
    ├── MyBatis 인터셉터 → 업무 모듈의 SqlSessionFactory에 등록
    ├── Audit 인터셉터 → 업무 모듈의 DataSource 경유
    └── JPA Repository → 업무 모듈의 EntityManagerFactory 경유
```

**이유**:
- DataSource 설정(URL, 커넥션 풀, 다중 DataSource)은 배포 환경마다 다르다
- 라이브러리가 DataSource를 생성하면 업무 모듈의 설정과 충돌한다
- 읽기/쓰기 분리, 다중 DataSource 같은 전략도 업무 모듈이 결정한다

## 2. 계획 모듈 목록

| 모듈 | 패키지 | 우선순위 | 설명 |
|------|--------|---------|------|
| MyBatis | `cactus.mybatis` | 높음 | 공통 TypeHandler, 인터셉터 제공 |
| Audit | `cactus.audit` | 중간 | 감사 필드 자동 주입 인터셉터 |
| Cache | `cactus.cache` | 낮음 | 캐시 추상화 유틸리티 |

## 3. MyBatis 통합 설계

cactus-core는 MyBatis **플러그인(인터셉터, TypeHandler)**만 제공한다.
SqlSessionFactory, Mapper 스캔 등 설정은 업무 모듈이 한다.

### 3.1 공통 TypeHandler

| 핸들러 | 용도 |
|--------|------|
| `LocalDateTimeTypeHandler` | Java LocalDateTime ↔ DB TIMESTAMP |
| `BooleanYNTypeHandler` | Java Boolean ↔ DB 'Y'/'N' |
| `JsonTypeHandler` | Java Object ↔ DB JSON/CLOB |

업무 모듈에서 자동 등록:
```yaml
mybatis:
  type-handlers-package: com.dongkuk.dmes.cactus.mybatis.handlers
```

### 3.2 페이징 인터셉터

MyBatis 인터셉터로 Oracle/PostgreSQL 방언별 자동 페이징.

```java
// Mapper에서 PageRequest 파라미터가 있으면 자동으로 COUNT + 페이징 쿼리 실행
@Select("SELECT * FROM TB_ORDER WHERE STATUS = #{status}")
List<Order> searchOrders(@Param("status") String status, PageRequest pageRequest);
```

### 3.3 SQL 로깅 인터셉터

개발 환경에서 실행된 SQL과 바인드 파라미터를 로깅.

## 4. Audit (감사) 설계

데이터 변경 시 자동으로 감사 이력을 기록.

```java
// 자동 감사 필드
public interface Auditable {
    void setCreatedBy(String userId);
    void setCreatedAt(LocalDateTime time);
    void setUpdatedBy(String userId);
    void setUpdatedAt(LocalDateTime time);
}
```

MyBatis 인터셉터로 INSERT/UPDATE 시 자동 주입:
- `CREATED_BY`, `CREATED_AT`: INSERT 시 UserContextHolder에서 추출
- `UPDATED_BY`, `UPDATED_AT`: UPDATE 시 UserContextHolder에서 추출

## 5. Cache 설계

공통 코드, 메뉴 등 자주 조회되는 데이터를 캐시.

```yaml
cactus:
  cache:
    enabled: true
    provider: caffeine          # caffeine | redis
    ttl: 10m
    specs:
      commonCode: { ttl: 30m, maxSize: 1000 }
      menu: { ttl: 1h, maxSize: 100 }
```
