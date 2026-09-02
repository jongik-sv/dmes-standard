# {CLIENT} MES 기능설계 표준 가이드

> 상위 문서: [{CLIENT} MES 기능설계 표준 가이드](../02_화면_기능설계_가이드.md)

## A.2. 시작 전 결정 항목

### A.2-0. 체인 / 모듈 / 화면 3단 계층 구조 (MUST)

모든 화면은 아래 3단 계층에 속한다. 화면 설계 착수 전 **어느 체인의 어느 모듈에 속하는지** 를 먼저 확정한다. 이 결정이 화면 식별자·파일 경로·URL·BE 패키지 구조까지 모두 파생시킨다.

| 단계 | 한글 용어 | FE 변수명 | 예 (MES) | 예 (APS — 예외) |
|---|---|---|---|---|
| 1 | **체인 (Chain)** | `mesModule` / `moduleId` | `m-mqc` / `mqc` | `m-mpn` / `mpn` |
| 2 | **모듈 (Module)** | `moduleGroup` (kebab-case) | `inspection`, `master`, `work-order` | `operation`, `planning` |
| 3 | **화면 (Screen)** | 화면 식별자 (`screenId`) = `pageId` = `serviceId` (단일 camelCase) | `inspectionResult`, `plateSlittingMgmt` | (APS 예외) `production-plan` (kebab) |

> 용어 주의 — 본 가이드의 FE 변수명 `mesModule` 과 한글 용어 **"체인"** 이 같은 대상을 가리킨다. 한글 **"모듈"** 은 FE 변수명 `moduleGroup` 에 해당한다. 이름이 직관과 반대이므로 설계서 작성 시 혼용 금지.

> **★ MES 화면 식별자 단일 토큰 규칙 (MUST · §A.2-1 정본)** — MES 체인(`mls`/`mqc`/`mpp`/`mas`/`mcm` 등) 의 화면은 `screenId = pageId = serviceId` 가 **모두 같은 단일 camelCase 토큰** 이며 **화면명 그 자체** (모듈명·그룹명 prefix 없음) 이다 (예: `plateSlittingMgmt`, `inspectionResult`). `portal:{group}/{name}` 형태, kebab-case `pageName`, 별도의 `pageId` 경로 표기, 모듈명 prefix 부착 (`mlsPlateSlittingMgmt`) 은 **금지**. APS (`mpn` 체인, `src/frontend/m-mpn`) 는 기존 kebab-case + `-page.tsx` 컨벤션을 그대로 유지하는 **유일한 예외** 이다.

#### 파일시스템·URL 대응 (MUST)

| 계층 | FE 페이지 (MES) | FE portal 매핑 (MES) | BE 패키지 | API URL (Phase 7 — 단일 컨벤션) |
|---|---|---|---|---|
| 체인 (`moduleId`) | `src/frontend/m-{moduleId}/` | `src/frontend/portal/page-components/{moduleId}/` | `src/backend/{moduleId}/` | FE→BFF: `POST /api/{moduleId}/oasis/{serviceId}/{action}` / BFF→BE: `POST /oasis/{serviceId}/{action}` |
| 모듈 (`moduleGroup`) | `pages/{moduleGroup}/` | `{moduleGroup}/` | `core/.../domain/{moduleGroup}/` | (URL 에는 등장하지 않음 — moduleGroup 은 FE 폴더/메뉴 분류 전용) |
| 화면 (MES) | `pages/{moduleGroup}/{screenId}.tsx` (예: `pages/master/plateSlittingMgmt.tsx`) | `{moduleGroup}/{screenId}/page.tsx` (재-export) | (화면별 Entity·Service) | `/oasis/{screenId}/{action}` (`serviceId = screenId`) |
| 화면 (APS 예외) | `pages/{moduleGroup}/{kebab-name}-page.tsx` (예: `pages/planning/production-plan-page.tsx`) | `{moduleGroup}/{kebab-name}/page.tsx` | (APS 기존 구조) | (APS 기존 URL 컨벤션) |

- **설계 산출물 경로**: `docs/{체인}/design/{화면식별자}/{화면식별자}_기능설계서.md` 등 3종.
- **MES Frontend 파일명 (MUST)**: `{screenId}.tsx` — **kebab-case 변환 금지, `-page` 접미사 금지**. 단일 토큰이므로 파일명·디렉토리·import path 모두 `screenId` 그대로 사용.
- **APS 예외 (MUST)**: `src/frontend/m-mpn` 하위는 기존 kebab + `-page.tsx` 컨벤션 유지. 신규 MES 규칙을 APS 에 소급 적용 금지.
- 모듈(`moduleGroup`)을 생략하면 `m-{체인}/pages/{screenId}.tsx` 평평 구조가 되나, **본 가이드는 모듈 등재 MUST** — 체인당 화면 수가 10개를 초과하면 폴더 과포화.

#### A.2-0-1. 체인 사전 (정본 — 본 표 외 체인 사용 금지)

| 한글명 | 식별자 | mesModule | moduleId | WAS 포트 | 적용 가이드 |
|---|---|---|---|---|---|
| 생산계획 | APS | `m-mpn` | `mpn` | 8081 | [`docs/aps/Aps-Guide.md`](../../../aps/Aps-Guide.md) (본 가이드 대상 **아님**. `aps` API 모듈은 없으며 런처는 `mpn` 이 담당) |
| 조업관리 | MPP | `m-mpp` | `mpp` | 8083 | **본 가이드** |
| 품질관리 | MQC | `m-mqc` | `mqc` | 8084 | **본 가이드** |
| 물류관리 | MLS | `m-mls` | `mls` | [확인필요] | **본 가이드** |
| [확인필요: 업무 영역 미확정] | MAS | `m-mas` | `mas` | [확인필요] | **본 가이드** |
| 공통·시스템 | MES | `m-mes` | `mes` | 8082 | **본 가이드** |

