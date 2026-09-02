# {CLIENT} MES BPMN 프로세스 설계 표준 가이드

> 상위 문서: [{CLIENT} MES BPMN 프로세스 설계 표준 가이드](../04_백단_BPMN_기능설계_가이드.md)

## 본 문서 구성

BPMN설계 가이드는 허브 문서와 하위 장 문서로 분리되어 있다. 본 문서는 개요, 공통 원칙, 산출물 위치, 적용 범위, 선행 입력을 담는다.

| 파트 | 내용 | 사용 시점 |
|---|---|---|
| Part A | 설계 표준 규칙 (§A.1 ~ §A.12) | BPMN설계서 작성 규칙·명명·금지사항 확인 시 |
| 템플릿 | [`04-template-and-sample.md`](04-template-and-sample.md) | 실제 BPMN설계서 작성 시 템플릿 절을 사용 |
| Quick Sample | [`04-template-and-sample.md`](04-template-and-sample.md) — 주문등록(orderRegistration) | 처음 적용 시 또는 패턴 매칭 시 |

### 공통 참조 문서
| 문서 | 용도 |
|---|---|
| 「02_화면_기능설계_가이드.md」 | 기능↔BPMN 설계서 정합 확인 시 (버튼/상태 매핑) |
| 「03_화면_디자인설계_가이드.md」 | 팝업/화면 전환 매핑 시 |
| 「../BackEnd/BackEnd_표준_통합_개발가이드_v2.md」 Part B | BPMN 표준 개발 가이드 V2 (정본) — §3 핵심 일치 규칙 6가지 + §4 명명 + §7 템플릿 |
| 「../BackEnd/BackEnd_표준_통합_개발가이드_v2.md」 Part A | BackEnd 표준 개발 가이드 V2 — API/Service 매핑 확인 시 |
| 「../FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md」 | Frontend 개발 표준 V2 — §2-2 URL, §10 body 키, §8-2 에러 shape 정합 |

### 공통 원칙 (MUST)
- BPMN 개발가이드 V2 Part B §3 (**핵심 일치 규칙 6가지**: 파일명 / process id / Bean 이름 / 메서드명 / DTO / action 분기) 와 본 설계가이드의 명세가 일치해야 한다.
- 설계서의 **`serviceId`** 는 **단수 camelCase** 로, **BPMN 파일명 `{serviceId}.bpmn` · `<process id>` · API URL** 에 동일하게 사용한다.
- **API 표준 URL**: `POST /oasis/{serviceId}/{action}`. 복수형·하이픈·`/api/backend/` prefix 사용 금지.
- API body shape 은 Frontend v2 §10 의 **plain DTO** + **최상위 키 3자 일치**(단일 Grid=`master`, Master-Detail=`master`+`detail`) 규칙을 따른다.
- 에러 Response shape 는 **Level A (필수)** `{ "meta": { success, code, message } }` + **Level B (저장형 Grid 조건부)** `{ "meta": {...}, "errors": [{ grid, rowKey, rowIndex, field, code, message }] }` (FE v2 §8-2).
- 설계는 XML 수준이 아닌 **논리 흐름** 수준 — 실제 BPMN XML은 개발 단계에서 작성.

### 필수 참조 자료 — 기존 {CLIENT} ERP 원본 (MUST)

본 프로젝트는 **신규 개발이 아닌 {CLIENT} 기존 ERP → 신규 MES 마이그레이션**이다. 비즈니스 로직의 **정본은 기존 ERP 소스**이며, 모든 BPMN 설계는 아래 위치의 기존 ERP 원본 자료를 **반드시 먼저 확인**하고 추출하여 진행한다. 임의 추정·신규 설계 금지.

| 자료 종류 | 위치 (프로젝트 루트 기준) | 설계 시 활용 |
|---|---|---|
| 테이블 | [`docs/external/KsmErpK/tables/`](../../../external/KsmErpK/tables) | As-Is 컬럼/관계 분석 → To-Be 테이블 매핑 근거 |
| 뷰 | [`docs/external/KsmErpK/views/`](../../../external/KsmErpK/views) | 조회 로직·조인·집계 규칙 추출 |
| 프로시저 | [`docs/external/KsmErpK/procedures/`](../../../external/KsmErpK/procedures) | 저장·상태변경·배치 등 비즈니스 로직 추출 (BPMN 서비스 태스크 정본) |
| 함수 | [`docs/external/KsmErpK/functions/`](../../../external/KsmErpK/functions) | 계산식·변환식·유효성 규칙 추출 |
| 트리거 | [`docs/external/KsmErpK/triggers/`](../../../external/KsmErpK/triggers) | 자동 처리·연쇄 갱신·이력 적재 규칙 추출 (BPMN 후속 흐름 단서) |
| 기존 ERP 원본 소스 | `docs/external/KsmErpK/orgErpSource/` | 화면 동작·버튼 액션·이벤트 핸들러 등 UI/업무 규칙 추출 |

