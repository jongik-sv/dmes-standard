# 01. 규칙과 결정 항목

> 상위 문서: [BackEnd 표준 개발 가이드 V2](../../BackEnd_표준_통합_개발가이드_v2.md)

## 1. 문서 사용 규칙

### 1-1. 규칙 등급
| 등급 | 의미 |
|---|---|
| MUST | 반드시 지켜야 하는 규칙 |
| SHOULD | 특별한 사유가 없으면 따라야 하는 규칙 |
| MAY | 필요한 경우 선택적으로 적용할 수 있는 규칙 |

### 1-2. 기본 원칙
- BackEnd 비즈니스 API 의 진입점은 **BPMN** 이다.
- 개발자는 일반 업무 API를 위한 `@RestController`, `@RequestMapping` 계열을 작성하지 않는다.
- 표준 산출물은 **Entity / Repository / DTO / Service / BPMN** 의 조합으로 만든다.
- 템플릿 밖 패턴을 임의 도입하지 않는다.
- **MUST: 설계서 정본 우선순위** — (1) 분석리포트 §4 항목 목록 = 정본. (2) 기능설계서 / 디자인설계서 / BPMN설계서 = 인용. (3) 본 개발 가이드 = 절차. 충돌 시 분석리포트 우선.
- **MUST NOT: 분석리포트 정독 + 매트릭스 추출 (§1-3 Step 0) 없이 코드 작성 진입 금지.**
- **MUST: §12-3 1:1 대조의 모든 항목이 ✓ 일 때만 개발 완료**. ✗ 인 항목이 1개라도 있으면 §12-4 재개발 의무 사이클 수행.
- **MUST NOT: 검증 실패 항목을 사용자에게 보고하지 않고 임의 종료**.

**[정직성 선언 — E1·E2·E3, MUST]**
- **E1 (완료 보고 정직)**: "다 했냐" 응답 시 정직하게 답한다. 안 끝났으면 안 끝났다고 보고한다. 잔존 ✗/△ 항목을 숨긴 채 "완료" 보고 금지.
- **E2 (검증 정직)**: 직접 검증하지 않은 부분을 검증했다고 보고하지 않는다. `./gradlew test` 미실행, §12-3 1:1 대조 미수행 상태에서 "통과" 보고 금지.
- **E3 (고해성사 정직)**: Phase 종료 시 결함이 있으면 솔직하게 보고한다. 단, 결함이 없는데 억지로 만들어 보고하지 않는다 (없음을 명시하는 것은 결함 보고가 아니다).

