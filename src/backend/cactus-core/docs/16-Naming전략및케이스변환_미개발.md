# 16. Naming 전략 및 케이스 변환 (미개발)

> 통합 원본: 명시적 단일 원본 없음 (`new/01-architecture.md` 일부, 인프라 가이드)
> 구현 상태: **미구현**. cactus-core 에 UpperSnakeCaseNamingStrategy, CaseConverter, CamelKeyHashMap 등 관련 클래스 전무.

---

## 1. 설계 의도

- JPA `@Column` 자동 매핑 시 Java camelCase ↔ DB UPPER_SNAKE_CASE 일관성
- JSON ↔ Map 변환 시 케이스 자동 변환
- Map 기반 동적 필드 접근 시 camelCase 키로 일관 조회 (CamelKeyHashMap)

---

## 2. 제안 명세

### 2.1 JPA Naming 전략
```java
// cactus-core/persistence/UpperSnakeCaseNamingStrategy.java
public class UpperSnakeCaseNamingStrategy 
    extends PhysicalNamingStrategyStandardImpl {
    
    @Override
    public Identifier toPhysicalColumnName(...) {
        // userId → USER_ID, orderId → ORDER_ID
        return new Identifier(toUpperSnakeCase(name), quoted);
    }
    // 동일 패턴으로 toPhysicalTableName, toPhysicalSchemaName, ...
}
```

application.yml:
```yaml
spring:
  jpa:
    hibernate:
      naming:
        physical-strategy: com.dongkuk.cactus.persistence.UpperSnakeCaseNamingStrategy
```

### 2.2 CaseConverter 유틸
```java
// cactus-core/util/CaseConverter.java
CaseConverter.toCamelCase("USER_ID");      // userId
CaseConverter.toUpperSnakeCase("userId");  // USER_ID
CaseConverter.toLowerSnakeCase("userId");  // user_id
```

### 2.3 CamelKeyHashMap
```java
// MyBatis 또는 JdbcTemplate 결과를 camelCase 키로 변환
Map<String, Object> row = new CamelKeyHashMap();
row.put("USER_ID", "u1");
row.get("userId");  // "u1" 반환 (자동 케이스 변환)
```

---

## 3. 미구현 사유

- 현재 도메인 엔티티가 `@Column(name="USER_ID")` 식으로 명시적 매핑 중 (자동화 안 됨)
- 자동 변환의 가독성/디버깅 trade-off 검토 필요
- MyBatis 의 `<resultMap>` 으로 케이스 변환 처리 가능 (대안 존재)

---

## 4. 도입 시 고려사항

| 항목 | 설명 |
|---|---|
| JPA 적용 범위 | 기존 `@Column(name=...)` 명시적 매핑과 충돌 → 마이그레이션 정책 |
| 예외 케이스 | 약어 (URL → URL_, ID → ID_) 처리 규칙 명확화 |
| MyBatis 통합 | `mapUnderscoreToCamelCase: true` 글로벌 설정 (이미 권장) |
| 디버깅 | 자동 변환은 SQL 로그 분석 시 매핑 추적 어려움 |
| FE 일관성 | BE 가 응답 시 camelCase JSON 보장 (Jackson 기본 동작) |

---

## 5. 임시 대안

- 도메인 엔티티에 `@Column(name="...")` 명시적 매핑 유지
- MyBatis 는 `mapUnderscoreToCamelCase: true` 적용 (resultMap 생략 가능)
- Java/JSON 은 모두 camelCase, DB 는 UPPER_SNAKE_CASE 컨벤션 유지

---

## 6. 관련 정리본

- 02 패키지구조 (util/ 패키지)
- 90 갭분석 및 구현 로드맵
