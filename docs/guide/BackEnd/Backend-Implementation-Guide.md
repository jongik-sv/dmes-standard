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

마이그레이션 원칙:

- schema 변경은 마이그레이션 파일로 관리한다.
- SQLite 와 MSSQL 을 모두 지원하는 모듈은 양쪽 dialect 파일을 함께 작성한다.
- 이미 공유된 migration 은 수정하지 않고 후속 migration 을 추가한다.
- seed / 운영 데이터 INSERT 는 schema migration 과 분리한다.
- 스키마 변경 시 seed, test fixture, local SQLite template 갱신 여부를 함께 확인한다.

타입 차이 예:

| 용도 | SQLite | MSSQL |
|---|---|---|
| 날짜 | `DATE` | `DATE` |
| 날짜+시간 | `TIMESTAMP` | `DATETIME2` |
| boolean | `BOOLEAN` | `BIT` |

로컬 조사/검증은 사용자가 MSSQL 확인을 명시하지 않는 한 저장소의 SQLite 파일과 SQLite seed/migration 을 우선한다.

### 8.1 {CLIENT} Seed / 데이터 마이그레이션 자산

{CLIENT} ERP 의 원본 데이터를 DMES 도메인 모델로 변환해 적재할 때는 원본·매핑 룰·변환 prompt 세 가지가 코드 자산으로 관리되어야 다음 batch(재변환, 운영 마이그레이션)에서 일관성을 회복할 수 있다.

정본 위치:

| 자산 | 위치 |
|---|---|
| 전체 가이드 | `src/backend/data-migration/ksm-baseline-v1/README.md` |
| 매핑 룰 정본 | `src/backend/data-migration/ksm-baseline-v1/mapping-rules.md` |
| LLM 재변환 prompt 템플릿 | `src/backend/data-migration/ksm-baseline-v1/prompt-templates/README.md` |
| MSSQL dev 적재 SQL | `src/backend/data-migration/ksm-baseline-v1/mssql/*-from-excel.sql` |
| SQLite local seed snapshot | `src/backend/mpn/api/src/main/resources/db/seed/mssql-snapshot/*.sql` |
| MSSQL -> SQLite snapshot 생성 도구 | `src/backend/data-migration/mssql-to-sqlite-sync/README.md` |

작업 원칙:

- MSSQL dev 적재는 `mapping-rules.md` 검토/갱신 → `mssql/*-from-excel.sql` 작성 → `ksm_dmes` 실행 → 행수·합계 검증 → mapping rule 이력 갱신 순서로 한다.
- 결과 SQL 은 멱등 `IF NOT EXISTS`, 품목 FK `EXISTS` 가드, `GO` 배치, 헤더의 통계·룰·일자를 포함한다.
- {CLIENT} 원본 데이터 재변환 시 `prompt-templates/` 의 도메인별 템플릿을 사용하고, 새 룰은 먼저 `mapping-rules.md` 에 문서화한다.
- 새 batch 는 `data-migration/ksm-baseline-v{N}/` 디렉토리를 새로 만들고 README 에 v1 과의 차이점을 명시한다.
- 운영 마이그레이션 준비 시 `mapping-rules.md` 를 spec 으로 결정론 스크립트(PowerShell/Python/Java)를 작성하고, baseline 결과 SQL 을 golden reference 로 검증한다.
- 결과 SQL 만 commit 하고 prompt/매핑 룰 갱신을 누락하지 않는다. 재현 불가능한 상태가 된다.
- `mapping-rules.md` 에 정의되지 않은 매핑은 LLM 임의 추론 금지다. 사용자 합의 후 룰을 먼저 문서화하고 변환한다.
- 원본 Excel 50MB 초과 파일은 `sources/.gitignore` 로 제외하고 보관 경로를 `.gitignore` 주석에 명시한다.
- placeholder fallback 은 결과 SQL 헤더 통계에 별도 카운트하고, `mapping-rules.md` 의 해당 도메인 섹션에 룰을 명시한다.
- MSSQL dev 는 화면이 읽는 live DB 이므로 커밋된 멱등 자산을 경유해 직접 실행한다. ad-hoc 수기 INSERT 는 금지한다.
- SQLite local 은 `LocalSeedDataInitializer` 가 `db/seed/mssql-snapshot/*.sql` 을 파일명 순서로 1회 적재한다. 스냅샷 갱신은 `mssql-to-sqlite-sync/05-generate-seed.cjs` 재실행으로만 한다.

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