- 포트는 각 체인의 `src/backend/{체인}/api/src/main/resources/application.yml` 에서 확인되는 값을 정본으로 한다.
- 신규 체인 추가 시 포트 충돌 없이 본 표에 **먼저 등재** 후 개발 착수. (MUST)
- `APS` 는 구 체계(Phase 1~6 기반 TDD) 로 `Aps-Guide.md` 를 따른다. 본 가이드의 모든 설계 규칙(§A.1-0) 은 APS 에 적용하지 않는다.

#### A.2-0-2. 체인별 모듈 사전 (현재 대부분 미정의 — 화면 설계 시 확장)

각 체인 내부의 **모듈(=업무 대분류, FE `moduleGroup`)** 은 체인별로 다르며 **대부분 아직 정의되지 않은 상태**. 신규 화면 설계 착수 전 본 사전에 해당 모듈이 등재되어 있는지 반드시 확인. 미등재 시 본 사전에 **먼저 PR 로 모듈 추가**한 뒤 설계 진행. (MUST)

| 체인 | 정의된 모듈 | 비고 |
|---|---|---|
| APS (참고) | `master`, `operation`, `planning`, `scheduling`, `simulation` | 기존 구현 기반 — 본 가이드 대상 아님 |
| MPP | **[확인필요]** | 화면 설계 시 확정 |
| MQC | **[확인필요]** | 화면 설계 시 확정 (후보 예: `inspection` / `nonconformity` / `calibration` / `spc` / `corrective-action` / `first-article` / `quality-standard`) |
| MLS | **[확인필요]** |  |
| MAS | **[확인필요]** |  |
| MES | **[확인필요]** |  |

**모듈 식별자 규칙 (MUST)**
- **kebab-case**. 2단어 초과 시 하이픈 연결 (예: `work-order`, `first-article`, `corrective-action`).
- 1~2 단어 권장, 3단어 초과 금지.
- 영문 도메인명 기반. 한글 업무명을 음차 변환하지 않는다 (예: "검사관리" → `inspection`, "작업지시관리" → `work-order`).
- 한 체인 내에서 **고유**. 체인 간 중복은 허용 (예: `master` 가 APS·MLS 양쪽에 존재 가능).
- 모듈 식별자는 BPMN `serviceId` / URL 과 직결되지 않을 수 있음 (모듈 내 여러 serviceId 존재 가능). 자세한 대응은 §A.2-2-2.

**모듈 추가 절차**
1. 신규 화면 설계 착수 전, 본 사전에 해당 체인의 모듈이 등재되어 있는지 확인.
2. 미등재 시 — 본 섹션 `정의된 모듈` 열에 신 모듈 식별자를 **별도 PR로 추가**. 커밋 메시지: `docs(guide): {체인} 모듈 사전에 {모듈명} 추가`.
3. PR 승인 후 설계 진행. **승인 전 임의 사용 금지**. (MUST NOT)

### A.2-1. 화면 식별자 결정 규칙
화면 식별자(`screenId`)는 아래 형식을 따른다. (MUST)

```
MES   : {화면명}                 — 단일 camelCase 화면명 (모듈명·그룹명 prefix 없음)
APS 예외 : {kebab-name}          — 기존 kebab-case 유지
```

| 부위 | 예시 (MES) | 설명 |
|---|---|---|
| 화면명 (= screenId) | `plateSlittingMgmt`, `inspectionResult`, `orderRegistration`, `workReport` (camelCase) | 화면명 그 자체를 식별자로 사용 (첫 글자 소문자). 모듈명·그룹명 prefix 없음 |

**MES 규칙 (MUST)**
- **`screenId` = `pageId` = `serviceId` 동일 단일 camelCase 토큰**. 세 식별자를 서로 다른 표기 (예: `pageId = portal:{group}/{name}`, `serviceId = inspection`) 로 분리하지 않는다.
- **모듈명·그룹명 prefix 금지**. `mlsPlateSlittingMgmt` (모듈 prefix) ✗ / `ppaMoldMaster` (그룹 prefix) ✗. 모듈 구분은 폴더 경로·URL prefix (`/api/{moduleId}/...`)·패키지 root (`com.dongkuk.dmes.{moduleId}`) 가 담당하므로 식별자에 중복 표기하지 않는다.
- **단일 camelCase 토큰**. 복수형(`inspections`), 하이픈(`mqc-inspection-result`), 점(`mqc.inspection`), 콜론(`portal:mqc/inspection`), snake_case, 대문자 코드형(`MQC_INS010`) 모두 금지.
- **영문 도메인명 기반**. 한글 업무명을 음차 변환하지 않는다 (예: "검사실적등록" → `inspectionResult`, "강판슬리팅관리" → `plateSlittingMgmt`).
- **한 모듈(체인) 내에서 고유**. 모듈 분리(별도 백엔드·경로 prefix)가 모듈 간 충돌을 차단한다.
- **BPMN 파일명 = `{screenId}.bpmn`** — BPMN `<process id>` 와 `serviceId` 가 모두 `screenId` 와 동일하므로 폴더/파일 → BPMN → API URL 매핑이 단순.