**원칙 (MUST)**
- 설계서 작성 시 위 자료를 **근거로 명시**한다 (예: "참조: `procedures/USP_WORK_ORDER_SAVE.sql`", "참조: `triggers/TR_WORK_ORDER_AFTER_UPDATE.sql`").
- 기존 ERP에 동일/유사 기능이 존재하면 **As-Is 분석 → To-Be 설계** 순서를 따른다.
- 기존 자료와 설계가 달라야 할 경우 §11 특이사항(또는 §10 검증·이슈)에 **차이와 사유를 명시 기록**한다.
- 위치 미확인 상태에서 추정으로 설계하지 않는다.

### 설계 산출물 저장 위치 (MUST)

본 가이드로 작성한 설계 산출물은 **모듈(체인)별 폴더로 분리하여 저장**한다. 한 화면당 기능/디자인/BPMN 3종 산출물이 같은 모듈 폴더 내에서 동일 `{화면식별자}` prefix 로 묶여야 한다.

**저장 규칙**
- 위치: `docs/{moduleId}/design/{화면식별자}/` — **화면별 하위 폴더** 아래에 3종 산출물(기능/디자인/BPMN)을 함께 저장한다. (MUST)
- **폴더 미존재 시 자동 생성** (Agent가 산출물을 작성하기 전에 `docs/{moduleId}/design/{화면식별자}/` 폴더 존재 여부를 먼저 확인하고, 없으면 생성한 뒤 저장한다)
- 파일명: `{화면식별자}_BPMN설계서.md`
- 절대경로 예: `docs/mqc/design/inspectionResult/inspectionResult_BPMN설계서.md`

**moduleId 산출 규칙**
- 화면이 속한 **모듈 식별자** (`mls`, `mqc`, `mpp`, `aps`, `mas`, `mes`, `master`) 를 그대로 사용 — 01 기능설계 가이드 §A.2-0-1 체인 사전 참조
- 모듈은 **화면 식별자에 포함되지 않으므로** 저장 경로에서 표현된다
- 본 BPMN 설계서의 `moduleId` 와 동일 체계

**모듈 예시**
| 모듈 | moduleId | 화면 식별자 예 | 산출물 절대경로 예 |
|---|---|---|---|
| 자재/주문 | `mls` | `orderRegistration` | `docs/mls/design/orderRegistration/orderRegistration_BPMN설계서.md` |
| 품질 | `mqc` | `inspectionResult` | `docs/mqc/design/inspectionResult/inspectionResult_BPMN설계서.md` |
| 생산실적 | `mpp` | `workReport` | `docs/mpp/design/workReport/workReport_BPMN설계서.md` |
| 생산계획 | `aps` | `productionPlan` | `docs/aps/design/productionPlan/productionPlan_BPMN설계서.md` |
| 마스터 | `master` | `item` | `docs/master/design/item/item_BPMN설계서.md` |
| 시스템 | `mes` | `user` | `docs/mes/design/user/user_BPMN설계서.md` |

**한 화면당 산출물 3종 (같은 `{화면식별자}/` 폴더에 함께 저장)**
- `{화면식별자}_기능설계서.md` — 02 기능설계 가이드 Part B 템플릿 기반
- `{화면식별자}_디자인설계서.md` — 03 디자인설계 가이드 Part B 템플릿 기반
- `{화면식별자}_BPMN설계서.md` — 본 가이드(04) Part B 템플릿 기반

==========================================================
---
---

# Part A. 설계 표준 규칙

## A.1. 문서 사용 규칙

### A.1-0. 적용 범위 (매우 중요 · MUST)

본 가이드는 **MES 하위 업무 모듈**(MLS · MPP · MQC · MAS · 시스템 MES 등)의
BPMN 프로세스 설계에만 적용한다. 아래 대상은 본 가이드의 적용 범위가 **아니다**:

| 대상 | 적용 가이드 | 체계 |
|---|---|---|
| **APS** (공정계획) — `src/backend/{aps-core, mpn}` | [`docs/aps/Aps-Guide.md`](../../../aps/Aps-Guide.md) | 구 체계 |
| MES 하위 업무 모듈 | **본 3종 설계가이드** + [`docs/guide/MES/Mes-Guide.md`](../../MES/Mes-Guide.md) | 신 체계 (마이그레이션) |

- **APS BPMN 은 본 가이드로 설계하지 않는다.** APS 관련 작업은 별도의 [`docs/aps/Aps-Guide.md`](../../../aps/Aps-Guide.md) 를 따른다. (MUST NOT)
- 한 PR 에 APS 와 MES 가 섞이면 섹션별로 각 가이드를 분리 적용한다.

#### "MES" 단어의 중의적 사용 — 반드시 구분 (MUST)

