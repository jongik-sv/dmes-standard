# DMES Workspace Structure

이 문서는 저장소 안의 여러 Gradle/NPM 프로젝트를 부르는 명시적 역할명을 정리한다.
빌드 이름과 경로를 당장 변경하지 않더라도, 설계서/이슈/커밋 메시지에서는 아래 기준으로 `core`, `app`, `lib`, `package`, `workspace` 를 구분한다.

## 0. 역할명 suffix

| suffix | 의미 | 사용 예 |
|---|---|---|
| `*-core` | 외부 별도 솔루션 형태로 반출 가능한 제품/플랫폼 코어 | `cactus-core`, `aps-core`, `mcm-core`, `caravan-core` |
| `*-app` | 실행/배포 단위. Spring Boot/WAR launcher, Next/Vite 화면 앱처럼 직접 뜨는 대상 | `ksm-mpn-api-app`, `ksm-mpn-web-app`, `caravan-hub-app` |
| `*-lib` | {CLIENT} 사이트 모듈 내부 구현 라이브러리 또는 FE shared 처럼 app 이 소비하는 비-제품 라이브러리 | `ksm-mpn-lib`, `ksm-mcm-lib`, `dk-oasis-shared-lib` |
| `*-package` | package manager 관점의 배포/참조 좌표. Gradle module coordinate, NPM package name 을 말할 때만 사용 | `com.dongkuk.dmes:aps-core package`, `@dk-oasis/shared package` |
| `*-workspace` | 여러 app/lib/package 를 묶는 작업 공간 | `backend-composite-workspace`, `dk-oasis-frontend-workspace` |

원칙:

- 외부 별도 솔루션으로 가져갈 수 있는 제품/플랫폼은 `*-core` 를 공식명으로 유지한다.
- {CLIENT} MES 사이트 모듈 내부 구현 서브프로젝트는 `lib` 로 둔다. 이전 `core` 경로는 `lib` 로 rename 되었다.
- `api` 는 URL/API 계층을 뜻할 수도 있으므로, 실행 모듈을 말할 때는 `api-app` 으로 쓴다.
- Java package 와 NPM package 가 섞이지 않도록, Java namespace 는 `Java package`, NPM 은 `NPM package` 로 명시한다.

## 1. 최상위 구분

| 영역 | 위치 | 의미 | 공식 역할명 |
|---|---|---|---|
| Backend composite | `src/backend` | 여러 독립 Gradle build 를 묶는 집계 진입점. 자체 제품 코드가 아니라 includeBuild 라우터다. | `backend-composite-workspace` |
| Frontend workspace | `src/frontend` | NPM workspace. 공통 패키지와 모듈별 화면 앱을 포함한다. | `dk-oasis-frontend-workspace` |
| 문서 | `docs` | APS/MES/공통 플랫폼 설계와 개발 가이드. | `docs` |
| 데이터/마이그레이션 | `src/backend/data`, `src/backend/data-migration` | 로컬 SQLite, seed, {CLIENT} 원본 변환 자산. | `local data`, `data migration` |

## 2. Backend 프로젝트 분류

### 제품/공통 코어

제품/공통 코어는 Dongkuk 제품 namespace 를 사용하고, 외부 별도 솔루션 형태로 반출 가능한 단위이므로 공식 역할명도 `*-core` 로 둔다.

| 현재 경로 | 공식 역할명 | Gradle package/artifact | Java package | 용도 |
|---|---|---|---|---|
| `src/backend/cactus-core` | `cactus-core` | `com.dongkuk.dmes:cactus-core` | `com.dongkuk.dmes.cactus.*` | DMES 공통 플랫폼, 보안, 웹, OASIS 연동 어댑터 |
| `src/backend/aps-core` | `aps-core` | `com.dongkuk.dmes:aps-core` | `com.dongkuk.dmes.aps.*` | 재사용 가능한 APS 제품 도메인/엔진/API 라이브러리 |
| `src/backend/mcm-core` | `mcm-core` | `com.dongkuk.dmes:mcm-core` | `com.dongkuk.dmes.mcm.*` | 권한, 메뉴, 즐겨찾기, 마스터코드 등 MCM 제품 라이브러리 |
| `src/backend/caravan-core` | `caravan-core` | `com.dongkuk.caravan:caravan-core` | `com.dongkuk.caravan.core.*` | Caravan 메시징 공통 라이브러리 |
| `src/backend/caravan-hub` | `caravan-hub-app` | `com.dongkuk.caravan:caravan-hub` | `com.dongkuk.caravan.hub.*` | Caravan hub 실행/연동 컴포넌트 |
| `src/backend/caravan-console` | `caravan-console-app` | `com.dongkuk.caravan:caravan-console` | `com.dongkuk.caravan.console.*` | Caravan 운영 콘솔 컴포넌트 |

