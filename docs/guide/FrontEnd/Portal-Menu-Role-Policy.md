# Portal 메뉴 역할 정책 (초안)

> 2026-07-09에 공통 가이드 영역으로 이동했다. 이 문서는 APS 전용이 아니라 portal 메뉴/RBAC 공통 정책 초안이다.
>
> **정본 위임**: 식별자(`pageId` 등)는 [standard-v2 명명 규칙](standard-v2/frontend-standard/01-rules-decisions-files.md)의 단일 camelCase 토큰을, RBAC 권한·시드는 [Security](../Security/README.md)(RBAC-PATH-CONVENTION + `DataInitializer` seed 단일 출처)를 정본으로 한다. 본 문서는 **메뉴 가시성 정책**을 다루며, 아래 `<module-id>:<page-name>` 표기와 RBAC seed 절은 정본을 재서술하지 않는 참고다.

## 목적
- 포털 메뉴를 역할(`admin`, `editor`, `viewer`) 기준으로 일관되게 생성하기 위한 규칙을 정의한다.
- 현재 임시 공통 메뉴 노출 정책 이후 단계에서 단계적으로 전환 가능한 기준을 제공한다.

## 기본 원칙
- 메뉴 트리는 3단계(`모듈 그룹 -> 디렉터리 -> 페이지`)만 허용한다.
- 페이지 식별자는 `pageId = "<module-id>:<page-name>"` 형식을 따른다.
- 메뉴 접근 제어는 `페이지 단위`에서 평가하고, 상위 디렉터리는 하위 페이지 가시성에 따라 자동 노출/비노출한다.

## 역할 정의
- `viewer`: 조회 전용 페이지 접근 가능
- `editor`: `viewer` 권한 + 데이터 변경 페이지 접근 가능
- `admin`: `editor` 권한 + 시스템/권한관리 페이지 접근 가능

## 메뉴 생성 규칙
1. 메뉴 원본은 역할 미적용 기준의 전체 메뉴 집합을 사용한다.
2. 각 페이지는 `minimumRole` 메타데이터를 가진다. 기본값은 `viewer`다.
3. 요청 사용자 역할이 `minimumRole` 이상이면 페이지를 노출한다.
4. 하위 페이지가 모두 제거된 디렉터리는 제거한다.
5. 즐겨찾기 항목은 최종 노출 가능한 페이지 집합과 교집합만 노출한다.

## 우선순위/예외 규칙
- `admin` 전용 페이지 예시: `portal:access-management/user-management`
- 운영 중 긴급 노출이 필요한 경우:
- 예외 허용 목록(`allowList`)으로 특정 페이지를 임시 노출할 수 있다.
- 예외는 만료일을 반드시 지정하고, 만료 후 자동 제거한다.
- 정책 충돌 시 우선순위:
- `차단 규칙(deny) > 허용 예외(allowList) > 기본 minimumRole`

## 전환 계획
1. 임시 공통 메뉴 조회를 유지한 상태로 페이지별 `minimumRole` 메타데이터를 정의한다.
2. 메뉴 API에서 역할 필터링 로직을 feature flag 뒤에 구현한다.
3. `admin/editor/viewer` 샘플 계정 기반 API 테스트 케이스를 추가한다.
4. feature flag 활성화 후 임시 공통 메뉴 조회를 제거한다.

## 검증 체크포인트
- `viewer`는 권한관리 메뉴를 볼 수 없어야 한다.
- `editor`는 편집 대상 페이지 접근 가능, 권한관리 접근 불가여야 한다.
- `admin`은 전체 메뉴 접근 가능해야 한다.
- 메뉴 트리 depth(3단계) 규약이 필터링 후에도 유지되어야 한다.

## RBAC Permission Seed (DataInitializer 기준)

cactus 통합 보안 플랫폼 마이그레이션 완료 시점에서 백엔드 `DataInitializer.java` 는 다음 path 기준으로 권한(permission) 을 seed 한다. `/api/auth/**` 같은 인증 path 는 `permitAll` 대상이므로 RBAC 평가에서 제외된다.

### 권한 보호 대상 path

- APS
  - `/api/mpn/oasis/*`
  - `/api/mpn/rest/api/*`
- Portal
  - `/api/portal/oasis/*`
- MES 하위 모듈
  - `/api/mpp/oasis/*`
  - `/api/mqc/oasis/*`

### permission 코드 (총 16 개)

대표 권한은 다음과 같다.

- `PERM_APS_REST` — APS REST 호출
- `PERM_APS_OASIS` — APS OASIS 서비스 호출
- `PERM_PORTAL_OASIS` — Portal OASIS 서비스 호출
- `PERM_MPP_OASIS` — MPP OASIS 서비스 호출
- `PERM_MQC_OASIS` — MQC OASIS 서비스 호출
- 기타 portal 도메인별 권한 — 메뉴/즐겨찾기/사용자관리 등 portal 세부 도메인별로 별도 정의된다.

상세한 16 종 권한 코드와 역할 매핑은 `DataInitializer.java` seed 데이터를 단일 출처로 한다. 본 문서에서는 path → permission 코드 명명 규칙만 합의한다.

### portal `proxy.ts` AUTH_ONLY_API_PREFIXES

portal BFF 의 `proxy.ts` 는 위 path 변경에 맞춰 `AUTH_ONLY_API_PREFIXES` 목록을 갱신한다 (oasis/rest 분리 path 기준). 인증만 통과하면 호출 가능한 prefix 와 RBAC 권한이 추가로 필요한 prefix 가 구분된다.

### 메뉴 정책과의 관계

- 본 문서의 `minimumRole` 은 메뉴 가시성 정책이다.
- DataInitializer 의 permission seed 는 API 호출 인가 정책이다.
- 두 정책은 동일 페이지에 대해 일관되어야 하며, 메뉴가 노출되는 역할이 해당 페이지가 호출하는 API 의 permission 도 보유하도록 보장해야 한다.