| 표기 | 의미 |
|---|---|
| **프로젝트 MES** (대문자) | 전사 ERP → 신규 MES 마이그레이션 프로젝트 전체 (본 가이드 line 5 "신규 MES 마이그레이션") |
| **moduleId `mes`** (소문자) | 시스템 공통 모듈 단일 체인 (8082 포트, `MES_WAS_URL`, URL FE→BFF `POST /api/mes/oasis/{serviceId}/{action}` / BFF→BE `POST /oasis/{serviceId}/{action}`) |

### A.1-1. 규칙 등급
| 등급 | 의미 |
|---|---|
| MUST | 반드시 지켜야 하는 규칙 |
| SHOULD | 특별한 사유가 없으면 따라야 하는 규칙 |
| MAY | 필요한 경우 선택적으로 적용할 수 있는 규칙 |

### A.1-2. 기본 원칙
- **Agent 의사결정 원칙은 「02_화면_기능설계_가이드.md §A.1-2-1」 이 정본**. 본 가이드(04 BPMN) 작성 시에도 동일하게 적용된다 — MUST/MUST NOT 으로 답이 정해진 항목(URL 형식·body shape·에러 응답 shape·action 명명 등)은 사용자에게 선택지로 제시하지 않고 기본값을 채택한다. **단, oasis 단일 BPMN vs Phase 7 query/service/lov 분리 채택은 본 가이드 §A.2-3-2 의 선택 기준 표를 적용** — 이 한 항목만 진짜 결정 사항으로 사용자께 묻는다.
- BPMN 설계는 **"화면 동작이 어떤 흐름으로 처리되는가(HOW IT WORKS)"** 를 정의한다.
- 각 프로세스는 **트리거(화면 이벤트) → API 호출 → 서버 처리 → 응답별 화면 동작** 4단계.
- 실제 BPMN XML/`camunda:property` 작성은 개발 단계의 몫이며, 설계 단계는 **논리 흐름**과 **일치 키**(action/beanName/method)만 고정한다.
- BPMN 설계서는 **화면 단위**로 작성한다. 하나의 기능설계서에 하나의 BPMN 설계서가 대응한다.
- **[마이그레이션 원칙]** 비즈니스 로직은 **기존 소스 코드가 정본**. 프로세스·검증·부수 효과는 기존 소스에서 추출하여 반영한다. (MUST)
  - 기존 Service 메서드 / Stored Procedure / Trigger 에서 로직 발췌
  - 변환이 필요한 경우(예: As-Is 단일 함수 → To-Be 다계층 API 분리)는 §6 특이사항에 매핑 기록
  - 기존 소스에 없는 새 로직 도입은 `[확인필요]` + §6 근거 명시

### A.1-3. 작성 순서
1. 기능설계서 §5 버튼 목록 확정 → 2. 버튼별 API 엔드포인트 식별 → 3. 프로세스별 BPMN 흐름도 → 4. 에러 처리 매트릭스 → 5. 데이터 연동/부수 효과 → 6. 화면 생명주기 → 7. 개발가이드 일치 검증

### A.1-4. 정합성 체크 (용어) — 02 §A.1-4 참조

본 가이드에서 "정합성 체크" / "정합 체크" 는 **02 기능설계 가이드 §A.1-4** 의 정의를 그대로 따른다. 세 층위:

1. **A.1-4-1. 3종 설계서 간 정합성** — 화면 식별자·필드ID·버튼ID·팝업ID·DB 컬럼명·상태코드·action / serviceId 가 기능/디자인/BPMN 3종에서 동일
2. **A.1-4-2. 설계 ↔ 구현 정합성** — DB 컬럼(SNAKE_CASE) ↔ Entity @Column ↔ DTO(camelCase) ↔ FE payload 루트 일치 (3자 일치, §A.2-3)
3. **A.1-4-3. 화면별 `{화면식별자}_정합체크.md` 산출물** — 위 1·2 를 행별 체크리스트로 실증 검증한 리포트 (복잡 화면 SHOULD)

BPMN 관점에서 가장 자주 적용되는 것은 **A.1-4-1 action/serviceId 일치** 와 **A.1-4-2 페이로드 키 루트 일치**. §A.7 정합 확인 표에서 검증한다.

---

## A.2. 시작 전 결정 항목

### A.2-1. 최소 확정 값

#### A.2-1-1. BackEnd / BPMN 측

> **★ MES 명명 룰 (정본 02 §A.2-1)** — `screenId` = `pageId` = `serviceId` 가 **모두 동일한 단일 camelCase 토큰** `{화면명}` (예: `orderRegistration`). BPMN 파일명 = `{screenId}.bpmn`. APS (`mpn` 체인, `src/frontend/m-mpn`) 만 기존 kebab + `-page.tsx` 예외.

