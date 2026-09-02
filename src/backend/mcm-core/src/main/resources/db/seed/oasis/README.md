# mcm-core OASIS 옵션 시드

이 디렉토리의 SQL 은 **OASIS (cactus BPMN) 사이트** 가 선택해서 import 하는 시드 데이터이다.

mcm-core 라이브러리 본체(`db/migration/`)는 **스키마만** 제공하고, OBJ 별 default_actions·기본 PERM 버튼 매핑처럼 사이트 정책에 의존하는 데이터는 본 옵션 시드로 분리한다.

## 적용 방법

### Flyway 사용 사이트
사이트 `application.yml`:

```yaml
spring:
  flyway:
    locations: classpath:db/migration/sqlite, classpath:db/seed/oasis
```

### Flyway 미사용 사이트
SQL 을 직접 실행하거나, 사이트 측 ApplicationRunner / DataInitializer 컴포넌트에서 한 번 실행한다.

## REST-only 사이트

OASIS 컨벤션(`/oasis/{serviceId}/{action}`) 을 안 쓰는 사이트는 본 디렉토리 시드를 사용하지 말고, 사이트 측에 자체 시드(`db/seed/site/`) 를 두어 endpoint 패턴을 자체 컨벤션에 맞춘다.

## 정책

- mcm-core 는 endpoint 문자열을 **코드에 하드코딩하지 않는다.** 모두 데이터(JSON / TB_SEC_PERM_BUTTON 행) 로만 존재한다.
- 따라서 본 디렉토리 시드를 적용하지 않아도 mcm-core 는 동작한다 (단, 사이트가 어떤 식으로든 시드를 채워야 화면이 의미를 가진다).