### {CLIENT} MES 사이트 모듈

{CLIENT} MES 사이트 모듈은 {CLIENT} namespace 를 사용한다. 모듈 root 는 여러 Gradle subproject 를 묶는 workspace 로 보고, 내부 구현층은 제품 core 가 아니라 사이트 구현 lib 로 둔다.

| 현재 backend root | 공식 backend workspace | 내부 lib | 내부 app | Frontend app |
|---|---|---|---|---|
| `src/backend/mpn` | `ksm-mpn-backend-workspace` | `ksm-mpn-lib` (`mpn/lib`) | `ksm-mpn-api-app` (`mpn/api`) | `ksm-mpn-web-app` (`m-mpn`) |
| `src/backend/mpp` | `ksm-mpp-backend-workspace` | `ksm-mpp-lib` (`mpp/lib`) | `ksm-mpp-api-app` (`mpp/api`) | `ksm-mpp-web-app` (`m-mpp`) |
| `src/backend/mqc` | `ksm-mqc-backend-workspace` | `ksm-mqc-lib` (`mqc/lib`) | `ksm-mqc-api-app` (`mqc/api`) | `ksm-mqc-web-app` (`m-mqc`) |
| `src/backend/mls` | `ksm-mls-backend-workspace` | `ksm-mls-lib` (`mls/lib`) | `ksm-mls-api-app` (`mls/api`) | `ksm-mls-web-app` (`m-mls`) |
| `src/backend/mcm` | `ksm-mcm-backend-workspace` | `ksm-mcm-lib` (`mcm/lib`) | `ksm-mcm-api-app` (`mcm/api`) | `ksm-mcm-web-app` (`m-mcm`) |

Gradle package/artifact:

| moduleId | Gradle package | Java package |
|---|---|---|
| `mpn` | `com.dongkuk.dmes:mpn` | `com.dongkuk.dmes.mpn.*` |
| `mpp` | `com.dongkuk.dmes:mpp` | `com.dongkuk.dmes.mpp.*` |
| `mqc` | `com.dongkuk.dmes:mqc` | `com.dongkuk.dmes.mqc.*` |
| `mls` | `com.dongkuk.dmes:mls` | `com.dongkuk.dmes.mls.*` |
| `mcm` | `com.dongkuk.dmes:mcm` | `com.dongkuk.dmes.mcm.*` |

### 보조/도구성 프로젝트

표준 MES 모듈은 아니지만 backend composite 에 함께 묶인 프로젝트다.

| 현재 경로 | 공식 역할명 | Legacy package/artifact | Java package | 용도 |
|---|---|---|---|---|
| `src/backend/analog` | `analog-tool-workspace` / `analog-api-app` / `analog-search-lib` | `com.dongkuk.dmes:analog` | API 는 `com.dongkuk.dmes.analog.*`, core 는 `com.dongkuk.analog*` | 로그/텍스트 검색성 도구와 API wrapper |
| `src/backend/localKafka` | `local-kafka-app` | `com.dongkuk.dmes:localKafka` | `com.dongkuk.dmes.localkafka.*` | 로컬 Kafka 실행/검증용 보조 launcher |

## 3. `core` 명칭 사용 규칙

`core`는 제품/플랫폼 코어에만 공식적으로 사용한다. {CLIENT} MES 사이트 모듈 내부 구현 서브프로젝트는 `lib` 로 쓴다.

