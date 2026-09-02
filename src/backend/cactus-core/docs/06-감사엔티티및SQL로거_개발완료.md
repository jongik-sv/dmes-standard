# 06. 감사 엔티티 및 SQL 로거 (개발완료)

> 통합 원본: `개발플랜/08-감사엔티티-자동주입-설계.md`, `개발플랜/MyBatis-SQL-로거-개발플랜.md`, `07-dmes-film-이식설계.md` §감사
> 구현 상태: **개발완료** (2026-04-26 마이그레이션 완료). dmes-film 의 감사 자동주입 + SQL 로거가 cactus-core 로 이식됨.

---

## 1. 감사 컬럼 자동 주입

### 1.1 CactusAuditEntity (`@MappedSuperclass`)

`cactus-core/audit/CactusAuditEntity.java`. `@EntityListeners(CactusAuditListener.class)` 자동 부착.

| DB 컬럼 | Java 필드 | 타입 | 의미 |
|---|---|---|---|
| `C_USR_ID` | createdBy | String (length=100) | 생성자 userId |
| `C_AT` | createdAt | **Instant** | 생성일시 |
| `C_SVC_ID` | createdSvcId | String (length=100) | 생성 서비스 ID |
| `C_PGM_ID` | createdPgmId | String (length=100) | 생성 프로그램 ID (menuId) |
| `U_USR_ID` | updatedBy | String (length=100) | 수정자 userId |
| `U_AT` | updatedAt | **Instant** | 수정일시 |
| `U_SVC_ID` | updatedSvcId | String (length=100) | 수정 서비스 ID |
| `U_PGM_ID` | updatedPgmId | String (length=100) | 수정 프로그램 ID |
| `VER` | version | Long | 낙관적 락 (`@Version` 미사용 — Long 필드만 보유, 수동 관리) |

도메인 엔티티가 `extends CactusAuditEntity` 만 하면 자동 적용. 컬럼명은 dmes-film 컨벤션에 맞춘 축약 표기 (`C_*` / `U_*`).

> setter 는 패키지 접근 제한 (`CactusAuditListener` 전용). 외부에서 직접 변경 불가. `@Version` 어노테이션은 부착되어 있지 않아 hibernate 자동 증가 대신 애플리케이션 차원 관리.

### 1.2 CactusAuditListener (JPA)
| 위치 | `cactus-core/audit/CactusAuditListener.java` |
| 어노테이션 | `@PrePersist`, `@PreUpdate` |
| 동작 | `AuditHolder.getAudit()` 의 ThreadLocal 값으로 감사 컬럼 자동 set |

### 1.3 CactusAudit (DTO)
```java
public record CactusAudit(String userId, String menuId, String serviceId) {}
```
`OasisServiceExecutor.execute()` 진입 시 `AuditHolder.setAudit(...)` 호출.

---

## 2. MyBatis 감사 인터셉터

### 2.1 CactusMybatisAuditInterceptor
| 위치 | `cactus-core/audit/CactusMybatisAuditInterceptor.java` |
| 인터페이스 | `org.apache.ibatis.plugin.Interceptor` |
| 시그니처 | `@Intercepts(@Signature(type=Executor.class, method="update", args={MappedStatement.class, Object.class}))` |
| 동작 | INSERT/UPDATE 시 파라미터에 `cUsrId`, `cAt`, `cSvcId`, `cPgmId`, `uUsrId`, `uAt`, `uSvcId`, `uPgmId` 자동 주입 |

MyBatis Mapper SQL 에서 그대로 사용 (DB 컬럼은 `C_*`/`U_*` 축약):
```xml
INSERT INTO TB_FOO (..., C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID)
VALUES (..., #{cUsrId}, #{cAt}, #{cSvcId}, #{cPgmId})
```

---

## 3. SQL 로거

### 3.1 SqlLoggingInterceptor
| 위치 | `cactus-core/audit/SqlLoggingInterceptor.java` |
| 동작 | 모든 MyBatis SQL 실행 전후 로깅 (SQL 텍스트, 파라미터, 실행시간 ms) |
| 로그 레벨 | INFO (실행시간 임계 초과 시 WARN) |
| 의존 | dmes-film 의 `MybatisSqlLogger` 이식본 |

