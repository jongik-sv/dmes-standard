# [완료] MyBatis SQL 로거 개발 플랜

> 일시: 2026-04-03 (원본) / 2026-04-26 (현행 사실 박스)
> 근거: docs/07-dmes-film-이식설계.md (섹션 2.2, 섹션 D)
> 원본: dmes-film-biz `MybatisSqlLogger.java`
> 우선순위: 3순위 (원본)
>
> **구현 완료 사실 (마이그레이션 완료, 2026-04-26)**
> 본 플랜은 cactus-core 본체에 구현 완료되었다. 본문 코드 예시의 `com.dongkuk.cactus.audit` 패키지는 모두 현행 `com.dongkuk.dmes.cactus.audit` 로 읽는다.
> - 산출물: `com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor`
> - AutoConfiguration: `com.dongkuk.dmes.cactus.audit.AuditAutoConfiguration` 의 inner config 로 등록
> - 비활성화 옵션: `logging.level.com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor=OFF`

---

## 1. 원본 분석 (dmes-film)

### 1.1 원본 구현

**파일**: `dmes-film-biz/.../cmn/access/log/MybatisSqlLogger.java`

```java
@Intercepts({
    @Signature(type = Executor.class, method = "query",
        args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}),
    @Signature(type = Executor.class, method = "update",
        args = {MappedStatement.class, Object.class})
})
public class MybatisSqlLogger implements Interceptor {
    private static final Logger log = LoggerFactory.getLogger(MybatisSqlLogger.class);

    @Override
    public Object intercept(Invocation invocation) {
        // 1. queryId + SQL 로깅 (INFO 레벨)
        log.info("Mybatis SQL : \n/* {} */\n{}", queryID, queryString);

        // 2. 바인딩 파라미터 개별 로깅 (INFO 레벨)
        log.info("binding parameter [{}] as [{}] - [{}]", i, type, value);

        // 3. 원본 실행 (실행 시간 측정 없음)
        return invocation.proceed();
    }
}
```

### 1.2 원본 파라미터 추출 방식

```java
private Object getObject(Object parameterObject, ParameterMapping parameterMapping) {
    if (parameterObject instanceof Number || parameterObject instanceof String)
        return parameterObject;                    // 원시 타입 → 직접 반환
    else if (parameterObject instanceof Map)
        return ((Map) parameterObject).get(property);  // Map → key로 조회
    else {
        // POJO → 리플렉션으로 필드 접근 (상위 클래스까지 탐색)
        Field field = findDeclaredField(aClass, property);
        field.setAccessible(true);
        return field.get(parameterObject);
    }
}
```

### 1.3 원본 등록 방식

```java
// 수동 등록 (SqlSessionFactoryBean에 직접 플러그인 설정)
sqlSessionFactoryBean.setPlugins(
    new MybatisSqlLogger(),
    new MybatisAudit(),
    new MasterCodeIntercept(masterCodeDecoder)
);
```

- 3개의 DataAccessConfig (Biz, Frm, Mail)에서 각각 수동 등록
- Spring Boot Auto-Configuration 미사용

### 1.4 원본 vs 이식 설계 비교

| 항목 | dmes-film 원본 | 이식 설계 (07-문서) | 차이점 |
|------|---------------|-------------------|--------|
| **클래스명** | `MybatisSqlLogger` | `SqlLoggingInterceptor` | 이름 변경 |
| **로그 레벨** | `INFO` | `INFO` (동일) | 원본 유지 |
| **로거명** | 클래스명 기반 | 클래스명 기반 (동일) | 원본 유지 |
| **실행 시간** | 측정 안 함 | `elapsed: {}ms` 추가 | 성능 모니터링 강화 |
| **SQL 포맷** | 원본 그대로 (줄바꿈) | 원본 그대로 (동일) | 가독성 우선 |
| **파라미터 추출** | 직접 리플렉션 | `MetaObject` 사용 | MyBatis 공식 API 활용 |
| **등록 방식** | 수동 (setPlugins) | Auto-Configuration | Spring Boot 표준 |
| **성능 가드** | 없음 | `isDebugEnabled()` 체크 | 비활성 시 오버헤드 제거 |
| **예외 처리** | `IllegalStateException` 래핑 | `invocation.proceed()` throws | 깔끔한 예외 전파 |

---

## 2. 이식 방향 결정

### 원본 방식의 장점
- 파라미터를 **개별 행**으로 로깅 → 어떤 값이 어떤 `?`에 바인딩되는지 명확
- SQL을 **원본 포맷 유지** (줄바꿈 포함) → 가독성 좋음
- 리플렉션으로 POJO 필드 직접 접근 → 실제 바인딩 값을 확실히 추출

