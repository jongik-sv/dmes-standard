# Backend Implementation Guide

> {CLIENT}/DMES backend 공통 구현 가이드다.
> 상태 전이, 검증 순서, ID/비즈니스 키, 에러 의미, 테스트 추적성은 [`Business-Logic-Guide.md`](Business-Logic-Guide.md)를 따른다.
> MES OASIS/BPMN 개발은 [`BackEnd_표준_통합_개발가이드_v2.md`](BackEnd_표준_통합_개발가이드_v2.md)가 우선한다.

## 1. 적용 범위와 우선순위

이 문서는 Spring backend 구현에서 공통으로 반복되는 Entity, Repository, DTO, Service, REST Controller, 응답, DB, 보안, 테스트 패턴을 다룬다.

우선순위:

1. `RULE.md`
2. 작업 분기별 정본 가이드: APS 는 `docs/aps/Aps-Guide.md`, MES 는 `docs/guide/MES/Mes-Guide.md`
3. MES OASIS/BPMN 구현: `BackEnd_표준_통합_개발가이드_v2.md`
4. 이 문서의 공통 구현 패턴
5. 모듈별 델타 문서

## 2. Entity와 영속성 모델

### 2.1 감사 필드

- 각 모듈은 자기 모듈의 정본 base entity 를 사용한다.
- 감사 필드는 서비스 코드에서 직접 세팅하지 않는다.
- 생성 감사 필드는 immutable 로 유지한다.
- 시간 타입은 모듈 정책이 허용하면 `Instant` 또는 명시적인 timezone 기준 타입을 사용한다.
- `C_AT`, `C_USR_ID`, `C_SVC_ID`, `C_PGM_ID`, `U_AT`, `U_USR_ID`, `U_SVC_ID`, `U_PGM_ID`, `VER` 계열 감사 컬럼은 cactus 감사 규칙과 충돌하지 않게 유지한다.

### 2.2 Enum

```java
@Enumerated(EnumType.STRING)
@Column(nullable = false, length = 30)
private Status status;
```

- `EnumType.STRING` 을 사용한다.
- `ORDINAL` 은 금지한다.
- DB 컬럼 길이는 가장 긴 enum 값보다 여유 있게 잡는다.
- enum 기본값은 builder, 생성자, DB default 중 어느 계층이 정본인지 모듈별로 하나만 정한다.

### 2.3 연관 관계

> 본 절은 APS·공통 REST 모듈 기준이다. MES OASIS/BPMN 모듈(mcm·mls·mqc·mpp·mas)은 JPA 연관관계 매핑(`@ManyToOne`·`@OneToMany` 등)을 금지한다([standard-v2 02 §6](standard-v2/backend-standard/02-structure-naming-constraints.md)).

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "plant_id", nullable = false)
private Plant plant;
```

- `@ManyToOne` 은 기본적으로 `FetchType.LAZY` 를 사용한다.
- `@OneToMany` 양방향 매핑은 부모-자식 생명주기가 분명한 경우에만 둔다.
- `cascade = CascadeType.ALL` 과 `orphanRemoval = true` 는 소유 관계가 명확할 때만 사용한다.
- 조회 API 에서 N+1 이 발생하면 fetch join, projection, query 분리를 먼저 검토한다.

### 2.4 삭제 정책

삭제 정책은 도메인 성격에 따라 Soft Delete 와 Physical Delete 중 하나를 명시한다.

Soft Delete 를 쓰는 경우:

```java
@Column(name = "is_deleted", nullable = false)
private Boolean isDeleted = false;

public void markDeleted() {
    this.isDeleted = true;
}
```

- 조회 repository 메서드에 `AndIsDeletedFalse` 또는 동등한 필터를 둔다.
- `findById()` 직접 사용 시 삭제 여부를 반드시 필터링한다.
- SQL `DELETE` 대신 엔티티 메서드로 삭제 표시한다.

Physical Delete 를 쓰는 경우:

- 참조 무결성과 운영 이력 보존 요구가 없는지 설계서에서 확인한다.
- 자동 정리 대상이면 보존 기간과 정리 job 을 함께 정의한다.

## 3. Repository

### 3.1 영속성 방식 선택

작업 대상에 따라 영속성 접근 방식을 다음과 같이 적용한다.

| 작업 대상 | 영속성 방식 | 적용 규칙 |
|---|---|---|
| **APS 코어** (`src/backend/aps-core`, `src/backend/mpn` 의 APS 도메인) | **JPA + JPQL 무조건 사용** | Spring Data JPA Repository 기반. 동적/복잡 쿼리는 JPQL `@Query` 로 표현. MyBatis 신규 도입 금지. |
| **OASIS 서비스** (cactus `OasisController` 진입 / `serviceTask`·`ScriptTask` 구현) | **사용자 확인 필수** | 작업 착수 전 "JPA 사용할지 MyBatis 사용할지" 명시적으로 질문하고, 답변에 따라 구현한다. 임의 선택 금지. |

- APS 코어에서 JPA 로 표현이 어려운 케이스가 있더라도 native query (`@Query(nativeQuery = true)`) 또는 EntityManager 직접 사용으로 해결하고, MyBatis 로 우회하지 않는다.
- OASIS 분기에서 사용자 답변 없이 영속성 방식을 가정하고 코드를 작성하면 안 된다.

### 3.2 Repository 작성 원칙

JPA 를 사용하는 모듈은 Spring Data Repository 를 기본으로 한다.

```java
@Repository
public interface ItemRepository extends JpaRepository<Item, String> {
    Optional<Item> findByItemCodeAndIsDeletedFalse(String itemCode);
    Page<Item> findByIsDeletedFalse(Pageable pageable);
    boolean existsByItemCodeAndIsDeletedFalse(String itemCode);
}
```

원칙:

- 존재 확인은 `exists...` 또는 `COUNT(x) > 0` 쿼리를 사용한다.
- JPQL 에서는 DB 컬럼명이 아니라 Java 필드명을 쓴다.
- 파라미터는 `@Param` 으로 명시한다.
- native query 는 JPQL/Repository 메서드로 표현이 어려운 경우에만 사용한다.
- nullable 컬럼이 포함된 유니크 키는 null/non-null 경로를 분리한다.

페이징:

```java
Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
Page<Item> result = itemRepository.findByIsDeletedFalse(pageable);
```

## 4. DTO

### 4.1 Request / Response 분리

- CreateRequest 와 UpdateRequest 를 분리한다.
- 목록용 SummaryResponse 와 상세 Response 는 필요하면 분리한다.
- Entity 를 API 응답으로 직접 반환하지 않는다.
- Response 에는 소비자가 필요한 필드만 포함한다.
- 감사 컬럼은 화면/업무 요구가 있을 때만 명시적으로 노출한다.

### 4.2 Bean Validation

```java
public record ItemCreateRequest(
    @NotBlank(message = "품목 코드는 필수입니다")
    @Size(max = 40, message = "품목 코드는 40자 이하여야 합니다")
    String itemCode,

    @NotBlank(message = "품목명은 필수입니다")
    String itemName
) {}
```

- 문자열 필수는 `@NotBlank`, 비문자열 필수는 `@NotNull` 을 사용한다.
- 메시지는 사용자/운영자가 이해할 수 있게 작성한다.
- 필드 형식 검증은 DTO 에서, 업무 정합성 검증은 Service 에서 수행한다.

## 5. Service

### 5.1 트랜잭션

> 본 절은 APS·공통 기준이다. MES OASIS ServiceTask 진입 Service 에는 `@Transactional` 을 붙이지 않는다 — CGLIB proxy 가 생기면 파라미터명이 소실돼 OASIS 바인딩이 부팅 시 실패한다. OASIS 는 executor 가 트랜잭션을 자동 wrap 한다([standard-v2 02 §6-B](standard-v2/backend-standard/02-structure-naming-constraints.md)).

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ItemService {

    @Transactional
    public ItemResponse create(ItemCreateRequest request) {
        ...
    }
}
```

