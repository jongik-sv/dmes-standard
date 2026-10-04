# 01. 규칙, 결정 항목, 파일 구조

> 상위 문서: [Frontend 표준 개발 가이드 V2](../../FrontEnd_표준_통합_개발가이드_v2.md)



## 1. 문서 사용 규칙

### 1-1. 규칙 등급

| 등급 | 의미 |
|---|---|
| MUST | 반드시 지켜야 한다. |
| SHOULD | 특별한 사유가 없으면 따른다. |
| MAY | 조건에 해당하면 사용할 수 있다. |
| MUST NOT | 어떤 경우에도 하지 않는다. |

### 1-2. 기본 원칙

- 새 페이지는 **해당 업무에 맞는 Frontend 업무 모듈(`m-{moduleCode}`) 에 구현**하고 portal 에는 재내보내기만 둔다. (모듈 선택은 §2-3)
- 공용 UI·훅·HTTP 는 **shared 에서만** 가져온다.
- 컴포넌트는 렌더링·상태·이벤트 처리만 담당하고, HTTP 호출은 `*-api.ts` 서비스 모듈에 둔다.
- 에러는 서비스 모듈에서 throw, 페이지에서 한 번만 표시한다.
- 템플릿 밖 패턴을 임의 도입하지 않는다.
- **MUST: 설계서 정본 우선순위** — (1) 분석리포트 §4 항목 목록 = 정본. (2) 기능설계서 / 디자인설계서 / BPMN설계서 = 인용. (3) 본 개발 가이드 = 절차. 충돌 시 분석리포트 우선.
- **MUST NOT: 분석리포트 정독 + 매트릭스 추출 (§1-3 Step 0) 없이 코드 작성 진입 금지.**
- **MUST: §13-4 1:1 대조의 모든 항목이 ✓ 일 때만 개발 완료**. ✗ 인 항목이 1개라도 있으면 §13-5 재개발 의무 사이클 수행.
- **MUST NOT: 검증 실패 항목을 사용자에게 보고하지 않고 임의 종료**.

**[정직성 선언 — E1·E2·E3, MUST]** (정본: `docs/guide/design/00_Agent지시_가이드.md §6.14`)
- **E1 완료 보고 정직**: "다 했냐" 질의 응답 시 잔존 ✗ / △ / 누락 항목 숨김 금지. 100% ✓ 일 때만 "완료" 표기.
- **E2 검증 정직**: `pnpm build` / §13-4 1:1 대조 직접 미수행 상태에서 "통과" / "완료" 표기 금지.
- **E3 고해성사 정직**: 결함 있으면 솔직 보고, 없으면 억지로 쥐어짜지 말 것 (없는 결함 임의 생성 금지).

### 1-3. 작업 순서