### 이식 설계의 장점
- `MetaObject` 사용 → MyBatis 내부 API로 안전하고 간결
- `elapsed` 측정 → 슬로우 쿼리 발견
- `DEBUG` 레벨 + `"SQL"` 로거 → 운영에서 세밀한 제어
- `isDebugEnabled()` 가드 → 성능 영향 제로

### 결론: **원본 스타일 유지 + 실행 시간 측정 추가 + Auto-Configuration 등록**

| 항목 | 최종 결정 | 근거 |
|------|----------|------|
| 로거명 | 클래스명 기반 (`SqlLoggingInterceptor.class`) | 원본과 동일 방식 |
| 로그 레벨 | `INFO` | 원본과 동일, 개발 시 별도 설정 없이 즉시 확인 |
| SQL 포맷 | 원본 그대로 (줄바꿈 포함) | 가독성 우선 |
| 파라미터 출력 | `MetaObject` 사용 | MyBatis 공식 API, 코드 간결 |
| 실행 시간 | 측정 | 슬로우 쿼리 감지 (원본에 없던 기능 추가) |
| 성능 가드 | `isInfoEnabled()` | 비활성 시 오버헤드 0 |
| 등록 방식 | Auto-Configuration | Spring Boot 표준 |

---

## 3. 구현 상세

### 3.1 생성/수정 파일

| 파일 | 작업 | 패키지 |
|------|------|--------|
| `SqlLoggingInterceptor.java` | **신규** | `com.dongkuk.cactus.audit` |
| `AuditAutoConfiguration.java` | **수정** (inner class 추가) | `com.dongkuk.cactus.audit` |

> `build.gradle` 수정 불필요 — `compileOnly 'org.mybatis:mybatis:3.5.16'` 이미 존재
> `AutoConfiguration.imports` 수정 불필요 — `AuditAutoConfiguration` 이미 등록됨

### 3.2 SqlLoggingInterceptor.java

```java
package com.dongkuk.cactus.audit;

import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * MyBatis SQL 로깅 인터셉터.
 *
 * <p>실행되는 모든 SQL의 queryId, SQL문, 바인딩 파라미터, 실행 시간을 로깅한다.
 *
 * <p>원본: dmes-film {@code MybatisSqlLogger}
 *
 * <p>로그 출력 예시:
 * <pre>
 * INFO  c.d.c.audit.SqlLoggingInterceptor - Mybatis SQL :
 * /* com.dongkuk.myapp.mapper.OrderMapper.selectByPlant *\/
 * SELECT ORDER_ID, ITEM_CD, QTY
 *   FROM TB_ORDER
 *  WHERE PLANT_CD = ?
 *    AND STATUS = ?
 * INFO  c.d.c.audit.SqlLoggingInterceptor - binding parameter [0] as [java.lang.String] - [P01]
 * INFO  c.d.c.audit.SqlLoggingInterceptor - binding parameter [1] as [java.lang.String] - [NEW]
 * INFO  c.d.c.audit.SqlLoggingInterceptor - elapsed: 12ms
 * </pre>
 *
 * <p>비활성화: {@code logging.level.com.dongkuk.cactus.audit.SqlLoggingInterceptor=OFF}
 */
@Intercepts({
    @Signature(type = Executor.class, method = "query",
               args = {MappedStatement.class, Object.class,
                       RowBounds.class, ResultHandler.class}),
    @Signature(type = Executor.class, method = "update",
               args = {MappedStatement.class, Object.class})
})
public class SqlLoggingInterceptor implements Interceptor {

    private static final Logger log = LoggerFactory.getLogger(SqlLoggingInterceptor.class);

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        // 로그 비활성 시 오버헤드 제거
        if (!log.isInfoEnabled()) {
            return invocation.proceed();
        }

        MappedStatement ms = (MappedStatement) invocation.getArgs()[0];
        Object parameter = invocation.getArgs()[1];

        String queryId = ms.getId();
        BoundSql boundSql = ms.getBoundSql(parameter);
        String sql = boundSql.getSql();  // 원본 포맷 유지 (줄바꿈 포함)

        // SQL 로깅 (원본 스타일: 주석으로 queryId 표시)
        log.info("Mybatis SQL : \n/* {} */\n{}", queryId, sql);

        // 바인딩 파라미터 개별 로깅
        Object parameterObject = boundSql.getParameterObject();
        if (parameterObject != null) {
            List<ParameterMapping> mappings = boundSql.getParameterMappings();
            if (mappings != null) {
                MetaObject metaObject = ms.getConfiguration()
                                          .newMetaObject(parameterObject);
                for (int i = 0; i < mappings.size(); i++) {
                    String prop = mappings.get(i).getProperty();
                    Object value = metaObject.hasGetter(prop)
                                   ? metaObject.getValue(prop) : null;
                    log.info("binding parameter [{}] as [{}] - [{}]",
                             i,
                             value == null ? "null" : value.getClass().getName(),
                             value);
                }
            }
        }

        // 실행 및 소요시간 측정
        long start = System.currentTimeMillis();
        Object result = invocation.proceed();
        long elapsed = System.currentTimeMillis() - start;

        log.info("[{}] elapsed: {}ms", queryId, elapsed);

        return result;
    }
}
```