| 표현 | 공식 역할명 | 의미 | 예 |
|---|---|---|---|
| 제품/플랫폼 `*-core` | `*-core` 유지 | 독립 반출 가능한 제품/솔루션 코어 | `aps-core`, `cactus-core`, `mcm-core`, `caravan-core` |
| {CLIENT} 사이트 모듈 `:lib` | `ksm-{moduleId}-lib` | 해당 사이트 모듈의 도메인/서비스/엔티티 구현 lib | `mpn/lib` → `ksm-mpn-lib` |
| 도구성 모듈 `:core` | 도메인별 `*-lib` | 제품 core 가 아닌 도구 내부 구현 lib | `analog/core` → `analog-search-lib` |

권장 표현:

- `aps-core`: 그대로 `aps-core`
- `mcm-core`: 그대로 `mcm-core`
- `cactus-core`: 그대로 `cactus-core`
- `mpn/lib`: `ksm-mpn-lib`
- `mcm/lib`: `ksm-mcm-lib`
- `mpn/api`: `ksm-mpn-api-app`
- `m-mpn`: `ksm-mpn-web-app`

금지/주의 표현:

- 단독 `core`: 문맥 없이 쓰지 않는다.
- `MCM core`: `mcm-core` 제품 코어인지 `mcm/lib` 사이트 lib 인지 모호하므로 피한다.
- `backend core`: 실제 프로젝트가 아니므로 쓰지 않는다.

## 4. 사이트/보조 모듈 내부 레이어

{CLIENT} 사이트 모듈과 일부 보조 프로젝트는 보통 다음 구조를 가진다.

| 서브프로젝트 | 의미 | 의존 방향 |
|---|---|---|
| `:lib` | 사이트 전용 도메인, 엔티티, 서비스, repository, 초기화/seed 등 | 제품/공통 core 에 의존 |
| `:api` | Spring Boot launcher, WAR 패키징, controller/config, 외부 WAS 실행 진입점 | `api project(':lib')` 로 `:lib` 에 의존 |

일반적으로 코드는 다음 기준으로 둔다.

- 재사용 가능한 APS/MCM/플랫폼 기능: 제품 core (`aps-core`, `mcm-core`, `cactus-core`)
- {CLIENT} 사이트에만 필요한 조립/확장/seed/config: 사이트 lib (`ksm-{moduleId}-lib`)
- 실행/배포/엔드포인트 wiring: API app (`ksm-{moduleId}-api-app`)

## 5. Frontend 명칭

| 위치 | 공식 역할명 | NPM package | 의미 |
|---|---|---|---|
| `src/frontend` | `dk-oasis-frontend-workspace` | `@dk-oasis/workspace` | NPM workspace root |
| `src/frontend/shared` | `dk-oasis-shared-lib` | `@dk-oasis/shared` | FE 공통 유틸/HTTP/helper package |
| `src/frontend/m-{moduleId}` | `ksm-{moduleId}-web-app` | 대체로 `@dk-oasis/m-{moduleId}` | 모듈별 화면 app package |

주의: 현재 `src/frontend/m-mcm/package.json` 의 NPM package name 은 `@dk-oasis/mcm` 이다.
새 FE 모듈은 app 역할명은 `ksm-{moduleId}-web-app`, NPM package name 은 `@dk-oasis/m-{moduleId}` 규칙으로 맞추고, 기존 불일치는 별도 영향 분석 후 정리한다.

## 6. 실제 리네임 목록

{CLIENT} MES 사이트 모듈의 내부 구현층만 `core` 에서 `lib` 로 바꿨다.
제품/플랫폼 코어(`cactus-core`, `aps-core`, `mcm-core`, `caravan-core`)는 rename 대상이 아니다.

### Rename 대상