0. **설계서 5종 정독 + 매트릭스 추출 (MUST — 차단 게이트)**

   **[B1·B3 진입 게이트 — fail-fast + As-Is 1:1 보존 의무, MUST]**
   - **B1 fail-fast (진입 차단)**: `/analyze-service {SCREEN-ID}` cache (Phase 1~4 산출) 또는 T1~T4 매트릭스 미존재 / 미추출 상태에서 본 Step 0 이후 단계 진입 = **"진행 불가"** 선언 후 즉시 중단. 임의 추정·skip·요약 진행 금지.
   - **B3 As-Is 1:1 보존 의무 (선행 원칙)**: 본 Step 0 이후 모든 단계는 As-Is 컴포넌트 (T1) / 이벤트 (T2) / 표준 라이브러리 (T3) 의 1:1 보존을 전제로 한다. 추측 / 단순화 / "유사하므로 동등" 표현 = §6-A 임의 변경 금지 위반 → ✗ 자동 전환.
   - 변경 필요 시: 분석리포트 §12 결정 후보 등재 + 사용자 명시 동의 → 정합체크서 §G Q-NNN 등재 후 △ 처리.

   - 분석리포트 §3 (S-NNN 검색조건), §4.3 (G-NNN 그리드 + GE-NNN 첨부), §4.5 (B-NNN 버튼) + §4.5-1 (GB-NNN 그리드셀 버튼), §4.6 (P-NNN 팝업), §6 (V-NNN 검증), §7 (Entity 컬럼 — 편집 가능 / 외부 JOIN / 계산 컬럼 분류), §10 (LV-NNN LoV) 전수 인용
   - 산출물: 매트릭스 표 (각 영역별 수량 + 항목 목록) — 작업 노트 또는 정합체크서 §A.2 에 기재
   - 매트릭스 표 미작성 시 1번 단계 진입 금지

   **★ As-Is 가 있는 화면의 경우 추가 MUST (analyze-service 호출 + T1~T4 전수 추출 의무화)**:
   - `/analyze-service {SCREEN-ID}` 를 실행한다. cache 가 이미 있으면 자동 스킵, 없으면 Phase 1~4 (구조 / C# partial class / 레거시 DB SP / WinForms UI) 자동 수행. (cache 는 BE 와 공유 — BE 가이드 §1-3 Step 0 이 먼저 호출했다면 재실행 불요)
   - 산출 cache 위치: `docs/external/KsmErpK/orgErpReport/{areaId}/{moduleId}/.cache/{SCREEN-ID}/sql_analysis.json`
   - 위 cache 가 존재하지 않으면 본 Step 0 진입 게이트 차단 — 이후 단계 진행 금지.

   **🚨 §17.0 절대 원칙 (분석리포트.template §17.0 인용) — 위반 시 즉시 ✗ 재개발 의무**:
   1. **As-Is 정의 1:1 보존** — 화면 구조 / 컴포넌트 / 자동 연동 / 그리드 개수/배치 임의 변경 절대 금지. 변경이 필요하면 분석리포트 §12 결정 후보 등재 + 사용자 명시 동의 필수.
   2. **코드 정의 완전 분석 의무** — Skip 금지. "분량이 커서" / "유사하므로 동일" / "효율 위해 단순화" / "시간 단축" 표현 사용 = ✗ 자동 전환.
   3. **검증 단계 의무** — 분석리포트 §17.5 self-check 통과해야 §17 완료 인정.

   **T1~T4 강제 추출 표 (분석리포트 §17.2-T1/T2/T3/T4 작성 의무 — FE 책임 영역 강제)**:
   - **T1 화면 컴포넌트 매트릭스** (Designer.cs `InitializeComponent()` 의 모든 컨트롤 1행씩 — Grid / Btn / Txt / Combo / Label / GroupBox / Panel / TabControl / ToolStripButton / Spread / Dialog 등). **FE 페이지 (`*.tsx`) 의 대응 컴포넌트 위치 1:1 매핑 의무** — 누락 = §K.5.6 위반.
   - **T2 이벤트 핸들러 매트릭스** (`*.cs` 의 모든 이벤트 1행씩 — `On*` / `*_Click` / `OnGrid*` 등 — 자동 그리드 갱신 / 외부 화면 전환 / SP 자동 호출 트리거 명시). **FE 의 대응 이벤트 매핑 의무** (`useEffect` / `onClick` / `onChange` / `onSelectionChange`).
   - **T3 표준 라이브러리 호출 매트릭스** (`*.cs` 안의 모든 외부 라이브러리 호출 1행씩 — AttachmentManager / AttachedFileList / AutoFillup / RfdCustomerDialog / ResourceDialog / GeneralDialog / NewCodeQuery / WorkPreset / OpenFormWithParameter 등. **SP grep 으로 안 잡히는 화면 자동 동작 (예: AttachmentManager → wwAttachmentFile 자동 표시) 은 본 표에서만 잡힘** — 누락 시 §17.0.1 위반). **FE 의 대응 처리 (apiRequest 호출 / portal-shell-core 컴포넌트 / use-api-call 훅 등) 매핑 의무**.
   - **T4 SP case × 부수효과 매트릭스** (§17.2 본 표 — **컬럼 단위 1:1**: INSERT N 컬럼 = N 행 / UPDATE SET N 컬럼 = N 행 / SELECT N 컬럼 = N 행 / JOIN/WHERE/조건부 분기 = 별도 행).

   **§17.4 자동 룰 카운트 의무 (수량 동일성 검증 입력)**:
   - T1 As-Is 컴포넌트 수 / T2 이벤트 수 / T3 표준 라이브러리 수 / T4 SP case 수 / T4 부수효과 E-NNN 수 / 외부 SP/FN 호출 수 / 자동 채번 수 / 자동 일자 수 / Q-deferred 의존 수
   - 위 카운트를 분석리포트 §17.4 표에 기재. 정합체크서 §K.5.5 의 수량 동일성 검증 입력으로 사용.
   - **§17.2 의 매 부수효과 = 1 컬럼 / 1 분기 / 1 이벤트 / 1 라이브러리에 `E-NNN` (또는 `C-NNN` / `EV-NNN` / `L-NNN`) ID 부여 + As-Is `file:line` 인용 + 코드 quote 의무**. 묶음 텍스트 금지. 이 ID 가 §13-4 (1:1 대조) 시 §K.5 검증의 단위가 된다.
   - FE 측에서 As-Is SP 부수효과 의존도는 BE 보다 낮지만 (외부 화면 전환 / 결재 상신 / inline SQL 자동 채움 / 그리드 자동 연동 등 일부 항목만), **T1 (컴포넌트) + T2 (이벤트) + T3 (표준 라이브러리) 매핑은 FE 가 책임지므로 누락 시 §K.5.6 위반 — ✗ 자동 전환**.

   **To-Be only 화면 (As-Is 없음)**: analyze-service 호출 면제. 분석리포트 §17 = "해당 없음" 으로 기록 후 통과.
1. 페이지 유형 선택 (§3)
2. 대상 패키지 결정 (§2-1)
3. Frontend 업무 모듈 선택 (§2-3)
4. 최소 확정 값 정리 (§2-2)
5. `types.ts` / `constants.ts` / `*-api.ts` 작성
6. 페이지 본체 작성
7. 대상 모듈 엔트리 및 해당 모듈의 `tsup.config.ts` 엔트리 등록
8. portal 재내보내기 등록
9. **완료 체크리스트 수행 (§13) — §13-4 1:1 대조 + §13-5 재개발 의무 포함**

**[작업 순서 결말 — 재개발 의무 사이클]**

마지막 단계 (9. 완료 체크리스트 수행) 에서 §13-4 1:1 대조의 **한 항목이라도 ✗ 면 화면 개발 미완성**으로 판정.

이 경우:
1. ✗ 처리된 항목을 식별
2. 해당 항목이 속한 단계 (예: 그리드 컬럼 ✗ → 6번 페이지 본체 작성 단계) 로 돌아간다
3. 해당 단계 재개발
4. 다시 §13-4 1:1 대조 수행
5. **모든 항목이 ✓ 일 때까지 위 사이클 반복**

이 반복은 Agent (또는 개발자) 의 재량이 아니라 의무다. 임의 종료 / "이 정도면 됐다" 판단 금지. 상세 절차는 §13-5 참조.

---

## 2. 시작 전 결정 항목

### 2-1. 대상 패키지

| 작업 성격 | 대상 | 판단 기준 |
|---|---|---|
| 신규 기능 페이지 | `m-{moduleCode}` (업무 모듈, §2-3) | 도메인 로직·페이지 UI |
| 공용 컴포넌트/훅/유틸 추가 | `shared` | 2개 이상 페이지에서 재사용 확정 |
| 포털 프레임·인증·메뉴·프록시 | `portal` | 호스트 앱 구조 변경 |

- MUST: 단일 페이지 전용 로직은 해당 업무 모듈(`m-{moduleCode}`) 에 둔다.
- MUST: 페이지의 업무 성격과 다른 모듈에 코드를 두지 않는다. (§2-3)
- MUST NOT: `portal/page-components` 에 비즈니스 로직을 작성하지 않는다. 재내보내기 전용이다.

### 2-2. 최소 확정 값

| 항목 | 설명 | 예시 |
|---|---|---|
| mesModule | 업무 모듈 (§2-3 에서 선택) | `m-mpn`, `m-mpp`, `m-mqc`, `m-mls` 등 |
| moduleGroup | mesModule 내부의 도메인 그룹 | `master`, `planning`, `scheduling` 등 (모듈마다 상이) |
| screenId / pageId / serviceId / pageName | **MES 단일값** (camelCase 화면명) — §4-0 규칙 | `plateSlittingMgmt` (MES) / `mpnApsSomething` 후 kebab 변환 `mpn-aps-something` (APS 예외) |
| pageId (full) | 포털 페이지 식별자 | MES: `"portal:master/plateSlittingMgmt"` / APS: `"portal:master/mpn-aps-something"` |
| API path (UI→BFF) | UI 코드는 항상 BFF prefix 형태로 호출한다 | `POST /api/mpp/oasis/product/search` (OASIS) / `POST /api/mpn/rest/api/demands` (REST, mpn = aps-core 확장 MES 모듈) |
| API path (BFF→BE) | BFF 가 BE 로 다시 던지는 경로. OASIS 는 `/oasis/...` 로 그대로, REST 는 `/api/{moduleId}/rest/` segment 가 제거되어 BE 의 원래 매핑으로 호출 | `POST /oasis/product/search` / `POST /api/demands` |
| tsup entry key | 대상 모듈의 tsup 엔트리 키 | MES: `pages/master/plateSlittingMgmt` (suffix `-page` 금지) / APS 예외: `pages/master/mpn-aps-something-page` |

- MUST: UI→BFF 호출은 다음 두 컨벤션 중 하나를 사용한다.
  - **OASIS 호출**: `/api/{moduleId}/oasis/{serviceId}/{action}`. BFF 가 BE 의 `POST /oasis/{serviceId}/{action}` (cactus `OasisController` 단일 매핑) 으로 프록시한다.
  - **REST 호출**: `/api/{moduleId}/rest/{API_PATH}`. BFF 가 `rest/` segment 를 제거하고 BE 의 원래 REST 매핑(`/api/...`) 으로 프록시한다 (예: APS `/api/demands`).
- MUST: `moduleId` 는 `{mpp|mqc|aps|portal|...}` 등 UI 모듈 prefix 를 사용한다.
- MUST: `serviceId` 는 BPMN 파일명과 동일한 **단수 camelCase** 로 작성한다. (`product`, `workOrder`)
- MUST NOT: 복수형(`products`), 옛 `/api/backend/...`, `/{serviceGroup}/api/...`, `/${cactus.oasis.service-group}/api/...`, 폐기된 `/api/{moduleId}/nooasis/...` 형태를 사용하지 않는다.
- MUST NOT: `serviceGroup` placeholder 는 더 이상 존재하지 않는다.

#### 2-2-1. Phase 7 신규 컨벤션 (query / service / lov)

OASIS / REST 외에 mybatis 쿼리·트랜잭션 service·LoV 호출용 path 가 추가되었다. 정본은 RULE.md §"Phase 7 신규 컨벤션" 이며, FE 호출은 `@dk-oasis/shared/http` 의 헬퍼(Part B §2) 를 우선 사용한다.

| 의미 | UI → BFF | BFF → BE |
|---|---|---|
| 쿼리 (mybatis) | `/api/{module}/query/{queryId}` | `/query/{queryId}` |
| 쿼리 via OASIS service | `/api/{module}/query/service/{serviceId}` | `/query/service/{serviceId}` |
| 트랜잭션 service | `/api/{module}/service/{serviceId}` | `/service/{serviceId}` |
| LoV master code | `/api/{module}/lov/master/{code}/{group?}` | `/lov/master/{code}/{group?}` |
| LoV (mybatis) | `/api/{module}/lov/query/{queryId}` | `/lov/query/{queryId}` |
| LoV (service) | `/api/{module}/lov/service/{serviceId}` | `/lov/service/{serviceId}` |

- MUST: BFF 는 `/api/{module}/` 만 제거하고 `${module_url}/...` 로 그대로 전달한다 (rest 와 동일하게 prefix 만 떼는 정책).
- MUST: 인증 헤더 4종(`Authorization`, `X-Client-Key`, `X-Authenticated-User`, `X-Authenticated-Role`) 과 환경변수 우선순위(`${MODULE}_WAS_URL` → `BACKEND_API_URL`) 정책은 기존 rest 프록시와 동일.
- SHOULD: FE 호출은 수동 path 조립을 지양하고 Part B §2 의 `apiQuery / apiQueryService / apiService / apiLovMaster / apiLovQuery / apiLovService` 헬퍼를 사용한다.
- 본 Phase 7 컨벤션은 `oasis` / `rest` 와 병행한다 (대체 아님).

##### 2-2-1-A. 모듈별 Phase 7 사용 가능 조건 (MUST)

Phase 7 6 종 라우트는 **MyBatis `SqlSession` 빈을 자동 등록한 BE 모듈에서만 활성화**된다. cactus-core 의 `InboundAutoConfiguration` 이 `QueryController` / `LovController` 를 `@ConditionalOnBean(SqlSession.class)` (+ LovController 는 `OasisServiceExecutor` 도 함께) 조건으로 등록하기 때문이다. 빈이 없으면 두 컨트롤러 자체가 빈으로 등록되지 않아 해당 path 호출은 **runtime 404** 가 된다.

| BE 모듈 | SqlSession 등록 | Phase 7 6 종 라우트 사용 |
|---|---|---|
| `aps` | ✓ (`@MapperScan` + `*Mapper.java`) | **허용** |
| `mpn` | ✓ (mybatis 사용) | **허용** |
| `mpp` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** |
| `mqc` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** |
| `mls` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** |
| `mcm` | ✗ (JPA + OASIS BPMN 전용) | **금지 — 무조건 OASIS** |

- **MUST**: `mpp` / `mqc` / `mls` / `mcm` 화면은 모든 BE 호출을 **OASIS 패턴 (`/api/{module}/oasis/{serviceId}/{action}`)** 으로 강제한다. `apiQuery` / `apiQueryService` / `apiService` / `apiLovQuery` / `apiLovService` / `apiLovMaster` 호출은 **runtime 404 = MUST NOT.**
- **MUST**: LoV 마스터 코드 (`B029` / `B053` / `B055` / `B056` 등) 도 위 4 모듈에서는 **OASIS LoV BPMN service** 를 신설해 가져온다. `apiLovMaster` 직접 호출 금지 (LovController 도 SqlSession 의존).
- **OASIS LoV BPMN service 미구축 시점**: §12-X 외부 도메인 / 인프라 미구축 처리 절차에 따라 stub (빈 배열 반환) + 정합체크서 §G Q-NNN 등재 + 가이드 §12-X-6 Decision Log 기록.
- **MUST NOT**: 위 4 모듈에서 가이드 위반으로 Phase 7 헬퍼를 호출하는 코드 = 정합체크서 §K 자동 ✗.

---

### 2-3. Frontend 업무 모듈 (mesModule)

새 페이지는 **페이지의 업무 영역에 해당하는 Frontend 업무 모듈** 에 구현한다. 모듈은 `m-{moduleCode}` 형태이며, 업무별로 독립된 패키지다.

| mesModule | 약어 의미 | 업무 영역 | RULE.md 분기 |
|---|---|---|---|
| `m-mpn` | APS | 공정계획 (Advanced Planning & Scheduling) | **분기 2** (업무/설계는 `Aps-Guide.md`, FE 구현은 본 가이드) |
| `m-mpp` | MPP | 조업관리 (Manufacturing Process Planning) | 분기 3 |
| `m-mqc` | MQC | 품질관리 (Manufacturing Quality Control) | 분기 3 |
| 향후 추가 | — | 업무 확장 시 동일 규칙으로 추가 (`m-{code}`) | 분기 3 |

- MUST: 페이지가 속하는 업무와 일치하는 모듈에 구현한다. (예: 품질 검사 화면은 `m-mqc` 에, 공정 계획은 `m-mpn` 에)
- MUST: 업무 모듈 패키지가 현재 소스에 **존재하지 않으면** 작업을 중단하고 사용자에게 확인한다. Agent 가 임의로 새 모듈 폴더·패키지를 생성하지 않는다.
- MUST NOT: 편의상 다른 모듈(예: `m-mpn`) 에 타 업무 페이지를 넣지 않는다.
- SHOULD: 어느 모듈에 속할지 모호하면 사용자에게 확인한다.

---

## 3. 페이지 유형 및 필수 파일

### 3-1. 페이지 유형 5종

| 유형 | 설명 |
|---|---|
| A. 조회 전용 Form | 조건만 있고 결과는 상세 영역 |
| B. 조회 + Grid | 조건 + 결과 Grid 표시 |
| C. 조회 + 저장 | 조건 + Grid 편집 (행 상태 관리 필요) |
| D. Master-Detail | 상위 Grid 선택 → 하위 Grid/Form |
| E. 팝업·모달 | 조회·선택·편집 모달 |

### 3-2. 유형별 필수 파일

| 유형 | 필수 파일 |
|---|---|
| A | `types.ts`, `constants.ts`, `{name}-api.ts`, `{Name}Page.tsx`, 대상 모듈 엔트리, portal 재내보내기 |
| B | A + Grid 컬럼 정의 |
| C | B + 저장 API + `useGridDataManager` 행 상태 관리 |
| D | C + 상·하위 Grid 분리 (`{Name}MasterGrid.tsx`, `{Name}DetailGrid.tsx`) |
| E | `types.ts`, `{Name}Modal.tsx`, 호출 부모에서 Modal open 제어 |

> 본 표는 일반 업무 페이지를 전제로 한다. "대상 모듈 엔트리" 는 §2-3 에서 선택한 `m-{moduleCode}` 패키지의 `pages/{moduleGroup}/{screenId}.tsx` 파일을 의미한다 (MES 룰 — camelCase 단일 토큰). **APS (`m-mpn`, mpn) 예외**: 기존 `pages/{group}/{page}-page.tsx` (kebab + `-page` suffix) 패턴을 그대로 유지한다.

- MUST: 유형 결정은 코드 작성 전 §11 선택표에서 확정한다.
- MUST: 대상 모듈의 엔트리는 **그 모듈의** `tsup.config.ts` 에 반드시 등록한다.
- MUST (m-mdm): m-mdm 은 와일드카드 exports 를 쓰지 않으므로 새 화면은 tsup entry 와 `package.json` exports 에 같은 이름으로 함께 등록한다(`m-mdm/tests/package-exports.test.ts` 가 대조한다).

---

## 4. 명명 규칙

**MES 룰 (mls / mqc / mpp / mas / mcm) — 단일 토큰 camelCase 정본**:

| 대상 | 규칙 | 예시 |
|---|---|---|
| 컴포넌트 파일 | camelCase = `screenId` (suffix `-page` 금지, `-Page` 금지) — React 컴포넌트 함수명은 PascalCase 유지 OK (`export default function PlateSlittingMgmtPage`) | `plateSlittingMgmt.tsx` |
| 페이지 엔트리 | **`{screenId}.tsx`** (camelCase, suffix `-page` 금지, kebab 금지) | `plateSlittingMgmt.tsx` |
| API 서비스 | `{screenId}-api.ts` (camelCase screenId + kebab `-api`) | `plateSlittingMgmt-api.ts` |
| 훅 파일 | `use-*` | `use-form-validation.ts` |
| 타입/인터페이스 | PascalCase | `PlateSlittingRow` |
| 상수 | UPPER_SNAKE_CASE | `DEFAULT_FILTER` |
| CSS 클래스 | kebab-case (BEM 유사) | `page-layout__title` |
| 페이지 ID | `portal:{moduleGroup}/{screenId}` (= `pageId` = `serviceId` = `screenId` 단일값) | `portal:master/plateSlittingMgmt` |

- **MUST (MES)**: `pageId` = `serviceId` = `screenId` 동일값 (camelCase 단일 토큰). 분리·중복 금지.
- **MUST (MES)**: 페이지 엔트리 파일명 = `{screenId}.tsx`. `-page` suffix / kebab-case 표기 금지.
- **APS 예외 (`m-mpn`, mpn — 분기 2)**: 기존 패턴 유지 (`{page-name}-page.tsx` kebab + `-page` suffix, 페이지 엔트리 `pages/{group}/{page}-page.tsx`). 이 예외는 본 Frontend 가이드 안에서 관리한다. APS 업무/설계 정본은 [Aps-Guide.md](../../../../aps/Aps-Guide.md) 를 따른다.

### 4-0. 화면 식별자 규칙 (D3, MUST)

신규 화면의 `screenId` / `serviceId` / `pageName` / `pageId` 토큰은 모두 **`{화면명}` 단일 토큰** (camelCase, 모듈명·그룹명 prefix 없음) 으로 결정한다. 정본 정의 및 등재 절차는 `docs/guide/design/01_Agent부속_가이드.md §A.1 · §A.2 · §A.3 · §A.4` 인용 (중복 기재 금지).

| 토큰 | 표기 |
|---|---|
| `{화면명}` (= screenId) | **camelCase 도메인 명사** — 화면명 그 자체 (첫 글자 소문자). 한 단어 또는 N 단어 조합 (`moldMaster`, `plateSlittingMgmt`). 모듈명·그룹명 prefix 없음 |

- 예: **`plateSlittingMgmt`**, `moldMaster`, `inspectionRequest`, `stockMove`, `topicConsole`
- **MES (mls / mqc / mpp / mas / mcm) — 단일값 정본**: `pageId` = `serviceId` = `screenId` = `pageName` 모두 동일 camelCase 단일 토큰 (예: `plateSlittingMgmt`). 액션은 별도 (`{serviceId}.{action}`).
- 모듈 구분은 라우트 prefix (`/api/{moduleId}/...`)·tsup entry 디렉토리 (`pages/{moduleGroup}/...`) 가 담당하므로 식별자에 모듈명을 중복 표기하지 않는다.
- `pageId` (full 포털 경로) = `portal:{moduleGroup}/{screenId}` (§A.4.3). `moduleGroup` 자리에 `moduleId` 넣기 금지. kebab 변환 금지.
- **APS 예외 (mpn — 분기 2)**: `pageName` 은 기존 `screenId` 의 **kebab-case** 변환 (예: `mpnApsSomething` → `mpn-aps-something`) 을 유지 (§A.4.2). 파일명도 `mpn-aps-something-page.tsx` 처럼 기존 패턴 유지.
- **(MUST NOT)**: 모듈명 prefix (`mlsPlateSlittingMgmt` ✗ — 사용자 결정으로 폐기), 그룹명 토큰 삽입 (`cmaMasterCodeMng` / `mcmCmaMasterCodeMng` ✗), 숫자 prefix (`MPP_WRK010`), 하이픈/언더스코어/복수형, 한글 음역.
- **MUST (유일성)**: 한 모듈 내 같은 이름의 화면(`screenId`) 2개 이상 ✗. 설계·개발 중 동일 이름의 Object (`screenId` / FE 파일명 / `pageId` / 시드 `OBJECT_ID`) 가 이미 존재하면 **즉시 중단 + 사용자 질문**. 정본: `01_Agent부속_가이드.md §A.4.4.2` 인용 (중복 기재 금지).
- legacy 호환: 본 가이드 개정 이전 등재·기 생성된 모듈/그룹 prefix 식별자·산출물 (`mlsPlateSlittingMgmt` 등) 은 `01_Agent부속_가이드.md §A.3.2` 및 각 산출물 위치에서 그대로 유지 (As-Is 1:1 보존, 개명 ✗).

**[2026-06-05 — componentPath = `{group}/{screenId}` 정본]**
- DB myMenusTree 응답의 leaf row 는 BE 측에서 derived `componentPath = PARENT_MENU_ID + "/" + OBJECT_ID` 를 채워 내려보낸다 (BE 가이드 §13-1).
- 본 값은 FE 디스크 경로 `page-components/{PARENT_MENU_ID}/{OBJECT_ID}/page.tsx` 와 1:1 일치해야 하며, 이는 곧 `PARENT_MENU_ID` = group 토큰 (3 글자 lowercase, `cma`/`csa`/`cme` 등) + `OBJECT_ID` = `screenId` (camelCase 단일 토큰) 의 concat 이다.
- Sidebar 의 pageId 조립은 `${moduleId}:${componentPath}` 우선 (§11-1). codegen PAGE_REGISTRY 의 키 형식 (`{group}/{leaf}`) 과도 1:1 정합. 신규 화면 등록 시 BE 시드 `parentMenuId` / `objectId` 값과 FE 디스크 폴더 / 파일명 4 자리가 모두 동일 토큰이 되도록 강제.

### 4-1. 지역 변수 / 파라미터 네이밍

TypeScript 지역 변수 · 함수 파라미터에 **타입 prefix + camelCase** 를 권장한다. 단, React 관용 패턴과 BE 계약 영역은 예외로 둔다.

| 타입 | prefix | 예시 |
|---|---|---|
| string | `str` | `strProdNo` |
| number | `int` / `lng` / `dbl` | `intCount`, `dblPrice` |
| boolean | `is` / `has` / `yn` | `isSaving`, `hasError`, `ynUse` |
| Array<T> | `list` 또는 `arr` | `listProduct`, `arrCode` |
| Map / Record | `map` | `mapRow` |
| 객체 / DTO | prefix 없음, 의미 드러나는 camelCase | `product`, `filter` |

- SHOULD: 지역 변수 / 함수 파라미터에 위 prefix 를 적용한다. 강제 규칙은 아니며 팀 합의로 완화 가능하다.
- MUST NOT: **도메인 타입 정의의 필드명 · Props · API body 필드** 에는 prefix 를 붙이지 않는다. BE 계약(API JSON 필드) 과 일치해야 한다. (예: `productId: string` 유지, `strProductId` 금지)
- MAY: React `useState` 반환 튜플과 상태·핸들러 변수는 업계 관용을 허용한다. (예: `[isOpen, setIsOpen]`, `[loading, setLoading]`, `handleSearch`, `onChange`)
- 예외(MUST): §10-3 의 **body 최상위 키 = 변수명** 규칙은 prefix 보다 우선한다. 저장 body 를 조립할 때 변수명은 `master` / `detail` 로 유지한다 (`listMaster` 등으로 바꾸지 않는다).

### 4-2. 주석 규칙

핵심 이해 포인트에만 한글 주석을 남긴다. 모든 줄에 주석을 달지 않는다.

- MUST: `*-api.ts` 의 각 export 함수 위에 **API 계약 포인트** 를 한 줄 주석으로 남긴다. (URL 규격 §2-2, body 키 §10-3)
- MUST: `SavePayload` → body 변환 로직에 한글 주석 (C/U/D 매핑 §9-3, 전송 제외 규칙, 레거시 키 예외 §10-3) 을 둔다.
- MUST: `useGridDataManager` 의 `saveHandler` 주변에 Level A/B 에러 처리 책임 분리(§8-4) 를 한 블록으로 주석한다.
- MUST NOT: JSX 의 단순 구조 설명 주석 (코드로 충분한 경우).
- MUST NOT: `console.log` 대체용 한글 주석 (§6 금지 사항 우회).
- SHOULD: `types.ts` · `constants.ts` 에는 **도메인 의미** 만 간결히 주석한다.

### 4-2-1. 설계서 추적성 주석 (SHOULD)

코드에 설계서 항목 ID (S-NNN, G-NNN, B-NNN, GB-NNN, P-NNN, V-NNN 등) 를 주석으로 표기하여 역추적 가능하게 한다. §13-4 1:1 대조 검증 시 코드 측 매핑 근거가 된다.

**그리드 컬럼 정의**:
```ts
// G-013 사용공정명 — 편집 N, LV-006 (P001) STUFF 변환 — 동적변환 컬럼 (저장 X)
{ key: "jobNm", header: "사용공정명", width: 160 },
```

**버튼 정의**:
```ts
// B-005 폐기 — V-005 사전 검증 (구매요청/첨부 존재 시 차단)
{ id: "btn_scrap", label: "폐기", onClick: handleScrap, type: "save" as const },
```

**검색조건 SearchField**:
```ts
// S-009 고객사 (Lookup 묶음 — txtCustCd + btn + txtCustNm)
<SearchField label="고객사" ... />
```

**★검색조건(조회영역) 배치 표준 (MUST, 2026-07-01)** — 조회영역(`SearchArea` → `.search-area__conditions`)은 **CSS grid 정렬**을 따른다(포털 공통 스타일 `page-layout.css` 에 반영됨):
- 조회조건은 **flex-wrap(가변폭 다닥다닥) 금지 → grid 컬럼 정렬**. `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` — **N번째 조회조건은 어느 행이든 같은 X축에서 시작**한다(열 정렬).
- **컬럼 간 일정 간격 유지**(`column-gap` 고정), 조건이 많으면 **여러 줄로 자연스럽게 접힌다**(한 줄에 억지로 몰지 않는다 — 여러 줄이 다닥다닥보다 낫다).
- `SearchField` 라벨은 **min-width 통일**(셀 내 필드 시작 X축도 정렬). 각 조회조건 = grid 셀 1칸(넓은 조건도 1칸 기준, 필요 시에만 span).
- Raw HTML 로 조회영역을 직접 조립하지 말고 `SearchArea`+`SearchField` 를 쓰면 이 표준이 자동 적용된다. 체크박스는 `input[type="checkbox"]` 예외 규칙으로 네이티브 크기(14px)를 유지한다(텍스트 인풋 폭 150px 규격에 딸려가지 않음).

**팝업 호출**:
```ts
// P-003 금형 수정(연마) — B-007 트리거, BPMN §2.9
window.open(`/popup/workPopup/mold-polish?itemCd=${itemCd}`, "moldPolishDialog", "width=1100,height=800");
```

### 4-3. 파일 헤더 주석

신규 `.ts` / `.tsx` 파일 생성 시 파일 최상단(첫 `import` 위)에 작성자·작성일·내용 블록 주석을 남긴다. 수정 시에는 이력만 append 한다.

- MUST: 신규 `.ts` / `.tsx` 파일 생성 시 최상단에 `작성자 / 작성일 / 내용` 3요소를 포함하는 헤더를 삽입한다.
- MUST: `내용` 은 해당 파일의 역할을 한국어 한 줄(70자 내외)로 간략히 기술한다. (예: "ProductPage — 제품 마스터 조회/저장 페이지 본체")
- MUST: 작성자·수정자 식별자는 GitHub 핸들을 `@` 접두어와 함께 기재한다. (예: `@junhwan-park`)
- MUST: 날짜는 `YYYY-MM-DD` 형식으로 통일한다.
- MUST: 파일을 수정할 때는 `변경 이력:` 아래에 `- YYYY-MM-DD @<handle>: <변경내용>` 한 줄을 추가한다. `변경 이력:` 블록이 없으면 `내용:` 아래 한 줄 비우고 새로 만든다.
- MUST NOT: 기존 이력 항목을 삭제하거나 내용을 수정하지 않는다 (append-only).
- MUST NOT: `내용` 에 구현 상세나 TODO 를 적지 않는다. 파일의 존재 이유·역할만 기재한다.
- MUST NOT: JSX 내부에 헤더를 두지 않는다. 반드시 파일 최상단.
- SHOULD: 변경내용은 한국어 한 줄(70자 내외)로 요약한다.
- MAY: 순수 자동 포맷팅(Prettier 등) 적용만 수행한 경우 이력 기재를 생략할 수 있다.

신규 파일 헤더:

```ts
/*
 * 작성자: @junhwan-park
 * 작성일: 2026-04-23
 * 내용: product-api.ts — Product 도메인 조회/저장 API 호출 모듈
 */
import { apiRequest } from "@dk-oasis/shared/http";
```

수정된 파일 헤더:

```ts
/*
 * 작성자: @junhwan-park
 * 작성일: 2026-04-23
 * 내용: product-api.ts — Product 도메인 조회/저장 API 호출 모듈
 *
 * 변경 이력:
 * - 2026-05-02 @junhwan-park: ProductPage 저장 핸들러 에러 처리 추가
 * - 2026-05-10 @another-user: types.ts 필드 추가 반영
 */
import { apiRequest } from "@dk-oasis/shared/http";
```

---

## 5. Import 규칙

### 5-1. 우선순위

1. `@dk-oasis/shared/*`
2. `@/*` (패키지 내부 절대경로)
3. 같은 디렉토리 상대경로 (`./sibling`)
4. 상위 디렉토리 체인 (`../` 이상) — MUST NOT

### 5-2. 금지 패턴

- MUST NOT: `../../../` 상위 체인 상대경로.
- MUST NOT: shared 에 있는 컴포넌트를 페이지 내부에서 중복 구현 후 상대경로로 import.
- MUST NOT: `@dk-oasis/shared/dist/...` 직접 import.

---