- 클래스 기본은 `@Transactional(readOnly = true)` 를 권장한다.
- 쓰기 메서드는 `@Transactional` 을 명시한다.
- 수동 `TransactionTemplate` 은 특별한 전파/보상 정책이 필요한 경우에만 사용한다.
- self-invocation 으로 트랜잭션 proxy 가 우회되지 않게 한다.

### 5.2 구조

Service 는 다음 흐름을 기본으로 한다.

1. 참조 엔티티 조회
2. 업무 검증: [`Business-Logic-Guide.md`](Business-Logic-Guide.md#4-비즈니스-검증-순서)
3. 엔티티 생성/변경
4. 저장
5. Response 변환

```java
@Transactional
public ItemResponse create(ItemCreateRequest request) {
    Plant plant = findPlantOrThrow(request.plantId());
    validateCreateRequest(request, plant);
    Item item = Item.create(request.itemCode(), request.itemName(), plant);
    return toResponse(itemRepository.save(item));
}
```

### 5.3 응답 변환

- `toResponse()` 또는 mapper 를 통해 Entity 를 DTO 로 변환한다.
- 컨트롤러에서 Entity 필드를 조립하지 않는다.
- 업무 기준일/상태/수량은 audit 필드를 재사용하지 말고 별도 비즈니스 필드로 둔다.

### 5.4 백엔드 신뢰 경계 — 서버 재검증 (MES)

MES 백엔드 트랜잭션 로직은 앞단(FE)에서 넘어온 값을 그대로 신뢰하지 않는다. 처리에 사용하는 값은 DB에 저장된 권위 값을 백엔드에서 재조회(double-check)하여 사용한다.

- FE 가 보내는 것 중 신뢰하는 것은 식별 키(행 PK, 예: `TPS_NO`) 뿐이다. 일자·수량·상태 등 처리에 영향을 주는 값은 엔티티를 재조회해서 그 값으로 로직을 수행한다.
- 예: 입고처리에서 메인 그리드 입고일자를 FE 에서 바꾸고 저장하지 않은 채 입고처리를 눌러 FE 가 변경값을 보내더라도, 백엔드는 해당 행의 저장된 입고일자를 재조회해 그 일자로 입고처리한다. 미저장 FE 값으로 처리하지 않는다.
- 권한·마감·확정여부 등 가드도 백엔드 재조회로 검증한다. FE 의 disabled/숨김만 믿지 않는다.
- 설계 단계에서 각 트랜잭션 BR 에 "백엔드 재검증" 을 명시한다.
- 입력값의 타입·길이·필수·표준식은 MDM 컬럼 사전 정의로도 서버에서 확인한다 — [§11.2 저장 검증](#112-저장-검증mdmvalidator).

## 6. REST Controller와 응답

REST Controller 를 사용하는 모듈은 다음 패턴을 따른다. MES OASIS/BPMN 경로는 `BackEnd_표준_통합_개발가이드_v2.md` 를 따른다.

```java
@RestController
@RequestMapping("/api/items")
@RequiredArgsConstructor
public class ItemController {

    private final ItemService itemService;

    @PostMapping
    public ResponseEntity<ApiResponse<ItemResponse>> create(@Valid @RequestBody ItemCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(itemService.create(request)));
    }

    @GetMapping("/{itemCode}")
    public ResponseEntity<ApiResponse<ItemResponse>> findById(@PathVariable String itemCode) {
        return ResponseEntity.ok(ApiResponse.success(itemService.findById(itemCode)));
    }
}
```

원칙:

- 컨트롤러에 비즈니스 로직을 넣지 않는다.
- 요청 DTO 에 `@Valid` 를 붙인다.
- 응답은 모듈의 표준 envelope 로 감싼다.
- `try-catch` 는 컨트롤러에 두지 않는다. 전역 예외 핸들러가 처리한다.

HTTP 상태:

| 작업 | 성공 상태 |
|---|---|
| 생성 | `201 Created` |
| 조회 | `200 OK` |
| 수정 | `200 OK` |
| 삭제 | `200 OK` 또는 모듈 표준 |
| 비동기 접수 | `202 Accepted` |

## 7. 예외 처리

- 업무 예외와 에러 코드 의미는 [`Business-Logic-Guide.md`](Business-Logic-Guide.md#7-에러-코드와-예외)를 따른다.
- 컨트롤러에서 예외를 잡아 응답을 직접 만들지 않는다.
- `IllegalArgumentException`, `IllegalStateException`, `RuntimeException` 을 사용자 흐름의 최종 예외로 노출하지 않는다.
- 입력값/업무 규칙 위반은 모듈 표준 `BusinessException` 계열로 변환한다.
- 리소스 미발견은 모듈 표준 not-found 예외를 사용한다.

## 8. DB 마이그레이션과 Seed

DB 전제: 로컬 개발과 자동 테스트는 **SQLite** 로 고정한다. 운영 DB 는 **Oracle 또는 PostgreSQL**(현장마다 하나)이며, 현장에서 어느 쪽인지 확정하기 전에는 한쪽만 가정하지 않는다. MSSQL 은 거의 쓰지 않으며 쓰게 되면 그 현장에서 방언을 더한다(MDM 선례: [ADR-0004](../../mdm/adr/0004-drop-mssql-production-assumption.md)). 방언 중립 SQL 작성 규칙은 [`../Database/dialect-neutral-sql.md`](../Database/dialect-neutral-sql.md) 를 따른다.

마이그레이션 원칙:

- schema 변경은 마이그레이션 파일로 관리한다.
- 운영 방언이 확정된 모듈은 SQLite(로컬·테스트) 폴더와 운영 방언 폴더를 함께 작성하고 두 폴더의 버전 번호 집합을 같게 유지한다. 운영 방언이 미정이면 SQLite 폴더만 둔다.
- 방언 폴더 이름은 `oracle/` · `postgresql/` · `sqlite/` 로 쓰고(`db/migration/{모듈}/sqlite/` 또는 모듈 단 없이 `db/migration/sqlite/`), MSSQL 현장이 생기면(드묾) `mssql/` 을 더한다. Spring Boot Flyway 의 `{vendor}` 자리표시자로 폴더를 고르면 MSSQL 폴더 이름은 `sqlserver` 가 된다.
- 이미 공유된 migration 은 수정하지 않고 후속 migration 을 추가한다.
- seed / 운영 데이터 INSERT 는 schema migration 과 분리한다.
- 스키마 변경 시 seed, test fixture, local SQLite template 갱신 여부를 함께 확인한다.

타입 차이 예:

| 용도 | SQLite | Oracle | PostgreSQL | MSSQL(드묾) |
|---|---|---|---|---|
| 날짜 | `DATE` | `DATE`(시각까지 저장됨 — 날짜만 쓰면 0시) | `DATE` | `DATE` |
| 날짜+시간 | `TIMESTAMP` | `TIMESTAMP` | `TIMESTAMP` | `DATETIME2` |
| boolean | `INTEGER`(0/1, `BOOLEAN` 으로 선언해도 숫자로 저장) | `NUMBER(1)` 또는 `CHAR(1)`(23ai 이상은 `BOOLEAN`) | `BOOLEAN` | `BIT` |
| 가변 문자열(유니코드) | `TEXT`(`VARCHAR(n)` 선언해도 길이 미강제) | `VARCHAR2(n CHAR)`(DB 문자셋 AL32UTF8 기준) 또는 `NVARCHAR2(n)` | `VARCHAR(n)`(DB 인코딩 UTF8) | `NVARCHAR(n)` |
| 자동 증가 id | `INTEGER PRIMARY KEY AUTOINCREMENT` | `NUMBER GENERATED BY DEFAULT AS IDENTITY`(12c 이상) 또는 시퀀스 | `BIGINT GENERATED BY DEFAULT AS IDENTITY` | `BIGINT IDENTITY(1,1)` |
| 큰 텍스트 | `TEXT` | `CLOB` | `TEXT` | `NVARCHAR(MAX)` |

SQLite 의 선언 타입은 친화도만 정하고 강제하지 않는다. 날짜·시각의 실제 저장 형식은 바인딩(컨버터·드라이버 설정)에 따르며, 길이·형식 제약은 SQLite 테스트만으로 검증되지 않는다. 운영 방언이 확정되면 그 방언 DB 에서 같은 마이그레이션을 따로 검증한다.

로컬 조사/검증은 사용자가 운영 방언 확인을 명시하지 않는 한 저장소의 SQLite 파일과 SQLite seed/migration 을 우선한다.

### 8.1 {CLIENT} Seed / 데이터 마이그레이션 자산

{CLIENT} ERP 의 원본 데이터를 DMES 도메인 모델로 변환해 적재할 때는 원본·매핑 룰·변환 prompt 세 가지가 코드 자산으로 관리되어야 다음 batch(재변환, 운영 마이그레이션)에서 일관성을 회복할 수 있다.

아래 경로는 **고객사 착수 시 신설**하는 자리표시자다. 템플릿 리포에는 이관 스크립트의 표준 형태 예시인 [`src/backend/data-migration/sample-migration/`](../../../src/backend/data-migration/sample-migration/README.md) 만 있다. `{client}` 는 고객사 약어, `{운영방언}` 은 `oracle`·`postgresql` 같은 운영 방언 폴더 이름이다(MSSQL 현장이면 `mssql`, 드묾).

정본 위치:

| 자산 | 위치 |
|---|---|
| 전체 가이드 | `src/backend/data-migration/{client}-baseline-v1/README.md` |
| 매핑 룰 정본 | `src/backend/data-migration/{client}-baseline-v1/mapping-rules.md` |
| LLM 재변환 prompt 템플릿 | `src/backend/data-migration/{client}-baseline-v1/prompt-templates/README.md` |
| 운영 방언 dev 적재 SQL | `src/backend/data-migration/{client}-baseline-v1/{운영방언}/*-from-excel.sql` |
| SQLite local seed snapshot | `src/backend/{모듈}/api/src/main/resources/db/seed/{운영방언}-snapshot/*.sql` |
| 운영 방언 → SQLite snapshot 생성 도구 | `src/backend/data-migration/{운영방언}-to-sqlite-sync/README.md` |

작업 원칙:

- 운영 방언 dev 적재는 `mapping-rules.md` 검토/갱신 → `{운영방언}/*-from-excel.sql` 작성 → 고객사 dev DB 에 실행 → 행수·합계 검증 → mapping rule 이력 갱신 순서로 한다.
- 결과 SQL 은 멱등이어야 하고, 품목 FK `EXISTS` 가드와 헤더의 통계·룰·일자를 포함한다. 멱등 구문은 방언별로 고른다.

  | 방언 | 멱등 적재 방법 |
  |---|---|
  | Oracle | `MERGE INTO ... WHEN NOT MATCHED THEN INSERT`, 또는 `DUP_VAL_ON_INDEX` 예외를 무시하는 PL/SQL 블록 |
  | PostgreSQL | `INSERT ... ON CONFLICT DO NOTHING` |
  | SQLite | `INSERT OR IGNORE` |
  | MSSQL(드묾) | `IF NOT EXISTS (...) INSERT ...`, 배치 구분은 `GO` |

- {CLIENT} 원본 데이터 재변환 시 `prompt-templates/` 의 도메인별 템플릿을 사용하고, 새 룰은 먼저 `mapping-rules.md` 에 문서화한다.
- 새 batch 는 `data-migration/{client}-baseline-v{N}/` 디렉토리를 새로 만들고 README 에 v1 과의 차이점을 명시한다.
- 운영 마이그레이션 준비 시 `mapping-rules.md` 를 spec 으로 결정론 스크립트(PowerShell/Python/Java)를 작성하고, baseline 결과 SQL 을 golden reference 로 검증한다.
- 결과 SQL 만 commit 하고 prompt/매핑 룰 갱신을 누락하지 않는다. 재현 불가능한 상태가 된다.
- `mapping-rules.md` 에 정의되지 않은 매핑은 LLM 임의 추론 금지다. 사용자 합의 후 룰을 먼저 문서화하고 변환한다.
- 원본 Excel 50MB 초과 파일은 `sources/.gitignore` 로 제외하고 보관 경로를 `.gitignore` 주석에 명시한다.
- placeholder fallback 은 결과 SQL 헤더 통계에 별도 카운트하고, `mapping-rules.md` 의 해당 도메인 섹션에 룰을 명시한다.
- 운영 방언 dev DB 가 화면이 읽는 live DB 라면 커밋된 멱등 자산을 경유해 직접 실행한다. ad-hoc 수기 INSERT 는 금지한다.
- SQLite local seed 는 기동 시 `db/seed/{운영방언}-snapshot/*.sql` 을 파일명 순서로 1회 적재하는 초기화 빈을 둔다(고객사 착수 시 구현). 스냅샷 갱신은 `{운영방언}-to-sqlite-sync/` 의 생성 스크립트 재실행으로만 하고 수기 편집하지 않는다.

## 9. 보안과 인증

- 공통 보안 필터와 인증/인가 기반은 cactus 계열 공통 컴포넌트를 우선 사용한다.
- 모듈에서 같은 필터를 중복 구현하지 않는다.
- BFF -> BE 신뢰 채널 키는 `BACKEND_CLIENT_KEY` 를 사용한다.
- permitAll 경로는 모듈별 SecurityConfig 또는 공통 보안 defaults 에서만 관리한다.
- 사용자 컨텍스트 헤더와 JWT 처리 정책은 [`../Security/Security-Guide.md`](../Security/Security-Guide.md)를 따른다.

## 10. 테스트

테스트는 실제 계약과 side effect 를 검증해야 한다.

- 변경 API 테스트는 HTTP status/body 만 검증하지 않는다. 반드시 조회 API 또는 공개 조회 서비스로 다시 읽어 생성/수정/삭제 side effect 를 확인한다.
- controller/service 통합 흐름은 mock 을 쓰지 않는다. mock 은 외부 시스템, 시간/랜덤/네트워크처럼 테스트 경계 밖 의존을 격리할 때만 제한적으로 사용한다.
- 테스트 데이터는 가능한 API 또는 공개 service 로 만든다. 직접 DB insert 는 생성 API 가 없거나 검증 대상 밖의 seed-only 전제 상태가 필요한 경우에만 허용한다.
- 직접 insert 가 필요한 경우 테스트 helper 이름/주석에 `seed-only` 의도를 드러내고, 테스트 본문에서 비즈니스 결과 검증을 DB 조회로 대체하지 않는다.
- 엔진, 최적화, 제약식, scoring 등 복잡 알고리즘은 Spring context 없이 순수 유닛 테스트로 검증한다. 필요한 입력 모델은 builder/factory 로 구성하고, repository/mock 은 최소화한다.
- 개별 테스트 메서드는 1초 이내 완료를 목표로 한다. 1초를 넘는 테스트는 예외 사유가 명확해야 하며 `slow` 태그로 분리한다.
- 실패하는 테스트를 skip/완화/삭제로 숨기지 않는다. 기대값이 낡았는지, 제품 코드 버그인지, 비동기/락/시간 의존성인지 원인을 확인한 뒤 수정한다.
- 테스트 간 static 공유 상태, `@Order` 의존 데이터 흐름, 이전 테스트 성공을 전제로 한 테스트를 새로 만들지 않는다. 한 테스트는 필요한 전제 데이터를 스스로 만든다.
- 현재 시각보다 미래/과거여야 하는 데이터는 고정 과거 날짜 대신 `LocalDate.now()` 기준 상대 날짜로 만든다. `Thread.sleep` polling 은 최소화하고 상태 조회 루프에는 짧은 timeout 과 명확한 종료 조건을 둔다.
- 테스트명에는 설계서 규칙 코드가 있으면 포함한다.

```java
@Test
@DisplayName("[INV-R02] 할당 수량이 현재고를 초과하면 저장 실패")
void invR02_allocatedExceedsOnHandRejected() {
    ...
}
```

기본 검증은 변경 모듈의 targeted test 를 먼저 실행하고, 영향 범위가 넓으면 해당 모듈의 기본 `test` task 를 실행한다.

### 10.1 Spring backend 통합 테스트

- Spring backend 통합 테스트는 전체 schema 를 가진 SQLite template DB 를 클래스별로 복사해 사용한다. schema 는 각 모듈의 migration/schema 자산으로 만든 template 이어야 하며, 각 테스트는 복사본에 데이터만 추가한다.
- 각 backend 모듈은 API 통합 테스트용 meta annotation 과 support base class 를 제공한다. 예: `aps-core` 는 `@ApsApiIntegrationTest` + `ApsApiTestSupport` 를 사용한다. 다른 모듈도 동일한 패턴의 `{Module}ApiIntegrationTest` / `{Module}ApiTestSupport` 를 둔다.
- 새 API 테스트는 모듈별 meta annotation + support base class 를 우선 사용한다. 필요한 마스터/기초 데이터는 `ApsMasterDataApi` 같은 모듈별 API helper 로 만든다.
- 계획/스케줄/운영 결과처럼 관계형 side effect 가 중요한 흐름은 응답과 조회 API 검증 뒤 모듈별 invariant/assertion helper 로 정합성을 확인한다. 예: APS 는 `ApsInvariants.assertThat(jdbc).assertFast()` 또는 범위를 지정한 invariant 를 사용한다.
- 어떤 API 테스트가 데이터 준비를 위해 다른 생성 API 를 호출한다면, 그 생성 API 자체는 별도 테스트에서 응답/조회 side effect 로 검증되어 있어야 한다.
- API 계약 검증이 목적이고 엔진 실행 자체가 검증 대상이 아니면, 테스트 전용 property 로 비동기 dispatch 를 끄거나 동기 executor 를 사용해 SQLite lock/race 를 제거한다. 엔진 실행 검증은 별도 use-case/engine 테스트에서 다룬다.
- 대량 seed 나 운영 유사 데이터를 쓰는 use-case 시나리오는 `@UseCaseTest` 같은 모듈별 meta annotation 과 모듈이 정한 별도 태그(예: aps-core 의 `scenario`)로 분리하고 기본 `test` task 에서 실행하지 않는다. 개발자가 필요할 때 `{module}:useCaseTest` 로 명시 실행한다.
- 1초 예외가 필요한 비-시나리오 테스트는 `slow` 태그로 분리하고 `{module}:slowTest` 로 명시 실행한다.
- 기존 시나리오 라벨 테스트가 실제로는 소형 통합 테스트와 다르지 않다면 모듈별 API/use-case 통합 테스트 형태로 전환한다.
- 변경 후 최소한 관련 targeted test 를 실행하고, 기본 회귀는 해당 모듈의 `test` task 통과를 기준으로 한다. 시나리오/slow 변경 시 각각 `useCaseTest`/`slowTest` 도 확인한다.

#### 10.1.1 mdm Spring 테스트 — 공유 테스트 DB 기반 클래스 (2026-09-26)

- **새 mdm Spring 테스트(`@SpringBootTest`)는 `com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest` 를 상속한다.** 클래스마다 `@TempDir` + 자기 `@DynamicPropertySource` 로 DB 파일을 가리키지 않는다.
  - 이유: `@DynamicPropertySource` 메서드가 클래스마다 다르면 Spring TestContext 캐시 키가 모두 달라져, 클래스마다 컨텍스트(Hibernate·Hikari·Flyway)를 새로 띄운다. 이 방식이 mdm/api 테스트 JVM 시간의 대부분을 차지했고 OOM 도 냈다(docs/dflow-team/perf-audit-report.md P2).
  - 기반 클래스를 상속하면 나머지 설정(`@SpringBootTest`·`@ActiveProfiles`·`@Import`·속성)이 같은 클래스끼리 컨텍스트 하나를 나눠 쓴다. 같은 묶음의 기존 클래스와 어노테이션을 똑같이 맞추면 공유 효과가 난다.
  - 격리는 유지된다. 각 클래스는 시작할 때 "방금 마이그레이션한 새 DB" 와 처음 상태의 테스트 가짜 빈에서 출발한다(`MdmSharedTestDb.resetForTestClass`).
  - 테스트 설정에 값이 바뀌는 가짜 빈(사용자·시계·명부 등)을 새로 두면 `SharedContextResettable` 을 구현해 생성 직후 상태로 되돌린다. 부팅 때 DB 에서 읽어 들이는 메모리 캐시를 새로 만들면 `MdmSharedTestDb.resetForTestClass` 에 재적재를 더한다.
- **상속하지 않는 예외**: 아래 경우는 지금처럼 자기 DB·자기 컨텍스트를 쓴다.
  - `*MigrationTest` 처럼 테스트 DB 자체(새 파일, 마이그레이션 적용 과정)를 검증하는 테스트
  - 고유 속성(`@TestPropertySource`, `@SpringBootTest(properties = …)`, 추가 `registry.add`)이나 그 클래스만의 `@Import` 설정을 쓰는 테스트. 상속해도 틀리지는 않지만 공유 이득이 없다.
  - 클래스마다 클라이언트 키가 다른 RANDOM_PORT 테스트(`*OasisHttpTest` 등)

#### 10.1.2 PC 전역 테스트 슬롯 (2026-09-30)

- 백엔드 모듈 15개의 Test 태스크는 시작할 때 PC 전역 슬롯을 하나 잡는다(`src/backend/gradle/test-slot.gradle`). 같은 PC 에서 동시에 도는 테스트 JVM 은 워크트리·세션·heavy.sh 여부와 상관없이 기본 2개까지다. 나머지는 줄을 서며, 누가 슬롯을 쥐고 있는지 `[test-slot]` 로그로 보여 준다.
  - 이유: 여러 세션이 Gradle 테스트를 동시에 돌려, 성능 코어 4개인 개발 PC 의 부하 평균이 16~24 까지 올랐다. heavy.sh 는 스스로 감싼 명령만 줄 세운다.
  - 테스트 하나를 빠르게 하지는 않는다. 동시에 도는 수만 묶으므로 줄을 선 게이트는 그만큼 늦게 시작한다.
- 환경 변수: `DMES_TEST_SLOTS`(슬롯 수, 기본 2, `0` 이면 끈다) · `DMES_TEST_SLOT_WAIT_MS`(기본 30분, 넘으면 경고하고 슬롯 없이 돈다). `CI` 가 있으면 끈다.
- 슬롯은 `~/.gradle/dmes-test-slots/slot-<i>` 디렉터리다. 루트 테스트 묶음이 끝나면(실패해도) 풀리고, 소유 데몬이 죽었으면 다음 테스트가 회수한다. 손으로 지울 일은 없다.
- 슬롯은 모듈 루트 build.gradle 끝의 `apply from: file('../gradle/test-slot.gradle')` 가 건다(analog 도 같은 파일을 쓴다). Test 캐시 제외·JIT 설정은 `src/backend/build-logic` 의 `dmes.test-conventions` 플러그인이 건다. 슬롯을 플러그인으로 옮기지 않은 까닭은 precompiled script plugin 안의 `apply from` 이 Gradle 9.3.1 에서 구성 단계에 ClassLoaderScope 오류로 실패하기 때문이다. 새 백엔드 모듈(includeBuild)을 추가하면 settings.gradle 맨 앞에 `pluginManagement { includeBuild('../build-logic') }` 를, 루트 build.gradle 의 `plugins {}` 에 `id 'dmes.test-conventions'` 를, 루트 build.gradle 끝에 `apply from: file('../gradle/test-slot.gradle')` 를 넣는다.

## 11. 업무 모듈에서 MDM 메타 켜기

MDM(8096)의 컬럼 사전·도메인·룰·룰 세트·마스터코드·전문 정의를 업무 모듈이 받아 캐시하고 엔진으로 직접 쓴다. 결정은
[mdm ADR-0007](../../mdm/adr/0007-mdm-meta-hybrid-cache-revision.md), 설계는
[spec](../../superpowers/specs/2026-10-02-mdm-meta-cache-design.md).

- 켜기: 모듈 `api/src/main/resources/application.yml` 의 `cactus:` 아래(없으면 최상위 `cactus:` 를 만든다)에 둔다. 기본은 꺼짐이고 MDM 서버 자신은 켜지 않는다.

  ```yaml
  cactus:
    mdm:
      enabled: ${MDM_CACHE_ENABLED:true}
      module: mls                       # /api/{module}/mdmMeta 의 module. 비면 cactus.oasis.service-group
      system-code: MES                  # 컬럼 별칭 매칭 시스템. 표준 물리명으로 못 찾는 이름을 이 시스템의 별칭(TB_MDM_COLUMN_SYSTEM)으로 찾는다. 비우면 끔
      base-url: ${MDM_WAS_URL:http://localhost:8096}
      client-key: ${BACKEND_CLIENT_KEY:dmes-bff-local-client-key-2026}   # MDM 이 받는 키와 같아야 한다. 기본값은 로컬 개발용
      poll-interval: 10s
      page-limit: 1000                  # 폴 요청 한 번에 최대 응답 행 수. revision-lookback 이 0 보다 크면 page-limit 은 revision-lookback 보다 커야 한다(아니면 기동 시 예외)
      revision-lookback: 100            # 늦게 커밋된 기록 재처리 구간. 0 이면 끔(보강 안 함)
      max-entries: 20000
      max-age: 24h        # 적재 뒤 절대 상한
      max-idle: 60m       # 마지막 조회 뒤 유휴 수명(조회될 때마다 연장)
      old-version-max-idle: 10m  # 옛·예약 버전 본문 유휴 수명(D-154). 목차·최종 본문은 max-idle
      versioned-feed: auto       # auto(기본) | off — off 면 전 이력 한 키(배포 중 되돌리기, 재기동해 반영)
      connect-timeout: 2s
      read-timeout: 5s
  ```

- 별칭 매칭: `system-code` 가 있으면 COLUMN 조회(`metaFeed/view`)에만 `params.systemCode` 를 실어, 키가 표준 물리명과 맞지 않을 때 그 시스템의 별칭으로 컬럼을 찾는다(표준 우선·대소문자 무시·모호하면 없음). 별칭으로 맞은 컬럼은 `matchedSystem`·`systemPhysName` 을 함께 받고 `physName` 은 표준 이름이다. 설계는 [spec](../../superpowers/specs/2026-10-03-mdm-column-system-alias-design.md).
- 컬럼 설명 HTML([mdm D-150](../../mdm/decisions.md)): 컬럼 값 맨 끝 칸 `descriptionHtml` 은 설명이 HTML 일 때만 있는 MDM 소독본이고, 그때 `description` 은 그 글자만(엔티티를 풀고 블록·`br` 경계에서 줄을 바꾼 글)이다. 일반 글 설명이면 `descriptionHtml` 은 null 이고 `description` 은 저장된 그대로다. 글자만 그리는 곳은 `description` 을, HTML 을 그리는 곳은 `descriptionHtml` 이 있을 때 그것을 쓴다. `usageNote` 도 HTML 이면 같은 방식으로 글자만 오고, 그 HTML 칸(`usageNoteHtml`)은 없다.
  - 글자 칸: `description`(피드, columnMng 목록·중복 행, 룰 변수 설명)과 `usageNote`(columnMng 중복 행·상세, 목록에는 싣지 않는다)는 늘 글자로 그리고 형식 판별에 넣지 않는다. 글자만 뽑은 결과가 HTML 꼴일 수 있기 때문이다(예: 설명 `<p>&lt;img src=x onerror=…&gt;</p>` 의 글자는 `<img src=x onerror=…>`). 카드는 `descriptionHtml ?? description` 에 판별을 걸지 말고, `descriptionHtml` 이 있을 때만 HTML 로 그린다.
  - 담당: 위는 MDM 피드(`metaFeed/view`) 계약이다. cactus 전달(`MdmColumnMeta`·`MdmScreenColumn`·`mdmMeta/columns`)과 화면 카드는 메타 캐시 세션 담당이다. cactus 가 칸을 더하기 전까지 업무 모듈은 모르는 칸을 무시하고 글자만 설명을 받는다.
  - 판별: 알려진 태그(`p div br span b strong i em u s ul ol li a table thead tbody tr th td h1~h6 code pre blockquote img hr`)가 `</?태그` 꼴(대소문자 무시, ASCII 만 접는다)로 글 어디에든 있고, 이름 바로 뒤 글자가 `A-Za-z0-9_` 가 아니며(글 끝이어도 된다) 그 뒤 어딘가에 `>` 가 있으면 HTML 이다. MDM `ColumnDescriptionFormat` 과 m-mdm `descriptionFormat` 이 같은 꼴(`(?![A-Za-z0-9_])` lookahead + 첫 일치 뒤 `>` 확인)을 쓰고, 아래 사례 표를 양쪽 시험이 함께 쓴다. 정규식 `\b` 는 쓰지 않는다: 자바 `\b` 는 단어 글자 뒤의 결합 문자(U+0307 등)를 단어의 일부로 봐 JS 와 판별이 어긋난다. `[^>]*>` 도 쓰지 않는다: 닫는 `>` 가 없는 긴 입력에서 되추적이 O(n²)다.
  - 소독(컬럼 저장 때, 컬럼 상세(columnMng `view`)·피드 만들 때 한 번 더 — 옛 데이터 방어): jsoup `Safelist.relaxed()` + `hr s del ins mark`. 링크·이미지 주소는 http·https 만 남긴다(공지 `noticeMgmt` 와 달리 mailto 도 뺀다). `on*`·`style` 속성과 `script`·`iframe`·`svg` 같은 허용 목록 밖 태그는 빠진다. 소독은 결과가 바뀌지 않을 때까지(최대 3회) 돌려 멱등이다. jsoup 은 `<pre>` 바로 뒤 줄바꿈을 직렬화할 때 되살리지 않아 소독마다 줄바꿈이 줄므로, 첫 글이 줄바꿈으로 시작하는 `pre` 에 하나를 앞에 붙여 낸다. 소독 뒤 알려진 태그가 남지 않으면(표 밖의 `<td>` 처럼 파서가 버린 경우) 소독본을 `<p>` 로 감싸 HTML 로 저장한다. 엔티티는 풀지 않으므로 화면에는 글자로 보이고, 글자가 없으면 null 이다(엔티티를 풀면 `<td>&lt;img …&gt;</td>` 가 소독되지 않은 `<img …>` 가 된다). 그래서 저장값이 HTML 이면 늘 소독본이다. 일반 글은 소독하지 않는다(`<`·`&` 가 바뀌지 않게).
  - 상한: 설명·활용처 메모 각 20,000자(소독 전 원문, 코드 포인트). 넘으면 `MDM021` "설명은(는) 20000자 이하여야 합니다" 꼴이다.

  | 일반 글(TEXT)로 보는 입력 | HTML 로 보는 입력 |
  |---|---|
  | `a < b` | `<p>x</p>` |
  | `Map<String>` | `<BR/>` (대소문자 무시) |
  | `List<Map<String, Object>>` | `<br>` |
  | `<custom>` (모르는 태그) | `</div>` (닫는 태그만) |
  | `<script>alert(1)</script>` (`s` 뒤가 단어 글자) | `<pre>코드</pre>` |
  | `<brx>` | `<h3>제목</h3>` |
  | `<h7>` | `<a href="https://example.com">링크</a>` |
  | `<abbr>` | `<P CLASS="x">` |
  | `<sub>2</sub>` (소독 허용이지만 판별 목록 밖) | `<p⏎ class="x">본문</p>` (속성 앞 줄바꿈) |
  | `< p>` | `앞 글 <img src="https://example.com/a.png"> 뒤 글` |
  | `<p` (닫는 `>` 없음) | `<b한>` (이름 뒤가 `A-Za-z0-9_` 가 아님) |
  | `>` + `<p` × 10,000 (`>` 가 이름 앞에만, 선형 시간) | `<i̇>` (`i` + 결합 문자 U+0307) |
  | 빈 글·공백·null | `<hr>` · `<s>취소</s>` · `<td>칸</td>` |
  | | `List<A>` (알려진 한계 — 태그 a 와 같은 꼴) |

- 수명: 마지막 조회 뒤 `max-idle` 동안 조회가 없거나 적재 뒤 `max-age`(절대 상한)가 지나면 만료다 — 자주 조회되는 항목일수록 오래 남는다.
  만료 항목은 폴링마다(약 10초) 쓸어 내고, 상한(`max-entries`)을 넘으면 만료 항목, 그다음 오래 조회되지 않은 순(LRU)으로 지운다.
  관리 화면 읽기(`entries`·`entry`)는 수명을 연장하지 않는다.
- 버전 대상(룰·룰 세트·코드·전문)은 목차(`X`)와 버전 본문(`X@1.000`)으로 캐시한다. 지금 적용 중인 버전 본문은 `max-idle`, 지난·예약 버전 본문은 `old-version-max-idle` 이다. 캐시 관리 화면의 '구분' 열로 본다(D-154).
- 빌드: cactus-core 가 `maru-mdm-engine` 을 api 로 문다. 새 업무 모듈은 settings.gradle 에 `includeBuild('../maru-mdm-engine')` +
  `substitute module('kr.dongkuk.maru.mdm:maru-mdm-engine') using project(':')` 를 둔다(기존 다섯 모듈 선례).
- 코드에서 쓰기(업무 서비스가 자기 업무 룰을 돌릴 때): `MdmDefinitionLookup`(엔진 `DefinitionLookup`·`CodeLookup` 빈)을 주입해
  `DefaultDomainValidator`·룰 엔진에 넘긴다. 이 엔진은 평가 중 캐시에 없는 정의를 MDM 에서 받으므로 MDM 을 받을 수 없으면
  `MdmUnavailableException` 이다. 여러 키는 `MdmMetaService.lookup(type, keys)` 로 한 번에 받는다. **저장 검증은 이 엔진으로 하지 않는다** —
  [`MdmValidator`](#112-저장-검증mdmvalidator) 는 캐시 전용 엔진(`MdmCachedDefinitions`)을 스스로 만들어 쓰고, 자동 설정은 그 엔진을
  `MdmEvaluator`·`DomainValidator`·`RuleEngine` 빈으로 내놓지 않는다. 그래서 모듈이 위처럼 만든 엔진을 빈으로 둬도 검증기에 섞이지 않고,
  반대로 그 타입을 주입받는 코드가 캐시 전용 엔진을 얻는 일도 없다.
- 엔드포인트 `/api/{module}/mdmMeta/`: `columns`·`domains`(POST, 로그인 사용자 — 화면 메타·툴팁), `status`·`entries`·`entry`(GET)·`load`(POST)는
  SYSADMIN 만(`X-Authenticated-Role`). BFF `m-mcm/proxy.ts` 는 모듈 이름과 무관한 한 규칙(`authOnlyPatterns: /^\/api\/[^/]+\/mdmMeta\//`)으로
  모든 모듈을 로그인 전용으로 연다 — 새 모듈 때 고치지 않는다. `entries` 는 캐시 값을 싣지 않는다(`bizExpr.text` 같은 서버 전용 값이 브라우저로
  나가지 않게, 있음·없음은 `absent`). 예외로 `entry?type=&key=` 는 항목 하나의 캐시 값 전체(`bizExpr.text` 포함)를 SYSADMIN 에게 준다
  (2026-10-02 사용자 결정, 캐시 관리 화면 상세 보기). 캐시를 읽기만 하고(조회 수·적재 없음) 캐시에 없으면 404 다. `status` 는 대상별 추정
  크기(`bytes`·`totalBytes` — UTF-8 JSON 직렬화 기준, 실제 힙 점유는 이보다 크다)·JVM `heap`·`maxIdleSeconds` 도 주고, `entries` 는
  `sort=key|bytes|hits` 로 정렬한다(그 밖의 값 400).
- 무효화: MDM 원장 쓰기 서비스는 같은 트랜잭션에서 `MetaRevisionRecorder` 를 부른다(판정 값이 바뀌는 쓰기만, 의심스러우면 건다). 새 원장
  쓰기 경로를 만들면 기록 호출을 함께 넣는다. 버전 있는 정의(룰·룰 세트)는 RELEASED 버전 목록째 캐시하고 판정 시각으로 고르므로 DRAFT 쓰기에는
  기록하지 않는다. 확정·확정 취소는 공통 `DefaultVersionStateService` 한 곳에서 기록한다(호출하는 쪽에 또 걸면 이중 기록).

### 11.1 새 업무 모듈에서 MDM 메타 켜기 — 점검표

새 모듈 `{m}`(예: `mmm`)에서 캐시를 켤 때 아래를 모두 한다. 하나라도 빠지면 기동은 되지만 캐시 관리 화면·화면 메타가 동작하지 않는다.

1. **빌드** — `src/backend/{m}/settings.gradle` 에 엔진 includeBuild 를 둔다(cactus-core 가 `maru-mdm-engine` 을 api 로 문다. 기존 다섯 모듈 선례).

   ```groovy
   includeBuild('../maru-mdm-engine') {
       dependencySubstitution {
           substitute module('kr.dongkuk.maru.mdm:maru-mdm-engine') using project(':')
       }
   }
   ```

2. **보안·OASIS(yml)** — `api/src/main/resources/application.yml` 의 `cactus:` 에 `jwt`·`security`·`oasis.service-group` 을 둔다(mls 선례).

   ```yaml
   cactus:
     jwt:
       secret: ${CACTUS_JWT_SECRET:Y2FjdHVzLXNhbXBsZS1zZWNyZXQta2V5LWZvci10ZXN0aW5nLW9ubHktMjAyNg==}
       issuer: {m}
     security:
       client-key: ${BACKEND_CLIENT_KEY:dmes-bff-local-client-key-2026}
       client-key-skip-paths: /auth/,/api/auth/,/actuator/   # override 시 기본 3종이 통째로 대체되므로 전부 나열
     oasis:
       service-group: {m}
   ```

   > ⚠️ 이것이 없으면 `cactus.jwt.secret` 조건이 꺼져 Spring Security 기본 체인(Basic)이 모든 요청을 **401** 로 막는다. 포털 `apiRequest` 는
   > 401 이면 로그인 화면으로 보내므로, 예전에는 캐시 관리 화면을 여는 순간 **관리자가 로그아웃**됐다(2026-10-02 mqc·mpp·mpn 에서 실측).
   > 지금 화면은 모듈 상태를 로그인 이동 없이 「인증 실패」 로 보여 주지만, 그 모듈은 여전히 쓸 수 없다.

3. **MDM 캐시(yml)** — 위 절의 `cactus.mdm` 블록(`enabled`·`module: {m}`·`base-url`·`client-key` 등)을 같은 `cactus:` 아래에 둔다.
4. **포털 `.env`** — `src/frontend/m-mcm/.env` 에 `{M}_WAS_URL`(대문자 모듈 이름, 예 `MMM_WAS_URL=http://localhost:80xx`)을 둔다. BFF 가 이 값으로
   `/api/{m}/...` 를 넘긴다. `proxy.ts` 는 고치지 않는다(mdmMeta 규칙이 모듈 이름과 무관하다).
5. **화면 목록** — `src/frontend/m-mcm/page-components/csa/mdmCacheMng/types.ts` 의 `MDM_CACHE_MODULES` 에 `{m}` 을 더한다.
6. **확인** — 모듈을 띄우고 SYSADMIN 헤더로 status 를 부른다. **200** 이어야 한다(MDM 이 꺼져 있어도 status 는 답한다).

   ```bash
   curl -i -H 'X-Client-Key: dmes-bff-local-client-key-2026' -H 'X-Authenticated-User: admin' \
        -H 'X-Authenticated-Role: SYSADMIN' http://localhost:{port}/api/{m}/mdmMeta/status
   ```

   `401` + `WWW-Authenticate: Basic` 이면 2번이 빠진 것이고, `401 A001` 이면 클라이언트 키가 다르다. 비관리자 역할이면 403 이 맞다.

### 11.2 저장 검증(MdmValidator)

업무 서비스 `save()` 가 MDM 컬럼 사전·룰 세트로 입력값을 한 번 더 검사한다(화면 즉시 검증과 같은 정의, 서버가 기준). 설계는
[spec](../../superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md) §6, 파일럿은 `noticeMgmt` 다(2026-10-07 mls 에서 mcm 으로 이전). 끼어들기(AOP)는 없다 —
**서비스가 명시적으로 부르고, 검사할 컬럼·룰 세트를 요청에 적는다.**

- 받기: `MdmValidator` 를 `ObjectProvider<MdmValidator>` 로 주입한다. `cactus.mdm.enabled=false`(MDM 캐시를 끈 모듈·시험)면 빈이 없으므로
  `getIfAvailable()` 이 null 일 때는 MDM 검증 없이 저장한다. 직접 `MdmValidator` 로 받으면 끈 모듈에서 기동이 실패한다.
- 부르기: 저장 목록(`rowStatus`·`rowKey` 를 그대로 둔 행)과 컬럼을 넘기고 `check()` 로 던진다. 폼 한 건이면 `MdmValidationRequest.record(map)`.

  ```java
  validator.check(MdmValidationRequest.rows("master", rows)   // grid = 응답 errors[].grid, 화면 그리드 이름과 같아야 한다
          .columns("TITLE")                                    // 화면 키(camelCase 도 된다) 또는 물리명
          .ruleSet("RS_NOTICE_SAVE")                           // 선택 — 행마다 룰 세트를 판정한다
          .build());
  ```

- 행: `rowStatus` 가 `D`·`deleted` 인 행은 검증기가 건너뛴다(없으면 폼으로 보고 검사). `rowIndex` 는 **요청 목록의 자리**라서 오류가 화면의 그
  행에 붙는다. 서비스가 저장하지 않을 행(미변경·null)까지 목록에 있으면 그 자리를 `Map.of("rowStatus", "D")` 로 바꿔 자리를 지킨 채 건너뛰게 한다
  (자리를 줄이면 오류 행 번호가 어긋난다. 미변경 행의 옛 값이 지금 저장을 막아서도 안 된다). 검증기도 `null` 행은 건너뛴다. 저장할 행이 하나도 없으면(삭제만) 부르지 않는다.
- 키: 행 키는 물리명으로 맞춰 찾는다(`title`·`TITLE` 모두 `TITLE`). 같은 물리명으로 바뀌는 키가 한 행에 둘 이상이면(`title`+`TITLE`, `" TITLE"`)
  검증기는 하나를 고르지 않고 그 칸을 `E002` 로 거부한다 — 서비스가 저장하는 키와 검증기가 검사하는 키가 갈려 검증을 우회당하지 않게(룰 세트를
  부를 때는 행의 모든 칸이 대상이다). 검사 칸(`columns`·그 비즈니스식 요구 변수)의 값이 배열·객체여도 `E002` 다. 서비스는 검증기가 본 키
  (요청 행의 그 키)로 값을 읽는다.
- **칸 고르기: MDM 이 DB 보다 엄격하지 않은 칸만 `columns(...)` 에 넣는다.** MDM 컬럼 사전은 테이블 구분 없이 물리명 하나로 전역이라, 이름만
  같고 뜻이 다른 칸이 있으면 DB 가 받는 값을 막는다. 넣기 전에 DB DDL(Flyway·엔티티)의 길이·NOT NULL 과 MDM 정의(`TB_MDM_COLUMN` +
  `TB_MDM_DOMAIN` 의 `DATA_TYPE`·`LENGTH`·`SCALE`·`REQUIRED`)를 견주고, MDM 이 더 엄격한 칸은 빼고 이유를 주석에 남긴다. 컬럼 사전에
  없는 컬럼·룰 세트를 적었거나 MDM 관리자가 나중에 이름을 바꾸거나 지우면 검증기는 **예외 없이 그 항목만 건너뛰고** WARN 을 한 번 남긴다
  (모듈·grid·이름). 결과 `missing`(`COLUMN:X`·`RULE_SET:Y`)에 담기며 `ok()` 판정에는 들지 않고 `REJECT` 정책에서도 저장을 막지 않는다 — MDM 관리 변경이
  업무 저장을 통째로 막지 않게 하려는 것이다(받을 수 없음 `unavailable` 과 다르다). 서비스가 `missing` 을 쓸 일은 없지만 시험은 본다.
  빈 컬럼 이름 같은 코드 결함만 `IllegalArgumentException` 이다.
- 기존 수작업 검증(`validateRow` 등)은 지우지 않는다. 겹쳐도 되고, 수작업은 DB 한도·업무 코드 값처럼 MDM 에 없는 것을 본다. 오류를 한 응답으로 모으는
  서비스(noticeMgmt)는 `check()` 가 던진 `INVALID_VALUE` 의 `getErrors()` 를 자기 `errors` 에 합쳐서, **쓰기 전에** 먼저 보고 오류가 있으면 아무것도 쓰지
  않는다. 한 칸(행+필드)에 두 오류가 겹치면 수작업(더 엄격한 DB 한도) 쪽만 남긴다 — 둘 다 내리면 화면이 어느 것을 보이느냐에 따라 "1000자로 줄여도
  200자 오류" 같은 어긋난 안내가 된다. 검증 불가(`BUSINESS_ERROR`·`MDM_UNAVAILABLE`)는 합치지 말고 그대로 던진다.
- 오류 모양: `ErrorDetail(grid, rowKey, rowIndex, field, code, message)`, `field` 는 요청 행의 원래 키, 코드는 필수 `E001`·그 밖 `E002`·검증 불가
  `MDM_UNAVAILABLE`. 서비스가 가진 기존 `ErrorDetail` 의 `rowKey`(예: 공지번호)와 다를 수 있다 — MDM 쪽 `rowKey` 는 행의 `rowKey` 키 값이다.
- MDM 장애(캐시에 정의가 없고 MDM 도 받을 수 없음): 기본은 저장 거부(`cactus.mdm.validation.on-unavailable: REJECT`), `PASS` 면 WARN 만 남기고 통과.
  받아 둔 정의는 캐시(유휴 60분·최대 24시간)가 지키므로 영향은 오래 안 쓴 정의뿐이다. 마루 데이터 대상 `MASTER` 는 지원하지 않는다(그 컬럼은 검증 불가).
- 시험: 서비스 시험 기반 클래스에서 MDM 캐시를 끈다(공지는 mcm `McmNoticeTestDb` 가 `MdmValidator` 빈을 컨텍스트에 두지 않아 `cactus.mdm.enabled=false` 와 같다) — 켜 두면 로컬 MDM(8096)의 가동 여부에 따라 저장
  결과가 달라진다. 검증기를 끼우는 시험은 `@MockitoBean MdmValidator`(요청 모양·오류 합치기)와, 가짜 `MdmMetaFeed` 위에 진짜 `MdmValidator` 를 만들어
  `StaticListableBeanFactory` 로 서비스에 넣는 방식(오류 위치·문구, 장애 정책)을 쓴다. 예: mcm `NoticeMgmtMdmSaveTest`·`NoticeMgmtMdmRealValidatorTest`.

#### 파일럿 — noticeMgmt 칸 비교(2026-10-03, 로컬 `mdm.db`, 당시 mls)

| 서비스 키 | DB 칸 (`TB_MCM_NOTICE`, 당시 `TB_MLS_NOTICE`) | MDM 정의 | MDM vs DB | 결과 |
|---|---|---|---|---|
| `TITLE` | VARCHAR(200) NOT NULL | `TITLE` STRING(1000), 선택, 도메인 `DESC`(183) | 길이 1000 ≥ 200, 필수 아님 — MDM 이 느슨 | `columns("TITLE")` 에 넣음 (200자·필수는 `validateRow` 가 계속 본다) |
| `NOTICE_CATEGORY` | VARCHAR(10) NOT NULL | 같은 물리명 없음 (`CATEGORY` STRING(240) 은 다른 이름) | — | 뺌 (별칭 매칭은 후속, 코드 값은 `validateRow`) |
| `CONTENT` | VARCHAR(4000)·선택 (서버 상한 20만 자, 본문 소독) | 같은 물리명 없음 | — | 뺌 |
| `NOTICE_STATUS` | VARCHAR(10) NOT NULL | 같은 물리명 없음 | — | 뺌 (코드 값은 `validateRow`) |
| `CONTENT_FORMAT` | VARCHAR(10) NOT NULL | 같은 물리명 없음 | — | 뺌 |
| `PIN_YN` | CHAR(1) NOT NULL | 같은 물리명 없음 (`USE_YN` STRING(1) 필수 는 다른 이름) | — | 뺌 |
| `TARGET_SCOPE`·`NOTICE_ID`·`POST_START_DT`·`POST_END_DT` | VARCHAR(10)·VARCHAR(30)·DATE·DATE | 같은 물리명 없음 | — | 뺌 |

spec §7 이 말한 `CATEGORY`·`USE_YN`·`SORT_SEQ` 는 공지 테이블의 칸이 아니다(공지의 분류 칸은 `NOTICE_CATEGORY`). 그래서 화면 파일럿은 MDM 과 이름이
맞는 칸이 `TITLE` 하나뿐이다.