**APS 예외 (MUST)**
- `mpn` 체인 / `src/frontend/m-mpn` 의 화면은 **기존 kebab-case + `-page.tsx`** 컨벤션을 그대로 유지한다 (예: `production-plan`, `demand-management`).
- 신규 MES 단일 토큰 규칙을 APS 화면에 소급 적용 금지. (MUST NOT)

예 (MES):
- `inspectionResult` — MQC 검사실적등록
- `nonconformity` — MQC 부적합내역조회
- `orderRegistration` — MLS 주문등록
- `plateSlittingMgmt` — MLS 강판슬리팅관리
- `workReport` — MPP 작업실적현황

예 (APS — 예외):
- `production-plan`, `demand-management` (kebab-case, `-page.tsx` 접미사)

> **As-Is 식별자 (보조 필드)**: 기존 As-Is 시스템의 화면번호(예: `QMA001K`, `PGA020K`) 또는 전체식별자(`MQC_QMA001K`)는 마이그레이션 매핑 추적용으로 §A.2-2-1 표의 `As-Is 식별자` 행에 별도 기록한다. **폴더/파일·설계서 본문·코드 레벨에서는 화면 식별자(도메인명) 만 사용**하고 As-Is 식별자는 매핑 표·§1 표·§11 특이사항 등 식별 추적이 필요한 곳에만 인용한다.

### A.2-2. 최소 확정 값
설계 시작 전 아래 항목을 먼저 확정한다. (MUST)

> **V2 정합**: 본 섹션은 「FrontEnd_표준_통합_개발가이드_v2.md」 §2-2 기준. URL 규격 / moduleId / serviceId 는 **v2 에서 신설·변경된 핵심 항목**. UI→BFF 컨벤션은 `/api/{moduleId}/oasis/{serviceId}/{action}` (OASIS) 또는 `/api/{moduleId}/rest/{API_PATH}` (REST) 단일이며, 옛 `serviceGroup` placeholder 는 폐기되었다.

#### A.2-2-1. 업무/설계 측면
| 항목 | 설명 | 예 |
|---|---|---|
| 화면 식별자 | 단수 camelCase 도메인명 (§A.2-1) | `orderRegistration` |
| 화면명 | 한글 공식 명칭 | 주문등록 |
| As-Is 식별자 | (있으면) 기존 시스템 화면번호 | `MLS_ORD001K`, `PGA020K` |
| 모듈 | 상위 모듈명 | 영업관리 (MLS) |
| 화면 목적 | 1~2문장 | 고객사 주문을 등록/조회/관리한다 |
| 주 사용자 | 역할 또는 부서 | 영업팀, 생산관리팀 |
| 접근 경로 | 메뉴 경로 | 메뉴 > 주문관리 > 주문등록 |
| 상위 프로세스 | BPMN 프로세스 ID (있으면) | `orderRegistration` |

#### A.2-2-2. Frontend 개발 연계 값 (MUST)
설계서 작성 시점에 Frontend 개발가이드 §2 기준 값을 **모두 확정**하여 문서 §1 (화면 개요) 표에 박아둔다. 설계→구현 전환의 첫 관문이므로 누락 금지.

> **★ MES 명명 룰 (§A.2-1 정본 — 본 표 전체에 우선 적용)**:
> - `screenId` = `pageId` = `serviceId` 는 **모두 동일한 단일 camelCase 토큰** `{화면명}` (예: `plateSlittingMgmt`)
> - Frontend 파일명 = `{screenId}.tsx` (예: `plateSlittingMgmt.tsx`)
> - `moduleGroup` 은 FE 폴더/메뉴 분류용으로만 사용 (kebab-case, URL·식별자에는 등장 X)
> - APS (`mpn` 체인, `src/frontend/m-mpn`) 만 기존 kebab + `-page.tsx` 유지

| 항목 | 설명 | 예 (MES) | 예 (APS — 예외) | 근거 |
|---|---|---|---|---|
| mesModule | 업무 모듈 (`m-mls` / `m-mqc` / `m-mpp` / `m-mas` / `m-mcm` / `m-mpn`). 화면 업무 영역과 일치해야 함 | `m-mqc` | `m-mpn` | FE §2-3 |
| moduleGroup | 체인 내부 **모듈** 식별자 (kebab-case, FE 폴더 분류용). **§A.2-0-2 사전에 등재된 값만 사용** | `inspection`, `master` | `planning`, `operation` | FE §2-2 + §A.2-0 |
| **screenId / pageId / serviceId** (단일 토큰) | **MES: `{화면명}` 단일 camelCase, 세 식별자 동일.** 별도 분리 금지 | `inspectionResult`, `plateSlittingMgmt` | (APS 예외) `production-plan` (kebab) | §A.2-1 |
| 페이지 유형 | 개발가이드 §3-1 A~E 중 1개 — **A**. 조회전용 Form / **B**. 조회+Grid / **C**. 조회+저장 / **D**. Master-Detail / **E**. 팝업·모달 | `C` | `C` | FE §3-1 |
| **moduleId** | UI 모듈 prefix. mesModule 의 `m-` 을 제거한 값 | `mqc`, `mls`, `mpp`, `mas`, `mcm` | `mpn` (런처) / `aps` 라는 API 모듈은 없음 | BE §3, FE §2-2 |
| Frontend 파일 (MES) | `src/frontend/m-{moduleId}/pages/{moduleGroup}/{screenId}.tsx` — **`{screenId}.tsx` 그대로** | `m-mls/pages/master/plateSlittingMgmt.tsx` | — | FE §14 |
| Frontend 파일 (APS 예외) | `src/frontend/m-mpn/pages/{moduleGroup}/{kebab-name}-page.tsx` — 기존 컨벤션 | — | `m-mpn/pages/planning/production-plan-page.tsx` | FE §14-4 |
| 주요 API path (UI→BFF) | OASIS: `POST /api/{moduleId}/oasis/{serviceId}/{action}` / REST: `POST /api/{moduleId}/rest/{API_PATH}` | `POST /api/mqc/oasis/inspectionResult/search`, `POST /api/mls/oasis/plateSlittingMgmt/save` | (APS 별도 컨벤션) | FE §2-2, §14, BE §3 |
| 주요 API path (BFF→BE) | OASIS: `POST /oasis/{serviceId}/{action}` (cactus `OasisController` 단일 매핑) | `POST /oasis/inspectionResult/search`, `POST /oasis/plateSlittingMgmt/save` | (APS 별도 컨벤션) | BE §3 |
| tsup entry key (MES) | `pages/{moduleGroup}/{screenId}` — `-page` 접미사 없음 | `pages/master/plateSlittingMgmt` | — | FE §2-2, §14-5 |
| tsup entry key (APS 예외) | `pages/{moduleGroup}/{kebab-name}-page` — 기존 컨벤션 | — | `pages/planning/production-plan-page` | FE §14-5 |