| 항목 | 설명 | 예 (MES) | 예 (APS 예외) |
|---|---|---|---|
| 화면 식별자 (`screenId`) | 기능설계서와 동일 | `orderRegistration` | `production-plan` |
| **serviceId** (= `screenId`) | BPMN 파일명(확장자 제외) = `<bpmn:process id>` = API URL 의 `serviceId`. **MES: `screenId` 와 동일한 단일 camelCase `{화면명}`** | `orderRegistration` | `production-plan` |
| BPMN 파일명 | `{screenId}.bpmn` | `orderRegistration.bpmn` | `production-plan.bpmn` |
| 서비스 Bean명 | `<camunda:class>` Bean 이름. BE `@Service("beanName")` 와 동일. 관례적으로 `{screenId}Service` | `orderRegistrationService` | `productionPlanService` |
| **moduleId** | UI 측 모듈 prefix (mesModule 의 `m-` 제거). BFF→BE 호출 시 제거된다 | `mls` | `mpn` (`m-mpn` ↔ `mpn`) |
| 표준 URL 템플릿 (BFF→BE) | `POST /oasis/{serviceId}/{action}` (cactus `OasisController` 단일 매핑) | `POST /oasis/orderRegistration/{action}` | `POST /oasis/production-plan/{action}` (APS 예외) |
| 상위 모듈 | 소속 모듈 | MLS (영업관리) | APS (생산계획) |

#### A.2-1-2. Frontend 연계 값 참조 (기능설계서 §1.2 에서 확정된 값 그대로 인용)
BPMN 설계서 §1(문서 정보) 헤더에 **Frontend 연계 값** 을 함께 표기한다. (MUST) — 이 값은 기능설계서 §1.2 / 디자인설계서 §A.2-1-2 와 **반드시 동일**.

| 항목 | 설명 | 예 (MES) | 예 (APS 예외) |
|---|---|---|---|
| mesModule | Frontend 업무 모듈 | `m-mls` / `m-mpp` / `m-mqc` / `m-mas` / `m-mcm` | `m-mpn` |
| **screenId = pageId = serviceId** (단일 토큰) | Frontend 포털 페이지 식별자. **MES**: 세 식별자 모두 동일한 `{화면명}` 단일 camelCase | `orderRegistration` | `production-plan` (kebab) |
| 페이지 유형 (A~E) | Frontend 페이지 템플릿 유형 | C (조회+저장) | C |
| moduleId | (§A.2-1-1 과 동일 값) | `mls` | `mpn` |

- 표준 URL 은 Frontend 의 `apiRequest("/oasis/{serviceId}/{action}", ...)` 호출 경로와 **정확히 일치** 해야 한다. (MUST) (FE §14-1)
- **MUST NOT**: `/api/backend/{resource}/...` 형태 (폐기), 복수형 resource, **MES 에서 `serviceId` 를 `screenId` 와 다른 짧은 토큰으로 분리** (예: screenId=`orderRegistration` 인데 serviceId=`order` 로 분리하는 행위 — §A.2-1 정본 위반).

### A.2-2. 선행 설계 확인
- 기능설계서 §5(버튼) / §7(상태 전이) / §9(연동) 확정 후 시작. (MUST)
- 상태 전이 규칙이 있는 화면은 기능 §7이 완성된 후 BPMN 설계 시작. (MUST)

### A.2-2-1. 마이그레이션 입력 자료

BPMN 설계는 비즈니스 로직 추출을 위해 아래 자료를 반드시 확보한다. 본 표의 **고정 경로는 프로젝트 공통값**이므로 매 설계 요청 시 재지정하지 않는다.

#### 🔒 프로젝트 고정 경로 (As-Is 자료 — BPMN 로직 정본)
| # | 자료 | 표준 위치 | BPMN 설계 활용 |
|---|------|----------|---------------|
| 1 | **기존 ERP 원본 소스** | `docs/external/KsmErpK/orgErpSource/` | Controller/Service 로직 추출 — **§2 프로세스별 서버 처리 로직**의 정본 |
| 2 | **As-Is 프로시저** | [`docs/external/KsmErpK/procedures/`](../../../external/KsmErpK/procedures) | 저장·상태변경·배치 로직 추출 — §2 서버 처리, §6 검증, §7 상태 전이 |
| 3 | **As-Is 함수** | [`docs/external/KsmErpK/functions/`](../../../external/KsmErpK/functions) | 계산식·변환식 추출 — §4.1 부수 효과, §6 검증 |
| 4 | **As-Is 트리거** | [`docs/external/KsmErpK/triggers/`](../../../external/KsmErpK/triggers) | 자동 처리·연쇄 갱신·이력 적재 추출 — §4.1 부수 효과 |
| 5 | **As-Is 테이블** | [`docs/external/KsmErpK/tables/`](../../../external/KsmErpK/tables) | SQL 구조 파악, UPDATE/INSERT 대상 식별 |
| 6 | **As-Is 뷰** | [`docs/external/KsmErpK/views/`](../../../external/KsmErpK/views) | 조회 로직·조인·집계 규칙 추출 — §2 조회 액션 |