### 1-3. 작업 순서
0. **설계서 5종 정독 + 매트릭스 추출 (MUST — 차단 게이트)**

   **[B1·B3 진입 게이트 — fail-fast + As-Is 1:1 보존 의무, MUST — §1-3 Step 0 최우선 선언]**
   - **B1 (fail-fast)**: `/analyze-service {SCREEN-ID}` cache (`docs/external/KsmErpK/orgErpReport/{areaId}/{moduleId}/.cache/{SCREEN-ID}/sql_analysis.json`) **또는** 분석리포트 §17.2 의 T1~T4 매트릭스 표 — 둘 중 하나라도 **존재하지 않으면 본 워커는 즉시 "진행 불가"를 사용자에게 선언 후 중단한다**. 추측으로 보강하거나 빈 칸 채워 진행 금지.
   - **B3 (As-Is 1:1 prepend)**: 분석리포트의 As-Is 정의 (화면 구조 / 컬럼 / 상태값 / 데이터 동작 / 자동 연동 / 검증 로직) 는 **1:1 보존 의무**다. 코드 작성 중 추측 / 단순화 / "동등 표현" / "표준에 맞춤" 으로 변형 금지. 변경이 필요하면 §6-A 절차 (사용자 명시 동의 + Q-NNN 등재) 선행.

   - 분석리포트 §3 (S-NNN 검색조건), §4.3 (G-NNN 그리드 + GE-NNN 첨부), §4.5 (B-NNN 버튼) + §4.5-1 (GB-NNN 그리드셀 버튼), §4.6 (P-NNN 팝업), §6 (V-NNN 검증), §7 (Entity 컬럼 — 편집 가능 / 외부 JOIN / 계산 컬럼 분류), §10 (LV-NNN LoV) 전수 인용
   - 산출물: 매트릭스 표 (각 영역별 수량 + 항목 목록) — 작업 노트 또는 정합체크서 §A.2 에 기재
   - 매트릭스 표 미작성 시 1번 단계 진입 금지

   **★ As-Is 가 있는 화면의 경우 추가 MUST (analyze-service 호출 + T1~T4 전수 추출 의무화)**:
   - `/analyze-service {SCREEN-ID}` 를 실행한다. cache 가 이미 있으면 자동 스킵, 없으면 Phase 1~4 (구조 / C# partial class / MSSQL SP / WinForms UI) 자동 수행.
   - 산출 cache 위치: `docs/external/KsmErpK/orgErpReport/{areaId}/{moduleId}/.cache/{SCREEN-ID}/sql_analysis.json`
   - 위 cache 가 존재하지 않으면 본 Step 0 진입 게이트 차단 — 이후 단계 진행 금지.

   **🚨 §17.0 절대 원칙 (분석리포트.template §17.0 인용) — 위반 시 즉시 ✗ 재개발 의무**:
   1. **As-Is 정의 1:1 보존** — 화면 구조 / 컬럼 / 상태값 / 데이터 동작 / 자동 연동 / 검증 로직 임의 변경 절대 금지. 변경이 필요하면 분석리포트 §12 결정 후보 등재 + 사용자 명시 동의 필수.
   2. **코드 정의 완전 분석 의무** — Skip 금지. "분량이 커서" / "유사하므로 동일" / "효율 위해 단순화" / "시간 단축" 표현 사용 = ✗ 자동 전환.
   3. **검증 단계 의무** — 분석리포트 §17.5 self-check 통과해야 §17 완료 인정.

   **T1~T4 강제 추출 표 (분석리포트 §17.2-T1/T2/T3/T4 작성 의무)**:
   - **T1 화면 컴포넌트 매트릭스** (Designer.cs `InitializeComponent()` 의 모든 컨트롤 1행씩 — Grid / Btn / Txt / Combo / Label / GroupBox / Panel / TabControl / ToolStripButton / Spread / Dialog 등 누락 금지)
   - **T2 이벤트 핸들러 매트릭스** (`*.cs` 의 모든 이벤트 1행씩 — `On*` / `*_Click` / `OnGrid*` (RowSelectionChanged / CellDoubleClick / CellClick 등) — 자동 그리드 갱신 / 외부 화면 전환 / SP 자동 호출 트리거 명시)
   - **T3 표준 라이브러리 호출 매트릭스** (`*.cs` 안의 모든 외부 라이브러리 호출 1행씩 — AttachmentManager / AttachedFileList / AutoFillup / RfdCustomerDialog / ResourceDialog / GeneralDialog / StoreValidation / NewCodeQuery / WorkPreset / OpenFormWithParameter 등. **SP grep 으로 안 잡히는 화면 자동 동작 (예: AttachmentManager → wwAttachmentFile 자동 표시) 은 본 표에서만 잡힘** — 누락 시 §17.0.1 위반)
   - **T4 SP case × 부수효과 매트릭스** (§17.2 본 표 — **컬럼 단위 1:1**: INSERT N 컬럼 = N 행 / UPDATE SET N 컬럼 = N 행 / SELECT N 컬럼 = N 행 / JOIN/WHERE/조건부 분기 = 별도 행)

   **§17.4 자동 룰 카운트 의무 (수량 동일성 검증 입력)**:
   - T1 As-Is 컴포넌트 수 / T2 이벤트 수 / T3 표준 라이브러리 수 / T4 SP case 수 / T4 부수효과 E-NNN 수 / 외부 SP/FN 호출 수 / 자동 채번 수 / 자동 일자 수 / Q-deferred 의존 수
   - 위 카운트를 분석리포트 §17.4 표에 기재. 정합체크서 §K.5.5 의 수량 동일성 검증 입력으로 사용.
   - **§17.2 의 매 부수효과 = 1 컬럼 / 1 분기 / 1 이벤트 / 1 라이브러리에 `E-NNN` (또는 `C-NNN` / `EV-NNN` / `L-NNN`) ID 부여 + As-Is `file:line` 인용 + 코드 quote 의무**. 묶음 텍스트 금지. 이 ID 가 §12-3 (1:1 대조) 시 §K.5 검증의 단위가 된다.

   **To-Be only 화면 (As-Is 없음)**: analyze-service 호출 면제. 분석리포트 §17 = "해당 없음" 으로 기록 후 통과.
1. base-package 확정
2. 도메인/모듈명 확정
3. Entity 작성
4. Repository 작성
5. DTO 작성
6. Service 작성
7. BPMN 연결
8. 최종 일치 검증
9. **완료 체크리스트 수행 (§12) — §12-3 1:1 대조 + §12-4 재개발 의무 포함**

**[작업 순서 결말 — 재개발 의무 사이클]**

마지막 단계 (9. 완료 체크리스트 수행) 에서 §12-3 1:1 대조의 **한 항목이라도 ✗ 면 화면 개발 미완성**으로 판정.

이 경우:
1. ✗ 처리된 항목을 식별
2. 해당 항목이 속한 단계 (예: §7 Entity 컬럼 ✗ → 3번 Entity 작성 단계) 로 돌아간다
3. 해당 단계 재개발
4. 다시 §12-3 1:1 대조 수행
5. **모든 항목이 ✓ 일 때까지 위 사이클 반복**

이 반복은 Agent (또는 개발자) 의 재량이 아니라 의무다. 임의 종료 / "이 정도면 됐다" 판단 금지. 상세 절차는 §12-4 참조.

---

## 2. 시작 전 결정 항목

### 2-1. base-package 결정 규칙

본 프로젝트는 **DMES 제품 라이브러리**(동국 산하 재사용 패키지) 와 **{CLIENT} 사이트 도입 모듈**(본 프로젝트 전용) 을 네임스페이스로 구분한다.

| 산출물 종류 | 그룹 (`build.gradle`) | base-package | 좌표 예 |
|---|---|---|---|
| DMES 공통 플랫폼 라이브러리 | `com.dongkuk.dmes` | `com.dongkuk.dmes.cactus` | `com.dongkuk.dmes:cactus-core` |
| DMES 제품 라이브러리 (APS) | `com.dongkuk.dmes` | `com.dongkuk.dmes.aps` | `com.dongkuk.dmes:aps-core` |
| {CLIENT} 사이트 도입 모듈 (MES: mls/mqc/mpp/mas / APS 사이트: mpn / portal 등) | `com.dongkuk.dmes` | `com.dongkuk.dmes.{moduleId}` | `com.dongkuk.dmes:{moduleId}` |

새 모듈을 만들 때는 다음 순서로 base-package 를 확정한다.

1. 산출물이 **재사용 가능한 DMES 라이브러리** 인가, **사이트 전용** 인가 판단
2. 표 의 그룹·base-package 패턴 적용
3. `@SpringBootApplication` 클래스의 패키지가 base-package 와 일치하는지 확인
4. 기존 `domain/` 패키지의 부모 경로와 일치하는지 확인
5. 위 단계로도 확정 불가하면 **개발을 멈추고 확인**한다.

- (ex) MLS 모듈 → `com.dongkuk.dmes.mls`
- (ex) MQC 모듈 → `com.dongkuk.dmes.mqc`
- (ex) MPP 모듈 → `com.dongkuk.dmes.mpp`
- (ex) MAS 모듈 → `com.dongkuk.dmes.mas`
- (ex) MCM 모듈(구 portal 역할) → `com.dongkuk.dmes.mcm`
- (ex) APS 사이트 모듈 (mpn) → `com.dongkuk.dmes.mpn` (§3-1 / §5 APS 예외 적용 — 본 가이드의 MES camelCase 단일 식별자 룰 미적용)
- (ex) APS 제품 라이브러리 → `com.dongkuk.dmes.aps`

### 2-2. 최소 확정 값
| 항목 | 설명 | 예시 (MES) | 예시 (APS / mpn) |
|---|---|---|---|
| base-package | 모듈 base-package | `com.dongkuk.dmes.mls` | `com.dongkuk.dmes.mpn` (사이트) / `com.dongkuk.dmes.aps` (제품 라이브러리) |
| screenId = serviceId = pageId = beanName | MES 4 모듈은 단일 camelCase 식별자 (§3-1 / §5 / §9-1). APS (mpn) 는 별도 규약 | `plateSlittingMgmt` | APS 별도 규약 |
| moduleGroup | 그룹 lowercase 3글자 | `plate`, `insp`, `ppa` | APS 별도 규약 |
| table | DDL `TB_{모듈명}_{역할}` (§5 D2) | `TB_mls_plate_slitting` | `TB_mpn_plan_master` |
| action | BPMN actionGateway 분기 값 | `search` / `save` / `delete` | `search` / `save` / `delete` |

- MES 4 모듈 (`mls` / `mqc` / `mpp` / `mas`): screenId = serviceId = pageId = beanName = BPMN 파일명 = API URL `serviceId` 가 **모두 같은 camelCase 값**. (§3-1 / §5 / §9-1)
- APS (`mpn`): 본 단일 식별자 룰 적용 ✗. `aps-core` 기반 별도 규약.

### 2-3. SecurityConfig 정책

cactus-core 가 통합 보안 플랫폼 역할을 한다. 모듈은 다음 표에 따라 SecurityConfig 작성 여부를 결정한다.

| 모듈 | SecurityConfig 작성 | 근거 |
|---|---|---|
| **MPP / MQC / MLS / MAS / 시스템 MES 등 일반 업무 모듈** | **작성 금지** | cactus-core 가 `@ConditionalOnMissingBean` 으로 default `SecurityFilterChain` 을 제공한다. 그대로 사용 |
| **MCM (구 portal 역할)** | **자체 SecurityConfig 유지** | `/api/auth/**` permitAll. NextAuth 토큰 발급 진입점 (`McmAuthController`) |
| **APS (`mpn` 사이트 모듈)** | **자체 SecurityConfig 작성** | cactus default 를 override 하여 사이트 전용 매처 추가 |

- MUST: cactus-core 가 제공하는 `JwtAuthenticationFilter`, `ClientKeyFilter`, `RequestIdFilter` 를 모듈에서 중복 등록하지 않는다.
- MUST NOT: 데드코드였던 `cactus.security.auth.AuthController` 는 삭제되었다. 토큰 발급 진입점은 mcm 의 `McmAuthController` 단일이다. 모듈마다 별도 AuthController 를 만들지 않는다.

### 2-4. 환경 변수 — ClientKey

BFF→BE 호출을 식별하는 공유키는 `BACKEND_CLIENT_KEY` 환경 변수로 통일한다.

- MUST: `BACKEND_CLIENT_KEY` env 를 BFF 와 BE 양쪽에 동일 값으로 주입한다. BFF 가 `X-Client-Key` 헤더로 전달하고 cactus `ClientKeyFilter` 가 검증한다.
- MUST NOT: 옛 명 `UI_CLIENT_KEY` 를 사용하지 않는다.

---