- 위 표는 기능설계서 §1(화면 개요) 표에 **필수 열로 포함**한다. (MUST)
- mesModule 이 해당 업무와 불일치 선택되면 개발 단계에서 되돌려야 하므로 설계 단계에서 확정. (MUST)
- 페이지 유형은 §A.10 케이스 선택표와 1:1 매핑된다.
- **screenId / pageId / serviceId 규칙 (MUST)**: MES 는 모두 동일한 단일 camelCase 토큰. `portal:{group}/{name}` / kebab-case `pageName` / 복수형(`products`) / 하이픈 / 옛 `/api/backend/` prefix **모두 금지**.
- **moduleId 규칙**: mesModule 과 짝을 이룬다 (`m-mqc` ↔ `mqc`, `m-mpn` ↔ `mpn`). 미확정 시 `[확인필요]` 표기.
- **APS 예외 분기**: 위 표의 "APS 예외" 열은 `mpn` 체인 + `src/frontend/m-mpn` 화면 한정. 신규 MES 규칙을 APS 에 소급 적용 금지. (MUST NOT)

### A.2-3. 사전 참조 문서 (마이그레이션 입력 자료)

설계 시작 전 아래 자료를 모두 확보하고 읽는다. (MUST) 본 표의 **위치 경로는 프로젝트 고정값**이므로 매 설계 요청 시 재지정하지 않는다 — 그대로 참조한다.

#### 🔒 프로젝트 고정 경로 (As-Is 자료 — 기존 {CLIENT} ERP)

| # | 자료 | 표준 위치 | 용도 |
|---|------|----------|------|
| 1 | **As-Is 테이블** | [`docs/external/KsmErpK/tables/`](../../../external/KsmErpK/tables) | 컬럼/제약/관계 파악 → To-Be 매핑 근거 |
| 2 | **As-Is 뷰** | [`docs/external/KsmErpK/views/`](../../../external/KsmErpK/views) | 조회 로직·조인·집계 규칙 추출 |
| 3 | **As-Is 프로시저** | [`docs/external/KsmErpK/procedures/`](../../../external/KsmErpK/procedures) | 저장·상태변경·배치 비즈니스 로직 추출 (§6 검증·§7 상태·§11 채번 정본) |
| 4 | **As-Is 함수** | [`docs/external/KsmErpK/functions/`](../../../external/KsmErpK/functions) | 계산식·변환식·유효성 규칙 추출 (§4 자동계산·§6 검증) |
| 5 | **As-Is 트리거** | [`docs/external/KsmErpK/triggers/`](../../../external/KsmErpK/triggers) | 자동 처리·연쇄 갱신·이력 적재 규칙 추출 (§9 부수효과) |
| 6 | **기존 ERP 원본 소스** | `docs/external/KsmErpK/orgErpSource/` | 화면 동작·버튼 액션·이벤트 핸들러·UI 업무 규칙 추출 |

#### 🔒 프로젝트 고정 경로 (To-Be 자료 — 신규 DMES)

| # | 자료 | 표준 위치 | 용도 |
|---|------|----------|------|
| 7 | **To-Be 테이블 정본** | `docs/external/DMES/DMES-SECTION-{MODULE}_테이블정의서.xlsx` (예: `…-MQC_….xlsx`, `…-MPP_….xlsx`) | 신규 DB 컬럼명/타입 확정 (DB 컬럼명 **최종 정본**) |
| 8 | **타 모듈 기 구축 Entity** | `src/backend/{모듈}/core/src/main/java/**/domain/**/*.java` | §A.2-4-1 컬럼 재사용 탐색 (APS · master · 기 설계 MES 모듈) |

#### 📎 매 요청 시 제공 자료

| # | 자료 | 제공 방식 | 용도 |
|---|------|----------|------|
| 9 | **As-Is 화면 캡처** | 사용자가 채팅에 **이미지 첨부**로 제공 (선택 — 있으면 강력 권장. 없으면 As-Is 소스/designer 좌표 기반 추정 + §11 "캡처 미제공" 명시) | 조회조건/그리드/버튼 전수 식별 (§A.1-3 Phase 0) |
| 10 | **대상 화면 식별 정보** | 사용자 프롬프트에 As-Is 식별자 + To-Be 화면 식별자 + 모듈 명시 | 산출물 저장 경로·네이밍 결정 |