### 3.3 AuditAutoConfiguration.java 수정

```java
@Configuration
public class AuditAutoConfiguration {

    // ── 기존: 감사 인터셉터 ──
    @Configuration
    @ConditionalOnClass(SqlSessionFactory.class)
    @ConditionalOnBean(SqlSessionFactory.class)
    static class MybatisAuditAutoConfiguration {
        MybatisAuditAutoConfiguration(SqlSessionFactory sqlSessionFactory) {
            sqlSessionFactory.getConfiguration()
                    .addInterceptor(new CactusMybatisAuditInterceptor());
        }
    }

    // ── 추가: SQL 로깅 인터셉터 ──
    @Configuration
    @ConditionalOnClass(SqlSessionFactory.class)
    @ConditionalOnBean(SqlSessionFactory.class)
    static class MybatisSqlLoggingAutoConfiguration {
        MybatisSqlLoggingAutoConfiguration(SqlSessionFactory sqlSessionFactory) {
            sqlSessionFactory.getConfiguration()
                    .addInterceptor(new SqlLoggingInterceptor());
        }
    }
}
```

---

## 4. 인터셉터 실행 순서

MyBatis는 나중에 등록된 인터셉터가 **먼저** 실행된다 (스택/데코레이터 패턴).

```
등록 순서:  1) CactusMybatisAuditInterceptor  2) SqlLoggingInterceptor

실행 순서:  SqlLoggingInterceptor (로깅)
              → CactusMybatisAuditInterceptor (감사값 주입)
                  → 실제 SQL 실행

이 순서가 적합한 이유:
- SQL 로깅은 감사값 주입 전에 실행되어도 무방 (SQL 자체를 로깅)
- 감사값은 SQL 실행 직전에 주입되어야 함
```

dmes-film 원본도 동일한 순서: `new MybatisSqlLogger(), new MybatisAudit()`

---

## 5. 사용법

### application.yml

```yaml
logging:
  level:
    # 기본: INFO → 별도 설정 없이 SQL 로그 출력됨
    # 운영 환경에서 비활성화:
    # com.dongkuk.cactus.audit.SqlLoggingInterceptor: OFF
```

### 로그 출력 예시

```
INFO  c.d.c.audit.SqlLoggingInterceptor - Mybatis SQL :
/* com.dongkuk.myapp.mapper.OrderMapper.selectByPlant */
SELECT ORDER_ID
     , ITEM_CD
     , QTY
     , STATUS
  FROM TB_ORDER
 WHERE PLANT_CD = ?
   AND STATUS = ?
INFO  c.d.c.audit.SqlLoggingInterceptor - binding parameter [0] as [java.lang.String] - [P01]
INFO  c.d.c.audit.SqlLoggingInterceptor - binding parameter [1] as [java.lang.String] - [NEW]
INFO  c.d.c.audit.SqlLoggingInterceptor - [com.dongkuk.myapp.mapper.OrderMapper.selectByPlant] elapsed: 12ms
```

---

## 6. 기존 코드 영향 분석

```
cactus-core/src/main/java/com/dongkuk/cactus/audit/
├── AuditAutoConfiguration.java        ← 수정 (inner class 1개 추가)
├── CactusAudit.java                   ← 변경 없음
├── CactusAuditEntity.java             ← 변경 없음
├── CactusAuditListener.java           ← 변경 없음
├── CactusMybatisAuditInterceptor.java ← 변경 없음
└── SqlLoggingInterceptor.java         ← 신규
```

- MyBatis 미사용 프로젝트: `@ConditionalOnClass` + `@ConditionalOnBean` → 자동 비활성화
- JPA-only 프로젝트: 영향 없음
- 기존 Audit 인터셉터: 독립 동작 (간섭 없음)

---

## 7. 작업 체크리스트

- [ ] `SqlLoggingInterceptor.java` 생성
- [ ] `AuditAutoConfiguration.java`에 inner class 추가
- [ ] 테스트: MyBatis 프로젝트에서 `logging.level.SQL=DEBUG` → SQL 로그 출력 확인
- [ ] 테스트: MyBatis 없는 프로젝트에서 에러 없이 기동 확인
- [ ] 테스트: `logging.level.SQL=OFF` → 로그 비활성화 확인
- [ ] 수정 이력 md 파일 생성