### 3.2 출력 예시
```
[txId-...] [SQL] SELECT * FROM TB_MPP_WORK_ORDER WHERE PLANT_CD = ? -- params: [P1] -- elapsed: 12ms
```

---

## 4. AuditAutoConfiguration

| 항목 | 내용 |
|---|---|
| 위치 | `cactus-core/audit/AuditAutoConfiguration.java` |
| JPA 측 | **빈 등록 없음**. `CactusAuditEntity` 의 `@EntityListeners(CactusAuditListener.class)` 어노테이션으로 직접 부착되므로 별도 설정 불필요 (`AuditAutoConfiguration.java:11` 주석 명시) |
| MyBatis 측 | inner class 2개로 분리: `MybatisAuditAutoConfiguration` + `MybatisSqlLoggingAutoConfiguration` |
| 조건 | 각 inner class 에 `@ConditionalOnClass(SqlSessionFactory.class)` + `@ConditionalOnBean(SqlSessionFactory.class)` 양쪽 부착 |
| 등록 방식 | inner class 생성자에서 `sqlSessionFactory.getConfiguration().addInterceptor(new CactusMybatisAuditInterceptor())` 처럼 **직접 호출** (ConfigurationCustomizer 미사용) |
| 인터셉터 실행 순서 | `SqlLoggingInterceptor` (로깅) → `CactusMybatisAuditInterceptor` (감사값 주입) → SQL 실행 |

---

## 5. 사용 예시

### 5.1 JPA 엔티티
```java
@Entity
@Table(name = "TB_MPP_WORK_ORDER")
@EntityListeners(CactusAuditListener.class)
public class WorkOrder extends CactusAuditEntity {
    @Id private String orderId;
    // ... 도메인 필드만 작성. 감사 컬럼은 부모에서 상속
}
```

### 5.2 MyBatis Mapper
인터셉터가 자동으로 파라미터를 주입하므로, Mapper XML 만 작성 (DB 컬럼은 §1.1 의 `C_*`/`U_*` 축약):
```xml
<insert id="insertFoo">
  INSERT INTO TB_FOO (FOO_ID, NAME, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID)
  VALUES (#{fooId}, #{name}, #{cUsrId}, #{cAt}, #{cSvcId}, #{cPgmId})
</insert>
```

UPDATE 시:
```xml
<update id="updateFoo">
  UPDATE TB_FOO SET NAME = #{name}, U_USR_ID = #{uUsrId}, U_AT = #{uAt},
                    U_SVC_ID = #{uSvcId}, U_PGM_ID = #{uPgmId}
   WHERE FOO_ID = #{fooId}
</update>
```

---

## 6. 의존 흐름

```
HTTP 요청
  ↓ OasisController → OasisServiceExecutor.execute()
  ↓ AuditHolder.setAudit(new CactusAudit(userId, menuId, serviceId))
  ↓ Service 메서드 (JPA save / MyBatis insert)
  ↓ ┌─ JPA: CactusAuditListener.@PrePersist → 엔티티 감사 컬럼 set
    └─ MyBatis: CactusMybatisAuditInterceptor → SQL 파라미터 자동 주입
  ↓ AuditHolder.remove() (finally)
```

---

## 7. 테스트 산출물

- `CactusAuditTest` (CactusAudit record 동작)
- `CactusAuditListenerTest` (`@PrePersist`/`@PreUpdate` 시 컬럼 자동 주입)
- `CactusMybatisAuditInterceptorTest` (MyBatis 파라미터 자동 주입)
- (SqlLoggingInterceptor 단독 테스트는 미작성 — 인터셉터 등록은 AuditAutoConfiguration 통합 동작에서 검증)

---

## 8. 관련 정리본

- 02 패키지구조 (audit/ 패키지, AuditAutoConfiguration)
- 03 OasisController (AuditHolder.setAudit 호출 지점)
- 04 인증보안 (UserContextHolder → userId)
- 13 멀티 데이터소스 라우팅 (미개발)
- 91 마이그레이션 이력 (dmes-film → cactus-core 이식 맥락)