- 해당 모듈의 `docs/{moduleId}/reference/{모듈}_상세설계.md` 가 있으면 추가로 읽는다. (MUST)
- 상위 프로세스 정의가 확정된 경우 BPMN 설계서를 먼저 확인한다. (MUST)
- 고정 경로에서 파일을 찾지 못하면 추정 금지, 사용자에게 확인한다. (MUST)

### A.2-4. As-Is ↔ To-Be 매핑 규칙 (MUST)

설계는 **As-Is 화면에서 식별된 요소 → To-Be 테이블 컬럼** 으로 매핑한다.

#### 매핑 우선순위
| 상황 | 사용할 이름 |
|------|-------------|
| To-Be 테이블에 해당 컬럼 존재 | **To-Be 컬럼명** 사용 (기본 원칙) |
| To-Be에 없음 + As-Is에 있음 | `[확인필요: To-Be 테이블에 컬럼 추가 필요]` 마커 + §11 기록 |
| As-Is에도 없고 화면에만 있음 | `[확인필요: 화면 전용 계산 필드 or 신규 컬럼?]` + §11 기록 |
| To-Be에 있으나 As-Is에 없음 | **신규 컬럼** 으로 표기하고 §11 에 마이그레이션 전환점 기록 |

#### 매핑 문서 산출물
- 화면별 매핑 표를 `docs/{moduleId}/reference/mapping/{화면식별자}_mapping.md` 로 저장. (SHOULD)
- 매핑 표 열: `화면 필드명 | As-Is 테이블.컬럼 | To-Be 테이블.컬럼 | 기 구축 타 모듈 참조 | 전환 규칙 | 비고`
- 기능설계서 §11 특이사항에 **매핑 요약 및 변경점** 기록 (MUST)

#### A.2-4-1. 타 모듈 기 구축 테이블과의 컬럼 정합 (MUST)

본 프로젝트에는 이미 개발 완료된 모듈들(**APS · master · 기존 MES 모듈 등**)의 실제 테이블이 존재한다. 신규 MES 모듈 테이블을 설계하면서 **의미가 동일한 컬럼은 기 구축 모듈의 컬럼명을 그대로 재사용**한다. 이는 §A.2-4 "매핑 우선순위" 표보다 **우선 적용**한다.

| 상황 | 처리 |
|---|---|
| 동일 의미 컬럼이 APS/타 모듈 테이블에 이미 존재 | **기 구축 컬럼명을 그대로 사용** (예: APS 의 `ITEM_CD` → MQC 에서도 `ITEM_CD`). To-Be 테이블 설계서의 컬럼명이 이와 다르면 **기 구축 이름을 우선 채택**하고 To-Be 설계서 수정 요청. |
| 동일 의미이나 기 구축 컬럼명이 규약 위반 (오타·SNAKE_CASE 위반·약어 불일치) | §11 특이사항에 **원본 이름 + 채택 이름 + 차이 사유** 기록 후 규약 준수 이름 채택. (예: AsIs `Deffect` → ToBe `DEFECT`) |
| 의미는 유사하나 **단위·타입·도메인이 다름** | 다른 컬럼명 사용 (동음이의 방지) + §11 에 구분 사유 기록 |
| 신규 MES 전용 컬럼 | §A.2-4 기본 규칙 적용 |

**확인 경로 (설계 시 반드시 탐색)**
| 대상 | 경로 | 확인 방법 |
|---|---|---|
| APS (이미 개발) | `src/backend/aps-core/src/main/java/**/domain/**/*.java`, `src/backend/mpn/lib/src/main/java/**/domain/**/*.java` | Entity `@Column(name="...")` 선언 |
| 기 구축 MES 모듈 | `src/backend/{모듈}/core/src/main/java/**/domain/**/*.java` | 동일 |
| 마스터/공통 | `src/backend/master/core/src/main/java/**/domain/**/*.java` | 동일 |
| 전사 코드마스터 | `docs/{모듈}/glossary/code-master.md` 또는 운영 DB | MAJOR_CD / MINOR_CD 정본 |

**목적**: 전사 JOIN/리포팅 시 컬럼명 불일치로 인한 매핑 비용 제거, 크로스 모듈 개발자의 인지 비용 절감.

**설계서 기록 의무**
- §3 조회조건/조회결과, §4 상세 필드 표의 `DB 컬럼명` 열에 **기 구축 참조 시 각주** 표기. (MUST)
  - 예: `ITEM_CD` (※ APS `TB_APS_ITEM.ITEM_CD` 와 동일)
- §11 특이사항에 **"재사용 컬럼 목록"** 섹션으로 모아 기록. (MUST)

### A.2-5. 기존 소스 참조 규칙 (MUST)

기존 소스 코드는 **숨은 비즈니스 로직의 원천**이다. 아래 항목은 반드시 소스에서 확인한다.

| 확인 항목 | 기능설계서 반영 위치 |
|-----------|---------------------|
| 저장/삭제/상태변경 시 **검증 로직** | §6 입력값 검증 규칙 |
| **상태 전이 조건/제약** | §7.2 상태 전이 규칙 |
| **채번 규칙** (검사번호 포맷 등) | §11 특이사항 |
| **자동 계산 필드** (금액=수량×단가 등) | §4 상세 필드 설명 |
| **부수 효과** (확정 시 다른 테이블 INSERT 등) | §9 연동 / BPMN §4.1 |
| **권한 제약** (본인 건만, 관리자만 등) | §8 권한 |
| **코드값 실제 문자열** | §3.3 코드값 변환 (정본) |