#### 🔒 프로젝트 고정 경로 (To-Be 자료)
| # | 자료 | 표준 위치 | BPMN 설계 활용 |
|---|------|----------|---------------|
| 7 | **To-Be 테이블 정본** | `docs/external/DMES/DMES-SECTION-{MODULE}_테이블정의서.xlsx` | 신규 테이블명·컬럼명 (§2 의 `UPDATE XXX SET …` 등 기재 시 정본) |
| 8 | **타 모듈 기 구축 Entity** | `src/backend/{모듈}/core/src/main/java/**/domain/**/*.java` | §A.2-2-3 컬럼 재사용 확인 |
| 9 | **As-Is ↔ To-Be 매핑** | `docs/{moduleId}/reference/mapping/{화면식별자}_mapping.md` (기능설계 산출물) | §4.2 참조 무결성 매핑 |

#### 📎 매 요청 시 제공 자료
| # | 자료 | 제공 방식 | BPMN 설계 활용 |
|---|------|----------|---------------|
| 10 | **As-Is 화면 캡처** | 사용자가 채팅에 **이미지 첨부**로 제공 *(선택 — 있으면 권장. 없으면 As-Is 컨트롤러/이벤트 핸들러 코드 기반 트리거 식별 + §6 "캡처 미제공" 명시)* | 트리거(버튼·이벤트) 식별 |

### A.2-2-2. 기존 소스 → BPMN 추출 규칙 (MUST)

| 기존 소스 요소 | BPMN 설계서 반영 위치 |
|---------------|---------------------|
| `@Controller` / REST 엔드포인트 | §1.1 API 엔드포인트 총괄 (URL·Method·action) |
| `@Service` 메서드 | §2 프로세스별 서버 처리 단계 |
| Validation 로직 (if 체크) | 기능 §6 검증 규칙 + BPMN §2 "1. 유효성 검증" |
| 트랜잭션 경계 (`@Transactional`) | §4.3 동시 수정 방지 방식 선택 |
| 다른 테이블 INSERT/UPDATE | §4.1 상태 전이 부수 효과 |
| 예외 처리 (throw `CustomException`) | §3 에러 처리 매트릭스 (HTTP 상태 + 코드) |
| 채번 로직 | §6 특이사항 채번 규칙 |
| Stored Procedure 호출 | §2 서버 처리에 "SP 호출" 명시 (명칭·파라미터 — 구체 SQL 금지) |
| Trigger 로직 | §4.1 부수 효과 (자동 반영됨을 명시) |

- 기존 소스에서 확인한 로직은 출처 참조 표기 가능: `(기존: OrderServiceImpl.saveOrder L120-L145)`. (MAY)
- As-Is 단일 함수가 To-Be에서 다계층 API로 분리되면 §6 특이사항에 **매핑 표** 작성. (MUST)

### A.2-2-3. 타 모듈 기 구축 컬럼과의 정합 (MUST)

BPMN §2 서버 처리 단계에 `UPDATE TB_XXX SET COL = ...` 같이 DB 컬럼을 기재할 때, 그리고 API Request/Response Body 의 JSON 필드명(= DB 컬럼의 camelCase)을 정할 때 **01 기능설계 가이드 §A.2-4-1** 을 따른다. 즉 **APS · master · 기존 MES 모듈**에 의미가 동일한 컬럼이 존재하면 **그 컬럼명을 그대로 사용**한다 (예: APS 의 `ITEM_CD` → 본 BPMN 의 저장 SQL · 페이로드 `itemCd` 에서도 동일 루트 사용).

- 부수 효과 테이블(§4.1)에 기록하는 컬럼명도 동일 규칙 적용. (MUST)
- 크로스 모듈 호출 payload(§4.4 외부 연동) 의 JSON 필드명도 동일 규칙 적용. (MUST)

### A.2-3. API 표준 URL 규격 (BE v2 Part B §3)

**WAS 수신 형식 (고정)**:

```
POST /oasis/{serviceId}/{action}
```

| URL 구성요소 | 규칙 | 예시 (MES) | 예시 (APS 예외) |
|---|---|---|---|
| `moduleId` (UI→BFF 에만 등장) | UI 모듈 prefix. mesModule 의 `m-` 제거. BFF→BE 호출 시 제거된다 | `mqc` / `mpp` / `mls` / `mas` / `mcm` | `mpn` |
| `serviceId` | **MES: `screenId` 와 동일한 단일 camelCase `{화면명}`** (BPMN 파일명·`<process id>` 모두 동일) | `inspectionResult`, `orderRegistration`, `workReport` | `production-plan` (kebab) |
| `action` | 동작 이름 (BPMN `conditionExpression` 분기와 1:1) | `search`, `save`, `delete`, `changeStatus`, `start`, `complete`, `cancelResult`, `scrap` 등 | 동일 |