| 구분 | 현재 | 목표 |
|---|---|---|
| MPN backend lib 경로 | `src/backend/mpn/core` | `src/backend/mpn/lib` |
| MPN Gradle subproject | `include 'core'`, `project(':core')` | `include 'lib'`, `project(':lib')` |
| MPN 공식 역할명 | `mpn/core`, `:core` | `ksm-mpn-lib`, `mpn/lib`, `:lib` |
| MPP backend lib 경로 | `src/backend/mpp/core` | `src/backend/mpp/lib` |
| MPP Gradle subproject | `include 'core'`, `project(':core')` | `include 'lib'`, `project(':lib')` |
| MPP 공식 역할명 | `mpp/core`, `:core` | `ksm-mpp-lib`, `mpp/lib`, `:lib` |
| MQC backend lib 경로 | `src/backend/mqc/core` | `src/backend/mqc/lib` |
| MQC Gradle subproject | `include 'core'`, `project(':core')` | `include 'lib'`, `project(':lib')` |
| MQC 공식 역할명 | `mqc/core`, `:core` | `ksm-mqc-lib`, `mqc/lib`, `:lib` |
| MLS backend lib 경로 | `src/backend/mls/core` | `src/backend/mls/lib` |
| MLS Gradle subproject | `include 'core'`, `project(':core')` | `include 'lib'`, `project(':lib')` |
| MLS 공식 역할명 | `mls/core`, `:core` | `ksm-mls-lib`, `mls/lib`, `:lib` |
| MCM backend lib 경로 | `src/backend/mcm/core` | `src/backend/mcm/lib` |
| MCM Gradle subproject | `include 'core'`, `project(':core')` | `include 'lib'`, `project(':lib')` |
| MCM 공식 역할명 | `mcm/core`, `:core` | `ksm-mcm-lib`, `mcm/lib`, `:lib` |

### Rename 후 함께 바꿀 참조

| 현재 패턴 | 목표 패턴 |
|---|---|
| `src/backend/{moduleId}/settings.gradle` 의 `include 'core'` | `include 'lib'` |
| `src/backend/{moduleId}/api/build.gradle` 의 `api project(':core')` | `api project(':lib')` |
| 문서의 `src/backend/{moduleId}/core/...` | `src/backend/{moduleId}/lib/...` |
| 문서의 `{moduleId}/core` 또는 `:{moduleId}:core` 의미 표현 | `{moduleId}/lib`, `ksm-{moduleId}-lib`, `:lib` |

### Rename 하지 않는 항목

| 현재 | 유지 사유 |
|---|---|
| `src/backend/cactus-core` | 외부 솔루션 형태로 반출 가능한 DMES 공통 플랫폼 코어 |
| `src/backend/aps-core` | 외부 솔루션 형태로 반출 가능한 APS 제품 코어 |
| `src/backend/mcm-core` | 외부 솔루션 형태로 반출 가능한 MCM 제품 코어 |
| `src/backend/caravan-core` | 외부 솔루션 형태로 반출 가능한 Caravan 제품/플랫폼 코어 |
| `src/backend/{mpn,mpp,mqc,mls,mcm}/api` | 실행/배포 단위이며 역할명은 `ksm-{moduleId}-api-app`; 경로 rename 은 이번 `core` 정리 대상이 아님 |
| `src/frontend/m-{moduleId}` | 화면 app 경로로 유지; 역할명만 `ksm-{moduleId}-web-app` 으로 부름 |

## 7. 이름 변경 원칙

물리적 rename 은 빌드, 배포, IDE 설정, 문서 링크, CI 경로에 영향을 준다. 따라서 다음 순서로 진행한다.

1. 제품/플랫폼 프로젝트의 `*-core` 는 유지한다. 예: `cactus-core`, `aps-core`, `mcm-core`.
2. {CLIENT} MES 사이트 모듈 내부 구현층은 `ksm-{moduleId}-lib` 로 부른다.
3. Gradle/NPM package 좌표를 바꿀 때는 `legacy package` 를 명시하고, dependency substitution, FE workspace, 배포 스크립트, 문서 링크를 함께 검증한다.
4. 이후 유사 rename 은 별도 migration 으로 분리한다. `core` 명칭은 제품/플랫폼 코어에만 새로 부여한다.
5. 단순 명칭 혼선만 줄이는 목적이라면 경로 rename 보다 README/가이드/IDE run configuration 명칭 정리를 우선한다.