- 소스에서 확인한 로직은 **"기존 소스 L23-L45 기반"** 같이 출처 참조 표기 가능. (MAY)
- 소스 로직과 To-Be 설계가 의도적으로 달라지면 §11 에 **변경 이유** 기록. (MUST)

---

## A.3. 표준 구조

### A.3-1. 기능설계서 섹션 구성
기능설계서는 아래 11개 섹션을 **순서 고정**으로 포함한다.

| 섹션 | 제목 | 필수 여부 | 내용 요약 |
|---|---|---|---|
| §1 | 화면 개요 | MUST | 화면명/코드/목적/사용자/접근 경로 |
| §2 | 화면 영역 정의 | MUST | A-FILTER / A-GRID / A-DETAIL / A-BTN |
| §3 | 조회조건 정의 | MUST (없으면 "해당 없음") | S-NNN + G-NNN + §3.3 코드값 변환 |
| §4 | 상세 영역 필드 | MUST (없으면 "해당 없음") | D-NNN + L-NNN |
| §5 | 버튼 및 기능 동작 | MUST | B-NNN + 버튼별 동작 상세 + 그리드 동작 |
| §6 | 입력값 검증 규칙 | MUST (없으면 "해당 없음") | V-NNN 필드별 / XV-NNN 연관 검증 |
| §7 | 상태 정의 | MUST (없으면 "해당 없음") | 상태코드/전이/편집·버튼 제어 |
| §8 | 권한 정의 | MUST | ADMIN/MANAGER/USER |
| §9 | 연동 화면/팝업 | MUST (없으면 "해당 없음") | P-NNN |
| §10 | 기타 열거형 | MUST (없으면 "해당 없음") | 코드 열거형 |
| §11 | 특이사항 | MUST | 설계 결정·대안 비교 |

### A.3-2. 영역 코드
| 영역ID | 영역명 | 필수 여부 |
|---|---|---|
| A-FILTER | 조회조건 영역 | 조회 화면 MUST |
| A-GRID | 목록 그리드 영역 | 조회 화면 MUST |
| A-DETAIL | 상세 영역 | 등록/수정 화면 MUST |
| A-BTN | 버튼 영역 | MUST |

추가 영역이 필요하면 `A-{설명}` 형식으로 확장 가능 (MAY). 예: `A-CHART`, `A-TREE`.

---

## A.4. 핵심 선택 기준

### A.4-1. 화면 레이아웃 유형 선택
| 상황 | 기본 레이아웃 |
|---|---|
| 조회만 필요 | 단일 그리드형 |
| 조회 + 간단 상세 | 상하 분할형 |
| 조회 + 편집 자주 | 좌우 분할형 |
| 계층 구조 있음 | 트리-그리드형 |
| 다수 관점 전환 | 탭형 |

### A.4-2. 상세 영역 유형 선택
| 상황 | 기본 선택 |
|---|---|
| 단일 레코드 편집 | 폼형 (D-NNN) |
| 마스터 + 라인 | 헤더(D) + 서브 그리드(L) |
| 여러 관점 그룹 | 탭형 |
| 인라인 편집 중심 | 그리드 편집형 |

### A.4-3. 검증 시점 선택
| 시점 | 적용 기준 |
|---|---|
| 입력 즉시 (onChange) | 형식 검증(숫자/날짜) |
| 포커스 아웃 (onBlur) | 단일 필드 범위/길이 |
| 저장 클릭 시 | 필수값·연관·비즈니스 규칙 |
| 서버 응답 시 | 중복 검사, 참조 무결성 |

---

## A.5. 명명 규칙

### A.5-1. 화면 식별자
- 형식: 단수 camelCase 도메인명 (예: `inspectionResult`, `orderRegistration`) — §A.2-1 정본
- 모듈 prefix 금지. 모듈은 저장 경로에서 표현된다.

### A.5-2. 필드/컬럼/버튼 ID 체계
| 대상 | 접두어 | 예시 | 설명 |
|---|---|---|---|
| 조회조건 필드 | `S-` | `S-001` | Search field |
| 그리드 컬럼 | `G-` | `G-001` | Grid column |
| 상세 영역 필드 | `D-` | `D-001` | Detail field |
| 품목/서브 라인 | `L-` | `L-001` | Line field |
| 버튼 | `B-` | `B-001` | Button |
| 팝업 | `P-` | `P-001` | Popup |
| 검증 규칙 (단일) | `V-` | `V-001` | Validation |
| 검증 규칙 (연관) | `XV-` | `XV-001` | Cross-field validation |
| 화면 영역 | `A-` | `A-FILTER` | Area |

- 일련번호는 001부터 3자리. (MUST)
- 사이는 5 또는 10 단위 여유 허용. (MAY)
- 번호 재사용/재배열 금지. (MUST)

### A.5-3. DB 컬럼명 / 화면 표시명 / API JSON
| 계층 | 표기 | 예 |
|---|---|---|
| DB 컬럼명 | 대문자 SNAKE_CASE | `ORDER_NO`, `CUSTOMER_CODE` |
| 화면 표시명 | 한글 공식 명칭 | 주문번호, 고객사 |
| API JSON 필드 | camelCase | `orderNo`, `customerCode` |

- 기능설계서 표에서는 `DB 컬럼명` / `화면 표시명` 열을 분리한다. (MUST)
- 본문 서술에서는 `ORDER_NO (주문번호)` 괄호 병기 허용. (MAY)
- placeholder 표기 시 `{ORDER_NO}` 형태로 영문 컬럼명 사용. (MUST)

#### A.5-3-1. audit 컬럼 (cactus-core 정본)