- **Method 는 `POST` 고정** (BE §3). CRUD 구분은 URL 의 `action` 과 BPMN actionGateway 분기로 표현.
- **MUST**: 같은 `serviceId` 내 CRUD 는 **동일 BPMN 파일 + 다른 action** 으로 구현.
- **MUST**: BPMN 파일 (`{serviceId}.bpmn`) 이 없으면 URL 은 라우팅되지 않는다 — 새 `serviceId` 도입 시 BPMN 파일을 먼저 생성.
- **MUST NOT**: `GET /api/products`, `PUT /api/{resource}/{id}` 같은 REST 관례 사용. 복수형, 하이픈(MES — APS 예외 제외), `/api/backend/` prefix 모두 금지.
- **MUST NOT (MES 한정)**: `screenId` 와 `serviceId` 를 **다른 토큰으로 분리**. 예 — screenId 가 `orderRegistration` 인데 serviceId 를 `order` 또는 `orderRegistration` 으로 짧게 쓰는 것은 02 §A.2-1 정본 위반.

#### A.2-3-1. FE 호출 경로 vs WAS 수신 경로 (MUST 구분)

브라우저에서 portal 로 들어가는 **FE 경로**와 portal 프록시가 WAS 로 보내는 **WAS 경로**는 **세그먼트 순서가 다르다**. BPMN 설계서 작성 시 이 차이를 혼동하지 않는다.

| 구간 | 형식 | 예시 (MES — `serviceId = screenId = {화면명}`) |
|---|---|---|
| **FE 호출** (브라우저 → portal BFF) — OASIS | `POST /api/{moduleId}/oasis/{serviceId}/{action}` | `POST /api/mpp/oasis/workReport/search`, `POST /api/mls/oasis/orderRegistration/save` |
| **FE 호출** (브라우저 → portal BFF) — REST | `POST /api/{moduleId}/rest/{API_PATH}` | `POST /api/mpn/rest/api/demands` (APS 계열) |
| **WAS 수신** (portal → WAS) — OASIS | `POST /oasis/{serviceId}/{action}` | `POST /oasis/workReport/search` |
| **WAS 수신** (portal → WAS) — REST | `POST /{API_PATH}` (`rest/` segment 제거) | `POST /api/demands` |

- **변환 주체**: portal catch-all 라우트 (`portal/app/api/[moduleId]/oasis/[serviceId]/[action]/route.ts` 등) + `createOasisProxyHandler` (shared) 가 BE 의 `/oasis/{serviceId}/{action}` (cactus `OasisController` 단일 매핑) 으로 프록시. REST 라우트는 `rest/` segment 를 제거하고 BE 의 원래 REST 매핑으로 프록시. `aps` 라는 API 모듈은 없으며 APS 비즈니스는 `mpn` 모듈(aps-core 확장)이 담당한다.
- **BPMN/WAS 설계서 기준**: §1.1 API 총괄·§2 프로세스 상세 등에서 URL 을 적을 때는 **WAS 수신 경로** 를 쓴다 (`/oasis/{serviceId}/{action}`).
- **FE 호출 경로는 01 기능설계서 §A.5-4-1** 에서 관리. WAS 쪽 BPMN 설계서에서는 FE 경로를 다시 기술하지 않는다 (중복 관리 지양).

**MUST NOT**:
- WAS 쪽 BPMN 설계서에 `/api/{moduleId}/...` 형태(FE 경로) 기재
- FE 개발자가 WAS 경로(`/oasis/...`) 를 브라우저에서 직접 호출 (catch-all 미매칭 → 404)
- 옛 `/{serviceGroup}/api/...`, `/${cactus.oasis.service-group}/api/...`, `/api/backend/...` 형태 사용

**개발 환경의 moduleId → WAS 라우팅 (MUST)**

portal catch-all 라우트는 `backendApiUrlByGroup` 매핑으로 moduleId 별 WAS URL 을 선택한다. 매핑이 없는 그룹은 `BACKEND_API_URL` (기본 Portal WAS 8080) 로 fallback 되어 **엉뚱한 WAS 로 요청이 가면서 404/500 이 발생**한다. BPMN 설계자 관점에서도 이 사실을 이해해야 "프로세스는 정상인데 요청이 아예 도달하지 않는" 디버깅 함정을 피할 수 있다.

`portal/.env` 개발용 매핑:

| 환경변수 | moduleId | 로컬 기본 포트 |
|---|---|---|
| `MCM_WAS_URL` | `mcm` | 8080 |
| `APS_WAS_URL` | `aps` | 8081 |
| `MPP_WAS_URL` | `mpp` | 8083 |
| `MQC_WAS_URL` | `mqc` | 8084 |
| `BACKEND_API_URL` | (fallback) | 8080 |
| `BACKEND_CLIENT_KEY` | (공통) | — (BFF→BE `X-Client-Key` 헤더용 공유키. 옛 명 `UI_CLIENT_KEY` 폐기) |

