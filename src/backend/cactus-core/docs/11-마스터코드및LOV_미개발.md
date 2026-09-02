# 11. 마스터코드 및 LOV (미개발 — 단, LoV 라우팅 계층 부분 구현)

> 통합 원본: `new/06-data-layer.md` 일부, `frontend/CLAUDE.md` Phase 7 BFF 컨벤션의 LoV 항목.
> 구현 상태:
> - **LoV 진입 컨트롤러**: ✅ **구현됨** — `cactus-core/web/inbound/LovController.java` (4개 엔드포인트)
> - **마스터 코드 엔티티/서비스**: ❌ **미구현** — `MasterCode`, `MasterCodeGroup`, `MasterCodeService`, `MasterCodeRepository` 모두 없음
> - **`MasterCodeProvider` 인터페이스**: ✅ 정의됨 (`cactus-core/web/inbound/MasterCodeProvider.java`), 단 ObjectProvider 옵셔널 등록 → 빈 미등록 시 `/lov/master/*` 호출은 `BusinessException(UNKNOWN_ERROR)` 발생

핵심 기능(마스터 코드 관리)은 미구현 상태이므로 라벨은 `_미개발` 유지하나, **라우팅 계층은 이미 작동 가능한 상태**.

---

## 1. 부분 구현 — LovController

### 1.1 위치 및 시그니처
`cactus-core/web/inbound/LovController.java` (line 46~)

```java
@ResponseBody
@RequestMapping
public class LovController {
    private final SqlSession sqlSession;
    private final OasisServiceExecutor executor;
    private final ObjectProvider<MasterCodeProvider> masterCodeProvider;

    @GetMapping("/lov/master/{code}")            // ROOT 그룹 조회
    @GetMapping("/lov/master/{code}/{group}")    // 그룹 분류 포함

    @PostMapping("/lov/query/{queryId}")         // MyBatis 쿼리 LoV
    @PostMapping("/lov/service/{serviceId}")     // OASIS service 결과 중 lov 키
}
```

> **등록 조건**: `InboundAutoConfiguration.cactusLovController` `@Bean` 으로 명시 등록되며, **`@ConditionalOnClass(SqlSession.class)` + `@ConditionalOnBean({SqlSession.class, OasisServiceExecutor.class})` 둘 다 충족** 시에만 활성화. SqlSession 또는 OasisServiceExecutor 중 하나라도 빈이 없으면 LovController 자체가 등록되지 않음 (단일 컨트롤러 분기 단순화 의도).
>
> `MasterCodeProvider` 는 `ObjectProvider` 로 옵셔널 주입 — 빈 미등록이어도 LovController 자체는 등록되며, `/lov/master/*` 호출 시점에만 `BusinessException(UNKNOWN_ERROR)` 반환 (`/lov/query/*`, `/lov/service/*` 는 정상 작동).
>
> `LovController` 도 **`@Controller` 어노테이션 미부착** (컴포넌트 스캔 회피). Spring 7 호환은 `CactusRequestMappingHandlerMapping` 이 처리. 정리본 02 §2, 03 §2 참고.

### 1.2 응답 타입
| 엔드포인트 | 응답 |
|---|---|
| `/lov/master/*` | `ApiResponse<List<Lov>>` (MasterCodeProvider 빈이 ObjectProvider로 옵셔널 주입) |
| `/lov/query/*` | `ApiResponse<List<Lov>>` |
| `/lov/service/*` | `CactusResponse` (action="lov" 로 OASIS 실행) |

### 1.3 BFF 라우팅 (Phase 7, 작동 중)
| UI → BFF | BFF → BE |
|---|---|
| `/api/{module}/lov/master/{code}/{group?}` (GET) | `/lov/master/{code}/{group?}` |
| `/api/{module}/lov/query/{queryId}` (POST) | `/lov/query/{queryId}` |
| `/api/{module}/lov/service/{serviceId}` (POST) | `/lov/service/{serviceId}` |

frontend `@dk-oasis/shared/http` 의 `apiLovMaster`, `apiLovQuery`, `apiLovService` 헬퍼와 정상 동작 (단 `apiLovMaster` 는 MasterCodeProvider 빈이 등록된 모듈에서만).

---

## 2. 미구현 — 마스터 코드 엔티티/서비스

### 2.1 미존재 클래스
- `MasterCode` (엔티티)
- `MasterCodeGroup` (엔티티)
- `MasterCodeService` (코드 → 라벨 변환)
- `MasterCodeRepository`
- `MasterCodeProvider` 의 **구현 빈** (인터페이스만 있고 구현체 없음 → `/lov/master/*` 가 `UNKNOWN_ERROR` 반환)

### 2.2 제안 명세 (도입 시)
```
TB_MCM_CODE_GROUP   — 코드 그룹 (예: WORK_ORDER_STATUS)
TB_MCM_CODE         — 그룹 내 개별 코드 (READY/RUNNING/DONE/HOLD, 다국어 라벨 포함)
```

```
cactus-core/masterCode/
├── MasterCode.java                    # 엔티티 (CactusAuditEntity 상속)
├── MasterCodeGroup.java
├── MasterCodeService.java             # MC.decode(group, code) → label
├── MasterCodeRepository.java
└── DefaultMasterCodeProvider.java     # MasterCodeProvider 인터페이스 구현 빈
```

### 2.3 사용 패턴 (도입 후 예시)
```java
String label = masterCodeService.decode("WORK_ORDER_STATUS", "READY"); // "준비"
```

---

## 3. 미구현 사유

- 현재 각 모듈이 자체 enum 또는 하드코딩으로 처리 (예: `WorkOrderStatus`, frontend `STATUS_OPTIONS` 상수)
- 다국어 요건 미정립
- 마스터 데이터 관리 화면 (코드 등록/수정 UI) 도 같이 필요 → 큰 작업 단위

---

## 4. 도입 시 고려사항

| 항목 | 설명 |
|---|---|
| 캐시 | 마스터 코드는 변경 빈도 낮음 → 메모리 캐시 (Caffeine) 권장 |
| 다국어 | label_ko, label_en, label_zh 등 언어별 컬럼 또는 별도 다국어 테이블 |
| 권한 | 마스터 코드 관리는 ROLE_ADMIN 만 |
| LoV 동적 쿼리 | MyBatis SQL 인젝션 방지 (`#{}` 바인딩 강제) |
| FE 헬퍼 | 이미 `apiLovMaster/Query/Service` 정의됨 → 시그니처 유지하며 BE 구현 추가만 하면 됨 |
| 마이그레이션 | `MasterCodeProvider` 빈 등록 → 기존 enum/상수 기반 코드 점진 교체 |

---

## 5. 임시 대안 (현재 사용 패턴)

- 모듈별 `STATUS_OPTIONS` 등을 frontend types.ts 에 하드코딩
- BE enum 으로 검증
- LovController 의 `/lov/query/*` 와 `/lov/service/*` 는 MyBatis/OASIS 기반으로 이미 사용 가능 (마스터 코드 미도입 시점에도 임시 LoV 제공 가능)
- 추후 마스터 코드 엔티티 도입 시 `/lov/master/*` 활성화 + 일괄 마이그레이션

---

## 6. 관련 정리본

- 03 OasisController 통합 레이어 (LovController 와 같은 `web/inbound/` 패키지)
- 06 감사엔티티 (마스터 코드 엔티티도 CactusAuditEntity 상속 필요)
- 90 갭분석 및 구현 로드맵