- **MUST**: To-Be 신규 생성·재생성되는 모든 테이블은 `cactus-core` audit 9 컬럼을 적용한다 (BackEnd 개발가이드 §8-1 정본). schema 가 As-Is 운영본 / 동기화본 / 백업본 등 복수로 존재하는 경우에도 동일 테이블의 모든 schema 에 audit 9 컬럼을 동일하게 적용한다 (동기화 시 단순 row copy 가능하도록).
- **설계서 표기 규칙**: 분석리포트 §9.x 의 컬럼 카탈로그 / 기능설계서 §3 ~ §4 의 컬럼 표는 **본 테이블의 실 컬럼만 1:1 전수 분해** 하고, audit 9 컬럼은 "cactus-core 자동 적용" 한 줄 주석으로 갈음한다 (재기재 ✗). 단, 정합체크서 §F 의 schema 결정 / §11 변환점 표에는 "cactus-core audit 9 컬럼 적용" 한 행을 명시한다.
- **예외 (audit 미적용)**: view / 외부 시스템 read-only 테이블 / 동기화 대상이 아닌 임시 테이블처럼 audit 의미가 없는 객체. 예외 적용 시 설계서 §11 (특이사항) 에 사유를 명시한다 (BackEnd 가이드 §8-1 정합).

### A.5-4. API Request/Response Body 규칙 (Frontend v2 §10 / BackEnd v2 §8-5 정합)

기능설계서에서 API Request/Response body 를 기술할 때 아래 규칙을 따른다. (MUST)

#### A.5-4-1. URL 규격 (BE v2 Part B §3)

**FE 호출 경로(브라우저 → portal BFF)** 와 **WAS 경로(portal 프록시 → 각 모듈 WAS)** 는 **prefix 가 다르다**. 설계서에 URL 을 기술할 때 둘을 **혼동하지 않도록** 구분해서 쓴다. (MUST)

| 구간 | 형식 | 예시 (MES — `serviceId = screenId = {화면명}`) |
|---|---|---|
| **FE 호출** (브라우저 → portal BFF) — OASIS | `POST /api/{moduleId}/oasis/{serviceId}/{action}` | `POST /api/mpp/oasis/workReport/search`, `POST /api/mls/oasis/plateSlittingMgmt/save` |
| **FE 호출** (브라우저 → portal BFF) — REST | `POST /api/{moduleId}/rest/{API_PATH}` | `POST /api/mpn/rest/api/demands` (APS 계열) |
| **WAS 수신** (portal → WAS) — OASIS | `POST {WAS_BASE}/oasis/{serviceId}/{action}` | `POST {WAS_BASE}/oasis/workReport/search` |
| **WAS 수신** (portal → WAS) — REST | `POST {WAS_BASE}/{API_PATH}` (`rest/` segment 제거) | `POST {WAS_BASE}/api/demands` |

- **변환 주체**: portal 의 catch-all 라우트 (`portal/app/api/[moduleId]/oasis/[serviceId]/[action]/route.ts` 등) 가 `createOasisProxyHandler` 를 통해 BE 의 `/oasis/{serviceId}/{action}` (cactus `OasisController` 단일 매핑) 으로 프록시한다. REST 라우트는 `rest/` segment 를 제거하고 BE 의 원래 REST 매핑으로 프록시한다.
- **moduleId**: {CLIENT} 사이트 도입 모듈 식별자 (`mpn` / `mpp` / `mqc` / `mls` / `mas` / `mcm` / `portal` 등 — RULE.md §"패키지 명명 규칙"). `aps` 라는 API 모듈은 존재하지 않으며, APS 비즈니스는 `mpn` 모듈(aps-core 확장)이 담당한다.
- **serviceId (MES)**: **`screenId` 와 동일한 단일 camelCase `{화면명}` 토큰**. BPMN 파일명 `{screenId}.bpmn`·`<process id>` 와 모두 동일 (§A.2-1).
- **action**: `search` / `save` / `delete` / `changeStatus` 등.

**설계서 작성 규약** (MUST):
- FE 관점(예: `workReport-api.ts`, 기능설계서 §5 버튼 동작 등) 에 URL 을 적을 때는 **FE 호출 경로** 사용: `/api/mpp/oasis/workReport/search`
- WAS 관점(04 BPMN 설계서 §1 API 총괄 등) 에 URL 을 적을 때는 **WAS 경로** 사용: `/oasis/workReport/search`
- 혼용 시 개발 단계에서 404 / 프록시 우회 실패 유발

**MUST NOT**:
- 복수형(`products`), 하이픈(`work-report`), 옛 `/api/backend/` prefix, 옛 `/{serviceGroup}/api/...` 형태, 옛 `/${cactus.oasis.service-group}/api/...` placeholder
- FE 코드에 `/oasis/...` 형식으로 직접 호출 (portal catch-all 미매칭 → 404)
- 설계서에서 FE 호출 경로를 WAS 경로 형식으로 적어둠 (구현 시 양쪽 가리키는 URL 불일치)

**개발 환경의 moduleId → WAS 라우팅 (MUST)**

portal catch-all 라우트는 `backendApiUrlByGroup` 매핑으로 moduleId 별 WAS URL 을 선택한다. 매핑이 없는 그룹은 `BACKEND_API_URL` (기본 Portal WAS 8080) 로 fallback 되어 **전혀 다른 WAS 로 요청이 가면서 404/500 이 발생**한다 (증상: `NoResourceFoundException: No static resource api/...` 또는 BPMN 쪽에서 `Cannot find the default flow`).