**신규 체인 추가 시 BPMN 설계자 체크 포인트 (MUST)**
1. `{moduleId}/api/application.yml` 의 `server.port` 가 다른 체인과 **충돌 없음** 확인
2. `portal/.env` 에 `{MODULE_ID}_WAS_URL=http://localhost:{port}` 등록 여부 확인
3. portal BFF catch-all 라우트(`app/api/[moduleId]/oasis/...` 등) 의 `backendApiUrlByGroup` 에 해당 `{moduleId}` 키 존재 여부 확인
4. 위 항목 중 하나라도 누락되면 BPMN 서비스 태스크가 **절대 호출되지 않고** 증상은 `NoResourceFoundException` 또는 엉뚱한 체인의 BPMN 에서 `Cannot find the default flow` 로 나타난다
5. 설계서 §11 특이사항에 "인프라 의존 — portal 라우팅 매핑 등록 필요" 로 기록

**운영 환경**
- `BACKEND_API_URL=http://internal-nginx` 하나로 통합. Nginx 가 모듈별 라우팅을 담당하므로 `{MODULE_ID}_WAS_URL` 은 개발용.

**action 표준 예시** (BFF→BE 경로 기준 — `serviceId = screenId` 단일 토큰)

| 동작 | action | URL 예시 (MES) |
|---|---|---|
| 목록 조회 | `search` | `POST /oasis/orderRegistration/search` |
| 단건 조회 | `read` | `POST /oasis/orderRegistration/read` (body: `{ "orderId": "..." }`) |
| 신규 등록 | `save` (rowStatus='C') | `POST /oasis/orderRegistration/save` |
| 수정 | `save` (rowStatus='U') | `POST /oasis/orderRegistration/save` (같은 URL, rowStatus 로 구분) |
| 삭제 | `save` (rowStatus='D') 또는 `delete` | `POST /oasis/orderRegistration/save` |
| 상태 변경 (다계층) | `change{LayerName}` | `POST /oasis/inspectionResult/changeProgress` |
| 분할 | `split` | `POST /oasis/workReport/scrap` |
| 연계 조회 | `search{SubResource}` | `POST /oasis/inspectionResult/searchHoldLogs` |

### A.2-3-2. oasis 단일 BPMN vs Phase 7 query/service/lov 분리 — 채택 기준 (MUST)

본 절은 **신규 화면이 어느 라우팅 패턴을 채택할지의 선택 기준**을 정한다. 가이드 정본 채택 후 §A.1-2-1-1 카탈로그(02 기능설계 가이드)와 본 절을 참조하여 사용자에게 "묻을 항목" 인지 "묻지 않을 항목" 인지 판단한다.

#### A.2-3-2-1. 두 패턴의 정의

| 패턴 | URL (FE→BFF / BFF→BE) | BPMN 구조 | 정본 |
|---|---|---|---|
| **oasis 단일 BPMN** (기본) | `POST /api/{moduleId}/oasis/{serviceId}/{action}` / `POST /oasis/{serviceId}/{action}` | `{serviceId}.bpmn` 1개 + actionGateway 분기 (search / save / delete / changeStatus / ...) | 본 가이드(04) §A.2-3 / §A.4-1, BE v2 Part B §3 |
| **Phase 7 query / service / lov 분리** (조건부) | query: `POST /api/{moduleId}/query/{queryId}` / service: `POST /api/{moduleId}/service/{serviceId}` / lov: `GET /api/{moduleId}/lov/master/{code}` | queryId·serviceId 단위 BPMN 다중 (각 파일은 actionGateway 없는 단일 흐름) | [`Frontend 표준 §2-2-1`](../../../../docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md) |

#### A.2-3-2-2. 채택 기준 (자동 판정 — MUST)

아래 6개 조건의 충족 개수에 따라 **Agent 가 자동 판정**한다. 사용자에게 묻지 않는다 (재현성 확보 — 같은 입력 → 같은 채택 결과).

| # | 조건 | 점검 방법 |
|---|---|---|
| C1 | As-Is SP 가 **case 분기 ≥4 종**이며 의미상 "조회(SELECT) vs 트랜잭션(INSERT/UPDATE/DELETE)" 으로 명백히 분리됨 | As-Is `procedures/*.sql` 의 `@Case` 분기 카운트 + 동작 분류 |
| C2 | LoV master 호출 컬럼이 **≥5종** (코드 마스터 콤보·그리드 코드값 변환 합산) | 기능설계서 §3.3 "코드값 변환" 표 행 수 |
| C3 | 화면이 **회사·공장 종속 LoV** (`B_COST_CENTER` 같이 표준 `/lov/master/{code}` 로 표현 곤란한 마스터) 를 ≥1 사용 | As-Is 소스에서 직접 SELECT 한 회사 종속 마스터 식별 |
| C4 | **동적 컬럼 응답** (예: 공정별 보고항목, 컬럼 정의 자체가 row) 을 가진 팝업/그리드 ≥1 | 기능설계서 §9 팝업의 "동적 컬럼" 표시 |
| C5 | **다단 그리드 통합 조회** 가 아니며, 각 팝업·서브 영역이 독립 query 로 분리 가능 | §A.3-2 "통합 조회" 패턴 적용 부적합 |
| C6 | As-Is 가 **다른 SP 를 외부 호출** (예: `soPGA011 ResultsManage`) 하여 단일 BPMN 의 actionGateway 로 묶기 어색함 | As-Is 소스의 외부 SP 호출 라인 식별 |

**자동 판정 규칙 (MUST)**:

| 충족 개수 | 채택 | 등급 |
|---|---|---|
| **0 ~ 1** | **oasis 단일 BPMN MUST** (자동 채택) | 결정성 100% |
| **2 ~ 3** | **잠정 oasis 진행 + [확인필요: Q-NNN] 등재** | 사용자 응답 대기 없이 진행 |
| **≥ 4** | **Phase 7 분리 MUST** (자동 채택) | 결정성 100% |

- **자동 채택의 의미**: Agent 가 사용자에게 묻지 않고 즉시 결정. `[확인필요]` 마커는 2~3 충족 케이스에만 등재 (Q-NNN 형식). 분석리포트 §11 에 C1~C6 표 + 충족 개수 + 채택 결과 직접 기록.
- **(MUST NOT) Agent 자체 추론으로 자동 판정 결과 뒤집기 금지**: "OASIS 가 더 적합하다" / "phase7 이 더 자연스럽다" / "본 화면은 예외다" 같은 판단으로 충족 개수 표의 결과를 변경할 수 없다. 5차 ↔ 6차 진동의 직접 원인이었던 자체 추론을 절대 금지한다.
- **(MUST NOT) 사용자 질의 금지**: 자동 판정 결과를 사용자에게 선택지로 제시하지 않는다. 예외 필요 시 [확인필요: Q-NNN] 등재 후 진행.
- 본 규칙은 **재현성 확보를 위한 자동 판정**. 동일 As-Is 자료 입력 → 동일 채택 결과 (반복 설계 진동 차단).

> **이유**: oasis 단일 BPMN 은 actionGateway 라는 진입점 구조 자체가 "동질 도메인의 CRUD 묶음" 에 최적화되어 있다. C1~C6 의 충족은 화면이 그 구조에 맞지 않음을 의미한다. ≥4 충족 시 자동 채택은 그 명백성을 인정하는 것.

#### A.2-3-2-3. 적용 사례

| 화면 | 충족 조건 | 채택 |
|---|---|---|
| `workOrder` (mpp 작업지시) | C1×(SP 단순) / C2×(코드 마스터 거의 없음) / C3×~C6× | **oasis 단일** (`workOrder.bpmn` actionGateway 3분기) |
| `workReport` (mpp 작업실적현황 — PGA020K) | C1✓(soPGA020 case 6 + soPGA011 case 1) / C2✓(P019/P038/P001/P004/B036 5종) / C3✓(B_COST_CENTER 회사 종속) / C4✓(P-201 JobDetail 동적 컬럼) / C5✓ / C6✓ | **Phase 7 분리** (6 query + 2 service + 5 LoV) |

신규 화면 설계 시 위 표에 행을 1줄 추가하여 정합 추적성을 유지한다 (SHOULD).

#### A.2-3-2-4. Phase 7 채택 시 주의 (MUST)

- BE v2 가이드의 query/service/lov 라우팅 컨트롤러 정본(`QueryController` / `ServiceController` / `LovController` 등) 을 확인 후 진입. 미명시 시 BE 가이드 보강 PR 선행 필요.
- BPMN 파일은 **queryId·serviceId 단위로 다중**. 각 파일은 actionGateway 없는 단일 `start → serviceTask → end` 흐름.
- FE 호출은 `@dk-oasis/shared/http` 의 `apiQuery / apiService / apiLovMaster` 헬퍼 사용 (수동 path 조립 금지).
- 회사 종속 LoV 는 `lovMaster` 가 아닌 별도 query 로 분리 (예: `workReportCostCenterList`).

#### A.2-3-2-5. 혼합 금지 (MUST NOT)

한 화면에서 oasis 단일 BPMN 과 Phase 7 분리를 **혼합 사용 금지**. 라우팅 패턴이 일관되어야 FE 호출/BFF 라우팅/BE 매핑이 깨끗하다. 단, **공통 인프라 LoV master** (`GET /lov/master/{code}`) 는 oasis 패턴 채택 화면에서도 그대로 사용 가능 — 이는 화면 단위 BPMN 과 무관한 공통 인프라이므로 혼합으로 보지 않는다.

---