`portal/.env` 에 반드시 아래 환경변수를 선언한다:

| 환경변수 | moduleId | 로컬 기본 포트 | 역할 |
|---|---|---|---|
| `MCM_WAS_URL` | `mcm` | 8080 | 인증/메뉴/역할/사용자 |
| `APS_WAS_URL` | `aps` | 8081 | 생산계획 |
| `MPP_WAS_URL` | `mpp` | 8083 | 조업관리 |
| `MQC_WAS_URL` | `mqc` | 8084 | 품질관리 |
| `BACKEND_API_URL` | (fallback) | 8080 | 매핑되지 않은 그룹의 기본 URL (운영에서는 Nginx 게이트웨이) |
| `BACKEND_CLIENT_KEY` | (공통) | — | BFF→BE 호출 식별용 공유키 (`X-Client-Key` 헤더). 옛 명 `UI_CLIENT_KEY` 폐기 |

**신규 체인 추가 절차 (MUST)**
1. `src/backend/{moduleId}/` 서브 프로젝트 생성 + `settings.gradle` 에 `includeBuild('{moduleId}')` 등록
2. `{moduleId}/api/application.yml` 에 `server.port` 확정값 부여 (충돌 방지)
3. `portal/.env` 에 `{MODULE_ID}_WAS_URL=http://localhost:{port}` 추가
4. portal BFF catch-all 라우트(`app/api/[moduleId]/oasis/...` 등) 의 `backendApiUrlByGroup` 객체에 `{moduleId}: process.env.{MODULE_ID}_WAS_URL` 키 추가
5. 위 4단계 중 어느 하나라도 빠지면 해당 체인 API 호출이 전부 Portal WAS(8080) 로 가서 404/500 발생

**운영 환경**
- `BACKEND_API_URL=http://internal-nginx` 하나로 통합. Nginx 가 모듈별 라우팅을 담당하므로 `{MODULE_ID}_WAS_URL` 환경변수는 개발용.

#### A.5-4-2. Plain DTO shape (FE v2 §10-1)

body 는 해당 API 가 요구하는 필드들이 **camelCase로 나열된 평범한 객체**. `meta / params / grids` 래핑 구조 **임의 도입 금지**.

**조회 Request (§10-2)**:
```json
{ "productType": "SEAL", "useYn": "Y" }
```

#### A.5-4-3. 저장 Body 최상위 키 — **3자 일치** (FE v2 §10-3)

저장 API 의 body 최상위 키는 **BE 메서드 파라미터명 = 그리드명 = body 키** 3자 일치 고정.

**단일 Grid (유형 C)** — 최상위 키 `master` **고정**:
```json
{
  "master": [
    { "productId": "P001", "productNm": "벨로우즈",   "rowStatus": "C" },
    { "productId": "P002", "productNm": "자성유체씰", "rowStatus": "U" },
    { "productId": "P003",                            "rowStatus": "D" }
  ]
}
```

**Master-Detail (유형 D)** — 최상위 키 `master`, `detail` **고정**:
```json
{
  "master": [ { "orderId": "O1", "rowStatus": "U" } ],
  "detail": [ { "orderId": "O1", "lineNo": 1, "qty": 10, "rowStatus": "C" } ]
}
```

- **MUST NOT**: 신규 API 에서 `items` / `rows` / `payload` 같은 키 사용 (레거시 예외는 FE v2 §10-3 예외 절)
- **rowStatus 규약** (FE v2 §9-3): `C=Create` / `U=Update` / `D=Delete` / 변경 없는 행은 **전송 제외** (`R` 명시 금지)
- **금지 필드 (MUST NOT)**: `nativeeditor_status`, `_rowState` 등 `useGridDataManager` 내부 상태 필드

#### A.5-4-4. 에러 Response shape (FE v2 §8-2 공식 계약)

**Level A (모든 에러 필수)** — `meta` 객체:
```json
{ "meta": { "success": false, "code": "E001", "message": "입력값을 확인해주세요." } }
```

**Level B (저장형 Grid 조건부 SHOULD)** — `errors` 배열 추가:
```json
{
  "meta":   { "success": false, "code": "E001", "message": "..." },
  "errors": [
    { "grid": "master", "rowKey": "P001", "rowIndex": 0,
      "field": "productNm", "code": "E001",
      "message": "제품명은 필수입니다." }
  ]
}
```

- `apiRequest` 가 `meta.message` 를 `Error.message` 로 throw → `useGfnMessage` 1회 표시 (Level A, MUST)
- Level B 의 `errors.grid` 값은 **저장 API body 최상위 키와 동일** (§A.5-4-3 의 `master` / `detail`)
- Level B 6필드(`grid, rowKey, rowIndex, field, code, message`) 고정. 재매핑 금지

> **설계 팁**: 설계서 §9/§11 에러 시나리오 기술 시 `meta` / `errors` shape 를 그대로 전제. URL 예시는 FE 호출 경로(`/api/{moduleId}/oasis/{serviceId}/{action}`) 또는 WAS 경로(`/oasis/{serviceId}/{action}`) 형식 중 맥락에 맞는 쪽을 사용한다.

### A.5-5. 상태코드
- 대문자 영문 SNAKE_CASE, 최대 10자. (MUST)
- 예: `WAIT`, `CONF`, `PROC`, `DONE`, `CANCEL`

### A.5-6. 코드 마스터 테이블명
- 형식: `CODE_{분류명}` 대문자 SNAKE_CASE. (MUST)
- 예: `CODE_ORDER_STATUS`, `CODE_ORDER_TYPE`, `CODE_WELDING_TYPE`

---
